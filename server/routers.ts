import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import "./_core/engineInit"; // Inicializar engine de predição
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  getConfigByUserId,
  upsertConfig,
  getBotState,
  getRecentEventLogs,
  getUserPositions,
  getTodayPositions,
  getMetric,
  getCandleHistory,
} from "./db";
import { getBotForUser, removeBotForUser } from "./deriv/tradingBot";
import { predictionService } from "./prediction/predictionService";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Configurações do bot
  config: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const config = await getConfigByUserId(ctx.user.id);
      return config;
    }),

    update: protectedProcedure
      .input(
        z.object({
          mode: z.enum(["DEMO", "REAL"]),
          tokenDemo: z.string().optional(),
          tokenReal: z.string().optional(),
          symbol: z.string(),
          stake: z.number().int().positive(),
          stopDaily: z.number().int().positive(),
          takeDaily: z.number().int().positive(),
          lookback: z.number().int().positive(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await upsertConfig({
          userId: ctx.user.id,
          ...input,
        });
        return { success: true };
      }),
  }),

  // Controle do bot
  bot: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      const state = await getBotState(ctx.user.id);
      return state;
    }),

    start: protectedProcedure.mutation(async ({ ctx }) => {
      const bot = getBotForUser(ctx.user.id);
      await bot.start();
      return { success: true, message: "Bot iniciado" };
    }),

    stop: protectedProcedure.mutation(async ({ ctx }) => {
      const bot = getBotForUser(ctx.user.id);
      await bot.stop();
      removeBotForUser(ctx.user.id);
      return { success: true, message: "Bot parado" };
    }),
  }),

  // Dashboard e métricas
  dashboard: router({
    metrics: protectedProcedure.query(async ({ ctx }) => {
      const today = new Date().toISOString().split("T")[0];
      const thisMonth = today.substring(0, 7); // YYYY-MM

      const dailyMetric = await getMetric(ctx.user.id, today, "daily");
      const monthlyMetric = await getMetric(ctx.user.id, thisMonth, "monthly");

      return {
        daily: dailyMetric || {
          totalTrades: 0,
          wins: 0,
          losses: 0,
          pnl: 0,
        },
        monthly: monthlyMetric || {
          totalTrades: 0,
          wins: 0,
          losses: 0,
          pnl: 0,
        },
      };
    }),

    balance: protectedProcedure.query(async ({ ctx }) => {
      // TODO: Implementar busca de saldo real da DERIV
      // Por enquanto retorna mock
      return {
        balance: 10000, // em centavos
        currency: "USD",
      };
    }),
  }),

  // Posições
  positions: router({
    list: protectedProcedure
      .input(
        z.object({
          limit: z.number().int().positive().optional().default(50),
        })
      )
      .query(async ({ ctx, input }) => {
        const positions = await getUserPositions(ctx.user.id, input.limit);
        return positions;
      }),

    today: protectedProcedure.query(async ({ ctx }) => {
      const positions = await getTodayPositions(ctx.user.id);
      return positions;
    }),
  }),

  // Logs de eventos
  logs: router({
    recent: protectedProcedure
      .input(
        z.object({
          limit: z.number().int().positive().optional().default(100),
        })
      )
      .query(async ({ ctx, input }) => {
        const logs = await getRecentEventLogs(ctx.user.id, input.limit);
        return logs;
      }),
  }),

  // Candles (para gráfico)
  candles: router({
    history: protectedProcedure
      .input(
        z.object({
          symbol: z.string(),
          limit: z.number().int().positive().optional().default(100),
        })
      )
      .query(async ({ ctx, input }) => {
        const candles = await getCandleHistory(input.symbol, input.limit);
        return candles.reverse(); // Ordem cronológica
      }),
  }),

  // Health check da engine de predição
  prediction: router({
    health: protectedProcedure.query(async () => {
      const isHealthy = await predictionService.healthCheck();
      return { healthy: isHealthy };
    }),
  }),
});

export type AppRouter = typeof appRouter;

