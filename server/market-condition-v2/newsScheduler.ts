/**
 * Market Condition Detector v2.0 - News Scheduler
 * 
 * Scheduler para executar a coleta de notícias automaticamente
 * Executa nos horários fixos: 09:00, 15:00, 21:00 (horário do servidor)
 */

import { newsCollectorService } from "./newsCollectorService";

export class NewsScheduler {
  private checkIntervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastExecutionDate: string = "";
  private executedHours: Set<number> = new Set();
  
  // Horários de execução (em horas)
  private readonly EXECUTION_HOURS = [9, 15, 21];
  
  /**
   * Inicia o scheduler
   */
  public start(): void {
    if (this.isRunning) {
      console.log("[NewsScheduler] Scheduler já está rodando");
      return;
    }
    
    console.log("[NewsScheduler] Iniciando scheduler de coleta de notícias...");
    console.log(`[NewsScheduler] Horários configurados: ${this.EXECUTION_HOURS.join(':00, ')}:00`);
    
    // Executar imediatamente na inicialização
    this.executeCollection();
    
    // Verificar a cada minuto se está na hora de executar
    this.checkIntervalId = setInterval(() => {
      this.checkAndExecute();
    }, 60 * 1000); // Verificar a cada 1 minuto
    
    this.isRunning = true;
    console.log("[NewsScheduler] ✅ Scheduler iniciado (executa às 09:00, 15:00 e 21:00)");
  }
  
  /**
   * Para o scheduler
   */
  public stop(): void {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
    
    this.isRunning = false;
    console.log("[NewsScheduler] Scheduler parado");
  }
  
  /**
   * Verifica se está na hora de executar e executa se necessário
   */
  private checkAndExecute(): void {
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentHour = now.getHours();
    
    // Resetar o controle de execução se mudou de dia
    if (currentDate !== this.lastExecutionDate) {
      this.lastExecutionDate = currentDate;
      this.executedHours.clear();
      console.log(`[NewsScheduler] Novo dia detectado: ${currentDate}`);
    }
    
    // Verificar se está em um horário de execução e ainda não executou nessa hora
    if (this.EXECUTION_HOURS.includes(currentHour) && !this.executedHours.has(currentHour)) {
      console.log(`[NewsScheduler] Horário de execução detectado: ${currentHour}:00`);
      this.executedHours.add(currentHour);
      this.executeCollection();
    }
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
  
  /**
   * Retorna o próximo horário de execução
   */
  public getNextExecutionTime(): Date | null {
    if (!this.isRunning) {
      return null;
    }
    
    const now = new Date();
    const currentHour = now.getHours();
    
    // Encontrar o próximo horário de execução
    let nextHour = this.EXECUTION_HOURS.find(h => h > currentHour);
    
    // Se não houver mais horários hoje, pegar o primeiro horário de amanhã
    if (nextHour === undefined) {
      nextHour = this.EXECUTION_HOURS[0];
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(nextHour, 0, 0, 0);
      return tomorrow;
    }
    
    // Próximo horário ainda hoje
    const nextExecution = new Date(now);
    nextExecution.setHours(nextHour, 0, 0, 0);
    return nextExecution;
  }
}

// Singleton instance
export const newsScheduler = new NewsScheduler();
