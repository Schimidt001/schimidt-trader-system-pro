/**
 * Endpoint temporário para exportar dados de trades DEMO vs REAL
 * Para análise da discrepância de resultados
 */

import { Router } from 'express';
import { db } from './db';
import { positions, eventLogs } from '../drizzle/schema';
import { and, gte, lte, desc } from 'drizzle-orm';

export const exportRouter = Router();

// Endpoint para exportar trades DEMO
exportRouter.get('/export/demo-trades', async (req, res) => {
  try {
    // Período DEMO: 01/11/2025 04:14 - 13:00 GMT
    const demoStart = Math.floor(new Date('2025-11-01T04:14:00Z').getTime() / 1000);
    const demoEnd = Math.floor(new Date('2025-11-01T13:00:00Z').getTime() / 1000);

    const trades = await db
      .select()
      .from(positions)
      .where(
        and(
          gte(positions.candleTimestamp, demoStart),
          lte(positions.candleTimestamp, demoEnd)
        )
      )
      .orderBy(desc(positions.candleTimestamp));

    res.json({
      period: 'DEMO',
      start: new Date(demoStart * 1000).toISOString(),
      end: new Date(demoEnd * 1000).toISOString(),
      count: trades.length,
      trades
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Endpoint para exportar trades REAL
exportRouter.get('/export/real-trades', async (req, res) => {
  try {
    // Período REAL: 31/10/2025 20:00 - 01/11/2025 11:15 GMT
    const realStart = Math.floor(new Date('2025-10-31T20:00:00Z').getTime() / 1000);
    const realEnd = Math.floor(new Date('2025-11-01T11:15:00Z').getTime() / 1000);

    const trades = await db
      .select()
      .from(positions)
      .where(
        and(
          gte(positions.candleTimestamp, realStart),
          lte(positions.candleTimestamp, realEnd)
        )
      )
      .orderBy(desc(positions.candleTimestamp));

    res.json({
      period: 'REAL',
      start: new Date(realStart * 1000).toISOString(),
      end: new Date(realEnd * 1000).toISOString(),
      count: trades.length,
      trades
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Endpoint para exportar logs DEMO
exportRouter.get('/export/demo-logs', async (req, res) => {
  try {
    const demoStart = Math.floor(new Date('2025-11-01T04:14:00Z').getTime() / 1000);
    const demoEnd = Math.floor(new Date('2025-11-01T13:00:00Z').getTime() / 1000);

    const logs = await db
      .select()
      .from(eventLogs)
      .where(
        and(
          gte(eventLogs.timestampUtc, demoStart),
          lte(eventLogs.timestampUtc, demoEnd)
        )
      )
      .orderBy(desc(eventLogs.timestampUtc));

    res.json({
      period: 'DEMO',
      start: new Date(demoStart * 1000).toISOString(),
      end: new Date(demoEnd * 1000).toISOString(),
      count: logs.length,
      logs
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Endpoint para exportar logs REAL
exportRouter.get('/export/real-logs', async (req, res) => {
  try {
    const realStart = Math.floor(new Date('2025-10-31T20:00:00Z').getTime() / 1000);
    const realEnd = Math.floor(new Date('2025-11-01T11:15:00Z').getTime() / 1000);

    const logs = await db
      .select()
      .from(eventLogs)
      .where(
        and(
          gte(eventLogs.timestampUtc, realStart),
          lte(eventLogs.timestampUtc, realEnd)
        )
      )
      .orderBy(desc(eventLogs.timestampUtc));

    res.json({
      period: 'REAL',
      start: new Date(realStart * 1000).toISOString(),
      end: new Date(realEnd * 1000).toISOString(),
      count: logs.length,
      logs
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});
