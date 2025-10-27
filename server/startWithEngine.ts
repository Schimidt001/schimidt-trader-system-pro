/**
 * Script de inicialização do servidor com engine de predição integrada
 * Inicia automaticamente a engine Python antes do servidor Node.js
 */

import { engineManager } from "./prediction/engineManager";

async function startServer() {
  console.log("=".repeat(70));
  console.log("  🤖 SCHIMIDT TRADER SYSTEM PRO");
  console.log("  Sistema de Trading Automatizado 24/7");
  console.log("=".repeat(70));
  console.log("");

  try {
    // 1. Iniciar engine de predição proprietária
    console.log("📊 Iniciando engine de predição proprietária...");
    await engineManager.start();
    console.log("✅ Engine de predição iniciada");
    console.log("");

    // 2. Aguardar 2 segundos para garantir que engine está pronta
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 3. Verificar saúde da engine
    const engineUrl = "http://localhost:7070/health";
    try {
      const response = await fetch(engineUrl);
      if (response.ok) {
        const health = await response.json();
        console.log(`✅ Engine health check OK:`, health);
      } else {
        console.warn("⚠️ Engine health check falhou, mas continuando...");
      }
    } catch (error) {
      console.warn("⚠️ Não foi possível verificar engine, mas continuando...");
    }

    console.log("");
    console.log("🚀 Sistema pronto para operar!");
    console.log("📊 Algoritmo: Fibonacci da Amplitude (84.85% assertividade)");
    console.log("🔗 Engine interna: http://localhost:7070");
    console.log("");
    console.log("=".repeat(70));

    // O servidor Express já está rodando via _core
    // Este script apenas garante que a engine está iniciada

  } catch (error) {
    console.error("❌ Erro ao iniciar sistema:", error);
    process.exit(1);
  }
}

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

// Iniciar
startServer();

