/**
 * Script de Teste: Validação da Configuração da IA Hedge
 * 
 * Verifica se a configuração otimizada está correta e segura
 */

import { DEFAULT_HEDGE_CONFIG } from './server/ai/hedgeStrategy';
import { validateHedgeConfig } from './server/ai/hedgeConfigSchema';

console.log('🧪 Iniciando testes de validação da configuração da IA Hedge...\n');

// ==========================================
// TESTE 1: Valores Padrão
// ==========================================
console.log('📋 TESTE 1: Verificando valores padrão');
console.log('----------------------------------------');
console.log('DEFAULT_HEDGE_CONFIG:', JSON.stringify(DEFAULT_HEDGE_CONFIG, null, 2));

const expectedValues = {
  enabled: true,
  reversalDetectionMinute: 12.0,
  reversalThreshold: 0.60,
  reversalStakeMultiplier: 1.5,
  pullbackDetectionStart: 12.0,
  pullbackDetectionEnd: 14.0,
  pullbackMinProgress: 0.15,
  pullbackMaxProgress: 0.40,
  pullbackStakeMultiplier: 1.4,
  edgeReversalMinute: 12.0,
  edgeExtensionThreshold: 0.80,
  edgeStakeMultiplier: 1.5,
  analysisStartMinute: 12.0,
  analysisEndMinute: 14.98,
};

let test1Pass = true;
for (const [key, expectedValue] of Object.entries(expectedValues)) {
  const actualValue = (DEFAULT_HEDGE_CONFIG as any)[key];
  if (actualValue !== expectedValue) {
    console.error(`❌ ERRO: ${key} = ${actualValue}, esperado ${expectedValue}`);
    test1Pass = false;
  } else {
    console.log(`✅ ${key}: ${actualValue}`);
  }
}

if (test1Pass) {
  console.log('\n✅ TESTE 1 PASSOU: Todos os valores padrão estão corretos\n');
} else {
  console.error('\n❌ TESTE 1 FALHOU: Alguns valores estão incorretos\n');
  process.exit(1);
}

// ==========================================
// TESTE 2: Validação Zod
// ==========================================
console.log('📋 TESTE 2: Validação Zod');
console.log('----------------------------------------');

try {
  const validated = validateHedgeConfig(DEFAULT_HEDGE_CONFIG);
  console.log('✅ Configuração passou na validação Zod');
  console.log('Configuração validada:', JSON.stringify(validated, null, 2));
  console.log('\n✅ TESTE 2 PASSOU: Validação Zod bem-sucedida\n');
} catch (error) {
  console.error('❌ TESTE 2 FALHOU: Erro na validação Zod:', error);
  process.exit(1);
}

// ==========================================
// TESTE 3: Timing Correto
// ==========================================
console.log('📋 TESTE 3: Verificando timing (últimos 3 minutos)');
console.log('----------------------------------------');

const CANDLE_DURATION = 15; // minutos
const LAST_3_MINUTES_START = 12.0;
const LAST_3_MINUTES_END = 14.98;

let test3Pass = true;

if (DEFAULT_HEDGE_CONFIG.analysisStartMinute !== LAST_3_MINUTES_START) {
  console.error(`❌ analysisStartMinute deveria ser ${LAST_3_MINUTES_START}, mas é ${DEFAULT_HEDGE_CONFIG.analysisStartMinute}`);
  test3Pass = false;
} else {
  console.log(`✅ analysisStartMinute: ${DEFAULT_HEDGE_CONFIG.analysisStartMinute} (início dos últimos 3 minutos)`);
}

if (DEFAULT_HEDGE_CONFIG.analysisEndMinute !== LAST_3_MINUTES_END) {
  console.error(`❌ analysisEndMinute deveria ser ${LAST_3_MINUTES_END}, mas é ${DEFAULT_HEDGE_CONFIG.analysisEndMinute}`);
  test3Pass = false;
} else {
  console.log(`✅ analysisEndMinute: ${DEFAULT_HEDGE_CONFIG.analysisEndMinute} (último momento do candle)`);
}

if (DEFAULT_HEDGE_CONFIG.reversalDetectionMinute < LAST_3_MINUTES_START) {
  console.error(`❌ reversalDetectionMinute (${DEFAULT_HEDGE_CONFIG.reversalDetectionMinute}) está antes dos últimos 3 minutos`);
  test3Pass = false;
} else {
  console.log(`✅ reversalDetectionMinute: ${DEFAULT_HEDGE_CONFIG.reversalDetectionMinute} (dentro dos últimos 3 minutos)`);
}

if (DEFAULT_HEDGE_CONFIG.pullbackDetectionStart < LAST_3_MINUTES_START) {
  console.error(`❌ pullbackDetectionStart (${DEFAULT_HEDGE_CONFIG.pullbackDetectionStart}) está antes dos últimos 3 minutos`);
  test3Pass = false;
} else {
  console.log(`✅ pullbackDetectionStart: ${DEFAULT_HEDGE_CONFIG.pullbackDetectionStart} (dentro dos últimos 3 minutos)`);
}

if (DEFAULT_HEDGE_CONFIG.edgeReversalMinute < LAST_3_MINUTES_START) {
  console.error(`❌ edgeReversalMinute (${DEFAULT_HEDGE_CONFIG.edgeReversalMinute}) está antes dos últimos 3 minutos`);
  test3Pass = false;
} else {
  console.log(`✅ edgeReversalMinute: ${DEFAULT_HEDGE_CONFIG.edgeReversalMinute} (dentro dos últimos 3 minutos)`);
}

