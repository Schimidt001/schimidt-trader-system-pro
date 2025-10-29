/**
 * Script standalone para aplicar migrações do banco de dados
 * Uso: node migrate.js
 */
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL não configurada!");
    process.exit(1);
  }

  try {
    console.log("🔄 Conectando ao banco de dados...");
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    const db = drizzle(connection);

    console.log("🔄 Aplicando migrações...");
    await migrate(db, { migrationsFolder: join(__dirname, "drizzle") });

    console.log("✅ Migrações aplicadas com sucesso!");
    
    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Erro ao aplicar migrações:", error);
    process.exit(1);
  }
}

main();
