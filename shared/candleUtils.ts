/**
 * Candle Utilities - Módulo Centralizado para Manipulação de Candles
 * 
 * Este módulo centraliza funções utilitárias para manipulação de candles,
 * especialmente para garantir ZERO LOOK-AHEAD em sistemas de trading.
 * 
 * CRÍTICO: Em trading algorítmico, usar candles em formação é um erro grave
 * que pode gerar sinais falsos e perdas financeiras. Este módulo garante
 * que apenas candles FECHADOS sejam usados para tomada de decisão.
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 * @see Auditoria P0.1 - Look-Ahead Prevention
 */

import { TrendbarData } from "../server/adapters/ctrader/CTraderClient";

/**
 * Timeframe em minutos para cada período suportado
 */
export const TIMEFRAME_MINUTES: Record<string, number> = {
  'M1': 1,
  'M5': 5,
  'M15': 15,
  'M30': 30,
  'H1': 60,
  'H4': 240,
  'D1': 1440,
  'W1': 10080,
};

/**
 * Resultado da verificação de candle fechado
 */
export interface ClosedCandleResult {
  /** O último candle confirmado como fechado */
  candle: TrendbarData | null;
  /** Índice do candle no array original */
  index: number;
  /** Se o candle foi confirmado como fechado */
  isConfirmed: boolean;
  /** Razão se não foi confirmado */
  reason?: string;
}

/**
 * Obtém o último candle FECHADO de um array de candles.
 * 
 * CRÍTICO: Esta função é a base para garantir ZERO LOOK-AHEAD.
 * 
 * Um candle é considerado FECHADO quando:
 * - candle.openTime + timeframeMs <= nowUtcMs
 * 
 * Isso significa que o período do candle já terminou e seus valores
 * (open, high, low, close) são finais e não vão mais mudar.
 * 
 * @param candles - Array de candles ordenados por timestamp (mais antigo primeiro)
 * @param timeframeMinutes - Duração do timeframe em minutos (ex: 15 para M15)
 * @param nowUtcMs - Timestamp atual em milissegundos UTC (default: Date.now())
 * @returns Resultado com o último candle fechado confirmado
 * 
 * @example
 * ```typescript
 * import { getLastClosedCandle } from "@/shared/candleUtils";
 * 
 * // Obter último candle M15 fechado
 * const result = getLastClosedCandle(m15Candles, 15);
 * if (result.isConfirmed && result.candle) {
 *   // Seguro usar para decisões de trading
 *   console.log(`Último M15 fechado: ${result.candle.close}`);
 * }
 * ```
 */
export function getLastClosedCandle(
  candles: TrendbarData[],
  timeframeMinutes: number,
  nowUtcMs: number = Date.now()
): ClosedCandleResult {
  // Validar entrada
  if (!candles || candles.length === 0) {
    return {
      candle: null,
      index: -1,
      isConfirmed: false,
      reason: 'Array de candles vazio',
    };
  }
  
  if (timeframeMinutes <= 0) {
    return {
      candle: null,
      index: -1,
      isConfirmed: false,
      reason: `Timeframe inválido: ${timeframeMinutes}`,
    };
  }
  
  const timeframeMs = timeframeMinutes * 60 * 1000;
  
  // Iterar do mais recente para o mais antigo
  for (let i = candles.length - 1; i >= 0; i--) {
    const candle = candles[i];
    
    // Verificar se o candle tem timestamp válido
    if (!candle.timestamp || candle.timestamp <= 0) {
      continue;
    }
    
    // Calcular quando o candle fecha
    const candleCloseTime = candle.timestamp + timeframeMs;
    
    // Se o tempo de fechamento é menor ou igual ao tempo atual, o candle está fechado
    if (candleCloseTime <= nowUtcMs) {
      return {
        candle,
        index: i,
        isConfirmed: true,
      };
    }
  }
  
  // Nenhum candle fechado encontrado
  return {
    candle: null,
    index: -1,
    isConfirmed: false,
    reason: 'Nenhum candle fechado encontrado (todos ainda em formação)',
  };
}

