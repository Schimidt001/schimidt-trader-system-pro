import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2, Calendar, TrendingUp, AlertTriangle } from "lucide-react";
import { useBotSelector } from "@/components/BotSelector";

export default function MarketCalendar() {
  const { user, loading: authLoading } = useAuth();
  const { selectedBot } = useBotSelector();

  // Queries
  const { data: marketHistory, isLoading } = trpc.marketCondition.history.useQuery(
    { botId: selectedBot, limit: 24 },
    {
      enabled: !!user,
      refetchInterval: 10000, // Atualizar a cada 10 segundos
    }
  );

  const { data: currentCondition } = trpc.marketCondition.current.useQuery(
    { botId: selectedBot },
    {
      enabled: !!user,
      refetchInterval: 5000,
    }
  );

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
            <CardDescription>Você precisa estar autenticado para acessar esta página</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "GREEN":
        return "text-green-400";
      case "YELLOW":
        return "text-yellow-400";
      case "RED":
        return "text-red-400";
      default:
        return "text-slate-400";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "GREEN":
        return "🟢";
      case "YELLOW":
        return "🟡";
      case "RED":
        return "🔴";
      default:
        return "⚪";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "GREEN":
        return "Modo Operar";
      case "YELLOW":
        return "Modo Cautela";
      case "RED":
        return "Modo Parar";
      default:
        return "Desconhecido";
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatReasons = (reasons: string[]) => {
    const reasonLabels: Record<string, string> = {
      ATR_HIGH: "ATR Alto",
      LONG_WICKS: "Sombras Longas",
      FRACTAL_VOLATILITY: "Volatilidade Fractal",
      HIGH_IMPACT_NEWS: "Notícia de Alto Impacto",
      NEWS_API_FAILED: "Falha na API de Notícias",
      DETECTOR_DISABLED: "Detector Desabilitado",
      EVALUATION_ERROR: "Erro na Avaliação",
    };

    return reasons.map((r) => reasonLabels[r] || r).join(", ");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Calendar className="w-8 h-8" />
              Calendário & Mercado
            </h1>
            <p className="text-slate-400 mt-1">Análise de Condições de Mercado em Tempo Real</p>
          </div>
        </div>

        {/* Condição Atual */}
        {currentCondition && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Condição Atual do Mercado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex items-center gap-4">
                  <span className="text-4xl">{getStatusIcon(currentCondition.status)}</span>
                  <div>
                    <div className="text-xs text-slate-400">Status</div>
                    <div className={`text-xl font-bold ${getStatusColor(currentCondition.status)}`}>
                      {getStatusLabel(currentCondition.status)}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Score de Risco</div>
                  <div className="text-2xl font-bold text-white">
                    {currentCondition.score}/10
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2 mt-2">
                    <div
                      className={`h-2 rounded-full ${
                        currentCondition.score <= 3
                          ? "bg-green-500"
                          : currentCondition.score <= 6
                          ? "bg-yellow-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${(currentCondition.score / 10) * 100}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Última Avaliação</div>
                  <div className="text-sm text-white">
                    {formatDate(currentCondition.computedAt)}
                  </div>
                  <div className="text-xs text-slate-400 mt-2">
                    {formatReasons(currentCondition.reasons)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Histórico de Condições */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Histórico de Condições (Últimas 24h)
            </CardTitle>
            <CardDescription className="text-slate-400">
              Registro de todas as avaliações de condições de mercado
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : marketHistory && marketHistory.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">
                        Data/Hora
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">
                        Status
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">
                        Score
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">
                        Motivos
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketHistory.map((condition, index) => (
                      <tr
                        key={index}
                        className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-3 px-4 text-sm text-slate-300">
                          {formatDate(condition.computedAt)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{getStatusIcon(condition.status)}</span>
                            <span className={`text-sm font-semibold ${getStatusColor(condition.status)}`}>
                              {getStatusLabel(condition.status)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white font-mono">
                              {condition.score}/10
                            </span>
                            <div className="w-20 bg-slate-700 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full ${
                                  condition.score <= 3
                                    ? "bg-green-500"
                                    : condition.score <= 6
                                    ? "bg-yellow-500"
                                    : "bg-red-500"
                                }`}
                                style={{ width: `${(condition.score / 10) * 100}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-400">
                          {formatReasons(condition.reasons)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                Nenhuma condição de mercado registrada ainda
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legenda */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-lg">Legenda dos Critérios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-semibold text-slate-300 mb-2">Critérios de Análise:</div>
                <ul className="space-y-1 text-slate-400">
                  <li>• <span className="text-slate-300">ATR Alto:</span> Amplitude anormal do candle</li>
                  <li>• <span className="text-slate-300">Sombras Longas:</span> Wicks exagerados</li>
                  <li>• <span className="text-slate-300">Volatilidade Fractal:</span> Comportamento caótico</li>
                  <li>• <span className="text-slate-300">Notícia de Alto Impacto:</span> Evento macroeconômico</li>
                </ul>
              </div>
              <div>
                <div className="font-semibold text-slate-300 mb-2">Classificação:</div>
                <ul className="space-y-1 text-slate-400">
                  <li>• <span className="text-green-400">🟢 Modo Operar (0-3):</span> Mercado normal</li>
                  <li>• <span className="text-yellow-400">🟡 Modo Cautela (4-6):</span> Mercado instável</li>
                  <li>• <span className="text-red-400">🔴 Modo Parar (7-10):</span> Mercado anormal</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
