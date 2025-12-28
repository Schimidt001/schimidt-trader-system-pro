/**
 * Trend Sniper Smart Strategy
 * 
 * Estratégia de trading para Forex (IC Markets via cTrader)
 * Baseada em EMA 200 + RSI 14 com Trailing Stop dinâmico
 * 
 * Regras de Entrada (M15):
 * - COMPRA: Preço > EMA 200 E RSI cruza 30 para cima
 * - VENDA: Preço < EMA 200 E RSI cruza 70 para baixo
 * 
 * Gestão de Saída:
 * - Stop Loss: 15 Pips
 * - Take Profit: Infinito (Open)
 * - Trailing Stop: Ativa ao atingir +10 Pips, move a cada +5 Pips
 * 
 * Smart Compounding:
 * - Win: Reter 50% do lucro, usar 50% para aumentar lote
 * - Loss: Voltar ao risco base
 */

import { TrendbarData, TradeSide } from "./CTraderClient";

export interface TrendSniperConfig {
  // Indicadores
  emaPeriod: number;          // Período da EMA (default: 200)
  rsiPeriod: number;          // Período do RSI (default: 14)
  rsiOversold: number;        // Nível de sobrevenda RSI (default: 30)
  rsiOverbought: number;      // Nível de sobrecompra RSI (default: 70)
  
  // Gestão de Risco
  stopLossPips: number;       // Stop Loss em pips (default: 15)
  takeProfitPips: number;     // Take Profit em pips (0 = infinito)
  
  // Trailing Stop
  trailingEnabled: boolean;   // Habilitar trailing stop
  trailingTriggerPips: number; // Pips de lucro para ativar trailing (default: 10)
  trailingStepPips: number;   // Passo do trailing em pips (default: 5)
  
  // Smart Compounding
  compoundingEnabled: boolean; // Habilitar compounding
  baseRisk: number;           // Risco base em USD (default: 10)
  retentionPercent: number;   // % do lucro a reter (default: 50)
}

export interface SignalResult {
  signal: "BUY" | "SELL" | "NONE";
  confidence: number;
  reason: string;
  indicators: {
    ema200: number;
    rsi: number;
    rsiPrevious: number;
    price: number;
  };
}

export interface TrailingStopResult {
  shouldUpdate: boolean;
  newStopLoss: number;
  profitPips: number;
}

export interface CompoundingResult {
  nextLotSize: number;
  retainedProfit: number;
  compoundedAmount: number;
}

export const DEFAULT_TREND_SNIPER_CONFIG: TrendSniperConfig = {
  emaPeriod: 200,
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  stopLossPips: 15,
  takeProfitPips: 0, // Infinito
  trailingEnabled: true,
  trailingTriggerPips: 10,
  trailingStepPips: 5,
  compoundingEnabled: true,
  baseRisk: 10,
  retentionPercent: 50,
};

/**
 * Calcula EMA (Exponential Moving Average)
 */
export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) {
    return [];
  }
  
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // Primeira EMA é a SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  ema.push(sum / period);
  
  // Calcular EMA para o resto
  for (let i = period; i < prices.length; i++) {
    const currentEma = (prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
    ema.push(currentEma);
  }
  
  return ema;
}

/**
 * Calcula RSI (Relative Strength Index)
 */
export function calculateRSI(prices: number[], period: number): number[] {
  if (prices.length < period + 1) {
    return [];
  }
  
  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  // Calcular ganhos e perdas
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // Primeira média (SMA)
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;
  
  // Primeiro RSI
  if (avgLoss === 0) {
    rsi.push(100);
  } else {
    const rs = avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }
  
  // Calcular RSI para o resto (usando EMA)
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    
    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }
  
  return rsi;
}

/**
 * Classe principal da estratégia Trend Sniper Smart
 */
export class TrendSniperStrategy {
  private config: TrendSniperConfig;
  private currentLotSize: number;
  private accumulatedProfit: number = 0;
  
  constructor(config: Partial<TrendSniperConfig> = {}) {
    this.config = { ...DEFAULT_TREND_SNIPER_CONFIG, ...config };
    this.currentLotSize = this.calculateLotFromRisk(this.config.baseRisk);
  }
  
