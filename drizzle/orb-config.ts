/**
 * Schema de Configuração para ORB Trend Strategy (Opening Range Breakout)
 * 
 * Tabela para armazenar configurações dinâmicas da estratégia ORB Trend.
 * Todos os parâmetros são editáveis via UI - ZERO HARDCODING.
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 */

import { int, mysqlTable, text, timestamp, varchar, boolean, decimal } from "drizzle-orm/mysql-core";

/**
 * Configurações da estratégia ORB Trend (Opening Range Breakout)
 * 
 * Esta tabela armazena todos os parâmetros configuráveis da estratégia ORB Trend,
 * permitindo que o usuário ajuste a estratégia via interface sem necessidade de
 * modificar código.
 */
export const orbTrendConfig = mysqlTable("orbTrendConfig", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  botId: int("botId").notNull().default(1),
  
  // ============= ATIVOS MONITORADOS =============
  /** Lista de símbolos ativos para monitoramento (JSON Array) */
  activeSymbols: text("activeSymbols").default('["EURUSD","GBPUSD","USDJPY","XAUUSD"]').notNull(),
  
  // ============= OPENING RANGE =============
  /** Número de candles M15 para calcular o Opening Range */
  openingCandles: int("openingCandles").default(3).notNull(),
  
  // ============= FILTRO DE REGIME (EMA200) =============
  /** Período da EMA para filtro de regime */
  emaPeriod: int("emaPeriod").default(200).notNull(),
  /** Número de candles para lookback do slope da EMA */
  slopeLookbackCandles: int("slopeLookbackCandles").default(10).notNull(),
  /** Slope mínimo da EMA para considerar tendência válida */
  minSlope: decimal("minSlope", { precision: 10, scale: 6 }).default("0.000100").notNull(),
  
  // ============= STOP LOSS =============
  /** Tipo de Stop Loss: rangeOpposite ou atr */
  stopType: varchar("stopType", { length: 20 }).default("rangeOpposite").notNull(),
  /** Multiplicador do ATR para Stop Loss (se stopType = atr) */
  atrMult: decimal("atrMult", { precision: 5, scale: 2 }).default("1.50").notNull(),
  /** Período do ATR */
  atrPeriod: int("atrPeriod").default(14).notNull(),
  
  // ============= TAKE PROFIT =============
  /** Risk:Reward ratio para Take Profit */
  riskReward: decimal("riskReward", { precision: 5, scale: 2 }).default("1.00").notNull(),
  
  // ============= FREQUÊNCIA =============
  /** Máximo de trades por dia por símbolo */
  maxTradesPerDayPerSymbol: int("maxTradesPerDayPerSymbol").default(1).notNull(),
  
  // ============= GESTÃO DE RISCO =============
  /** Porcentagem do equity a arriscar por trade */
  riskPercentage: decimal("riskPercentage", { precision: 5, scale: 2 }).default("1.00").notNull(),
  /** Máximo de trades simultâneos abertos */
  maxOpenTrades: int("maxOpenTrades").default(3).notNull(),
  
  // ============= FILTRO DE SPREAD =============
  /** Spread máximo permitido em pips para entrada */
  maxSpreadPips: decimal("maxSpreadPips", { precision: 5, scale: 1 }).default("3.0").notNull(),
  
  // ============= LOGGING =============
  /** Habilitar logging detalhado */
  verboseLogging: boolean("verboseLogging").default(true).notNull(),
  
  // ============= TIMESTAMPS =============
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ORBTrendConfig = typeof orbTrendConfig.$inferSelect;
export type InsertORBTrendConfig = typeof orbTrendConfig.$inferInsert;
