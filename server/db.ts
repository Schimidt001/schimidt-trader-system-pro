import { eq, and, desc, gte, lte, sql, not, inArray, asc, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  config,
  Config,
  InsertConfig,
  candles,
  Candle,
  InsertCandle,
  positions,
  Position,
  InsertPosition,
  metrics,
  Metric,
  InsertMetric,
  eventLogs,
  EventLog,
  InsertEventLog,
  botState,
  BotState,
  InsertBotState,
  marketConditions,
  MarketCondition,
  InsertMarketCondition,
  marketEvents,
  MarketEvent,
  InsertMarketEvent,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============= USER QUERIES =============

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ============= CONFIG QUERIES =============

export async function getConfigByUserId(userId: number, botId: number = 1): Promise<Config | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(config).where(and(eq(config.userId, userId), eq(config.botId, botId))).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertConfig(data: InsertConfig): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const botId = data.botId ?? 1;
  const existing = await getConfigByUserId(data.userId, botId);
  if (existing) {
    await db.update(config).set(data).where(and(eq(config.userId, data.userId), eq(config.botId, botId)));
  } else {
    await db.insert(config).values({ ...data, botId });
  }
}

// ============= CANDLE QUERIES =============

export async function insertCandle(data: InsertCandle): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(candles).values(data);
}

export async function getCandleHistory(
  symbol: string,
  limit: number = 100,
  timeframe?: string // Opcional: filtrar por timeframe (M15, M30, M60)
): Promise<Candle[]> {
  const db = await getDb();
  if (!db) return [];
  
  // Se timeframe for especificado, filtrar por ele
  if (timeframe) {
    return db
      .select()
      .from(candles)
      .where(and(eq(candles.symbol, symbol), eq(candles.timeframe, timeframe)))
      .orderBy(desc(candles.timestampUtc))
      .limit(limit);
  }
  
  // Sem timeframe, retornar todos (comportamento antigo para compatibilidade)
  return db
    .select()
    .from(candles)
    .where(eq(candles.symbol, symbol))
    .orderBy(desc(candles.timestampUtc))
    .limit(limit);
}

export async function getLatestCandle(symbol: string): Promise<Candle | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(candles)
    .where(eq(candles.symbol, symbol))
    .orderBy(desc(candles.timestampUtc))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ============= POSITION QUERIES =============

export async function insertPosition(data: InsertPosition): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(positions).values(data);
  return Number(result[0].insertId);
}

export async function updatePosition(id: number, data: Partial<InsertPosition>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(positions).set(data).where(eq(positions.id, id));
}

export async function getPositionById(id: number): Promise<Position | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(positions).where(eq(positions.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getPositionByContractId(contractId: string): Promise<Position | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(positions).where(eq(positions.contractId, contractId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserPositions(userId: number, botId: number = 1, limit: number = 50): Promise<Position[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(positions)
    .where(and(eq(positions.userId, userId), eq(positions.botId, botId)))
    .orderBy(desc(positions.createdAt))
    .limit(limit);
}

export async function getTodayPositions(userId: number, botId: number = 1): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Fazer JOIN com candles para obter open, high, low do candle
  // Usar subquery para garantir apenas 1 candle por timestamp
  const results = await db
    .selectDistinct({
      id: positions.id,
      userId: positions.userId,
      contractId: positions.contractId,
      symbol: positions.symbol,
      direction: positions.direction,
      stake: positions.stake,
      entryPrice: positions.entryPrice,
      exitPrice: positions.exitPrice,
      predictedClose: positions.predictedClose,
      trigger: positions.trigger,
      phase: positions.phase,
      strategy: positions.strategy,
      confidence: positions.confidence,
      pnl: positions.pnl,
      status: positions.status,
      candleTimestamp: positions.candleTimestamp,
      entryTime: positions.entryTime,
      exitTime: positions.exitTime,
      createdAt: positions.createdAt,
      updatedAt: positions.updatedAt,
      // Dados do candle
      candleOpen: candles.open,
      candleHigh: candles.high,
      candleLow: candles.low,
      candleClose: candles.close,
    })
    .from(positions)
    .leftJoin(
      candles,
      and(
        eq(candles.symbol, positions.symbol),
        eq(candles.timestampUtc, positions.candleTimestamp)
      )
    )
    .where(
      and(
        eq(positions.userId, userId),
        eq(positions.botId, botId),
        gte(positions.createdAt, today),
        not(eq(positions.status, "CANCELLED"))
      )
    )
    .orderBy(desc(positions.createdAt));
  
  return results;
}

// ============= METRICS QUERIES =============

export async function upsertMetric(data: InsertMetric): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const botId = data.botId ?? 1;
  const existing = await db
    .select()
    .from(metrics)
    .where(
      and(
        eq(metrics.userId, data.userId),
        eq(metrics.botId, botId),
        eq(metrics.date, data.date),
        eq(metrics.period, data.period)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(metrics)
      .set(data)
      .where(eq(metrics.id, existing[0].id));
  } else {
    await db.insert(metrics).values({ ...data, botId });
  }
}

export async function getMetric(
  userId: number,
  date: string,
  period: "daily" | "monthly",
  botId: number = 1
): Promise<Metric | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(metrics)
    .where(
      and(
        eq(metrics.userId, userId),
        eq(metrics.botId, botId),
        eq(metrics.date, date),
        eq(metrics.period, period)
      )
    )
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============= EVENT LOG QUERIES =============

export async function insertEventLog(data: InsertEventLog): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(eventLogs).values(data);
}

export async function getRecentEventLogs(userId: number, botId: number = 1, limit: number = 100): Promise<EventLog[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(eventLogs)
    .where(and(eq(eventLogs.userId, userId), eq(eventLogs.botId, botId)))
    .orderBy(desc(eventLogs.timestampUtc))
    .limit(limit);
}

// ============= BOT STATE QUERIES =============

export async function getBotState(userId: number, botId: number = 1): Promise<BotState | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(botState).where(and(eq(botState.userId, userId), eq(botState.botId, botId))).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertBotState(data: InsertBotState): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const botId = data.botId ?? 1;
  const existing = await getBotState(data.userId, botId);
  if (existing) {
    await db.update(botState).set(data).where(and(eq(botState.userId, data.userId), eq(botState.botId, botId)));
  } else {
    await db.insert(botState).values({ ...data, botId });
  }
}

// ============= MARKET CONDITIONS QUERIES =============

/**
 * Insere uma nova condição de mercado
 */
export async function insertMarketCondition(data: InsertMarketCondition): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(marketConditions).values(data);
}

