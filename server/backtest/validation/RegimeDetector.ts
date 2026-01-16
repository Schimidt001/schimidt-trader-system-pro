/**
 * RegimeDetector - Detector de Regimes de Mercado sem Look-Ahead
 * 
 * IMPLEMENTAÇÃO WP5: Regime Detection e performance por regime
 * 
 * Implementa detecção de regimes de mercado com:
 * - P0 - Anti look-ahead: regime do trade usa apenas dados até o timestamp do trade
 * - Classificação em tempo real (online)
 * - Análise de performance por regime
 * - Warnings quando performance depende de um único regime
 * 
 * Regimes detectados:
 * - TRENDING_UP: Tendência de alta
 * - TRENDING_DOWN: Tendência de baixa
 * - RANGING: Mercado lateral/consolidação
 * - HIGH_VOLATILITY: Alta volatilidade
 * - LOW_VOLATILITY: Baixa volatilidade
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { CandleData } from "../../adapters/IBrokerAdapter";
import { BacktestTrade, BacktestMetrics } from "../types/backtest.types";
import { validationLogger } from "../utils/LabLogger";
import {
  MarketRegimeType,
  RegimeDetectionConfig,
  RegimePeriod,
  RegimeDetectionResult,
  ValidationProgress,
} from "./types/validation.types";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Métricas de um período de análise
 */
interface PeriodMetrics {
  avgReturn: number;
  volatility: number;
  trendStrength: number;
  rangePercent: number;
  adx: number;
}

/**
 * Trade com regime associado
 */
export interface TradeWithRegime extends BacktestTrade {
  regime: MarketRegimeType;
  regimeConfidence: number;
}

/**
 * Performance por regime
 */
export interface RegimePerformance {
  regime: MarketRegimeType;
  trades: number;
  winRate: number;
  avgProfit: number;
  totalProfit: number;
  profitFactor: number;
  sharpeRatio: number;
  contribution: number; // % do lucro total
}

// ============================================================================
// REGIME DETECTOR CLASS
// ============================================================================

export class RegimeDetector {
  private config: RegimeDetectionConfig;
  private progressCallback?: (progress: ValidationProgress) => void;
  
  // Cache de dados para cálculos
  private priceHistory: number[] = [];
  private returnHistory: number[] = [];
  private volatilityHistory: number[] = [];
  
  constructor(config: RegimeDetectionConfig) {
    this.config = config;
  }
  
  /**
   * Definir callback de progresso
   */
  setProgressCallback(callback: (progress: ValidationProgress) => void): void {
    this.progressCallback = callback;
  }
  
  /**
   * Detectar regimes para um conjunto de candles
   * 
   * IMPORTANTE: Esta função é "online" - para cada candle,
   * usa apenas dados até aquele momento (sem look-ahead).
   */
  detectRegimes(candles: CandleData[]): RegimePeriod[] {
    validationLogger.info(`Detectando regimes para ${candles.length} candles...`, "RegimeDetector");
    
    const regimes: RegimePeriod[] = [];
    let currentRegime: MarketRegimeType | null = null;
    let regimeStart: Date | null = null;
    let regimeCandles: CandleData[] = [];
    
    // Reset cache
    this.priceHistory = [];
    this.returnHistory = [];
    this.volatilityHistory = [];
    
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      
      // Adicionar ao histórico (apenas dados até este ponto)
      this.priceHistory.push(candle.close);
      
      if (i > 0) {
        const prevClose = candles[i - 1].close;
        const returnPct = ((candle.close - prevClose) / prevClose) * 100;
        this.returnHistory.push(returnPct);
      }
      
      // Precisamos de dados suficientes para detectar regime
      if (i < this.config.lookbackPeriod) {
        continue;
      }
      
      // Detectar regime APENAS com dados até este momento (anti look-ahead)
      const { regime, confidence } = this.classifyRegimeOnline(i);
      
      // Verificar mudança de regime
      if (regime !== currentRegime) {
        // Fechar regime anterior
        if (currentRegime !== null && regimeStart !== null) {
          regimes.push({
            regime: currentRegime,
            startDate: regimeStart,
            endDate: new Date(candle.timestamp),
            confidence: this.calculatePeriodConfidence(regimeCandles),
            metrics: this.calculatePeriodMetrics(regimeCandles),
          });
        }
        
        // Iniciar novo regime
        currentRegime = regime;
        regimeStart = new Date(candle.timestamp);
        regimeCandles = [candle];
      } else {
        regimeCandles.push(candle);
      }
      
      // Atualizar progresso
      if (this.progressCallback && i % 1000 === 0) {
        this.progressCallback({
          validationType: "REGIME_DETECTION",
          phase: "DETECTING",
          percentComplete: (i / candles.length) * 100,
          currentItem: i,
          totalItems: candles.length,
          statusMessage: `Processando candle ${i}/${candles.length}`,
          estimatedTimeRemaining: 0,
        });
      }
    }
    
