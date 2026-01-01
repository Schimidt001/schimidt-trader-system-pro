/**
 * Strategy Factory
 * 
 * Factory para criar instâncias de estratégias de trading baseado no tipo.
 * Implementa o padrão Factory para o Strategy Pattern.
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 */

import {
  ITradingStrategy,
  IStrategyFactory,
  StrategyType,
} from "./ITradingStrategy";
import { SMCStrategy, SMCStrategyConfig, createSMCStrategy } from "./SMCStrategy";
import { TrendSniperStrategyAdapter, TrendSniperAdapterConfig, createTrendSniperAdapter } from "./TrendSniperStrategyAdapter";

/**
 * Configuração unificada para qualquer estratégia
 */
export type UnifiedStrategyConfig = Partial<SMCStrategyConfig> | Partial<TrendSniperAdapterConfig>;

/**
 * Factory para criar estratégias de trading
 */
export class StrategyFactory implements IStrategyFactory {
  /**
   * Cria uma instância da estratégia baseado no tipo
   */
  createStrategy(type: StrategyType, config?: UnifiedStrategyConfig): ITradingStrategy {
    switch (type) {
      case StrategyType.SMC_SWARM:
        return createSMCStrategy(config as Partial<SMCStrategyConfig>);
      
      case StrategyType.TREND_SNIPER:
        return createTrendSniperAdapter(config as Partial<TrendSniperAdapterConfig>);
      
      default:
        console.warn(`[StrategyFactory] Tipo de estratégia desconhecido: ${type}, usando SMC_SWARM como padrão`);
        return createSMCStrategy(config as Partial<SMCStrategyConfig>);
    }
  }
  
  /**
   * Obtém o nome legível da estratégia
   */
  getStrategyName(type: StrategyType): string {
    switch (type) {
      case StrategyType.SMC_SWARM:
        return "SMC Swarm (Smart Money Concepts)";
      case StrategyType.TREND_SNIPER:
        return "Trend Sniper (EMA + RSI)";
      default:
        return "Desconhecido";
    }
  }
  
  /**
   * Obtém a descrição da estratégia
   */
  getStrategyDescription(type: StrategyType): string {
    switch (type) {
      case StrategyType.SMC_SWARM:
        return "Estratégia baseada em Price Action Estrutural (Smart Money Concepts). " +
               "Identifica padrões de manipulação de liquidez institucional usando " +
               "análise multi-timeframe (H1, M15, M5).";
      case StrategyType.TREND_SNIPER:
        return "Estratégia clássica baseada em EMA 200 + RSI 14. " +
               "Identifica entradas em tendência com confirmação de momentum.";
      default:
        return "Estratégia não documentada.";
    }
  }
  
  /**
   * Lista todos os tipos de estratégia disponíveis
   */
  getAvailableStrategies(): Array<{
    type: StrategyType;
    name: string;
    description: string;
  }> {
    return [
      {
        type: StrategyType.SMC_SWARM,
        name: this.getStrategyName(StrategyType.SMC_SWARM),
        description: this.getStrategyDescription(StrategyType.SMC_SWARM),
      },
      {
        type: StrategyType.TREND_SNIPER,
        name: this.getStrategyName(StrategyType.TREND_SNIPER),
        description: this.getStrategyDescription(StrategyType.TREND_SNIPER),
      },
    ];
  }
  
  /**
   * Valida se um tipo de estratégia é válido
   */
  isValidStrategyType(type: string): type is StrategyType {
    return Object.values(StrategyType).includes(type as StrategyType);
  }
  
  /**
   * Converte string para StrategyType
   */
  parseStrategyType(type: string): StrategyType {
    if (this.isValidStrategyType(type)) {
      return type;
    }
    
    // Tentar match case-insensitive
    const upperType = type.toUpperCase();
    if (upperType === "SMC_SWARM" || upperType === "SMC") {
      return StrategyType.SMC_SWARM;
    }
    if (upperType === "TREND_SNIPER" || upperType === "TRENDSNIPER") {
      return StrategyType.TREND_SNIPER;
    }
    
    // Default
    return StrategyType.SMC_SWARM;
  }
}

// ============= SINGLETON E EXPORTAÇÕES =============

// Instância singleton da factory
export const strategyFactory = new StrategyFactory();

// Re-exportar tipos
export { StrategyType } from "./ITradingStrategy";
