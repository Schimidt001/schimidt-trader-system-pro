/**
 * Walk-Forward Validations Schema - Tabela de Validações Walk-Forward
 * 
 * Armazena os resultados de cada janela de validação Walk-Forward,
 * permitindo análise detalhada da robustez temporal dos parâmetros.
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
  index
} from "drizzle-orm/mysql-core";
import { optimizationResults } from "./optimization-results";

// ============================================================================
// WALK-FORWARD VALIDATIONS TABLE
// ============================================================================

/**
 * Tabela de validações Walk-Forward
 * Cada registro representa uma janela de validação (treino + teste)
 */
export const walkForwardValidations = mysqlTable("walk_forward_validations", {
  /** ID único auto-incrementado */
  id: int("id").autoincrement().primaryKey(),
  
  /** ID do resultado de otimização pai */
  optimizationResultId: int("optimization_result_id").notNull(),
  // Referência: optimizationResults.id
  
  // -------------------------------------------------------------------------
  // Configuração da Janela
  // -------------------------------------------------------------------------
  
  /** Número sequencial da janela */
  windowNumber: int("window_number").notNull(),
  
  /** Data de início do período de treino */
  trainStartDate: timestamp("train_start_date").notNull(),
  
  /** Data de fim do período de treino */
  trainEndDate: timestamp("train_end_date").notNull(),
  
  /** Data de início do período de teste */
  testStartDate: timestamp("test_start_date").notNull(),
  
  /** Data de fim do período de teste */
  testEndDate: timestamp("test_end_date").notNull(),
  
  // -------------------------------------------------------------------------
  // Parâmetros
  // -------------------------------------------------------------------------
  
  /** Parâmetros usados nesta janela (JSON) */
  parameters: json("parameters").notNull(),
  // Estrutura: Record<string, number | string | boolean>
  
  // -------------------------------------------------------------------------
  // Resultados
  // -------------------------------------------------------------------------
  
  /** Métricas do período de treino (JSON) */
  trainMetrics: json("train_metrics").notNull(),
  // Estrutura: BacktestMetrics
  
  /** Métricas do período de teste (JSON) */
  testMetrics: json("test_metrics").notNull(),
  // Estrutura: BacktestMetrics
  
  // -------------------------------------------------------------------------
  // Análise
  // -------------------------------------------------------------------------
  
  /** Degradação por métrica (JSON) */
  degradation: json("degradation").notNull(),
  // Estrutura: { sharpe: number, winRate: number, profitFactor: number }
  
  /** Score de estabilidade desta janela (0-100) */
  stabilityScore: decimal("stability_score", { precision: 10, scale: 4 }),
  
  // -------------------------------------------------------------------------
  // Metadados
  // -------------------------------------------------------------------------
  
  /** Timestamp de criação */
  createdAt: timestamp("created_at").defaultNow().notNull(),
  
}, (table) => ({
  // Índices para consultas frequentes
  optimizationResultIdIdx: index("wf_val_optimization_result_id_idx").on(table.optimizationResultId),
  windowNumberIdx: index("wf_val_window_number_idx").on(table.windowNumber),
  stabilityScoreIdx: index("wf_val_stability_score_idx").on(table.stabilityScore),
}));

// ============================================================================
// TYPES
// ============================================================================

/** Tipo inferido para SELECT */
export type WalkForwardValidation = typeof walkForwardValidations.$inferSelect;

/** Tipo inferido para INSERT */
export type NewWalkForwardValidation = typeof walkForwardValidations.$inferInsert;
