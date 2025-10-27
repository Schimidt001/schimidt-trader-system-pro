import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, decimal, bigint } from "drizzle-orm/mysql-core";

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
 */
export const config = mysqlTable("config", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  mode: mysqlEnum("mode", ["DEMO", "REAL"]).default("DEMO").notNull(),
  tokenDemo: text("tokenDemo"),
  tokenReal: text("tokenReal"),
  symbol: varchar("symbol", { length: 50 }).notNull().default("R_100"),
  stake: int("stake").notNull().default(10), // em centavos
  stopDaily: int("stopDaily").notNull().default(10000), // em centavos
  takeDaily: int("takeDaily").notNull().default(50000), // em centavos
  lookback: int("lookback").notNull().default(100),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Config = typeof config.$inferSelect;
export type InsertConfig = typeof config.$inferInsert;

/**
 * Histórico de candles M15
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
 */
export const positions = mysqlTable("positions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Position = typeof positions.$inferSelect;
export type InsertPosition = typeof positions.$inferInsert;

/**
 * Métricas diárias e mensais
 */
export const metrics = mysqlTable("metrics", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
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
 */
export const eventLogs = mysqlTable("eventLogs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
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
 */
export const botState = mysqlTable("botState", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  state: mysqlEnum("state", [
    "IDLE",
    "COLLECTING",
    "WAITING_MIDPOINT",
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
});

export type BotState = typeof botState.$inferSelect;
export type InsertBotState = typeof botState.$inferInsert;

