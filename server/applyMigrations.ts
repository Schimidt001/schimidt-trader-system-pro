/**
 * Script para aplicar migrações do banco de dados automaticamente
 * Usado no Railway para garantir que o schema está atualizado
 */
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";

export async function applyMigrations() {
  if (!process.env.DATABASE_URL) {
    console.log("[Migrations] DATABASE_URL não configurada, pulando migrações");
    return;
  }

  try {
    console.log("[Migrations] 🔄 Aplicando migrações do banco de dados...");
    
    // Criar conexão
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    const db = drizzle(connection);

    // Aplicar migrações
    await migrate(db, { migrationsFolder: "./drizzle" });

    console.log("[Migrations] ✅ Migrações aplicadas com sucesso!");
    
    await connection.end();
  } catch (error) {
    console.error("[Migrations] ❌ Erro ao aplicar migrações:", error);
    // Não lançar erro para não impedir o servidor de iniciar
    console.warn("[Migrations] ⚠️ Continuando sem migrações...");
  }
}
