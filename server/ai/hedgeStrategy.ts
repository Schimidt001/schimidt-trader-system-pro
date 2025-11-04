/**
 * IA HEDGE INTELIGENTE - Versão 2.0
 * 
 * Estratégias matemáticas para ativos sintéticos
 * Baseado em cálculos precisos, não em sentimento de mercado
 */

export interface HedgeAnalysisParams {
  entryPrice: number;           // Preço de entrada da posição original
  currentPrice: number;          // Preço atual do ativo
  predictedClose: number;        // Fechamento previsto pela IA
  candleOpen: number;            // Abertura do candle
  direction: 'up' | 'down';      // Direção da predição original
  elapsedMinutes: number;        // Minutos decorridos no candle
  originalStake: number;         // Stake original em centavos
}

export interface HedgeDecision {
  action: 'HOLD' | 'REINFORCE' | 'HEDGE' | 'REVERSAL_EDGE';
  shouldOpenSecondPosition: boolean;
  secondPositionType?: 'CALL' | 'PUT';
  secondPositionStake?: number;
  reason: string;
  progressRatio: number;
  elapsedMinutes: number;
  // Métricas matemáticas
  candleRange: number;
  priceExtension: number;
  reversalRisk: number;
  momentumStrength: number;
}

export interface HedgeConfig {
  enabled: boolean;
  
  // Estratégia 1: Detecção de Reversão (após 1.5 min da predição)
  reversalDetectionMinute: number;      // Quando começar a detectar reversão (padrão: 9.5 min = 8 + 1.5)
  reversalThreshold: number;            // % do range no lado oposto para considerar reversão (padrão: 0.6 = 60%)
  reversalStakeMultiplier: number;      // Multiplicador do stake para hedge de reversão (padrão: 1.0 = 100%)
  
  // Estratégia 2: Reforço em Pullback
  pullbackDetectionStart: number;       // Início da janela de detecção (padrão: 9.5 min)
  pullbackDetectionEnd: number;         // Fim da janela de detecção (padrão: 12 min)
  pullbackMinProgress: number;          // Progresso mínimo para considerar pullback (padrão: 0.15 = 15%)
  pullbackMaxProgress: number;          // Progresso máximo para considerar pullback (padrão: 0.40 = 40%)
  pullbackStakeMultiplier: number;      // Multiplicador do stake para reforço (padrão: 0.5 = 50%)
  
  // Estratégia 3: Reversão de Ponta (final do candle)
  edgeReversalMinute: number;           // Quando começar a detectar reversão de ponta (padrão: 13.5 min)
  edgeExtensionThreshold: number;       // % de extensão para considerar exaustão (padrão: 0.80 = 80%)
  edgeStakeMultiplier: number;          // Multiplicador do stake para reversão de ponta (padrão: 0.75 = 75%)
  
  // Janela geral de análise
  analysisStartMinute: number;
  analysisEndMinute: number;
}

export const DEFAULT_HEDGE_CONFIG: HedgeConfig = {
  enabled: true,
  
  // Estratégia 1: Reversão
  // Timing otimizado com base em análise de 877 candles (79,63% no minuto 12)
  reversalDetectionMinute: 12.0,
  reversalThreshold: 0.60,          // 60% de extensão do candle (valor original seguro)
  reversalStakeMultiplier: 1.5,     // Otimizado: 1.5x (era 1.0x)
  
  // Estratégia 2: Pullback
  // Timing otimizado: janela 12-14 captura 41,95% dos pullbacks
  pullbackDetectionStart: 12.0,
  pullbackDetectionEnd: 14.0,
  pullbackMinProgress: 0.15,        // 15% de progresso (valor original seguro)
  pullbackMaxProgress: 0.40,        // 40% de progresso (valor original seguro)
  pullbackStakeMultiplier: 1.4,     // Otimizado: 1.4x (era 0.5x)
  
  // Estratégia 3: Reversão de Ponta
  // Timing otimizado: 63,01% ocorrem no minuto 12
  edgeReversalMinute: 12.0,
  edgeExtensionThreshold: 0.80,     // 80% de extensão (valor original seguro)
  edgeStakeMultiplier: 1.5,         // Otimizado: 1.5x (era 0.75x)
  
  // Janela geral
  // Otimizado: últimos 3 minutos do candle (12, 13, 14)
  // 14.98 = segundo 899 (último momento válido do candle)
  analysisStartMinute: 12.0,
  analysisEndMinute: 14.98,
};

/**
 * Analisa a posição e decide se deve abrir uma segunda posição (hedge ou reforço)
 */
