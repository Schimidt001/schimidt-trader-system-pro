import { eq, and, desc, gte, lte, sql, not } from "drizzle-orm";
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

export async function getConfigByUserId(userId: number): Promise<Config | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(config).where(eq(config.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertConfig(data: InsertConfig): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getConfigByUserId(data.userId);
  if (existing) {
    await db.update(config).set(data).where(eq(config.userId, data.userId));
  } else {
    await db.insert(config).values(data);
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
  limit: number = 100
): Promise<Candle[]> {
  const db = await getDb();
  if (!db) return [];
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

export async function getUserPositions(userId: number, limit: number = 50): Promise<Position[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(positions)
    .where(eq(positions.userId, userId))
    .orderBy(desc(positions.createdAt))
    .limit(limit);
}

export async function getTodayPositions(userId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Fazer JOIN com candles para obter open, high, low do candle
  const results = await db
    .select({
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

  const existing = await db
    .select()
    .from(metrics)
    .where(
      and(
        eq(metrics.userId, data.userId),
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
    await db.insert(metrics).values(data);
  }
}

export async function getMetric(
  userId: number,
  date: string,
  period: "daily" | "monthly"
): Promise<Metric | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(metrics)
    .where(
      and(
        eq(metrics.userId, userId),
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

export async function getRecentEventLogs(userId: number, limit: number = 100): Promise<EventLog[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(eventLogs)
    .where(eq(eventLogs.userId, userId))
    .orderBy(desc(eventLogs.timestampUtc))
    .limit(limit);
}

// ============= BOT STATE QUERIES =============

export async function getBotState(userId: number): Promise<BotState | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(botState).where(eq(botState.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertBotState(data: InsertBotState): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getBotState(data.userId);
  if (existing) {
    await db.update(botState).set(data).where(eq(botState.userId, data.userId));
  } else {
    await db.insert(botState).values(data);
  }
}


// ============= TIME FILTER QUERIES =============

/**
 * Atualiza configuração do filtro de horário
 */
export async function updateTimeFilterConfig(
  userId: number,
  data: {
    timeFilterEnabled?: boolean;
    allowedHours?: number[];
    goldHours?: number[];
    goldStake?: number;
    timezone?: string;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: Record<string, any> = {};

  if (data.timeFilterEnabled !== undefined) {
    updateData.timeFilterEnabled = data.timeFilterEnabled;
  }

  if (data.allowedHours !== undefined) {
    updateData.allowedHours = JSON.stringify(data.allowedHours);
  }

  if (data.goldHours !== undefined) {
    updateData.goldHours = JSON.stringify(data.goldHours);
  }

  if (data.goldStake !== undefined) {
    updateData.goldStake = data.goldStake;
  }

  if (data.timezone !== undefined) {
    updateData.timezone = data.timezone;
  }

  await db.update(config).set(updateData).where(eq(config.userId, userId));
}

/**
 * Atualiza informações do filtro de horário no botState
 */
export async function updateBotTimeFilterInfo(
  userId: number,
  data: {
    nextAllowedTime?: number | null;
    nextGoldTime?: number | null;
    isGoldHour?: boolean;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(botState).set(data).where(eq(botState.userId, userId));
}

/**
 * Atualiza cache de fase/estratégia
 */
export async function updatePhaseStrategyCache(
  userId: number,
  cache: {
    phase: string;
    strategy: string;
    timestamp: number;
    symbol: string;
    validityHours: number;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(config)
    .set({ phaseStrategyCache: JSON.stringify(cache) })
    .where(eq(config.userId, userId));
}

/**
 * Invalida cache de fase/estratégia
 */
export async function invalidatePhaseStrategyCache(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(config)
    .set({ phaseStrategyCache: null })
    .where(eq(config.userId, userId));
}
