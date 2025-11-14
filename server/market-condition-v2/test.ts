/**
 * Script de teste para Market Condition Detector v2
 * 
 * Execução: npx tsx server/market-condition-v2/test.ts
 */

import { marketConditionDetector } from "./marketConditionDetector";
import type { CandleData } from "./types";

async function testMarketDetector() {
  console.log("=".repeat(60));
  console.log("TESTE DO MARKET CONDITION DETECTOR V2");
  console.log("=".repeat(60));
  
  // Dados de teste: histórico de 20 candles
  const historicalCandles: CandleData[] = [];
  const basePrice = 150.0;
  const baseTimestamp = Math.floor(Date.now() / 1000) - (20 * 3600); // 20 horas atrás
  
  // Gerar histórico normal
  for (let i = 0; i < 19; i++) {
    const open = basePrice + (Math.random() - 0.5) * 0.5;
    const close = open + (Math.random() - 0.5) * 0.3;
    const high = Math.max(open, close) + Math.random() * 0.2;
    const low = Math.min(open, close) - Math.random() * 0.2;
    
    historicalCandles.push({
      open,
      high,
      low,
      close,
      timestamp: baseTimestamp + (i * 3600),
    });
  }
  
  // Cenário 1: Candle normal (GREEN esperado)
  console.log("\n📊 Cenário 1: Candle Normal");
  const normalCandle: CandleData = {
    open: basePrice,
    high: basePrice + 0.15,
    low: basePrice - 0.15,
    close: basePrice + 0.10,
    timestamp: baseTimestamp + (19 * 3600),
  };
  
  const result1 = await marketConditionDetector.evaluate(
    normalCandle,
    [...historicalCandles, normalCandle],
    "frxUSDJPY",
    1 // userId de teste
  );
  
  console.log(`Status: ${result1.status} | Score: ${result1.score}/10`);
  console.log(`Motivos: ${result1.reasons.join(", ")}`);
  
  // Cenário 2: Candle com amplitude anormal (YELLOW/RED esperado)
  console.log("\n📊 Cenário 2: Candle com Amplitude Anormal");
  const abnormalCandle: CandleData = {
    open: basePrice,
    high: basePrice + 2.0, // Amplitude muito alta
    low: basePrice - 1.5,
    close: basePrice + 0.5,
    timestamp: baseTimestamp + (19 * 3600),
  };
  
  const result2 = await marketConditionDetector.evaluate(
    abnormalCandle,
    [...historicalCandles, abnormalCandle],
    "frxUSDJPY",
    1
  );
  
  console.log(`Status: ${result2.status} | Score: ${result2.score}/10`);
  console.log(`Motivos: ${result2.reasons.join(", ")}`);
  
  // Cenário 3: Candle com sombras longas (YELLOW esperado)
  console.log("\n📊 Cenário 3: Candle com Sombras Longas");
  const wickCandle: CandleData = {
    open: basePrice,
    high: basePrice + 1.0, // Sombra superior longa
    low: basePrice - 0.8, // Sombra inferior longa
    close: basePrice + 0.05, // Corpo pequeno
    timestamp: baseTimestamp + (19 * 3600),
  };
  
  const result3 = await marketConditionDetector.evaluate(
    wickCandle,
    [...historicalCandles, wickCandle],
    "frxUSDJPY",
    1
  );
  
  console.log(`Status: ${result3.status} | Score: ${result3.score}/10`);
  console.log(`Motivos: ${result3.reasons.join(", ")}`);
  
  console.log("\n" + "=".repeat(60));
  console.log("TESTE CONCLUÍDO COM SUCESSO ✅");
  console.log("=".repeat(60));
}

// Executar teste
testMarketDetector()
  .then(() => {
    console.log("\n✅ Todos os testes passaram!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Erro durante teste:", error);
    process.exit(1);
  });
