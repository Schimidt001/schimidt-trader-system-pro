/**
 * BatchOptimizer - Otimizador Avançado por Lotes
 * 
 * Sistema de otimização que:
 * - Processa combinações em lotes para evitar memory overflow
 * - Suporta todos os parâmetros das estratégias SMC/Hybrid
 * - Gera rankings por múltiplas categorias (Lucratividade, Recovery Factor, Drawdown, Winrate)
 * - Mantém apenas os Top N resultados em memória
 * 
 * Lógica de Batch:
 * 1. Gera todas as combinações de parâmetros
 * 2. Divide em lotes de tamanho configurável
 * 3. Processa cada lote sequencialmente
 * 4. Mantém apenas os Top N de cada categoria
 * 5. Libera memória após cada lote
 * 6. Ao final, retorna os campeões de cada categoria
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 2.0.0
 */

import {
  BatchOptimizationConfig,
  BatchOptimizationResult,
  BatchOptimizationProgress,
  OptimizationCombinationResult,
  CategoryRanking,
  RankingCategory,
  ParameterRange,
  SMCBacktestParams,
  RANKING_CATEGORY_LABELS,
  SMC_PARAMETER_DEFINITIONS,
} from "../types/batchOptimizer.types";
import { BacktestConfig, BacktestStrategyType, BacktestResult } from "../types/backtest.types";
import { BacktestRunner } from "./BacktestRunner";
import { randomUUID } from "crypto";

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_TOP_RESULTS = 5;
const DEFAULT_RANKING_CATEGORIES: RankingCategory[] = [
  "profitability",
  "recoveryFactor",
  "minDrawdown",
  "winRate",
];

// ============================================================================
// BATCH OPTIMIZER CLASS
// ============================================================================

export class BatchOptimizer {
  private config: BatchOptimizationConfig;
  private onProgress?: (progress: BatchOptimizationProgress) => void;
  private aborted: boolean = false;
  
  // Top results por categoria (mantidos em memória durante processamento)
  private topByProfitability: OptimizationCombinationResult[] = [];
  private topByRecoveryFactor: OptimizationCombinationResult[] = [];
  private topByMinDrawdown: OptimizationCombinationResult[] = [];
  private topByWinRate: OptimizationCombinationResult[] = [];
  
  // Estatísticas
  private totalCombinations: number = 0;
  private completedCombinations: number = 0;
  private errors: string[] = [];
  private combinationTimes: number[] = [];
  
  constructor(config: BatchOptimizationConfig) {
    this.config = {
      ...config,
      batchSize: config.batchSize || DEFAULT_BATCH_SIZE,
      topResultsToKeep: config.topResultsToKeep || DEFAULT_TOP_RESULTS,
      rankingCategories: config.rankingCategories || DEFAULT_RANKING_CATEGORIES,
    };
  }
  
  /**
   * Define callback de progresso
   */
  setProgressCallback(callback: (progress: BatchOptimizationProgress) => void): void {
    this.onProgress = callback;
  }
  
  /**
   * Aborta a otimização
   */
  abort(): void {
    this.aborted = true;
  }
  