  /**
   * Analisa candles e gera sinal de trading
   */
  analyzeSignal(candles: TrendbarData[]): SignalResult {
    const closePrices = candles.map(c => c.close);
    
    // Verificar se temos dados suficientes
    if (closePrices.length < this.config.emaPeriod + 10) {
      return {
        signal: "NONE",
        confidence: 0,
        reason: "Dados insuficientes para análise",
        indicators: { ema200: 0, rsi: 0, rsiPrevious: 0, price: 0 },
      };
    }
    
    // Calcular indicadores
    const emaValues = calculateEMA(closePrices, this.config.emaPeriod);
    const rsiValues = calculateRSI(closePrices, this.config.rsiPeriod);
    
    if (emaValues.length < 2 || rsiValues.length < 2) {
      return {
        signal: "NONE",
        confidence: 0,
        reason: "Indicadores não calculados",
        indicators: { ema200: 0, rsi: 0, rsiPrevious: 0, price: 0 },
      };
    }
    
    const currentPrice = closePrices[closePrices.length - 1];
    const currentEma = emaValues[emaValues.length - 1];
    const currentRsi = rsiValues[rsiValues.length - 1];
    const previousRsi = rsiValues[rsiValues.length - 2];
    
    const indicators = {
      ema200: currentEma,
      rsi: currentRsi,
      rsiPrevious: previousRsi,
      price: currentPrice,
    };
    
    // Verificar condições de COMPRA
    // Preço > EMA 200 E RSI cruza 30 para cima
    if (currentPrice > currentEma && 
        previousRsi < this.config.rsiOversold && 
        currentRsi >= this.config.rsiOversold) {
      
      const confidence = this.calculateConfidence(currentPrice, currentEma, currentRsi, "BUY");
      
      return {
        signal: "BUY",
        confidence,
        reason: `Preço (${currentPrice.toFixed(5)}) > EMA200 (${currentEma.toFixed(5)}) e RSI cruzou ${this.config.rsiOversold} para cima (${previousRsi.toFixed(2)} -> ${currentRsi.toFixed(2)})`,
        indicators,
      };
    }
    
    // Verificar condições de VENDA
    // Preço < EMA 200 E RSI cruza 70 para baixo
    if (currentPrice < currentEma && 
        previousRsi > this.config.rsiOverbought && 
        currentRsi <= this.config.rsiOverbought) {
      
      const confidence = this.calculateConfidence(currentPrice, currentEma, currentRsi, "SELL");
      
      return {
        signal: "SELL",
        confidence,
        reason: `Preço (${currentPrice.toFixed(5)}) < EMA200 (${currentEma.toFixed(5)}) e RSI cruzou ${this.config.rsiOverbought} para baixo (${previousRsi.toFixed(2)} -> ${currentRsi.toFixed(2)})`,
        indicators,
      };
    }
    
    // Sem sinal
    return {
      signal: "NONE",
      confidence: 0,
      reason: "Condições de entrada não atendidas",
      indicators,
    };
  }
  
  /**
   * Calcula confiança do sinal (0-100)
   */
  private calculateConfidence(price: number, ema: number, rsi: number, direction: "BUY" | "SELL"): number {
    let confidence = 50; // Base
    
    // Distância do preço à EMA (quanto mais longe, mais forte a tendência)
    const emaDistance = Math.abs((price - ema) / ema) * 100;
    if (emaDistance > 0.5) confidence += 10;
    if (emaDistance > 1.0) confidence += 10;
    
    // RSI extremo
    if (direction === "BUY" && rsi < 35) confidence += 10;
    if (direction === "SELL" && rsi > 65) confidence += 10;
    
    return Math.min(confidence, 100);
  }
  
  /**
   * Calcula Stop Loss e Take Profit
   */
  calculateSLTP(entryPrice: number, direction: TradeSide, pipValue: number): {
    stopLoss: number;
    takeProfit: number | null;
  } {
    const slDistance = this.config.stopLossPips * pipValue;
    
    let stopLoss: number;
    let takeProfit: number | null = null;
    
    if (direction === TradeSide.BUY) {
      stopLoss = entryPrice - slDistance;
      if (this.config.takeProfitPips > 0) {
        takeProfit = entryPrice + (this.config.takeProfitPips * pipValue);
      }
    } else {
      stopLoss = entryPrice + slDistance;
      if (this.config.takeProfitPips > 0) {
        takeProfit = entryPrice - (this.config.takeProfitPips * pipValue);
      }
    }
    
    return { stopLoss, takeProfit };
  }
  
