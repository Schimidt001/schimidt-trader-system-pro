import { DerivService, DerivCandle, DerivTick } from "./derivService";
import { predictionService } from "../prediction/predictionService";
import { analyzePositionForHedge, DEFAULT_HEDGE_CONFIG, type HedgeConfig } from "../ai/hedgeStrategy";
import { validateHedgeConfig } from "../ai/hedgeConfigSchema";
import type {
  PredictionRequest,
  PredictionResponse,
  BotStateType,
  CandleData,
} from "../../shared/types/prediction";
import {
  getBotState,
  upsertBotState,
  getConfigByUserId,
  insertCandle,
  getCandleHistory,
  insertPosition,
  updatePosition,
  getPositionById,
  getTodayPositions,
  insertEventLog,
  upsertMetric,
  getMetric,
} from "../db";

/**
 * Bot Trader Automatizado 24/7
 * Implementa a lógica completa de trading conforme especificação do cliente
 */

export class TradingBot {
  private userId: number;
  private derivService: DerivService | null = null;
  private state: BotStateType = "IDLE";
  private isRunning: boolean = false;
  
  // Dados do candle atual
  private currentCandleOpen: number = 0;
  private currentCandleTimestamp: number = 0;
  private currentCandleHigh: number = 0;
  private currentCandleLow: number = 0;
  private currentCandleClose: number = 0; // Último preço (close)
  private currentCandleStartTime: Date | null = null;
  
  // Valores construídos com ticks (para comparação/debug)
  private constructedOpen: number = 0;
  private constructedHigh: number = 0;
  private constructedLow: number = 0;
  private constructedClose: number = 0;
  
  // Dados da predição
  private prediction: PredictionResponse | null = null;
  private trigger: number = 0;
  private pipSize: number = 0.01;
  
  // Posições atuais (suporte a múltiplas posições: original + hedge)
  private currentPositions: Array<{
    positionId: number;
    contractId: string;
    isHedge: boolean;
    parentPositionId?: number;
    stake: number;
  }> = [];
  private lastContractCheckTime: number = 0;
  private candleEndTimer: NodeJS.Timeout | null = null;
  private hedgeAlreadyOpened: boolean = false;
  
  // Configurações
  private symbol: string = "R_100";
  private stake: number = 1000; // em centavos
  private stopDaily: number = 10000;
  private takeDaily: number = 50000;
  private lookback: number = 500; // Aumentado para 500 candles
  private triggerOffset: number = 16; // offset do gatilho em pontos
  private profitThreshold: number = 90; // threshold de lucro para early close (%)
  private waitTime: number = 8; // tempo de espera em minutos antes de capturar dados
  private mode: "DEMO" | "REAL" = "DEMO";
  
  // Configurações da IA Hedge
  private hedgeEnabled: boolean = true;
  private hedgeConfig: HedgeConfig = DEFAULT_HEDGE_CONFIG;
  
  // Controle de risco
  private dailyPnL: number = 0;
  private tradesThisCandle: Set<number> = new Set();

  constructor(userId: number) {
    this.userId = userId;
  }

