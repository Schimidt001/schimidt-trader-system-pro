/**
 * Test Risk Manager - Script de Teste Unitário
 * 
 * CORREÇÃO CRÍTICA 2026-01-13: Testes para validar o cálculo correto de position size
 * 
 * Este script simula o cálculo de volume para diferentes cenários e verifica
 * que os resultados são realistas (não 147 lotes em conta de $500).
 * 
 * Cenários de Teste (conforme solicitado):
 * 1. EURJPY: (Preço 159.00, SL 10 pips, Risco $10) -> Deve dar ~0.01/0.02 lotes
 * 2. EURUSD: (Preço 1.10, SL 10 pips, Risco $10) -> Deve dar ~0.10 lotes
 * 3. XAUUSD: (Preço 2400, SL 200 pips, Risco $10)
 * 
 * @author Schimidt Trader Pro
 * @version 2.0.0
 */

import { 
  calculateMonetaryPipValue, 
  getPipValue, 
  ConversionRates,
  getSymbolType,
  SymbolType
} from "./shared/normalizationUtils";

// ============= CONFIGURAÇÃO DOS TESTES =============

interface TestScenario {
  name: string;
  symbol: string;
  accountBalance: number;
  riskPercentage: number;
  stopLossPips: number;
  conversionRates: ConversionRates;
  expectedMinLots: number;
  expectedMaxLots: number;
}

// ============= CENÁRIOS DE TESTE =============

const testScenarios: TestScenario[] = [
  // Cenário 1: EURJPY (o que causou o bug de 147 lotes)
  {
    name: "EURJPY - Cenário do Bug Original",
    symbol: "EURJPY",
    accountBalance: 502.87,
    riskPercentage: 2.0,
    stopLossPips: 6.8,
    conversionRates: { USDJPY: 159.00 },
    expectedMinLots: 0.01,
    expectedMaxLots: 0.30,
  },
  
  // Cenário 2: EURJPY com parâmetros do briefing
  {
    name: "EURJPY - Briefing (SL 10 pips, Risco $10)",
    symbol: "EURJPY",
    accountBalance: 500.00,
    riskPercentage: 2.0, // ~$10
    stopLossPips: 10.0,
    conversionRates: { USDJPY: 159.00 },
    expectedMinLots: 0.01,
    expectedMaxLots: 0.20,
  },
  
  // Cenário 3: EURUSD (par mais comum)
  {
    name: "EURUSD - Briefing (SL 10 pips, Risco $10)",
    symbol: "EURUSD",
    accountBalance: 500.00,
    riskPercentage: 2.0, // ~$10
    stopLossPips: 10.0,
    conversionRates: { EURUSD: 1.10 },
    expectedMinLots: 0.05,
    expectedMaxLots: 0.15,
  },
  
  // Cenário 4: XAUUSD (ouro)
  {
    name: "XAUUSD - Briefing (SL 200 pips, Risco $10)",
    symbol: "XAUUSD",
    accountBalance: 500.00,
    riskPercentage: 2.0, // ~$10
    stopLossPips: 200.0, // 200 pips = $20 de movimento no preço
    conversionRates: {},
    expectedMinLots: 0.01,
    expectedMaxLots: 0.10,
  },
  
  // Cenário 5: GBPJPY
  {
    name: "GBPJPY - Par JPY Cross",
    symbol: "GBPJPY",
    accountBalance: 1000.00,
    riskPercentage: 1.0, // $10
    stopLossPips: 15.0,
    conversionRates: { USDJPY: 159.00 },
    expectedMinLots: 0.01,
    expectedMaxLots: 0.15,
  },
  
  // Cenário 6: GBPUSD
  {
    name: "GBPUSD - Par USD Quote",
    symbol: "GBPUSD",
    accountBalance: 1000.00,
    riskPercentage: 1.0, // $10
    stopLossPips: 20.0,
    conversionRates: { GBPUSD: 1.27 },
    expectedMinLots: 0.01,
    expectedMaxLots: 0.10,
  },
];

// ============= FUNÇÃO DE CÁLCULO (SIMULANDO O RISKMANAGER) =============

function calculatePositionSize(
  accountBalance: number,
  riskPercentage: number,
  stopLossPips: number,
  symbol: string,
  conversionRates: ConversionRates
): { lotSize: number; pipValueMonetary: number; riskAmount: number } {
  // Calcular risco em USD
  const riskAmount = accountBalance * (riskPercentage / 100);
  
  // Calcular pip value monetário (CORREÇÃO CRÍTICA)
  const pipValueMonetary = calculateMonetaryPipValue(symbol, conversionRates, 1.0);
  
  // Calcular lote
  // Fórmula: lotSize = riskAmount / (stopLossPips × pipValueMonetary)
  const lotSize = riskAmount / (stopLossPips * pipValueMonetary);
  
  return {
    lotSize: Math.round(lotSize * 100) / 100, // Arredondar para 2 casas
    pipValueMonetary,
    riskAmount,
  };
}

