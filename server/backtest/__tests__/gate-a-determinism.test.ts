/**
 * Gate A - Teste de Determinismo
 * 
 * Verifica que o mesmo dataset + mesma config + mesmo seed
 * produz exatamente o mesmo hash de resultados.
 * 
 * Critério de aprovação:
 * - Rodar 3x com mesmos inputs
 * - Comparar hash de: equity curve, trades, métricas
 * - Todos os hashes devem ser idênticos
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as crypto from "crypto";
import { createSeededRNG } from "../utils/SeededRNG";
import { MonteCarloSimulator, createMonteCarloSimulator } from "../validation/MonteCarloSimulator";
import { BacktestTrade } from "../types/backtest.types";

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Gera hash SHA-256 de um objeto
 */
function hashObject(obj: unknown): string {
  const json = JSON.stringify(obj, (key, value) => {
    // Normalizar números para evitar diferenças de precisão
    if (typeof value === "number") {
      return Math.round(value * 1e8) / 1e8;
    }
    return value;
  });
  return crypto.createHash("sha256").update(json).digest("hex");
}

/**
 * Cria dados de teste mock para o backtest
 * IMPORTANTE: Usa timestamps fixos para garantir determinismo
 */
function createMockCandles(seed: number, count: number = 1000): any[] {
  const rng = createSeededRNG(seed);
  const candles = [];
  let price = 1900; // Preço inicial para XAUUSD
  const baseTimestamp = 1704067200000; // 2024-01-01 00:00:00 UTC (fixo)

  for (let i = 0; i < count; i++) {
    const change = (rng.random() - 0.5) * 10;
    const open = price;
    const high = open + Math.abs(change) + rng.random() * 5;
    const low = open - Math.abs(change) - rng.random() * 5;
    const close = open + change;
    price = close;

    candles.push({
      timestamp: baseTimestamp + i * 5 * 60 * 1000, // Timestamp fixo baseado em índice
      open,
      high,
      low,
      close,
      volume: 1000 + rng.random() * 500,
    });
  }

  return candles;
}

/**
 * Cria trades mock para teste de Monte Carlo
 * IMPORTANTE: Usa timestamps fixos para garantir determinismo
 */
