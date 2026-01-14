/**
 * BacktestAdapter - Adapter de Trading para Simulação Offline
 * 
 * Implementa a mesma interface que o CTraderAdapter, mas em vez de
 * conectar via TCP à cTrader, lê dados de arquivos JSON locais e
 * simula a execução de ordens.
 * 
 * IMPORTANTE: Este adapter NÃO altera a lógica de trading dos engines.
 * Ele apenas fornece dados de mercado e simula execução de ordens.
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 1.0.0
 */

import { EventEmitter } from "events";
import * as fs from "fs";
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
  HistoricalDataFile,
} from "../types/backtest.types";
import { ITradingAdapter, SymbolInfo, VolumeSpecs } from "./ITradingAdapter";
import { getPipValue, calculateSpreadPips } from "../../../shared/normalizationUtils";

// ============================================================================
// CONSTANTS
// ============================================================================

const CENTS_PER_LOT = 10_000_000; // 1 lote = 10,000,000 cents (cTrader)

// ============================================================================
// BACKTEST ADAPTER CLASS
// ============================================================================

export class BacktestAdapter extends EventEmitter implements ITradingAdapter {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  
  private _connectionState: ConnectionState = "DISCONNECTED";
  private _userId: number = 0;
  private _botId: number = 1;
  private eventHandlers: BrokerEvents = {};
  
  // Account simulation
  private accountState: SimulatedAccountState;
  
  // Market data
  private candleData: Map<string, Map<string, CandleData[]>> = new Map(); // symbol -> timeframe -> candles
  private currentBarIndex: Map<string, number> = new Map(); // symbol -> current bar index
  private currentTick: Map<string, PriceTick> = new Map(); // symbol -> current tick
  
  // Configuration
  private config: BacktestConfig;
  
  // Callbacks
  private priceCallbacks: Map<string, (tick: PriceTick) => void> = new Map();
  
  // Trade tracking
  private tradeIdCounter: number = 0;
  private positionIdCounter: number = 0;
  
  // Metrics
  private equityCurve: { timestamp: number; equity: number }[] = [];
  private drawdownCurve: { timestamp: number; drawdown: number; drawdownPercent: number }[] = [];
  
  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------
  
  constructor(config: BacktestConfig) {
    super();
    this.config = config;
    
    // Initialize account state
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
    
    console.log(`[BacktestAdapter] Initialized with balance: $${config.initialBalance}`);
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
    console.log(`[BacktestAdapter] User context set: userId=${userId}, botId=${botId}`);
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
    console.log(`[BacktestAdapter] Subscribed to ${symbol} price updates`);
  }
  
  async unsubscribePrice(symbol: string): Promise<void> {
    this.priceCallbacks.delete(symbol);
    console.log(`[BacktestAdapter] Unsubscribed from ${symbol}`);
  }
  
  async getCandleHistory(symbol: string, timeframe: string, count: number): Promise<CandleData[]> {
    const symbolData = this.candleData.get(symbol);
    if (!symbolData) {
      console.warn(`[BacktestAdapter] No data for symbol: ${symbol}`);
      return [];
    }
    
    const tfData = symbolData.get(timeframe);
    if (!tfData) {
      console.warn(`[BacktestAdapter] No data for timeframe: ${timeframe}`);
      return [];
    }
    
    const currentIndex = this.currentBarIndex.get(symbol) || 0;
    const startIndex = Math.max(0, currentIndex - count);
    
    return tfData.slice(startIndex, currentIndex + 1);
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
      return {
        success: false,
        errorMessage: `No price data for ${order.symbol}`,
      };
    }
    
    // Check spread
    const spread = calculateSpreadPips(tick.bid, tick.ask, order.symbol);
    if (maxSpread && spread > maxSpread) {
      return {
        success: false,
        errorMessage: `Spread too high: ${spread.toFixed(2)} pips > ${maxSpread} pips`,
      };
    }
    
    // Calculate execution price with slippage
    const slippagePips = this.config.slippage;
    const pipSize = getPipValue(order.symbol);
    const slippagePrice = slippagePips * pipSize;
    
    let executionPrice: number;
    if (order.direction === "BUY") {
      executionPrice = tick.ask + slippagePrice;
    } else {
      executionPrice = tick.bid - slippagePrice;
    }
    
    // Calculate commission
    const lots = order.lots || 0.01;
    const commission = this.config.commission * lots;
    
