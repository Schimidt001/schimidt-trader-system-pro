import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { engineManager } from "../prediction/engineManager";
import { applyMigrations } from "../applyMigrations";

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

  // Iniciar engine de predição Python
  console.log("🤖 Iniciando engine de predição proprietária...");
  try {
    await engineManager.start();
    console.log("✅ Engine de predição iniciada com sucesso");
  } catch (error) {
    console.warn("⚠️ Engine de predição não iniciou, mas continuando...", error);
  }

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
      
      // Tentar adicionar as colunas (ignora se já existem)
      try {
        await db.execute(`
          ALTER TABLE config 
          ADD COLUMN triggerOffset INT NOT NULL DEFAULT 16
        `);
        console.log("[Migration] Coluna triggerOffset adicionada");
      } catch (e: any) {
        if (e.message?.includes("Duplicate column")) {
          console.log("[Migration] Coluna triggerOffset já existe");
        } else {
          throw e;
        }
      }
      
      try {
        await db.execute(`
          ALTER TABLE config 
          ADD COLUMN profitThreshold INT NOT NULL DEFAULT 90
        `);
        console.log("[Migration] Coluna profitThreshold adicionada");
      } catch (e: any) {
        if (e.message?.includes("Duplicate column")) {
          console.log("[Migration] Coluna profitThreshold já existe");
        } else {
          throw e;
        }
      }
      
      try {
        await db.execute(`
          ALTER TABLE config 
          ADD COLUMN waitTime INT NOT NULL DEFAULT 8
        `);
        console.log("[Migration] Coluna waitTime adicionada");
      } catch (e: any) {
        if (e.message?.includes("Duplicate column")) {
          console.log("[Migration] Coluna waitTime já existe");
        } else {
          throw e;
        }
      }
      
      res.json({ success: true, message: "Migração executada com sucesso!" });
    } catch (error: any) {
      console.error("[Migration] Erro:", error);
      res.status(500).json({ success: false, error: error.message });
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
    console.log("🚀 Sistema pronto para operar!");
  });

  // Tratar sinais de encerramento
  process.on("SIGINT", async () => {
    console.log("\n🛑 Encerrando sistema...");
    await engineManager.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\n🛑 Encerrando sistema...");
    await engineManager.stop();
    process.exit(0);
  });
}

startServer().catch(console.error);
