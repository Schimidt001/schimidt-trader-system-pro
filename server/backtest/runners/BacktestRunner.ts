/**
 * BacktestRunner - Executor de Backtests com Cálculo de Métricas
 * 
 * Orquestra a execução de backtests e calcula todas as métricas
 * de performance solicitadas:
 * - Lucro Líquido ($)
 * - Total de Trades
 * - Winrate (%)
 * - Drawdown Máximo (%)
 * - Fator de Lucro (Profit Factor)
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 1.0.0
 */

import {
  BacktestConfig,
  BacktestResult,
  BacktestMetrics,
  BacktestTrade,
  BacktestStrategyType,
} from "../types/backtest.types";
import { BacktestAdapter } from "../adapters/BacktestAdapter";
import { BacktestEngine, BacktestEngineConfig } from "./BacktestEngine";
import { SMCStrategyConfig } from "../../adapters/ctrader/SMCStrategy";

// ============================================================================
// BACKTEST RUNNER CLASS
// ============================================================================

export class BacktestRunner {
  private config: BacktestConfig;
  private strategyParams?: Partial<SMCStrategyConfig>;
  private adapter: BacktestAdapter | null = null;
  
  constructor(config: BacktestConfig, strategyParams?: Partial<SMCStrategyConfig>) {
    this.config = config;
    this.strategyParams = strategyParams;
  }
  
  /**
   * Run the backtest using the new BacktestEngine
   * 
   * CORREÇÃO: Agora usa BacktestEngine que conecta a estratégia SMC ao adapter,
   * permitindo geração real de trades durante o backtest.
   */
  async run(): Promise<BacktestResult> {
    const startTime = Date.now();
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[BacktestRunner] 🚀 INICIANDO BACKTEST COM ENGINE");
    console.log(`[BacktestRunner] Símbolo: ${this.config.symbol}`);
    console.log(`[BacktestRunner] Estratégia: ${this.config.strategy}`);
    console.log(`[BacktestRunner] Período: ${this.config.startDate.toISOString()} - ${this.config.endDate.toISOString()}`);
    console.log(`[BacktestRunner] Saldo Inicial: $${this.config.initialBalance}`);
    if (this.strategyParams) {
      console.log(`[BacktestRunner] Parâmetros customizados: ${JSON.stringify(this.strategyParams)}`);
    }
    console.log("═══════════════════════════════════════════════════════════════");
    
    // Create engine config
    const engineConfig: BacktestEngineConfig = {
      ...this.config,
      strategyParams: this.strategyParams,
    };
    
    // Create and run engine
    const engine = new BacktestEngine(engineConfig);
    const { trades, equityCurve, drawdownCurve } = await engine.run();
    
    // Calculate metrics
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

export function createBacktestRunner(
  config: BacktestConfig,
  strategyParams?: Partial<SMCStrategyConfig>
): BacktestRunner {
  return new BacktestRunner(config, strategyParams);
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
