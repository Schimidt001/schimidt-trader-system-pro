/**
 * GridSearchEngine - Motor de Busca em Grade para Otimização de Parâmetros
 * 
 * Implementa Grid Search inteligente para descoberta de parâmetros ótimos:
 * - Gera todas as combinações de parâmetros
 * - Executa backtests em paralelo
 * - Calcula scores de robustez
 * - Rankeia resultados
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { createHash } from "crypto";
import {
  ParameterDefinition,
  ParameterCombination,
  CombinationResult,
  OptimizationConfig,
  OptimizationProgress,
  OptimizationFinalResult,
} from "./types/optimization.types";
import { BacktestMetrics, BacktestResult, BacktestConfig, BacktestStrategyType } from "../types/backtest.types";
import { BacktestRunner } from "../runners/BacktestRunner";

// ============================================================================
// WORKER POOL CLASS
// ============================================================================

/**
 * Pool de workers simples usando Promises
 */
class WorkerPool {
  private workers: number;
  private queue: { task: any; resolve: Function; reject: Function }[] = [];
  private active: number = 0;
  
  constructor(
    workers: number,
    private executor: (task: any) => Promise<any>
  ) {
    this.workers = workers;
  }
  
  async execute(task: any): Promise<any> {
    // Se há workers disponíveis, executar imediatamente
    if (this.active < this.workers) {
      this.active++;
      try {
        return await this.executor(task);
      } finally {
        this.active--;
        this.processQueue();
      }
    }
    
    // Caso contrário, adicionar à fila
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
    });
  }
  
  private async processQueue(): Promise<void> {
    if (this.queue.length === 0 || this.active >= this.workers) {
      return;
    }
    
    const { task, resolve, reject } = this.queue.shift()!;
    this.active++;
    
    try {
      const result = await this.executor(task);
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.active--;
      this.processQueue();
    }
  }
}

// ============================================================================
// GRID SEARCH ENGINE CLASS
// ============================================================================

export class GridSearchEngine {
  private config: OptimizationConfig;
  private progressCallback?: (progress: OptimizationProgress) => void;
  private aborted: boolean = false;
  
  constructor(config: OptimizationConfig) {
    this.config = config;
  }
  
  /**
   * Gerar todas as combinações de parâmetros
   */
  generateCombinations(): ParameterCombination[] {
    // Filtrar apenas parâmetros habilitados e não travados
    const enabledParams = this.config.parameters.filter(p => p.enabled && !p.locked);
    
    console.log(`[GridSearch] Parâmetros ativos: ${enabledParams.length}`);
    
    // Gerar valores possíveis para cada parâmetro
    const parameterValues: Map<string, (number | string | boolean)[]> = new Map();
    
    for (const param of enabledParams) {
      if (param.values && param.values.length > 0) {
        // Lista explícita de valores
        parameterValues.set(param.name, param.values);
      } else if (param.min !== undefined && param.max !== undefined && param.step !== undefined) {
        // Range com step
        const values = this.generateRange(param.min, param.max, param.step);
        parameterValues.set(param.name, values);
      } else {
        // Usar valor default
        parameterValues.set(param.name, [param.default]);
      }
    }
    
    // Adicionar parâmetros travados com seus valores default
    const lockedParams = this.config.parameters.filter(p => p.locked || !p.enabled);
    for (const param of lockedParams) {
      parameterValues.set(param.name, [param.default]);
    }
    
    // Calcular produto cartesiano (todas as combinações)
    const combinations = this.cartesianProduct(parameterValues);
    
    console.log(`[GridSearch] Total de combinações: ${combinations.length}`);
    
    // Verificar limite
    if (this.config.maxCombinations && combinations.length > this.config.maxCombinations) {
      console.warn(`[GridSearch] ⚠️ Limite de ${this.config.maxCombinations} combinações excedido. Amostrando aleatoriamente...`);
      return this.sampleCombinations(combinations, this.config.maxCombinations);
    }
    
    return combinations;
  }
  
