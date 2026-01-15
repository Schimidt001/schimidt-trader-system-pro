/**
 * BacktestRunner - Executor de Backtests com Cálculo de Métricas
 * 
 * REFATORAÇÃO 2026-01-14: Implementação de Injeção de Dependência
 * REFATORAÇÃO 2026-01-15: Sincronização MTF Baseada em Timestamp
 * 
 * Orquestra a execução de backtests e calcula todas as métricas
 * de performance solicitadas:
 * - Lucro Líquido ($)
 * - Total de Trades
 * - Winrate (%)
 * - Drawdown Máximo (%)
 * - Fator de Lucro (Profit Factor)
 * 
 * ARQUITETURA SANDBOX:
 * - O BacktestAdapter é injetado no SMCTradingEngine
 * - A estratégia real (SMCStrategy) é usada, não uma cópia
 * - Nenhuma conexão com corretora real é feita
 * 
 * CORREÇÃO MTF 2026-01-15:
 * - O BacktestAdapter agora mantém índices independentes por timeframe
 * - getCandleHistory respeita o alinhamento temporal
 * - Eliminado Look-ahead Bias na leitura de H1/M15
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 2.1.0 - MTF Timestamp Synchronization
 */

import {
  BacktestConfig,
  BacktestResult,
  BacktestMetrics,
  BacktestTrade,
  BacktestStrategyType,
} from "../types/backtest.types";
import { BacktestAdapter } from "../adapters/BacktestAdapter";
import { SMCTradingEngine, SMCTradingEngineConfig } from "../../adapters/ctrader/SMCTradingEngine";
import { StrategyType } from "../../adapters/ctrader/ITradingStrategy";
import { ITradingAdapter } from "../adapters/ITradingAdapter";
import { CandleData, PriceTick } from "../../adapters/IBrokerAdapter";

// ============================================================================
// BACKTEST RUNNER CLASS
// ============================================================================

export class BacktestRunner {
  private config: BacktestConfig;
  private adapter: BacktestAdapter | null = null;
  private engine: SMCTradingEngine | null = null;
  
  constructor(config: BacktestConfig) {
    this.config = config;
  }
  
