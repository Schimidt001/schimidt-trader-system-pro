/**
 * PortfolioMetricsCalculator - Calculador de Métricas de Portfólio
 * 
 * IMPLEMENTAÇÃO WP6: Multi-Asset com relógio global (institucional)
 * 
 * Implementa cálculo de métricas avançadas de portfólio:
 * - Sharpe Ratio do portfólio
 * - Sortino Ratio
 * - Calmar Ratio
 * - Information Ratio
 * - Beta e Alpha
 * - Métricas por ativo
 * - Contribuição de cada ativo para o resultado
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { BacktestTrade } from "../types/backtest.types";
import { multiAssetLogger } from "../utils/LabLogger";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Métricas de um ativo individual
 */
export interface AssetMetrics {
  symbol: string;
  trades: number;
  winRate: number;
  profitFactor: number;
  totalProfit: number;
  avgProfit: number;
  sharpeRatio: number;
  maxDrawdown: number;
  contribution: number; // % do lucro total
  weight: number; // % do portfólio
}

/**
 * Métricas do portfólio
 */
export interface PortfolioMetrics {
  // Métricas de retorno
  totalReturn: number;
  annualizedReturn: number;
  avgDailyReturn: number;
  
  // Métricas de risco
  volatility: number;
  annualizedVolatility: number;
  maxDrawdown: number;
  avgDrawdown: number;
  
  // Ratios
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  informationRatio: number;
  
  // Métricas de trading
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  
  // Métricas por ativo
  assetMetrics: AssetMetrics[];
  
  // Diversificação
  diversificationRatio: number;
  correlationImpact: number;
}

/**
 * Configuração do calculador
 */
export interface PortfolioMetricsConfig {
  riskFreeRate: number; // Taxa livre de risco anual (ex: 0.05 = 5%)
  tradingDaysPerYear: number;
  benchmarkReturns?: number[]; // Retornos do benchmark para Information Ratio
}

// ============================================================================
// PORTFOLIO METRICS CALCULATOR CLASS
// ============================================================================

export class PortfolioMetricsCalculator {
  private config: PortfolioMetricsConfig;
  
  constructor(config: PortfolioMetricsConfig) {
    this.config = config;
  }
  
  /**
   * Calcular métricas completas do portfólio
   */
  calculate(
    trades: BacktestTrade[],
    equityCurve: { timestamp: number; equity: number }[],
    initialBalance: number
  ): PortfolioMetrics {
    multiAssetLogger.debug(`Calculando métricas para ${trades.length} trades...`, "PortfolioMetrics");
    
    // Calcular retornos diários
    const dailyReturns = this.calculateDailyReturns(equityCurve);
    
    // Métricas de retorno
    const totalReturn = this.calculateTotalReturn(equityCurve, initialBalance);
    const annualizedReturn = this.annualizeReturn(totalReturn, equityCurve.length);
    const avgDailyReturn = this.mean(dailyReturns);
    
    // Métricas de risco
    const volatility = this.standardDeviation(dailyReturns);
    const annualizedVolatility = volatility * Math.sqrt(this.config.tradingDaysPerYear);
    const { maxDrawdown, avgDrawdown } = this.calculateDrawdowns(equityCurve);
    
    // Ratios
    const sharpeRatio = this.calculateSharpeRatio(dailyReturns);
    const sortinoRatio = this.calculateSortinoRatio(dailyReturns);
    const calmarRatio = this.calculateCalmarRatio(annualizedReturn, maxDrawdown);
    const informationRatio = this.calculateInformationRatio(dailyReturns);
    
    // Métricas de trading
    const tradingMetrics = this.calculateTradingMetrics(trades);
    
    // Métricas por ativo
    const assetMetrics = this.calculateAssetMetrics(trades);
    
    // Diversificação
    const diversificationRatio = this.calculateDiversificationRatio(assetMetrics);
    const correlationImpact = this.calculateCorrelationImpact(assetMetrics, trades);
    
    return {
      totalReturn,
      annualizedReturn,
      avgDailyReturn,
      volatility,
      annualizedVolatility,
      maxDrawdown,
      avgDrawdown,
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
      informationRatio,
      totalTrades: tradingMetrics.totalTrades,
      winRate: tradingMetrics.winRate,
      profitFactor: tradingMetrics.profitFactor,
      expectancy: tradingMetrics.expectancy,
      assetMetrics,
      diversificationRatio,
      correlationImpact,
    };
  }
  
