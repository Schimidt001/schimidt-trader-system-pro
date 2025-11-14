/**
 * Market Condition Detector v2.0 - News Scheduler
 * 
 * Scheduler para executar a coleta de notícias automaticamente
 * Executa a cada 6 horas: 00:00, 06:00, 12:00, 18:00 UTC
 */

import { newsCollectorService } from "./newsCollectorService";

export class NewsScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  
  /**
   * Inicia o scheduler
   */
  public start(): void {
    if (this.isRunning) {
      console.log("[NewsScheduler] Scheduler já está rodando");
      return;
    }
    
    console.log("[NewsScheduler] Iniciando scheduler de coleta de notícias...");
    
    // Executar imediatamente na inicialização
    this.executeCollection();
    
    // Executar a cada 6 horas (21600000 ms)
    this.intervalId = setInterval(() => {
      this.executeCollection();
    }, 6 * 60 * 60 * 1000);
    
    this.isRunning = true;
    console.log("[NewsScheduler] ✅ Scheduler iniciado (executa a cada 6 horas)");
  }
  
  /**
   * Para o scheduler
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.isRunning = false;
    console.log("[NewsScheduler] Scheduler parado");
  }
  
  /**
   * Executa a coleta de notícias
   */
  private async executeCollection(): Promise<void> {
    try {
      const now = new Date();
      console.log(`[NewsScheduler] Executando coleta de notícias às ${now.toISOString()}`);
      
      await newsCollectorService.collectNews();
      
      console.log("[NewsScheduler] Coleta concluída com sucesso");
    } catch (error) {
      console.error("[NewsScheduler] Erro durante coleta:", error);
    }
  }
  
  /**
   * Verifica se o scheduler está rodando
   */
  public isActive(): boolean {
    return this.isRunning;
  }
}

// Singleton instance
export const newsScheduler = new NewsScheduler();
