/**
 * MonteCarloSimulator - Simulador Monte Carlo para Análise de Robustez
 * 
 * IMPLEMENTAÇÃO WP4: Monte Carlo (robustez) com testes
 * 
 * Implementa simulação Monte Carlo com:
 * - RNG seedado para reprodutibilidade (P0 - Determinismo)
 * - Block bootstrap (não shuffle puro) para preservar autocorrelação
 * - Cálculo de intervalos de confiança
 * - Probabilidade de ruína
 * - Percentis de performance
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { SeededRNG, createSeededRNG } from "../utils/SeededRNG";
import { BacktestTrade, BacktestMetrics } from "../types/backtest.types";
import {
  MonteCarloConfig,
  MonteCarloSimulation,
  MonteCarloResult,
  ConfidenceInterval,
  ValidationProgress,
} from "./types/validation.types";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Resultado de uma única simulação
 */
interface SimulationRun {
  runNumber: number;
  finalEquity: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  totalReturn: number;
  sharpeRatio: number;
  trades: number[];
  equityCurve: number[];
  ruined: boolean;
}

// ============================================================================
// MONTE CARLO SIMULATOR CLASS
// ============================================================================

export class MonteCarloSimulator {
  private config: MonteCarloConfig;
  private rng: SeededRNG;
  private progressCallback?: (progress: ValidationProgress) => void;
  
  constructor(config: MonteCarloConfig) {
    this.config = config;
    // Criar RNG seedado para determinismo
    this.rng = createSeededRNG(config.seed, "xorshift128");
    
    console.log(`[MonteCarlo] Inicializado com seed: ${config.seed}`);
  }
  
  /**
   * Definir callback de progresso
   */
  setProgressCallback(callback: (progress: ValidationProgress) => void): void {
    this.progressCallback = callback;
  }
  
  /**
   * Executar simulação Monte Carlo completa
   */
  async simulate(trades: BacktestTrade[]): Promise<MonteCarloResult> {
    const startTime = Date.now();
    
    console.log(`[MonteCarlo] Iniciando ${this.config.simulations} simulações...`);
    console.log(`[MonteCarlo] Trades originais: ${trades.length}`);
    console.log(`[MonteCarlo] Método: ${this.config.method}`);
    
    if (trades.length < 10) {
      throw new Error("Mínimo de 10 trades necessários para Monte Carlo");
    }
    
    // Extrair retornos dos trades
    const returns = trades.map(t => t.profit);
    
    // Executar simulações
    const simulations: SimulationRun[] = [];
    
    for (let i = 0; i < this.config.simulations; i++) {
      const simulation = this.runSingleSimulation(returns, i + 1);
      simulations.push(simulation);
      
      // Atualizar progresso
      if (this.progressCallback && i % 100 === 0) {
        this.progressCallback({
          validationType: "MONTE_CARLO",
          phase: "SIMULATING",
          percentComplete: (i / this.config.simulations) * 100,
          currentItem: i + 1,
          totalItems: this.config.simulations,
          statusMessage: `Simulação ${i + 1}/${this.config.simulations}`,
          estimatedTimeRemaining: 0,
        });
      }
    }
    
    // Calcular estatísticas
    const finalEquities = simulations.map(s => s.finalEquity);
    const maxDrawdowns = simulations.map(s => s.maxDrawdownPercent);
    const totalReturns = simulations.map(s => s.totalReturn);
    const sharpeRatios = simulations.map(s => s.sharpeRatio);
    
    // Calcular intervalos de confiança
    const equityCI = this.calculateConfidenceInterval(finalEquities, this.config.confidenceLevel);
    const drawdownCI = this.calculateConfidenceInterval(maxDrawdowns, this.config.confidenceLevel);
    const returnCI = this.calculateConfidenceInterval(totalReturns, this.config.confidenceLevel);
    const sharpeCI = this.calculateConfidenceInterval(sharpeRatios, this.config.confidenceLevel);
    
    // Calcular probabilidade de ruína
    const ruinedCount = simulations.filter(s => s.ruined).length;
    const ruinProbability = (ruinedCount / this.config.simulations) * 100;
    
    // Calcular percentis
    const percentiles = this.calculatePercentiles(finalEquities);
    
    // Identificar melhores e piores cenários
    const sortedByEquity = [...simulations].sort((a, b) => a.finalEquity - b.finalEquity);
    const worstScenarios = sortedByEquity.slice(0, 5).map(s => ({
      runNumber: s.runNumber,
      finalEquity: s.finalEquity,
      maxDrawdown: s.maxDrawdownPercent,
      totalReturn: s.totalReturn,
    }));
    const bestScenarios = sortedByEquity.slice(-5).reverse().map(s => ({
      runNumber: s.runNumber,
      finalEquity: s.finalEquity,
      maxDrawdown: s.maxDrawdownPercent,
      totalReturn: s.totalReturn,
    }));
    
    // Estatísticas gerais
    const statistics = {
      mean: this.mean(finalEquities),
      median: this.percentile(finalEquities, 50),
      stdDev: this.standardDeviation(finalEquities),
      skewness: this.skewness(finalEquities),
      kurtosis: this.kurtosis(finalEquities),
    };
    
    const executionTime = (Date.now() - startTime) / 1000;
    
    console.log(`[MonteCarlo] ✅ Simulação concluída em ${executionTime.toFixed(1)}s`);
    console.log(`[MonteCarlo] Probabilidade de ruína: ${ruinProbability.toFixed(2)}%`);
    console.log(`[MonteCarlo] IC ${this.config.confidenceLevel}% Equity: [${equityCI.lower.toFixed(2)}, ${equityCI.upper.toFixed(2)}]`);
    
    return {
      seed: this.config.seed,
      simulations: this.config.simulations,
      method: this.config.method,
      confidenceLevel: this.config.confidenceLevel,
      
      // Intervalos de confiança
      equityCI,
      drawdownCI,
      returnCI,
      sharpeCI,
      
      // Probabilidade de ruína
      ruinProbability,
      ruinThreshold: this.config.ruinThreshold,
      
      // Percentis
      percentiles,
      
      // Cenários
      worstScenarios,
      bestScenarios,
      
      // Estatísticas
      statistics,
      
      // Metadados
      originalTrades: trades.length,
      executionTimeSeconds: executionTime,
    };
  }
  
