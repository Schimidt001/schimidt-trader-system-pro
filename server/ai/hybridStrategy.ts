/**
 * Módulo de Estratégia Híbrida de IA
 * 
 * Implementa a lógica de decisão da IA para determinar:
 * 1. Se um trade tem alta confiança (Filtro)
 * 2. Se deve aplicar hedge em trades de baixa confiança
 * 3. Qual stake usar baseado na confiança
 * 4. Análise de amplitude do candle para prever movimento futuro
 */

import type { AmplitudePredictionResponse } from '../prediction/predictionService';

export interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface AIDecision {
  confidence: 'HIGH' | 'NORMAL';
  shouldEnter: boolean;
  shouldHedge: boolean;
  stake: number;
  reason: string;
  amplitudeAnalysis?: AmplitudePredictionResponse;
  finalConfidenceScore?: number;
}

export interface AIConfig {
  stakeHighConfidence: number; // em centavos
  stakeNormalConfidence: number; // em centavos
  aiFilterThreshold: number; // 0-100
  aiHedgeEnabled: boolean;
}

/**
 * Calcula features do candle nos últimos 1.5 minutos (T-90s)
 * Baseado na análise empírica dos 3000 candles
 */
export function calculateAIFeatures(candle: CandleData, checkMinutes: number = 13.5): {
  posInRange: number;
  bodyRatio: number;
  volatility: number;
} {
  const totalMinutes = 15; // M15
  const ratio = checkMinutes / totalMinutes;
  
  // Simular o estado do candle em checkMinutes
  const priceAtCheckTime = candle.open + (candle.close - candle.open) * ratio;
  const highAtCheckTime = candle.low + (candle.high - candle.low) * ratio;
  const lowAtCheckTime = candle.low;
  
  const candleRange = highAtCheckTime - lowAtCheckTime;
  
  // Feature 1: Posição do preço no range (0-1)
  const posInRange = candleRange > 0 
    ? (priceAtCheckTime - lowAtCheckTime) / candleRange 
    : 0.5;
  
  // Feature 2: Body ratio (força direcional)
  const bodyRatio = candleRange > 0
    ? Math.abs(priceAtCheckTime - candle.open) / candleRange
    : 0;
  
  // Feature 3: Volatilidade normalizada
  const volatility = candle.open > 0
    ? candleRange / candle.open
    : 0;
  
  return { posInRange, bodyRatio, volatility };
}

/**
 * Avalia a confiança do trade baseado nas features da IA
 * Retorna um score de 0-100
 */
export function evaluateConfidence(
  features: { posInRange: number; bodyRatio: number; volatility: number },
  predictedDirection: 'up' | 'down'
): number {
  const { posInRange, bodyRatio, volatility } = features;
  
  let confidenceScore = 50; // Base: 50%
  
  // Critério 1: Posição no range deve estar alinhada com a direção
  if (predictedDirection === 'up') {
    // Para UP, queremos pos_in_range alto (preço perto da máxima)
    if (posInRange > 0.60) confidenceScore += 25;
    else if (posInRange > 0.55) confidenceScore += 15;
    else if (posInRange < 0.45) confidenceScore -= 20; // Sinal contrário
  } else {
    // Para DOWN, queremos pos_in_range baixo (preço perto da mínima)
    if (posInRange < 0.40) confidenceScore += 25;
    else if (posInRange < 0.45) confidenceScore += 15;
    else if (posInRange > 0.55) confidenceScore -= 20; // Sinal contrário
  }
  
  // Critério 2: Body ratio deve mostrar força direcional
  if (bodyRatio > 0.30) confidenceScore += 15;
  else if (bodyRatio > 0.25) confidenceScore += 10;
  else if (bodyRatio < 0.15) confidenceScore -= 10; // Fraco
  
  // Critério 3: Volatilidade deve ser significativa (não ruído)
  if (volatility > 0.002) confidenceScore += 10;
  else if (volatility > 0.001) confidenceScore += 5;
  else confidenceScore -= 15; // Muito baixa = ruído
  
  // Limitar entre 0-100
  return Math.max(0, Math.min(100, confidenceScore));
}