  /**
   * Inicia o bot
   */
  async start(): Promise<void> {
    try {
      // Carregar configurações
      const config = await getConfigByUserId(this.userId);
      if (!config) {
        throw new Error("Configuração não encontrada");
      }

      this.symbol = config.symbol;
      this.stake = config.stake;
      this.stopDaily = config.stopDaily;
      this.takeDaily = config.takeDaily;
      this.lookback = config.lookback;
      
      // Log detalhado do triggerOffset para debug
      console.log(`[TRIGGER_OFFSET_DEBUG] Valor do banco: ${config.triggerOffset}`);
      console.log(`[TRIGGER_OFFSET_DEBUG] Tipo: ${typeof config.triggerOffset}`);
      console.log(`[TRIGGER_OFFSET_DEBUG] É null? ${config.triggerOffset === null}`);
      console.log(`[TRIGGER_OFFSET_DEBUG] É undefined? ${config.triggerOffset === undefined}`);
      
      this.triggerOffset = config.triggerOffset ?? 16; // Usar ?? para aceitar 0
      console.log(`[TRIGGER_OFFSET_DEBUG] Valor final atribuído: ${this.triggerOffset}`);
      
      this.profitThreshold = config.profitThreshold ?? 90;
      this.waitTime = config.waitTime ?? 8;
      this.mode = config.mode;
      
      // Carregar configurações da IA Hedge
      this.hedgeEnabled = config.hedgeEnabled ?? true;
      if (config.hedgeConfig) {
        try {
          const parsedConfig = JSON.parse(config.hedgeConfig);
          this.hedgeConfig = validateHedgeConfig(parsedConfig);
        } catch (error) {
          console.warn(`[HEDGE_CONFIG] Erro ao parsear hedgeConfig, usando padrão: ${error}`);
          this.hedgeConfig = validateHedgeConfig({});
        }
      } else {
        this.hedgeConfig = validateHedgeConfig({});
      }
      
      console.log(`[HEDGE_CONFIG] IA Hedge Habilitada: ${this.hedgeEnabled}`);
      if (this.hedgeEnabled) {
        console.log(`[HEDGE_CONFIG] Janela de análise: ${this.hedgeConfig.analysisStartMinute} - ${this.hedgeConfig.analysisEndMinute} min`);
      }

      const token = this.mode === "DEMO" ? config.tokenDemo : config.tokenReal;
      if (!token) {
        throw new Error(`Token ${this.mode} não configurado`);
      }

      // Conectar ao DERIV
      this.derivService = new DerivService(token, this.mode === "DEMO");
      await this.derivService.connect();

      // Obter pip_size do símbolo
      const symbolInfo = await this.derivService.getSymbolInfo(this.symbol);
      this.pipSize = symbolInfo.pip_size;

      // Carregar PnL do dia
      await this.loadDailyPnL();

      // Verificar se já atingiu stop ou take
      if (this.dailyPnL <= -this.stopDaily) {
        await this.logEvent("STOP_DAILY_HIT", "Stop diário atingido, bot não iniciará");
        this.state = "LOCK_RISK";
        await this.updateBotState();
        return;
      }

      if (this.dailyPnL >= this.takeDaily) {
        await this.logEvent("TAKE_DAILY_HIT", "Take diário atingido, bot não iniciará");
        this.state = "LOCK_RISK";
        await this.updateBotState();
        return;
      }

      this.isRunning = true;
      
      // Subscrever ticks para construção de candles e monitoramento
      this.derivService.subscribeTicks(this.symbol, (tick: DerivTick) => {
        this.handleTick(tick);
      });
      console.log(`[TradingBot] Subscribed to ticks for ${this.symbol}`);
      
      // Se estado for COLLECTING, iniciar coleta de dados
      if (this.state === "IDLE" || this.state === "COLLECTING") {
        this.state = "COLLECTING";
        await this.updateBotState();
        await this.logEvent("BOT_STARTED", `Bot iniciado em modo ${this.mode} para ${this.symbol}`);
        
        // Logar status da IA Hedge
        if (this.hedgeEnabled) {
          await this.logEvent(
            "HEDGE_STATUS",
            `🛡️ IA HEDGE ATIVA | Janela de análise: ${this.hedgeConfig.analysisStartMinute.toFixed(1)}-${this.hedgeConfig.analysisEndMinute.toFixed(1)} min`
          );
        } else {
          await this.logEvent("HEDGE_STATUS", "❌ IA HEDGE DESATIVADA");
        }
        
        await this.startDataCollection();
      } else {
        // Bot reiniciando em outro estado (ex: ENTERED, ARMED)
        await this.logEvent("BOT_RESTARTED", `Bot reiniciado em estado ${this.state}`);
        console.log(`[TradingBot] Bot restarted in state: ${this.state}`);
      }
    } catch (error) {
      console.error("[TradingBot] Error starting bot:", error);
      this.state = "ERROR_API";
      await this.updateBotState();
      await this.logEvent("ERROR", `Erro ao iniciar bot: ${error}`);
      throw error;
    }
  }

  /**
   * Para o bot
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    
    // Limpar timer de fim de candle
    if (this.candleEndTimer) {
      clearTimeout(this.candleEndTimer);
      this.candleEndTimer = null;
    }
    
    if (this.derivService) {
      this.derivService.disconnect();
      this.derivService = null;
    }

    this.state = "IDLE";
    await this.updateBotState();
    await this.logEvent("BOT_STOPPED", "Bot parado pelo usuário");
  }

  /**
   * Inicia coleta de dados em tempo real
   */
  private async startDataCollection(): Promise<void> {
    if (!this.derivService) return;

    // Buscar histórico de candles
    const history = await this.derivService.getCandleHistory(this.symbol, 900, this.lookback);
    
    // Salvar histórico no banco
    for (const candle of history) {
      await insertCandle({
        symbol: this.symbol,
        timeframe: "M15",
        timestampUtc: candle.epoch,
        open: candle.open.toString(),
        high: candle.high.toString(),
        low: candle.low.toString(),
        close: candle.close.toString(),
      });
    }

    await this.logEvent("CANDLE_COLLECTED", `Histórico de ${history.length} candles coletado`);

    // Fazer análise inicial para descobrir fase e estratégia
    try {
      const historyData: CandleData[] = history.reverse().map((c) => ({
        abertura: c.open,
        minima: c.low,
        maxima: c.high,
        fechamento: c.close,
        timestamp: c.epoch,
      }));

      // Usar último candle como "parcial" para análise inicial
      const lastCandle = history[0];
      const initialPrediction = await predictionService.predict({
        symbol: this.symbol,
        tf: "M15",
        history: historyData.slice(0, -1), // Todos exceto o último
        partial_current: {
          timestamp_open: lastCandle.epoch,
          elapsed_seconds: 900, // Candle completo
          abertura: lastCandle.open,
          minima_parcial: lastCandle.low,
          maxima_parcial: lastCandle.high,
        },
      });

      await this.logEvent(
        "PHASE_STRATEGY_DISCOVERED",
        `[FASE E ESTRATÉGIA DESCOBERTA] Fase: ${initialPrediction.phase} | Estratégia: ${initialPrediction.strategy} | Confiança: ${(initialPrediction.confidence * 100).toFixed(2)}%`
      );
    } catch (error) {
      console.error("[PHASE_DISCOVERY_ERROR] Erro ao descobrir fase/estratégia:", error);
      await this.logEvent(
        "PHASE_STRATEGY_DISCOVERED",
        `[FASE E ESTRATÉGIA] Será descoberta na primeira predição`
      );
    }

    // Inscrição de ticks já foi feita no start() - não duplicar aqui
    // A subscrição única garante que cada tick seja processado apenas 1 vez
  }

