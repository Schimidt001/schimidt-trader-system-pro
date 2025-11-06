/**
 * Tipos TypeScript para o Filtro de Horário
 * 
 * @module filtro-horario/types
 * @version 1.0.0
 * @author Manus AI
 * @date 2025-11-05
 */

/**
 * Modos predefinidos do filtro de horário
 */
export type HourlyFilterMode = 
  | 'IDEAL'      // 2 horários (16h, 18h) - Máxima qualidade
  | 'COMPATIBLE' // 8 horários - Padrão recuo + continuação
  | 'GOLDEN'     // 8 horários - Candles mais limpos
  | 'COMBINED'   // 10 horários - Balanceado (recomendado)
  | 'CUSTOM';    // Personalizado

/**
 * Configuração do filtro de horário
 */
export interface HourlyFilterConfig {
  /** Se o filtro está ativado */
  enabled: boolean;
  
  /** Modo do filtro */
  mode: HourlyFilterMode;
  
  /** Horários permitidos (0-23 UTC) */
  customHours: number[];
  
  /** Horários GOLD com stake multiplicado (máximo 2) */
  goldModeHours: number[];
  
  /** Multiplicador de stake para horários GOLD (100 = 1x, 200 = 2x) */
  goldModeStakeMultiplier: number;
}

/**
 * Status atual do filtro de horário
 */
export interface HourlyFilterStatus {
  /** Horário UTC atual (0-23) */
  currentHour: number;
  
  /** Se o horário atual está permitido */
  isAllowed: boolean;
  
  /** Se o horário atual é GOLD */
  isGold: boolean;
  
  /** Próximo horário permitido (null se nenhum) */
  nextAllowedHour: number | null;
  
  /** Lista de horários permitidos */
  allowedHours: number[];
  
  /** Lista de horários GOLD */
  goldModeHours: number[];
}

/**
 * Informações de horário para exibição
 */
export interface HourlyInfo {
  /** Horário UTC atual (0-23) */
  currentHour: number;
  
  /** Se o horário atual está permitido */
  isAllowed: boolean;
  
  /** Se o horário atual é GOLD */
  isGold: boolean;
  
  /** Próximo horário permitido (null se nenhum) */
  nextAllowedHour: number | null;
}

/**
 * Presets de horários para cada modo
 */
export const HOURLY_FILTER_PRESETS: Record<Exclude<HourlyFilterMode, 'CUSTOM'>, number[]> = {
  IDEAL: [16, 18],
  COMPATIBLE: [3, 6, 9, 10, 13, 16, 17, 18],
  GOLDEN: [5, 12, 16, 18, 20, 21, 22, 23],
  COMBINED: [5, 6, 12, 16, 17, 18, 20, 21, 22, 23],
};

/**
 * Configuração padrão do filtro de horário
 */
export const DEFAULT_HOURLY_FILTER_CONFIG: HourlyFilterConfig = {
  enabled: false,
  mode: 'COMBINED',
  customHours: HOURLY_FILTER_PRESETS.COMBINED,
  goldModeHours: [],
  goldModeStakeMultiplier: 200, // 2x
};
