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
  marketDetectorConfig,
  MarketDetectorConfig,
  InsertMarketDetectorConfig,
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
  timeframe?: string, // Opcional: filtrar por timeframe (M15, M30, M60)
  botId?: number // ✅ ADICIONADO: filtrar por botId
): Promise<Candle[]> {
  const db = await getDb();
  if (!db) return [];
  
  // Construir condições de filtro
  const conditions = [eq(candles.symbol, symbol)];
  
  if (timeframe) {
    conditions.push(eq(candles.timeframe, timeframe));
  }
  
  if (botId !== undefined) {
    conditions.push(eq(candles.botId, botId));
  }
  
  return db
    .select()
    .from(candles)
    .where(and(...conditions))
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
      // ✅ CORREÇÃO: Adicionar campos de reconciliação
      reconciled: positions.reconciled,
      reconciledAt: positions.reconciledAt,
      botId: positions.botId,
      isHedge: positions.isHedge,
      parentPositionId: positions.parentPositionId,
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

/**
 * Busca todas as posições fechadas e reconciliadas do mês atual
 * Usado para calcular métricas mensais corretamente
 */
export async function getMonthPositions(userId: number, botId: number = 1): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  
  // Primeiro dia do mês atual
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  firstDayOfMonth.setHours(0, 0, 0, 0);
  
  const results = await db
    .select({
      id: positions.id,
      userId: positions.userId,
      contractId: positions.contractId,
      symbol: positions.symbol,
      direction: positions.direction,
      stake: positions.stake,
      pnl: positions.pnl,
      status: positions.status,
      reconciled: positions.reconciled,
      isHedge: positions.isHedge,
      createdAt: positions.createdAt,
    })
    .from(positions)
    .where(
      and(
        eq(positions.userId, userId),
        eq(positions.botId, botId),
        gte(positions.createdAt, firstDayOfMonth),
        eq(positions.status, "CLOSED"),
        eq(positions.reconciled, true)
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

/**
 * Busca logs de eventos recentes filtrados por usuário, bot e corretora
 * @param userId - ID do usuário
 * @param botId - ID do bot (1 ou 2)
 * @param brokerType - Tipo da corretora (DERIV ou ICMARKETS)
 * @param limit - Número máximo de logs a retornar
 */
export async function getRecentEventLogs(
  userId: number, 
  botId: number = 1, 
  brokerType: "DERIV" | "ICMARKETS" = "DERIV",
  limit: number = 100
): Promise<EventLog[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(eventLogs)
    .where(and(
      eq(eventLogs.userId, userId), 
      eq(eventLogs.botId, botId),
      eq(eventLogs.brokerType, brokerType)
    ))
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
  const db = await getDb();
  if (!db) return;
  await db.insert(marketEvents).values(data);
}

/**
 * Insere múltiplos eventos macroeconômicos
 */
export async function insertMarketEvents(events: InsertMarketEvent[]): Promise<void> {
  if (events.length === 0) return;
  const db = await getDb();
  if (!db) return;
  await db.insert(marketEvents).values(events);
}

/**
 * Obtém eventos futuros (próximas N horas)
 */
export async function getUpcomingMarketEvents(
  currencies: string[],
  hoursAhead: number = 24
): Promise<MarketEvent[]> {
  const db = await getDb();
  if (!db) return [];
  
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
  
  // Remover duplicatas baseado em title + timestamp + currency
  const uniqueEvents = new Map<string, MarketEvent>();
  for (const event of results) {
    const key = `${event.title}_${event.timestamp}_${event.currency}`;
    if (!uniqueEvents.has(key)) {
      uniqueEvents.set(key, event);
    }
  }
  
  return Array.from(uniqueEvents.values());
}

/**
 * Obtém eventos recentes (últimas N horas)
 */
export async function getRecentMarketEvents(
  currencies: string[],
  hoursBack: number = 12
): Promise<MarketEvent[]> {
  const db = await getDb();
  if (!db) return [];
  
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
  
  // Remover duplicatas baseado em title + timestamp + currency
  const uniqueEvents = new Map<string, MarketEvent>();
  for (const event of results) {
    const key = `${event.title}_${event.timestamp}_${event.currency}`;
    if (!uniqueEvents.has(key)) {
      uniqueEvents.set(key, event);
    }
  }
  
  return Array.from(uniqueEvents.values());
}

/**
 * Obtém eventos para uma data específica
 */
export async function getMarketEventsByDate(
  currencies: string[],
  date: Date
): Promise<MarketEvent[]> {
  const db = await getDb();
  if (!db) return [];
  
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
  
  // Remover duplicatas baseado em title + timestamp + currency
  const uniqueEvents = new Map<string, MarketEvent>();
  for (const event of results) {
    const key = `${event.title}_${event.timestamp}_${event.currency}`;
    if (!uniqueEvents.has(key)) {
      uniqueEvents.set(key, event);
    }
  }
  
  return Array.from(uniqueEvents.values());
}

/**
 * Remove eventos antigos (mais de N dias)
 */
export async function cleanupOldMarketEvents(daysToKeep: number = 7): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  const cutoffTimestamp = Math.floor(Date.now() / 1000) - (daysToKeep * 24 * 3600);
  
  await db
    .delete(marketEvents)
    .where(lt(marketEvents.timestamp, cutoffTimestamp));
}

/**
 * Remove todos os eventos de mercado
 * Usado para limpar dados mock ou resetar o banco
 */
export async function clearAllMarketEvents(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  // Contar eventos antes de deletar
  const countResult = await db
    .select()
    .from(marketEvents);
  
  const totalEvents = countResult.length;
  
  // Deletar todos os eventos
  await db.delete(marketEvents);
  
  return totalEvents;
}

// ============= MARKET DETECTOR CONFIG QUERIES =============

/**
 * Obtém a configuração do Market Detector para um usuário
 */
export async function getMarketDetectorConfig(userId: number): Promise<MarketDetectorConfig | null> {
  const db = await getDb();
  if (!db) return null;

  const results = await db
    .select()
    .from(marketDetectorConfig)
    .where(eq(marketDetectorConfig.userId, userId))
    .limit(1);

  return results[0] || null;
}

/**
 * Cria ou atualiza a configuração do Market Detector
 */
export async function upsertMarketDetectorConfig(config: InsertMarketDetectorConfig): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .insert(marketDetectorConfig)
    .values(config)
    .onDuplicateKeyUpdate({
      set: {
        enabled: config.enabled,
        atrWindow: config.atrWindow,
        atrMultiplier: config.atrMultiplier,
        atrScore: config.atrScore,
        wickMultiplier: config.wickMultiplier,
        wickScore: config.wickScore,
        fractalThreshold: config.fractalThreshold,
        fractalScore: config.fractalScore,
        spreadMultiplier: config.spreadMultiplier,
        spreadScore: config.spreadScore,
        weightHigh: config.weightHigh,
        weightMedium: config.weightMedium,
        weightHighPast: config.weightHighPast,
        windowNextNews: config.windowNextNews,
        windowPastNews: config.windowPastNews,
        greenThreshold: config.greenThreshold,
        yellowThreshold: config.yellowThreshold,
        updatedAt: new Date(),
      },
    });
}

/**
 * Restaura as configurações padrão do Market Detector para um usuário
 */
export async function resetMarketDetectorConfig(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const defaultConfig: InsertMarketDetectorConfig = {
    userId,
    enabled: true,
    atrWindow: 14,
    atrMultiplier: "2.50",
    atrScore: 2,
    wickMultiplier: "2.00",
    wickScore: 1,
    fractalThreshold: "1.80",
    fractalScore: 1,
    spreadMultiplier: "2.00",
    spreadScore: 1,
    weightHigh: 3,
    weightMedium: 1,
    weightHighPast: 2,
    windowNextNews: 60,
    windowPastNews: 30,
    greenThreshold: 3,
    yellowThreshold: 6,
  };

  await upsertMarketDetectorConfig(defaultConfig);
}


// ============= IC MARKETS / FOREX QUERIES =============

import {
  icmarketsConfig,
  ICMarketsConfig,
  InsertICMarketsConfig,
  forexPositions,
  ForexPosition,
  InsertForexPosition,
} from "../drizzle/icmarkets-config";

/**
 * Obtém configuração IC Markets de um usuário
 */
export async function getICMarketsConfig(userId: number, botId: number = 1): Promise<ICMarketsConfig | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db
    .select()
    .from(icmarketsConfig)
    .where(and(eq(icmarketsConfig.userId, userId), eq(icmarketsConfig.botId, botId)))
    .limit(1);
  
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Cria ou atualiza configuração IC Markets
 */
export async function upsertICMarketsConfig(data: InsertICMarketsConfig): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const botId = data.botId ?? 1;
  const existing = await getICMarketsConfig(data.userId, botId);
  
  if (existing) {
    await db
      .update(icmarketsConfig)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(icmarketsConfig.userId, data.userId), eq(icmarketsConfig.botId, botId)));
  } else {
    await db.insert(icmarketsConfig).values({ ...data, botId });
  }
}