  /**
   * Executar Grid Search completo
   */
  async run(): Promise<OptimizationFinalResult> {
    const startTime = Date.now();
    const startedAt = new Date();
    
    this.aborted = false;
    
    const combinations = this.generateCombinations();
    const results: CombinationResult[] = [];
    const errors: string[] = [];
    
    console.log(`[GridSearch] Iniciando teste de ${combinations.length} combinações...`);
    
    // Dividir período in-sample / out-sample
    const { inSamplePeriod, outSamplePeriod } = this.splitPeriod();
    
    console.log(`[GridSearch] Período In-Sample: ${inSamplePeriod.start.toISOString()} - ${inSamplePeriod.end.toISOString()}`);
    console.log(`[GridSearch] Período Out-Sample: ${outSamplePeriod.start.toISOString()} - ${outSamplePeriod.end.toISOString()}`);
    
    // Criar worker pool
    const workerPool = this.createWorkerPool();
    
    let completed = 0;
    let totalTrades = 0;
    
    // Processar combinações
    for (const combination of combinations) {
      if (this.aborted) {
        console.log("[GridSearch] ⚠️ Otimização abortada pelo usuário");
        break;
      }
      
      try {
        // Testar combinação
        const result = await this.testCombination(
          combination,
          inSamplePeriod,
          outSamplePeriod,
          workerPool
        );
        
        results.push(result);
        totalTrades += result.inSample.trades.length;
        if (result.outSample) {
          totalTrades += result.outSample.trades.length;
        }
        
      } catch (error) {
        errors.push(`Erro na combinação ${combination.combinationId}: ${(error as Error).message}`);
      }
      
      completed++;
      
      // Atualizar progresso
      if (this.progressCallback) {
        const elapsed = (Date.now() - startTime) / 1000;
        const avgTimePerCombination = elapsed / completed;
        const remaining = (combinations.length - completed) * avgTimePerCombination;
        
        this.progressCallback({
          phase: "TESTING",
          currentCombination: completed,
          totalCombinations: combinations.length,
          percentComplete: (completed / combinations.length) * 100,
          estimatedTimeRemaining: remaining,
          elapsedTime: elapsed,
          currentSymbol: this.config.symbols[0],
          currentParams: combination.parameters,
          statusMessage: `Testando combinação ${completed}/${combinations.length}`,
        });
      }
      
      // Log de progresso a cada 10%
      if (completed % Math.max(1, Math.floor(combinations.length / 10)) === 0) {
        console.log(`[GridSearch] Progresso: ${completed}/${combinations.length} (${((completed / combinations.length) * 100).toFixed(1)}%)`);
      }
    }
    
    // Rankear resultados
    console.log("[GridSearch] Rankeando resultados...");
    const rankedResults = this.rankResults(results);
    
    const executionTime = (Date.now() - startTime) / 1000;
    
    console.log(`[GridSearch] ✅ Otimização concluída em ${executionTime.toFixed(1)}s`);
    console.log(`[GridSearch] Total de combinações testadas: ${completed}`);
    console.log(`[GridSearch] Total de trades executados: ${totalTrades}`);
    
    return {
      config: this.config,
      totalCombinationsTested: completed,
      totalTradesExecuted: totalTrades,
      executionTimeSeconds: Math.round(executionTime),
      results: rankedResults,
      topResults: rankedResults.slice(0, 10),
      bestResult: rankedResults.length > 0 ? rankedResults[0] : null,
      aborted: this.aborted,
      errors,
      startedAt,
      completedAt: new Date(),
    };
  }
  
