import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  
  // IA Híbrida
  const [aiEnabled, setAiEnabled] = useState(false);
  const [stakeHighConfidence, setStakeHighConfidence] = useState("4");
  const [stakeNormalConfidence, setStakeNormalConfidence] = useState("1");
  const [aiFilterThreshold, setAiFilterThreshold] = useState("60");
  const [aiHedgeEnabled, setAiHedgeEnabled] = useState(true);
  
  // Filtro de Horário
  const [hourlyFilterEnabled, setHourlyFilterEnabled] = useState(false);
  const [hourlyFilterMode, setHourlyFilterMode] = useState<"IDEAL" | "COMPATIBLE" | "GOLDEN" | "COMBINED" | "CUSTOM">("COMBINED");
  const [customHours, setCustomHours] = useState<number[]>([]);
  const [goldModeHours, setGoldModeHours] = useState<number[]>([]);
  const [goldModeStakeMultiplier, setGoldModeStakeMultiplier] = useState("2");

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
      
      // Carregar configurações da IA
      setAiEnabled(config.aiEnabled ?? false);
      setStakeHighConfidence(((config.stakeHighConfidence ?? 400) / 100).toString());
      setStakeNormalConfidence(((config.stakeNormalConfidence ?? 100) / 100).toString());
      setAiFilterThreshold((config.aiFilterThreshold ?? 60).toString());
      setAiHedgeEnabled(config.aiHedgeEnabled ?? true);
      
      // Carregar configurações de Filtro de Horário
      setHourlyFilterEnabled(config.hourlyFilterEnabled ?? false);
      setHourlyFilterMode((config.hourlyFilterMode as any) ?? "COMBINED");
      setGoldModeStakeMultiplier(((config.goldModeStakeMultiplier ?? 200) / 100).toString());
      
      if (config.customHours) {
        try {
          setCustomHours(JSON.parse(config.customHours));
        } catch (e) {
          setCustomHours([]);
        }
      }
      
      if (config.goldModeHours) {
        try {
          setGoldModeHours(JSON.parse(config.goldModeHours));
        } catch (e) {
          setGoldModeHours([]);
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
      });
      
      // Depois testar conexão
      testConnection.mutate();
    } catch (error) {
      setIsTesting(false);
      toast.error("Erro ao salvar configuração");
    }
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

    // Validar parâmetros da IA
    const stakeHighConfidenceNum = parseFloat(stakeHighConfidence);
    const stakeNormalConfidenceNum = parseFloat(stakeNormalConfidence);
    const aiFilterThresholdNum = parseInt(aiFilterThreshold);
    
    if (aiEnabled) {
      if (isNaN(stakeHighConfidenceNum) || stakeHighConfidenceNum <= 0) {
        toast.error("Stake Alta Confiança deve ser um número positivo");
        return;
      }
      if (isNaN(stakeNormalConfidenceNum) || stakeNormalConfidenceNum <= 0) {
        toast.error("Stake Normal deve ser um número positivo");
        return;
      }
      if (isNaN(aiFilterThresholdNum) || aiFilterThresholdNum < 0 || aiFilterThresholdNum > 100) {
        toast.error("Threshold do Filtro deve ser um número entre 0 e 100");
        return;
      }
    }
    
    // Validar parâmetros do Filtro de Horário
    const goldModeStakeMultiplierNum = parseFloat(goldModeStakeMultiplier);
    
    if (hourlyFilterEnabled) {
      if (hourlyFilterMode === "CUSTOM" && customHours.length === 0) {
        toast.error("Selecione pelo menos um horário no modo CUSTOM");
        return;
      }
      if (goldModeHours.length > 0) {
        if (goldModeHours.length !== 2) {
          toast.error("Modo GOLD requer exatamente 2 horários");
          return;
        }
        if (isNaN(goldModeStakeMultiplierNum) || goldModeStakeMultiplierNum <= 0) {
          toast.error("Multiplicador de Stake GOLD deve ser um número positivo");
          return;
        }
      }
    }

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
      // Parâmetros da IA Híbrida
      aiEnabled,
      stakeHighConfidence: Math.round(stakeHighConfidenceNum * 100),
      stakeNormalConfidence: Math.round(stakeNormalConfidenceNum * 100),
      aiFilterThreshold: aiFilterThresholdNum,
      aiHedgeEnabled,
      // Parâmetros do Filtro de Horário
      hourlyFilterEnabled,
      hourlyFilterMode,
      customHours: customHours.length > 0 ? JSON.stringify(customHours) : undefined,
      goldModeHours: goldModeHours.length > 0 ? JSON.stringify(goldModeHours) : undefined,
      goldModeStakeMultiplier: Math.round(goldModeStakeMultiplierNum * 100),
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
            </CardContent>
          </Card>
          
          {/* Agente IA (Estratégia Híbrida) */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white">Agente IA (Estratégia Híbrida)</CardTitle>
                  <CardDescription className="text-slate-400">
                    Ative a IA para otimizar entradas e gestão de risco
                  </CardDescription>
                </div>
                <Switch
                  checked={aiEnabled}
                  onCheckedChange={setAiEnabled}
                  className="data-[state=checked]:bg-green-600"
                />
              </div>
            </CardHeader>
            
            {aiEnabled && (
              <CardContent className="space-y-4">
                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <p className="text-sm text-blue-300">
                    <strong>⚡ Estratégia Híbrida Ativada:</strong> A IA analisará cada setup e decidirá:
                  </p>
                  <ul className="text-xs text-blue-200 mt-2 space-y-1 ml-4">
                    <li>• <strong>Alta Confiança:</strong> Entra com stake maior (Filtro)</li>
                    <li>• <strong>Confiança Normal:</strong> Entra com stake menor + hedge (proteção)</li>
                    <li>• <strong>Baixa Confiança:</strong> Bloqueia entrada (evita trades ruins)</li>
                  </ul>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="stakeHighConfidence" className="text-slate-300">
                      Stake Alta Confiança ($)
                    </Label>
                    <Input
                      id="stakeHighConfidence"
                      type="number"
                      value={stakeHighConfidence}
                      onChange={(e) => setStakeHighConfidence(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                      placeholder="4"
                      min="0.01"
                      step="0.01"
                    />
                    <p className="text-xs text-slate-500">
                      Valor apostado quando a IA tem alta confiança no setup (padrão: $4)
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="stakeNormalConfidence" className="text-slate-300">
                      Stake Confiança Normal ($)
                    </Label>
                    <Input
                      id="stakeNormalConfidence"
                      type="number"
                      value={stakeNormalConfidence}
                      onChange={(e) => setStakeNormalConfidence(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                      placeholder="1"
                      min="0.01"
                      step="0.01"
                    />
                    <p className="text-xs text-slate-500">
                      Valor apostado em setups normais com hedge ativo (padrão: $1)
                    </p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="aiFilterThreshold" className="text-slate-300">
                    Threshold do Filtro (%)
                  </Label>
                  <Input
                    id="aiFilterThreshold"
                    type="number"
                    value={aiFilterThreshold}
                    onChange={(e) => setAiFilterThreshold(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white"
                    placeholder="60"
                    min="0"
                    max="100"
                  />
                  <p className="text-xs text-slate-500">
                    Nível mínimo de confiança para considerar um trade de "Alta Confiança" (padrão: 60%)
                  </p>
                </div>
                
                <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                  <div>
                    <Label htmlFor="aiHedgeEnabled" className="text-slate-300">
                      Habilitar Hedge em Trades Normais
                    </Label>
                    <p className="text-xs text-slate-500 mt-1">
                      Aplica hedge automático em trades de confiança normal para redução de risco
                    </p>
                  </div>
                  <Switch
                    id="aiHedgeEnabled"
                    checked={aiHedgeEnabled}
                    onCheckedChange={setAiHedgeEnabled}
                    className="data-[state=checked]:bg-green-600"
                  />
                </div>
              </CardContent>
            )}
          </Card>
          
          {/* Filtro de Horário */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white">Filtro de Horário</CardTitle>
                  <CardDescription className="text-slate-400">
                    Configure os horários permitidos para operação do bot
                  </CardDescription>
                </div>
                <Switch
                  checked={hourlyFilterEnabled}
                  onCheckedChange={setHourlyFilterEnabled}
                  className="data-[state=checked]:bg-green-600"
                />
              </div>
            </CardHeader>
            
            {hourlyFilterEnabled && (
              <CardContent className="space-y-6">
                {/* Modo do Filtro */}
                <div className="space-y-3">
                  <Label className="text-slate-300">Modo do Filtro</Label>
                  <Select value={hourlyFilterMode} onValueChange={(value: any) => {
                    setHourlyFilterMode(value);
                    if (value !== "CUSTOM") {
                      const presets = {
                        IDEAL: [16, 18],
                        COMPATIBLE: [3, 6, 9, 10, 13, 16, 17, 18],
                        GOLDEN: [5, 12, 16, 18, 20, 21, 22, 23],
                        COMBINED: [5, 6, 12, 16, 17, 18, 20, 21, 22, 23],
                      };
                      setCustomHours(presets[value as keyof typeof presets] || []);
                    }
                  }}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IDEAL">
                        <div className="flex flex-col">
                          <span className="font-medium">IDEAL (2 horários)</span>
                          <span className="text-xs text-slate-400">16h, 18h UTC - Máxima qualidade</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="COMPATIBLE">
                        <div className="flex flex-col">
                          <span className="font-medium">COMPATÍVEL (8 horários)</span>
                          <span className="text-xs text-slate-400">Padrão de recuo + continuação</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="GOLDEN">
                        <div className="flex flex-col">
                          <span className="font-medium">GOLDEN (8 horários)</span>
                          <span className="text-xs text-slate-400">Candles mais limpos</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="COMBINED">
                        <div className="flex flex-col">
                          <span className="font-medium">COMBINADO (10 horários) ⭐</span>
                          <span className="text-xs text-slate-400">Balanceado - Recomendado</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="CUSTOM">
                        <div className="flex flex-col">
                          <span className="font-medium">PERSONALIZADO</span>
                          <span className="text-xs text-slate-400">Escolha seus próprios horários</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {(hourlyFilterMode === "CUSTOM" || customHours.length > 0) && (
                  <div className="space-y-3">
                    <Label className="text-slate-300">
                      {hourlyFilterMode === "CUSTOM" ? "Selecione os Horários (UTC)" : "Horários Ativos (UTC)"}
                    </Label>
                    <div className="grid grid-cols-6 gap-2">
                      {Array.from({ length: 24 }, (_, i) => i).map((hour) => {
                        const isSelected = customHours.includes(hour);
                        const isGold = goldModeHours.includes(hour);
                        
                        return (
                          <button
                            key={hour}
                            type="button"
                            disabled={hourlyFilterMode !== "CUSTOM"}
                            onClick={() => {
                              if (hourlyFilterMode === "CUSTOM") {
                                if (isSelected) {
                                  setCustomHours(customHours.filter(h => h !== hour));
                                } else {
                                  setCustomHours([...customHours, hour].sort((a, b) => a - b));
                                }
                              }
                            }}
                            className={`
                              relative p-3 rounded-lg font-medium text-sm transition-all
                              ${isSelected 
                                ? isGold
                                  ? 'bg-yellow-600 text-white border-2 border-yellow-400 shadow-lg shadow-yellow-500/50'
                                  : 'bg-green-600 text-white border-2 border-green-400'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                              }
                              ${hourlyFilterMode === "CUSTOM" 
                                ? 'cursor-pointer hover:scale-105 hover:border-green-500' 
                                : 'cursor-default opacity-75'
                              }
                            `}
                          >
                            {hour.toString().padStart(2, '0')}h
                            {isGold && (
                              <span className="absolute -top-1 -right-1 text-yellow-300">
                                ⭐
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-500">
                      {hourlyFilterMode === "CUSTOM" 
                        ? `Clique nos horários para selecionar. ${customHours.length} horário(s) selecionado(s).`
                        : `${customHours.length} horário(s) ativo(s) no modo ${hourlyFilterMode}.`
                      }
                    </p>
                  </div>
                )}
                
                <div className="space-y-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-400 text-xl">⭐</span>
                    <Label className="text-yellow-300 font-semibold">Modo GOLD (Opcional)</Label>
                  </div>
                  <p className="text-xs text-yellow-200">
                    Selecione até 2 horários especiais para operar com stake aumentado
                  </p>
                  
                  <div className="grid grid-cols-6 gap-2">
                    {customHours.map((hour) => {
                      const isGold = goldModeHours.includes(hour);
                      
                      return (
                        <button
                          key={hour}
                          type="button"
                          onClick={() => {
                            if (isGold) {
                              setGoldModeHours(goldModeHours.filter(h => h !== hour));
                            } else {
                              if (goldModeHours.length < 2) {
                                setGoldModeHours([...goldModeHours, hour].sort((a, b) => a - b));
                              } else {
                                toast.error("Máximo de 2 horários GOLD permitidos");
                              }
                            }
                          }}
                          className={`
                            relative p-3 rounded-lg font-medium text-sm transition-all cursor-pointer
                            ${isGold
                              ? 'bg-yellow-600 text-white border-2 border-yellow-400 shadow-lg shadow-yellow-500/50 scale-105'
                              : 'bg-slate-700 text-slate-300 border border-slate-600 hover:border-yellow-500'
                            }
                          `}
                        >
                          {hour.toString().padStart(2, '0')}h
                          {isGold && (
                            <span className="absolute -top-1 -right-1 text-yellow-300">
                              ⭐
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  
                  {goldModeHours.length > 0 && (
                    <div className="space-y-2 mt-4">
                      <Label htmlFor="goldModeStakeMultiplier" className="text-yellow-300">
                        Multiplicador de Stake GOLD
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="goldModeStakeMultiplier"
                          type="number"
                          step="0.1"
                          min="1"
                          value={goldModeStakeMultiplier}
                          onChange={(e) => setGoldModeStakeMultiplier(e.target.value)}
                          className="bg-slate-800 border-yellow-600 text-white"
                        />
                        <span className="text-yellow-300 font-medium">x</span>
                      </div>
                      <p className="text-xs text-yellow-200">
                        Nos horários GOLD ({goldModeHours.map(h => `${h}h`).join(', ')}), o stake será multiplicado por {goldModeStakeMultiplier}x
                      </p>
                    </div>
                  )}
                </div>
                
                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <p className="text-sm text-blue-300">
                    <strong>📊 Resumo da Configuração:</strong>
                  </p>
                  <ul className="text-xs text-blue-200 mt-2 space-y-1 ml-4">
                    <li>• <strong>Modo:</strong> {hourlyFilterMode}</li>
                    <li>• <strong>Horários Ativos:</strong> {customHours.length > 0 ? customHours.map(h => `${h}h`).join(', ') : 'Nenhum'}</li>
                    {goldModeHours.length > 0 && (
                      <li>• <strong>Horários GOLD:</strong> {goldModeHours.map(h => `${h}h`).join(', ')} (Stake {goldModeStakeMultiplier}x)</li>
                    )}
                    <li className="mt-2 text-blue-100">
                      ⚠️ O bot operará <strong>APENAS</strong> nos horários selecionados
                    </li>
                  </ul>
                </div>
              </CardContent>
            )}
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