// ============= FUNÇÃO DE CÁLCULO ANTIGO (PARA COMPARAÇÃO) =============

function calculatePositionSizeOLD(
  accountBalance: number,
  riskPercentage: number,
  stopLossPips: number,
  symbol: string
): { lotSize: number; pipValue: number; riskAmount: number } {
  // Calcular risco em USD
  const riskAmount = accountBalance * (riskPercentage / 100);
  
  // ERRO: Usando getPipValue (movimento de preço) ao invés de valor monetário
  const pipValue = getPipValue(symbol);
  
  // Calcular lote (FÓRMULA ERRADA)
  const lotSize = riskAmount / (stopLossPips * pipValue);
  
  return {
    lotSize: Math.round(lotSize * 100) / 100,
    pipValue,
    riskAmount,
  };
}

// ============= EXECUÇÃO DOS TESTES =============

console.log("═══════════════════════════════════════════════════════════════════════════════");
console.log("  TESTE DE CÁLCULO DE POSITION SIZE - CORREÇÃO CRÍTICA 2026-01-13");
console.log("═══════════════════════════════════════════════════════════════════════════════");
console.log("");

let passedTests = 0;
let failedTests = 0;

for (const scenario of testScenarios) {
  console.log(`\n┌─────────────────────────────────────────────────────────────────────────────┐`);
  console.log(`│ CENÁRIO: ${scenario.name.padEnd(65)}│`);
  console.log(`├─────────────────────────────────────────────────────────────────────────────┤`);
  
  // Informações do cenário
  console.log(`│ Símbolo: ${scenario.symbol.padEnd(66)}│`);
  console.log(`│ Balance: $${scenario.accountBalance.toFixed(2).padEnd(64)}│`);
  console.log(`│ Risco: ${scenario.riskPercentage}% = $${(scenario.accountBalance * scenario.riskPercentage / 100).toFixed(2).padEnd(58)}│`);
  console.log(`│ Stop Loss: ${scenario.stopLossPips} pips${" ".repeat(59)}│`);
  console.log(`│ Tipo de Símbolo: ${getSymbolType(scenario.symbol).padEnd(57)}│`);
  console.log(`├─────────────────────────────────────────────────────────────────────────────┤`);
  
  // Cálculo ANTIGO (errado)
  const oldResult = calculatePositionSizeOLD(
    scenario.accountBalance,
    scenario.riskPercentage,
    scenario.stopLossPips,
    scenario.symbol
  );
  
  // Cálculo NOVO (corrigido)
  const newResult = calculatePositionSize(
    scenario.accountBalance,
    scenario.riskPercentage,
    scenario.stopLossPips,
    scenario.symbol,
    scenario.conversionRates
  );
  
  // Exibir resultados
  console.log(`│ ❌ CÁLCULO ANTIGO (ERRADO):${" ".repeat(47)}│`);
  console.log(`│    Pip Value usado: ${oldResult.pipValue.toFixed(6)} (movimento de preço)${" ".repeat(26)}│`);
  console.log(`│    Lote calculado: ${oldResult.lotSize.toFixed(2)} lotes${" ".repeat(45)}│`);
  console.log(`│    Fórmula: $${oldResult.riskAmount.toFixed(2)} / (${scenario.stopLossPips} × ${oldResult.pipValue}) = ${oldResult.lotSize.toFixed(2)}${" ".repeat(25)}│`);
  console.log(`├─────────────────────────────────────────────────────────────────────────────┤`);
  console.log(`│ ✅ CÁLCULO NOVO (CORRIGIDO):${" ".repeat(46)}│`);
  console.log(`│    Pip Value Monetário: $${newResult.pipValueMonetary.toFixed(4)} (USD por lote)${" ".repeat(23)}│`);
  console.log(`│    Lote calculado: ${newResult.lotSize.toFixed(2)} lotes${" ".repeat(45)}│`);
  console.log(`│    Fórmula: $${newResult.riskAmount.toFixed(2)} / (${scenario.stopLossPips} × $${newResult.pipValueMonetary.toFixed(2)}) = ${newResult.lotSize.toFixed(2)}${" ".repeat(18)}│`);
  console.log(`├─────────────────────────────────────────────────────────────────────────────┤`);
  
  // Verificar se passou no teste
  const passed = newResult.lotSize >= scenario.expectedMinLots && newResult.lotSize <= scenario.expectedMaxLots;
  
  if (passed) {
    passedTests++;
    console.log(`│ ✅ RESULTADO: PASSOU (${newResult.lotSize.toFixed(2)} está entre ${scenario.expectedMinLots} e ${scenario.expectedMaxLots})${" ".repeat(20)}│`);
  } else {
    failedTests++;
    console.log(`│ ❌ RESULTADO: FALHOU (${newResult.lotSize.toFixed(2)} deveria estar entre ${scenario.expectedMinLots} e ${scenario.expectedMaxLots})${" ".repeat(10)}│`);
  }
  
  // Mostrar a melhoria
  const improvement = oldResult.lotSize / newResult.lotSize;
  if (improvement > 10) {
    console.log(`│ 🛡️ PROTEÇÃO: Evitou ordem ${improvement.toFixed(0)}x maior que o correto!${" ".repeat(28)}│`);
  }
  
  console.log(`└─────────────────────────────────────────────────────────────────────────────┘`);
}