    // Create position
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
      unrealizedPnL: -commission, // Start with commission as loss
      commission,
      peakProfit: 0,
      troughLoss: 0,
      comment: order.comment,
    };
    
    this.accountState.openPositions.set(positionId, position);
    
    // Update margin
    const marginRequired = this.calculateMarginRequired(order.symbol, lots);
    this.accountState.margin += marginRequired;
    this.accountState.freeMargin = this.accountState.equity - this.accountState.margin;
    
    console.log(`[BacktestAdapter] Order filled: ${order.direction} ${lots} ${order.symbol} @ ${executionPrice.toFixed(5)}`);
    
    return {
      success: true,
      orderId: positionId,
      executionPrice,
      executionTime: tick.timestamp,
    };
  }
  
  async modifyPosition(params: ModifyPositionParams): Promise<boolean> {
    const position = this.accountState.openPositions.get(params.positionId);
    if (!position) {
      console.warn(`[BacktestAdapter] Position not found: ${params.positionId}`);
      return false;
    }
    
    if (params.stopLoss !== undefined) {
      position.stopLoss = params.stopLoss;
    }
    if (params.takeProfit !== undefined) {
      position.takeProfit = params.takeProfit;
    }
    
    console.log(`[BacktestAdapter] Position modified: ${params.positionId} SL=${position.stopLoss} TP=${position.takeProfit}`);
    return true;
  }
  
  async closePosition(positionId: string): Promise<OrderResult> {
    const position = this.accountState.openPositions.get(positionId);
    if (!position) {
      return {
        success: false,
        errorMessage: `Position not found: ${positionId}`,
      };
    }
    
    const tick = this.currentTick.get(position.symbol);
    if (!tick) {
      return {
        success: false,
        errorMessage: `No price data for ${position.symbol}`,
      };
    }
    
    // Close position
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
        entryPrice: pos.entryPrice,
        currentPrice: pos.currentPrice,
        unrealizedPnL: pos.unrealizedPnL,
        size: pos.volume,
        stopLoss: pos.stopLoss,
        takeProfit: pos.takeProfit,
        openTime: pos.openTime,
        swap: 0,
        commission: pos.commission,
      });
    }
    
    return positions;
  }
  
  async reconcilePositions(): Promise<number> {
    // In backtest mode, positions are always in sync
    return this.accountState.openPositions.size;
  }
  
  // -------------------------------------------------------------------------
  // ITradingAdapter Implementation - Symbol Info
  // -------------------------------------------------------------------------
  
  async getAvailableSymbols(): Promise<string[]> {
    return Array.from(this.candleData.keys());
  }
  
  async getSymbolInfo(symbol: string): Promise<SymbolInfo | null> {
    const pipSize = getPipValue(symbol);
    const digits = symbol.includes("JPY") || symbol === "XAUUSD" ? 2 : 5;
    
    return {
      symbol,
      digits,
      pipSize,
      lotSize: 100000,
      contractSize: 100000,
    };
  }
  
  async getVolumeSpecs(symbol: string): Promise<VolumeSpecs | null> {
    return {
      minVolume: 100000, // 0.01 lots in cents
      maxVolume: 50000000000, // 500 lots in cents
      stepVolume: 100000, // 0.01 lots step
    };
  }
  
  // -------------------------------------------------------------------------
  // ITradingAdapter Implementation - Events
  // -------------------------------------------------------------------------
  
  setEventHandlers(events: BrokerEvents): void {
    this.eventHandlers = { ...this.eventHandlers, ...events };
  }
  
  // -------------------------------------------------------------------------
  // Backtest-Specific Methods
  // -------------------------------------------------------------------------
  
  /**
   * Load historical data from JSON files
   */
  async loadHistoricalData(dataPath: string, symbol: string, timeframes: string[]): Promise<void> {
    console.log(`[BacktestAdapter] Loading data for ${symbol} from ${dataPath}`);
    
    if (!this.candleData.has(symbol)) {
      this.candleData.set(symbol, new Map());
    }
    
    for (const tf of timeframes) {
      const filePath = path.join(dataPath, `${symbol}_${tf}.json`);
      
      if (!fs.existsSync(filePath)) {
        console.warn(`[BacktestAdapter] Data file not found: ${filePath}`);
        continue;
      }
      
      try {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const data: HistoricalDataFile = JSON.parse(fileContent);
        
        // Filter by date range
        const startTime = this.config.startDate.getTime();
        const endTime = this.config.endDate.getTime();
        
        const filteredBars = data.bars.filter(bar => {
          const barTime = bar.timestamp * 1000; // Convert to ms if in seconds
          return barTime >= startTime && barTime <= endTime;
        });
        
        this.candleData.get(symbol)!.set(tf, filteredBars);
        console.log(`[BacktestAdapter] Loaded ${filteredBars.length} bars for ${symbol} ${tf}`);
        
      } catch (error) {
        console.error(`[BacktestAdapter] Error loading ${filePath}:`, error);
      }
    }
    
    // Initialize bar index
    this.currentBarIndex.set(symbol, 0);
  }
  
  /**
   * Advance simulation by one bar
   */
  advanceBar(symbol: string, timeframe: string = "M5"): boolean {
    const symbolData = this.candleData.get(symbol);
    if (!symbolData) return false;
    
    const tfData = symbolData.get(timeframe);
    if (!tfData) return false;
    
    const currentIndex = this.currentBarIndex.get(symbol) || 0;
    const nextIndex = currentIndex + 1;
    
    if (nextIndex >= tfData.length) {
      return false; // End of data
    }
    
    this.currentBarIndex.set(symbol, nextIndex);
    
    // Update current tick from bar
    const bar = tfData[nextIndex];
    const spread = this.config.spread || 0.5;
    const pipSize = getPipValue(symbol);
    const spreadPrice = spread * pipSize;
    
    const tick: PriceTick = {
      symbol,
      bid: bar.close,
      ask: bar.close + spreadPrice,
      timestamp: bar.timestamp * 1000, // Convert to ms
      spread,
    };
    
    this.currentTick.set(symbol, tick);
    
    // Update open positions
    this.updateOpenPositions(tick);
    
    // Check SL/TP
    this.checkStopLossAndTakeProfit(bar);
    
    // Emit tick to callbacks
    const callback = this.priceCallbacks.get(symbol);
    if (callback) {
      callback(tick);
    }
    
    // Record equity curve
    this.recordEquityCurve(tick.timestamp);
    
    return true;
  }
  
  /**
   * Run full backtest simulation
   */
  async runSimulation(): Promise<{
    trades: BacktestTrade[];
    equityCurve: { timestamp: number; equity: number }[];
    drawdownCurve: { timestamp: number; drawdown: number; drawdownPercent: number }[];
  }> {
    console.log("[BacktestAdapter] Starting simulation...");
    
    this._connectionState = "CONNECTED";
    
    const symbol = this.config.symbol;
    const primaryTimeframe = this.config.timeframes[0] || "M5";
    
    // Load data
    await this.loadHistoricalData(this.config.dataPath, symbol, this.config.timeframes);
    
    // Warm-up period (skip first 200 bars for indicators)
    const warmupBars = 200;
    for (let i = 0; i < warmupBars; i++) {
      if (!this.advanceBar(symbol, primaryTimeframe)) break;
    }
    
    console.log(`[BacktestAdapter] Warmup complete. Starting main simulation...`);
    
    // Main simulation loop
    let barCount = 0;
    while (this.advanceBar(symbol, primaryTimeframe)) {
      barCount++;
      
      // Log progress every 1000 bars
      if (barCount % 1000 === 0) {
        console.log(`[BacktestAdapter] Processed ${barCount} bars...`);
      }
    }
    
    // Close any remaining positions
    this.closeAllPositions(TradeExitReason.END_OF_DATA);
    
    console.log(`[BacktestAdapter] Simulation complete. Total bars: ${barCount}`);
    console.log(`[BacktestAdapter] Total trades: ${this.accountState.closedTrades.length}`);
    
    this._connectionState = "DISCONNECTED";
    
    return {
      trades: this.accountState.closedTrades,
      equityCurve: this.equityCurve,
      drawdownCurve: this.drawdownCurve,
    };
  }
  
  /**
   * Get current account state
   */
  getAccountState(): SimulatedAccountState {
    return this.accountState;
  }
  
  /**
   * Get closed trades
   */
  getClosedTrades(): BacktestTrade[] {
    return this.accountState.closedTrades;
  }
  
  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------
  
  private updateOpenPositions(tick: PriceTick): void {
    for (const [id, position] of this.accountState.openPositions) {
      if (position.symbol !== tick.symbol) continue;
      
      position.currentPrice = position.direction === "BUY" ? tick.bid : tick.ask;
      
      // Calculate P&L
      const pipSize = getPipValue(position.symbol);
      const priceDiff = position.direction === "BUY"
        ? position.currentPrice - position.entryPrice
        : position.entryPrice - position.currentPrice;
      
      const pips = priceDiff / pipSize;
      const pipValue = this.calculatePipValue(position.symbol, position.volume);
      
      position.unrealizedPnL = (pips * pipValue) - position.commission;
      
      // Track peak/trough
      if (position.unrealizedPnL > position.peakProfit) {
        position.peakProfit = position.unrealizedPnL;
      }
      if (position.unrealizedPnL < position.troughLoss) {
        position.troughLoss = position.unrealizedPnL;
      }
    }
    
    // Update account equity
    let totalUnrealizedPnL = 0;
    for (const position of this.accountState.openPositions.values()) {
      totalUnrealizedPnL += position.unrealizedPnL;
    }
    
    this.accountState.equity = this.accountState.balance + totalUnrealizedPnL;
    this.accountState.freeMargin = this.accountState.equity - this.accountState.margin;
    
    // Update peak equity and drawdown
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
        // Check Stop Loss (price went below SL)
        if (position.stopLoss && bar.low <= position.stopLoss) {
          positionsToClose.push({ id, reason: TradeExitReason.STOP_LOSS, price: position.stopLoss });
        }
        // Check Take Profit (price went above TP)
        else if (position.takeProfit && bar.high >= position.takeProfit) {
          positionsToClose.push({ id, reason: TradeExitReason.TAKE_PROFIT, price: position.takeProfit });
        }
      } else {
        // SELL position
        // Check Stop Loss (price went above SL)
        if (position.stopLoss && bar.high >= position.stopLoss) {
          positionsToClose.push({ id, reason: TradeExitReason.STOP_LOSS, price: position.stopLoss });
        }
        // Check Take Profit (price went below TP)
        else if (position.takeProfit && bar.low <= position.takeProfit) {
          positionsToClose.push({ id, reason: TradeExitReason.TAKE_PROFIT, price: position.takeProfit });
        }
      }
    }
    
    // Close positions
    for (const { id, reason, price } of positionsToClose) {
      const position = this.accountState.openPositions.get(id);
      if (position) {
        this.closePositionInternal(position, price, bar.timestamp * 1000, reason);
      }
    }
  }
  
  private closePositionInternal(
    position: SimulatedPosition,
    exitPrice: number,
    exitTime: number,
    exitReason: TradeExitReason
  ): void {
    // Calculate final P&L
    const pipSize = getPipValue(position.symbol);
    const priceDiff = position.direction === "BUY"
      ? exitPrice - position.entryPrice
      : position.entryPrice - exitPrice;
    
    const pips = priceDiff / pipSize;
    const pipValue = this.calculatePipValue(position.symbol, position.volume);
    const grossProfit = pips * pipValue;
    const netProfit = grossProfit - position.commission;
    
    // Create trade record
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
    
    // Update balance
    this.accountState.balance += netProfit;
    
    // Release margin
    const marginRequired = this.calculateMarginRequired(position.symbol, position.volume);
    this.accountState.margin -= marginRequired;
    
    // Remove position
    this.accountState.openPositions.delete(position.id);
    
    console.log(`[BacktestAdapter] Position closed: ${position.direction} ${position.symbol} | P&L: $${netProfit.toFixed(2)} (${pips.toFixed(1)} pips) | Reason: ${exitReason}`);
  }
  
  private closeAllPositions(reason: TradeExitReason): void {
    for (const [id, position] of this.accountState.openPositions) {
      const tick = this.currentTick.get(position.symbol);
      if (tick) {
        const exitPrice = position.direction === "BUY" ? tick.bid : tick.ask;
        this.closePositionInternal(position, exitPrice, tick.timestamp, reason);
      }
    }
  }
  
  private calculatePipValue(symbol: string, lots: number): number {
    // Simplified pip value calculation
    // For most pairs: 1 pip = $10 per standard lot
    // For JPY pairs: 1 pip = ~$9 per standard lot (varies with exchange rate)
    // For XAUUSD: 1 pip = $10 per standard lot
    
    const basePipValue = 10; // USD per pip per standard lot
    return basePipValue * lots;
  }
  
  private calculateMarginRequired(symbol: string, lots: number): number {
    // Simplified margin calculation
    const contractSize = 100000;
    const leverage = this.config.leverage;
    return (lots * contractSize) / leverage;
  }
  
  private recordEquityCurve(timestamp: number): void {
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
}