  /**
   * Calcular retornos diários
   */
  private calculateDailyReturns(equityCurve: { timestamp: number; equity: number }[]): number[] {
    const returns: number[] = [];
    
    for (let i = 1; i < equityCurve.length; i++) {
      const prevEquity = equityCurve[i - 1].equity;
      const currEquity = equityCurve[i].equity;
      
      if (prevEquity > 0) {
        returns.push((currEquity - prevEquity) / prevEquity);
      }
    }
    
    return returns;
  }
  
  /**
   * Calcular retorno total
   */
  private calculateTotalReturn(
    equityCurve: { timestamp: number; equity: number }[],
    initialBalance: number
  ): number {
    if (equityCurve.length === 0) return 0;
    
    const finalEquity = equityCurve[equityCurve.length - 1].equity;
    return ((finalEquity - initialBalance) / initialBalance) * 100;
  }
  
  /**
   * Anualizar retorno
   */
  private annualizeReturn(totalReturn: number, periods: number): number {
    if (periods === 0) return 0;
    
    const periodsPerYear = this.config.tradingDaysPerYear;
    const years = periods / periodsPerYear;
    
    if (years === 0) return totalReturn;
    
    // CAGR
    const totalReturnDecimal = totalReturn / 100;
    return (Math.pow(1 + totalReturnDecimal, 1 / years) - 1) * 100;
  }
  
