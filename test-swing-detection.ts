/**
 * Script de teste para simular a deteção de Swing Points
 * 
 * Este script simula a lógica de deteção de Swing Points para
 * verificar se a configuração atual está correta.
 */

interface TrendbarData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SwingPoint {
  type: "HIGH" | "LOW";
  price: number;
  timestamp: number;
  index: number;
  swept: boolean;
  isValid: boolean;
}

// Configuração atual do banco de dados
const config = {
  fractalLeftBars: 1,
  fractalRightBars: 1,
  swingH1Lookback: 100,
  structureTimeframe: 'M15'
};

// Gerar dados de candles simulados (M15)
function generateTestCandles(count: number): TrendbarData[] {
  const candles: TrendbarData[] = [];
  let basePrice = 1.1000;
  
  for (let i = 0; i < count; i++) {
    // Simular movimento de preço com tendência e ruído
    const trend = Math.sin(i / 20) * 0.01; // Tendência sinusoidal
    const noise = (Math.random() - 0.5) * 0.002; // Ruído aleatório
    
    basePrice += trend + noise;
    
    const open = basePrice;
    const close = basePrice + (Math.random() - 0.5) * 0.001;
    const high = Math.max(open, close) + Math.random() * 0.0005;
    const low = Math.min(open, close) - Math.random() * 0.0005;
    
    candles.push({
      timestamp: Date.now() - (count - i) * 15 * 60 * 1000, // M15
      open,
      high,
      low,
      close,
      volume: Math.floor(Math.random() * 1000)
    });
  }
  
  return candles;
}

// Função de deteção de Swing Points (cópia da lógica do SMCStrategy)
function identifySwingPoints(candles: TrendbarData[], leftBars: number, rightBars: number, lookback: number): { highs: SwingPoint[], lows: SwingPoint[] } {
  const newSwingHighs: SwingPoint[] = [];
  const newSwingLows: SwingPoint[] = [];
  
  console.log(`\n=== Parâmetros de Deteção ===`);
  console.log(`Candles: ${candles.length}`);
  console.log(`leftBars: ${leftBars}`);
  console.log(`rightBars: ${rightBars}`);
  console.log(`lookback: ${lookback}`);
  
  // Precisamos de pelo menos leftBars + rightBars + 1 candles
  if (candles.length < leftBars + rightBars + 1) {
    console.log(`❌ Candles insuficientes: ${candles.length} < ${leftBars + rightBars + 1}`);
    return { highs: [], lows: [] };
  }
  
  const startIndex = Math.max(0, candles.length - lookback);
  console.log(`startIndex: ${startIndex}`);
  console.log(`Range de iteração: [${startIndex + leftBars}, ${candles.length - rightBars})`);
  
  let swingHighsFound = 0;
  let swingLowsFound = 0;
  
  // Iterar pelos candles
  for (let i = startIndex + leftBars; i < candles.length - rightBars; i++) {
    const currentCandle = candles[i];
    
    // ========== VERIFICAR SWING HIGH (TOPO) ==========
    let isSwingHigh = true;
    
    // Verificar candles à esquerda
    for (let j = 1; j <= leftBars; j++) {
      if (candles[i - j].high >= currentCandle.high) {
        isSwingHigh = false;
        break;
      }
    }
    
    // Verificar candles à direita
    if (isSwingHigh) {
      for (let j = 1; j <= rightBars; j++) {
        if (candles[i + j].high >= currentCandle.high) {
          isSwingHigh = false;
          break;
        }
      }
    }
    
    if (isSwingHigh) {
      swingHighsFound++;
      newSwingHighs.push({
        type: "HIGH",
        price: currentCandle.high,
        timestamp: currentCandle.timestamp,
        index: i,
        swept: false,
        isValid: true,
      });
    }
    
    // ========== VERIFICAR SWING LOW (FUNDO) ==========
    let isSwingLow = true;
    
    // Verificar candles à esquerda
    for (let j = 1; j <= leftBars; j++) {
      if (candles[i - j].low <= currentCandle.low) {
        isSwingLow = false;
        break;
      }
    }
    
    // Verificar candles à direita
    if (isSwingLow) {
      for (let j = 1; j <= rightBars; j++) {
        if (candles[i + j].low <= currentCandle.low) {
          isSwingLow = false;
          break;
        }
      }
    }
    
    if (isSwingLow) {
      swingLowsFound++;
      newSwingLows.push({
        type: "LOW",
        price: currentCandle.low,
        timestamp: currentCandle.timestamp,
        index: i,
        swept: false,
        isValid: true,
      });
    }
  }
  
  console.log(`\n=== Resultados ===`);
  console.log(`Swing Highs encontrados: ${swingHighsFound}`);
  console.log(`Swing Lows encontrados: ${swingLowsFound}`);
  
  return { highs: newSwingHighs, lows: newSwingLows };
}

// Executar teste
console.log("=== Teste de Deteção de Swing Points ===\n");

// Gerar 250 candles (como o sistema faz)
const testCandles = generateTestCandles(250);

console.log(`Primeiro candle: O=${testCandles[0].open.toFixed(5)} H=${testCandles[0].high.toFixed(5)} L=${testCandles[0].low.toFixed(5)} C=${testCandles[0].close.toFixed(5)}`);
console.log(`Último candle: O=${testCandles[249].open.toFixed(5)} H=${testCandles[249].high.toFixed(5)} L=${testCandles[249].low.toFixed(5)} C=${testCandles[249].close.toFixed(5)}`);

// Testar com configuração atual
const result = identifySwingPoints(
  testCandles,
  config.fractalLeftBars,
  config.fractalRightBars,
  config.swingH1Lookback
);

if (result.highs.length === 0 && result.lows.length === 0) {
  console.log("\n❌ PROBLEMA CONFIRMADO: Nenhum Swing Point detetado!");
  console.log("\nPossíveis causas:");
  console.log("1. Dados de candles com valores inválidos");
  console.log("2. Parâmetros de fractal muito restritivos");
  console.log("3. Mercado em consolidação extrema");
} else {
  console.log("\n✅ Swing Points detetados com sucesso!");
  console.log(`\nÚltimos 3 Swing Highs:`);
  result.highs.slice(-3).forEach(h => {
    console.log(`  - Price: ${h.price.toFixed(5)} @ index ${h.index}`);
  });
  console.log(`\nÚltimos 3 Swing Lows:`);
  result.lows.slice(-3).forEach(l => {
    console.log(`  - Price: ${l.price.toFixed(5)} @ index ${l.index}`);
  });
}
