/**
 * Script para inspecionar a tabela de configuração
 * Objetivo: Listar todas as configurações existentes para encontrar userId e botId válidos
 */

import 'dotenv/config';
import { getDb } from "./server/db";
import { config } from "./drizzle/schema";

async function inspectConfig() {
  console.log("Inspeccionando a tabela 'config'...");
  const db = await getDb();

  if (!db) {
    console.error("❌ Falha ao conectar ao banco de dados.");
    process.exit(1);
  }

  try {
    const allConfigs = await db.select().from(config);

    if (allConfigs.length === 0) {
      console.log("🟡 A tabela 'config' está vazia. Não há configurações de bot salvas.");
    } else {
      console.log(`✅ Encontradas ${allConfigs.length} configurações:`);
      console.table(allConfigs.map(c => ({
        userId: c.userId,
        botId: c.botId,
        symbol: c.symbol,
        mode: c.mode,
        timeframe: c.timeframe,
        updatedAt: c.updatedAt,
      })));
    }
  } catch (error) {
    console.error("❌ Erro ao consultar a tabela 'config':", error);
  }

  process.exit(0);
}

inspectConfig();