  /**
   * Executar uma única simulação
   */
  private runSingleSimulation(returns: number[], runNumber: number): SimulationRun {
    // Gerar sequência de retornos baseada no método
    let simulatedReturns: number[];
    
    switch (this.config.method) {
      case "BLOCK_BOOTSTRAP":
        simulatedReturns = this.blockBootstrap(returns);
        break;
      case "TRADE_RESAMPLING":
        simulatedReturns = this.tradeResampling(returns);
        break;
      case "RANDOMIZE_ORDER":
      default:
        simulatedReturns = this.randomizeOrder(returns);
    }
    
    // Simular equity curve
    const { equityCurve, maxDrawdown, maxDrawdownPercent, ruined } = this.simulateEquityCurve(simulatedReturns);
    
    const finalEquity = equityCurve[equityCurve.length - 1];
    const totalReturn = ((finalEquity - this.config.initialBalance) / this.config.initialBalance) * 100;
    const sharpeRatio = this.calculateSimulatedSharpe(simulatedReturns);
    
    return {
      runNumber,
      finalEquity,
      maxDrawdown,
      maxDrawdownPercent,
      totalReturn,
      sharpeRatio,
      trades: simulatedReturns,
      equityCurve,
      ruined,
    };
  }
  
  /**
   * Block Bootstrap - preserva autocorrelação
   * 
   * Divide os trades em blocos e reamostra blocos inteiros
   * para preservar a estrutura temporal dos retornos.
   */
  private blockBootstrap(returns: number[]): number[] {
    const blockSize = this.config.blockSize || Math.max(5, Math.floor(Math.sqrt(returns.length)));
    const numBlocks = Math.ceil(returns.length / blockSize);
    
    const result: number[] = [];
    
    // Selecionar blocos aleatoriamente
    for (let i = 0; i < numBlocks; i++) {
      const startIndex = this.rng.randomInt(0, returns.length - blockSize);
      
      for (let j = 0; j < blockSize && result.length < returns.length; j++) {
        result.push(returns[startIndex + j]);
      }
    }
    
    return result.slice(0, returns.length);
  }
  
  /**
   * Trade Resampling - reamostragem com reposição
   */
  private tradeResampling(returns: number[]): number[] {
    const result: number[] = [];
    
    for (let i = 0; i < returns.length; i++) {
      const index = this.rng.randomInt(0, returns.length - 1);
      result.push(returns[index]);
    }
    
    return result;
  }
  
  /**
   * Randomize Order - embaralha ordem dos trades
   */
  private randomizeOrder(returns: number[]): number[] {
    return this.rng.shuffle(returns);
  }
  
