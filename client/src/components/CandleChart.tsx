import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";

interface CandleChartProps {
  data: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }>;
  predictionLine?: number | null;
  triggerLine?: number | null;
  currentOpen?: number | null;
}

export function CandleChart({ data, predictionLine, triggerLine, currentOpen }: CandleChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-slate-900/50 rounded-lg border border-slate-800">
        <p className="text-slate-400">Aguardando dados de candles...</p>
      </div>
    );
  }

  // Preparar dados para o gráfico
  const chartData = data.map((candle) => ({
    time: new Date(candle.timestamp * 1000).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    high: candle.high,
    low: candle.low,
    open: candle.open,
    close: candle.close,
  }));

  return (
    <div className="w-full h-[400px] bg-slate-900/50 rounded-lg border border-slate-800 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis 
            dataKey="time" 
            stroke="#94a3b8"
            style={{ fontSize: "12px" }}
          />
          <YAxis 
            stroke="#94a3b8"
            style={{ fontSize: "12px" }}
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "8px",
              color: "#fff",
            }}
          />
          <Legend 
            wrapperStyle={{ color: "#94a3b8" }}
          />
          
          {/* Linha de máximas */}
          <Line 
            type="monotone" 
            dataKey="high" 
            stroke="#22c55e" 
            strokeWidth={2}
            dot={false}
            name="Máxima"
          />
          
          {/* Linha de mínimas */}
          <Line 
            type="monotone" 
            dataKey="low" 
            stroke="#ef4444" 
            strokeWidth={2}
            dot={false}
            name="Mínima"
          />
          
          {/* Linha de fechamento */}
          <Line 
            type="monotone" 
            dataKey="close" 
            stroke="#3b82f6" 
            strokeWidth={2}
            dot={false}
            name="Fechamento"
          />

          {/* Linha de abertura do candle atual */}
          {currentOpen !== null && currentOpen !== undefined && (
            <ReferenceLine 
              y={currentOpen} 
              stroke="#3b82f6" 
              strokeDasharray="5 5"
              label={{ value: "Abertura", fill: "#3b82f6", fontSize: 12 }}
            />
          )}

          {/* Linha de predição */}
          {predictionLine !== null && predictionLine !== undefined && (
            <ReferenceLine 
              y={predictionLine} 
              stroke="#a855f7" 
              strokeWidth={2}
              label={{ value: "Predição", fill: "#a855f7", fontSize: 12 }}
            />
          )}

          {/* Linha de gatilho */}
          {triggerLine !== null && triggerLine !== undefined && (
            <ReferenceLine 
              y={triggerLine} 
              stroke="#eab308" 
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{ value: "Gatilho", fill: "#eab308", fontSize: 12 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

