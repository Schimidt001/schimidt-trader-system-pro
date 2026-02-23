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
import { getSMCTradingEngine } from "../adapters/ctrader/SMCTradingEngineManager";
import { getHybridTradingEngine, HybridMode } from "../adapters/ctrader/HybridTradingEngine";
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
  // RSI + VWAP Config
  upsertRsiVwapConfig,
  getRsiVwapConfig,
  // ORB Trend Config
  upsertORBTrendConfig,
  getORBTrendConfig,
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
  // SMC Strategy Config - ATUALIZADO: Valores alinhados com DEFAULT_SMC_CONFIG e UI
  strategyType: z.string().default("SMC_SWARM"),
  structureTimeframe: z.string().default("M15"),  // CORREÇÃO: M15 como padrão (mais sinais)
  activeSymbols: z.string().default('[]'), // CORREÇÃO 2026-02-23: Removido hardcode. Ativos devem ser configurados via UI
  swingH1Lookback: z.number().default(30),  // CORREÇÃO: 30 conforme UI
  fractalLeftBars: z.number().default(1),   // CORREÇÃO: 1 conforme UI
  fractalRightBars: z.number().default(1),  // CORREÇÃO: 1 conforme UI
  sweepBufferPips: z.number().default(0.5), // CORREÇÃO: 0.5 conforme UI
  sweepValidationMinutes: z.number().default(90),  // CORREÇÃO: 90 conforme UI
  chochM15Lookback: z.number().default(15), // CORREÇÃO: 15 conforme UI
  chochMinPips: z.number().default(2.0),    // CORREÇÃO: 2.0 conforme UI (mais agressivo)
  orderBlockLookback: z.number().default(15), // CORREÇÃO: 15 conforme UI
  orderBlockExtensionPips: z.number().default(3.0), // CORREÇÃO: 3.0 conforme UI
  entryConfirmationType: z.string().default("ANY"),
  rejectionWickPercent: z.number().default(20),  // CORREÇÃO: 20 conforme DEFAULT_SMC_CONFIG
  spreadFilterEnabled: z.boolean().default(true),
  maxSpreadPips: z.number().default(3.0),   // CORREÇÃO: 3.0 conforme UI
  riskPercentage: z.number().default(2.0),  // CORREÇÃO: 2.0 conforme UI
  maxOpenTrades: z.number().default(2),     // CORREÇÃO: 2 conforme UI
  dailyLossLimitPercent: z.number().default(10.0), // CORREÇÃO: 10.0 conforme UI
  stopLossBufferPips: z.number().default(2.0),
  rewardRiskRatio: z.number().default(3.0), // CORREÇÃO: 3.0 conforme UI
  sessionFilterEnabled: z.boolean().default(true),
  londonSessionStart: z.string().default("05:00"),  // CORREÇÃO: 05:00 conforme UI
  londonSessionEnd: z.string().default("12:00"),    // CORREÇÃO: 12:00 conforme UI
  nySessionStart: z.string().default("09:00"),      // CORREÇÃO: 09:00 conforme UI
  nySessionEnd: z.string().default("17:00"),        // CORREÇÃO: 17:00 conforme UI
  smcTrailingEnabled: z.boolean().default(true),
  smcTrailingTriggerPips: z.number().default(10.0), // CORREÇÃO: 10.0 conforme UI
  smcTrailingStepPips: z.number().default(2.0),     // CORREÇÃO: 2.0 conforme UI
  circuitBreakerEnabled: z.boolean().default(true),
  verboseLogging: z.boolean().default(true),  // CORREÇÃO: true conforme UI
  // Modo Híbrido
  hybridMode: z.string().default("SMC_ONLY"),
  maxTotalExposurePercent: z.number().default(7.0),
  maxTradesPerSymbol: z.number().default(1),
  // RSI + VWAP Config
  rsiActiveSymbols: z.string().default('[]'),
  rsiH1CandleCount: z.number().default(60),
  rsiM15CandleCount: z.number().default(40),
  rsiM5CandleCount: z.number().default(40),
  rsiPeriod: z.number().default(14),
  rsiOversold: z.number().default(30),
  rsiOverbought: z.number().default(70),
  vwapEnabled: z.boolean().default(true),
  rsiRiskPercentage: z.number().default(1.0),
  rsiStopLossPips: z.number().default(10),
  rsiTakeProfitPips: z.number().default(20),
  rsiRewardRiskRatio: z.number().default(2.0),
  rsiMinCandleBodyPercent: z.number().default(30),
  rsiSpreadFilterEnabled: z.boolean().default(true),
  rsiMaxSpreadPips: z.number().default(2.0),
  rsiSessionFilterEnabled: z.boolean().default(true),
  rsiSessionStart: z.string().default("08:00"),
  rsiSessionEnd: z.string().default("17:00"),
  rsiTrailingEnabled: z.boolean().default(false),
  rsiTrailingTriggerPips: z.number().default(15),
  rsiTrailingStepPips: z.number().default(5),
  rsiVerboseLogging: z.boolean().default(true),
  // ORB Trend Config
  orbActiveSymbols: z.string().default('[]'), // CORREÇÃO 2026-02-23: Removido hardcode. Ativos devem ser configurados via UI
  orbOpeningCandles: z.number().default(3),
  orbEmaPeriod: z.number().default(200),
  orbSlopeLookbackCandles: z.number().default(10),
  orbMinSlope: z.number().default(0.0001),
  orbStopType: z.string().default("rangeOpposite"),
  orbAtrMult: z.number().default(1.5),
  orbAtrPeriod: z.number().default(14),
  orbRiskReward: z.number().default(1.0),
  orbMaxTradesPerDayPerSymbol: z.number().default(1),
  orbRiskPercentage: z.number().default(1.0),
  orbMaxOpenTrades: z.number().default(3),
  orbMaxSpreadPips: z.number().default(3.0),
  // ============= CAMPOS INSTITUCIONAIS SMC =============
  // Modo Institucional (OPT-IN)
  institutionalModeEnabled: z.boolean().default(false),
  // FVG (Fair Value Gap)
  minGapPips: z.number().default(2.0),
  // Sessões Institucionais (UTC em minutos)
  asiaSessionStartUtc: z.number().default(1380),   // 23:00 UTC
  asiaSessionEndUtc: z.number().default(420),      // 07:00 UTC
  londonSessionStartUtc: z.number().default(420),  // 07:00 UTC
  londonSessionEndUtc: z.number().default(720),    // 12:00 UTC
  nySessionStartUtc: z.number().default(720),      // 12:00 UTC
  nySessionEndUtc: z.number().default(1260),       // 21:00 UTC
  // Timeouts FSM Institucional
  instWaitFvgMinutes: z.number().default(90),
  instWaitMitigationMinutes: z.number().default(60),
  instWaitEntryMinutes: z.number().default(30),
  instCooldownMinutes: z.number().default(20),
  // Budget por Sessão
  maxTradesPerSession: z.number().default(2),
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
    
    // Buscar configuração RSI+VWAP do banco de dados
    const rsiConfig = await getRsiVwapConfig(ctx.user.id);
    
    // Buscar configuração ORB Trend do banco de dados
    const orbConfig = await getORBTrendConfig(ctx.user.id);
    
    // Mesclar configurações IC Markets + SMC Strategy + RSI+VWAP + ORB Trend
    return {
      ...config,
      // Garantir que strategyType venha do banco
      strategyType: config.strategyType || "SMC_SWARM",
      
      // Timeframe de Estrutura (Swing Points) - CORREÇÃO: M15 como fallback
      structureTimeframe: smcConfig?.structureTimeframe || "M15",
      
      // Campos SMC (do smcStrategyConfig ou defaults) - CORREÇÃO: Valores alinhados com UI
      activeSymbols: smcConfig?.activeSymbols || JSON.stringify([]), // CORREÇÃO 2026-02-23: Removido hardcode. Retorna vazio se não configurado
      riskPercentage: smcConfig?.riskPercentage || "2.0",
      maxOpenTrades: smcConfig?.maxOpenTrades || 2,
      dailyLossLimitPercent: smcConfig?.dailyLossLimitPercent || "10.0",
      
      // Parâmetros de Estrutura - CORREÇÃO: Valores conforme UI
      swingH1Lookback: smcConfig?.swingH1Lookback || 30,
      fractalLeftBars: smcConfig?.fractalLeftBars || 1,
      fractalRightBars: smcConfig?.fractalRightBars || 1,
      
      // Parâmetros de Sweep - CORREÇÃO: Valores conforme UI
      sweepBufferPips: smcConfig?.sweepBufferPips || "0.5",
      sweepValidationMinutes: smcConfig?.sweepValidationMinutes || 90,
      
      // Parâmetros de CHoCH - CORREÇÃO: Valores conforme UI
      chochM15Lookback: smcConfig?.chochM15Lookback || 15,
      chochMinPips: smcConfig?.chochMinPips || "2.0",
      
      // Parâmetros de Order Block - CORREÇÃO: Valores conforme UI
      orderBlockLookback: smcConfig?.orderBlockLookback || 15,
      orderBlockExtensionPips: smcConfig?.orderBlockExtensionPips || "3.0",
      
      // Parâmetros de Entrada
      entryConfirmationType: smcConfig?.entryConfirmationType || "ANY",
      rejectionWickPercent: smcConfig?.rejectionWickPercent || "20",
      
      // Filtro de Spread - CORREÇÃO: Valores conforme UI
      spreadFilterEnabled: Boolean(smcConfig?.spreadFilterEnabled ?? true),
      maxSpreadPips: smcConfig?.maxSpreadPips || "3.0",
      
      // Gestão de Risco Avançada - CORREÇÃO: Valores conforme UI
      stopLossBufferPips: smcConfig?.stopLossBufferPips || "2.0",
      rewardRiskRatio: smcConfig?.rewardRiskRatio || "3.0",
      
      // Sessões de Trading - CORREÇÃO: Valores conforme UI
      sessionFilterEnabled: Boolean(smcConfig?.sessionFilterEnabled ?? true),
      londonSessionStart: smcConfig?.londonSessionStart || "05:00",
      londonSessionEnd: smcConfig?.londonSessionEnd || "12:00",
      nySessionStart: smcConfig?.nySessionStart || "09:00",
      nySessionEnd: smcConfig?.nySessionEnd || "17:00",
      
      // Trailing Stop SMC - CORREÇÃO: Valores conforme UI
      smcTrailingEnabled: Boolean(smcConfig?.trailingEnabled ?? true),
      smcTrailingTriggerPips: smcConfig?.trailingTriggerPips || "10.0",
      smcTrailingStepPips: smcConfig?.trailingStepPips || "2.0",
      
      // Circuit Breaker e Logging - CORREÇÃO: verboseLogging true por padrão
      circuitBreakerEnabled: Boolean(smcConfig?.circuitBreakerEnabled ?? true),
      verboseLogging: Boolean(smcConfig?.verboseLogging ?? true),
      
      // Modo Híbrido
      hybridMode: (smcConfig as any)?.hybridMode || "SMC_ONLY",
      maxTotalExposurePercent: (smcConfig as any)?.maxTotalExposurePercent || 7.0,
      maxTradesPerSymbol: (smcConfig as any)?.maxTradesPerSymbol || 1,
      
      // RSI + VWAP - CORREÇÃO: Carregar do banco de dados (rsiVwapConfig)
      // Default: array vazio (usuário deve selecionar via UI)
      rsiActiveSymbols: rsiConfig?.activeSymbols || JSON.stringify([]),
      rsiH1CandleCount: rsiConfig?.h1CandleCount ?? 60,
      rsiM15CandleCount: rsiConfig?.m15CandleCount ?? 40,
      rsiM5CandleCount: rsiConfig?.m5CandleCount ?? 40,
      rsiPeriod: rsiConfig?.rsiPeriod ?? 14,
      rsiOversold: rsiConfig?.rsiOversold ?? 30,
      rsiOverbought: rsiConfig?.rsiOverbought ?? 70,
      vwapEnabled: Boolean(rsiConfig?.vwapEnabled ?? true),
      rsiRiskPercentage: rsiConfig?.riskPercentage ? Number(rsiConfig.riskPercentage) : 1.0,
      rsiStopLossPips: rsiConfig?.stopLossPips ? Number(rsiConfig.stopLossPips) : 10,
      rsiTakeProfitPips: rsiConfig?.takeProfitPips ? Number(rsiConfig.takeProfitPips) : 20,
      rsiRewardRiskRatio: rsiConfig?.rewardRiskRatio ? Number(rsiConfig.rewardRiskRatio) : 2.0,
      rsiMinCandleBodyPercent: rsiConfig?.minCandleBodyPercent ? Number(rsiConfig.minCandleBodyPercent) : 30,
      rsiSpreadFilterEnabled: Boolean(rsiConfig?.spreadFilterEnabled ?? true),
      rsiMaxSpreadPips: rsiConfig?.maxSpreadPips ? Number(rsiConfig.maxSpreadPips) : 2.0,
      rsiSessionFilterEnabled: Boolean(rsiConfig?.sessionFilterEnabled ?? true),
      rsiSessionStart: rsiConfig?.sessionStart ?? "08:00",
      rsiSessionEnd: rsiConfig?.sessionEnd ?? "17:00",
      rsiTrailingEnabled: Boolean(rsiConfig?.trailingEnabled ?? false),
      rsiTrailingTriggerPips: rsiConfig?.trailingTriggerPips ? Number(rsiConfig.trailingTriggerPips) : 15,
      rsiTrailingStepPips: rsiConfig?.trailingStepPips ? Number(rsiConfig.trailingStepPips) : 5,
      rsiVerboseLogging: Boolean(rsiConfig?.verboseLogging ?? true),
      
      // ORB Trend - Carregar do banco de dados (orbTrendConfig)
      orbActiveSymbols: orbConfig?.activeSymbols || JSON.stringify([]), // CORREÇÃO 2026-02-23: Removido hardcode. Retorna vazio se não configurado
      orbOpeningCandles: orbConfig?.openingCandles ?? 3,
      orbEmaPeriod: orbConfig?.emaPeriod ?? 200,
      orbSlopeLookbackCandles: orbConfig?.slopeLookbackCandles ?? 10,
      orbMinSlope: orbConfig?.minSlope ? Number(orbConfig.minSlope) : 0.0001,
      orbStopType: orbConfig?.stopType ?? "rangeOpposite",
      orbAtrMult: orbConfig?.atrMult ? Number(orbConfig.atrMult) : 1.5,
      orbAtrPeriod: orbConfig?.atrPeriod ?? 14,
      orbRiskReward: orbConfig?.riskReward ? Number(orbConfig.riskReward) : 1.0,
      orbMaxTradesPerDayPerSymbol: orbConfig?.maxTradesPerDayPerSymbol ?? 1,
      orbRiskPercentage: orbConfig?.riskPercentage ? Number(orbConfig.riskPercentage) : 1.0,
      orbMaxOpenTrades: orbConfig?.maxOpenTrades ?? 3,
      orbMaxSpreadPips: orbConfig?.maxSpreadPips ? Number(orbConfig.maxSpreadPips) : 3.0,
      
      // ============= CAMPOS INSTITUCIONAIS SMC =============
      // Modo Institucional (OPT-IN)
      institutionalModeEnabled: Boolean(smcConfig?.institutionalModeEnabled ?? false),
      // FVG (Fair Value Gap)
      minGapPips: smcConfig?.minGapPips ? Number(smcConfig.minGapPips) : 2.0,
      // Sessões Institucionais (UTC em minutos)
      asiaSessionStartUtc: smcConfig?.asiaSessionStartUtc ?? 1380,
      asiaSessionEndUtc: smcConfig?.asiaSessionEndUtc ?? 420,
      londonSessionStartUtc: smcConfig?.londonSessionStartUtc ?? 420,
      londonSessionEndUtc: smcConfig?.londonSessionEndUtc ?? 720,
      nySessionStartUtc: smcConfig?.nySessionStartUtc ?? 720,
      nySessionEndUtc: smcConfig?.nySessionEndUtc ?? 1260,
      // Timeouts FSM Institucional
      instWaitFvgMinutes: smcConfig?.instWaitFvgMinutes ?? 90,
      instWaitMitigationMinutes: smcConfig?.instWaitMitigationMinutes ?? 60,
      instWaitEntryMinutes: smcConfig?.instWaitEntryMinutes ?? 30,
      instCooldownMinutes: smcConfig?.instCooldownMinutes ?? 20,
      // Budget por Sessão
      maxTradesPerSession: smcConfig?.maxTradesPerSession ?? 2,
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
      const currentORBConfig = await getORBTrendConfig(ctx.user.id);
      
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
        structureTimeframe: "Timeframe de Estrutura",
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
        // ORB Trend
        orbActiveSymbols: "ORB Símbolos Ativos",
        orbOpeningCandles: "ORB Opening Candles",
        orbEmaPeriod: "ORB EMA Período",
        orbSlopeLookbackCandles: "ORB Slope Lookback",
        orbMinSlope: "ORB Min Slope",
        orbStopType: "ORB Tipo de Stop",
        orbAtrMult: "ORB ATR Multiplicador",
        orbAtrPeriod: "ORB ATR Período",
        orbRiskReward: "ORB Risk:Reward",
        orbMaxTradesPerDayPerSymbol: "ORB Máx Trades/Dia",
        orbRiskPercentage: "ORB Risco por Trade (%)",
        orbMaxOpenTrades: "ORB Máx Trades Abertos",
        orbMaxSpreadPips: "ORB Max Spread (pips)",
        // RSI + VWAP
        rsiPeriod: "RSI Período",
        rsiOversold: "RSI Oversold",
        rsiOverbought: "RSI Overbought",
        vwapEnabled: "VWAP Ativado",
        rsiRiskPercentage: "RSI Risco (%)",
        rsiStopLossPips: "RSI Stop Loss (pips)",
        rsiTakeProfitPips: "RSI Take Profit (pips)",
        rsiRewardRiskRatio: "RSI R:R Ratio",
        rsiMinCandleBodyPercent: "RSI Min Candle Body (%)",
        rsiSpreadFilterEnabled: "RSI Filtro Spread",
        rsiMaxSpreadPips: "RSI Max Spread (pips)",
        rsiSessionFilterEnabled: "RSI Filtro Sessão",
        rsiSessionStart: "RSI Início Sessão",
        rsiSessionEnd: "RSI Fim Sessão",
        rsiTrailingEnabled: "RSI Trailing Stop",
        rsiTrailingTriggerPips: "RSI Trailing Trigger (pips)",
        rsiTrailingStepPips: "RSI Trailing Step (pips)",
        rsiVerboseLogging: "RSI Logging Detalhado",
        // Institucional SMC
        institutionalModeEnabled: "Modo Institucional",
        minGapPips: "FVG Mínimo (pips)",
        asiaSessionStartUtc: "Início Sessão ASIA (UTC min)",
        asiaSessionEndUtc: "Fim Sessão ASIA (UTC min)",
        londonSessionStartUtc: "Início Sessão LONDON (UTC min)",
        londonSessionEndUtc: "Fim Sessão LONDON (UTC min)",
        nySessionStartUtc: "Início Sessão NY (UTC min)",
        nySessionEndUtc: "Fim Sessão NY (UTC min)",
        instWaitFvgMinutes: "Timeout FVG (min)",
        instWaitMitigationMinutes: "Timeout Mitigação (min)",
        instWaitEntryMinutes: "Timeout Entrada (min)",
        instCooldownMinutes: "Cooldown (min)",
        maxTradesPerSession: "Máx Trades por Sessão",
      };
      
      const formatValue = (key: string, value: any): string => {
        if (value === undefined || value === null) return "(não definido)";
        // Normalizar tinyint(1) do MySQL para boolean
        if (typeof value === "number" && (value === 0 || value === 1)) {
          value = Boolean(value);
        }
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
      
      // MODO HÍBRIDO ou SMC_ONLY -> Logar campos SMC
      if (input.hybridMode === "HYBRID" || input.hybridMode === "SMC_ONLY") {
        const smcFields = ["activeSymbols", "structureTimeframe", "swingH1Lookback", "fractalLeftBars", "fractalRightBars", "sweepBufferPips", "sweepValidationMinutes", "chochM15Lookback", "chochMinPips", "orderBlockLookback", "orderBlockExtensionPips", "entryConfirmationType", "rejectionWickPercent", "spreadFilterEnabled", "maxSpreadPips", "riskPercentage", "maxOpenTrades", "dailyLossLimitPercent", "stopLossBufferPips", "rewardRiskRatio", "sessionFilterEnabled", "londonSessionStart", "londonSessionEnd", "nySessionStart", "nySessionEnd", "smcTrailingEnabled", "smcTrailingTriggerPips", "smcTrailingStepPips", "circuitBreakerEnabled", "verboseLogging", "institutionalModeEnabled", "minGapPips", "asiaSessionStartUtc", "asiaSessionEndUtc", "londonSessionStartUtc", "londonSessionEndUtc", "nySessionStartUtc", "nySessionEndUtc", "instWaitFvgMinutes", "instWaitMitigationMinutes", "instWaitEntryMinutes", "instCooldownMinutes", "maxTradesPerSession"];
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
      }

      // MODO ORB_ONLY -> Logar campos ORB
      if (input.hybridMode === "ORB_ONLY") {
        const orbFields = ["orbActiveSymbols", "orbOpeningCandles", "orbEmaPeriod", "orbSlopeLookbackCandles", "orbMinSlope", "orbStopType", "orbAtrMult", "orbAtrPeriod", "orbRiskReward", "orbMaxTradesPerDayPerSymbol", "orbRiskPercentage", "orbMaxOpenTrades", "orbMaxSpreadPips"];
        for (const field of orbFields) {
          const inputValue = (input as any)[field];
          if (inputValue === undefined) continue;
          
          // Mapeamento especial para campos que no DB não tem o prefixo 'orb'
          const dbField = field.replace('orb', '').charAt(0).toLowerCase() + field.replace('orb', '').slice(1);
          const dbValue = currentORBConfig ? (currentORBConfig as any)[dbField] : undefined;

          const currentStr = formatValue(field, dbValue);
          const newStr = formatValue(field, inputValue);
          if (currentStr !== newStr) {
            changes.push(`${fieldLabels[field] || field}: ${currentStr} → ${newStr}`);
          }
        }
      }

      // MODO RSI_VWAP_ONLY -> Logar campos RSI
      if (input.hybridMode === "RSI_VWAP_ONLY") {
        const rsiFields = ["rsiActiveSymbols", "rsiH1CandleCount", "rsiM15CandleCount", "rsiM5CandleCount", "rsiPeriod", "rsiOversold", "rsiOverbought", "vwapEnabled", "rsiRiskPercentage", "rsiStopLossPips", "rsiTakeProfitPips", "rsiRewardRiskRatio", "rsiMinCandleBodyPercent", "rsiSpreadFilterEnabled", "rsiMaxSpreadPips", "rsiSessionFilterEnabled", "rsiSessionStart", "rsiSessionEnd", "rsiTrailingEnabled", "rsiTrailingTriggerPips", "rsiTrailingStepPips", "rsiVerboseLogging"];
        for (const field of rsiFields) {
          const inputValue = (input as any)[field];
          if (inputValue === undefined) continue;
          
          // Buscar do config RSI
          const rsiConfig = await getRsiVwapConfig(ctx.user.id);
          const dbValue = rsiConfig ? (rsiConfig as any)[field] : undefined;

          const currentStr = formatValue(field, dbValue);
          const newStr = formatValue(field, inputValue);
          if (currentStr !== newStr) {
            changes.push(`${fieldLabels[field] || field}: ${currentStr} → ${newStr}`);
          }
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
        // Modo Híbrido
        hybridMode: input.hybridMode,
        maxTotalExposurePercent: input.maxTotalExposurePercent.toString(),
        maxTradesPerSymbol: input.maxTradesPerSymbol,
        // ============= CAMPOS INSTITUCIONAIS SMC =============
        // Modo Institucional (OPT-IN)
        institutionalModeEnabled: input.institutionalModeEnabled,
        // FVG (Fair Value Gap)
        minGapPips: input.minGapPips.toString(),
        // Sessões Institucionais (UTC em minutos)
        asiaSessionStartUtc: input.asiaSessionStartUtc,
        asiaSessionEndUtc: input.asiaSessionEndUtc,
        londonSessionStartUtc: input.londonSessionStartUtc,
        londonSessionEndUtc: input.londonSessionEndUtc,
        nySessionStartUtc: input.nySessionStartUtc,
        nySessionEndUtc: input.nySessionEndUtc,
        // Timeouts FSM Institucional
        instWaitFvgMinutes: input.instWaitFvgMinutes,
        instWaitMitigationMinutes: input.instWaitMitigationMinutes,
        instWaitEntryMinutes: input.instWaitEntryMinutes,
        instCooldownMinutes: input.instCooldownMinutes,
        // Budget por Sessão
        maxTradesPerSession: input.maxTradesPerSession,
      });
      
      // ============= SALVAR CONFIGURAÇÃO RSI+VWAP =============
      // CORREÇÃO CRÍTICA: Salvar configurações RSI+VWAP no banco de dados
      await upsertRsiVwapConfig({
        userId: ctx.user.id,
        botId: 1,
        activeSymbols: input.rsiActiveSymbols,
        h1CandleCount: input.rsiH1CandleCount,
        m15CandleCount: input.rsiM15CandleCount,
        m5CandleCount: input.rsiM5CandleCount,
        rsiPeriod: input.rsiPeriod,
        rsiOversold: input.rsiOversold,
        rsiOverbought: input.rsiOverbought,
        vwapEnabled: input.vwapEnabled,
        riskPercentage: input.rsiRiskPercentage.toString(),
        stopLossPips: input.rsiStopLossPips.toString(),
        takeProfitPips: input.rsiTakeProfitPips.toString(),
        rewardRiskRatio: input.rsiRewardRiskRatio.toString(),
        minCandleBodyPercent: input.rsiMinCandleBodyPercent.toString(),
        spreadFilterEnabled: input.rsiSpreadFilterEnabled,
        maxSpreadPips: input.rsiMaxSpreadPips.toString(),
        sessionFilterEnabled: input.rsiSessionFilterEnabled,
        sessionStart: input.rsiSessionStart,
        sessionEnd: input.rsiSessionEnd,
        trailingEnabled: input.rsiTrailingEnabled,
        trailingTriggerPips: input.rsiTrailingTriggerPips.toString(),
        trailingStepPips: input.rsiTrailingStepPips.toString(),
        verboseLogging: input.rsiVerboseLogging,
      });
      
      console.log(`[ICMARKETS_CONFIG] Configuração RSI+VWAP salva para usuário ${ctx.user.id}`);
      
      // ============= SALVAR CONFIGURAÇÃO ORB TREND =============
      await upsertORBTrendConfig({
        userId: ctx.user.id,
        botId: 1,
        activeSymbols: input.orbActiveSymbols,
        openingCandles: input.orbOpeningCandles,
        emaPeriod: input.orbEmaPeriod,
        slopeLookbackCandles: input.orbSlopeLookbackCandles,
        minSlope: input.orbMinSlope.toString(),
        stopType: input.orbStopType,
        atrMult: input.orbAtrMult.toString(),
        atrPeriod: input.orbAtrPeriod,
        riskReward: input.orbRiskReward.toString(),
        maxTradesPerDayPerSymbol: input.orbMaxTradesPerDayPerSymbol,
        riskPercentage: input.orbRiskPercentage.toString(),
        maxOpenTrades: input.orbMaxOpenTrades,
        maxSpreadPips: input.orbMaxSpreadPips.toString(),
        verboseLogging: true,
      });
      
      console.log(`[ICMARKETS_CONFIG] Configuração ORB Trend salva para usuário ${ctx.user.id}`);
      
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
        
        // MELHORIA: Gravar também no systemLogs para aparecer na página de Logs em tempo real
        await insertSystemLog({
          userId: ctx.user.id,
          botId: 1,
          level: "INFO",
          category: "CONFIG",
          source: "UI",
          message: `⚙️ CONFIGURAÇÃO ALTERADA VIA UI | ${changes.length} alterações: ${changes.join(' | ')}`,
          data: { changes, timestamp: new Date().toISOString() },
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
      
      // CORREÇÃO CRÍTICA 2026-01-13: Configurar contexto do usuário para persistência global
      // Isso garante que QUALQUER ordem executada (de qualquer estratégia) seja salva no banco
      ctraderAdapter.setUserContext(ctx.user.id, 1);
      console.log(`[ICMarketsRouter] 🔗 Contexto de usuário configurado: userId=${ctx.user.id}`);
      
      // CORREÇÃO CRÍTICA 2026-01-13: Reconciliar posições no boot
      // Sincroniza posições abertas na cTrader com o banco de dados local
      try {
        const syncedCount = await ctraderAdapter.reconcilePositions();
        console.log(`[ICMarketsRouter] 🔄 Reconciliação concluída: ${syncedCount} posições sincronizadas`);
      } catch (reconcileError) {
        console.error(`[ICMarketsRouter] ⚠️ Erro na reconciliação (não crítico):`, reconcileError);
      }
      
      // Log de conexão bem-sucedida
      await insertSystemLog({
        userId: ctx.user.id,
        botId: 1,
        level: "INFO",
        category: "CONNECTION",
        source: "UI",
        message: `🔗 CONECTADO AO IC MARKETS | Conta: ${accountInfo?.accountId || 'N/A'} | Balance: $${accountInfo?.balance?.toFixed(2) || 'N/A'} | Demo: ${config.isDemo ? 'SIM' : 'NÃO'}`,
        data: { accountId: accountInfo?.accountId, balance: accountInfo?.balance, isDemo: config.isDemo },
      });
      
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
  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await ctraderAdapter.disconnect();
    
    // Log de desconexão
    await insertSystemLog({
      userId: ctx.user.id,
      botId: 1,
      level: "INFO",
      category: "CONNECTION",
      source: "UI",
      message: `🔌 DESCONECTADO DO IC MARKETS`,
      data: { timestamp: new Date().toISOString() },
    });
    
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
          openPositions: dailyStats.openPositions,
          winRate: dailyStats.totalTrades > 0 
            ? ((dailyStats.wins / dailyStats.totalTrades) * 100).toFixed(1) 
            : "0.0",
        },
        monthly: {
          totalTrades: monthlyStats.totalTrades,
          wins: monthlyStats.wins,
          losses: monthlyStats.losses,
          pnlUsd: monthlyStats.pnlUsd,
          openPositions: monthlyStats.openPositions,
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
   * - SMC_SWARM + hybridMode: Verifica se deve usar HybridTradingEngine
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
        
        // Obter configuração SMC para verificar hybridMode
        const smcConfig = await getSMCStrategyConfig(ctx.user.id, botId);
        const hybridMode = (smcConfig as any)?.hybridMode || "SMC_ONLY";
        
        console.log(`[ICMarketsRouter] 🎯 Estratégia Selecionada no DB: ${strategyType}`);
        console.log(`[ICMarketsRouter] 🔄 Modo Híbrido: ${hybridMode}`);
        
        // ============= SELECIONAR ENGINE BASEADO NA ESTRATÉGIA E MODO HÍBRIDO =============
        if (strategyType === "SMC_SWARM") {
          
          // ============= VERIFICAR SE DEVE USAR HYBRID ENGINE =============
          
          // ===== ORB_ONLY: USAR HYBRID ENGINE COM MODO ORB_ONLY =====
          if (hybridMode === "ORB_ONLY") {
            const orbEngine = getHybridTradingEngine(
              ctx.user.id, 
              botId, 
              hybridMode as HybridMode
            );
            
            // Verificar se já está rodando
            if (orbEngine.isRunning) {
              throw new TRPCError({
                code: "CONFLICT",
                message: `O robô ORB ${botId} já está em execução`,
              });
            }
            
            // Iniciar o robô ORB
            await orbEngine.start();
            
            console.log(`[ICMarketsRouter] 🟢 Robô ORB ${botId} iniciado por usuário ${ctx.user.id}`);
            console.log(`[ICMarketsRouter] ✅ STRATEGY_ACTIVE=ORB_ONLY`);
            
            // ========== LOG DE INÍCIO PARA UI ==========
            const orbConfig = await getORBTrendConfig(ctx.user.id, botId);
            const activeSymbolsOrb = orbConfig?.activeSymbols ? JSON.parse(orbConfig.activeSymbols) : []; // CORREÇÃO 2026-02-23: Removido hardcode
            
            await insertSystemLog({
              userId: ctx.user.id,
              botId: botId,
              level: "INFO",
              category: "SYSTEM",
              source: "UI",
              message: `🚀 ROBÔ ORB INICIADO | STRATEGY_ACTIVE=ORB_ONLY | Símbolos: ${activeSymbolsOrb.join(', ')}`,
              data: {
                strategyType: "ORB_TREND",
                hybridMode: "ORB_ONLY",
                activeSymbols: activeSymbolsOrb,
                openingCandles: orbConfig?.openingCandles ?? 3,
                emaPeriod: orbConfig?.emaPeriod ?? 200,
                stopType: orbConfig?.stopType ?? "rangeOpposite",
                riskReward: orbConfig?.riskReward ?? 1.0,
                timestamp: new Date().toISOString(),
              },
            });
            
            return {
              success: true,
              message: `Robô ORB ${botId} iniciado com sucesso`,
              status: orbEngine.getStatus(),
              strategyType: "ORB_TREND",
              hybridMode: "ORB_ONLY",
            };
          }
          
          if (hybridMode === "HYBRID" || hybridMode === "RSI_VWAP_ONLY") {
            // ===== HYBRID TRADING ENGINE (SMC + RSI/VWAP) =====
            const hybridEngine = getHybridTradingEngine(
              ctx.user.id, 
              botId, 
              hybridMode as HybridMode
            );
            
            // Verificar se já está rodando
            if (hybridEngine.isRunning) {
              throw new TRPCError({
                code: "CONFLICT",
                message: `O robô Híbrido ${botId} já está em execução`,
              });
            }
            
            // Iniciar o robô Híbrido
            await hybridEngine.start();
            
            console.log(`[ICMarketsRouter] 🔀 Robô HÍBRIDO ${botId} iniciado por usuário ${ctx.user.id} (Modo: ${hybridMode})`);
            
            // ========== LOG DE INÍCIO PARA UI ==========
            const smcConfigForHybrid = await getSMCStrategyConfig(ctx.user.id, botId);
            const activeSymbolsHybrid = smcConfigForHybrid?.activeSymbols ? JSON.parse(smcConfigForHybrid.activeSymbols) : [];
            
            await insertSystemLog({
              userId: ctx.user.id,
              botId: botId,
              level: "INFO",
              category: "SYSTEM",
              source: "UI",
              message: `🚀 ROBÔ HÍBRIDO INICIADO | Modo: ${hybridMode} | Símbolos: ${activeSymbolsHybrid.join(', ')}`,
              data: {
                strategyType: "HYBRID",
                hybridMode: hybridMode,
                activeSymbols: activeSymbolsHybrid,
                timestamp: new Date().toISOString(),
              },
            });
            
            return {
              success: true,
              message: `Robô Híbrido ${botId} iniciado com sucesso (Modo: ${hybridMode})`,
              status: hybridEngine.getStatus(),
              strategyType: "HYBRID",
              hybridMode: hybridMode,
            };
            
          } else {
            // ===== SMC SWARM ENGINE (SMC_ONLY) =====
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
            
            // ========== LOG DE INÍCIO PARA UI ==========
            // Obter configurações para exibir no log
            const smcConfigForLog = await getSMCStrategyConfig(ctx.user.id, botId);
            const activeSymbolsLog = smcConfigForLog?.activeSymbols ? JSON.parse(smcConfigForLog.activeSymbols) : [];
            
            await insertSystemLog({
              userId: ctx.user.id,
              botId: botId,
              level: "INFO",
              category: "SYSTEM",
              source: "UI",
              message: `🚀 ROBÔ SMC SWARM INICIADO | Modo: ${hybridMode} | Timeframe: ${smcConfigForLog?.structureTimeframe || 'M15'} | Símbolos: ${activeSymbolsLog.join(', ')} | Risco: ${smcConfigForLog?.riskPercentage || '2.0'}%`,
              data: {
                strategyType: "SMC_SWARM",
                hybridMode: "SMC_ONLY",
                structureTimeframe: smcConfigForLog?.structureTimeframe,
                activeSymbols: activeSymbolsLog,
                riskPercentage: smcConfigForLog?.riskPercentage,
                maxOpenTrades: smcConfigForLog?.maxOpenTrades,
                timestamp: new Date().toISOString(),
              },
            });
            
            return {
              success: true,
              message: `Robô SMC SWARM ${botId} iniciado com sucesso`,
              status: smcEngine.getStatus(),
              strategyType: "SMC_SWARM",
              hybridMode: "SMC_ONLY",
            };
          }
          
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
   * STRATEGY FACTORY: Para todos os engines (Hybrid, SMC e Trend Sniper)
   */
  stopBot: protectedProcedure
    .input(z.object({
      botId: z.number().default(1), // ID do bot (1 ou 2)
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      
      try {
        // Tentar parar Hybrid Engine primeiro
        const hybridEngine = getHybridTradingEngine(ctx.user.id, botId);
        if (hybridEngine.isRunning) {
          // Obter status antes de parar para logar
          const hybridStatusBeforeStop = hybridEngine.getStatus();
          
          await hybridEngine.stop();
          console.log(`[ICMarketsRouter] 🛑 Robô HÍBRIDO ${botId} parado por usuário ${ctx.user.id}`);
          
          // ========== LOG DE PARADA PARA UI ==========
          await insertSystemLog({
            userId: ctx.user.id,
            botId: botId,
            level: "INFO",
            category: "SYSTEM",
            source: "UI",
            message: `🛑 ROBÔ HÍBRIDO PARADO | Modo: ${hybridStatusBeforeStop.mode}`,
            data: {
              strategyType: "HYBRID",
              mode: hybridStatusBeforeStop.mode,
              timestamp: new Date().toISOString(),
            },
          });
          
          return {
            success: true,
            message: `Robô Híbrido ${botId} parado com sucesso`,
          };
        }
        
        // Tentar parar SMC Engine
        const smcEngine = getSMCTradingEngine(ctx.user.id, botId);
        if (smcEngine.isRunning) {
          // Obter status antes de parar para logar
          const statusBeforeStop = smcEngine.getStatus();
          
          await smcEngine.stop();
          console.log(`[ICMarketsRouter] 🛑 Robô SMC SWARM ${botId} parado por usuário ${ctx.user.id}`);
          
          // ========== LOG DE PARADA PARA UI ==========
          await insertSystemLog({
            userId: ctx.user.id,
            botId: botId,
            level: "INFO",
            category: "SYSTEM",
            source: "UI",
            message: `🛑 ROBÔ SMC SWARM PARADO | Análises: ${statusBeforeStop.analysisCount} | Trades: ${statusBeforeStop.tradesExecuted} | Ticks: ${statusBeforeStop.tickCount}`,
            data: {
              strategyType: "SMC_SWARM",
              analysisCount: statusBeforeStop.analysisCount,
              tradesExecuted: statusBeforeStop.tradesExecuted,
              tickCount: statusBeforeStop.tickCount,
              timestamp: new Date().toISOString(),
            },
          });
          
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
   * STRATEGY FACTORY: Retorna status do engine que estiver rodando (Hybrid, SMC ou Trend Sniper)
   */
  getBotStatus: protectedProcedure
    .input(z.object({
      botId: z.number().default(1), // ID do bot (1 ou 2)
    }).optional())
    .query(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      
      // Verificar se Hybrid Engine está rodando
      const hybridEngine = getHybridTradingEngine(ctx.user.id, botId);
      if (hybridEngine.isRunning) {
        const status = hybridEngine.getStatus();
        return {
          ...status,
          botId,
          strategyType: "HYBRID",
          hybridMode: status.mode,
        };
      }
      
      // Verificar se SMC Engine está rodando
      const smcEngine = getSMCTradingEngine(ctx.user.id, botId);
      if (smcEngine.isRunning) {
        const status = smcEngine.getStatus();
        return {
          ...status,
          botId,
          strategyType: "SMC_SWARM",
          hybridMode: "SMC_ONLY",
        };
      }
      
      // Verificar se Trend Sniper Engine está rodando
      const engine = getTradingEngine(ctx.user.id, botId);
      const status = engine.getStatus();
      
      return {
        ...status,
        botId,
        strategyType: engine.isRunning ? "TREND_SNIPER" : null,
        hybridMode: null,
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
      limit: z.number().min(1).max(2000).default(2000),
    }).optional())
    .query(async ({ ctx, input }) => {
      const botId = input?.botId ?? 1;
      const limit = input?.limit ?? 2000;
      
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
  
  /**
   * ENDPOINT DE DIAGNÓSTICO: Status do Modo Institucional
   * Retorna configuração, estado FSM e contadores para validação rápida
   */
  getInstitutionalStatus: protectedProcedure.query(async ({ ctx }) => {
    try {
      // 1. Carregar configuração do DB
      const smcConfig = await getSMCStrategyConfig(ctx.user.id);
      
      if (!smcConfig) {
        return {
          enabled: false,
          message: "Configuração SMC não encontrada no banco de dados",
          config: null,
          runtime: null,
        };
      }
      
      const config = {
        institutionalModeEnabled: Boolean(smcConfig.institutionalModeEnabled ?? false),
        minGapPips: smcConfig.minGapPips ? Number(smcConfig.minGapPips) : 2.0,
        asiaSessionStartUtc: smcConfig.asiaSessionStartUtc ?? 1380,
        asiaSessionEndUtc: smcConfig.asiaSessionEndUtc ?? 420,
        londonSessionStartUtc: smcConfig.londonSessionStartUtc ?? 420,
        londonSessionEndUtc: smcConfig.londonSessionEndUtc ?? 720,
        nySessionStartUtc: smcConfig.nySessionStartUtc ?? 720,
        nySessionEndUtc: smcConfig.nySessionEndUtc ?? 1260,
        instWaitFvgMinutes: smcConfig.instWaitFvgMinutes ?? 90,
        instWaitMitigationMinutes: smcConfig.instWaitMitigationMinutes ?? 60,
        instWaitEntryMinutes: smcConfig.instWaitEntryMinutes ?? 30,
        instCooldownMinutes: smcConfig.instCooldownMinutes ?? 20,
        maxTradesPerSession: smcConfig.maxTradesPerSession ?? 2,
      };
      
      // 2. Tentar obter estado do runtime (se engine estiver rodando)
      let runtimeStatus = null;
      try {
        const engine = getHybridTradingEngine(ctx.user.id, 1);
        if (engine && engine.smcStrategy) {
          const strategy = engine.smcStrategy as any;
          
          // Verificar se o método existe (duck typing)
          if (typeof strategy.getInstitutionalFSMState === 'function') {
            const activeSymbols = smcConfig.activeSymbols 
              ? (typeof smcConfig.activeSymbols === 'string' 
                  ? JSON.parse(smcConfig.activeSymbols) 
                  : smcConfig.activeSymbols)
              : [];
            
            runtimeStatus = {
              symbols: activeSymbols.map((symbol: string) => {
                const fsmState = strategy.getInstitutionalFSMState(symbol);
                const tradesCount = strategy.getInstitutionalTradesThisSession?.(symbol) ?? 0;
                
                return {
                  symbol,
                  fsmPhase: fsmState || 'UNKNOWN',
                  tradesThisSession: tradesCount,
                  maxTradesPerSession: config.maxTradesPerSession,
                };
              }),
            };
          }
        }
      } catch (runtimeError) {
        console.warn('[INSTITUTIONAL_STATUS] Não foi possível obter estado do runtime:', runtimeError);
      }
      
      return {
        enabled: config.institutionalModeEnabled,
        message: config.institutionalModeEnabled 
          ? "Modo institucional ATIVADO" 
          : "Modo institucional DESATIVADO",
        config,
        runtime: runtimeStatus,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('[INSTITUTIONAL_STATUS] Erro ao obter status:', error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Erro ao obter status institucional: ${error}`,
      });
    }
  }),
});
export type ICMarketsRouter = typeof icmarketsRouter;