  /**
   * Trata cada tick recebido e constrói candle em tempo real
   */
  private async handleTick(tick: DerivTick): Promise<void> {
    if (!this.isRunning) return;

    const candleTimestamp = Math.floor(tick.epoch / 900) * 900; // Arredondar para M15

    // Novo candle?
    if (candleTimestamp !== this.currentCandleTimestamp) {
      // Fechar candle anterior
      if (this.currentCandleTimestamp > 0) {
        await this.closeCurrentCandle();
      }

      // Iniciar novo candle
      // NOTA: Valores construídos são apenas para monitoramento
      // Valores REAIS serão buscados da DERIV antes da predição
      const candleOpen = tick.quote;
      console.log(`[CANDLE_OPEN] Novo candle iniciado com primeiro tick: ${candleOpen} | timestamp: ${candleTimestamp}`);
      
      this.currentCandleTimestamp = candleTimestamp;
      
      // Armazenar valores construídos (para comparação)
      this.constructedOpen = candleOpen;
      this.constructedHigh = candleOpen;
      this.constructedLow = candleOpen;
      this.constructedClose = candleOpen;
      
      // Inicializar valores atuais (serão substituídos pela DERIV)
      this.currentCandleOpen = candleOpen;
      this.currentCandleHigh = candleOpen;
      this.currentCandleLow = candleOpen;
      this.currentCandleClose = candleOpen;
      
      this.currentCandleStartTime = new Date(candleTimestamp * 1000);
      this.tradesThisCandle.clear();

      this.state = "WAITING_MIDPOINT";
      await this.updateBotState();
      await this.logEvent("CANDLE_INITIALIZED", 
        `Novo candle: timestamp=${candleTimestamp}, firstTick=${tick.quote}`);
      
      // Criar timer para forçar fim do candle após 900 segundos (15 minutos)
      this.scheduleCandleEnd(candleTimestamp);
    } else {
      // Atualizar valores construídos com ticks
      this.constructedHigh = Math.max(this.constructedHigh, tick.quote);
      this.constructedLow = Math.min(this.constructedLow, tick.quote);
      this.constructedClose = tick.quote;
      
      // Atualizar valores atuais (serão substituídos pela DERIV antes da predição)
      this.currentCandleHigh = Math.max(this.currentCandleHigh, tick.quote);
      this.currentCandleLow = Math.min(this.currentCandleLow, tick.quote);
      this.currentCandleClose = tick.quote;
    }

    // Calcular segundos decorridos desde o início do candle
    const elapsedSeconds = Math.floor((tick.epoch - this.currentCandleTimestamp));
    
    // Proteção: Se elapsedSeconds for maior que 900 (15 min), algo está errado
    if (elapsedSeconds > 900 || elapsedSeconds < 0) {
      console.warn(`[ELAPSED_SECONDS_ERROR] Valor incorreto: ${elapsedSeconds}s. Ignorando tick.`);
      return;
    }

    // Momento da predição: waitTime configurado (em segundos)
    const waitTimeSeconds = this.waitTime * 60;
    if (elapsedSeconds >= waitTimeSeconds && this.state === "WAITING_MIDPOINT") {
      await this.makePrediction(elapsedSeconds);
    }

    // Se armado, verificar gatilho
    if (this.state === "ARMED" && this.prediction) {
      await this.checkTrigger(tick.quote, elapsedSeconds);
    }

    // Se em posição, gerenciar saída
    if (this.state === "ENTERED" && this.currentPositions.length > 0) {
      await this.managePosition(tick.quote, elapsedSeconds);
    }
  }

  /**
   * Fecha o candle atual e salva no banco
   */
  private async closeCurrentCandle(): Promise<void> {
    if (this.currentCandleTimestamp === 0) return;

    // Dados já são oficiais da DERIV (via subscribeCandles), salvar diretamente
    await insertCandle({
      symbol: this.symbol,
      timeframe: "M15",
      timestampUtc: this.currentCandleTimestamp,
      open: this.currentCandleOpen.toString(),
      high: this.currentCandleHigh.toString(),
      low: this.currentCandleLow.toString(),
      close: this.currentCandleClose.toString(),
    });
    
    await this.logEvent(
      "CANDLE_CLOSED",
      `Candle fechado e salvo (DERIV oficial): Open=${this.currentCandleOpen} | High=${this.currentCandleHigh} | Low=${this.currentCandleLow} | Close=${this.currentCandleClose}`
    );

    // Se tinha posições abertas, fechar todas
    if (this.state === "ENTERED" && this.currentPositions.length > 0) {
      await this.closeAllPositions("Candle fechado");
    } else {
      // Reset estado se não tinha posições
      this.prediction = null;
      this.trigger = 0;
      this.hedgeAlreadyOpened = false;
      this.state = "WAITING_MIDPOINT";
      await this.updateBotState();
    }
  }

