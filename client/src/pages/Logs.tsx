import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

export default function Logs() {
  const { user, loading: authLoading } = useAuth();

  const { data: logs, isLoading } = trpc.logs.recent.useQuery(
    { limit: 200 },
    {
      enabled: !!user,
      refetchInterval: 3000,
    }
  );

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">Log de Eventos</h1>
          <p className="text-slate-400 mt-1">Histórico de eventos do sistema (UTC)</p>
        </div>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Eventos Recentes</CardTitle>
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

