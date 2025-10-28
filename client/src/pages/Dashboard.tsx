import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { CandleChart } from "@/components/CandleChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Activity, DollarSign, TrendingDown, TrendingUp, Loader2, Play, Square } from "lucide-react";
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
        const remaining = Math.max(0, 480 - elapsed); // 480s = 8 minutos
        setTimeRemaining(remaining);
      }, 1000);
      
      return () => clearInterval(interval);
    } else {
      setTimeRemaining(null);
    }
  }, [currentState, botStatus?.candleStartTime]);
  
  // Label dinâmico baseado no tempo restante
  let stateLabel: string = BOT_STATES[currentState as keyof typeof BOT_STATES] || currentState;
  if (currentState === "WAITING_MIDPOINT" && timeRemaining !== null) {
    const minutesRemaining = Math.ceil(timeRemaining / 60);
    stateLabel = `Aguardando ${minutesRemaining} minuto${minutesRemaining !== 1 ? 's' : ''}`;
  }

  const dailyPnL = metrics?.daily.pnl || 0;
  const monthlyPnL = metrics?.monthly.pnl || 0;
  const dailyTrades = metrics?.daily.totalTrades || 0;
  const dailyLosses = metrics?.daily.losses || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Schimidt Trader System PRO</h1>
            <p className="text-slate-400 mt-1">Sistema de Trading Automatizado 24/7</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  isRunning ? "bg-green-500 animate-pulse" : currentState === "ERROR_API" ? "bg-yellow-500" : "bg-red-500"
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
              Histórico de operações realizadas hoje
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!todayPositions || todayPositions.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                Nenhuma posição aberta hoje
              </div>
            ) : (
              <div className="space-y-2">
                {todayPositions.map((position) => (
                  <div
                    key={position.id}
                    className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          position.direction === "up"
                            ? "bg-green-500/20 text-green-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {position.direction === "up" ? "CALL" : "PUT"}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{position.symbol}</div>
                        <div className="text-xs text-slate-400">
                          Entrada: {parseFloat(position.entryPrice).toFixed(4)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-sm font-semibold ${
                          (position.pnl || 0) >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        ${((position.pnl || 0) / 100).toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-400">{position.status}</div>
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

