import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
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
import { DerivService } from "./deriv/derivService";
import { predictionService } from "./prediction/predictionService";
import { engineManager } from "./prediction/engineManager";

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
      
      // Retornar configuração padrão se não existir
      if (!config) {
        return {
          mode: "DEMO" as const,
          tokenDemo: null,
          tokenReal: null,
          symbol: "R_100",
          stake: 100, // $1.00 em centavos
          stopDaily: 1000, // $10.00 em centavos
          takeDaily: 2000, // $20.00 em centavos
          lookback: 50,
        };
      }
      
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
      // Retornar estado padrão se não existir
      if (!state) {
        return {
          id: 0,
          userId: ctx.user.id,
          state: "IDLE" as const,
          isRunning: false,
          currentCandleTimestamp: null,
          currentPositionId: null,
          lastError: null,
          updatedAt: new Date(),
        };
      }
      return state;
    }),

    start: protectedProcedure.mutation(async ({ ctx }) => {
      // Garantir que engine está rodando
      if (!engineManager.isEngineRunning()) {
        console.log("[Bot] Iniciando engine de predição...");
        await engineManager.start();
      }
      
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
      // Buscar configuração do usuário para obter token
      const config = await getConfigByUserId(ctx.user.id);
      
      if (!config) {
        return {
          balance: 0,
          currency: "USD",
        };
      }

      // Usar token correto baseado no modo
      const token = config.mode === "DEMO" ? config.tokenDemo : config.tokenReal;
      
      if (!token) {
        return {
          balance: 0,
          currency: "USD",
        };
      }

      try {
        // Buscar saldo real da DERIV
        const derivService = new DerivService(token, config.mode === "DEMO");
        await derivService.connect();
        const balanceValue = await derivService.getBalance();
        derivService.disconnect();
        
        return {
          balance: Math.round(balanceValue * 100), // converter para centavos
          currency: "USD",
        };
      } catch (error) {
        console.error("[Dashboard] Erro ao buscar saldo:", error);
        return {
          balance: 0,
          currency: "USD",
        };
      }
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

