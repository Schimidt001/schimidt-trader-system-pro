import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

interface CandlestickChartProps {
  symbol: string;
}

interface Candle {
  timestampUtc: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Position {
  id: number;
  entryPrice: number;
  contractType: string;
  timestampUtc: number;
}

export function CandlestickChart({ symbol }: CandlestickChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  const { data: candles = [] } = trpc.dashboard.candles.useQuery(
    { symbol, limit: 50 },
    { refetchInterval: 1000 } // Atualizar a cada 1 segundo
  );
  
  const { data: positions = [] } = trpc.dashboard.todayPositions.useQuery(
    undefined,
    { refetchInterval: 2000 }
  );

  // Atualizar dimensões do canvas
  useEffect(() => {
    const updateDimensions = () => {
      if (canvasRef.current?.parentElement) {
        const parent = canvasRef.current.parentElement;
        setDimensions({
          width: parent.clientWidth,
          height: 400,
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  // Desenhar gráfico
  useEffect(() => {
    if (!canvasRef.current || candles.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Configurar canvas com DPI correto
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;
    ctx.scale(dpr, dpr);

    // Limpar canvas
    ctx.fillStyle = "#0a0f1e";
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    // Calcular escalas
    const padding = { top: 20, right: 60, bottom: 30, left: 10 };
    const chartWidth = dimensions.width - padding.left - padding.right;
    const chartHeight = dimensions.height - padding.top - padding.bottom;

    const prices = candles.flatMap((c) => [c.high, c.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;

    const candleWidth = Math.max(chartWidth / candles.length - 2, 3);
    const candleSpacing = chartWidth / candles.length;

    // Função para converter preço em coordenada Y
    const priceToY = (price: number) => {
      return padding.top + chartHeight * (1 - (price - minPrice) / priceRange);
    };

    // Desenhar grid horizontal
    ctx.strokeStyle = "#1a2332";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(dimensions.width - padding.right, y);
      ctx.stroke();

      // Label de preço
      const price = maxPrice - (priceRange / 5) * i;
      ctx.fillStyle = "#6b7280";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(
        price.toFixed(2),
        dimensions.width - padding.right + 5,
        y + 4
      );
    }

    // Desenhar candles
    candles.forEach((candle, index) => {
      const x = padding.left + index * candleSpacing + candleSpacing / 2;
      const isGreen = candle.close >= candle.open;

      // Pavio (high-low)
      ctx.strokeStyle = isGreen ? "#10b981" : "#ef4444";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, priceToY(candle.high));
      ctx.lineTo(x, priceToY(candle.low));
      ctx.stroke();

      // Corpo do candle
      const openY = priceToY(candle.open);
      const closeY = priceToY(candle.close);
      const bodyHeight = Math.abs(closeY - openY);
      const bodyY = Math.min(openY, closeY);

      ctx.fillStyle = isGreen ? "#10b981" : "#ef4444";
      ctx.fillRect(
        x - candleWidth / 2,
        bodyY,
        candleWidth,
        Math.max(bodyHeight, 1)
      );
    });

    // Desenhar marcadores de posições
    positions.forEach((position: Position) => {
      // Encontrar candle correspondente
      const candleIndex = candles.findIndex(
        (c) => Math.abs(c.timestampUtc - position.timestampUtc) < 900
      );
      
      if (candleIndex === -1) return;

      const x = padding.left + candleIndex * candleSpacing + candleSpacing / 2;
      const y = priceToY(position.entryPrice);

      // Linha horizontal no preço de entrada
      ctx.strokeStyle = position.contractType === "CALL" ? "#3b82f6" : "#f59e0b";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(dimensions.width - padding.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Seta indicando entrada
      const arrowSize = 10;
      ctx.fillStyle = position.contractType === "CALL" ? "#3b82f6" : "#f59e0b";
      ctx.beginPath();
      if (position.contractType === "CALL") {
        // Seta para cima
        ctx.moveTo(x, y - 15);
        ctx.lineTo(x - arrowSize, y - 15 - arrowSize);
        ctx.lineTo(x + arrowSize, y - 15 - arrowSize);
      } else {
        // Seta para baixo
        ctx.moveTo(x, y + 15);
        ctx.lineTo(x - arrowSize, y + 15 + arrowSize);
        ctx.lineTo(x + arrowSize, y + 15 + arrowSize);
      }
      ctx.closePath();
      ctx.fill();

      // Label do tipo
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        position.contractType,
        x,
        position.contractType === "CALL" ? y - 30 : y + 35
      );
    });

  }, [candles, positions, dimensions]);

  if (candles.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        Carregando candles...
      </div>
    );
  }

  return (
    <div className="w-full">
      <canvas ref={canvasRef} className="w-full" />
      <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded" />
          <span>Alta</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded" />
          <span>Baixa</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded" />
          <span>CALL</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-orange-500 rounded" />
          <span>PUT</span>
        </div>
      </div>
    </div>
  );
}

