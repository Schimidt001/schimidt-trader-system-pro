/**
 * Test Pip Value Calculation - Script de Teste Unitário
 * 
 * CORREÇÃO CRÍTICA 2026-01-14: Testes para validar o cálculo correto de pip value monetário
 * 
 * Este script testa a função calculateMonetaryPipValue para garantir que:
 * 1. Pares USD_QUOTE (EURUSD, GBPUSD) retornam $10 por pip por lote
 * 2. Pares USD_BASE (USDCAD, USDCHF, USDJPY) calculam corretamente usando a taxa do par
 * 3. Pares JPY_QUOTE (EURJPY, GBPJPY) calculam corretamente usando USDJPY
 * 4. Cross pairs (EURGBP, etc.) calculam corretamente usando a taxa da moeda de cotação
 * 5. Metais (XAUUSD) retornam $10 por pip por lote
 * 
 * @author Schimidt Trader Pro
 * @version 2.1.0 - Correção USD_BASE
 */

import { 
  calculateMonetaryPipValue, 
  getPipValue, 
  ConversionRates,
  getSymbolType,
  SymbolType
} from "./shared/normalizationUtils";

// ============= CENÁRIOS DE TESTE =============

interface TestCase {
  name: string;
  symbol: string;
  conversionRates: ConversionRates;
  expectedPipValue: number;
  tolerance: number; // Tolerância em % para comparação
}

const testCases: TestCase[] = [
  // ============= CATEGORIA A: USD_QUOTE (Direct Pairs) =============
  {
    name: "EURUSD - USD é moeda de cotação",
    symbol: "EURUSD",
    conversionRates: {},
    expectedPipValue: 10.00, // 100,000 × 0.0001 = $10
    tolerance: 0.01,
  },
  {
    name: "GBPUSD - USD é moeda de cotação",
    symbol: "GBPUSD",
    conversionRates: {},
    expectedPipValue: 10.00,
    tolerance: 0.01,
  },
  {
    name: "AUDUSD - USD é moeda de cotação",
    symbol: "AUDUSD",
    conversionRates: {},
    expectedPipValue: 10.00,
    tolerance: 0.01,
  },
  {
    name: "NZDUSD - USD é moeda de cotação",
    symbol: "NZDUSD",
    conversionRates: {},
    expectedPipValue: 10.00,
    tolerance: 0.01,
  },

  // ============= CATEGORIA B: USD_BASE (Indirect Pairs) - CORREÇÃO CRÍTICA =============
  {
    name: "USDJPY - USD é moeda base (@ 159.00)",
    symbol: "USDJPY",
    conversionRates: { USDJPY: 159.00 },
    expectedPipValue: 6.29, // (100,000 × 0.01) / 159.00 = $6.29
    tolerance: 0.05,
  },
  {
    name: "USDCAD - USD é moeda base (@ 1.39)",
    symbol: "USDCAD",
    conversionRates: { USDCAD: 1.39 },
    expectedPipValue: 7.19, // (100,000 × 0.0001) / 1.39 = $7.19
    tolerance: 0.05,
  },
  {
    name: "USDCAD - USD é moeda base usando currentPrice (@ 1.39)",
    symbol: "USDCAD",
    conversionRates: { currentPrice: 1.39 },
    expectedPipValue: 7.19, // (100,000 × 0.0001) / 1.39 = $7.19
    tolerance: 0.05,
  },
  {
    name: "USDCHF - USD é moeda base (@ 0.90)",
    symbol: "USDCHF",
    conversionRates: { USDCHF: 0.90 },
    expectedPipValue: 11.11, // (100,000 × 0.0001) / 0.90 = $11.11
    tolerance: 0.05,
  },

  // ============= CATEGORIA C: JPY_QUOTE (Cross Pairs com JPY) =============
  {
    name: "EURJPY - JPY é moeda de cotação (USDJPY @ 159.00)",
    symbol: "EURJPY",
    conversionRates: { USDJPY: 159.00 },
    expectedPipValue: 6.29, // (100,000 × 0.01) / 159.00 = $6.29
    tolerance: 0.05,
  },
  {
    name: "GBPJPY - JPY é moeda de cotação (USDJPY @ 159.00)",
    symbol: "GBPJPY",
    conversionRates: { USDJPY: 159.00 },
    expectedPipValue: 6.29,
    tolerance: 0.05,
  },

  // ============= CATEGORIA D: CROSS (Sem USD nem JPY) =============
  {
    name: "EURGBP - Cross pair (GBPUSD @ 1.27)",
    symbol: "EURGBP",
    conversionRates: { GBPUSD: 1.27 },
    expectedPipValue: 12.70, // (100,000 × 0.0001) × 1.27 = $12.70
    tolerance: 0.05,
  },
  {
    name: "EURAUD - Cross pair (AUDUSD @ 0.65)",
    symbol: "EURAUD",
    conversionRates: { AUDUSD: 0.65 },
    expectedPipValue: 6.50, // (100,000 × 0.0001) × 0.65 = $6.50
    tolerance: 0.05,
  },
  {
    name: "GBPCAD - Cross pair (USDCAD @ 1.39)",
    symbol: "GBPCAD",
    conversionRates: { USDCAD: 1.39 },
    expectedPipValue: 7.19, // (100,000 × 0.0001) × (1/1.39) = $7.19
    tolerance: 0.05,
  },

  // ============= CATEGORIA E: METAIS =============
  {
    name: "XAUUSD - Ouro (Metal)",
    symbol: "XAUUSD",
    conversionRates: {},
    expectedPipValue: 10.00, // 100 × 0.10 = $10.00
    tolerance: 0.01,
  },
];

