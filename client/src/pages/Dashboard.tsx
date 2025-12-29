import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { CandleChart } from "@/components/CandleChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Activity, DollarSign, TrendingDown, TrendingUp, Loader2, Play, Square, RotateCcw, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { BOT_STATES } from "@/const";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BotSelector, useBotSelector } from "@/components/BotSelector";
import { useBroker } from "@/contexts/BrokerContext";
import { BrokerIndicator } from "@/components/BrokerSwitch";
import { Badge } from "@/components/ui/badge";

/**
 * Dashboard Principal - Renderiza conteúdo baseado no broker selecionado
 * 
 * IMPORTANTE: Este componente escuta o BrokerContext e renderiza
 * conteúdo completamente diferente para cada corretora.
 */
export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const { broker, isDeriv, isICMarkets, currentConfig } = useBroker();

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

  // Renderização condicional baseada no broker
  if (isICMarkets) {
    return <ICMarketsDashboardContent />;
  }

  // Default: Deriv Dashboard
  return <DerivDashboardContent />;
}

/**
 * Dashboard IC Markets - Forex via cTrader
 * 
 * NOTA: Inclui seletor Bot 1/Bot 2 para consistência com DERIV.
 * Cada bot pode ter configurações independentes de IC Markets.
 */
function ICMarketsDashboardContent() {
  const { currentConfig } = useBroker();
  const { selectedBot, setSelectedBot } = useBotSelector();
  
  // Query de status de conexão IC Markets
  const connectionStatus = trpc.icmarkets.getConnectionStatus.useQuery(undefined, {
    refetchInterval: 5000,
  });
  
  const isConnected = connectionStatus.data?.connected === true;
  const accountInfo = connectionStatus.data?.accountInfo;
  
  // Mutations
  const connectMutation = trpc.icmarkets.connect.useMutation({
    onSuccess: () => {
      toast.success("Conectado ao IC Markets!");
      connectionStatus.refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao conectar: ${error.message}`);
    },
  });
  
  const disconnectMutation = trpc.icmarkets.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Desconectado do IC Markets");
      connectionStatus.refetch();
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950/20 to-slate-950">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header IC Markets */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-white">💹 IC Markets Dashboard</h1>
                <BrokerIndicator />
              </div>
              <p className="text-slate-400 mt-1">Forex Spot Trading via cTrader Open API</p>
            </div>
            {/* Seletor Bot 1/Bot 2 para IC Markets */}
            <BotSelector selectedBot={selectedBot} onBotChange={setSelectedBot} />
          </div>
          
          {/* Status de Conexão */}
          <div className="flex items-center gap-4">
            <Badge
              variant={isConnected ? "default" : "destructive"}
              className={`px-4 py-2 text-sm ${
                isConnected ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"
              }`}
            >
              {isConnected ? (
                <>
                  <Wifi className="w-4 h-4 mr-2" />
                  Conectado
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 mr-2" />
                  Desconectado
                </>
              )}
            </Badge>
            
            {isConnected ? (
              <Button
                variant="outline"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                {disconnectMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Desconectar"
                )}
              </Button>
            ) : (
              <Button
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {connectMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Conectar
              </Button>
            )}
          </div>
        </div>
        
        {/* Informações da Conta (quando conectado) */}
        {isConnected && accountInfo && (
          <Card className="bg-slate-900/50 border-blue-500/20">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-8">
                  <div>
                    <p className="text-slate-400 text-sm">Conta</p>
                    <p className="text-white font-mono text-lg">{accountInfo.accountId}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Saldo</p>
                    <p className="text-green-400 font-bold text-2xl">
                      {accountInfo.currency} {accountInfo.balance?.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Alavancagem</p>
                    <p className="text-white text-lg">1:{accountInfo.leverage}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Tipo</p>
                    <Badge variant={accountInfo.accountType === "demo" ? "secondary" : "destructive"}>
                      {accountInfo.accountType?.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Placeholder quando não conectado */}
        {!isConnected && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Placeholder Gráfico */}
            <Card className="bg-slate-900/50 border-slate-800 lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  Gráfico Forex - Aguardando Conexão
                </CardTitle>
                <CardDescription>
                  Conecte-se ao IC Markets para visualizar o gráfico em tempo real
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[400px] bg-slate-800/50 rounded-lg flex items-center justify-center border border-dashed border-slate-700">
                  <div className="text-center">
                    <WifiOff className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400 text-lg mb-2">Gráfico não disponível</p>
                    <p className="text-slate-500 text-sm mb-4">Configure suas credenciais em Configurações → IC Markets</p>
                    <Button
                      onClick={() => connectMutation.mutate()}
                      disabled={connectMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {connectMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Wifi className="w-4 h-4 mr-2" />
                      )}
                      Conectar ao IC Markets
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Cards de métricas placeholder */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white text-sm">Saldo IC Markets</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-500">---</div>
                <p className="text-slate-500 text-sm mt-1">Conecte para ver o saldo</p>
              </CardContent>
            </Card>
            
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white text-sm">Posições Abertas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-500">---</div>
                <p className="text-slate-500 text-sm mt-1">Conecte para ver posições</p>
              </CardContent>
            </Card>
          </div>
        )}
        
        {/* Conteúdo quando conectado */}
        {isConnected && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Cards de métricas */}
            <Card className="bg-slate-900/50 border-green-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-400" />
                  Saldo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-400">
                  {accountInfo?.currency} {accountInfo?.balance?.toFixed(2)}
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-slate-900/50 border-blue-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-400" />
                  Equity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-400">
                  {accountInfo?.currency} {accountInfo?.equity?.toFixed(2) || accountInfo?.balance?.toFixed(2)}
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-slate-900/50 border-purple-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-purple-400" />
                  P&L Hoje
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-400">$0.00</div>
              </CardContent>
            </Card>
            
            <Card className="bg-slate-900/50 border-yellow-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-yellow-400" />
                  Trades Hoje
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-400">0</div>
              </CardContent>
            </Card>
            
            {/* Placeholder do gráfico */}
            <Card className="bg-slate-900/50 border-slate-800 lg:col-span-4">
              <CardHeader>
                <CardTitle className="text-white">Gráfico Forex - USDJPY M15</CardTitle>
                <CardDescription>Preços em tempo real via cTrader</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[400px] bg-slate-800/50 rounded-lg flex items-center justify-center border border-slate-700">
                  <div className="text-center">
                    <Activity className="w-12 h-12 text-blue-400 mx-auto mb-4 animate-pulse" />
                    <p className="text-slate-300 text-lg">Conectado ao IC Markets</p>
                    <p className="text-slate-500 text-sm mt-2">Acesse a aba "Forex" para trading completo</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Dashboard Deriv - Binary Options & Synthetic Indices
 */
function DerivDashboardContent() {
  const { user } = useAuth();
  const { selectedBot, setSelectedBot } = useBotSelector();
  const { currentConfig } = useBroker();
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Queries
  const { data: botStatus, refetch: refetchStatus } = trpc.bot.status.useQuery(
    { botId: selectedBot },
    {
      enabled: !!user,
      refetchInterval: 2000,
    }
  );

  const { data: metrics, refetch: refetchMetrics } = trpc.dashboard.metrics.useQuery(
    { botId: selectedBot },
    {
      enabled: !!user,
      refetchInterval: 5000,
    }
  );

  const { data: balance } = trpc.dashboard.balance.useQuery(
    { botId: selectedBot },
    {
      enabled: !!user,
      refetchInterval: 10000,
    }
  );

  const { data: todayPositions } = trpc.positions.today.useQuery(
    { botId: selectedBot },
    {
      enabled: !!user,
      refetchInterval: 5000,
    }
  );

  const { data: config } = trpc.config.get.useQuery(
    { botId: selectedBot },
    {
      enabled: !!user,
    }
  );

  const { data: candles } = trpc.dashboard.liveCandles.useQuery(
    { symbol: config?.symbol || "R_100", limit: 50, botId: selectedBot },
    {
      enabled: !!user && !!config?.symbol,
      refetchInterval: 1000,
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
      toast.success("Dados diários resetados com sucesso!");
      refetchMetrics();
      refetchStatus();
    },
    onError: (error) => {
      toast.error(`Erro ao resetar dados: ${error.message}`);
    },
  });

  const handleStart = () => {
    setIsStarting(true);
    startBot.mutate({ botId: selectedBot });
  };

  const handleStop = () => {
    setIsStopping(true);
    stopBot.mutate({ botId: selectedBot });
  };

  const handleReset = () => {
    resetBot.mutate({ botId: selectedBot });
  };

  // Calcular tempo restante dinamicamente
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  
  useEffect(() => {
    const currentState = botStatus?.state || "IDLE";
    if (currentState === "WAITING_MIDPOINT" && botStatus?.candleStartTime) {
      const interval = setInterval(() => {
        const now = Math.floor(Date.now() / 1000);
        const candleStart = botStatus.candleStartTime || 0;
        const elapsed = now - candleStart;
        const waitTimeSeconds = (config?.waitTime || 8) * 60;
        const remaining = Math.max(0, waitTimeSeconds - elapsed);
        setTimeRemaining(remaining);
      }, 1000);
      
      return () => clearInterval(interval);
    } else {
      setTimeRemaining(null);
    }
  }, [botStatus?.state, botStatus?.candleStartTime, config?.waitTime]);
  
  // Atualizar relógio a cada segundo
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const isRunning = botStatus?.isRunning || false;
  const currentState = botStatus?.state || "IDLE";
  
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
          <div className="flex items-center gap-6">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-white">📊 Schimidt Trader System PRO</h1>
                <BrokerIndicator />
              </div>
              <p className="text-slate-400 mt-1">Sistema de Trading Automatizado 24/7 - Binary Options</p>
            </div>
            <BotSelector selectedBot={selectedBot} onBotChange={setSelectedBot} />
          </div>
          
          {/* Relógio GMT e Indicador de Horário */}
          <div className="flex flex-col items-end gap-2">
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2">
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs text-slate-400">Horário GMT</div>
                  <div className="text-lg font-mono font-bold text-blue-400">
                    {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' })}
                  </div>
                </div>
                {config?.hourlyFilterEnabled && (
                  <div className="border-l border-slate-600 pl-3">
                    {(() => {
                      const currentHour = currentTime.getUTCHours();
                      const allowedHours = config.hourlyFilterCustomHours ? JSON.parse(config.hourlyFilterCustomHours) : [];
                      const isAllowed = allowedHours.includes(currentHour);
                      const goldHours = config.hourlyFilterGoldHours ? JSON.parse(config.hourlyFilterGoldHours) : [];
                      const isGold = goldHours.includes(currentHour);
                      
                      return (
                        <div className="text-right">
                          <div className="text-xs text-slate-400">Status Horário</div>
                          <div className={`text-sm font-semibold ${
                            isGold ? 'text-yellow-400' : isAllowed ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {isGold ? '⭐ GOLD ATIVO' : isAllowed ? '✅ PERMITIDO' : '⚠️ BLOQUEADO'}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
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
            
            {/* Indicador de Condições de Mercado */}
            {botStatus?.marketCondition && (
              <div className="flex items-center gap-2 border-l border-slate-700 pl-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {botStatus.marketCondition.status === "GREEN" ? "🟢" : 
                     botStatus.marketCondition.status === "YELLOW" ? "🟡" : "🔴"}
                  </span>
                  <div>
                    <div className="text-xs text-slate-400">Condições de Mercado</div>
                    <div className={`text-sm font-semibold ${
                      botStatus.marketCondition.status === "GREEN" ? "text-green-400" : 
                      botStatus.marketCondition.status === "YELLOW" ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {botStatus.marketCondition.status}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cards de métricas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Saldo */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Saldo DERIV
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                ${balance?.balance ? (balance.balance / 100).toFixed(2) : "0.00"}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {config?.mode === "DEMO" ? "Conta Demo" : "Conta Real"}
              </p>
            </CardContent>
          </Card>

          {/* P&L Diário */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
                {dailyPnL >= 0 ? <TrendingUp className="w-4 h-4 text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
                P&L Diário
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${dailyPnL >= 0 ? "text-green-400" : "text-red-400"}`}>
                {dailyPnL >= 0 ? "+" : ""}${(dailyPnL / 100).toFixed(2)}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {dailyTrades} trades | {dailyLosses} losses
              </p>
            </CardContent>
          </Card>

          {/* P&L Mensal */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
                {monthlyPnL >= 0 ? <TrendingUp className="w-4 h-4 text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
                P&L Mensal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${monthlyPnL >= 0 ? "text-green-400" : "text-red-400"}`}>
                {monthlyPnL >= 0 ? "+" : ""}${(monthlyPnL / 100).toFixed(2)}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {metrics?.monthly.totalTrades || 0} trades
              </p>
            </CardContent>
          </Card>

          {/* Controles */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Controles
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {!isRunning ? (
                  <Button
                    onClick={handleStart}
                    disabled={isStarting}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  </Button>
                ) : (
                  <Button
                    onClick={handleStop}
                    disabled={isStopping}
                    variant="destructive"
                    className="flex-1"
                  >
                    {isStopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                  </Button>
                )}
                <Button
                  onClick={handleReset}
                  variant="outline"
                  className="border-slate-700"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gráfico */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Gráfico {config?.symbol || "R_100"}</CardTitle>
            <CardDescription>
              Timeframe: {config?.timeframe === 900 ? "M15" : config?.timeframe === 1800 ? "M30" : "M60"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {candles && candles.length > 0 ? (
              <CandleChart data={candles} height={400} />
            ) : (
              <div className="h-[400px] bg-slate-800/50 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 text-slate-500 mx-auto mb-2 animate-spin" />
                  <p className="text-slate-400">Carregando dados...</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Posições do dia */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Posições de Hoje</CardTitle>
            <CardDescription>
              {todayPositions?.length || 0} posições registradas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!todayPositions || todayPositions.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                Nenhuma posição hoje
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {todayPositions.map((position: any) => (
                  <div
                    key={position.id}
                    className={`p-4 rounded-lg border ${
                      position.status === "CLOSED"
                        ? position.pnl && position.pnl > 0
                          ? "bg-green-500/10 border-green-500/30"
                          : "bg-red-500/10 border-red-500/30"
                        : "bg-slate-800/50 border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className={`text-lg ${position.direction === "up" ? "text-green-400" : "text-red-400"}`}>
                          {position.direction === "up" ? "📈" : "📉"}
                        </span>
                        <div>
                          <span className="text-white font-medium">{position.symbol}</span>
                          <span className="text-slate-400 text-sm ml-2">#{position.id}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-bold ${
                          position.status === "CLOSED"
                            ? position.pnl && position.pnl > 0 ? "text-green-400" : "text-red-400"
                            : "text-slate-300"
                        }`}>
                          {position.status === "CLOSED" && position.pnl
                            ? `${position.pnl > 0 ? "+" : ""}$${(position.pnl / 100).toFixed(2)}`
                            : position.status}
                        </div>
                        <div className="text-xs text-slate-500">
                          {position.strategy || "Standard"}
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
