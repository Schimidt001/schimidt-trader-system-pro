/**
 * Optimization Results Schema - Tabela de Resultados de Otimização
 * 
 * Armazena os resultados de cada combinação de parâmetros testada,
 * incluindo métricas in-sample e out-of-sample.
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { 
  mysqlTable, 
  int, 
  varchar, 
  text, 
  timestamp, 
  json, 
  boolean,
  decimal,
  bigint,
  index,
  unique
} from "drizzle-orm/mysql-core";
import { backtestRuns } from "./backtest-runs";

// ============================================================================
// OPTIMIZATION RESULTS TABLE
// ============================================================================

/**
 * Tabela de resultados de otimização
 * Cada registro representa o resultado de uma combinação de parâmetros testada
 */
export const optimizationResults = mysqlTable("optimization_results", {
  /** ID único auto-incrementado */
  id: int("id").autoincrement().primaryKey(),
  
  /** ID da execução de backtest pai */
  backtestRunId: int("backtest_run_id").notNull(),
  // Referência: backtestRuns.id
  
  // -------------------------------------------------------------------------
  // Identificação da Combinação
  // -------------------------------------------------------------------------
  
  /** Símbolo testado */
  symbol: varchar("symbol", { length: 20 }).notNull(),
  
  /** Hash único dos parâmetros (para deduplicação) */
  combinationHash: varchar("combination_hash", { length: 64 }).notNull(),
  
  // -------------------------------------------------------------------------
  // Parâmetros Testados
  // -------------------------------------------------------------------------
  
  /** Parâmetros exatos usados nesta combinação (JSON) */
  parameters: json("parameters").notNull(),
  // Estrutura: Record<string, number | string | boolean>
  
  // -------------------------------------------------------------------------
  // Métricas In-Sample
  // -------------------------------------------------------------------------
  
  /** Métricas do período in-sample (JSON) */
  inSampleMetrics: json("in_sample_metrics").notNull(),
  // Estrutura: BacktestMetrics
  
  // -------------------------------------------------------------------------
  // Métricas Out-of-Sample
  // -------------------------------------------------------------------------
  
  /** Métricas do período out-of-sample (JSON, opcional) */
  outSampleMetrics: json("out_sample_metrics"),
  // Estrutura: BacktestMetrics | null
  
  // -------------------------------------------------------------------------
  // Scores e Classificação
  // -------------------------------------------------------------------------
  
  /** Score de robustez calculado (0-100) */
  robustnessScore: decimal("robustness_score", { precision: 10, scale: 4 }),
  
  /** Percentual de degradação in-sample -> out-sample */
  degradationPercent: decimal("degradation_percent", { precision: 10, scale: 2 }),
  
  /** Posição no ranking geral */
  rank: int("rank"),
  
  /** Se é recomendado para uso */
  isRecommended: boolean("is_recommended").default(false),
  
  // -------------------------------------------------------------------------
  // Dados Detalhados
  // -------------------------------------------------------------------------
  
  /** Lista de trades para replay (JSON, opcional) */
  tradesJson: json("trades_json"),
  // Estrutura: BacktestTrade[]
  
  /** Curva de equity (JSON, opcional) */
  equityCurveJson: json("equity_curve_json"),
  // Estrutura: { timestamp: number; equity: number }[]
  
  /** Avisos gerados (JSON) */
  warnings: json("warnings"),
  // Estrutura: string[]
  
  // -------------------------------------------------------------------------
  // Metadados
  // -------------------------------------------------------------------------
  
  /** Timestamp de criação */
  createdAt: timestamp("created_at").defaultNow().notNull(),
  
}, (table) => ({
  // Índices para consultas frequentes
  backtestRunIdIdx: index("opt_results_backtest_run_id_idx").on(table.backtestRunId),
  symbolIdx: index("opt_results_symbol_idx").on(table.symbol),
  robustnessScoreIdx: index("opt_results_robustness_score_idx").on(table.robustnessScore),
  rankIdx: index("opt_results_rank_idx").on(table.rank),
  isRecommendedIdx: index("opt_results_is_recommended_idx").on(table.isRecommended),
  
  // Unique constraint para evitar duplicatas
  uniqueCombination: unique("opt_results_unique_combination").on(
    table.backtestRunId, 
    table.symbol, 
    table.combinationHash
  ),
}));

// ============================================================================
// TYPES
// ============================================================================

/** Tipo inferido para SELECT */
export type OptimizationResult = typeof optimizationResults.$inferSelect;

/** Tipo inferido para INSERT */
export type NewOptimizationResult = typeof optimizationResults.$inferInsert;
