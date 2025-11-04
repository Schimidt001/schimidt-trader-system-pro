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
  updateTimeFilterConfig,
  invalidatePhaseStrategyCache,
  insertEventLog,
} from "./db";
import { TimeFilterService } from "./timeFilter/TimeFilterService";
import { resetDailyData } from "./db_reset";
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
      

      // Valores padrão para campos do Filtro de Horário
      const defaultTimeFilterConfig = {
        timeFilterEnabled: false,
        allowedHours: null,
        goldHours: null,
        goldStake: 1000, // $10.00 em centavos
        timezone: "America/Sao_Paulo",
        phaseStrategyCache: null,
      };
      
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
          triggerOffset: 16, // offset padrão do gatilho
          profitThreshold: 90, // threshold padrão de lucro
          waitTime: 8, // tempo de espera padrão em minutos
          ...defaultTimeFilterConfig,
        };
      }
      
      // Garantir que configs antigas tenham os campos da IA e Filtro de Horário
      return {
        ...config,
        timeFilterEnabled: config.timeFilterEnabled ?? defaultTimeFilterConfig.timeFilterEnabled,
        allowedHours: config.allowedHours ?? defaultTimeFilterConfig.allowedHours,
        goldHours: config.goldHours ?? defaultTimeFilterConfig.goldHours,
        goldStake: config.goldStake ?? defaultTimeFilterConfig.goldStake,
        timezone: config.timezone ?? defaultTimeFilterConfig.timezone,
        phaseStrategyCache: config.phaseStrategyCache ?? defaultTimeFilterConfig.phaseStrategyCache,
      };
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
          triggerOffset: z.number().int().nonnegative(), // Aceita 0 (desativado) ou valores positivos
          profitThreshold: z.number().int().min(1).max(100),
          waitTime: z.number().int().min(1).max(14), // 1-14 minutos (candle M15)
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
    
    // Novos endpoints do Filtro de Horário
    updateTimeFilter: protectedProcedure
      .input(
        z.object({
          timeFilterEnabled: z.boolean(),
          allowedHours: z.array(z.number().int().min(0).max(23)).optional(),
          goldHours: z.array(z.number().int().min(0).max(23)).optional(),
          goldStake: z.number().int().positive().optional(),
          timezone: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await updateTimeFilterConfig(ctx.user.id, input);
        
        // Logar alteração
        await insertEventLog({
          userId: ctx.user.id,
          eventType: "TIME_FILTER_CONFIG_UPDATED",
          message: `Filtro de horário ${input.timeFilterEnabled ? 'HABILITADO' : 'DESABILITADO'}`,
          timestampUtc: Math.floor(Date.now() / 1000),
        });
        
        return { success: true };
      }),
    
    getTimeFilterStatus: protectedProcedure.query(async ({ ctx }) => {
      const config = await getConfigByUserId(ctx.user.id);
      
      if (!config || !config.timeFilterEnabled) {
        return {
          enabled: false,
          isAllowed: true,
          isGoldHour: false,
          currentHour: new Date().getUTCHours(),
          nextAllowedTime: null,
          nextGoldTime: null,
        };
      }
      
      // Parse allowed hours
      let allowedHours: number[] = [];
      let goldHours: number[] = [];
      
      try {
        if (config.allowedHours) {
          allowedHours = JSON.parse(config.allowedHours);
        }
        if (config.goldHours) {
          goldHours = JSON.parse(config.goldHours);
        }
      } catch (error) {
        console.error("[TimeFilter] Erro ao parsear horários:", error);
      }
      
      // Criar instância do TimeFilterService
      const timeFilter = new TimeFilterService({
        enabled: config.timeFilterEnabled,
        allowedHours,
        goldHours,
        goldStake: config.goldStake ?? 1000,
      });
      
      const status = timeFilter.getStatus();
      
      return {
        enabled: true,
        isAllowed: status.isAllowed,
        isGoldHour: status.isGoldHour,
        currentHour: status.currentHour,
        nextAllowedTime: status.nextAllowedTime ?? null,
        nextGoldTime: status.nextGoldTime ?? null,
      };
    }),
    
    invalidatePhaseCache: protectedProcedure.mutation(async ({ ctx }) => {
      await invalidatePhaseStrategyCache(ctx.user.id);
      
      await insertEventLog({
        userId: ctx.user.id,
        eventType: "PHASE_CACHE_INVALIDATED",
        message: "Cache de fase/estratégia invalidado manualmente",
        timestampUtc: Math.floor(Date.now() / 1000),
      });
      
      return { success: true };
    }),
  }),

  // Controle do bot
  bot: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      const state = await getBotState(ctx.user.id);
      const bot = getBotForUser(ctx.user.id);
      const candleStartTime = bot.getCandleStartTime();
      
      // Debug log
      console.log(`[bot.status] userId: ${ctx.user.id}, state: ${state?.state}, candleStartTime: ${candleStartTime}, isRunning: ${state?.isRunning}`);
      
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

    resetDailyData: protectedProcedure.mutation(async ({ ctx }) => {
      // Verificar se há posição aberta
      const botState = await getBotState(ctx.user.id);
      
      if (botState && botState.state === "ENTERED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Não é possível resetar dados com posição aberta. Aguarde o fechamento da posição atual.",
        });
      }

      try {
        await resetDailyData(ctx.user.id);
        
        // Apenas resetar PnL diário do bot em memória (sem reiniciar)
        const bot = getBotForUser(ctx.user.id);
        if (bot) {
          // Resetar apenas o PnL acumulado, sem parar/iniciar o bot
          // @ts-ignore - acessar propriedade privada para resetar PnL
          if (bot.dailyPnL !== undefined) {
            bot.dailyPnL = 0;
          }
        }
        
        return { 
          success: true,
          message: "Dados di\u00e1rios resetados com sucesso!"
        };
      } catch (error: any) {
        console.error("[Reset] Erro ao resetar dados:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao resetar dados: ${error.message}`,
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

