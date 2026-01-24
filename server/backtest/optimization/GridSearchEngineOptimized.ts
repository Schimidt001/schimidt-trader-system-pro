/**
 * GridSearchEngineOptimized - Motor de Busca em Grade OTIMIZADO para Memória
 * 
 * CORREÇÃO OOM: Versão refatorada do GridSearchEngine com:
 * - Top-N heap para manter apenas os melhores resultados
 * - Liberação de memória após cada combinação
 * - Monitoramento de memória integrado
 * - Processamento em lotes com GC entre lotes
 * - Iteração lazy (Generator) para evitar materialização de combinações
 * - Multitarefa cooperativa para evitar bloqueio do Event Loop
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 2.1.0 - Memory Optimized & Generator Based
 */

import { createHash } from "crypto";
import { optimizationLogger } from "../utils/LabLogger";
import { memoryManager, hasEnoughMemory } from "../utils/MemoryManager";
import { sanitizeMetrics } from "../utils/LabErrors";
import {
  ParameterDefinition,
  ParameterCombination,
  CombinationResult,
  OptimizationConfig,
  OptimizationProgress,
  OptimizationFinalResult,
} from "./types/optimization.types";
import { BacktestMetrics, BacktestResult, BacktestConfig, BacktestStrategyType } from "../types/backtest.types";
import { LabBacktestRunner } from "../runners/LabBacktestRunner";
import { LabBacktestRunnerOptimized } from "../runners/LabBacktestRunnerOptimized";
import { candleDataCache } from "../utils/CandleDataCache";
import { yieldToEventLoop } from "../utils/AsyncUtils";

// ============================================================================
// CONSTANTS - MEMORY OPTIMIZATION
// ============================================================================

/** Número máximo de resultados a manter em memória */
const MAX_TOP_RESULTS = 50;

/** Intervalo para forçar GC (em combinações) */
const GC_INTERVAL = 20;

/** Flag para usar cache compartilhado de candles */
const USE_SHARED_CACHE = true;

// ============================================================================
// TOP-N HEAP CLASS
// ============================================================================

/**
 * Min-Heap para manter apenas os Top-N resultados por score
 * CORREÇÃO OOM: Evita acumular todos os resultados em memória
 */
class TopNHeap {
  private heap: CombinationResult[] = [];
  private maxSize: number;

  constructor(maxSize: number = MAX_TOP_RESULTS) {
    this.maxSize = maxSize;
  }

  /**
   * Adiciona resultado ao heap, mantendo apenas os melhores
   */
  add(result: CombinationResult): void {
    if (this.heap.length < this.maxSize) {
      this.heap.push(result);
      this.bubbleUp(this.heap.length - 1);
    } else if (result.robustnessScore > this.heap[0].robustnessScore) {
      // Novo resultado é melhor que o pior do heap
      this.heap[0] = result;
      this.bubbleDown(0);
    }
    // Se não for melhor, descartamos (não ocupa memória)
  }

  /**
   * Retorna todos os resultados ordenados por score (decrescente)
   */
  getResults(): CombinationResult[] {
    return [...this.heap].sort((a, b) => b.robustnessScore - a.robustnessScore);
  }

  /**
   * Retorna o melhor resultado
   */
  getBest(): CombinationResult | null {
    if (this.heap.length === 0) return null;
    return this.getResults()[0];
  }

  /**
   * Retorna o tamanho atual do heap
   */
  size(): number {
    return this.heap.length;
  }

  /**
   * Limpa o heap
   */
  clear(): void {
    this.heap = [];
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex].robustnessScore <= this.heap[index].robustnessScore) {
        break;
      }
      [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (leftChild < length && this.heap[leftChild].robustnessScore < this.heap[smallest].robustnessScore) {
        smallest = leftChild;
      }
      if (rightChild < length && this.heap[rightChild].robustnessScore < this.heap[smallest].robustnessScore) {
        smallest = rightChild;
      }
      if (smallest === index) break;

      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }
}

// ============================================================================
// GRID SEARCH ENGINE OPTIMIZED CLASS
// ============================================================================