  /**
   * Faz predição aos 8 minutos do candle
   */
  private async makePrediction(elapsedSeconds: number): Promise<void> {
    try {
      this.state = "PREDICTING";
      await this.updateBotState();

      // CRÍTICO: Buscar candle atual da DERIV para garantir dados EXATOS
      // NÃO usar valores construídos manualmente - eles podem estar incorretos
      try {
        if (!this.derivService) {
          throw new Error("DerivService não disponível");
        }
        
        // Buscar últimos 2 candles para garantir que pegamos o atual
        const currentCandles = await this.derivService.getCandleHistory(this.symbol, 900, 2);
        
        // Encontrar o candle atual pelo timestamp
        const currentCandle = currentCandles.find(c => c.epoch === this.currentCandleTimestamp);
        
        if (!currentCandle) {
          // Se não encontrou, pode ser que o candle ainda não esteja disponível
          // Tentar novamente após 2 segundos
          await this.logEvent(
            "DERIV_CANDLE_RETRY",
            `[SYNC DERIV] Candle atual não encontrado, tentando novamente em 2s...`
          );
          
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const retryCandles = await this.derivService.getCandleHistory(this.symbol, 900, 2);
          const retryCurrent = retryCandles.find(c => c.epoch === this.currentCandleTimestamp);
          
          if (!retryCurrent) {
            throw new Error(`Candle atual (timestamp ${this.currentCandleTimestamp}) não encontrado na DERIV após retry`);
          }
          
          // Usar valores do retry
          this.currentCandleOpen = retryCurrent.open;
          this.currentCandleHigh = retryCurrent.high;
          this.currentCandleLow = retryCurrent.low;
          this.currentCandleClose = retryCurrent.close;
          
          await this.logEvent(
            "DERIV_CANDLE_SYNC_SUCCESS",
            `[SYNC OK - RETRY] Valores oficiais DERIV: Open=${retryCurrent.open} | High=${retryCurrent.high} | Low=${retryCurrent.low} | Close=${retryCurrent.close}`
          );
          
          // Log comparativo para debug
          await this.logEvent(
            "CANDLE_VALUES_COMPARISON",
            `[COMPARAÇÃO] Construído: O=${this.constructedOpen.toFixed(4)} H=${this.constructedHigh.toFixed(4)} L=${this.constructedLow.toFixed(4)} | DERIV: O=${retryCurrent.open.toFixed(4)} H=${retryCurrent.high.toFixed(4)} L=${retryCurrent.low.toFixed(4)} | Diferenças: O=${Math.abs(this.constructedOpen - retryCurrent.open).toFixed(4)} H=${Math.abs(this.constructedHigh - retryCurrent.high).toFixed(4)} L=${Math.abs(this.constructedLow - retryCurrent.low).toFixed(4)}`
          );
        } else {
          // Candle encontrado na primeira tentativa
          this.currentCandleOpen = currentCandle.open;
          this.currentCandleHigh = currentCandle.high;
          this.currentCandleLow = currentCandle.low;
          this.currentCandleClose = currentCandle.close;
          
          await this.logEvent(
            "DERIV_CANDLE_SYNC_SUCCESS",
            `[SYNC OK] Valores oficiais DERIV: Open=${currentCandle.open} | High=${currentCandle.high} | Low=${currentCandle.low} | Close=${currentCandle.close}`
          );
          
          // Log comparativo para debug
          await this.logEvent(
            "CANDLE_VALUES_COMPARISON",
            `[COMPARAÇÃO] Construído: O=${this.constructedOpen.toFixed(4)} H=${this.constructedHigh.toFixed(4)} L=${this.constructedLow.toFixed(4)} | DERIV: O=${currentCandle.open.toFixed(4)} H=${currentCandle.high.toFixed(4)} L=${currentCandle.low.toFixed(4)} | Diferenças: O=${Math.abs(this.constructedOpen - currentCandle.open).toFixed(4)} H=${Math.abs(this.constructedHigh - currentCandle.high).toFixed(4)} L=${Math.abs(this.constructedLow - currentCandle.low).toFixed(4)}`
          );
        }
      } catch (error) {
        // CRÍTICO: Se não conseguir obter valores da DERIV, ABORTAR predição
        // Melhor pular uma predição do que usar dados incorretos
        await this.logEvent(
          "DERIV_CANDLE_SYNC_CRITICAL_ERROR",
          `[ERRO CRÍTICO] Não foi possível obter candle oficial da DERIV: ${error}. ABORTANDO predição para evitar cálculos incorretos.`
        );
        
        // Voltar ao estado de espera e tentar no próximo candle
        this.state = "WAITING_MIDPOINT";
        await this.updateBotState();
        return;
      }

      // Buscar histórico
      const history = await getCandleHistory(this.symbol, this.lookback);
      
      const historyData: CandleData[] = history.reverse().map((c) => ({
        abertura: parseFloat(c.open),
        minima: parseFloat(c.low),
        maxima: parseFloat(c.high),
        fechamento: parseFloat(c.close),
        timestamp: c.timestampUtc,
      }));

      // Montar request de predição
      const request: PredictionRequest = {
        symbol: this.symbol,
        tf: "M15",
        history: historyData,
        partial_current: {
          timestamp_open: this.currentCandleTimestamp,
          elapsed_seconds: elapsedSeconds,
          abertura: this.currentCandleOpen,
          minima_parcial: this.currentCandleLow,
          maxima_parcial: this.currentCandleHigh,
        },
      };

      // Log dos valores ANTES da predição
      await this.logEvent(
        "PRE_PREDICTION_DATA",
        `[ENTRADA DA PREDIÇÃO] Abertura: ${this.currentCandleOpen} | Máxima: ${this.currentCandleHigh} | Mínima: ${this.currentCandleLow} | Timestamp: ${this.currentCandleTimestamp} | Tempo decorrido: ${elapsedSeconds}s`
      );

      // Chamar engine de predição
      this.prediction = await predictionService.predict(request);

      // Calcular gatilho usando offset configurável
      // Se offset = 0, entrar diretamente no preço de predição (sem offset)
      // Offset é valor absoluto, NÃO multiplicar por pipSize!
      // Exemplo: 57914.1208 ±16 = 57898.1208 ou 57930.1208
      const offset = this.triggerOffset;
      console.log(`[TRIGGER_OFFSET_DEBUG] Offset usado no cálculo: ${offset}`);
      
      if (offset === 0) {
        // Offset desativado: entrar diretamente no preço de predição
        this.trigger = this.prediction.predicted_close;
      } else if (this.prediction.direction === "up") {
        // Para UP (compra/verde), gatilho ABAIXO do close previsto
        this.trigger = this.prediction.predicted_close - offset;
      } else {
        // Para DOWN (venda/vermelho), gatilho ACIMA do close previsto
        this.trigger = this.prediction.predicted_close + offset;
      }

      // Log detalhado da predição e cálculo do gatilho
      const offsetInfo = offset === 0 ? 'DESATIVADO (entrada direta no preço previsto)' : `${offset} pontos`;
      const triggerPosition = offset === 0 ? 'EXATAMENTE no close previsto' : (this.prediction.direction === 'up' ? 'ABAIXO do close' : 'ACIMA do close');
      
      await this.logEvent(
        "PREDICTION_MADE",
        `[SAÍDA DA PREDIÇÃO] Direção: ${this.prediction.direction.toUpperCase()} | Close Previsto: ${this.prediction.predicted_close} | Gatilho Calculado: ${this.trigger} (${triggerPosition}) | Offset: ${offsetInfo} | Fase: ${this.prediction.phase} | Estratégia: ${this.prediction.strategy}`
      );

      // Verificar se já atingiu limite diário
      if (this.dailyPnL <= -this.stopDaily) {
        await this.logEvent("STOP_DAILY_HIT", "Stop diário atingido");
        this.state = "LOCK_RISK";
        await this.stop();
        return;
      }

      if (this.dailyPnL >= this.takeDaily) {
        await this.logEvent("TAKE_DAILY_HIT", "Take diário atingido");
        this.state = "LOCK_RISK";
        await this.stop();
        return;
      }

      // Verificar se já operou neste candle
      if (this.tradesThisCandle.has(this.currentCandleTimestamp)) {
        await this.logEvent("ERROR", "Já existe operação neste candle, aguardando próximo");
        this.state = "WAITING_MIDPOINT";
        await this.updateBotState();
        return;
      }

      // Armar entrada
      this.state = "ARMED";
      await this.updateBotState();
      await this.logEvent("POSITION_ARMED", `Entrada armada no gatilho ${this.trigger}`);
    } catch (error) {
      console.error("[TradingBot] Error making prediction:", error);
      await this.logEvent("ERROR", `Erro na predição: ${error}`);
      this.state = "ERROR_API";
      await this.updateBotState();
    }
  }

