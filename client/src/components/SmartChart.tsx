/**
 * SmartChart - Gráfico Profissional de Candlestick
 * 
 * Utiliza lightweight-charts v5 (TradingView) para renderização de alta performance.
 * Componente PASSIVO: apenas consome dados via props, não faz chamadas de API.
 * 
 * @author Manus AI - Implementação para IC Markets Dashboard
 * @version 1.0.0
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
  // Campos comuns - pelo menos um identificador
  id?: number;
  positionId?: string;
  // Direção pode vir em vários formatos
  direction: "up" | "down" | "BUY" | "SELL" | string;
  // Preço de entrada pode ser string ou number
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

interface SmartChartProps {
  /** Array de candles OHLC */
  data: CandleData[];
  /** Preço atual em tempo real (para atualizar o último candle) */
  currentPrice?: number | null;
  /** Preço de abertura do candle atual */
  currentOpen?: number | null;
  /** Posições abertas para plotar linhas de entrada/SL/TP */
  openPositions?: Position[];
  /** Altura do gráfico em pixels */
  height?: number;
  /** Símbolo sendo exibido (para título) */
  symbol?: string;
  /** Timeframe atual */
  timeframe?: string;
}

// ============= CONSTANTES DE ESTILO =============

const CHART_COLORS = {
  background: "#0f172a", // slate-900
  textColor: "#94a3b8", // slate-400
  gridColor: "#1e293b", // slate-800
  borderColor: "#334155", // slate-700
  candleUp: "#26a69a", // Verde TradingView
  candleDown: "#ef5350", // Vermelho TradingView
  wickUp: "#26a69a",
  wickDown: "#ef5350",
};

const PRICE_LINE_STYLES = {
  entry: {
    color: "#3b82f6", // Azul
    lineWidth: 2,
    lineStyle: LineStyle.Dashed,
    axisLabelVisible: true,
  },
  stopLoss: {
    color: "#ef4444", // Vermelho
    lineWidth: 2,
    lineStyle: LineStyle.Solid,
    axisLabelVisible: true,
  },
  takeProfit: {
    color: "#22c55e", // Verde
    lineWidth: 2,
    lineStyle: LineStyle.Solid,
    axisLabelVisible: true,
  },
  currentPrice: {
    color: "#06b6d4", // Cyan
    lineWidth: 1,
    lineStyle: LineStyle.Dotted,
    axisLabelVisible: true,
  },
};

// ============= COMPONENTE PRINCIPAL =============

