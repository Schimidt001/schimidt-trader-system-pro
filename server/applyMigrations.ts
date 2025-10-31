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

    // Aplicar migration dos campos da IA (se ainda não existirem)
    try {
      console.log("[Migrations] 🔄 Verificando campos da IA...");
      
      // Verificar se os campos já existem
      const [rows] = await connection.query(
        `SELECT COLUMN_NAME 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'config' 
         AND COLUMN_NAME = 'aiEnabled'`
      );

      if (Array.isArray(rows) && rows.length > 0) {
        console.log("[Migrations] ✅ Campos da IA já existem!");
      } else {
        console.log("[Migrations] 📝 Adicionando campos da IA...");
        
        await connection.query(
          `ALTER TABLE config 
           ADD COLUMN aiEnabled BOOLEAN NOT NULL DEFAULT FALSE,
           ADD COLUMN stakeHighConfidence INT NOT NULL DEFAULT 400,
           ADD COLUMN stakeNormalConfidence INT NOT NULL DEFAULT 100,
           ADD COLUMN aiFilterThreshold INT NOT NULL DEFAULT 60,
           ADD COLUMN aiHedgeEnabled BOOLEAN NOT NULL DEFAULT TRUE`
        );
        
        console.log("[Migrations] ✅ Campos da IA adicionados com sucesso!");
      }
    } catch (error: any) {
      // Se o erro for "Duplicate column name", significa que os campos já existem
      if (error.message && error.message.includes("Duplicate column name")) {
        console.log("[Migrations] ✅ Campos da IA já existem!");
      } else {
        console.warn("[Migrations] ⚠️ Erro ao adicionar campos da IA:", error.message);
      }
    }
    
    await connection.end();
  } catch (error) {
    console.error("[Migrations] ❌ Erro ao aplicar migrações:", error);
    // Não lançar erro para não impedir o servidor de iniciar
    console.warn("[Migrations] ⚠️ Continuando sem migrações...");
  }
}