  /**
   * Calcular drawdowns
   */
  private calculateDrawdowns(equityCurve: { timestamp: number; equity: number }[]): {
    maxDrawdown: number;
    avgDrawdown: number;
  } {
    if (equityCurve.length === 0) return { maxDrawdown: 0, avgDrawdown: 0 };
    
    let peak = equityCurve[0].equity;
    let maxDrawdown = 0;
    const drawdowns: number[] = [];
    
    for (const point of equityCurve) {
      if (point.equity > peak) {
        peak = point.equity;
      }
      
      const drawdown = peak > 0 ? ((peak - point.equity) / peak) * 100 : 0;
      drawdowns.push(drawdown);
      
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    const avgDrawdown = this.mean(drawdowns);
    
    return { maxDrawdown, avgDrawdown };
  }
  
  /**
   * Calcular Sharpe Ratio
   */
  private calculateSharpeRatio(dailyReturns: number[]): number {
    if (dailyReturns.length === 0) return 0;
    
    const avgReturn = this.mean(dailyReturns);
    const stdReturn = this.standardDeviation(dailyReturns);
    
    if (stdReturn === 0) return avgReturn > 0 ? Infinity : 0;
    
    // Ajustar taxa livre de risco para período diário
    const dailyRiskFreeRate = this.config.riskFreeRate / this.config.tradingDaysPerYear;
    
    // Sharpe anualizado
    return ((avgReturn - dailyRiskFreeRate) / stdReturn) * Math.sqrt(this.config.tradingDaysPerYear);
  }
  
  /**
   * Calcular Sortino Ratio (usa apenas volatilidade negativa)
   */
  private calculateSortinoRatio(dailyReturns: number[]): number {
    if (dailyReturns.length === 0) return 0;
    
    const avgReturn = this.mean(dailyReturns);
    const dailyRiskFreeRate = this.config.riskFreeRate / this.config.tradingDaysPerYear;
    
    // Calcular downside deviation
    const negativeReturns = dailyReturns.filter(r => r < dailyRiskFreeRate);
    if (negativeReturns.length === 0) return avgReturn > 0 ? Infinity : 0;
    
    const squaredNegative = negativeReturns.map(r => Math.pow(r - dailyRiskFreeRate, 2));
    const downsideDeviation = Math.sqrt(this.mean(squaredNegative));
    
    if (downsideDeviation === 0) return avgReturn > 0 ? Infinity : 0;
    
    return ((avgReturn - dailyRiskFreeRate) / downsideDeviation) * Math.sqrt(this.config.tradingDaysPerYear);
  }
  
  /**
   * Calcular Calmar Ratio
   */
  private calculateCalmarRatio(annualizedReturn: number, maxDrawdown: number): number {
    if (maxDrawdown === 0) return annualizedReturn > 0 ? Infinity : 0;
    return annualizedReturn / maxDrawdown;
  }
  
  /**
   * Calcular Information Ratio
   */
  private calculateInformationRatio(dailyReturns: number[]): number {
    if (!this.config.benchmarkReturns || this.config.benchmarkReturns.length === 0) {
      return 0;
    }
    
    const minLength = Math.min(dailyReturns.length, this.config.benchmarkReturns.length);
    if (minLength === 0) return 0;
    
    // Calcular retornos excedentes
    const excessReturns: number[] = [];
    for (let i = 0; i < minLength; i++) {
      excessReturns.push(dailyReturns[i] - this.config.benchmarkReturns[i]);
    }
    
    const avgExcessReturn = this.mean(excessReturns);
    const trackingError = this.standardDeviation(excessReturns);
    
    if (trackingError === 0) return avgExcessReturn > 0 ? Infinity : 0;
    
    return (avgExcessReturn / trackingError) * Math.sqrt(this.config.tradingDaysPerYear);
  }
  
  /**
   * Calcular métricas de trading
   */
  private calculateTradingMetrics(trades: BacktestTrade[]): {
    totalTrades: number;
    winRate: number;
    profitFactor: number;
    expectancy: number;
  } {
    if (trades.length === 0) {
      return { totalTrades: 0, winRate: 0, profitFactor: 0, expectancy: 0 };
    }
    
    const winningTrades = trades.filter(t => t.profit > 0);
    const losingTrades = trades.filter(t => t.profit < 0);
    
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.profit, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));
    
    const winRate = (winningTrades.length / trades.length) * 100;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
    
    const avgWin = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;
    const expectancy = (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss;
    
    return {
      totalTrades: trades.length,
      winRate,
      profitFactor,
      expectancy,
    };
  }
  
  /**
   * Calcular métricas por ativo
   */
  private calculateAssetMetrics(trades: BacktestTrade[]): AssetMetrics[] {
    // Agrupar trades por símbolo
    const tradesBySymbol = new Map<string, BacktestTrade[]>();
    
    for (const trade of trades) {
      const existing = tradesBySymbol.get(trade.symbol) || [];
      existing.push(trade);
      tradesBySymbol.set(trade.symbol, existing);
    }
    
    const totalProfit = trades.reduce((sum, t) => sum + t.profit, 0);
    const metrics: AssetMetrics[] = [];
    
    for (const [symbol, symbolTrades] of tradesBySymbol) {
      const winningTrades = symbolTrades.filter(t => t.profit > 0);
      const losingTrades = symbolTrades.filter(t => t.profit < 0);
      
      const grossProfit = winningTrades.reduce((sum, t) => sum + t.profit, 0);
      const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));
      const symbolProfit = grossProfit - grossLoss;
      
      const returns = symbolTrades.map(t => t.profit);
      const avgReturn = this.mean(returns);
      const stdReturn = this.standardDeviation(returns);
      
