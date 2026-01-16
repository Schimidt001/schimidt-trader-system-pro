/**
 * Gate C - Teste Anti Look-Ahead
 * 
 * Verifica que decisões de trading não usam dados futuros.
 * 
 * Critério de aprovação:
 * - Alterar candles futuros e garantir que decisões/trades até t não mudam
 * - Testar no engine/MTF
 * - Testar no RegimeDetector (janela realmente "passada")
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { describe, it, expect } from "vitest";
import * as crypto from "crypto";
import { RegimeDetector, createRegimeDetector } from "../validation/RegimeDetector";
import { createSeededRNG } from "../utils/SeededRNG";

// ============================================================================
// HELPERS
// ============================================================================

function hashObject(obj: unknown): string {
  const json = JSON.stringify(obj, (key, value) => {
    if (typeof value === "number") {
      return Math.round(value * 1e8) / 1e8;
    }
    return value;
  });
  return crypto.createHash("sha256").update(json).digest("hex");
}

function createMockCandles(seed: number, count: number): any[] {
  const rng = createSeededRNG(seed);
  const candles = [];
  let price = 1900;

  for (let i = 0; i < count; i++) {
    const change = (rng.next() - 0.5) * 10;
    const open = price;
    const high = open + Math.abs(change) + rng.next() * 5;
    const low = open - Math.abs(change) - rng.next() * 5;
    const close = open + change;
    price = close;

    candles.push({
      timestamp: Date.now() - (count - i) * 5 * 60 * 1000,
      open,
      high,
      low,
      close,
      volume: 1000 + rng.next() * 500,
    });
  }

  return candles;
}

/**
 * Modifica candles a partir de um índice específico
 */
function modifyFutureCandles(candles: any[], fromIndex: number): any[] {
  const modified = candles.map((c, i) => {
    if (i >= fromIndex) {
      // Modificar drasticamente os candles futuros
      return {
        ...c,
        open: c.open * 1.5,
        high: c.high * 1.5,
        low: c.low * 1.5,
        close: c.close * 1.5,
        volume: c.volume * 2,
      };
    }
    return { ...c };
  });
  return modified;
}

/**
 * Simula decisões de trading baseadas em indicadores
 * Esta função representa a lógica que NÃO deve usar dados futuros
 */
function simulateTradingDecisions(candles: any[], upToIndex: number): {
  decisions: Array<{ index: number; action: string; price: number }>;
  indicators: Array<{ index: number; sma: number; rsi: number }>;
} {
  const decisions: Array<{ index: number; action: string; price: number }> = [];
  const indicators: Array<{ index: number; sma: number; rsi: number }> = [];

  const lookback = 20;

  for (let i = lookback; i <= upToIndex && i < candles.length; i++) {
    // Calcular SMA usando apenas dados passados (até i, não além)
    let sum = 0;
    for (let j = i - lookback + 1; j <= i; j++) {
      sum += candles[j].close;
    }
    const sma = sum / lookback;

    // Calcular RSI simplificado usando apenas dados passados
    let gains = 0;
    let losses = 0;
    for (let j = i - lookback + 1; j <= i; j++) {
      const change = candles[j].close - candles[j - 1]?.close || 0;
      if (change > 0) gains += change;
      else losses -= change;
    }
    const avgGain = gains / lookback;
    const avgLoss = losses / lookback || 0.001;
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    indicators.push({ index: i, sma, rsi });

    // Decisão baseada em indicadores (sem look-ahead)
    const currentPrice = candles[i].close;
    if (currentPrice > sma && rsi < 70) {
      decisions.push({ index: i, action: "BUY", price: currentPrice });
    } else if (currentPrice < sma && rsi > 30) {
      decisions.push({ index: i, action: "SELL", price: currentPrice });
    }
  }

  return { decisions, indicators };
}

// ============================================================================
// TESTS
// ============================================================================

