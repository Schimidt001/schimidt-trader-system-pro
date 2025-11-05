/**
 * Lógica isolada do Filtro de Horário
 * 
 * @module filtro-horario/hourlyFilterLogic
 * @version 1.0.0
 * @author Manus AI
 * @date 2025-11-05
 * 
 * @description
 * Classe que implementa a lógica completa do filtro de horário,
 * incluindo verificação de horários permitidos, horários GOLD,
 * ajuste de stake e cálculo do próximo horário permitido.
 * 
 * @example
 * ```typescript
 * const filter = new HourlyFilter({
 *   enabled: true,
 *   mode: 'COMBINED',
 *   customHours: [5, 6, 12, 16, 17, 18, 20, 21, 22, 23],
 *   goldModeHours: [16, 18],
 *   goldModeStakeMultiplier: 200,
 * });
 * 
 * if (filter.isAllowedHour()) {
 *   const stake = filter.getAdjustedStake(1000);
 *   console.log(`Stake ajustado: ${stake}`);
 * } else {
 *   console.log(`Próximo horário: ${filter.getNextAllowedHour()}h`);
 * }
 * ```
 */

import type {
  HourlyFilterConfig,
  HourlyFilterStatus,
  HourlyInfo,
  HourlyFilterMode,
} from './types';
import { HOURLY_FILTER_PRESETS, DEFAULT_HOURLY_FILTER_CONFIG } from './types';

/**
 * Classe principal do Filtro de Horário
 */
export class HourlyFilter {
  private config: HourlyFilterConfig;

  /**
   * Cria uma nova instância do filtro de horário
   * 
   * @param config - Configuração do filtro (opcional, usa padrão se não fornecido)
   */
  constructor(config?: Partial<HourlyFilterConfig>) {
    this.config = {
      ...DEFAULT_HOURLY_FILTER_CONFIG,
      ...config,
    };

    // Validar configuração
    this.validateConfig();
  }

  /**
   * Valida a configuração do filtro
   * 
   * @throws {Error} Se a configuração for inválida
   */
  private validateConfig(): void {
    const { customHours, goldModeHours, goldModeStakeMultiplier } = this.config;

    // Validar customHours
    if (!Array.isArray(customHours)) {
      throw new Error('customHours deve ser um array');
    }

    for (const hour of customHours) {
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        throw new Error(`Horário inválido: ${hour}. Deve ser entre 0 e 23.`);
      }
    }

    // Validar goldModeHours
    if (!Array.isArray(goldModeHours)) {
      throw new Error('goldModeHours deve ser um array');
    }

    if (goldModeHours.length > 2) {
      throw new Error('Máximo de 2 horários GOLD permitidos');
    }

    for (const hour of goldModeHours) {
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        throw new Error(`Horário GOLD inválido: ${hour}. Deve ser entre 0 e 23.`);
      }

