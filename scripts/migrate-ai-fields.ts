import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

async function migrateAIFields() {
  console.log("🔄 Iniciando migration dos campos da IA...");

  try {
    const db = await getDb();
    
    if (!db) {
      console.error("❌ Banco de dados não disponível!");
      process.exit(1);
    }

    // Verificar se os campos já existem
    const checkQuery = sql`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'config' 
      AND COLUMN_NAME = 'aiEnabled'
    `;

    const result = await db.execute(checkQuery);

    if (result.rows && result.rows.length > 0) {
      console.log("✅ Campos da IA já existem no banco de dados!");
      process.exit(0);
    }

    console.log("📝 Adicionando campos da IA na tabela config...");

    // Adicionar os campos
    await db.execute(sql`
      ALTER TABLE config 
      ADD COLUMN aiEnabled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN stakeHighConfidence INT NOT NULL DEFAULT 400,
      ADD COLUMN stakeNormalConfidence INT NOT NULL DEFAULT 100,
      ADD COLUMN aiFilterThreshold INT NOT NULL DEFAULT 60,
      ADD COLUMN aiHedgeEnabled BOOLEAN NOT NULL DEFAULT TRUE
    `);

    console.log("✅ Campos da IA adicionados com sucesso!");

    // Verificar se foram criados
    const verifyQuery = sql`
      SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'config' 
      AND COLUMN_NAME IN ('aiEnabled', 'stakeHighConfidence', 'stakeNormalConfidence', 'aiFilterThreshold', 'aiHedgeEnabled')
    `;

    const verification = await db.execute(verifyQuery);
    console.log("📋 Campos criados:", verification.rows);

    process.exit(0);
  } catch (error: any) {
    // Se o erro for "Duplicate column name", significa que os campos já existem
    if (error.message && error.message.includes("Duplicate column name")) {
      console.log("✅ Campos da IA já existem no banco de dados!");
      process.exit(0);
    }

    console.error("❌ Erro ao executar migration:", error);
    process.exit(1);
  }
}

migrateAIFields();
