/**
 * Teste de Validação da Sincronização MTF
 * 
 * Este teste verifica que o BacktestAdapter está sincronizando
 * corretamente os índices de múltiplos timeframes baseado em timestamp,
 * eliminando o Look-ahead Bias.
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 1.0.0
 */

import { BacktestAdapter } from "../adapters/BacktestAdapter";
import { BacktestConfig, BacktestStrategyType } from "../types/backtest.types";

// Mock de dados para teste
const createMockM5Data = (startTimestamp: number, count: number) => {
  const bars = [];
  for (let i = 0; i < count; i++) {
    bars.push({
      symbol: "XAUUSD",
      timeframe: "M5",
      timestamp: startTimestamp + (i * 5 * 60 * 1000), // 5 minutos em ms
      open: 2000 + i,
      high: 2001 + i,
      low: 1999 + i,
      close: 2000.5 + i,
      volume: 1000,
    });
  }
  return bars;
};

const createMockH1Data = (startTimestamp: number, count: number) => {
  const bars = [];
  for (let i = 0; i < count; i++) {
    bars.push({
      symbol: "XAUUSD",
      timeframe: "H1",
      timestamp: startTimestamp + (i * 60 * 60 * 1000), // 1 hora em ms
      open: 2000 + i * 10,
      high: 2010 + i * 10,
      low: 1990 + i * 10,
      close: 2005 + i * 10,
      volume: 10000,
    });
  }
  return bars;
};

/**
 * Teste principal: Verificar que ao avançar M5, o H1 não avança incorretamente
 */
async function testMTFSynchronization() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("🧪 TESTE DE SINCRONIZAÇÃO MTF");
  console.log("═══════════════════════════════════════════════════════════════");
  
  // Configuração de teste
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
  
  // Simular dados carregados (normalmente vem de arquivos)
  const startTimestamp = startDate.getTime();
  
  // Criar dados de teste
  // M5: 288 velas por dia (24h * 60min / 5min)
  // H1: 24 velas por dia
  const m5Data = createMockM5Data(startTimestamp, 288);
  const h1Data = createMockH1Data(startTimestamp, 24);
  
  // Injetar dados diretamente (bypass do loadHistoricalData)
  (adapter as any).candleData.set("XAUUSD", new Map([
    ["M5", m5Data],
    ["H1", h1Data],
  ]));
  
  // Inicializar índices
  (adapter as any).initializeTimeframeIndices("XAUUSD", ["M5", "H1"]);
  
  console.log("\n📊 Dados de Teste:");
  console.log(`   M5: ${m5Data.length} velas`);
  console.log(`   H1: ${h1Data.length} velas`);
  
  // Teste 1: Avançar 12 velas de M5 (1 hora)
  console.log("\n🔄 Teste 1: Avançar 12 velas M5 (1 hora)");
  
  for (let i = 0; i < 12; i++) {
    adapter.advanceBar("XAUUSD", "M5");
  }
  
  const m5After12 = await adapter.getCandleHistory("XAUUSD", "M5", 1);
  const h1After12 = await adapter.getCandleHistory("XAUUSD", "H1", 1);
  
  const m5Timestamp = m5After12[m5After12.length - 1]?.timestamp;
  const h1Timestamp = h1After12[h1After12.length - 1]?.timestamp;
  
  console.log(`   M5 timestamp: ${new Date(m5Timestamp).toISOString()}`);
  console.log(`   H1 timestamp: ${new Date(h1Timestamp).toISOString()}`);
  
  // Validação: H1 deve estar <= M5 (não pode ler o futuro)
  const test1Pass = h1Timestamp <= m5Timestamp;
  console.log(`   ✅ H1 <= M5: ${test1Pass ? "PASSOU" : "FALHOU"}`);
  
  // Teste 2: Avançar mais 12 velas de M5 (mais 1 hora)
  console.log("\n🔄 Teste 2: Avançar mais 12 velas M5 (total 2 horas)");
  
  for (let i = 0; i < 12; i++) {
    adapter.advanceBar("XAUUSD", "M5");
  }
  
  const m5After24 = await adapter.getCandleHistory("XAUUSD", "M5", 1);
  const h1After24 = await adapter.getCandleHistory("XAUUSD", "H1", 1);
  
  const m5Timestamp2 = m5After24[m5After24.length - 1]?.timestamp;
  const h1Timestamp2 = h1After24[h1After24.length - 1]?.timestamp;
  
  console.log(`   M5 timestamp: ${new Date(m5Timestamp2).toISOString()}`);
  console.log(`   H1 timestamp: ${new Date(h1Timestamp2).toISOString()}`);
  
  // Validação: H1 deve ter avançado para a segunda vela
  const test2Pass = h1Timestamp2 > h1Timestamp && h1Timestamp2 <= m5Timestamp2;
  console.log(`   ✅ H1 avançou corretamente: ${test2Pass ? "PASSOU" : "FALHOU"}`);
  
  // Teste 3: Verificar que não há Look-ahead Bias
  console.log("\n🔄 Teste 3: Verificar ausência de Look-ahead Bias");
  
  // Avançar para o meio do período
  for (let i = 0; i < 100; i++) {
    adapter.advanceBar("XAUUSD", "M5");
  }
  
  const currentTimestamp = adapter.getCurrentSimulatedTimestamp();
  const h1History = await adapter.getCandleHistory("XAUUSD", "H1", 50);
  
  // Verificar que NENHUMA vela H1 tem timestamp > currentTimestamp
  let lookAheadFound = false;
  for (const candle of h1History) {
    if (candle.timestamp > currentTimestamp) {
      lookAheadFound = true;
      console.log(`   ❌ Look-ahead detectado: H1 ${new Date(candle.timestamp).toISOString()} > Simulado ${new Date(currentTimestamp).toISOString()}`);
      break;
    }
  }
  
  const test3Pass = !lookAheadFound;
  console.log(`   ✅ Sem Look-ahead Bias: ${test3Pass ? "PASSOU" : "FALHOU"}`);
  
  // Resultado final
  console.log("\n═══════════════════════════════════════════════════════════════");
  const allPassed = test1Pass && test2Pass && test3Pass;
  if (allPassed) {
    console.log("✅ TODOS OS TESTES PASSARAM!");
  } else {
    console.log("❌ ALGUNS TESTES FALHARAM!");
  }
  console.log("═══════════════════════════════════════════════════════════════");
  
  return allPassed;
}

// Executar teste automaticamente
testMTFSynchronization()
  .then(passed => process.exit(passed ? 0 : 1))
  .catch(err => {
    console.error("Erro no teste:", err);
    process.exit(1);
  });

export { testMTFSynchronization };