    // Fechar último regime
    if (currentRegime !== null && regimeStart !== null && regimeCandles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      regimes.push({
        regime: currentRegime,
        startDate: regimeStart,
        endDate: new Date(lastCandle.timestamp),
        confidence: this.calculatePeriodConfidence(regimeCandles),
        metrics: this.calculatePeriodMetrics(regimeCandles),
      });
    }
    
    validationLogger.info(`${regimes.length} regimes detectados`, "RegimeDetector");
    
    return regimes;
  }
  
  /**
   * Classificar regime usando apenas dados até o índice atual (online/anti look-ahead)
   */
  private classifyRegimeOnline(currentIndex: number): { regime: MarketRegimeType; confidence: number } {
    const lookback = this.config.lookbackPeriod;
    
    // Obter dados do período de lookback (apenas dados passados)
    const startIndex = Math.max(0, currentIndex - lookback);
    const prices = this.priceHistory.slice(startIndex, currentIndex + 1);
    const returns = this.returnHistory.slice(Math.max(0, startIndex - 1), currentIndex);
    
    if (prices.length < 10) {
      return { regime: MarketRegimeType.UNKNOWN, confidence: 0 };
    }
    
    // Calcular métricas
    const volatility = this.calculateVolatility(returns);
    const trendStrength = this.calculateTrendStrength(prices);
    const rangePercent = this.calculateRangePercent(prices);
    
    // Classificar baseado em thresholds
    let regime: MarketRegimeType;
    let confidence: number;
    
    // Alta volatilidade tem prioridade
    if (volatility > this.config.volatilityThreshold * 1.5) {
      regime = MarketRegimeType.HIGH_VOLATILITY;
      confidence = Math.min(100, (volatility / this.config.volatilityThreshold) * 50);
    }
    // Baixa volatilidade
    else if (volatility < this.config.volatilityThreshold * 0.5) {
      regime = MarketRegimeType.LOW_VOLATILITY;
      confidence = Math.min(100, ((this.config.volatilityThreshold - volatility) / this.config.volatilityThreshold) * 100);
    }
    // Tendência forte
    else if (Math.abs(trendStrength) > this.config.trendThreshold) {
      regime = trendStrength > 0 ? MarketRegimeType.TRENDING_UP : MarketRegimeType.TRENDING_DOWN;
      confidence = Math.min(100, (Math.abs(trendStrength) / this.config.trendThreshold) * 50);
    }
    // Ranging
    else if (rangePercent < this.config.rangeThreshold) {
      regime = MarketRegimeType.RANGING;
      confidence = Math.min(100, ((this.config.rangeThreshold - rangePercent) / this.config.rangeThreshold) * 100);
    }
    // Default
    else {
      regime = MarketRegimeType.UNKNOWN;
      confidence = 30;
    }
    
    return { regime, confidence };
  }
  
  /**
   * Calcular volatilidade (desvio padrão dos retornos)
   */
  private calculateVolatility(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const squaredDiffs = returns.map(r => Math.pow(r - avg, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / returns.length);
  }
  
  /**
   * Calcular força da tendência (regressão linear)
   */
  private calculateTrendStrength(prices: number[]): number {
    if (prices.length < 2) return 0;
    
    const n = prices.length;
    const xMean = (n - 1) / 2;
    const yMean = prices.reduce((a, b) => a + b, 0) / n;
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (prices[i] - yMean);
      denominator += Math.pow(i - xMean, 2);
    }
    
    if (denominator === 0) return 0;
    
    const slope = numerator / denominator;
    
    // Normalizar pelo preço médio
    return (slope / yMean) * 100;
  }
  
  /**
   * Calcular range percentual (high-low / média)
   */
  private calculateRangePercent(prices: number[]): number {
    if (prices.length === 0) return 0;
    
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    
    if (avg === 0) return 0;
    
    return ((high - low) / avg) * 100;
  }
  
  /**
   * Calcular confiança média de um período
   */
  private calculatePeriodConfidence(candles: CandleData[]): number {
    // Simplificação: confiança baseada na consistência do período
    if (candles.length < 2) return 50;
    
    const prices = candles.map(c => c.close);
    const volatility = this.calculateVolatility(
      prices.slice(1).map((p, i) => ((p - prices[i]) / prices[i]) * 100)
    );
    
    // Menor volatilidade = maior confiança na classificação
    return Math.max(30, Math.min(95, 100 - volatility * 10));
  }
  
  /**
   * Calcular métricas de um período de regime
   */
  private calculatePeriodMetrics(candles: CandleData[]): RegimePeriod["metrics"] {
    if (candles.length === 0) {
      return {
        avgVolatility: 0,
        trendStrength: 0,
        avgRange: 0,
        duration: 0,
      };
    }
    
    const prices = candles.map(c => c.close);
    const returns = prices.slice(1).map((p, i) => ((p - prices[i]) / prices[i]) * 100);
    
    return {
      avgVolatility: this.calculateVolatility(returns),
      trendStrength: this.calculateTrendStrength(prices),
      avgRange: this.calculateRangePercent(prices),
      duration: candles.length,
    };
  }
  
  /**
   * Associar trades aos seus regimes
   * 
   * IMPORTANTE: Usa o regime vigente NO MOMENTO DA ENTRADA do trade
   * (anti look-ahead)
   */
  associateTradesWithRegimes(
    trades: BacktestTrade[],
    regimes: RegimePeriod[]
  ): TradeWithRegime[] {
    validationLogger.debug(`Associando ${trades.length} trades a regimes...`, "RegimeDetector");
    
    return trades.map(trade => {
      // Encontrar regime vigente no momento da entrada
      const tradeOpenTime = new Date(trade.openTimestamp);
      
      const regime = regimes.find(r => 
        tradeOpenTime >= r.startDate && tradeOpenTime < r.endDate
      );
      
      return {
        ...trade,
        regime: regime?.regime || MarketRegimeType.UNKNOWN,
        regimeConfidence: regime?.confidence || 0,
      };
    });
  }
  
  /**
   * Analisar performance por regime
   */
  analyzePerformanceByRegime(tradesWithRegime: TradeWithRegime[]): RegimePerformance[] {
    validationLogger.debug("Analisando performance por regime...", "RegimeDetector");
    
    // Agrupar trades por regime
    const tradesByRegime = new Map<MarketRegimeType, TradeWithRegime[]>();
    
    for (const trade of tradesWithRegime) {
      const existing = tradesByRegime.get(trade.regime) || [];
      existing.push(trade);
      tradesByRegime.set(trade.regime, existing);
    }
    
    // Calcular performance de cada regime
    const totalProfit = tradesWithRegime.reduce((sum, t) => sum + t.profit, 0);
    const performances: RegimePerformance[] = [];
    
    for (const [regime, trades] of tradesByRegime) {
      const winningTrades = trades.filter(t => t.profit > 0);
      const losingTrades = trades.filter(t => t.profit < 0);
      
      const grossProfit = winningTrades.reduce((sum, t) => sum + t.profit, 0);
      const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));
      const regimeProfit = grossProfit - grossLoss;
      
      const avgProfit = trades.length > 0 
        ? trades.reduce((sum, t) => sum + t.profit, 0) / trades.length 
        : 0;
      
      const winRate = trades.length > 0 
        ? (winningTrades.length / trades.length) * 100 
        : 0;
      
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
      
      // Sharpe simplificado
      const returns = trades.map(t => t.profit);
      const avgReturn = this.mean(returns);
      const stdReturn = this.standardDeviation(returns);
      const sharpeRatio = stdReturn > 0 ? avgReturn / stdReturn : 0;
      
      // Contribuição para o lucro total
      const contribution = totalProfit !== 0 ? (regimeProfit / totalProfit) * 100 : 0;
      
      performances.push({
        regime,
        trades: trades.length,
        winRate,
        avgProfit,
        totalProfit: regimeProfit,
        profitFactor,
        sharpeRatio,
        contribution,
      });
    }
    
    // Ordenar por contribuição
    performances.sort((a, b) => b.contribution - a.contribution);
    
    return performances;
  }
  
  /**
   * Gerar resultado completo de detecção de regimes
   */
  async analyze(
    candles: CandleData[],
    trades: BacktestTrade[]
  ): Promise<RegimeDetectionResult> {
    validationLogger.info("Iniciando análise completa...", "RegimeDetector");
    
    // 1. Detectar regimes
    const regimes = this.detectRegimes(candles);
    
    // 2. Associar trades
    const tradesWithRegime = this.associateTradesWithRegimes(trades, regimes);
    
    // 3. Analisar performance
    const performanceByRegime = this.analyzePerformanceByRegime(tradesWithRegime);
    
    // 4. Gerar warnings
    const warnings = this.generateWarnings(performanceByRegime, regimes);
    
    // 5. Calcular estatísticas gerais
    const regimeDistribution = this.calculateRegimeDistribution(regimes);
    const dominantRegime = this.findDominantRegime(performanceByRegime);
    
    validationLogger.info(`✅ Análise concluída - Regime dominante: ${dominantRegime}, Warnings: ${warnings.length}`, "RegimeDetector");
    
    return {
      regimes,
      tradesWithRegime,
      performanceByRegime,
      regimeDistribution,
      dominantRegime,
      warnings,
    };
  }
  
  /**
   * Gerar warnings sobre dependência de regimes
   */
  private generateWarnings(
    performance: RegimePerformance[],
    regimes: RegimePeriod[]
  ): string[] {
    const warnings: string[] = [];
    
    // Warning 1: Performance depende de um único regime
    const topRegime = performance[0];
    if (topRegime && topRegime.contribution > 70) {
      warnings.push(
        `⚠️ ${topRegime.contribution.toFixed(1)}% do lucro vem do regime ${topRegime.regime}. ` +
        `Estratégia pode não funcionar em outros regimes.`
      );
    }
    
    // Warning 2: Regime com poucos trades
    for (const perf of performance) {
      if (perf.trades < 10 && perf.contribution > 20) {
        warnings.push(
          `⚠️ Regime ${perf.regime} tem apenas ${perf.trades} trades mas contribui ${perf.contribution.toFixed(1)}% do lucro. ` +
          `Amostra insuficiente para validação.`
        );
      }
    }
    
    // Warning 3: Regime com winrate muito diferente
    const avgWinRate = performance.reduce((sum, p) => sum + p.winRate, 0) / performance.length;
    for (const perf of performance) {
      if (Math.abs(perf.winRate - avgWinRate) > 20) {
        warnings.push(
          `⚠️ Winrate no regime ${perf.regime} (${perf.winRate.toFixed(1)}%) difere significativamente ` +
          `da média (${avgWinRate.toFixed(1)}%).`
        );
      }
    }
    
    // Warning 4: Regime perdedor significativo
    for (const perf of performance) {
      if (perf.totalProfit < 0 && perf.trades > 10) {
        warnings.push(
          `⚠️ Regime ${perf.regime} é consistentemente perdedor (${perf.totalProfit.toFixed(2)}). ` +
          `Considere filtrar trades neste regime.`
        );
      }
    }
    
    return warnings;
  }
  
  /**
   * Calcular distribuição de regimes
   */
  private calculateRegimeDistribution(regimes: RegimePeriod[]): Record<MarketRegimeType, number> {
    const distribution: Record<MarketRegimeType, number> = {
      [MarketRegimeType.TRENDING_UP]: 0,
      [MarketRegimeType.TRENDING_DOWN]: 0,
      [MarketRegimeType.RANGING]: 0,
      [MarketRegimeType.HIGH_VOLATILITY]: 0,
      [MarketRegimeType.LOW_VOLATILITY]: 0,
      [MarketRegimeType.UNKNOWN]: 0,
    };
    
    const totalDuration = regimes.reduce((sum, r) => sum + r.metrics.duration, 0);
    
    for (const regime of regimes) {
      distribution[regime.regime] += (regime.metrics.duration / totalDuration) * 100;
    }
    
    return distribution;
  }
  
  /**
   * Encontrar regime dominante (maior contribuição para lucro)
   */
  private findDominantRegime(performance: RegimePerformance[]): MarketRegimeType {
    if (performance.length === 0) return MarketRegimeType.UNKNOWN;
    return performance[0].regime;
  }
  
  /**
   * Calcular média
   */
  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
  
  /**
   * Calcular desvio padrão
   */
  private standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = this.mean(values);
    const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(this.mean(squaredDiffs));
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Criar detector de regimes
 */
export function createRegimeDetector(config: RegimeDetectionConfig): RegimeDetector {
  return new RegimeDetector(config);
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_REGIME_DETECTION_CONFIG: RegimeDetectionConfig = {
  lookbackPeriod: 50,
  volatilityThreshold: 1.5,
  trendThreshold: 0.5,
  rangeThreshold: 3.0,
  minRegimeDuration: 10,
};

// ============================================================================
// EXPORTS
// ============================================================================

export default RegimeDetector;