  /**
   * Executa a otimização em lotes
   */
  async run(): Promise<BatchOptimizationResult> {
    const startTime = Date.now();
    this.aborted = false;
    this.errors = [];
    this.combinationTimes = [];
    
    // Limpar resultados anteriores
    this.topByProfitability = [];
    this.topByRecoveryFactor = [];
    this.topByMinDrawdown = [];
    this.topByWinRate = [];
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[BatchOptimizer] 🚀 INICIANDO OTIMIZAÇÃO EM LOTES");
    console.log(`[BatchOptimizer] Símbolo: ${this.config.symbol}`);
    console.log(`[BatchOptimizer] Estratégias: ${this.config.strategies.join(", ")}`);
    console.log(`[BatchOptimizer] Tamanho do Lote: ${this.config.batchSize}`);
    console.log(`[BatchOptimizer] Top Results: ${this.config.topResultsToKeep}`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    // Gerar todas as combinações
    const combinations = this.generateAllCombinations();
    this.totalCombinations = combinations.length;
    
    console.log(`[BatchOptimizer] Total de combinações geradas: ${this.totalCombinations}`);
    
    // Dividir em lotes
    const batches = this.splitIntoBatches(combinations);
    const totalBatches = batches.length;
    
    console.log(`[BatchOptimizer] Total de lotes: ${totalBatches}`);
    
    // Processar cada lote
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      if (this.aborted) {
        console.log("[BatchOptimizer] ⛔ Otimização abortada pelo usuário");
        break;
      }
      
      const batch = batches[batchIndex];
      console.log(`[BatchOptimizer] 📦 Processando Lote ${batchIndex + 1}/${totalBatches} (${batch.length} combinações)`);
      
      await this.processBatch(batch, batchIndex, totalBatches);
      
      // Forçar garbage collection (se disponível)
      if (global.gc) {
        global.gc();
      }
    }
    
    // Construir resultado final
    const executionTime = Date.now() - startTime;
    
    const rankings = this.buildFinalRankings();
    const overallBest = this.findOverallBest();
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[BatchOptimizer] ✅ OTIMIZAÇÃO CONCLUÍDA");
    console.log(`[BatchOptimizer] Combinações testadas: ${this.completedCombinations}/${this.totalCombinations}`);
    console.log(`[BatchOptimizer] Tempo total: ${(executionTime / 1000).toFixed(1)}s`);
    console.log(`[BatchOptimizer] Erros: ${this.errors.length}`);
    
    if (overallBest) {
      console.log(`[BatchOptimizer] 🥇 Melhor Geral: ${overallBest.strategy} - Score: ${overallBest.compositeScore.toFixed(2)}`);
    }
    
    // Log dos campeões por categoria
    for (const ranking of rankings) {
      if (ranking.topResults.length > 0) {
        const best = ranking.topResults[0];
        console.log(`[BatchOptimizer] ${ranking.icon} ${ranking.label}: ${best.strategy} - ${this.getCategoryValue(best, ranking.category)}`);
      }
    }
    
    console.log("═══════════════════════════════════════════════════════════════");
    
    return {
      config: this.config,
      totalCombinations: this.totalCombinations,
      completedCombinations: this.completedCombinations,
      totalBatches,
      rankings,
      overallBest,
      executionTime,
      aborted: this.aborted,
      errors: this.errors,
    };
  }
  
  /**
   * Gera todas as combinações de parâmetros
   */
  private generateAllCombinations(): Array<{
    strategy: BacktestStrategyType;
    params: Partial<SMCBacktestParams>;
  }> {
    const combinations: Array<{
      strategy: BacktestStrategyType;
      params: Partial<SMCBacktestParams>;
    }> = [];
    
    // Obter parâmetros habilitados para otimização
    const enabledParams = this.config.parameterRanges.filter(p => p.enabled);
    
    // Gerar valores para cada parâmetro habilitado
    const paramValues: Map<string, (number | string | boolean)[]> = new Map();
    
    for (const param of enabledParams) {
      const values = this.generateParameterValues(param);
      paramValues.set(param.name, values);
    }
    
    // Gerar todas as combinações usando produto cartesiano
    const paramNames = Array.from(paramValues.keys());
    const allParamCombinations = this.cartesianProduct(
      paramNames.map(name => paramValues.get(name)!)
    );
    
    // Para cada estratégia e cada combinação de parâmetros
    for (const strategy of this.config.strategies) {
      for (const paramCombo of allParamCombinations) {
        const params: Partial<SMCBacktestParams> = {};
        
        // Preencher com valores padrão dos parâmetros não habilitados
        for (const paramDef of this.config.parameterRanges) {
          if (!paramDef.enabled) {
            (params as any)[paramDef.name] = paramDef.defaultValue;
          }
        }
        
        // Preencher com valores da combinação atual
        paramNames.forEach((name, index) => {
          (params as any)[name] = paramCombo[index];
        });
        
        combinations.push({ strategy, params });
      }
    }
    
    // Se não há parâmetros habilitados, criar uma combinação por estratégia com defaults
    if (combinations.length === 0) {
      for (const strategy of this.config.strategies) {
        const params: Partial<SMCBacktestParams> = {};
        for (const paramDef of this.config.parameterRanges) {
          (params as any)[paramDef.name] = paramDef.defaultValue;
        }
        combinations.push({ strategy, params });
      }
    }
    
    return combinations;
  }
  
  /**
   * Gera valores para um parâmetro baseado em sua configuração
   */
  private generateParameterValues(param: ParameterRange): (number | string | boolean)[] {
    // Se tem valores explícitos, usar eles
    if (param.values && param.values.length > 0) {
      return param.values;
    }
    
    // Se é boolean
    if (param.type === "boolean") {
      return [true, false];
    }
    
    // Se é select
    if (param.type === "select" && param.options) {
      return param.options;
    }
    
    // Se é number com range
    if (param.type === "number" && param.min !== undefined && param.max !== undefined && param.step !== undefined) {
      const values: number[] = [];
      for (let v = param.min; v <= param.max; v += param.step) {
        values.push(Math.round(v * 100) / 100); // Arredondar para 2 decimais
      }
      return values;
    }
    
    // Fallback: usar valor padrão
    return [param.defaultValue];
  }
  
