/**
 * BacktestAdapterOptimized - Adapter de Trading Otimizado para Memória
 * 
 * CORREÇÃO OOM: Versão otimizada do BacktestAdapter que:
 * - Usa cache compartilhado de candles (CandleDataCache)
 * - Não duplica arrays de candles por combinação
 * - Mantém apenas referências aos dados do cache
 * - Libera memória agressivamente após uso
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 2.0.0 - Memory Optimized
 */

import { EventEmitter } from "events";
import * as path from "path";
import {
  AccountInfo,
  PriceTick,
  CandleData,
  OrderRequest,
  OrderResult,
  ModifyPositionParams,
  OpenPosition,
  ConnectionState,
  BrokerEvents,
} from "../../adapters/IBrokerAdapter";
import {
  BacktestConfig,
  BacktestTrade,
  SimulatedAccountState,
  SimulatedPosition,
  TradeExitReason,
} from "../types/backtest.types";
import { ITradingAdapter, SymbolInfo, VolumeSpecs } from "./ITradingAdapter";
import { getPipValue, calculateSpreadPips } from "../../../shared/normalizationUtils";
import { backtestLogger } from "../utils/LabLogger";
import { candleDataCache } from "../utils/CandleDataCache";

// ============================================================================
// CONSTANTS
// ============================================================================

const CENTS_PER_LOT = 10_000_000;

const TIMEFRAME_DURATION_MS: Record<string, number> = {
  "M1": 60 * 1000,
  "M5": 5 * 60 * 1000,
  "M15": 15 * 60 * 1000,
  "M30": 30 * 60 * 1000,
  "H1": 60 * 60 * 1000,
  "H4": 4 * 60 * 60 * 1000,
  "D1": 24 * 60 * 60 * 1000,
};

// ============================================================================
// BACKTEST ADAPTER OPTIMIZED CLASS
// ============================================================================

export class BacktestAdapterOptimized extends EventEmitter implements ITradingAdapter {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  
  private _connectionState: ConnectionState = "DISCONNECTED";
  private _userId: number = 0;
  private _botId: number = 1;
  private eventHandlers: BrokerEvents = {};
  
  // Account simulation
  private accountState: SimulatedAccountState;
  
  // CORREÇÃO OOM: Não armazenamos candles aqui, usamos referências do cache
  // Apenas mantemos índices e metadados
  private candleRefs: Map<string, Map<string, { candles: CandleData[]; currentIndex: number }>> = new Map();
  
  private currentSimulatedTimestamp: number = 0;
  private currentTick: Map<string, PriceTick> = new Map();
  
  // Configuration
  private config: BacktestConfig;
  
  // Callbacks
  private priceCallbacks: Map<string, (tick: PriceTick) => void> = new Map();
  
  // Trade tracking
  private tradeIdCounter: number = 0;
  private positionIdCounter: number = 0;
  
  // Metrics (limitados para economizar memória)
  private equityCurve: { timestamp: number; equity: number }[] = [];
  private drawdownCurve: { timestamp: number; drawdown: number; drawdownPercent: number }[] = [];
  private readonly MAX_CURVE_POINTS = 500; // Limitar pontos para economizar memória
  
  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------
  
  constructor(config: BacktestConfig) {
    super();
    this.config = config;
    
    this.accountState = {
      balance: config.initialBalance,
      equity: config.initialBalance,
      margin: 0,
      freeMargin: config.initialBalance,
      openPositions: new Map(),
      closedTrades: [],
      peakEquity: config.initialBalance,
      currentDrawdown: 0,
    };
    
    backtestLogger.debug(`BacktestAdapterOptimized initialized with balance: $${config.initialBalance}`, "BacktestAdapterOpt");
  }
  
  // -------------------------------------------------------------------------
  // ITradingAdapter Implementation - Connection
  // -------------------------------------------------------------------------
  
  get connectionState(): ConnectionState {
    return this._connectionState;
  }
  
  isConnected(): boolean {
    return this._connectionState === "CONNECTED" || this._connectionState === "AUTHENTICATED";
  }
  
