/**
 * Teste de Validação da Sincronização MTF - PROVA DE FOGO
 * 
 * Este teste verifica que o BacktestAdapter está sincronizando
 * corretamente os índices de múltiplos timeframes baseado em timestamp,
 * eliminando o Look-ahead Bias.
 * 
 * PROVA DE FOGO (conforme Ordem de Serviço):
 * - O Close da vela H1 atual deve ser aproximadamente igual ao preço atual do M5
 * - Não pode ser um preço de 10 horas no futuro
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 2.0.0 - Prova de Fogo
 */

import { BacktestAdapter } from "../adapters/BacktestAdapter";
import { BacktestConfig, BacktestStrategyType } from "../types/backtest.types";
import { CandleData } from "../../adapters/IBrokerAdapter";

// ============================================================================
// MOCK DATA GENERATORS
// ============================================================================

/**
 * Cria dados mock de M5 com preços realistas
 * Simula movimento de preço com pequenas variações
 */
const createMockM5Data = (startTimestamp: number, count: number, basePrice: number = 2000): CandleData[] => {
  const bars: CandleData[] = [];
  let price = basePrice;
  
  for (let i = 0; i < count; i++) {
    // Variação aleatória de -0.5 a +0.5
    const change = (Math.random() - 0.5) * 1;
    price += change;
    
    bars.push({
      symbol: "XAUUSD",
      timeframe: "M5",
      timestamp: startTimestamp + (i * 5 * 60 * 1000), // 5 minutos em ms
      open: price - 0.2,
      high: price + 0.5,
      low: price - 0.5,
      close: price,
      volume: 1000,
    });
  }
  return bars;
};

/**
 * Cria dados mock de H1 alinhados com M5
 * Cada vela H1 deve ter o close próximo ao close do M5 no mesmo período
 */
const createMockH1Data = (startTimestamp: number, count: number, m5Data: CandleData[]): CandleData[] => {
  const bars: CandleData[] = [];
  
  for (let i = 0; i < count; i++) {
    const h1Timestamp = startTimestamp + (i * 60 * 60 * 1000); // 1 hora em ms
    
    // Encontrar o último M5 que está dentro desta hora
    const m5InHour = m5Data.filter(m5 => {
      const m5Time = m5.timestamp;
      return m5Time >= h1Timestamp && m5Time < h1Timestamp + (60 * 60 * 1000);
    });
    
    // Usar o close do último M5 da hora como close do H1
    const lastM5 = m5InHour[m5InHour.length - 1];
    const h1Close = lastM5 ? lastM5.close : 2000 + i;
    const h1Open = m5InHour[0]?.open || h1Close - 1;
    const h1High = Math.max(...m5InHour.map(m => m.high), h1Close);
    const h1Low = Math.min(...m5InHour.map(m => m.low), h1Close);
    
    bars.push({
      symbol: "XAUUSD",
      timeframe: "H1",
      timestamp: h1Timestamp,
      open: h1Open,
      high: h1High,
      low: h1Low,
      close: h1Close,
      volume: 10000,
    });
  }
  return bars;
};

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

/**
 * TESTE 1: Verificar que ao avançar M5, o H1 não avança incorretamente
 */
async function testBasicMTFSynchronization(): Promise<boolean> {
  console.log("\n🔄 TESTE 1: Sincronização Básica MTF");
  console.log("   Objetivo: Verificar que H1 não avança mais rápido que M5");
  
  const startDate = new Date("2025-01-01T00:00:00Z");
  const endDate = new Date("2025-01-02T00:00:00Z");
  
  const config: BacktestConfig = {
    symbol: "XAUUSD",
    strategy: BacktestStrategyType.SMC,
    startDate,
    endDate,
    initialBalance: 10000,
    leverage: 500,
    commission: 7,
    slippage: 0.5,
    spread: 1.0,
    dataPath: "/tmp/test-data",
    timeframes: ["M5", "H1"],
    riskPercent: 2,
    maxPositions: 3,
    maxSpread: 3,
  };
  
  const adapter = new BacktestAdapter(config);
  const startTimestamp = startDate.getTime();
  
  // Criar dados de teste
  const m5Data = createMockM5Data(startTimestamp, 288, 2000); // 24h de M5
  const h1Data = createMockH1Data(startTimestamp, 24, m5Data); // 24h de H1
  
  // Injetar dados
  (adapter as any).candleData.set("XAUUSD", new Map([
    ["M5", m5Data],
    ["H1", h1Data],
  ]));
  (adapter as any).initializeTimeframeIndices("XAUUSD", ["M5", "H1"]);
  
  // Avançar 12 velas M5 (1 hora)
  for (let i = 0; i < 12; i++) {
    adapter.advanceBar("XAUUSD", "M5");
  }
  
  const m5After = await adapter.getCandleHistory("XAUUSD", "M5", 1);
  const h1After = await adapter.getCandleHistory("XAUUSD", "H1", 1);
  
  const m5Timestamp = m5After[m5After.length - 1]?.timestamp;
  const h1Timestamp = h1After[h1After.length - 1]?.timestamp;
  
  console.log(`   M5 timestamp: ${new Date(m5Timestamp).toISOString()}`);
  console.log(`   H1 timestamp: ${new Date(h1Timestamp).toISOString()}`);
  
  const passed = h1Timestamp <= m5Timestamp;
  console.log(`   Resultado: ${passed ? "✅ PASSOU" : "❌ FALHOU"}`);
  
  return passed;
}

