import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { DERIV_SYMBOLS } from "@/const";
import { Loader2, Save, AlertTriangle, TrendingUp, Activity } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BotSelector, useBotSelector } from "@/components/BotSelector";
import { useBroker, BrokerType } from "@/contexts/BrokerContext";
import { BrokerIndicator } from "@/components/BrokerSwitch";
import { DerivSettings } from "@/components/settings/DerivSettings";
import { ICMARKETS_DEFAULTS } from "@/const/icmarkets";

// Novos componentes refatorados (v2.0)
import { OperationModeSelector } from "@/components/settings/OperationModeSelector";
import { GlobalExposureSettings } from "@/components/settings/GlobalExposureSettings";
import { SMCStrategySettingsClean } from "@/components/settings/SMCStrategySettingsClean";
import { RsiVwapSettingsClean } from "@/components/settings/RsiVwapSettingsClean";
import { ORBSettings } from "@/components/settings/ORBSettings";

/**
 * SettingsMultiBroker v2.0 - Refatorado
 * 
 * Implementa:
 * - Master Switch (Modo de Operação) como "Chefe" da tela
 * - Renderização condicional baseada no modo selecionado
 * - Single Source of Truth para cada configuração
 * - Eliminação de redundâncias em todos os componentes
 */
export default function SettingsMultiBroker() {
  const { user, loading: authLoading } = useAuth();
  const { selectedBot, setSelectedBot } = useBotSelector();
  const { broker, isDeriv, isICMarkets, currentConfig } = useBroker();
  
  // Utils para invalidação de cache após salvar configurações
  const utils = trpc.useUtils();
  
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  
  // ============= ESTADOS DERIV =============
  const [derivConnectionStatus, setDerivConnectionStatus] = useState<{
    connected: boolean;
    balance?: number;
    currency?: string;
    mode?: string;
  } | null>(null);
  
  // Modo e Tokens DERIV
  const [mode, setMode] = useState<"DEMO" | "REAL">("DEMO");
  const [tokenDemo, setTokenDemo] = useState("");
  const [tokenReal, setTokenReal] = useState("");
  const [derivAppId, setDerivAppId] = useState("1089");
  const [derivSymbol, setDerivSymbol] = useState("R_100");
  
  // Parâmetros de Trading DERIV
  const [stake, setStake] = useState("10");
  const [stopDaily, setStopDaily] = useState("100");
  const [takeDaily, setTakeDaily] = useState("500");
  const [lookback, setLookback] = useState("100");
  const [triggerOffset, setTriggerOffset] = useState("16");
  const [profitThreshold, setProfitThreshold] = useState("90");
  const [waitTime, setWaitTime] = useState("8");
  const [timeframe, setTimeframe] = useState("900");
  
  // Configurações avançadas DERIV
  const [repredictionEnabled, setRepredictionEnabled] = useState(true);
  const [repredictionDelay, setRepredictionDelay] = useState("300");
  const [contractType, setContractType] = useState<"RISE_FALL" | "TOUCH" | "NO_TOUCH">("RISE_FALL");
  const [barrierHigh, setBarrierHigh] = useState("3.00");
  const [barrierLow, setBarrierLow] = useState("-3.00");
  const [forexMinDurationMinutes, setForexMinDurationMinutes] = useState("15");
  const [allowEquals, setAllowEquals] = useState(false);
  const [useCandleDuration, setUseCandleDuration] = useState(false);
  const [hedgeEnabled, setHedgeEnabled] = useState(true);
  
  // ============= FILTROS AVANÇADOS DERIV =============
  const [hourlyFilterEnabled, setHourlyFilterEnabled] = useState(false);
  const [hourlyFilterCustomHours, setHourlyFilterCustomHours] = useState<number[]>([]);
  const [hourlyFilterGoldHours, setHourlyFilterGoldHours] = useState<number[]>([]);
  const [hourlyFilterGoldMultiplier, setHourlyFilterGoldMultiplier] = useState("200");
  const [marketConditionEnabled, setMarketConditionEnabled] = useState(false);
  const [payoutCheckEnabled, setPayoutCheckEnabled] = useState(true);
  const [minPayoutPercent, setMinPayoutPercent] = useState("80");
  const [payoutRecheckDelay, setPayoutRecheckDelay] = useState("300");
  const [antiDojiEnabled, setAntiDojiEnabled] = useState(false);
  const [antiDojiRangeMin, setAntiDojiRangeMin] = useState("0.0500");
  const [antiDojiRatioMin, setAntiDojiRatioMin] = useState("18");
  const [exhaustionGuardEnabled, setExhaustionGuardEnabled] = useState(false);
  const [exhaustionRatioMax, setExhaustionRatioMax] = useState("70");
  const [exhaustionPositionMin, setExhaustionPositionMin] = useState("85");
  const [exhaustionRangeLookback, setExhaustionRangeLookback] = useState("10");
  const [exhaustionRangeMultiplier, setExhaustionRangeMultiplier] = useState("1.5");
  const [exhaustionGuardLogEnabled, setExhaustionGuardLogEnabled] = useState(true);
  const [ttlEnabled, setTtlEnabled] = useState(false);
  const [ttlMinimumSeconds, setTtlMinimumSeconds] = useState("180");
  const [ttlTriggerDelayBuffer, setTtlTriggerDelayBuffer] = useState("120");
  const [ttlLogEnabled, setTtlLogEnabled] = useState(true);
  
  // ============= ESTADOS IC MARKETS =============
  const [icConnectionStatus, setIcConnectionStatus] = useState<{
    connected: boolean;
    balance?: number;
    currency?: string;
    accountId?: string;
  } | null>(null);
  
  // Credenciais cTrader
  const [icClientId, setIcClientId] = useState("");
  const [icClientSecret, setIcClientSecret] = useState("");
  const [icAccessToken, setIcAccessToken] = useState("");
  const [icIsDemo, setIcIsDemo] = useState(true);
  
  // Configurações de Trading IC Markets (legado)
  const [icSymbol, setIcSymbol] = useState("EURUSD");
  const [icLots, setIcLots] = useState(ICMARKETS_DEFAULTS.defaultLots.toString());
  const [icLeverage, setIcLeverage] = useState(ICMARKETS_DEFAULTS.defaultLeverage.toString());
  const [icTimeframe, setIcTimeframe] = useState(ICMARKETS_DEFAULTS.defaultTimeframe);
  const [icStopLossPips, setIcStopLossPips] = useState(ICMARKETS_DEFAULTS.defaultStopLossPips.toString());
  const [icTakeProfitPips, setIcTakeProfitPips] = useState(ICMARKETS_DEFAULTS.defaultTakeProfitPips.toString());
  const [icTrailingEnabled, setIcTrailingEnabled] = useState(true);
  const [icTrailingTriggerPips, setIcTrailingTriggerPips] = useState(ICMARKETS_DEFAULTS.trailingTriggerPips.toString());
  const [icTrailingStepPips, setIcTrailingStepPips] = useState(ICMARKETS_DEFAULTS.trailingStepPips.toString());
  
  // ============= MODO DE OPERAÇÃO (MASTER SWITCH) =============
  // Este é o "Chefe" da tela - controla a renderização de todos os outros painéis
  const [operationMode, setOperationMode] = useState("SMC_ONLY");
  
  // ============= ESTADOS GLOBAIS (HÍBRIDO) =============
  const [maxTotalExposurePercent, setMaxTotalExposurePercent] = useState("7.0");
  const [maxTradesPerSymbol, setMaxTradesPerSymbol] = useState("1");

  // ============= ESTADOS SMC STRATEGY (Single Source of Truth) =============
  const [smcStructureTimeframe, setSmcStructureTimeframe] = useState("H1");
  const [smcActiveSymbols, setSmcActiveSymbols] = useState<string[]>([]); // CORREÇÃO 2026-02-23: Removido hardcode. Será carregado do banco
  const [smcSwingH1Lookback, setSmcSwingH1Lookback] = useState("50");
  const [smcFractalLeftBars, setSmcFractalLeftBars] = useState("2");
  const [smcFractalRightBars, setSmcFractalRightBars] = useState("2");
  const [smcSweepBufferPips, setSmcSweepBufferPips] = useState("2");
  const [smcSweepValidationMinutes, setSmcSweepValidationMinutes] = useState("60");
  const [smcChochM15Lookback, setSmcChochM15Lookback] = useState("20");
  const [smcChochMinPips, setSmcChochMinPips] = useState("10");
  const [smcOrderBlockLookback, setSmcOrderBlockLookback] = useState("10");
  const [smcOrderBlockExtensionPips, setSmcOrderBlockExtensionPips] = useState("15");
  const [smcEntryConfirmationType, setSmcEntryConfirmationType] = useState("ANY");
  const [smcRejectionWickPercent, setSmcRejectionWickPercent] = useState("60");
  const [smcSpreadFilterEnabled, setSmcSpreadFilterEnabled] = useState(true);
  const [smcMaxSpreadPips, setSmcMaxSpreadPips] = useState("2.0");
  const [smcRiskPercentage, setSmcRiskPercentage] = useState("0.75");
  const [smcMaxOpenTrades, setSmcMaxOpenTrades] = useState("3");
  const [smcDailyLossLimitPercent, setSmcDailyLossLimitPercent] = useState("3");
  const [smcStopLossBufferPips, setSmcStopLossBufferPips] = useState("2");
  const [smcRewardRiskRatio, setSmcRewardRiskRatio] = useState("4");
  const [smcSessionFilterEnabled, setSmcSessionFilterEnabled] = useState(true);
  const [smcLondonSessionStart, setSmcLondonSessionStart] = useState("04:00");
  const [smcLondonSessionEnd, setSmcLondonSessionEnd] = useState("07:00");
  const [smcNySessionStart, setSmcNySessionStart] = useState("09:30");
  const [smcNySessionEnd, setSmcNySessionEnd] = useState("12:30");
  const [smcTrailingEnabled, setSmcTrailingEnabled] = useState(true);
  const [smcTrailingTriggerPips, setSmcTrailingTriggerPips] = useState("20");
  const [smcTrailingStepPips, setSmcTrailingStepPips] = useState("10");
  const [smcCircuitBreakerEnabled, setSmcCircuitBreakerEnabled] = useState(true);
  const [smcVerboseLogging, setSmcVerboseLogging] = useState(false);
  
  // ============= ESTADOS MODO INSTITUCIONAL SMC =============
  const [institutionalModeEnabled, setInstitutionalModeEnabled] = useState(false);
  const [minGapPips, setMinGapPips] = useState("2.0");
  const [asiaSessionStartUtc, setAsiaSessionStartUtc] = useState("1380");
  const [asiaSessionEndUtc, setAsiaSessionEndUtc] = useState("420");
  const [londonSessionStartUtc, setLondonSessionStartUtc] = useState("420");
  const [londonSessionEndUtc, setLondonSessionEndUtc] = useState("720");
  const [nySessionStartUtc, setNySessionStartUtc] = useState("720");
  const [nySessionEndUtc, setNySessionEndUtc] = useState("1260");
  const [instWaitFvgMinutes, setInstWaitFvgMinutes] = useState("90");
  const [instWaitMitigationMinutes, setInstWaitMitigationMinutes] = useState("60");
  const [instWaitEntryMinutes, setInstWaitEntryMinutes] = useState("30");
  const [instCooldownMinutes, setInstCooldownMinutes] = useState("20");
  const [maxTradesPerSession, setMaxTradesPerSession] = useState("2");

  // ============= ESTADOS RSI + VWAP (Single Source of Truth) =============
  const [rsiActiveSymbols, setRsiActiveSymbols] = useState<string[]>([]);
  const [rsiH1CandleCount, setRsiH1CandleCount] = useState("60");
  const [rsiM15CandleCount, setRsiM15CandleCount] = useState("40");
  const [rsiM5CandleCount, setRsiM5CandleCount] = useState("40");
  const [rsiPeriod, setRsiPeriod] = useState("14");
  const [rsiOversold, setRsiOversold] = useState("30");
  const [rsiOverbought, setRsiOverbought] = useState("70");
  const [vwapEnabled, setVwapEnabled] = useState(true);
  const [rsiRiskPercentage, setRsiRiskPercentage] = useState("1.0");
  const [rsiStopLossPips, setRsiStopLossPips] = useState("10");
  const [rsiTakeProfitPips, setRsiTakeProfitPips] = useState("20");
  const [rsiRewardRiskRatio, setRsiRewardRiskRatio] = useState("2.0");
  const [rsiMinCandleBodyPercent, setRsiMinCandleBodyPercent] = useState("30");
  const [rsiSpreadFilterEnabled, setRsiSpreadFilterEnabled] = useState(true);
  const [rsiMaxSpreadPips, setRsiMaxSpreadPips] = useState("2.0");
  const [rsiSessionFilterEnabled, setRsiSessionFilterEnabled] = useState(true);
  const [rsiSessionStart, setRsiSessionStart] = useState("08:00");
  const [rsiSessionEnd, setRsiSessionEnd] = useState("17:00");
  const [rsiTrailingEnabled, setRsiTrailingEnabled] = useState(false);
  const [rsiTrailingTriggerPips, setRsiTrailingTriggerPips] = useState("15");
  const [rsiTrailingStepPips, setRsiTrailingStepPips] = useState("5");
  const [rsiVerboseLogging, setRsiVerboseLogging] = useState(true);

  // ============= ESTADOS ORB TREND (Single Source of Truth) =============
  const [orbActiveSymbols, setOrbActiveSymbols] = useState<string[]>([]); // CORREÇÃO 2026-02-23: Removido hardcode. Será carregado do banco
  const [orbOpeningCandles, setOrbOpeningCandles] = useState("3");
  const [orbEmaPeriod, setOrbEmaPeriod] = useState("200");
  const [orbSlopeLookbackCandles, setOrbSlopeLookbackCandles] = useState("10");
  const [orbMinSlope, setOrbMinSlope] = useState("0.0001");
  const [orbStopType, setOrbStopType] = useState<"rangeOpposite" | "atr">("rangeOpposite");
  const [orbAtrMult, setOrbAtrMult] = useState("1.5");
  const [orbAtrPeriod, setOrbAtrPeriod] = useState("14");
  const [orbRiskReward, setOrbRiskReward] = useState("1.0");
  const [orbMaxTradesPerDayPerSymbol, setOrbMaxTradesPerDayPerSymbol] = useState("1");
  const [orbRiskPercentage, setOrbRiskPercentage] = useState("1.0");
  const [orbMaxOpenTrades, setOrbMaxOpenTrades] = useState("3");
  const [orbMaxSpreadPips, setOrbMaxSpreadPips] = useState("3.0");

  // ============= QUERIES =============
  const { data: config, isLoading } = trpc.config.get.useQuery(
    { botId: selectedBot },
    { enabled: !!user }
  );

  const { data: botStatus } = trpc.bot.status.useQuery(
    { botId: selectedBot },
    { enabled: !!user, refetchInterval: false }
  );

  const { data: icConfig } = trpc.icmarkets.getConfig.useQuery(undefined, {
    enabled: !!user && isICMarkets,
  });

  // ============= MUTATIONS =============
  const testConnection = trpc.config.testConnection.useMutation({
    onSuccess: (data) => {
      toast.success(`Conectado com sucesso! Saldo: $${(data.balance / 100).toFixed(2)}`);
      setDerivConnectionStatus({
        connected: true,
        balance: data.balance,
        currency: data.currency,
        mode: data.mode,
      });
      setIsTesting(false);
    },
    onError: (error) => {
      toast.error(`Erro ao conectar: ${error.message}`);
      setDerivConnectionStatus({ connected: false });
      setIsTesting(false);
    },
  });

  const reloadBotConfig = trpc.bot.reloadConfig.useMutation({
    onSuccess: () => {
      toast.success("✅ Configurações aplicadas ao bot em tempo real");
    },
    onError: (error) => {
      toast.error('Erro ao aplicar configurações ao bot');
    },
  });

  const updateConfig = trpc.config.update.useMutation({
    onSuccess: () => {
      toast.success("Configurações salvas com sucesso");
      setIsSaving(false);
      
      if (botStatus?.isRunning) {
        reloadBotConfig.mutate();
      }
    },
    onError: (error) => {
      toast.error(`Erro ao salvar: ${error.message}`);
      setIsSaving(false);
    },
  });

  const saveICMarketsConfig = trpc.icmarkets.saveConfig.useMutation({
    onSuccess: async () => {
      // CORREÇÃO: Invalidar cache para garantir que os dados sejam recarregados do servidor
      // Isso resolve o problema de persistência do Modo Institucional
      await utils.icmarkets.getConfig.invalidate();
      toast.success("Configurações IC Markets salvas com sucesso");
      setIsSaving(false);
    },
    onError: (error) => {
      toast.error(`Erro ao salvar configurações IC Markets: ${error.message}`);
      setIsSaving(false);
    },
  });

  const testICMarketsConnection = trpc.icmarkets.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.connected) {
        toast.success(`Conectado ao IC Markets! Saldo: ${data.currency} ${data.balance?.toFixed(2)}`);
        setIcConnectionStatus({
          connected: true,
          balance: data.balance,
          currency: data.currency,
          accountId: data.accountId,
        });
      } else {
        toast.error(`Falha na conexão: ${data.error}`);
        setIcConnectionStatus({ connected: false });
      }
      setIsTesting(false);
    },
    onError: (error) => {
      toast.error(`Erro ao conectar: ${error.message}`);
      setIcConnectionStatus({ connected: false });
      setIsTesting(false);
    },
  });

  // ============= EFEITOS =============
  useEffect(() => {
    if (config) {
      // Carregar configurações DERIV
      setMode(config.mode);
      setTokenDemo(config.tokenDemo || "");
      setTokenReal(config.tokenReal || "");
      setDerivAppId(config.derivAppId || "1089");
      setDerivSymbol(config.symbol);
      setStake((config.stake / 100).toString());
      setStopDaily((config.stopDaily / 100).toString());
      setTakeDaily((config.takeDaily / 100).toString());
      setLookback(config.lookback.toString());
      setTriggerOffset((config.triggerOffset ?? 16).toString());
      setProfitThreshold((config.profitThreshold || 90).toString());
      setWaitTime((config.waitTime || 8).toString());
      setTimeframe((config.timeframe || 900).toString());
      setRepredictionEnabled(config.repredictionEnabled ?? true);
      setRepredictionDelay((config.repredictionDelay || 300).toString());
      setContractType(config.contractType || "RISE_FALL");
      setBarrierHigh(config.barrierHigh || "3.00");
      setBarrierLow(config.barrierLow || "-3.00");
      setForexMinDurationMinutes((config.forexMinDurationMinutes || 15).toString());
      setAllowEquals(config.allowEquals ?? false);
      setUseCandleDuration(config.useCandleDuration ?? false);
      setHedgeEnabled(config.hedgeEnabled ?? true);
      
      // Filtros Avançados DERIV
      setHourlyFilterEnabled(config.hourlyFilterEnabled ?? false);
      if (config.hourlyFilterCustomHours) {
        try {
          setHourlyFilterCustomHours(JSON.parse(config.hourlyFilterCustomHours));
        } catch (e) {
          setHourlyFilterCustomHours([]);
        }
      }
      if (config.hourlyFilterGoldHours) {
        try {
          setHourlyFilterGoldHours(JSON.parse(config.hourlyFilterGoldHours));
        } catch (e) {
          setHourlyFilterGoldHours([]);
        }
      }
      setHourlyFilterGoldMultiplier((config.hourlyFilterGoldMultiplier || 200).toString());
      setMarketConditionEnabled(config.marketConditionEnabled ?? false);
      setPayoutCheckEnabled(config.payoutCheckEnabled ?? true);
      setMinPayoutPercent((config.minPayoutPercent || 80).toString());
      setPayoutRecheckDelay((config.payoutRecheckDelay || 300).toString());
      setAntiDojiEnabled(config.antiDojiEnabled ?? false);
      setAntiDojiRangeMin(config.antiDojiRangeMin ? config.antiDojiRangeMin.toString() : "0.0500");
      const ratioPercent = config.antiDojiRatioMin ? (parseFloat(config.antiDojiRatioMin.toString()) * 100).toFixed(0) : "18";
      setAntiDojiRatioMin(ratioPercent);
      setExhaustionGuardEnabled(config.exhaustionGuardEnabled ?? false);
      const exhaustionRatioPercent = config.exhaustionRatioMax ? (parseFloat(config.exhaustionRatioMax.toString()) * 100).toFixed(0) : "70";
      setExhaustionRatioMax(exhaustionRatioPercent);
      const exhaustionPositionPercent = config.exhaustionPositionMin ? (parseFloat(config.exhaustionPositionMin.toString()) * 100).toFixed(0) : "85";
      setExhaustionPositionMin(exhaustionPositionPercent);
      setExhaustionRangeLookback((config.exhaustionRangeLookback ?? 10).toString());
      setExhaustionRangeMultiplier(config.exhaustionRangeMultiplier ? config.exhaustionRangeMultiplier.toString() : "1.5");
      setExhaustionGuardLogEnabled(config.exhaustionGuardLogEnabled ?? true);
      setTtlEnabled(config.ttlEnabled ?? false);
      setTtlMinimumSeconds((config.ttlMinimumSeconds ?? 180).toString());
      setTtlTriggerDelayBuffer((config.ttlTriggerDelayBuffer ?? 120).toString());
      setTtlLogEnabled(config.ttlLogEnabled ?? true);
    }
  }, [config]);

  // Carregar configurações IC Markets quando disponíveis
  useEffect(() => {
    if (icConfig) {
      // Credenciais básicas
      setIcClientId(icConfig.clientId || "");
      setIcClientSecret(icConfig.clientSecret || "");
      setIcAccessToken(icConfig.accessToken || "");
      setIcIsDemo(icConfig.isDemo ?? true);
      setIcSymbol(icConfig.symbol || "EURUSD");
      setIcLots(icConfig.lots || ICMARKETS_DEFAULTS.defaultLots.toString());
      setIcLeverage((icConfig.leverage || ICMARKETS_DEFAULTS.defaultLeverage).toString());
      setIcTimeframe(icConfig.timeframe || ICMARKETS_DEFAULTS.defaultTimeframe);
      setIcStopLossPips((icConfig.stopLossPips || ICMARKETS_DEFAULTS.defaultStopLossPips).toString());
      setIcTakeProfitPips((icConfig.takeProfitPips || ICMARKETS_DEFAULTS.defaultTakeProfitPips).toString());
      setIcTrailingEnabled(icConfig.trailingEnabled ?? true);
      setIcTrailingTriggerPips((icConfig.trailingTriggerPips || ICMARKETS_DEFAULTS.trailingTriggerPips).toString());
      setIcTrailingStepPips((icConfig.trailingStepPips || ICMARKETS_DEFAULTS.trailingStepPips).toString());
      
      // MODO DE OPERAÇÃO (Master Switch)
      setOperationMode(icConfig.hybridMode || "SMC_ONLY");
      
      // Configurações Globais
      setMaxTotalExposurePercent((icConfig.maxTotalExposurePercent || 7.0).toString());
      setMaxTradesPerSymbol((icConfig.maxTradesPerSymbol || 1).toString());
      
      // Timeframe de Estrutura
      setSmcStructureTimeframe(icConfig.structureTimeframe || "H1");
      
      // Gestão de Risco SMC
      setSmcRiskPercentage((icConfig.riskPercentage || 0.75).toString());
      setSmcMaxOpenTrades((icConfig.maxOpenTrades || 3).toString());
      setSmcDailyLossLimitPercent((icConfig.dailyLossLimitPercent || 3).toString());
      
      // Ativos do Enxame
      if (icConfig.activeSymbols) {
        try {
          const symbols = typeof icConfig.activeSymbols === 'string' 
            ? JSON.parse(icConfig.activeSymbols) 
            : icConfig.activeSymbols;
          setSmcActiveSymbols(symbols);
        } catch (e) {
          setSmcActiveSymbols([]); // CORREÇÃO 2026-02-23: Array vazio ao invés de hardcode
        }
      }
      
      // Parâmetros de Estrutura
      setSmcSwingH1Lookback((icConfig.swingH1Lookback || 50).toString());
      setSmcFractalLeftBars((icConfig.fractalLeftBars || 2).toString());
      setSmcFractalRightBars((icConfig.fractalRightBars || 2).toString());
      setSmcSweepBufferPips((icConfig.sweepBufferPips || 2).toString());
      setSmcSweepValidationMinutes((icConfig.sweepValidationMinutes || 60).toString());
      setSmcChochM15Lookback((icConfig.chochM15Lookback || 20).toString());
      setSmcChochMinPips((icConfig.chochMinPips || 10).toString());
      setSmcOrderBlockLookback((icConfig.orderBlockLookback || 10).toString());
      setSmcOrderBlockExtensionPips((icConfig.orderBlockExtensionPips || 15).toString());
      setSmcEntryConfirmationType(icConfig.entryConfirmationType || "ANY");
      setSmcRejectionWickPercent((icConfig.rejectionWickPercent || 60).toString());
      setSmcSpreadFilterEnabled(icConfig.spreadFilterEnabled ?? true);
      setSmcMaxSpreadPips((icConfig.maxSpreadPips || 2.0).toString());
      setSmcStopLossBufferPips((icConfig.stopLossBufferPips || 2).toString());
      setSmcRewardRiskRatio((icConfig.rewardRiskRatio || 4).toString());
      setSmcSessionFilterEnabled(icConfig.sessionFilterEnabled ?? true);
      setSmcLondonSessionStart(icConfig.londonSessionStart || "04:00");
      setSmcLondonSessionEnd(icConfig.londonSessionEnd || "07:00");
      setSmcNySessionStart(icConfig.nySessionStart || "09:30");
      setSmcNySessionEnd(icConfig.nySessionEnd || "12:30");
      setSmcTrailingEnabled(icConfig.smcTrailingEnabled ?? true);
      setSmcTrailingTriggerPips((icConfig.smcTrailingTriggerPips || 20).toString());
      setSmcTrailingStepPips((icConfig.smcTrailingStepPips || 10).toString());
      setSmcCircuitBreakerEnabled(icConfig.circuitBreakerEnabled ?? true);
      setSmcVerboseLogging(icConfig.verboseLogging ?? false);
      
      // Modo Institucional SMC
      setInstitutionalModeEnabled(icConfig.institutionalModeEnabled ?? false);
      setMinGapPips((icConfig.minGapPips || 2.0).toString());
      setAsiaSessionStartUtc((icConfig.asiaSessionStartUtc || 1380).toString());
      setAsiaSessionEndUtc((icConfig.asiaSessionEndUtc || 420).toString());
      setLondonSessionStartUtc((icConfig.londonSessionStartUtc || 420).toString());
      setLondonSessionEndUtc((icConfig.londonSessionEndUtc || 720).toString());
      setNySessionStartUtc((icConfig.nySessionStartUtc || 720).toString());
      setNySessionEndUtc((icConfig.nySessionEndUtc || 1260).toString());
      setInstWaitFvgMinutes((icConfig.instWaitFvgMinutes || 90).toString());
      setInstWaitMitigationMinutes((icConfig.instWaitMitigationMinutes || 60).toString());
      setInstWaitEntryMinutes((icConfig.instWaitEntryMinutes || 30).toString());
      setInstCooldownMinutes((icConfig.instCooldownMinutes || 20).toString());
      setMaxTradesPerSession((icConfig.maxTradesPerSession || 2).toString());
      
      // RSI + VWAP
      if (icConfig.rsiActiveSymbols) {
        try {
          const symbols = typeof icConfig.rsiActiveSymbols === 'string' 
            ? JSON.parse(icConfig.rsiActiveSymbols) 
            : icConfig.rsiActiveSymbols;
          setRsiActiveSymbols(symbols);
        } catch (e) {
          setRsiActiveSymbols([]); // CORREÇÃO 2026-02-23: Array vazio ao invés de hardcode
        }
      }
      if (icConfig.rsiH1CandleCount) setRsiH1CandleCount(icConfig.rsiH1CandleCount.toString());
      if (icConfig.rsiM15CandleCount) setRsiM15CandleCount(icConfig.rsiM15CandleCount.toString());
      if (icConfig.rsiM5CandleCount) setRsiM5CandleCount(icConfig.rsiM5CandleCount.toString());
      if (icConfig.rsiPeriod) setRsiPeriod(icConfig.rsiPeriod.toString());
      if (icConfig.rsiOversold) setRsiOversold(icConfig.rsiOversold.toString());
      if (icConfig.rsiOverbought) setRsiOverbought(icConfig.rsiOverbought.toString());
      if (icConfig.vwapEnabled !== undefined) setVwapEnabled(icConfig.vwapEnabled);
      if (icConfig.rsiRiskPercentage) setRsiRiskPercentage(icConfig.rsiRiskPercentage.toString());
      if (icConfig.rsiStopLossPips) setRsiStopLossPips(icConfig.rsiStopLossPips.toString());
      if (icConfig.rsiTakeProfitPips) setRsiTakeProfitPips(icConfig.rsiTakeProfitPips.toString());
      if (icConfig.rsiRewardRiskRatio) setRsiRewardRiskRatio(icConfig.rsiRewardRiskRatio.toString());
      if (icConfig.rsiMinCandleBodyPercent) setRsiMinCandleBodyPercent(icConfig.rsiMinCandleBodyPercent.toString());
      if (icConfig.rsiSpreadFilterEnabled !== undefined) setRsiSpreadFilterEnabled(icConfig.rsiSpreadFilterEnabled);
      if (icConfig.rsiMaxSpreadPips) setRsiMaxSpreadPips(icConfig.rsiMaxSpreadPips.toString());
      if (icConfig.rsiSessionFilterEnabled !== undefined) setRsiSessionFilterEnabled(icConfig.rsiSessionFilterEnabled);
      if (icConfig.rsiSessionStart) setRsiSessionStart(icConfig.rsiSessionStart);
      if (icConfig.rsiSessionEnd) setRsiSessionEnd(icConfig.rsiSessionEnd);
      if (icConfig.rsiTrailingEnabled !== undefined) setRsiTrailingEnabled(icConfig.rsiTrailingEnabled);
      if (icConfig.rsiTrailingTriggerPips) setRsiTrailingTriggerPips(icConfig.rsiTrailingTriggerPips.toString());
      if (icConfig.rsiTrailingStepPips) setRsiTrailingStepPips(icConfig.rsiTrailingStepPips.toString());
      if (icConfig.rsiVerboseLogging !== undefined) setRsiVerboseLogging(icConfig.rsiVerboseLogging);
      
      // ORB Trend
      if (icConfig.orbActiveSymbols) {
        try {
          const symbols = typeof icConfig.orbActiveSymbols === 'string' 
            ? JSON.parse(icConfig.orbActiveSymbols) 
            : icConfig.orbActiveSymbols;
          setOrbActiveSymbols(symbols);
        } catch (e) {
          setOrbActiveSymbols([]); // CORREÇÃO 2026-02-23: Array vazio ao invés de hardcode
        }
      }
      if (icConfig.orbOpeningCandles) setOrbOpeningCandles(icConfig.orbOpeningCandles.toString());
      if (icConfig.orbEmaPeriod) setOrbEmaPeriod(icConfig.orbEmaPeriod.toString());
      if (icConfig.orbSlopeLookbackCandles) setOrbSlopeLookbackCandles(icConfig.orbSlopeLookbackCandles.toString());
      if (icConfig.orbMinSlope) setOrbMinSlope(icConfig.orbMinSlope.toString());
      if (icConfig.orbStopType) setOrbStopType(icConfig.orbStopType as "rangeOpposite" | "atr");
      if (icConfig.orbAtrMult) setOrbAtrMult(icConfig.orbAtrMult.toString());
      if (icConfig.orbAtrPeriod) setOrbAtrPeriod(icConfig.orbAtrPeriod.toString());
      if (icConfig.orbRiskReward) setOrbRiskReward(icConfig.orbRiskReward.toString());
      if (icConfig.orbMaxTradesPerDayPerSymbol) setOrbMaxTradesPerDayPerSymbol(icConfig.orbMaxTradesPerDayPerSymbol.toString());
      if (icConfig.orbRiskPercentage) setOrbRiskPercentage(icConfig.orbRiskPercentage.toString());
      if (icConfig.orbMaxOpenTrades) setOrbMaxOpenTrades(icConfig.orbMaxOpenTrades.toString());
      if (icConfig.orbMaxSpreadPips) setOrbMaxSpreadPips(icConfig.orbMaxSpreadPips.toString());
    }
  }, [icConfig]);

  // ============= HANDLERS =============
  const handleTestDerivConnection = async () => {
    if (mode === "DEMO" && !tokenDemo) {
      toast.error("Token DEMO é obrigatório");
      return;
    }
    if (mode === "REAL" && !tokenReal) {
      toast.error("Token REAL é obrigatório");
      return;
    }
    setIsTesting(true);
    testConnection.mutate();
  };

  const handleTestICMarketsConnection = async () => {
    if (!icClientId || !icClientSecret || !icAccessToken) {
      toast.error("Preencha todas as credenciais da cTrader");
      return;
    }
    
    setIsTesting(true);
    testICMarketsConnection.mutate({
      clientId: icClientId,
      clientSecret: icClientSecret,
      accessToken: icAccessToken,
      isDemo: icIsDemo,
    });
  };

  const handleSave = () => {
    setIsSaving(true);
    
    if (isDeriv) {
      // Salvar configurações DERIV
      const stakeNum = parseFloat(stake);
      const stopDailyNum = parseFloat(stopDaily);
      const takeDailyNum = parseFloat(takeDaily);
      const lookbackNum = parseInt(lookback);
      const triggerOffsetNum = parseInt(triggerOffset);
      const profitThresholdNum = parseInt(profitThreshold);
      const waitTimeNum = parseInt(waitTime);
      const timeframeNum = parseInt(timeframe);
      const forexMinDurationMinutesNum = parseInt(forexMinDurationMinutes);
      const repredictionDelayNum = parseInt(repredictionDelay);

      if (isNaN(stakeNum) || stakeNum <= 0) {
        toast.error("Stake deve ser um número positivo");
        setIsSaving(false);
        return;
      }

      if (mode === "DEMO" && !tokenDemo) {
        toast.error("Token DEMO é obrigatório no modo DEMO");
        setIsSaving(false);
        return;
      }

      if (mode === "REAL" && !tokenReal) {
        toast.error("Token REAL é obrigatório no modo REAL");
        setIsSaving(false);
        return;
      }

      if (hourlyFilterEnabled && hourlyFilterCustomHours.length === 0) {
        toast.error("Selecione pelo menos 1 horário permitido ou desative o filtro de horário");
        setIsSaving(false);
        return;
      }

      updateConfig.mutate({
        botId: selectedBot,
        mode,
        tokenDemo: tokenDemo || undefined,
        tokenReal: tokenReal || undefined,
        derivAppId: derivAppId || "1089",
        symbol: derivSymbol,
        stake: Math.round(stakeNum * 100),
        stopDaily: Math.round(stopDailyNum * 100),
        takeDaily: Math.round(takeDailyNum * 100),
        lookback: lookbackNum,
        triggerOffset: triggerOffsetNum,
        profitThreshold: profitThresholdNum,
        waitTime: waitTimeNum,
        timeframe: timeframeNum,
        repredictionEnabled,
        repredictionDelay: repredictionDelayNum,
        contractType,
        barrierHigh,
        barrierLow,
        forexMinDurationMinutes: forexMinDurationMinutesNum,
        allowEquals,
        useCandleDuration,
        hedgeEnabled,
        hourlyFilterEnabled,
        hourlyFilterMode: "CUSTOM" as const,
        hourlyFilterCustomHours: JSON.stringify(hourlyFilterCustomHours),
        hourlyFilterGoldHours: JSON.stringify(hourlyFilterGoldHours),
        hourlyFilterGoldMultiplier: parseInt(hourlyFilterGoldMultiplier) || 200,
        marketConditionEnabled,
        payoutCheckEnabled,
        minPayoutPercent: parseInt(minPayoutPercent) || 80,
        payoutRecheckDelay: parseInt(payoutRecheckDelay) || 300,
        antiDojiEnabled,
        antiDojiRangeMin: parseFloat(antiDojiRangeMin) || 0.0500,
        antiDojiRatioMin: (parseInt(antiDojiRatioMin) || 18) / 100,
        exhaustionGuardEnabled,
        exhaustionRatioMax: (parseInt(exhaustionRatioMax) || 70) / 100,
        exhaustionPositionMin: (parseInt(exhaustionPositionMin) || 85) / 100,
        exhaustionRangeLookback: parseInt(exhaustionRangeLookback) || 10,
        exhaustionRangeMultiplier: parseFloat(exhaustionRangeMultiplier) || 1.5,
        exhaustionGuardLogEnabled,
        ttlEnabled,
        ttlMinimumSeconds: parseInt(ttlMinimumSeconds) || 180,
        ttlTriggerDelayBuffer: parseInt(ttlTriggerDelayBuffer) || 120,
        ttlLogEnabled,
      });
    } else {
      // Salvar configurações IC Markets com TODOS os campos de uma vez (Single Source of Truth)
      saveICMarketsConfig.mutate({
        clientId: icClientId,
        clientSecret: icClientSecret,
        accessToken: icAccessToken,
        isDemo: icIsDemo,
        symbol: icSymbol,
        lots: icLots,
        leverage: parseInt(icLeverage),
        timeframe: icTimeframe,
        stopLossPips: parseInt(icStopLossPips),
        takeProfitPips: parseInt(icTakeProfitPips),
        trailingEnabled: icTrailingEnabled,
        trailingTriggerPips: parseInt(icTrailingTriggerPips),
        trailingStepPips: parseInt(icTrailingStepPips),
        compoundingEnabled: true,
        baseRisk: 10,
        // Modo de Operação (Master Switch)
        strategyType: "SMC_SWARM",
        hybridMode: operationMode,
        // Configurações Globais
        maxTotalExposurePercent: parseFloat(maxTotalExposurePercent) || 7.0,
        maxTradesPerSymbol: parseInt(maxTradesPerSymbol) || 1,
        // SMC Strategy Config
        structureTimeframe: smcStructureTimeframe,
        activeSymbols: JSON.stringify(smcActiveSymbols),
        swingH1Lookback: parseInt(smcSwingH1Lookback) || 50,
        fractalLeftBars: parseInt(smcFractalLeftBars) || 2,
        fractalRightBars: parseInt(smcFractalRightBars) || 2,
        sweepBufferPips: parseFloat(smcSweepBufferPips) || 2,
        sweepValidationMinutes: parseInt(smcSweepValidationMinutes) || 60,
        chochM15Lookback: parseInt(smcChochM15Lookback) || 20,
        chochMinPips: parseInt(smcChochMinPips) || 10,
        orderBlockLookback: parseInt(smcOrderBlockLookback) || 10,
        orderBlockExtensionPips: parseInt(smcOrderBlockExtensionPips) || 15,
        entryConfirmationType: smcEntryConfirmationType,
        rejectionWickPercent: parseInt(smcRejectionWickPercent) || 60,
        spreadFilterEnabled: smcSpreadFilterEnabled,
        maxSpreadPips: parseFloat(smcMaxSpreadPips) || 2.0,
        riskPercentage: parseFloat(smcRiskPercentage) || 0.75,
        maxOpenTrades: parseInt(smcMaxOpenTrades) || 3,
        dailyLossLimitPercent: parseFloat(smcDailyLossLimitPercent) || 3,
        stopLossBufferPips: parseFloat(smcStopLossBufferPips) || 2,
        rewardRiskRatio: parseInt(smcRewardRiskRatio) || 4,
        sessionFilterEnabled: smcSessionFilterEnabled,
        londonSessionStart: smcLondonSessionStart,
        londonSessionEnd: smcLondonSessionEnd,
        nySessionStart: smcNySessionStart,
        nySessionEnd: smcNySessionEnd,
        smcTrailingEnabled: smcTrailingEnabled,
        smcTrailingTriggerPips: parseInt(smcTrailingTriggerPips) || 20,
        smcTrailingStepPips: parseInt(smcTrailingStepPips) || 10,
        circuitBreakerEnabled: smcCircuitBreakerEnabled,
        verboseLogging: smcVerboseLogging,
        // Modo Institucional SMC
        institutionalModeEnabled: institutionalModeEnabled,
        minGapPips: parseFloat(minGapPips) || 2.0,
        asiaSessionStartUtc: parseInt(asiaSessionStartUtc) || 1380,
        asiaSessionEndUtc: parseInt(asiaSessionEndUtc) || 420,
        londonSessionStartUtc: parseInt(londonSessionStartUtc) || 420,
        londonSessionEndUtc: parseInt(londonSessionEndUtc) || 720,
        nySessionStartUtc: parseInt(nySessionStartUtc) || 720,
        nySessionEndUtc: parseInt(nySessionEndUtc) || 1260,
        instWaitFvgMinutes: parseInt(instWaitFvgMinutes) || 90,
        instWaitMitigationMinutes: parseInt(instWaitMitigationMinutes) || 60,
        instWaitEntryMinutes: parseInt(instWaitEntryMinutes) || 30,
        instCooldownMinutes: parseInt(instCooldownMinutes) || 20,
        maxTradesPerSession: parseInt(maxTradesPerSession) || 2,
        // RSI + VWAP Config
        rsiActiveSymbols: JSON.stringify(rsiActiveSymbols),
        rsiH1CandleCount: parseInt(rsiH1CandleCount) || 60,
        rsiM15CandleCount: parseInt(rsiM15CandleCount) || 40,
        rsiM5CandleCount: parseInt(rsiM5CandleCount) || 40,
        rsiPeriod: parseInt(rsiPeriod) || 14,
        rsiOversold: parseInt(rsiOversold) || 30,
        rsiOverbought: parseInt(rsiOverbought) || 70,
        vwapEnabled: vwapEnabled,
        rsiRiskPercentage: parseFloat(rsiRiskPercentage) || 1.0,
        rsiStopLossPips: parseFloat(rsiStopLossPips) || 10,
        rsiTakeProfitPips: parseFloat(rsiTakeProfitPips) || 20,
        rsiRewardRiskRatio: parseFloat(rsiRewardRiskRatio) || 2.0,
        rsiMinCandleBodyPercent: parseFloat(rsiMinCandleBodyPercent) || 30,
        rsiSpreadFilterEnabled: rsiSpreadFilterEnabled,
        rsiMaxSpreadPips: parseFloat(rsiMaxSpreadPips) || 2.0,
        rsiSessionFilterEnabled: rsiSessionFilterEnabled,
        rsiSessionStart: rsiSessionStart,
        rsiSessionEnd: rsiSessionEnd,
        rsiTrailingEnabled: rsiTrailingEnabled,
        rsiTrailingTriggerPips: parseInt(rsiTrailingTriggerPips) || 15,
        rsiTrailingStepPips: parseInt(rsiTrailingStepPips) || 5,
        rsiVerboseLogging: rsiVerboseLogging,
        // ORB Trend Config
        orbActiveSymbols: JSON.stringify(orbActiveSymbols),
        orbOpeningCandles: parseInt(orbOpeningCandles) || 3,
        orbEmaPeriod: parseInt(orbEmaPeriod) || 200,
        orbSlopeLookbackCandles: parseInt(orbSlopeLookbackCandles) || 10,
        orbMinSlope: parseFloat(orbMinSlope) || 0.0001,
        orbStopType: orbStopType,
        orbAtrMult: parseFloat(orbAtrMult) || 1.5,
        orbAtrPeriod: parseInt(orbAtrPeriod) || 14,
        orbRiskReward: parseFloat(orbRiskReward) || 1.0,
        orbMaxTradesPerDayPerSymbol: parseInt(orbMaxTradesPerDayPerSymbol) || 1,
        orbRiskPercentage: parseFloat(orbRiskPercentage) || 1.0,
        orbMaxOpenTrades: parseInt(orbMaxOpenTrades) || 3,
        orbMaxSpreadPips: parseFloat(orbMaxSpreadPips) || 3.0,
      });
    }
  };

  // ============= RENDER =============
  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card>
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>Você precisa estar autenticado para acessar as configurações</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto p-6 max-w-4xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white">Configurações</h1>
              <p className="text-slate-400 mt-1">Configure os parâmetros do bot trader</p>
            </div>
            <BrokerIndicator />
          </div>
          <BotSelector selectedBot={selectedBot} onBotChange={setSelectedBot} />
        </div>

        {/* Aviso de contexto */}
        <div className={`mb-6 p-4 rounded-lg border ${
          isDeriv 
            ? "bg-red-500/10 border-red-500/30" 
            : "bg-blue-500/10 border-blue-500/30"
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{currentConfig.icon}</span>
            <div>
              <p className={`font-medium ${isDeriv ? "text-red-400" : "text-blue-400"}`}>
                Modo {currentConfig.label} Ativo
              </p>
              <p className="text-sm text-slate-400">
                {currentConfig.description} - As configurações abaixo são específicas para esta corretora
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Renderização condicional baseada no broker selecionado */}
          {isDeriv ? (
            <>
              {/* ============= CONFIGURAÇÕES DERIV ============= */}
              <DerivSettings
                mode={mode}
                setMode={setMode}
                tokenDemo={tokenDemo}
                setTokenDemo={setTokenDemo}
                tokenReal={tokenReal}
                setTokenReal={setTokenReal}
                derivAppId={derivAppId}
                setDerivAppId={setDerivAppId}
                symbol={derivSymbol}
                setSymbol={setDerivSymbol}
                isTesting={isTesting}
                onTestConnection={handleTestDerivConnection}
                connectionStatus={derivConnectionStatus}
              />

              {/* Parâmetros de Trading DERIV */}
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white">Parâmetros de Trading</CardTitle>
                  <CardDescription className="text-slate-400">
                    Configure stake e gestão de risco para Binary Options
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="stake" className="text-slate-300">Stake (USD)</Label>
                      <Input
                        id="stake"
                        type="number"
                        step="0.01"
                        value={stake}
                        onChange={(e) => setStake(e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lookback" className="text-slate-300">Lookback (candles)</Label>
                      <Input
                        id="lookback"
                        type="number"
                        value={lookback}
                        onChange={(e) => setLookback(e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="stopDaily" className="text-slate-300">Stop Diário (USD)</Label>
                      <Input
                        id="stopDaily"
                        type="number"
                        step="0.01"
                        value={stopDaily}
                        onChange={(e) => setStopDaily(e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="takeDaily" className="text-slate-300">Take Diário (USD)</Label>
                      <Input
                        id="takeDaily"
                        type="number"
                        step="0.01"
                        value={takeDaily}
                        onChange={(e) => setTakeDaily(e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="triggerOffset" className="text-slate-300">Trigger Offset (Pips)</Label>
                      <Input
                        id="triggerOffset"
                        type="number"
                        value={triggerOffset}
                        onChange={(e) => setTriggerOffset(e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timeframe" className="text-slate-300">Timeframe</Label>
                      <Select value={timeframe} onValueChange={setTimeframe}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="900">M15 (15 minutos)</SelectItem>
                          <SelectItem value="1800">M30 (30 minutos)</SelectItem>
                          <SelectItem value="3600">M60 (1 hora)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Configurações Avançadas DERIV em Accordion */}
              <Accordion type="single" collapsible className="space-y-4">
                <AccordionItem value="advanced" className="bg-slate-900/50 border-slate-800 rounded-lg">
                  <AccordionTrigger className="px-6 text-white hover:no-underline">
                    Configurações Avançadas DERIV
                  </AccordionTrigger>
                  <AccordionContent className="px-6 pb-6 space-y-4">
                    <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <div>
                        <Label className="text-slate-300">IA Hedge Inteligente</Label>
                        <p className="text-xs text-slate-500">Sistema de proteção com hedge automático</p>
                      </div>
                      <Switch checked={hedgeEnabled} onCheckedChange={setHedgeEnabled} />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <div>
                        <Label className="text-slate-300">Re-predição (M30/M60)</Label>
                        <p className="text-xs text-slate-500">Nova predição se gatilho não for acionado</p>
                      </div>
                      <Switch checked={repredictionEnabled} onCheckedChange={setRepredictionEnabled} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-300">Tipo de Contrato</Label>
                      <Select value={contractType} onValueChange={(v) => setContractType(v as any)}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="RISE_FALL">Rise/Fall</SelectItem>
                          <SelectItem value="TOUCH">Touch</SelectItem>
                          <SelectItem value="NO_TOUCH">No Touch</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </>
          ) : (
            <>
              {/* ============= CONFIGURAÇÕES IC MARKETS ============= */}
              
              {/* CREDENCIAIS cTrader - Sempre visível */}
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white">Credenciais cTrader (IC Markets)</CardTitle>
                  <CardDescription className="text-slate-400">
                    Configure suas credenciais de acesso à API cTrader
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label className="text-slate-300">Client ID</Label>
                      <Input 
                        value={icClientId} 
                        onChange={e => setIcClientId(e.target.value)} 
                        className="bg-slate-800 border-slate-700 text-white" 
                        type="password" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-300">Client Secret</Label>
                      <Input 
                        value={icClientSecret} 
                        onChange={e => setIcClientSecret(e.target.value)} 
                        className="bg-slate-800 border-slate-700 text-white" 
                        type="password" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-300">Access Token</Label>
                      <Input 
                        value={icAccessToken} 
                        onChange={e => setIcAccessToken(e.target.value)} 
                        className="bg-slate-800 border-slate-700 text-white" 
                        type="password" 
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Label className="text-slate-300">Modo Demo</Label>
                      <input 
                        type="checkbox" 
                        checked={icIsDemo} 
                        onChange={e => setIcIsDemo(e.target.checked)} 
                        className="rounded"
                      />
                    </div>
                  </div>
                  <div className="pt-4">
                    <Button 
                      onClick={handleTestICMarketsConnection} 
                      className="bg-green-600 hover:bg-green-500 w-full"
                      disabled={isTesting}
                    >
                      {isTesting ? "Testando..." : "Testar Conexão"}
                    </Button>
                    {icConnectionStatus && (
                      <p className={`mt-2 text-sm ${icConnectionStatus.connected ? 'text-green-400' : 'text-red-400'}`}>
                        {icConnectionStatus.connected 
                          ? `✓ Conectado - Saldo: ${icConnectionStatus.currency} ${icConnectionStatus.balance?.toFixed(2)}`
                          : '✗ Não conectado'
                        }
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* ============= MASTER SWITCH - MODO DE OPERAÇÃO ============= */}
              {/* Este é o "Chefe" da tela - aparece logo após as credenciais */}
              <OperationModeSelector
                selectedMode={operationMode}
                onModeChange={setOperationMode}
              />

              {/* ============= RENDERIZAÇÃO CONDICIONAL BASEADA NO MODO ============= */}
              
              {/* MODO HÍBRIDO: Mostra Gestão Global + Abas (SMC | RSI) */}
              {operationMode === "HYBRID" && (
                <>
                  {/* Gestão de Exposição Global */}
                  <GlobalExposureSettings
                    maxTotalExposurePercent={maxTotalExposurePercent}
                    setMaxTotalExposurePercent={setMaxTotalExposurePercent}
                    maxTradesPerSymbol={maxTradesPerSymbol}
                    setMaxTradesPerSymbol={setMaxTradesPerSymbol}
                  />
                  
                  {/* Abas para SMC e RSI */}
                  <Tabs defaultValue="smc" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-slate-800">
                      <TabsTrigger value="smc" className="data-[state=active]:bg-blue-600">
                        <TrendingUp className="w-4 h-4 mr-2" />
                        Estratégia SMC
                      </TabsTrigger>
                      <TabsTrigger value="rsi" className="data-[state=active]:bg-orange-600">
                        <Activity className="w-4 h-4 mr-2" />
                        Estratégia RSI+VWAP
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="smc" className="mt-4">
                      <SMCStrategySettingsClean
                        structureTimeframe={smcStructureTimeframe}
                        setStructureTimeframe={setSmcStructureTimeframe}
                        activeSymbols={smcActiveSymbols}
                        setActiveSymbols={setSmcActiveSymbols}
                        swingH1Lookback={smcSwingH1Lookback}
                        setSwingH1Lookback={setSmcSwingH1Lookback}
                        fractalLeftBars={smcFractalLeftBars}
                        setFractalLeftBars={setSmcFractalLeftBars}
                        fractalRightBars={smcFractalRightBars}
                        setFractalRightBars={setSmcFractalRightBars}
                        sweepBufferPips={smcSweepBufferPips}
                        setSweepBufferPips={setSmcSweepBufferPips}
                        sweepValidationMinutes={smcSweepValidationMinutes}
                        setSweepValidationMinutes={setSmcSweepValidationMinutes}
                        chochM15Lookback={smcChochM15Lookback}
                        setChochM15Lookback={setSmcChochM15Lookback}
                        chochMinPips={smcChochMinPips}
                        setChochMinPips={setSmcChochMinPips}
                        orderBlockLookback={smcOrderBlockLookback}
                        setOrderBlockLookback={setSmcOrderBlockLookback}
                        orderBlockExtensionPips={smcOrderBlockExtensionPips}
                        setOrderBlockExtensionPips={setSmcOrderBlockExtensionPips}
                        entryConfirmationType={smcEntryConfirmationType}
                        setEntryConfirmationType={setSmcEntryConfirmationType}
                        rejectionWickPercent={smcRejectionWickPercent}
                        setRejectionWickPercent={setSmcRejectionWickPercent}
                        spreadFilterEnabled={smcSpreadFilterEnabled}
                        setSpreadFilterEnabled={setSmcSpreadFilterEnabled}
                        maxSpreadPips={smcMaxSpreadPips}
                        setMaxSpreadPips={setSmcMaxSpreadPips}
                        riskPercentage={smcRiskPercentage}
                        setRiskPercentage={setSmcRiskPercentage}
                        maxOpenTrades={smcMaxOpenTrades}
                        setMaxOpenTrades={setSmcMaxOpenTrades}
                        dailyLossLimitPercent={smcDailyLossLimitPercent}
                        setDailyLossLimitPercent={setSmcDailyLossLimitPercent}
                        stopLossBufferPips={smcStopLossBufferPips}
                        setStopLossBufferPips={setSmcStopLossBufferPips}
                        rewardRiskRatio={smcRewardRiskRatio}
                        setRewardRiskRatio={setSmcRewardRiskRatio}
                        sessionFilterEnabled={smcSessionFilterEnabled}
                        setSessionFilterEnabled={setSmcSessionFilterEnabled}
                        londonSessionStart={smcLondonSessionStart}
                        setLondonSessionStart={setSmcLondonSessionStart}
                        londonSessionEnd={smcLondonSessionEnd}
                        setLondonSessionEnd={setSmcLondonSessionEnd}
                        nySessionStart={smcNySessionStart}
                        setNySessionStart={setSmcNySessionStart}
                        nySessionEnd={smcNySessionEnd}
                        setNySessionEnd={setSmcNySessionEnd}
                        trailingEnabled={smcTrailingEnabled}
                        setTrailingEnabled={setSmcTrailingEnabled}
                        trailingTriggerPips={smcTrailingTriggerPips}
                        setTrailingTriggerPips={setSmcTrailingTriggerPips}
                        trailingStepPips={smcTrailingStepPips}
                        setTrailingStepPips={setSmcTrailingStepPips}
                        circuitBreakerEnabled={smcCircuitBreakerEnabled}
                        setCircuitBreakerEnabled={setSmcCircuitBreakerEnabled}
                        verboseLogging={smcVerboseLogging}
                        setVerboseLogging={setSmcVerboseLogging}
                        institutionalModeEnabled={institutionalModeEnabled}
                        setInstitutionalModeEnabled={setInstitutionalModeEnabled}
                        minGapPips={minGapPips}
                        setMinGapPips={setMinGapPips}
                        asiaSessionStartUtc={asiaSessionStartUtc}
                        setAsiaSessionStartUtc={setAsiaSessionStartUtc}
                        asiaSessionEndUtc={asiaSessionEndUtc}
                        setAsiaSessionEndUtc={setAsiaSessionEndUtc}
                        londonSessionStartUtc={londonSessionStartUtc}
                        setLondonSessionStartUtc={setLondonSessionStartUtc}
                        londonSessionEndUtc={londonSessionEndUtc}
                        setLondonSessionEndUtc={setLondonSessionEndUtc}
                        nySessionStartUtc={nySessionStartUtc}
                        setNySessionStartUtc={setNySessionStartUtc}
                        nySessionEndUtc={nySessionEndUtc}
                        setNySessionEndUtc={setNySessionEndUtc}
                        instWaitFvgMinutes={instWaitFvgMinutes}
                        setInstWaitFvgMinutes={setInstWaitFvgMinutes}
                        instWaitMitigationMinutes={instWaitMitigationMinutes}
                        setInstWaitMitigationMinutes={setInstWaitMitigationMinutes}
                        instWaitEntryMinutes={instWaitEntryMinutes}
                        setInstWaitEntryMinutes={setInstWaitEntryMinutes}
                        instCooldownMinutes={instCooldownMinutes}
                        setInstCooldownMinutes={setInstCooldownMinutes}
                        maxTradesPerSession={maxTradesPerSession}
                        setMaxTradesPerSession={setMaxTradesPerSession}
                      />
                    </TabsContent>
                    <TabsContent value="rsi" className="mt-4">
                      <RsiVwapSettingsClean
                        rsiPeriod={rsiPeriod}
                        setRsiPeriod={setRsiPeriod}
                        rsiOversold={rsiOversold}
                        setRsiOversold={setRsiOversold}
                        rsiOverbought={rsiOverbought}
                        setRsiOverbought={setRsiOverbought}
                        vwapEnabled={vwapEnabled}
                        setVwapEnabled={setVwapEnabled}
                        riskPercentage={rsiRiskPercentage}
                        setRiskPercentage={setRsiRiskPercentage}
                        stopLossPips={rsiStopLossPips}
                        setStopLossPips={setRsiStopLossPips}
                        takeProfitPips={rsiTakeProfitPips}
                        setTakeProfitPips={setRsiTakeProfitPips}
                        rewardRiskRatio={rsiRewardRiskRatio}
                        setRewardRiskRatio={setRsiRewardRiskRatio}
                        minCandleBodyPercent={rsiMinCandleBodyPercent}
                        setMinCandleBodyPercent={setRsiMinCandleBodyPercent}
                        spreadFilterEnabled={rsiSpreadFilterEnabled}
                        setSpreadFilterEnabled={setRsiSpreadFilterEnabled}
                        maxSpreadPips={rsiMaxSpreadPips}
                        setMaxSpreadPips={setRsiMaxSpreadPips}
                        sessionFilterEnabled={rsiSessionFilterEnabled}
                        setSessionFilterEnabled={setRsiSessionFilterEnabled}
                        sessionStart={rsiSessionStart}
                        setSessionStart={setRsiSessionStart}
                        sessionEnd={rsiSessionEnd}
                        setSessionEnd={setRsiSessionEnd}
                        trailingEnabled={rsiTrailingEnabled}
                        setTrailingEnabled={setRsiTrailingEnabled}
                        trailingTriggerPips={rsiTrailingTriggerPips}
                        setTrailingTriggerPips={setRsiTrailingTriggerPips}
                        trailingStepPips={rsiTrailingStepPips}
                        setTrailingStepPips={setRsiTrailingStepPips}
                        verboseLogging={rsiVerboseLogging}
                        setVerboseLogging={setRsiVerboseLogging}
                      />
                    </TabsContent>
                  </Tabs>
                </>
              )}

              {/* MODO SMC_ONLY: Mostra apenas painel SMC */}
              {operationMode === "SMC_ONLY" && (
                <SMCStrategySettingsClean
                  structureTimeframe={smcStructureTimeframe}
                  setStructureTimeframe={setSmcStructureTimeframe}
                  activeSymbols={smcActiveSymbols}
                  setActiveSymbols={setSmcActiveSymbols}
                  swingH1Lookback={smcSwingH1Lookback}
                  setSwingH1Lookback={setSmcSwingH1Lookback}
                  fractalLeftBars={smcFractalLeftBars}
                  setFractalLeftBars={setSmcFractalLeftBars}
                  fractalRightBars={smcFractalRightBars}
                  setFractalRightBars={setSmcFractalRightBars}
                  sweepBufferPips={smcSweepBufferPips}
                  setSweepBufferPips={setSmcSweepBufferPips}
                  sweepValidationMinutes={smcSweepValidationMinutes}
                  setSweepValidationMinutes={setSmcSweepValidationMinutes}
                  chochM15Lookback={smcChochM15Lookback}
                  setChochM15Lookback={setSmcChochM15Lookback}
                  chochMinPips={smcChochMinPips}
                  setChochMinPips={setSmcChochMinPips}
                  orderBlockLookback={smcOrderBlockLookback}
                  setOrderBlockLookback={setSmcOrderBlockLookback}
                  orderBlockExtensionPips={smcOrderBlockExtensionPips}
                  setOrderBlockExtensionPips={setSmcOrderBlockExtensionPips}
                  entryConfirmationType={smcEntryConfirmationType}
                  setEntryConfirmationType={setSmcEntryConfirmationType}
                  rejectionWickPercent={smcRejectionWickPercent}
                  setRejectionWickPercent={setSmcRejectionWickPercent}
                  spreadFilterEnabled={smcSpreadFilterEnabled}
                  setSpreadFilterEnabled={setSmcSpreadFilterEnabled}
                  maxSpreadPips={smcMaxSpreadPips}
                  setMaxSpreadPips={setSmcMaxSpreadPips}
                  riskPercentage={smcRiskPercentage}
                  setRiskPercentage={setSmcRiskPercentage}
                  maxOpenTrades={smcMaxOpenTrades}
                  setMaxOpenTrades={setSmcMaxOpenTrades}
                  dailyLossLimitPercent={smcDailyLossLimitPercent}
                  setDailyLossLimitPercent={setSmcDailyLossLimitPercent}
                  stopLossBufferPips={smcStopLossBufferPips}
                  setStopLossBufferPips={setSmcStopLossBufferPips}
                  rewardRiskRatio={smcRewardRiskRatio}
                  setRewardRiskRatio={setSmcRewardRiskRatio}
                  sessionFilterEnabled={smcSessionFilterEnabled}
                  setSessionFilterEnabled={setSmcSessionFilterEnabled}
                  londonSessionStart={smcLondonSessionStart}
                  setLondonSessionStart={setSmcLondonSessionStart}
                  londonSessionEnd={smcLondonSessionEnd}
                  setLondonSessionEnd={setSmcLondonSessionEnd}
                  nySessionStart={smcNySessionStart}
                  setNySessionStart={setSmcNySessionStart}
                  nySessionEnd={smcNySessionEnd}
                  setNySessionEnd={setSmcNySessionEnd}
                  trailingEnabled={smcTrailingEnabled}
                  setTrailingEnabled={setSmcTrailingEnabled}
                  trailingTriggerPips={smcTrailingTriggerPips}
                  setTrailingTriggerPips={setSmcTrailingTriggerPips}
                  trailingStepPips={smcTrailingStepPips}
                  setTrailingStepPips={setSmcTrailingStepPips}
                  circuitBreakerEnabled={smcCircuitBreakerEnabled}
                  setCircuitBreakerEnabled={setSmcCircuitBreakerEnabled}
                  verboseLogging={smcVerboseLogging}
                  setVerboseLogging={setSmcVerboseLogging}
                  institutionalModeEnabled={institutionalModeEnabled}
                  setInstitutionalModeEnabled={setInstitutionalModeEnabled}
                  minGapPips={minGapPips}
                  setMinGapPips={setMinGapPips}
                  asiaSessionStartUtc={asiaSessionStartUtc}
                  setAsiaSessionStartUtc={setAsiaSessionStartUtc}
                  asiaSessionEndUtc={asiaSessionEndUtc}
                  setAsiaSessionEndUtc={setAsiaSessionEndUtc}
                  londonSessionStartUtc={londonSessionStartUtc}
                  setLondonSessionStartUtc={setLondonSessionStartUtc}
                  londonSessionEndUtc={londonSessionEndUtc}
                  setLondonSessionEndUtc={setLondonSessionEndUtc}
                  nySessionStartUtc={nySessionStartUtc}
                  setNySessionStartUtc={setNySessionStartUtc}
                  nySessionEndUtc={nySessionEndUtc}
                  setNySessionEndUtc={setNySessionEndUtc}
                  instWaitFvgMinutes={instWaitFvgMinutes}
                  setInstWaitFvgMinutes={setInstWaitFvgMinutes}
                  instWaitMitigationMinutes={instWaitMitigationMinutes}
                  setInstWaitMitigationMinutes={setInstWaitMitigationMinutes}
                  instWaitEntryMinutes={instWaitEntryMinutes}
                  setInstWaitEntryMinutes={setInstWaitEntryMinutes}
                  instCooldownMinutes={instCooldownMinutes}
                  setInstCooldownMinutes={setInstCooldownMinutes}
                  maxTradesPerSession={maxTradesPerSession}
                  setMaxTradesPerSession={setMaxTradesPerSession}
                />
              )}

              {/* MODO RSI_VWAP_ONLY: Mostra apenas painel RSI */}
              {operationMode === "RSI_VWAP_ONLY" && (
                <RsiVwapSettingsClean
                  activeSymbols={rsiActiveSymbols}
                  setActiveSymbols={setRsiActiveSymbols}
                  h1CandleCount={rsiH1CandleCount}
                  setH1CandleCount={setRsiH1CandleCount}
                  m15CandleCount={rsiM15CandleCount}
                  setM15CandleCount={setRsiM15CandleCount}
                  m5CandleCount={rsiM5CandleCount}
                  setM5CandleCount={setRsiM5CandleCount}
                  rsiPeriod={rsiPeriod}
                  setRsiPeriod={setRsiPeriod}
                  rsiOversold={rsiOversold}
                  setRsiOversold={setRsiOversold}
                  rsiOverbought={rsiOverbought}
                  setRsiOverbought={setRsiOverbought}
                  vwapEnabled={vwapEnabled}
                  setVwapEnabled={setVwapEnabled}
                  riskPercentage={rsiRiskPercentage}
                  setRiskPercentage={setRsiRiskPercentage}
                  stopLossPips={rsiStopLossPips}
                  setStopLossPips={setRsiStopLossPips}
                  takeProfitPips={rsiTakeProfitPips}
                  setTakeProfitPips={setRsiTakeProfitPips}
                  rewardRiskRatio={rsiRewardRiskRatio}
                  setRewardRiskRatio={setRsiRewardRiskRatio}
                  minCandleBodyPercent={rsiMinCandleBodyPercent}
                  setMinCandleBodyPercent={setRsiMinCandleBodyPercent}
                  spreadFilterEnabled={rsiSpreadFilterEnabled}
                  setSpreadFilterEnabled={setRsiSpreadFilterEnabled}
                  maxSpreadPips={rsiMaxSpreadPips}
                  setMaxSpreadPips={setRsiMaxSpreadPips}
                  sessionFilterEnabled={rsiSessionFilterEnabled}
                  setSessionFilterEnabled={setRsiSessionFilterEnabled}
                  sessionStart={rsiSessionStart}
                  setSessionStart={setRsiSessionStart}
                  sessionEnd={rsiSessionEnd}
                  setSessionEnd={setRsiSessionEnd}
                  trailingEnabled={rsiTrailingEnabled}
                  setTrailingEnabled={setRsiTrailingEnabled}
                  trailingTriggerPips={rsiTrailingTriggerPips}
                  setTrailingTriggerPips={setRsiTrailingTriggerPips}
                  trailingStepPips={rsiTrailingStepPips}
                  setTrailingStepPips={setRsiTrailingStepPips}
                  verboseLogging={rsiVerboseLogging}
                  setVerboseLogging={setRsiVerboseLogging}
                />
              )}

              {/* MODO ORB_ONLY: Mostra apenas painel ORB Trend */}
              {operationMode === "ORB_ONLY" && (
                <ORBSettings
                  activeSymbols={orbActiveSymbols}
                  setActiveSymbols={setOrbActiveSymbols}
                  openingCandles={orbOpeningCandles}
                  setOpeningCandles={setOrbOpeningCandles}
                  emaPeriod={orbEmaPeriod}
                  setEmaPeriod={setOrbEmaPeriod}
                  slopeLookbackCandles={orbSlopeLookbackCandles}
                  setSlopeLookbackCandles={setOrbSlopeLookbackCandles}
                  minSlope={orbMinSlope}
                  setMinSlope={setOrbMinSlope}
                  stopType={orbStopType}
                  setStopType={setOrbStopType}
                  atrMult={orbAtrMult}
                  setAtrMult={setOrbAtrMult}
                  atrPeriod={orbAtrPeriod}
                  setAtrPeriod={setOrbAtrPeriod}
                  riskReward={orbRiskReward}
                  setRiskReward={setOrbRiskReward}
                  maxTradesPerDayPerSymbol={orbMaxTradesPerDayPerSymbol}
                  setMaxTradesPerDayPerSymbol={setOrbMaxTradesPerDayPerSymbol}
                  riskPercentage={orbRiskPercentage}
                  setRiskPercentage={setOrbRiskPercentage}
                  maxOpenTrades={orbMaxOpenTrades}
                  setMaxOpenTrades={setOrbMaxOpenTrades}
                  maxSpreadPips={orbMaxSpreadPips}
                  setMaxSpreadPips={setOrbMaxSpreadPips}
                />
              )}
            </>
          )}

          {/* ============= BOTÃO SALVAR (ÚNICO E CENTRALIZADO) ============= */}
          <div className="flex justify-end pt-4">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              size="lg"
              className={`gap-2 px-8 ${
                isDeriv 
                  ? "bg-red-600 hover:bg-red-700" 
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isSaving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              Salvar Todas as Configurações
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
