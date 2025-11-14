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
import { getLatestMarketCondition, getMarketConditionHistory, getMarketConditionsByDate, getUpcomingMarketEvents, getRecentMarketEvents, getMarketEventsByDate, getMarketDetectorConfig, upsertMarketDetectorConfig, resetMarketDetectorConfig } from "./db";
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
    get: protectedProcedure
      .input(z.object({ botId: z.number().int().min(1).max(2).optional() }).optional())
      .query(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      const config = await getConfigByUserId(ctx.user.id, botId);
      
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
          timeframe: 900, // timeframe padrão M15 (900 segundos)
          repredictionEnabled: true, // re-predição M30/M60 habilitada por padrão
          repredictionDelay: 300, // delay padrão de 5 minutos (300 segundos)
          contractType: "RISE_FALL" as const, // tipo de contrato padrão
          barrierHigh: "3.00", // barreira superior padrão (pontos)
          barrierLow: "-3.00", // barreira inferior padrão (pontos)
          hedgeEnabled: true, // IA Hedge ativada por padrão
          hedgeConfig: null,
        };
      }
      
      return config;
    }),

    update: protectedProcedure
      .input(
        z.object({
          botId: z.number().int().min(1).max(2).optional(),
          mode: z.enum(["DEMO", "REAL"]),
          tokenDemo: z.string().optional(),
          tokenReal: z.string().optional(),
          derivAppId: z.string().optional(), // App ID personalizado da DERIV
          symbol: z.string(),
          stake: z.number().int().positive(),
          stopDaily: z.number().int().positive(),
          takeDaily: z.number().int().positive(),
          lookback: z.number().int().positive(),
          triggerOffset: z.number().int().nonnegative(), // Aceita 0 (desativado) ou valores positivos
          profitThreshold: z.number().int().min(1).max(100),
          waitTime: z.number().int().min(1), // Tempo de espera em minutos (mínimo 1 minuto)
          timeframe: z.number().int().refine(val => val === 900 || val === 1800 || val === 3600, {
            message: "Timeframe deve ser 900 (M15), 1800 (M30) ou 3600 (M60)"
          }),
          repredictionEnabled: z.boolean().optional(),
          repredictionDelay: z.number().int().min(60).optional(), // Mínimo 60s (1 min), sem limite máximo
          contractType: z.enum(["RISE_FALL", "TOUCH", "NO_TOUCH"]),
          barrierHigh: z.string().regex(/^-?\d+\.?\d*$/).optional(), // aceita números com sinal
          barrierLow: z.string().regex(/^-?\d+\.?\d*$/).optional(), // aceita números com sinal
          forexMinDurationMinutes: z.number().int().min(1).optional(), // Duração mínima para Forex em minutos
          allowEquals: z.boolean().optional(), // Permitir empate como vitória
          useCandleDuration: z.boolean().optional(), // Usar duração dinâmica até o final do candle
          hedgeEnabled: z.boolean().optional(),
          hedgeConfig: z.string().optional(),
          // Filtro de Horário
          hourlyFilterEnabled: z.boolean().optional(),
          hourlyFilterMode: z.enum(["IDEAL", "COMPATIBLE", "GOLDEN", "COMBINED", "CUSTOM"]).optional(),
          hourlyFilterCustomHours: z.string().optional(),
          hourlyFilterGoldHours: z.string().optional(),
          hourlyFilterGoldMultiplier: z.number().int().min(100).optional(),
          // Market Condition Detector
          marketConditionEnabled: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const botId = input.botId ?? 1;
        await upsertConfig({
          userId: ctx.user.id,
          botId,
          ...input,
        });
        
        // Logar alterações de hedge se houver
        if (input.hedgeEnabled !== undefined) {
          const bot = getBotForUser(ctx.user.id, botId);
          if (bot) {
            await bot.logEvent(
              "CONFIG_UPDATED",
              `⚡ IA HEDGE ${input.hedgeEnabled ? 'ATIVADA' : 'DESATIVADA'} pelo usuário`
            );
          }
        }
        
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
        const derivAppId = config.derivAppId || "1089";
        const derivService = new DerivService(token, config.mode === "DEMO", derivAppId);
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

    getActiveSymbols: protectedProcedure
      .input(z.object({ market: z.string().optional() }))
      .query(async ({ ctx, input }) => {
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
          
          const symbols = await derivService.getActiveSymbols(input.market);
          derivService.disconnect();
          
          return {
            success: true,
            symbols: symbols.map((s: any) => ({
              symbol: s.symbol,
              display_name: s.display_name,
              market: s.market,
              submarket: s.submarket,
              pip: s.pip || 0.01,
            })),
          };
        } catch (error: any) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Erro ao buscar s\u00edmbolos: ${error.message}`,
          });
        }
      }),
  }),

  // Controle do bot
  bot: router({
    status: protectedProcedure
      .input(z.object({ botId: z.number().int().min(1).max(2).optional() }).optional())
      .query(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      const state = await getBotState(ctx.user.id, botId);
      const bot = getBotForUser(ctx.user.id, botId);
      const candleStartTime = bot.getCandleStartTime();
      const config = await getConfigByUserId(ctx.user.id, botId);
      
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
          timeframe: config?.timeframe || 900,
        };
      }
      
      // Obter condição de mercado atual
      const marketCondition = bot.getMarketCondition();
      
      return {
        ...state,
        candleStartTime: candleStartTime || null,
        timeframe: config?.timeframe || 900, // Retornar timeframe da configuração
        marketCondition: marketCondition ? {
          status: marketCondition.status,
          score: marketCondition.score,
          reasons: marketCondition.reasons,
          computedAt: marketCondition.computedAt,
        } : null,
      };
    }),

    start: protectedProcedure
      .input(z.object({ botId: z.number().int().min(1).max(2).optional() }).optional())
      .mutation(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      // Garantir que engine está rodando
      if (!engineManager.isEngineRunning()) {
        console.log("[Bot] Iniciando engine de predição...");
        await engineManager.start();
      }
      
      const bot = getBotForUser(ctx.user.id, botId);
      await bot.start();
      return { success: true, message: "Bot iniciado" };
    }),

    stop: protectedProcedure
      .input(z.object({ botId: z.number().int().min(1).max(2).optional() }).optional())
      .mutation(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      const bot = getBotForUser(ctx.user.id, botId);
      await bot.stop();
      removeBotForUser(ctx.user.id, botId);
      return { success: true, message: "Bot parado" };
    }),

    reset: protectedProcedure
      .input(z.object({ botId: z.number().int().min(1).max(2).optional() }).optional())
      .mutation(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      // Parar bot se estiver rodando
      try {
        const bot = getBotForUser(ctx.user.id, botId);
        await bot.stop();
        removeBotForUser(ctx.user.id, botId);
      } catch (error) {
        // Ignorar erro se bot não estiver rodando
      }
      
      // Resetar estado no banco
      await upsertBotState({
        userId: ctx.user.id,
        botId,
        state: "IDLE",
        isRunning: false,
        currentCandleTimestamp: null,
        currentPositionId: null,
        lastError: null,
      });
      
      return { success: true, message: "Estado do bot resetado" };
    }),

    reloadConfig: protectedProcedure
      .input(z.object({ botId: z.number().int().min(1).max(2).optional() }).optional())
      .mutation(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      const bot = getBotForUser(ctx.user.id, botId);
      await bot.reloadConfig();
      return { success: true, message: "Configurações recarregadas" };
    }),
  }),

  // Dashboard e métricas
  dashboard: router({
    metrics: protectedProcedure
      .input(z.object({ botId: z.number().int().min(1).max(2).optional() }).optional())
      .query(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      const today = new Date().toISOString().split("T")[0];
      const thisMonth = today.substring(0, 7); // YYYY-MM

      const dailyMetric = await getMetric(ctx.user.id, today, "daily", botId);
      const monthlyMetric = await getMetric(ctx.user.id, thisMonth, "monthly", botId);

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

    balance: protectedProcedure
      .input(z.object({ botId: z.number().int().min(1).max(2).optional() }).optional())
      .query(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      // Buscar configuração do usuário para obter token
      const config = await getConfigByUserId(ctx.user.id, botId);
      
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
      .input(z.object({ symbol: z.string(), limit: z.number().optional().default(50), botId: z.number().int().min(1).max(2).optional() }))
      .query(async ({ ctx, input }) => {
        const botId = input.botId ?? 1;
        const config = await getConfigByUserId(ctx.user.id, botId);
        
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
            config.timeframe, // Usar timeframe da configuração (900, 1800 ou 3600)
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

    resetDailyData: protectedProcedure
      .input(z.object({ botId: z.number().int().min(1).max(2).optional() }).optional())
      .mutation(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      // Verificar se há posição aberta
      const botState = await getBotState(ctx.user.id, botId);
      
      if (botState && botState.state === "ENTERED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Não é possível resetar dados com posição aberta. Aguarde o fechamento da posição atual.",
        });
      }

      try {
        await resetDailyData(ctx.user.id, botId);
        
        // Apenas resetar PnL diário do bot em memória (sem reiniciar)
        const bot = getBotForUser(ctx.user.id, botId);
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
          botId: z.number().int().min(1).max(2).optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const botId = input.botId ?? 1;
        const positions = await getUserPositions(ctx.user.id, botId, input.limit);
        return positions;
      }),

    today: protectedProcedure
      .input(z.object({ botId: z.number().int().min(1).max(2).optional() }).optional())
      .query(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      const positions = await getTodayPositions(ctx.user.id, botId);
      return positions;
    }),
  }),

  // Logs de eventos
  logs: router({
    recent: protectedProcedure
      .input(
        z.object({
          limit: z.number().int().positive().optional().default(100),
          botId: z.number().int().min(1).max(2).optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const botId = input.botId ?? 1;
        const logs = await getRecentEventLogs(ctx.user.id, botId, input.limit);
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
  
  // Market Condition Detector
  marketCondition: router({
    // Obtém a última condição de mercado
    current: protectedProcedure
      .input(
        z.object({
          botId: z.number().int().min(1).max(2).optional(),
          symbol: z.string().optional(),
        }).optional()
      )
      .query(async ({ ctx, input }) => {
        const botId = input?.botId ?? 1;
        const config = await getConfigByUserId(ctx.user.id, botId);
        const symbol = input?.symbol ?? config?.symbol ?? "R_100";
        
        const condition = await getLatestMarketCondition(ctx.user.id, botId, symbol);
        
        if (!condition) {
          return null;
        }
        
        return {
          status: condition.status,
          score: condition.score,
          reasons: JSON.parse(condition.reasons),
          computedAt: condition.computedAt,
          candleTimestamp: condition.candleTimestamp,
          symbol: condition.symbol,
          details: condition.details ? JSON.parse(condition.details) : null,
        };
      }),
    
    // Obtém o histórico de condições de mercado
    history: protectedProcedure
      .input(
        z.object({
          botId: z.number().int().min(1).max(2).optional(),
          symbol: z.string().optional(),
          limit: z.number().int().positive().optional().default(24),
        }).optional()
      )
      .query(async ({ ctx, input }) => {
        const botId = input?.botId ?? 1;
        const config = await getConfigByUserId(ctx.user.id, botId);
        const symbol = input?.symbol ?? config?.symbol ?? "R_100";
        const limit = input?.limit ?? 24;
        
        const conditions = await getMarketConditionHistory(ctx.user.id, botId, symbol, limit);
        
        return conditions.map(c => ({
          status: c.status,
          score: c.score,
          reasons: JSON.parse(c.reasons),
          computedAt: c.computedAt,
          candleTimestamp: c.candleTimestamp,
          symbol: c.symbol,
          details: c.details ? JSON.parse(c.details) : null,
        }));
      }),
    
    // Obtém condições de mercado para uma data específica
    byDate: protectedProcedure
      .input(
        z.object({
          botId: z.number().int().min(1).max(2).optional(),
          symbol: z.string().optional(),
          date: z.string(), // ISO date string
        })
      )
      .query(async ({ ctx, input }) => {
        const botId = input.botId ?? 1;
        const config = await getConfigByUserId(ctx.user.id, botId);
        const symbol = input.symbol ?? config?.symbol ?? "R_100";
        const date = new Date(input.date);
        
        const conditions = await getMarketConditionsByDate(ctx.user.id, botId, symbol, date);
        
        return conditions.map(c => ({
          status: c.status,
          score: c.score,
          reasons: JSON.parse(c.reasons),
          computedAt: c.computedAt,
          candleTimestamp: c.candleTimestamp,
          symbol: c.symbol,
          details: c.details ? JSON.parse(c.details) : null,
        }));
      }),
  }),
  
  // Market Events (Notícias Macroeconômicas)
  // Market Detector Config
  marketDetector: router({
    // Obtém a configuração do Market Detector
    getConfig: protectedProcedure
      .query(async ({ ctx }) => {
        const config = await getMarketDetectorConfig(ctx.user.id);
        
        // Retornar configuração padrão se não existir
        if (!config) {
          return {
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
        }
        
        return config;
      }),
    
    // Atualiza a configuração do Market Detector
    updateConfig: protectedProcedure
      .input(
        z.object({
          enabled: z.boolean(),
          atrWindow: z.number().int().min(1).max(50),
          atrMultiplier: z.string().regex(/^\d+\.?\d*$/),
          atrScore: z.number().int().min(0).max(10),
          wickMultiplier: z.string().regex(/^\d+\.?\d*$/),
          wickScore: z.number().int().min(0).max(10),
          fractalThreshold: z.string().regex(/^\d+\.?\d*$/),
          fractalScore: z.number().int().min(0).max(10),
          spreadMultiplier: z.string().regex(/^\d+\.?\d*$/),
          spreadScore: z.number().int().min(0).max(10),
          weightHigh: z.number().int().min(0).max(10),
          weightMedium: z.number().int().min(0).max(10),
          weightHighPast: z.number().int().min(0).max(10),
          windowNextNews: z.number().int().min(1).max(180),
          windowPastNews: z.number().int().min(1).max(180),
          greenThreshold: z.number().int().min(0).max(10),
          yellowThreshold: z.number().int().min(0).max(10),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await upsertMarketDetectorConfig({
          userId: ctx.user.id,
          ...input,
        });
        
        return { success: true };
      }),
    
    // Restaura as configurações padrão
    resetConfig: protectedProcedure
      .mutation(async ({ ctx }) => {
        await resetMarketDetectorConfig(ctx.user.id);
        return { success: true };
      }),
    
    // Endpoint de teste simples
    testEndpoint: protectedProcedure
      .mutation(async () => {
        console.log("[MarketDetector] 🔴🔴🔴 TESTE ENDPOINT CHAMADO! 🔴🔴🔴");
        return { success: true, message: "Endpoint de teste funcionando!" };
      }),
    
    // Força coleta manual de notícias (não-bloqueante)
    collectNews: protectedProcedure
      .mutation(async () => {
        console.log("[MarketDetector] 🔴 ENDPOINT collectNews CHAMADO!");
        try {
          console.log("[MarketDetector] Importando newsCollectorService...");
          const { newsCollectorService } = await import("./market-condition-v2/newsCollectorService");
          
          console.log("[MarketDetector] Iniciando coleta em background...");
          // Executar em background para não bloquear a resposta
          newsCollectorService.collectNews().catch(error => {
            console.error("[MarketDetector] ❌ Erro na coleta em background:", error);
          });
          
          console.log("[MarketDetector] ✅ Coleta iniciada com sucesso!");
          return { 
            success: true, 
            message: "Coleta de notícias iniciada em background. Aguarde alguns segundos e recarregue a página." 
          };
        } catch (error) {
          console.error("[MarketDetector] ❌ Erro ao iniciar coleta:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Erro ao iniciar coleta de notícias",
          });
        }
      }),
    
    // Obtém status do scheduler
    schedulerStatus: protectedProcedure
      .query(async () => {
        try {
          const { newsScheduler } = await import("./market-condition-v2/newsScheduler");
          const nextExecution = newsScheduler.getNextExecutionTime();
          
          return {
            isActive: newsScheduler.isActive(),
            nextExecution: nextExecution ? nextExecution.toISOString() : null,
            scheduledHours: [9, 15, 21],
          };
        } catch (error) {
          console.error("[MarketDetector] Erro ao obter status do scheduler:", error);
          return {
            isActive: false,
            nextExecution: null,
            scheduledHours: [9, 15, 21],
          };
        }
      }),
    
    // Limpa todos os eventos de mercado
    clearMarketEvents: protectedProcedure
      .mutation(async () => {
        try {
          const { clearAllMarketEvents } = await import("./db");
          const deletedCount = await clearAllMarketEvents();
          return { 
            success: true, 
            message: `${deletedCount} eventos removidos com sucesso`,
            deletedCount 
          };
        } catch (error) {
          console.error("[MarketDetector] Erro ao limpar eventos:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Erro ao limpar eventos de mercado",
          });
        }
      }),
  }),

  marketEvents: router({
    // Obtém eventos futuros (próximas N horas)
    upcoming: protectedProcedure
      .input(
        z.object({
          currencies: z.array(z.string()).optional(),
          hoursAhead: z.number().int().positive().optional().default(24),
        }).optional()
      )
      .query(async ({ input }) => {
        const currencies = input?.currencies ?? ["USD", "JPY"];
        const hoursAhead = input?.hoursAhead ?? 24;
        
        const events = await getUpcomingMarketEvents(currencies, hoursAhead);
        
        return events;
      }),
    
    // Obtém eventos recentes (últimas N horas)
    recent: protectedProcedure
      .input(
        z.object({
          currencies: z.array(z.string()).optional(),
          hoursBack: z.number().int().positive().optional().default(12),
        }).optional()
      )
      .query(async ({ input }) => {
        const currencies = input?.currencies ?? ["USD", "JPY"];
        const hoursBack = input?.hoursBack ?? 12;
        
        const events = await getRecentMarketEvents(currencies, hoursBack);
        
        return events;
      }),
    
    // Obtém eventos para uma data específica
    byDate: protectedProcedure
      .input(
        z.object({
          currencies: z.array(z.string()).optional(),
          date: z.string(), // ISO date string
        })
      )
      .query(async ({ input }) => {
        const currencies = input.currencies ?? ["USD", "JPY"];
        const date = new Date(input.date);
        
        const events = await getMarketEventsByDate(currencies, date);
        
        return events;
      }),
  }),
});

export type AppRouter = typeof appRouter;