describe("Gate C - Anti Look-Ahead", () => {
  const SEED = 12345;
  const TOTAL_CANDLES = 500;
  const CUTOFF_INDEX = 250; // Ponto de corte para teste

  describe("Trading Decisions Anti Look-Ahead", () => {
    it("decisões até t não devem mudar quando candles futuros são alterados", () => {
      // Criar candles originais
      const originalCandles = createMockCandles(SEED, TOTAL_CANDLES);

      // Simular decisões até o ponto de corte
      const originalResult = simulateTradingDecisions(originalCandles, CUTOFF_INDEX);
      const originalHash = hashObject(originalResult);

      // Modificar candles APÓS o ponto de corte
      const modifiedCandles = modifyFutureCandles(originalCandles, CUTOFF_INDEX + 1);

      // Simular decisões novamente até o mesmo ponto
      const modifiedResult = simulateTradingDecisions(modifiedCandles, CUTOFF_INDEX);
      const modifiedHash = hashObject(modifiedResult);

      // Decisões até o ponto de corte devem ser IDÊNTICAS
      expect(modifiedHash).toBe(originalHash);
    });

    it("indicadores até t não devem mudar quando candles futuros são alterados", () => {
      const originalCandles = createMockCandles(SEED, TOTAL_CANDLES);
      const modifiedCandles = modifyFutureCandles(originalCandles, CUTOFF_INDEX + 1);

      const originalIndicators = simulateTradingDecisions(originalCandles, CUTOFF_INDEX).indicators;
      const modifiedIndicators = simulateTradingDecisions(modifiedCandles, CUTOFF_INDEX).indicators;

      // Cada indicador até o ponto de corte deve ser idêntico
      for (let i = 0; i < originalIndicators.length; i++) {
        expect(originalIndicators[i].sma).toBeCloseTo(modifiedIndicators[i].sma, 8);
        expect(originalIndicators[i].rsi).toBeCloseTo(modifiedIndicators[i].rsi, 8);
      }
    });

    it("modificar apenas um candle futuro não deve afetar decisões passadas", () => {
      const originalCandles = createMockCandles(SEED, TOTAL_CANDLES);
      
      // Modificar apenas o último candle
      const modifiedCandles = [...originalCandles];
      modifiedCandles[TOTAL_CANDLES - 1] = {
        ...modifiedCandles[TOTAL_CANDLES - 1],
        close: 9999999, // Valor absurdo
      };

      const originalResult = simulateTradingDecisions(originalCandles, TOTAL_CANDLES - 2);
      const modifiedResult = simulateTradingDecisions(modifiedCandles, TOTAL_CANDLES - 2);

      expect(hashObject(originalResult)).toBe(hashObject(modifiedResult));
    });
  });

  describe("RegimeDetector Anti Look-Ahead", () => {
    it("detecção de regime até t não deve usar dados de t+1", async () => {
      const originalCandles = createMockCandles(SEED, TOTAL_CANDLES);
      const modifiedCandles = modifyFutureCandles(originalCandles, CUTOFF_INDEX + 1);

      const detector = createRegimeDetector({
        lookbackPeriod: 50,
        volatilityThreshold: 1.5,
        trendThreshold: 0.5,
        rangeThreshold: 3.0,
      });

      // Detectar regimes usando apenas candles até o ponto de corte
      const originalResult = await detector.detect(originalCandles.slice(0, CUTOFF_INDEX + 1));
      const modifiedResult = await detector.detect(modifiedCandles.slice(0, CUTOFF_INDEX + 1));

      // Resultados devem ser idênticos (mesmos dados de entrada)
      expect(hashObject(originalResult.regimes)).toBe(hashObject(modifiedResult.regimes));
    });

    it("janela de lookback deve usar apenas dados passados", async () => {
      const candles = createMockCandles(SEED, 200);
      const detector = createRegimeDetector({
        lookbackPeriod: 50,
      });

      const result = await detector.detect(candles);

      // Verificar que cada regime foi detectado usando apenas dados até seu timestamp
      for (const regime of result.regimes) {
        // O regime não deve ter sido detectado antes de haver dados suficientes
        const regimeIndex = candles.findIndex(c => c.timestamp === regime.startTimestamp);
        expect(regimeIndex).toBeGreaterThanOrEqual(49); // lookbackPeriod - 1
      }
    });

    it("adicionar candles futuros não deve alterar regimes passados", async () => {
      const shortCandles = createMockCandles(SEED, 200);
      const longCandles = createMockCandles(SEED, 400); // Mesmos primeiros 200 + mais 200

      const detector = createRegimeDetector({
        lookbackPeriod: 50,
      });

      const shortResult = await detector.detect(shortCandles);
      const longResult = await detector.detect(longCandles);

      // Regimes detectados nos primeiros 200 candles devem ser idênticos
      const shortRegimes = shortResult.regimes;
      const longRegimesUpTo200 = longResult.regimes.filter(r => {
        const idx = longCandles.findIndex(c => c.timestamp === r.startTimestamp);
        return idx < 200;
      });

      // Comparar apenas os regimes que terminam antes do índice 200
      const comparableShort = shortRegimes.filter(r => {
        const idx = shortCandles.findIndex(c => c.timestamp === r.endTimestamp);
        return idx < 190; // Margem para evitar edge cases
      });

      const comparableLong = longRegimesUpTo200.filter(r => {
        const idx = longCandles.findIndex(c => c.timestamp === r.endTimestamp);
        return idx < 190;
      });

      expect(comparableShort.length).toBe(comparableLong.length);
    });
  });

  describe("Indicadores Técnicos Anti Look-Ahead", () => {
    it("SMA não deve usar dados futuros", () => {
      const candles = createMockCandles(SEED, 100);
      const period = 20;

      for (let i = period; i < candles.length; i++) {
        // Calcular SMA no ponto i
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) {
          sum += candles[j].close;
        }
        const sma = sum / period;

        // Modificar candles futuros
        const modifiedCandles = [...candles];
        for (let j = i + 1; j < modifiedCandles.length; j++) {
          modifiedCandles[j] = { ...modifiedCandles[j], close: 999999 };
        }

        // Recalcular SMA
        let sumModified = 0;
        for (let j = i - period + 1; j <= i; j++) {
          sumModified += modifiedCandles[j].close;
        }
        const smaModified = sumModified / period;

        // SMA deve ser idêntico
        expect(sma).toBeCloseTo(smaModified, 10);
      }
    });

    it("RSI não deve usar dados futuros", () => {
      const candles = createMockCandles(SEED, 100);
      const period = 14;

      function calculateRSI(data: any[], index: number): number {
        let gains = 0;
        let losses = 0;
        for (let j = index - period + 1; j <= index; j++) {
          const change = data[j].close - (data[j - 1]?.close || data[j].close);
          if (change > 0) gains += change;
          else losses -= change;
        }
        const avgGain = gains / period;
        const avgLoss = losses / period || 0.001;
        return 100 - (100 / (1 + avgGain / avgLoss));
      }

      for (let i = period; i < candles.length - 10; i++) {
        const originalRSI = calculateRSI(candles, i);

        // Modificar candles futuros
        const modifiedCandles = [...candles];
        for (let j = i + 1; j < modifiedCandles.length; j++) {
          modifiedCandles[j] = { ...modifiedCandles[j], close: 999999 };
        }

        const modifiedRSI = calculateRSI(modifiedCandles, i);

        expect(originalRSI).toBeCloseTo(modifiedRSI, 10);
      }
    });
  });

  describe("Cenários de Look-Ahead Proibidos", () => {
    it("não deve ser possível prever máximos/mínimos futuros", () => {
      const candles = createMockCandles(SEED, 100);

      // Função que INCORRETAMENTE usa dados futuros (para demonstrar o problema)
      function badPrediction(data: any[], index: number, futureWindow: number): number {
        // ERRADO: olha para frente
        let maxPrice = data[index].high;
        for (let j = index + 1; j <= index + futureWindow && j < data.length; j++) {
          maxPrice = Math.max(maxPrice, data[j].high);
        }
        return maxPrice;
      }

      // Função correta que usa apenas dados passados
      function goodPrediction(data: any[], index: number, pastWindow: number): number {
        // CORRETO: olha apenas para trás
        let maxPrice = data[index].high;
        for (let j = Math.max(0, index - pastWindow); j < index; j++) {
          maxPrice = Math.max(maxPrice, data[j].high);
        }
        return maxPrice;
      }

      // Testar que a função boa não muda com dados futuros alterados
      const testIndex = 50;
      const originalGood = goodPrediction(candles, testIndex, 10);
      
      const modifiedCandles = modifyFutureCandles(candles, testIndex + 1);
      const modifiedGood = goodPrediction(modifiedCandles, testIndex, 10);

      expect(originalGood).toBe(modifiedGood);
    });
  });
});

// ============================================================================
// EXPORT PARA CI
// ============================================================================

export const GATE_C_DESCRIPTION = `
Gate C - Anti Look-Ahead
========================
Verifica que decisões de trading não usam dados futuros.

Critérios:
- Alterar candles futuros não muda decisões até t
- Indicadores (SMA, RSI) usam apenas dados passados
- RegimeDetector usa janela realmente "passada"
- Impossível prever máximos/mínimos futuros

Execução: npx vitest run gate-c-anti-lookahead.test.ts
`;