function createMockTrades(seed: number, count: number = 100): BacktestTrade[] {
  const rng = createSeededRNG(seed);
  const trades: BacktestTrade[] = [];
  const baseTimestamp = 1704067200000; // 2024-01-01 00:00:00 UTC (fixo)

  for (let i = 0; i < count; i++) {
    const isWin = rng.random() > 0.4; // 60% win rate
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

// ============================================================================
// TESTS
// ============================================================================

describe("Gate A - Determinismo", () => {
  const FIXED_SEED = 12345;
  const NUM_RUNS = 3;

  describe("SeededRNG Determinismo", () => {
    it("deve produzir a mesma sequência de números com o mesmo seed", () => {
      const sequences: number[][] = [];

      for (let run = 0; run < NUM_RUNS; run++) {
        const rng = createSeededRNG(FIXED_SEED);
        const sequence: number[] = [];
        
        for (let i = 0; i < 100; i++) {
          sequence.push(rng.random());
        }
        
        sequences.push(sequence);
      }

      // Comparar todas as sequências
      const firstHash = hashObject(sequences[0]);
      for (let i = 1; i < NUM_RUNS; i++) {
        const hash = hashObject(sequences[i]);
        expect(hash).toBe(firstHash);
      }
    });

    it("deve produzir sequências diferentes com seeds diferentes", () => {
      const rng1 = createSeededRNG(111);
      const rng2 = createSeededRNG(222);

      const seq1: number[] = [];
      const seq2: number[] = [];

      for (let i = 0; i < 10; i++) {
        seq1.push(rng1.random());
        seq2.push(rng2.random());
      }

      expect(hashObject(seq1)).not.toBe(hashObject(seq2));
    });

    it("deve produzir números no intervalo [0, 1)", () => {
      const rng = createSeededRNG(FIXED_SEED);
      
      for (let i = 0; i < 1000; i++) {
        const value = rng.random();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });
  });

  describe("Mock Data Determinismo", () => {
    it("deve gerar candles idênticos com mesmo seed", () => {
      const hashes: string[] = [];

      for (let run = 0; run < NUM_RUNS; run++) {
        const candles = createMockCandles(FIXED_SEED, 500);
        hashes.push(hashObject(candles));
      }

      expect(hashes[0]).toBe(hashes[1]);
      expect(hashes[1]).toBe(hashes[2]);
    });

    it("deve gerar trades idênticos com mesmo seed", () => {
      const hashes: string[] = [];

      for (let run = 0; run < NUM_RUNS; run++) {
        const trades = createMockTrades(FIXED_SEED, 100);
        hashes.push(hashObject(trades));
      }

      expect(hashes[0]).toBe(hashes[1]);
      expect(hashes[1]).toBe(hashes[2]);
    });

    it("deve gerar dados diferentes com seeds diferentes", () => {
      const candles1 = createMockCandles(111, 100);
      const candles2 = createMockCandles(222, 100);

      expect(hashObject(candles1)).not.toBe(hashObject(candles2));
    });
  });

  describe("MonteCarloSimulator Determinismo", () => {
    it("deve produzir simulações idênticas com mesmo seed", async () => {
      const trades = createMockTrades(FIXED_SEED, 100);
      const hashes: string[] = [];

      for (let run = 0; run < NUM_RUNS; run++) {
        const simulator = createMonteCarloSimulator({
          simulations: 100,
          method: "BLOCK_BOOTSTRAP",
          confidenceLevel: 95,
          initialBalance: 10000,
          ruinThreshold: 50,
          blockSize: 10,
          seed: FIXED_SEED,
        });

        const result = await simulator.simulate(trades);
        
        // Hash dos resultados críticos (usando a estrutura real de retorno)
        const criticalData = {
          equityCI: result.equityCI,
          drawdownCI: result.drawdownCI,
          ruinProbability: result.ruinProbability,
          percentiles: result.percentiles,
        };

        hashes.push(hashObject(criticalData));
      }

      // Verificar determinismo
      expect(hashes[0]).toBe(hashes[1]);
      expect(hashes[1]).toBe(hashes[2]);
    });

    it("deve produzir resultados diferentes com seeds diferentes", async () => {
      const trades = createMockTrades(FIXED_SEED, 100);

      const simulator1 = createMonteCarloSimulator({
        simulations: 50,
        method: "BLOCK_BOOTSTRAP",
        confidenceLevel: 95,
        initialBalance: 10000,
        ruinThreshold: 50,
        blockSize: 10,
        seed: 111,
      });

      const simulator2 = createMonteCarloSimulator({
        simulations: 50,
        method: "BLOCK_BOOTSTRAP",
        confidenceLevel: 95,
        initialBalance: 10000,
        ruinThreshold: 50,
        blockSize: 10,
        seed: 222,
      });

      const result1 = await simulator1.simulate(trades);
      const result2 = await simulator2.simulate(trades);

      const hash1 = hashObject(result1.percentiles);
      const hash2 = hashObject(result2.percentiles);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("Hash Consistency", () => {
    it("hashObject deve ser consistente para o mesmo input", () => {
      const obj = { a: 1, b: 2, c: [1, 2, 3] };
      
      const hash1 = hashObject(obj);
      const hash2 = hashObject(obj);
      const hash3 = hashObject(obj);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it("hashObject deve normalizar números com precisão", () => {
      const obj1 = { value: 0.1 + 0.2 }; // 0.30000000000000004
      const obj2 = { value: 0.3 };

      // Após normalização, devem ser iguais
      const hash1 = hashObject(obj1);
      const hash2 = hashObject(obj2);

      expect(hash1).toBe(hash2);
    });
  });
});

// ============================================================================
// EXPORT PARA CI
// ============================================================================

export const GATE_A_DESCRIPTION = `
Gate A - Determinismo
=====================
Verifica que o mesmo dataset + mesma config + mesmo seed
produz exatamente o mesmo hash de resultados.

Critérios:
- SeededRNG produz sequências idênticas
- Mock data é determinístico
- MonteCarloSimulator produz simulações idênticas
- Hash function é consistente

Execução: npx vitest run gate-a-determinism.test.ts
`;
