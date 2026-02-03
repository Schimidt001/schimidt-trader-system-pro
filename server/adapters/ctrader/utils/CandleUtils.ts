import { TrendbarData } from "../SMCInstitutionalTypes";

/**
 * Utilitário para garantir que apenas candles fechados sejam utilizados.
 * Resolve o problema P0.1 (Look-Ahead Bias).
 */
export class CandleUtils {
  /**
   * Obtém o último candle completamente fechado de uma lista.
   * 
   * @param candles Lista de candles (pode incluir o candle em formação)
   * @param timeframeMinutes Duração do timeframe em minutos
   * @param nowUtcMs Timestamp atual em milissegundos (opcional, usa Date.now() se omitido)
   * @param safetyMs Margem de segurança em milissegundos (default: 1000ms)
   * @returns O último candle fechado ou null se nenhum candle estiver fechado
   */
  static getLastClosedCandle(
    candles: TrendbarData[],
    timeframeMinutes: number,
    nowUtcMs: number = Date.now(),
    safetyMs: number = 1000
  ): TrendbarData | null {
    if (!candles || candles.length === 0) return null;

    const timeframeMs = timeframeMinutes * 60 * 1000;
    
    // Filtrar candles que já terminaram
    // Um candle com timestamp T termina em T + timeframeMs
    const closedCandles = candles.filter(candle => {
      const candleEndTime = candle.timestamp + timeframeMs;
      // O candle está fechado se o tempo atual for maior que o tempo de fim + margem de segurança
      return nowUtcMs >= (candleEndTime + safetyMs);
    });

    if (closedCandles.length === 0) return null;

    return closedCandles[closedCandles.length - 1];
  }

  /**
   * Filtra uma lista de candles mantendo apenas os fechados.
   */
  static filterClosedCandles(
    candles: TrendbarData[],
    timeframeMinutes: number,
    nowUtcMs: number = Date.now()
  ): TrendbarData[] {
    const timeframeMs = timeframeMinutes * 60 * 1000;
    return candles.filter(candle => (candle.timestamp + timeframeMs) <= nowUtcMs);
  }
}
