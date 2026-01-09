import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { applyMigrations } from "../applyMigrations";

// REMOVIDO: engineManager (Prediction Engine) - Sistema SMC Puro não usa ML/AI
// REMOVIDO: newsScheduler - Sistema SMC Puro não usa análise de notícias

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Aplicar migrações do banco de dados primeiro
  await applyMigrations();

  // REMOVIDO: Inicialização do Prediction Engine (ML/AI)
  // O sistema SMC Puro opera apenas com Price Action Estrutural
  console.log("🎯 Sistema SMC Puro inicializado (sem ML/AI)");

  // REMOVIDO: Inicialização do News Scheduler
  // O sistema SMC Puro não depende de análise de notícias
  console.log("📊 Modo Price Action puro ativo");

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  
  // Endpoint especial de migração
  app.get("/api/migrate", async (req, res) => {
    try {
      const { getDb } = await import("../db");
      const db = await getDb();
      
      if (!db) {
        return res.status(500).json({ success: false, error: "Database not available" });
      }
      
      console.log("[Migration] Verificando colunas...");
      
      // Função auxiliar para verificar se coluna existe
      const checkColumn = async (columnName: string): Promise<boolean> => {
        try {
          const result: any = await db.execute(`
            SELECT COUNT(*) as count 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'config' 
            AND COLUMN_NAME = '${columnName}'
          `);
          return result[0]?.count > 0;
        } catch (e) {
          console.error(`[Migration] Erro ao verificar coluna ${columnName}:`, e);
          return false;
        }
      };
      
      // Tentar adicionar as colunas (verifica se já existem primeiro)
      const triggerOffsetExists = await checkColumn('triggerOffset');
      if (!triggerOffsetExists) {
        try {
          await db.execute(`
            ALTER TABLE config 
            ADD COLUMN triggerOffset INT DEFAULT 16
          `);
          console.log("[Migration] Coluna triggerOffset adicionada");
        } catch (e: any) {
          console.error("[Migration] Erro ao adicionar triggerOffset:", e.message);
        }
      } else {
        console.log("[Migration] Coluna triggerOffset já existe");
      }
      
      const profitThresholdExists = await checkColumn('profitThreshold');
      if (!profitThresholdExists) {
        try {
          await db.execute(`
            ALTER TABLE config 
            ADD COLUMN profitThreshold INT DEFAULT 90
          `);
          console.log("[Migration] Coluna profitThreshold adicionada");
        } catch (e: any) {
          console.error("[Migration] Erro ao adicionar profitThreshold:", e.message);
        }
      } else {
        console.log("[Migration] Coluna profitThreshold já existe");
      }
      
      const waitTimeExists = await checkColumn('waitTime');
      if (!waitTimeExists) {
        try {
          await db.execute(`
            ALTER TABLE config 
            ADD COLUMN waitTime INT DEFAULT 8
          `);
          console.log("[Migration] Coluna waitTime adicionada");
        } catch (e: any) {
          console.error("[Migration] Erro ao adicionar waitTime:", e.message);
        }
      } else {
        console.log("[Migration] Coluna waitTime já existe");
      }
      
      res.json({ success: true, message: "Migração executada com sucesso!" });
    } catch (error: any) {
      console.error("[Migration] Erro:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // Endpoint de teste de trade forçado (APENAS DEMO)
  app.get("/api/force-test-trade", async (req, res) => {
    try {
      console.log("[ForceTestTrade] Iniciando trade de teste forçado...");
      
      // Importar o adapter
      const { ctraderAdapter } = await import("../adapters/CTraderAdapter");
      
      // Verificar se está conectado
      if (!ctraderAdapter.isConnected()) {
        return res.status(400).json({ 
          success: false, 
          error: "Não conectado ao IC Markets. Conecte primeiro na interface." 
        });
      }
      
      // Obter info da conta
      const accountInfo = ctraderAdapter.getAccountInfo();
      if (!accountInfo) {
        return res.status(400).json({ 
          success: false, 
          error: "Informações da conta não disponíveis" 
        });
      }
      
      // Verificar se é conta demo
      if (accountInfo.accountType !== "demo") {
        return res.status(403).json({ 
          success: false, 
          error: "Este endpoint só funciona em conta DEMO por segurança" 
        });
      }
      
      const symbol = (req.query.symbol as string) || "USDJPY";
      const direction = (req.query.direction as string) || "BUY";
      const lots = parseFloat((req.query.lots as string) || "0.01");
      
      console.log(`[ForceTestTrade] Executando ${direction} ${lots} lotes de ${symbol}`);
      
      // Executar a ordem
      const result = await ctraderAdapter.placeOrder({
        symbol,
        type: "MARKET",
        side: direction.toUpperCase() as "BUY" | "SELL",
        volume: lots,
        stopLoss: 20, // 20 pips de SL
        takeProfit: 40, // 40 pips de TP
      });
      
      console.log("[ForceTestTrade] Resultado:", result);
      
      res.json({ 
        success: true, 
        message: `Trade de teste executado com sucesso!`,
        result 
      });
    } catch (error: any) {
      console.error("[ForceTestTrade] Erro:", error);
      res.status(500).json({ 
        success: false, 
        error: error.message || "Erro ao executar trade de teste" 
      });
    }
  });
  
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log("🚀 Sistema SMC Puro pronto para operar!");
  });

  // Tratar sinais de encerramento
  process.on("SIGINT", async () => {
    console.log("\n🛑 Encerrando sistema...");
    // REMOVIDO: engineManager.stop() - não existe mais
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\n🛑 Encerrando sistema...");
    // REMOVIDO: engineManager.stop() - não existe mais
    process.exit(0);
  });
}

startServer().catch(console.error);
