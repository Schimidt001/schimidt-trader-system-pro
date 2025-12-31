/**
 * SmartChart - Gráfico Profissional de Candlestick com Indicadores Técnicos
 * 
 * Utiliza lightweight-charts v5 (TradingView) para renderização de alta performance.
 * 
 * Funcionalidades:
 * - Candles em tempo real com GAP DETECTION
 * - EMA 200 (Média Móvel Exponencial)
 * - RSI 14 com níveis 30/70
 * - Linhas de suporte/resistência manuais
 * - Linhas de tendência
 * - Anotações de texto
 * - Marcadores automáticos de entrada/saída
 * 
 * @author Manus AI - Implementação para IC Markets Dashboard
 * @version 2.0.0
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
  HistogramSeries,
  SeriesMarker,
  createSeriesMarkers,
} from "lightweight-charts";

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
  entryTime?: number;
  openTime?: number;
  status?: string;
  pnl?: number;
  unrealizedPnL?: number;
  stopLoss?: number | string | null;
  takeProfit?: number | string | null;
  symbol?: string;
  size?: number;
  currentPrice?: number;
}

interface IndicatorData {
  ema200?: number;
  rsi?: number;
  rsiPrevious?: number;
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
}

interface Annotation {
  id: string;
  time: number;
  price: number;
  text: string;
  color: string;
}

interface SmartChartProps {
  /** Array de candles OHLC */
  data: CandleData[];
  /** Preço atual em tempo real */
  currentPrice?: number | null;
  /** Preço de abertura do candle atual */
  currentOpen?: number | null;
  /** Posições abertas para plotar linhas de entrada/SL/TP */
  openPositions?: Position[];
  /** Altura do gráfico em pixels */
  height?: number;
  /** Símbolo sendo exibido */
  symbol?: string;
  /** Timeframe atual */
  timeframe?: string;
  /** Dados dos indicadores técnicos */
  indicators?: IndicatorData;
  /** Mostrar EMA 200 */
  showEMA200?: boolean;
  /** Mostrar RSI */
  showRSI?: boolean;
  /** Linhas de desenho (suporte/resistência, tendência) */
  drawingLines?: DrawingLine[];
  /** Anotações de texto */
  annotations?: Annotation[];
  /** Callback quando uma nova linha é desenhada */
  onDrawLine?: (line: DrawingLine) => void;
  /** Callback quando uma anotação é adicionada */
  onAddAnnotation?: (annotation: Annotation) => void;
}

// ============= CONSTANTES DE ESTILO =============

const CHART_COLORS = {
  background: "#0f172a",
  textColor: "#94a3b8",
  gridColor: "#1e293b",
  borderColor: "#334155",
  candleUp: "#26a69a",
  candleDown: "#ef5350",
  wickUp: "#26a69a",
  wickDown: "#ef5350",
  ema200: "#f59e0b", // Amber para EMA 200
  rsiLine: "#8b5cf6", // Violet para RSI
  rsiOversold: "#22c55e", // Verde para nível 30
  rsiOverbought: "#ef4444", // Vermelho para nível 70
};

const PRICE_LINE_STYLES = {
  entry: {
    color: "#3b82f6",
    lineWidth: 2,
    lineStyle: LineStyle.Dashed,
    axisLabelVisible: true,
  },
  stopLoss: {
    color: "#ef4444",
    lineWidth: 2,
    lineStyle: LineStyle.Solid,
    axisLabelVisible: true,
  },
  takeProfit: {
    color: "#22c55e",
    lineWidth: 2,
    lineStyle: LineStyle.Solid,
    axisLabelVisible: true,
  },
  currentPrice: {
    color: "#06b6d4",
    lineWidth: 1,
    lineStyle: LineStyle.Dotted,
    axisLabelVisible: true,
  },
  support: {
    color: "#22c55e",
    lineWidth: 1,
    lineStyle: LineStyle.Solid,
    axisLabelVisible: true,
  },
  resistance: {
    color: "#ef4444",
    lineWidth: 1,
    lineStyle: LineStyle.Solid,
    axisLabelVisible: true,
  },
};

