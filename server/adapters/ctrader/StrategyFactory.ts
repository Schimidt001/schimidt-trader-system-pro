/**
 * Strategy Factory
 * 
 * Factory para criar instâncias de estratégias de trading baseado no tipo.
 * Implementa o padrão Factory para o Strategy Pattern.
 * 
 * @author Schimidt Trader Pro
 * @version 1.1.0 - Adicionado suporte para RSI+VWAP Reversal
 */

import {
  ITradingStrategy,
  IStrategyFactory,
  StrategyType,
} from "./ITradingStrategy";
import { SMCStrategy, SMCStrategyConfig, createSMCStrategy } from "./SMCStrategy";
import { TrendSniperStrategyAdapter, TrendSniperAdapterConfig, createTrendSniperAdapter } from "./TrendSniperStrategyAdapter";
import { RsiVwapStrategy, RsiVwapStrategyConfig, createRsiVwapStrategy } from "./RsiVwapStrategy";
import { ORBStrategy, ORBStrategyConfig, createORBStrategy } from "./ORBStrategy";

/**
 * Configuração unificada para qualquer estratégia
 */
export type UnifiedStrategyConfig = Partial<SMCStrategyConfig> | Partial<TrendSniperAdapterConfig> | Partial<RsiVwapStrategyConfig> | Partial<ORBStrategyConfig>;

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
      
      case StrategyType.RSI_VWAP_REVERSAL:
        return createRsiVwapStrategy(config as Partial<RsiVwapStrategyConfig>);
      
      case StrategyType.ORB_TREND:
        return createORBStrategy(config as Partial<ORBStrategyConfig>);
      
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
      case StrategyType.RSI_VWAP_REVERSAL:
        return "RSI + VWAP Reversal";
      case StrategyType.ORB_TREND:
        return "ORB Trend (Opening Range Breakout)";
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
      case StrategyType.RSI_VWAP_REVERSAL:
        return "Estratégia de reversão à média baseada em RSI + VWAP. " +
               "Identifica pontos de sobrevenda/sobrecompra com confirmação de VWAP " +
               "para operações de alta frequência com R:R 1:2.";
      case StrategyType.ORB_TREND:
        return "Estratégia de breakout do Opening Range com filtro de regime EMA200. " +
               "Opera em M15 com máximo de 1 trade por dia por símbolo. " +
               "Identifica breakouts do range de abertura com confirmação de tendência.";
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
      {
        type: StrategyType.RSI_VWAP_REVERSAL,
        name: this.getStrategyName(StrategyType.RSI_VWAP_REVERSAL),
        description: this.getStrategyDescription(StrategyType.RSI_VWAP_REVERSAL),
      },
      {
        type: StrategyType.ORB_TREND,
        name: this.getStrategyName(StrategyType.ORB_TREND),
        description: this.getStrategyDescription(StrategyType.ORB_TREND),
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
    if (upperType === "RSI_VWAP_REVERSAL" || upperType === "RSI_VWAP" || upperType === "RSIVWAP") {
      return StrategyType.RSI_VWAP_REVERSAL;
    }
    if (upperType === "ORB_TREND" || upperType === "ORB") {
      return StrategyType.ORB_TREND;
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
