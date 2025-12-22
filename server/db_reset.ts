import { getDb } from "./db";
import { positions, metrics, eventLogs } from "../drizzle/schema";
import { eq, and, gte } from "drizzle-orm";

/**
 * Reseta dados diários do usuário
 * - Zera métricas diárias
 * - Marca posições de hoje como arquivadas (não deleta)
 * - Limpa logs de hoje (opcional)
 */
export async function resetDailyData(userId: number, botId: number = 1): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  try {
    // 1. Zerar métricas diárias
    await db
      .update(metrics)
      .set({
        totalTrades: 0,
        wins: 0,
        losses: 0,
        pnl: 0,
      })
      .where(
        and(
          eq(metrics.userId, userId),
          eq(metrics.botId, botId),
          eq(metrics.date, today),
          eq(metrics.period, "daily")
        )
      );

    // 1.1 Zerar métricas mensais também
    const thisMonth = today.substring(0, 7); // YYYY-MM
    await db
      .update(metrics)
      .set({
        totalTrades: 0,
        wins: 0,
        losses: 0,
        pnl: 0,
      })
      .where(
        and(
          eq(metrics.userId, userId),
          eq(metrics.botId, botId),
          eq(metrics.date, thisMonth),
          eq(metrics.period, "monthly")
        )
      );

    // 2. Marcar posições de hoje como CANCELLED (arquivadas)
    // NÃO deletar para manter histórico
    await db
      .update(positions)
      .set({
        status: "CANCELLED",
      })
      .where(
        and(
          eq(positions.userId, userId),
          eq(positions.botId, botId),
          gte(positions.createdAt, todayStart)
        )
      );

    // 3. (Opcional) Limpar logs de hoje
    // Comentado por padrão para manter histórico de debug
    /*
    await db
      .delete(eventLogs)
      .where(
        and(
          eq(eventLogs.userId, userId),
          gte(eventLogs.createdAt, todayStart)
        )
      );
    */

    console.log(`[RESET] Dados diários e mensais resetados para usuário ${userId}, bot ${botId}`);
  } catch (error) {
    console.error(`[RESET] Erro ao resetar dados diários:`, error);
    throw error;
  }
}
