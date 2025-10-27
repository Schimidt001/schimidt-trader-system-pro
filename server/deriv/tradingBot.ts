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
  private currentCandleStartTime: Date | null = null;
  
  // Dados da predição
  private prediction: PredictionResponse | null = null;
  private trigger: number = 0;
  private pipSize: number = 0.01;
  
  // Posição atual
  private currentPositionId: number | null = null;
  private contractId: string | null = null;
  
  // Configurações
  private symbol: string = "R_100";
  private stake: number = 1000; // em centavos
  private stopDaily: number = 10000;
  private takeDaily: number = 50000;
  private lookback: number = 100;
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
      this.state = "COLLECTING";
      await this.updateBotState();
      await this.logEvent("BOT_STARTED", `Bot iniciado em modo ${this.mode} para ${this.symbol}`);

      // Iniciar coleta de dados
      await this.startDataCollection();
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

    // Inscrever-se em ticks para atualização em tempo real
    this.derivService.subscribeTicks(this.symbol, (tick: DerivTick) => {
      this.handleTick(tick);
    });
  }

  /**
   * Trata cada tick recebido
   */
  private async handleTick(tick: DerivTick): Promise<void> {
    if (!this.isRunning) return;

    const tickTime = new Date(tick.epoch * 1000);
    const candleTimestamp = Math.floor(tick.epoch / 900) * 900; // Arredondar para M15

    // Novo candle?
    if (candleTimestamp !== this.currentCandleTimestamp) {
      // Fechar candle anterior
      if (this.currentCandleTimestamp > 0) {
        await this.closeCurrentCandle();
      }

      // Iniciar novo candle
      this.currentCandleTimestamp = candleTimestamp;
      this.currentCandleOpen = tick.quote;
      this.currentCandleHigh = tick.quote;
      this.currentCandleLow = tick.quote;
      this.currentCandleStartTime = new Date(candleTimestamp * 1000);
      this.tradesThisCandle.clear();

      this.state = "WAITING_MIDPOINT";
      await this.updateBotState();
    } else {
      // Atualizar candle atual
      this.currentCandleHigh = Math.max(this.currentCandleHigh, tick.quote);
      this.currentCandleLow = Math.min(this.currentCandleLow, tick.quote);
    }

    // Calcular segundos decorridos
    const elapsedSeconds = Math.floor((tick.epoch - this.currentCandleTimestamp));

    // Momento da predição: 8 minutos (480 segundos)
    if (elapsedSeconds >= 480 && this.state === "WAITING_MIDPOINT") {
      await this.makePrediction(elapsedSeconds);
    }

    // Se armado, verificar gatilho
    if (this.state === "ARMED" && this.prediction) {
      await this.checkTrigger(tick.quote);
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
      close: this.currentCandleHigh.toString(), // Último preço como close
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

      // Chamar engine de predição
      this.prediction = await predictionService.predict(request);

      // Calcular gatilho (offset de 16 pontos)
      const offset = 16 * this.pipSize;
      if (this.prediction.direction === "up") {
        this.trigger = this.prediction.predicted_close - offset;
      } else {
        this.trigger = this.prediction.predicted_close + offset;
      }

      await this.logEvent(
        "PREDICTION_MADE",
        `Predição: ${this.prediction.direction} | Close: ${this.prediction.predicted_close} | Gatilho: ${this.trigger} | Fase: ${this.prediction.phase} | Estratégia: ${this.prediction.strategy}`
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
  private async checkTrigger(currentPrice: number): Promise<void> {
    if (!this.prediction || !this.derivService) return;

    let triggered = false;

    if (this.prediction.direction === "up" && currentPrice <= this.trigger) {
      triggered = true;
    } else if (this.prediction.direction === "down" && currentPrice >= this.trigger) {
      triggered = true;
    }

    if (triggered) {
      await this.enterPosition(currentPrice);
    }
  }

  /**
   * Entra na posição
   */
  private async enterPosition(entryPrice: number): Promise<void> {
    if (!this.prediction || !this.derivService) return;

    try {
      const contractType = this.prediction.direction === "up" ? "CALL" : "PUT";
      
      // Comprar contrato na DERIV
      const contract = await this.derivService.buyContract(
        this.symbol,
        contractType,
        this.stake / 100, // Converter centavos para unidade
        1,
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

      this.state = "ENTERED";
      await this.updateBotState();
      await this.logEvent(
        "POSITION_ENTERED",
        `Posição aberta: ${contractType} | Entrada: ${entryPrice} | Stake: ${this.stake / 100} | Contract: ${contract.contract_id}`
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

    try {
      // Obter informações do contrato
      const contractInfo = await this.derivService.getContractInfo(this.contractId);
      
      const payout = contractInfo.payout || 0;
      const currentProfit = contractInfo.profit || 0;
      const sellPrice = contractInfo.sell_price || 0;

      // Verificar early close se lucro >= 90% do payout
      if (currentProfit >= payout * 0.9 && sellPrice > 0) {
        await this.closePosition("Early close - 90% payout atingido", sellPrice);
        return;
      }

      // Fechar 20 segundos antes do fim do candle (900 - 20 = 880)
      if (elapsedSeconds >= 880) {
        await this.closePosition("Fechamento automático 20s antes do fim", sellPrice);
        return;
      }
    } catch (error) {
      console.error("[TradingBot] Error managing position:", error);
      await this.logEvent("ERROR", `Erro ao gerenciar posição: ${error}`);
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

      // Atualizar posição no banco
      await updatePosition(this.currentPositionId, {
        exitPrice: exitPrice.toString(),
        pnl: Math.round(finalProfit * 100), // Converter para centavos
        status: "CLOSED",
        exitTime: new Date(),
      });

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

