import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { CandleChart } from "@/components/CandleChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Activity, DollarSign, TrendingDown, TrendingUp, Loader2, Play, Square, RotateCcw, Clock } from "lucide-react";
import { BOT_STATES } from "@/const";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  // Queries
  const { data: botStatus, refetch: refetchStatus } = trpc.bot.status.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 2000, // Atualizar a cada 2 segundos
  });

  const { data: metrics, refetch: refetchMetrics } = trpc.dashboard.metrics.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 5000,
  });

  const { data: balance } = trpc.dashboard.balance.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 10000,
  });

  const { data: todayPositions } = trpc.positions.today.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 5000,
  });

  const { data: config } = trpc.config.get.useQuery(undefined, {
    enabled: !!user,
  });

  const { data: candles } = trpc.dashboard.liveCandles.useQuery(
    { symbol: config?.symbol || "R_100", limit: 50 },
    {
      enabled: !!user && !!config?.symbol,
      refetchInterval: 1000, // Atualizar a cada 1 segundo (tempo real)
      refetchOnWindowFocus: false,
    }
  );

  // Mutations
  const startBot = trpc.bot.start.useMutation({
    onSuccess: () => {
      toast.success("Bot iniciado com sucesso");
      refetchStatus();
      setIsStarting(false);
    },
    onError: (error) => {
      toast.error(`Erro ao iniciar bot: ${error.message}`);
      setIsStarting(false);
    },
  });

  const stopBot = trpc.bot.stop.useMutation({
    onSuccess: () => {
      toast.success("Bot parado com sucesso");
      refetchStatus();
      setIsStopping(false);
    },
    onError: (error) => {
      toast.error(`Erro ao parar bot: ${error.message}`);
      setIsStopping(false);
    },
  });

  const resetBot = trpc.bot.reset.useMutation({
    onSuccess: () => {
      toast.success("Estado do bot resetado");
      refetchStatus();
    },
    onError: (error) => {
      toast.error(`Erro ao resetar bot: ${error.message}`);
    },
  });

  const resetDailyData = trpc.dashboard.resetDailyData.useMutation({
    onSuccess: () => {
      toast.success("Dados di\u00e1rios resetados com sucesso!");
      refetchMetrics();
      refetchStatus();
    },
    onError: (error) => {
      toast.error(`Erro ao resetar dados: ${error.message}`);
    },
  });

  const handleStart = () => {
    setIsStarting(true);
    startBot.mutate();
  };

  const handleStop = () => {
    setIsStopping(true);
    stopBot.mutate();
  };

  const handleReset = () => {
    resetBot.mutate();
  };

  const handleResetDailyData = () => {
    if (confirm("Tem certeza que deseja resetar todos os dados di\u00e1rios? Esta a\u00e7\u00e3o n\u00e3o pode ser desfeita.")) {
      resetDailyData.mutate();
    }
  };

  if (authLoading) {
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
            <CardDescription>Você precisa estar autenticado para acessar o dashboard</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const isRunning = botStatus?.isRunning || false;
  const currentState = botStatus?.state || "IDLE";
  
  // Calcular tempo restante dinamicamente
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  
  useEffect(() => {
    if (currentState === "WAITING_MIDPOINT" && botStatus?.candleStartTime) {
      const interval = setInterval(() => {
        const now = Math.floor(Date.now() / 1000); // Timestamp atual em segundos
        const candleStart = botStatus.candleStartTime || 0;
        const elapsed = now - candleStart; // Tempo decorrido desde início do candle
        // Usar waitTime da configuração (em minutos) convertido para segundos
        const waitTimeSeconds = (config?.waitTime || 8) * 60; // Default 8 minutos se não configurado
        const remaining = Math.max(0, waitTimeSeconds - elapsed);
        setTimeRemaining(remaining);
      }, 1000);
      
      return () => clearInterval(interval);
    } else {
      setTimeRemaining(null);
    }
  }, [currentState, botStatus?.candleStartTime, config?.waitTime]);
  
  // Label dinâmico baseado no tempo restante
  let stateLabel: string = BOT_STATES[currentState as keyof typeof BOT_STATES] || currentState;
  if (currentState === "WAITING_MIDPOINT" && timeRemaining !== null) {
    const minutesRemaining = Math.ceil(timeRemaining / 60);
    stateLabel = `Aguardando ${minutesRemaining} minuto${minutesRemaining !== 1 ? 's' : ''}`;
  }
  
  // Label para WAITING_NEXT_HOUR com próximo horário
  if (currentState === "WAITING_NEXT_HOUR" && botStatus?.hourlyStatus) {
    const { nextAllowedHour, isGold } = botStatus.hourlyStatus;
    if (nextAllowedHour !== null) {
      stateLabel = `Aguardando próximo horário: ${nextAllowedHour}h UTC${isGold ? ' ⭐' : ''}`;
    }
  }

  const dailyPnL = metrics?.daily.pnl || 0;
  const monthlyPnL = metrics?.monthly.pnl || 0;
  const dailyTrades = metrics?.daily.totalTrades || 0;
  const dailyLosses = metrics?.daily.losses || 0;

  // Relógio UTC
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  
  const utcHour = currentTime.getUTCHours();
  const utcMinute = currentTime.getUTCMinutes();
  const utcSecond = currentTime.getUTCSeconds();
  const utcTimeString = `${String(utcHour).padStart(2, '0')}:${String(utcMinute).padStart(2, '0')}:${String(utcSecond).padStart(2, '0')}`;
  
  // Verificar se o horário atual está permitido
  const isAllowedHour = botStatus?.hourlyStatus?.isAllowed || false;
  const isGoldHour = botStatus?.hourlyStatus?.isGold || false;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header com Relógio UTC */}
        <div className="flex flex-col items-center gap-4">
          {/* Relógio UTC */}
          <div className="flex items-center gap-3 px-6 py-3 rounded-lg bg-slate-800/50 border border-slate-700">
            <Clock className="w-5 h-5 text-slate-400" />
            <div className="flex flex-col">
              <span className="text-xs text-slate-400">Horário UTC</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-mono font-bold text-white">{utcTimeString}</span>
                {config?.hourlyFilterEnabled && (
                  <span className={`text-xs px-2 py-1 rounded ${
                    isAllowedHour 
                      ? isGoldHour
                        ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                        : 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    {isAllowedHour ? (isGoldHour ? '⭐ GOLD' : '✓ Permitido') : '✗ Bloqueado'}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Bot Status e Botões */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  isRunning && currentState !== "WAITING_NEXT_HOUR" 
                    ? "bg-green-500 animate-pulse" 
                    : currentState === "ERROR_API" 
                      ? "bg-yellow-500" 
                      : currentState === "WAITING_NEXT_HOUR"
                        ? "bg-yellow-400 animate-pulse"
                        : "bg-red-500"
                }`}
              />
              <span className="text-sm text-slate-300">{stateLabel}</span>
            </div>
            {currentState === "ERROR_API" && (
              <Button
                onClick={handleReset}
                disabled={resetBot.isPending}
                variant="outline"
                className="gap-2"
              >
                {resetBot.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                Limpar Erro
              </Button>
            )}
            <Button
              onClick={handleResetDailyData}
              disabled={resetDailyData.isPending || currentState === "ENTERED"}
              variant="outline"
              className="gap-2"
              title={currentState === "ENTERED" ? "N\u00e3o \u00e9 poss\u00edvel resetar com posi\u00e7\u00e3o aberta" : "Resetar dados di\u00e1rios"}
            >
              {resetDailyData.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              Resetar Dados
            </Button>
            {isRunning ? (
              <Button
                onClick={handleStop}
                disabled={isStopping}
                variant="destructive"
                className="gap-2"
              >
                {isStopping ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                Parar Bot
              </Button>
            ) : (
              <Button
                onClick={handleStart}
                disabled={isStarting}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                {isStarting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Iniciar Bot
              </Button>
            )}
          </div>
        </div>

        {/* Métricas principais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">Saldo</CardTitle>
              <DollarSign className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                ${((balance?.balance || 0) / 100).toFixed(2)}
              </div>
              <p className="text-xs text-slate-400 mt-1">{balance?.currency || "USD"}</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">PnL Diário</CardTitle>
              {dailyPnL >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${
                  dailyPnL >= 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                ${(dailyPnL / 100).toFixed(2)}
              </div>
              <p className="text-xs text-slate-400 mt-1">Hoje</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">PnL Mensal</CardTitle>
              {monthlyPnL >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${
                  monthlyPnL >= 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                ${(monthlyPnL / 100).toFixed(2)}
              </div>
              <p className="text-xs text-slate-400 mt-1">Este mês</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">Trades Hoje</CardTitle>
              <Activity className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{dailyTrades}</div>
              <p className="text-xs text-slate-400 mt-1">{dailyLosses} perdas</p>
            </CardContent>
          </Card>
        </div>

        {/* Gráfico de Candles M15 */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Gráfico M15 - {config?.symbol || "R_100"}</CardTitle>
            <CardDescription className="text-slate-400">
              Candles em tempo real com linhas de referência
            </CardDescription>
          </CardHeader>
          <CardContent>
            {candles && candles.length > 0 ? (
              <CandleChart
                data={candles.map((c: any) => ({
                  timestamp: Number(c.timestampUtc),
                  open: parseFloat(c.open),
                  high: parseFloat(c.high),
                  low: parseFloat(c.low),
                  close: parseFloat(c.close),
                }))}
              />
            ) : (
              <div className="text-center py-12 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                Carregando candles...
              </div>
            )}
          </CardContent>
        </Card>

        {/* Posições de hoje */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Posições de Hoje</CardTitle>
            <CardDescription className="text-slate-400">
              Histórico detalhado de operações realizadas hoje
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!todayPositions || todayPositions.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                Nenhuma posição aberta hoje
              </div>
            ) : (
              <div className="space-y-4">
                {todayPositions.map((position) => (
                  <div
                    key={position.id}
                    className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-3"
                  >
                    {/* Cabeçalho da posição */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`px-3 py-1 rounded text-sm font-bold ${
                            position.direction === "up"
                              ? "bg-green-500/20 text-green-400 border border-green-500/30"
                              : "bg-red-500/20 text-red-400 border border-red-500/30"
                          }`}
                        >
                          {position.direction === "up" ? "CALL" : "PUT"}
                        </div>
                        <div>
                          <div className="text-base font-semibold text-white">{position.symbol}</div>
                          <div className="text-xs text-slate-400">
                            {new Date(position.createdAt).toLocaleTimeString('pt-BR')}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`text-lg font-bold ${
                            (position.pnl || 0) >= 0 ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {(position.pnl || 0) >= 0 ? "+" : ""}${((position.pnl || 0) / 100).toFixed(2)}
                        </div>
                        <div className="text-xs text-slate-400">{position.status}</div>
                      </div>
                    </div>

                    {/* Grid de informações detalhadas */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-700">
                      {/* Dados do Candle */}
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Abertura</div>
                        <div className="text-sm font-medium text-slate-200">
                          {position.candleOpen ? parseFloat(position.candleOpen).toFixed(4) : "N/A"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Máxima</div>
                        <div className="text-sm font-medium text-green-400">
                          {position.candleHigh ? parseFloat(position.candleHigh).toFixed(4) : "N/A"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Mínima</div>
                        <div className="text-sm font-medium text-red-400">
                          {position.candleLow ? parseFloat(position.candleLow).toFixed(4) : "N/A"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Entrada</div>
                        <div className="text-sm font-medium text-blue-400">
                          {parseFloat(position.entryPrice).toFixed(4)}
                        </div>
                      </div>
                      
                      {/* Predição e Gatilho */}
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Predição</div>
                        <div className="text-sm font-medium text-purple-400">
                          {parseFloat(position.predictedClose).toFixed(4)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Gatilho</div>
                        <div className="text-sm font-medium text-yellow-400">
                          {parseFloat(position.trigger).toFixed(4)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Pips</div>
                        <div className="text-sm font-medium text-cyan-400">
                          {Math.abs(parseFloat(position.trigger) - parseFloat(position.predictedClose)).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Stake</div>
                        <div className="text-sm font-medium text-slate-200">
                          ${(position.stake / 100).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