  /**
   * Calcula Trailing Stop
   */
  calculateTrailingStop(
    entryPrice: number,
    currentPrice: number,
    currentStopLoss: number,
    direction: TradeSide,
    pipValue: number
  ): TrailingStopResult {
    if (!this.config.trailingEnabled) {
      return { shouldUpdate: false, newStopLoss: currentStopLoss, profitPips: 0 };
    }
    
    // Calcular lucro em pips
    let profitPips: number;
    if (direction === TradeSide.BUY) {
      profitPips = (currentPrice - entryPrice) / pipValue;
    } else {
      profitPips = (entryPrice - currentPrice) / pipValue;
    }
    
    // Verificar se atingiu trigger
    if (profitPips < this.config.trailingTriggerPips) {
      return { shouldUpdate: false, newStopLoss: currentStopLoss, profitPips };
    }
    
    // Calcular novo stop loss
    const trailingDistance = this.config.trailingStepPips * pipValue;
    let newStopLoss: number;
    
    if (direction === TradeSide.BUY) {
      // Para BUY, SL sobe junto com o preço
      newStopLoss = currentPrice - trailingDistance;
      
      // Só atualiza se o novo SL for maior que o atual
      if (newStopLoss <= currentStopLoss) {
        return { shouldUpdate: false, newStopLoss: currentStopLoss, profitPips };
      }
    } else {
      // Para SELL, SL desce junto com o preço
      newStopLoss = currentPrice + trailingDistance;
      
      // Só atualiza se o novo SL for menor que o atual
      if (newStopLoss >= currentStopLoss) {
        return { shouldUpdate: false, newStopLoss: currentStopLoss, profitPips };
      }
    }
    
    return { shouldUpdate: true, newStopLoss, profitPips };
  }
  
  /**
   * Processa resultado do trade e aplica Smart Compounding
   */
  processTradeResult(profit: number, isWin: boolean): CompoundingResult {
    if (!this.config.compoundingEnabled) {
      return {
        nextLotSize: this.currentLotSize,
        retainedProfit: profit,
        compoundedAmount: 0,
      };
    }
    
    if (isWin && profit > 0) {
      // Win: Reter 50% e usar 50% para compounding
      const retainedProfit = profit * (this.config.retentionPercent / 100);
      const compoundedAmount = profit - retainedProfit;
      
      this.accumulatedProfit += compoundedAmount;
      
      // Calcular novo lote baseado no risco base + acumulado
      const totalRisk = this.config.baseRisk + this.accumulatedProfit;
      this.currentLotSize = this.calculateLotFromRisk(totalRisk);
      
      console.log(`[TrendSniper] WIN: Profit=${profit.toFixed(2)}, Retained=${retainedProfit.toFixed(2)}, Compounded=${compoundedAmount.toFixed(2)}, NextLot=${this.currentLotSize.toFixed(2)}`);
      
      return {
        nextLotSize: this.currentLotSize,
        retainedProfit,
        compoundedAmount,
      };
    } else {
      // Loss: Voltar ao risco base
      this.accumulatedProfit = 0;
      this.currentLotSize = this.calculateLotFromRisk(this.config.baseRisk);
      
      console.log(`[TrendSniper] LOSS: Resetting to base risk. NextLot=${this.currentLotSize.toFixed(2)}`);
      
      return {
        nextLotSize: this.currentLotSize,
        retainedProfit: 0,
        compoundedAmount: 0,
      };
    }
  }
  
  /**
   * Calcula tamanho do lote baseado no risco
   * Assumindo: 1 pip = $10 para 1 lote standard em pares USD
   */
  private calculateLotFromRisk(riskAmount: number): number {
    // Risco por pip = riskAmount / stopLossPips
    const riskPerPip = riskAmount / this.config.stopLossPips;
    
    // 1 lote standard = $10/pip
    // 0.01 lote (micro) = $0.10/pip
    const lotSize = riskPerPip / 10;
    
    // Limitar entre 0.01 e 10 lotes
    return Math.max(0.01, Math.min(10, lotSize));
  }
  
  /**
   * Obtém tamanho atual do lote
   */
  getCurrentLotSize(): number {
    return this.currentLotSize;
  }
  
  /**
   * Obtém configuração atual
   */
  getConfig(): TrendSniperConfig {
    return { ...this.config };
  }
  
  /**
   * Atualiza configuração
   */
  updateConfig(newConfig: Partial<TrendSniperConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
  
  /**
   * Reseta estado do compounding
   */
  resetCompounding(): void {
    this.accumulatedProfit = 0;
    this.currentLotSize = this.calculateLotFromRisk(this.config.baseRisk);
  }
}

// Exportar instância default
export const trendSniperStrategy = new TrendSniperStrategy();
