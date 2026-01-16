#!/usr/bin/env node
/**
 * Conversor de CSV para JSON - Dados Históricos de Candles
 * 
 * Converte arquivos CSV de dados históricos para o formato JSON
 * esperado pelo laboratório de backtest.
 * 
 * Uso: node convert-csv-to-json.js <arquivo.csv> [--output <diretorio>]
 * 
 * @author Schimidt Trader Pro - Backtest Lab
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), 'data', 'candles');

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

/**
 * Parseia uma linha CSV
 */
function parseCsvLine(line) {
  const values = line.split(',').map(v => v.trim());
  return values;
}

/**
 * Detecta o formato do timestamp
 */
function parseTimestamp(value) {
  // Já é um número (Unix timestamp)
  if (!isNaN(value)) {
    const num = parseInt(value);
    // Se for menor que 10 bilhões, provavelmente está em segundos
    if (num < 10000000000) {
      return num * 1000;
    }
    return num;
  }
  
  // Formato ISO ou similar
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return date.getTime();
  }
  
  throw new Error(`Formato de timestamp não reconhecido: ${value}`);
}

/**
 * Converte arquivo CSV para JSON
 */
function convertCsvToJson(csvPath, outputDir) {
  console.log(`\n📂 Processando: ${csvPath}`);
  
  // Ler arquivo
  const csv = fs.readFileSync(csvPath, 'utf-8');
  const lines = csv.trim().split('\n');
  
  if (lines.length < 2) {
    throw new Error('Arquivo CSV vazio ou sem dados');
  }
  
  // Parsear cabeçalho
  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
  console.log(`   Headers: ${headers.join(', ')}`);
  
  // Mapear índices das colunas
  const timestampIdx = headers.findIndex(h => 
    h.includes('timestamp') || h.includes('time') || h.includes('date')
  );
  const openIdx = headers.findIndex(h => h.includes('open'));
  const highIdx = headers.findIndex(h => h.includes('high'));
  const lowIdx = headers.findIndex(h => h.includes('low'));
  const closeIdx = headers.findIndex(h => h.includes('close'));
  const volumeIdx = headers.findIndex(h => h.includes('volume') || h.includes('vol'));
  
  if (timestampIdx === -1 || openIdx === -1 || highIdx === -1 || lowIdx === -1 || closeIdx === -1) {
    throw new Error('Colunas obrigatórias não encontradas (timestamp, open, high, low, close)');
  }
  
  // Parsear dados
  const candles = [];
  let errors = 0;
  
  for (let i = 1; i < lines.length; i++) {
    try {
      const values = parseCsvLine(lines[i]);
      
      if (values.length < 5) continue;
      
      const candle = {
        timestamp: parseTimestamp(values[timestampIdx]),
        open: parseFloat(values[openIdx]),
        high: parseFloat(values[highIdx]),
        low: parseFloat(values[lowIdx]),
        close: parseFloat(values[closeIdx]),
        volume: volumeIdx !== -1 ? parseFloat(values[volumeIdx]) || 0 : 0,
      };
      
      // Validar valores
      if (isNaN(candle.timestamp) || isNaN(candle.open) || isNaN(candle.high) || 
          isNaN(candle.low) || isNaN(candle.close)) {
        errors++;
        continue;
      }
      
      candles.push(candle);
    } catch (e) {
      errors++;
    }
  }
  
  console.log(`   Velas parseadas: ${candles.length}`);
  if (errors > 0) {
    console.log(`   ⚠️  Linhas com erro: ${errors}`);
  }
  
  // Ordenar por timestamp
  candles.sort((a, b) => a.timestamp - b.timestamp);
  
  // Gerar nome do arquivo de saída
  const baseName = path.basename(csvPath, '.csv');
  const outputPath = path.join(outputDir, `${baseName}.json`);
  
  // Criar diretório se não existir
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Salvar JSON
  fs.writeFileSync(outputPath, JSON.stringify(candles, null, 2));
  console.log(`   ✅ Salvo: ${outputPath}`);
  
  // Estatísticas
  if (candles.length > 0) {
    const startDate = new Date(candles[0].timestamp);
    const endDate = new Date(candles[candles.length - 1].timestamp);
    console.log(`   📅 Período: ${startDate.toISOString().split('T')[0]} a ${endDate.toISOString().split('T')[0]}`);
  }
  
  return {
    success: true,
    outputPath,
    candleCount: candles.length,
    errors,
  };
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Conversor de CSV para JSON - Dados Históricos

Uso:
  node convert-csv-to-json.js <arquivo.csv> [--output <diretorio>]
  node convert-csv-to-json.js <diretorio_csv> [--output <diretorio>]

Opções:
  --output, -o    Diretório de saída (padrão: data/candles)
  --help, -h      Mostra esta ajuda

Exemplos:
  node convert-csv-to-json.js XAUUSD_M5.csv
  node convert-csv-to-json.js ./dados/ --output ./data/candles/
`);
    process.exit(0);
  }
  
  // Parsear argumentos
  let inputPath = args[0];
  let outputDir = DEFAULT_OUTPUT_DIR;
  
  const outputIdx = args.findIndex(a => a === '--output' || a === '-o');
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    outputDir = args[outputIdx + 1];
  }
  
  // Verificar se é arquivo ou diretório
  const stats = fs.statSync(inputPath);
  
  if (stats.isFile()) {
    // Processar arquivo único
    const result = convertCsvToJson(inputPath, outputDir);
    console.log(`\n✅ Conversão concluída: ${result.candleCount} velas`);
  } else if (stats.isDirectory()) {
    // Processar todos os CSVs no diretório
    const files = fs.readdirSync(inputPath).filter(f => f.endsWith('.csv'));
    console.log(`\n📁 Processando ${files.length} arquivos CSV...`);
    
    let totalCandles = 0;
    let totalErrors = 0;
    
    for (const file of files) {
      try {
        const result = convertCsvToJson(path.join(inputPath, file), outputDir);
        totalCandles += result.candleCount;
        totalErrors += result.errors;
      } catch (e) {
        console.error(`   ❌ Erro em ${file}: ${e.message}`);
      }
    }
    
    console.log(`\n✅ Conversão concluída: ${totalCandles} velas em ${files.length} arquivos`);
    if (totalErrors > 0) {
      console.log(`⚠️  Total de linhas com erro: ${totalErrors}`);
    }
  } else {
    console.error('❌ Caminho inválido');
    process.exit(1);
  }
}

main();
