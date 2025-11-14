/**
 * Script de teste para coleta de notícias
 * 
 * Executa a coleta diretamente e mostra os resultados
 * 
 * Uso: npx tsx server/scripts/testNewsCollection.ts
 */

import { newsCollectorService } from "../market-condition-v2/newsCollectorService";
import { getUpcomingMarketEvents, getRecentMarketEvents } from "../db";

async function testCollection() {
  console.log("=".repeat(60));
  console.log("TESTE DE COLETA DE NOTÍCIAS");
  console.log("=".repeat(60));
  
  try {
    console.log("\n🔴 Iniciando coleta de notícias...\n");
    
    await newsCollectorService.collectNews();
    
    console.log("\n✅ Coleta concluída!\n");
    
    // Verificar eventos salvos
    console.log("📊 Verificando eventos salvos no banco...\n");
    
    const upcomingEvents = await getUpcomingMarketEvents(["USD", "JPY"], 24);
    const recentEvents = await getRecentMarketEvents(["USD", "JPY"], 12);
    
    console.log(`📅 Eventos futuros (próximas 24h): ${upcomingEvents.length}`);
    if (upcomingEvents.length > 0) {
      console.log("\nPrimeiros 5 eventos futuros:");
      upcomingEvents.slice(0, 5).forEach(event => {
        const date = new Date(event.timestamp * 1000).toISOString();
        console.log(`  - [${event.impact}] ${date} | ${event.currency} | ${event.title} | ${event.source}`);
      });
    }
    
    console.log(`\n📈 Eventos recentes (últimas 12h): ${recentEvents.length}`);
    if (recentEvents.length > 0) {
      console.log("\nPrimeiros 5 eventos recentes:");
      recentEvents.slice(0, 5).forEach(event => {
        const date = new Date(event.timestamp * 1000).toISOString();
        console.log(`  - [${event.impact}] ${date} | ${event.currency} | ${event.title} | ${event.source}`);
      });
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("TESTE CONCLUÍDO COM SUCESSO");
    console.log("=".repeat(60));
    
    process.exit(0);
    
  } catch (error) {
    console.error("\n❌ Erro durante teste:", error);
    process.exit(1);
  }
}

// Executar
testCollection();
