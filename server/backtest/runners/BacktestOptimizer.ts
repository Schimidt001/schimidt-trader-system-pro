/**
 * BacktestOptimizer - Otimizador de Parâmetros de Backtest
 * 
 * Executa múltiplas simulações em lote para encontrar os melhores
 * parâmetros de trading. Gera todas as combinações possíveis e
 * retorna um ranking ordenado por lucro líquido.
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 1.0.0
 */

import {
  BacktestConfig,
  BacktestResult,
  BacktestMetrics,
  BacktestStrategyType,
} from "../types/backtest.types";
import { BacktestRunner } from "./BacktestRunner";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuração de otimização
 */
export interface OptimizationConfig {
  // Símbolo e período
  symbol: string;
  startDate: Date;
  endDate: Date;
  dataPath: string;
  
  // Parâmetros fixos
  initialBalance: number;
  leverage: number;
  commission: number;
  slippage: number;
  spread: number;
  maxSpread: number;
  
  // Parâmetros a otimizar
  strategies: BacktestStrategyType[];
  riskRange: { min: number; max: number; step: number };
  maxPositionsRange?: { min: number; max: number; step: number };
}

/**
 * Resultado de uma combinação de otimização
 */
export interface OptimizationResultItem {
  rank: number;
  strategy: BacktestStrategyType;
  riskPercent: number;
  maxPositions: number;
  
  // Métricas principais
  netProfit: number;
  returnPercent: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  expectancy: number;
  
  // Métricas adicionais
  initialBalance: number;
  finalBalance: number;
  winningTrades: number;
  losingTrades: number;
  
  // Score composto (para ranking)
  compositeScore: number;
}

/**
 * Resultado completo da otimização
 */
export interface OptimizationResult {
  config: OptimizationConfig;
  results: OptimizationResultItem[];
  totalCombinations: number;
  completedCombinations: number;
  executionTime: number;
  bestResult: OptimizationResultItem | null;
  worstResult: OptimizationResultItem | null;
}

/**
 * Progresso da otimização
 */
export interface OptimizationProgress {
  currentCombination: number;
  totalCombinations: number;
  currentStrategy: string;
  currentRisk: number;
  percentComplete: number;
  estimatedTimeRemaining: number; // seconds
}

// ============================================================================
// OPTIMIZER CLASS
// ============================================================================

export class BacktestOptimizer {
  private config: OptimizationConfig;
  private onProgress?: (progress: OptimizationProgress) => void;
  private aborted: boolean = false;
  
  constructor(config: OptimizationConfig) {
    this.config = config;
  }
  
  /**
   * Set progress callback
   */
  setProgressCallback(callback: (progress: OptimizationProgress) => void): void {
    this.onProgress = callback;
  }
  
  /**
   * Abort optimization
   */
  abort(): void {
    this.aborted = true;
  }
  
  /**
   * Generate all parameter combinations
   */
  private generateCombinations(): Array<{
    strategy: BacktestStrategyType;
    riskPercent: number;
    maxPositions: number;
  }> {
    const combinations: Array<{
      strategy: BacktestStrategyType;
      riskPercent: number;
      maxPositions: number;
    }> = [];
    
    // Generate risk values
    const riskValues: number[] = [];
    for (
      let risk = this.config.riskRange.min;
      risk <= this.config.riskRange.max;
      risk += this.config.riskRange.step
    ) {
      riskValues.push(Math.round(risk * 10) / 10); // Round to 1 decimal
    }
    
    // Generate maxPositions values
    const maxPosValues: number[] = [];
    if (this.config.maxPositionsRange) {
      for (
        let pos = this.config.maxPositionsRange.min;
        pos <= this.config.maxPositionsRange.max;
        pos += this.config.maxPositionsRange.step
      ) {
        maxPosValues.push(Math.round(pos));
      }
    } else {
      maxPosValues.push(3); // Default
    }
    
    // Generate all combinations
    for (const strategy of this.config.strategies) {
      for (const risk of riskValues) {
        for (const maxPos of maxPosValues) {
          combinations.push({
            strategy,
            riskPercent: risk,
            maxPositions: maxPos,
          });
        }
      }
    }
    
    return combinations;
  }
  
  /**
   * Calculate composite score for ranking
   * Higher is better
   */
  private calculateCompositeScore(metrics: BacktestMetrics): number {
    // Weighted score based on multiple factors
    // - Net Profit (40%)
    // - Profit Factor (20%)
    // - Win Rate (15%)
    // - Sharpe Ratio (15%)
    // - Inverse Drawdown (10%)
    
    const profitScore = metrics.netProfit / this.config.initialBalance * 100; // Normalized to %
    const pfScore = Math.min(metrics.profitFactor, 5) * 20; // Cap at 5, scale to 100
    const winRateScore = metrics.winRate;
    const sharpeScore = Math.min(Math.max(metrics.sharpeRatio, -2), 3) * 20 + 40; // Scale -2 to 3 -> 0 to 100
    const ddScore = Math.max(0, 100 - metrics.maxDrawdownPercent * 2); // Lower DD = higher score
    
    return (
      profitScore * 0.4 +
      pfScore * 0.2 +
      winRateScore * 0.15 +
      sharpeScore * 0.15 +
      ddScore * 0.1
    );
  }
  
