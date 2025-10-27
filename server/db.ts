import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
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

export async function getTodayPositions(userId: number): Promise<Position[]> {
  const db = await getDb();
  if (!db) return [];
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return db
    .select()
    .from(positions)
    .where(
      and(
        eq(positions.userId, userId),
        gte(positions.createdAt, today)
      )
    )
    .orderBy(desc(positions.createdAt));
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

