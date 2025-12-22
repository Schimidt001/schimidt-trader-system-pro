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
import { Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BotSelector, useBotSelector } from "@/components/BotSelector";
import { MarketDetectorSettings } from "@/components/MarketDetectorSettings";

export default function Settings() {
  const { user, loading: authLoading } = useAuth();
  const { selectedBot, setSelectedBot } = useBotSelector();
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    balance?: number;
    currency?: string;
    mode?: string;
  } | null>(null);

  // Form state
  const [mode, setMode] = useState<"DEMO" | "REAL">("DEMO");
  const [tokenDemo, setTokenDemo] = useState("");
  const [tokenReal, setTokenReal] = useState("");
  const [derivAppId, setDerivAppId] = useState("1089"); // App ID da DERIV
  const [symbol, setSymbol] = useState("R_100");
  const [stake, setStake] = useState("10");
  const [stopDaily, setStopDaily] = useState("100");
  const [takeDaily, setTakeDaily] = useState("500");
  const [lookback, setLookback] = useState("100");
  const [triggerOffset, setTriggerOffset] = useState("16");
  const [profitThreshold, setProfitThreshold] = useState("90");
  const [waitTime, setWaitTime] = useState("8");
  const [timeframe, setTimeframe] = useState("900"); // 900 (M15) ou 1800 (M30)
  
  // Estados para re-predição M30 e M60
  const [repredictionEnabled, setRepredictionEnabled] = useState(true);
  const [repredictionDelay, setRepredictionDelay] = useState("300"); // 5 minutos em segundos
  
  // Estados para tipo de contrato e barreiras
  const [contractType, setContractType] = useState<"RISE_FALL" | "TOUCH" | "NO_TOUCH">("RISE_FALL");
  const [barrierHigh, setBarrierHigh] = useState("3.00");
  const [barrierLow, setBarrierLow] = useState("-3.00");
  const [forexMinDurationMinutes, setForexMinDurationMinutes] = useState("15");
  const [allowEquals, setAllowEquals] = useState(false); // ✅ NOVO
  const [useCandleDuration, setUseCandleDuration] = useState(false); // ✅ NOVO
  
  const [hedgeEnabled, setHedgeEnabled] = useState(true);
  
  // Estados para Filtro de Horário
  const [hourlyFilterEnabled, setHourlyFilterEnabled] = useState(false);
  
  // Estado para Market Condition Detector
  const [marketConditionEnabled, setMarketConditionEnabled] = useState(false);
  
  // Estados para Payout Mínimo
  const [payoutCheckEnabled, setPayoutCheckEnabled] = useState(true);
  const [minPayoutPercent, setMinPayoutPercent] = useState("80");
  const [payoutRecheckDelay, setPayoutRecheckDelay] = useState("300");
  
  // Estados para DojiGuard (Filtro Anti-Doji)
  const [antiDojiEnabled, setAntiDojiEnabled] = useState(false);
  const [antiDojiRangeMin, setAntiDojiRangeMin] = useState("0.0500");
  const [antiDojiRatioMin, setAntiDojiRatioMin] = useState("18"); // Armazenar como % (18 = 18%)
  
  // Estados para ExhaustionGuard (Filtro de Exaustão)
  const [exhaustionGuardEnabled, setExhaustionGuardEnabled] = useState(false);
  const [exhaustionRatioMax, setExhaustionRatioMax] = useState("70"); // Armazenar como % (70 = 70%)
  const [exhaustionRangeLookback, setExhaustionRangeLookback] = useState("20");
  const [exhaustionRangeMultiplier, setExhaustionRangeMultiplier] = useState("1.5");
  const [exhaustionGuardLogEnabled, setExhaustionGuardLogEnabled] = useState(true);
  
  const [hourlyFilterCustomHours, setHourlyFilterCustomHours] = useState<number[]>([]);
  const [hourlyFilterGoldHours, setHourlyFilterGoldHours] = useState<number[]>([]);
  const [hourlyFilterGoldMultiplier, setHourlyFilterGoldMultiplier] = useState("200");

  // Estados para os 13 parâmetros da IA Hedge
  // Estratégia 1: Detecção de Reversão
  const [reversalDetectionMinute, setReversalDetectionMinute] = useState("12.0");
  const [reversalThreshold, setReversalThreshold] = useState("0.60");
  const [reversalStakeMultiplier, setReversalStakeMultiplier] = useState("1.5");
  
  // Estratégia 2: Reforço em Pullback
  const [pullbackDetectionStart, setPullbackDetectionStart] = useState("12.0");
  const [pullbackDetectionEnd, setPullbackDetectionEnd] = useState("14.0");
  const [pullbackMinProgress, setPullbackMinProgress] = useState("0.15");
  const [pullbackMaxProgress, setPullbackMaxProgress] = useState("0.40");
  const [pullbackStakeMultiplier, setPullbackStakeMultiplier] = useState("1.4");
  
  // Estratégia 3: Reversão de Ponta
  const [edgeReversalMinute, setEdgeReversalMinute] = useState("12.0");
  const [edgeExtensionThreshold, setEdgeExtensionThreshold] = useState("0.80");
  const [edgeStakeMultiplier, setEdgeStakeMultiplier] = useState("1.5");
  
  // Janela geral
  const [analysisStartMinute, setAnalysisStartMinute] = useState("12.0");
  const [analysisEndMinute, setAnalysisEndMinute] = useState("14.0");

  // Queries
  const { data: config, isLoading } = trpc.config.get.useQuery(
    { botId: selectedBot },
    {
      enabled: !!user,
    }
  );

  const { data: botStatus } = trpc.bot.status.useQuery(
    { botId: selectedBot },
    {
      enabled: !!user,
      refetchInterval: false, // Não precisa ficar atualizando
  });

  // Mutations
  const testConnection = trpc.config.testConnection.useMutation({
    onSuccess: (data) => {
      toast.success(`Conectado com sucesso! Saldo: $${(data.balance / 100).toFixed(2)}`);
      setConnectionStatus({
        connected: true,
        balance: data.balance,
        currency: data.currency,
        mode: data.mode,
      });
      setIsTesting(false);
    },
    onError: (error) => {
      toast.error(`Erro ao conectar: ${error.message}`);
      setConnectionStatus({ connected: false });
      setIsTesting(false);
    },
  });

  const reloadBotConfig = trpc.bot.reloadConfig.useMutation({
    onSuccess: () => {
      console.log('[Settings] Configura\u00e7\u00f5es do bot recarregadas automaticamente');
      toast.success("✅ Configura\u00e7\u00f5es aplicadas ao bot em tempo real");
    },
    onError: (error) => {
      console.error('[Settings] Erro ao recarregar configura\u00e7\u00f5es:', error);
      toast.error('Erro ao aplicar configura\u00e7\u00f5es ao bot');
    },
  });

  const updateConfig = trpc.config.update.useMutation({
    onSuccess: () => {
      toast.success("Configura\u00e7\u00f5es salvas com sucesso");
      setIsSaving(false);
      
      // Verificar se bot est\u00e1 rodando
      if (botStatus?.isRunning) {
        console.log('[Settings] Bot est\u00e1 rodando, recarregando configura\u00e7\u00f5es...');
        reloadBotConfig.mutate();
      }
    },
    onError: (error) => {
      toast.error(`Erro ao salvar: ${error.message}`);
      setIsSaving(false);
    },
  });

  // Carregar configurações existentes
  useEffect(() => {
    if (config) {
      setMode(config.mode);
      setTokenDemo(config.tokenDemo || "");
      setTokenReal(config.tokenReal || "");
      setDerivAppId(config.derivAppId || "1089"); // Carregar App ID ou usar padrão
      setSymbol(config.symbol);
      setStake((config.stake / 100).toString());
      setStopDaily((config.stopDaily / 100).toString());
      setTakeDaily((config.takeDaily / 100).toString());
      setLookback(config.lookback.toString());
      setTriggerOffset((config.triggerOffset ?? 16).toString()); // Usar ?? para aceitar 0
      setProfitThreshold((config.profitThreshold || 90).toString());
      setWaitTime((config.waitTime || 8).toString());
      setTimeframe((config.timeframe || 900).toString());
      
      // Carregar configurações de re-predição M30 e M60
      setRepredictionEnabled(config.repredictionEnabled ?? true);
      setRepredictionDelay((config.repredictionDelay || 300).toString());
      
      // Carregar configurações de tipo de contrato e barreiras
      setContractType(config.contractType || "RISE_FALL");
      setBarrierHigh(config.barrierHigh || "3.00");
      setBarrierLow(config.barrierLow || "-3.00");
      setForexMinDurationMinutes((config.forexMinDurationMinutes || 15).toString());
      setAllowEquals(config.allowEquals ?? false); // ✅ NOVO
      setUseCandleDuration(config.useCandleDuration ?? false); // ✅ NOVO
      
      setHedgeEnabled(config.hedgeEnabled ?? true);
      
      // Carregar configurações do Filtro de Horário
      setHourlyFilterEnabled(config.hourlyFilterEnabled ?? false);
      
      // Carregar configuração do Market Condition Detector
      setMarketConditionEnabled(config.marketConditionEnabled ?? false);
      
      // Carregar configurações de Payout Mínimo
      setPayoutCheckEnabled(config.payoutCheckEnabled ?? true);
      setMinPayoutPercent((config.minPayoutPercent ?? 80).toString());
      setPayoutRecheckDelay((config.payoutRecheckDelay ?? 300).toString());
      
      // Carregar configurações do DojiGuard
      setAntiDojiEnabled(config.antiDojiEnabled ?? false);
      setAntiDojiRangeMin(config.antiDojiRangeMin ? config.antiDojiRangeMin.toString() : "0.0500");
      // Converter de decimal (0.18) para % (18)
      const ratioPercent = config.antiDojiRatioMin ? (parseFloat(config.antiDojiRatioMin.toString()) * 100).toFixed(0) : "18";
      setAntiDojiRatioMin(ratioPercent);
      
      // Carregar configurações do ExhaustionGuard
      setExhaustionGuardEnabled(config.exhaustionGuardEnabled ?? false);
      // Converter de decimal (0.70) para % (70)
      const exhaustionRatioPercent = config.exhaustionRatioMax ? (parseFloat(config.exhaustionRatioMax.toString()) * 100).toFixed(0) : "70";
      setExhaustionRatioMax(exhaustionRatioPercent);
      setExhaustionRangeLookback((config.exhaustionRangeLookback ?? 20).toString());
      setExhaustionRangeMultiplier(config.exhaustionRangeMultiplier ? config.exhaustionRangeMultiplier.toString() : "1.5");
      setExhaustionGuardLogEnabled(config.exhaustionGuardLogEnabled ?? true);
      
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
      
      // Carregar configurações da IA Hedge se existirem
      if (config.hedgeConfig) {
        try {
          const parsed = JSON.parse(config.hedgeConfig);
          setReversalDetectionMinute((parsed.reversalDetectionMinute ?? 12.0).toString());
          setReversalThreshold((parsed.reversalThreshold ?? 0.60).toString());
          setReversalStakeMultiplier((parsed.reversalStakeMultiplier ?? 1.5).toString());
          setPullbackDetectionStart((parsed.pullbackDetectionStart ?? 12.0).toString());
          setPullbackDetectionEnd((parsed.pullbackDetectionEnd ?? 14.0).toString());
          setPullbackMinProgress((parsed.pullbackMinProgress ?? 0.15).toString());
          setPullbackMaxProgress((parsed.pullbackMaxProgress ?? 0.40).toString());
          setPullbackStakeMultiplier((parsed.pullbackStakeMultiplier ?? 1.4).toString());
          setEdgeReversalMinute((parsed.edgeReversalMinute ?? 12.0).toString());
          setEdgeExtensionThreshold((parsed.edgeExtensionThreshold ?? 0.80).toString());
          setEdgeStakeMultiplier((parsed.edgeStakeMultiplier ?? 1.5).toString());
          setAnalysisStartMinute((parsed.analysisStartMinute ?? 12.0).toString());
          setAnalysisEndMinute((parsed.analysisEndMinute ?? 14.0).toString());
        } catch (error) {
          console.error("Erro ao parsear hedgeConfig:", error);
          // Manter valores padrão se houver erro
        }
      }
    }
  }, [config]);

  const handleTestConnection = async () => {
    // Primeiro salvar a configuração
    const stakeNum = parseFloat(stake);
    const stopDailyNum = parseFloat(stopDaily);
    const takeDailyNum = parseFloat(takeDaily);
    const lookbackNum = parseInt(lookback);
    const triggerOffsetNum = parseInt(triggerOffset);
    const profitThresholdNum = parseInt(profitThreshold);
    const waitTimeNum = parseInt(waitTime);
    const timeframeNum = parseInt(timeframe);
    const forexMinDurationMinutesNum = parseInt(forexMinDurationMinutes);

    if (mode === "DEMO" && !tokenDemo) {
      toast.error("Token DEMO é obrigatório");
      return;
    }

    if (mode === "REAL" && !tokenReal) {
      toast.error("Token REAL é obrigatório");
      return;
    }

    setIsTesting(true);
    
    // Salvar configuração primeiro
    try {
      await updateConfig.mutateAsync({
        botId: selectedBot,
        mode,
        tokenDemo: tokenDemo || undefined,
        tokenReal: tokenReal || undefined,
        symbol,
        stake: Math.round(stakeNum * 100),
        stopDaily: Math.round(stopDailyNum * 100),
        takeDaily: Math.round(takeDailyNum * 100),
        lookback: lookbackNum,
        triggerOffset: triggerOffsetNum,
        profitThreshold: profitThresholdNum,
        waitTime: waitTimeNum,
        timeframe: timeframeNum,
        contractType,
        barrierHigh,
        barrierLow,
        forexMinDurationMinutes: forexMinDurationMinutesNum,
        allowEquals, // ✅ CORREÇÃO
        useCandleDuration, // ✅ CORREÇÃO
      });
      
      // Depois testar conexão
      testConnection.mutate();
    } catch (error) {
      setIsTesting(false);
      toast.error("Erro ao salvar configuração");
    }
  };

  const handleRestoreDefaults = () => {
    // Restaurar valores padrão da IA Hedge
    setReversalDetectionMinute("12.0");
    setReversalThreshold("0.60");
    setReversalStakeMultiplier("1.5");
    setPullbackDetectionStart("12.0");
    setPullbackDetectionEnd("14.0");
    setPullbackMinProgress("0.15");
    setPullbackMaxProgress("0.40");
    setPullbackStakeMultiplier("1.4");
    setEdgeReversalMinute("12.0");
    setEdgeExtensionThreshold("0.80");
    setEdgeStakeMultiplier("1.5");
    setAnalysisStartMinute("12.0");
    setAnalysisEndMinute("14.0");
    toast.success("Configurações da IA Hedge restauradas para os padrões");
  };

  const handleSave = () => {
    // Validações
    const stakeNum = parseFloat(stake);
    const stopDailyNum = parseFloat(stopDaily);
    const takeDailyNum = parseFloat(takeDaily);
    const lookbackNum = parseInt(lookback);
    const triggerOffsetNum = parseInt(triggerOffset);
    const profitThresholdNum = parseInt(profitThreshold);
    const waitTimeNum = parseInt(waitTime);
    const timeframeNum = parseInt(timeframe);
    const forexMinDurationMinutesNum = parseInt(forexMinDurationMinutes);

    if (isNaN(stakeNum) || stakeNum <= 0) {
      toast.error("Stake deve ser um número positivo");
      return;
    }

    if (isNaN(stopDailyNum) || stopDailyNum <= 0) {
      toast.error("Stop diário deve ser um número positivo");
      return;
    }

    if (isNaN(takeDailyNum) || takeDailyNum <= 0) {
      toast.error("Take diário deve ser um número positivo");
      return;
    }

    if (isNaN(lookbackNum) || lookbackNum <= 0) {
      toast.error("Lookback deve ser um número inteiro positivo");
      return;
    }

    if (isNaN(triggerOffsetNum) || triggerOffsetNum < 0) {
      toast.error("Trigger Offset (Pips) deve ser um número inteiro positivo ou 0 (desativado)");
      return;
    }

    if (isNaN(profitThresholdNum) || profitThresholdNum < 1 || profitThresholdNum > 100) {
      toast.error("Profit Threshold deve ser um número entre 1 e 100");
      return;
    }

    if (isNaN(waitTimeNum) || waitTimeNum < 1) {
      toast.error("Tempo de Espera deve ser um número positivo (mínimo 1 minuto)");
      return;
    }

    if (isNaN(forexMinDurationMinutesNum) || forexMinDurationMinutesNum < 1) {
      toast.error("Duração da Operação deve ser um número positivo (mínimo 1 minuto)");
      return;
    }

    if (timeframeNum !== 900 && timeframeNum !== 1800 && timeframeNum !== 3600) {
      toast.error("Timeframe deve ser 900 (M15), 1800 (M30) ou 3600 (M60)");
      return;
    }

    // Validar configurações de re-predição
    const repredictionDelayNum = parseInt(repredictionDelay);
    if ((timeframeNum === 1800 || timeframeNum === 3600) && repredictionEnabled) {
      if (isNaN(repredictionDelayNum) || repredictionDelayNum < 60) {
        toast.error("Delay de re-predição deve ser no mínimo 60 segundos (1 min)");
        return;
      }
    }

    if (mode === "DEMO" && !tokenDemo) {
      toast.error("Token DEMO é obrigatório no modo DEMO");
      return;
    }

    if (mode === "REAL" && !tokenReal) {
      toast.error("Token REAL é obrigatório no modo REAL");
      return;
    }

    // VALIDAÇÃO CRÍTICA: Filtro de Horário não pode ter array vazio
    if (hourlyFilterEnabled && hourlyFilterCustomHours.length === 0) {
      toast.error("Selecione pelo menos 1 horário permitido ou desative o filtro de horário");
      return;
    }

    // Construir objeto hedgeConfig com os 13 parâmetros
    const hedgeConfigObj = {
      enabled: hedgeEnabled,
      reversalDetectionMinute: parseFloat(reversalDetectionMinute),
      reversalThreshold: parseFloat(reversalThreshold),
      reversalStakeMultiplier: parseFloat(reversalStakeMultiplier),
      pullbackDetectionStart: parseFloat(pullbackDetectionStart),
      pullbackDetectionEnd: parseFloat(pullbackDetectionEnd),
      pullbackMinProgress: parseFloat(pullbackMinProgress),
      pullbackMaxProgress: parseFloat(pullbackMaxProgress),
      pullbackStakeMultiplier: parseFloat(pullbackStakeMultiplier),
      edgeReversalMinute: parseFloat(edgeReversalMinute),
      edgeExtensionThreshold: parseFloat(edgeExtensionThreshold),
      edgeStakeMultiplier: parseFloat(edgeStakeMultiplier),
      analysisStartMinute: parseFloat(analysisStartMinute),
      analysisEndMinute: parseFloat(analysisEndMinute),
    };

    setIsSaving(true);
    updateConfig.mutate({
      botId: selectedBot,
      mode,
      tokenDemo: tokenDemo || undefined,
      tokenReal: tokenReal || undefined,
      derivAppId: derivAppId || "1089", // App ID da DERIV
      symbol,
      stake: Math.round(stakeNum * 100), // Converter para centavos
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
      allowEquals, // ✅ NOVO
      useCandleDuration, // ✅ NOVO
      hedgeEnabled,
      hedgeConfig: JSON.stringify(hedgeConfigObj),
      hourlyFilterEnabled,
      hourlyFilterMode: "CUSTOM",
      hourlyFilterCustomHours: JSON.stringify(hourlyFilterCustomHours),
      hourlyFilterGoldHours: JSON.stringify(hourlyFilterGoldHours),
      hourlyFilterGoldMultiplier: parseInt(hourlyFilterGoldMultiplier) || 200, // Fallback para 200 (2x) se vazio
      marketConditionEnabled, // Market Condition Detector
      // Payout Mínimo
      payoutCheckEnabled,
      minPayoutPercent: parseInt(minPayoutPercent) || 80,
      payoutRecheckDelay: parseInt(payoutRecheckDelay) || 300,
      // DojiGuard (Filtro Anti-Doji)
      antiDojiEnabled,
      antiDojiRangeMin: parseFloat(antiDojiRangeMin) || 0.0500,
      antiDojiRatioMin: (parseInt(antiDojiRatioMin) || 18) / 100, // Converter % para decimal (18 -> 0.18)
      // ExhaustionGuard (Filtro de Exaustão)
      exhaustionGuardEnabled,
      exhaustionRatioMax: (parseInt(exhaustionRatioMax) || 70) / 100, // Converter % para decimal (70 -> 0.70)
      exhaustionRangeLookback: parseInt(exhaustionRangeLookback) || 20,
      exhaustionRangeMultiplier: parseFloat(exhaustionRangeMultiplier) || 1.5,
      exhaustionGuardLogEnabled,
    });
    
    console.log('[FILTRO] Salvando configurações:', {
      hourlyFilterEnabled,
      hourlyFilterCustomHours,
      hourlyFilterCustomHoursJSON: JSON.stringify(hourlyFilterCustomHours),
      hourlyFilterGoldHours,
      hourlyFilterGoldHoursJSON: JSON.stringify(hourlyFilterGoldHours),
    });
  };

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
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Configurações</h1>
            <p className="text-slate-400 mt-1">Configure os parâmetros do bot trader</p>
          </div>
          <BotSelector selectedBot={selectedBot} onBotChange={setSelectedBot} />
        </div>

        <div className="space-y-6">
          {/* Modo e Tokens */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Conta DERIV</CardTitle>
              <CardDescription className="text-slate-400">
                Configure o modo de operação e tokens de acesso
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mode" className="text-slate-300">
                  Modo de Operação
                </Label>
                <Select value={mode} onValueChange={(v) => setMode(v as "DEMO" | "REAL")}>
                  <SelectTrigger id="mode" className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEMO">DEMO</SelectItem>
                    <SelectItem value="REAL">REAL</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tokenDemo" className="text-slate-300">
                  Token DEMO
                </Label>
                <Input
                  id="tokenDemo"
                  type="password"
                  value={tokenDemo}
                  onChange={(e) => setTokenDemo(e.target.value)}
                  placeholder="Insira seu token de API DEMO"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tokenReal" className="text-slate-300">
                  Token REAL
                </Label>
                <Input
                  id="tokenReal"
                  type="password"
                  value={tokenReal}
                  onChange={(e) => setTokenReal(e.target.value)}
                  placeholder="Insira seu token de API REAL"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="derivAppId" className="text-slate-300">
                  App ID da DERIV
                </Label>
                <Input
                  id="derivAppId"
                  type="text"
                  value={derivAppId}
                  onChange={(e) => setDerivAppId(e.target.value)}
                  placeholder="1089 (padrão) ou seu App ID personalizado"
                  className="bg-slate-800 border-slate-700 text-white"
                />
                <p className="text-xs text-slate-500">
                  Crie seu próprio App ID em{" "}
                  <a
                    href="https://api.deriv.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    api.deriv.com
                  </a>
                  {" "}para evitar problemas de conexão
                </p>
              </div>

              {/* Botão de Teste de Conexão */}
              <div className="pt-4 border-t border-slate-700">
                <Button
                  onClick={handleTestConnection}
                  disabled={isTesting || (!tokenDemo && !tokenReal)}
                  variant="outline"
                  className="w-full gap-2"
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Testando conexão...
                    </>
                  ) : (
                    "Testar Conexão com DERIV"
                  )}
                </Button>
                
                {connectionStatus && (
                  <div className={`mt-3 p-3 rounded-lg ${
                    connectionStatus.connected 
                      ? "bg-green-500/10 border border-green-500/30" 
                      : "bg-red-500/10 border border-red-500/30"
                  }`}>
                    <p className={`text-sm font-medium ${
                      connectionStatus.connected ? "text-green-400" : "text-red-400"
                    }`}>
                      {connectionStatus.connected 
                        ? `✓ Conectado (${connectionStatus.mode}) - Saldo: $${((connectionStatus.balance || 0) / 100).toFixed(2)} ${connectionStatus.currency}`
                        : "✗ Falha na conexão"}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Parâmetros de Trading */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Parâmetros de Trading</CardTitle>
              <CardDescription className="text-slate-400">
                Configure ativo, stake e gestão de risco
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="symbol" className="text-slate-300">
                  Ativo (Sintético ou Forex)
                </Label>
                <Select value={symbol} onValueChange={setSymbol}>
                  <SelectTrigger id="symbol" className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DERIV_SYMBOLS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stake" className="text-slate-300">
                    Stake (USD)
                  </Label>
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
                  <Label htmlFor="lookback" className="text-slate-300">
                    Lookback (candles)
                  </Label>
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
                  <Label htmlFor="stopDaily" className="text-slate-300">
                    Stop Diário (USD)
                  </Label>
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
                  <Label htmlFor="takeDaily" className="text-slate-300">
                    Take Diário (USD)
                  </Label>
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
                  <Label htmlFor="triggerOffset" className="text-slate-300">
                    Trigger Offset - Pips
                  </Label>
                  <Input
                    id="triggerOffset"
                    type="number"
                    value={triggerOffset}
                    onChange={(e) => setTriggerOffset(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white"
                    placeholder="16"
                  />
                  <p className="text-xs text-slate-500">
                    Distância do gatilho em relação à predição (padrão: 16, use 0 para desativar)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profitThreshold" className="text-slate-300">
                    Profit Threshold (%)
                  </Label>
                  <Input
                    id="profitThreshold"
                    type="number"
                    value={profitThreshold}
                    onChange={(e) => setProfitThreshold(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white"
                    placeholder="90"
                    min="1"
                    max="100"
                  />
                  <p className="text-xs text-slate-500">
                    Percentual do payout para early close (padrão: 90%)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="waitTime" className="text-slate-300">
                    Tempo de Espera (minutos)
                  </Label>
                  <Input
                    id="waitTime"
                    type="number"
                    value={waitTime}
                    onChange={(e) => setWaitTime(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white"
                    placeholder="8"
                    min="1"
                  />
                  <p className="text-xs text-slate-500">
                    Tempo de espera no candle antes de capturar dados para predição (sugestão: 8 min para M15, 15 min para M30, 20 min para M60)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timeframe" className="text-slate-300">
                    Timeframe
                  </Label>
                  <Select value={timeframe} onValueChange={setTimeframe}>
                    <SelectTrigger id="timeframe" className="bg-slate-800 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="900">M15 (15 minutos)</SelectItem>
                      <SelectItem value="1800">M30 (30 minutos)</SelectItem>
                      <SelectItem value="3600">M60 (1 hora)</SelectItem>
                    </SelectContent>
                  </Select>
                    <p className="text-xs text-slate-500">
                    Duração do candle para análise e trading (M15: 15 min, M30: 30 min, M60: 1 hora)
                  </p>
                </div>

                {/* Re-predição M30 e M60 */}
                {(timeframe === "1800" || timeframe === "3600") && (
                  <div className="space-y-4 p-4 bg-blue-900/20 rounded-lg border border-blue-700">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-slate-200 font-semibold">Re-Predição {timeframe === "1800" ? "M30" : "M60"}</Label>
                        <p className="text-xs text-slate-400">
                          Fazer nova predição se o gatilho não for acionado após o delay configurado
                        </p>
                      </div>
                      <Switch 
                        checked={repredictionEnabled}
                        onCheckedChange={setRepredictionEnabled}
                      />
                    </div>
                    
                    {repredictionEnabled && (
                      <div className="space-y-2">
                        <Label htmlFor="repredictionDelay" className="text-slate-300">
                          Delay para Re-Predição (segundos)
                        </Label>
                        <Input
                          id="repredictionDelay"
                          type="number"
                          value={repredictionDelay}
                          onChange={(e) => setRepredictionDelay(e.target.value)}
                          className="bg-slate-800 border-slate-700 text-white"
                          placeholder="300"
                          min="60"
                          step="60"
                        />
                        <p className="text-xs text-slate-500">
                          Tempo de espera após primeira predição antes de fazer nova predição (padrão: 300s = 5 min)
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tipo de Contrato */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-slate-100">Tipo de Contrato</CardTitle>
              <CardDescription className="text-slate-400">
                Configure o tipo de contrato e barreiras
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contractType" className="text-slate-300">
                  Tipo de Contrato
                </Label>
                <Select value={contractType} onValueChange={(value: "RISE_FALL" | "TOUCH" | "NO_TOUCH") => setContractType(value)}>
                  <SelectTrigger id="contractType" className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RISE_FALL">RISE/FALL (CALL/PUT)</SelectItem>
                    <SelectItem value="TOUCH">TOUCH (One Touch)</SelectItem>
                    <SelectItem value="NO_TOUCH">NO TOUCH</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  RISE/FALL: Predição de fechamento | TOUCH: Preço deve tocar barreira (distância em pontos) | NO TOUCH: Preço não deve tocar barreira
                </p>
              </div>

              {/* Barreiras (visível apenas para TOUCH/NO_TOUCH) */}
              {contractType !== "RISE_FALL" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div className="space-y-2">
                    <Label htmlFor="barrierHigh" className="text-slate-300">
                      Barreira Superior (pontos)
                    </Label>
                    <Input
                      id="barrierHigh"
                      type="text"
                      value={barrierHigh}
                      onChange={(e) => setBarrierHigh(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                      placeholder="3.00"
                    />
                    <p className="text-xs text-slate-500">
                      Distância em pontos acima do preço (ex: 3.00 = 3 pontos acima | Mínimo: 2.80)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="barrierLow" className="text-slate-300">
                      Barreira Inferior (pontos)
                    </Label>
                    <Input
                      id="barrierLow"
                      type="text"
                      value={barrierLow}
                      onChange={(e) => setBarrierLow(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                      placeholder="-3.00"
                    />
                    <p className="text-xs text-slate-500">
                      Distância em pontos abaixo do preço (ex: -3.00 = 3 pontos abaixo | Mínimo: 2.80)
                    </p>
                  </div>
                </div>
              )}

              {/* Duração da Operação (para Forex) */}
              <div className="space-y-2 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <Label htmlFor="forexMinDurationMinutes" className="text-slate-300">
                  Duração da Operação (minutos)
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="forexMinDurationMinutes"
                    type="number"
                    value={forexMinDurationMinutes}
                    onChange={(e) => setForexMinDurationMinutes(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white"
                    placeholder="15"
                    min="1"
                    disabled={useCandleDuration}
                  />
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <Switch
                      id="useCandleDuration"
                      checked={useCandleDuration}
                      onCheckedChange={setUseCandleDuration}
                    />
                    <Label htmlFor="useCandleDuration" className="text-slate-300 cursor-pointer text-sm">
                      Duração Dinâmica
                    </Label>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  {useCandleDuration 
                    ? "⚡ A operação será aberta até o final do candle atual (tempo restante calculado automaticamente)"
                    : "Tempo de duração da operação. Para Forex, este é o tempo fixo do contrato. Para Sintéticos, o tempo segue o candle. (Padrão: 15 minutos)"
                  }
                </p>
              </div>

              {/* ✅ NOVO: Permitir Empate como Vitória */}
              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="space-y-0.5">
                  <Label htmlFor="allowEquals" className="text-slate-300">
                    Permitir Empate como Vitória
                  </Label>
                  <p className="text-xs text-slate-500">
                    Se o preço de fechamento for igual ao preço de entrada, o trade será marcado como vencido
                  </p>
                </div>
                <Switch
                  id="allowEquals"
                  checked={allowEquals}
                  onCheckedChange={setAllowEquals}
                />
              </div>
            </CardContent>
          </Card>

          {/* IA Hedge */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">IA Hedge</CardTitle>
              <CardDescription>Configurações da estratégia de hedge inteligente</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="hedgeEnabled" className="text-slate-300">
                    Ativar IA Hedge
                  </Label>
                  <p className="text-xs text-slate-500">
                    Ativa estratégia de hedge nos últimos 3 minutos do candle (12-14 min)
                  </p>
                </div>
                <Switch
                  id="hedgeEnabled"
                  checked={hedgeEnabled}
                  onCheckedChange={setHedgeEnabled}
                />
              </div>

              {/* Accordion para Configurações Avançadas */}
              {hedgeEnabled && (
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="advanced" className="border-slate-700">
                    <AccordionTrigger className="text-slate-300 hover:text-white">
                      ⚙️ Configurações Avançadas da IA Hedge
                    </AccordionTrigger>
                    <AccordionContent className="space-y-6 pt-4">
                      {/* Estratégia 1: Detecção de Reversão */}
                      <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                        <h4 className="text-sm font-semibold text-slate-200">
                          Estratégia 1: Detecção de Reversão
                        </h4>
                        <p className="text-xs text-slate-400">
                          Abre hedge quando preço se move fortemente contra a predição original (&gt;60% do range na direção oposta)
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="reversalDetectionMinute" className="text-slate-300">
                              Minuto de Detecção
                            </Label>
                            <Input
                              id="reversalDetectionMinute"
                              type="number"
                              step="0.1"
                              value={reversalDetectionMinute}
                              onChange={(e) => setReversalDetectionMinute(e.target.value)}
                              className="bg-slate-800 border-slate-700 text-white"
                              min="8.0"
                              max="14.0"
                            />
                            <p className="text-xs text-slate-500">8.0 - 14.0 min (padrão: 12.0)</p>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="reversalThreshold" className="text-slate-300">
                              Threshold (%)
                            </Label>
                            <Input
                              id="reversalThreshold"
                              type="number"
                              step="0.01"
                              value={reversalThreshold}
                              onChange={(e) => setReversalThreshold(e.target.value)}
                              className="bg-slate-800 border-slate-700 text-white"
                              min="0.30"
                              max="0.95"
                            />
                            <p className="text-xs text-slate-500">0.30 - 0.95 (padrão: 0.60 = 60%)</p>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="reversalStakeMultiplier" className="text-slate-300">
                              Multiplicador de Stake
                            </Label>
                            <Input
                              id="reversalStakeMultiplier"
                              type="number"
                              step="0.1"
                              value={reversalStakeMultiplier}
                              onChange={(e) => setReversalStakeMultiplier(e.target.value)}
                              className="bg-slate-800 border-slate-700 text-white"
                              min="0.1"
                              max="2.0"
                            />
                            <p className="text-xs text-slate-500">0.1 - 2.0x (padrão: 1.5x)</p>
                          </div>
                        </div>
                      </div>

                      {/* Estratégia 2: Reforço em Pullback */}
                      <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                        <h4 className="text-sm font-semibold text-slate-200">
                          Estratégia 2: Reforço em Pullback
                        </h4>
                        <p className="text-xs text-slate-400">
                          Reforça posição quando movimento está correto mas lento ou após pequena retração (15-40% do esperado)
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="pullbackDetectionStart" className="text-slate-300">
                              Início da Janela (min)
                            </Label>
                            <Input
                              id="pullbackDetectionStart"
                              type="number"
                              step="0.1"
                              value={pullbackDetectionStart}
                              onChange={(e) => setPullbackDetectionStart(e.target.value)}
                              className="bg-slate-800 border-slate-700 text-white"
                              min="8.0"
                              max="13.0"
                            />
                            <p className="text-xs text-slate-500">8.0 - 13.0 min (padrão: 12.0)</p>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="pullbackDetectionEnd" className="text-slate-300">
                              Fim da Janela (min)
                            </Label>
                            <Input
                              id="pullbackDetectionEnd"
                              type="number"
                              step="0.1"
                              value={pullbackDetectionEnd}
                              onChange={(e) => setPullbackDetectionEnd(e.target.value)}
                              className="bg-slate-800 border-slate-700 text-white"
                              min="10.0"
                              max="14.0"
                            />
                            <p className="text-xs text-slate-500">10.0 - 14.0 min (padrão: 14.0)</p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="pullbackMinProgress" className="text-slate-300">
                              Progresso Mínimo
                            </Label>
                            <Input
                              id="pullbackMinProgress"
                              type="number"
                              step="0.01"
                              value={pullbackMinProgress}
                              onChange={(e) => setPullbackMinProgress(e.target.value)}
                              className="bg-slate-800 border-slate-700 text-white"
                              min="0.05"
                              max="0.50"
                            />
                            <p className="text-xs text-slate-500">0.05 - 0.50 (padrão: 0.15 = 15%)</p>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="pullbackMaxProgress" className="text-slate-300">
                              Progresso Máximo
                            </Label>
                            <Input
                              id="pullbackMaxProgress"
                              type="number"
                              step="0.01"
                              value={pullbackMaxProgress}
                              onChange={(e) => setPullbackMaxProgress(e.target.value)}
                              className="bg-slate-800 border-slate-700 text-white"
                              min="0.20"
                              max="0.80"
                            />
                            <p className="text-xs text-slate-500">0.20 - 0.80 (padrão: 0.40 = 40%)</p>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="pullbackStakeMultiplier" className="text-slate-300">
                              Multiplicador de Stake
                            </Label>
                            <Input
                              id="pullbackStakeMultiplier"
                              type="number"
                              step="0.1"
                              value={pullbackStakeMultiplier}
                              onChange={(e) => setPullbackStakeMultiplier(e.target.value)}
                              className="bg-slate-800 border-slate-700 text-white"
                              min="0.1"
                              max="1.5"
                            />
                            <p className="text-xs text-slate-500">0.1 - 1.5x (padrão: 1.4x)</p>
                          </div>
                        </div>
                      </div>

                      {/* Estratégia 3: Reversão de Ponta */}
                      <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                        <h4 className="text-sm font-semibold text-slate-200">
                          Estratégia 3: Reversão de Ponta
                        </h4>
                        <p className="text-xs text-slate-400">
                          Aposta em pequena reversão quando preço esticou demais na direção prevista (&gt;80% do range)
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="edgeReversalMinute" className="text-slate-300">
                              Minuto de Detecção
                            </Label>
                            <Input
                              id="edgeReversalMinute"
                              type="number"
                              step="0.1"
                              value={edgeReversalMinute}
                              onChange={(e) => setEdgeReversalMinute(e.target.value)}
                              className="bg-slate-800 border-slate-700 text-white"
                              min="12.0"
                              max="14.5"
                            />
                            <p className="text-xs text-slate-500">12.0 - 14.5 min (padrão: 12.0)</p>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="edgeExtensionThreshold" className="text-slate-300">
                              Threshold de Extensão
                            </Label>
                            <Input
                              id="edgeExtensionThreshold"
                              type="number"
                              step="0.01"
                              value={edgeExtensionThreshold}
                              onChange={(e) => setEdgeExtensionThreshold(e.target.value)}
                              className="bg-slate-800 border-slate-700 text-white"
                              min="0.60"
                              max="0.95"
                            />
                            <p className="text-xs text-slate-500">0.60 - 0.95 (padrão: 0.80 = 80%)</p>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="edgeStakeMultiplier" className="text-slate-300">
                              Multiplicador de Stake
                            </Label>
                            <Input
                              id="edgeStakeMultiplier"
                              type="number"
                              step="0.1"
                              value={edgeStakeMultiplier}
                              onChange={(e) => setEdgeStakeMultiplier(e.target.value)}
                              className="bg-slate-800 border-slate-700 text-white"
                              min="0.1"
                              max="1.5"
                            />
                            <p className="text-xs text-slate-500">0.1 - 1.5x (padrão: 1.5x)</p>
                          </div>
                        </div>
                      </div>

                      {/* Janela Geral de Análise */}
                      <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                        <h4 className="text-sm font-semibold text-slate-200">
                          Janela de Análise
                        </h4>
                        <p className="text-xs text-slate-400">
                          Período em que a IA Hedge analisa e pode abrir posições secundárias
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="analysisStartMinute" className="text-slate-300">
                              Início da Análise (min)
                            </Label>
                            <Input
                              id="analysisStartMinute"
                              type="number"
                              step="0.1"
                              value={analysisStartMinute}
                              onChange={(e) => setAnalysisStartMinute(e.target.value)}
                              className="bg-slate-800 border-slate-700 text-white"
                              min="8.0"
                              max="13.0"
                            />
                            <p className="text-xs text-slate-500">8.0 - 13.0 min (padrão: 12.0)</p>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="analysisEndMinute" className="text-slate-300">
                              Fim da Análise (min)
                            </Label>
                            <Input
                              id="analysisEndMinute"
                              type="number"
                              step="0.1"
                              value={analysisEndMinute}
                              onChange={(e) => setAnalysisEndMinute(e.target.value)}
                              className="bg-slate-800 border-slate-700 text-white"
                              min="12.0"
                              max="14.0"
                            />
                            <p className="text-xs text-slate-500">12.0 - 14.0 min (padrão: 14.0)</p>
                          </div>
                        </div>
                      </div>

                      {/* Botão Restaurar Padrões */}
                      <div className="pt-4 border-t border-slate-700">
                        <Button
                          variant="outline"
                          onClick={handleRestoreDefaults}
                          className="w-full border-slate-600 hover:bg-slate-700"
                        >
                          Restaurar Padrões
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </CardContent>
          </Card>

          {/* Filtro de Horário */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">🕒 Filtro de Horário</CardTitle>
              <CardDescription>Configure horários específicos para operação (ideal para Forex)</CardDescription>
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
                              console.log('[FILTRO] Clique no horário:', hour, 'Estado atual:', hourlyFilterCustomHours);
                              if (isSelected) {
                                const newHours = hourlyFilterCustomHours.filter(h => h !== hour);
                                console.log('[FILTRO] Removendo horário. Novo estado:', newHours);
                                setHourlyFilterCustomHours(newHours);
                                setHourlyFilterGoldHours(hourlyFilterGoldHours.filter(h => h !== hour));
                              } else {
                                const newHours = [...hourlyFilterCustomHours, hour].sort((a, b) => a - b);
                                console.log('[FILTRO] Adicionando horário. Novo estado:', newHours);
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
                      Clique duas vezes em um horário permitido para marcá-lo como GOLD (stake multiplicado)
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
                    Analisa volatilidade, ATR, sombras e notícias macroeconômicas (USD/JPY)
                  </p>
                </div>
                <Switch
                  id="marketConditionEnabled"
                  checked={marketConditionEnabled}
                  onCheckedChange={setMarketConditionEnabled}
                />
              </div>

              {marketConditionEnabled && (
                <div className="space-y-3 pt-4 border-t border-slate-700">
                  <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3">
                    <p className="text-sm text-slate-300">
                      📊 <strong>Como funciona:</strong>
                    </p>
                    <ul className="text-xs text-slate-400 mt-2 space-y-1 ml-4">
                      <li>• Avalia cada candle (M60) após fechamento</li>
                      <li>• Calcula score de 0-10 baseado em critérios técnicos e fundamentais</li>
                      <li>• 🟢 <strong>Verde (0-3):</strong> Mercado normal - opera normalmente</li>
                      <li>• 🟡 <strong>Amarelo (4-6):</strong> Mercado instável - opera com cautela</li>
                      <li>• 🔴 <strong>Vermelho (7-10):</strong> Mercado anormal - <strong>NÃO opera</strong></li>
                    </ul>
                  </div>
                  
                  <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                    <p className="text-sm text-slate-300 mb-2">
                      🔍 <strong>Critérios analisados:</strong>
                    </p>
                    <ul className="text-xs text-slate-400 space-y-1 ml-4">
                      <li>• <strong>ATR Alto (+2 pts):</strong> Amplitude do candle &gt; ATR × 2</li>
                      <li>• <strong>Sombras Longas (+2 pts):</strong> Wick &gt; Corpo × 2</li>
                      <li>• <strong>Volatilidade Fractal (+2 pts):</strong> Corpo/Amplitude &lt; 0.3</li>
                      <li>• <strong>Notícias Alto Impacto (+3 pts):</strong> Eventos HIGH (USD/JPY)</li>
                    </ul>
                  </div>
                  
                  <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3">
                    <p className="text-xs text-green-400">
                      ✅ <strong>Dica:</strong> Acesse a aba "Mercado" para ver a análise em tempo real, próximas notícias e logs do detector.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Market Detector - Configurações Avançadas */}
          {marketConditionEnabled && (
            <MarketDetectorSettings />
          )}

          {/* Payout Mínimo */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-slate-100">📊 Verificação de Payout Mínimo</CardTitle>
              <CardDescription>Protege contra operações com payout muito baixo (risco maior que retorno)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="payoutCheckEnabled" className="text-slate-300">
                    Ativar Verificação de Payout
                  </Label>
                  <p className="text-xs text-slate-500">
                    Bot verifica payout antes de entrar e só opera se for aceitável
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
                      Exemplo: 80 = bot só entra se payout for ≥ 80% (ganhar $0.80 para cada $1 arriscado)
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
                      Se payout estiver baixo, aguarda X segundos e verifica novamente. Exemplo: 300 = 5 minutos
                    </p>
                  </div>

                  <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3">
                    <p className="text-sm text-slate-300">
                      📊 <strong>Como funciona:</strong>
                    </p>
                    <ul className="text-xs text-slate-400 space-y-1 mt-2">
                      <li>1. Bot identifica momento de predição</li>
                      <li>2. <strong>Verifica payout</strong> na Deriv antes de fazer predição</li>
                      <li>3. Se payout ≥ mínimo → faz predição e entra</li>
                      <li>4. Se payout &lt; mínimo → aguarda X segundos</li>
                      <li>5. Verifica payout novamente</li>
                      <li>6. Se ainda baixo → <strong>cancela operação</strong></li>
                      <li>7. Se agora OK → faz predição e entra</li>
                    </ul>
                  </div>
                  
                  <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3">
                    <p className="text-xs text-yellow-400">
                      ⚠️ <strong>Atenção:</strong> Payout varia com volatilidade e horário. Em horários de baixa liquidez, payout tende a cair.
                    </p>
                  </div>
                  
                  <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3">
                    <p className="text-xs text-green-400">
                      ✅ <strong>Recomendação:</strong> Forex = 80% | Índices = 85% | Retry = 300s (M60) ou 180s (M15/M30)
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
                      Exemplo: 18 = 18%. Se o corpo do candle for menor que 18% do range total, é bloqueado (alta probabilidade de doji)
                    </p>
                  </div>

                  <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3">
                    <p className="text-sm text-slate-300">
                      📊 <strong>Como funciona:</strong>
                    </p>
                    <ul className="text-xs text-slate-400 space-y-1 mt-2">
                      <li>1. Bot captura dados do candle aos 35 minutos (M60)</li>
                      <li>2. Calcula: <strong>range</strong> = high - low</li>
                      <li>3. Calcula: <strong>body</strong> = |close - open|</li>
                      <li>4. Calcula: <strong>ratio</strong> = body / range</li>
                      <li>5. Se range &lt; mínimo → <strong>BLOQUEIA</strong></li>
                      <li>6. Se ratio &lt; mínimo → <strong>BLOQUEIA</strong></li>
                      <li>7. Se aprovado → arma gatilho normalmente</li>
                    </ul>
                  </div>
                  
                  <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3">
                    <p className="text-xs text-yellow-400">
                      ⚠️ <strong>Atenção:</strong> Filtro também é aplicado em re-predições. Se candle virar "lixo" no meio do caminho, gatilho é cancelado.
                    </p>
                  </div>
                  
                  <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3">
                    <p className="text-xs text-green-400">
                      ✅ <strong>Recomendação:</strong> Forex M60 = Range: 0.0500 | Ratio: 18% (valores testados em USD/JPY e EUR/JPY)
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ExhaustionGuard (Filtro de Exaustão) */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-slate-100">🛡️ Filtro de Exaustão (ExhaustionGuard)</CardTitle>
              <CardDescription>Bloqueia entrada em candles com alta exaustão direcional (risco de reversão)</CardDescription>
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
                      Exemplo: 70 = 70%. Se o movimento direcional for maior que 70% do range total, é bloqueado (alta exaustão)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="exhaustionRangeLookback" className="text-slate-300">
                      Candles para Média de Range
                    </Label>
                    <Input
                      id="exhaustionRangeLookback"
                      type="number"
                      value={exhaustionRangeLookback}
                      onChange={(e) => setExhaustionRangeLookback(e.target.value)}
                      placeholder="20"
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                    <p className="text-xs text-slate-500">
                      Número de candles anteriores para calcular a média de range (para detectar range anormal)
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

                  <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3">
                    <p className="text-sm text-slate-300">
                      📊 <strong>Como funciona:</strong>
                    </p>
                    <ul className="text-xs text-slate-400 space-y-1 mt-2">
                      <li>1. Bot captura dados do candle aos 35 minutos (M60)</li>
                      <li>2. Calcula: <strong>range</strong> = high - low</li>
                      <li>3. Calcula: <strong>directionalMove</strong> = |close - open|</li>
                      <li>4. Calcula: <strong>exhaustionRatio</strong> = directionalMove / range</li>
                      <li>5. Se exhaustionRatio &gt;= limite → <strong>BLOQUEIA</strong></li>
                      <li>6. Se range atual &gt;= média * multiplicador → <strong>BLOQUEIA</strong></li>
                      <li>7. Se aprovado → arma gatilho normalmente</li>
                    </ul>
                  </div>
                  
                  <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3">
                    <p className="text-xs text-yellow-400">
                      ⚠️ <strong>Atenção:</strong> Filtro também é aplicado em re-predições. Se candle ficar "exausto" no meio do caminho, gatilho é cancelado.
                    </p>
                  </div>
                  
                  <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3">
                    <p className="text-xs text-green-400">
                      ✅ <strong>Recomendação:</strong> Forex M60 = Ratio: 70% | Lookback: 20 candles | Multiplicador: 1.5x (valores baseados em estudo de 100 candles USD/JPY)
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Botão Salvar */}
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Salvar Configurações
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

