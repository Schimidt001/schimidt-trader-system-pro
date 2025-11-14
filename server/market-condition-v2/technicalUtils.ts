/**
 * Market Condition Detector v2.0 - Technical Utils
 * 
 * Funções para cálculos técnicos (ATR, amplitude, wicks, etc)
 */

import type { CandleData } from "./types";

/**
 * Calcula a amplitude de um candle (high - low)
 */
export function calculateAmplitude(candle: CandleData): number {
  return candle.high - candle.low;
}

/**
 * Calcula o corpo de um candle (|close - open|)
 */
export function calculateBody(candle: CandleData): number {
  return Math.abs(candle.close - candle.open);
}

/**
 * Calcula as sombras (wicks) de um candle
 */
export function calculateWicks(candle: CandleData): {
  superior: number;
  inferior: number;
} {
  const maxPrice = Math.max(candle.open, candle.close);
  const minPrice = Math.min(candle.open, candle.close);
  
  return {
    superior: candle.high - maxPrice,
    inferior: minPrice - candle.low,
  };
}

/**
 * Calcula o ATR (Average True Range) para um período
 * 
 * @param candles Histórico de candles (mínimo: period + 1)
 * @param period Período do ATR (padrão: 14)
 * @returns Valor do ATR
 */
export function calculateATR(candles: CandleData[], period: number = 14): number {
  if (candles.length < period + 1) {
    throw new Error(`ATR requires at least ${period + 1} candles`);
  }
  
  const trueRanges: number[] = [];
  
  // Calcular True Range para cada candle
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];
    
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    );
    
    trueRanges.push(tr);
  }
  
  // Calcular média dos últimos 'period' True Ranges
  const recentTRs = trueRanges.slice(-period);
  const atr = recentTRs.reduce((sum, tr) => sum + tr, 0) / period;
  
  return atr;
}

/**
 * Verifica se um candle tem volatilidade fractal
 * (corpo pequeno em relação à amplitude)
 * 
 * @param candle Candle a ser analisado
 * @param threshold Razão máxima corpo/amplitude (padrão: 1.8)
 * @returns true se houver volatilidade fractal
 */
export function hasFractalVolatility(
  candle: CandleData,
  threshold: number = 1.8
): boolean {
  const amplitude = calculateAmplitude(candle);
  const corpo = calculateBody(candle);
  
  if (amplitude === 0) return false;
  
  // Se amplitude é muito maior que o corpo, há volatilidade fractal
  const ratio = amplitude / corpo;
  return ratio > threshold;
}

/**
 * Calcula o spread médio de um conjunto de candles
 */
export function calculateAverageSpread(candles: CandleData[]): number {
  if (candles.length === 0) return 0;
  
  const spreads = candles.map(c => calculateAmplitude(c));
  return spreads.reduce((sum, s) => sum + s, 0) / spreads.length;
}