  /**
   * Run optimization
   */
  async run(): Promise<OptimizationResult> {
    const startTime = Date.now();
    this.aborted = false;
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[BacktestOptimizer] 🚀 INICIANDO OTIMIZAÇÃO");
    console.log(`[BacktestOptimizer] Símbolo: ${this.config.symbol}`);
    console.log(`[BacktestOptimizer] Estratégias: ${this.config.strategies.join(", ")}`);
    console.log(`[BacktestOptimizer] Risco: ${this.config.riskRange.min}% - ${this.config.riskRange.max}% (step ${this.config.riskRange.step}%)`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    const combinations = this.generateCombinations();
    const totalCombinations = combinations.length;
    
    console.log(`[BacktestOptimizer] Total de combinações: ${totalCombinations}`);
    
    const results: OptimizationResultItem[] = [];
    let completedCombinations = 0;
    const combinationTimes: number[] = [];
    
    for (const combo of combinations) {
      if (this.aborted) {
        console.log("[BacktestOptimizer] ⛔ Otimização abortada pelo usuário");
        break;
      }
      
      const comboStartTime = Date.now();
      
      // Update progress
      if (this.onProgress) {
        const avgTime = combinationTimes.length > 0
          ? combinationTimes.reduce((a, b) => a + b, 0) / combinationTimes.length
          : 5000; // Estimate 5s per combo
        
        this.onProgress({
          currentCombination: completedCombinations + 1,
          totalCombinations,
          currentStrategy: combo.strategy,
          currentRisk: combo.riskPercent,
          percentComplete: Math.round((completedCombinations / totalCombinations) * 100),
          estimatedTimeRemaining: Math.round(((totalCombinations - completedCombinations) * avgTime) / 1000),
        });
      }
      
      try {
        // Build backtest config
        const backtestConfig: BacktestConfig = {
          symbol: this.config.symbol,
          strategy: combo.strategy,
          startDate: this.config.startDate,
          endDate: this.config.endDate,
          initialBalance: this.config.initialBalance,
          leverage: this.config.leverage,
          commission: this.config.commission,
          slippage: this.config.slippage,
          spread: this.config.spread,
          dataPath: this.config.dataPath,
          timeframes: ["M5", "M15", "H1"],
          riskPercent: combo.riskPercent,
          maxPositions: combo.maxPositions,
          maxSpread: this.config.maxSpread,
        };
        
        // Run backtest
        const runner = new BacktestRunner(backtestConfig);
        const backtestResult = await runner.run();
        
        // Calculate composite score
        const compositeScore = this.calculateCompositeScore(backtestResult.metrics);
        
        // Add to results
        results.push({
          rank: 0, // Will be set after sorting
          strategy: combo.strategy,
          riskPercent: combo.riskPercent,
          maxPositions: combo.maxPositions,
          netProfit: backtestResult.metrics.netProfit,
          returnPercent: backtestResult.metrics.returnPercent,
          totalTrades: backtestResult.metrics.totalTrades,
          winRate: backtestResult.metrics.winRate,
          profitFactor: backtestResult.metrics.profitFactor,
          maxDrawdownPercent: backtestResult.metrics.maxDrawdownPercent,
          sharpeRatio: backtestResult.metrics.sharpeRatio,
          expectancy: backtestResult.metrics.expectancy,
          initialBalance: backtestResult.metrics.initialBalance,
          finalBalance: backtestResult.metrics.finalBalance,
          winningTrades: backtestResult.metrics.winningTrades,
          losingTrades: backtestResult.metrics.losingTrades,
          compositeScore,
        });
        
        console.log(
          `[BacktestOptimizer] ✓ ${combo.strategy} (${combo.riskPercent}%) | ` +
          `Lucro: $${backtestResult.metrics.netProfit.toFixed(2)} | ` +
          `DD: ${backtestResult.metrics.maxDrawdownPercent.toFixed(1)}% | ` +
          `Score: ${compositeScore.toFixed(1)}`
        );
        
      } catch (error) {
        console.error(
          `[BacktestOptimizer] ✗ ${combo.strategy} (${combo.riskPercent}%): ${(error as Error).message}`
        );
      }
      
      completedCombinations++;
      combinationTimes.push(Date.now() - comboStartTime);
    }
    
    // Sort by composite score (descending)
    results.sort((a, b) => b.compositeScore - a.compositeScore);
    
    // Assign ranks
    results.forEach((result, index) => {
      result.rank = index + 1;
    });
    
    const executionTime = Date.now() - startTime;
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[BacktestOptimizer] ✅ OTIMIZAÇÃO CONCLUÍDA");
    console.log(`[BacktestOptimizer] Combinações testadas: ${completedCombinations}/${totalCombinations}`);
    console.log(`[BacktestOptimizer] Tempo total: ${(executionTime / 1000).toFixed(1)}s`);
    if (results.length > 0) {
      console.log(`[BacktestOptimizer] 🥇 Melhor: ${results[0].strategy} (${results[0].riskPercent}%) - $${results[0].netProfit.toFixed(2)}`);
    }
    console.log("═══════════════════════════════════════════════════════════════");
    
    return {
      config: this.config,
      results,
      totalCombinations,
      completedCombinations,
      executionTime,
      bestResult: results.length > 0 ? results[0] : null,
      worstResult: results.length > 0 ? results[results.length - 1] : null,
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createBacktestOptimizer(config: OptimizationConfig): BacktestOptimizer {
  return new BacktestOptimizer(config);
}
