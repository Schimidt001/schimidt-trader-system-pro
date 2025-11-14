/**
 * Script de teste de conexão com o banco de dados
 */

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { marketConditions } from "./drizzle/schema";
import { desc, eq } from "drizzle-orm";

const DATABASE_URL = "mysql://root:qsnVGqprIkPodnxuERpjaHteHVziMuJV@gondola.proxy.rlwy.net:25153/railway";

async function testConnection() {
  console.log("=".repeat(80));
  console.log("TESTE DE CONEXÃO E FUNCIONALIDADES DO BANCO DE DADOS");
  console.log("=".repeat(80));
  console.log();

  try {
    // Criar conexão
    console.log("📡 Conectando ao banco de dados...");
    const connection = await mysql.createConnection(DATABASE_URL);
    const db = drizzle(connection);
    console.log("✅ Conexão estabelecida com sucesso!\n");

    // Teste 1: Verificar se a tabela marketConditions existe
    console.log("📊 TESTE 1: Verificar estrutura da tabela marketConditions");
    console.log("-".repeat(80));
    const [tables] = await connection.query(
      "SHOW TABLES LIKE 'marketConditions'"
    );
    console.log(`Tabela encontrada: ${(tables as any[]).length > 0 ? "✅ SIM" : "❌ NÃO"}\n`);

    // Teste 2: Verificar campo marketConditionEnabled na config
    console.log("📊 TESTE 2: Verificar campo marketConditionEnabled");
    console.log("-".repeat(80));
    const [columns] = await connection.query(
      "SHOW COLUMNS FROM config LIKE 'marketConditionEnabled'"
    );
    console.log(`Campo encontrado: ${(columns as any[]).length > 0 ? "✅ SIM" : "❌ NÃO"}\n`);

    // Teste 3: Verificar configuração dos bots
    console.log("📊 TESTE 3: Verificar configuração dos bots");
    console.log("-".repeat(80));
    const [configs] = await connection.query(
      "SELECT userId, botId, symbol, timeframe, marketConditionEnabled FROM config WHERE userId = 1"
    );
    console.log("Configurações encontradas:");
    console.table(configs);

    // Teste 4: Verificar registros na tabela marketConditions
    console.log("📊 TESTE 4: Verificar registros de condições de mercado");
    console.log("-".repeat(80));
    const conditions = await db
      .select()
      .from(marketConditions)
      .where(eq(marketConditions.userId, 1))
      .orderBy(desc(marketConditions.computedAt))
      .limit(5);
    
    if (conditions.length > 0) {
      console.log(`✅ Encontrados ${conditions.length} registros:`);
      conditions.forEach((c, i) => {
        console.log(`\n${i + 1}. ${c.status} (Score: ${c.score}/10)`);
        console.log(`   Símbolo: ${c.symbol}`);
        console.log(`   Timestamp: ${new Date(c.computedAt).toISOString()}`);
        console.log(`   Motivos: ${c.reasons}`);
      });
    } else {
      console.log("⚠️  Nenhum registro encontrado ainda (normal se o bot não rodou)");
    }

    // Fechar conexão
    await connection.end();
    console.log("\n✅ Conexão fechada com sucesso");

    console.log("\n" + "=".repeat(80));
    console.log("TODOS OS TESTES CONCLUÍDOS COM SUCESSO");
    console.log("=".repeat(80));
  } catch (error) {
    console.error("❌ Erro durante os testes:", error);
    process.exit(1);
  }
}

testConnection();
