/**
 * RSI + VWAP Reversal Strategy
 * 
 * Estratégia de reversão à média baseada em RSI e VWAP para trading de alta frequência.
 * Complementa a estratégia SMC, focando em reversões de curto prazo.
 * 
 * Regras de Entrada:
 * - COMPRA: RSI(14) < 30 (sobrevenda) + Preço abaixo do VWAP + Candle bullish
 * - VENDA: RSI(14) > 70 (sobrecompra) + Preço acima do VWAP + Candle bearish
 * 
 * Gestão de Posição:
 * - Stop Loss: 10 pips fixo ou abaixo/acima do candle de sinal
 * - Take Profit: 20 pips fixo (R:R 1:2)
 * - Risco por trade: 1.0%
 * 
 * IMPORTANTE: Esta estratégia NÃO implementa lógica própria de volume/ordens.
 * Ela apenas gera sinais que são executados pelo pipeline existente (CTraderAdapter),
 * preservando a correção de volume (* 10000000) do CTraderClient.ts.
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
import { getPipValue as getCentralizedPipValue } from "../../../shared/normalizationUtils";

// ============= TIPOS E INTERFACES =============

/**
 * Configuração específica da estratégia RSI + VWAP
 */
export interface RsiVwapStrategyConfig extends BaseStrategyConfig {
  // Indicadores RSI
  rsiPeriod: number;          // Período do RSI (default: 14)
  rsiOversold: number;        // Nível de sobrevenda (default: 30)
  rsiOverbought: number;      // Nível de sobrecompra (default: 70)
  
  // VWAP
  vwapEnabled: boolean;       // Usar VWAP como filtro
  
  // Gestão de Risco
  riskPercentage: number;     // Risco por trade (default: 1.0%)
  stopLossPips: number;       // Stop Loss fixo em pips (default: 10)
  takeProfitPips: number;     // Take Profit fixo em pips (default: 20)
  rewardRiskRatio: number;    // R:R ratio (default: 2.0)
  
  // Filtros
  minCandleBodyPercent: number; // Mínimo de corpo do candle para confirmação (default: 30%)
  spreadFilterEnabled: boolean;
  maxSpreadPips: number;
  
  // Horários de operação (UTC-3 Brasília)
  sessionFilterEnabled: boolean;
  sessionStart: string;       // Início da sessão (default: "08:00")
  sessionEnd: string;         // Fim da sessão (default: "17:00")
  
  // Trailing Stop (opcional)
  trailingEnabled: boolean;
  trailingTriggerPips: number;
  trailingStepPips: number;
  
  // Logging
  verboseLogging: boolean;
}

/**
 * Resultado do cálculo do VWAP
 */
interface VWAPResult {
  value: number;
  upperBand: number;
  lowerBand: number;
}

// ============= CONFIGURAÇÃO PADRÃO =============

export const DEFAULT_RSI_VWAP_CONFIG: RsiVwapStrategyConfig = {
  strategyType: StrategyType.RSI_VWAP_REVERSAL,
  
  // RSI
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  
  // VWAP
  vwapEnabled: true,
  
  // Risco - Conservador para estratégia de alta frequência
  riskPercentage: 1.0,
  stopLossPips: 10,
  takeProfitPips: 20,
  rewardRiskRatio: 2.0,
  
  // Filtros
  minCandleBodyPercent: 30,
  spreadFilterEnabled: true,
  maxSpreadPips: 2.0,
  
  // Horários
  sessionFilterEnabled: true,
  sessionStart: "08:00",
  sessionEnd: "17:00",
  
  // Trailing
  trailingEnabled: false,
  trailingTriggerPips: 15,
  trailingStepPips: 5,
  
  // Logging
  verboseLogging: true,
};

// ============= FUNÇÕES AUXILIARES DE INDICADORES =============

/**
 * Calcula RSI (Relative Strength Index)
 * Reutiliza a lógica já existente em TrendSniperStrategy.ts
 */