export function SmartChart({
  data,
  currentPrice,
  currentOpen,
  openPositions = [],
  height = 500,
  symbol = "USDJPY",
  timeframe = "M15",
}: SmartChartProps) {
  // Refs para o chart e série
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  
  // Ref para rastrear o candle atual em formação (preserva high/low entre ticks)
  const currentCandleRef = useRef<{
    time: Time;
    open: number;
    high: number;
    low: number;
    close: number;
  } | null>(null);

  // State para o cronômetro de vela (Candle Timer)
  const [timeLeft, setTimeLeft] = useState<string>("--:--");

  // Calcular segundos por candle baseado no timeframe
  const getSecondsPerCandle = useCallback((tf: string): number => {
    const match = tf.match(/^M(\d+)$/i);
    if (match) {
      return parseInt(match[1]) * 60; // M1 = 60s, M5 = 300s, M15 = 900s, etc.
    }
    // Fallback para timeframes comuns
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
      const now = Math.floor(Date.now() / 1000); // Timestamp atual em segundos
      const secondsIntoCandle = now % secondsPerCandle;
      const secondsRemaining = secondsPerCandle - secondsIntoCandle;
      
      // Formatar como MM:SS
      const minutes = Math.floor(secondsRemaining / 60);
      const seconds = secondsRemaining % 60;
      setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    // Atualizar imediatamente
    updateTimer();
    
    // Atualizar a cada segundo
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

  // Função para limpar price lines
  const clearPriceLines = useCallback(() => {
    if (!candleSeriesRef.current) return;

    priceLinesRef.current.forEach((line) => {
      try {
        candleSeriesRef.current?.removePriceLine(line);
      } catch (e) {
        // Linha já removida, ignorar
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

  // Inicializar o gráfico
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Criar o chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height,
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
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
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

    // Criar série de candlestick usando a nova API v5
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: CHART_COLORS.candleUp,
      downColor: CHART_COLORS.candleDown,
      borderUpColor: CHART_COLORS.candleUp,
      borderDownColor: CHART_COLORS.candleDown,
      wickUpColor: CHART_COLORS.wickUp,
      wickDownColor: CHART_COLORS.wickDown,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // Resize handler
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      clearPriceLines();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [height, clearPriceLines]);

  // Atualizar dados do gráfico
  useEffect(() => {
    if (!candleSeriesRef.current || chartData.length === 0) return;

    candleSeriesRef.current.setData(chartData);
    
    // Resetar o candle atual quando os dados mudam (novo candle do backend)
    currentCandleRef.current = null;

    // Ajustar visualização para mostrar os últimos candles
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [chartData]);

  // Atualizar o último candle com preço em tempo real (tick-by-tick streaming)
  // Inclui GAP DETECTION: cria nova vela se o tempo atual exceder a última vela do histórico
  useEffect(() => {
    if (
      !candleSeriesRef.current ||
      !currentPrice ||
      chartData.length === 0
    )
      return;

    const lastCandle = chartData[chartData.length - 1];
    if (!lastCandle) return;

    // IMPORTANTE: O backend retorna timestamp em MILISSEGUNDOS (utcTimestampInMinutes * 60 * 1000)
    // Precisamos normalizar para SEGUNDOS para comparar com Date.now()/1000
    const lastCandleTimeRaw = lastCandle.time as number;
    
    // Detectar se o timestamp está em milissegundos (valor muito grande) ou segundos
    // Timestamps em segundos desde 1970 são ~1.7 bilhões, em ms são ~1.7 trilhões
    const isMilliseconds = lastCandleTimeRaw > 1e12;
    const lastCandleTimeSeconds = isMilliseconds ? Math.floor(lastCandleTimeRaw / 1000) : lastCandleTimeRaw;
    
    // Calcular o intervalo em segundos baseado no timeframe
    const intervalSeconds = getSecondsPerCandle(timeframe);
    
    // Calcular qual deveria ser o tempo da vela ATUAL baseada no relógio UTC
    // (Arredonda para baixo para o início do intervalo mais próximo)
    const nowSeconds = Math.floor(Date.now() / 1000);
    const currentIntervalTimeSeconds = Math.floor(nowSeconds / intervalSeconds) * intervalSeconds;
    
    // Converter de volta para o formato original (ms ou s) para consistência com lightweight-charts
    const currentIntervalTime = isMilliseconds ? currentIntervalTimeSeconds * 1000 : currentIntervalTimeSeconds;
    const lastCandleTime = lastCandleTimeRaw; // Manter no formato original

    // DEBUG: Descomentar para verificar os valores
    // console.log('[SmartChart] Gap Detection:', {
    //   lastCandleTimeRaw,
    //   isMilliseconds,
    //   lastCandleTimeSeconds,
    //   nowSeconds,
    //   currentIntervalTimeSeconds,
    //   currentIntervalTime,
    //   shouldCreateNewCandle: currentIntervalTimeSeconds > lastCandleTimeSeconds,
    //   timeframe,
    //   intervalSeconds
    // });

    // GAP DETECTION: Verifica se estamos numa vela nova (tempo atual > última vela do histórico)
    // Comparar em SEGUNDOS para evitar problemas de formato
    if (currentIntervalTimeSeconds > lastCandleTimeSeconds) {
      // CRIAR NOVA VELA - O tempo atual excede a última vela do histórico
      // Verifica se já estamos rastreando essa nova vela
      const isTrackingNewCandle = currentCandleRef.current?.time === currentIntervalTime;
      
      if (isTrackingNewCandle && currentCandleRef.current) {
        // Já estamos na nova vela: atualizar high/low/close preservando extremos
        currentCandleRef.current = {
          time: currentIntervalTime as Time,
          open: currentCandleRef.current.open, // Manter abertura original
          high: Math.max(currentCandleRef.current.high, currentPrice),
          low: Math.min(currentCandleRef.current.low, currentPrice),
          close: currentPrice,
        };
      } else {
        // Primeira vez nesta nova vela: criar com preço atual como OHLC
        currentCandleRef.current = {
          time: currentIntervalTime as Time,
          open: currentPrice,
          high: currentPrice,
          low: currentPrice,
          close: currentPrice,
        };
      }
    } else {
      // ATUALIZAR VELA EXISTENTE - Estamos dentro do intervalo da última vela do histórico
      const isSameCandle = currentCandleRef.current?.time === lastCandleTime;

      if (isSameCandle && currentCandleRef.current) {
        // Mesmo candle: atualizar high/low/close preservando os extremos
        currentCandleRef.current = {
          time: lastCandleTime as Time,
          open: currentCandleRef.current.open, // Manter abertura original
          high: Math.max(currentCandleRef.current.high, currentPrice),
          low: Math.min(currentCandleRef.current.low, currentPrice),
          close: currentPrice,
        };
      } else {
        // Inicializar com os dados do backend + preço atual
        currentCandleRef.current = {
          time: lastCandleTime as Time,
          open: currentOpen ?? lastCandle.open,
          high: Math.max(lastCandle.high, currentPrice),
          low: Math.min(lastCandle.low, currentPrice),
          close: currentPrice,
        };
      }
    }

    // A MÁGICA: Isso faz o gráfico se mexer sem recarregar
    candleSeriesRef.current.update(currentCandleRef.current as CandlestickData<Time>);
  }, [currentPrice, currentOpen, chartData, timeframe, getSecondsPerCandle]);

  // Atualizar price lines das posições
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    // Limpar linhas antigas
    clearPriceLines();

    // Adicionar linhas para cada posição aberta
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

      // Linha de entrada
      addPriceLine(
        `entry-${posId}`,
        entryPrice,
        `${directionEmoji} Entry @ ${entryPrice.toFixed(5)}`,
        PRICE_LINE_STYLES.entry
      );

      // Linha de Stop Loss
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

      // Linha de Take Profit
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

    // Linha de preço atual
    if (currentPrice && !isNaN(currentPrice)) {
      addPriceLine(
        "current-price",
        currentPrice,
        `Atual: ${currentPrice.toFixed(5)}`,
        PRICE_LINE_STYLES.currentPrice
      );
    }
  }, [openPositions, currentPrice, addPriceLine, clearPriceLines]);

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

  // Calcular estatísticas do candle atual
  const lastCandle = chartData[chartData.length - 1];
  const candleChange = lastCandle
    ? ((lastCandle.close - lastCandle.open) / lastCandle.open) * 100
    : 0;
  const isGreen = lastCandle ? lastCandle.close >= lastCandle.open : true;

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
                O:{" "}
                <span className="text-white font-mono">
                  {lastCandle.open.toFixed(5)}
                </span>
              </span>
              <span className="text-slate-400">
                H:{" "}
                <span className="text-green-400 font-mono">
                  {lastCandle.high.toFixed(5)}
                </span>
              </span>
              <span className="text-slate-400">
                L:{" "}
                <span className="text-red-400 font-mono">
                  {lastCandle.low.toFixed(5)}
                </span>
              </span>
              <span className="text-slate-400">
                C:{" "}
                <span
                  className={`font-mono ${
                    isGreen ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {lastCandle.close.toFixed(5)}
                </span>
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
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
              {isGreen ? "+" : ""}
              {candleChange.toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      {/* Container do gráfico com Timer */}
      <div className="relative w-full" style={{ height }}>
        {/* Cronômetro de Vela (Candle Timer) */}
        <div className="absolute top-3 right-16 z-20 pointer-events-none flex items-center gap-2">
          <div className="bg-slate-800/90 border border-slate-700 text-slate-200 px-3 py-1 rounded text-xs font-mono font-bold shadow-sm">
            Fecha em: <span className="text-yellow-400">{timeLeft}</span>
          </div>
        </div>
        
        {/* Gráfico */}
        <div
          ref={chartContainerRef}
          className="w-full h-full rounded-lg overflow-hidden border border-slate-800"
        />
      </div>

      {/* Footer com informações de posições */}
      {openPositions.length > 0 && (
        <div className="mt-3 flex items-center gap-4 text-xs text-slate-400 px-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-blue-500 rounded"></div>
            <span>Entry Price</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-red-500 rounded"></div>
            <span>Stop Loss</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-green-500 rounded"></div>
            <span>Take Profit</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></div>
            <span className="font-semibold text-slate-300">
              {openPositions.length} Posição(ões) Aberta(s)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default SmartChart;
