import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2, Activity, Clock, TrendingUp, AlertCircle, Wifi, WifiOff, DollarSign, Target } from "lucide-react";
import { useMemo } from "react";
import { BotSelector, useBotSelector } from "@/components/BotSelector";
import { useBroker } from "@/contexts/BrokerContext";
import { BrokerIndicator } from "@/components/BrokerSwitch";
import { Badge } from "@/components/ui/badge";

/**
 * Página de Logs - Isolada por Corretora
 * 
 * IMPORTANTE: Esta página exibe logs APENAS da corretora selecionada no Global Broker Switch.
 * - Modo DERIV: Exibe logs do bot de Binary Options
 * - Modo IC MARKETS: Exibe logs de operações Forex
 * 
 * Não há mistura de logs entre corretoras.
 */
export default function Logs() {
  const { user, loading: authLoading } = useAuth();
  const { selectedBot, setSelectedBot } = useBotSelector();
  const { broker, isDeriv, isICMarkets, currentConfig } = useBroker();

  // ============= LOGS DERIV =============
  const { data: derivLogs, isLoading: derivLogsLoading } = trpc.logs.recent.useQuery(
    { limit: 200, botId: selectedBot, brokerType: "DERIV" as const },
    {
      enabled: !!user && isDeriv,
      refetchInterval: 3000,
    }
  );

  // Buscar status do bot DERIV para obter timestamp do candle atual
  const { data: botStatus } = trpc.bot.status.useQuery(
    { botId: selectedBot },
    {
      enabled: !!user && isDeriv,
      refetchInterval: 2000,
    }
  );

  // ============= LOGS IC MARKETS =============
  const { data: icConnectionStatus } = trpc.icmarkets.getConnectionStatus.useQuery(undefined, {
    enabled: !!user && isICMarkets,
    refetchInterval: 5000,
  });

  const { data: icPositions } = trpc.icmarkets.getOpenPositions.useQuery(undefined, {
    enabled: !!user && isICMarkets && icConnectionStatus?.connected === true,
    refetchInterval: 5000,
  });

  const { data: icPositionHistory } = trpc.icmarkets.getPositionHistory.useQuery(
    { limit: 50 },
    {
      enabled: !!user && isICMarkets,
      refetchInterval: 10000,
    }
  );

  // Filtrar logs da operação atual (candle atual) - APENAS DERIV
  const currentOperationLogs = useMemo(() => {
    if (!isDeriv || !derivLogs || !botStatus?.currentCandleTimestamp) return [];
    
    const candleStart = botStatus.currentCandleTimestamp;
    const timeframe = botStatus.timeframe || 900;
    const candleEnd = candleStart + timeframe;
    
    const closingEventTypes = [
      'CANDLE_CLOSED',
      'CANDLE_FORCED_CLOSE',
      'CONTRACT_CLOSE_DEBUG',
      'WARNING',
      'PNL_CALCULATION',
      'POSITION_CLOSED'
    ];
    
    return derivLogs.filter(log => {
      const isInCurrentCandle = log.timestampUtc >= candleStart && log.timestampUtc < candleEnd;
      if (!isInCurrentCandle) return false;
      if (log.timestampUtc === candleStart && closingEventTypes.includes(log.eventType)) {
        return false;
      }
      return true;
    });
  }, [isDeriv, derivLogs, botStatus?.currentCandleTimestamp]);

  if (authLoading || (isDeriv && derivLogsLoading)) {
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
            <CardDescription>Você precisa estar autenticado para acessar os logs</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // ============= RENDERIZAÇÃO CONDICIONAL POR CORRETORA =============
  if (isICMarkets) {
    return <ICMarketsLogsContent 
      connectionStatus={icConnectionStatus}
      positions={icPositions?.stored}
      positionHistory={icPositionHistory}
    />;
  }

  // Default: Deriv Logs
  return (
    <DerivLogsContent 
      logs={derivLogs}
      botStatus={botStatus}
      currentOperationLogs={currentOperationLogs}
      selectedBot={selectedBot}
      setSelectedBot={setSelectedBot}
    />
  );
}

// ============= COMPONENTE DE LOGS DERIV =============
interface DerivLogsContentProps {
  logs: any[] | undefined;
  botStatus: any;
  currentOperationLogs: any[];
  selectedBot: number;
  setSelectedBot: (bot: number) => void;
}

function DerivLogsContent({ logs, botStatus, currentOperationLogs, selectedBot, setSelectedBot }: DerivLogsContentProps) {
  const getEventColor = (eventType: string) => {
    switch (eventType) {
      case "BOT_STARTED":
        return "text-green-400";
      case "BOT_STOPPED":
        return "text-yellow-400";
      case "PREDICTION_MADE":
        return "text-blue-400";
      case "POSITION_ARMED":
        return "text-purple-400";
      case "POSITION_ENTERED":
        return "text-cyan-400";
      case "POSITION_CLOSED":
        return "text-indigo-400";
      case "STOP_DAILY_HIT":
      case "TAKE_DAILY_HIT":
        return "text-orange-400";
      case "ERROR":
        return "text-red-400";
      default:
        return "text-slate-400";
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "BOT_STARTED":
      case "BOT_STOPPED":
        return <Activity className="w-4 h-4" />;
      case "PREDICTION_MADE":
        return <TrendingUp className="w-4 h-4" />;
      case "POSITION_ARMED":
      case "POSITION_ENTERED":
      case "POSITION_CLOSED":
        return <Clock className="w-4 h-4" />;
      case "ERROR":
      case "STOP_DAILY_HIT":
      case "TAKE_DAILY_HIT":
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "UTC",
    });
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "UTC",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto p-6 space-y-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white">📊 Log de Eventos - DERIV</h1>
              <p className="text-slate-400 mt-1">Monitoramento em tempo real do sistema (UTC)</p>
            </div>
            <BrokerIndicator />
          </div>
          <BotSelector selectedBot={selectedBot} onBotChange={setSelectedBot} />
        </div>

        {/* SEÇÃO: Operação Atual */}
        <Card className="bg-gradient-to-br from-red-950/40 via-slate-900/60 to-orange-950/40 border-4 border-red-600/60 shadow-2xl ring-2 ring-red-500/30">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <Activity className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <CardTitle className="text-white text-xl">Operação Atual - Bot {selectedBot}</CardTitle>
                  <CardDescription className="text-slate-400">
                    Eventos do candle em andamento (Binary Options)
                  </CardDescription>
                </div>
              </div>
              {botStatus?.currentCandleTimestamp && (
                <div className="text-right">
                  <div className="text-xs text-slate-500 font-mono">Candle iniciado em</div>
                  <div className="text-sm text-red-400 font-mono">
                    {formatTime(botStatus.currentCandleTimestamp)}
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!botStatus?.currentCandleTimestamp || !botStatus?.isRunning ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800/50 mb-4">
                  <Clock className="w-8 h-8 text-slate-600" />
                </div>
                <p className="text-slate-400 text-lg">Aguardando início de operação</p>
                <p className="text-slate-500 text-sm mt-2">
                  {botStatus?.isRunning 
                    ? "Coletando dados do candle..." 
                    : "Inicie o bot para começar a operar"}
                </p>
              </div>
            ) : currentOperationLogs.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800/50 mb-4">
                  <Loader2 className="w-8 h-8 text-red-400 animate-spin" />
                </div>
                <p className="text-slate-400 text-lg">Processando candle atual...</p>
                <p className="text-slate-500 text-sm mt-2">Aguardando eventos</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {currentOperationLogs.map((log, index) => (
                  <div
                    key={log.id}
                    className="group relative flex items-start gap-4 p-4 bg-slate-800/60 rounded-xl border border-slate-700/50 hover:border-red-600/50 hover:bg-slate-800/80 transition-all duration-200"
                  >
                    {index < currentOperationLogs.length - 1 && (
                      <div className="absolute left-8 top-14 w-0.5 h-8 bg-gradient-to-b from-slate-600 to-transparent" />
                    )}
                    <div className={`flex-shrink-0 p-2 rounded-lg ${getEventColor(log.eventType)} bg-slate-900/50`}>
                      {getEventIcon(log.eventType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-md ${getEventColor(log.eventType)} bg-slate-900/70`}>
                          {log.eventType}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          {formatTime(log.timestampUtc)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-200 leading-relaxed">{log.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* SEÇÃO: Histórico Completo */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Histórico Completo - DERIV</CardTitle>
            <CardDescription className="text-slate-400">
              Últimos 200 eventos do sistema (Binary Options)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!logs || logs.length === 0 ? (
              <div className="text-center py-8 text-slate-400">Nenhum evento registrado</div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex-shrink-0 w-32 text-xs text-slate-500 font-mono">
                      {formatTimestamp(log.timestampUtc)}
                    </div>
                    <div className="flex-shrink-0">
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${getEventColor(log.eventType)} bg-slate-800`}>
                        {log.eventType}
                      </span>
                    </div>
                    <div className="flex-1 text-sm text-slate-300">{log.message}</div>
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

// ============= COMPONENTE DE LOGS IC MARKETS =============
interface ICMarketsLogsContentProps {
  connectionStatus: any;
  positions: any[] | undefined;
  positionHistory: any[] | undefined;
}

function ICMarketsLogsContent({ connectionStatus, positions, positionHistory }: ICMarketsLogsContentProps) {
  const isConnected = connectionStatus?.connected === true;

  const formatDateTime = (date: Date | string | null) => {
    if (!date) return "-";
    const d = new Date(date);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "UTC",
    });
  };

  const getDirectionColor = (direction: string) => {
    return direction === "BUY" ? "text-green-400" : "text-red-400";
  };

  const getPnLColor = (pnl: number | null) => {
    if (pnl === null) return "text-slate-400";
    return pnl >= 0 ? "text-green-400" : "text-red-400";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "OPEN":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">ABERTA</Badge>;
      case "CLOSED":
        return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">FECHADA</Badge>;
      case "PENDING":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">PENDENTE</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950/20 to-slate-950">
      <div className="container mx-auto p-6 space-y-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white">💹 Log de Operações - IC MARKETS</h1>
              <p className="text-slate-400 mt-1">Histórico de posições Forex via cTrader (UTC)</p>
            </div>
            <BrokerIndicator />
          </div>
          
          {/* Status de Conexão */}
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
        </div>

        {/* SEÇÃO: Posições Abertas */}
        <Card className="bg-gradient-to-br from-blue-950/40 via-slate-900/60 to-cyan-950/40 border-4 border-blue-600/60 shadow-2xl ring-2 ring-blue-500/30">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Target className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-white text-xl">Posições Abertas</CardTitle>
                <CardDescription className="text-slate-400">
                  Operações Forex em andamento
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!isConnected ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800/50 mb-4">
                  <WifiOff className="w-8 h-8 text-slate-600" />
                </div>
                <p className="text-slate-400 text-lg">Não conectado ao IC Markets</p>
                <p className="text-slate-500 text-sm mt-2">
                  Conecte-se para visualizar posições abertas
                </p>
              </div>
            ) : !positions || positions.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800/50 mb-4">
                  <Activity className="w-8 h-8 text-blue-400" />
                </div>
                <p className="text-slate-400 text-lg">Nenhuma posição aberta</p>
                <p className="text-slate-500 text-sm mt-2">
                  Aguardando sinais de entrada
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {positions.map((position) => (
                  <div
                    key={position.id}
                    className="flex items-center justify-between p-4 bg-slate-800/60 rounded-xl border border-slate-700/50 hover:border-blue-600/50 transition-all duration-200"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${position.direction === "BUY" ? "bg-green-500/20" : "bg-red-500/20"}`}>
                        {position.direction === "BUY" ? (
                          <TrendingUp className={`w-5 h-5 ${getDirectionColor(position.direction)}`} />
                        ) : (
                          <AlertCircle className={`w-5 h-5 ${getDirectionColor(position.direction)}`} />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold">{position.symbol}</span>
                          <span className={`text-sm font-medium ${getDirectionColor(position.direction)}`}>
                            {position.direction}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          Lotes: {position.lots} | Entrada: {position.entryPrice}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${getPnLColor(position.pnlUsd)}`}>
                        {position.pnlUsd !== null ? `$${Number(position.pnlUsd).toFixed(2)}` : "-"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {position.pnlPips !== null ? `${Number(position.pnlPips).toFixed(1)} pips` : "-"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* SEÇÃO: Histórico de Posições */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-slate-400" />
              <div>
                <CardTitle className="text-white">Histórico de Posições - IC MARKETS</CardTitle>
                <CardDescription className="text-slate-400">
                  Últimas 50 operações Forex fechadas
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!positionHistory || positionHistory.length === 0 ? (
              <div className="text-center py-8 text-slate-400">Nenhuma posição no histórico</div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {positionHistory.map((position) => (
                  <div
                    key={position.id}
                    className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-28 text-xs text-slate-500 font-mono">
                        {formatDateTime(position.closeTime)}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{position.symbol}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getDirectionColor(position.direction)} bg-slate-800`}>
                          {position.direction}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500">
                        {position.lots} lotes
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      {getStatusBadge(position.status)}
                      <div className={`text-sm font-bold ${getPnLColor(position.pnlUsd)}`}>
                        {position.pnlUsd !== null ? `$${Number(position.pnlUsd).toFixed(2)}` : "-"}
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
