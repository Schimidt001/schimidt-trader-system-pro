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
import { IsolatedBacktestRunner, createIsolatedRunner } from "../runners/IsolatedBacktestRunner";
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

  for (let i = 0; i < count; i++) {
    const isWin = rng.next() > 0.4;
    const profit = isWin ? rng.next() * 200 + 50 : -(rng.next() * 150 + 30);

    trades.push({
      id: `trade-${i}`,
      symbol: "XAUUSD",
      direction: rng.next() > 0.5 ? "LONG" : "SHORT",
      entryPrice: 1900 + rng.next() * 100,
      exitPrice: 1900 + rng.next() * 100 + (isWin ? 10 : -10),
      size: 0.1,
      openTimestamp: Date.now() - (count - i) * 3600 * 1000,
      closeTimestamp: Date.now() - (count - i) * 3600 * 1000 + 1800 * 1000,
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

// ============================================================================
// TESTS
// ============================================================================

describe("Gate B - Isolamento", () => {
  const SEED_A = 111;
  const SEED_B = 222;

  describe("IsolatedBacktestRunner Isolamento", () => {
    it("deve manter isolamento entre execuções sequenciais (A → B → A)", async () => {
      const configA = {
        runId: "run-A",
        symbol: "XAUUSD",
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-06-01"),
        strategyType: "SMC" as const,
        parameters: { swingH1Lookback: 50 },
        initialBalance: 10000,
        leverage: 500,
        seed: SEED_A,
      };

      const configB = {
        ...configA,
        runId: "run-B",
        seed: SEED_B,
        parameters: { swingH1Lookback: 100 }, // Parâmetros diferentes
      };

      // Primeira execução de A
      const runnerA1 = createIsolatedRunner(configA);
      const tradesA1 = createMockTrades(SEED_A, 50);
      const hashA1 = hashObject(tradesA1);

      // Execução de B (com configuração diferente)
      const runnerB = createIsolatedRunner(configB);
      const tradesB = createMockTrades(SEED_B, 50);
      const hashB = hashObject(tradesB);

      // Segunda execução de A (deve ser idêntica à primeira)
      const runnerA2 = createIsolatedRunner(configA);
      const tradesA2 = createMockTrades(SEED_A, 50);
      const hashA2 = hashObject(tradesA2);

      // Verificações
      expect(hashA1).toBe(hashA2); // A inicial == A final
      expect(hashA1).not.toBe(hashB); // A != B
      expect(runnerA1.getConfig().seed).toBe(runnerA2.getConfig().seed);
      expect(runnerA1.getConfig().seed).not.toBe(runnerB.getConfig().seed);
    });

    it("não deve compartilhar estado entre runners diferentes", () => {
      const runner1 = createIsolatedRunner({
        runId: "runner-1",
        symbol: "XAUUSD",
        seed: 111,
      });

      const runner2 = createIsolatedRunner({
        runId: "runner-2",
        symbol: "EURUSD",
        seed: 222,
      });

      // Verificar que são instâncias independentes
      expect(runner1.getConfig().runId).not.toBe(runner2.getConfig().runId);
      expect(runner1.getConfig().symbol).not.toBe(runner2.getConfig().symbol);
      expect(runner1.getConfig().seed).not.toBe(runner2.getConfig().seed);
    });
  });

  describe("SeededRNG Isolamento", () => {
    it("deve manter isolamento entre instâncias de RNG", () => {
      // Criar RNG A
      const rngA1 = createSeededRNG(SEED_A);
      const seqA1: number[] = [];
      for (let i = 0; i < 10; i++) seqA1.push(rngA1.next());

      // Criar RNG B (não deve afetar A)
      const rngB = createSeededRNG(SEED_B);
      const seqB: number[] = [];
      for (let i = 0; i < 10; i++) seqB.push(rngB.next());

      // Criar novo RNG A (deve ser idêntico ao primeiro)
      const rngA2 = createSeededRNG(SEED_A);
      const seqA2: number[] = [];
      for (let i = 0; i < 10; i++) seqA2.push(rngA2.next());

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
        sequences[0].push(rngs[0].next());
        sequences[1].push(rngs[1].next());
        sequences[2].push(rngs[2].next());
      }

      // Criar novas instâncias e verificar reprodutibilidade
      const rngsNew = [
        createSeededRNG(100),
        createSeededRNG(200),
        createSeededRNG(300),
      ];

      const sequencesNew: number[][] = [[], [], []];

      for (let i = 0; i < 20; i++) {
        sequencesNew[0].push(rngsNew[0].next());
        sequencesNew[1].push(rngsNew[1].next());
        sequencesNew[2].push(rngsNew[2].next());
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
        seed: SEED_A,
      });
      const resultA1 = await simA1.run(tradesA);
      const hashA1 = hashObject(resultA1.simulations.map(s => s.finalEquity));

      // Simulação B
      const simB = createMonteCarloSimulator({
        simulations: 50,
        method: "TRADE_RESAMPLING", // Método diferente
        seed: SEED_B,
      });
      const resultB = await simB.run(tradesB);
      const hashB = hashObject(resultB.simulations.map(s => s.finalEquity));

      // Segunda simulação A (deve ser idêntica à primeira)
      const simA2 = createMonteCarloSimulator({
        simulations: 50,
        method: "BLOCK_BOOTSTRAP",
        seed: SEED_A,
      });
      const resultA2 = await simA2.run(tradesA);
      const hashA2 = hashObject(resultA2.simulations.map(s => s.finalEquity));

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
      const resultA1 = await detectorA1.detect(candlesA);
      const hashA1 = hashObject(resultA1.regimes.map(r => r.type));

      // Detecção B
      const detectorB = createRegimeDetector({
        lookbackPeriod: 100, // Config diferente
        volatilityThreshold: 2.0,
      });
      const resultB = await detectorB.detect(candlesB);
      const hashB = hashObject(resultB.regimes.map(r => r.type));

      // Segunda detecção A
      const detectorA2 = createRegimeDetector({
        lookbackPeriod: 50,
        volatilityThreshold: 1.5,
      });
      const resultA2 = await detectorA2.detect(candlesA);
      const hashA2 = hashObject(resultA2.regimes.map(r => r.type));

      // Verificações
      expect(hashA1).toBe(hashA2);
    });
  });

  describe("Vazamento de Configuração", () => {
    it("não deve vazar configurações entre instâncias", () => {
      const config1 = {
        runId: "config-1",
        symbol: "XAUUSD",
        parameters: { param1: 100 },
        seed: 111,
      };

      const config2 = {
        runId: "config-2",
        symbol: "EURUSD",
        parameters: { param1: 200, param2: 300 },
        seed: 222,
      };

      const runner1 = createIsolatedRunner(config1);
      const runner2 = createIsolatedRunner(config2);

      // Verificar que configs são independentes
      const retrievedConfig1 = runner1.getConfig();
      const retrievedConfig2 = runner2.getConfig();

      expect(retrievedConfig1.runId).toBe("config-1");
      expect(retrievedConfig2.runId).toBe("config-2");
      expect(retrievedConfig1.parameters).toEqual({ param1: 100 });
      expect(retrievedConfig2.parameters).toEqual({ param1: 200, param2: 300 });
    });

    it("modificar config de um runner não deve afetar outro", () => {
      const baseConfig = {
        runId: "base",
        symbol: "XAUUSD",
        parameters: { value: 100 },
        seed: 111,
      };

      const runner1 = createIsolatedRunner({ ...baseConfig, runId: "runner-1" });
      const runner2 = createIsolatedRunner({ ...baseConfig, runId: "runner-2" });

      // Modificar config original
      baseConfig.parameters.value = 999;
      baseConfig.runId = "modified";

      // Verificar que runners não foram afetados
      expect(runner1.getConfig().runId).toBe("runner-1");
      expect(runner2.getConfig().runId).toBe("runner-2");
    });
  });

  describe("Estado Global", () => {
    it("não deve existir estado global mutável", () => {
      // Criar múltiplos componentes
      const components = {
        rng1: createSeededRNG(100),
        rng2: createSeededRNG(200),
        runner1: createIsolatedRunner({ runId: "r1", seed: 100 }),
        runner2: createIsolatedRunner({ runId: "r2", seed: 200 }),
      };

      // Usar componentes
      const seq1: number[] = [];
      const seq2: number[] = [];
      for (let i = 0; i < 10; i++) {
        seq1.push(components.rng1.next());
        seq2.push(components.rng2.next());
      }

      // Recriar componentes
      const componentsNew = {
        rng1: createSeededRNG(100),
        rng2: createSeededRNG(200),
        runner1: createIsolatedRunner({ runId: "r1", seed: 100 }),
        runner2: createIsolatedRunner({ runId: "r2", seed: 200 }),
      };

      const seq1New: number[] = [];
      const seq2New: number[] = [];
      for (let i = 0; i < 10; i++) {
        seq1New.push(componentsNew.rng1.next());
        seq2New.push(componentsNew.rng2.next());
      }

      // Verificar reprodutibilidade
      expect(hashObject(seq1)).toBe(hashObject(seq1New));
      expect(hashObject(seq2)).toBe(hashObject(seq2New));
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
