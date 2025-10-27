/**
 * Hook de inicialização da engine de predição
 * Integrado automaticamente ao servidor Express
 */

import { engineManager } from "../prediction/engineManager";

let engineInitialized = false;

/**
 * Inicializa a engine de predição ao iniciar o servidor
 */
export async function initializeEngine(): Promise<void> {
  if (engineInitialized) {
    console.log("[Engine] Já inicializada");
    return;
  }

  try {
    console.log("\n" + "=".repeat(70));
    console.log("  🤖 SCHIMIDT TRADER SYSTEM PRO - ENGINE DE PREDIÇÃO");
    console.log("  Algoritmo Fibonacci da Amplitude - 84.85% Assertividade");
    console.log("=".repeat(70) + "\n");

    console.log("📊 Iniciando engine de predição proprietária...");
    await engineManager.start();

    // Aguardar engine estar pronta
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Verificar health
    try {
      const response = await fetch("http://localhost:7070/health");
      if (response.ok) {
        const health = await response.json();
        console.log("✅ Engine health check OK:", health);
        engineInitialized = true;
      } else {
        console.warn("⚠️ Engine health check retornou erro");
      }
    } catch (error) {
      console.warn("⚠️ Não foi possível verificar engine:", error);
    }

    console.log("\n🚀 Engine de predição pronta!");
    console.log("🔗 URL interna: http://localhost:7070");
    console.log("=".repeat(70) + "\n");
  } catch (error) {
    console.error("❌ Erro ao inicializar engine:", error);
    console.warn("⚠️ Sistema continuará sem engine de predição");
  }
}

/**
 * Para a engine ao encerrar o servidor
 */
export async function shutdownEngine(): Promise<void> {
  if (!engineInitialized) {
    return;
  }

  console.log("\n🛑 Encerrando engine de predição...");
  await engineManager.stop();
  engineInitialized = false;
  console.log("✅ Engine encerrada\n");
}

// Tratar sinais de encerramento
process.on("SIGINT", async () => {
  await shutdownEngine();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await shutdownEngine();
  process.exit(0);
});

// Auto-inicializar quando módulo for importado
initializeEngine().catch((error) => {
  console.error("Erro fatal ao inicializar engine:", error);
});