  /**
   * Testar uma combinação de parâmetros
   */
  private async testCombination(
    combination: ParameterCombination,
    inSamplePeriod: { start: Date; end: Date },
    outSamplePeriod: { start: Date; end: Date },
    workerPool: WorkerPool
  ): Promise<CombinationResult> {
    // Executar backtest in-sample
    const inSampleResult = await this.runBacktest(
      combination.parameters,
      inSamplePeriod.start,
      inSamplePeriod.end
    );
    
    // Executar backtest out-sample (se validação habilitada)
    let outSampleResult: BacktestResult | undefined;
    
    if (this.config.validation.enabled) {
      outSampleResult = await this.runBacktest(
        combination.parameters,
        outSamplePeriod.start,
        outSamplePeriod.end
      );
    }
    
    // Calcular score de robustez
    const robustnessScore = this.calculateRobustnessScore(
      inSampleResult.metrics,
      outSampleResult?.metrics
    );
    
    // Calcular degradação
    const degradationPercent = outSampleResult
      ? this.calculateDegradation(inSampleResult.metrics, outSampleResult.metrics)
      : 0;
    
    // Gerar warnings
    const warnings = this.generateWarnings(
      inSampleResult.metrics,
      outSampleResult?.metrics
    );
    
    // Determinar se é recomendado
    const isRecommended = this.isRecommended(robustnessScore, degradationPercent, warnings);
    
    return {
      combination,
      inSample: {
        metrics: inSampleResult.metrics,
        trades: inSampleResult.trades,
        equityCurve: inSampleResult.equityCurve,
      },
      outSample: outSampleResult ? {
        metrics: outSampleResult.metrics,
        trades: outSampleResult.trades,
        equityCurve: outSampleResult.equityCurve,
      } : undefined,
      robustnessScore,
      degradationPercent,
      isRecommended,
      warnings,
    };
  }
  
  /**
   * Executar backtest com parâmetros específicos
   */
  private async runBacktest(
    parameters: Record<string, number | string | boolean>,
    startDate: Date,
    endDate: Date
  ): Promise<BacktestResult> {
    const config: BacktestConfig = {
      symbol: this.config.symbols[0], // Por enquanto, um símbolo por vez
      strategy: this.config.strategyType,
      startDate,
      endDate,
      dataPath: "./data/candles",
      timeframes: ["M5", "M15", "H1"],
      initialBalance: 10000,
      leverage: 500,
      commission: 7,
      slippage: 0.5,
      spread: 1.0,
      riskPercent: (parameters.riskPercentage as number) || 2,
      maxPositions: (parameters.maxOpenTrades as number) || 3,
      maxSpread: (parameters.maxSpreadPips as number) || 3,
    };
    
    const runner = new BacktestRunner(config);
    
    // Injetar parâmetros customizados se o método existir
    // Nota: Isso requer que BacktestRunner tenha o método runWithParameters
    return await runner.run();
  }
  
