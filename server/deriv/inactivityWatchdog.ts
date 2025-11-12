/**
 * Watchdog de Inatividade
 * 
 * Monitora se o bot está processando ticks regularmente.
 * Se não houver atividade por X minutos, alerta sobre possível falha silenciosa.
 */

export class InactivityWatchdog {
  private lastActivityTime: number = Date.now();
  private watchdogInterval: NodeJS.Timeout | null = null;
  private inactivityThresholdMs: number;
  private onInactivityDetected: (inactiveTimeMs: number) => void;
  private isPaused: boolean = false;

  /**
   * Cria um novo watchdog
   * 
   * @param inactivityThresholdMinutes - Minutos sem atividade para considerar inativo
   * @param onInactivityDetected - Callback chamado quando inatividade é detectada
   */
  constructor(
    inactivityThresholdMinutes: number = 5,
    onInactivityDetected: (inactiveTimeMs: number) => void
  ) {
    this.inactivityThresholdMs = inactivityThresholdMinutes * 60 * 1000;
    this.onInactivityDetected = onInactivityDetected;
  }

  /**
   * Inicia o monitoramento
   */
  start(): void {
    if (this.watchdogInterval) {
      console.warn('[InactivityWatchdog] Watchdog já está rodando');
      return;
    }

    this.lastActivityTime = Date.now();
    
    // Verificar a cada minuto
    this.watchdogInterval = setInterval(() => {
      // Não alertar se estiver pausado (ex: standby por filtro de horário)
      if (this.isPaused) {
        return;
      }
      
      const now = Date.now();
      const inactiveTime = now - this.lastActivityTime;
      
      if (inactiveTime > this.inactivityThresholdMs) {
        console.error(
          `[InactivityWatchdog] ⚠️ ALERTA: Bot inativo por ${Math.floor(inactiveTime / 60000)} minutos!`
        );
        this.onInactivityDetected(inactiveTime);
      }
    }, 60000); // Verificar a cada 1 minuto

    console.log(`[InactivityWatchdog] Iniciado - Threshold: ${this.inactivityThresholdMs / 60000} minutos`);
  }

  /**
   * Para o monitoramento
   */
  stop(): void {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
      console.log('[InactivityWatchdog] Parado');
    }
  }

  /**
   * Registra atividade (deve ser chamado a cada tick processado com sucesso)
   */
  recordActivity(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * Obtém o tempo desde a última atividade em milissegundos
   */
  getTimeSinceLastActivity(): number {
    return Date.now() - this.lastActivityTime;
  }

  /**
   * Verifica se está inativo
   */
  isInactive(): boolean {
    return this.getTimeSinceLastActivity() > this.inactivityThresholdMs;
  }

  /**
   * Pausa o monitoramento (para estados de standby programados)
   */
  pause(): void {
    this.isPaused = true;
    console.log('[InactivityWatchdog] Pausado - standby programado');
  }

  /**
   * Retoma o monitoramento
   */
  resume(): void {
    this.isPaused = false;
    this.lastActivityTime = Date.now(); // Resetar timer ao retomar
    console.log('[InactivityWatchdog] Retomado - bot ativo novamente');
  }

  /**
   * Verifica se está pausado
   */
  isPausedState(): boolean {
    return this.isPaused;
  }
}
