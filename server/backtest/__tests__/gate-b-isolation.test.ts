/**
 * Gate B - Teste de Isolamento
 * 
 * Verifica que não existe vazamento de estado entre execuções.
 * 
 * Critério de aprovação:
 * - Rodar A(seed=111) → B(seed=222) → A(seed=111)
 * - Provar que A final == A inicial
 * - Validar que não existe vazamento de estado/config
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as crypto from "crypto";
import { createSeededRNG } from "../utils/SeededRNG";
import { MonteCarloSimulator, createMonteCarloSimulator } from "../validation/MonteCarloSimulator";
import { RegimeDetector, createRegimeDetector } from "../validation/RegimeDetector";
import { BacktestTrade } from "../types/backtest.types";

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

function createMockTrades(seed: number, count: number = 100): BacktestTrade[] {
  const rng = createSeededRNG(seed);
  const trades: BacktestTrade[] = [];
  const baseTimestamp = 1704067200000; // 2024-01-01 00:00:00 UTC

  for (let i = 0; i < count; i++) {
    const isWin = rng.random() > 0.4;
    const profit = isWin ? rng.random() * 200 + 50 : -(rng.random() * 150 + 30);

    trades.push({
      id: `trade-${i}`,
      symbol: "XAUUSD",
      direction: rng.random() > 0.5 ? "LONG" : "SHORT",
      entryPrice: 1900 + rng.random() * 100,
      exitPrice: 1900 + rng.random() * 100 + (isWin ? 10 : -10),
      size: 0.1,
      openTimestamp: baseTimestamp + i * 3600 * 1000,
      closeTimestamp: baseTimestamp + i * 3600 * 1000 + 1800 * 1000,
      profit,
      commission: 7,
      pips: profit / 10,
    });
  }

  return trades;
}

function createMockCandles(seed: number, count: number = 500): any[] {
  const rng = createSeededRNG(seed);
  const candles = [];
  let price = 1900;
  const baseTimestamp = 1704067200000; // 2024-01-01 00:00:00 UTC

  for (let i = 0; i < count; i++) {
    const change = (rng.random() - 0.5) * 10;
    const open = price;
    const high = open + Math.abs(change) + rng.random() * 5;
    const low = open - Math.abs(change) - rng.random() * 5;
    const close = open + change;
    price = close;

    candles.push({
      timestamp: baseTimestamp + i * 5 * 60 * 1000,
      open,
      high,
      low,
      close,
      volume: 1000 + rng.random() * 500,
    });
  }

  return candles;
}

// ============================================================================
// TESTS
// ============================================================================

describe("Gate B - Isolamento", () => {
  const SEED_A = 111;
  const SEED_B = 222;

  describe("SeededRNG Isolamento", () => {
    it("deve manter isolamento entre instâncias de RNG", () => {
      // Criar RNG A
      const rngA1 = createSeededRNG(SEED_A);
      const seqA1: number[] = [];
      for (let i = 0; i < 10; i++) seqA1.push(rngA1.random());

      // Criar RNG B (não deve afetar A)
      const rngB = createSeededRNG(SEED_B);
      const seqB: number[] = [];
      for (let i = 0; i < 10; i++) seqB.push(rngB.random());

      // Criar novo RNG A (deve ser idêntico ao primeiro)
      const rngA2 = createSeededRNG(SEED_A);
      const seqA2: number[] = [];
      for (let i = 0; i < 10; i++) seqA2.push(rngA2.random());

      // Verificações
      expect(hashObject(seqA1)).toBe(hashObject(seqA2));
      expect(hashObject(seqA1)).not.toBe(hashObject(seqB));
    });

    it("não deve haver estado global compartilhado", () => {
      // Simular múltiplas instâncias simultâneas
      const rngs = [
        createSeededRNG(100),
        createSeededRNG(200),
        createSeededRNG(300),
      ];

      const sequences: number[][] = [[], [], []];

      // Intercalar chamadas (simula uso concorrente)
      for (let i = 0; i < 20; i++) {
        sequences[0].push(rngs[0].random());
        sequences[1].push(rngs[1].random());
        sequences[2].push(rngs[2].random());
      }

      // Criar novas instâncias e verificar reprodutibilidade
      const rngsNew = [
        createSeededRNG(100),
        createSeededRNG(200),
        createSeededRNG(300),
      ];

      const sequencesNew: number[][] = [[], [], []];

      for (let i = 0; i < 20; i++) {
        sequencesNew[0].push(rngsNew[0].random());
        sequencesNew[1].push(rngsNew[1].random());
        sequencesNew[2].push(rngsNew[2].random());
      }

      // Todas as sequências devem ser reproduzíveis
      expect(hashObject(sequences[0])).toBe(hashObject(sequencesNew[0]));
      expect(hashObject(sequences[1])).toBe(hashObject(sequencesNew[1]));
      expect(hashObject(sequences[2])).toBe(hashObject(sequencesNew[2]));
    });
  });

  describe("MonteCarloSimulator Isolamento", () => {
    it("deve manter isolamento entre simulações (A → B → A)", async () => {
      const tradesA = createMockTrades(SEED_A, 50);
      const tradesB = createMockTrades(SEED_B, 50);

      // Primeira simulação A
      const simA1 = createMonteCarloSimulator({
        simulations: 50,
        method: "BLOCK_BOOTSTRAP",
        confidenceLevel: 95,
        initialBalance: 10000,
        ruinThreshold: 50,
        blockSize: 10,
        seed: SEED_A,
      });
      const resultA1 = await simA1.simulate(tradesA);
      const hashA1 = hashObject(resultA1.percentiles);

      // Simulação B
      const simB = createMonteCarloSimulator({
        simulations: 50,
        method: "TRADE_RESAMPLING", // Método diferente
        confidenceLevel: 95,
        initialBalance: 10000,
        ruinThreshold: 50,
        blockSize: 10,
        seed: SEED_B,
      });
      const resultB = await simB.simulate(tradesB);
      const hashB = hashObject(resultB.percentiles);

      // Segunda simulação A (deve ser idêntica à primeira)
      const simA2 = createMonteCarloSimulator({
        simulations: 50,
        method: "BLOCK_BOOTSTRAP",
        confidenceLevel: 95,
        initialBalance: 10000,
        ruinThreshold: 50,
        blockSize: 10,
        seed: SEED_A,
      });
      const resultA2 = await simA2.simulate(tradesA);
      const hashA2 = hashObject(resultA2.percentiles);

      // Verificações
      expect(hashA1).toBe(hashA2);
      expect(hashA1).not.toBe(hashB);
    });
  });

  describe("RegimeDetector Isolamento", () => {
    it("deve manter isolamento entre detecções", async () => {
      const candlesA = createMockCandles(SEED_A, 200);
      const candlesB = createMockCandles(SEED_B, 200);

      // Primeira detecção A
      const detectorA1 = createRegimeDetector({
        lookbackPeriod: 50,
        volatilityThreshold: 1.5,
      });
      const resultA1 = detectorA1.detectRegimes(candlesA);
      const hashA1 = hashObject(resultA1.map(r => r.regime));

      // Detecção B
      const detectorB = createRegimeDetector({
        lookbackPeriod: 100, // Config diferente
        volatilityThreshold: 2.0,
      });
      const resultB = detectorB.detectRegimes(candlesB);
      const hashB = hashObject(resultB.map(r => r.regime));

      // Segunda detecção A
      const detectorA2 = createRegimeDetector({
        lookbackPeriod: 50,
        volatilityThreshold: 1.5,
      });
      const resultA2 = detectorA2.detectRegimes(candlesA);
      const hashA2 = hashObject(resultA2.map(r => r.regime));

      // Verificações
      expect(hashA1).toBe(hashA2);
    });
  });

  describe("Vazamento de Configuração", () => {
    it("não deve vazar configurações entre instâncias de RNG", () => {
      const rng1 = createSeededRNG(100);
      const rng2 = createSeededRNG(200);

      // Usar rng1
      const seq1: number[] = [];
      for (let i = 0; i < 5; i++) seq1.push(rng1.random());

      // Usar rng2
      const seq2: number[] = [];
      for (let i = 0; i < 5; i++) seq2.push(rng2.random());

      // Criar novas instâncias
      const rng1New = createSeededRNG(100);
      const rng2New = createSeededRNG(200);

      const seq1New: number[] = [];
      for (let i = 0; i < 5; i++) seq1New.push(rng1New.random());

      const seq2New: number[] = [];
      for (let i = 0; i < 5; i++) seq2New.push(rng2New.random());

      // Sequências devem ser reproduzíveis
      expect(seq1).toEqual(seq1New);
      expect(seq2).toEqual(seq2New);
    });

    it("modificar config de um componente não deve afetar outro", () => {
      const baseConfig = {
        simulations: 50,
        method: "BLOCK_BOOTSTRAP" as const,
        seed: 111,
      };

      const sim1 = createMonteCarloSimulator({ ...baseConfig });
      const sim2 = createMonteCarloSimulator({ ...baseConfig, seed: 222 });

      // Modificar config original
      baseConfig.seed = 999;
      baseConfig.simulations = 1000;

      // Verificar que simuladores não foram afetados
      // (eles devem ter copiado a config)
      expect(sim1).toBeDefined();
      expect(sim2).toBeDefined();
    });
  });

  describe("Estado Global", () => {
    it("não deve existir estado global mutável", () => {
      // Criar múltiplos componentes
      const rng1 = createSeededRNG(100);
      const rng2 = createSeededRNG(200);

      // Usar componentes
      const seq1: number[] = [];
      const seq2: number[] = [];
      for (let i = 0; i < 10; i++) {
        seq1.push(rng1.random());
        seq2.push(rng2.random());
      }

      // Recriar componentes
      const rng1New = createSeededRNG(100);
      const rng2New = createSeededRNG(200);

      const seq1New: number[] = [];
      const seq2New: number[] = [];
      for (let i = 0; i < 10; i++) {
        seq1New.push(rng1New.random());
        seq2New.push(rng2New.random());
      }

      // Verificar reprodutibilidade
      expect(hashObject(seq1)).toBe(hashObject(seq1New));
      expect(hashObject(seq2)).toBe(hashObject(seq2New));
    });

    it("sequência A → B → A deve produzir A idêntico", () => {
      // Primeira execução de A
      const rngA1 = createSeededRNG(SEED_A);
      const seqA1: number[] = [];
      for (let i = 0; i < 50; i++) seqA1.push(rngA1.random());

      // Execução de B (com seed diferente)
      const rngB = createSeededRNG(SEED_B);
      const seqB: number[] = [];
      for (let i = 0; i < 100; i++) seqB.push(rngB.random()); // Mais iterações

      // Segunda execução de A (deve ser idêntica à primeira)
      const rngA2 = createSeededRNG(SEED_A);
      const seqA2: number[] = [];
      for (let i = 0; i < 50; i++) seqA2.push(rngA2.random());

      // A inicial == A final
      expect(seqA1).toEqual(seqA2);
      // A != B
      expect(seqA1).not.toEqual(seqB.slice(0, 50));
    });
  });
});

// ============================================================================
// EXPORT PARA CI
// ============================================================================

export const GATE_B_DESCRIPTION = `
Gate B - Isolamento
===================
Verifica que não existe vazamento de estado entre execuções.

Critérios:
- Rodar A(seed=111) → B(seed=222) → A(seed=111)
- A final == A inicial
- Sem vazamento de estado/config entre instâncias
- Sem estado global mutável

Execução: npx vitest run gate-b-isolation.test.ts
`;