  setUserContext(userId: number, botId: number): void {
    this._userId = userId;
    this._botId = botId;
  }
  
  // -------------------------------------------------------------------------
  // ITradingAdapter Implementation - Account
  // -------------------------------------------------------------------------
  
  async getAccountInfo(): Promise<AccountInfo> {
    return {
      accountId: "BACKTEST_ACCOUNT",
      balance: this.accountState.balance,
      equity: this.accountState.equity,
      currency: "USD",
      accountType: "demo",
      isDemo: true,
      leverage: this.config.leverage,
      accountName: "Backtest Simulation",
    };
  }
  
  // -------------------------------------------------------------------------
  // ITradingAdapter Implementation - Market Data
  // -------------------------------------------------------------------------
  
  async subscribePrice(symbol: string, callback: (tick: PriceTick) => void): Promise<void> {
    this.priceCallbacks.set(symbol, callback);
  }
  
  async unsubscribePrice(symbol: string): Promise<void> {
    this.priceCallbacks.delete(symbol);
  }
  
  /**
   * CORREÇÃO OOM: getCandleHistory usa referências do cache
   */
  async getCandleHistory(symbol: string, timeframe: string, count: number): Promise<CandleData[]> {
    const symbolRefs = this.candleRefs.get(symbol);
    if (!symbolRefs) return [];
    
    const tfRef = symbolRefs.get(timeframe);
    if (!tfRef || tfRef.candles.length === 0) return [];
    
    const currentIndex = tfRef.currentIndex;
    const startIndex = Math.max(0, currentIndex - count + 1);
    const endIndex = currentIndex + 1;
    
    return tfRef.candles.slice(startIndex, endIndex);
  }
  
  async getPrice(symbol: string): Promise<PriceTick> {
    const tick = this.currentTick.get(symbol);
    if (!tick) {
      throw new Error(`No price data for symbol: ${symbol}`);
    }
    return tick;
  }
  
  // -------------------------------------------------------------------------
  // ITradingAdapter Implementation - Orders
  // -------------------------------------------------------------------------
  
  async placeOrder(order: OrderRequest, maxSpread?: number): Promise<OrderResult> {
    const tick = this.currentTick.get(order.symbol);
    if (!tick) {
      return { success: false, errorMessage: `No price data for ${order.symbol}` };
    }
    
    const spread = calculateSpreadPips(tick.bid, tick.ask, order.symbol);
    if (maxSpread && spread > maxSpread) {
      return { success: false, errorMessage: `Spread too high: ${spread.toFixed(2)} pips > ${maxSpread} pips` };
    }
    
    const slippagePips = this.config.slippage;
    const pipSize = getPipValue(order.symbol);
    const slippagePrice = slippagePips * pipSize;
    
    let executionPrice: number;
    if (order.direction === "BUY") {
      executionPrice = tick.ask + slippagePrice;
    } else {
      executionPrice = tick.bid - slippagePrice;
    }
    
    const lots = order.lots || 0.01;
    const commission = this.config.commission * lots;
    
    const positionId = `BT_POS_${++this.positionIdCounter}`;
    const position: SimulatedPosition = {
      id: positionId,
      symbol: order.symbol,
      direction: order.direction,
      entryPrice: executionPrice,
      currentPrice: executionPrice,
      volume: lots,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      openTime: tick.timestamp,
      unrealizedPnL: -commission,
      commission,
      peakProfit: 0,
      troughLoss: 0,
      comment: order.comment,
    };
    
    this.accountState.openPositions.set(positionId, position);
    
    const marginRequired = this.calculateMarginRequired(order.symbol, lots);
    this.accountState.margin += marginRequired;
    this.accountState.freeMargin = this.accountState.equity - this.accountState.margin;
    
    return {
      success: true,
      orderId: positionId,
      executionPrice,
      executionTime: tick.timestamp,
    };
  }
  
  async modifyPosition(params: ModifyPositionParams): Promise<boolean> {
    const position = this.accountState.openPositions.get(params.positionId);
    if (!position) return false;
    
    if (params.stopLoss !== undefined) position.stopLoss = params.stopLoss;
    if (params.takeProfit !== undefined) position.takeProfit = params.takeProfit;
    
    return true;
  }
  
