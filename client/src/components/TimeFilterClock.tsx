import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, CheckCircle, XCircle, Star } from "lucide-react";
import { client } from "@/lib/client";

export default function TimeFilterClock() {
  const [status, setStatus] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Atualizar status do filtro a cada 30 segundos
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const result = await client.config.getTimeFilterStatus.query();
        setStatus(result);
      } catch (error) {
        console.error("Erro ao buscar status do filtro:", error);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // 30 segundos

    return () => clearInterval(interval);
  }, []);

  // Atualizar relógio a cada segundo
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!status || !status.enabled) {
    return null; // Não mostrar se filtro desabilitado
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatNextTime = (isoString: string | null) => {
    if (!isoString) return null;
    const date = new Date(isoString);
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isAllowed = status.isAllowed;
  const isGold = status.isGoldHour;

  return (
    <Card className={`
      ${isGold 
        ? 'bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 border-yellow-500/50' 
        : isAllowed 
          ? 'bg-gradient-to-br from-green-500/20 to-green-600/20 border-green-500/50'
          : 'bg-gradient-to-br from-red-500/20 to-red-600/20 border-red-500/50'
      }
    `}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          {/* Relógio */}
          <div className="flex items-center gap-4">
            <Clock className={`w-12 h-12 ${isGold ? 'text-yellow-400' : isAllowed ? 'text-green-400' : 'text-red-400'}`} />
            <div>
              <div className={`text-4xl font-bold font-mono ${isGold ? 'text-yellow-400' : isAllowed ? 'text-green-400' : 'text-red-400'}`}>
                {formatTime(currentTime)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Horário: {status.currentHour}h
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="text-right">
            <div className="flex items-center gap-2 justify-end mb-2">
              {isGold ? (
                <>
                  <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                  <span className="text-xl font-bold text-yellow-400">HORÁRIO GOLD</span>
                </>
              ) : isAllowed ? (
                <>
                  <CheckCircle className="w-6 h-6 text-green-400" />
                  <span className="text-xl font-bold text-green-400">OPERAÇÃO PERMITIDA</span>
                </>
              ) : (
                <>
                  <XCircle className="w-6 h-6 text-red-400" />
                  <span className="text-xl font-bold text-red-400">STANDBY</span>
                </>
              )}
            </div>

            {/* Próximo horário */}
            {!isAllowed && status.nextAllowedTime && (
              <div className="text-sm text-muted-foreground">
                Próximo horário: <span className="font-semibold">{formatNextTime(status.nextAllowedTime)}</span>
              </div>
            )}

            {isAllowed && !isGold && status.nextGoldTime && (
              <div className="text-sm text-muted-foreground">
                Próximo GOLD: <span className="font-semibold text-yellow-400">{formatNextTime(status.nextGoldTime)}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
