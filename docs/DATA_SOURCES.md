# Fontes de Dados Históricos - Laboratório de Backtest

Este documento descreve as fontes de dados suportadas pelo laboratório de backtest e como configurá-las.

## Visão Geral

O laboratório de backtest suporta múltiplas fontes de dados históricos:

| Fonte | Status | Descrição |
| :--- | :--- | :--- |
| **CSV Manual** | ✅ Recomendado | Arquivos CSV locais - maior controle e confiabilidade |
| Dukascopy | ⚠️ Parcial | Download automático via API - requer parser binário |
| FXCM | ⚠️ Parcial | Requer API Key e conta ativa |

## Fonte Recomendada: Arquivos CSV

Para garantir **determinismo** e **reprodutibilidade** dos backtests, recomendamos usar arquivos CSV como fonte oficial de dados históricos.

### Formato do Arquivo CSV

Os arquivos CSV devem seguir o formato abaixo:

```csv
timestamp,open,high,low,close,volume
1704067200000,2062.50,2063.80,2061.20,2062.95,1250
1704067500000,2062.95,2064.10,2062.50,2063.75,1180
...
```

**Campos obrigatórios:**

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `timestamp` | number | Unix timestamp em milissegundos |
| `open` | number | Preço de abertura |
| `high` | number | Preço máximo |
| `low` | number | Preço mínimo |
| `close` | number | Preço de fechamento |
| `volume` | number | Volume negociado (pode ser 0 para forex) |

### Nomenclatura dos Arquivos

Os arquivos devem ser nomeados seguindo o padrão:

```
{SYMBOL}_{TIMEFRAME}.json
```

**Exemplos:**
- `XAUUSD_M5.json` - Ouro, 5 minutos
- `EURUSD_H1.json` - Euro/Dólar, 1 hora
- `BTCUSD_M15.json` - Bitcoin, 15 minutos

### Localização dos Arquivos

Os arquivos devem ser colocados no diretório:

```
/data/candles/
```

### Timeframes Suportados

| Código | Descrição | Intervalo |
| :--- | :--- | :--- |
| `M1` | 1 minuto | 60.000 ms |
| `M5` | 5 minutos | 300.000 ms |
| `M15` | 15 minutos | 900.000 ms |
| `M30` | 30 minutos | 1.800.000 ms |
| `H1` | 1 hora | 3.600.000 ms |
| `H4` | 4 horas | 14.400.000 ms |
| `D1` | 1 dia | 86.400.000 ms |

## Importação de Dados CSV

### Via Interface

1. Acesse o Laboratório de Backtest
2. Clique em "Importar Dados"
3. Selecione o arquivo CSV
4. Confirme o símbolo e timeframe
5. Clique em "Importar"

### Via Linha de Comando

```bash
# Copiar arquivo CSV para o diretório de dados
cp /caminho/para/XAUUSD_M5.csv /data/candles/XAUUSD_M5.json

# Converter CSV para JSON (se necessário)
node scripts/convert-csv-to-json.js /caminho/para/arquivo.csv
```

### Script de Conversão CSV → JSON

```javascript
// scripts/convert-csv-to-json.js
const fs = require('fs');
const path = require('path');

function convertCsvToJson(csvPath) {
  const csv = fs.readFileSync(csvPath, 'utf-8');
  const lines = csv.trim().split('\\n');
  const headers = lines[0].split(',');
  
  const candles = lines.slice(1).map(line => {
    const values = line.split(',');
    return {
      timestamp: parseInt(values[0]),
      open: parseFloat(values[1]),
      high: parseFloat(values[2]),
      low: parseFloat(values[3]),
      close: parseFloat(values[4]),
      volume: parseFloat(values[5]) || 0,
    };
  });
  
  const outputPath = csvPath.replace('.csv', '.json');
  fs.writeFileSync(outputPath, JSON.stringify(candles, null, 2));
  console.log(`Convertido: ${outputPath} (${candles.length} velas)`);
}

const inputFile = process.argv[2];
if (!inputFile) {
  console.error('Uso: node convert-csv-to-json.js <arquivo.csv>');
  process.exit(1);
}

convertCsvToJson(inputFile);
```

## Fontes de Dados Gratuitas

### Dukascopy (via dukascopy-node)

O Dukascopy oferece dados históricos gratuitos, mas em formato binário `.bi5`. Para usar:

```bash
# Instalar biblioteca
npm install dukascopy-node

# Baixar dados
npx dukascopy-node -i XAUUSD -from 2024-01-01 -to 2024-12-31 -t m5 -f json
```

**Limitações:**
- Dados podem ter gaps em fins de semana e feriados
- Formato binário requer conversão
- Rate limiting pode afetar downloads grandes

### TradingView (Export Manual)

1. Abra o gráfico no TradingView
2. Clique em "Export Chart Data"
3. Selecione o período desejado
4. Baixe o CSV
5. Converta para o formato esperado

### MetaTrader 5 (Export Manual)

1. Abra o terminal MT5
2. Vá em "Ferramentas" → "Centro de Histórico"
3. Selecione o símbolo e timeframe
4. Clique em "Exportar"
5. Salve como CSV

## Validação de Dados

Antes de usar os dados em backtests, valide a integridade:

```bash
# Verificar arquivo de dados
node scripts/validate-data.js /data/candles/XAUUSD_M5.json
```

O script verifica:
- Timestamps em ordem crescente
- Sem gaps maiores que o esperado
- Valores OHLC válidos (high >= low, preços > 0)
- Formato JSON válido

## Boas Práticas

1. **Versionamento**: Mantenha versões dos arquivos de dados com data de download
2. **Backup**: Faça backup dos dados antes de qualquer modificação
3. **Documentação**: Registre a fonte e data de cada arquivo
4. **Validação**: Sempre valide os dados antes de usar em backtests
5. **Consistência**: Use a mesma fonte de dados para comparar estratégias

## Troubleshooting

### Erro: "Dados históricos não encontrados"

Verifique se o arquivo existe no diretório correto:

```bash
ls -la /data/candles/XAUUSD_M5.json
```

### Erro: "Formato de dados inválido"

Verifique se o arquivo está no formato JSON correto:

```bash
head -5 /data/candles/XAUUSD_M5.json
```

### Erro: "Gaps nos dados"

Alguns gaps são esperados (fins de semana, feriados). Para verificar:

```bash
node scripts/validate-data.js /data/candles/XAUUSD_M5.json --show-gaps
```
