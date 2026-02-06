/**
 * Schema de Configuração para RSI + VWAP Strategy
 * 
 * Tabela para armazenar configurações dinâmicas da estratégia RSI + VWAP Reversal.
 * Todos os parâmetros são editáveis via UI - ZERO HARDCODING.
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 */

import { int, mysqlTable, timestamp, varchar, boolean, decimal, text } from "drizzle-orm/mysql-core";

/**
 * Configurações da estratégia RSI + VWAP Reversal
 * 
 * Esta tabela armazena todos os parâmetros configuráveis da estratégia RSI + VWAP,
 * permitindo que o usuário ajuste a estratégia via interface sem necessidade de
 * modificar código.
 */
export const rsiVwapConfig = mysqlTable("rsiVwapConfig", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  botId: int("botId").notNull().default(1),
  
  // ============= ATIVOS MONITORADOS =============
  /** Lista de ativos monitorados pela estratégia RSI+VWAP (JSON array) */
  activeSymbols: text("activeSymbols").default('[]'),
  
  // ============= QUANTIDADE DE CANDLES POR TIMEFRAME =============
  /** Quantidade de candles H1 para coleta (default: 60) */
  h1CandleCount: int("h1CandleCount").default(60).notNull(),
  /** Quantidade de candles M15 para coleta (default: 40) */
  m15CandleCount: int("m15CandleCount").default(40).notNull(),
  /** Quantidade de candles M5 para coleta (default: 40) */
  m5CandleCount: int("m5CandleCount").default(40).notNull(),
  
  // ============= INDICADORES RSI =============
  /** Período do RSI (default: 14) */
  rsiPeriod: int("rsiPeriod").default(14).notNull(),
  /** Nível de sobrevenda do RSI (default: 30) */
  rsiOversold: int("rsiOversold").default(30).notNull(),
  /** Nível de sobrecompra do RSI (default: 70) */
  rsiOverbought: int("rsiOverbought").default(70).notNull(),
  
  // ============= VWAP =============
  /** Habilitar VWAP como filtro de entrada */
  vwapEnabled: boolean("vwapEnabled").default(true).notNull(),
  
  // ============= GESTÃO DE RISCO =============
  /** Porcentagem do equity a arriscar por trade (default: 1.0%) */
  riskPercentage: decimal("riskPercentage", { precision: 5, scale: 2 }).default("1.00").notNull(),
  /** Stop Loss fixo em pips (default: 10) */
  stopLossPips: decimal("stopLossPips", { precision: 5, scale: 1 }).default("10.0").notNull(),
  /** Take Profit fixo em pips (default: 20) */
  takeProfitPips: decimal("takeProfitPips", { precision: 5, scale: 1 }).default("20.0").notNull(),
  /** Ratio Risk:Reward (default: 2.0 = 1:2) */
  rewardRiskRatio: decimal("rewardRiskRatio", { precision: 4, scale: 1 }).default("2.0").notNull(),
  
  // ============= FILTROS =============
  /** Mínimo de corpo do candle para confirmação (% do range) */
  minCandleBodyPercent: decimal("minCandleBodyPercent", { precision: 5, scale: 2 }).default("30.00").notNull(),
  /** Habilitar filtro de spread máximo */
  spreadFilterEnabled: boolean("spreadFilterEnabled").default(true).notNull(),
  /** Spread máximo permitido em pips para entrada */
  maxSpreadPips: decimal("maxSpreadPips", { precision: 5, scale: 1 }).default("2.0").notNull(),
  
  // ============= HORÁRIOS DE OPERAÇÃO =============
  /** Habilitar filtro de horário */
  sessionFilterEnabled: boolean("sessionFilterEnabled").default(true).notNull(),
  /** Horário de início da sessão (formato HH:MM, horário de Brasília) */
  sessionStart: varchar("sessionStart", { length: 5 }).default("08:00").notNull(),
  /** Horário de fim da sessão */
  sessionEnd: varchar("sessionEnd", { length: 5 }).default("17:00").notNull(),
  
  // ============= TRAILING STOP =============
  /** Habilitar trailing stop */
  trailingEnabled: boolean("trailingEnabled").default(false).notNull(),
  /** Pips de lucro para ativar trailing */
  trailingTriggerPips: decimal("trailingTriggerPips", { precision: 5, scale: 1 }).default("15.0").notNull(),
  /** Passo do trailing em pips */
  trailingStepPips: decimal("trailingStepPips", { precision: 5, scale: 1 }).default("5.0").notNull(),
  
  // ============= LOGS E DEBUG =============
  /** Habilitar logs detalhados da estratégia */
  verboseLogging: boolean("verboseLogging").default(true).notNull(),
  
  // ============= METADADOS =============
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RsiVwapConfig = typeof rsiVwapConfig.$inferSelect;
export type InsertRsiVwapConfig = typeof rsiVwapConfig.$inferInsert;
