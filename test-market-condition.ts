/**
 * Script de teste para o Market Condition Detector
 */

import { marketConditionDetector } from "./server/market-condition/marketConditionDetector";
import {
  calculateATR,
  calculateAmplitude,
  calculateBody,
  calculateWicks,
  hasFractalVolatility,
  type CandleData,
} from "./server/market-condition/technicalUtils";

// Dados de teste: candles simulados
const testCandles: CandleData[] = [
  { open: 1.1000, high: 1.1050, low: 1.0980, close: 1.1020, timestamp: 1700000000 },
  { open: 1.1020, high: 1.1060, low: 1.0990, close: 1.1030, timestamp: 1700003600 },
  { open: 1.1030, high: 1.1070, low: 1.1000, close: 1.1040, timestamp: 1700007200 },
  { open: 1.1040, high: 1.1080, low: 1.1010, close: 1.1050, timestamp: 1700010800 },
  { open: 1.1050, high: 1.1090, low: 1.1020, close: 1.1060, timestamp: 1700014400 },
  { open: 1.1060, high: 1.1100, low: 1.1030, close: 1.1070, timestamp: 1700018000 },
  { open: 1.1070, high: 1.1110, low: 1.1040, close: 1.1080, timestamp: 1700021600 },
  { open: 1.1080, high: 1.1120, low: 1.1050, close: 1.1090, timestamp: 1700025200 },
  { open: 1.1090, high: 1.1130, low: 1.1060, close: 1.1100, timestamp: 1700028800 },
  { open: 1.1100, high: 1.1140, low: 1.1070, close: 1.1110, timestamp: 1700032400 },
  { open: 1.1110, high: 1.1150, low: 1.1080, close: 1.1120, timestamp: 1700036000 },
  { open: 1.1120, high: 1.1160, low: 1.1090, close: 1.1130, timestamp: 1700039600 },
  { open: 1.1130, high: 1.1170, low: 1.1100, close: 1.1140, timestamp: 1700043200 },
  { open: 1.1140, high: 1.1180, low: 1.1110, close: 1.1150, timestamp: 1700046800 },
  // Candle anterior (H-1) com características anormais
  { open: 1.1150, high: 1.1300, low: 1.1000, close: 1.1160, timestamp: 1700050400 },
];