  /**
   * Verifica se o gatilho foi atingido
   */
  private async checkTrigger(currentPrice: number, elapsedSeconds: number): Promise<void> {
    if (!this.prediction || !this.derivService) return;

    let triggered = false;

    if (this.prediction.direction === "up" && currentPrice <= this.trigger) {
      triggered = true;
    } else if (this.prediction.direction === "down" && currentPrice >= this.trigger) {
      triggered = true;
    }

    if (triggered) {
      await this.logEvent(
        "TRIGGER_HIT",
        `[GATILHO ATINGIDO] Preço atual: ${currentPrice} | Gatilho: ${this.trigger} | Direção: ${this.prediction.direction.toUpperCase()} | Condição: ${this.prediction.direction === 'up' ? `Preço (${currentPrice}) <= Gatilho (${this.trigger})` : `Preço (${currentPrice}) >= Gatilho (${this.trigger})`}`
      );
      await this.enterPosition(currentPrice, elapsedSeconds);
    }
  }

  /**
   * Entra na posição
   */
  private async enterPosition(entryPrice: number, elapsedSeconds: number): Promise<void> {
    if (!this.prediction || !this.derivService) return;

    try {
      const contractType = this.prediction.direction === "up" ? "CALL" : "PUT";
      
      // Calcular duração até 20 segundos antes do fim do candle M15 (900s)
      // Duração = (900 - elapsedSeconds - 20) segundos
      const durationSeconds = Math.max(900 - elapsedSeconds - 20, 60); // Mínimo 60s
      const durationMinutes = Math.ceil(durationSeconds / 60); // Arredondar para cima em minutos
      
      // Comprar contrato na DERIV
      const contract = await this.derivService.buyContract(
        this.symbol,
        contractType,
        this.stake / 100, // Converter centavos para unidade
        durationMinutes,
        "m"
      );

      // Salvar posição no banco
      const positionId = await insertPosition({
        userId: this.userId,
        contractId: contract.contract_id,
        symbol: this.symbol,
        direction: this.prediction.direction,
        stake: this.stake,
        entryPrice: entryPrice.toString(),
        predictedClose: this.prediction.predicted_close.toString(),
        trigger: this.trigger.toString(),
        phase: this.prediction.phase,
        strategy: this.prediction.strategy,
        confidence: this.prediction.confidence.toString(),
        status: "ENTERED",
        candleTimestamp: this.currentCandleTimestamp,
        entryTime: new Date(),
        isHedge: false,
      });

      // Adicionar à lista de posições
      this.currentPositions.push({
        positionId,
        contractId: contract.contract_id,
        isHedge: false,
        stake: this.stake,
      });
      this.tradesThisCandle.add(this.currentCandleTimestamp);
      this.lastContractCheckTime = 0; // Resetar para permitir verificação imediata

      this.state = "ENTERED";
      await this.updateBotState();
      await this.logEvent(
        "POSITION_ENTERED",
        `Posição aberta: ${contractType} | Entrada: ${entryPrice} | Stake: ${this.stake / 100} | Duração: ${durationMinutes}min (${durationSeconds}s) | Contract: ${contract.contract_id}`
      );
    } catch (error) {
      console.error("[TradingBot] Error entering position:", error);
      await this.logEvent("ERROR", `Erro ao abrir posição: ${error}`);
      this.state = "ERROR_API";
      await this.updateBotState();
    }
  }

