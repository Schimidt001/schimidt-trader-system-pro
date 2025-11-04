/**
 * Aplicação de Teste da IA Hedge Inteligente
 * 
 * Esta aplicação simula posições abertas no ativo R_75 e testa
 * a lógica da IA Hedge em tempo real conectando à API da DERIV.
 * 
 * Uso: tsx test_ia_hedge.ts <TOKEN_DERIV>
 */

import { DerivService, type DerivTick } from "./server/deriv/derivService";
import { analyzePositionForHedge, type HedgeDecision } from "./server/ai/hedgeStrategy";

// Configurações do teste
const SYMBOL = "R_75";
const CANDLE_DURATION = 900; // 15 minutos em segundos

// Estado da simulação
let currentCandleTimestamp = 0;
let currentCandleOpen = 0;
let currentCandleHigh = 0;
let currentCandleLow = 0;
let currentCandleClose = 0;
let candleStartTime: Date | null = null;

// Simulação de posição aberta
let simulatedPosition = {
  entryPrice: 0,
  predictedClose: 0,
  direction: 'up' as 'up' | 'down',
  stake: 100, // $1.00
  isActive: false
};

/**
 * Formata timestamp Unix para data legível
 */
function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Calcula minutos decorridos no candle
 */
function getElapsedMinutes(): number {
  if (!candleStartTime) return 0;
  const now = Date.now();
  const elapsed = (now - candleStartTime.getTime()) / 1000;
  return elapsed / 60;
}

/**
 * Simula uma posição aberta baseada no candle atual
 */
function simulatePosition() {
  // Simular entrada aos 8 minutos do candle (como o bot real faz)
  const elapsedMinutes = getElapsedMinutes();
  
  if (elapsedMinutes >= 8 && !simulatedPosition.isActive) {
    // Decidir direção baseado no movimento até agora
    const currentBody = currentCandleClose - currentCandleOpen;
    simulatedPosition.direction = currentBody > 0 ? 'up' : 'down';
    
    // Simular predição (fechamento previsto)
    // Para UP: prever que vai fechar acima do atual
    // Para DOWN: prever que vai fechar abaixo do atual
    const range = currentCandleHigh - currentCandleLow;
    if (simulatedPosition.direction === 'up') {
      simulatedPosition.predictedClose = currentCandleClose + (range * 0.3);
    } else {
      simulatedPosition.predictedClose = currentCandleClose - (range * 0.3);
    }
    
    simulatedPosition.entryPrice = currentCandleClose;
    simulatedPosition.isActive = true;
    
    console.log('\n' + '='.repeat(80));
    console.log('🎯 POSIÇÃO SIMULADA ABERTA');
    console.log('='.repeat(80));
    console.log(`Direção: ${simulatedPosition.direction.toUpperCase()}`);
    console.log(`Preço de Entrada: ${simulatedPosition.entryPrice.toFixed(2)}`);
    console.log(`Fechamento Previsto: ${simulatedPosition.predictedClose.toFixed(2)}`);
    console.log(`Stake: $${(simulatedPosition.stake / 100).toFixed(2)}`);
    console.log('='.repeat(80) + '\n');
  }
}

/**
 * Testa a IA Hedge com a posição atual
 */
