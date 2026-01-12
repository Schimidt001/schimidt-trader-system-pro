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
  // CORREÇÃO: M15 como padrão para maior frequência de sinais
  structureTimeframe: varchar("structureTimeframe", { length: 5 }).default("M15").notNull(),
  
  // ============= ATIVOS MONITORADOS (SWARM) =============
  /** Lista de símbolos ativos para monitoramento (JSON Array) */
  activeSymbols: text("activeSymbols").default('["EURUSD","GBPUSD","USDJPY","XAUUSD"]').notNull(),
  
  // ============= PARÂMETROS DE ESTRUTURA =============
  /** Quantidade de candles para lookback na identificação de swings */
  // CORREÇÃO: 30 conforme UI
  swingH1Lookback: int("swingH1Lookback").default(30).notNull(),
  /** Quantidade de velas à esquerda para validar fractal */
  // CORREÇÃO: 1 conforme UI (mais sensível)
  fractalLeftBars: int("fractalLeftBars").default(1).notNull(),
  /** Quantidade de velas à direita para validar fractal */
  // CORREÇÃO: 1 conforme UI (mais sensível)
  fractalRightBars: int("fractalRightBars").default(1).notNull(),
  
  // ============= PARÂMETROS DE SWEEP =============
  /** Buffer em pips acima/abaixo do swing para considerar sweep */
  // CORREÇÃO: 0.5 conforme UI (mais sensível)
  sweepBufferPips: decimal("sweepBufferPips", { precision: 5, scale: 1 }).default("0.5").notNull(),
  /** Tempo máximo em minutos para validar sweep após violação */
  // CORREÇÃO: 90 conforme UI
  sweepValidationMinutes: int("sweepValidationMinutes").default(90).notNull(),
  
  // ============= PARÂMETROS DE CHoCH (M15) =============
  /** Lookback de candles M15 para identificar estrutura */
  // CORREÇÃO: 15 conforme UI
  chochM15Lookback: int("chochM15Lookback").default(15).notNull(),
  /** Mínimo de pips de movimento para validar CHoCH */
  // CORREÇÃO: 2.0 conforme UI (mais agressivo)
  chochMinPips: decimal("chochMinPips", { precision: 5, scale: 1 }).default("2.0").notNull(),
  
  // ============= PARÂMETROS DE ORDER BLOCK =============
  /** Máximo de candles para trás para identificar OB após CHoCH */
  // CORREÇÃO: 15 conforme UI
  orderBlockLookback: int("orderBlockLookback").default(15).notNull(),
  /** Extensão máxima da zona do OB em pips */
  // CORREÇÃO: 3.0 conforme UI
  orderBlockExtensionPips: decimal("orderBlockExtensionPips", { precision: 5, scale: 1 }).default("3.0").notNull(),
  
  // ============= PARÂMETROS DE ENTRADA (M5) =============
  /** Tipo de confirmação de entrada: ENGULF, REJECTION, ANY */
  entryConfirmationType: varchar("entryConfirmationType", { length: 20 }).default("ANY").notNull(),
  /** Mínimo de pavio superior para rejeição (% do range do candle) */
  // CORREÇÃO: 20 conforme DEFAULT_SMC_CONFIG
  rejectionWickPercent: decimal("rejectionWickPercent", { precision: 5, scale: 2 }).default("20.00").notNull(),
  
  // ============= FILTRO DE SPREAD =============
  /** Habilitar filtro de spread máximo */
  spreadFilterEnabled: boolean("spreadFilterEnabled").default(true).notNull(),
  /** Spread máximo permitido em pips para entrada */
  // CORREÇÃO: 3.0 conforme UI
  maxSpreadPips: decimal("maxSpreadPips", { precision: 5, scale: 1 }).default("3.0").notNull(),
  
  // ============= GESTÃO DE RISCO =============
  /** Porcentagem do equity a arriscar por trade */
  // CORREÇÃO: 2.0 conforme UI
  riskPercentage: decimal("riskPercentage", { precision: 5, scale: 2 }).default("2.00").notNull(),
  /** Máximo de trades simultâneos abertos */
  // CORREÇÃO: 2 conforme UI
  maxOpenTrades: int("maxOpenTrades").default(2).notNull(),
  /** Limite de perda diária em porcentagem do equity inicial */
  // CORREÇÃO: 10.0 conforme UI
  dailyLossLimitPercent: decimal("dailyLossLimitPercent", { precision: 5, scale: 2 }).default("10.00").notNull(),
  /** Buffer em pips acima/abaixo do swing para posicionar SL */
  stopLossBufferPips: decimal("stopLossBufferPips", { precision: 5, scale: 1 }).default("2.0").notNull(),
  /** Ratio Risk:Reward para Take Profit (ex: 3 = 1:3) */
  // CORREÇÃO: 3.0 conforme UI
  rewardRiskRatio: decimal("rewardRiskRatio", { precision: 4, scale: 1 }).default("3.0").notNull(),
  
  // ============= HORÁRIOS DE OPERAÇÃO =============
  /** Habilitar filtro de horário */
  sessionFilterEnabled: boolean("sessionFilterEnabled").default(true).notNull(),
  /** Horário de início da sessão de Londres (formato HH:MM, horário de Brasília) */
  // CORREÇÃO: 05:00 conforme UI
  londonSessionStart: varchar("londonSessionStart", { length: 5 }).default("05:00").notNull(),
  /** Horário de fim da sessão de Londres */
  // CORREÇÃO: 12:00 conforme UI
  londonSessionEnd: varchar("londonSessionEnd", { length: 5 }).default("12:00").notNull(),
  /** Horário de início da sessão de NY */
  // CORREÇÃO: 09:00 conforme UI
  nySessionStart: varchar("nySessionStart", { length: 5 }).default("09:00").notNull(),
  /** Horário de fim da sessão de NY */
  // CORREÇÃO: 17:00 conforme UI
  nySessionEnd: varchar("nySessionEnd", { length: 5 }).default("17:00").notNull(),
  
  // ============= TRAILING STOP =============
  /** Habilitar trailing stop */
  trailingEnabled: boolean("trailingEnabled").default(true).notNull(),
  /** Pips de lucro para ativar trailing */
  // CORREÇÃO: 10.0 conforme UI
  trailingTriggerPips: decimal("trailingTriggerPips", { precision: 5, scale: 1 }).default("10.0").notNull(),
  /** Passo do trailing em pips */
  // CORREÇÃO: 2.0 conforme UI
  trailingStepPips: decimal("trailingStepPips", { precision: 5, scale: 1 }).default("2.0").notNull(),
  
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
  
  // ============= MODO HÍBRIDO =============
  /** Modo de operação: SMC_ONLY, RSI_VWAP_ONLY, HYBRID */
  hybridMode: varchar("hybridMode", { length: 20 }).default("SMC_ONLY").notNull(),
  /** Exposição máxima total em porcentagem do equity */
  maxTotalExposurePercent: decimal("maxTotalExposurePercent", { precision: 5, scale: 2 }).default("7.00").notNull(),
  /** Máximo de trades por símbolo */
  maxTradesPerSymbol: int("maxTradesPerSymbol").default(1).notNull(),
  
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
