/**
 * Optimization Jobs Schema - Tabela de Jobs de Otimização
 * 
 * CORREÇÃO CRÍTICA #1: Persistência Real de Estado
 * 
 * Esta tabela armazena o estado dos jobs de otimização de forma persistente,
 * garantindo que o estado sobreviva a reinicializações do servidor.
 * 
 * Substitui o armazenamento em memória RAM do OptimizationJobQueue.
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
} from "drizzle-orm/mysql-core";

// ============================================================================
// OPTIMIZATION JOBS TABLE
// ============================================================================

/**
 * Tabela de jobs de otimização
 * Cada registro representa um job de otimização (em execução, concluído ou falhado)
 */
export const optimizationJobs = mysqlTable("optimization_jobs", {
  /** ID único auto-incrementado */
  id: int("id").autoincrement().primaryKey(),
  
  /** Run ID único gerado pelo sistema (ex: opt_1706192400000_abc123) */
  runId: varchar("run_id", { length: 64 }).notNull().unique(),
  
  // -------------------------------------------------------------------------
  // Status do Job
  // -------------------------------------------------------------------------
  
  /** Status atual do job */
  status: varchar("status", { length: 20 }).notNull().default("QUEUED"),
  // Valores: QUEUED, RUNNING, COMPLETED, FAILED, ABORTED
  
  /** Progresso atual (0-100) */
  progressPercent: decimal("progress_percent", { precision: 5, scale: 2 }).default("0"),
  
  /** Combinação atual sendo processada */
  currentCombination: int("current_combination").default(0),
  
  /** Total de combinações a processar */
  totalCombinations: int("total_combinations").notNull(),
  
  /** Fase atual da execução */
  currentPhase: varchar("current_phase", { length: 50 }).default("QUEUED"),
  
  /** Mensagem de status para o usuário */
  statusMessage: text("status_message"),
  
  /** Tempo estimado restante em segundos */
  estimatedTimeRemaining: int("estimated_time_remaining"),
  
  /** Tempo decorrido em segundos */
  elapsedTime: int("elapsed_time").default(0),
  
  // -------------------------------------------------------------------------
  // Configuração do Job
  // -------------------------------------------------------------------------
  
  /** Configuração completa do job (JSON) */
  config: json("config").notNull(),
  // Estrutura: OptimizationConfig
  
  // -------------------------------------------------------------------------
  // Resultado do Job
  // -------------------------------------------------------------------------
  
  /** Resultado final da otimização (JSON, preenchido ao completar) */
  result: json("result"),
  // Estrutura: OptimizationFinalResult
  
  /** Mensagem de erro (se falhou) */
  errorMessage: text("error_message"),
  
  // -------------------------------------------------------------------------
  // Timestamps
  // -------------------------------------------------------------------------
  
  /** Timestamp de criação/enfileiramento */
  createdAt: timestamp("created_at").defaultNow().notNull(),
  
  /** Timestamp de início da execução */
  startedAt: timestamp("started_at"),
  
  /** Timestamp de conclusão (sucesso, falha ou abort) */
  completedAt: timestamp("completed_at"),
  
  /** Timestamp do último heartbeat/atualização de progresso */
  lastProgressAt: timestamp("last_progress_at"),
  
}, (table) => ({
  // Índices para consultas frequentes
  runIdIdx: index("opt_jobs_run_id_idx").on(table.runId),
  statusIdx: index("opt_jobs_status_idx").on(table.status),
  createdAtIdx: index("opt_jobs_created_at_idx").on(table.createdAt),
}));

// ============================================================================
// TYPES
// ============================================================================

/** Tipo inferido para SELECT */
export type OptimizationJob = typeof optimizationJobs.$inferSelect;

/** Tipo inferido para INSERT */
export type NewOptimizationJob = typeof optimizationJobs.$inferInsert;

// ============================================================================
// STATUS ENUM (para uso em código)
// ============================================================================

export const OptimizationJobStatus = {
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  ABORTED: "ABORTED",
} as const;

export type OptimizationJobStatusType = typeof OptimizationJobStatus[keyof typeof OptimizationJobStatus];
