/**
 * Backtest Types - Tipos específicos para o módulo de backtesting
 * 
 * Estes tipos estendem os tipos existentes do sistema de produção
 * para suportar simulação offline.
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 1.0.0
 */

import { CandleData, OrderDirection, PriceTick, OpenPosition } from "../../adapters/IBrokerAdapter";

// ============================================================================
// ENUMS
// ============================================================================

export enum BacktestStrategyType {
  SMC = "SMC",
  HYBRID = "HYBRID",
  RSI_VWAP = "RSI_VWAP"
}

export enum TradeExitReason {
  TAKE_PROFIT = "TP",
  STOP_LOSS = "SL",
  SIGNAL = "SIGNAL",
  END_OF_DATA = "END_OF_DATA",
  MANUAL = "MANUAL"
}

// ============================================================================
// BACKTEST CONFIGURATION
// ============================================================================

export interface BacktestConfig {
  /** Símbolo a ser testado (ex: "XAUUSD") */
  symbol: string;
  
  /** Tipo de estratégia */
  strategy: BacktestStrategyType;
  
  /** Data de início do backtest */
  startDate: Date;
  
  /** Data de fim do backtest */
  endDate: Date;
  
  /** Saldo inicial da conta simulada */
  initialBalance: number;
  
  /** Alavancagem da conta */
  leverage: number;
  
  /** Comissão por lote (em USD) */
  commission: number;
  
  /** Slippage simulado em pips */
  slippage: number;
  
  /** Spread fixo em pips (se não usar spread dos dados) */
  spread?: number;
  
  /** Caminho para os arquivos de dados */
  dataPath: string;
  
  /** Timeframes a serem carregados */
  timeframes: string[];
  
  /** Risco por trade em % */
  riskPercent: number;
  
  /** Máximo de posições simultâneas */
  maxPositions: number;
  
  /** Spread máximo permitido em pips */
  maxSpread: number;
}

// ============================================================================
// BACKTEST TRADE
// ============================================================================

export interface BacktestTrade {
  /** ID único do trade */
  id: string;
  
  /** Símbolo operado */
  symbol: string;
  
  /** Estratégia que gerou o sinal */
  strategy: BacktestStrategyType;
  
  /** Direção (BUY/SELL) */
  side: OrderDirection;
  
  /** Timestamp de entrada (Unix ms) */
  entryTime: number;
  
  /** Timestamp de saída (Unix ms) */
  exitTime: number;
  
  /** Preço de entrada */
  entryPrice: number;
  
  /** Preço de saída */
  exitPrice: number;
  
  /** Volume em lotes */
  volume: number;
  
  /** Stop Loss definido */
  stopLoss?: number;
  
  /** Take Profit definido */
  takeProfit?: number;
  
  /** Lucro bruto em USD */
  profit: number;
  
  /** Lucro em pips */
  profitPips: number;
  
  /** Comissão paga */
  commission: number;
  
  /** Swap (sempre 0 em backtest) */
  swap: number;
  
  /** Lucro líquido (profit - commission - swap) */
  netProfit: number;
  
  /** Drawdown máximo durante o trade */
  maxDrawdown: number;
  
  /** Runup máximo durante o trade */
  maxRunup: number;
  
  /** Duração do trade em milissegundos */
  holdingPeriod: number;
  
  /** Motivo da saída */
  exitReason: TradeExitReason;
  
  /** Comentário adicional */
  comment?: string;
}

// ============================================================================
// BACKTEST METRICS
// ============================================================================

export interface BacktestMetrics {
  // -------------------------------------------------------------------------
  // Métricas Gerais
  // -------------------------------------------------------------------------
  
  /** Total de trades executados */
  totalTrades: number;
  
  /** Trades vencedores */
  winningTrades: number;
  
  /** Trades perdedores */
  losingTrades: number;
  
  /** Taxa de acerto (%) */
  winRate: number;
  
  // -------------------------------------------------------------------------
  // Métricas de Lucro
  // -------------------------------------------------------------------------
  
  /** Soma dos lucros dos trades vencedores */
  grossProfit: number;
  
  /** Soma das perdas dos trades perdedores (valor absoluto) */
  grossLoss: number;
  
  /** Lucro líquido total */
  netProfit: number;
  
  /** Fator de lucro (grossProfit / grossLoss) */
  profitFactor: number;
  
  // -------------------------------------------------------------------------
  // Métricas de Risco
  // -------------------------------------------------------------------------
  
  /** Drawdown máximo em USD */
  maxDrawdown: number;
  
  /** Drawdown máximo em % */
  maxDrawdownPercent: number;
  
  /** Sequência máxima de vitórias */
  maxConsecutiveWins: number;
  
  /** Sequência máxima de derrotas */
  maxConsecutiveLosses: number;
  
  // -------------------------------------------------------------------------
  // Métricas de Performance
  // -------------------------------------------------------------------------
  
  /** Lucro médio dos trades vencedores */
  averageWin: number;
  
  /** Perda média dos trades perdedores */
  averageLoss: number;
  
  /** Resultado médio por trade */
  averageTrade: number;
  
  /** Maior lucro em um único trade */
  largestWin: number;
  