  /**
   * Calcular score de robustez (0-100)
   */
  private calculateRobustnessScore(
    inSample: BacktestMetrics,
    outSample?: BacktestMetrics
  ): number {
    let score = 0;
    
    // Componente 1: Performance in-sample (40%)
    for (const objective of this.config.objectives) {
      const value = this.getMetricValue(inSample, objective.metric);
      const normalizedValue = this.normalizeMetric(objective.metric, value);
      
      if (objective.target === "MAXIMIZE") {
        score += normalizedValue * objective.weight * 0.4;
      } else {
        score += (100 - normalizedValue) * objective.weight * 0.4;
      }
    }
    
    // Componente 2: Performance out-sample (40%)
    if (outSample) {
      for (const objective of this.config.objectives) {
        const value = this.getMetricValue(outSample, objective.metric);
        const normalizedValue = this.normalizeMetric(objective.metric, value);
        
        if (objective.target === "MAXIMIZE") {
          score += normalizedValue * objective.weight * 0.4;
        } else {
          score += (100 - normalizedValue) * objective.weight * 0.4;
        }
      }
      
      // Componente 3: Consistência (20%)
      const degradation = this.calculateDegradation(inSample, outSample);
      const consistencyScore = Math.max(0, 100 - degradation * 2);
      score += consistencyScore * 0.2;
    } else {
      // Sem out-sample, usar apenas in-sample com penalidade
      score *= 0.6; // Penalidade de 40%
    }
    
    // Aplicar thresholds
    for (const objective of this.config.objectives) {
      if (objective.threshold) {
        const value = outSample
          ? this.getMetricValue(outSample, objective.metric)
          : this.getMetricValue(inSample, objective.metric);
        
        if (objective.target === "MAXIMIZE" && value < objective.threshold) {
          score *= 0.5; // Penalidade de 50%
        } else if (objective.target === "MINIMIZE" && value > objective.threshold) {
          score *= 0.5;
        }
      }
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * Calcular degradação percentual entre in-sample e out-sample
   */
  private calculateDegradation(inSample: BacktestMetrics, outSample: BacktestMetrics): number {
    // Focar em Sharpe Ratio como métrica principal de degradação
    const inSampleSharpe = inSample.sharpeRatio;
    const outSampleSharpe = outSample.sharpeRatio;
    
    if (inSampleSharpe === 0) return 100;
    
    const degradation = ((inSampleSharpe - outSampleSharpe) / Math.abs(inSampleSharpe)) * 100;
    
    return Math.max(0, degradation);
  }
  
  /**
   * Gerar warnings baseado nas métricas
   */
  private generateWarnings(inSample: BacktestMetrics, outSample?: BacktestMetrics): string[] {
    const warnings: string[] = [];
    
    // Warning: Poucos trades
    if (inSample.totalTrades < 30) {
      warnings.push("Amostra pequena: menos de 30 trades no in-sample");
    }
    
    // Warning: Winrate muito alto (suspeita de overfitting)
    if (inSample.winRate > 80) {
      warnings.push("Winrate muito alto (>80%) - possível overfitting");
    }
    
    // Warning: Drawdown muito alto
    if (inSample.maxDrawdownPercent > 30) {
      warnings.push("Drawdown máximo acima de 30%");
    }
    
    // Warning: Degradação alta
    if (outSample) {
      const degradation = this.calculateDegradation(inSample, outSample);
      if (degradation > 30) {
        warnings.push(`Alta degradação out-of-sample (${degradation.toFixed(1)}%)`);
      }
      
      // Warning: Sharpe inverteu sinal
      if (inSample.sharpeRatio > 0 && outSample.sharpeRatio < 0) {
        warnings.push("Sharpe Ratio inverteu sinal no out-of-sample");
      }
    }
    
    return warnings;
  }
  
  /**
   * Determinar se a combinação é recomendada
   */
  private isRecommended(robustnessScore: number, degradationPercent: number, warnings: string[]): boolean {
    // Critérios para recomendação:
    // 1. Score de robustez > 60
    // 2. Degradação < 30%
    // 3. Sem warnings críticos
    
    if (robustnessScore < 60) return false;
    if (degradationPercent > 30) return false;
    
    const criticalWarnings = warnings.filter(w =>
      w.includes("overfitting") ||
      w.includes("inverteu sinal")
    );
    
    if (criticalWarnings.length > 0) return false;
    
    return true;
  }
  
  /**
   * Rankear resultados por score de robustez
   */
  private rankResults(results: CombinationResult[]): CombinationResult[] {
    // Ordenar por robustnessScore decrescente
    const sorted = [...results].sort((a, b) => b.robustnessScore - a.robustnessScore);
    
    // Atribuir ranks
    sorted.forEach((result, index) => {
      result.rank = index + 1;
    });
    
    return sorted;
  }
  
  /**
   * Abortar otimização
   */
  abort(): void {
    this.aborted = true;
    console.log("[GridSearch] Solicitação de abort recebida");
  }
  
  /**
   * Definir callback de progresso
   */
  setProgressCallback(callback: (progress: OptimizationProgress) => void): void {
    this.progressCallback = callback;
  }
  
  // =========================================================================
  // FUNÇÕES AUXILIARES
  // =========================================================================
  
  private generateRange(min: number, max: number, step: number): number[] {
    const values: number[] = [];
    for (let v = min; v <= max; v += step) {
      // Arredondar para evitar problemas de ponto flutuante
      values.push(Math.round(v * 1000) / 1000);
    }
    return values;
  }
  
  private cartesianProduct(paramValues: Map<string, (number | string | boolean)[]>): ParameterCombination[] {
    const keys = Array.from(paramValues.keys());
    const values = Array.from(paramValues.values());
    
    if (keys.length === 0) {
      return [];
    }
    
    let combinations: (number | string | boolean)[][] = [[]];
    
    for (const valueArray of values) {
      const temp: (number | string | boolean)[][] = [];
      for (const combination of combinations) {
        for (const value of valueArray) {
          temp.push([...combination, value]);
        }
      }
      combinations = temp;
    }
    
    return combinations.map(combo => {
      const params: Record<string, number | string | boolean> = {};
      keys.forEach((key, i) => {
        params[key] = combo[i];
      });
      
      return {
        combinationId: this.hashParameters(params),
        parameters: params,
      };
    });
  }
  
  private hashParameters(params: Record<string, number | string | boolean>): string {
    const hash = createHash("sha256");
    hash.update(JSON.stringify(params));
    return hash.digest("hex").substring(0, 16);
  }
  
  private sampleCombinations(combinations: ParameterCombination[], max: number): ParameterCombination[] {
    const shuffled = [...combinations].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, max);
  }
  
  private splitPeriod(): {
    inSamplePeriod: { start: Date; end: Date };
    outSamplePeriod: { start: Date; end: Date };
  } {
    const totalDays = Math.floor(
      (this.config.endDate.getTime() - this.config.startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const inSampleDays = Math.floor(totalDays * this.config.validation.inSampleRatio);
    
    const inSampleEnd = new Date(
      this.config.startDate.getTime() + inSampleDays * 24 * 60 * 60 * 1000
    );
    
    return {
      inSamplePeriod: {
        start: this.config.startDate,
        end: inSampleEnd,
      },
      outSamplePeriod: {
        start: new Date(inSampleEnd.getTime() + 24 * 60 * 60 * 1000), // Dia seguinte
        end: this.config.endDate,
      },
    };
  }
  
  private getMetricValue(metrics: BacktestMetrics, metricName: string): number {
    return (metrics as any)[metricName] || 0;
  }
  
  private normalizeMetric(metricName: string, value: number): number {
    // Normalizar métricas para escala 0-100
    const normalizers: Record<string, (v: number) => number> = {
      sharpeRatio: (v) => Math.min(100, Math.max(0, (v + 2) * 25)), // -2 a 2 -> 0 a 100
      profitFactor: (v) => Math.min(100, Math.max(0, (v - 1) * 50)), // 1 a 3 -> 0 a 100
      winRate: (v) => v, // Já é 0-100
      maxDrawdownPercent: (v) => Math.max(0, 100 - v * 2), // Inverter: 0% DD = 100 score
      calmarRatio: (v) => Math.min(100, Math.max(0, v * 20)), // 0 a 5 -> 0 a 100
      sortinoRatio: (v) => Math.min(100, Math.max(0, (v + 2) * 25)),
      recoveryFactor: (v) => Math.min(100, Math.max(0, v * 10)),
    };
    
    const normalizer = normalizers[metricName];
    return normalizer ? normalizer(value) : Math.min(100, Math.max(0, value));
  }
  
  private createWorkerPool(): WorkerPool {
    return new WorkerPool(this.config.parallelWorkers, async (task) => {
      // Executor de tarefas - por enquanto, execução síncrona
      return task;
    });
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createGridSearchEngine(config: OptimizationConfig): GridSearchEngine {
  return new GridSearchEngine(config);
}