/**
 * Obtém os últimos N candles FECHADOS de um array.
 * 
 * Útil para análises que precisam de múltiplos candles históricos,
 * garantindo que nenhum deles está em formação.
 * 
 * @param candles - Array de candles ordenados por timestamp
 * @param count - Número de candles fechados desejados
 * @param timeframeMinutes - Duração do timeframe em minutos
 * @param nowUtcMs - Timestamp atual em milissegundos UTC
 * @returns Array com os últimos N candles fechados (pode ter menos se não houver suficientes)
 * 
 * @example
 * ```typescript
 * // Obter últimos 3 candles M5 fechados para detecção de FVG
 * const closedCandles = getLastNClosedCandles(m5Candles, 3, 5);
 * if (closedCandles.length === 3) {
 *   // Seguro para detectar FVG
 *   const [candle1, candle2, candle3] = closedCandles;
 * }
 * ```
 */
export function getLastNClosedCandles(
  candles: TrendbarData[],
  count: number,
  timeframeMinutes: number,
  nowUtcMs: number = Date.now()
): TrendbarData[] {
  if (!candles || candles.length === 0 || count <= 0) {
    return [];
  }
  
  const timeframeMs = timeframeMinutes * 60 * 1000;
  const result: TrendbarData[] = [];
  
  // Iterar do mais recente para o mais antigo
  for (let i = candles.length - 1; i >= 0 && result.length < count; i--) {
    const candle = candles[i];
    
    if (!candle.timestamp || candle.timestamp <= 0) {
      continue;
    }
    
    const candleCloseTime = candle.timestamp + timeframeMs;
    
    if (candleCloseTime <= nowUtcMs) {
      result.unshift(candle); // Adicionar no início para manter ordem cronológica
    }
  }
  
  return result;
}

/**
 * Verifica se um candle específico está fechado.
 * 
 * @param candle - Candle a verificar
 * @param timeframeMinutes - Duração do timeframe em minutos
 * @param nowUtcMs - Timestamp atual em milissegundos UTC
 * @returns true se o candle está fechado
 * 
 * @example
 * ```typescript
 * const lastCandle = candles[candles.length - 1];
 * if (isCandleClosed(lastCandle, 15)) {
 *   // Candle M15 está fechado, seguro usar
 * } else {
 *   // Candle ainda em formação, NÃO usar para decisões
 * }
 * ```
 */
export function isCandleClosed(
  candle: TrendbarData,
  timeframeMinutes: number,
  nowUtcMs: number = Date.now()
): boolean {
  if (!candle || !candle.timestamp || timeframeMinutes <= 0) {
    return false;
  }
  
  const timeframeMs = timeframeMinutes * 60 * 1000;
  const candleCloseTime = candle.timestamp + timeframeMs;
  
  return candleCloseTime <= nowUtcMs;
}

/**
 * Filtra um array de candles retornando apenas os fechados.
 * 
 * @param candles - Array de candles
 * @param timeframeMinutes - Duração do timeframe em minutos
 * @param nowUtcMs - Timestamp atual em milissegundos UTC
 * @returns Array contendo apenas candles fechados
 */
export function filterClosedCandles(
  candles: TrendbarData[],
  timeframeMinutes: number,
  nowUtcMs: number = Date.now()
): TrendbarData[] {
  if (!candles || candles.length === 0 || timeframeMinutes <= 0) {
    return [];
  }
  
  const timeframeMs = timeframeMinutes * 60 * 1000;
  
  return candles.filter(candle => {
    if (!candle.timestamp || candle.timestamp <= 0) {
      return false;
    }
    const candleCloseTime = candle.timestamp + timeframeMs;
    return candleCloseTime <= nowUtcMs;
  });
}

/**
 * Obtém o timeframe em minutos a partir de uma string.
 * 
 * @param timeframe - String do timeframe (ex: "M15", "H1")
 * @returns Duração em minutos ou 0 se inválido
 */
export function getTimeframeMinutes(timeframe: string): number {
  return TIMEFRAME_MINUTES[timeframe.toUpperCase()] || 0;
}

/**
 * Calcula o tempo restante até o fechamento de um candle.
 * 
 * @param candle - Candle atual
 * @param timeframeMinutes - Duração do timeframe em minutos
 * @param nowUtcMs - Timestamp atual em milissegundos UTC
 * @returns Tempo restante em milissegundos (0 se já fechado, negativo se passado)
 */
export function getTimeUntilCandleClose(
  candle: TrendbarData,
  timeframeMinutes: number,
  nowUtcMs: number = Date.now()
): number {
  if (!candle || !candle.timestamp || timeframeMinutes <= 0) {
    return 0;
  }
  
  const timeframeMs = timeframeMinutes * 60 * 1000;
  const candleCloseTime = candle.timestamp + timeframeMs;
  
  return candleCloseTime - nowUtcMs;
}
