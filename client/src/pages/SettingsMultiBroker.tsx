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
      

    }
  }, [config]);

  // Carregar configurações IC Markets quando disponíveis
  useEffect(() => {
    if (icConfig) {
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
      });
    } else {
      // Salvar configurações IC Markets
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
                symbol={icSymbol}
                setSymbol={setIcSymbol}
                lots={icLots}
                setLots={setIcLots}
                leverage={icLeverage}
                setLeverage={setIcLeverage}
                timeframe={icTimeframe}
                setTimeframe={setIcTimeframe}
                stopLossPips={icStopLossPips}
                setStopLossPips={setIcStopLossPips}
                takeProfitPips={icTakeProfitPips}
                setTakeProfitPips={setIcTakeProfitPips}
                trailingEnabled={icTrailingEnabled}
                setTrailingEnabled={setIcTrailingEnabled}
                trailingTriggerPips={icTrailingTriggerPips}
                setTrailingTriggerPips={setIcTrailingTriggerPips}
                trailingStepPips={icTrailingStepPips}
                setTrailingStepPips={setIcTrailingStepPips}
                isTesting={isTesting}
                onTestConnection={handleTestICMarketsConnection}
                connectionStatus={icConnectionStatus}
              />


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
