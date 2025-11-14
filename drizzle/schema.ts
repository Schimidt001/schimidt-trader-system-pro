import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, decimal, bigint, unique, index } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Configurações do bot trader
 * ✅ CORRIGIDO: Adicionado botId
 */
export const config = mysqlTable("config", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  botId: int("botId").notNull().default(1), // ✅ ADICIONADO
  mode: mysqlEnum("mode", ["DEMO", "REAL"]).default("DEMO").notNull(),
  tokenDemo: text("tokenDemo"),
  tokenReal: text("tokenReal"),
  symbol: varchar("symbol", { length: 50 }).notNull().default("R_100"),
  stake: int("stake").notNull().default(10), // em centavos
  stopDaily: int("stopDaily").notNull().default(10000), // em centavos
  takeDaily: int("takeDaily").notNull().default(50000), // em centavos
  lookback: int("lookback").notNull().default(500), // Aumentado para 500 candles
  triggerOffset: int("triggerOffset").default(16), // offset do gatilho em pontos
  profitThreshold: int("profitThreshold").default(90), // threshold de lucro para early close (%)
  waitTime: int("waitTime").default(8), // tempo de espera em minutos antes de capturar dados para predição
  timeframe: int("timeframe").notNull().default(900), // timeframe em segundos: 900 (M15), 1800 (M30) ou 3600 (M60)
  // Configurações de re-predição para M30 e M60
  repredictionEnabled: boolean("repredictionEnabled").default(true).notNull(), // Habilitar re-predição para M30 e M60
  repredictionDelay: int("repredictionDelay").default(300).notNull(), // Delay em segundos (padrão: 300s = 5 min)
  // Configurações de tipo de contrato e barreiras
  contractType: mysqlEnum("contractType", ["RISE_FALL", "TOUCH", "NO_TOUCH"]).default("RISE_FALL").notNull(), // Tipo de contrato
  barrierHigh: varchar("barrierHigh", { length: 20 }).default("3.00"), // Barreira superior em pontos (ex: "3.00" = 3 pontos acima)
  barrierLow: varchar("barrierLow", { length: 20 }).default("-3.00"), // Barreira inferior em pontos (ex: "-3.00" = 3 pontos abaixo)
  forexMinDurationMinutes: int("forexMinDurationMinutes").default(15).notNull(), // Duração mínima para Forex em minutos
  allowEquals: boolean("allowEquals").default(false).notNull(), // Permitir empate como vitória (preço de fechamento igual ao de entrada)
  useCandleDuration: boolean("useCandleDuration").default(false).notNull(), // Usar duração dinâmica até o final do candle atual
  // Configurações do Filtro de Horário
  hourlyFilterEnabled: boolean("hourlyFilterEnabled").default(false).notNull(), // Habilitar filtro de horário
  hourlyFilterMode: mysqlEnum("hourlyFilterMode", ["IDEAL", "COMPATIBLE", "GOLDEN", "COMBINED", "CUSTOM"]).default("COMBINED").notNull(), // Modo do filtro
  hourlyFilterCustomHours: text("hourlyFilterCustomHours"), // Horários personalizados (JSON array)
  hourlyFilterGoldHours: text("hourlyFilterGoldHours"), // Horários GOLD (JSON array, máx 2)
  hourlyFilterGoldMultiplier: int("hourlyFilterGoldMultiplier").default(200).notNull(), // Multiplicador de stake para horários GOLD (100 = 1x, 200 = 2x)
  // Configurações da IA Hedge Inteligente
  hedgeEnabled: boolean("hedgeEnabled").default(true).notNull(), // Toggle para ativar/desativar IA Hedge
  hedgeConfig: text("hedgeConfig"), // Configurações de hedge armazenadas como JSON
  // Configurações de conexão DERIV
  derivAppId: varchar("derivAppId", { length: 20 }).default("1089"), // App ID personalizado da DERIV (padrão: 1089 para testes)
  // Configurações do Market Condition Detector
  marketConditionEnabled: boolean("marketConditionEnabled").default(false).notNull(), // Habilitar detector de condições de mercado
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Config = typeof config.$inferSelect;
export type InsertConfig = typeof config.$inferInsert;

/**
 * Histórico de candles (M15, M30, M60)
 * ✅ OK: Não precisa de botId (dados compartilhados)
 */
export const candles = mysqlTable("candles", {
  id: int("id").autoincrement().primaryKey(),
  symbol: varchar("symbol", { length: 50 }).notNull(),
  timeframe: varchar("timeframe", { length: 10 }).notNull().default("M15"),
  timestampUtc: bigint("timestampUtc", { mode: "number" }).notNull(), // Unix timestamp em segundos
  open: varchar("open", { length: 20 }).notNull(), // string para precisão decimal
  high: varchar("high", { length: 20 }).notNull(),
  low: varchar("low", { length: 20 }).notNull(),
  close: varchar("close", { length: 20 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Candle = typeof candles.$inferSelect;
export type InsertCandle = typeof candles.$inferInsert;

/**
 * Posições abertas e históricas
 * ✅ CORRIGIDO: Adicionado botId
 */
export const positions = mysqlTable("positions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  botId: int("botId").notNull().default(1), // ✅ ADICIONADO
  contractId: varchar("contractId", { length: 100 }).unique(),
  symbol: varchar("symbol", { length: 50 }).notNull(),
  direction: mysqlEnum("direction", ["up", "down"]).notNull(),
  stake: int("stake").notNull(), // em centavos
  entryPrice: varchar("entryPrice", { length: 20 }).notNull(),
  exitPrice: varchar("exitPrice", { length: 20 }),
  predictedClose: varchar("predictedClose", { length: 20 }).notNull(),
  trigger: varchar("trigger", { length: 20 }).notNull(),
  phase: varchar("phase", { length: 50 }),
  strategy: varchar("strategy", { length: 50 }),
  confidence: varchar("confidence", { length: 20 }),
  pnl: int("pnl"), // em centavos
  status: mysqlEnum("status", ["ARMED", "ENTERED", "CLOSED", "CANCELLED"]).notNull(),
  candleTimestamp: bigint("candleTimestamp", { mode: "number" }).notNull(),
  entryTime: timestamp("entryTime"),
  exitTime: timestamp("exitTime"),
  // Campos da IA Hedge
  isHedge: boolean("isHedge").default(false).notNull(), // Indica se é hedge ou posição original
  parentPositionId: int("parentPositionId"), // ID da posição original (se for hedge)
  hedgeAction: varchar("hedgeAction", { length: 50 }), // HOLD, REINFORCE, HEDGE, REVERSAL_EDGE
  hedgeReason: text("hedgeReason"), // Motivo da abertura do hedge
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Position = typeof positions.$inferSelect;
export type InsertPosition = typeof positions.$inferInsert;

/**
 * Métricas diárias e mensais
 * ✅ CORRIGIDO: Adicionado botId
 */
export const metrics = mysqlTable("metrics", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  botId: int("botId").notNull().default(1), // ✅ ADICIONADO
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  period: mysqlEnum("period", ["daily", "monthly"]).notNull(),
  totalTrades: int("totalTrades").notNull().default(0),
  wins: int("wins").notNull().default(0),
  losses: int("losses").notNull().default(0),
  pnl: int("pnl").notNull().default(0), // em centavos
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Metric = typeof metrics.$inferSelect;
export type InsertMetric = typeof metrics.$inferInsert;

/**
 * Log de eventos do sistema
 * ✅ CORRIGIDO: Adicionado botId
 */
export const eventLogs = mysqlTable("eventLogs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  botId: int("botId").notNull().default(1), // ✅ ADICIONADO
  eventType: varchar("eventType", { length: 50 }).notNull(),
  message: text("message").notNull(),
  data: text("data"), // JSON string
  timestampUtc: bigint("timestampUtc", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EventLog = typeof eventLogs.$inferSelect;
export type InsertEventLog = typeof eventLogs.$inferInsert;

/**
 * Estado atual do bot
 * ✅ CORRIGIDO: Adicionado botId + UNIQUE composto
 */
export const botState = mysqlTable("botState", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // ✅ UNIQUE removido
  botId: int("botId").notNull().default(1), // ✅ ADICIONADO
  state: mysqlEnum("state", [
    "IDLE",
    "COLLECTING",
    "WAITING_MIDPOINT",
    "WAITING_NEXT_HOUR",
    "PREDICTING",
    "ARMED",
    "ENTERED",
    "MANAGING",
    "CLOSED",
    "LOCK_RISK",
    "ERROR_API",
    "DISCONNECTED"
  ]).notNull().default("IDLE"),
  isRunning: boolean("isRunning").notNull().default(false),
  currentCandleTimestamp: bigint("currentCandleTimestamp", { mode: "number" }),
  currentPositionId: int("currentPositionId"),
  lastError: text("lastError"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // ✅ UNIQUE composto adicionado
  userIdBotIdUnique: unique("userId_botId_unique").on(table.userId, table.botId),
}));

export type BotState = typeof botState.$inferSelect;
export type InsertBotState = typeof botState.$inferInsert;

/**
 * Condições de mercado avaliadas pelo Market Condition Detector
 */
export const marketConditions = mysqlTable("marketConditions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  botId: int("botId").notNull().default(1),
  candleTimestamp: bigint("candleTimestamp", { mode: "number" }).notNull(), // timestamp do candle avaliado
  symbol: varchar("symbol", { length: 50 }).notNull(),
  status: mysqlEnum("status", ["GREEN", "YELLOW", "RED"]).notNull(),
  score: int("score").notNull(), // 0-10
  reasons: text("reasons").notNull(), // JSON array de strings
  details: text("details"), // JSON com detalhes opcionais (ATR, amplitude, etc.)
  computedAt: timestamp("computedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MarketCondition = typeof marketConditions.$inferSelect;
export type InsertMarketCondition = typeof marketConditions.$inferInsert;

/**
 * Eventos macroeconômicos coletados de fontes externas
 */
export const marketEvents = mysqlTable("marketEvents", {
  id: int("id").autoincrement().primaryKey(),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(), // Unix timestamp do evento
  currency: varchar("currency", { length: 10 }).notNull(), // Moeda afetada (USD, JPY, EUR, etc)
  impact: mysqlEnum("impact", ["HIGH", "MEDIUM", "LOW"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(), // Título do evento
  description: text("description"), // Descrição detalhada
  source: varchar("source", { length: 50 }).notNull(), // Fonte (ForexFactory, TradingEconomics, etc)
  actual: varchar("actual", { length: 50 }), // Valor atual
  forecast: varchar("forecast", { length: 50 }), // Valor previsto
  previous: varchar("previous", { length: 50 }), // Valor anterior
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  timestampIdx: index("timestamp_idx").on(table.timestamp),
  currencyIdx: index("currency_idx").on(table.currency),
  impactIdx: index("impact_idx").on(table.impact),
}));

export type MarketEvent = typeof marketEvents.$inferSelect;
export type InsertMarketEvent = typeof marketEvents.$inferInsert;

/**
 * Configurações do Market Condition Detector por usuário
 */
export const marketDetectorConfig = mysqlTable("marketDetectorConfig", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  
  // Habilitação
  enabled: boolean("enabled").default(true).notNull(),
  
  // Critérios internos
  atrWindow: int("atrWindow").default(14).notNull(),
  atrMultiplier: decimal("atrMultiplier", { precision: 4, scale: 2 }).default("2.50").notNull(),
  atrScore: int("atrScore").default(2).notNull(),
  
  wickMultiplier: decimal("wickMultiplier", { precision: 4, scale: 2 }).default("2.00").notNull(),
  wickScore: int("wickScore").default(1).notNull(),
  
  fractalThreshold: decimal("fractalThreshold", { precision: 4, scale: 2 }).default("1.80").notNull(),
  fractalScore: int("fractalScore").default(1).notNull(),
  
  spreadMultiplier: decimal("spreadMultiplier", { precision: 4, scale: 2 }).default("2.00").notNull(),
  spreadScore: int("spreadScore").default(1).notNull(),
  
  // Critérios externos (notícias)
  weightHigh: int("weightHigh").default(3).notNull(),
  weightMedium: int("weightMedium").default(1).notNull(),
  weightHighPast: int("weightHighPast").default(2).notNull(),
  windowNextNews: int("windowNextNews").default(60).notNull(), // minutos
  windowPastNews: int("windowPastNews").default(30).notNull(), // minutos
  
  // Thresholds de classificação
  greenThreshold: int("greenThreshold").default(3).notNull(),
  yellowThreshold: int("yellowThreshold").default(6).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MarketDetectorConfig = typeof marketDetectorConfig.$inferSelect;
export type InsertMarketDetectorConfig = typeof marketDetectorConfig.$inferInsert;
