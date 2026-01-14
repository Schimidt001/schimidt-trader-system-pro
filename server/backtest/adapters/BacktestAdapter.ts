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
   * 
   * HOTFIX 2026-01-14: Added detailed logging and error handling
   */
  async loadHistoricalData(dataPath: string, symbol: string, timeframes: string[]): Promise<void> {
    // Resolve to absolute path to avoid issues in production environments (Railway, etc.)
    const absoluteDataPath = path.isAbsolute(dataPath) 
      ? dataPath 
      : path.resolve(process.cwd(), dataPath);
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[BacktestAdapter] 📂 CARREGANDO DADOS HISTÓRICOS");
    console.log(`[BacktestAdapter] Símbolo: ${symbol}`);
    console.log(`[BacktestAdapter] Caminho recebido: ${dataPath}`);
    console.log(`[BacktestAdapter] Caminho absoluto: ${absoluteDataPath}`);
    console.log(`[BacktestAdapter] Diretório existe? ${fs.existsSync(absoluteDataPath) ? "✅ SIM" : "❌ NÃO"}`);
    console.log(`[BacktestAdapter] Período: ${this.config.startDate.toISOString()} - ${this.config.endDate.toISOString()}`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    // Check if directory exists
    if (!fs.existsSync(absoluteDataPath)) {
      const errorMsg = `Diretório de dados não encontrado: ${absoluteDataPath}`;
      console.error(`[BacktestAdapter] ❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    // List files in directory for debugging
    const filesInDir = fs.readdirSync(absoluteDataPath);
    console.log(`[BacktestAdapter] Arquivos no diretório: ${filesInDir.join(", ") || "(vazio)"}`);
    
    if (!this.candleData.has(symbol)) {
      this.candleData.set(symbol, new Map());
    }
    
    let totalBarsLoaded = 0;
    
    for (const tf of timeframes) {
      const fileName = `${symbol}_${tf}.json`;
      const filePath = path.join(absoluteDataPath, fileName);
      
      console.log(`[BacktestAdapter] Tentando ler arquivo: ${filePath}`);
      console.log(`[BacktestAdapter] Arquivo existe? ${fs.existsSync(filePath) ? "✅ SIM" : "❌ NÃO"}`);
      
      if (!fs.existsSync(filePath)) {
        console.warn(`[BacktestAdapter] ⚠️ Arquivo não encontrado: ${fileName}`);
        continue;
      }
      
      try {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const data: HistoricalDataFile = JSON.parse(fileContent);
        
        console.log(`[BacktestAdapter] Arquivo lido com sucesso: ${fileName}`);
        console.log(`[BacktestAdapter] Total de velas no arquivo: ${data.bars?.length || 0}`);
        
        if (!data.bars || data.bars.length === 0) {
          console.warn(`[BacktestAdapter] ⚠️ Arquivo ${fileName} não contém velas`);
          continue;
        }
        
        // Debug: show first and last bar timestamps
        const firstBar = data.bars[0];
        const lastBar = data.bars[data.bars.length - 1];
        
        // Detect if timestamps are in seconds or milliseconds
        // Timestamps in seconds are typically < 10^12, in ms are >= 10^12
        const isMilliseconds = firstBar.timestamp >= 1e12;
        console.log(`[BacktestAdapter] Formato de timestamp: ${isMilliseconds ? "milissegundos" : "segundos"}`);
        console.log(`[BacktestAdapter] Primeira vela: ${new Date(isMilliseconds ? firstBar.timestamp : firstBar.timestamp * 1000).toISOString()}`);
        console.log(`[BacktestAdapter] Última vela: ${new Date(isMilliseconds ? lastBar.timestamp : lastBar.timestamp * 1000).toISOString()}`);
        
        // Filter by date range
        const startTime = this.config.startDate.getTime();
        const endTime = this.config.endDate.getTime();
        
        console.log(`[BacktestAdapter] Filtro - Início: ${new Date(startTime).toISOString()}`);
        console.log(`[BacktestAdapter] Filtro - Fim: ${new Date(endTime).toISOString()}`);
        
        const filteredBars = data.bars.filter(bar => {
          // Handle both seconds and milliseconds timestamps
          const barTime = isMilliseconds ? bar.timestamp : bar.timestamp * 1000;
          return barTime >= startTime && barTime <= endTime;
        });
        
        console.log(`[BacktestAdapter] Velas após filtro de data: ${filteredBars.length}`);
        
        if (filteredBars.length === 0) {
          console.warn(`[BacktestAdapter] ⚠️ ATENÇÃO: Nenhuma vela dentro do período selecionado!`);
          console.warn(`[BacktestAdapter] Período dos dados: ${new Date(isMilliseconds ? firstBar.timestamp : firstBar.timestamp * 1000).toISOString()} - ${new Date(isMilliseconds ? lastBar.timestamp : lastBar.timestamp * 1000).toISOString()}`);
          console.warn(`[BacktestAdapter] Período solicitado: ${this.config.startDate.toISOString()} - ${this.config.endDate.toISOString()}`);
        }
        
        // Normalize timestamps to milliseconds for internal use
        const normalizedBars = filteredBars.map(bar => ({
          ...bar,
          timestamp: isMilliseconds ? bar.timestamp : bar.timestamp * 1000,
        }));
        
        this.candleData.get(symbol)!.set(tf, normalizedBars);
        totalBarsLoaded += normalizedBars.length;
        
        console.log(`[BacktestAdapter] ✅ Carregadas ${normalizedBars.length} velas para ${symbol} ${tf}`);
        
      } catch (error) {
        console.error(`[BacktestAdapter] ❌ Erro ao carregar ${filePath}:`, error);
        throw new Error(`Erro ao carregar dados históricos: ${(error as Error).message}`);
      }
    }
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`[BacktestAdapter] 📊 RESUMO DO CARREGAMENTO`);
    console.log(`[BacktestAdapter] Total de velas carregadas: ${totalBarsLoaded}`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    // CRITICAL: Throw error if no data loaded
    if (totalBarsLoaded === 0) {
      const errorMsg = `Nenhum dado histórico encontrado para ${symbol} no período ${this.config.startDate.toISOString()} - ${this.config.endDate.toISOString()}. Verifique se os dados foram baixados e se o período está correto.`;
      console.error(`[BacktestAdapter] ❌ ${errorMsg}`);
      throw new Error(errorMsg);
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
      timestamp: bar.timestamp, // Already normalized to ms in loadHistoricalData
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
   * 
   * HOTFIX 2026-01-14: Added validation and detailed logging
   */
  async runSimulation(): Promise<{
    trades: BacktestTrade[];
    equityCurve: { timestamp: number; equity: number }[];
    drawdownCurve: { timestamp: number; drawdown: number; drawdownPercent: number }[];
  }> {
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[BacktestAdapter] 🚀 INICIANDO SIMULAÇÃO");
    console.log("═══════════════════════════════════════════════════════════════");
    
    this._connectionState = "CONNECTED";
    
    const symbol = this.config.symbol;
    const primaryTimeframe = this.config.timeframes[0] || "M5";
    
    console.log(`[BacktestAdapter] Símbolo: ${symbol}`);
    console.log(`[BacktestAdapter] Timeframe primário: ${primaryTimeframe}`);
    console.log(`[BacktestAdapter] Caminho dos dados: ${this.config.dataPath}`);
    
    // Load data - this will throw if no data found
    await this.loadHistoricalData(this.config.dataPath, symbol, this.config.timeframes);
    
    // Validate data was loaded
    const symbolData = this.candleData.get(symbol);
    const tfData = symbolData?.get(primaryTimeframe);
    
    if (!tfData || tfData.length === 0) {
      const errorMsg = `Nenhum dado carregado para ${symbol} ${primaryTimeframe}. Verifique se o arquivo existe e contém dados no período selecionado.`;
      console.error(`[BacktestAdapter] ❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    console.log(`[BacktestAdapter] ✅ Dados validados: ${tfData.length} velas disponíveis`);
    
    // Adjust warmup based on available data
    const warmupBars = Math.min(200, Math.floor(tfData.length * 0.1));
    console.log(`[BacktestAdapter] Período de warmup: ${warmupBars} velas`);
    
    for (let i = 0; i < warmupBars; i++) {
      if (!this.advanceBar(symbol, primaryTimeframe)) break;
    }
    
    console.log(`[BacktestAdapter] ✅ Warmup completo. Iniciando simulação principal...`);
    
    // Main simulation loop
    let barCount = 0;
    const startTime = Date.now();
    
    while (this.advanceBar(symbol, primaryTimeframe)) {
      barCount++;
      
      // Log progress every 1000 bars
      if (barCount % 1000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`[BacktestAdapter] Processadas ${barCount} velas em ${elapsed.toFixed(1)}s...`);
      }
    }
    
    // Close any remaining positions
    this.closeAllPositions(TradeExitReason.END_OF_DATA);
    
    const totalTime = (Date.now() - startTime) / 1000;
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[BacktestAdapter] ✅ SIMULAÇÃO CONCLUÍDA");
    console.log(`[BacktestAdapter] Total de velas processadas: ${barCount}`);
    console.log(`[BacktestAdapter] Total de trades: ${this.accountState.closedTrades.length}`);
    console.log(`[BacktestAdapter] Tempo de execução: ${totalTime.toFixed(2)}s`);
    console.log(`[BacktestAdapter] Saldo final: $${this.accountState.balance.toFixed(2)}`);
    console.log("═══════════════════════════════════════════════════════════════");
    
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