// ============= RESUMO FINAL =============

console.log("\n");
console.log("═══════════════════════════════════════════════════════════════════════════════");
console.log("  RESUMO DOS TESTES");
console.log("═══════════════════════════════════════════════════════════════════════════════");
console.log(`  Total de testes: ${testScenarios.length}`);
console.log(`  ✅ Passou: ${passedTests}`);
console.log(`  ❌ Falhou: ${failedTests}`);
console.log("");

if (failedTests === 0) {
  console.log("  🎉 TODOS OS TESTES PASSARAM!");
  console.log("  A correção do cálculo de position size está funcionando corretamente.");
} else {
  console.log("  ⚠️ ALGUNS TESTES FALHARAM!");
  console.log("  Revise a implementação do calculateMonetaryPipValue.");
}

console.log("");
console.log("═══════════════════════════════════════════════════════════════════════════════");

// ============= DEMONSTRAÇÃO DO BUG ORIGINAL =============

console.log("\n");
console.log("┌─────────────────────────────────────────────────────────────────────────────┐");
console.log("│ 🔍 DEMONSTRAÇÃO DO BUG ORIGINAL (EURJPY 147 LOTES)                          │");
console.log("├─────────────────────────────────────────────────────────────────────────────┤");
console.log("│ Cenário do incidente:                                                      │");
console.log("│   - Balance: $502.87                                                       │");
console.log("│   - Risco: 2% = $10.06                                                     │");
console.log("│   - SL: 6.8 pips                                                           │");
console.log("│   - Símbolo: EURJPY                                                        │");
console.log("├─────────────────────────────────────────────────────────────────────────────┤");

const bugScenario = {
  accountBalance: 502.87,
  riskPercentage: 2.0,
  stopLossPips: 6.8,
  symbol: "EURJPY",
};

const bugOld = calculatePositionSizeOLD(
  bugScenario.accountBalance,
  bugScenario.riskPercentage,
  bugScenario.stopLossPips,
  bugScenario.symbol
);

const bugNew = calculatePositionSize(
  bugScenario.accountBalance,
  bugScenario.riskPercentage,
  bugScenario.stopLossPips,
  bugScenario.symbol,
  { USDJPY: 159.00 }
);

console.log(`│ ANTES (BUG):                                                                │`);
console.log(`│   Pip Value usado: ${bugOld.pipValue} (movimento de preço, ERRADO!)${" ".repeat(21)}│`);
console.log(`│   Cálculo: $10.06 / (6.8 × 0.01) = ${bugOld.lotSize.toFixed(1)} lotes ❌${" ".repeat(24)}│`);
console.log(`├─────────────────────────────────────────────────────────────────────────────┤`);
console.log(`│ DEPOIS (CORRIGIDO):                                                        │`);
console.log(`│   Pip Value Monetário: $${bugNew.pipValueMonetary.toFixed(2)} (USD por lote, CORRETO!)${" ".repeat(18)}│`);
console.log(`│   Cálculo: $10.06 / (6.8 × $${bugNew.pipValueMonetary.toFixed(2)}) = ${bugNew.lotSize.toFixed(2)} lotes ✅${" ".repeat(20)}│`);
console.log(`├─────────────────────────────────────────────────────────────────────────────┤`);
console.log(`│ 🛡️ A correção evitou uma ordem ${(bugOld.lotSize / bugNew.lotSize).toFixed(0)}x maior que o correto!${" ".repeat(22)}│`);
console.log(`│ 🛡️ O Security Block de 5 lotes salvou a conta, mas agora nem precisa!${" ".repeat(5)}│`);
console.log("└─────────────────────────────────────────────────────────────────────────────┘");

console.log("\n");
console.log("Teste concluído. Execute com: npx ts-node test-risk.ts");
