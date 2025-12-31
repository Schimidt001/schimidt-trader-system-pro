/**
 * SmartChart - Gráfico Profissional de Candlestick
 * 
 * Funcionalidades:
 * - Candle em tempo real (criação automática do candle atual)
 * - Ferramentas de desenho na lateral esquerda (estilo TradingView)
 * - Desenho interativo no gráfico
 * - Rolagem automática com botão toggle
 * - EMA 200 e RSI 14
 * - Linhas de posições (entry, SL, TP)
 * 
 * @version 3.0.0 - Reformulação completa
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  Time,
  IPriceLine,
  LineStyle,
  CandlestickSeries,
  LineSeries,
} from "lightweight-charts";
import { 
  Minus, 
  TrendingUp, 
  Type, 
  Trash2, 
  MousePointer,
  Navigation,
  Lock,
  Unlock
} from "lucide-react";

// ============= INTERFACES =============

interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Position {
  id?: number;
  positionId?: string;
  direction: "up" | "down" | "BUY" | "SELL" | string;
  entryPrice: string | number;
  stopLoss?: number | string | null;
  takeProfit?: number | string | null;
}

interface DrawingLine {
  id: string;
  type: "horizontal" | "trend";
  price?: number;
  startTime?: number;
  startPrice?: number;
  endTime?: number;
  endPrice?: number;
  color: string;
  label?: string;
  visible?: boolean;
}

interface Annotation {
  id: string;
  time: number;
  price: number;
  text: string;
  color: string;
  visible?: boolean;
}

interface SmartChartProps {
  data: CandleData[];
  currentPrice?: number | null;
  currentOpen?: number | null;
  openPositions?: Position[];
  height?: number;
  symbol?: string;
  timeframe?: string;
  showEMA200?: boolean;
  showRSI?: boolean;
  drawingLines?: DrawingLine[];
  annotations?: Annotation[];
  onDrawingLinesChange?: (lines: DrawingLine[]) => void;
  onAnnotationsChange?: (annotations: Annotation[]) => void;
}

// ============= CONSTANTES =============

const CHART_COLORS = {
  background: "#0f172a",
  textColor: "#94a3b8",
  gridColor: "#1e293b",
  borderColor: "#334155",
  candleUp: "#22c55e",
  candleDown: "#ef4444",
  wickUp: "#22c55e",
  wickDown: "#ef4444",
  ema200: "#f59e0b",
  rsiLine: "#8b5cf6",
};

type DrawingTool = "select" | "horizontal" | "trend" | "text" | "delete";

// ============= FUNÇÕES AUXILIARES =============

function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += prices[i];
  ema.push(sum / period);
  for (let i = period; i < prices.length; i++) {
    ema.push((prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
  }
  return ema;
}

function calculateRSI(prices: number[], period: number): number[] {
  if (prices.length < period + 1) return [];
  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  rsi.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
  
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    rsi.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
  }
  
  return rsi;
}

// ============= COMPONENTE PRINCIPAL =============

export function SmartChart({
  data,
  currentPrice,
  openPositions = [],
  height = 500,
  symbol = "USDJPY",
  timeframe = "M15",
  showEMA200 = true,
  showRSI = true,
  drawingLines = [],
  annotations = [],
  onDrawingLinesChange,
  onAnnotationsChange,
}: SmartChartProps) {
  // Refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  const currentCandleRef = useRef<CandlestickData<Time> | null>(null);
  const lastDataLengthRef = useRef<number>(0);

  // States
  const [selectedTool, setSelectedTool] = useState<DrawingTool>("select");
  const [autoScroll, setAutoScroll] = useState(true);
  const [timeLeft, setTimeLeft] = useState("--:--");
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingStart, setDrawingStart] = useState<{ time: number; price: number } | null>(null);
  const [localLines, setLocalLines] = useState<DrawingLine[]>(drawingLines);
  const [localAnnotations, setLocalAnnotations] = useState<Annotation[]>(annotations);

  // Calcular segundos por candle
  const getSecondsPerCandle = useCallback((tf: string): number => {
    const match = tf.match(/^M(\d+)$/i);
    if (match) return parseInt(match[1]) * 60;
    const timeframes: Record<string, number> = {
      'M1': 60, 'M5': 300, 'M15': 900, 'M30': 1800,
      'H1': 3600, 'H4': 14400, 'D1': 86400
    };
    return timeframes[tf.toUpperCase()] || 900;
  }, []);

  // Converter dados para formato do gráfico
  const chartData = useMemo((): CandlestickData<Time>[] => {
    if (!data || data.length === 0) return [];
    return data
      .filter((c) => c && typeof c.timestamp === "number")
      .map((c) => ({
        time: c.timestamp as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));
  }, [data]);

  // Calcular EMA 200
  const emaData = useMemo(() => {
    if (!showEMA200 || chartData.length < 200) return [];
    const closePrices = chartData.map(c => c.close);
    const emaValues = calculateEMA(closePrices, 200);
    const startIndex = chartData.length - emaValues.length;
    return emaValues.map((value, i) => ({
      time: chartData[startIndex + i].time,
      value,
    }));
  }, [chartData, showEMA200]);

  // Calcular RSI
  const rsiData = useMemo(() => {
    if (!showRSI || chartData.length < 15) return [];
    const closePrices = chartData.map(c => c.close);
    const rsiValues = calculateRSI(closePrices, 14);
    const startIndex = chartData.length - rsiValues.length;
    return rsiValues.map((value, i) => ({
      time: chartData[startIndex + i].time,
      value,
    }));
  }, [chartData, showRSI]);

  // Timer do candle
  useEffect(() => {
    const secondsPerCandle = getSecondsPerCandle(timeframe);
    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = secondsPerCandle - (now % secondsPerCandle);
      const min = Math.floor(remaining / 60);
      const sec = remaining % 60;
      setTimeLeft(`${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [timeframe, getSecondsPerCandle]);

  // Limpar price lines
  const clearPriceLines = useCallback(() => {
    if (!candleSeriesRef.current) return;
    priceLinesRef.current.forEach((line) => {
      try { candleSeriesRef.current?.removePriceLine(line); } catch {}
    });
    priceLinesRef.current.clear();
  }, []);

  // Adicionar price line
  const addPriceLine = useCallback((id: string, price: number, title: string, color: string, style: number = LineStyle.Dashed) => {
    if (!candleSeriesRef.current || !price || isNaN(price)) return;
    try {
      const line = candleSeriesRef.current.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: style,
        axisLabelVisible: true,
        title,
      });
      priceLinesRef.current.set(id, line);
    } catch {}
  }, []);

  // Inicializar gráfico principal
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: showRSI ? height - 120 : height,
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.background },
        textColor: CHART_COLORS.textColor,
      },
      grid: {
        vertLines: { color: CHART_COLORS.gridColor },
        horzLines: { color: CHART_COLORS.gridColor },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: CHART_COLORS.borderColor,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: CHART_COLORS.borderColor,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12, // Espaço à direita para ver preço atual
        barSpacing: 8,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: CHART_COLORS.candleUp,
      downColor: CHART_COLORS.candleDown,
      borderUpColor: CHART_COLORS.candleUp,
      borderDownColor: CHART_COLORS.candleDown,
      wickUpColor: CHART_COLORS.wickUp,
      wickDownColor: CHART_COLORS.wickDown,
    });

    const emaSeries = chart.addSeries(LineSeries, {
      color: CHART_COLORS.ema200,
      lineWidth: 2,
      title: "EMA 200",
      priceLineVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    emaSeriesRef.current = emaSeries;

    // Handler de clique para desenho
    chart.subscribeClick((param) => {
      if (selectedTool === "select" || !param.time || !param.point) return;
      
      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price === null) return;
      const time = param.time as number;

      if (selectedTool === "horizontal") {
        const newLine: DrawingLine = {
          id: `h-${Date.now()}`,
          type: "horizontal",
          price: price,
          color: "#3b82f6",
          label: price.toFixed(5),
        };
        const updated = [...localLines, newLine];
        setLocalLines(updated);
        onDrawingLinesChange?.(updated);
        setSelectedTool("select");
      } else if (selectedTool === "trend") {
        if (!isDrawing) {
          setIsDrawing(true);
          setDrawingStart({ time, price });
        } else {
          const newLine: DrawingLine = {
            id: `t-${Date.now()}`,
            type: "trend",
            startTime: drawingStart!.time,
            startPrice: drawingStart!.price,
            endTime: time,
            endPrice: price,
            color: "#f59e0b",
          };
          const updated = [...localLines, newLine];
          setLocalLines(updated);
          onDrawingLinesChange?.(updated);
          setIsDrawing(false);
          setDrawingStart(null);
          setSelectedTool("select");
        }
      } else if (selectedTool === "text") {
        const text = prompt("Digite a anotação:");
        if (text) {
          const newAnnotation: Annotation = {
            id: `a-${Date.now()}`,
            time,
            price,
            text,
            color: "#06b6d4",
          };
          const updated = [...localAnnotations, newAnnotation];
          setLocalAnnotations(updated);
          onAnnotationsChange?.(updated);
        }
        setSelectedTool("select");
      } else if (selectedTool === "delete") {
        // Encontrar e remover linha mais próxima
        const tolerance = (candleSeries.priceToCoordinate(price + 0.001) || 0) - (candleSeries.priceToCoordinate(price) || 0);
        const lineToDelete = localLines.find(l => {
          if (l.type === "horizontal" && l.price) {
            return Math.abs(l.price - price) < Math.abs(tolerance) * 10;
          }
          return false;
        });
        if (lineToDelete) {
          const updated = localLines.filter(l => l.id !== lineToDelete.id);
          setLocalLines(updated);
          onDrawingLinesChange?.(updated);
        }
      }
    });

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearPriceLines();
      chart.remove();
    };
  }, [height, showRSI, clearPriceLines, selectedTool, isDrawing, drawingStart, localLines, localAnnotations, onDrawingLinesChange, onAnnotationsChange]);

  // Inicializar RSI
  useEffect(() => {
    if (!showRSI || !rsiContainerRef.current) return;

    const rsiChart = createChart(rsiContainerRef.current, {
      width: rsiContainerRef.current.clientWidth,
      height: 100,
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.background },
        textColor: CHART_COLORS.textColor,
      },
      grid: {
        vertLines: { color: CHART_COLORS.gridColor },
        horzLines: { color: CHART_COLORS.gridColor },
      },
      rightPriceScale: { borderColor: CHART_COLORS.borderColor },
      timeScale: { visible: false },
    });

    const rsiSeries = rsiChart.addSeries(LineSeries, {
      color: CHART_COLORS.rsiLine,
      lineWidth: 2,
    });

    // Linhas de referência RSI
    rsiSeries.createPriceLine({ price: 30, color: "#22c55e", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "30" });
    rsiSeries.createPriceLine({ price: 70, color: "#ef4444", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "70" });

    rsiChartRef.current = rsiChart;
    rsiSeriesRef.current = rsiSeries;

    // Sincronizar scroll
    if (chartRef.current) {
      chartRef.current.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range && rsiChartRef.current) {
          rsiChartRef.current.timeScale().setVisibleLogicalRange(range);
        }
      });
    }

    return () => { rsiChart.remove(); };
  }, [showRSI]);

  // Atualizar dados do gráfico
  useEffect(() => {
    if (!candleSeriesRef.current || chartData.length === 0) return;
    
    // Resetar candle em formação se os dados mudaram significativamente
    if (Math.abs(chartData.length - lastDataLengthRef.current) > 1) {
      currentCandleRef.current = null;
    }
    lastDataLengthRef.current = chartData.length;

    candleSeriesRef.current.setData(chartData);

    // Auto-scroll para o final
    if (autoScroll && chartRef.current) {
      chartRef.current.timeScale().scrollToRealTime();
    }
  }, [chartData, autoScroll]);

  // Atualizar EMA
  useEffect(() => {
    if (!emaSeriesRef.current) return;
    emaSeriesRef.current.setData(showEMA200 && emaData.length > 0 ? emaData : []);
  }, [emaData, showEMA200]);

  // Atualizar RSI
  useEffect(() => {
    if (!rsiSeriesRef.current) return;
    rsiSeriesRef.current.setData(showRSI && rsiData.length > 0 ? rsiData : []);
  }, [rsiData, showRSI]);

  // ============= CANDLE EM TEMPO REAL =============
  useEffect(() => {
    if (!candleSeriesRef.current || !currentPrice || chartData.length === 0) return;

    const lastCandle = chartData[chartData.length - 1];
    if (!lastCandle) return;

    const lastCandleTime = lastCandle.time as number;
    const intervalSeconds = getSecondsPerCandle(timeframe);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const currentCandleStart = Math.floor(nowSeconds / intervalSeconds) * intervalSeconds;

    // DEBUG
    console.log('[SmartChart] Candle RT:', { 
      now: nowSeconds, 
      currentStart: currentCandleStart, 
      lastCandle: lastCandleTime,
      diff: currentCandleStart - lastCandleTime,
      price: currentPrice 
    });

    // Criar ou atualizar candle em formação
    if (currentCandleStart > lastCandleTime) {
      // Novo candle que não existe no backend
      if (currentCandleRef.current?.time === currentCandleStart) {
        // Atualizar candle existente
        currentCandleRef.current = {
          time: currentCandleStart as Time,
          open: currentCandleRef.current.open,
          high: Math.max(currentCandleRef.current.high, currentPrice),
          low: Math.min(currentCandleRef.current.low, currentPrice),
          close: currentPrice,
        };
      } else {
        // Criar novo candle
        const openPrice = lastCandle.close;
        currentCandleRef.current = {
          time: currentCandleStart as Time,
          open: openPrice,
          high: Math.max(openPrice, currentPrice),
          low: Math.min(openPrice, currentPrice),
          close: currentPrice,
        };
        console.log('[SmartChart] Novo candle criado:', currentCandleStart);
      }
      candleSeriesRef.current.update(currentCandleRef.current);
    } else if (currentCandleStart === lastCandleTime) {
      // Atualizar último candle do backend
      const updatedCandle: CandlestickData<Time> = {
        time: lastCandleTime as Time,
        open: lastCandle.open,
        high: Math.max(lastCandle.high, currentPrice),
        low: Math.min(lastCandle.low, currentPrice),
        close: currentPrice,
      };
      candleSeriesRef.current.update(updatedCandle);
    }

    // Auto-scroll
    if (autoScroll && chartRef.current) {
      chartRef.current.timeScale().scrollToRealTime();
    }
  }, [currentPrice, chartData, timeframe, getSecondsPerCandle, autoScroll]);

  // Atualizar price lines
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    clearPriceLines();

    // Linhas de posições
    openPositions.forEach((pos) => {
      const entry = typeof pos.entryPrice === "string" ? parseFloat(pos.entryPrice) : pos.entryPrice;
      if (!entry || isNaN(entry)) return;
      
      const dir = pos.direction === "up" || pos.direction === "BUY" ? "📈" : "📉";
      const id = pos.id ?? pos.positionId ?? 'x';
      
      addPriceLine(`e-${id}`, entry, `${dir} ${entry.toFixed(5)}`, "#3b82f6", LineStyle.Dashed);
      
      if (pos.stopLoss) {
        const sl = typeof pos.stopLoss === "string" ? parseFloat(pos.stopLoss) : pos.stopLoss;
        if (sl && !isNaN(sl)) addPriceLine(`sl-${id}`, sl, `SL ${sl.toFixed(5)}`, "#ef4444", LineStyle.Solid);
      }
      if (pos.takeProfit) {
        const tp = typeof pos.takeProfit === "string" ? parseFloat(pos.takeProfit) : pos.takeProfit;
        if (tp && !isNaN(tp)) addPriceLine(`tp-${id}`, tp, `TP ${tp.toFixed(5)}`, "#22c55e", LineStyle.Solid);
      }
    });

    // Linhas de desenho
    localLines.filter(l => l.visible !== false).forEach((line) => {
      if (line.type === "horizontal" && line.price) {
        addPriceLine(`d-${line.id}`, line.price, line.label || "", line.color, LineStyle.Solid);
      }
    });

    // Preço atual
    if (currentPrice && !isNaN(currentPrice)) {
      addPriceLine("current", currentPrice, `${currentPrice.toFixed(5)}`, "#06b6d4", LineStyle.Dotted);
    }
  }, [openPositions, currentPrice, localLines, addPriceLine, clearPriceLines]);

  // Loading state
  if (!data || data.length === 0) {
    return (
      <div className="w-full flex items-center justify-center bg-slate-900/50 rounded-lg border border-slate-800" style={{ height }}>
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-400">Carregando gráfico...</p>
        </div>
      </div>
    );
  }

  const lastCandle = chartData[chartData.length - 1];
  const currentEMA = emaData.length > 0 ? emaData[emaData.length - 1].value : null;
  const currentRSI = rsiData.length > 0 ? rsiData[rsiData.length - 1].value : null;

  return (
    <div className="w-full flex">
      {/* Barra de Ferramentas Lateral */}
      <div className="flex flex-col gap-1 p-1 bg-slate-900 border-r border-slate-800 rounded-l-lg">
        <button
          onClick={() => setSelectedTool("select")}
          className={`p-2 rounded transition-colors ${selectedTool === "select" ? "bg-cyan-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
          title="Selecionar"
        >
          <MousePointer className="w-4 h-4" />
        </button>
        <button
          onClick={() => setSelectedTool("horizontal")}
          className={`p-2 rounded transition-colors ${selectedTool === "horizontal" ? "bg-cyan-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
          title="Linha Horizontal"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={() => setSelectedTool("trend")}
          className={`p-2 rounded transition-colors ${selectedTool === "trend" ? "bg-cyan-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
          title="Linha de Tendência"
        >
          <TrendingUp className="w-4 h-4" />
        </button>
        <button
          onClick={() => setSelectedTool("text")}
          className={`p-2 rounded transition-colors ${selectedTool === "text" ? "bg-cyan-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
          title="Anotação"
        >
          <Type className="w-4 h-4" />
        </button>
        <button
          onClick={() => setSelectedTool("delete")}
          className={`p-2 rounded transition-colors ${selectedTool === "delete" ? "bg-red-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
          title="Apagar"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        
        <div className="border-t border-slate-700 my-1"></div>
        
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`p-2 rounded transition-colors ${autoScroll ? "bg-green-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
          title={autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
        >
          {autoScroll ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
        </button>
        <button
          onClick={() => chartRef.current?.timeScale().scrollToRealTime()}
          className="p-2 rounded text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          title="Ir para o final"
        >
          <Navigation className="w-4 h-4" />
        </button>
      </div>

      {/* Área do Gráfico */}
      <div className="flex-1">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-900/80 border-b border-slate-800">
          <div className="flex items-center gap-4">
            <span className="text-lg font-bold text-white">{symbol}</span>
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">{timeframe}</span>
            {lastCandle && (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-400">O: <span className="text-white font-mono">{lastCandle.open.toFixed(5)}</span></span>
                <span className="text-slate-400">H: <span className="text-green-400 font-mono">{lastCandle.high.toFixed(5)}</span></span>
                <span className="text-slate-400">L: <span className="text-red-400 font-mono">{lastCandle.low.toFixed(5)}</span></span>
                <span className="text-slate-400">C: <span className={`font-mono ${lastCandle.close >= lastCandle.open ? "text-green-400" : "text-red-400"}`}>{lastCandle.close.toFixed(5)}</span></span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {showEMA200 && currentEMA && (
              <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded">EMA: {currentEMA.toFixed(5)}</span>
            )}
            {showRSI && currentRSI && (
              <span className={`text-xs px-2 py-1 rounded ${currentRSI < 30 ? "text-green-400 bg-green-500/10" : currentRSI > 70 ? "text-red-400 bg-red-500/10" : "text-violet-400 bg-violet-500/10"}`}>
                RSI: {currentRSI.toFixed(1)}
              </span>
            )}
            {currentPrice && (
              <span className="text-cyan-400 font-mono font-bold bg-slate-800 px-2 py-1 rounded">{currentPrice.toFixed(5)}</span>
            )}
            <div className="flex items-center gap-2 bg-slate-800 px-2 py-1 rounded">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              <span className="text-xs text-yellow-400 font-mono">{timeLeft}</span>
            </div>
          </div>
        </div>

        {/* Gráfico Principal */}
        <div ref={chartContainerRef} className="w-full" style={{ height: showRSI ? height - 120 : height }} />

        {/* RSI */}
        {showRSI && (
          <div className="border-t border-slate-800">
            <div className="px-3 py-1 text-xs text-violet-400">RSI (14)</div>
            <div ref={rsiContainerRef} className="w-full" style={{ height: 100 }} />
          </div>
        )}

        {/* Status de desenho */}
        {selectedTool !== "select" && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-800/90 text-white text-xs px-3 py-1 rounded-full">
            {selectedTool === "horizontal" && "Clique para adicionar linha horizontal"}
            {selectedTool === "trend" && (isDrawing ? "Clique para finalizar linha" : "Clique para iniciar linha de tendência")}
            {selectedTool === "text" && "Clique para adicionar anotação"}
            {selectedTool === "delete" && "Clique em uma linha para apagar"}
          </div>
        )}
      </div>
    </div>
  );
}

export default SmartChart;
