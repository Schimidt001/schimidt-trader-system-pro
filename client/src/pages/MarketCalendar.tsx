import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Loader2, Calendar, TrendingUp, AlertTriangle, Clock, Info, Activity, RefreshCw } from "lucide-react";
import { useBotSelector } from "@/components/BotSelector";
import { useState } from "react";

export default function MarketCalendar() {
  const { user, loading: authLoading } = useAuth();
  const { selectedBot } = useBotSelector();
  const [isCollecting, setIsCollecting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  
  // Mutation para forçar coleta de notícias
  const collectNewsMutation = trpc.marketDetector.collectNews.useMutation({
    onSuccess: () => {
      // Refetch das queries de eventos
      trpc.useContext().marketEvents.upcoming.invalidate();
      trpc.useContext().marketEvents.recent.invalidate();
      setIsCollecting(false);
    },
    onError: (error) => {
      console.error("Erro ao coletar notícias:", error);
      setIsCollecting(false);
    },
  });
  
  // Mutation para limpar eventos
  const clearEventsMutation = trpc.marketDetector.clearMarketEvents.useMutation({
    onSuccess: (data) => {
      // Refetch das queries de eventos
      trpc.useContext().marketEvents.upcoming.invalidate();
      trpc.useContext().marketEvents.recent.invalidate();
      setIsClearing(false);
      console.log(data.message);
    },
    onError: (error) => {
      console.error("Erro ao limpar eventos:", error);
      setIsClearing(false);
    },
  });
  
  const handleCollectNews = () => {
    setIsCollecting(true);
    collectNewsMutation.mutate();
  };
  
  const handleClearEvents = () => {
    if (confirm('Tem certeza que deseja limpar todos os eventos de mercado? Esta ação é irreversível.')) {
      setIsClearing(true);
      clearEventsMutation.mutate();
    }
  };

  // Queries para condições de mercado
  const { data: currentCondition, isLoading: loadingCondition } = trpc.marketCondition.current.useQuery(
    { botId: selectedBot },
    {
      enabled: !!user,
      refetchInterval: 5000, // Atualizar a cada 5 segundos
    }
  );

  const { data: conditionHistory, isLoading: loadingHistory } = trpc.marketCondition.history.useQuery(
    { botId: selectedBot, limit: 10 },
    {
      enabled: !!user,
      refetchInterval: 10000, // Atualizar a cada 10 segundos
    }
  );

  // Queries para eventos macroeconômicos
  const { data: upcomingEvents, isLoading: loadingUpcoming, error: errorUpcoming } = trpc.marketEvents.upcoming.useQuery(
    { currencies: ["USD", "JPY"], hoursAhead: 24 },
    {
      enabled: !!user,
      refetchInterval: 15 * 60 * 1000, // Atualizar a cada 15 minutos
      retry: 2,
      retryDelay: 1000,
    }
  );

  const { data: recentEvents, isLoading: loadingRecent, error: errorRecent } = trpc.marketEvents.recent.useQuery(
    { currencies: ["USD", "JPY"], hoursBack: 12 },
    {
      enabled: !!user,
      refetchInterval: 15 * 60 * 1000, // Atualizar a cada 15 minutos
      retry: 2,
      retryDelay: 1000,
    }
  );

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Por favor, faça login para acessar esta página.</p>
      </div>
    );
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFullTime = (date: Date) => {
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getImpactBadge = (impact: string) => {
    switch (impact) {
      case 'HIGH':
        return <Badge variant="destructive">ALTO</Badge>;
      case 'MEDIUM':
        return <Badge variant="default" className="bg-yellow-500">MÉDIO</Badge>;
      default:
        return <Badge variant="outline">BAIXO</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'GREEN':
        return <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />;
      case 'YELLOW':
        return <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse" />;
      case 'RED':
        return <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />;
      default:
        return <div className="w-3 h-3 rounded-full bg-gray-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'GREEN':
        return { text: 'Modo Operar', color: 'text-green-500', bg: 'bg-green-500/10' };
      case 'YELLOW':
        return { text: 'Modo Cautela', color: 'text-yellow-500', bg: 'bg-yellow-500/10' };
      case 'RED':
        return { text: 'Modo Parar', color: 'text-red-500', bg: 'bg-red-500/10' };
      default:
        return { text: 'Desconhecido', color: 'text-gray-500', bg: 'bg-gray-500/10' };
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Calendário & Mercado</h1>
          <p className="text-muted-foreground">
            Análise de condições de mercado e eventos macroeconômicos USD/JPY
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleClearEvents}
            disabled={isClearing}
            variant="destructive"
            size="sm"
          >
            {isClearing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Limpando...
              </>
            ) : (
              <>
                <AlertTriangle className="mr-2 h-4 w-4" />
                Limpar Eventos
              </>
            )}
          </Button>
          <Button
            onClick={handleCollectNews}
            disabled={isCollecting}
            variant="outline"
            size="sm"
          >
            {isCollecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Coletando...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar Notícias
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Condição de Mercado Atual */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Condição de Mercado Atual
              </CardTitle>
              <CardDescription>
                Status em tempo real do detector de condições de mercado
              </CardDescription>
            </div>
            {currentCondition && (
              <div className="flex items-center gap-2">
                {getStatusIcon(currentCondition.status)}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loadingCondition ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : currentCondition ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`p-4 rounded-lg ${getStatusText(currentCondition.status).bg}`}>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <p className={`text-2xl font-bold ${getStatusText(currentCondition.status).color}`}>
                    {getStatusText(currentCondition.status).text}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted">
                  <p className="text-sm text-muted-foreground">Score</p>
                  <p className="text-2xl font-bold">{currentCondition.score}/10</p>
                </div>
                <div className="p-4 rounded-lg bg-muted">
                  <p className="text-sm text-muted-foreground">Última Avaliação</p>
                  <p className="text-sm font-medium">
                    {formatFullTime(new Date(currentCondition.computedAt))}
                  </p>
                </div>
              </div>

              {currentCondition.reasons && currentCondition.reasons.length > 0 && (
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold mb-2">Motivos:</p>
                  <div className="flex flex-wrap gap-2">
                    {currentCondition.reasons.map((reason: string, i: number) => (
                      <Badge key={i} variant="secondary">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Info className="h-8 w-8 mx-auto mb-2" />
              <p>Nenhuma avaliação disponível</p>
              <p className="text-sm">O detector será executado no fechamento do próximo candle M60</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Próximas Notícias Relevantes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Próximas Notícias Relevantes (USD/JPY)
          </CardTitle>
          <CardDescription>
            Eventos macroeconômicos nas próximas 24 horas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingUpcoming && !errorUpcoming ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : errorUpcoming ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-red-500" />
              <p className="font-semibold">Falha ao carregar notícias</p>
              <p className="text-sm">Detector operando apenas com critérios internos (ATR, Wicks, Spread, Fractal)</p>
            </div>
          ) : (upcomingEvents && upcomingEvents.length > 0) ? (
            <div className="space-y-3">
              {upcomingEvents.map((event: any, i: number) => (
                <div
                  key={i}
                  className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-shrink-0">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold">{event.title}</p>
                      {getImpactBadge(event.impact)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{formatTime(event.timestamp)}</span>
                      <span className="font-medium">{event.currency}</span>
                      <span className="text-xs">{event.source}</span>
                    </div>
                    {event.description && (
                      <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-2" />
              <p className="font-semibold">Nenhum evento real encontrado</p>
              <p className="text-sm">Sem eventos macroeconômicos relevantes (USD/JPY) nas próximas 24h</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notícias Recentes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Notícias Recentes (Últimas 12h)
          </CardTitle>
          <CardDescription>
            Eventos macroeconômicos que já ocorreram
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingRecent && !errorRecent ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : errorRecent ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-red-500" />
              <p className="font-semibold">Falha ao carregar notícias</p>
              <p className="text-sm">Detector operando apenas com critérios internos (ATR, Wicks, Spread, Fractal)</p>
            </div>
          ) : (recentEvents && recentEvents.length > 0) ? (
            <div className="space-y-3">
              {recentEvents.map((event: any, i: number) => (
                <div
                  key={i}
                  className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-shrink-0">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold">{event.title}</p>
                      {getImpactBadge(event.impact)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{formatTime(event.timestamp)}</span>
                      <span className="font-medium">{event.currency}</span>
                      <span className="text-xs">{event.source}</span>
                    </div>
                    {(event.actual || event.forecast || event.previous) && (
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                        {event.actual && <span>Atual: {event.actual}</span>}
                        {event.forecast && <span>Previsto: {event.forecast}</span>}
                        {event.previous && <span>Anterior: {event.previous}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="h-8 w-8 mx-auto mb-2" />
              <p className="font-semibold">Nenhum evento real encontrado</p>
              <p className="text-sm">Sem eventos macroeconômicos relevantes (USD/JPY) nas últimas 12h</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Logs da Análise */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Histórico de Avaliações
          </CardTitle>
          <CardDescription>
            Últimas 10 avaliações do Market Condition Detector
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : conditionHistory && conditionHistory.length > 0 ? (
            <div className="space-y-3">
              {conditionHistory.map((condition: any, i: number) => (
                <div
                  key={i}
                  className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(condition.status)}
                      <span className={`font-semibold ${getStatusText(condition.status).color}`}>
                        {getStatusText(condition.status).text}
                      </span>
                      <span className="text-muted-foreground">•</span>
                      <span className="font-bold">Score: {condition.score}/10</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {formatFullTime(new Date(condition.computedAt))}
                    </span>
                  </div>
                  
                  {condition.reasons && condition.reasons.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {condition.reasons.map((reason: string, j: number) => (
                        <Badge key={j} variant="outline" className="text-xs">
                          {reason}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
              <p>Nenhum histórico disponível</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