export class GridSearchEngineOptimized {
  private config: OptimizationConfig;
  private progressCallback?: (progress: OptimizationProgress) => void;
  private aborted: boolean = false;
  private topNHeap: TopNHeap;

  constructor(config: OptimizationConfig) {
    this.config = config;
    this.topNHeap = new TopNHeap(MAX_TOP_RESULTS);
  }

  /**
   * Calcular o número total de combinações (sem gerar o array)
   */
  countCombinations(): number {
    const enabledParams = this.config.parameters.filter(p => p.enabled && !p.locked);
    
    let count = 1;

    for (const param of enabledParams) {
      if (param.values && param.values.length > 0) {
        count *= param.values.length;
      } else if (param.min !== undefined && param.max !== undefined && param.step !== undefined) {
        const steps = Math.floor((param.max - param.min) / param.step) + 1;
        count *= Math.max(1, steps);
      }
    }

    return count;
  }

  /**
   * Gerador lazy de combinações de parâmetros
   * CORREÇÃO OOM: Evita materializar um array gigante de combinações
   */
  *generateCombinationsGenerator(): Generator<ParameterCombination> {
    const enabledParams = this.config.parameters.filter(p => p.enabled && !p.locked);
    const lockedParams = this.config.parameters.filter(p => p.locked || !p.enabled);
    
    // Preparar valores para cada parâmetro habilitado
    const paramNames: string[] = [];
    const paramValuesList: (number | string | boolean)[][] = [];
    
    for (const param of enabledParams) {
      paramNames.push(param.name);
      if (param.values && param.values.length > 0) {
        paramValuesList.push(param.values);
      } else if (param.min !== undefined && param.max !== undefined && param.step !== undefined) {
        paramValuesList.push(this.generateRange(param.min, param.max, param.step));
      } else {
        paramValuesList.push([param.default]);
      }
    }
    
    // Mapa de valores fixos para parâmetros travados
    const fixedParams: Record<string, number | string | boolean> = {};
    for (const param of lockedParams) {
      fixedParams[param.name] = param.default;
    }
    
    // Gerar produto cartesiano de forma lazy
    // Usamos índices para iterar sem recursão profunda
    const indices = new Array(paramValuesList.length).fill(0);
    const lengths = paramValuesList.map(list => list.length);
    let done = false;
    
    // Caso especial: nenhum parâmetro habilitado
    if (paramValuesList.length === 0) {
      const combinationId = this.hashParameters(fixedParams);
      yield { combinationId, parameters: { ...fixedParams } };
      return;
    }
    
    let count = 0;
    const maxCombinations = this.config.maxCombinations || Number.MAX_SAFE_INTEGER;

    while (!done && count < maxCombinations) {
      // Construir combinação atual
      const currentParams: Record<string, number | string | boolean> = { ...fixedParams };

      for (let i = 0; i < paramNames.length; i++) {
        currentParams[paramNames[i]] = paramValuesList[i][indices[i]];
      }

      const combinationId = this.hashParameters(currentParams);
      yield { combinationId, parameters: currentParams };
      count++;

      // Avançar índices
      let i = indices.length - 1;
      while (i >= 0) {
        indices[i]++;
        if (indices[i] < lengths[i]) {
          break;
        }
        indices[i] = 0;
        i--;
      }

      if (i < 0) {
        done = true;
      }
    }
  }