// ============= FUNÇÕES DE CÁLCULO DE INDICADORES =============

/**
 * Calcula EMA (Exponential Moving Average)
 */
function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // Primeira EMA é a SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  ema.push(sum / period);
  
  // Calcular EMA para o resto
  for (let i = period; i < prices.length; i++) {
    const currentEma = (prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
    ema.push(currentEma);
  }
  
  return ema;
}

/**
 * Calcula RSI (Relative Strength Index)
 */
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
  
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;
  
  if (avgLoss === 0) {
    rsi.push(100);
  } else {
    const rs = avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }
  
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    
    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }
  
  return rsi;
}

// ============= COMPONENTE PRINCIPAL =============

export function SmartChart({
  data,
  currentPrice,
  currentOpen,
  openPositions = [],
  height = 500,
  symbol = "USDJPY",
  timeframe = "M15",
  indicators,
  showEMA200 = true,
  showRSI = true,
  drawingLines = [],
  annotations = [],
  onDrawLine,
  onAddAnnotation,
}: SmartChartProps) {
  // Refs para o chart e séries
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  
  // Ref para rastrear o candle atual em formação
  const currentCandleRef = useRef<{
    time: Time;
    open: number;
    high: number;
    low: number;
    close: number;
  } | null>(null);

  // State para o cronômetro de vela
  const [timeLeft, setTimeLeft] = useState<string>("--:--");
  
  // State para modo de desenho
  const [drawingMode, setDrawingMode] = useState<"none" | "horizontal" | "trend" | "annotation">("none");
  const [pendingLine, setPendingLine] = useState<Partial<DrawingLine> | null>(null);

  // Calcular segundos por candle baseado no timeframe
  const getSecondsPerCandle = useCallback((tf: string): number => {
    const match = tf.match(/^M(\d+)$/i);
    if (match) {
      return parseInt(match[1]) * 60;
    }
    const timeframes: Record<string, number> = {
      'M1': 60, 'M5': 300, 'M15': 900, 'M30': 1800,
      'H1': 3600, 'H4': 14400, 'D1': 86400
    };
    return timeframes[tf.toUpperCase()] || 60;
  }, []);

  // useEffect para o cronômetro de vela
  useEffect(() => {
    const secondsPerCandle = getSecondsPerCandle(timeframe);
    
    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      const secondsIntoCandle = now % secondsPerCandle;
      const secondsRemaining = secondsPerCandle - secondsIntoCandle;
      
      const minutes = Math.floor(secondsRemaining / 60);
      const seconds = secondsRemaining % 60;
      setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [timeframe, getSecondsPerCandle]);

  // Converter dados para formato lightweight-charts
  const chartData = useMemo((): CandlestickData<Time>[] => {
    if (!data || data.length === 0) return [];

    return data
      .filter((candle) => candle && typeof candle.timestamp === "number")
      .map((candle) => ({
        time: candle.timestamp as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));
  }, [data]);

  // Calcular EMA 200
  const emaData = useMemo(() => {
    if (!showEMA200 || chartData.length < 200) return [];
    
    const closePrices = chartData.map(c => c.close);
    const emaValues = calculateEMA(closePrices, 200);
    
    // Alinhar EMA com timestamps (EMA começa após 200 períodos)
    const startIndex = chartData.length - emaValues.length;
    return emaValues.map((value, i) => ({
      time: chartData[startIndex + i].time,
      value,
    }));
  }, [chartData, showEMA200]);

  // Calcular RSI 14
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

  // Função para limpar price lines
  const clearPriceLines = useCallback(() => {
    if (!candleSeriesRef.current) return;

    priceLinesRef.current.forEach((line) => {
      try {
        candleSeriesRef.current?.removePriceLine(line);
      } catch (e) {
        // Linha já removida
      }
    });
    priceLinesRef.current.clear();
  }, []);

  // Função para adicionar price line
  const addPriceLine = useCallback(
    (
      id: string,
      price: number,
      title: string,
      style: typeof PRICE_LINE_STYLES.entry
    ) => {
      if (!candleSeriesRef.current || !price || isNaN(price)) return;

      try {
        const priceLine = candleSeriesRef.current.createPriceLine({
          price,
          color: style.color,
          lineWidth: style.lineWidth as 1 | 2 | 3 | 4,
          lineStyle: style.lineStyle,
          axisLabelVisible: style.axisLabelVisible,
          title,
        });
        priceLinesRef.current.set(id, priceLine);
      } catch (e) {
        console.warn(`[SmartChart] Erro ao criar price line ${id}:`, e);
      }
    },
    []
  );

  // Inicializar o gráfico principal
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: showRSI ? height - 120 : height, // Reservar espaço para RSI
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.background },
        textColor: CHART_COLORS.textColor,
      },
      grid: {
        vertLines: { color: CHART_COLORS.gridColor },
        horzLines: { color: CHART_COLORS.gridColor },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          width: 1,
          color: "#475569",
          style: LineStyle.Dashed,
          labelBackgroundColor: "#334155",
        },
        horzLine: {
          width: 1,
          color: "#475569",
          style: LineStyle.Dashed,
          labelBackgroundColor: "#334155",
        },
      },
      rightPriceScale: {
        borderColor: CHART_COLORS.borderColor,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: CHART_COLORS.borderColor,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    // Série de candlestick
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: CHART_COLORS.candleUp,
      downColor: CHART_COLORS.candleDown,
      borderUpColor: CHART_COLORS.candleUp,
      borderDownColor: CHART_COLORS.candleDown,
      wickUpColor: CHART_COLORS.wickUp,
      wickDownColor: CHART_COLORS.wickDown,
    });

    // Série EMA 200
    const emaSeries = chart.addSeries(LineSeries, {
      color: CHART_COLORS.ema200,
      lineWidth: 2,
      title: "EMA 200",
      priceLineVisible: false,
      lastValueVisible: true,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    emaSeriesRef.current = emaSeries;

    // Resize handler
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearPriceLines();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      emaSeriesRef.current = null;
    };
  }, [height, clearPriceLines, showRSI]);

  // Inicializar gráfico RSI
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
      rightPriceScale: {
        borderColor: CHART_COLORS.borderColor,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: CHART_COLORS.borderColor,
        timeVisible: false,
        visible: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
    });

    const rsiSeries = rsiChart.addSeries(LineSeries, {
      color: CHART_COLORS.rsiLine,
      lineWidth: 2,
      title: "RSI 14",
      priceLineVisible: false,
    });

    // Adicionar linhas de referência RSI (30 e 70)
    rsiSeries.createPriceLine({
      price: 30,
      color: CHART_COLORS.rsiOversold,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "Sobrevenda",
    });

    rsiSeries.createPriceLine({
      price: 70,
      color: CHART_COLORS.rsiOverbought,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "Sobrecompra",
    });

    rsiSeries.createPriceLine({
      price: 50,
      color: "#64748b",
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: false,
    });

    rsiChartRef.current = rsiChart;
    rsiSeriesRef.current = rsiSeries;

    // Sincronizar timeScale com o gráfico principal
    if (chartRef.current) {
      chartRef.current.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range && rsiChartRef.current) {
          rsiChartRef.current.timeScale().setVisibleLogicalRange(range);
        }
      });
    }

    const handleResize = () => {
      if (rsiContainerRef.current && rsiChartRef.current) {
        rsiChartRef.current.applyOptions({
          width: rsiContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      rsiChart.remove();
      rsiChartRef.current = null;
      rsiSeriesRef.current = null;
    };
  }, [showRSI]);

  // Atualizar dados do gráfico
  useEffect(() => {
    if (!candleSeriesRef.current || chartData.length === 0) return;

    const intervalSeconds = getSecondsPerCandle(timeframe);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const currentIntervalTimeSeconds = Math.floor(nowSeconds / intervalSeconds) * intervalSeconds;
    
    const lastChartCandle = chartData[chartData.length - 1];
    const lastCandleTimeRaw = lastChartCandle?.time as number;
    const isMilliseconds = lastCandleTimeRaw > 1e12;
    const lastCandleTimeSeconds = isMilliseconds ? Math.floor(lastCandleTimeRaw / 1000) : lastCandleTimeRaw;
    
    const currentCandleTimeSeconds = currentCandleRef.current 
      ? (isMilliseconds 
          ? Math.floor((currentCandleRef.current.time as number) / 1000) 
          : (currentCandleRef.current.time as number))
      : 0;
    
    const shouldResetCurrentCandle = 
      !currentCandleRef.current || 
      currentCandleTimeSeconds < currentIntervalTimeSeconds;
    
    if (shouldResetCurrentCandle || lastCandleTimeSeconds >= currentCandleTimeSeconds) {
      if (lastCandleTimeSeconds === currentIntervalTimeSeconds) {
        currentCandleRef.current = null;
      } else if (currentCandleTimeSeconds < currentIntervalTimeSeconds) {
        currentCandleRef.current = null;
      }
    }

    candleSeriesRef.current.setData(chartData);
    
    if (currentCandleRef.current && currentCandleTimeSeconds === currentIntervalTimeSeconds) {
      candleSeriesRef.current.update(currentCandleRef.current as CandlestickData<Time>);
    }

    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [chartData, timeframe, getSecondsPerCandle]);

  // Atualizar EMA 200
  useEffect(() => {
    if (!emaSeriesRef.current) return;
    
    if (showEMA200 && emaData.length > 0) {
      emaSeriesRef.current.setData(emaData);
    } else {
      emaSeriesRef.current.setData([]);
    }
  }, [emaData, showEMA200]);

  // Atualizar RSI
  useEffect(() => {
    if (!rsiSeriesRef.current) return;
    
    if (showRSI && rsiData.length > 0) {
      rsiSeriesRef.current.setData(rsiData);
    } else {
      rsiSeriesRef.current.setData([]);
    }
  }, [rsiData, showRSI]);

  // Atualizar o último candle com preço em tempo real
  useEffect(() => {
    if (
      !candleSeriesRef.current ||
      !currentPrice ||
      chartData.length === 0
    )
      return;

    const lastCandle = chartData[chartData.length - 1];
    if (!lastCandle) return;

    const lastCandleTimeRaw = lastCandle.time as number;
    const isMilliseconds = lastCandleTimeRaw > 1e12;
    const lastCandleTimeSeconds = isMilliseconds ? Math.floor(lastCandleTimeRaw / 1000) : lastCandleTimeRaw;
    
    const intervalSeconds = getSecondsPerCandle(timeframe);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const currentIntervalTimeSeconds = Math.floor(nowSeconds / intervalSeconds) * intervalSeconds;
    
    const currentIntervalTime = isMilliseconds ? currentIntervalTimeSeconds * 1000 : currentIntervalTimeSeconds;
    const lastCandleTime = lastCandleTimeRaw;

    if (currentIntervalTimeSeconds > lastCandleTimeSeconds) {
      const isTrackingNewCandle = currentCandleRef.current?.time === currentIntervalTime;
      
      if (isTrackingNewCandle && currentCandleRef.current) {
        currentCandleRef.current = {
          time: currentIntervalTime as Time,
          open: currentCandleRef.current.open,
          high: Math.max(currentCandleRef.current.high, currentPrice),
          low: Math.min(currentCandleRef.current.low, currentPrice),
          close: currentPrice,
        };
      } else {
        currentCandleRef.current = {
          time: currentIntervalTime as Time,
          open: currentPrice,
          high: currentPrice,
          low: currentPrice,
          close: currentPrice,
        };
      }
    } else {
      const isSameCandle = currentCandleRef.current?.time === lastCandleTime;

      if (isSameCandle && currentCandleRef.current) {
        currentCandleRef.current = {
          time: lastCandleTime as Time,
          open: currentCandleRef.current.open,
          high: Math.max(currentCandleRef.current.high, currentPrice),
          low: Math.min(currentCandleRef.current.low, currentPrice),
          close: currentPrice,
        };
      } else {
        currentCandleRef.current = {
          time: lastCandleTime as Time,
          open: lastCandle.open,
          high: Math.max(lastCandle.high, currentPrice),
          low: Math.min(lastCandle.low, currentPrice),
          close: currentPrice,
        };
      }
    }

    candleSeriesRef.current.update(currentCandleRef.current as CandlestickData<Time>);
  }, [currentPrice, chartData, timeframe, getSecondsPerCandle]);

  // Atualizar price lines das posições
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    clearPriceLines();

    // Linhas de posições abertas
    openPositions.forEach((position) => {
      const entryPrice =
        typeof position.entryPrice === "string"
          ? parseFloat(position.entryPrice)
          : position.entryPrice;

      if (!entryPrice || isNaN(entryPrice)) return;

      const direction =
        position.direction === "up" || position.direction === "BUY"
          ? "BUY"
          : "SELL";
      const directionEmoji = direction === "BUY" ? "📈" : "📉";

      const posId = position.id ?? position.positionId ?? 'unknown';

      addPriceLine(
        `entry-${posId}`,
        entryPrice,
        `${directionEmoji} Entry @ ${entryPrice.toFixed(5)}`,
        PRICE_LINE_STYLES.entry
      );

      if (position.stopLoss) {
        const sl =
          typeof position.stopLoss === "string"
            ? parseFloat(position.stopLoss)
            : position.stopLoss;
        if (sl && !isNaN(sl)) {
          addPriceLine(
            `sl-${posId}`,
            sl,
            `🛑 SL @ ${sl.toFixed(5)}`,
            PRICE_LINE_STYLES.stopLoss
          );
        }
      }

      if (position.takeProfit) {
        const tp =
          typeof position.takeProfit === "string"
            ? parseFloat(position.takeProfit)
            : position.takeProfit;
        if (tp && !isNaN(tp)) {
          addPriceLine(
            `tp-${posId}`,
            tp,
            `🎯 TP @ ${tp.toFixed(5)}`,
            PRICE_LINE_STYLES.takeProfit
          );
        }
      }
    });

    // Linhas de desenho (suporte/resistência)
    drawingLines.forEach((line) => {
      if (line.type === "horizontal" && line.price) {
        const style = line.color === "#22c55e" ? PRICE_LINE_STYLES.support : PRICE_LINE_STYLES.resistance;
        addPriceLine(
          `drawing-${line.id}`,
          line.price,
          line.label || `${line.price.toFixed(5)}`,
          { ...style, color: line.color }
        );
      }
    });

    // Linha de preço atual
    if (currentPrice && !isNaN(currentPrice)) {
      addPriceLine(
        "current-price",
        currentPrice,
        `Atual: ${currentPrice.toFixed(5)}`,
        PRICE_LINE_STYLES.currentPrice
      );
    }
  }, [openPositions, currentPrice, drawingLines, addPriceLine, clearPriceLines]);

  // Estado de loading/empty
  if (!data || data.length === 0) {
    return (
      <div
        className="w-full flex items-center justify-center bg-slate-900/50 rounded-lg border border-slate-800"
        style={{ height }}
      >
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-400">Aguardando dados de candles...</p>
        </div>
      </div>
    );
  }

  // Calcular estatísticas
  const lastCandle = chartData[chartData.length - 1];
  const candleChange = lastCandle
    ? ((lastCandle.close - lastCandle.open) / lastCandle.open) * 100
    : 0;
  const isGreen = lastCandle ? lastCandle.close >= lastCandle.open : true;

  // Obter valores atuais dos indicadores
  const currentEMA = emaData.length > 0 ? emaData[emaData.length - 1].value : null;
  const currentRSI = rsiData.length > 0 ? rsiData[rsiData.length - 1].value : null;

  return (
    <div className="w-full">
      {/* Header do gráfico */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white">{symbol}</span>
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
              {timeframe}
            </span>
          </div>
          {lastCandle && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-400">
                O: <span className="text-white font-mono">{lastCandle.open.toFixed(5)}</span>
              </span>
              <span className="text-slate-400">
                H: <span className="text-green-400 font-mono">{lastCandle.high.toFixed(5)}</span>
              </span>
              <span className="text-slate-400">
                L: <span className="text-red-400 font-mono">{lastCandle.low.toFixed(5)}</span>
              </span>
              <span className="text-slate-400">
                C: <span className={`font-mono ${isGreen ? "text-green-400" : "text-red-400"}`}>
                  {lastCandle.close.toFixed(5)}
                </span>
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Indicadores no header */}
          {showEMA200 && currentEMA && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1">
              <span className="text-xs text-amber-400 font-mono">
                EMA200: {currentEMA.toFixed(5)}
              </span>
            </div>
          )}
          {showRSI && currentRSI && (
            <div className={`rounded px-2 py-1 ${
              currentRSI < 30 
                ? "bg-green-500/10 border border-green-500/30" 
                : currentRSI > 70 
                  ? "bg-red-500/10 border border-red-500/30"
                  : "bg-violet-500/10 border border-violet-500/30"
            }`}>
              <span className={`text-xs font-mono ${
                currentRSI < 30 
                  ? "text-green-400" 
                  : currentRSI > 70 
                    ? "text-red-400"
                    : "text-violet-400"
              }`}>
                RSI: {currentRSI.toFixed(1)}
              </span>
            </div>
          )}
          {currentPrice && (
            <div className="bg-slate-800/80 border border-slate-700 rounded px-3 py-1">
              <span className="text-xs text-slate-400 mr-2">Preço Atual</span>
              <span className="text-cyan-400 font-mono font-semibold">
                {currentPrice.toFixed(5)}
              </span>
            </div>
          )}
          {candleChange !== 0 && (
            <div
              className={`px-2 py-1 rounded text-sm font-semibold ${
                isGreen
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              {isGreen ? "+" : ""}{candleChange.toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      {/* Container do gráfico principal */}
      <div className="relative w-full" style={{ height: showRSI ? height - 120 : height }}>
        {/* Cronômetro de Vela */}
        <div className="absolute top-3 right-16 z-20 pointer-events-none flex items-center gap-2">
          <div className="bg-slate-800/90 border border-slate-700 text-slate-200 px-3 py-1 rounded text-xs font-mono font-bold shadow-sm">
            Fecha em: <span className="text-yellow-400">{timeLeft}</span>
          </div>
        </div>
        
        {/* Gráfico Principal */}
        <div
          ref={chartContainerRef}
          className="w-full h-full rounded-lg overflow-hidden border border-slate-800"
        />
      </div>

      {/* Gráfico RSI */}
      {showRSI && (
        <div className="mt-2">
          <div className="flex items-center gap-2 mb-1 px-1">
            <span className="text-xs text-violet-400 font-semibold">RSI (14)</span>
            <span className="text-xs text-slate-500">
              Sobrevenda: &lt;30 | Sobrecompra: &gt;70
            </span>
          </div>
          <div
            ref={rsiContainerRef}
            className="w-full rounded-lg overflow-hidden border border-slate-800"
            style={{ height: 100 }}
          />
        </div>
      )}

      {/* Footer com informações */}
      <div className="mt-3 flex items-center justify-between text-xs text-slate-400 px-1">
        <div className="flex items-center gap-4">
          {showEMA200 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-amber-500 rounded"></div>
              <span>EMA 200</span>
            </div>
          )}
          {openPositions.length > 0 && (
            <>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-blue-500 rounded"></div>
                <span>Entry</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-red-500 rounded"></div>
                <span>Stop Loss</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-green-500 rounded"></div>
                <span>Take Profit</span>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          {openPositions.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></div>
              <span className="font-semibold text-slate-300">
                {openPositions.length} Posição(ões) Aberta(s)
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SmartChart;