  async closePosition(positionId: string): Promise<OrderResult> {
    const position = this.accountState.openPositions.get(positionId);
    if (!position) {
      return { success: false, errorMessage: `Position not found: ${positionId}` };
    }
    
    const tick = this.currentTick.get(position.symbol);
    if (!tick) {
      return { success: false, errorMessage: `No price data for ${position.symbol}` };
    }
    
    const exitPrice = position.direction === "BUY" ? tick.bid : tick.ask;
    this.closePositionInternal(position, exitPrice, tick.timestamp, TradeExitReason.MANUAL);
    
    return {
      success: true,
      orderId: positionId,
      executionPrice: exitPrice,
      executionTime: tick.timestamp,
    };
  }
  
  // -------------------------------------------------------------------------
  // ITradingAdapter Implementation - Positions
  // -------------------------------------------------------------------------
  
  async getOpenPositions(): Promise<OpenPosition[]> {
    const positions: OpenPosition[] = [];
    
    for (const [id, pos] of this.accountState.openPositions) {
      positions.push({
        positionId: id,
        symbol: pos.symbol,
        direction: pos.direction,
        size: pos.volume,
        entryPrice: pos.entryPrice,
        currentPrice: pos.currentPrice,
        stopLoss: pos.stopLoss,
        takeProfit: pos.takeProfit,
        unrealizedPnL: pos.unrealizedPnL,
        commission: pos.commission,
        openTime: pos.openTime,
      });
    }
    
    return positions;
  }
  
  // -------------------------------------------------------------------------
  // ITradingAdapter Implementation - Symbol Info
  // -------------------------------------------------------------------------
  
  async getSymbolInfo(symbol: string): Promise<SymbolInfo | null> {
    return {
      symbol,
      digits: symbol.includes("JPY") ? 3 : 5,
      pipSize: getPipValue(symbol),
      lotSize: 100000,
      contractSize: 100000,
      minVolume: 100000, // 0.01 lots in cents
      maxVolume: 10000000000, // 100 lots in cents
      stepVolume: 100000, // 0.01 lots step
    };
  }
  
  async getVolumeSpecs(symbol: string): Promise<VolumeSpecs> {
    return {
      minVolume: 100000,
      maxVolume: 50000000000,
      stepVolume: 100000,
    };
  }
  
  getRealMinVolume(symbol: string): number {
    return 0.01;
  }
  
  /**
   * Reconcilia posições - em backtest sempre retorna 0
   */
  async reconcilePositions(): Promise<number> {
    return 0;
  }
  
  /**
   * Obtém símbolos disponíveis - em backtest retorna o símbolo configurado
   */
  async getAvailableSymbols(): Promise<string[]> {
    return Array.from(this.candleRefs.keys());
  }
  
  // -------------------------------------------------------------------------
  // ITradingAdapter Implementation - Events
  // -------------------------------------------------------------------------
  
  setEventHandlers(events: BrokerEvents): void {
    this.eventHandlers = { ...this.eventHandlers, ...events };
  }
  
  // -------------------------------------------------------------------------
  // Backtest-Specific Methods - OTIMIZADO
  // -------------------------------------------------------------------------
  
