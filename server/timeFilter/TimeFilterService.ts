/**
 * TimeFilterService
 * 
 * Serviço responsável por gerenciar o filtro de horário do bot de trading.
 * Determina quando o bot pode operar baseado em horários configurados pelo usuário.
 * 
 * Princípios:
 * - Fail-safe: Em caso de erro, sempre permite operação
 * - Non-invasive: Não modifica lógica de trading
 * - Observable: Todas as decisões são logadas
 */

export interface TimeFilterConfig {
  enabled: boolean;
  allowedHours: number[];
  goldHours: number[];
  goldStake: number;
  timezone: string;
}

export interface TimeFilterStatus {
  isAllowed: boolean;
  isGoldHour: boolean;
  currentHour: number;
  currentTime: string;
  nextAllowedTime: Date | null;
  nextGoldTime: Date | null;
}

export class TimeFilterService {
  private config: TimeFilterConfig;
  private timer: NodeJS.Timeout | null = null;

  constructor(config: TimeFilterConfig) {
    this.config = config;
  }

  /**
   * Obtém a hora atual no timezone configurado
   */
  private getCurrentHourInTimezone(): number {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: this.config.timezone,
      hour: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(now);
    const hourPart = parts.find(part => part.type === 'hour');
    return hourPart ? parseInt(hourPart.value, 10) : now.getHours();
  }

  /**
   * Obtém o timestamp atual no timezone configurado
   */
  private getCurrentTimeInTimezone(): Date {
    return new Date();
  }

  /**
   * Formata hora atual no timezone configurado
   */
  private formatCurrentTime(): string {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: this.config.timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    return formatter.format(now);
  }

  /**
   * Verifica se o horário atual é permitido para operação
   */
  isWithinAllowedTime(): boolean {
    // Se filtro desabilitado, sempre permitir (fail-safe)
    if (!this.config.enabled) {
      return true;
    }

    // Se não há horários configurados, sempre permitir (fail-safe)
    if (!this.config.allowedHours || this.config.allowedHours.length === 0) {
      return true;
    }

    const currentHour = this.getCurrentHourInTimezone();
    return this.config.allowedHours.includes(currentHour);
  }

  /**
   * Verifica se o horário atual é um horário GOLD
   */
  isGoldHour(): boolean {
    // Só pode ser GOLD se estiver em horário permitido
    if (!this.isWithinAllowedTime()) {
      return false;
    }

    // Se não há horários GOLD configurados, retornar false
    if (!this.config.goldHours || this.config.goldHours.length === 0) {
      return false;
    }

    const currentHour = this.getCurrentHourInTimezone();
    return this.config.goldHours.includes(currentHour);
  }

  /**
   * Retorna o stake apropriado para o horário atual
   * Prioridade: GOLD > IA > Base
   */
  getStakeForCurrentHour(baseStake: number, aiStake?: number): number {
    // Se é horário GOLD, usar goldStake
    if (this.isGoldHour()) {
      console.log(`[TimeFilter] Horário GOLD detectado, usando stake $${(this.config.goldStake / 100).toFixed(2)}`);
      return this.config.goldStake;
    }

    // Se IA forneceu stake, usar o da IA
    if (aiStake !== undefined) {
      return aiStake;
    }

    // Caso contrário, usar stake base
    return baseStake;
  }

  /**
   * Retorna o próximo horário permitido
   * Retorna null se já está em horário permitido
   */
  getNextAllowedTime(): Date | null {
    // Se filtro desabilitado ou sem horários, retornar null
    if (!this.config.enabled || !this.config.allowedHours || this.config.allowedHours.length === 0) {
      return null;
    }

    const now = this.getCurrentTimeInTimezone();
    const currentHour = this.getCurrentHourInTimezone();

    // Se já está em horário permitido, retornar null
    if (this.config.allowedHours.includes(currentHour)) {
      return null;
    }

    // Procurar próximo horário permitido nas próximas 24 horas
    for (let i = 1; i <= 24; i++) {
      const nextHour = (currentHour + i) % 24;

      if (this.config.allowedHours.includes(nextHour)) {
        // Calcular o timestamp exato
        const nextTime = new Date(now);
        nextTime.setHours(nextHour, 0, 0, 0);

        // Se o horário é menor que o atual, é no dia seguinte
        if (nextHour <= currentHour) {
          nextTime.setDate(nextTime.getDate() + 1);
        }

        return nextTime;
      }
    }

    return null;
  }

