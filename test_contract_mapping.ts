/**
 * Script de Teste para Validar Mapeamento de Direção → Contract Type
 * 
 * Este script testa se o mapeamento está correto conforme a documentação Deriv:
 * - UP (alta prevista) → CALL/CALLE (RISE na Deriv)
 * - DOWN (queda prevista) → PUT/PUTE (FALL na Deriv)
 */

import { mapDirectionToContractType, validateMapping, generateAuditLog } from './server/deriv/contractMapper';

console.log('='.repeat(80));
console.log('TESTE DE VALIDAÇÃO: Mapeamento Direção → Contract Type');
console.log('='.repeat(80));
console.log();

// Teste 1: UP sem allowEquals
console.log('📊 TESTE 1: Predição UP sem Allow Equals');
const test1 = mapDirectionToContractType('up', false);
console.log(`  Direção: UP`);
console.log(`  Contract Type: ${test1.contract_type}`);
console.log(`  Semântica: ${test1.semantic}`);
console.log(`  Descrição: ${test1.description}`);
console.log(`  Resultado: ${test1.contract_type === 'CALL' && test1.semantic === 'RISE' ? '✅ CORRETO' : '❌ INCORRETO'}`);
console.log();

// Teste 2: UP com allowEquals
console.log('📊 TESTE 2: Predição UP com Allow Equals');
const test2 = mapDirectionToContractType('up', true);
console.log(`  Direção: UP`);
console.log(`  Contract Type: ${test2.contract_type}`);
console.log(`  Semântica: ${test2.semantic}`);
console.log(`  Descrição: ${test2.description}`);
console.log(`  Resultado: ${test2.contract_type === 'CALLE' && test2.semantic === 'RISE' ? '✅ CORRETO' : '❌ INCORRETO'}`);
console.log();

// Teste 3: DOWN sem allowEquals
console.log('📊 TESTE 3: Predição DOWN sem Allow Equals');
const test3 = mapDirectionToContractType('down', false);
console.log(`  Direção: DOWN`);
console.log(`  Contract Type: ${test3.contract_type}`);
console.log(`  Semântica: ${test3.semantic}`);
console.log(`  Descrição: ${test3.description}`);
console.log(`  Resultado: ${test3.contract_type === 'PUT' && test3.semantic === 'FALL' ? '✅ CORRETO' : '❌ INCORRETO'}`);
console.log();

// Teste 4: DOWN com allowEquals
console.log('📊 TESTE 4: Predição DOWN com Allow Equals');
const test4 = mapDirectionToContractType('down', true);
console.log(`  Direção: DOWN`);
console.log(`  Contract Type: ${test4.contract_type}`);
console.log(`  Semântica: ${test4.semantic}`);
console.log(`  Descrição: ${test4.description}`);
console.log(`  Resultado: ${test4.contract_type === 'PUTE' && test4.semantic === 'FALL' ? '✅ CORRETO' : '❌ INCORRETO'}`);
console.log();

// Teste 5: Validação de mapeamento correto
console.log('📊 TESTE 5: Validação de Mapeamento Correto');
const isValid1 = validateMapping('up', 'CALL', false);
const isValid2 = validateMapping('up', 'CALLE', true);
const isValid3 = validateMapping('down', 'PUT', false);
const isValid4 = validateMapping('down', 'PUTE', true);
console.log(`  UP + CALL (sem equals): ${isValid1 ? '✅ VÁLIDO' : '❌ INVÁLIDO'}`);
console.log(`  UP + CALLE (com equals): ${isValid2 ? '✅ VÁLIDO' : '❌ INVÁLIDO'}`);
console.log(`  DOWN + PUT (sem equals): ${isValid3 ? '✅ VÁLIDO' : '❌ INVÁLIDO'}`);
console.log(`  DOWN + PUTE (com equals): ${isValid4 ? '✅ VÁLIDO' : '❌ INVÁLIDO'}`);
console.log();

// Teste 6: Validação de mapeamento INCORRETO (deve detectar erro)
console.log('📊 TESTE 6: Validação de Mapeamento INCORRETO (deve detectar)');
const isInvalid1 = validateMapping('up', 'PUT', false); // UP não deve ser PUT
const isInvalid2 = validateMapping('down', 'CALL', false); // DOWN não deve ser CALL
console.log(`  UP + PUT (ERRADO): ${!isInvalid1 ? '✅ DETECTOU ERRO' : '❌ NÃO DETECTOU'}`);
console.log(`  DOWN + CALL (ERRADO): ${!isInvalid2 ? '✅ DETECTOU ERRO' : '❌ NÃO DETECTOU'}`);
console.log();

// Teste 7: Logs de auditoria
console.log('📊 TESTE 7: Geração de Logs de Auditoria');
console.log(generateAuditLog('up', 'CALL', false));
console.log(generateAuditLog('down', 'PUTE', true));
console.log();

// Resumo
console.log('='.repeat(80));
console.log('RESUMO DOS TESTES');
console.log('='.repeat(80));

const allTestsPassed = 
  test1.contract_type === 'CALL' && test1.semantic === 'RISE' &&
  test2.contract_type === 'CALLE' && test2.semantic === 'RISE' &&
  test3.contract_type === 'PUT' && test3.semantic === 'FALL' &&
  test4.contract_type === 'PUTE' && test4.semantic === 'FALL' &&
  isValid1 && isValid2 && isValid3 && isValid4 &&
  !isInvalid1 && !isInvalid2;

if (allTestsPassed) {
  console.log('✅ TODOS OS TESTES PASSARAM!');
  console.log('✅ O mapeamento está correto conforme documentação Deriv');
  console.log('✅ UP → CALL/CALLE (RISE)');
  console.log('✅ DOWN → PUT/PUTE (FALL)');
} else {
  console.log('❌ ALGUNS TESTES FALHARAM!');
  console.log('❌ Verifique o mapeamento no contractMapper.ts');
}

console.log('='.repeat(80));