  /**
   * Gerencia a posição aberta
   */
  private async managePosition(currentPrice: number, elapsedSeconds: number): Promise<void> {
    if (this.currentPositions.length === 0 || !this.derivService) return;

    // Debounce: só consultar contrato a cada 5 segundos
    const now = Date.now();
    if (now - this.lastContractCheckTime < 5000) {
      return;
    }
    this.lastContractCheckTime = now;

    try {
      // Obter posição original (primeira da lista)
      const originalPosition = this.currentPositions.find(p => !p.isHedge);
      if (!originalPosition) return;

      // Obter informações do contrato original
      const contractInfo = await this.derivService.getContractInfo(originalPosition.contractId);
      
      const payout = contractInfo.payout || 0;
      const currentProfit = contractInfo.profit || 0;
      const sellPrice = contractInfo.sell_price || 0;

      // 1. Early close se lucro >= profitThreshold% do lucro máximo
      const profitRatio = this.profitThreshold / 100;
      const stakeInDollars = originalPosition.stake / 100;
      const maxProfit = payout - stakeInDollars;
      const targetProfit = maxProfit * profitRatio;
      
      if (currentProfit >= targetProfit && sellPrice > 0) {
        await this.closeAllPositions(`Early close - ${this.profitThreshold}% do lucro máximo atingido`);
        return;
      }

      // 2. Fechar 20 segundos antes do fim do candle (880s) APENAS SE EM LUCRO
      if (elapsedSeconds >= 880 && currentProfit > 0 && sellPrice > 0) {
        await this.closeAllPositions("Fechamento 20s antes do fim (em lucro)");
        return;
      }

      // 3. IA HEDGE: Analisar se deve abrir hedge (apenas nos últimos 3 minutos)
      const elapsedMinutes = elapsedSeconds / 60;
      if (this.hedgeEnabled && 
          !this.hedgeAlreadyOpened && 
          this.prediction &&
          elapsedMinutes >= this.hedgeConfig.analysisStartMinute &&
          elapsedMinutes <= this.hedgeConfig.analysisEndMinute) {
        
        await this.analyzeAndExecuteHedge(currentPrice, elapsedMinutes, originalPosition);
      }

      // 4. Se em perda, aguardar até o fim do candle (900s)
    } catch (error) {
      // Não logar erro a cada tick, apenas em caso de timeout crítico
      // A posição continuará sendo gerenciada e fechará no tempo correto
      if (elapsedSeconds % 30 === 0) {
        console.error("[TradingBot] Error checking contract info:", error);
      }
    }
  }

  /**
   * Analisa posição e executa hedge se necessário
   */
  private async analyzeAndExecuteHedge(
    currentPrice: number,
    elapsedMinutes: number,
    originalPosition: { positionId: number; contractId: string; stake: number }
  ): Promise<void> {
    if (!this.prediction || !this.derivService) return;

    try {
      // Preparar parâmetros para análise
      const params = {
        entryPrice: parseFloat(await this.getPositionEntryPrice(originalPosition.positionId)),
        currentPrice,
        predictedClose: this.prediction.predicted_close,
        candleOpen: this.currentCandleOpen,
        direction: this.prediction.direction,
        elapsedMinutes,
        originalStake: originalPosition.stake,
      };

      // Analisar posição
      const decision = analyzePositionForHedge(params, this.hedgeConfig);

      // Logar apenas situações importantes (não HOLD)
      if (decision.action !== 'HOLD') {
        await this.logEvent(
          "HEDGE_ANALYSIS",
          `[IA HEDGE] Ação: ${decision.action} | Motivo: ${decision.reason} | Progresso: ${(decision.progressRatio * 100).toFixed(1)}% | Tempo: ${elapsedMinutes.toFixed(2)}min`,
          decision
        );
      }

      // Executar hedge se necessário
      if (decision.shouldOpenSecondPosition && decision.secondPositionType && decision.secondPositionStake) {
        await this.openHedgePosition(
          decision.secondPositionType,
          decision.secondPositionStake,
          originalPosition.positionId,
          decision.action,
          decision.reason,
          elapsedMinutes
        );
        
        this.hedgeAlreadyOpened = true;
      }
    } catch (error) {
      console.error("[TradingBot] Error analyzing hedge:", error);
      await this.logEvent("ERROR", `Erro ao analisar hedge: ${error}`);
    }
  }

