/**
 * TrendSniperStrategy Adapter
 * 
 * Adaptador que faz a TrendSniperStrategy existente implementar
 * a interface ITradingStrategy para compatibilidade com o Strategy Pattern.
 * 
 * Isso permite que o TradingEngine use tanto TrendSniper quanto SMC
 * de forma intercambiável.
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 */

import { TrendbarData, TradeSide } from "./CTraderClient";
import {
  ITradingStrategy,
  StrategyType,
  SignalResult,
  SLTPResult,
  TrailingStopResult,
  PositionSizeResult,
  MultiTimeframeData,
  BaseStrategyConfig,
} from "./ITradingStrategy";
import {
  TrendSniperStrategy,
  TrendSniperConfig,
  DEFAULT_TREND_SNIPER_CONFIG,
  SignalResult as TrendSniperSignalResult,
} from "./TrendSniperStrategy";

/**
 * Configuração estendida que inclui o tipo de estratégia
 */
export interface TrendSniperAdapterConfig extends TrendSniperConfig, BaseStrategyConfig {}

/**
 * Adaptador que envolve TrendSniperStrategy e implementa ITradingStrategy
 */
export class TrendSniperStrategyAdapter implements ITradingStrategy {
  private strategy: TrendSniperStrategy;
  private config: TrendSniperAdapterConfig;
  
  constructor(config: Partial<TrendSniperAdapterConfig> = {}) {
    this.config = {
      ...DEFAULT_TREND_SNIPER_CONFIG,
      strategyType: StrategyType.TREND_SNIPER,
      ...config,
    };
    
    this.strategy = new TrendSniperStrategy(this.config);
  }
  
  // ============= IMPLEMENTAÇÃO DE ITradingStrategy =============
  
  getStrategyType(): StrategyType {
    return StrategyType.TREND_SNIPER;
  }
  
  analyzeSignal(candles: TrendbarData[], mtfData?: MultiTimeframeData): SignalResult {
    // TrendSniper usa apenas um timeframe, ignorar mtfData
    const result = this.strategy.analyzeSignal(candles);
    
    // Converter para o formato da interface
    return {
      signal: result.signal,
      confidence: result.confidence,
      reason: result.reason,
      indicators: {
        ema200: result.indicators.ema200,
        rsi: result.indicators.rsi,
        rsiPrevious: result.indicators.rsiPrevious,
        price: result.indicators.price,
      },
    };
  }
  
  calculateSLTP(
    entryPrice: number,
    direction: TradeSide,
    pipValue: number,
    metadata?: Record<string, any>
  ): SLTPResult {
    const result = this.strategy.calculateSLTP(entryPrice, direction, pipValue);
    
    return {
      stopLoss: result.stopLoss,
      takeProfit: result.takeProfit,
      stopLossPips: this.config.stopLossPips,
      takeProfitPips: this.config.takeProfitPips > 0 ? this.config.takeProfitPips : undefined,
    };
  }
  
  calculateTrailingStop(
    entryPrice: number,
    currentPrice: number,
    currentStopLoss: number,
    direction: TradeSide,
    pipValue: number
  ): TrailingStopResult {
    const result = this.strategy.calculateTrailingStop(
      entryPrice,
      currentPrice,
      currentStopLoss,
      direction,
      pipValue
    );
    
    return {
      shouldUpdate: result.shouldUpdate,
      newStopLoss: result.newStopLoss,
      profitPips: result.profitPips,
    };
  }
  
  calculatePositionSize(
    accountBalance: number,
    stopLossPips: number,
    pipValue: number
  ): PositionSizeResult {
    // TrendSniper usa risco fixo em USD
    const riskUsd = this.config.baseRisk;
    const riskPercent = (riskUsd / accountBalance) * 100;
    
    // Calcular lote baseado no risco
    const riskPerPip = riskUsd / stopLossPips;
    const lotSize = riskPerPip / (pipValue * 10); // 10 = valor do pip por lote standard
    
    return {
      lotSize: Math.max(0.01, Math.min(10, Math.floor(lotSize * 100) / 100)),
      riskUsd,
      riskPercent,
    };
  }
  
  getConfig(): TrendSniperAdapterConfig {
    return { ...this.config };
  }
  
  updateConfig(config: Partial<TrendSniperAdapterConfig>): void {
    this.config = { ...this.config, ...config };
    this.strategy.updateConfig(config);
  }
  
  isReadyToTrade(currentTime?: number): boolean {
    // TrendSniper não tem filtro de horário por padrão
    return true;
  }
  
  reset(): void {
    this.strategy.resetCompounding();
  }
  
  // ============= MÉTODOS ESPECÍFICOS DO TRENDSNIPER =============
  
  /**
   * Processa resultado de trade para compounding
   */
  processTradeResult(profit: number, isWin: boolean) {
    return this.strategy.processTradeResult(profit, isWin);
  }
  
  /**
   * Obtém tamanho atual do lote (com compounding)
   */
  getCurrentLotSize(): number {
    return this.strategy.getCurrentLotSize();
  }
  
  /**
   * Obtém a instância original da estratégia
   */
  getOriginalStrategy(): TrendSniperStrategy {
    return this.strategy;
  }
}

// ============= EXPORTAÇÕES =============

// Instância singleton para uso global
export const trendSniperAdapter = new TrendSniperStrategyAdapter();

// Factory function
export function createTrendSniperAdapter(config?: Partial<TrendSniperAdapterConfig>): TrendSniperStrategyAdapter {
  return new TrendSniperStrategyAdapter(config);
}
