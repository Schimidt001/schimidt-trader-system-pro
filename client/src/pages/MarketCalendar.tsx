import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2, Calendar, TrendingUp, AlertTriangle, Clock, Info } from "lucide-react";
import { useBotSelector } from "@/components/BotSelector";

export default function MarketCalendar() {
  const { user, loading: authLoading } = useAuth();
  const { selectedBot } = useBotSelector();

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
  
  // Log de erro para debug
  if (errorUpcoming) {
    console.error('[MarketCalendar] Erro ao buscar próximas notícias:', errorUpcoming);
  }

  const { data: recentEvents, isLoading: loadingRecent, error: errorRecent } = trpc.marketEvents.recent.useQuery(
    { currencies: ["USD", "JPY"], hoursBack: 12 },
    {
      enabled: !!user,
      refetchInterval: 15 * 60 * 1000, // Atualizar a cada 15 minutos
      retry: 2,
      retryDelay: 1000,
    }
  );
  
  // Log de erro para debug
  if (errorRecent) {
    console.error('[MarketCalendar] Erro ao buscar notícias recentes:', errorRecent);
  }

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

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'HIGH':
        return 'text-red-500 font-bold';
      case 'MEDIUM':
        return 'text-yellow-500 font-semibold';
      default:
        return 'text-gray-400';
    }
  };

  const getImpactBadge = (impact: string) => {
    switch (impact) {
      case 'HIGH':
        return <span className="px-2 py-1 text-xs font-bold bg-red-500/20 text-red-400 rounded">ALTO</span>;
      case 'MEDIUM':
        return <span className="px-2 py-1 text-xs font-semibold bg-yellow-500/20 text-yellow-400 rounded">MÉDIO</span>;
      default:
        return <span className="px-2 py-1 text-xs bg-gray-500/20 text-gray-400 rounded">BAIXO</span>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Calendar className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Calendário & Mercado</h1>
          <p className="text-muted-foreground">
            Análise de condições de mercado e eventos macroeconômicos
          </p>
        </div>
      </div>

      {/* Condição Atual */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Condição de Mercado Atual
          </CardTitle>
          <CardDescription>
            Última avaliação do Market Condition Detector
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingCondition ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : currentCondition ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="text-6xl">
                  {currentCondition.status === "GREEN" ? "🟢" : 
                   currentCondition.status === "YELLOW" ? "🟡" : "🔴"}
                </div>
                <div>
                  <div className={`text-2xl font-bold ${
                    currentCondition.status === "GREEN" ? "text-green-400" : 
                    currentCondition.status === "YELLOW" ? "text-yellow-400" : "text-red-400"
                  }`}>
                    {currentCondition.status === "GREEN" ? "MODO OPERAR" : 
                     currentCondition.status === "YELLOW" ? "MODO CAUTELA" : "MODO PARAR"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Score: {currentCondition.score}/10
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Atualizado: {new Date(currentCondition.computedAt).toLocaleString('pt-BR')}
                  </div>
                </div>
              </div>

              {currentCondition.reasons && currentCondition.reasons.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Motivos:</h4>
                  <div className="flex flex-wrap gap-2">
                    {currentCondition.reasons.map((reason: string, i: number) => (
                      <span
                        key={i}
                        className="px-3 py-1 text-xs bg-slate-700 text-slate-200 rounded-full"
                      >
                        {reason === "ATR_HIGH" ? "ATR Alto" :
                         reason === "LONG_WICKS" ? "Sombras Longas" :
                         reason === "FRACTAL_VOLATILITY" ? "Volatilidade Fractal" :
                         reason === "HIGH_IMPACT_NEWS" ? "Notícia Alto Impacto" :
                         reason === "NEWS_API_FAILED" ? "API de Notícias Falhou" :
                         reason}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {currentCondition.details && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-700">
                  {currentCondition.details.atr && (
                    <div>
                      <div className="text-xs text-muted-foreground">ATR</div>
                      <div className="text-sm font-mono">{currentCondition.details.atr.toFixed(5)}</div>
                    </div>
                  )}
                  {currentCondition.details.amplitude && (
                    <div>
                      <div className="text-xs text-muted-foreground">Amplitude</div>
                      <div className="text-sm font-mono">{currentCondition.details.amplitude.toFixed(5)}</div>
                    </div>
                  )}
                  {currentCondition.details.corpo !== undefined && (
                    <div>
                      <div className="text-xs text-muted-foreground">Corpo</div>
                      <div className="text-sm font-mono">{currentCondition.details.corpo.toFixed(5)}</div>
                    </div>
                  )}
                  {currentCondition.details.newsEvents !== undefined && (
                    <div>
                      <div className="text-xs text-muted-foreground">Eventos Detectados</div>
                      <div className="text-sm font-mono">{currentCondition.details.newsEvents}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma avaliação disponível ainda
            </div>
          )}
        </CardContent>
      </Card>

      {/* Próximas Notícias */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
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
          ) : (upcomingEvents && upcomingEvents.length > 0) ? (
            <div className="space-y-3">
              {upcomingEvents.map((event: any, i: number) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700"
                >
                  <div className="flex-shrink-0 w-20 text-xs text-muted-foreground">
                    {formatTime(event.timestamp)}
                  </div>
                  <div className="flex-shrink-0">
                    {getImpactBadge(event.impact)}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{event.title}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                        {event.currency}
                      </span>
                      <span>{event.source}</span>
                    </div>
                    {(event.forecast || event.previous) && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {event.forecast && <span>Previsão: {event.forecast}</span>}
                        {event.forecast && event.previous && <span> | </span>}
                        {event.previous && <span>Anterior: {event.previous}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum evento relevante nas próximas 24 horas
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notícias Recentes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Notícias Recentes (Últimas 12h)
          </CardTitle>
          <CardDescription>
            Eventos que já ocorreram
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingRecent && !errorRecent ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (recentEvents && recentEvents.length > 0) ? (
            <div className="space-y-3">
              {recentEvents.map((event: any, i: number) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700 opacity-75"
                >
                  <div className="flex-shrink-0 w-20 text-xs text-muted-foreground">
                    {formatTime(event.timestamp)}
                  </div>
                  <div className="flex-shrink-0">
                    {getImpactBadge(event.impact)}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{event.title}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                        {event.currency}
                      </span>
                      <span>{event.source}</span>
                    </div>
                    {(event.actual || event.forecast || event.previous) && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {event.actual && <span>Atual: {event.actual}</span>}
                        {event.actual && event.forecast && <span> | </span>}
                        {event.forecast && <span>Previsão: {event.forecast}</span>}
                        {(event.actual || event.forecast) && event.previous && <span> | </span>}
                        {event.previous && <span>Anterior: {event.previous}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum evento nas últimas 12 horas
            </div>
          )}
        </CardContent>
      </Card>

      {/* Histórico de Avaliações */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Logs da Análise Macroeconômica
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
            <div className="space-y-2">
              {conditionHistory.map((condition: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg border border-slate-700/50"
                >
                  <div className="text-2xl">
                    {condition.status === "GREEN" ? "🟢" : 
                     condition.status === "YELLOW" ? "🟡" : "🔴"}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">
                      {new Date(condition.computedAt).toLocaleString('pt-BR')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Score: {condition.score}/10 | {condition.reasons.join(", ")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma avaliação disponível
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legenda */}
      <Card>
        <CardHeader>
          <CardTitle>Legenda dos Critérios</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-semibold mb-2">Critérios Técnicos:</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• <strong>ATR Alto (2pts):</strong> Amplitude &gt; ATR × 2</li>
                <li>• <strong>Sombras Longas (2pts):</strong> Wick &gt; Corpo × 2</li>
                <li>• <strong>Volatilidade Fractal (2pts):</strong> Corpo/Amplitude &lt; 0.3</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Critérios Fundamentais:</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• <strong>Notícia Alto Impacto (3pts):</strong> Evento macroeconômico HIGH</li>
              </ul>
            </div>
            <div className="col-span-full">
              <h4 className="font-semibold mb-2">Classificação:</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• 🟢 <strong>GREEN (0-3):</strong> Mercado normal, pode operar</li>
                <li>• 🟡 <strong>YELLOW (4-6):</strong> Mercado instável, operar com cautela</li>
                <li>• 🔴 <strong>RED (7-10):</strong> Mercado anormal, NÃO operar</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