/**
 * Busca a última condição de mercado para um usuário/bot/símbolo
 */
export async function getLatestMarketCondition(
  userId: number,
  botId: number,
  symbol: string
): Promise<MarketCondition | null> {
  const db = await getDb();
  if (!db) return null;

  const results = await db
    .select()
    .from(marketConditions)
    .where(
      and(
        eq(marketConditions.userId, userId),
        eq(marketConditions.botId, botId),
        eq(marketConditions.symbol, symbol)
      )
    )
    .orderBy(desc(marketConditions.candleTimestamp))
    .limit(1);

  return results[0] || null;
}

/**
 * Busca o histórico de condições de mercado (últimas N horas ou X registros)
 */
export async function getMarketConditionHistory(
  userId: number,
  botId: number,
  symbol: string,
  limit: number = 24
): Promise<MarketCondition[]> {
  const db = await getDb();
  if (!db) return [];

  const results = await db
    .select()
    .from(marketConditions)
    .where(
      and(
        eq(marketConditions.userId, userId),
        eq(marketConditions.botId, botId),
        eq(marketConditions.symbol, symbol)
      )
    )
    .orderBy(desc(marketConditions.candleTimestamp))
    .limit(limit);

  return results;
}

/**
 * Busca condições de mercado para uma data específica
 */
export async function getMarketConditionsByDate(
  userId: number,
  botId: number,
  symbol: string,
  date: Date
): Promise<MarketCondition[]> {
  const db = await getDb();
  if (!db) return [];

  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const results = await db
    .select()
    .from(marketConditions)
    .where(
      and(
        eq(marketConditions.userId, userId),
        eq(marketConditions.botId, botId),
        eq(marketConditions.symbol, symbol),
        gte(marketConditions.computedAt, startOfDay),
        lte(marketConditions.computedAt, endOfDay)
      )
    )
    .orderBy(desc(marketConditions.candleTimestamp));

  return results;
}

// ============================================================================
// MARKET EVENTS
// ============================================================================

/**
 * Insere um evento macroeconômico
 */
export async function insertMarketEvent(data: InsertMarketEvent): Promise<void> {
  await db.insert(marketEvents).values(data);
}

/**
 * Insere múltiplos eventos macroeconômicos
 */
export async function insertMarketEvents(events: InsertMarketEvent[]): Promise<void> {
  if (events.length === 0) return;
  await db.insert(marketEvents).values(events);
}

/**
 * Obtém eventos futuros (próximas N horas)
 */
export async function getUpcomingMarketEvents(
  currencies: string[],
  hoursAhead: number = 24
): Promise<MarketEvent[]> {
  const now = Math.floor(Date.now() / 1000);
  const futureLimit = now + (hoursAhead * 3600);
  
  const results = await db
    .select()
    .from(marketEvents)
    .where(
      and(
        inArray(marketEvents.currency, currencies),
        gte(marketEvents.timestamp, now),
        lte(marketEvents.timestamp, futureLimit)
      )
    )
    .orderBy(asc(marketEvents.timestamp));
  
  return results;
}

/**
 * Obtém eventos recentes (últimas N horas)
 */
export async function getRecentMarketEvents(
  currencies: string[],
  hoursBack: number = 12
): Promise<MarketEvent[]> {
  const now = Math.floor(Date.now() / 1000);
  const pastLimit = now - (hoursBack * 3600);
  
  const results = await db
    .select()
    .from(marketEvents)
    .where(
      and(
        inArray(marketEvents.currency, currencies),
        gte(marketEvents.timestamp, pastLimit),
        lte(marketEvents.timestamp, now)
      )
    )
    .orderBy(desc(marketEvents.timestamp));
  
  return results;
}

/**
 * Obtém eventos para uma data específica
 */
export async function getMarketEventsByDate(
  currencies: string[],
  date: Date
): Promise<MarketEvent[]> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const startTimestamp = Math.floor(startOfDay.getTime() / 1000);
  const endTimestamp = Math.floor(endOfDay.getTime() / 1000);
  
  const results = await db
    .select()
    .from(marketEvents)
    .where(
      and(
        inArray(marketEvents.currency, currencies),
        gte(marketEvents.timestamp, startTimestamp),
        lte(marketEvents.timestamp, endTimestamp)
      )
    )
    .orderBy(asc(marketEvents.timestamp));
  
  return results;
}

/**
 * Remove eventos antigos (mais de N dias)
 */
export async function cleanupOldMarketEvents(daysToKeep: number = 7): Promise<void> {
  const cutoffTimestamp = Math.floor(Date.now() / 1000) - (daysToKeep * 24 * 3600);
  
  await db
    .delete(marketEvents)
    .where(lt(marketEvents.timestamp, cutoffTimestamp));
}