function testHedgeAI() {
  if (!simulatedPosition.isActive) return;
  
  const elapsedMinutes = getElapsedMinutes();
  
  // Testar apenas na janela de análise (12-14 minutos)
  if (elapsedMinutes < 12 || elapsedMinutes > 14) return;
  
  // Preparar parâmetros para a IA
  const hedgeParams = {
    entryPrice: simulatedPosition.entryPrice,
    currentPrice: currentCandleClose,
    predictedClose: simulatedPosition.predictedClose,
    candleOpen: currentCandleOpen,
    direction: simulatedPosition.direction,
    elapsedMinutes: elapsedMinutes,
    originalStake: simulatedPosition.stake
  };
  
  // Chamar a IA Hedge
  const decision: HedgeDecision = analyzePositionForHedge(hedgeParams);
  
  // Exibir resultado
  console.log('\n' + '━'.repeat(80));
  console.log('🤖 ANÁLISE DA IA HEDGE');
  console.log('━'.repeat(80));
  console.log(`⏱️  Tempo Decorrido: ${elapsedMinutes.toFixed(2)} minutos`);
  console.log(`📊 Preço Atual: ${currentCandleClose.toFixed(2)}`);
  console.log(`📈 Progresso: ${(decision.progressRatio * 100).toFixed(1)}%`);
  console.log(`\n🎯 DECISÃO: ${decision.action}`);
  console.log(`💡 Razão: ${decision.reason}`);
  
  if (decision.shouldOpenSecondPosition) {
    console.log(`\n✅ SEGUNDA POSIÇÃO RECOMENDADA:`);
    console.log(`   Tipo: ${decision.secondPositionType}`);
    console.log(`   Stake: $${((decision.secondPositionStake || 0) / 100).toFixed(2)}`);
  } else {
    console.log(`\n⏸️  Nenhuma ação necessária - posição está boa`);
  }
  console.log('━'.repeat(80) + '\n');
}

/**
 * Processa cada tick recebido
 */
function handleTick(tick: DerivTick) {
  const candleTimestamp = Math.floor(tick.epoch / CANDLE_DURATION) * CANDLE_DURATION;
  
  // Novo candle?
  if (candleTimestamp !== currentCandleTimestamp) {
    if (currentCandleTimestamp > 0) {
      console.log(`\n📊 Candle fechado: ${formatTimestamp(currentCandleTimestamp)}`);
      console.log(`   Open: ${currentCandleOpen.toFixed(2)} | High: ${currentCandleHigh.toFixed(2)} | Low: ${currentCandleLow.toFixed(2)} | Close: ${currentCandleClose.toFixed(2)}`);
      
      // Resetar posição simulada
      simulatedPosition.isActive = false;
    }
    
    // Iniciar novo candle
    currentCandleTimestamp = candleTimestamp;
    currentCandleOpen = tick.quote;
    currentCandleHigh = tick.quote;
    currentCandleLow = tick.quote;
    currentCandleClose = tick.quote;
    candleStartTime = new Date(candleTimestamp * 1000);
    
    console.log(`\n🕐 Novo candle iniciado: ${formatTimestamp(candleTimestamp)}`);
    console.log(`   Abertura: ${currentCandleOpen.toFixed(2)}`);
  } else {
    // Atualizar candle atual
    currentCandleHigh = Math.max(currentCandleHigh, tick.quote);
    currentCandleLow = Math.min(currentCandleLow, tick.quote);
    currentCandleClose = tick.quote;
  }
  
  // Simular posição aos 8 minutos
  simulatePosition();
  
  // Testar IA Hedge entre 12-14 minutos
  testHedgeAI();
}

/**
 * Função principal
 */
async function main() {
  const token = process.argv[2];
  
  if (!token) {
    console.error('❌ Erro: Token da DERIV não fornecido');
    console.log('\nUso: tsx test_ia_hedge.ts <TOKEN_DERIV>');
    process.exit(1);
  }
  
  console.log('🚀 Iniciando Teste da IA Hedge Inteligente');
  console.log('━'.repeat(80));
  console.log(`📍 Ativo: ${SYMBOL}`);
  console.log(`⏱️  Timeframe: M15 (15 minutos)`);
  console.log(`🔬 Modo: Simulação de Posições`);
  console.log('━'.repeat(80));
  
  try {
    // Conectar à DERIV
    console.log('\n🔌 Conectando à API da DERIV...');
    const derivService = new DerivService(token, true); // true = DEMO
    await derivService.connect();
    console.log('✅ Conectado com sucesso!\n');
    
    // Subscrever aos ticks do R_75
    console.log(`📡 Monitorando ticks do ${SYMBOL}...\n`);
    derivService.subscribeTicks(SYMBOL, (tick) => {
      handleTick(tick);
    });
    
    // Manter o processo rodando
    console.log('⏳ Aguardando dados... (Pressione Ctrl+C para sair)\n');
    
  } catch (error) {
    console.error('❌ Erro ao conectar:', error);
    process.exit(1);
  }
}

// Executar
main().catch(console.error);