  /**
   * Retorna o próximo horário GOLD
   * Retorna null se já está em horário GOLD ou não há horários GOLD
   */
  getNextGoldTime(): Date | null {
    // Se não há horários GOLD, retornar null
    if (!this.config.enabled || !this.config.goldHours || this.config.goldHours.length === 0) {
      return null;
    }

    const now = this.getCurrentTimeInTimezone();
    const currentHour = this.getCurrentHourInTimezone();

    // Se já está em horário GOLD, retornar null
    if (this.config.goldHours.includes(currentHour)) {
      return null;
    }

    // Procurar próximo horário GOLD nas próximas 24 horas
    for (let i = 1; i <= 24; i++) {
      const nextHour = (currentHour + i) % 24;

      if (this.config.goldHours.includes(nextHour)) {
        const nextTime = new Date(now);
        nextTime.setHours(nextHour, 0, 0, 0);

        if (nextHour <= currentHour) {
          nextTime.setDate(nextTime.getDate() + 1);
        }

        return nextTime;
      }
    }

    return null;
  }

  /**
   * Retorna o status completo do filtro
   */
  getStatus(): TimeFilterStatus {
    return {
      isAllowed: this.isWithinAllowedTime(),
      isGoldHour: this.isGoldHour(),
      currentHour: this.getCurrentHourInTimezone(),
      currentTime: this.formatCurrentTime(),
      nextAllowedTime: this.getNextAllowedTime(),
      nextGoldTime: this.getNextGoldTime(),
    };
  }

  /**
   * Agenda verificação automática no próximo horário
   */
  scheduleNextCheck(callback: () => void): void {
    // Cancelar timer anterior se existir
    this.cancelScheduledCheck();

    // Se filtro desabilitado, não agendar
    if (!this.config.enabled) {
      console.log("[TimeFilter] Filtro desabilitado, não agendando verificação");
      return;
    }

    // Calcular próximo horário de verificação (início da próxima hora)
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    const msUntilNextHour = nextHour.getTime() - now.getTime();

    console.log(`[TimeFilter] Próxima verificação agendada para ${nextHour.toLocaleTimeString('pt-BR')} (em ${Math.round(msUntilNextHour / 1000)}s)`);

    // Agendar callback
    this.timer = setTimeout(() => {
      console.log(`[TimeFilter] Executando verificação agendada às ${this.formatCurrentTime()}`);
      callback();
      // Re-agendar para próximo horário
      this.scheduleNextCheck(callback);
    }, msUntilNextHour);
  }

  /**
   * Cancela verificação agendada
   */
  cancelScheduledCheck(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      console.log("[TimeFilter] Verificação agendada cancelada");
    }
  }

  /**
   * Atualiza a configuração do filtro
   */
  updateConfig(config: TimeFilterConfig): void {
    const wasEnabled = this.config.enabled;
    this.config = config;

    // Se mudou de desabilitado para habilitado, pode precisar re-agendar
    if (!wasEnabled && config.enabled) {
      console.log("[TimeFilter] Filtro habilitado, configuração atualizada");
    }

    // Se mudou de habilitado para desabilitado, cancelar timer
    if (wasEnabled && !config.enabled) {
      console.log("[TimeFilter] Filtro desabilitado");
      this.cancelScheduledCheck();
    }
  }

  /**
   * Retorna a configuração atual
   */
  getConfig(): TimeFilterConfig {
    return { ...this.config };
  }
}
