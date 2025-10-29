/**
 * Script para aplicar migrações do banco de dados automaticamente
 * Usado no Railway para garantir que o schema está atualizado
 */
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";

function getDatabaseUrl(): string | null {
  // Tentar usar DATABASE_URL primeiro
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Construir URL a partir de variáveis individuais do Railway
  const host = process.env.MYSQLHOST;
  const port = process.env.MYSQLPORT || "3306";
  const user = process.env.MYSQLUSER || "root";
  const password = process.env.MYSQLPASSWORD;
  const database = process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || "railway";

  if (host && password) {
    return `mysql://${user}:${password}@${host}:${port}/${database}`;
  }

  return null;
}

export async function applyMigrations() {
  // Debug: mostrar quais variáveis estão disponíveis
  console.log("[Migrations] Verificando variáveis de ambiente:");
  console.log("  DATABASE_URL:", process.env.DATABASE_URL ? "[SET]" : "[NOT SET]");
  console.log("  MYSQLHOST:", process.env.MYSQLHOST ? "[SET]" : "[NOT SET]");
  console.log("  MYSQLPASSWORD:", process.env.MYSQLPASSWORD ? "[SET]" : "[NOT SET]");
  
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    console.log("[Migrations] Credenciais do banco não configuradas, pulando migrações");
    return;
  }

  try {
    console.log("[Migrations] 🔄 Aplicando migrações do banco de dados...");
    
    // Criar conexão
    const connection = await mysql.createConnection(databaseUrl);
    const db = drizzle(connection);

    // Aplicar migrações
    const migrationsFolder = "./drizzle";
    
    await migrate(db, { migrationsFolder });

    console.log("[Migrations] ✅ Migrações aplicadas com sucesso!");
    
    await connection.end();
  } catch (error) {
    console.error("[Migrations] ❌ Erro ao aplicar migrações:", error);
    // Não lançar erro para não impedir o servidor de iniciar
    console.warn("[Migrations] ⚠️ Continuando sem migrações...");
  }
}