  /**
   * Abre posição de hedge
   */
  private async openHedgePosition(
    contractType: 'CALL' | 'PUT',
    stakeInCents: number,
    parentPositionId: number,
    hedgeAction: string,
    hedgeReason: string,
    elapsedMinutes: number
  ): Promise<void> {
    if (!this.derivService || !this.prediction) return;

    try {
      // Calcular duração restante do candle
      const elapsedSeconds = elapsedMinutes * 60;
      const durationSeconds = Math.max(900 - elapsedSeconds - 20, 60);
      const durationMinutes = Math.ceil(durationSeconds / 60);

      // Comprar contrato de hedge na DERIV
      const contract = await this.derivService.buyContract(
        this.symbol,
        contractType,
        stakeInCents / 100,
        durationMinutes,
        "m"
      );

      // Salvar posição de hedge no banco
      const hedgePositionId = await insertPosition({
        userId: this.userId,
        contractId: contract.contract_id,
        symbol: this.symbol,
        direction: contractType === 'CALL' ? 'up' : 'down',
        stake: stakeInCents,
        entryPrice: "0",
        predictedClose: this.prediction.predicted_close.toString(),
        trigger: "0",
        phase: this.prediction.phase,
        strategy: this.prediction.strategy,
        confidence: this.prediction.confidence.toString(),
        status: "ENTERED",
        candleTimestamp: this.currentCandleTimestamp,
        entryTime: new Date(),
        isHedge: true,
        parentPositionId,
        hedgeAction,
        hedgeReason,
      });

      // Adicionar à lista de posições
      this.currentPositions.push({
        positionId: hedgePositionId,
        contractId: contract.contract_id,
        isHedge: true,
        parentPositionId,
        stake: stakeInCents,
      });

      await this.logEvent(
        "HEDGE_POSITION_OPENED",
        `🛡️ HEDGE ABERTO: ${contractType} | Stake: $${(stakeInCents / 100).toFixed(2)} (${(stakeInCents / this.stake).toFixed(1)}x) | Ação: ${hedgeAction} | Motivo: ${hedgeReason} | Contract: ${contract.contract_id}`
      );
    } catch (error) {
      console.error("[TradingBot] Error opening hedge position:", error);
      await this.logEvent("ERROR", `Erro ao abrir hedge: ${error}`);
    }
  }

  /**
   * Fecha todas as posições (original + hedge)
   */
  private async closeAllPositions(reason: string): Promise<void> {
    if (this.currentPositions.length === 0 || !this.derivService) return;

    const positions = [...this.currentPositions];
    this.currentPositions = [];

    let totalPnL = 0;
    const closedPositions: Array<{ id: number; pnl: number; isHedge: boolean }> = [];

    try {
      // Fechar todas as posições
      for (const position of positions) {
        try {
          // Obter informações finais do contrato
          const contractInfo = await this.derivService.getContractInfo(position.contractId);

          // Tentar vender se possível
          if (contractInfo.sell_price && contractInfo.sell_price > 0) {
            await this.derivService.sellContract(position.contractId, contractInfo.sell_price);
          }

          // Reconsultar após venda
          const finalContractInfo = await this.derivService.getContractInfo(position.contractId);

          // Calcular PnL
          let finalProfit = 0;
          if (finalContractInfo.status === 'sold' || finalContractInfo.status === 'won') {
            const sellPrice = finalContractInfo.sell_price || finalContractInfo.payout || 0;
            finalProfit = sellPrice - finalContractInfo.buy_price;
          } else if (finalContractInfo.status === 'lost') {
            finalProfit = -finalContractInfo.buy_price;
          } else {
            finalProfit = finalContractInfo.profit || 0;
          }

          const pnlInCents = Math.round(finalProfit * 100);
          totalPnL += pnlInCents;

          // Atualizar posição no banco
          const exitPrice = finalContractInfo.exit_tick || finalContractInfo.current_spot || 0;
          await updatePosition(position.positionId, {
            exitPrice: exitPrice.toString(),
            pnl: pnlInCents,
            status: "CLOSED",
            exitTime: new Date(),
          });

          closedPositions.push({
            id: position.positionId,
            pnl: pnlInCents,
            isHedge: position.isHedge,
          });

          await this.logEvent(
            position.isHedge ? "HEDGE_POSITION_CLOSED" : "POSITION_CLOSED",
            `${position.isHedge ? '🛡️ Hedge' : 'Posição'} fechada: ${reason} | PnL: $${(pnlInCents / 100).toFixed(2)} | Contract: ${position.contractId}`
          );
        } catch (error) {
          console.error(`[TradingBot] Error closing position ${position.contractId}:`, error);
          await this.logEvent("ERROR", `Erro ao fechar posição ${position.contractId}: ${error}`);
        }
      }

      // Atualizar PnL diário com total combinado
      this.dailyPnL += totalPnL;
      await this.updateDailyMetrics(totalPnL);

      await this.logEvent(
        "ALL_POSITIONS_CLOSED",
        `✅ TODAS POSIÇÕES FECHADAS: ${reason} | PnL Total: $${(totalPnL / 100).toFixed(2)} | PnL Diário: $${(this.dailyPnL / 100).toFixed(2)} | Posições: ${closedPositions.length}`
      );

      // Verificar stop/take diário
      if (this.dailyPnL <= -this.stopDaily) {
        await this.logEvent("STOP_DAILY_HIT", "Stop diário atingido, encerrando bot");
        await this.stop();
        return;
      }

      if (this.dailyPnL >= this.takeDaily) {
        await this.logEvent("TAKE_DAILY_HIT", "Take diário atingido, encerrando bot");
        await this.stop();
        return;
      }

      // Reset para próximo candle
      this.prediction = null;
      this.trigger = 0;
      this.hedgeAlreadyOpened = false;
      this.state = "WAITING_MIDPOINT";
      await this.updateBotState();
    } catch (error) {
      console.error("[TradingBot] Error closing all positions:", error);
      await this.logEvent("ERROR", `Erro ao fechar todas posições: ${error}`);
    }
  }

