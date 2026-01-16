#!/usr/bin/env node
/**
 * Validador de Dados Históricos - Laboratório de Backtest
 * 
 * Valida a integridade dos arquivos de dados históricos JSON.
 * 
 * Uso: node validate-data.js <arquivo.json> [--show-gaps] [--fix]
 * 
 * @author Schimidt Trader Pro - Backtest Lab
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const TIMEFRAME_INTERVALS = {
  'M1': 60 * 1000,
  'M5': 5 * 60 * 1000,
  'M15': 15 * 60 * 1000,
  'M30': 30 * 60 * 1000,
  'H1': 60 * 60 * 1000,
  'H4': 4 * 60 * 60 * 1000,
  'D1': 24 * 60 * 60 * 1000,
};

// ============================================================================
// FUNÇÕES DE VALIDAÇÃO
// ============================================================================

/**
 * Detecta o timeframe baseado no nome do arquivo
 */
function detectTimeframe(filename) {
  const match = filename.match(/_([A-Z]\d+)\./);
  if (match) {
    return match[1];
  }
  return null;
}

/**
 * Valida os dados de um arquivo JSON
 */
function validateData(filePath, options = {}) {
  console.log(`\n📂 Validando: ${filePath}`);
  
  // Ler arquivo
  let candles;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    candles = JSON.parse(content);
  } catch (e) {
    return {
      isValid: false,
      errors: [`Erro ao ler arquivo: ${e.message}`],
      warnings: [],
      stats: null,
    };
  }
  
  if (!Array.isArray(candles)) {
    return {
      isValid: false,
      errors: ['Arquivo não contém um array de velas'],
      warnings: [],
      stats: null,
    };
  }
  
  const errors = [];
  const warnings = [];
  const gaps = [];
  
  // Detectar timeframe
  const timeframe = detectTimeframe(path.basename(filePath));
  const expectedInterval = timeframe ? TIMEFRAME_INTERVALS[timeframe] : null;
  
  console.log(`   Timeframe detectado: ${timeframe || 'desconhecido'}`);
  console.log(`   Total de velas: ${candles.length}`);
  
  if (candles.length === 0) {
    return {
      isValid: false,
      errors: ['Arquivo não contém velas'],
      warnings: [],
      stats: null,
    };
  }
  
  // Validar cada vela
  let prevTimestamp = null;
  let invalidOhlc = 0;
  let invalidTimestamps = 0;
  let outOfOrder = 0;
  
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    
    // Verificar campos obrigatórios
    if (typeof candle.timestamp !== 'number' || isNaN(candle.timestamp)) {
      invalidTimestamps++;
      continue;
    }
    
    // Verificar ordem dos timestamps
    if (prevTimestamp !== null && candle.timestamp <= prevTimestamp) {
      outOfOrder++;
    }
    
    // Verificar gaps
    if (prevTimestamp !== null && expectedInterval) {
      const gap = candle.timestamp - prevTimestamp;
      // Permitir gaps de até 3x o intervalo (fins de semana, feriados)
      if (gap > expectedInterval * 3) {
        gaps.push({
          from: new Date(prevTimestamp).toISOString(),
          to: new Date(candle.timestamp).toISOString(),
          duration: gap,
          expectedBars: Math.floor(gap / expectedInterval),
        });
      }
    }
    
    // Verificar OHLC válido
    if (typeof candle.open !== 'number' || typeof candle.high !== 'number' ||
        typeof candle.low !== 'number' || typeof candle.close !== 'number') {
      invalidOhlc++;
      continue;
    }
    
    if (candle.high < candle.low) {
      warnings.push(`Vela ${i}: high (${candle.high}) < low (${candle.low})`);
    }
    
    if (candle.open <= 0 || candle.close <= 0 || candle.high <= 0 || candle.low <= 0) {
      warnings.push(`Vela ${i}: preço zero ou negativo`);
    }
    
    prevTimestamp = candle.timestamp;
  }
  
  // Compilar erros
  if (invalidTimestamps > 0) {
    errors.push(`${invalidTimestamps} velas com timestamp inválido`);
  }
  
  if (outOfOrder > 0) {
    errors.push(`${outOfOrder} velas fora de ordem cronológica`);
  }
  
  if (invalidOhlc > 0) {
    errors.push(`${invalidOhlc} velas com valores OHLC inválidos`);
  }
  
  // Estatísticas
  const stats = {
    totalBars: candles.length,
    startDate: new Date(candles[0].timestamp).toISOString(),
    endDate: new Date(candles[candles.length - 1].timestamp).toISOString(),
    timeframe,
    gaps: gaps.length,
  };
  
  // Mostrar gaps se solicitado
  if (options.showGaps && gaps.length > 0) {
    console.log(`\n   📊 Gaps encontrados (${gaps.length}):`);
    gaps.slice(0, 10).forEach(gap => {
      console.log(`      ${gap.from} → ${gap.to} (~${gap.expectedBars} barras)`);
    });
    if (gaps.length > 10) {
      console.log(`      ... e mais ${gaps.length - 10} gaps`);
    }
  }
  
  // Resumo
  console.log(`\n   📈 Estatísticas:`);
  console.log(`      Período: ${stats.startDate.split('T')[0]} a ${stats.endDate.split('T')[0]}`);
  console.log(`      Velas: ${stats.totalBars}`);
  console.log(`      Gaps: ${gaps.length}`);
  
  const isValid = errors.length === 0;
  
  if (isValid) {
    console.log(`\n   ✅ Dados válidos`);
  } else {
    console.log(`\n   ❌ Dados inválidos:`);
    errors.forEach(e => console.log(`      - ${e}`));
  }
  
  if (warnings.length > 0) {
    console.log(`\n   ⚠️  Avisos (${warnings.length}):`);
    warnings.slice(0, 5).forEach(w => console.log(`      - ${w}`));
    if (warnings.length > 5) {
      console.log(`      ... e mais ${warnings.length - 5} avisos`);
    }
  }
  
  return {
    isValid,
    errors,
    warnings,
    stats,
    gaps,
  };
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Validador de Dados Históricos

Uso:
  node validate-data.js <arquivo.json> [opções]
  node validate-data.js <diretório> [opções]

Opções:
  --show-gaps     Mostra detalhes dos gaps encontrados
  --help, -h      Mostra esta ajuda

Exemplos:
  node validate-data.js data/candles/XAUUSD_M5.json
  node validate-data.js data/candles/ --show-gaps
`);
    process.exit(0);
  }
  
  const inputPath = args[0];
  const options = {
    showGaps: args.includes('--show-gaps'),
  };
  
  // Verificar se é arquivo ou diretório
  const stats = fs.statSync(inputPath);
  
  if (stats.isFile()) {
    const result = validateData(inputPath, options);
    process.exit(result.isValid ? 0 : 1);
  } else if (stats.isDirectory()) {
    const files = fs.readdirSync(inputPath).filter(f => f.endsWith('.json'));
    console.log(`\n📁 Validando ${files.length} arquivos...`);
    
    let valid = 0;
    let invalid = 0;
    
    for (const file of files) {
      const result = validateData(path.join(inputPath, file), options);
      if (result.isValid) {
        valid++;
      } else {
        invalid++;
      }
    }
    
    console.log(`\n📊 Resumo: ${valid} válidos, ${invalid} inválidos`);
    process.exit(invalid > 0 ? 1 : 0);
  } else {
    console.error('❌ Caminho inválido');
    process.exit(1);
  }
}

main();
