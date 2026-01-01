/**
 * Schema de Configuração para IC Markets / cTrader
 * 
 * Tabela separada para armazenar credenciais e configurações
 * específicas da IC Markets via cTrader Open API.
 * 
 * NOTA: Esta tabela será adicionada ao schema principal após validação.
 */

import { int, mysqlTable, text, timestamp, varchar, boolean, decimal, bigint } from "drizzle-orm/mysql-core";

/**
 * Configurações da conta IC Markets (cTrader)
 */
export const icmarketsConfig = mysqlTable("icmarketsConfig", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  botId: int("botId").notNull().default(1),
  
  // ============= TIPO DE ESTRATÉGIA =============
  /** Tipo de estratégia: TREND_SNIPER ou SMC_SWARM */
  strategyType: varchar("strategyType", { length: 20 }).default("SMC_SWARM").notNull(),
  
  // ============= CREDENCIAIS cTRADER =============
  /** Client ID da aplicação cTrader Open API */
  clientId: varchar("clientId", { length: 100 }),
  /** Client Secret da aplicação (encriptado) */
  clientSecret: text("clientSecret"),
  /** Access Token de autenticação (encriptado) */
  accessToken: text("accessToken"),
  /** Refresh Token para renovação automática */
  refreshToken: text("refreshToken"),
  /** Data de expiração do Access Token */
  tokenExpiresAt: timestamp("tokenExpiresAt"),
  
  // ============= CONFIGURAÇÃO DA CONTA =============
  /** ID da conta cTrader */
  accountId: varchar("accountId", { length: 50 }),
  /** Modo Demo ou Real */
  isDemo: boolean("isDemo").default(true).notNull(),
  /** Alavancagem configurada */
  leverage: int("leverage").default(500).notNull(),
  
  // ============= PARÂMETROS DE TRADING =============
  /** Símbolo padrão (ex: EURUSD) */
  symbol: varchar("symbol", { length: 20 }).default("EURUSD").notNull(),
  /** Timeframe padrão (M1, M5, M15, M30, H1, H4, D1) */
  timeframe: varchar("timeframe", { length: 10 }).default("M15").notNull(),
  /** Tamanho do lote padrão */
  lots: decimal("lots", { precision: 10, scale: 2 }).default("0.01").notNull(),
  
  // ============= GESTÃO DE RISCO =============
  /** Stop Loss padrão em pips */
  stopLossPips: int("stopLossPips").default(15).notNull(),
  /** Take Profit padrão em pips (0 = infinito/trailing) */
  takeProfitPips: int("takeProfitPips").default(0).notNull(),
  /** Stop diário máximo em USD */
  stopDailyUsd: decimal("stopDailyUsd", { precision: 10, scale: 2 }).default("100.00").notNull(),
  /** Take diário máximo em USD */
  takeDailyUsd: decimal("takeDailyUsd", { precision: 10, scale: 2 }).default("500.00").notNull(),
  
  // ============= TRAILING STOP =============
  /** Habilitar Trailing Stop */
  trailingEnabled: boolean("trailingEnabled").default(true).notNull(),
  /** Pips de lucro para ativar Trailing Stop */
  trailingTriggerPips: int("trailingTriggerPips").default(10).notNull(),
  /** Pips de step do Trailing Stop */
  trailingStepPips: int("trailingStepPips").default(5).notNull(),
  
  // ============= INDICADORES TÉCNICOS =============
  /** Período da EMA rápida */
  emaFastPeriod: int("emaFastPeriod").default(9).notNull(),
  /** Período da EMA lenta */
  emaSlowPeriod: int("emaSlowPeriod").default(21).notNull(),
  /** Período do RSI */
  rsiPeriod: int("rsiPeriod").default(14).notNull(),
  /** Nível de sobrecompra do RSI */
  rsiOverbought: int("rsiOverbought").default(70).notNull(),
  /** Nível de sobrevenda do RSI */
  rsiOversold: int("rsiOversold").default(30).notNull(),
  
  // ============= ESTRATÉGIA TREND SNIPER =============
  /** Habilitar estratégia Trend Sniper Smart */
  trendSniperEnabled: boolean("trendSniperEnabled").default(true).notNull(),
  /** Mínimo de pips de distância do preço para entrada */
  entryDistancePips: int("entryDistancePips").default(5).notNull(),
  /** Lookback de candles para análise */
  lookbackCandles: int("lookbackCandles").default(100).notNull(),
  
  // ============= METADADOS =============
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ICMarketsConfig = typeof icmarketsConfig.$inferSelect;
export type InsertICMarketsConfig = typeof icmarketsConfig.$inferInsert;

/**
 * Posições Forex abertas e históricas (IC Markets)
 */
export const forexPositions = mysqlTable("forexPositions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  botId: int("botId").notNull().default(1),
  
  // ============= IDENTIFICAÇÃO =============
  /** ID da posição na cTrader */
  positionId: varchar("positionId", { length: 100 }).unique(),
  /** ID da ordem de abertura */
  openOrderId: varchar("openOrderId", { length: 100 }),
  /** ID da ordem de fechamento */
  closeOrderId: varchar("closeOrderId", { length: 100 }),
  
  // ============= DETALHES DA POSIÇÃO =============
  /** Símbolo (ex: EURUSD) */
  symbol: varchar("symbol", { length: 20 }).notNull(),
  /** Direção (BUY/SELL) */
  direction: varchar("direction", { length: 10 }).notNull(),
  /** Tamanho em lotes */
  lots: decimal("lots", { precision: 10, scale: 2 }).notNull(),
  /** Preço de entrada */
  entryPrice: decimal("entryPrice", { precision: 15, scale: 5 }).notNull(),
  /** Preço de saída */
  exitPrice: decimal("exitPrice", { precision: 15, scale: 5 }),
  
  // ============= GESTÃO DE RISCO =============
  /** Stop Loss inicial */
  initialStopLoss: decimal("initialStopLoss", { precision: 15, scale: 5 }),
  /** Stop Loss atual (pode ser modificado por trailing) */
  currentStopLoss: decimal("currentStopLoss", { precision: 15, scale: 5 }),
  /** Take Profit */
  takeProfit: decimal("takeProfit", { precision: 15, scale: 5 }),
  
  // ============= RESULTADO =============
  /** PnL em USD */
  pnlUsd: decimal("pnlUsd", { precision: 10, scale: 2 }),
  /** PnL em pips */
  pnlPips: decimal("pnlPips", { precision: 10, scale: 1 }),
  /** Swap acumulado */
  swap: decimal("swap", { precision: 10, scale: 2 }).default("0.00"),
  /** Comissão */
  commission: decimal("commission", { precision: 10, scale: 2 }).default("0.00"),
  
  // ============= STATUS =============
  /** Status da posição */
  status: varchar("status", { length: 20 }).notNull().default("OPEN"),
  /** Motivo do fechamento */
  closeReason: varchar("closeReason", { length: 50 }),
  
  // ============= ESTRATÉGIA =============
  /** Estratégia utilizada */
  strategy: varchar("strategy", { length: 50 }),
  /** Sinal de entrada (EMA_CROSS, RSI_OVERSOLD, etc.) */
  entrySignal: varchar("entrySignal", { length: 50 }),
  /** Confiança do sinal (0-100) */
  signalConfidence: int("signalConfidence"),
  
  // ============= TIMESTAMPS =============
  /** Timestamp de abertura */
  openTime: timestamp("openTime"),
  /** Timestamp de fechamento */
  closeTime: timestamp("closeTime"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ForexPosition = typeof forexPositions.$inferSelect;
export type InsertForexPosition = typeof forexPositions.$inferInsert;


/**
 * Logs do Sistema IC Markets (Tempo Real)
 * 
 * Tabela para armazenar todos os logs do sistema de trading IC Markets,
 * incluindo logs de performance, erros, análises, trades, etc.
 * Implementado conforme auditoria técnica para monitorização em tempo real.
 */
export const systemLogs = mysqlTable("systemLogs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  botId: int("botId").notNull().default(1),
  
  // ============= IDENTIFICAÇÃO DO LOG =============
  /** Nível do log: INFO, WARN, ERROR, DEBUG, PERFORMANCE */
  level: varchar("level", { length: 20 }).notNull().default("INFO"),
  /** Categoria do log: TICK, ANALYSIS, TRADE, RISK, CONNECTION, SYSTEM, PERFORMANCE */
  category: varchar("category", { length: 30 }).notNull().default("SYSTEM"),
  /** Fonte do log: SMCTradingEngine, CTraderAdapter, RiskManager, etc. */
  source: varchar("source", { length: 50 }).notNull().default("SYSTEM"),
  
  // ============= CONTEÚDO DO LOG =============
  /** Mensagem principal do log */
  message: text("message").notNull(),
  /** Dados adicionais em formato JSON */
  data: text("data"),
  
  // ============= CONTEXTO =============
  /** Símbolo relacionado (se aplicável) */
  symbol: varchar("symbol", { length: 20 }),
  /** Sinal gerado (se aplicável): BUY, SELL, NONE */
  signal: varchar("signal", { length: 10 }),
  /** Latência em ms (para logs de performance) */
  latencyMs: decimal("latencyMs", { precision: 10, scale: 2 }),
  
  // ============= TIMESTAMPS =============
  /** Timestamp Unix em milissegundos para ordenação precisa */
  timestampMs: bigint("timestampMs", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SystemLog = typeof systemLogs.$inferSelect;
export type InsertSystemLog = typeof systemLogs.$inferInsert;
