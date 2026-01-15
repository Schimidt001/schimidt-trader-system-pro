/**
 * Backtest Runs Schema - Tabela de Execuções de Backtest
 * 
 * Armazena informações sobre cada execução de backtest/otimização,
 * incluindo configurações, status e resultados agregados.
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

// ============================================================================
// BACKTEST RUNS TABLE
// ============================================================================

/**
 * Tabela principal de execuções de backtest
 * Cada registro representa uma execução completa de otimização ou backtest
 */
export const backtestRuns = mysqlTable("backtest_runs", {
  /** ID único auto-incrementado */
  id: int("id").autoincrement().primaryKey(),
  
  /** ID do usuário proprietário */
  userId: int("user_id").notNull(),
  
  /** ID do bot associado */
  botId: int("bot_id").notNull(),
  
  // -------------------------------------------------------------------------
  // Identificação
  // -------------------------------------------------------------------------
  
  /** Nome da execução (definido pelo usuário) */
  runName: varchar("run_name", { length: 255 }).notNull(),
  
  /** Descrição opcional */
  description: text("description"),
  
  /** Status da execução */
  status: varchar("status", { length: 50 }).notNull().default("PENDING"),
  // Valores: PENDING, RUNNING, COMPLETED, FAILED, ABORTED
  
  // -------------------------------------------------------------------------
  // Configuração
  // -------------------------------------------------------------------------
  
  /** Lista de símbolos testados (JSON array) */
  symbols: json("symbols").notNull(),
  // Exemplo: ["XAUUSD", "EURUSD", "GBPUSD"]
  
  /** Data de início do período de backtest */
  startDate: timestamp("start_date").notNull(),
  
  /** Data de fim do período de backtest */
  endDate: timestamp("end_date").notNull(),
  
  /** Tipo de estratégia testada */
  strategyType: varchar("strategy_type", { length: 50 }).notNull(),
  // Valores: SMC, HYBRID, RSI_VWAP
  
  /** Ranges de parâmetros testados (JSON) */
  parameterRanges: json("parameter_ranges").notNull(),
  // Estrutura: Array de ParameterDefinition
  
  /** Configuração de validação (JSON) */
  validationConfig: json("validation_config").notNull(),
  // Estrutura: { enabled, inSampleRatio, walkForward: { enabled, windowMonths, stepMonths } }
  
  // -------------------------------------------------------------------------
  // Resultados Agregados
  // -------------------------------------------------------------------------
  
  /** Total de combinações testadas */
  totalCombinationsTested: int("total_combinations_tested").default(0),
  
  /** Total de trades executados em todas as combinações */
  totalTradesExecuted: int("total_trades_executed").default(0),
  
  /** Tempo de execução em segundos */
  executionTimeSeconds: int("execution_time_seconds").default(0),
  
  // -------------------------------------------------------------------------
  // Metadados
  // -------------------------------------------------------------------------
  
  /** Timestamp de criação */
  createdAt: timestamp("created_at").defaultNow().notNull(),
  
  /** Timestamp de conclusão */
  completedAt: timestamp("completed_at"),
  
  /** Mensagem de erro (se falhou) */
  errorMessage: text("error_message"),
  
}, (table) => ({
  // Índices para consultas frequentes
  userIdIdx: index("backtest_runs_user_id_idx").on(table.userId),
  statusIdx: index("backtest_runs_status_idx").on(table.status),
  createdAtIdx: index("backtest_runs_created_at_idx").on(table.createdAt),
}));

// ============================================================================
// TYPES
// ============================================================================

/** Tipo inferido para SELECT */
export type BacktestRun = typeof backtestRuns.$inferSelect;

/** Tipo inferido para INSERT */
export type NewBacktestRun = typeof backtestRuns.$inferInsert;

// ============================================================================
// STATUS ENUM (para uso em código)
// ============================================================================

export const BacktestRunStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  ABORTED: "ABORTED",
} as const;

export type BacktestRunStatusType = typeof BacktestRunStatus[keyof typeof BacktestRunStatus];
