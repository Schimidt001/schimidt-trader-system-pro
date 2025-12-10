/**
 * Script para extrair dados de teste do banco de dados
 * Objetivo: Obter dados reais para teste comparativo de predição
 */

import 'dotenv/config';
import { getConfigByUserId, getCandleHistory } from "./server/db";
import * as fs from "fs";

interface TestData {
  symbol: string;
  tf: string;
  history: Array<{
    abertura: number;
    minima: number;
    maxima: number;
    fechamento: number;
    timestamp: number;
  }>;
  partial_current: {
    abertura: number;
    minima_parcial: number;
    maxima_parcial: number;
  };
  metadata: {
    userId: number;
    botId: number;
    extractedAt: string;
    totalCandles: number;
  };
}

async function extractTestData(
  userId: number = 1,
  botId: number = 1,
  symbol: string = "R_100",
  lookback: number = 50
): Promise<TestData | null> {
  try {
    console.log("=" .repeat(80));
    console.log("EXTRAINDO DADOS DE TESTE DO BANCO DE DADOS");
    console.log("=" .repeat(80));
    console.log(`UserId: ${userId}`);
    console.log(`BotId: ${botId}`);
    console.log(`Symbol: ${symbol}`);
    console.log(`Lookback: ${lookback}`);
    console.log("");

    // Buscar configuração do bot
    const botConfig = await getConfigByUserId(userId, botId);

    if (!botConfig) {
      console.error("❌ Configuração não encontrada para o usuário e botId especificados");
      return null;
    }

    const cfg = botConfig;
    const timeframe = cfg.timeframe || 900;
    const timeframeLabel = timeframe === 900 ? "M15" : timeframe === 1800 ? "M30" : "M60";

    console.log(`Timeframe: ${timeframeLabel} (${timeframe}s)`);
    console.log("");

    // Buscar histórico de candles
    const candleHistory = await getCandleHistory(symbol, lookback + 1, timeframeLabel, botId);

    if (!candleHistory || candleHistory.length === 0) {
      console.error("❌ Nenhum candle encontrado no banco de dados para os critérios especificados");
      return null;
    }

    console.log(`✅ ${candleHistory.length} candles encontrados`);
    console.log("");

    // Separar candle parcial (mais recente) do histórico
    const [partialCandle, ...historicalCandles] = candleHistory;

    // Reverter ordem do histórico (mais antigo primeiro)
    const history = historicalCandles.reverse().map((c) => ({
      abertura: parseFloat(c.open),
      minima: parseFloat(c.low),
      maxima: parseFloat(c.high),
      fechamento: parseFloat(c.close),
      timestamp: c.timestampUtc,
    }));

    // Montar candle parcial
    const partial_current = {
      abertura: parseFloat(partialCandle.open),
      minima_parcial: parseFloat(partialCandle.low),
      maxima_parcial: parseFloat(partialCandle.high),
    };

    // Montar objeto de teste
    const testData: TestData = {
      symbol,
      tf: timeframeLabel,
      history,
      partial_current,
      metadata: {
        userId,
        botId,
        extractedAt: new Date().toISOString(),
        totalCandles: history.length,
      },
    };

    // Exibir resumo
    console.log("📊 RESUMO DOS DADOS EXTRAÍDOS:");
    console.log(`  - Símbolo: ${testData.symbol}`);
    console.log(`  - Timeframe: ${testData.tf}`);
    console.log(`  - Total de candles históricos: ${testData.history.length}`);
    console.log(`  - Candle parcial:`);
    console.log(`      Abertura: ${testData.partial_current.abertura}`);
    console.log(`      Máxima: ${testData.partial_current.maxima_parcial}`);
    console.log(`      Mínima: ${testData.partial_current.minima_parcial}`);
    console.log("");

    // Salvar em arquivo JSON
    const outputPath = "/tmp/test_data_prediction.json";
    fs.writeFileSync(outputPath, JSON.stringify(testData, null, 2));
    console.log(`✅ Dados salvos em: ${outputPath}`);
    console.log("");

    return testData;
  } catch (error) {
    console.error("❌ Erro ao extrair dados:", error);
    return null;
  }
}

// Executar extração
async function main() {
  // Você pode ajustar estes parâmetros conforme necessário
  const userId = parseInt(process.env.USER_ID || "1");
  const botId = parseInt(process.env.BOT_ID || "1");
  const symbol = process.env.SYMBOL || "R_100";
  const lookback = parseInt(process.env.LOOKBACK || "50");

  const data = await extractTestData(userId, botId, symbol, lookback);

  if (data) {
    console.log("\n✅ Use o arquivo gerado para executar o teste comparativo:");
    console.log("   - JSON: /tmp/test_data_prediction.json");
    console.log("\nPara popular o script de teste, copie o conteúdo de /tmp/test_data_prediction.json para a função carregar_dados_teste() em test_prediction_comparison.py");
  } else {
    console.error("\n❌ Falha ao extrair dados de teste");
    process.exit(1);
  }

  process.exit(0);
}

main();
