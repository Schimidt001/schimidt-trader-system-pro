/**
 * IC Markets Router
 * 
 * Rotas tRPC para operações com IC Markets via cTrader Open API
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { ctraderAdapter } from "../adapters/CTraderAdapter";
import { CTraderCredentials } from "../adapters/IBrokerAdapter";
import {
  getICMarketsConfig,
  upsertICMarketsConfig,
  insertForexPosition,
  updateForexPosition,
  getOpenForexPositions,
  getForexPositionHistory,
} from "../db";

// Schema de validação para configuração IC Markets
const icmarketsConfigSchema = z.object({
  clientId: z.string().min(1, "Client ID é obrigatório"),
  clientSecret: z.string().min(1, "Client Secret é obrigatório"),
  accessToken: z.string().min(1, "Access Token é obrigatório"),
  accountId: z.string().optional(),
  isDemo: z.boolean().default(true),
  symbol: z.string().default("USDJPY"),
  lots: z.string().default("0.01"),
  leverage: z.number().default(500),
  timeframe: z.string().default("M15"),
  stopLossPips: z.number().default(15),
  takeProfitPips: z.number().default(0),
  trailingEnabled: z.boolean().default(true),
  trailingTriggerPips: z.number().default(10),
  trailingStepPips: z.number().default(5),
  compoundingEnabled: z.boolean().default(true),
  baseRisk: z.number().default(10),
});

// Schema para ordem
const orderSchema = z.object({
  symbol: z.string(),
  direction: z.enum(["BUY", "SELL"]),
  lots: z.number().min(0.01).max(100),
  stopLossPips: z.number().optional(),
  takeProfitPips: z.number().optional(),
  comment: z.string().optional(),
});

export const icmarketsRouter = router({
  // ============= CONFIGURAÇÃO =============
  
  /**
   * Obtém configuração IC Markets do usuário
   */
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const config = await getICMarketsConfig(ctx.user.id);
    return config;
  }),
  
  /**
   * Salva configuração IC Markets
   */
  saveConfig: protectedProcedure
    .input(icmarketsConfigSchema)
    .mutation(async ({ ctx, input }) => {
      await upsertICMarketsConfig({
        userId: ctx.user.id,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        accessToken: input.accessToken,
        accountId: input.accountId,
        isDemo: input.isDemo,
        symbol: input.symbol,
        lots: input.lots,
        leverage: input.leverage,
        timeframe: input.timeframe,
        stopLossPips: input.stopLossPips,
        takeProfitPips: input.takeProfitPips,
        trailingEnabled: input.trailingEnabled,
        trailingTriggerPips: input.trailingTriggerPips,
        trailingStepPips: input.trailingStepPips,
      });
      
      // Atualizar configuração da estratégia
      ctraderAdapter.configureStrategy({
        stopLossPips: input.stopLossPips,
        takeProfitPips: input.takeProfitPips,
        trailingEnabled: input.trailingEnabled,
        trailingTriggerPips: input.trailingTriggerPips,
        trailingStepPips: input.trailingStepPips,
        compoundingEnabled: input.compoundingEnabled,
        baseRisk: input.baseRisk,
      });
      
      return { success: true };
    }),
  
  // ============= CONEXÃO =============
  
  /**
   * Testa conexão com IC Markets
   */
  testConnection: protectedProcedure
    .input(z.object({
      clientId: z.string(),
      clientSecret: z.string(),
      accessToken: z.string(),
      isDemo: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      try {
        const credentials: CTraderCredentials = {
          brokerType: "ICMARKETS",
          clientId: input.clientId,
          clientSecret: input.clientSecret,
          accessToken: input.accessToken,
          isDemo: input.isDemo,
        };
        
        const accountInfo = await ctraderAdapter.connect(credentials);
        
        return {
          success: true,
          connected: true,
          balance: accountInfo.balance,
          currency: accountInfo.currency,
          accountId: accountInfo.accountId,
          accountType: accountInfo.accountType,
          leverage: accountInfo.leverage,
        };
      } catch (error) {
        console.error("[ICMarkets] Connection test failed:", error);
        return {
          success: false,
          connected: false,
          error: (error as Error).message,
        };
      }
    }),
  
  /**
   * Conecta ao IC Markets usando configuração salva
   */
  connect: protectedProcedure.mutation(async ({ ctx }) => {
    const config = await getICMarketsConfig(ctx.user.id);
    
    if (!config) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Configuração IC Markets não encontrada",
      });
    }
    
    if (!config.clientId || !config.clientSecret || !config.accessToken) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Credenciais IC Markets incompletas",
      });
    }
    
    try {
      const credentials: CTraderCredentials = {
        brokerType: "ICMARKETS",
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        accessToken: config.accessToken,
        accountId: config.accountId || undefined,
        isDemo: config.isDemo,
      };
      
      const accountInfo = await ctraderAdapter.connect(credentials);
      
      return {
        success: true,
        accountInfo,
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Erro ao conectar: ${(error as Error).message}`,
      });
    }
  }),
  
  /**
   * Desconecta do IC Markets
   */
  disconnect: protectedProcedure.mutation(async () => {
    await ctraderAdapter.disconnect();
    return { success: true };
  }),
  
  /**
   * Obtém status da conexão
   */
  getConnectionStatus: protectedProcedure.query(async () => {
    const isConnected = ctraderAdapter.isConnected();
    let accountInfo = null;
    
    if (isConnected) {
      try {
        accountInfo = await ctraderAdapter.getAccountInfo();
      } catch (error) {
        // Ignorar erro
      }
    }
    
    return {
      connected: isConnected,
      connectionState: ctraderAdapter.connectionState,
      accountInfo,
    };
  }),
  
  // ============= PREÇOS =============
  
  /**
   * Obtém preço atual de um símbolo
   */
  getPrice: protectedProcedure
    .input(z.object({ symbol: z.string() }))
    .query(async ({ input }) => {
      if (!ctraderAdapter.isConnected()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Não conectado ao IC Markets",
        });
      }
      
      try {
        const price = await ctraderAdapter.getPrice(input.symbol);
        return price;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao obter preço: ${(error as Error).message}`,
        });
      }
    }),
  
  /**
   * Obtém símbolos disponíveis
   */
  getSymbols: protectedProcedure.query(async () => {
    const symbols = await ctraderAdapter.getAvailableSymbols();
    return symbols;
  }),
  
  /**
   * Obtém histórico de candles
   */
  getCandleHistory: protectedProcedure
    .input(z.object({
      symbol: z.string(),
      timeframe: z.string().default("M15"),
      count: z.number().default(100),
    }))
    .query(async ({ input }) => {
      if (!ctraderAdapter.isConnected()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Não conectado ao IC Markets",
        });
      }
      
      try {
        const candles = await ctraderAdapter.getCandleHistory(
          input.symbol,
          input.timeframe,
          input.count
        );
        return candles;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao obter candles: ${(error as Error).message}`,
        });
      }
    }),
  
  // ============= ANÁLISE =============
  
  /**
   * Analisa sinal de trading (Trend Sniper)
   */
  analyzeSignal: protectedProcedure
    .input(z.object({
      symbol: z.string(),
      timeframe: z.string().default("M15"),
    }))
    .query(async ({ input }) => {
      if (!ctraderAdapter.isConnected()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Não conectado ao IC Markets",
        });
      }
      
      try {
        const signal = await ctraderAdapter.analyzeSignal(input.symbol, input.timeframe);
        return signal;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao analisar sinal: ${(error as Error).message}`,
        });
      }
    }),
  
  /**
   * Obtém configuração atual da estratégia
   */
  getStrategyConfig: protectedProcedure.query(async () => {
    return ctraderAdapter.getStrategyConfig();
  }),
  
  // ============= ORDENS =============
  
  /**
   * Executa uma ordem
   */
  placeOrder: protectedProcedure
    .input(orderSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctraderAdapter.isConnected()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Não conectado ao IC Markets",
        });
      }
      
      try {
        const result = await ctraderAdapter.placeOrder({
          symbol: input.symbol,
          direction: input.direction,
          orderType: "MARKET",
          lots: input.lots,
          stopLossPips: input.stopLossPips,
          takeProfitPips: input.takeProfitPips,
          comment: input.comment,
        });
        
        if (result.success && result.orderId) {
          // Salvar posição no banco de dados
          await insertForexPosition({
            userId: ctx.user.id,
            positionId: result.orderId,
            symbol: input.symbol,
            direction: input.direction,
            lots: String(input.lots),
            entryPrice: String(result.executionPrice || 0),
            status: "OPEN",
          });
        }
        
        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao executar ordem: ${(error as Error).message}`,
        });
      }
    }),
  
  /**
   * Fecha uma posição
   */
  closePosition: protectedProcedure
    .input(z.object({ positionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctraderAdapter.isConnected()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Não conectado ao IC Markets",
        });
      }
      
      try {
        const result = await ctraderAdapter.closePosition(input.positionId);
        
        if (result.success) {
          // Atualizar posição no banco de dados
          await updateForexPosition(input.positionId, {
            status: "CLOSED",
            exitPrice: result.executionPrice ? String(result.executionPrice) : undefined,
            closeTime: new Date(),
          });
        }
        
        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao fechar posição: ${(error as Error).message}`,
        });
      }
    }),
  
  /**
   * Modifica SL/TP de uma posição
   */
  modifyPosition: protectedProcedure
    .input(z.object({
      positionId: z.string(),
      stopLoss: z.number().optional(),
      takeProfit: z.number().optional(),
      stopLossPips: z.number().optional(),
      takeProfitPips: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!ctraderAdapter.isConnected()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Não conectado ao IC Markets",
        });
      }
      
      try {
        const success = await ctraderAdapter.modifyPosition(input);
        return { success };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao modificar posição: ${(error as Error).message}`,
        });
      }
    }),
  
  /**
   * Atualiza trailing stop de uma posição
   */
  updateTrailingStop: protectedProcedure
    .input(z.object({ positionId: z.string() }))
    .mutation(async ({ input }) => {
      if (!ctraderAdapter.isConnected()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Não conectado ao IC Markets",
        });
      }
      
      try {
        const updated = await ctraderAdapter.updateTrailingStop(input.positionId);
        return { updated };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao atualizar trailing stop: ${(error as Error).message}`,
        });
      }
    }),
  
  // ============= POSIÇÕES =============
  
  /**
   * Obtém posições abertas
   */
  getOpenPositions: protectedProcedure.query(async ({ ctx }) => {
    // Obter do adaptador (tempo real)
    const adapterPositions = await ctraderAdapter.getOpenPositions();
    
    // Obter do banco de dados
    const dbPositions = await getOpenForexPositions(ctx.user.id);
    
    return {
      live: adapterPositions,
      stored: dbPositions,
    };
  }),
  
  /**
   * Obtém histórico de posições
   */
  getPositionHistory: protectedProcedure
    .input(z.object({
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const positions = await getForexPositionHistory(ctx.user.id, input.limit, input.offset);
      return positions;
    }),
});

export type ICMarketsRouter = typeof icmarketsRouter;
