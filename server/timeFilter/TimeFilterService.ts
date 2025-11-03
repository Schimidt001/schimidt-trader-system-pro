/**
 * TimeFilterService
 * 
 * Serviço responsável por gerenciar o filtro de horário do bot.
 * Trabalha 100% em UTC para evitar problemas de timezone.
 * 
 * Funcionalidades:
 * - Verificar se horário atual é permitido
 * - Detectar horários GOLD
 * - Calcular stake apropriado
 * - Calcular próximo horário permitido/GOLD
 * - Agendar verificações automáticas
 */

export interface TimeFilterConfig {
  enabled: boolean;
  allowedHours: number[]; // Horas em UTC (0-23)
  goldHours: number[];    // Horas em UTC (0-23)
  goldStake: number;
}

export class TimeFilterService {
  private config: TimeFilterConfig;
  private checkCallback?: () => void;
  private checkTimer?: NodeJS.Timeout;

  constructor(config: TimeFilterConfig) {
    this.config = config;
  }

  /**
   * Atualiza a configuração do filtro
   */
  updateConfig(config: Partial<TimeFilterConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[TimeFilter] Configuração atualizada:', this.config);
  }

  /**
   * Obtém a hora atual em UTC (0-23)
   */
  private getCurrentHourUTC(): number {
    return new Date().getUTCHours();
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

    const currentHour = this.getCurrentHourUTC();
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

    const currentHour = this.getCurrentHourUTC();
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
   * Retorna o próximo horário permitido em UTC
   * Retorna null se já está em horário permitido
   */
  getNextAllowedTime(): Date | null {
    // Se filtro desabilitado ou sem horários, retornar null
    if (!this.config.enabled || !this.config.allowedHours || this.config.allowedHours.length === 0) {
      return null;
    }

    const currentHour = this.getCurrentHourUTC();

    // Se já está em horário permitido, retornar null
    if (this.config.allowedHours.includes(currentHour)) {
      return null;
    }

    // Procurar próximo horário permitido nas próximas 24 horas
    for (let i = 1; i <= 24; i++) {
      const nextHour = (currentHour + i) % 24;

      if (this.config.allowedHours.includes(nextHour)) {
        // Criar timestamp do próximo horário em UTC
        const now = new Date();
        const nextTime = new Date(Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          nextHour,
          0,
          0,
          0
        ));

        // Se o horário é menor ou igual ao atual, é no dia seguinte
        if (nextHour <= currentHour) {
          nextTime.setUTCDate(nextTime.getUTCDate() + 1);
        }

        return nextTime;
      }
    }

    return null;
  }

  /**
   * Retorna o próximo horário GOLD em UTC
   * Retorna null se já está em horário GOLD ou não há horários GOLD
   */
  getNextGoldTime(): Date | null {
    // Se não há horários GOLD, retornar null
    if (!this.config.enabled || !this.config.goldHours || this.config.goldHours.length === 0) {
      return null;
    }

    const currentHour = this.getCurrentHourUTC();

    // Se já está em horário GOLD, retornar null
    if (this.config.goldHours.includes(currentHour)) {
      return null;
    }

    // Procurar próximo horário GOLD nas próximas 24 horas
    // Só considerar horários GOLD que também sejam permitidos
    for (let i = 1; i <= 24; i++) {
      const nextHour = (currentHour + i) % 24;

      if (this.config.goldHours.includes(nextHour) && this.config.allowedHours.includes(nextHour)) {
        // Criar timestamp do próximo horário GOLD em UTC
        const now = new Date();
        const nextTime = new Date(Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          nextHour,
          0,
          0,
          0
        ));

        // Se o horário é menor ou igual ao atual, é no dia seguinte
        if (nextHour <= currentHour) {
          nextTime.setUTCDate(nextTime.getUTCDate() + 1);
        }

        return nextTime;
      }
    }

    return null;
  }

  /**
   * Retorna status completo do filtro
   */
  getStatus() {
    const currentHour = this.getCurrentHourUTC();
    const isAllowed = this.isWithinAllowedTime();
    const isGold = this.isGoldHour();
    const nextAllowedTime = this.getNextAllowedTime();
    const nextGoldTime = this.getNextGoldTime();

    return {
      enabled: this.config.enabled,
      currentHour,
      isAllowed,
      isGoldHour: isGold,
      nextAllowedTime: nextAllowedTime ? nextAllowedTime.toISOString() : null,
      nextGoldTime: nextGoldTime ? nextGoldTime.toISOString() : null,
    };
  }

  /**
   * Agenda verificação periódica de horário
   * Verifica a cada minuto se mudou de horário
   */
  scheduleCheck(callback: () => void): void {
    this.checkCallback = callback;

    // Limpar timer anterior se existir
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }

    // Verificar a cada minuto
    this.checkTimer = setInterval(() => {
      if (this.checkCallback) {
        this.checkCallback();
      }
    }, 60000); // 60 segundos

    console.log('[TimeFilter] Verificação periódica agendada (a cada 1 minuto)');
  }

  /**
   * Cancela verificação periódica
   */
  cancelScheduledCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
      console.log('[TimeFilter] Verificação periódica cancelada');
    }
  }
}
