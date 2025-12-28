import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2, Activity, Clock, TrendingUp, AlertCircle } from "lucide-react";
import { useMemo } from "react";
import { BotSelector, useBotSelector } from "@/components/BotSelector";
import { useBroker } from "@/contexts/BrokerContext";
import { BrokerIndicator } from "@/components/BrokerSwitch";

export default function Logs() {
  const { user, loading: authLoading } = useAuth();
  const { selectedBot, setSelectedBot } = useBotSelector();
  const { broker, isDeriv, currentConfig } = useBroker();

  const { data: logs, isLoading } = trpc.logs.recent.useQuery(
    { limit: 200, botId: selectedBot },
    {
      enabled: !!user,
      refetchInterval: 3000,
    }
  );

  // Buscar status do bot para obter timestamp do candle atual
  const { data: botStatus } = trpc.bot.status.useQuery(
    { botId: selectedBot },
    {
      enabled: !!user,
      refetchInterval: 2000,
    }
  );

  // Filtrar logs da operação atual (candle atual)
  const currentOperationLogs = useMemo(() => {
    if (!logs || !botStatus?.currentCandleTimestamp) return [];
    
    // Logs que pertencem ao candle atual
    // Usar timeframe dinâmico do bot (900=M15, 1800=M30, 3600=M60)
    const candleStart = botStatus.currentCandleTimestamp;
    const timeframe = botStatus.timeframe || 900; // Default M15 se não especificado
    const candleEnd = candleStart + timeframe;
    
    // Eventos de fechamento do candle anterior que devem ser excluídos
    const closingEventTypes = [
      'CANDLE_CLOSED',
      'CANDLE_FORCED_CLOSE',
      'CONTRACT_CLOSE_DEBUG',
      'WARNING',
      'PNL_CALCULATION',
      'POSITION_CLOSED'
    ];
    
    return logs.filter(log => {
      // Verificar se está dentro do intervalo do candle atual
      const isInCurrentCandle = log.timestampUtc >= candleStart && log.timestampUtc < candleEnd;
      
      if (!isInCurrentCandle) return false;
      
      // Se o evento aconteceu exatamente no início do candle (mesmo segundo)
      // e é um evento de fechamento, excluir (pertence ao candle anterior)
      if (log.timestampUtc === candleStart && closingEventTypes.includes(log.eventType)) {
        return false;
      }
      
      return true;
    });
  }, [logs, botStatus?.currentCandleTimestamp]);

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
            <CardDescription>Você precisa estar autenticado para acessar os logs</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

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
              <h1 className="text-3xl font-bold text-white">Log de Eventos</h1>
              <p className="text-slate-400 mt-1">Monitoramento em tempo real do sistema (UTC)</p>
            </div>
            <BrokerIndicator />
          </div>
          <BotSelector selectedBot={selectedBot} onBotChange={setSelectedBot} />
        </div>

        {/* SEÇÃO NOVA: Operação Atual */}
        <Card className="bg-gradient-to-br from-blue-950/40 via-slate-900/60 to-purple-950/40 border-4 border-blue-600/60 shadow-2xl ring-2 ring-blue-500/30">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Activity className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-white text-xl">Operação Atual</CardTitle>
                  <CardDescription className="text-slate-400">
                    Eventos do candle em andamento
                  </CardDescription>
                </div>
              </div>
              {botStatus?.currentCandleTimestamp && (
                <div className="text-right">
                  <div className="text-xs text-slate-500 font-mono">Candle iniciado em</div>
                  <div className="text-sm text-blue-400 font-mono">
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
                  <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                </div>
                <p className="text-slate-400 text-lg">Processando candle atual...</p>
                <p className="text-slate-500 text-sm mt-2">Aguardando eventos</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {currentOperationLogs.map((log, index) => (
                  <div
                    key={log.id}
                    className="group relative flex items-start gap-4 p-4 bg-slate-800/60 rounded-xl border border-slate-700/50 hover:border-blue-600/50 hover:bg-slate-800/80 transition-all duration-200"
                  >
                    {/* Linha de conexão entre eventos */}
                    {index < currentOperationLogs.length - 1 && (
                      <div className="absolute left-8 top-14 w-0.5 h-8 bg-gradient-to-b from-slate-600 to-transparent" />
                    )}
                    
                    {/* Ícone do evento */}
                    <div className={`flex-shrink-0 p-2 rounded-lg ${getEventColor(log.eventType)} bg-slate-900/50`}>
                      {getEventIcon(log.eventType)}
                    </div>
                    
                    {/* Conteúdo do evento */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-md ${getEventColor(
                            log.eventType
                          )} bg-slate-900/70`}
                        >
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

        {/* SEÇÃO ORIGINAL: Histórico Completo */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Histórico Completo</CardTitle>
            <CardDescription className="text-slate-400">
              Últimos 200 eventos do sistema
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
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded ${getEventColor(
                          log.eventType
                        )} bg-slate-800`}
                      >
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