  /**
   * Obtém preço de entrada de uma posição
   */
  private async getPositionEntryPrice(positionId: number): Promise<string> {
    try {
      const position = await getPositionById(positionId);
      return position?.entryPrice || "0";
    } catch (error) {
      console.error("[TradingBot] Error getting position entry price:", error);
      return "0";
    }
  }
  /**
   * Fecha a posição (FUNÇÃO LEGADA - MANTIDA PARA COMPATIBILIDADE)
   * NOTA: Use closeAllPositions() para nova lógica com suporte a hedge
   */
  private async closePosition(reason: string, sellPrice?: number): Promise<void> {
    // DEPRECATED: Redirecionar para closeAllPositions
    await this.closeAllPositions(reason);
    return;
  }

  /**
   * Carrega PnL do dia
   */
  private async loadDailyPnL(): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const metric = await getMetric(this.userId, today, "daily");
    this.dailyPnL = metric?.pnl || 0;
  }

  /**
   * Atualiza métricas diárias
   */
  private async updateDailyMetrics(pnl: number): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const metric = await getMetric(this.userId, today, "daily");

    const totalTrades = (metric?.totalTrades || 0) + 1;
    const wins = pnl > 0 ? (metric?.wins || 0) + 1 : metric?.wins || 0;
    const losses = pnl < 0 ? (metric?.losses || 0) + 1 : metric?.losses || 0;
    const totalPnL = (metric?.pnl || 0) + pnl;

    await upsertMetric({
      userId: this.userId,
      date: today,
      period: "daily",
      totalTrades,
      wins,
      losses,
      pnl: totalPnL,
    });
  }

  /**
   * Registra evento no log
   */
  private async logEvent(eventType: string, message: string, data?: any): Promise<void> {
    await insertEventLog({
      userId: this.userId,
      eventType,
      message,
      data: data ? JSON.stringify(data) : null,
      timestampUtc: Math.floor(Date.now() / 1000),
    });
  }

  /**
   * Atualiza estado do bot no banco
   */
  private async updateBotState(): Promise<void> {
    // Usar primeira posição (original) para compatibilidade com botState
    const firstPosition = this.currentPositions.length > 0 ? this.currentPositions[0] : null;
    
    await upsertBotState({
      userId: this.userId,
      state: this.state,
      isRunning: this.isRunning,
      currentCandleTimestamp: this.currentCandleTimestamp || null,
      currentPositionId: firstPosition?.positionId || null,
    });
  }

  /**
   * Agenda o fim do candle após 900 segundos (15 minutos)
   * Garante que o candle seja fechado mesmo se não chegar tick na virada
   */
  private scheduleCandleEnd(candleTimestamp: number): void {
    // Limpar timer anterior se existir
    if (this.candleEndTimer) {
      clearTimeout(this.candleEndTimer);
    }
    
    // Calcular quando o candle deve terminar
    const candleEndTimestamp = candleTimestamp + 900; // 900 segundos = 15 minutos
    const now = Math.floor(Date.now() / 1000);
    const timeUntilEnd = (candleEndTimestamp - now) * 1000; // Converter para milissegundos
    
    // Se o tempo já passou (caso raro), fechar imediatamente
    if (timeUntilEnd <= 0) {
      console.log(`[CANDLE_END_TIMER] Candle já deveria ter terminado, fechando imediatamente`);
      this.closeCurrentCandle().catch(err => 
        console.error(`[CANDLE_END_TIMER_ERROR] Erro ao fechar candle:`, err)
      );
      return;
    }
    
    console.log(`[CANDLE_END_TIMER] Timer criado: candle termina em ${timeUntilEnd / 1000}s (${new Date(candleEndTimestamp * 1000).toISOString()})`);
    
    // Criar timer para forçar fechamento
    this.candleEndTimer = setTimeout(async () => {
      console.log(`[CANDLE_END_TIMER] Timer disparado! Forçando fechamento do candle ${candleTimestamp}`);
      
      // Verificar se ainda estamos no mesmo candle
      if (this.currentCandleTimestamp === candleTimestamp) {
        await this.logEvent("CANDLE_FORCED_CLOSE", 
          `Candle fechado por timer após 900s sem receber tick de virada`);
        await this.closeCurrentCandle();
        
        // Forçar início do próximo candle
        const nextCandleTimestamp = candleTimestamp + 900;
        console.log(`[CANDLE_END_TIMER] Iniciando próximo candle: ${nextCandleTimestamp}`);
        
        // Resetar para aguardar primeiro tick do novo candle
        this.currentCandleTimestamp = 0;
      } else {
        console.log(`[CANDLE_END_TIMER] Candle já mudou, timer ignorado`);
      }
    }, timeUntilEnd);
  }

  /**
   * Obtém estado atual
   */
  getState(): BotStateType {
    return this.state;
  }

  /**
   * Verifica se está rodando
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Obtém timestamp do início do candle atual (UTC)
   */
  getCandleStartTime(): number {
    return this.currentCandleTimestamp;
  }
}

// Gerenciador de bots (um por usuário)
const activeBots = new Map<number, TradingBot>();

export function getBotForUser(userId: number): TradingBot {
  if (!activeBots.has(userId)) {
    activeBots.set(userId, new TradingBot(userId));
  }
  return activeBots.get(userId)!;
}

export function removeBotForUser(userId: number): void {
  activeBots.delete(userId);
}