/**
 * Decisão principal da IA Híbrida
 * Determina se deve entrar, com qual stake, e se deve fazer hedge
 * NOVA: Integra análise de amplitude para decisões mais inteligentes
 */
export function makeAIDecision(
  candle: CandleData,
  predictedDirection: 'up' | 'down',
  config: AIConfig,
  amplitudeAnalysis?: AmplitudePredictionResponse
): AIDecision {
  // Calcular features nos últimos 1.5 minutos
  const features = calculateAIFeatures(candle, 13.5);
  
  // Avaliar confiança (0-100)
  let confidenceScore = evaluateConfidence(features, predictedDirection);
  
  // === NOVA LÓGICA: AJUSTAR CONFIANÇA COM ANÁLISE DE AMPLITUDE ===
  if (amplitudeAnalysis && amplitudeAnalysis.recommendation) {
    const modifier = amplitudeAnalysis.recommendation.confidence_modifier;
    confidenceScore += modifier;
    
    // Aplicar lógica estratégica baseada na análise de amplitude
    const strategy = amplitudeAnalysis.recommendation.entry_strategy;
    
    // Se a estratégia é WAIT (consolidação), reduzir muito a confiança
    if (strategy === 'WAIT') {
      confidenceScore = Math.min(confidenceScore, 30); // Forçar baixa confiança
    }
    
    // Se a estratégia é DEFENSE (recuo esperado), reduzir confiança
    if (strategy === 'DEFENSE') {
      confidenceScore = Math.min(confidenceScore, 50);
    }
    
    // Se a estratégia é HIGH_CONFIDENCE (movimento forte), aumentar
    if (strategy === 'HIGH_CONFIDENCE') {
      confidenceScore = Math.max(confidenceScore, 75);
    }
    
    // Limitar entre 0-100
    confidenceScore = Math.max(0, Math.min(100, confidenceScore));
  }
  
  // Determinar se é alta confiança baseado no threshold
  const isHighConfidence = confidenceScore >= config.aiFilterThreshold;
  
  // Decisão de entrada
  const shouldEnter = confidenceScore >= 40; // Mínimo de 40% para entrar
  
  // Decisão de hedge (só em trades de baixa confiança)
  const shouldHedge = !isHighConfidence && config.aiHedgeEnabled && shouldEnter;
  
  // Stake baseado na confiança
  const stake = isHighConfidence 
    ? config.stakeHighConfidence 
    : config.stakeNormalConfidence;
  
  // Razão da decisão (para logs)
  let reason = `Confiança: ${confidenceScore}% | `;
  reason += `PosRange: ${(features.posInRange * 100).toFixed(1)}% | `;
  reason += `BodyRatio: ${(features.bodyRatio * 100).toFixed(1)}% | `;
  reason += `Vol: ${(features.volatility * 100).toFixed(3)}%`;
  
  // Adicionar informações da análise de amplitude
  if (amplitudeAnalysis && amplitudeAnalysis.recommendation) {
    reason += ` | Amplitude: ${amplitudeAnalysis.recommendation.entry_strategy}`;
    reason += ` | Movimento: ${amplitudeAnalysis.recommendation.movement_expectation}`;
    reason += ` | Expansão: ${(amplitudeAnalysis.expansion_probability * 100).toFixed(1)}%`;
  }
  
  return {
    confidence: isHighConfidence ? 'HIGH' : 'NORMAL',
    shouldEnter,
    shouldHedge,
    stake,
    reason,
    amplitudeAnalysis,
    finalConfidenceScore: confidenceScore
  };
}

/**
 * Calcula o PnL esperado com hedge
 * Usado para ajustar o resultado quando hedge é aplicado
 */
export function calculateHedgedPnL(
  originalPnL: number,
  stake: number,
  payout: number = 0.80
): number {
  const hedgeStake = stake * 0.5; // Hedge com 50% do stake original
  const hedgeFactor = 1.0463; // Fator de melhoria do hedge (baseado na análise)
  
  if (originalPnL > 0) {
    // Ganhou: lucro reduzido pelo custo do hedge
    return (originalPnL * hedgeFactor) - hedgeStake;
  } else {
    // Perdeu: perda reduzida pelo ganho do hedge
    return (originalPnL * (1 - 0.0463)) + (hedgeStake * payout);
  }
}