async function runTests() {
  console.log("=".repeat(80));
  console.log("TESTES DO MARKET CONDITION DETECTOR v1.0");
  console.log("=".repeat(80));
  console.log();

  // Teste 1: Cálculo de ATR
  console.log("📊 TESTE 1: Cálculo de ATR");
  console.log("-".repeat(80));
  const atr = calculateATR(testCandles, 14);
  console.log(`ATR (14 períodos): ${atr.toFixed(5)}`);
  console.log(`✅ ATR calculado com sucesso\n`);

  // Teste 2: Amplitude do candle
  console.log("📊 TESTE 2: Amplitude do Candle");
  console.log("-".repeat(80));
  const lastCandle = testCandles[testCandles.length - 1];
  const amplitude = calculateAmplitude(lastCandle);
  console.log(`Candle: High=${lastCandle.high}, Low=${lastCandle.low}`);
  console.log(`Amplitude: ${amplitude.toFixed(5)}`);
  console.log(`ATR * 2: ${(atr * 2).toFixed(5)}`);
  console.log(`Amplitude > ATR * 2? ${amplitude > atr * 2 ? "✅ SIM (anormal)" : "❌ NÃO (normal)"}\n`);

  // Teste 3: Sombras (wicks)
  console.log("📊 TESTE 3: Sombras do Candle");
  console.log("-".repeat(80));
  const wicks = calculateWicks(lastCandle);
  const corpo = calculateBody(lastCandle);
  console.log(`Candle: Open=${lastCandle.open}, Close=${lastCandle.close}`);
  console.log(`Corpo: ${corpo.toFixed(5)}`);
  console.log(`Sombra Superior: ${wicks.superior.toFixed(5)}`);
  console.log(`Sombra Inferior: ${wicks.inferior.toFixed(5)}`);
  const maxWick = Math.max(wicks.superior, wicks.inferior);
  console.log(`Max Wick > Corpo * 2? ${maxWick > corpo * 2 ? "✅ SIM (sombras longas)" : "❌ NÃO (normal)"}\n`);

  // Teste 4: Volatilidade Fractal
  console.log("📊 TESTE 4: Volatilidade Fractal");
  console.log("-".repeat(80));
  const isFractal = hasFractalVolatility(lastCandle, 0.3);
  const razao = corpo / amplitude;
  console.log(`Corpo: ${corpo.toFixed(5)}`);
  console.log(`Amplitude: ${amplitude.toFixed(5)}`);
  console.log(`Razão Corpo/Amplitude: ${razao.toFixed(3)}`);
  console.log(`Razão < 0.3? ${isFractal ? "✅ SIM (volátil/fractal)" : "❌ NÃO (normal)"}\n`);

  // Teste 5: Avaliação completa
  console.log("📊 TESTE 5: Avaliação Completa do Detector");
  console.log("-".repeat(80));
  
  try {
    const result = await marketConditionDetector.evaluate(
      lastCandle,
      testCandles,
      "frxUSDJPY"
    );
    
    console.log(`Status: ${result.status === "GREEN" ? "🟢" : result.status === "YELLOW" ? "🟡" : "🔴"} ${result.status}`);
    console.log(`Score: ${result.score}/10`);
    console.log(`Motivos: ${result.reasons.join(", ")}`);
    console.log(`Símbolo: ${result.symbol}`);
    console.log(`Timestamp do Candle: ${new Date(result.candleTimestamp * 1000).toISOString()}`);
    console.log(`Computado em: ${result.computedAt.toISOString()}`);
    
    if (result.details) {
      console.log(`\nDetalhes:`);
      console.log(`  - ATR: ${result.details.atr?.toFixed(5)}`);
      console.log(`  - Amplitude: ${result.details.amplitude?.toFixed(5)}`);
      console.log(`  - Corpo: ${result.details.corpo?.toFixed(5)}`);
      console.log(`  - Wick Superior: ${result.details.wickSuperior?.toFixed(5)}`);
      console.log(`  - Wick Inferior: ${result.details.wickInferior?.toFixed(5)}`);
      console.log(`  - Volatilidade Fractal: ${result.details.volatilityFractal ? "Sim" : "Não"}`);
    }
    
    console.log(`\n✅ Avaliação completa executada com sucesso\n`);
  } catch (error) {
    console.error(`❌ Erro na avaliação: ${error}`);
  }

  // Teste 6: Candle normal (sem anomalias)
  console.log("📊 TESTE 6: Candle Normal (sem anomalias)");
  console.log("-".repeat(80));
  
  const normalCandle: CandleData = {
    open: 1.1150,
    high: 1.1165,
    low: 1.1145,
    close: 1.1160,
    timestamp: 1700054000,
  };
  
  const normalCandles = [...testCandles.slice(0, -1), normalCandle];
  
  try {
    const result = await marketConditionDetector.evaluate(
      normalCandle,
      normalCandles,
      "frxUSDJPY"
    );
    
    console.log(`Status: ${result.status === "GREEN" ? "🟢" : result.status === "YELLOW" ? "🟡" : "🔴"} ${result.status}`);
    console.log(`Score: ${result.score}/10`);
    console.log(`Motivos: ${result.reasons.join(", ")}`);
    console.log(`\n✅ Teste com candle normal executado com sucesso\n`);
  } catch (error) {
    console.error(`❌ Erro na avaliação: ${error}`);
  }

  console.log("=".repeat(80));
  console.log("TODOS OS TESTES CONCLUÍDOS");
  console.log("=".repeat(80));
}

// Executar testes
runTests().catch(console.error);