function calculateRSI(prices: number[], period: number): number[] {
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
 * Calcula VWAP (Volume Weighted Average Price)
 * 
 * VWAP = Σ(Preço Típico × Volume) / Σ(Volume)
 * Preço Típico = (High + Low + Close) / 3
 * 
 * Reset diário: O VWAP é calculado desde o início do dia de trading
 */
function calculateVWAP(candles: TrendbarData[]): VWAPResult {
  if (candles.length === 0) {
    return { value: 0, upperBand: 0, lowerBand: 0 };
  }
  
  // Identificar início do dia atual (00:00 UTC)
  const lastCandle = candles[candles.length - 1];
  const lastDate = new Date(lastCandle.timestamp);
  const dayStart = new Date(lastDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayStartTimestamp = dayStart.getTime();
  
  // Filtrar candles do dia atual
  const todayCandles = candles.filter(c => c.timestamp >= dayStartTimestamp);
  
  if (todayCandles.length === 0) {
    // Se não há candles do dia atual, usar últimos 50 candles
    const recentCandles = candles.slice(-50);
    return calculateVWAPFromCandles(recentCandles);
  }
  
  return calculateVWAPFromCandles(todayCandles);
}

/**
 * Calcula VWAP a partir de um conjunto de candles
 */
function calculateVWAPFromCandles(candles: TrendbarData[]): VWAPResult {
  if (candles.length === 0) {
    return { value: 0, upperBand: 0, lowerBand: 0 };
  }
  
  let cumulativeTPV = 0;  // Cumulative (Typical Price × Volume)
  let cumulativeVolume = 0;
  const squaredDeviations: number[] = [];
  
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const volume = candle.volume || 1;  // Fallback para 1 se volume não disponível
    
    cumulativeTPV += typicalPrice * volume;
    cumulativeVolume += volume;
    
    // Calcular VWAP até este ponto para desvio padrão
    const currentVWAP = cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : typicalPrice;
    squaredDeviations.push(Math.pow(typicalPrice - currentVWAP, 2) * volume);
  }
  
  const vwap = cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : 0;
  
  // Calcular desvio padrão para bandas
  const sumSquaredDeviations = squaredDeviations.reduce((a, b) => a + b, 0);
  const stdDev = Math.sqrt(sumSquaredDeviations / cumulativeVolume);
  
  return {
    value: vwap,
    upperBand: vwap + (stdDev * 2),
    lowerBand: vwap - (stdDev * 2),
  };
}

// ============= CLASSE PRINCIPAL =============

/**
 * Implementação da estratégia RSI + VWAP Reversal
 * 
 * IMPORTANTE: Esta classe implementa ITradingStrategy e é projetada para
 * funcionar com o pipeline existente de execução de ordens. Ela NÃO
 * implementa lógica própria de envio de ordens ou cálculo de volume.
 */
export class RsiVwapStrategy implements ITradingStrategy {
  private config: RsiVwapStrategyConfig;
  private currentSymbol: string = "";
  
  constructor(config: Partial<RsiVwapStrategyConfig> = {}) {
    this.config = { ...DEFAULT_RSI_VWAP_CONFIG, ...config };
    
    console.log(`[RSI_VWAP] Estratégia inicializada`);
    console.log(`[RSI_VWAP] RSI Period: ${this.config.rsiPeriod} | Oversold: ${this.config.rsiOversold} | Overbought: ${this.config.rsiOverbought}`);
    console.log(`[RSI_VWAP] Risk: ${this.config.riskPercentage}% | SL: ${this.config.stopLossPips} pips | TP: ${this.config.takeProfitPips} pips`);
  }
  
  // ============= INTERFACE ITradingStrategy =============
  
  getStrategyType(): StrategyType {
    return StrategyType.RSI_VWAP_REVERSAL;
  }
  
  /**
   * Define o símbolo atual sendo analisado
   */
  setCurrentSymbol(symbol: string): void {
    this.currentSymbol = symbol;
  }
  
  /**
   * Analisa os dados de mercado e gera sinal de trading
   * 
   * Lógica de Compra (Long):
   * 1. RSI(14) cruza para baixo de 30 (sobrevenda)
   * 2. Preço de fechamento está ABAIXO do VWAP
   * 3. Candle de reversão bullish (close > open)
   * 
   * Lógica de Venda (Short):
   * 1. RSI(14) cruza para cima de 70 (sobrecompra)
   * 2. Preço de fechamento está ACIMA do VWAP
   * 3. Candle de reversão bearish (close < open)
   */
  analyzeSignal(candles: TrendbarData[], mtfData?: MultiTimeframeData): SignalResult {
    // Verificar dados mínimos
    if (candles.length < this.config.rsiPeriod + 5) {
      return this.createNoSignal("Dados insuficientes para análise RSI+VWAP");
    }
    
    // Verificar filtro de spread
    if (this.config.spreadFilterEnabled && mtfData?.currentSpreadPips !== undefined) {
      if (mtfData.currentSpreadPips > this.config.maxSpreadPips) {
        return this.createNoSignal(`Spread alto: ${mtfData.currentSpreadPips.toFixed(1)} pips > max ${this.config.maxSpreadPips} pips`);
      }
    }
    
    // Verificar horário de operação
    if (this.config.sessionFilterEnabled && !this.isWithinTradingSession()) {
      return this.createNoSignal("Fora do horário de operação RSI+VWAP");
    }
    
    // Extrair preços de fechamento
    const closePrices = candles.map(c => c.close);
    
    // Calcular RSI
    const rsiValues = calculateRSI(closePrices, this.config.rsiPeriod);
    if (rsiValues.length < 2) {
      return this.createNoSignal("RSI não calculado");
    }
    
    const currentRsi = rsiValues[rsiValues.length - 1];
    const previousRsi = rsiValues[rsiValues.length - 2];
    
    // Calcular VWAP
    const vwap = calculateVWAP(candles);
    if (vwap.value === 0) {
      return this.createNoSignal("VWAP não calculado");
    }
    
    // Obter último candle
    const lastCandle = candles[candles.length - 1];
    const currentPrice = lastCandle.close;
    
    // Calcular corpo do candle (para confirmação)
    const candleRange = lastCandle.high - lastCandle.low;
    const candleBody = Math.abs(lastCandle.close - lastCandle.open);
    const bodyPercent = candleRange > 0 ? (candleBody / candleRange) * 100 : 0;
    
    // Verificar se candle tem corpo suficiente
    const hasValidBody = bodyPercent >= this.config.minCandleBodyPercent;
    
    // Indicadores para o resultado
    const indicators = {
      rsi: currentRsi,
      rsiPrevious: previousRsi,
      vwap: vwap.value,
      price: currentPrice,
      bodyPercent: bodyPercent,
    };
    
    // ========== LÓGICA DE COMPRA ==========
    // RSI < 30 (sobrevenda) + Preço abaixo VWAP + Candle bullish
    if (currentRsi < this.config.rsiOversold && 
        currentPrice < vwap.value && 
        lastCandle.close > lastCandle.open &&
        hasValidBody) {
      
      const confidence = this.calculateConfidence(currentRsi, currentPrice, vwap.value, "BUY");
      
      return {
        signal: "BUY",
        confidence,
        reason: `RSI Oversold (${currentRsi.toFixed(1)}) abaixo de VWAP (${vwap.value.toFixed(5)}) + Bullish Reversal`,
        indicators,
        metadata: {
          strategy: "RSI_VWAP_REVERSAL",
          vwapValue: vwap.value,
          rsiValue: currentRsi,
          signalType: "OVERSOLD_REVERSAL",
        },
      };
    }
    
    // ========== LÓGICA DE VENDA ==========
    // RSI > 70 (sobrecompra) + Preço acima VWAP + Candle bearish
    if (currentRsi > this.config.rsiOverbought && 
        currentPrice > vwap.value && 
        lastCandle.close < lastCandle.open &&
        hasValidBody) {
      
      const confidence = this.calculateConfidence(currentRsi, currentPrice, vwap.value, "SELL");
      
      return {
        signal: "SELL",
        confidence,
        reason: `RSI Overbought (${currentRsi.toFixed(1)}) acima de VWAP (${vwap.value.toFixed(5)}) + Bearish Reversal`,
        indicators,
        metadata: {
          strategy: "RSI_VWAP_REVERSAL",
          vwapValue: vwap.value,
          rsiValue: currentRsi,
          signalType: "OVERBOUGHT_REVERSAL",
        },
      };
    }
    
    // Sem sinal
    return this.createNoSignal("Condições de entrada RSI+VWAP não atendidas");
  }
  
  /**
   * Calcula Stop Loss e Take Profit
   * 
   * Usa valores fixos em pips conforme especificação:
   * - SL: 10 pips
   * - TP: 20 pips (R:R 1:2)
   */
  calculateSLTP(
    entryPrice: number,
    direction: TradeSide,
    pipValue: number,
    metadata?: Record<string, any>
  ): SLTPResult {
    const slDistance = this.config.stopLossPips * pipValue;
    const tpDistance = this.config.takeProfitPips * pipValue;
    
    let stopLoss: number;
    let takeProfit: number;
    
    if (direction === TradeSide.BUY) {
      stopLoss = entryPrice - slDistance;
      takeProfit = entryPrice + tpDistance;
    } else {
      stopLoss = entryPrice + slDistance;
      takeProfit = entryPrice - tpDistance;
    }
    
    return {
      stopLoss,
      takeProfit,
      stopLossPips: this.config.stopLossPips,
      takeProfitPips: this.config.takeProfitPips,
    };
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
      newStopLoss = currentPrice - trailingDistance;
      if (newStopLoss <= currentStopLoss) {
        return { shouldUpdate: false, newStopLoss: currentStopLoss, profitPips };
      }
    } else {
      newStopLoss = currentPrice + trailingDistance;
      if (newStopLoss >= currentStopLoss) {
        return { shouldUpdate: false, newStopLoss: currentStopLoss, profitPips };
      }
    }
    
    return { shouldUpdate: true, newStopLoss, profitPips };
  }
  
  /**
   * Calcula tamanho da posição baseado no risco
   * 
   * IMPORTANTE: Este método é usado apenas para referência.
   * O cálculo real de volume é feito pelo RiskManager existente,
   * que já implementa a normalização correta para a cTrader API.
   */
  calculatePositionSize(
    accountBalance: number,
    stopLossPips: number,
    pipValue: number
  ): PositionSizeResult {
    const riskAmount = accountBalance * (this.config.riskPercentage / 100);
    const lotSize = riskAmount / (stopLossPips * pipValue);
    
    return {
      lotSize,
      riskUsd: riskAmount,
      riskPercent: this.config.riskPercentage,
    };
  }
  
  /**
   * Retorna configuração atual
   */
  getConfig(): RsiVwapStrategyConfig {
    return { ...this.config };
  }
  
  /**
   * Atualiza configuração
   */
  updateConfig(config: Partial<RsiVwapStrategyConfig>): void {
    this.config = { ...this.config, ...config };
    console.log(`[RSI_VWAP] Configuração atualizada`);
  }
  
  /**
   * Verifica se está pronto para operar
   */
  isReadyToTrade(currentTime?: number): boolean {
    if (this.config.sessionFilterEnabled) {
      return this.isWithinTradingSession();
    }
    return true;
  }
  
  /**
   * Reseta estado interno
   */
  reset(): void {
    console.log(`[RSI_VWAP] Estado resetado`);
  }
  
  // ============= MÉTODOS PRIVADOS =============
  
  /**
   * Cria resultado de sinal vazio
   */
  private createNoSignal(reason: string): SignalResult {
    return {
      signal: "NONE",
      confidence: 0,
      reason,
      indicators: {},
    };
  }
  
  /**
   * Calcula confiança do sinal (0-100)
   */
  private calculateConfidence(
    rsi: number,
    price: number,
    vwap: number,
    direction: "BUY" | "SELL"
  ): number {
    let confidence = 50; // Base
    
    // RSI extremo aumenta confiança
    if (direction === "BUY") {
      if (rsi < 25) confidence += 15;
      else if (rsi < 28) confidence += 10;
      
      // Distância do VWAP (quanto mais abaixo, melhor para compra)
      const vwapDistance = ((vwap - price) / vwap) * 100;
      if (vwapDistance > 0.3) confidence += 10;
      if (vwapDistance > 0.5) confidence += 5;
    } else {
      if (rsi > 75) confidence += 15;
      else if (rsi > 72) confidence += 10;
      
      // Distância do VWAP (quanto mais acima, melhor para venda)
      const vwapDistance = ((price - vwap) / vwap) * 100;
      if (vwapDistance > 0.3) confidence += 10;
      if (vwapDistance > 0.5) confidence += 5;
    }
    
    return Math.min(confidence, 100);
  }
  
  /**
   * Verifica se está dentro do horário de trading
   */
  private isWithinTradingSession(): boolean {
    const now = new Date();
    // Converter para UTC-3 (Brasília)
    const brasiliaOffset = -3 * 60;
    const localOffset = now.getTimezoneOffset();
    const brasiliaTime = new Date(now.getTime() + (localOffset + brasiliaOffset) * 60 * 1000);
    
    const currentHour = brasiliaTime.getHours();
    const currentMinute = brasiliaTime.getMinutes();
    const currentTimeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
    
    const [startHour, startMinute] = this.config.sessionStart.split(':').map(Number);
    const [endHour, endMinute] = this.config.sessionEnd.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    const currentMinutes = currentHour * 60 + currentMinute;
    
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }
}

// ============= FACTORY FUNCTION =============

/**
 * Cria instância da estratégia RSI+VWAP
 */
export function createRsiVwapStrategy(config?: Partial<RsiVwapStrategyConfig>): RsiVwapStrategy {
  return new RsiVwapStrategy(config);
}