  /**
   * CORREÇÃO OOM: Carrega dados usando o cache compartilhado
   * Não duplica arrays, apenas mantém referências
   */
  async loadHistoricalData(dataPath: string, symbol: string, timeframes: string[]): Promise<void> {
    backtestLogger.startOperation("Carregamento de Dados (Otimizado)", {
      simbolo: symbol,
      caminho: dataPath,
    });
    
    if (!this.candleRefs.has(symbol)) {
      this.candleRefs.set(symbol, new Map());
    }
    
    const symbolRefs = this.candleRefs.get(symbol)!;
    let totalBarsLoaded = 0;
    const loadedTimeframes: string[] = [];
    
    for (const tf of timeframes) {
      // CORREÇÃO OOM: Usar cache compartilhado em vez de carregar novamente
      const candles = candleDataCache.getOrLoad(
        dataPath,
        symbol,
        tf,
        this.config.startDate,
        this.config.endDate
      );
      
      if (candles.length === 0) {
        backtestLogger.warn(`Nenhum dado para ${symbol} ${tf}`, "BacktestAdapterOpt");
        continue;
      }
      
      // Armazenar apenas referência, não cópia
      symbolRefs.set(tf, {
        candles, // Referência ao array do cache
        currentIndex: 0,
      });
      
      totalBarsLoaded += candles.length;
      loadedTimeframes.push(tf);
      
      backtestLogger.debug(`Referência criada: ${symbol} ${tf} (${candles.length} candles)`, "BacktestAdapterOpt");
    }
    
    backtestLogger.endOperation("Carregamento de Dados (Otimizado)", true, {
      velas: totalBarsLoaded,
      timeframes: loadedTimeframes.join(", "),
    });
    
    if (totalBarsLoaded === 0) {
      throw new Error(`Nenhum dado histórico encontrado para ${symbol}`);
    }
    
    // Inicializar timestamp simulado
    const primaryTf = timeframes[0] || "M5";
    const primaryRef = symbolRefs.get(primaryTf);
    if (primaryRef && primaryRef.candles.length > 0) {
      this.currentSimulatedTimestamp = primaryRef.candles[0].timestamp;
    }
  }
  
  /**
   * Avança a simulação por uma barra
   */
  advanceBar(symbol: string, timeframe: string = "M5"): boolean {
    const symbolRefs = this.candleRefs.get(symbol);
    if (!symbolRefs) return false;
    
    const tfRef = symbolRefs.get(timeframe);
    if (!tfRef) return false;
    
    const nextIndex = tfRef.currentIndex + 1;
    
    if (nextIndex >= tfRef.candles.length) {
      return false;
    }
    
    tfRef.currentIndex = nextIndex;
    
    const bar = tfRef.candles[nextIndex];
    this.currentSimulatedTimestamp = bar.timestamp;
    
    // Sincronizar índices de outros timeframes
    this.synchronizeTimeframeIndices(symbol, this.currentSimulatedTimestamp);
    
    // Atualizar tick
    const spread = this.config.spread || 0.5;
    const pipSize = getPipValue(symbol);
    const spreadPrice = spread * pipSize;
    
    const tick: PriceTick = {
      symbol,
      bid: bar.close,
      ask: bar.close + spreadPrice,
      timestamp: bar.timestamp,
      spread,
    };
    
    this.currentTick.set(symbol, tick);
    
    // Atualizar posições
    this.updateOpenPositions(tick);
    
    // Verificar SL/TP
    this.checkStopLossAndTakeProfit(bar);
    
    // Emitir eventos
    const callback = this.priceCallbacks.get(symbol);
    if (callback) callback(tick);
    
    if (this.eventHandlers.onPriceTick) {
      this.eventHandlers.onPriceTick(tick);
    }
    
    this.emit("tick", tick);
    this.emit("bar", bar);
    
    // Registrar equity curve (com amostragem para economizar memória)
    this.recordEquityCurve(tick.timestamp);
    
    return true;
  }
  
  /**
   * Sincroniza índices de todos os timeframes com o timestamp atual
   */
  private synchronizeTimeframeIndices(symbol: string, currentTimestamp: number): void {
    const symbolRefs = this.candleRefs.get(symbol);
    if (!symbolRefs) return;
    
    for (const [tf, tfRef] of symbolRefs) {
      let newIndex = tfRef.currentIndex;
      
      while (newIndex + 1 < tfRef.candles.length) {
        const nextCandle = tfRef.candles[newIndex + 1];
        if (nextCandle.timestamp <= currentTimestamp) {
          newIndex++;
        } else {
          break;
        }
      }
      
      tfRef.currentIndex = newIndex;
    }
  }
  
