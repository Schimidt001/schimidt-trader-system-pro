/**
 * Script para executar a migração SQL manualmente
 * Uso: node run-migration.js
 */

import { drizzle } from "drizzle-orm/mysql2";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const DATABASE_URL = process.env.DATABASE_URL;
  
  if (!DATABASE_URL) {
    console.error("❌ DATABASE_URL não configurada");
    process.exit(1);
  }

  console.log("🔌 Conectando ao banco de dados...");
  const db = drizzle(DATABASE_URL);

  const migrationPath = path.join(
    __dirname,
    "drizzle",
    "migrations",
    "0002_add_trigger_offset_and_profit_threshold.sql"
  );

  console.log("📄 Lendo arquivo de migração:", migrationPath);
  const sql = fs.readFileSync(migrationPath, "utf-8");

  console.log("🔧 Executando migração SQL...");
  console.log(sql);

  try {
    // Executar cada statement SQL separadamente
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      console.log(`\n📝 Executando: ${statement}`);
      await db.execute(statement);
      console.log("✅ Sucesso!");
    }

    console.log("\n✅ Migração concluída com sucesso!");
  } catch (error) {
    console.error("❌ Erro ao executar migração:", error);
    process.exit(1);
  }

  process.exit(0);
}

runMigration();