if (test3Pass) {
  console.log('\n✅ TESTE 3 PASSOU: Timing está correto (últimos 3 minutos)\n');
} else {
  console.error('\n❌ TESTE 3 FALHOU: Timing incorreto\n');
  process.exit(1);
}

// ==========================================
// TESTE 4: Multiplicadores Otimizados
// ==========================================
console.log('📋 TESTE 4: Verificando multiplicadores otimizados');
console.log('----------------------------------------');

let test4Pass = true;

if (DEFAULT_HEDGE_CONFIG.reversalStakeMultiplier !== 1.5) {
  console.error(`❌ reversalStakeMultiplier deveria ser 1.5, mas é ${DEFAULT_HEDGE_CONFIG.reversalStakeMultiplier}`);
  test4Pass = false;
} else {
  console.log(`✅ reversalStakeMultiplier: ${DEFAULT_HEDGE_CONFIG.reversalStakeMultiplier}x (otimizado de 1.0x)`);
}

if (DEFAULT_HEDGE_CONFIG.pullbackStakeMultiplier !== 1.4) {
  console.error(`❌ pullbackStakeMultiplier deveria ser 1.4, mas é ${DEFAULT_HEDGE_CONFIG.pullbackStakeMultiplier}`);
  test4Pass = false;
} else {
  console.log(`✅ pullbackStakeMultiplier: ${DEFAULT_HEDGE_CONFIG.pullbackStakeMultiplier}x (otimizado de 0.5x)`);
}

if (DEFAULT_HEDGE_CONFIG.edgeStakeMultiplier !== 1.5) {
  console.error(`❌ edgeStakeMultiplier deveria ser 1.5, mas é ${DEFAULT_HEDGE_CONFIG.edgeStakeMultiplier}`);
  test4Pass = false;
} else {
  console.log(`✅ edgeStakeMultiplier: ${DEFAULT_HEDGE_CONFIG.edgeStakeMultiplier}x (otimizado de 0.75x)`);
}

if (test4Pass) {
  console.log('\n✅ TESTE 4 PASSOU: Multiplicadores estão otimizados\n');
} else {
  console.error('\n❌ TESTE 4 FALHOU: Multiplicadores incorretos\n');
  process.exit(1);
}

// ==========================================
// TESTE 5: Thresholds Seguros
// ==========================================
console.log('📋 TESTE 5: Verificando thresholds seguros (não extremos)');
console.log('----------------------------------------');

let test5Pass = true;

if (DEFAULT_HEDGE_CONFIG.reversalThreshold < 0.30 || DEFAULT_HEDGE_CONFIG.reversalThreshold > 0.95) {
  console.error(`❌ reversalThreshold (${DEFAULT_HEDGE_CONFIG.reversalThreshold}) está fora da faixa segura (0.30-0.95)`);
  test5Pass = false;
} else {
  console.log(`✅ reversalThreshold: ${DEFAULT_HEDGE_CONFIG.reversalThreshold} (dentro da faixa segura)`);
}

if (DEFAULT_HEDGE_CONFIG.pullbackMinProgress < 0.05 || DEFAULT_HEDGE_CONFIG.pullbackMinProgress > 0.50) {
  console.error(`❌ pullbackMinProgress (${DEFAULT_HEDGE_CONFIG.pullbackMinProgress}) está fora da faixa segura (0.05-0.50)`);
  test5Pass = false;
} else {
  console.log(`✅ pullbackMinProgress: ${DEFAULT_HEDGE_CONFIG.pullbackMinProgress} (dentro da faixa segura)`);
}

if (DEFAULT_HEDGE_CONFIG.pullbackMaxProgress < 0.20 || DEFAULT_HEDGE_CONFIG.pullbackMaxProgress > 0.80) {
  console.error(`❌ pullbackMaxProgress (${DEFAULT_HEDGE_CONFIG.pullbackMaxProgress}) está fora da faixa segura (0.20-0.80)`);
  test5Pass = false;
} else {
  console.log(`✅ pullbackMaxProgress: ${DEFAULT_HEDGE_CONFIG.pullbackMaxProgress} (dentro da faixa segura)`);
}

if (DEFAULT_HEDGE_CONFIG.edgeExtensionThreshold < 0.60 || DEFAULT_HEDGE_CONFIG.edgeExtensionThreshold > 0.95) {
  console.error(`❌ edgeExtensionThreshold (${DEFAULT_HEDGE_CONFIG.edgeExtensionThreshold}) está fora da faixa segura (0.60-0.95)`);
  test5Pass = false;
} else {
  console.log(`✅ edgeExtensionThreshold: ${DEFAULT_HEDGE_CONFIG.edgeExtensionThreshold} (dentro da faixa segura)`);
}

if (test5Pass) {
  console.log('\n✅ TESTE 5 PASSOU: Thresholds estão seguros\n');
} else {
  console.error('\n❌ TESTE 5 FALHOU: Thresholds fora da faixa segura\n');
  process.exit(1);
}

// ==========================================
// RESUMO FINAL
// ==========================================
console.log('========================================');
console.log('🎉 TODOS OS TESTES PASSARAM!');
console.log('========================================');
console.log('✅ Valores padrão corretos');
console.log('✅ Validação Zod bem-sucedida');
console.log('✅ Timing correto (últimos 3 minutos: 12.0-14.98)');
console.log('✅ Multiplicadores otimizados (1.5x, 1.4x, 1.5x)');
console.log('✅ Thresholds seguros (0.60, 0.15-0.40, 0.80)');
console.log('\n🚀 Configuração da IA Hedge está pronta e segura para uso!\n');

process.exit(0);
