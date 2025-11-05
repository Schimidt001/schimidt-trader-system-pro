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

export default function Settings() {
  const { user, loading: authLoading } = useAuth();
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
  const [symbol, setSymbol] = useState("R_100");
  const [stake, setStake] = useState("10");
  const [stopDaily, setStopDaily] = useState("100");
  const [takeDaily, setTakeDaily] = useState("500");
  const [lookback, setLookback] = useState("100");
  const [triggerOffset, setTriggerOffset] = useState("16");
  const [profitThreshold, setProfitThreshold] = useState("90");
  const [waitTime, setWaitTime] = useState("8");
  
  // Estados para tipo de contrato e barreiras
  const [contractType, setContractType] = useState<"RISE_FALL" | "TOUCH" | "NO_TOUCH">("RISE_FALL");
  const [barrierHigh, setBarrierHigh] = useState("0.30");
  const [barrierLow, setBarrierLow] = useState("-0.30");
  
  const [hedgeEnabled, setHedgeEnabled] = useState(true);

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

  // Query
  const { data: config, isLoading } = trpc.config.get.useQuery(undefined, {
    enabled: !!user,
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

  const updateConfig = trpc.config.update.useMutation({
    onSuccess: () => {
      toast.success("Configurações salvas com sucesso");
      setIsSaving(false);
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
      setSymbol(config.symbol);
      setStake((config.stake / 100).toString());
      setStopDaily((config.stopDaily / 100).toString());
      setTakeDaily((config.takeDaily / 100).toString());
      setLookback(config.lookback.toString());
      setTriggerOffset((config.triggerOffset ?? 16).toString()); // Usar ?? para aceitar 0
      setProfitThreshold((config.profitThreshold || 90).toString());
      setWaitTime((config.waitTime || 8).toString());
      
      // Carregar configurações de tipo de contrato e barreiras
      setContractType(config.contractType || "RISE_FALL");
      setBarrierHigh(config.barrierHigh || "0.30");
      setBarrierLow(config.barrierLow || "-0.30");
      
      setHedgeEnabled(config.hedgeEnabled ?? true);
      
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
        contractType,
        barrierHigh,
        barrierLow,
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

    if (isNaN(waitTimeNum) || waitTimeNum < 1 || waitTimeNum > 14) {
      toast.error("Tempo de Espera deve ser um número entre 1 e 14 minutos");
      return;
    }

    if (mode === "DEMO" && !tokenDemo) {
      toast.error("Token DEMO é obrigatório no modo DEMO");
      return;
    }

    if (mode === "REAL" && !tokenReal) {
      toast.error("Token REAL é obrigatório no modo REAL");
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
      mode,
      tokenDemo: tokenDemo || undefined,
      tokenReal: tokenReal || undefined,
      symbol,
      stake: Math.round(stakeNum * 100), // Converter para centavos
      stopDaily: Math.round(stopDailyNum * 100),
      takeDaily: Math.round(takeDailyNum * 100),
      lookback: lookbackNum,
      triggerOffset: triggerOffsetNum,
      profitThreshold: profitThresholdNum,
      waitTime: waitTimeNum,
      contractType,
      barrierHigh,
      barrierLow,
      hedgeEnabled,
      hedgeConfig: JSON.stringify(hedgeConfigObj),
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
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">Configurações</h1>
          <p className="text-slate-400 mt-1">Configure os parâmetros do bot trader</p>
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
                  Ativo Sintético
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
                    max="14"
                  />
                  <p className="text-xs text-slate-500">
                    Tempo de espera no candle antes de capturar dados para predição (padrão: 8 minutos)
                  </p>
                </div>
              </div>

              {/* Tipo de Contrato */}
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
                  RISE/FALL: Predição de fechamento | TOUCH: Preço deve tocar barreira | NO TOUCH: Preço não deve tocar barreira
                </p>
              </div>

              {/* Barreiras (visível apenas para TOUCH/NO_TOUCH) */}
              {contractType !== "RISE_FALL" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div className="space-y-2">
                    <Label htmlFor="barrierHigh" className="text-slate-300">
                      Barreira Superior (%)
                    </Label>
                    <Input
                      id="barrierHigh"
                      type="text"
                      value={barrierHigh}
                      onChange={(e) => setBarrierHigh(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                      placeholder="0.30"
                    />
                    <p className="text-xs text-slate-500">
                      Barreira acima do preço atual (ex: 0.30 = 30% acima)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="barrierLow" className="text-slate-300">
                      Barreira Inferior (%)
                    </Label>
                    <Input
                      id="barrierLow"
                      type="text"
                      value={barrierLow}
                      onChange={(e) => setBarrierLow(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                      placeholder="-0.30"
                    />
                    <p className="text-xs text-slate-500">
                      Barreira abaixo do preço atual (ex: -0.30 = 30% abaixo)
                    </p>
                  </div>
                </div>
              )}
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