// ============= FUNÇÃO DE TESTE =============

function runTests(): void {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  TESTE DE CÁLCULO DE PIP VALUE MONETÁRIO");
  console.log("  CORREÇÃO CRÍTICA 2026-01-14: Validação USD_BASE");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    const symbolType = getSymbolType(test.symbol);
    const pipSize = getPipValue(test.symbol);
    const calculatedPipValue = calculateMonetaryPipValue(test.symbol, test.conversionRates, 1.0);
    
    const diff = Math.abs(calculatedPipValue - test.expectedPipValue);
    const diffPercent = (diff / test.expectedPipValue) * 100;
    const isPass = diffPercent <= (test.tolerance * 100);

    if (isPass) {
      passed++;
      console.log(`✅ PASS: ${test.name}`);
    } else {
      failed++;
      console.log(`❌ FAIL: ${test.name}`);
    }
    
    console.log(`   Tipo: ${symbolType} | Pip Size: ${pipSize}`);
    console.log(`   Esperado: $${test.expectedPipValue.toFixed(2)} | Calculado: $${calculatedPipValue.toFixed(2)}`);
    console.log(`   Diferença: ${diffPercent.toFixed(2)}% (tolerância: ${test.tolerance * 100}%)`);
    console.log(`   Taxas: ${JSON.stringify(test.conversionRates)}`);
    console.log("");
  }

  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  RESULTADO: ${passed} passou, ${failed} falhou de ${testCases.length} testes`);
  console.log("═══════════════════════════════════════════════════════════════");

  // Teste específico do cenário do bug USDCAD
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  SIMULAÇÃO DO BUG USDCAD (14/01/2026)");
  console.log("═══════════════════════════════════════════════════════════════");
  
  const usdcadRates: ConversionRates = { 
    USDJPY: 159.201, 
    EURUSD: 1.16460, 
    GBPUSD: 1.34430,
    AUDUSD: 0.66986,
    USDCAD: 1.38858, // Preço do USDCAD no momento do erro
    currentPrice: 1.38858
  };
  
  const usdcadPipValue = calculateMonetaryPipValue("USDCAD", usdcadRates, 1.0);
  const balance = 502.87;
  const riskPercent = 2;
  const riskAmount = balance * (riskPercent / 100);
  const slPips = 9.40;
  
  // Cálculo correto
  const correctLotSize = riskAmount / (slPips * usdcadPipValue);
  
  // Cálculo errado (bug antigo com pip value de $0.0667)
  const wrongPipValue = 0.0667;
  const wrongLotSize = riskAmount / (slPips * wrongPipValue);
  
  console.log(`  Balance: $${balance.toFixed(2)}`);
  console.log(`  Risco: ${riskPercent}% = $${riskAmount.toFixed(2)}`);
  console.log(`  SL: ${slPips} pips`);
  console.log("");
  console.log(`  ❌ BUG ANTIGO:`);
  console.log(`     Pip Value: $${wrongPipValue.toFixed(4)}`);
  console.log(`     Lotes: ${wrongLotSize.toFixed(4)} (SECURITY BLOCK!)`);
  console.log("");
  console.log(`  ✅ CORREÇÃO:`);
  console.log(`     Pip Value: $${usdcadPipValue.toFixed(4)}`);
  console.log(`     Lotes: ${correctLotSize.toFixed(4)}`);
  console.log("═══════════════════════════════════════════════════════════════");

  // Exit code baseado nos resultados
  if (failed > 0) {
    process.exit(1);
  }
}

// Executar testes
runTests();
