/**
 * Teste de validação do módulo Filtro de Horário
 * 
 * @module filtro-horario/test
 * @version 1.0.0
 * @author Manus AI
 * @date 2025-11-05
 */

import { HourlyFilter, HourlyFilterUtils } from './hourlyFilterLogic';
import type { HourlyFilterConfig } from './types';

/**
 * Testes básicos do filtro de horário
 */
function runTests() {
  console.log('🧪 Iniciando testes do Filtro de Horário...\n');

  let passedTests = 0;
  let failedTests = 0;

  // Teste 1: Criar instância com configuração padrão
  try {
    const filter = new HourlyFilter();
    console.log('✅ Teste 1: Instância criada com configuração padrão');
    console.log('   Config:', filter.getConfig());
    passedTests++;
  } catch (error) {
    console.error('❌ Teste 1 falhou:', error);
    failedTests++;
  }

  // Teste 2: Criar instância com configuração personalizada
  try {
    const filter = new HourlyFilter({
      enabled: true,
      mode: 'IDEAL',
      customHours: [16, 18],
      goldModeHours: [16],
      goldModeStakeMultiplier: 200,
    });
    console.log('\n✅ Teste 2: Instância criada com configuração personalizada');
    console.log('   Modo:', filter.getConfig().mode);
    console.log('   Horários:', filter.getConfig().customHours);
    passedTests++;
  } catch (error) {
    console.error('❌ Teste 2 falhou:', error);
    failedTests++;
  }

  // Teste 3: Verificar horário permitido (simulado)
  try {
    const filter = new HourlyFilter({
      enabled: true,
      mode: 'IDEAL',
      customHours: [16, 18],
      goldModeHours: [],
      goldModeStakeMultiplier: 100,
    });

    // Simular horário 16h UTC
    const mockDate = new Date('2025-11-05T16:00:00Z');
    const isAllowed = filter.isAllowedHour(mockDate);

    if (isAllowed) {
      console.log('\n✅ Teste 3: Horário 16h UTC está permitido');
      passedTests++;
    } else {
      console.error('❌ Teste 3 falhou: Horário 16h deveria estar permitido');
      failedTests++;
    }
  } catch (error) {
    console.error('❌ Teste 3 falhou:', error);
    failedTests++;
  }

  // Teste 4: Verificar horário não permitido (simulado)
  try {
    const filter = new HourlyFilter({
      enabled: true,
      mode: 'IDEAL',
      customHours: [16, 18],
      goldModeHours: [],
      goldModeStakeMultiplier: 100,
    });

    // Simular horário 15h UTC (não permitido)
    const mockDate = new Date('2025-11-05T15:00:00Z');
    const isAllowed = filter.isAllowedHour(mockDate);

    if (!isAllowed) {
      console.log('\n✅ Teste 4: Horário 15h UTC não está permitido (correto)');
      passedTests++;
    } else {
      console.error('❌ Teste 4 falhou: Horário 15h NÃO deveria estar permitido');
      failedTests++;
    }
  } catch (error) {
    console.error('❌ Teste 4 falhou:', error);
    failedTests++;
  }

  // Teste 5: Ajustar stake em horário normal
  try {
    const filter = new HourlyFilter({
      enabled: true,
      mode: 'COMBINED',
      customHours: [16, 18],
      goldModeHours: [],
      goldModeStakeMultiplier: 100,
    });

    // Simular horário 16h UTC (normal, não GOLD)
    const mockDate = new Date('2025-11-05T16:00:00Z');
    const adjustedStake = filter.getAdjustedStake(1000, mockDate);

    if (adjustedStake === 1000) {
      console.log('\n✅ Teste 5: Stake não alterado em horário normal (1000 → 1000)');
      passedTests++;
    } else {
      console.error(`❌ Teste 5 falhou: Stake deveria ser 1000, mas é ${adjustedStake}`);
      failedTests++;
    }
  } catch (error) {
    console.error('❌ Teste 5 falhou:', error);
    failedTests++;
  }

  // Teste 6: Ajustar stake em horário GOLD
  try {
    const filter = new HourlyFilter({
      enabled: true,
      mode: 'COMBINED',
      customHours: [16, 18],
      goldModeHours: [16],
      goldModeStakeMultiplier: 200, // 2x
    });

    // Simular horário 16h UTC (GOLD)
    const mockDate = new Date('2025-11-05T16:00:00Z');
    const adjustedStake = filter.getAdjustedStake(1000, mockDate);

    if (adjustedStake === 2000) {
      console.log('\n✅ Teste 6: Stake multiplicado em horário GOLD (1000 → 2000)');
      passedTests++;
    } else {
      console.error(`❌ Teste 6 falhou: Stake deveria ser 2000, mas é ${adjustedStake}`);
      failedTests++;
    }
  } catch (error) {
    console.error('❌ Teste 6 falhou:', error);
    failedTests++;
  }

  // Teste 7: Obter próximo horário permitido
  try {
    const filter = new HourlyFilter({
      enabled: true,
      mode: 'IDEAL',
      customHours: [16, 18],
      goldModeHours: [],
      goldModeStakeMultiplier: 100,
    });

    // Simular horário 15h UTC
    const mockDate = new Date('2025-11-05T15:00:00Z');
    const nextHour = filter.getNextAllowedHour(mockDate);

    if (nextHour === 16) {
      console.log('\n✅ Teste 7: Próximo horário calculado corretamente (15h → 16h)');
      passedTests++;
    } else {
      console.error(`❌ Teste 7 falhou: Próximo horário deveria ser 16, mas é ${nextHour}`);
      failedTests++;
    }
  } catch (error) {
    console.error('❌ Teste 7 falhou:', error);
    failedTests++;
  }

  // Teste 8: Obter informações de horário
  try {
    const filter = new HourlyFilter({
      enabled: true,
      mode: 'COMBINED',
      customHours: [16, 18],
      goldModeHours: [16],
      goldModeStakeMultiplier: 200,
    });

    // Simular horário 16h UTC (GOLD)
    const mockDate = new Date('2025-11-05T16:00:00Z');
    const info = filter.getHourlyInfo(mockDate);

    if (info.currentHour === 16 && info.isAllowed && info.isGold) {
      console.log('\n✅ Teste 8: Informações de horário corretas');
      console.log('   Hora:', info.currentHour);
      console.log('   Permitido:', info.isAllowed);
      console.log('   GOLD:', info.isGold);
      passedTests++;
    } else {
      console.error('❌ Teste 8 falhou: Informações incorretas');
      console.error('   Info:', info);
      failedTests++;
    }
  } catch (error) {
    console.error('❌ Teste 8 falhou:', error);
    failedTests++;
  }

  // Teste 9: Serialização JSON
  try {
    const filter = new HourlyFilter({
      enabled: true,
      mode: 'IDEAL',
      customHours: [16, 18],
      goldModeHours: [16],
      goldModeStakeMultiplier: 200,
    });

    const json = filter.toJSON();
    const loadedFilter = HourlyFilter.fromJSON(json);

    const originalConfig = filter.getConfig();
    const loadedConfig = loadedFilter.getConfig();

    if (JSON.stringify(originalConfig) === JSON.stringify(loadedConfig)) {
      console.log('\n✅ Teste 9: Serialização/desserialização JSON funciona');
      passedTests++;
    } else {
      console.error('❌ Teste 9 falhou: Configurações não coincidem após serialização');
      failedTests++;
    }
  } catch (error) {
    console.error('❌ Teste 9 falhou:', error);
    failedTests++;
  }

  // Teste 10: Validação de configuração inválida
  try {
    // Tentar criar com horário inválido (deve lançar erro)
    try {
      const filter = new HourlyFilter({
        enabled: true,
        mode: 'CUSTOM',
        customHours: [25], // Inválido (> 23)
        goldModeHours: [],
        goldModeStakeMultiplier: 100,
      });
      console.error('❌ Teste 10 falhou: Deveria lançar erro para horário inválido');
      failedTests++;
    } catch (error) {
      console.log('\n✅ Teste 10: Validação de horário inválido funciona');
      console.log('   Erro esperado:', (error as Error).message);
      passedTests++;
    }
  } catch (error) {
    console.error('❌ Teste 10 falhou:', error);
    failedTests++;
  }

  // Teste 11: Obter horários para modo
  try {
    const idealHours = HourlyFilterUtils.getHoursForMode('IDEAL');
    const combinedHours = HourlyFilterUtils.getHoursForMode('COMBINED');

    if (idealHours.length === 2 && combinedHours.length === 10) {
      console.log('\n✅ Teste 11: Presets de horários corretos');
      console.log('   IDEAL:', idealHours);
      console.log('   COMBINED:', combinedHours);
      passedTests++;
    } else {
      console.error('❌ Teste 11 falhou: Presets incorretos');
      failedTests++;
    }
  } catch (error) {
    console.error('❌ Teste 11 falhou:', error);
    failedTests++;
  }

  // Teste 12: Formatar horários
  try {
    const formatted = HourlyFilterUtils.formatHours([16, 18, 20]);
    
    if (formatted === '16h, 18h, 20h') {
      console.log('\n✅ Teste 12: Formatação de horários funciona');
      console.log('   Resultado:', formatted);
      passedTests++;
    } else {
      console.error(`❌ Teste 12 falhou: Esperado "16h, 18h, 20h", obtido "${formatted}"`);
      failedTests++;
    }
  } catch (error) {
    console.error('❌ Teste 12 falhou:', error);
    failedTests++;
  }

  // Resumo
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 RESUMO DOS TESTES:\n`);
  console.log(`   ✅ Passou: ${passedTests}`);
  console.log(`   ❌ Falhou: ${failedTests}`);
  console.log(`   📈 Total: ${passedTests + failedTests}`);
  console.log(`   🎯 Taxa de sucesso: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);
  console.log('\n' + '='.repeat(60));

  if (failedTests === 0) {
    console.log('\n🎉 TODOS OS TESTES PASSARAM! Módulo validado com sucesso.\n');
    return 0;
  } else {
    console.log('\n⚠️  ALGUNS TESTES FALHARAM. Revise o código.\n');
    return 1;
  }
}

// Executar testes
const exitCode = runTests();
process.exit(exitCode);
