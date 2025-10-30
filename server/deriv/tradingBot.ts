import { DerivService, DerivCandle, DerivTick } from "./derivService";
import { predictionService } from "../prediction/predictionService";
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
  
  // Dados da predição
  private prediction: PredictionResponse | null = null;
  private trigger: number = 0;
  private pipSize: number = 0.01;
  
  // Posição atual
  private currentPositionId: number | null = null;
  private contractId: string | null = null;
  private lastContractCheckTime: number = 0;
  
  // Configurações
  private symbol: string = "R_100";
  private stake: number = 1000; // em centavos
  private stopDaily: number = 10000;
  private takeDaily: number = 50000;
  private lookback: number = 100;
  private triggerOffset: number = 16; // offset do gatilho em pontos
  private profitThreshold: number = 90; // threshold de lucro para early close (%)
  private waitTime: number = 8; // tempo de espera em minutos antes de capturar dados
  private mode: "DEMO" | "REAL" = "DEMO";
  
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
      this.triggerOffset = config.triggerOffset || 16;
      this.profitThreshold = config.profitThreshold || 90;
      this.waitTime = config.waitTime || 8;
      this.mode = config.mode;

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

    // Inscrever-se em ticks para construir candle em tempo real
    this.derivService.subscribeTicks(this.symbol, (tick: DerivTick) => {
      this.handleTick(tick);
    });
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
      // Buscar valor real de abertura da DERIV
      let candleOpen = tick.quote; // Fallback: usar primeiro tick
      
      try {
        // Buscar último candle da DERIV para obter abertura real
        const candles = await this.derivService.getCandleHistory(this.symbol, 900, 1);
        if (candles.length > 0 && candles[0].epoch === candleTimestamp) {
          candleOpen = candles[0].open;
          console.log(`[CANDLE_OPEN] Usando abertura da DERIV: ${candleOpen}`);
        } else {
          console.log(`[CANDLE_OPEN] Candle não encontrado na DERIV, usando primeiro tick: ${tick.quote}`);
        }
      } catch (error) {
        console.error(`[CANDLE_OPEN] Erro ao buscar candle da DERIV:`, error);
      }
      
      this.currentCandleTimestamp = candleTimestamp;
      this.currentCandleOpen = candleOpen;
      this.currentCandleHigh = tick.quote;
      this.currentCandleLow = tick.quote;
      this.currentCandleClose = tick.quote; // Inicializar close
      this.currentCandleStartTime = new Date(candleTimestamp * 1000);
      this.tradesThisCandle.clear();

      this.state = "WAITING_MIDPOINT";
      await this.updateBotState();
      await this.logEvent("CANDLE_INITIALIZED", 
        `Novo candle: timestamp=${candleTimestamp}, open=${candleOpen}, firstTick=${tick.quote}`);
    } else {
      // Atualizar candle atual
      this.currentCandleHigh = Math.max(this.currentCandleHigh, tick.quote);
      this.currentCandleLow = Math.min(this.currentCandleLow, tick.quote);
      this.currentCandleClose = tick.quote; // Atualizar close com último tick
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

    // Reset estado
    this.prediction = null;
    this.trigger = 0;
    this.currentPositionId = null;
    this.contractId = null;
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

      this.contractId = contract.contract_id;

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
      });

      this.currentPositionId = positionId;
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

      // 1. Early close se lucro >= profitThreshold% do lucro máximo
      const profitRatio = this.profitThreshold / 100;
      const stakeInDollars = this.stake / 100; // Converter centavos para dólares
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
      // Não logar erro a cada tick, apenas em caso de timeout crítico
      // A posição continuará sendo gerenciada e fechará no tempo correto
      if (elapsedSeconds % 30 === 0) {
        console.error("[TradingBot] Error checking contract info:", error);
      }
    }
  }

  /**
   * Fecha a posição
   */
  private async closePosition(reason: string, sellPrice?: number): Promise<void> {
    if (!this.currentPositionId || !this.contractId || !this.derivService) return;

    try {
      // Tentar vender contrato se preço fornecido
      if (sellPrice && sellPrice > 0) {
        await this.derivService.sellContract(this.contractId, sellPrice);
      }

      // Obter informações finais do contrato
      const contractInfo = await this.derivService.getContractInfo(this.contractId);
      const finalProfit = contractInfo.profit || 0;
      const exitPrice = contractInfo.exit_tick || contractInfo.current_spot || 0;
      
      // Log detalhado dos valores da DERIV para debug
      await this.logEvent(
        "CONTRACT_CLOSE_DEBUG",
        `[DEBUG FECHAMENTO] Contract ID: ${this.contractId} | profit: ${contractInfo.profit} | sell_price: ${contractInfo.sell_price} | buy_price: ${contractInfo.buy_price} | payout: ${contractInfo.payout} | exit_tick: ${contractInfo.exit_tick} | current_spot: ${contractInfo.current_spot}`
      );

      // Atualizar posição no banco
      const pnlInCents = Math.round(finalProfit * 100);
      await updatePosition(this.currentPositionId, {
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

      // Reset para próximo candle
      this.currentPositionId = null;
      this.contractId = null;
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

