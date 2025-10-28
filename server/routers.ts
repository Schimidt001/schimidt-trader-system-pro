import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getConfigByUserId,
  upsertConfig,
  getBotState,
  upsertBotState,
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

    testConnection: protectedProcedure.mutation(async ({ ctx }) => {
      const config = await getConfigByUserId(ctx.user.id);
      
      if (!config) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Configura\u00e7\u00e3o n\u00e3o encontrada. Configure o token primeiro.",
        });
      }

      const token = config.mode === "DEMO" ? config.tokenDemo : config.tokenReal;
      
      if (!token) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Token ${config.mode} n\u00e3o configurado.`,
        });
      }

      try {
        const derivService = new DerivService(token, config.mode === "DEMO");
        await derivService.connect();
        
        // Buscar informa\u00e7\u00f5es da conta
        const balance = await derivService.getBalance();
        derivService.disconnect();
        
        return {
          success: true,
          balance: Math.round(balance * 100), // em centavos
          currency: "USD",
          mode: config.mode,
        };
      } catch (error: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao conectar: ${error.message}`,
        });
      }
    }),
  }),

  // Controle do bot
  bot: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      const state = await getBotState(ctx.user.id);
      const bot = getBotForUser(ctx.user.id);
      const candleStartTime = bot.getCandleStartTime();
      
      // Retornar estado padrão se não existir
      if (!state) {
        return {
          id: 0,
          userId: ctx.user.id,
          state: "IDLE" as const,
          isRunning: false,
          currentCandleTimestamp: null,
          candleStartTime: null,
          currentPositionId: null,
          lastError: null,
          updatedAt: new Date(),
        };
      }
      
      return {
        ...state,
        candleStartTime: candleStartTime || null,
      };
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

    reset: protectedProcedure.mutation(async ({ ctx }) => {
      // Parar bot se estiver rodando
      try {
        const bot = getBotForUser(ctx.user.id);
        await bot.stop();
        removeBotForUser(ctx.user.id);
      } catch (error) {
        // Ignorar erro se bot não estiver rodando
      }
      
      // Resetar estado no banco
      await upsertBotState({
        userId: ctx.user.id,
        state: "IDLE",
        isRunning: false,
        currentCandleTimestamp: null,
        currentPositionId: null,
        lastError: null,
      });
      
      return { success: true, message: "Estado do bot resetado" };
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

    // Buscar candles em tempo real da DERIV API
    liveCandles: protectedProcedure
      .input(z.object({ symbol: z.string(), limit: z.number().optional().default(50) }))
      .query(async ({ ctx, input }) => {
        const config = await getConfigByUserId(ctx.user.id);
        
        if (!config) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Configuração não encontrada. Configure o token DERIV primeiro.",
          });
        }

        const token = config.mode === "DEMO" ? config.tokenDemo : config.tokenReal;
        
        if (!token) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Token ${config.mode} não configurado.`,
          });
        }

        try {
          const derivService = new DerivService(token, config.mode === "DEMO");
          await derivService.connect();
          
          const derivCandles = await derivService.getCandleHistory(
            input.symbol,
            900, // M15 = 900 segundos
            input.limit
          );
          
          derivService.disconnect();
          
          // Converter formato DERIV para formato do frontend
          return derivCandles.map(c => ({
            timestampUtc: c.epoch,
            open: c.open.toString(),
            high: c.high.toString(),
            low: c.low.toString(),
            close: c.close.toString(),
          }));
        } catch (error: any) {
          console.error("[Dashboard] Erro ao buscar candles da DERIV:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Erro ao buscar candles: ${error.message}`,
          });
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

