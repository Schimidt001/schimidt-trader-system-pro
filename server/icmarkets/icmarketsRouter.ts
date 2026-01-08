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
import { getTradingEngine } from "../adapters/ctrader/TradingEngine";
import { getSMCTradingEngine } from "../adapters/ctrader/SMCTradingEngine";
import {
  getICMarketsConfig,
  upsertICMarketsConfig,
  insertForexPosition,
  updateForexPosition,
  getOpenForexPositions,
  getForexPositionHistory,
  getForexDailyStats,
  getForexMonthlyStats,
  upsertSMCStrategyConfig,
  getSMCStrategyConfig,
  // System Logs
  insertSystemLog,
  getRecentSystemLogs,
  getSystemLogsByCategory,
  getSystemLogsByLevel,
  getPerformanceLogs,
  cleanOldSystemLogs,
  countLogsByCategory,
  insertEventLog,
  type LogLevel,
  type LogCategory,
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
  // SMC Strategy Config
  strategyType: z.string().default("SMC_SWARM"),
  structureTimeframe: z.string().default("H1"),
  activeSymbols: z.string().default('["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"]'),
  swingH1Lookback: z.number().default(50),
  fractalLeftBars: z.number().default(2),
  fractalRightBars: z.number().default(2),
  sweepBufferPips: z.number().default(2),
  sweepValidationMinutes: z.number().default(60),
  chochM15Lookback: z.number().default(20),
  chochMinPips: z.number().default(10),
  orderBlockLookback: z.number().default(10),
  orderBlockExtensionPips: z.number().default(15),
  entryConfirmationType: z.string().default("ANY"),
  rejectionWickPercent: z.number().default(60),
  spreadFilterEnabled: z.boolean().default(true),
  maxSpreadPips: z.number().default(2.0),
  riskPercentage: z.number().default(0.75),
  maxOpenTrades: z.number().default(3),
  dailyLossLimitPercent: z.number().default(3),
  stopLossBufferPips: z.number().default(2),
  rewardRiskRatio: z.number().default(4),
  sessionFilterEnabled: z.boolean().default(true),
  londonSessionStart: z.string().default("04:00"),
  londonSessionEnd: z.string().default("07:00"),
  nySessionStart: z.string().default("09:30"),
  nySessionEnd: z.string().default("12:30"),
  smcTrailingEnabled: z.boolean().default(true),
  smcTrailingTriggerPips: z.number().default(20),
  smcTrailingStepPips: z.number().default(10),
  circuitBreakerEnabled: z.boolean().default(true),
  verboseLogging: z.boolean().default(false),
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
   * Obtém configuração IC Markets do usuário (mesclada com SMC Strategy)
   */
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const config = await getICMarketsConfig(ctx.user.id);
    
    if (!config) return null;
    
    // Buscar configuração SMC associada
    const smcConfig = await getSMCStrategyConfig(ctx.user.id);
    
    // Mesclar configurações IC Markets + SMC Strategy
    return {
      ...config,
      // Garantir que strategyType venha do banco
      strategyType: config.strategyType || "SMC_SWARM",
      
      // Timeframe de Estrutura (Swing Points) - NOVO
      structureTimeframe: smcConfig?.structureTimeframe || "H1",
      
      // Campos SMC (do smcStrategyConfig ou defaults)
      activeSymbols: smcConfig?.activeSymbols || JSON.stringify(["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"]),
      riskPercentage: smcConfig?.riskPercentage || "0.75",
      maxOpenTrades: smcConfig?.maxOpenTrades || 3,
      dailyLossLimitPercent: smcConfig?.dailyLossLimitPercent || "3",
      
      // Parâmetros de Estrutura H1
      swingH1Lookback: smcConfig?.swingH1Lookback || 50,
      fractalLeftBars: smcConfig?.fractalLeftBars || 2,
      fractalRightBars: smcConfig?.fractalRightBars || 2,
      
      // Parâmetros de Sweep
      sweepBufferPips: smcConfig?.sweepBufferPips || "2",
      sweepValidationMinutes: smcConfig?.sweepValidationMinutes || 60,
      
      // Parâmetros de CHoCH
      chochM15Lookback: smcConfig?.chochM15Lookback || 20,
      chochMinPips: smcConfig?.chochMinPips || "10",
      
      // Parâmetros de Order Block
      orderBlockLookback: smcConfig?.orderBlockLookback || 10,
      orderBlockExtensionPips: smcConfig?.orderBlockExtensionPips || "15",
      
      // Parâmetros de Entrada
      entryConfirmationType: smcConfig?.entryConfirmationType || "ANY",
      rejectionWickPercent: smcConfig?.rejectionWickPercent || "60",
      
      // Filtro de Spread
      spreadFilterEnabled: smcConfig?.spreadFilterEnabled ?? true,
      maxSpreadPips: smcConfig?.maxSpreadPips || "2.0",
      
      // Gestão de Risco Avançada
      stopLossBufferPips: smcConfig?.stopLossBufferPips || "2",
      rewardRiskRatio: smcConfig?.rewardRiskRatio || "4",
      
      // Sessões de Trading
      sessionFilterEnabled: smcConfig?.sessionFilterEnabled ?? true,
      londonSessionStart: smcConfig?.londonSessionStart || "04:00",
      londonSessionEnd: smcConfig?.londonSessionEnd || "07:00",
      nySessionStart: smcConfig?.nySessionStart || "09:30",
      nySessionEnd: smcConfig?.nySessionEnd || "12:30",
      
      // Trailing Stop SMC
      smcTrailingEnabled: smcConfig?.trailingEnabled ?? true,
      smcTrailingTriggerPips: smcConfig?.trailingTriggerPips || "20",
      smcTrailingStepPips: smcConfig?.trailingStepPips || "10",
      
      // Circuit Breaker e Logging
      circuitBreakerEnabled: smcConfig?.circuitBreakerEnabled ?? true,
      verboseLogging: smcConfig?.verboseLogging ?? false,
    };
  }),
  
  /**
   * Salva configuração IC Markets
   */
  saveConfig: protectedProcedure
    .input(icmarketsConfigSchema)
    .mutation(async ({ ctx, input }) => {
      // ============= SISTEMA DE LOG DE ALTERAÇÕES IC MARKETS =============
      const currentConfig = await getICMarketsConfig(ctx.user.id);
      const currentSMCConfig = await getSMCStrategyConfig(ctx.user.id);
      
      const fieldLabels: Record<string, string> = {
        // IC Markets básico
        clientId: "Client ID",
        clientSecret: "Client Secret",
        accessToken: "Access Token",
        accountId: "Account ID",
        isDemo: "Modo Demo",
        symbol: "Símbolo",
        lots: "Lotes",
        leverage: "Alavancagem",
        timeframe: "Timeframe",
        stopLossPips: "Stop Loss (pips)",
        takeProfitPips: "Take Profit (pips)",
        trailingEnabled: "Trailing Stop",
        trailingTriggerPips: "Trailing Trigger (pips)",
        trailingStepPips: "Trailing Step (pips)",
        strategyType: "Tipo de Estratégia",
        // SMC Strategy
        activeSymbols: "Símbolos Ativos",
        swingH1Lookback: "Swing H1 Lookback",
        fractalLeftBars: "Fractal Left Bars",
        fractalRightBars: "Fractal Right Bars",
        sweepBufferPips: "Sweep Buffer (pips)",
        sweepValidationMinutes: "Sweep Validation (min)",
        chochM15Lookback: "CHoCH M15 Lookback",
        chochMinPips: "CHoCH Min (pips)",
        orderBlockLookback: "Order Block Lookback",
        orderBlockExtensionPips: "Order Block Extension (pips)",
        entryConfirmationType: "Tipo Confirmação Entrada",
        rejectionWickPercent: "Rejection Wick (%)",
        spreadFilterEnabled: "Filtro de Spread",
        maxSpreadPips: "Max Spread (pips)",
        riskPercentage: "Risco por Trade (%)",
        maxOpenTrades: "Máx. Trades Abertos",
        dailyLossLimitPercent: "Limite Perda Diária (%)",
        stopLossBufferPips: "SL Buffer (pips)",
        rewardRiskRatio: "Reward/Risk Ratio",
        sessionFilterEnabled: "Filtro de Sessão",
        londonSessionStart: "Início Sessão Londres",
        londonSessionEnd: "Fim Sessão Londres",
        nySessionStart: "Início Sessão NY",
        nySessionEnd: "Fim Sessão NY",
        smcTrailingEnabled: "SMC Trailing Stop",
        smcTrailingTriggerPips: "SMC Trailing Trigger (pips)",
        smcTrailingStepPips: "SMC Trailing Step (pips)",
        circuitBreakerEnabled: "Circuit Breaker",
        verboseLogging: "Logging Detalhado",
        compoundingEnabled: "Compounding",
        baseRisk: "Risco Base",
      };
      
      const formatValue = (key: string, value: any): string => {
        if (value === undefined || value === null) return "(não definido)";
        if (typeof value === "boolean") return value ? "ATIVADO" : "DESATIVADO";
        if (key === "clientId" || key === "clientSecret" || key === "accessToken") {
          return value ? "****" + String(value).slice(-4) : "(vazio)";
        }
        return String(value);
      };
      
      const changes: string[] = [];
      
      // Verificar campos IC Markets básico
      const icFields = ["clientId", "clientSecret", "accessToken", "accountId", "isDemo", "symbol", "lots", "leverage", "timeframe", "stopLossPips", "takeProfitPips", "trailingEnabled", "trailingTriggerPips", "trailingStepPips", "strategyType"];
      for (const field of icFields) {
        const inputValue = (input as any)[field];
        if (inputValue === undefined) continue;
        const currentValue = currentConfig ? (currentConfig as any)[field] : undefined;
        const currentStr = formatValue(field, currentValue);
        const newStr = formatValue(field, inputValue);
        if (currentStr !== newStr) {
          changes.push(`${fieldLabels[field] || field}: ${currentStr} → ${newStr}`);
        }
      }
      
      // Verificar campos SMC Strategy
      const smcFields = ["activeSymbols", "swingH1Lookback", "fractalLeftBars", "fractalRightBars", "sweepBufferPips", "sweepValidationMinutes", "chochM15Lookback", "chochMinPips", "orderBlockLookback", "orderBlockExtensionPips", "entryConfirmationType", "rejectionWickPercent", "riskPercentage", "maxOpenTrades", "dailyLossLimitPercent", "stopLossBufferPips", "rewardRiskRatio", "sessionFilterEnabled", "londonSessionStart", "londonSessionEnd", "nySessionStart", "nySessionEnd", "circuitBreakerEnabled", "verboseLogging"];
      for (const field of smcFields) {
        const inputValue = (input as any)[field];
        if (inputValue === undefined) continue;
        const currentValue = currentSMCConfig ? (currentSMCConfig as any)[field] : undefined;
        const currentStr = formatValue(field, currentValue);
        const newStr = formatValue(field, inputValue);
        if (currentStr !== newStr) {
          changes.push(`${fieldLabels[field] || field}: ${currentStr} → ${newStr}`);
        }
      }
      // ============= FIM DO SISTEMA DE LOG =============
      
      // Salvar configuração IC Markets básica
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
        strategyType: input.strategyType,
      });
      
      // Salvar configuração SMC Strategy
      await upsertSMCStrategyConfig({
        userId: ctx.user.id,
        botId: 1,
        structureTimeframe: input.structureTimeframe,
        activeSymbols: input.activeSymbols,
        swingH1Lookback: input.swingH1Lookback,
        fractalLeftBars: input.fractalLeftBars,
        fractalRightBars: input.fractalRightBars,
        sweepBufferPips: input.sweepBufferPips.toString(),
        sweepValidationMinutes: input.sweepValidationMinutes,
        chochM15Lookback: input.chochM15Lookback,
        chochMinPips: input.chochMinPips.toString(),
        orderBlockLookback: input.orderBlockLookback,
        orderBlockExtensionPips: input.orderBlockExtensionPips.toString(),
        entryConfirmationType: input.entryConfirmationType,
        rejectionWickPercent: input.rejectionWickPercent.toString(),
        spreadFilterEnabled: input.spreadFilterEnabled,
        maxSpreadPips: input.maxSpreadPips.toString(),
        riskPercentage: input.riskPercentage.toString(),
        maxOpenTrades: input.maxOpenTrades,
        dailyLossLimitPercent: input.dailyLossLimitPercent.toString(),
        stopLossBufferPips: input.stopLossBufferPips.toString(),
        rewardRiskRatio: input.rewardRiskRatio.toString(),
        sessionFilterEnabled: input.sessionFilterEnabled,
        londonSessionStart: input.londonSessionStart,
        londonSessionEnd: input.londonSessionEnd,
        nySessionStart: input.nySessionStart,
        nySessionEnd: input.nySessionEnd,
        trailingEnabled: input.smcTrailingEnabled,
        trailingTriggerPips: input.smcTrailingTriggerPips.toString(),
        trailingStepPips: input.smcTrailingStepPips.toString(),
        circuitBreakerEnabled: input.circuitBreakerEnabled,
        verboseLogging: input.verboseLogging,
      });
      
      // Atualizar configuracao da estrategia TrendSniper (legado)
      ctraderAdapter.configureStrategy({
        stopLossPips: input.stopLossPips,
        takeProfitPips: input.takeProfitPips,
        trailingEnabled: input.trailingEnabled,
        trailingTriggerPips: input.trailingTriggerPips,
        trailingStepPips: input.trailingStepPips,
        compoundingEnabled: input.compoundingEnabled,
        baseRisk: input.baseRisk,
      });
      
      // ============= ATUALIZAR SMC ENGINE EM EXECUCAO =============
      // CORRECAO CRITICA: Recarregar configuracoes no SMCTradingEngine
      // para que as alteracoes da UI sejam aplicadas imediatamente
      try {
        const smcEngine = getSMCTradingEngine(ctx.user.id, 1);
        if (smcEngine.isRunning) {
          await smcEngine.reloadConfig();
          console.log(`[ICMARKETS_CONFIG] SMC Engine recarregado para usuario ${ctx.user.id}`);
        }
      } catch (error) {
        console.warn(`[ICMARKETS_CONFIG] Nao foi possivel recarregar SMC Engine:`, error);
      }
      
      // ============= REGISTRAR LOG DE ALTERACOES =============
      if (changes.length > 0) {
        const logMessage = `📈 IC MARKETS CONFIG ALTERADO:\n${changes.map(c => `  • ${c}`).join('\n')}`;
        await insertEventLog({
          userId: ctx.user.id,
          botId: 1,
          brokerType: "ICMARKETS",
          eventType: "ICMARKETS_CONFIG_CHANGED",
          message: logMessage,
          data: JSON.stringify({ changes, timestamp: new Date().toISOString() }),
          timestampUtc: Math.floor(Date.now() / 1000),
        });
        console.log(`[ICMARKETS_CONFIG] User ${ctx.user.id} | ${changes.length} alterações`);
      }
      
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
  getOpenPositions: protectedProcedure
    .input(z.object({
      botId: z.number().default(1),
    }).optional())
    .query(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      
      // Obter do adaptador (tempo real)
      const adapterPositions = await ctraderAdapter.getOpenPositions();
      
      // Obter do banco de dados (filtrado por botId)
      const dbPositions = await getOpenForexPositions(ctx.user.id, botId);
      
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
      botId: z.number().default(1),
    }))
    .query(async ({ ctx, input }) => {
      const positions = await getForexPositionHistory(ctx.user.id, input.limit, input.offset, input.botId);
      return positions;
    }),
  
  // ============= MÉTRICAS =============
  
  /**
   * Obtém métricas de P&L diário e mensal para IC Markets
   */
  getMetrics: protectedProcedure
    .input(z.object({
      botId: z.number().default(1),
    }).optional())
    .query(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      
      // Obter estatísticas diárias
      const dailyStats = await getForexDailyStats(ctx.user.id, botId);
      
      // Obter estatísticas mensais
      const monthlyStats = await getForexMonthlyStats(ctx.user.id, botId);
      
      return {
        daily: {
          totalTrades: dailyStats.totalTrades,
          wins: dailyStats.wins,
          losses: dailyStats.losses,
          pnlUsd: dailyStats.pnlUsd,
          winRate: dailyStats.totalTrades > 0 
            ? ((dailyStats.wins / dailyStats.totalTrades) * 100).toFixed(1) 
            : "0.0",
        },
        monthly: {
          totalTrades: monthlyStats.totalTrades,
          wins: monthlyStats.wins,
          losses: monthlyStats.losses,
          pnlUsd: monthlyStats.pnlUsd,
          winRate: monthlyStats.totalTrades > 0 
            ? ((monthlyStats.wins / monthlyStats.totalTrades) * 100).toFixed(1) 
            : "0.0",
        },
      };
    }),
  
  // ============= CONTROLE DO BOT (INDEPENDENTE DA CONEXÃO) =============
  
  /**
   * Inicia o robô de trading automático
   * IMPORTANTE: Requer conexão prévia, mas é independente dela
   * Cada bot (botId) é uma instância independente
   * 
   * STRATEGY FACTORY: Consulta o banco de dados para decidir qual engine usar:
   * - SMC_SWARM: Usa SMCTradingEngine (Multi-Ativo, Gestão de Risco Dinâmica)
   * - TREND_SNIPER: Usa TradingEngine legado (RSI, Ativo Único)
   */
  startBot: protectedProcedure
    .input(z.object({
      symbol: z.string().optional(),
      timeframe: z.string().optional(),
      botId: z.number().default(1), // ID do bot (1 ou 2)
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      
      // Verificar se está conectado
      if (!ctraderAdapter.isConnected()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Não conectado ao IC Markets. Conecte primeiro antes de iniciar o robô.",
        });
      }
      
      try {
        // ============= STRATEGY FACTORY: CONSULTAR BANCO DE DADOS =============
        const config = await getICMarketsConfig(ctx.user.id);
        const strategyType = config?.strategyType || "SMC_SWARM"; // Default para SMC_SWARM
        
        console.log(`[ICMarketsRouter] 🎯 Estratégia Selecionada no DB: ${strategyType}`);
        
        // ============= SELECIONAR ENGINE BASEADO NA ESTRATÉGIA =============
        if (strategyType === "SMC_SWARM") {
          // ===== SMC SWARM ENGINE =====
          const smcEngine = getSMCTradingEngine(ctx.user.id, botId);
          
          // Verificar se já está rodando
          if (smcEngine.isRunning) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `O robô SMC SWARM ${botId} já está em execução`,
            });
          }
          
          // Iniciar o robô SMC (ele carrega configs do banco automaticamente)
          await smcEngine.start();
          
          console.log(`[ICMarketsRouter] 🐝 Robô SMC SWARM ${botId} iniciado por usuário ${ctx.user.id}`);
          
          return {
            success: true,
            message: `Robô SMC SWARM ${botId} iniciado com sucesso`,
            status: smcEngine.getStatus(),
            strategyType: "SMC_SWARM",
          };
          
        } else {
          // ===== TREND SNIPER ENGINE (LEGADO) =====
          const engine = getTradingEngine(ctx.user.id, botId);
          
          // Verificar se já está rodando
          if (engine.isRunning) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `O robô Trend Sniper ${botId} já está em execução`,
            });
          }
          
          // Usar símbolo/timeframe do input ou da configuração salva
          const symbol = input?.symbol || config?.symbol || "USDJPY";
          const timeframe = input?.timeframe || config?.timeframe || "M15";
          const lots = parseFloat(config?.lots || "0.01");
          
          // Atualizar configuração do engine
          engine.updateConfig({
            symbol,
            timeframe,
            lots,
            maxPositions: 1,
            cooldownMs: 60000, // 1 minuto entre operações
          });
          
          // Iniciar o robô
          await engine.start(symbol, timeframe);
          
          console.log(`[ICMarketsRouter] 📊 Robô Trend Sniper ${botId} iniciado por usuário ${ctx.user.id}`);
          
          return {
            success: true,
            message: `Robô Trend Sniper ${botId} iniciado com sucesso`,
            status: engine.getStatus(),
            strategyType: "TREND_SNIPER",
          };
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao iniciar robô ${botId}: ${(error as Error).message}`,
        });
      }
    }),
  
  /**
   * Para o robô de trading automático
   * Cada bot (botId) é uma instância independente
   * 
   * STRATEGY FACTORY: Para ambos os engines (SMC e Trend Sniper)
   */
  stopBot: protectedProcedure
    .input(z.object({
      botId: z.number().default(1), // ID do bot (1 ou 2)
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      
      try {
        // Tentar parar SMC Engine
        const smcEngine = getSMCTradingEngine(ctx.user.id, botId);
        if (smcEngine.isRunning) {
          await smcEngine.stop();
          console.log(`[ICMarketsRouter] 🛑 Robô SMC SWARM ${botId} parado por usuário ${ctx.user.id}`);
          return {
            success: true,
            message: `Robô SMC SWARM ${botId} parado com sucesso`,
          };
        }
        
        // Tentar parar Trend Sniper Engine
        const engine = getTradingEngine(ctx.user.id, botId);
        if (engine.isRunning) {
          await engine.stop();
          console.log(`[ICMarketsRouter] 🛑 Robô Trend Sniper ${botId} parado por usuário ${ctx.user.id}`);
          return {
            success: true,
            message: `Robô Trend Sniper ${botId} parado com sucesso`,
          };
        }
        
        // Nenhum engine estava rodando
        return {
          success: true,
          message: `O robô ${botId} já está parado`,
        };
        
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao parar robô ${botId}: ${(error as Error).message}`,
        });
      }
    }),
  
  /**
   * Obtém status do robô de trading
   * IMPORTANTE: Separado do status de conexão
   * Cada bot (botId) é uma instância independente
   * 
   * STRATEGY FACTORY: Retorna status do engine que estiver rodando
   */
  getBotStatus: protectedProcedure
    .input(z.object({
      botId: z.number().default(1), // ID do bot (1 ou 2)
    }).optional())
    .query(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      
      // Verificar se SMC Engine está rodando
      const smcEngine = getSMCTradingEngine(ctx.user.id, botId);
      if (smcEngine.isRunning) {
        const status = smcEngine.getStatus();
        return {
          ...status,
          botId,
          strategyType: "SMC_SWARM",
        };
      }
      
      // Verificar se Trend Sniper Engine está rodando
      const engine = getTradingEngine(ctx.user.id, botId);
      const status = engine.getStatus();
      
      return {
        ...status,
        botId,
        strategyType: engine.isRunning ? "TREND_SNIPER" : null,
      };
    }),
  
  // ============= SYSTEM LOGS (TEMPO REAL) =============
  
  /**
   * Obtém os últimos logs do sistema em tempo real
   * Retorna os últimos N logs ordenados por timestamp decrescente
   */
  getSystemLogs: protectedProcedure
    .input(z.object({
      botId: z.number().default(1),
      limit: z.number().min(1).max(500).default(300),
    }).optional())
    .query(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      const limit = input?.limit ?? 300;
      
      const logs = await getRecentSystemLogs(ctx.user.id, botId, limit);
      
      return {
        logs,
        count: logs.length,
        botId,
      };
    }),
  
  /**
   * Obtém logs filtrados por categoria
   */
  getLogsByCategory: protectedProcedure
    .input(z.object({
      botId: z.number().default(1),
      category: z.enum(["TICK", "ANALYSIS", "TRADE", "RISK", "CONNECTION", "SYSTEM", "PERFORMANCE"]),
      limit: z.number().min(1).max(500).default(100),
    }))
    .query(async ({ ctx, input }) => {
      const logs = await getSystemLogsByCategory(
        ctx.user.id,
        input.category as LogCategory,
        input.botId,
        input.limit
      );
      
      return {
        logs,
        count: logs.length,
        category: input.category,
      };
    }),
  
  /**
   * Obtém logs filtrados por nível (ERROR, WARN, etc.)
   */
  getLogsByLevel: protectedProcedure
    .input(z.object({
      botId: z.number().default(1),
      level: z.enum(["INFO", "WARN", "ERROR", "DEBUG", "PERFORMANCE"]),
      limit: z.number().min(1).max(500).default(100),
    }))
    .query(async ({ ctx, input }) => {
      const logs = await getSystemLogsByLevel(
        ctx.user.id,
        input.level as LogLevel,
        input.botId,
        input.limit
      );
      
      return {
        logs,
        count: logs.length,
        level: input.level,
      };
    }),
  
  /**
   * Obtém logs de performance (latência)
   */
  getPerformanceLogs: protectedProcedure
    .input(z.object({
      botId: z.number().default(1),
      limit: z.number().min(1).max(500).default(100),
    }).optional())
    .query(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      const limit = input?.limit ?? 100;
      
      const logs = await getPerformanceLogs(ctx.user.id, botId, limit);
      
      return {
        logs,
        count: logs.length,
      };
    }),
  
  /**
   * Obtém contagem de logs por categoria
   */
  getLogStats: protectedProcedure
    .input(z.object({
      botId: z.number().default(1),
    }).optional())
    .query(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      const counts = await countLogsByCategory(ctx.user.id, botId);
      
      return {
        counts,
        total: Object.values(counts).reduce((a, b) => a + b, 0),
      };
    }),
  
  /**
   * Limpa logs antigos (mais de X dias)
   */
  cleanOldLogs: protectedProcedure
    .input(z.object({
      daysToKeep: z.number().min(1).max(30).default(7),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const daysToKeep = input?.daysToKeep ?? 7;
      const deletedCount = await cleanOldSystemLogs(ctx.user.id, daysToKeep);
      
      return {
        success: true,
        deletedCount,
        message: `${deletedCount} logs removidos (mais de ${daysToKeep} dias)`,
      };
    }),
  /**
   * ENDPOINT DE TESTE: Forca um trade para validar o sistema de execucao
   * APENAS PARA CONTA DEMO - Usado para diagnostico
   */
  forceTestTrade: protectedProcedure
    .input(z.object({
      symbol: z.string().default("USDJPY"),
      direction: z.enum(["BUY", "SELL"]).default("BUY"),
      lots: z.number().min(0.01).max(0.1).default(0.01),
      stopLossPips: z.number().default(20),
      takeProfitPips: z.number().default(40),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      if (!ctraderAdapter.isConnected()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Nao conectado ao IC Markets",
        });
      }
      const accountInfo = await ctraderAdapter.getAccountInfo();
      if (!accountInfo.isDemo) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Este endpoint so funciona em conta DEMO",
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
    }),

});

export type ICMarketsRouter = typeof icmarketsRouter;
