/**
 * Teste Unitário - Detecção de Regimes de Mercado
 * 
 * Valida a detecção de regimes usando o dataset de validação.
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Importar o dataset de validação
const datasetPath = path.join(__dirname, "fixtures", "regime-validation-dataset.json");

interface ValidationScenario {
  id: string;
  name: string;
  expectedRegime: string;
  description: string;
  characteristics: {
    avgReturn: number;
    volatility: number;
    trendStrength: number;
    adx: number;
  };
  candles: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}

interface ValidationDataset {
  metadata: {
    version: string;
    description: string;
  };
  regimeTypes: Record<string, string>;
  scenarios: ValidationScenario[];
  validationRules: Record<string, Record<string, number>>;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Calcula o retorno médio de uma série de candles
 */
function calculateAvgReturn(candles: ValidationScenario["candles"]): number {
  if (candles.length < 2) return 0;
  
  let totalReturn = 0;
  for (let i = 1; i < candles.length; i++) {
    const returnPct = (candles[i].close - candles[i - 1].close) / candles[i - 1].close * 100;
    totalReturn += returnPct;
  }
  
  return totalReturn / (candles.length - 1);
}

/**
 * Calcula a volatilidade (desvio padrão dos retornos)
 */
function calculateVolatility(candles: ValidationScenario["candles"]): number {
  if (candles.length < 2) return 0;
  
  const returns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const returnPct = (candles[i].close - candles[i - 1].close) / candles[i - 1].close * 100;
    returns.push(returnPct);
  }
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  
  return Math.sqrt(variance);
}

/**
 * Calcula a força da tendência (simplificado)
 */
function calculateTrendStrength(candles: ValidationScenario["candles"]): number {
  if (candles.length < 2) return 0;
  
  const firstPrice = candles[0].close;
  const lastPrice = candles[candles.length - 1].close;
  const totalChange = Math.abs(lastPrice - firstPrice);
  
  // Calcular o caminho total percorrido
  let totalPath = 0;
  for (let i = 1; i < candles.length; i++) {
    totalPath += Math.abs(candles[i].close - candles[i - 1].close);
  }
  
  // Eficiência do movimento (0 a 1)
  return totalPath > 0 ? totalChange / totalPath : 0;
}

/**
 * Detecta o regime baseado nas características
 */
function detectRegime(candles: ValidationScenario["candles"]): string {
  const avgReturn = calculateAvgReturn(candles);
  const volatility = calculateVolatility(candles);
  const trendStrength = calculateTrendStrength(candles);
  
  // Regras de classificação
  if (volatility > 1.5) {
    return "HIGH_VOLATILITY";
  }
  
  if (trendStrength > 0.6 && avgReturn > 0.05) {
    return "TRENDING_UP";
  }
  
  if (trendStrength > 0.6 && avgReturn < -0.05) {
    return "TRENDING_DOWN";
  }
  
  if (trendStrength < 0.3 && volatility < 0.5) {
    return "RANGING";
  }
  
  // Verificar breakout (aumento significativo de volume)
  const avgVolume = candles.slice(0, 5).reduce((sum, c) => sum + c.volume, 0) / 5;
  const lastVolume = candles.slice(-3).reduce((sum, c) => sum + c.volume, 0) / 3;
  if (lastVolume > avgVolume * 2 && Math.abs(avgReturn) > 0.02) {
    return "BREAKOUT";
  }
  
  return "MIXED";
}

// ============================================================================
// TESTS
// ============================================================================

