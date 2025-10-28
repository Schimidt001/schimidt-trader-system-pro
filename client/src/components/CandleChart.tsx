import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Bar, Cell } from "recharts";

interface Position {
  id: number;
  direction: "up" | "down";
  entryPrice: string;
  entryTime: number;
  status: string;
  pnl?: number;
}

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
  currentPrice?: number | null;
  openPositions?: Position[];
}

// Tooltip customizado
const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload[0]) return null;
  
  const data = payload[0].payload;
  const isGreen = data.close >= data.open;
  
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl">
      <p className="text-xs text-slate-400 mb-2">{data.time}</p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Abertura:</span>
          <span className="text-white font-mono">{data.open.toFixed(4)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Máxima:</span>
          <span className="text-green-400 font-mono">{data.high.toFixed(4)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Mínima:</span>
          <span className="text-red-400 font-mono">{data.low.toFixed(4)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Fechamento:</span>
          <span className={`font-mono ${isGreen ? "text-green-400" : "text-red-400"}`}>
            {data.close.toFixed(4)}
          </span>
        </div>
        <div className="flex justify-between gap-4 pt-1 border-t border-slate-700">
          <span className="text-slate-400">Variação:</span>
          <span className={`font-mono ${isGreen ? "text-green-400" : "text-red-400"}`}>
            {isGreen ? "+" : ""}{((data.close - data.open) / data.open * 100).toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
};

export function CandleChart({ 
  data, 
  predictionLine, 
  triggerLine, 
  currentOpen,
  currentPrice,
  openPositions = []
}: CandleChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[500px] flex items-center justify-center bg-slate-900/50 rounded-lg border border-slate-800">
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
    timestamp: candle.timestamp,
    high: candle.high,
    low: candle.low,
    open: candle.open,
    close: candle.close,
  }));

  // Calcular domínio Y com margem
  const allPrices = data.flatMap(d => [d.high, d.low]);
  if (predictionLine) allPrices.push(predictionLine);
  if (triggerLine) allPrices.push(triggerLine);
  if (currentOpen) allPrices.push(currentOpen);
  if (currentPrice) allPrices.push(currentPrice);
  
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const margin = (maxPrice - minPrice) * 0.1;
  const yDomain = [minPrice - margin, maxPrice + margin];

  return (
    <div className="w-full h-[500px] bg-slate-900/50 rounded-lg border border-slate-800 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          
          <XAxis 
            dataKey="time" 
            stroke="#94a3b8"
            style={{ fontSize: "11px" }}
            tick={{ fill: "#94a3b8" }}
            interval="preserveStartEnd"
          />
          
          <YAxis 
            stroke="#94a3b8"
            style={{ fontSize: "11px" }}
            domain={yDomain}
            tick={{ fill: "#94a3b8" }}
            tickFormatter={(value) => value.toFixed(2)}
          />
          
          <Tooltip content={<CustomTooltip />} />
          
          <Legend 
            wrapperStyle={{ color: "#94a3b8", paddingTop: "10px", fontSize: "12px" }}
            iconType="line"
          />

          {/* Linhas de High, Low e Close */}
          <Line 
            type="monotone" 
            dataKey="high" 
            stroke="#22c55e" 
            strokeWidth={2}
            dot={false}
            name="Máxima"
            isAnimationActive={true}
          />
          
          <Line 
            type="monotone" 
            dataKey="low" 
            stroke="#ef4444" 
            strokeWidth={2}
            dot={false}
            name="Mínima"
            isAnimationActive={true}
          />
          
          <Line 
            type="monotone" 
            dataKey="close" 
            stroke="#3b82f6" 
            strokeWidth={2}
            dot={false}
            name="Fechamento"
            isAnimationActive={true}
          />

          {/* Linha de abertura do candle atual */}
          {currentOpen !== null && currentOpen !== undefined && (
            <ReferenceLine 
              y={currentOpen} 
              stroke="#3b82f6" 
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{ 
                value: `Abertura: ${currentOpen.toFixed(4)}`, 
                fill: "#3b82f6", 
                fontSize: 10,
                position: "insideTopRight"
              }}
            />
          )}

          {/* Linha de preço atual em tempo real */}
          {currentPrice !== null && currentPrice !== undefined && (
            <ReferenceLine 
              y={currentPrice} 
              stroke="#06b6d4" 
              strokeWidth={2}
              strokeDasharray="3 3"
              label={{ 
                value: `Atual: ${currentPrice.toFixed(4)}`, 
                fill: "#06b6d4", 
                fontSize: 10,
                position: "insideTopRight"
              }}
            />
          )}

          {/* Linha de predição */}
          {predictionLine !== null && predictionLine !== undefined && predictionLine > 0 && (
            <ReferenceLine 
              y={predictionLine} 
              stroke="#a855f7" 
              strokeWidth={2}
              label={{ 
                value: `Predição: ${predictionLine.toFixed(4)}`, 
                fill: "#a855f7", 
                fontSize: 10,
                position: "insideBottomRight"
              }}
            />
          )}

          {/* Linha de gatilho */}
          {triggerLine !== null && triggerLine !== undefined && triggerLine > 0 && (
            <ReferenceLine 
              y={triggerLine} 
              stroke="#eab308" 
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{ 
                value: `Gatilho: ${triggerLine.toFixed(4)}`, 
                fill: "#eab308", 
                fontSize: 10,
                position: "insideBottomRight"
              }}
            />
          )}

          {/* Marcadores de posições abertas */}
          {openPositions && openPositions.length > 0 && openPositions.map((position) => {
            const entryPrice = parseFloat(position.entryPrice);
            const positionColor = position.direction === "up" ? "#22c55e" : "#ef4444";
            const pnlText = position.pnl ? ` (${position.pnl >= 0 ? '+' : ''}$${(position.pnl / 100).toFixed(2)})` : '';
            
            return (
              <ReferenceLine
                key={position.id}
                y={entryPrice}
                stroke={positionColor}
                strokeWidth={3}
                strokeDasharray="8 4"
                label={{
                  value: `${position.direction === "up" ? "📈 CALL" : "📉 PUT"} @ ${entryPrice.toFixed(4)}${pnlText}`,
                  fill: positionColor,
                  fontSize: 11,
                  position: "insideTopLeft",
                  fontWeight: "bold"
                }}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
      
      {/* Legenda de cores e informações */}
      <div className="flex items-center justify-between mt-4 text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span>Máxima</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded"></div>
            <span>Mínima</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded"></div>
            <span>Fechamento</span>
          </div>
          {openPositions && openPositions.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded animate-pulse"></div>
              <span className="font-semibold">{openPositions.length} Posição(ões) Aberta(s)</span>
            </div>
          )}
        </div>
        <div className="text-slate-500">
          Gráfico M15 em Tempo Real
        </div>
      </div>
    </div>
  );
}