/**
 * TESTE 2: PROVA DE FOGO - Close do H1 deve ser próximo ao preço do M5
 */
async function testProvaDefogoH1CloseVsM5Price(): Promise<boolean> {
  console.log("\n🔥 TESTE 2: PROVA DE FOGO - H1 Close vs M5 Price");
  console.log("   Objetivo: Close do H1 deve ser aproximadamente igual ao M5 atual");
  console.log("   Critério: Diferença < 5% (considerando volatilidade)");
  
  const startDate = new Date("2025-01-01T00:00:00Z");
  const endDate = new Date("2025-01-02T00:00:00Z");
  
  const config: BacktestConfig = {
    symbol: "XAUUSD",
    strategy: BacktestStrategyType.SMC,
    startDate,
    endDate,
    initialBalance: 10000,
    leverage: 500,
    commission: 7,
    slippage: 0.5,
    spread: 1.0,
    dataPath: "/tmp/test-data",
    timeframes: ["M5", "H1"],
    riskPercent: 2,
    maxPositions: 3,
    maxSpread: 3,
  };
  
  const adapter = new BacktestAdapter(config);
  const startTimestamp = startDate.getTime();
  
  // Criar dados com preços realistas
  const m5Data = createMockM5Data(startTimestamp, 288, 2000);
  const h1Data = createMockH1Data(startTimestamp, 24, m5Data);
  
  // Injetar dados
  (adapter as any).candleData.set("XAUUSD", new Map([
    ["M5", m5Data],
    ["H1", h1Data],
  ]));
  (adapter as any).initializeTimeframeIndices("XAUUSD", ["M5", "H1"]);
  
  // Avançar para o meio do período (144 velas M5 = 12 horas)
  for (let i = 0; i < 144; i++) {
    adapter.advanceBar("XAUUSD", "M5");
  }
  
  // Usar o método de validação do adapter
  const validation = await adapter.validateMTFSync("XAUUSD");
  
  console.log(`   M5 Price: ${validation.m5Price.toFixed(5)}`);
  console.log(`   H1 Close: ${validation.h1Close.toFixed(5)}`);
  console.log(`   Diferença: ${validation.priceDiff.toFixed(5)} (${validation.priceDiffPercent.toFixed(2)}%)`);
  console.log(`   M5 Timestamp: ${validation.m5Timestamp}`);
  console.log(`   H1 Timestamp: ${validation.h1Timestamp}`);
  console.log(`   ${validation.message}`);
  console.log(`   Resultado: ${validation.isValid ? "✅ PASSOU" : "❌ FALHOU"}`);
  
  return validation.isValid;
}

/**
 * TESTE 3: Verificar ausência de Look-ahead Bias em múltiplos pontos
 */
async function testNoLookAheadBias(): Promise<boolean> {
  console.log("\n🔍 TESTE 3: Verificar Ausência de Look-ahead Bias");
  console.log("   Objetivo: Nenhuma vela H1 pode ter timestamp > timestamp simulado");
  
  const startDate = new Date("2025-01-01T00:00:00Z");
  const endDate = new Date("2025-01-02T00:00:00Z");
  
  const config: BacktestConfig = {
    symbol: "XAUUSD",
    strategy: BacktestStrategyType.SMC,
    startDate,
    endDate,
    initialBalance: 10000,
    leverage: 500,
    commission: 7,
    slippage: 0.5,
    spread: 1.0,
    dataPath: "/tmp/test-data",
    timeframes: ["M5", "H1"],
    riskPercent: 2,
    maxPositions: 3,
    maxSpread: 3,
  };
  
  const adapter = new BacktestAdapter(config);
  const startTimestamp = startDate.getTime();
  
  const m5Data = createMockM5Data(startTimestamp, 288, 2000);
  const h1Data = createMockH1Data(startTimestamp, 24, m5Data);
  
  (adapter as any).candleData.set("XAUUSD", new Map([
    ["M5", m5Data],
    ["H1", h1Data],
  ]));
  (adapter as any).initializeTimeframeIndices("XAUUSD", ["M5", "H1"]);
  
  let lookAheadFound = false;
  let checksPerformed = 0;
  
  // Avançar e verificar em múltiplos pontos
  for (let i = 0; i < 200; i++) {
    adapter.advanceBar("XAUUSD", "M5");
    
    // Verificar a cada 20 barras
    if (i % 20 === 0) {
      checksPerformed++;
      const currentTimestamp = adapter.getCurrentSimulatedTimestamp();
      const h1History = await adapter.getCandleHistory("XAUUSD", "H1", 50);
      
      for (const candle of h1History) {
        if (candle.timestamp > currentTimestamp) {
          lookAheadFound = true;
          console.log(`   ❌ Look-ahead detectado na barra ${i}:`);
          console.log(`      H1: ${new Date(candle.timestamp).toISOString()}`);
          console.log(`      Simulado: ${new Date(currentTimestamp).toISOString()}`);
          break;
        }
      }
      
      if (lookAheadFound) break;
    }
  }
  
  const passed = !lookAheadFound;
  console.log(`   Verificações realizadas: ${checksPerformed}`);
  console.log(`   Resultado: ${passed ? "✅ PASSOU - Sem Look-ahead Bias" : "❌ FALHOU - Look-ahead detectado"}`);
  
  return passed;
}

