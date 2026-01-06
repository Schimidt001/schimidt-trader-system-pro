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
import { trpc } from "@/lib/trpc";
import { DERIV_SYMBOLS } from "@/const";
import { Loader2, Save, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BotSelector, useBotSelector } from "@/components/BotSelector";
import { useBroker, BrokerType } from "@/contexts/BrokerContext";
import { BrokerIndicator } from "@/components/BrokerSwitch";
import { DerivSettings } from "@/components/settings/DerivSettings";
import { ICMarketsSettings } from "@/components/settings/ICMarketsSettings";
import { SMCStrategySettings } from "@/components/settings/SMCStrategySettings";
import { ICMARKETS_DEFAULTS } from "@/const/icmarkets";

export default function SettingsMultiBroker() {
  const { user, loading: authLoading } = useAuth();
  const { selectedBot, setSelectedBot } = useBotSelector();
  const { broker, isDeriv, isICMarkets, currentConfig } = useBroker();
  
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
  // Filtro de Horário
  const [hourlyFilterEnabled, setHourlyFilterEnabled] = useState(false);
  const [hourlyFilterCustomHours, setHourlyFilterCustomHours] = useState<number[]>([]);
  const [hourlyFilterGoldHours, setHourlyFilterGoldHours] = useState<number[]>([]);
  const [hourlyFilterGoldMultiplier, setHourlyFilterGoldMultiplier] = useState("200");
  
  // Market Condition Detector
  const [marketConditionEnabled, setMarketConditionEnabled] = useState(false);
  
  // Payout Mínimo
  const [payoutCheckEnabled, setPayoutCheckEnabled] = useState(true);
  const [minPayoutPercent, setMinPayoutPercent] = useState("80");
  const [payoutRecheckDelay, setPayoutRecheckDelay] = useState("300");
  
  // DojiGuard (Filtro Anti-Doji)
  const [antiDojiEnabled, setAntiDojiEnabled] = useState(false);
  const [antiDojiRangeMin, setAntiDojiRangeMin] = useState("0.0500");
  const [antiDojiRatioMin, setAntiDojiRatioMin] = useState("18");
  
  // ExhaustionGuard (Filtro de Exaustão)
  const [exhaustionGuardEnabled, setExhaustionGuardEnabled] = useState(false);
  const [exhaustionRatioMax, setExhaustionRatioMax] = useState("70");
  const [exhaustionPositionMin, setExhaustionPositionMin] = useState("85");
  const [exhaustionRangeLookback, setExhaustionRangeLookback] = useState("10");
  const [exhaustionRangeMultiplier, setExhaustionRangeMultiplier] = useState("1.5");
  const [exhaustionGuardLogEnabled, setExhaustionGuardLogEnabled] = useState(true);
  
  // TTLFilter (Time-To-Live Filter)
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
  
  // Configurações de Trading IC Markets
  const [icSymbol, setIcSymbol] = useState("EURUSD");
  const [icLots, setIcLots] = useState(ICMARKETS_DEFAULTS.defaultLots.toString());
  const [icLeverage, setIcLeverage] = useState(ICMARKETS_DEFAULTS.defaultLeverage.toString());
  const [icTimeframe, setIcTimeframe] = useState(ICMARKETS_DEFAULTS.defaultTimeframe);
  const [icStopLossPips, setIcStopLossPips] = useState(ICMARKETS_DEFAULTS.defaultStopLossPips.toString());
  const [icTakeProfitPips, setIcTakeProfitPips] = useState(ICMARKETS_DEFAULTS.defaultTakeProfitPips.toString());
  
  // Trailing Stop IC Markets
  const [icTrailingEnabled, setIcTrailingEnabled] = useState(true);
  const [icTrailingTriggerPips, setIcTrailingTriggerPips] = useState(ICMARKETS_DEFAULTS.trailingTriggerPips.toString());
  const [icTrailingStepPips, setIcTrailingStepPips] = useState(ICMARKETS_DEFAULTS.trailingStepPips.toString());
  
  // ============= ESTADOS SMC STRATEGY =============
  // Tipo de estratégia
  const [smcStrategyType, setSmcStrategyType] = useState("SMC_SWARM");
  
  // Timeframe de Estrutura (Swing Points) - NOVO
  const [smcStructureTimeframe, setSmcStructureTimeframe] = useState("H1");
  
  // Símbolos ativos (Swarm)
  const [smcActiveSymbols, setSmcActiveSymbols] = useState<string[]>(["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"]);
  
  // Parâmetros de estrutura H1
  const [smcSwingH1Lookback, setSmcSwingH1Lookback] = useState("50");
  const [smcFractalLeftBars, setSmcFractalLeftBars] = useState("2");
  const [smcFractalRightBars, setSmcFractalRightBars] = useState("2");
  
  // Parâmetros de Sweep
  const [smcSweepBufferPips, setSmcSweepBufferPips] = useState("2");
  const [smcSweepValidationMinutes, setSmcSweepValidationMinutes] = useState("60");
  
  // Parâmetros de CHoCH
  const [smcChochM15Lookback, setSmcChochM15Lookback] = useState("20");
  const [smcChochMinPips, setSmcChochMinPips] = useState("10");
  
  // Parâmetros de Order Block
  const [smcOrderBlockLookback, setSmcOrderBlockLookback] = useState("10");
  const [smcOrderBlockExtensionPips, setSmcOrderBlockExtensionPips] = useState("15");
  
  // Parâmetros de entrada
  const [smcEntryConfirmationType, setSmcEntryConfirmationType] = useState("ANY");
  const [smcRejectionWickPercent, setSmcRejectionWickPercent] = useState("60");
  
  // Gestão de risco SMC
  const [smcRiskPercentage, setSmcRiskPercentage] = useState("0.75");
  const [smcMaxOpenTrades, setSmcMaxOpenTrades] = useState("3");
  const [smcDailyLossLimitPercent, setSmcDailyLossLimitPercent] = useState("3");
  const [smcStopLossBufferPips, setSmcStopLossBufferPips] = useState("2");
  const [smcRewardRiskRatio, setSmcRewardRiskRatio] = useState("4");
  
  // Sessões de trading SMC
  const [smcSessionFilterEnabled, setSmcSessionFilterEnabled] = useState(true);
  const [smcLondonSessionStart, setSmcLondonSessionStart] = useState("04:00");
  const [smcLondonSessionEnd, setSmcLondonSessionEnd] = useState("07:00");
  const [smcNySessionStart, setSmcNySessionStart] = useState("09:30");
  const [smcNySessionEnd, setSmcNySessionEnd] = useState("12:30");
  
  // Trailing Stop SMC
  const [smcTrailingEnabled, setSmcTrailingEnabled] = useState(true);
  const [smcTrailingTriggerPips, setSmcTrailingTriggerPips] = useState("20");
  const [smcTrailingStepPips, setSmcTrailingStepPips] = useState("10");
  
  // Circuit Breaker SMC
  const [smcCircuitBreakerEnabled, setSmcCircuitBreakerEnabled] = useState(true);
  
  // Logging SMC
  const [smcVerboseLogging, setSmcVerboseLogging] = useState(false);

  // ============= QUERIES =============
  const { data: config, isLoading } = trpc.config.get.useQuery(
    { botId: selectedBot },
    { enabled: !!user }
  );

  const { data: botStatus } = trpc.bot.status.useQuery(
    { botId: selectedBot },
    { enabled: !!user, refetchInterval: false }
  );

  // Query para carregar configurações IC Markets
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

  // Mutation para salvar configurações IC Markets
  const saveICMarketsConfig = trpc.icmarkets.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Configurações IC Markets salvas com sucesso");
      setIsSaving(false);
    },
    onError: (error) => {
      toast.error(`Erro ao salvar configurações IC Markets: ${error.message}`);
      setIsSaving(false);
    },
  });

  // Mutation para testar conexão IC Markets
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
      
      // Carregar Filtros Avançados DERIV
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
      
      // Market Condition Detector
      setMarketConditionEnabled(config.marketConditionEnabled ?? false);
      
      // Payout Mínimo
      setPayoutCheckEnabled(config.payoutCheckEnabled ?? true);
      setMinPayoutPercent((config.minPayoutPercent || 80).toString());
      setPayoutRecheckDelay((config.payoutRecheckDelay || 300).toString());
      
      // DojiGuard
      setAntiDojiEnabled(config.antiDojiEnabled ?? false);
      setAntiDojiRangeMin(config.antiDojiRangeMin ? config.antiDojiRangeMin.toString() : "0.0500");
      const ratioPercent = config.antiDojiRatioMin ? (parseFloat(config.antiDojiRatioMin.toString()) * 100).toFixed(0) : "18";
      setAntiDojiRatioMin(ratioPercent);
      
      // ExhaustionGuard
      setExhaustionGuardEnabled(config.exhaustionGuardEnabled ?? false);
      const exhaustionRatioPercent = config.exhaustionRatioMax ? (parseFloat(config.exhaustionRatioMax.toString()) * 100).toFixed(0) : "70";
      setExhaustionRatioMax(exhaustionRatioPercent);
      const exhaustionPositionPercent = config.exhaustionPositionMin ? (parseFloat(config.exhaustionPositionMin.toString()) * 100).toFixed(0) : "85";
      setExhaustionPositionMin(exhaustionPositionPercent);
      setExhaustionRangeLookback((config.exhaustionRangeLookback ?? 10).toString());
      setExhaustionRangeMultiplier(config.exhaustionRangeMultiplier ? config.exhaustionRangeMultiplier.toString() : "1.5");
      setExhaustionGuardLogEnabled(config.exhaustionGuardLogEnabled ?? true);
      
      // TTLFilter
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
      
      // ============= CARREGAR CAMPOS SMC =============
      // Tipo de estratégia (CRÍTICO para persistência)
      setSmcStrategyType(icConfig.strategyType || "SMC_SWARM");
      
      // Timeframe de Estrutura (Swing Points) - NOVO
      setSmcStructureTimeframe(icConfig.structureTimeframe || "H1");
      
      // Gestão de Risco SMC
      setSmcRiskPercentage((icConfig.riskPercentage || 0.75).toString());
      setSmcMaxOpenTrades((icConfig.maxOpenTrades || 3).toString());
      setSmcDailyLossLimitPercent((icConfig.dailyLossLimitPercent || 3).toString());
      
      // Ativos do Enxame (Multi-Ativos)
      if (icConfig.activeSymbols) {
        try {
          const symbols = typeof icConfig.activeSymbols === 'string' 
            ? JSON.parse(icConfig.activeSymbols) 
            : icConfig.activeSymbols;
          setSmcActiveSymbols(symbols);
        } catch (e) {
          setSmcActiveSymbols(["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"]);
        }
      }
      
      // Parâmetros de Estrutura H1
      setSmcSwingH1Lookback((icConfig.swingH1Lookback || 50).toString());
      setSmcFractalLeftBars((icConfig.fractalLeftBars || 2).toString());
      setSmcFractalRightBars((icConfig.fractalRightBars || 2).toString());
      
      // Parâmetros de Sweep
      setSmcSweepBufferPips((icConfig.sweepBufferPips || 2).toString());
      setSmcSweepValidationMinutes((icConfig.sweepValidationMinutes || 60).toString());
      
      // Parâmetros de CHoCH
      setSmcChochM15Lookback((icConfig.chochM15Lookback || 20).toString());
      setSmcChochMinPips((icConfig.chochMinPips || 10).toString());
      
      // Parâmetros de Order Block
      setSmcOrderBlockLookback((icConfig.orderBlockLookback || 10).toString());
      setSmcOrderBlockExtensionPips((icConfig.orderBlockExtensionPips || 15).toString());
      
      // Parâmetros de Entrada
      setSmcEntryConfirmationType(icConfig.entryConfirmationType || "ANY");
      setSmcRejectionWickPercent((icConfig.rejectionWickPercent || 60).toString());
      
      // Gestão de Risco Avançada
      setSmcStopLossBufferPips((icConfig.stopLossBufferPips || 2).toString());
      setSmcRewardRiskRatio((icConfig.rewardRiskRatio || 4).toString());
      
      // Sessões de Trading
      setSmcSessionFilterEnabled(icConfig.sessionFilterEnabled ?? true);
      setSmcLondonSessionStart(icConfig.londonSessionStart || "04:00");
      setSmcLondonSessionEnd(icConfig.londonSessionEnd || "07:00");
      setSmcNySessionStart(icConfig.nySessionStart || "09:30");
      setSmcNySessionEnd(icConfig.nySessionEnd || "12:30");
      
      // Trailing Stop SMC
      setSmcTrailingEnabled(icConfig.smcTrailingEnabled ?? true);
      setSmcTrailingTriggerPips((icConfig.smcTrailingTriggerPips || 20).toString());
      setSmcTrailingStepPips((icConfig.smcTrailingStepPips || 10).toString());
      
      // Circuit Breaker e Logging
      setSmcCircuitBreakerEnabled(icConfig.circuitBreakerEnabled ?? true);
      setSmcVerboseLogging(icConfig.verboseLogging ?? false);
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

      // Validações básicas
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

      // VALIDAÇÃO CRÍTICA: Filtro de Horário não pode ter array vazio
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
        // Filtros Avançados DERIV
        hourlyFilterEnabled,
        hourlyFilterMode: "CUSTOM" as const,
        hourlyFilterCustomHours: JSON.stringify(hourlyFilterCustomHours),
        hourlyFilterGoldHours: JSON.stringify(hourlyFilterGoldHours),
        hourlyFilterGoldMultiplier: parseInt(hourlyFilterGoldMultiplier) || 200,
        marketConditionEnabled,
        payoutCheckEnabled,
        minPayoutPercent: parseInt(minPayoutPercent) || 80,
        payoutRecheckDelay: parseInt(payoutRecheckDelay) || 300,
        // DojiGuard
        antiDojiEnabled,
        antiDojiRangeMin: parseFloat(antiDojiRangeMin) || 0.0500,
        antiDojiRatioMin: (parseInt(antiDojiRatioMin) || 18) / 100,
        // ExhaustionGuard
        exhaustionGuardEnabled,
        exhaustionRatioMax: (parseInt(exhaustionRatioMax) || 70) / 100,
        exhaustionPositionMin: (parseInt(exhaustionPositionMin) || 85) / 100,
        exhaustionRangeLookback: parseInt(exhaustionRangeLookback) || 10,
        exhaustionRangeMultiplier: parseFloat(exhaustionRangeMultiplier) || 1.5,
        exhaustionGuardLogEnabled,
        // TTLFilter
        ttlEnabled,
        ttlMinimumSeconds: parseInt(ttlMinimumSeconds) || 180,
        ttlTriggerDelayBuffer: parseInt(ttlTriggerDelayBuffer) || 120,
        ttlLogEnabled,
      });
    } else {
      // Salvar configurações IC Markets + SMC Strategy
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
        // SMC Strategy Config
        strategyType: smcStrategyType,
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
              {/* Configurações DERIV */}
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

              {/* Configurações Avançadas DERIV */}
              <Accordion type="single" collapsible className="space-y-4">
                <AccordionItem value="advanced" className="bg-slate-900/50 border-slate-800 rounded-lg">
                  <AccordionTrigger className="px-6 text-white hover:no-underline">
                    Configurações Avançadas DERIV
                  </AccordionTrigger>
                  <AccordionContent className="px-6 pb-6 space-y-4">
                    {/* IA Hedge */}
                    <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <div>
                        <Label className="text-slate-300">IA Hedge Inteligente</Label>
                        <p className="text-xs text-slate-500">Sistema de proteção com hedge automático</p>
                      </div>
                      <Switch checked={hedgeEnabled} onCheckedChange={setHedgeEnabled} />
                    </div>

                    {/* Re-predição */}
                    <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <div>
                        <Label className="text-slate-300">Re-predição (M30/M60)</Label>
                        <p className="text-xs text-slate-500">Nova predição se gatilho não for acionado</p>
                      </div>
                      <Switch checked={repredictionEnabled} onCheckedChange={setRepredictionEnabled} />
                    </div>

                    {/* Tipo de Contrato */}
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

              {/* ============= FILTROS AVANÇADOS DERIV ============= */}
              
              {/* Filtro de Horário */}
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white">🕒 Filtro de Horário</CardTitle>
                  <CardDescription>Restringe operações a horários específicos para operação (ideal para Forex)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="hourlyFilterEnabled" className="text-slate-300">
                        Ativar Filtro de Horário
                      </Label>
                      <p className="text-xs text-slate-500">
                        Bot opera apenas nos horários permitidos (GMT - padrão Deriv)
                      </p>
                    </div>
                    <Switch
                      id="hourlyFilterEnabled"
                      checked={hourlyFilterEnabled}
                      onCheckedChange={setHourlyFilterEnabled}
                    />
                  </div>
                  {hourlyFilterEnabled && (
                    <div className="space-y-4 pt-4 border-t border-slate-700">
                      {/* Indicador de Horário Atual */}
                      <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3 mb-4">
                        <div className="flex items-center justify-between text-sm">
                          <div>
                            <span className="text-slate-400">Horário GMT Atual:</span>
                            <span className="ml-2 text-blue-400 font-semibold">
                              {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} ({new Date().getUTCHours()}h GMT)
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Seu Horário:</span>
                            <span className="ml-2 text-green-400 font-semibold">
                              {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Grade de Horários */}
                      <div className="space-y-2">
                        <Label className="text-slate-300">
                          Horários Permitidos (GMT)
                        </Label>
                        <p className="text-xs text-slate-500 mb-3">
                          Clique nos horários para permitir/bloquear operações
                        </p>
                        <div className="grid grid-cols-6 gap-2">
                          {Array.from({ length: 24 }, (_, i) => i).map((hour) => {
                            const isSelected = hourlyFilterCustomHours.includes(hour);
                            const isGold = hourlyFilterGoldHours.includes(hour);
                            return (
                              <button
                                key={hour}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    const newHours = hourlyFilterCustomHours.filter(h => h !== hour);
                                    setHourlyFilterCustomHours(newHours);
                                    setHourlyFilterGoldHours(hourlyFilterGoldHours.filter(h => h !== hour));
                                  } else {
                                    const newHours = [...hourlyFilterCustomHours, hour].sort((a, b) => a - b);
                                    setHourlyFilterCustomHours(newHours);
                                  }
                                }}
                                className={`
                                  px-3 py-2 rounded-lg font-semibold text-sm transition-all
                                  ${isGold 
                                    ? 'bg-yellow-500 text-black hover:bg-yellow-400 ring-2 ring-yellow-300' 
                                    : isSelected 
                                      ? 'bg-green-600 text-white hover:bg-green-500' 
                                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                  }
                                `}
                              >
                                {isGold && '⭐ '}{hour}h
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-xs text-slate-400 mt-2">
                          {hourlyFilterCustomHours.length} horário(s) selecionado(s)
                        </p>
                      </div>
                      {/* Horários GOLD */}
                      <div className="space-y-2 pt-4 border-t border-slate-700">
                        <Label className="text-slate-300">
                          ⭐ Horários GOLD (opcional)
                        </Label>
                        <p className="text-xs text-slate-500 mb-3">
                          Clique em um horário permitido para marcá-lo como GOLD (stake multiplicado)
                        </p>
                        <div className="grid grid-cols-6 gap-2">
                          {hourlyFilterCustomHours.map((hour) => {
                            const isGold = hourlyFilterGoldHours.includes(hour);
                            return (
                              <button
                                key={hour}
                                type="button"
                                onClick={() => {
                                  if (isGold) {
                                    setHourlyFilterGoldHours(hourlyFilterGoldHours.filter(h => h !== hour));
                                  } else {
                                    if (hourlyFilterGoldHours.length < 2) {
                                      setHourlyFilterGoldHours([...hourlyFilterGoldHours, hour].sort((a, b) => a - b));
                                    }
                                  }
                                }}
                                className={`
                                  px-3 py-2 rounded-lg font-semibold text-sm transition-all
                                  ${isGold 
                                    ? 'bg-yellow-500 text-black hover:bg-yellow-400 ring-2 ring-yellow-300' 
                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                  }
                                `}
                              >
                                {isGold && '⭐ '}{hour}h
                              </button>
                            );
                          })}
                        </div>
                        {hourlyFilterGoldHours.length > 0 && (
                          <p className="text-xs text-yellow-400 mt-2">
                            {hourlyFilterGoldHours.length} horário(s) GOLD selecionado(s)
                          </p>
                        )}
                      </div>
                      {/* Multiplicador GOLD */}
                      {hourlyFilterGoldHours.length > 0 && (
                        <div className="space-y-2 pt-4 border-t border-slate-700">
                          <Label htmlFor="hourlyFilterGoldMultiplier" className="text-slate-300">
                            Multiplicador de Stake GOLD
                          </Label>
                          <div className="flex items-center gap-4">
                            <Input
                              id="hourlyFilterGoldMultiplier"
                              type="number"
                              value={hourlyFilterGoldMultiplier}
                              onChange={(e) => setHourlyFilterGoldMultiplier(e.target.value)}
                              className="bg-slate-800 border-slate-700 text-white"
                              min="100"
                              step="50"
                            />
                            <span className="text-yellow-400 font-semibold">
                              {parseInt(hourlyFilterGoldMultiplier) / 100}x
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">
                            Stake será multiplicado nos horários GOLD (100 = 1x, 200 = 2x, 300 = 3x)
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Market Condition Detector */}
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white">🌐 Market Condition Detector</CardTitle>
                  <CardDescription>Analisa condições de mercado e bloqueia operações em momentos de alto risco</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="marketConditionEnabled" className="text-slate-300">
                        Ativar Market Condition Detector
                      </Label>
                      <p className="text-xs text-slate-500">
                        Analisa volatilidade, notícias e condições técnicas antes de operar
                      </p>
                    </div>
                    <Switch
                      id="marketConditionEnabled"
                      checked={marketConditionEnabled}
                      onCheckedChange={setMarketConditionEnabled}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Payout Mínimo */}
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-slate-100">💰 Payout Mínimo</CardTitle>
                  <CardDescription>Verifica se o payout oferecido pela Deriv atinge o mínimo aceitável</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="payoutCheckEnabled" className="text-slate-300">
                        Ativar Verificação de Payout
                      </Label>
                      <p className="text-xs text-slate-500">
                        Bot verifica payout antes de fazer predição
                      </p>
                    </div>
                    <Switch
                      id="payoutCheckEnabled"
                      checked={payoutCheckEnabled}
                      onCheckedChange={setPayoutCheckEnabled}
                    />
                  </div>
                  {payoutCheckEnabled && (
                    <div className="space-y-4 pt-4 border-t border-slate-700">
                      <div className="space-y-2">
                        <Label htmlFor="minPayoutPercent" className="text-slate-300">
                          Payout Mínimo Aceitável (%)
                        </Label>
                        <Input
                          id="minPayoutPercent"
                          type="number"
                          value={minPayoutPercent}
                          onChange={(e) => setMinPayoutPercent(e.target.value)}
                          placeholder="80"
                          className="bg-slate-800 border-slate-700 text-white"
                        />
                        <p className="text-xs text-slate-500">
                          Exemplo: 80 = 80%. Se payout for menor, aguarda e tenta novamente
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="payoutRecheckDelay" className="text-slate-300">
                          Tempo de Espera para Retry (segundos)
                        </Label>
                        <Input
                          id="payoutRecheckDelay"
                          type="number"
                          value={payoutRecheckDelay}
                          onChange={(e) => setPayoutRecheckDelay(e.target.value)}
                          placeholder="300"
                          className="bg-slate-800 border-slate-700 text-white"
                        />
                        <p className="text-xs text-slate-500">
                          Tempo de espera antes de verificar payout novamente (padrão: 300s = 5 min)
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* DojiGuard (Filtro Anti-Doji) */}
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-slate-100">🛡️ Filtro Anti-Doji (DojiGuard)</CardTitle>
                  <CardDescription>Bloqueia entrada em candles com alta probabilidade de indecisão (doji)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="antiDojiEnabled" className="text-slate-300">
                        Ativar Filtro Anti-Doji
                      </Label>
                      <p className="text-xs text-slate-500">
                        Bot verifica se o candle tem características de doji antes de armar entrada
                      </p>
                    </div>
                    <Switch
                      id="antiDojiEnabled"
                      checked={antiDojiEnabled}
                      onCheckedChange={setAntiDojiEnabled}
                    />
                  </div>
                  {antiDojiEnabled && (
                    <div className="space-y-4 pt-4 border-t border-slate-700">
                      <div className="space-y-2">
                        <Label htmlFor="antiDojiRangeMin" className="text-slate-300">
                          Range Mínimo Aceitável (pips)
                        </Label>
                        <Input
                          id="antiDojiRangeMin"
                          type="number"
                          step="0.0001"
                          value={antiDojiRangeMin}
                          onChange={(e) => setAntiDojiRangeMin(e.target.value)}
                          placeholder="0.0500"
                          className="bg-slate-800 border-slate-700 text-white"
                        />
                        <p className="text-xs text-slate-500">
                          Exemplo: 0.0500 = 50 pips. Candles com range menor que isso são bloqueados (volatilidade insuficiente)
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="antiDojiRatioMin" className="text-slate-300">
                          Proporção Mínima Body/Range (%)
                        </Label>
                        <Input
                          id="antiDojiRatioMin"
                          type="number"
                          value={antiDojiRatioMin}
                          onChange={(e) => setAntiDojiRatioMin(e.target.value)}
                          placeholder="18"
                          className="bg-slate-800 border-slate-700 text-white"
                        />
                        <p className="text-xs text-slate-500">
                          Exemplo: 18 = 18%. Se o corpo do candle for menor que 18% do range total, é bloqueado (doji)
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ExhaustionGuard (Filtro de Exaustão) */}
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-slate-100">⚡ Filtro de Exaustão (ExhaustionGuard)</CardTitle>
                  <CardDescription>Bloqueia entrada quando o candle apresenta sinais de exaustão excessiva</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="exhaustionGuardEnabled" className="text-slate-300">
                        Ativar Filtro de Exaustão
                      </Label>
                      <p className="text-xs text-slate-500">
                        Bot verifica se o candle apresenta sinais de exaustão excessiva antes de armar entrada
                      </p>
                    </div>
                    <Switch
                      id="exhaustionGuardEnabled"
                      checked={exhaustionGuardEnabled}
                      onCheckedChange={setExhaustionGuardEnabled}
                    />
                  </div>
                  {exhaustionGuardEnabled && (
                    <div className="space-y-4 pt-4 border-t border-slate-700">
                      <div className="space-y-2">
                        <Label htmlFor="exhaustionRatioMax" className="text-slate-300">
                          Limite Máximo de Exaustão (%)
                        </Label>
                        <Input
                          id="exhaustionRatioMax"
                          type="number"
                          value={exhaustionRatioMax}
                          onChange={(e) => setExhaustionRatioMax(e.target.value)}
                          placeholder="70"
                          className="bg-slate-800 border-slate-700 text-white"
                        />
                        <p className="text-xs text-slate-500">
                          Exemplo: 70 = 70%. Se o movimento direcional for maior que 70% do range total
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="exhaustionPositionMin" className="text-slate-300">
                          Limite Mínimo de Posição (%)
                        </Label>
                        <Input
                          id="exhaustionPositionMin"
                          type="number"
                          value={exhaustionPositionMin}
                          onChange={(e) => setExhaustionPositionMin(e.target.value)}
                          placeholder="85"
                          className="bg-slate-800 border-slate-700 text-white"
                        />
                        <p className="text-xs text-slate-500">
                          Exemplo: 85 = 85%. Preço deve estar próximo do extremo do range para bloquear (evita falsos bloqueios)
                        </p>
                      </div>
                      <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-3">
                        <p className="text-xs text-amber-400">
                          ⚠️ <strong>Regra de Bloqueio (ADENDO TÉCNICO):</strong> Bloqueio por exaustão requer AMBOS: ExhaustionRatio &gt;= {exhaustionRatioMax}% <strong>E</strong> PositionRatio &gt;= {exhaustionPositionMin}%
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="exhaustionRangeLookback" className="text-slate-300">
                          Candles para Média de Range (Opcional)
                        </Label>
                        <Input
                          id="exhaustionRangeLookback"
                          type="number"
                          value={exhaustionRangeLookback}
                          onChange={(e) => setExhaustionRangeLookback(e.target.value)}
                          placeholder="10"
                          className="bg-slate-800 border-slate-700 text-white"
                        />
                        <p className="text-xs text-slate-500">
                          Número de candles anteriores para calcular a média de range (critério separado e opcional)
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="exhaustionRangeMultiplier" className="text-slate-300">
                          Multiplicador de Range Anormal
                        </Label>
                        <Input
                          id="exhaustionRangeMultiplier"
                          type="number"
                          step="0.1"
                          value={exhaustionRangeMultiplier}
                          onChange={(e) => setExhaustionRangeMultiplier(e.target.value)}
                          placeholder="1.5"
                          className="bg-slate-800 border-slate-700 text-white"
                        />
                        <p className="text-xs text-slate-500">
                          Exemplo: 1.5 = 1.5x. Se o range atual for 1.5x maior que a média, é bloqueado (volatilidade anormal)
                        </p>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="exhaustionGuardLogEnabled" className="text-slate-300">
                            Log Detalhado
                          </Label>
                          <p className="text-xs text-slate-500">
                            Exibir logs detalhados das verificações de exaustão no console
                          </p>
                        </div>
                        <Switch
                          id="exhaustionGuardLogEnabled"
                          checked={exhaustionGuardLogEnabled}
                          onCheckedChange={setExhaustionGuardLogEnabled}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* TTLFilter (Time-To-Live Filter) */}
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-slate-100">🕒 Filtro TTL (Time-To-Live)</CardTitle>
                  <CardDescription>Bloqueia armamento do gatilho quando não há tempo suficiente dentro da janela operacional (35-45min no M60)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="ttlEnabled" className="text-slate-300">
                        Ativar Filtro TTL
                      </Label>
                      <p className="text-xs text-slate-500">
                        Bot verifica se ainda há tempo suficiente na janela operacional antes de armar o gatilho
                      </p>
                    </div>
                    <Switch
                      id="ttlEnabled"
                      checked={ttlEnabled}
                      onCheckedChange={setTtlEnabled}
                    />
                  </div>
                  {ttlEnabled && (
                    <div className="space-y-4 pt-4 border-t border-slate-700">
                      <div className="bg-purple-900/30 border border-purple-700/50 rounded-lg p-3">
                        <p className="text-sm text-purple-300">
                          📍 <strong>Contexto da Janela Operacional (M60):</strong>
                        </p>
                        <ul className="text-xs text-purple-400 space-y-1 mt-2">
                          <li>• Minuto 0–35: Formação / Análise (NÃO operável)</li>
                          <li>• <strong>Minuto 35–45: Única janela operável (10 minutos)</strong></li>
                          <li>• Minuto 45–60: Proibido pela Deriv</li>
                        </ul>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ttlMinimumSeconds" className="text-slate-300">
                          Tempo Mínimo para Operação (segundos)
                        </Label>
                        <Input
                          id="ttlMinimumSeconds"
                          type="number"
                          value={ttlMinimumSeconds}
                          onChange={(e) => setTtlMinimumSeconds(e.target.value)}
                          placeholder="180"
                          className="bg-slate-800 border-slate-700 text-white"
                        />
                        <p className="text-xs text-slate-500">
                          Tempo mínimo restante dentro da janela operacional (35-45min). Padrão: 180s = 3 minutos
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ttlTriggerDelayBuffer" className="text-slate-300">
                          Buffer de Atraso do Gatilho (segundos)
                        </Label>
                        <Input
                          id="ttlTriggerDelayBuffer"
                          type="number"
                          value={ttlTriggerDelayBuffer}
                          onChange={(e) => setTtlTriggerDelayBuffer(e.target.value)}
                          placeholder="120"
                          className="bg-slate-800 border-slate-700 text-white"
                        />
                        <p className="text-xs text-slate-500">
                          Buffer para possível atraso no cruzamento do gatilho. Padrão: 120s = 2 minutos
                        </p>
                      </div>
                      <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-3">
                        <p className="text-xs text-amber-400">
                          ⚠️ <strong>Tempo Total Exigido:</strong> {parseInt(ttlMinimumSeconds || "180") + parseInt(ttlTriggerDelayBuffer || "120")} segundos ({Math.floor((parseInt(ttlMinimumSeconds || "180") + parseInt(ttlTriggerDelayBuffer || "120")) / 60)} minutos) - compatível com janela de 10 min
                        </p>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="ttlLogEnabled" className="text-slate-300">
                            Log Detalhado
                          </Label>
                          <p className="text-xs text-slate-500">
                            Exibir logs detalhados das verificações de TTL no console
                          </p>
                        </div>
                        <Switch
                          id="ttlLogEnabled"
                          checked={ttlLogEnabled}
                          onCheckedChange={setTtlLogEnabled}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              {/* Configurações IC MARKETS */}
              <ICMarketsSettings
                clientId={icClientId}
                setClientId={setIcClientId}
                clientSecret={icClientSecret}
                setClientSecret={setIcClientSecret}
                accessToken={icAccessToken}
                setAccessToken={setIcAccessToken}
                isDemo={icIsDemo}
                setIsDemo={setIcIsDemo}
                // Novos campos SMC
                strategyType={smcStrategyType as "TREND_SNIPER" | "SMC_SWARM"}
                setStrategyType={(v) => setSmcStrategyType(v)}
                riskPercent={smcRiskPercentage}
                setRiskPercent={setSmcRiskPercentage}
                maxOpenTrades={smcMaxOpenTrades}
                setMaxOpenTrades={setSmcMaxOpenTrades}
                dailyLossLimit={smcDailyLossLimitPercent}
                setDailyLossLimit={setSmcDailyLossLimitPercent}
                activeSymbols={smcActiveSymbols}
                setActiveSymbols={setSmcActiveSymbols}
                // Campos legados (Trend Sniper)
                symbol={icSymbol}
                setSymbol={setIcSymbol}
                lots={icLots}
                setLots={setIcLots}
                leverage={icLeverage}
                setLeverage={setIcLeverage}
                isTesting={isTesting}
                onTestConnection={handleTestICMarketsConnection}
                connectionStatus={icConnectionStatus}
              />

              {/* Configurações Avançadas da Estratégia SMC - Só aparece quando SMC_SWARM está selecionado */}
              {smcStrategyType === "SMC_SWARM" && <SMCStrategySettings
                strategyType={smcStrategyType}
                setStrategyType={setSmcStrategyType}
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
                onSave={handleSave}
                isSaving={isSaving}
              />}
            </>
          )}

          {/* Botão Salvar */}
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className={`gap-2 ${
                isDeriv 
                  ? "bg-red-600 hover:bg-red-700" 
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Salvar Configurações {currentConfig.label}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