  /**
   * Obtém total de barras disponíveis
   */
  getTotalBars(symbol: string, timeframe: string = "M5"): number {
    const symbolRefs = this.candleRefs.get(symbol);
    if (!symbolRefs) return 0;
    const tfRef = symbolRefs.get(timeframe);
    return tfRef?.candles.length || 0;
  }
  
  /**
   * Obtém índice atual da barra
   */
  getCurrentBarIndex(symbol: string, timeframe: string = "M5"): number {
    const symbolRefs = this.candleRefs.get(symbol);
    if (!symbolRefs) return 0;
    const tfRef = symbolRefs.get(timeframe);
    return tfRef?.currentIndex || 0;
  }
  
  /**
   * Obtém timestamp simulado atual
   */
  getCurrentSimulatedTimestamp(): number {
    return this.currentSimulatedTimestamp;
  }
  
  /**
   * Obtém estado da conta
   */
  getAccountState(): SimulatedAccountState {
    return this.accountState;
  }
  
  /**
   * Obtém trades fechados
   */
  getClosedTrades(): BacktestTrade[] {
    return this.accountState.closedTrades;
  }
  
  /**
   * CORREÇÃO OOM: Limpa referências e libera memória
   */
  cleanup(): void {
    this.candleRefs.clear();
    this.currentTick.clear();
    this.priceCallbacks.clear();
    this.equityCurve = [];
    this.drawdownCurve = [];
    this.accountState.openPositions.clear();
    // Não limpar closedTrades pois são necessários para métricas
    
    backtestLogger.debug("BacktestAdapterOptimized cleanup concluído", "BacktestAdapterOpt");
  }
  
  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------
  
  private updateOpenPositions(tick: PriceTick): void {
    for (const [id, position] of this.accountState.openPositions) {
      if (position.symbol !== tick.symbol) continue;
      
      position.currentPrice = position.direction === "BUY" ? tick.bid : tick.ask;
      
      const pipSize = getPipValue(position.symbol);
      const priceDiff = position.direction === "BUY"
        ? position.currentPrice - position.entryPrice
        : position.entryPrice - position.currentPrice;
      
      const pips = priceDiff / pipSize;
      const pipValue = this.calculatePipValue(position.symbol, position.volume);
      
      position.unrealizedPnL = (pips * pipValue) - position.commission;
      
      if (position.unrealizedPnL > position.peakProfit) {
        position.peakProfit = position.unrealizedPnL;
      }
      if (position.unrealizedPnL < position.troughLoss) {
        position.troughLoss = position.unrealizedPnL;
      }
    }
    
    let totalUnrealizedPnL = 0;
    for (const position of this.accountState.openPositions.values()) {
      totalUnrealizedPnL += position.unrealizedPnL;
    }
    
    this.accountState.equity = this.accountState.balance + totalUnrealizedPnL;
    this.accountState.freeMargin = this.accountState.equity - this.accountState.margin;
    
    if (this.accountState.equity > this.accountState.peakEquity) {
      this.accountState.peakEquity = this.accountState.equity;
    }
    
    this.accountState.currentDrawdown = this.accountState.peakEquity - this.accountState.equity;
  }
  
  private checkStopLossAndTakeProfit(bar: CandleData): void {
    const positionsToClose: { id: string; reason: TradeExitReason; price: number }[] = [];
    
    for (const [id, position] of this.accountState.openPositions) {
      if (position.symbol !== bar.symbol) continue;
      
      if (position.direction === "BUY") {
        if (position.stopLoss && bar.low <= position.stopLoss) {
          positionsToClose.push({ id, reason: TradeExitReason.STOP_LOSS, price: position.stopLoss });
        } else if (position.takeProfit && bar.high >= position.takeProfit) {
          positionsToClose.push({ id, reason: TradeExitReason.TAKE_PROFIT, price: position.takeProfit });
        }
      } else {
        if (position.stopLoss && bar.high >= position.stopLoss) {
          positionsToClose.push({ id, reason: TradeExitReason.STOP_LOSS, price: position.stopLoss });
        } else if (position.takeProfit && bar.low <= position.takeProfit) {
          positionsToClose.push({ id, reason: TradeExitReason.TAKE_PROFIT, price: position.takeProfit });
        }
      }
    }
    
    for (const { id, reason, price } of positionsToClose) {
      const position = this.accountState.openPositions.get(id);
      if (position) {
        this.closePositionInternal(position, price, bar.timestamp, reason);
      }
    }
  }
  