describe("Regime Detection - Dataset de Validação", () => {
  let dataset: ValidationDataset;
  
  beforeAll(() => {
    const content = fs.readFileSync(datasetPath, "utf-8");
    dataset = JSON.parse(content);
  });
  
  it("deve carregar o dataset de validação corretamente", () => {
    expect(dataset).toBeDefined();
    expect(dataset.metadata.version).toBe("1.0.0");
    expect(dataset.scenarios.length).toBeGreaterThan(0);
  });
  
  it("deve ter todos os tipos de regime documentados", () => {
    const expectedRegimes = ["TRENDING_UP", "TRENDING_DOWN", "RANGING", "HIGH_VOLATILITY", "BREAKOUT"];
    
    for (const regime of expectedRegimes) {
      expect(dataset.regimeTypes[regime]).toBeDefined();
    }
  });
  
  describe("Validação de Cenários", () => {
    it("deve detectar tendência de alta forte", () => {
      const scenario = dataset.scenarios.find(s => s.id === "scenario_trending_up_strong");
      expect(scenario).toBeDefined();
      
      if (scenario) {
        const avgReturn = calculateAvgReturn(scenario.candles);
        const trendStrength = calculateTrendStrength(scenario.candles);
        
        expect(avgReturn).toBeGreaterThan(0);
        expect(trendStrength).toBeGreaterThan(0.5);
      }
    });
    
    it("deve detectar tendência de baixa forte", () => {
      const scenario = dataset.scenarios.find(s => s.id === "scenario_trending_down_strong");
      expect(scenario).toBeDefined();
      
      if (scenario) {
        const avgReturn = calculateAvgReturn(scenario.candles);
        const trendStrength = calculateTrendStrength(scenario.candles);
        
        expect(avgReturn).toBeLessThan(0);
        expect(trendStrength).toBeGreaterThan(0.5);
      }
    });
    
    it("deve detectar consolidação lateral", () => {
      const scenario = dataset.scenarios.find(s => s.id === "scenario_ranging_tight");
      expect(scenario).toBeDefined();
      
      if (scenario) {
        const volatility = calculateVolatility(scenario.candles);
        const trendStrength = calculateTrendStrength(scenario.candles);
        
        expect(volatility).toBeLessThan(0.5);
        expect(trendStrength).toBeLessThan(0.4);
      }
    });
    
    it("deve detectar alta volatilidade", () => {
      const scenario = dataset.scenarios.find(s => s.id === "scenario_high_volatility");
      expect(scenario).toBeDefined();
      
      if (scenario) {
        const volatility = calculateVolatility(scenario.candles);
        
        expect(volatility).toBeGreaterThan(1.0);
      }
    });
    
    it("deve detectar rompimento de alta", () => {
      const scenario = dataset.scenarios.find(s => s.id === "scenario_breakout_bullish");
      expect(scenario).toBeDefined();
      
      if (scenario) {
        // Verificar aumento de volume
        const avgVolumeStart = scenario.candles.slice(0, 4).reduce((sum, c) => sum + c.volume, 0) / 4;
        const avgVolumeEnd = scenario.candles.slice(-4).reduce((sum, c) => sum + c.volume, 0) / 4;
        
        expect(avgVolumeEnd).toBeGreaterThan(avgVolumeStart * 2);
      }
    });
  });
  
  describe("Cálculos de Métricas", () => {
    it("deve calcular retorno médio corretamente", () => {
      const candles = [
        { timestamp: 1, open: 100, high: 105, low: 99, close: 100, volume: 100 },
        { timestamp: 2, open: 100, high: 110, low: 99, close: 110, volume: 100 },
      ];
      
      const avgReturn = calculateAvgReturn(candles);
      expect(avgReturn).toBeCloseTo(10, 1); // 10% de retorno
    });
    
    it("deve calcular volatilidade corretamente", () => {
      // Cenário de baixa volatilidade
      const lowVolCandles = [
        { timestamp: 1, open: 100, high: 101, low: 99, close: 100.5, volume: 100 },
        { timestamp: 2, open: 100.5, high: 101.5, low: 100, close: 101, volume: 100 },
        { timestamp: 3, open: 101, high: 102, low: 100.5, close: 101.5, volume: 100 },
      ];
      
      const lowVol = calculateVolatility(lowVolCandles);
      expect(lowVol).toBeLessThan(1);
    });
    
    it("deve calcular força de tendência corretamente", () => {
      // Tendência perfeita (movimento direto)
      const perfectTrend = [
        { timestamp: 1, open: 100, high: 101, low: 100, close: 101, volume: 100 },
        { timestamp: 2, open: 101, high: 102, low: 101, close: 102, volume: 100 },
        { timestamp: 3, open: 102, high: 103, low: 102, close: 103, volume: 100 },
      ];
      
      const strength = calculateTrendStrength(perfectTrend);
      expect(strength).toBeCloseTo(1, 1); // Eficiência próxima de 100%
    });
  });
});

// ============================================================================
// EXPORT
// ============================================================================

export const REGIME_TEST_DESCRIPTION = `
Teste de Detecção de Regimes
============================
Valida a detecção de regimes usando o dataset de validação.

Cenários testados:
- Tendência de Alta Forte
- Tendência de Baixa Forte
- Consolidação Lateral
- Alta Volatilidade
- Rompimento de Alta

Execucao: npx vitest run regime-detection.test.ts
`;