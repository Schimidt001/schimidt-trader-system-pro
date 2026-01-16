/**
 * Script para aplicar migrações do banco de dados automaticamente
 * Usado no Railway para garantir que o schema está atualizado
 * 
 * ATUALIZADO: Melhor tratamento de erros e logging reduzido
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
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    console.log("[Migrations] Credenciais do banco não configuradas, pulando migrações");
    return;
  }

  let connection: mysql.Connection | null = null;

  try {
    console.log("[Migrations] 🔄 Aplicando migrações do banco de dados...");
    
    // Criar conexão
    connection = await mysql.createConnection(databaseUrl);
    const db = drizzle(connection);

    // Aplicar migrações
    const migrationsFolder = "./drizzle";
    
    await migrate(db, { migrationsFolder });

    console.log("[Migrations] ✅ Migrações aplicadas com sucesso!");
    
  } catch (error) {
    const err = error as Error & { code?: string; errno?: number };
    
    // Tratar erros específicos de migração
    if (err.code === "ER_TABLE_EXISTS_ERROR" || err.errno === 1050) {
      // Tabela já existe - migração já foi aplicada manualmente
      console.log("[Migrations] ℹ️ Tabelas já existem, migrações sincronizadas manualmente");
      return;
    }
    
    if (err.code === "ER_DUP_ENTRY" || err.errno === 1062) {
      // Entrada duplicada na tabela de migrações
      console.log("[Migrations] ℹ️ Migração já registrada, continuando...");
      return;
    }
    
    if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
      // Erro de conexão
      console.error("[Migrations] ❌ Não foi possível conectar ao banco de dados");
      console.warn("[Migrations] ⚠️ Continuando sem migrações...");
      return;
    }
    
    // Outros erros
    console.error("[Migrations] ❌ Erro ao aplicar migrações:", err.message);
    console.warn("[Migrations] ⚠️ Continuando sem migrações...");
    
  } finally {
    // Garantir que a conexão é fechada
    if (connection) {
      try {
        await connection.end();
      } catch {
        // Ignorar erros ao fechar conexão
      }
    }
  }
}