/**
 * Insere uma nova posição Forex
 */
export async function insertForexPosition(data: InsertForexPosition): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(forexPositions).values(data);
  return Number(result[0].insertId);
}

/**
 * Atualiza uma posição Forex
 */
export async function updateForexPosition(positionId: string, data: Partial<InsertForexPosition>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(forexPositions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(forexPositions.positionId, positionId));
}

/**
 * Obtém posição Forex por ID
 */
export async function getForexPositionById(positionId: string): Promise<ForexPosition | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db
    .select()
    .from(forexPositions)
    .where(eq(forexPositions.positionId, positionId))
    .limit(1);
  
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Obtém posições Forex abertas de um usuário
 */
export async function getOpenForexPositions(userId: number, botId: number = 1): Promise<ForexPosition[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select()
    .from(forexPositions)
    .where(
      and(
        eq(forexPositions.userId, userId),
        eq(forexPositions.botId, botId),
        eq(forexPositions.status, "OPEN")
      )
    )
    .orderBy(desc(forexPositions.openTime));
}

/**
 * Obtém histórico de posições Forex de um usuário
 */
export async function getForexPositionHistory(
  userId: number,
  limit: number = 50,
  offset: number = 0,
  botId: number = 1
): Promise<ForexPosition[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select()
    .from(forexPositions)
    .where(and(eq(forexPositions.userId, userId), eq(forexPositions.botId, botId)))
    .orderBy(desc(forexPositions.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Obtém estatísticas de posições Forex do dia
 */
export async function getForexDailyStats(userId: number, botId: number = 1): Promise<{
  totalTrades: number;
  wins: number;
  losses: number;
  pnlUsd: number;
}> {
  const db = await getDb();
  if (!db) return { totalTrades: 0, wins: 0, losses: 0, pnlUsd: 0 };
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const positions = await db
    .select()
    .from(forexPositions)
    .where(
      and(
        eq(forexPositions.userId, userId),
        eq(forexPositions.botId, botId),
        eq(forexPositions.status, "CLOSED"),
        gte(forexPositions.closeTime, today)
      )
    );
  
  let wins = 0;
  let losses = 0;
  let pnlUsd = 0;
  
  for (const pos of positions) {
    const pnl = Number(pos.pnlUsd || 0);
    pnlUsd += pnl;
    if (pnl > 0) wins++;
    else if (pnl < 0) losses++;
  }
  
  return {
    totalTrades: positions.length,
    wins,
    losses,
    pnlUsd,
  };
}
