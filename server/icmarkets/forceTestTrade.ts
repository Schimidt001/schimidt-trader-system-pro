/**
 * Endpoint de Teste para Forçar Trade
 * 
 * Este módulo adiciona um endpoint para forçar um trade de teste
 * na conta demo, permitindo validar o sistema de execução.
 * 
 * APENAS PARA CONTA DEMO
 */

import { z } from "zod";
import { protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { ctraderAdapter } from "../adapters/CTraderAdapter";
import { insertForexPosition } from "../db";

export const forceTestTradeSchema = z.object({
  symbol: z.string().default("USDJPY"),
  direction: z.enum(["BUY", "SELL"]).default("BUY"),
  lots: z.number().min(0.01).max(0.1).default(0.01),
  stopLossPips: z.number().default(20),
  takeProfitPips: z.number().default(40),
}).optional();

export const forceTestTradeProcedure = protectedProcedure
  .input(forceTestTradeSchema)
  .mutation(async ({ ctx, input }) => {
    // Verificar se está conectado
    if (!ctraderAdapter.isConnected()) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Não conectado ao IC Markets",
      });
    }
    
    // Verificar se é conta demo
    const accountInfo = await ctraderAdapter.getAccountInfo();
    if (!accountInfo.isDemo) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Este endpoint só funciona em conta DEMO por segurança",
      });
    }
    
    const params = {
      symbol: input?.symbol || "USDJPY",
      direction: (input?.direction || "BUY") as "BUY" | "SELL",
      lots: input?.lots || 0.01,
      stopLossPips: input?.stopLossPips || 20,
      takeProfitPips: input?.takeProfitPips || 40,
    };
    
    console.log("[FORCE_TEST_TRADE] Executando trade de teste:", params);
    
    try {
      const result = await ctraderAdapter.placeOrder({
        symbol: params.symbol,
        direction: params.direction,
        orderType: "MARKET",
        lots: params.lots,
        stopLossPips: params.stopLossPips,
        takeProfitPips: params.takeProfitPips,
        comment: "FORCE_TEST_TRADE",
      });
      
      if (result.success && result.orderId) {
        // Salvar posição no banco de dados
        await insertForexPosition({
          userId: ctx.user.id,
          positionId: result.orderId,
          symbol: params.symbol,
          direction: params.direction,
          lots: String(params.lots),
          entryPrice: String(result.executionPrice || 0),
          status: "OPEN",
        });
        
        console.log("[FORCE_TEST_TRADE] Trade executado com sucesso:", result);
      }
      
      return {
        success: result.success,
        orderId: result.orderId,
        executionPrice: result.executionPrice,
        errorMessage: result.errorMessage,
        params,
      };
    } catch (error) {
      console.error("[FORCE_TEST_TRADE] Erro:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Erro ao executar trade de teste: ${(error as Error).message}`,
      });
    }
  });