  /**
   * Run the backtest using the real SMCTradingEngine with injected BacktestAdapter
   * 
   * REFATORAÇÃO 2026-01-14:
   * - Instancia BacktestAdapter como mock da corretora
   * - Injeta o adapter no SMCTradingEngine via construtor
   * - A estratégia SMC real analisa os dados históricos
   * - Os trades são executados no ambiente simulado
   */
  async run(): Promise<BacktestResult> {
    const startTime = Date.now();
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[BacktestRunner] 🚀 INICIANDO BACKTEST COM SINCRONIZAÇÃO MTF");
    console.log(`[BacktestRunner] Símbolo: ${this.config.symbol}`);
    console.log(`[BacktestRunner] Estratégia: ${this.config.strategy}`);
    console.log(`[BacktestRunner] Período: ${this.config.startDate.toISOString()} - ${this.config.endDate.toISOString()}`);
    console.log(`[BacktestRunner] Saldo Inicial: $${this.config.initialBalance}`);
    console.log(`[BacktestRunner] Timeframes: ${this.config.timeframes.join(", ")}`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    // 1. Create BacktestAdapter (Mock da corretora)
    this.adapter = new BacktestAdapter(this.config);
    
    // 2. Load historical data into adapter
    await this.adapter.loadHistoricalData(
      this.config.dataPath,
      this.config.symbol,
      this.config.timeframes
    );
    
    // Validate data was loaded for all timeframes
    const primaryTimeframe = this.config.timeframes[0] || "M5";
    const totalBars = this.adapter.getTotalBars(this.config.symbol, primaryTimeframe);
    if (totalBars === 0) {
      throw new Error(`Nenhum dado carregado para ${this.config.symbol}. Verifique o caminho dos dados.`);
    }
    
    // Log MTF data availability
    console.log(`[BacktestRunner] ✅ Dados carregados:`);
    for (const tf of this.config.timeframes) {
      const bars = this.adapter.getTotalBars(this.config.symbol, tf);
      console.log(`[BacktestRunner]    ${tf}: ${bars} velas`);
    }
    
    // 3. Determine strategy type
    const strategyType = this.mapStrategyType(this.config.strategy);
    
    // 4. Create engine config
    const engineConfig: Partial<SMCTradingEngineConfig> = {
      strategyType,
      symbols: [this.config.symbol],
      lots: this.calculateLotSize(),
      maxPositions: this.config.maxPositions,
      cooldownMs: 0, // No cooldown in backtest
      maxSpread: this.config.maxSpread,
    };
    
    // 5. INJEÇÃO DE DEPENDÊNCIA: Criar SMCTradingEngine com BacktestAdapter
    // Este é o "pulo do gato" - a mesma engine de produção, mas com adapter simulado
    this.engine = new SMCTradingEngine(
      0, // userId fictício para backtest
      0, // botId fictício para backtest
      engineConfig,
      this.adapter as unknown as ITradingAdapter
    );
    
    console.log("[BacktestRunner] ✅ SMCTradingEngine instanciado com BacktestAdapter");
    
    // 6. Inicializar engine para backtest (sem loops de produção)
    await this.engine.initializeForBacktest();
    console.log("[BacktestRunner] ✅ Engine inicializado para backtest");
    
    // 7. Run simulation with strategy integration
    const { trades, equityCurve, drawdownCurve } = await this.runSimulationWithStrategy();
    
    // 8. Calculate metrics
    const metrics = this.calculateMetrics(trades, equityCurve, drawdownCurve);
    
    const executionTime = Date.now() - startTime;
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[BacktestRunner] ✅ BACKTEST CONCLUÍDO");
    console.log(`[BacktestRunner] Tempo de execução: ${(executionTime / 1000).toFixed(2)}s`);
    console.log(`[BacktestRunner] Total de trades: ${metrics.totalTrades}`);
    console.log(`[BacktestRunner] Lucro Líquido: $${metrics.netProfit.toFixed(2)}`);
    console.log(`[BacktestRunner] Winrate: ${metrics.winRate.toFixed(2)}%`);
    console.log(`[BacktestRunner] Drawdown Máximo: ${metrics.maxDrawdownPercent.toFixed(2)}%`);
    console.log(`[BacktestRunner] Profit Factor: ${metrics.profitFactor.toFixed(2)}`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    // Validação de sanidade: alertar se 0 trades
    if (metrics.totalTrades === 0) {
      console.warn("═══════════════════════════════════════════════════════════════");
      console.warn("[BacktestRunner] ⚠️ ALERTA: 0 TRADES EXECUTADOS!");
      console.warn("[BacktestRunner] Possíveis causas:");
      console.warn("[BacktestRunner]   1. Dados insuficientes para análise");
      console.warn("[BacktestRunner]   2. Filtros de sessão muito restritivos");
      console.warn("[BacktestRunner]   3. Spread máximo muito baixo");
      console.warn("[BacktestRunner]   4. Estratégia não encontrou sinais válidos");
      console.warn("═══════════════════════════════════════════════════════════════");
    }
    
    return {
      config: this.config,
      metrics,
      trades,
      equityCurve,
      drawdownCurve,
      startTimestamp: this.config.startDate.getTime(),
      endTimestamp: this.config.endDate.getTime(),
      executionTime,
    };
  }
  
  /**
   * Run simulation with strategy integration
   * 
   * REFATORAÇÃO 2026-01-15: Sincronização MTF baseada em timestamp
   * 
   * Este método avança as velas e dispara os eventos que a estratégia escuta.
   * A estratégia SMC analisa os dados e gera sinais, que são executados no adapter simulado.
   * 
   * O BacktestAdapter agora mantém índices independentes para cada timeframe,
   * garantindo que ao consultar H1 ou M15, os dados retornados correspondam
   * ao período correto (sem Look-ahead Bias).
   */
  private async runSimulationWithStrategy(): Promise<{
    trades: BacktestTrade[];
    equityCurve: { timestamp: number; equity: number }[];
    drawdownCurve: { timestamp: number; drawdown: number; drawdownPercent: number }[];
  }> {
    if (!this.adapter || !this.engine) {
      throw new Error("Adapter ou Engine não inicializados");
    }
    
    const symbol = this.config.symbol;
    const primaryTimeframe = this.config.timeframes[0] || "M5";
    const totalBars = this.adapter.getTotalBars(symbol, primaryTimeframe);
    
    console.log(`[BacktestRunner] Iniciando simulação com ${totalBars} velas...`);
    console.log(`[BacktestRunner] Timeframe primário: ${primaryTimeframe}`);
    
    // Warmup period - avançar velas sem trading para popular indicadores
    const warmupBars = Math.min(200, Math.floor(totalBars * 0.1));
    console.log(`[BacktestRunner] Período de warmup: ${warmupBars} velas`);
    
    for (let i = 0; i < warmupBars; i++) {
      if (!this.adapter.advanceBar(symbol, primaryTimeframe)) break;
    }
    
    // Log de validação MTF após warmup
    await this.logMTFSyncValidation(symbol, "Após Warmup");
    
    console.log(`[BacktestRunner] ✅ Warmup completo. Iniciando trading...`);
    
    // Main simulation loop
    let barCount = 0;
    const startTime = Date.now();
    
    // Configurar callback para receber ticks
    await this.adapter.subscribePrice(symbol, (tick: PriceTick) => {
      // O tick é processado automaticamente pelo adapter
      // A estratégia será chamada via eventos
    });
    
    while (this.adapter.advanceBar(symbol, primaryTimeframe)) {
      barCount++;
      
      // Obter dados MTF para análise (agora sincronizados por timestamp)
      const mtfData = await this.buildMTFData(symbol);
      
      // Chamar análise da estratégia diretamente
      // (Em produção, isso é feito via eventos, aqui fazemos manualmente)
      await this.triggerStrategyAnalysis(symbol, mtfData);
      
      // Log progress every 1000 bars
      if (barCount % 1000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const trades = this.adapter.getClosedTrades().length;
        console.log(`[BacktestRunner] Processadas ${barCount} velas em ${elapsed.toFixed(1)}s | Trades: ${trades}`);
        
        // Log de validação MTF periódico (a cada 5000 barras)
        if (barCount % 5000 === 0) {
          await this.logMTFSyncValidation(symbol, `Barra ${barCount}`);
        }
      }
    }
    
    // Close any remaining positions
    const accountState = this.adapter.getAccountState();
    const openPositionIds = Array.from(accountState.openPositions.keys());
    for (const positionId of openPositionIds) {
      await this.adapter.closePosition(positionId);
    }
    
    const totalTime = (Date.now() - startTime) / 1000;
    const closedTrades = this.adapter.getClosedTrades();
    
    console.log(`[BacktestRunner] ✅ Simulação concluída: ${barCount} velas, ${closedTrades.length} trades em ${totalTime.toFixed(2)}s`);
    
    return {
      trades: closedTrades,
      equityCurve: this.adapter["equityCurve"] || [],
      drawdownCurve: this.adapter["drawdownCurve"] || [],
    };
  }
  
  /**
   * Log de validação da sincronização MTF
   * 
   * Verifica se os timestamps das últimas velas de cada timeframe
   * estão corretamente alinhados com o timestamp simulado atual.
   */
  private async logMTFSyncValidation(symbol: string, context: string): Promise<void> {
    if (!this.adapter) return;
    
    const currentTimestamp = this.adapter.getCurrentSimulatedTimestamp();
    const currentDate = new Date(currentTimestamp);
    
    console.log(`[BacktestRunner] 📊 Validação MTF (${context}):`);
    console.log(`[BacktestRunner]    Timestamp Simulado: ${currentDate.toISOString()}`);
    
    for (const tf of this.config.timeframes) {
      const candles = await this.adapter.getCandleHistory(symbol, tf, 1);
      if (candles.length > 0) {
        const lastCandle = candles[candles.length - 1];
        const candleDate = new Date(lastCandle.timestamp);
        const diff = currentTimestamp - lastCandle.timestamp;
        const diffMinutes = Math.floor(diff / (60 * 1000));
        
        // Verificar se o timestamp da vela é <= timestamp simulado
        const isValid = lastCandle.timestamp <= currentTimestamp;
        const status = isValid ? "✅" : "❌ LOOK-AHEAD BIAS!";
        
        console.log(`[BacktestRunner]    ${tf}: ${candleDate.toISOString()} (${diffMinutes}min atrás) ${status}`);
      } else {
        console.log(`[BacktestRunner]    ${tf}: Sem dados`);
      }
    }
  }
  
  /**
   * Build Multi-Timeframe data for strategy analysis
   * 
   * REFATORAÇÃO 2026-01-15: Os dados agora são obtidos via getCandleHistory
   * que respeita o alinhamento temporal implementado no BacktestAdapter.
   */
  private async buildMTFData(symbol: string): Promise<{
    h1: CandleData[];
    m15: CandleData[];
    m5: CandleData[];
    currentBid?: number;
    currentAsk?: number;
    currentSpreadPips?: number;
  }> {
    if (!this.adapter) {
      return { h1: [], m15: [], m5: [] };
    }
    
    // Obter candles de cada timeframe (agora sincronizados por timestamp)
    const h1Candles = await this.adapter.getCandleHistory(symbol, "H1", 250);
    const m15Candles = await this.adapter.getCandleHistory(symbol, "M15", 250);
    const m5Candles = await this.adapter.getCandleHistory(symbol, "M5", 250);
    
    // Obter preço atual
    let currentBid: number | undefined;
    let currentAsk: number | undefined;
    let currentSpreadPips: number | undefined;
    
    try {
      const tick = await this.adapter.getPrice(symbol);
      currentBid = tick.bid;
      currentAsk = tick.ask;
      currentSpreadPips = tick.spread;
    } catch {
      // Usar último candle se não houver tick
      if (m5Candles.length > 0) {
        currentBid = m5Candles[m5Candles.length - 1].close;
        currentAsk = currentBid + (this.config.spread || 1) * 0.0001;
        currentSpreadPips = this.config.spread || 1;
      }
    }
    
    return {
      h1: h1Candles,
      m15: m15Candles,
      m5: m5Candles,
      currentBid,
      currentAsk,
      currentSpreadPips,
    };
  }
  
  /**
   * Trigger strategy analysis manually
   * 
   * REFATORAÇÃO 2026-01-14: Chama diretamente o método analyzeWithData
   * do SMCTradingEngine, que analisa os dados e executa trades
   */
  private async triggerStrategyAnalysis(
    symbol: string,
    mtfData: {
      h1: CandleData[];
      m15: CandleData[];
      m5: CandleData[];
      currentBid?: number;
      currentAsk?: number;
      currentSpreadPips?: number;
    }
  ): Promise<void> {
    if (!this.engine || !this.adapter) return;
    
    // Verificar se temos dados suficientes
    if (mtfData.h1.length < 50 || mtfData.m15.length < 30 || mtfData.m5.length < 20) {
      return; // Dados insuficientes para análise
    }
    
    // Converter para formato esperado pelo engine
    const formattedMtfData = {
      h1: mtfData.h1.map(c => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
      })),
      m15: mtfData.m15.map(c => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
      })),
      m5: mtfData.m5.map(c => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
      })),
      currentBid: mtfData.currentBid,
      currentAsk: mtfData.currentAsk,
      currentSpreadPips: mtfData.currentSpreadPips,
    };
    
    // Chamar análise diretamente no engine
    await this.engine.analyzeWithData(symbol, formattedMtfData);
  }
  
  /**
   * Map BacktestStrategyType to StrategyType
   */
  private mapStrategyType(backtestType: BacktestStrategyType): StrategyType {
    switch (backtestType) {
      case BacktestStrategyType.SMC:
        return StrategyType.SMC_SWARM;
      case BacktestStrategyType.HYBRID:
        return StrategyType.SMC_SWARM; // Fallback para SMC_SWARM
      case BacktestStrategyType.RSI_VWAP:
        return StrategyType.RSI_VWAP_REVERSAL;
      default:
        return StrategyType.SMC_SWARM;
    }
  }
  
  /**
   * Calculate lot size based on risk percentage
   */
  private calculateLotSize(): number {
    // Simplified lot size calculation
    // In production, this would use proper risk management
    const riskAmount = this.config.initialBalance * (this.config.riskPercent / 100);
    const estimatedSLPips = 30; // Estimated average SL
    const pipValue = 10; // $10 per pip per lot (simplified)
    
    const lots = riskAmount / (estimatedSLPips * pipValue);
    return Math.max(0.01, Math.min(lots, 1)); // Clamp between 0.01 and 1 lot
  }
  
  /**
   * Calculate all performance metrics
   */
  private calculateMetrics(
    trades: BacktestTrade[],
    equityCurve: { timestamp: number; equity: number }[],
    drawdownCurve: { timestamp: number; drawdown: number; drawdownPercent: number }[]
  ): BacktestMetrics {
    // Basic counts
    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => t.netProfit > 0).length;
    const losingTrades = trades.filter(t => t.netProfit < 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    
    // Profit metrics
    const grossProfit = trades
      .filter(t => t.netProfit > 0)
      .reduce((sum, t) => sum + t.netProfit, 0);
    
    const grossLoss = Math.abs(trades
      .filter(t => t.netProfit < 0)
      .reduce((sum, t) => sum + t.netProfit, 0));
    
    const netProfit = grossProfit - grossLoss;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
    
    // Risk metrics
    const maxDrawdown = Math.max(...drawdownCurve.map(d => d.drawdown), 0);
    const maxDrawdownPercent = Math.max(...drawdownCurve.map(d => d.drawdownPercent), 0);
    
    // Consecutive wins/losses
    const { maxConsecutiveWins, maxConsecutiveLosses } = this.calculateConsecutive(trades);
    
    // Performance metrics
    const winningProfits = trades.filter(t => t.netProfit > 0).map(t => t.netProfit);
    const losingProfits = trades.filter(t => t.netProfit < 0).map(t => Math.abs(t.netProfit));
    
    const averageWin = winningProfits.length > 0
      ? winningProfits.reduce((a, b) => a + b, 0) / winningProfits.length
      : 0;
    
    const averageLoss = losingProfits.length > 0
      ? losingProfits.reduce((a, b) => a + b, 0) / losingProfits.length
      : 0;
    
    const averageTrade = totalTrades > 0 ? netProfit / totalTrades : 0;
    
    const largestWin = winningProfits.length > 0 ? Math.max(...winningProfits) : 0;
    const largestLoss = losingProfits.length > 0 ? Math.max(...losingProfits) : 0;
    
    const averageWinLossRatio = averageLoss > 0 ? averageWin / averageLoss : averageWin > 0 ? Infinity : 0;
    
    // Time metrics
    const holdingPeriods = trades.map(t => t.holdingPeriod);
    const averageHoldingPeriod = holdingPeriods.length > 0
      ? holdingPeriods.reduce((a, b) => a + b, 0) / holdingPeriods.length / (1000 * 60 * 60) // Convert to hours
      : 0;
    
    const totalTradingDays = this.calculateTradingDays(trades);
    const tradesPerDay = totalTradingDays > 0 ? totalTrades / totalTradingDays : 0;
    
    // Advanced metrics
    const returns = this.calculateReturns(equityCurve);
    const sharpeRatio = this.calculateSharpeRatio(returns);
    const sortinoRatio = this.calculateSortinoRatio(returns);
    const calmarRatio = maxDrawdownPercent > 0
      ? ((netProfit / this.config.initialBalance) * 100) / maxDrawdownPercent
      : 0;
    
    // Expectancy = (Win% × Avg Win) - (Loss% × Avg Loss)
    const expectancy = ((winRate / 100) * averageWin) - (((100 - winRate) / 100) * averageLoss);
    
    // Recovery Factor = Net Profit / Max Drawdown
    const recoveryFactor = maxDrawdown > 0 ? netProfit / maxDrawdown : netProfit > 0 ? Infinity : 0;
    
    // Balance
    const finalBalance = this.config.initialBalance + netProfit;
    const returnPercent = (netProfit / this.config.initialBalance) * 100;
    
    return {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      grossProfit,
      grossLoss,
      netProfit,
      profitFactor,
      maxDrawdown,
      maxDrawdownPercent,
      maxConsecutiveWins,
      maxConsecutiveLosses,
      averageWin,
      averageLoss,
      averageTrade,
      largestWin,
      largestLoss,
      averageWinLossRatio,
      averageHoldingPeriod,
      totalTradingDays,
      tradesPerDay,
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
      expectancy,
      recoveryFactor,
      initialBalance: this.config.initialBalance,
      finalBalance,
      returnPercent,
    };
  }
  
  /**
   * Calculate consecutive wins and losses
   */
  private calculateConsecutive(trades: BacktestTrade[]): {
    maxConsecutiveWins: number;
    maxConsecutiveLosses: number;
  } {
    let maxWins = 0;
    let maxLosses = 0;
    let currentWins = 0;
    let currentLosses = 0;
    
    for (const trade of trades) {
      if (trade.netProfit > 0) {
        currentWins++;
        currentLosses = 0;
        maxWins = Math.max(maxWins, currentWins);
      } else {
        currentLosses++;
        currentWins = 0;
        maxLosses = Math.max(maxLosses, currentLosses);
      }
    }
    
    return { maxConsecutiveWins: maxWins, maxConsecutiveLosses: maxLosses };
  }
  
  /**
   * Calculate number of trading days
   */
  private calculateTradingDays(trades: BacktestTrade[]): number {
    if (trades.length === 0) return 0;
    
    const uniqueDays = new Set<string>();
    
    for (const trade of trades) {
      const date = new Date(trade.entryTime);
      const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      uniqueDays.add(dayKey);
    }
    
    return uniqueDays.size;
  }
  
  /**
   * Calculate returns from equity curve
   */
  private calculateReturns(equityCurve: { timestamp: number; equity: number }[]): number[] {
    const returns: number[] = [];
    
    for (let i = 1; i < equityCurve.length; i++) {
      const prevEquity = equityCurve[i - 1].equity;
      const currEquity = equityCurve[i].equity;
      
      if (prevEquity > 0) {
        const returnPct = ((currEquity - prevEquity) / prevEquity) * 100;
        returns.push(returnPct);
      }
    }
    
    return returns;
  }
  
  /**
   * Calculate Sharpe Ratio (annualized)
   */
  private calculateSharpeRatio(returns: number[]): number {
    if (returns.length < 2) return 0;
    
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return 0;
    
    // Annualize (assuming daily returns, ~252 trading days)
    const annualizedReturn = avgReturn * 252;
    const annualizedStdDev = stdDev * Math.sqrt(252);
    
    return annualizedReturn / annualizedStdDev;
  }
  
  /**
   * Calculate Sortino Ratio (annualized)
   */
  private calculateSortinoRatio(returns: number[]): number {
    if (returns.length < 2) return 0;
    
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    
    // Only consider negative returns for downside deviation
    const negativeReturns = returns.filter(r => r < 0);
    if (negativeReturns.length === 0) return avgReturn > 0 ? Infinity : 0;
    
    const downsideVariance = negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);
    
    if (downsideDeviation === 0) return 0;
    
    // Annualize
    const annualizedReturn = avgReturn * 252;
    const annualizedDownside = downsideDeviation * Math.sqrt(252);
    
    return annualizedReturn / annualizedDownside;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createBacktestRunner(config: BacktestConfig): BacktestRunner {
  return new BacktestRunner(config);
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_BACKTEST_CONFIG: Omit<BacktestConfig, "symbol" | "startDate" | "endDate" | "dataPath"> = {
  strategy: BacktestStrategyType.SMC,
  initialBalance: 10000,
  leverage: 500,
  commission: 7, // $7 per lot
  slippage: 0.5, // 0.5 pips
  spread: 1.0, // 1 pip default spread
  timeframes: ["M5", "M15", "H1"],
  riskPercent: 2,
  maxPositions: 3,
  maxSpread: 3,
};