  /** Maior perda em um único trade */
  largestLoss: number;
  
  /** Razão média Win/Loss */
  averageWinLossRatio: number;
  
  // -------------------------------------------------------------------------
  // Métricas de Tempo
  // -------------------------------------------------------------------------
  
  /** Duração média dos trades em horas */
  averageHoldingPeriod: number;
  
  /** Total de dias de trading */
  totalTradingDays: number;
  
  /** Trades por dia (média) */
  tradesPerDay: number;
  
  // -------------------------------------------------------------------------
  // Métricas Avançadas
  // -------------------------------------------------------------------------
  
  /** Sharpe Ratio (anualizado) */
  sharpeRatio: number;
  
  /** Sortino Ratio (anualizado) */
  sortinoRatio: number;
  
  /** Calmar Ratio (return / max drawdown) */
  calmarRatio: number;
  
  /** Expectativa matemática por trade */
  expectancy: number;
  
  /** Recovery Factor (net profit / max drawdown) */
  recoveryFactor: number;
  
  // -------------------------------------------------------------------------
  // Saldo
  // -------------------------------------------------------------------------
  
  /** Saldo inicial */
  initialBalance: number;
  
  /** Saldo final */
  finalBalance: number;
  
  /** Retorno total em % */
  returnPercent: number;
}

// ============================================================================
// BACKTEST RESULT
// ============================================================================

export interface BacktestResult {
  /** Configuração usada no backtest */
  config: BacktestConfig;
  
  /** Métricas calculadas */
  metrics: BacktestMetrics;
  
  /** Lista de todos os trades */
  trades: BacktestTrade[];
  
  /** Curva de equity (saldo ao longo do tempo) */
  equityCurve: { timestamp: number; equity: number }[];
  
  /** Curva de drawdown */
  drawdownCurve: { timestamp: number; drawdown: number; drawdownPercent: number }[];
  
  /** Timestamp de início do backtest */
  startTimestamp: number;
  
  /** Timestamp de fim do backtest */
  endTimestamp: number;
  
  /** Duração do backtest em ms */
  executionTime: number;
}

// ============================================================================
// HISTORICAL DATA TYPES
// ============================================================================

export interface HistoricalDataFile {
  /** Símbolo */
  symbol: string;
  
  /** Timeframe */
  timeframe: string;
  
  /** Data de início (ISO string) */
  startDate: string;
  
  /** Data de fim (ISO string) */
  endDate: string;
  
  /** Total de candles */
  totalBars: number;
  
  /** Array de candles */
  bars: CandleData[];
  
  /** Metadata */
  metadata?: {
    source: string;
    downloadedAt: string;
    broker: string;
  };
}

// ============================================================================
// SIMULATED ACCOUNT STATE
// ============================================================================

export interface SimulatedAccountState {
  /** Saldo atual */
  balance: number;
  
  /** Equity (balance + unrealized P&L) */
  equity: number;
  
  /** Margem utilizada */
  margin: number;
  
  /** Margem livre */
  freeMargin: number;
  
  /** Posições abertas */
  openPositions: Map<string, SimulatedPosition>;
  
  /** Histórico de trades fechados */
  closedTrades: BacktestTrade[];
  
  /** Pico máximo de equity (para cálculo de drawdown) */
  peakEquity: number;
  
  /** Drawdown atual */
  currentDrawdown: number;
}

export interface SimulatedPosition {
  /** ID da posição */
  id: string;
  
  /** Símbolo */
  symbol: string;
  
  /** Direção */
  direction: OrderDirection;
  
  /** Preço de entrada */
  entryPrice: number;
  
  /** Preço atual */
  currentPrice: number;
  
  /** Volume em lotes */
  volume: number;
  
  /** Stop Loss */
  stopLoss?: number;
  
  /** Take Profit */
  takeProfit?: number;
  
  /** Timestamp de abertura */
  openTime: number;
  
  /** P&L não realizado */
  unrealizedPnL: number;
  
  /** Comissão */
  commission: number;
  
  /** Pico de lucro (para trailing) */
  peakProfit: number;
  
  /** Vale de prejuízo */
  troughLoss: number;
  
  /** Comentário/estratégia */
  comment?: string;
}

// ============================================================================
// DATA COLLECTOR TYPES
// ============================================================================

export interface DataCollectorConfig {
  /** Credenciais cTrader */
  clientId: string;
  clientSecret: string;
  accessToken: string;
  accountId?: string;
  
  /** Símbolos para coletar */
  symbols: string[];
  
  /** Timeframes para coletar */
  timeframes: string[];
  
  /** Meses de histórico (janela deslizante) */
  monthsBack: number;
  
  /** Diretório de saída */
  outputDir: string;
  
  /** Formato de saída */
  format: "json" | "csv";
}

export interface DataCollectorProgress {
  /** Símbolo atual */
  currentSymbol: string;
  
  /** Timeframe atual */
  currentTimeframe: string;
  
  /** Progresso total (0-100) */
  totalProgress: number;
  
  /** Candles baixados */
  candlesDownloaded: number;
  
  /** Erros encontrados */
  errors: string[];
}
