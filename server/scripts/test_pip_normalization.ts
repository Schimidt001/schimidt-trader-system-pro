/**
 * Script de Teste: Validacao da Normalizacao de Pips
 * 
 * Este script valida que a correcao da normalizacao de precos
 * esta funcionando corretamente para diferentes ativos.
 * 
 * @see Briefing Tecnico - Correcao da Normalizacao de Preco
 * @author Schimidt Trader System PRO
 */

// Mapeamento de pip values (deve ser identico ao SMCStrategy)
const PIP_VALUES: Record<string, number> = {
  // Forex Major
  "EURUSD": 0.0001,
  "GBPUSD": 0.0001,
  "USDJPY": 0.01,
  "AUDUSD": 0.0001,
  "USDCAD": 0.0001,
  "USDCHF": 0.0001,
  "NZDUSD": 0.0001,
  // Forex Cross JPY
  "EURJPY": 0.01,
  "GBPJPY": 0.01,
  "AUDJPY": 0.01,
  "CADJPY": 0.01,
  "CHFJPY": 0.01,
  "NZDJPY": 0.01,
  // Forex Cross
  "EURGBP": 0.0001,
  "EURAUD": 0.0001,
  "EURNZD": 0.0001,
  "GBPAUD": 0.0001,
  // Metais Preciosos - CRITICO
  "XAUUSD": 0.10,
  "XAGUSD": 0.001,
  // Indices
  "US30": 1.0,
  "US500": 0.1,
  "US100": 0.1,
  "DE40": 0.1,
  "UK100": 0.1,
};

function getPipValue(symbol: string): number {
  if (PIP_VALUES[symbol] !== undefined) {
    return PIP_VALUES[symbol];
  }
  if (symbol.includes("JPY")) {
    return 0.01;
  }
  if (symbol.startsWith("XAU")) {
    return 0.10;
  }
  if (symbol.startsWith("XAG")) {
    return 0.001;
  }
  return 0.0001;
}

function priceToPips(priceDiff: number, symbol: string): number {
  const pipValue = getPipValue(symbol);
  return Math.abs(priceDiff) / pipValue;
}

// ============= TESTES =============

interface TestCase {
  symbol: string;
  priceDiff: number;
  expectedPips: number;
  description: string;
}

const testCases: TestCase[] = [
  // EURUSD - Forex Standard
  {
    symbol: "EURUSD",
    priceDiff: 0.0050,
    expectedPips: 50,
    description: "EURUSD: Movimento de 50 pips"
  },
  {
    symbol: "EURUSD",
    priceDiff: 0.0001,
    expectedPips: 1,
    description: "EURUSD: Movimento de 1 pip"
  },
  
  // USDJPY - Forex JPY
  {
    symbol: "USDJPY",
    priceDiff: 0.50,
    expectedPips: 50,
    description: "USDJPY: Movimento de 50 pips"
  },
  {
    symbol: "USDJPY",
    priceDiff: 0.01,
    expectedPips: 1,
    description: "USDJPY: Movimento de 1 pip"
  },
  
  // XAUUSD - Ouro (CRITICO)
  {
    symbol: "XAUUSD",
    priceDiff: 10.0,
    expectedPips: 100,
    description: "XAUUSD: Movimento de $10 = 100 pips"
  },
  {
    symbol: "XAUUSD",
    priceDiff: 4.50,
    expectedPips: 45,
    description: "XAUUSD: Movimento de $4.50 = 45 pips"
  },
  {
    symbol: "XAUUSD",
    priceDiff: 0.10,
    expectedPips: 1,
    description: "XAUUSD: Movimento de $0.10 = 1 pip"
  },
  {
    symbol: "XAUUSD",
    priceDiff: 100.0,
    expectedPips: 1000,
    description: "XAUUSD: Movimento de $100 = 1000 pips (reversao significativa)"
  },
  
  // XAGUSD - Prata
  {
    symbol: "XAGUSD",
    priceDiff: 0.50,
    expectedPips: 500,
    description: "XAGUSD: Movimento de $0.50 = 500 pips"
  },
  
  // Indices
  {
    symbol: "US30",
    priceDiff: 100,
    expectedPips: 100,
    description: "US30: Movimento de 100 pontos = 100 pips"
  },
];

function runTests(): void {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("       TESTE DE NORMALIZACAO DE PIPS - SMC Trading Engine      ");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
  
  let passed = 0;
  let failed = 0;
  
  for (const test of testCases) {
    const result = priceToPips(test.priceDiff, test.symbol);
    const isPass = Math.abs(result - test.expectedPips) < 0.01;
    
    if (isPass) {
      passed++;
      console.log(`✅ PASS: ${test.description}`);
      console.log(`   Movimento Bruto: ${test.priceDiff} | Convertido: ${result.toFixed(1)} pips | Esperado: ${test.expectedPips} pips`);
    } else {
      failed++;
      console.log(`❌ FAIL: ${test.description}`);
      console.log(`   Movimento Bruto: ${test.priceDiff} | Convertido: ${result.toFixed(1)} pips | Esperado: ${test.expectedPips} pips`);
    }
    console.log("");
  }
  
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`                    RESULTADO: ${passed}/${testCases.length} testes passaram`);
  if (failed > 0) {
    console.log(`                    ⚠️  ${failed} testes falharam!`);
  } else {
    console.log("                    ✅ Todos os testes passaram!");
  }
  console.log("═══════════════════════════════════════════════════════════════");
  
  // Teste especifico do briefing: XAUUSD 100+ pips
  console.log("");
  console.log("───────────────────────────────────────────────────────────────");
  console.log("  VALIDACAO DO BRIEFING: Movimento de 100+ Pips no XAUUSD     ");
  console.log("───────────────────────────────────────────────────────────────");
  
  const xauMovement = 10.0; // $10 de movimento
  const xauPips = priceToPips(xauMovement, "XAUUSD");
  
  console.log(`  Cenario: Preco do ouro moveu $${xauMovement}`);
  console.log(`  Pip Value configurado: ${getPipValue("XAUUSD")}`);
  console.log(`  Resultado: ${xauPips.toFixed(1)} pips`);
  
  if (xauPips >= 100) {
    console.log(`  ✅ CORRETO: O robo agora detecta ${xauPips.toFixed(0)} pips (>= 100)`);
  } else {
    console.log(`  ❌ ERRO: O robo ainda esta lendo incorretamente`);
  }
  
  // Simular o problema original (se pip value fosse 0.0001 como Forex)
  const wrongPipValue = 0.0001;
  const wrongPips = xauMovement / wrongPipValue;
  console.log("");
  console.log(`  Comparacao com configuracao ERRADA (pip=0.0001):`);
  console.log(`  Resultado errado: ${wrongPips.toFixed(0)} pips (ABSURDO!)`);
  console.log("───────────────────────────────────────────────────────────────");
}

// Executar testes
runTests();