/**
 * TESTE 4: Verificar que índices são realmente independentes
 */
async function testIndependentIndices(): Promise<boolean> {
  console.log("\n📊 TESTE 4: Índices Independentes por Timeframe");
  console.log("   Objetivo: Cada timeframe deve ter seu próprio índice");
  
  const startDate = new Date("2025-01-01T00:00:00Z");
  const endDate = new Date("2025-01-02T00:00:00Z");
  
  const config: BacktestConfig = {
    symbol: "XAUUSD",
    strategy: BacktestStrategyType.SMC,
    startDate,
    endDate,
    initialBalance: 10000,
    leverage: 500,
    commission: 7,
    slippage: 0.5,
    spread: 1.0,
    dataPath: "/tmp/test-data",
    timeframes: ["M5", "H1"],
    riskPercent: 2,
    maxPositions: 3,
    maxSpread: 3,
  };
  
  const adapter = new BacktestAdapter(config);
  const startTimestamp = startDate.getTime();
  
  const m5Data = createMockM5Data(startTimestamp, 288, 2000);
  const h1Data = createMockH1Data(startTimestamp, 24, m5Data);
  
  (adapter as any).candleData.set("XAUUSD", new Map([
    ["M5", m5Data],
    ["H1", h1Data],
  ]));
  (adapter as any).initializeTimeframeIndices("XAUUSD", ["M5", "H1"]);
  
  // Avançar 24 velas M5 (2 horas)
  for (let i = 0; i < 24; i++) {
    adapter.advanceBar("XAUUSD", "M5");
  }
  
  const m5Index = adapter.getCurrentBarIndex("XAUUSD", "M5");
  const h1Index = adapter.getCurrentBarIndex("XAUUSD", "H1");
  
  console.log(`   Índice M5: ${m5Index}`);
  console.log(`   Índice H1: ${h1Index}`);
  console.log(`   Razão esperada: M5/H1 ≈ 12 (12 velas M5 por hora)`);
  
  // Após 24 velas M5 (2 horas), o índice H1 deve ser ~2
  // O índice M5 deve ser 24
  const expectedH1Index = 2;
  const passed = m5Index === 24 && h1Index === expectedH1Index;
  
  console.log(`   Resultado: ${passed ? "✅ PASSOU" : "❌ FALHOU"}`);
  
  return passed;
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("🧪 SUITE DE TESTES: SINCRONIZAÇÃO MTF - PROVA DE FOGO");
  console.log("═══════════════════════════════════════════════════════════════");
  
  const results: { name: string; passed: boolean }[] = [];
  
  // Executar todos os testes
  results.push({ name: "Sincronização Básica MTF", passed: await testBasicMTFSynchronization() });
  results.push({ name: "Prova de Fogo: H1 Close vs M5 Price", passed: await testProvaDefogoH1CloseVsM5Price() });
  results.push({ name: "Ausência de Look-ahead Bias", passed: await testNoLookAheadBias() });
  results.push({ name: "Índices Independentes", passed: await testIndependentIndices() });
  
  // Resumo
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("📋 RESUMO DOS TESTES");
  console.log("═══════════════════════════════════════════════════════════════");
  
  let allPassed = true;
  for (const result of results) {
    const status = result.passed ? "✅ PASSOU" : "❌ FALHOU";
    console.log(`   ${status} - ${result.name}`);
    if (!result.passed) allPassed = false;
  }
  
  console.log("═══════════════════════════════════════════════════════════════");
  if (allPassed) {
    console.log("🎉 TODOS OS TESTES PASSARAM! Sincronização MTF validada.");
  } else {
    console.log("⚠️ ALGUNS TESTES FALHARAM! Revisar implementação.");
  }
  console.log("═══════════════════════════════════════════════════════════════");
  
  process.exit(allPassed ? 0 : 1);
}

// Executar testes
runAllTests().catch(err => {
  console.error("Erro ao executar testes:", err);
  process.exit(1);
});

export { runAllTests };
