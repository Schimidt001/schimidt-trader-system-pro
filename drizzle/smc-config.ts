/**
 * Schema de Configuração para SMC Strategy (Smart Money Concepts)
 * 
 * Tabela para armazenar configurações dinâmicas da estratégia SMC Swarm.
 * Todos os parâmetros são editáveis via UI - ZERO HARDCODING.
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 */

import { int, mysqlTable, text, timestamp, varchar, boolean, decimal, json } from "drizzle-orm/mysql-core";

/**
 * Configurações da estratégia SMC (Smart Money Concepts)
 * 
 * Esta tabela armazena todos os parâmetros configuráveis da estratégia SMC Swarm,
 * permitindo que o usuário ajuste a estratégia via interface sem necessidade de
 * modificar código.
 */
export const smcStrategyConfig = mysqlTable("smcStrategyConfig", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  botId: int("botId").notNull().default(1),
  
  // ============= TIPO DE ESTRATÉGIA =============
  /** Tipo de estratégia ativa: TREND_SNIPER ou SMC_SWARM */
  strategyType: varchar("strategyType", { length: 20 }).default("SMC_SWARM").notNull(),
  
  // ============= TIMEFRAME DE ESTRUTURA (SWING POINTS) =============
  /** Timeframe para identificação de Swing Points: H1 (Conservador), M15 (Agressivo), M5 (Scalper) */
  structureTimeframe: varchar("structureTimeframe", { length: 5 }).default("H1").notNull(),
  
  // ============= ATIVOS MONITORADOS (SWARM) =============
  /** Lista de símbolos ativos para monitoramento (JSON Array) */
  activeSymbols: text("activeSymbols").default('["EURUSD","GBPUSD","USDJPY","XAUUSD"]').notNull(),
  
  // ============= PARÂMETROS DE ESTRUTURA (H1) =============
  /** Quantidade de candles H1 para lookback na identificação de swings */
  swingH1Lookback: int("swingH1Lookback").default(50).notNull(),
  /** Quantidade de velas à esquerda para validar fractal */
  fractalLeftBars: int("fractalLeftBars").default(2).notNull(),
  /** Quantidade de velas à direita para validar fractal */
  fractalRightBars: int("fractalRightBars").default(2).notNull(),
  
  // ============= PARÂMETROS DE SWEEP =============
  /** Buffer em pips acima/abaixo do swing para considerar sweep */
  sweepBufferPips: decimal("sweepBufferPips", { precision: 5, scale: 1 }).default("2.0").notNull(),
  /** Tempo máximo em minutos para validar sweep após violação */
  sweepValidationMinutes: int("sweepValidationMinutes").default(60).notNull(),
  
  // ============= PARÂMETROS DE CHoCH (M15) =============
  /** Lookback de candles M15 para identificar estrutura */
  chochM15Lookback: int("chochM15Lookback").default(20).notNull(),
  /** Mínimo de pips de movimento para validar CHoCH */
  chochMinPips: decimal("chochMinPips", { precision: 5, scale: 1 }).default("10.0").notNull(),
  
  // ============= PARÂMETROS DE ORDER BLOCK =============
  /** Máximo de candles para trás para identificar OB após CHoCH */
  orderBlockLookback: int("orderBlockLookback").default(10).notNull(),
  /** Extensão máxima da zona do OB em pips */
  orderBlockExtensionPips: decimal("orderBlockExtensionPips", { precision: 5, scale: 1 }).default("15.0").notNull(),
  
  // ============= PARÂMETROS DE ENTRADA (M5) =============
  /** Tipo de confirmação de entrada: ENGULF, REJECTION, ANY */
  entryConfirmationType: varchar("entryConfirmationType", { length: 20 }).default("ANY").notNull(),
  /** Mínimo de pavio superior para rejeição (% do range do candle) */
  rejectionWickPercent: decimal("rejectionWickPercent", { precision: 5, scale: 2 }).default("60.00").notNull(),
  
  // ============= GESTÃO DE RISCO =============
  /** Porcentagem do equity a arriscar por trade */
  riskPercentage: decimal("riskPercentage", { precision: 5, scale: 2 }).default("0.75").notNull(),
  /** Máximo de trades simultâneos abertos */
  maxOpenTrades: int("maxOpenTrades").default(3).notNull(),
  /** Limite de perda diária em porcentagem do equity inicial */
  dailyLossLimitPercent: decimal("dailyLossLimitPercent", { precision: 5, scale: 2 }).default("3.00").notNull(),
  /** Buffer em pips acima/abaixo do swing para posicionar SL */
  stopLossBufferPips: decimal("stopLossBufferPips", { precision: 5, scale: 1 }).default("2.0").notNull(),
  /** Ratio Risk:Reward para Take Profit (ex: 4 = 1:4) */
  rewardRiskRatio: decimal("rewardRiskRatio", { precision: 4, scale: 1 }).default("4.0").notNull(),
  
  // ============= HORÁRIOS DE OPERAÇÃO =============
  /** Habilitar filtro de horário */
  sessionFilterEnabled: boolean("sessionFilterEnabled").default(true).notNull(),
  /** Horário de início da sessão de Londres (formato HH:MM, horário de Brasília) */
  londonSessionStart: varchar("londonSessionStart", { length: 5 }).default("04:00").notNull(),
  /** Horário de fim da sessão de Londres */
  londonSessionEnd: varchar("londonSessionEnd", { length: 5 }).default("07:00").notNull(),
  /** Horário de início da sessão de NY */
  nySessionStart: varchar("nySessionStart", { length: 5 }).default("09:30").notNull(),
  /** Horário de fim da sessão de NY */
  nySessionEnd: varchar("nySessionEnd", { length: 5 }).default("12:30").notNull(),
  
  // ============= TRAILING STOP =============
  /** Habilitar trailing stop */
  trailingEnabled: boolean("trailingEnabled").default(true).notNull(),
  /** Pips de lucro para ativar trailing */
  trailingTriggerPips: decimal("trailingTriggerPips", { precision: 5, scale: 1 }).default("20.0").notNull(),
  /** Passo do trailing em pips */
  trailingStepPips: decimal("trailingStepPips", { precision: 5, scale: 1 }).default("10.0").notNull(),
  
  // ============= CIRCUIT BREAKERS =============
  /** Habilitar circuit breaker de perda diária */
  circuitBreakerEnabled: boolean("circuitBreakerEnabled").default(true).notNull(),
  /** Equity inicial do dia (atualizado às 00:00) */
  dailyStartEquity: decimal("dailyStartEquity", { precision: 15, scale: 2 }),
  /** Data do último reset do equity diário */
  dailyEquityResetDate: varchar("dailyEquityResetDate", { length: 10 }),
  /** Flag indicando se o trading está bloqueado hoje */
  tradingBlockedToday: boolean("tradingBlockedToday").default(false).notNull(),
  
  // ============= ESTADO DO SWARM =============
  /** Estado atual de cada símbolo (JSON com estados de sweep, choch, etc.) */
  swarmState: text("swarmState"),
  
  // ============= LOGS E DEBUG =============
  /** Habilitar logs detalhados da estratégia */
  verboseLogging: boolean("verboseLogging").default(true).notNull(),
  
  // ============= METADADOS =============
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SMCStrategyConfig = typeof smcStrategyConfig.$inferSelect;
export type InsertSMCStrategyConfig = typeof smcStrategyConfig.$inferInsert;

/**
 * Histórico de Swing Points identificados (para debug e análise)
 */
export const smcSwingPoints = mysqlTable("smcSwingPoints", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  botId: int("botId").notNull().default(1),
  
  /** Símbolo do ativo */
  symbol: varchar("symbol", { length: 20 }).notNull(),
  /** Timeframe onde foi identificado */
  timeframe: varchar("timeframe", { length: 10 }).notNull(),
  /** Tipo: HIGH ou LOW */
  type: varchar("type", { length: 10 }).notNull(),
  /** Preço do swing point */
  price: decimal("price", { precision: 15, scale: 5 }).notNull(),
  /** Timestamp do candle do swing */
  candleTimestamp: int("candleTimestamp").notNull(),
  /** Se já foi "swept" (varrido) */
  swept: boolean("swept").default(false).notNull(),
  /** Timestamp do sweep (se ocorreu) */
  sweptAt: int("sweptAt"),
  /** Se ainda é válido para análise */
  isValid: boolean("isValid").default(true).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SMCSwingPoint = typeof smcSwingPoints.$inferSelect;
export type InsertSMCSwingPoint = typeof smcSwingPoints.$inferInsert;

/**
 * Log de eventos SMC (Sweeps, CHoCH, OB, Entries)
 */
export const smcEventLog = mysqlTable("smcEventLog", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  botId: int("botId").notNull().default(1),
  
  /** Símbolo do ativo */
  symbol: varchar("symbol", { length: 20 }).notNull(),
  /** Tipo de evento: SWING_DETECTED, SWEEP, CHOCH, OB_IDENTIFIED, ENTRY, EXIT */
  eventType: varchar("eventType", { length: 30 }).notNull(),
  /** Timeframe do evento */
  timeframe: varchar("timeframe", { length: 10 }).notNull(),
  /** Preço no momento do evento */
  price: decimal("price", { precision: 15, scale: 5 }).notNull(),
  /** Descrição detalhada do evento */
  description: text("description").notNull(),
  /** Dados adicionais em JSON */
  metadata: text("metadata"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SMCEventLog = typeof smcEventLog.$inferSelect;
export type InsertSMCEventLog = typeof smcEventLog.$inferInsert;
