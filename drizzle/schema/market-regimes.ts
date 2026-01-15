/**
 * Market Regimes Schema - Tabela de Regimes de Mercado
 * 
 * Armazena os regimes de mercado detectados para cada símbolo,
 * permitindo análise de performance por condição de mercado.
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
// MARKET REGIMES TABLE
// ============================================================================

/**
 * Tabela de regimes de mercado
 * Cada registro representa um período com um regime específico detectado
 */
export const marketRegimes = mysqlTable("market_regimes", {
  /** ID único auto-incrementado */
  id: int("id").autoincrement().primaryKey(),
  
  /** Símbolo analisado */
  symbol: varchar("symbol", { length: 20 }).notNull(),
  
  // -------------------------------------------------------------------------
  // Período
  // -------------------------------------------------------------------------
  
  /** Data de início do regime */
  startDate: timestamp("start_date").notNull(),
  
  /** Data de fim do regime */
  endDate: timestamp("end_date").notNull(),
  
  // -------------------------------------------------------------------------
  // Classificação
  // -------------------------------------------------------------------------
  
  /** Tipo de regime detectado */
  regime: varchar("regime", { length: 50 }).notNull(),
  // Valores: BULL, BEAR, SIDEWAYS, HIGH_VOL, LOW_VOL
  
  /** Confiança na classificação (0-100) */
  confidence: decimal("confidence", { precision: 5, scale: 2 }).notNull(),
  
  // -------------------------------------------------------------------------
  // Métricas do Regime
  // -------------------------------------------------------------------------
  
  /** Força da tendência (para BULL/BEAR) */
  trendStrength: decimal("trend_strength", { precision: 10, scale: 4 }),
  
  /** Nível de volatilidade (ATR normalizado) */
  volatilityLevel: decimal("volatility_level", { precision: 10, scale: 4 }),
  
  /** Range médio do período em pips */
  averageRange: decimal("average_range", { precision: 10, scale: 2 }),
  
  /** Duração do regime em dias */
  durationDays: int("duration_days"),
  
  // -------------------------------------------------------------------------
  // Metadados
  // -------------------------------------------------------------------------
  
  /** Timestamp de criação */
  createdAt: timestamp("created_at").defaultNow().notNull(),
  
  /** Timestamp de última atualização */
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  
}, (table) => ({
  // Índices para consultas frequentes
  symbolIdx: index("market_regimes_symbol_idx").on(table.symbol),
  regimeIdx: index("market_regimes_regime_idx").on(table.regime),
  startDateIdx: index("market_regimes_start_date_idx").on(table.startDate),
  endDateIdx: index("market_regimes_end_date_idx").on(table.endDate),
  
  // Índice composto para busca por símbolo e período
  symbolDateIdx: index("market_regimes_symbol_date_idx").on(table.symbol, table.startDate, table.endDate),
}));

// ============================================================================
// TYPES
// ============================================================================

/** Tipo inferido para SELECT */
export type MarketRegime = typeof marketRegimes.$inferSelect;

/** Tipo inferido para INSERT */
export type NewMarketRegime = typeof marketRegimes.$inferInsert;

// ============================================================================
// REGIME TYPE ENUM (para uso em código)
// ============================================================================

export const MarketRegimeType = {
  BULL: "BULL",
  BEAR: "BEAR",
  SIDEWAYS: "SIDEWAYS",
  HIGH_VOL: "HIGH_VOL",
  LOW_VOL: "LOW_VOL",
} as const;

export type MarketRegimeTypeValue = typeof MarketRegimeType[keyof typeof MarketRegimeType];