export function analyzePositionForHedge(
  params: HedgeAnalysisParams,
  config: HedgeConfig = DEFAULT_HEDGE_CONFIG
): HedgeDecision {
  const {
    entryPrice,
    currentPrice,
    predictedClose,
    candleOpen,
    direction,
    elapsedMinutes,
    originalStake
  } = params;

  // Cálculos matemáticos base
  const candleRange = Math.abs(currentPrice - candleOpen);
  const expectedMovement = Math.abs(predictedClose - entryPrice);
  const actualMovement = direction === 'up' 
    ? currentPrice - entryPrice 
    : entryPrice - currentPrice;
  
  const progressRatio = expectedMovement > 0 ? actualMovement / expectedMovement : 0;
  
  // Calcular em que lado do candle o preço está
  const candleBody = currentPrice - candleOpen;
  const candleBodyDirection: 'up' | 'down' = candleBody > 0 ? 'up' : 'down';
  
  // Extensão do preço em relação ao range do candle
  const priceExtension = candleRange > 0 ? Math.abs(candleBody) / candleRange : 0;
  
  // Risco de reversão (preço no lado oposto da predição)
  const reversalRisk = candleBodyDirection !== direction ? priceExtension : 0;
  
  // Força do momentum (baseado na velocidade do movimento)
  const timeProgress = elapsedMinutes / 15; // % do tempo decorrido
  const momentumStrength = timeProgress > 0 ? progressRatio / timeProgress : 0;

  // ==========================================
  // ESTRATÉGIA 1: DETECÇÃO DE REVERSÃO
  // ==========================================
  if (elapsedMinutes >= config.reversalDetectionMinute && 
      elapsedMinutes <= config.pullbackDetectionEnd) {
    
    // Reversão detectada: preço está no lado oposto e muito estendido
    if (reversalRisk >= config.reversalThreshold) {
      return {
        action: 'HEDGE',
        shouldOpenSecondPosition: true,
        secondPositionType: direction === 'up' ? 'PUT' : 'CALL',
        secondPositionStake: Math.round(originalStake * config.reversalStakeMultiplier),
        reason: `🔴 REVERSÃO DETECTADA: Preço ${reversalRisk >= 0.8 ? 'muito' : ''} estendido (${(reversalRisk * 100).toFixed(1)}%) no lado oposto da predição. Abrindo hedge protetor.`,
        progressRatio,
        elapsedMinutes,
        candleRange,
        priceExtension,
        reversalRisk,
        momentumStrength
      };
    }
  }

  // ==========================================
  // ESTRATÉGIA 2: REFORÇO EM PULLBACK
  // ==========================================
  if (elapsedMinutes >= config.pullbackDetectionStart && 
      elapsedMinutes <= config.pullbackDetectionEnd) {
    
    // Pullback detectado: movimento na direção certa mas atrasado
    if (progressRatio >= config.pullbackMinProgress && 
        progressRatio <= config.pullbackMaxProgress &&
        candleBodyDirection === direction) {
      
      return {
        action: 'REINFORCE',
        shouldOpenSecondPosition: true,
        secondPositionType: direction === 'up' ? 'CALL' : 'PUT',
        secondPositionStake: Math.round(originalStake * config.pullbackStakeMultiplier),
        reason: `🟢 PULLBACK IDENTIFICADO: Movimento correto (${direction.toUpperCase()}) mas atrasado (${(progressRatio * 100).toFixed(1)}%). Reforçando posição com preço melhor.`,
        progressRatio,
        elapsedMinutes,
        candleRange,
        priceExtension,
        reversalRisk,
        momentumStrength
      };
    }
  }

  // ==========================================
  // ESTRATÉGIA 3: REVERSÃO DE PONTA
  // ==========================================
  if (elapsedMinutes >= config.edgeReversalMinute) {
    
    // Candle muito estendido na direção da predição - provável reversão
    if (candleBodyDirection === direction && 
        priceExtension >= config.edgeExtensionThreshold) {
      
      return {
        action: 'REVERSAL_EDGE',
        shouldOpenSecondPosition: true,
        secondPositionType: direction === 'up' ? 'PUT' : 'CALL',
        secondPositionStake: Math.round(originalStake * config.edgeStakeMultiplier),
        reason: `🟡 EXAUSTÃO DE PONTA: Candle muito estendido (${(priceExtension * 100).toFixed(1)}%) na direção ${direction.toUpperCase()}. Apostando em reversão de final.`,
        progressRatio,
        elapsedMinutes,
        candleRange,
        priceExtension,
        reversalRisk,
        momentumStrength
      };
    }
  }

  // ==========================================
  // HOLD: Nenhuma estratégia acionada
  // ==========================================
  let holdReason = '';
  
  if (progressRatio > 0.50) {
    holdReason = `✅ Movimento forte: ${(progressRatio * 100).toFixed(1)}% do esperado alcançado. Posição está boa.`;
  } else if (elapsedMinutes < config.analysisStartMinute) {
    holdReason = `⏳ Aguardando janela de análise (${config.analysisStartMinute} min). Progresso atual: ${(progressRatio * 100).toFixed(1)}%.`;
  } else {
    holdReason = `📊 Movimento dentro do esperado: ${(progressRatio * 100).toFixed(1)}%. Nenhuma ação necessária.`;
  }

  return {
    action: 'HOLD',
    shouldOpenSecondPosition: false,
    reason: holdReason,
    progressRatio,
    elapsedMinutes,
    candleRange,
    priceExtension,
    reversalRisk,
    momentumStrength
  };
}