  /**
   * Executar Grid Search OTIMIZADO
   * 
   * CORREÇÃO OOM: 
   * - Usa TopNHeap para manter apenas os melhores resultados
   * - Libera memória após cada combinação
   * - Força GC periodicamente
   * - Monitora uso de memória
   * - Usa Generator para evitar array gigante
   * - Usa Yield para não bloquear Event Loop
   */
  async run(): Promise<OptimizationFinalResult> {
    const startTime = Date.now();
    const startedAt = new Date();
    
    this.aborted = false;
    this.topNHeap.clear();
    
    // Iniciar monitoramento de memória
    memoryManager.startMonitoring();
    memoryManager.logMemoryStats("GridSearchOpt - Início");
    
    optimizationLogger.info("CHECKPOINT: GridSearchOpt.started", "GridSearchOpt");

    // Calcular total estimado (sem gerar array)
    const totalCombinations = this.countCombinations();
    const effectiveCombinations = this.config.maxCombinations
      ? Math.min(totalCombinations, this.config.maxCombinations)
      : totalCombinations;

    optimizationLogger.info(`Total estimado de combinações: ${totalCombinations}`, "GridSearchOpt");

    // Guard Rail: maxCombinations
    if (this.config.maxCombinations && totalCombinations > this.config.maxCombinations * 2) {
      // Se for muito maior que o limite, avisa que será truncado
      optimizationLogger.warn(`Combinações (${totalCombinations}) excedem limite. Serão processadas apenas as primeiras ${this.config.maxCombinations}`, "GridSearchOpt");
    }

    const errors: string[] = [];
    
    optimizationLogger.startOperation("Grid Search Otimizado", { 
      combinacoes: effectiveCombinations,
      topN: MAX_TOP_RESULTS,
    });
    
    const { inSamplePeriod, outSamplePeriod } = this.splitPeriod();
    
    // CORREÇÃO OOM: Pré-carregar dados no cache compartilhado
    const dataPath = this.config.dataPath || "./data/candles";
    if (USE_SHARED_CACHE) {
      optimizationLogger.info("Pré-carregando dados no cache compartilhado...", "GridSearchOpt");
      candleDataCache.preload(
        dataPath,
        this.config.symbols,
        this.config.timeframes || ["M5", "M15", "H1"],
        this.config.startDate,
        this.config.endDate
      );
      candleDataCache.logStats();
    }
    
    optimizationLogger.info("CHECKPOINT: GridSearchOpt.data_loaded", "GridSearchOpt");
    optimizationLogger.info(`In-Sample: ${inSamplePeriod.start.toISOString().split("T")[0]} - ${inSamplePeriod.end.toISOString().split("T")[0]}`, "GridSearchOpt");
    
    let completed = 0;
    let totalTrades = 0;
    let firstIterationLogged = false;
    let progress5PercentLogged = false;
    
    // Usar Generator para iterar combinações lazy
    const generator = this.generateCombinationsGenerator();

    for (const combination of generator) {
      if (this.aborted) {
        optimizationLogger.warn("Otimização abortada pelo usuário", "GridSearchOpt");
        break;
      }
      
      // COOPERATIVE MULTITASKING: Ceder controle ao Event Loop
      // A cada X iterações para não bloquear servidor
      if (completed % 5 === 0) {
        await yieldToEventLoop();
      }

      // Verificar memória antes de processar
      if (!hasEnoughMemory(30)) {
        optimizationLogger.warn("Memória baixa detectada, forçando GC...", "GridSearchOpt");
        memoryManager.tryFreeMemory();
        
        // Se ainda não há memória suficiente, aguardar (backoff)
        if (!hasEnoughMemory(20)) {
          await yieldToEventLoop(); // Dar tempo para GC
          memoryManager.tryFreeMemory();

          if (!hasEnoughMemory(15)) {
             optimizationLogger.error("Memória insuficiente para continuar", undefined, "GridSearchOpt");
             errors.push("OOM: Memória insuficiente para continuar processamento");
             break;
          }
        }
      }
      
      try {
        // Testar combinação
        const result = await this.testCombinationLightweight(
          combination,
          inSamplePeriod,
          outSamplePeriod
        );
        
        // Adicionar ao heap (mantém apenas Top-N)
        this.topNHeap.add(result);
        totalTrades += result.inSample.trades.length;
        if (result.outSample) {
          totalTrades += result.outSample.trades.length;
        }
        
        // CORREÇÃO OOM: Limpar referências pesadas do resultado
        // Mantemos apenas métricas, não trades/equityCurve
        result.inSample.trades = [];
        result.inSample.equityCurve = [];
        if (result.outSample) {
          result.outSample.trades = [];
          result.outSample.equityCurve = [];
        }
        
      } catch (error) {
        errors.push(`Erro na combinação ${combination.combinationId}: ${(error as Error).message}`);
      }
      
      completed++;
      
      // CHECKPOINT: first_iteration
      if (!firstIterationLogged && completed === 1) {
        optimizationLogger.info(`CHECKPOINT: GridSearchOpt.first_iteration | combination=1`, "GridSearchOpt");
        firstIterationLogged = true;
      }
      
      const percentComplete = (completed / effectiveCombinations) * 100;
      
      // CHECKPOINT: progress_5_percent
      if (!progress5PercentLogged && percentComplete >= 5) {
        optimizationLogger.info(`CHECKPOINT: GridSearchOpt.progress_5_percent | ${percentComplete.toFixed(1)}%`, "GridSearchOpt");
        progress5PercentLogged = true;
      }
      
      // Forçar GC periodicamente
      if (completed % GC_INTERVAL === 0) {
        memoryManager.tryFreeMemory();
      }
      
      // Atualizar progresso
      if (this.progressCallback) {
        const elapsed = (Date.now() - startTime) / 1000;
        const avgTimePerCombination = completed > 0 ? elapsed / completed : 0;
        const remaining = (effectiveCombinations - completed) * avgTimePerCombination;
        
        this.progressCallback({
          phase: "TESTING",
          currentCombination: completed,
          totalCombinations: effectiveCombinations,
          percentComplete,
          estimatedTimeRemaining: remaining,
          elapsedTime: elapsed,
          currentSymbol: this.config.symbols[0],
          currentParams: combination.parameters,
          statusMessage: `Testando combinação ${completed}/${effectiveCombinations}`,
        });
      }
      
      // Log de progresso usando throttling
      optimizationLogger.progress(completed, effectiveCombinations, "Testando combinações", "GridSearchOpt");
    }
    
    // Obter resultados finais do heap
    const rankedResults = this.topNHeap.getResults();
    
    // Atribuir ranks
    rankedResults.forEach((result, index) => {
      result.rank = index + 1;
    });
    
    const executionTime = (Date.now() - startTime) / 1000;
    
    // Log final de memória
    memoryManager.logMemoryStats("GridSearchOpt - Fim");
    memoryManager.stopMonitoring();
    
    // CORREÇÃO OOM: Limpar cache de candles após otimização
    if (USE_SHARED_CACHE) {
      candleDataCache.clear();
      optimizationLogger.info("Cache de candles limpo", "GridSearchOpt");
    }
    
    optimizationLogger.info(`CHECKPOINT: GridSearchOpt.completed | tested=${completed}`, "GridSearchOpt");

    optimizationLogger.endOperation("Grid Search Otimizado", true, {
      tempo: `${executionTime.toFixed(1)}s`,
      combinacoes: completed,
      trades: totalTrades,
      topN: rankedResults.length,
    });
    
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
   * Testar uma combinação de parâmetros (versão otimizada)
   * 
   * CORREÇÃO OOM: Não mantém trades/equityCurve em memória
   */
  private async testCombinationLightweight(
    combination: ParameterCombination,
    inSamplePeriod: { start: Date; end: Date },
    outSamplePeriod: { start: Date; end: Date }
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
    
    // CORREÇÃO OOM: Retornar resultado com trades/equityCurve vazios
    // Os dados completos podem ser recalculados sob demanda
    return {
      combination,
      inSample: {
        metrics: inSampleResult.metrics,
        trades: [], // Não armazenar trades
        equityCurve: [], // Não armazenar equityCurve
      },
      outSample: outSampleResult ? {
        metrics: outSampleResult.metrics,
        trades: [],
        equityCurve: [],
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
      symbol: this.config.symbols[0],
      strategy: this.config.strategyType,
      startDate,
      endDate,
      dataPath: this.config.dataPath || "./data/candles",
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
    
    // CORREÇÃO OOM: Usar runner otimizado que usa cache compartilhado
    // Usar APENAS os runners do laboratório (LabBacktestRunner*)
    const runner = USE_SHARED_CACHE 
      ? new LabBacktestRunnerOptimized(config)
      : new LabBacktestRunner(config);
    
    try {
      // Injetar parâmetros customizados se suportado (LabBacktestRunner tem suporte)
      if ('runWithParameters' in runner && typeof (runner as any).runWithParameters === 'function') {
        return await (runner as any).runWithParameters(parameters);
      }

      const result = await runner.run();
      return result;
    } finally {
      // CORREÇÃO OOM: Limpar recursos do runner
      if ('cleanup' in runner && typeof runner.cleanup === 'function') {
        runner.cleanup();
      }
    }
  }

  /**
   * Calcular score de robustez (0-100)
   */
  private calculateRobustnessScore(
    inSample: BacktestMetrics,
    outSample?: BacktestMetrics
  ): number {
    let score = 0;
    
    for (const objective of this.config.objectives) {
      const value = this.getMetricValue(inSample, objective.metric);
      const normalizedValue = this.normalizeMetric(objective.metric, value);
      
      if (objective.target === "MAXIMIZE") {
        score += normalizedValue * objective.weight * 0.4;
      } else {
        score += (100 - normalizedValue) * objective.weight * 0.4;
      }
    }
    
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
      
      const degradation = this.calculateDegradation(inSample, outSample);
      const consistencyScore = Math.max(0, 100 - degradation * 2);
      score += consistencyScore * 0.2;
    } else {
      score *= 0.6;
    }
    
    for (const objective of this.config.objectives) {
      if (objective.threshold) {
        const value = outSample
          ? this.getMetricValue(outSample, objective.metric)
          : this.getMetricValue(inSample, objective.metric);
        
        if (objective.target === "MAXIMIZE" && value < objective.threshold) {
          score *= 0.5;
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
    
    if (inSample.totalTrades < 30) {
      warnings.push("Amostra pequena: menos de 30 trades no in-sample");
    }
    
    if (inSample.winRate > 80) {
      warnings.push("Winrate muito alto (>80%) - possível overfitting");
    }
    
    if (inSample.maxDrawdownPercent > 30) {
      warnings.push("Drawdown máximo acima de 30%");
    }
    
    if (outSample) {
      const degradation = this.calculateDegradation(inSample, outSample);
      if (degradation > 30) {
        warnings.push(`Alta degradação out-of-sample (${degradation.toFixed(1)}%)`);
      }
      
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
   * Abortar otimização
   */
  abort(): void {
    this.aborted = true;
    optimizationLogger.info("Solicitação de abort recebida", "GridSearchOpt");
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
      values.push(Math.round(v * 1000) / 1000);
    }
    return values;
  }

  private hashParameters(params: Record<string, number | string | boolean>): string {
    const hash = createHash("sha256");
    hash.update(JSON.stringify(params));
    return hash.digest("hex").substring(0, 16);
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
        start: new Date(inSampleEnd.getTime() + 24 * 60 * 60 * 1000),
        end: this.config.endDate,
      },
    };
  }

  private getMetricValue(metrics: BacktestMetrics, metricName: string): number {
    return (metrics as any)[metricName] || 0;
  }

  private normalizeMetric(metricName: string, value: number): number {
    const normalizers: Record<string, (v: number) => number> = {
      sharpeRatio: (v) => Math.min(100, Math.max(0, (v + 2) * 25)),
      profitFactor: (v) => Math.min(100, Math.max(0, (v - 1) * 50)),
      winRate: (v) => v,
      maxDrawdownPercent: (v) => Math.max(0, 100 - v * 2),
      calmarRatio: (v) => Math.min(100, Math.max(0, v * 20)),
      sortinoRatio: (v) => Math.min(100, Math.max(0, (v + 2) * 25)),
      recoveryFactor: (v) => Math.min(100, Math.max(0, v * 10)),
    };
    
    const normalizer = normalizers[metricName];
    return normalizer ? normalizer(value) : Math.min(100, Math.max(0, value));
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createGridSearchEngineOptimized(config: OptimizationConfig): GridSearchEngineOptimized {
  return new GridSearchEngineOptimized(config);
}