  private closePositionInternal(
    position: SimulatedPosition,
    exitPrice: number,
    exitTime: number,
    exitReason: TradeExitReason
  ): void {
    const pipSize = getPipValue(position.symbol);
    const priceDiff = position.direction === "BUY"
      ? exitPrice - position.entryPrice
      : position.entryPrice - exitPrice;
    
    const pips = priceDiff / pipSize;
    const pipValue = this.calculatePipValue(position.symbol, position.volume);
    const grossProfit = pips * pipValue;
    const netProfit = grossProfit - position.commission;
    
    const trade: BacktestTrade = {
      id: `BT_TRADE_${++this.tradeIdCounter}`,
      symbol: position.symbol,
      strategy: this.config.strategy,
      side: position.direction,
      entryTime: position.openTime,
      exitTime,
      entryPrice: position.entryPrice,
      exitPrice,
      volume: position.volume,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      profit: grossProfit,
      profitPips: pips,
      commission: position.commission,
      swap: 0,
      netProfit,
      maxDrawdown: Math.abs(position.troughLoss),
      maxRunup: position.peakProfit,
      holdingPeriod: exitTime - position.openTime,
      exitReason,
      comment: position.comment,
    };
    
    this.accountState.closedTrades.push(trade);
    this.accountState.balance += netProfit;
    
    const marginReleased = this.calculateMarginRequired(position.symbol, position.volume);
    this.accountState.margin -= marginReleased;
    
    this.accountState.openPositions.delete(position.id);
  }
  
  private calculateMarginRequired(symbol: string, lots: number): number {
    const contractSize = 100000;
    const leverage = this.config.leverage;
    return (lots * contractSize) / leverage;
  }
  
  private calculatePipValue(symbol: string, lots: number): number {
    const contractSize = 100000;
    const pipSize = getPipValue(symbol);
    
    if (symbol.endsWith("USD")) {
      return lots * contractSize * pipSize;
    } else if (symbol.startsWith("USD")) {
      return lots * contractSize * pipSize;
    } else {
      return lots * contractSize * pipSize;
    }
  }
  
  /**
   * CORREÇÃO OOM: Registra equity curve com amostragem
   */
  private recordEquityCurve(timestamp: number): void {
    // Amostrar para economizar memória
    if (this.equityCurve.length >= this.MAX_CURVE_POINTS) {
      // Manter apenas 1 a cada 2 pontos
      this.equityCurve = this.equityCurve.filter((_, i) => i % 2 === 0);
      this.drawdownCurve = this.drawdownCurve.filter((_, i) => i % 2 === 0);
    }
    
    this.equityCurve.push({
      timestamp,
      equity: this.accountState.equity,
    });
    
    const drawdownPercent = this.accountState.peakEquity > 0
      ? (this.accountState.currentDrawdown / this.accountState.peakEquity) * 100
      : 0;
    
    this.drawdownCurve.push({
      timestamp,
      drawdown: this.accountState.currentDrawdown,
      drawdownPercent,
    });
  }
  
  /**
   * Fecha todas as posições abertas
   */
  closeAllPositions(reason: TradeExitReason = TradeExitReason.END_OF_DATA): void {
    const positionIds = Array.from(this.accountState.openPositions.keys());
    
    for (const positionId of positionIds) {
      const position = this.accountState.openPositions.get(positionId);
      if (position) {
        const tick = this.currentTick.get(position.symbol);
        if (tick) {
          const exitPrice = position.direction === "BUY" ? tick.bid : tick.ask;
          this.closePositionInternal(position, exitPrice, tick.timestamp, reason);
        }
      }
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createBacktestAdapterOptimized(config: BacktestConfig): BacktestAdapterOptimized {
  return new BacktestAdapterOptimized(config);
}
