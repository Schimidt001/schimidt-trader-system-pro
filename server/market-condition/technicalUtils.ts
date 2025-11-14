/**
 * Market Condition Detector v1.0 - Technical Utils
 * 
 * Funções utilitárias para cálculos técnicos (ATR, médias, etc.)
 */

export interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  timestamp: number;
}

/**
 * Calcula o True Range de um candle
 */
export function calculateTrueRange(current: CandleData, previous?: CandleData): number {
  if (!previous) {
    // Se não há candle anterior, TR = high - low
    return current.high - current.low;
  }
  
  // TR = max(high - low, |high - close_anterior|, |low - close_anterior|)
  const range1 = current.high - current.low;
  const range2 = Math.abs(current.high - previous.close);
  const range3 = Math.abs(current.low - previous.close);
  
  return Math.max(range1, range2, range3);
}

/**
 * Calcula o ATR (Average True Range) para um período
 */
export function calculateATR(candles: CandleData[], period: number = 14): number {
  if (candles.length < period + 1) {
    throw new Error(`Insufficient candles for ATR calculation. Need ${period + 1}, got ${candles.length}`);
  }
  
  // Ordenar candles por timestamp (do mais antigo para o mais recente)
  const sortedCandles = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  
  // Calcular True Range para cada candle
  const trueRanges: number[] = [];
  for (let i = 1; i < sortedCandles.length; i++) {
    const tr = calculateTrueRange(sortedCandles[i], sortedCandles[i - 1]);
    trueRanges.push(tr);
  }
  
  // Calcular ATR como média dos últimos 'period' True Ranges
  const recentTRs = trueRanges.slice(-period);
  const atr = recentTRs.reduce((sum, tr) => sum + tr, 0) / recentTRs.length;
  
  return atr;
}

/**
 * Calcula a amplitude de um candle
 */
export function calculateAmplitude(candle: CandleData): number {
  return candle.high - candle.low;
}

/**
 * Calcula o corpo de um candle
 */
export function calculateBody(candle: CandleData): number {
  return Math.abs(candle.close - candle.open);
}

/**
 * Calcula as sombras (wicks) de um candle
 */
export function calculateWicks(candle: CandleData): { superior: number; inferior: number } {
  const wickSuperior = candle.high - Math.max(candle.open, candle.close);
  const wickInferior = Math.min(candle.open, candle.close) - candle.low;
  
  return {
    superior: wickSuperior,
    inferior: wickInferior,
  };
}

/**
 * Calcula a média de um array de números
 */
export function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Verifica se um candle tem volatilidade fractal
 * (corpo pequeno + amplitude muito grande = comportamento caótico)
 */
export function hasFractalVolatility(
  candle: CandleData,
  bodyToAmplitudeRatio: number = 0.3
): boolean {
  const amplitude = calculateAmplitude(candle);
  const body = calculateBody(candle);
  
  if (amplitude === 0) return false;
  
  const ratio = body / amplitude;
  return ratio < bodyToAmplitudeRatio;
}
