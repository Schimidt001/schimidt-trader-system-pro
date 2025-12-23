/**
 * Endpoint especial para executar migração SQL
 * Acesse via: GET /api/migrate
 */

import type { Express } from "express";
import { getDb } from "./db";

export function setupMigrationEndpoint(app: Express) {
  app.get("/api/migrate", async (req, res) => {
    try {
      console.log("[Migration] Iniciando migração...");
      
      const db = await getDb();
      if (!db) {
        return res.status(500).json({
          success: false,
          error: "Database not available",
        });
      }
      
      // Verificar se as colunas já existem
      const checkSql = `
        SELECT COUNT(*) as count 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'config' 
        AND COLUMN_NAME IN ('triggerOffset', 'profitThreshold')
      `;
      
      const result: any = await db.execute(checkSql);
      const count = result[0]?.count || 0;
      
      if (count >= 2) {
        console.log("[Migration] Colunas já existem!");
        return res.json({
          success: true,
          message: "Migração já foi executada anteriormente",
          alreadyMigrated: true,
        });
      }
      
      console.log("[Migration] Adicionando colunas triggerOffset e profitThreshold...");
      
      // Executar migração
      await db.execute(`
        ALTER TABLE config 
        ADD COLUMN IF NOT EXISTS triggerOffset INT NOT NULL DEFAULT 16 
        COMMENT 'Distância do gatilho em relação à predição (pips)'
      `);
      
      await db.execute(`
        ALTER TABLE config 
        ADD COLUMN IF NOT EXISTS profitThreshold INT NOT NULL DEFAULT 90 
        COMMENT 'Percentual do payout para early close (1-100%)'
      `);
      
      console.log("[Migration] Migração concluída com sucesso!");
      
      return res.json({
        success: true,
        message: "Migração executada com sucesso!",
        columnsAdded: ["triggerOffset", "profitThreshold"],
      });
      
    } catch (error: any) {
      console.error("[Migration] Erro:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });
}
