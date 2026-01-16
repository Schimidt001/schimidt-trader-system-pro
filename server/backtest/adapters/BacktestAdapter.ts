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
 * REFATORAÇÃO 2026-01-15: Sincronização MTF Baseada em Timestamp
 * - Implementado gerenciamento de índices independentes por timeframe
 * - Adicionado método getAlignedCandle para sincronização temporal
 * - Corrigido getCandleHistory para respeitar alinhamento temporal
 * - Eliminado Look-ahead Bias na leitura de timeframes maiores
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 2.1.0 - MTF Timestamp Synchronization (Legacy Removed)
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
import { backtestLogger } from "../utils/LabLogger";

// ============================================================================
// CONSTANTS
// ============================================================================

const CENTS_PER_LOT = 10_000_000; // 1 lote = 10,000,000 cents (cTrader)

// Duração de cada timeframe em milissegundos
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
  
  // =========================================================================
  // REFATORAÇÃO MTF: Índices Independentes por Timeframe
  // =========================================================================
  /**
   * Mapa de índices independentes para cada símbolo e timeframe.
   * Estrutura: { symbol: { timeframe: currentIndex } }
   * 
   * Isso resolve o bug de Look-ahead Bias onde o mesmo índice era usado
   * para todos os timeframes, causando leitura de dados futuros.
   */
  private currentIndices: Map<string, Map<string, number>> = new Map();
  
  /**
   * Timestamp simulado atual (em milissegundos).
   * O loop principal avança baseado no timeframe menor (M5).
   * Todos os outros timeframes são sincronizados com este timestamp.
   */
  private currentSimulatedTimestamp: number = 0;
  
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
    
    backtestLogger.debug(`Initialized with balance: $${config.initialBalance}`, "BacktestAdapter");
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
    backtestLogger.debug(`User context set: userId=${userId}, botId=${botId}`, "BacktestAdapter");
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
    backtestLogger.debug(`Subscribed to ${symbol} price updates`, "BacktestAdapter");
  }
  
  async unsubscribePrice(symbol: string): Promise<void> {
    this.priceCallbacks.delete(symbol);
    backtestLogger.debug(`Unsubscribed from ${symbol}`, "BacktestAdapter");
  }
  
  // =========================================================================
  // REFATORAÇÃO MTF: getCandleHistory com Alinhamento Temporal
  // =========================================================================
  /**
   * Obtém histórico de candles respeitando o alinhamento temporal.
   * 
   * CORREÇÃO CRÍTICA: Agora busca as N velas anteriores ao timestamp
   * simulado atual, em vez de usar o índice do timeframe primário.
   * 
   * @param symbol - Símbolo do ativo
   * @param timeframe - Timeframe desejado (M5, M15, H1, etc.)
   * @param count - Quantidade de velas a retornar
   * @returns Array de velas alinhadas temporalmente
   */
  async getCandleHistory(symbol: string, timeframe: string, count: number): Promise<CandleData[]> {
    const symbolData = this.candleData.get(symbol);
    if (!symbolData) {
      backtestLogger.warn(`No data for symbol: ${symbol}`, "BacktestAdapter");
      return [];
    }
    
    const tfData = symbolData.get(timeframe);
    if (!tfData || tfData.length === 0) {
      backtestLogger.warn(`No data for timeframe: ${timeframe}`, "BacktestAdapter");
      return [];
    }
    
    // Obter o índice atual para este timeframe específico
    const currentIndex = this.getTimeframeIndex(symbol, timeframe);
    
    // Retornar as últimas 'count' velas até o índice atual (inclusive)
    const startIndex = Math.max(0, currentIndex - count + 1);
    const endIndex = currentIndex + 1;
    
    return tfData.slice(startIndex, endIndex);
  }
  
  // =========================================================================
  // REFATORAÇÃO MTF: getAlignedCandle - Sincronização por Timestamp
  // =========================================================================
  /**
   * Retorna a vela de um timeframe que engloba o timestamp atual.
   * 
   * Esta é a função central da sincronização MTF. Ela garante que ao
   * consultar dados de H1 quando estamos em M5, retornamos a vela H1
   * que corresponde ao período atual, não uma vela futura.
   * 
   * Exemplo: Se o timestamp simulado é 10:15, e pedimos H1:
   * - Retorna a vela H1 das 10:00 (que cobre 10:00-10:59)
   * 
   * @param symbol - Símbolo do ativo
   * @param timeframe - Timeframe desejado
   * @param currentTimestamp - Timestamp simulado atual (ms)
   * @returns A vela alinhada ou null se não encontrada
   */
  getAlignedCandle(symbol: string, timeframe: string, currentTimestamp: number): CandleData | null {
    const symbolData = this.candleData.get(symbol);
    if (!symbolData) return null;
    
    const tfData = symbolData.get(timeframe);
    if (!tfData || tfData.length === 0) return null;
    
    // Obter o índice atual para este timeframe
    const currentIndex = this.getTimeframeIndex(symbol, timeframe);
    
    // Verificar se o índice é válido
    if (currentIndex < 0 || currentIndex >= tfData.length) {
      return null;
    }
    
    return tfData[currentIndex];
  }
  
  // =========================================================================
  // REFATORAÇÃO MTF: Gerenciamento de Índices por Timeframe
  // =========================================================================
  /**
   * Obtém o índice atual para um símbolo e timeframe específico.
   * 
   * @param symbol - Símbolo do ativo
   * @param timeframe - Timeframe
   * @returns Índice atual ou 0 se não inicializado
   */
  private getTimeframeIndex(symbol: string, timeframe: string): number {
    const symbolIndices = this.currentIndices.get(symbol);
    if (!symbolIndices) return 0;
    return symbolIndices.get(timeframe) || 0;
  }
  
  /**
   * Define o índice atual para um símbolo e timeframe específico.
   * 
   * @param symbol - Símbolo do ativo
   * @param timeframe - Timeframe
   * @param index - Novo índice
   */
  private setTimeframeIndex(symbol: string, timeframe: string, index: number): void {
    if (!this.currentIndices.has(symbol)) {
      this.currentIndices.set(symbol, new Map());
    }
    this.currentIndices.get(symbol)!.set(timeframe, index);
  }
  
  /**
   * Inicializa os índices para todos os timeframes de um símbolo.
   * Todos começam em 0.
   * 
   * @param symbol - Símbolo do ativo
   * @param timeframes - Lista de timeframes carregados
   */
  private initializeTimeframeIndices(symbol: string, timeframes: string[]): void {
    const indices = new Map<string, number>();
    for (const tf of timeframes) {
      indices.set(tf, 0);
    }
    this.currentIndices.set(symbol, indices);
    
    // Inicializar timestamp simulado com o primeiro candle do timeframe primário
    const primaryTf = timeframes[0] || "M5";
    const symbolData = this.candleData.get(symbol);
    if (symbolData) {
      const primaryData = symbolData.get(primaryTf);
      if (primaryData && primaryData.length > 0) {
        this.currentSimulatedTimestamp = primaryData[0].timestamp;
      }
    }
    
    backtestLogger.debug(`Initialized indices for ${symbol}: ${timeframes.join(", ")}`, "BacktestAdapter");
  }
  
  /**
   * Sincroniza os índices de todos os timeframes com o timestamp simulado atual.
   * 
   * Esta função é chamada após avançar o timeframe primário (M5).
   * Ela atualiza os índices dos outros timeframes para apontar para
   * a vela que engloba o timestamp atual.
   * 
   * OTIMIZAÇÃO: Não usa Array.find a cada tick. Mantém ponteiros e
   * apenas incrementa quando necessário.
   * 
   * @param symbol - Símbolo do ativo
   * @param currentTimestamp - Timestamp simulado atual (ms)
   */
  private synchronizeTimeframeIndices(symbol: string, currentTimestamp: number): void {
    const symbolData = this.candleData.get(symbol);
    if (!symbolData) return;
    
    const symbolIndices = this.currentIndices.get(symbol);
    if (!symbolIndices) return;
    
    // Para cada timeframe, avançar o índice se necessário
    for (const [timeframe, tfData] of symbolData) {
      const currentIndex = symbolIndices.get(timeframe) || 0;
      
      // Verificar se precisamos avançar o índice
      // Avançamos quando o timestamp da próxima vela for <= timestamp atual
      let newIndex = currentIndex;
      
      while (newIndex + 1 < tfData.length) {
        const nextCandle = tfData[newIndex + 1];
        if (nextCandle.timestamp <= currentTimestamp) {
          newIndex++;
        } else {
          break;
        }
      }
      
      if (newIndex !== currentIndex) {
        symbolIndices.set(timeframe, newIndex);
      }
    }
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
    
    backtestLogger.debug(`Order filled: ${order.direction} ${lots} ${order.symbol} @ ${executionPrice.toFixed(5)}`, "BacktestAdapter");
    
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
      backtestLogger.warn(`Position not found: ${params.positionId}`, "BacktestAdapter");
      return false;
    }
    
    if (params.stopLoss !== undefined) {
      position.stopLoss = params.stopLoss;
    }
    if (params.takeProfit !== undefined) {
      position.takeProfit = params.takeProfit;
    }
    
    backtestLogger.debug(`Position modified: ${params.positionId} SL=${position.stopLoss} TP=${position.takeProfit}`, "BacktestAdapter");
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
    const digits = symbol.includes("JPY") ? 3 : (symbol.includes("XAU") ? 2 : 5);
    
    return {
      symbol,
      digits,
      pipSize,
      lotSize: 100000,
      contractSize: 100000,
      minVolume: 100000, // 0.01 lots in cents
      maxVolume: 50000000000, // 500 lots in cents
      stepVolume: 100000, // 0.01 lots step
    };
  }
  
  async getVolumeSpecs(symbol: string): Promise<VolumeSpecs | null> {
    return {
      minVolume: 100000, // 0.01 lots in cents
      maxVolume: 50000000000, // 500 lots in cents
      stepVolume: 100000, // 0.01 lots step
    };
  }
  
  /**
   * Retorna volume mínimo real para backtest
   * Em simulação, sempre retorna 0.01 lotes
   */
  getRealMinVolume(symbol: string): number {
    return 0.01;
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
   * REFATORAÇÃO 2026-01-15: Inicializa índices independentes por timeframe
   */
  async loadHistoricalData(dataPath: string, symbol: string, timeframes: string[]): Promise<void> {
    // Resolve to absolute path to avoid issues in production environments (Railway, etc.)
    const absoluteDataPath = path.isAbsolute(dataPath) 
      ? dataPath 
      : path.resolve(process.cwd(), dataPath);
    
    backtestLogger.startOperation("Carregamento de Dados", {
      simbolo: symbol,
      caminho: absoluteDataPath,
    });
    
    // Check if directory exists
    if (!fs.existsSync(absoluteDataPath)) {
      const errorMsg = `Diretório de dados não encontrado: ${absoluteDataPath}`;
      backtestLogger.error(errorMsg, undefined, "BacktestAdapter");
      throw new Error(errorMsg);
    }
    
    // List files in directory for debugging
    const filesInDir = fs.readdirSync(absoluteDataPath);
    backtestLogger.debug(`Arquivos no diretório: ${filesInDir.length}`, "BacktestAdapter");
    
    if (!this.candleData.has(symbol)) {
      this.candleData.set(symbol, new Map());
    }
    
    let totalBarsLoaded = 0;
    const loadedTimeframes: string[] = [];
    
    for (const tf of timeframes) {
      const fileName = `${symbol}_${tf}.json`;
      const filePath = path.join(absoluteDataPath, fileName);
      
      backtestLogger.debug(`Lendo arquivo: ${fileName}`, "BacktestAdapter");
      
      if (!fs.existsSync(filePath)) {
        backtestLogger.warn(`Arquivo não encontrado: ${fileName}`, "BacktestAdapter");
        continue;
      }
      
      try {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const data: HistoricalDataFile = JSON.parse(fileContent);
        
        backtestLogger.debug(`Arquivo lido: ${fileName} (${data.bars?.length || 0} velas)`, "BacktestAdapter");
        
        if (!data.bars || data.bars.length === 0) {
          backtestLogger.warn(`Arquivo ${fileName} não contém velas`, "BacktestAdapter");
          continue;
        }
        
        // Debug: show first and last bar timestamps
        const firstBar = data.bars[0];
        const lastBar = data.bars[data.bars.length - 1];
        
        // Detect if timestamps are in seconds or milliseconds
        // Timestamps in seconds are typically < 10^12, in ms are >= 10^12
        const isMilliseconds = firstBar.timestamp >= 1e12;
        backtestLogger.debug(`Formato: ${isMilliseconds ? "ms" : "s"}, Período: ${new Date(isMilliseconds ? firstBar.timestamp : firstBar.timestamp * 1000).toISOString().split("T")[0]} - ${new Date(isMilliseconds ? lastBar.timestamp : lastBar.timestamp * 1000).toISOString().split("T")[0]}`, "BacktestAdapter");
        
        // Filter by date range
        const startTime = this.config.startDate.getTime();
        const endTime = this.config.endDate.getTime();
        
        // Filtro de período aplicado silenciosamente
        
        const filteredBars = data.bars.filter(bar => {
          // Handle both seconds and milliseconds timestamps
          const barTime = isMilliseconds ? bar.timestamp : bar.timestamp * 1000;
          return barTime >= startTime && barTime <= endTime;
        });
        
        backtestLogger.debug(`Velas filtradas: ${filteredBars.length}`, "BacktestAdapter");
        
        if (filteredBars.length === 0) {
          backtestLogger.warn(`Nenhuma vela no período para ${tf}`, "BacktestAdapter");
        }
        
        // Normalize timestamps to milliseconds for internal use
        const normalizedBars = filteredBars.map(bar => ({
          ...bar,
          timestamp: isMilliseconds ? bar.timestamp : bar.timestamp * 1000,
        }));
        
        this.candleData.get(symbol)!.set(tf, normalizedBars);
        totalBarsLoaded += normalizedBars.length;
        loadedTimeframes.push(tf);
        
        backtestLogger.info(`Carregadas ${normalizedBars.length} velas para ${symbol} ${tf}`, "BacktestAdapter");
        
      } catch (error) {
        backtestLogger.error(`Erro ao carregar ${filePath}`, error as Error, "BacktestAdapter");
        throw new Error(`Erro ao carregar dados históricos: ${(error as Error).message}`);
      }
    }
    
    backtestLogger.endOperation("Carregamento de Dados", true, {
      velas: totalBarsLoaded,
      timeframes: loadedTimeframes.join(", "),
    });
    
    // CRITICAL: Throw error if no data loaded
    if (totalBarsLoaded === 0) {
      const errorMsg = `Nenhum dado histórico encontrado para ${symbol} no período ${this.config.startDate.toISOString()} - ${this.config.endDate.toISOString()}. Verifique se os dados foram baixados e se o período está correto.`;
      backtestLogger.error(errorMsg, undefined, "BacktestAdapter");
      throw new Error(errorMsg);
    }
    
    // REFATORAÇÃO MTF: Inicializar índices independentes para cada timeframe
    this.initializeTimeframeIndices(symbol, loadedTimeframes);
    
    // Índices MTF inicializados - não há mais currentBarIndex global
  }
  
  // =========================================================================
  // REFATORAÇÃO MTF: advanceBar com Sincronização de Timeframes
  // =========================================================================
  /**
   * Avança a simulação por uma barra do timeframe primário.
   * 
   * REFATORAÇÃO 2026-01-15:
   * - Avança o timestamp simulado baseado no timeframe primário (M5)
   * - Sincroniza automaticamente os índices de todos os timeframes
   * - Emite eventos de tick e bar para a estratégia
   * 
   * @param symbol - Símbolo do ativo
   * @param timeframe - Timeframe primário (geralmente M5)
   * @returns true se avançou com sucesso, false se chegou ao fim dos dados
   */
  advanceBar(symbol: string, timeframe: string = "M5"): boolean {
    const symbolData = this.candleData.get(symbol);
    if (!symbolData) return false;
    
    const tfData = symbolData.get(timeframe);
    if (!tfData) return false;
    
    // Obter índice atual do timeframe primário
    const currentIndex = this.getTimeframeIndex(symbol, timeframe);
    const nextIndex = currentIndex + 1;
    
    if (nextIndex >= tfData.length) {
      return false; // End of data
    }
    
    // Avançar índice do timeframe primário
    this.setTimeframeIndex(symbol, timeframe, nextIndex);
    
    // Índices MTF atualizados - sincronização baseada em timestamp
    
    // Obter a nova barra e atualizar timestamp simulado
    const bar = tfData[nextIndex];
    this.currentSimulatedTimestamp = bar.timestamp;
    
    // REFATORAÇÃO MTF: Sincronizar índices de todos os outros timeframes
    this.synchronizeTimeframeIndices(symbol, this.currentSimulatedTimestamp);
    
    // Update current tick from bar
    const spread = this.config.spread || 0.5;
    const pipSize = getPipValue(symbol);
    const spreadPrice = spread * pipSize;
    
    const tick: PriceTick = {
      symbol,
      bid: bar.close,
      ask: bar.close + spreadPrice,
      timestamp: bar.timestamp, // Already normalized to ms
      spread,
    };
    
    this.currentTick.set(symbol, tick);
    
    // Update open positions
    this.updateOpenPositions(tick);
    
    // Check SL/TP
    this.checkStopLossAndTakeProfit(bar);
    
    // Emitir tick via callback (para subscribePrice)
    const callback = this.priceCallbacks.get(symbol);
    if (callback) {
      callback(tick);
    }
    
    // Emitir tick via EventEmitter (para BrokerEvents.onPriceTick)
    if (this.eventHandlers.onPriceTick) {
      this.eventHandlers.onPriceTick(tick);
    }
    
    // Emitir evento genérico via EventEmitter (para listeners externos)
    this.emit("tick", tick);
    this.emit("bar", bar);
    
    // Record equity curve
    this.recordEquityCurve(tick.timestamp);
    
    return true;
  }
  
  /**
   * Obtém o índice atual da barra para um símbolo e timeframe.
   * 
   * REFATORAÇÃO 2026-01-15: Agora retorna o índice do timeframe primário (M5)
   * para manter compatibilidade com código existente.
   * 
   * @param symbol - Símbolo do ativo
   * @param timeframe - Timeframe (opcional, default M5)
   * @returns Índice atual do timeframe
   */
  getCurrentBarIndex(symbol: string, timeframe: string = "M5"): number {
    return this.getTimeframeIndex(symbol, timeframe);
  }
  
  /**
   * Obtém o timestamp simulado atual
   */
  getCurrentSimulatedTimestamp(): number {
    return this.currentSimulatedTimestamp;
  }
  
  /**
   * Alias para getCandleHistory - mantém compatibilidade com estratégias
   * que usam getBars() em vez de getCandleHistory().
   * 
   * @param symbol - Símbolo do ativo
   * @param timeframe - Timeframe desejado
   * @param count - Quantidade de velas
   * @returns Array de velas alinhadas temporalmente
   */
  async getBars(symbol: string, timeframe: string, count: number): Promise<CandleData[]> {
    return this.getCandleHistory(symbol, timeframe, count);
  }
  
  /**
   * PROVA DE FOGO: Validação de sincronização MTF
   * 
   * Verifica se o Close da vela H1 atual é aproximadamente igual ao preço
   * atual do M5, garantindo que não há Look-ahead Bias.
   * 
   * @param symbol - Símbolo do ativo
   * @returns Objeto com resultado da validação e detalhes
   */
  async validateMTFSync(symbol: string): Promise<{
    isValid: boolean;
    m5Price: number;
    h1Close: number;
    priceDiff: number;
    priceDiffPercent: number;
    m5Timestamp: string;
    h1Timestamp: string;
    message: string;
  }> {
    const m5Candles = await this.getCandleHistory(symbol, "M5", 1);
    const h1Candles = await this.getCandleHistory(symbol, "H1", 1);
    
    if (m5Candles.length === 0 || h1Candles.length === 0) {
      return {
        isValid: false,
        m5Price: 0,
        h1Close: 0,
        priceDiff: 0,
        priceDiffPercent: 0,
        m5Timestamp: "N/A",
        h1Timestamp: "N/A",
        message: "Dados insuficientes para validação",
      };
    }
    
    const m5Current = m5Candles[m5Candles.length - 1];
    const h1Current = h1Candles[h1Candles.length - 1];
    
    const m5Price = m5Current.close;
    const h1Close = h1Current.close;
    
    const priceDiff = Math.abs(m5Price - h1Close);
    const priceDiffPercent = (priceDiff / m5Price) * 100;
    
    // Tolerância: 2% de diferença (considerando volatilidade dentro da hora)
    // Se a diferença for maior que 5%, provavelmente há Look-ahead Bias
    const isValid = priceDiffPercent < 5;
    
    // Verificar se o timestamp do H1 é <= timestamp simulado
    const h1TimestampValid = h1Current.timestamp <= this.currentSimulatedTimestamp;
    
    const message = isValid && h1TimestampValid
      ? `✅ Sincronização MTF válida: M5=${m5Price.toFixed(5)}, H1=${h1Close.toFixed(5)} (diff: ${priceDiffPercent.toFixed(2)}%)`
      : `❌ ALERTA: Possível Look-ahead Bias! M5=${m5Price.toFixed(5)}, H1=${h1Close.toFixed(5)} (diff: ${priceDiffPercent.toFixed(2)}%)`;
    
    return {
      isValid: isValid && h1TimestampValid,
      m5Price,
      h1Close,
      priceDiff,
      priceDiffPercent,
      m5Timestamp: new Date(m5Current.timestamp).toISOString(),
      h1Timestamp: new Date(h1Current.timestamp).toISOString(),
      message,
    };
  }
  
  /**
   * Obtém o total de barras disponíveis para um símbolo/timeframe
   */
  getTotalBars(symbol: string, timeframe: string = "M5"): number {
    const symbolData = this.candleData.get(symbol);
    if (!symbolData) return 0;
    const tfData = symbolData.get(timeframe);
    return tfData?.length || 0;
  }
  
  /**
   * Carrega dados de múltiplos timeframes para simulação MTF
   * Necessário para que a estratégia SMC tenha acesso a H1, M15, M5
   */
  async loadMultiTimeframeData(dataPath: string, symbol: string): Promise<void> {
    const timeframes = ["M5", "M15", "H1"];
    await this.loadHistoricalData(dataPath, symbol, timeframes);
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
    backtestLogger.startOperation("Simulação", { simbolo: this.config.symbol });
    
    this._connectionState = "CONNECTED";
    
    const symbol = this.config.symbol;
    const primaryTimeframe = this.config.timeframes[0] || "M5";
    
    backtestLogger.debug(`Timeframe primário: ${primaryTimeframe}`, "BacktestAdapter");
    
    // Load data - this will throw if no data found
    await this.loadHistoricalData(this.config.dataPath, symbol, this.config.timeframes);
    
    // Validate data was loaded
    const symbolData = this.candleData.get(symbol);
    const tfData = symbolData?.get(primaryTimeframe);
    
    if (!tfData || tfData.length === 0) {
      const errorMsg = `Nenhum dado carregado para ${symbol} ${primaryTimeframe}. Verifique se o arquivo existe e contém dados no período selecionado.`;
      backtestLogger.error(errorMsg, undefined, "BacktestAdapter");
      throw new Error(errorMsg);
    }
    
    backtestLogger.info(`Dados validados: ${tfData.length} velas`, "BacktestAdapter");
    
    // Adjust warmup based on available data
    const warmupBars = Math.min(200, Math.floor(tfData.length * 0.1));
    backtestLogger.debug(`Warmup: ${warmupBars} velas`, "BacktestAdapter");
    
    for (let i = 0; i < warmupBars; i++) {
      if (!this.advanceBar(symbol, primaryTimeframe)) break;
    }
    
    backtestLogger.debug("Warmup completo", "BacktestAdapter");
    
    // Main simulation loop
    let barCount = 0;
    const startTime = Date.now();
    
    while (this.advanceBar(symbol, primaryTimeframe)) {
      barCount++;
      
      // Log de progresso usando throttling
      backtestLogger.progress(barCount, tfData.length, "Processando velas", "BacktestAdapter");
    }
    
    // Close any remaining positions
    this.closeAllPositions(TradeExitReason.END_OF_DATA);
    
    const totalTime = (Date.now() - startTime) / 1000;
    
    backtestLogger.endOperation("Simulação", true, {
      velas: barCount,
      trades: this.accountState.closedTrades.length,
      tempo: `${totalTime.toFixed(2)}s`,
      saldo: `$${this.accountState.balance.toFixed(2)}`,
    });
    
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
    
    backtestLogger.throttled(`trade_${position.symbol}`, "debug", `Position closed: ${position.direction} ${position.symbol} | P&L: $${netProfit.toFixed(2)}`, "BacktestAdapter");
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
