/**
 * Estratégia de Hedge Inteligente
 * 
 * Esta IA monitora posições abertas pelo Fibonacci e decide se precisa
 * abrir uma segunda posição para proteger (hedge) ou reforçar o trade.
 * 
 * NÃO interfere na decisão de entrada do Fibonacci.
 * 
 * Criado em: 03/11/2025
 */

export interface HedgeDecision {
  action: 'HOLD' | 'REINFORCE' | 'HEDGE';
  shouldOpenSecondPosition: boolean;
  secondPositionType?: 'CALL' | 'PUT';
  secondPositionStake?: number;
  reason: string;
  progressRatio: number;
  elapsedMinutes: number;
}

export interface HedgeAnalysisParams {
  entryPrice: number;           // Preço de entrada do Fibonacci
  currentPrice: number;          // Preço atual
  predictedClose: number;        // Fechamento previsto pelo Fibonacci
  candleOpen: number;            // Abertura do candle
  direction: 'up' | 'down';      // Direção da posição original
  elapsedMinutes: number;        // Minutos decorridos no candle
  originalStake: number;         // Stake da posição original (em centavos)
}

/**
 * Configuração da IA Hedge
 */
export interface HedgeConfig {
  enabled: boolean;                    // Habilitar/desabilitar hedge
  reinforceThreshold: number;          // Threshold para reforço (padrão: 0.30)
  reinforceStakeMultiplier: number;    // Multiplicador do stake para reforço (padrão: 0.5)
  hedgeStakeMultiplier: number;        // Multiplicador do stake para hedge (padrão: 1.0)
  analysisStartMinute: number;         // Minuto para começar análise (padrão: 12.0)
  analysisEndMinute: number;           // Minuto para parar análise (padrão: 14.0)
}

export const DEFAULT_HEDGE_CONFIG: HedgeConfig = {
  enabled: true,
  reinforceThreshold: 0.30,
  reinforceStakeMultiplier: 0.5,
  hedgeStakeMultiplier: 1.0,
  analysisStartMinute: 12.0,
  analysisEndMinute: 14.0
};

/**
 * Analisa se a posição atual precisa de hedge ou reforço
 * 
 * ORDEM DE VERIFICAÇÃO (conforme briefing):
 * 1. REVERSÃO (prioridade alta)
 * 2. REFORÇO
 * 3. HOLD
 */
export function analyzePositionForHedge(params: HedgeAnalysisParams): HedgeDecision {
  const {
    entryPrice,
    currentPrice,
    predictedClose,
    candleOpen,
    direction,
    elapsedMinutes,
    originalStake
  } = params;
  
  // Calcular progresso do movimento
  const expectedChange = Math.abs(predictedClose - entryPrice);
  const actualChange = Math.abs(currentPrice - entryPrice);
  const progressRatio = expectedChange > 0 ? actualChange / expectedChange : 0;
  
  // Calcular corpo do candle (para detectar reversão)
  const currentBody = currentPrice - candleOpen;
  const predictedBody = predictedClose - candleOpen;
  const bodyReversed = (currentBody > 0 && predictedBody < 0) || 
                       (currentBody < 0 && predictedBody > 0);
  
  // === CENÁRIO C: REVERSÃO DETECTADA (HEDGE) ===
  // Prioridade mais alta - verificar primeiro
  if (bodyReversed && elapsedMinutes >= 13.0) {
    return {
      action: 'HEDGE',
      shouldOpenSecondPosition: true,
      secondPositionType: direction === 'up' ? 'PUT' : 'CALL',
      secondPositionStake: Math.round(originalStake * 1.0), // 100% do stake
      reason: `Reversão detectada: candle fechando ${currentBody > 0 ? 'verde' : 'vermelho'} mas predição era ${predictedBody > 0 ? 'verde' : 'vermelho'}. Progresso: ${(progressRatio * 100).toFixed(1)}%`,
      progressRatio,
      elapsedMinutes
    };
  }
  
  // === CENÁRIO B: PULLBACK INSUFICIENTE (REFORÇAR) ===
  // Só reforçar se ainda há tempo (antes de 13.5 min)
  if (progressRatio < 0.30 && elapsedMinutes >= 12.0 && elapsedMinutes < 13.5) {
    return {
      action: 'REINFORCE',
      shouldOpenSecondPosition: true,
      secondPositionType: direction === 'up' ? 'CALL' : 'PUT',
      secondPositionStake: Math.round(originalStake * 0.5), // 50% do stake
      reason: `Pullback insuficiente: movimento está em ${(progressRatio * 100).toFixed(1)}% do esperado (< 30%). Reforçando posição.`,
      progressRatio,
      elapsedMinutes
    };
  }
  
  // === CENÁRIO A: MOVIMENTO FORTE (SEGURAR) ===
  return {
    action: 'HOLD',
    shouldOpenSecondPosition: false,
    reason: `Movimento forte: ${(progressRatio * 100).toFixed(1)}% do esperado alcançado. Posição está boa.`,
    progressRatio,
    elapsedMinutes
  };
}
