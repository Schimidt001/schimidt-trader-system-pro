/**
 * Teste Unitário - SeededRNG (Gerador de Números Aleatórios Seedado)
 * 
 * Valida o determinismo e a qualidade do gerador de números aleatórios.
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { describe, it, expect } from "vitest";
import { createSeededRNG, SeededRNG } from "../utils/SeededRNG";

// ============================================================================
// TESTS
// ============================================================================

describe("SeededRNG - Gerador de Números Aleatórios Seedado", () => {
  describe("Determinismo", () => {
    it("deve produzir a mesma sequência com o mesmo seed", () => {
      const seed = 12345;
      const rng1 = createSeededRNG(seed);
      const rng2 = createSeededRNG(seed);
      
      const sequence1: number[] = [];
      const sequence2: number[] = [];
      
      for (let i = 0; i < 100; i++) {
        sequence1.push(rng1.random());
        sequence2.push(rng2.random());
      }
      
      expect(sequence1).toEqual(sequence2);
    });
    
    it("deve produzir sequências diferentes com seeds diferentes", () => {
      const rng1 = createSeededRNG(111);
      const rng2 = createSeededRNG(222);
      
      const sequence1: number[] = [];
      const sequence2: number[] = [];
      
      for (let i = 0; i < 10; i++) {
        sequence1.push(rng1.random());
        sequence2.push(rng2.random());
      }
      
      expect(sequence1).not.toEqual(sequence2);
    });
    
    it("deve ser reproduzível após múltiplas chamadas", () => {
      const seed = 99999;
      
      // Primeira execução
      const rng1 = createSeededRNG(seed);
      for (let i = 0; i < 50; i++) rng1.random();
      const value1 = rng1.random();
      
      // Segunda execução
      const rng2 = createSeededRNG(seed);
      for (let i = 0; i < 50; i++) rng2.random();
      const value2 = rng2.random();
      
      expect(value1).toBe(value2);
    });
  });
  
  describe("Distribuição", () => {
    it("deve gerar valores entre 0 e 1", () => {
      const rng = createSeededRNG(42);
      
      for (let i = 0; i < 1000; i++) {
        const value = rng.random();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });
    
    it("deve ter distribuição aproximadamente uniforme", () => {
      const rng = createSeededRNG(42);
      const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // 10 buckets
      const samples = 10000;
      
      for (let i = 0; i < samples; i++) {
        const value = rng.random();
        const bucket = Math.floor(value * 10);
        buckets[Math.min(bucket, 9)]++;
      }
      
      // Cada bucket deve ter aproximadamente 10% dos valores
      const expected = samples / 10;
      const tolerance = expected * 0.15; // 15% de tolerância
      
      for (const count of buckets) {
        expect(count).toBeGreaterThan(expected - tolerance);
        expect(count).toBeLessThan(expected + tolerance);
      }
    });
  });
  
  describe("Funções Auxiliares", () => {
    it("deve gerar inteiros no range especificado", () => {
      const rng = createSeededRNG(42);
      
      for (let i = 0; i < 100; i++) {
        const value = rng.randomInt(10, 20);
        expect(value).toBeGreaterThanOrEqual(10);
        expect(value).toBeLessThanOrEqual(20);
        expect(Number.isInteger(value)).toBe(true);
      }
    });
    
    it("deve gerar floats no range especificado", () => {
      const rng = createSeededRNG(42);
      
      for (let i = 0; i < 100; i++) {
        const value = rng.randomFloat(5.5, 10.5);
        expect(value).toBeGreaterThanOrEqual(5.5);
        expect(value).toBeLessThanOrEqual(10.5);
      }
    });
    it("deve selecionar elementos aleatorios de um array", () => {
      const rng = createSeededRNG(42);
      const items = ["A", "B", "C", "D", "E"];
      
      const selected = rng.randomChoice(items);
      expect(items).toContain(selected);
    });
    
    it("deve embaralhar arrays de forma determinística", () => {
      const seed = 42;
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      
      const rng1 = createSeededRNG(seed);
      const shuffled1 = rng1.shuffle([...original]);
      
      const rng2 = createSeededRNG(seed);
      const shuffled2 = rng2.shuffle([...original]);
      
      expect(shuffled1).toEqual(shuffled2);
      expect(shuffled1).not.toEqual(original);
    });
  });
  
  describe("Diferentes Algoritmos", () => {
    it("deve suportar algoritmo xorshift128", () => {
      const rng = createSeededRNG(42, "xorshift128");
      const value = rng.random();
      
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });
    
    it("deve suportar algoritmo mulberry32", () => {
      const rng = createSeededRNG(42, "mulberry32");
      const value = rng.random();
      
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });
    
    it("algoritmos diferentes devem produzir sequências diferentes", () => {
      const seed = 42;
      const rng1 = createSeededRNG(seed, "xorshift128");
      const rng2 = createSeededRNG(seed, "mulberry32");
      
      const value1 = rng1.random();
      const value2 = rng2.random();
      
      expect(value1).not.toBe(value2);
    });
  });
  
  describe("Edge Cases", () => {
    it("deve funcionar com seed 0", () => {
      const rng = createSeededRNG(0);
      const value = rng.random();
      
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });
    
    it("deve funcionar com seeds muito grandes", () => {
      const rng = createSeededRNG(Number.MAX_SAFE_INTEGER);
      const value = rng.random();
      
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });
    
    it("deve funcionar com seeds negativos", () => {
      const rng = createSeededRNG(-12345);
      const value = rng.random();
      
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });
  });
});

// ============================================================================
// EXPORT
// ============================================================================

export const SEEDED_RNG_TEST_DESCRIPTION = `
Teste do SeededRNG
==================
Valida o determinismo e a qualidade do gerador de números aleatórios seedado.

Aspectos testados:
- Determinismo (mesma sequência com mesmo seed)
- Distribuição uniforme
- Funções auxiliares (randomInt, randomFloat, pick, shuffle)
- Diferentes algoritmos (xorshift128, mulberry32)
- Edge cases (seed 0, seeds grandes, seeds negativos)

Execucao: npx vitest run seeded-rng.test.ts
`;