      if (!customHours.includes(hour)) {
        throw new Error(`Horário GOLD ${hour} não está nos horários permitidos`);
      }
    }

    // Validar goldModeStakeMultiplier
    if (!Number.isInteger(goldModeStakeMultiplier) || goldModeStakeMultiplier < 100) {
      throw new Error('goldModeStakeMultiplier deve ser >= 100 (1x)');
    }
  }

  /**
   * Atualiza a configuração do filtro
   * 
   * @param config - Nova configuração (parcial)
   */
  public updateConfig(config: Partial<HourlyFilterConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
    this.validateConfig();
  }

  /**
   * Obtém a configuração atual
   * 
   * @returns Configuração atual do filtro
   */
  public getConfig(): Readonly<HourlyFilterConfig> {
    return { ...this.config };
  }

  /**
   * Obtém horários para um modo específico
   * 
   * @param mode - Modo do filtro
   * @param customHours - Horários personalizados (usado apenas se mode === 'CUSTOM')
   * @returns Array de horários (0-23)
   */
  public static getHoursForMode(
    mode: HourlyFilterMode,
    customHours?: number[]
  ): number[] {
    if (mode === 'CUSTOM') {
      if (!customHours || customHours.length === 0) {
        console.warn('Modo CUSTOM sem horários personalizados, usando COMBINED');
        return HOURLY_FILTER_PRESETS.COMBINED;
      }
      return customHours;
    }

    return HOURLY_FILTER_PRESETS[mode];
  }

  /**
   * Verifica se o horário atual está permitido
   * 
   * @param date - Data para verificar (opcional, usa Date.now() se não fornecido)
   * @returns true se o horário está permitido, false caso contrário
   */
  public isAllowedHour(date?: Date): boolean {
    if (!this.config.enabled) {
      return true; // Filtro desabilitado, todos os horários são permitidos
    }

    const now = date || new Date();
    const currentHour = now.getUTCHours();

    return this.config.customHours.includes(currentHour);
  }

  /**
   * Verifica se o horário atual é um horário GOLD
   * 
   * @param date - Data para verificar (opcional, usa Date.now() se não fornecido)
   * @returns true se o horário é GOLD, false caso contrário
   */
  public isGoldHour(date?: Date): boolean {
    if (!this.config.enabled || this.config.goldModeHours.length === 0) {
      return false;
    }

    const now = date || new Date();
    const currentHour = now.getUTCHours();

    return this.config.goldModeHours.includes(currentHour);
  }

  /**
   * Obtém o próximo horário permitido
   * 
   * @param date - Data de referência (opcional, usa Date.now() se não fornecido)
   * @returns Próximo horário permitido (0-23) ou null se nenhum horário está configurado
   */
  public getNextAllowedHour(date?: Date): number | null {
    if (!this.config.enabled || this.config.customHours.length === 0) {
      return null;
    }

    const now = date || new Date();
    const currentHour = now.getUTCHours();

    // Procurar próximo horário permitido nas próximas 24 horas
    for (let i = 1; i <= 24; i++) {
      const checkHour = (currentHour + i) % 24;
      if (this.config.customHours.includes(checkHour)) {
        return checkHour;
      }
    }

    return null; // Nenhum horário permitido encontrado (não deveria acontecer)
  }

  /**
   * Obtém informações completas sobre o horário atual
   * 
   * @param date - Data para verificar (opcional, usa Date.now() se não fornecido)
   * @returns Informações de horário
   */
  public getHourlyInfo(date?: Date): HourlyInfo {
    const now = date || new Date();
    const currentHour = now.getUTCHours();
    const isAllowed = this.isAllowedHour(date);
    const isGold = this.isGoldHour(date);
    const nextAllowedHour = isAllowed ? null : this.getNextAllowedHour(date);

    return {
      currentHour,
      isAllowed,
      isGold,
      nextAllowedHour,
    };
  }

  /**
   * Obtém status completo do filtro
   * 
   * @param date - Data para verificar (opcional, usa Date.now() se não fornecido)
   * @returns Status completo do filtro
   */
  public getStatus(date?: Date): HourlyFilterStatus {
    const hourlyInfo = this.getHourlyInfo(date);

    return {
      ...hourlyInfo,
      allowedHours: [...this.config.customHours],
      goldModeHours: [...this.config.goldModeHours],
    };
  }

  /**
   * Ajusta o stake baseado no horário atual
   * 
   * @param baseStake - Stake base
   * @param date - Data para verificar (opcional, usa Date.now() se não fornecido)
   * @returns Stake ajustado (multiplicado se for horário GOLD)
   */
  public getAdjustedStake(baseStake: number, date?: Date): number {
    if (this.isGoldHour(date)) {
      const multiplier = this.config.goldModeStakeMultiplier / 100;
      return Math.round(baseStake * multiplier);
    }

    return baseStake;
  }

  /**
   * Verifica se deve aguardar próximo horário
   * 
   * @param date - Data para verificar (opcional, usa Date.now() se não fornecido)
   * @returns true se deve aguardar, false se pode operar
   */
  public shouldWaitNextHour(date?: Date): boolean {
    return !this.isAllowedHour(date);
  }

  /**
   * Obtém mensagem de status para exibição
   * 
   * @param date - Data para verificar (opcional, usa Date.now() se não fornecido)
   * @returns Mensagem de status
   */
  public getStatusMessage(date?: Date): string {
    if (!this.config.enabled) {
      return 'Filtro de horário desabilitado';
    }

    const info = this.getHourlyInfo(date);

    if (info.isAllowed) {
      if (info.isGold) {
        return `Horário ${info.currentHour}h UTC permitido ⭐ GOLD (stake ${this.config.goldModeStakeMultiplier / 100}x)`;
      }
      return `Horário ${info.currentHour}h UTC permitido`;
    }

    if (info.nextAllowedHour !== null) {
      return `Aguardando próximo horário: ${info.nextAllowedHour}h UTC`;
    }

    return 'Nenhum horário permitido configurado';
  }

  /**
   * Formata lista de horários para exibição
   * 
   * @param hours - Array de horários (0-23)
   * @returns String formatada (ex: "16h, 18h, 20h")
   */
  public static formatHours(hours: number[]): string {
    return hours
      .sort((a, b) => a - b)
      .map(h => `${h}h`)
      .join(', ');
  }

  /**
   * Cria uma instância a partir de JSON
   * 
   * @param json - Configuração em formato JSON
   * @returns Nova instância do filtro
   */
  public static fromJSON(json: string): HourlyFilter {
    const config = JSON.parse(json) as HourlyFilterConfig;
    return new HourlyFilter(config);
  }

  /**
   * Converte a configuração para JSON
   * 
   * @returns Configuração em formato JSON
   */
  public toJSON(): string {
    return JSON.stringify(this.config);
  }
}

/**
 * Exporta funções auxiliares standalone
 */
export const HourlyFilterUtils = {
  /**
   * Obtém horários para um modo específico
   */
  getHoursForMode: HourlyFilter.getHoursForMode,

  /**
   * Formata lista de horários
   */
  formatHours: HourlyFilter.formatHours,

  /**
   * Cria instância a partir de JSON
   */
  fromJSON: HourlyFilter.fromJSON,

  /**
   * Obtém presets disponíveis
   */
  getPresets: () => ({ ...HOURLY_FILTER_PRESETS }),

  /**
   * Obtém configuração padrão
   */
  getDefaultConfig: () => ({ ...DEFAULT_HOURLY_FILTER_CONFIG }),
};