  /**
   * Simular curva de equity
   */
  private simulateEquityCurve(returns: number[]): {
    equityCurve: number[];
    maxDrawdown: number;
    maxDrawdownPercent: number;
    ruined: boolean;
  } {
    const equityCurve: number[] = [this.config.initialBalance];
    let currentEquity = this.config.initialBalance;
    let peakEquity = currentEquity;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    let ruined = false;
    
    for (const returnValue of returns) {
      currentEquity += returnValue;
      equityCurve.push(currentEquity);
      
      // Atualizar peak
      if (currentEquity > peakEquity) {
        peakEquity = currentEquity;
      }
      
      // Calcular drawdown
      const drawdown = peakEquity - currentEquity;
      const drawdownPercent = peakEquity > 0 ? (drawdown / peakEquity) * 100 : 0;
      
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = drawdownPercent;
      }
      
      // Verificar ruína
      if (drawdownPercent >= this.config.ruinThreshold) {
        ruined = true;
      }
    }
    
    return { equityCurve, maxDrawdown, maxDrawdownPercent, ruined };
  }
  
  /**
   * Calcular Sharpe Ratio simulado
   */
  private calculateSimulatedSharpe(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    const avgReturn = this.mean(returns);
    const stdReturn = this.standardDeviation(returns);
    
    if (stdReturn === 0) return avgReturn > 0 ? Infinity : 0;
    
    // Anualizar (assumindo ~252 trades por ano)
    const annualizationFactor = Math.sqrt(252 / returns.length);
    return (avgReturn / stdReturn) * annualizationFactor;
  }
  
  /**
   * Calcular intervalo de confiança
   */
  private calculateConfidenceInterval(values: number[], confidenceLevel: number): ConfidenceInterval {
    const sorted = [...values].sort((a, b) => a - b);
    const alpha = (100 - confidenceLevel) / 2;
    
    const lowerIndex = Math.floor((alpha / 100) * sorted.length);
    const upperIndex = Math.floor(((100 - alpha) / 100) * sorted.length) - 1;
    
    return {
      lower: sorted[lowerIndex],
      upper: sorted[upperIndex],
      mean: this.mean(values),
      median: this.percentile(values, 50),
    };
  }
  
  /**
   * Calcular percentis
   */
  private calculatePercentiles(values: number[]): Record<string, number> {
    return {
      p1: this.percentile(values, 1),
      p5: this.percentile(values, 5),
      p10: this.percentile(values, 10),
      p25: this.percentile(values, 25),
      p50: this.percentile(values, 50),
      p75: this.percentile(values, 75),
      p90: this.percentile(values, 90),
      p95: this.percentile(values, 95),
      p99: this.percentile(values, 99),
    };
  }
  
  /**
   * Calcular percentil
   */
  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) return sorted[lower];
    
    const fraction = index - lower;
    return sorted[lower] + fraction * (sorted[upper] - sorted[lower]);
  }
  
  /**
   * Calcular média
   */
  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
  
  /**
   * Calcular desvio padrão
   */
  private standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    
    const avg = this.mean(values);
    const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(this.mean(squaredDiffs));
  }
  
  /**
   * Calcular skewness (assimetria)
   */
  private skewness(values: number[]): number {
    if (values.length < 3) return 0;
    
    const n = values.length;
    const avg = this.mean(values);
    const std = this.standardDeviation(values);
    
    if (std === 0) return 0;
    
    const sum = values.reduce((acc, v) => acc + Math.pow((v - avg) / std, 3), 0);
    return (n / ((n - 1) * (n - 2))) * sum;
  }
  
  /**
   * Calcular kurtosis (curtose)
   */
  private kurtosis(values: number[]): number {
    if (values.length < 4) return 0;
    
    const n = values.length;
    const avg = this.mean(values);
    const std = this.standardDeviation(values);
    
    if (std === 0) return 0;
    
    const sum = values.reduce((acc, v) => acc + Math.pow((v - avg) / std, 4), 0);
    const k = ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum;
    const correction = (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
    
    return k - correction;
  }
  
  /**
   * Obter seed usado
   */
  getSeed(): number {
    return this.config.seed;
  }
  
  /**
   * Resetar RNG para reproduzir simulação
   */
  reset(): void {
    this.rng.reset();
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Criar simulador Monte Carlo
 */
export function createMonteCarloSimulator(config: MonteCarloConfig): MonteCarloSimulator {
  return new MonteCarloSimulator(config);
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_MONTE_CARLO_CONFIG: Omit<MonteCarloConfig, "seed"> = {
  simulations: 1000,
  method: "BLOCK_BOOTSTRAP",
  confidenceLevel: 95,
  initialBalance: 10000,
  ruinThreshold: 50, // 50% drawdown = ruína
  blockSize: 10,
};

// ============================================================================
// EXPORTS
// ============================================================================

export default MonteCarloSimulator;