      metrics.push({
        symbol,
        trades: symbolTrades.length,
        winRate: symbolTrades.length > 0 ? (winningTrades.length / symbolTrades.length) * 100 : 0,
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
        totalProfit: symbolProfit,
        avgProfit: symbolTrades.length > 0 ? symbolProfit / symbolTrades.length : 0,
        sharpeRatio: stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0,
        maxDrawdown: this.calculateAssetMaxDrawdown(symbolTrades),
        contribution: totalProfit !== 0 ? (symbolProfit / totalProfit) * 100 : 0,
        weight: trades.length > 0 ? (symbolTrades.length / trades.length) * 100 : 0,
      });
    }
    
    // Ordenar por contribuição
    metrics.sort((a, b) => b.contribution - a.contribution);
    
    return metrics;
  }
  
  /**
   * Calcular max drawdown de um ativo
   */
  private calculateAssetMaxDrawdown(trades: BacktestTrade[]): number {
    if (trades.length === 0) return 0;
    
    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0;
    
    for (const trade of trades) {
      equity += trade.profit;
      if (equity > peak) {
        peak = equity;
      }
      
      const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    return maxDrawdown;
  }
  
  /**
   * Calcular ratio de diversificação
   */
  private calculateDiversificationRatio(assetMetrics: AssetMetrics[]): number {
    if (assetMetrics.length <= 1) return 0;
    
    // Diversificação baseada na distribuição de contribuição
    const contributions = assetMetrics.map(a => Math.abs(a.contribution));
    const totalContribution = contributions.reduce((a, b) => a + b, 0);
    
    if (totalContribution === 0) return 100;
    
    // Calcular índice de Herfindahl-Hirschman (HHI)
    const hhi = contributions.reduce((sum, c) => {
      const share = c / totalContribution;
      return sum + share * share;
    }, 0);
    
    // Converter HHI para score de diversificação (0-100)
    // HHI = 1 significa concentração total, HHI = 1/n significa diversificação perfeita
    const minHHI = 1 / assetMetrics.length;
    const diversificationScore = ((1 - hhi) / (1 - minHHI)) * 100;
    
    return Math.max(0, Math.min(100, diversificationScore));
  }
  
  /**
   * Calcular impacto da correlação
   */
  private calculateCorrelationImpact(assetMetrics: AssetMetrics[], trades: BacktestTrade[]): number {
    // Simplificação: estimar impacto baseado na variância dos retornos por ativo
    if (assetMetrics.length <= 1) return 0;
    
    const assetReturns: Map<string, number[]> = new Map();
    
    for (const trade of trades) {
      const existing = assetReturns.get(trade.symbol) || [];
      existing.push(trade.profit);
      assetReturns.set(trade.symbol, existing);
    }
    
    // Calcular variância individual e combinada
    let sumIndividualVariance = 0;
    
    for (const [, returns] of assetReturns) {
      const variance = this.variance(returns);
      sumIndividualVariance += variance;
    }
    
    const allReturns = trades.map(t => t.profit);
    const combinedVariance = this.variance(allReturns);
    
    // Se variância combinada < soma das individuais, há benefício de diversificação
    if (sumIndividualVariance === 0) return 0;
    
    const correlationImpact = ((sumIndividualVariance - combinedVariance) / sumIndividualVariance) * 100;
    
    return Math.max(-100, Math.min(100, correlationImpact));
  }
  
  /**
   * Calcular média
   */
  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
  
  /**
   * Calcular variância
   */
  private variance(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = this.mean(values);
    return values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
  }
  
  /**
   * Calcular desvio padrão
   */
  private standardDeviation(values: number[]): number {
    return Math.sqrt(this.variance(values));
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Criar calculador de métricas de portfólio
 */
export function createPortfolioMetricsCalculator(config: PortfolioMetricsConfig): PortfolioMetricsCalculator {
  return new PortfolioMetricsCalculator(config);
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_PORTFOLIO_METRICS_CONFIG: PortfolioMetricsConfig = {
  riskFreeRate: 0.05, // 5% ao ano
  tradingDaysPerYear: 252,
};

// ============================================================================
// EXPORTS
// ============================================================================

export default PortfolioMetricsCalculator;
