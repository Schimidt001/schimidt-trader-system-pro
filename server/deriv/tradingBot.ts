import { DerivService, type DerivTick } from "./derivService";
import { predictionService, predictAmplitude, type AmplitudePredictionRequest } from "../prediction/predictionService";
import { makeAIDecision, calculateHedgedPnL, type AIConfig, type AIDecision } from "../ai/hybridStrategy";
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
  
  // Posição atual
  private currentPositionId: number | null = null;
  private contractId: string | null = null;
  private lastContractCheckTime: number = 0;
  private candleEndTimer: NodeJS.Timeout | null = null; // Timer para forçar fim de candle
  private currentPositionStake: number = 0; // Stake real da posição atual (em centavos)
  private contractInfoErrors: number = 0; // Contador de erros consecutivos ao obter contractInfo
  
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
  
  // Configurações da IA Híbrida
  private aiEnabled: boolean = false;
  private stakeHighConfidence: number = 400; // em centavos ($4)
  private stakeNormalConfidence: number = 100; // em centavos ($1)
  private aiFilterThreshold: number = 60; // 0-100
  private aiHedgeEnabled: boolean = true;
  private aiDecision: AIDecision | null = null;
  
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
      
      // Carregar configurações da IA Híbrida
      this.aiEnabled = config.aiEnabled ?? false;
      this.stakeHighConfidence = config.stakeHighConfidence ?? 400;
      this.stakeNormalConfidence = config.stakeNormalConfidence ?? 100;
      this.aiFilterThreshold = config.aiFilterThreshold ?? 60;
      this.aiHedgeEnabled = config.aiHedgeEnabled ?? true;
      
      console.log(`[AI_CONFIG] IA Habilitada: ${this.aiEnabled}`);
      if (this.aiEnabled) {
        console.log(`[AI_CONFIG] Stake Alta Confiança: $${this.stakeHighConfidence / 100}`);
        console.log(`[AI_CONFIG] Stake Normal: $${this.stakeNormalConfidence / 100}`);
        console.log(`[AI_CONFIG] Threshold Filtro: ${this.aiFilterThreshold}%`);
        console.log(`[AI_CONFIG] Hedge Habilitado: ${this.aiHedgeEnabled}`);
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
      
      // Subscrever ticks SEMPRE que o bot iniciar (mesmo se reiniciando)
      this.derivService.subscribeTicks(this.symbol, (tick: DerivTick) => {
        this.handleTick(tick);
      });
      console.log(`[TradingBot] Subscribed to ticks for ${this.symbol}`);
      
      // Se estado for COLLECTING, iniciar coleta de dados
      if (this.state === "IDLE" || this.state === "COLLECTING") {
        this.state = "COLLECTING";
        await this.updateBotState();
        await this.logEvent("BOT_STARTED", `Bot iniciado em modo ${this.mode} para ${this.symbol}`);
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
      // NOTA: Estes valores construídos são apenas para monitoramento
      // Os valores REAIS serão buscados da DERIV antes da predição
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
      // Isso garante que o candle seja fechado mesmo se não chegar tick na virada
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
    if (this.state === "ENTERED" && this.currentPositionId) {
      await this.managePosition(tick.quote, elapsedSeconds);
    }
  }

  /**
   * Fecha o candle atual e salva no banco
   */
  private async closeCurrentCandle(): Promise<void> {
    if (this.currentCandleTimestamp === 0) return;

    await insertCandle({
      symbol: this.symbol,
      timeframe: "M15",
      timestampUtc: this.currentCandleTimestamp,
      open: this.currentCandleOpen.toString(),
      high: this.currentCandleHigh.toString(),
      low: this.currentCandleLow.toString(),
      close: this.currentCandleClose.toString(), // Último tick como close
    });

    // Se tinha posição aberta, fechar
    if (this.state === "ENTERED" && this.currentPositionId) {
      await this.closePosition("Candle fechado");
    }

    // Reset estado (IDs já foram limpos em closePosition)
    this.prediction = null;
    this.trigger = 0;
    this.state = "WAITING_MIDPOINT";
    await this.updateBotState();
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
      // Se não conseguir obter da DERIV, ABORTAR predição
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
            `[COMPARAÇÃO] Construído: O=${this.constructedOpen} H=${this.constructedHigh} L=${this.constructedLow} | DERIV: O=${retryCurrent.open} H=${retryCurrent.high} L=${retryCurrent.low} | Diferenças: O=${Math.abs(this.constructedOpen - retryCurrent.open).toFixed(4)} H=${Math.abs(this.constructedHigh - retryCurrent.high).toFixed(4)} L=${Math.abs(this.constructedLow - retryCurrent.low).toFixed(4)}`
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
            `[COMPARAÇÃO] Construído: O=${this.constructedOpen} H=${this.constructedHigh} L=${this.constructedLow} | DERIV: O=${currentCandle.open} H=${currentCandle.high} L=${currentCandle.low} | Diferenças: O=${Math.abs(this.constructedOpen - currentCandle.open).toFixed(4)} H=${Math.abs(this.constructedHigh - currentCandle.high).toFixed(4)} L=${Math.abs(this.constructedLow - currentCandle.low).toFixed(4)}`
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
      
      // Se IA estiver habilitada, fazer análise de confiança
      if (this.aiEnabled) {
        const aiConfig: AIConfig = {
          stakeHighConfidence: this.stakeHighConfidence,
          stakeNormalConfidence: this.stakeNormalConfidence,
          aiFilterThreshold: this.aiFilterThreshold,
          aiHedgeEnabled: this.aiHedgeEnabled
        };
        
        const candleData = {
          open: this.currentCandleOpen,
          high: this.currentCandleHigh,
          low: this.currentCandleLow,
          close: this.currentCandleClose
        };
        
        // === NOVA LÓGICA: PREDIÇÃO DE AMPLITUDE ===
        let amplitudeAnalysis = undefined;
        try {
          const amplitudeRequest: AmplitudePredictionRequest = {
            historical_candles: historyData,
            current_high: this.currentCandleHigh,
            current_low: this.currentCandleLow,
            current_price: this.currentCandleClose,
            elapsed_minutes: elapsedSeconds / 60,
            predicted_close: this.prediction.predicted_close,
            predicted_direction: this.prediction.direction === 'up' ? 'compra' : 'venda'
          };
          
          amplitudeAnalysis = await predictAmplitude(amplitudeRequest);
          
          await this.logEvent(
            "AMPLITUDE_ANALYSIS",
            `[AMPLITUDE AI] Amplitude atual: ${amplitudeAnalysis.current_amplitude.toFixed(2)} | Prevista: ${amplitudeAnalysis.predicted_amplitude.toFixed(2)} | Expansão: ${(amplitudeAnalysis.expansion_probability * 100).toFixed(1)}% | Movimento: ${amplitudeAnalysis.recommendation.movement_expectation} | Estratégia: ${amplitudeAnalysis.recommendation.entry_strategy}`
          );
        } catch (error) {
          await this.logEvent(
            "AMPLITUDE_ANALYSIS_ERROR",
            `Erro na análise de amplitude: ${error}. Continuando sem análise de amplitude.`
          );
        }
        
        // Fazer decisão da IA com análise de amplitude
        this.aiDecision = makeAIDecision(candleData, this.prediction.direction, aiConfig, amplitudeAnalysis);
        
        await this.logEvent(
          "AI_DECISION",
          `[AGENTE IA] Confiança: ${this.aiDecision.confidence} | Deve Entrar: ${this.aiDecision.shouldEnter} | Hedge: ${this.aiDecision.shouldHedge} | Stake: $${this.aiDecision.stake / 100} | ${this.aiDecision.reason}`
        );
        
        // Se IA decidir NÃO entrar, pular para próximo candle
        if (!this.aiDecision.shouldEnter) {
          await this.logEvent(
            "AI_BLOCKED_ENTRY",
            "IA bloqueou entrada por baixa confiança. Aguardando próximo candle."
          );
          this.state = "WAITING_MIDPOINT";
          await this.updateBotState();
          return;
        }
      }

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
      
      // Calcular duração até 3 segundos antes do fim do candle M15 (900s)
      // Duração = (900 - elapsedSeconds - 3) segundos
      // CORREÇÃO CRÍTICA: Usar segundos diretamente para garantir que a operação
      // termine DENTRO do candle atual, evitando exposição ao próximo candle
      // Margem de 3s é suficiente para processamento da API sem desperdiçar tempo
      const durationSeconds = Math.max(900 - elapsedSeconds - 3, 60); // Mínimo 60s
      
      // Determinar stake: usar decisão da IA se habilitada, senão usar stake padrão
      const finalStake = this.aiEnabled && this.aiDecision 
        ? this.aiDecision.stake 
        : this.stake;
      
      // Armazenar stake real da posição para cálculos corretos de early close
      this.currentPositionStake = finalStake;
      
      // Comprar contrato na DERIV
      // CORREÇÃO CRÍTICA: Usar duração em SEGUNDOS ("s") em vez de minutos ("m")
      // para garantir que o contrato termine exatamente quando planejado,
      // evitando que ultrapasse o candle atual
      const contract = await this.derivService.buyContract(
        this.symbol,
        contractType,
        finalStake / 100, // Converter centavos para unidade
        durationSeconds,  // ✅ Usar segundos exatos
        "s"               // ✅ duration_unit = seconds
      );

      this.contractId = contract.contract_id;

      // Salvar posição no banco
      const positionId = await insertPosition({
        userId: this.userId,
        contractId: contract.contract_id,
        symbol: this.symbol,
        direction: this.prediction.direction,
        stake: finalStake,
        entryPrice: entryPrice.toString(),
        predictedClose: this.prediction.predicted_close.toString(),
        trigger: this.trigger.toString(),
        phase: this.prediction.phase,
        strategy: this.prediction.strategy,
        confidence: this.prediction.confidence.toString(),
        status: "ENTERED",
        candleTimestamp: this.currentCandleTimestamp,
        entryTime: new Date(),
      });

      this.currentPositionId = positionId;
      this.tradesThisCandle.add(this.currentCandleTimestamp);
      this.lastContractCheckTime = 0; // Resetar para permitir verificação imediata

      this.state = "ENTERED";
      await this.updateBotState();
      
      const aiInfo = this.aiEnabled && this.aiDecision
        ? ` | IA: ${this.aiDecision.confidence} | Hedge: ${this.aiDecision.shouldHedge ? 'SIM' : 'NÃO'}`
        : '';
      
      await this.logEvent(
        "POSITION_ENTERED",
        `Posição aberta: ${contractType} | Entrada: ${entryPrice} | Stake: ${finalStake / 100} | Duração: ${durationSeconds}s | Contract: ${contract.contract_id}${aiInfo}`
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
    if (!this.currentPositionId || !this.contractId || !this.derivService) return;

    // Debounce: só consultar contrato a cada 5 segundos
    const now = Date.now();
    if (now - this.lastContractCheckTime < 5000) {
      return; // Pular esta verificação
    }
    this.lastContractCheckTime = now;

    try {
      // Obter informações do contrato
      const contractInfo = await this.derivService.getContractInfo(this.contractId);
      
      const payout = contractInfo.payout || 0;
      const currentProfit = contractInfo.profit || 0;
      const sellPrice = contractInfo.sell_price || 0;
      
      // Log se sell_price não estiver disponível
      if (sellPrice <= 0 && elapsedSeconds % 30 === 0) {
        await this.logEvent(
          "SELL_PRICE_UNAVAILABLE",
          `sell_price não disponível para contrato ${this.contractId} | payout: ${payout} | profit: ${currentProfit}`
        );
      }
      
      // Reset contador de erros após sucesso
      this.contractInfoErrors = 0;

      // 1. Early close se lucro >= profitThreshold% do lucro máximo
      const profitRatio = this.profitThreshold / 100;
      const stakeInDollars = this.currentPositionStake / 100; // Usar stake REAL da posição (FIX BUG)
      const maxProfit = payout - stakeInDollars; // Lucro máximo possível
      const targetProfit = maxProfit * profitRatio; // X% do lucro máximo
      
      if (currentProfit >= targetProfit && sellPrice > 0) {
        await this.closePosition(`Early close - ${this.profitThreshold}% do lucro máximo atingido`, sellPrice);
        return;
      }

      // 2. Fechar 20 segundos antes do fim do candle (880s) APENAS SE EM LUCRO
      if (elapsedSeconds >= 880 && currentProfit > 0 && sellPrice > 0) {
        await this.closePosition("Fechamento 20s antes do fim (em lucro)", sellPrice);
        return;
      }

      // 3. Se em perda, aguardar até o fim do candle (900s)
      // A posição será fechada automaticamente pela DERIV ou pelo closeCurrentCandle()
    } catch (error) {
      // Incrementar contador de erros
      this.contractInfoErrors++;
      
      // Não logar erro a cada tick, apenas em caso de timeout crítico
      // A posição continuará sendo gerenciada e fechará no tempo correto
      if (elapsedSeconds % 30 === 0) {
        console.error("[TradingBot] Error checking contract info:", error);
      }
      
      // Alerta se muitos erros consecutivos
      if (this.contractInfoErrors >= 5) {
        await this.logEvent(
          "CONTRACT_INFO_ERROR_CRITICAL",
          `Falha ao obter contractInfo ${this.contractInfoErrors} vezes consecutivas | Contrato: ${this.contractId}`
        );
      }
    }
  }

  /**
   * Fecha a posição
   */
  private async closePosition(reason: string, sellPrice?: number): Promise<void> {
    if (!this.currentPositionId || !this.contractId || !this.derivService) return;

    // Proteção contra múltiplas chamadas simultâneas
    const positionId = this.currentPositionId;
    const contractId = this.contractId;
    
    // Limpar IDs imediatamente para evitar duplicação
    this.currentPositionId = null;
    this.contractId = null;
    this.currentPositionStake = 0; // Limpar stake da posição

    try {
      // Tentar vender contrato se preço fornecido
      if (sellPrice && sellPrice > 0) {
        await this.derivService.sellContract(contractId, sellPrice);
      }

      // Obter informações finais do contrato
      const contractInfo = await this.derivService.getContractInfo(contractId);
      
      // Log detalhado dos valores da DERIV para debug
      await this.logEvent(
        "CONTRACT_CLOSE_DEBUG",
        `[DEBUG FECHAMENTO] Contract ID: ${contractId} | status: ${contractInfo.status} | profit: ${contractInfo.profit} | sell_price: ${contractInfo.sell_price} | buy_price: ${contractInfo.buy_price} | payout: ${contractInfo.payout} | exit_tick: ${contractInfo.exit_tick} | current_spot: ${contractInfo.current_spot}`
      );
      
      // Calcular PnL baseado no resultado FINAL do contrato
      let finalProfit = 0;
      
      if (contractInfo.status === 'sold' || contractInfo.status === 'won') {
        // Contrato vendido ou ganho: usar sell_price ou payout
        const sellPrice = contractInfo.sell_price || contractInfo.payout || 0;
        finalProfit = sellPrice - contractInfo.buy_price;
      } else if (contractInfo.status === 'lost') {
        // Contrato perdido: perda total do stake
        finalProfit = -contractInfo.buy_price;
      } else {
        // Contrato ainda aberto ou status desconhecido: usar profit atual (temporário)
        // AVISO: Isso pode não refletir o resultado final!
        finalProfit = contractInfo.profit || 0;
        await this.logEvent(
          "WARNING",
          `[AVISO] Contrato ${contractId} fechado com status '${contractInfo.status}' - PnL pode não ser final`
        );
      }
      
      const exitPrice = contractInfo.exit_tick || contractInfo.current_spot || 0;

      // Atualizar posição no banco
      const pnlInCents = Math.round(finalProfit * 100);
      await updatePosition(positionId, {
        exitPrice: exitPrice.toString(),
        pnl: pnlInCents,
        status: "CLOSED",
        exitTime: new Date(),
      });
      
      await this.logEvent(
        "PNL_CALCULATION",
        `[CÁLCULO PNL] finalProfit DERIV: ${finalProfit} | pnlInCents (x100): ${pnlInCents} | pnlInDollars: ${(pnlInCents / 100).toFixed(2)}`
      );

      // Atualizar PnL diário
      this.dailyPnL += Math.round(finalProfit * 100);
      await this.updateDailyMetrics(Math.round(finalProfit * 100));

      await this.logEvent(
        "POSITION_CLOSED",
        `Posição fechada: ${reason} | PnL: ${finalProfit.toFixed(2)} | PnL Diário: ${(this.dailyPnL / 100).toFixed(2)}`
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

      // Reset para próximo candle (IDs já foram limpos no início da função)
      this.prediction = null;
      this.trigger = 0;
      this.state = "WAITING_MIDPOINT";
      await this.updateBotState();
    } catch (error) {
      console.error("[TradingBot] Error closing position:", error);
      await this.logEvent("ERROR", `Erro ao fechar posição: ${error}`);
    }
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
    await upsertBotState({
      userId: this.userId,
      state: this.state,
      isRunning: this.isRunning,
      currentCandleTimestamp: this.currentCandleTimestamp || null,
      currentPositionId: this.currentPositionId || null,
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