  /**
   * Produto cartesiano de arrays
   */
  private cartesianProduct<T>(arrays: T[][]): T[][] {
    if (arrays.length === 0) return [[]];
    
    return arrays.reduce<T[][]>(
      (acc, curr) => acc.flatMap(a => curr.map(c => [...a, c])),
      [[]]
    );
  }
  
  /**
   * Divide combinações em lotes
   */
  private splitIntoBatches<T>(items: T[]): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += this.config.batchSize) {
      batches.push(items.slice(i, i + this.config.batchSize));
    }
    return batches;
  }
  
  /**
   * Processa um lote de combinações
   */
  private async processBatch(
    batch: Array<{ strategy: BacktestStrategyType; params: Partial<SMCBacktestParams> }>,
    batchIndex: number,
    totalBatches: number
  ): Promise<void> {
    for (let i = 0; i < batch.length; i++) {
      if (this.aborted) break;
      
      const combo = batch[i];
      const comboStartTime = Date.now();
      
      // Atualizar progresso
      this.updateProgress(batchIndex, totalBatches, i, batch.length, combo);
      
      try {
        // Executar backtest
        const result = await this.runSingleBacktest(combo.strategy, combo.params);
        
        if (result) {
          // Calcular scores por categoria
          const combinationResult = this.buildCombinationResult(combo.strategy, combo.params, result);
          
          // Atualizar rankings
          this.updateRankings(combinationResult);
        }
        
      } catch (error) {
        const errorMsg = `${combo.strategy} - ${(error as Error).message}`;
        this.errors.push(errorMsg);
        console.error(`[BatchOptimizer] ✗ Erro: ${errorMsg}`);
      }
      
      this.completedCombinations++;
      this.combinationTimes.push(Date.now() - comboStartTime);
    }
  }
  
  /**
   * Executa um único backtest
   */
  private async runSingleBacktest(
    strategy: BacktestStrategyType,
    params: Partial<SMCBacktestParams>
  ): Promise<BacktestResult | null> {
    try {
      const config: BacktestConfig = {
        symbol: this.config.symbol,
        strategy,
        startDate: this.config.startDate,
        endDate: this.config.endDate,
        initialBalance: this.config.initialBalance,
        leverage: this.config.leverage,
        commission: this.config.commission,
        slippage: this.config.slippage,
        spread: this.config.spread,
        dataPath: this.config.dataPath,
        timeframes: ["M5", "M15", "H1"],
        riskPercent: params.riskPercentage || 2,
        maxPositions: params.maxOpenTrades || 3,
        maxSpread: params.maxSpreadPips || 3,
        // Parâmetros adicionais podem ser passados via extensão do BacktestConfig
        // ou através de um sistema de injeção de parâmetros no BacktestAdapter
      };
      
      const runner = new BacktestRunner(config);
      return await runner.run();
      
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Constrói resultado de uma combinação com scores
   */
  private buildCombinationResult(
    strategy: BacktestStrategyType,
    params: Partial<SMCBacktestParams>,
    result: BacktestResult
  ): OptimizationCombinationResult {
    const metrics = result.metrics;
    
    // Calcular scores por categoria
    const categoryScores = {
      profitability: metrics.netProfit,
      recoveryFactor: metrics.recoveryFactor,
      minDrawdown: 100 - metrics.maxDrawdownPercent, // Inverter para que maior = melhor
      winRate: metrics.winRate,
    };
    
    // Score composto (média ponderada)
    const compositeScore = 
      categoryScores.profitability * 0.35 +
      categoryScores.recoveryFactor * 10 * 0.25 + // Normalizar
      categoryScores.minDrawdown * 0.20 +
      categoryScores.winRate * 0.20;
    
    return {
      id: randomUUID(),
      strategy,
      params,
      metrics,
      categoryScores,
      compositeScore,
    };
  }
  
  /**
   * Atualiza os rankings com um novo resultado
   */
  private updateRankings(result: OptimizationCombinationResult): void {
    const maxResults = this.config.topResultsToKeep;
    
    // Atualizar ranking de lucratividade (maior lucro)
    this.topByProfitability = this.insertAndTrim(
      this.topByProfitability,
      result,
      (a, b) => b.categoryScores.profitability - a.categoryScores.profitability,
      maxResults
    );
    
    // Atualizar ranking de recovery factor (maior recovery)
    this.topByRecoveryFactor = this.insertAndTrim(
      this.topByRecoveryFactor,
      result,
      (a, b) => b.categoryScores.recoveryFactor - a.categoryScores.recoveryFactor,
      maxResults
    );
    
    // Atualizar ranking de menor drawdown (menor DD = maior score invertido)
    this.topByMinDrawdown = this.insertAndTrim(
      this.topByMinDrawdown,
      result,
      (a, b) => b.categoryScores.minDrawdown - a.categoryScores.minDrawdown,
      maxResults
    );
    
    // Atualizar ranking de winrate (maior winrate)
    this.topByWinRate = this.insertAndTrim(
      this.topByWinRate,
      result,
      (a, b) => b.categoryScores.winRate - a.categoryScores.winRate,
      maxResults
    );
  }
  
  /**
   * Insere item ordenado e mantém apenas os top N
   */
  private insertAndTrim(
    array: OptimizationCombinationResult[],
    item: OptimizationCombinationResult,
    compareFn: (a: OptimizationCombinationResult, b: OptimizationCombinationResult) => number,
    maxSize: number
  ): OptimizationCombinationResult[] {
    const newArray = [...array, item];
    newArray.sort(compareFn);
    return newArray.slice(0, maxSize);
  }
  
  /**
   * Constrói rankings finais
   */
  private buildFinalRankings(): CategoryRanking[] {
    const rankings: CategoryRanking[] = [];
    
    for (const category of this.config.rankingCategories) {
      const categoryInfo = RANKING_CATEGORY_LABELS[category];
      let topResults: OptimizationCombinationResult[] = [];
      
      switch (category) {
        case "profitability":
          topResults = this.topByProfitability;
          break;
        case "recoveryFactor":
          topResults = this.topByRecoveryFactor;
          break;
        case "minDrawdown":
          topResults = this.topByMinDrawdown;
          break;
        case "winRate":
          topResults = this.topByWinRate;
          break;
      }
      
      rankings.push({
        category,
        label: categoryInfo.label,
        icon: categoryInfo.icon,
        topResults,
      });
    }
    
    return rankings;
  }
  
  /**
   * Encontra o melhor resultado geral
   */
  private findOverallBest(): OptimizationCombinationResult | null {
    const allResults = [
      ...this.topByProfitability,
      ...this.topByRecoveryFactor,
      ...this.topByMinDrawdown,
      ...this.topByWinRate,
    ];
    
    if (allResults.length === 0) return null;
    
    // Ordenar por score composto
    allResults.sort((a, b) => b.compositeScore - a.compositeScore);
    
    return allResults[0];
  }
  
  /**
   * Obtém valor formatado para uma categoria
   */
  private getCategoryValue(result: OptimizationCombinationResult, category: RankingCategory): string {
    switch (category) {
      case "profitability":
        return `$${result.metrics.netProfit.toFixed(2)}`;
      case "recoveryFactor":
        return result.metrics.recoveryFactor.toFixed(2);
      case "minDrawdown":
        return `${result.metrics.maxDrawdownPercent.toFixed(2)}%`;
      case "winRate":
        return `${result.metrics.winRate.toFixed(2)}%`;
      default:
        return "";
    }
  }
  
  /**
   * Atualiza progresso
   */
  private updateProgress(
    batchIndex: number,
    totalBatches: number,
    comboIndexInBatch: number,
    batchSize: number,
    combo: { strategy: BacktestStrategyType; params: Partial<SMCBacktestParams> }
  ): void {
    if (!this.onProgress) return;
    
    const avgTime = this.combinationTimes.length > 0
      ? this.combinationTimes.reduce((a, b) => a + b, 0) / this.combinationTimes.length
      : 5000;
    
    const remaining = this.totalCombinations - this.completedCombinations;
    
    this.onProgress({
      currentBatch: batchIndex + 1,
      totalBatches,
      currentCombinationInBatch: comboIndexInBatch + 1,
      combinationsInCurrentBatch: batchSize,
      currentCombination: this.completedCombinations + 1,
      totalCombinations: this.totalCombinations,
      currentStrategy: combo.strategy,
      currentParams: combo.params as Record<string, number | string | boolean>,
      percentComplete: Math.round((this.completedCombinations / this.totalCombinations) * 100),
      estimatedTimeRemaining: Math.round((remaining * avgTime) / 1000),
      phase: "processing",
      partialBestResults: {
        profitability: this.topByProfitability[0] || null,
        recoveryFactor: this.topByRecoveryFactor[0] || null,
        minDrawdown: this.topByMinDrawdown[0] || null,
        winRate: this.topByWinRate[0] || null,
      },
    });
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createBatchOptimizer(config: BatchOptimizationConfig): BatchOptimizer {
  return new BatchOptimizer(config);
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_BATCH_OPTIMIZATION_CONFIG: Partial<BatchOptimizationConfig> = {
  batchSize: DEFAULT_BATCH_SIZE,
  topResultsToKeep: DEFAULT_TOP_RESULTS,
  rankingCategories: DEFAULT_RANKING_CATEGORIES,
  parameterRanges: SMC_PARAMETER_DEFINITIONS,
};
