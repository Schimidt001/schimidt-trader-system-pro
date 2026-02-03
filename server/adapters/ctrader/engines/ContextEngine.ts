/**
 * ContextEngine - Motor de Classificação de Contexto Institucional
 * 
 * Responsável por:
 * - Avaliar preço atual em relação ao range da sessão anterior
 * - Classificar posição: TOP, MID ou BOTTOM
 * - Gerar bias direcional: LONG_ONLY, SHORT_ONLY, BOTH, NONE
 * - Gerar grade de qualidade: A, B, NO_TRADE
 * - Bloquear estratégia quando contexto inválido
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 */

import {
  ContextClassification,
  ContextBias,
  ContextGrade,
  ContextEngineState,
  SessionData,
} from "../SMCInstitutionalTypes";

/**
 * Configuração do ContextEngine
 */
export interface ContextEngineConfig {
  // Percentuais para classificação TOP/MID/BOTTOM
  topThresholdPercent: number;     // Acima deste % do range = TOP (default: 70%)
  bottomThresholdPercent: number;  // Abaixo deste % do range = BOTTOM (default: 30%)
  
  // Se true, permite trading em contexto MID
  allowMidContext: boolean;
}

/**
 * Configuração padrão do ContextEngine
 */
export const DEFAULT_CONTEXT_CONFIG: ContextEngineConfig = {
  topThresholdPercent: 70,
  bottomThresholdPercent: 30,
  allowMidContext: true,
};

/**
 * ContextEngine - Classe para classificação de contexto de mercado
 */
export class ContextEngine {
  private config: ContextEngineConfig;
  private symbol: string;
  
  constructor(symbol: string, config: Partial<ContextEngineConfig> = {}) {
    this.symbol = symbol;
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
  }
  
  /**
   * Atualiza a configuração
   */
  updateConfig(config: Partial<ContextEngineConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Avalia o contexto baseado no preço atual e sessão anterior
   * 
   * @param currentPrice Preço atual do ativo
   * @param previousSession Dados da sessão anterior
   * @returns Estado atualizado do ContextEngine
   */
  evaluateContext(
    currentPrice: number,
    previousSession: SessionData | null
  ): ContextEngineState {
    const now = Date.now();
    
    // Se não temos sessão anterior, contexto é inválido
    if (!previousSession || previousSession.range === 0) {
      return {
        classification: null,
        bias: 'NONE',
        grade: 'NO_TRADE',
        currentPrice,
        sessionRangeHigh: null,
        sessionRangeLow: null,
        sessionRangeMid: null,
        lastUpdateTime: now,
      };
    }
    
    const { high, low, range } = previousSession;
    const mid = low + (range / 2);
    
    // Calcular posição percentual do preço no range
    const positionPercent = ((currentPrice - low) / range) * 100;
    
    // Classificar posição
    const classification = this.classifyPosition(positionPercent);
    
    // Determinar bias baseado na classificação
    const bias = this.determineBias(classification);
    
    // Determinar grade de qualidade
    const grade = this.determineGrade(classification, positionPercent);
    
    return {
      classification,
      bias,
      grade,
      currentPrice,
      sessionRangeHigh: high,
      sessionRangeLow: low,
      sessionRangeMid: mid,
      lastUpdateTime: now,
    };
  }
  
  /**
   * Classifica a posição do preço no range
   * 
   * TOP: Preço está na parte superior do range (acima de 70%)
   * BOTTOM: Preço está na parte inferior do range (abaixo de 30%)
   * MID: Preço está no meio do range (entre 30% e 70%)
   */
  private classifyPosition(positionPercent: number): ContextClassification {
    if (positionPercent >= this.config.topThresholdPercent) {
      return 'TOP';
    }
    if (positionPercent <= this.config.bottomThresholdPercent) {
      return 'BOTTOM';
    }
    return 'MID';
  }
  
  /**
   * Determina o bias direcional baseado na classificação
   * 
   * TOP: Preço está alto → buscar vendas (SHORT_ONLY)
   * BOTTOM: Preço está baixo → buscar compras (LONG_ONLY)
   * MID: Preço está no meio → pode operar em ambas direções (BOTH)
   */
  private determineBias(classification: ContextClassification): ContextBias {
    switch (classification) {
      case 'TOP':
        return 'SHORT_ONLY';
      case 'BOTTOM':
        return 'LONG_ONLY';
      case 'MID':
        return this.config.allowMidContext ? 'BOTH' : 'NONE';
      default:
        return 'NONE';
    }
  }
  
  /**
   * Determina a grade de qualidade do setup
   * 
   * A: Contexto extremo (TOP ou BOTTOM) com boa distância do meio
   * B: Contexto válido mas menos ideal
   * NO_TRADE: Contexto inválido ou sem sessão anterior
   */
  private determineGrade(classification: ContextClassification, positionPercent: number): ContextGrade {
    if (classification === null) {
      return 'NO_TRADE';
    }
    
    // Grade A: Extremos claros
    // TOP: acima de 80%
    // BOTTOM: abaixo de 20%
    if (positionPercent >= 80 || positionPercent <= 20) {
      return 'A';
    }
    
    // Grade B: Contexto válido mas não extremo
    // TOP: entre 70% e 80%
    // BOTTOM: entre 20% e 30%
    if (classification === 'TOP' || classification === 'BOTTOM') {
      return 'B';
    }
    
    // MID: Depende da configuração
    if (classification === 'MID') {
      return this.config.allowMidContext ? 'B' : 'NO_TRADE';
    }
    
    return 'NO_TRADE';
  }
  
  /**
   * Verifica se o contexto permite trading
   */
  canTrade(state: ContextEngineState): boolean {
    return state.grade !== 'NO_TRADE' && state.bias !== 'NONE';
  }
  
  /**
   * Verifica se a direção é permitida pelo bias
   */
  isDirectionAllowed(state: ContextEngineState, direction: 'BUY' | 'SELL'): boolean {
    switch (state.bias) {
      case 'LONG_ONLY':
        return direction === 'BUY';
      case 'SHORT_ONLY':
        return direction === 'SELL';
      case 'BOTH':
        return true;
      case 'NONE':
      default:
        return false;
    }
  }
  
  /**
   * Obtém informações formatadas do contexto para logs
   */
  getContextInfo(state: ContextEngineState): string {
    const parts: string[] = [];
    
    parts.push(`Class: ${state.classification || 'N/A'}`);
    parts.push(`Bias: ${state.bias}`);
    parts.push(`Grade: ${state.grade}`);
    
    if (state.sessionRangeHigh !== null && state.sessionRangeLow !== null) {
      const positionPercent = state.sessionRangeLow !== null && state.sessionRangeHigh !== null
        ? ((state.currentPrice - state.sessionRangeLow) / (state.sessionRangeHigh - state.sessionRangeLow)) * 100
        : 0;
      parts.push(`Pos: ${positionPercent.toFixed(1)}%`);
    }
    
    return parts.join(' | ');
  }
  
  /**
   * Obtém razão detalhada para bloqueio de trading
   */
  getBlockReason(state: ContextEngineState): string | null {
    if (state.grade === 'NO_TRADE') {
      if (state.classification === null) {
        return 'Sem sessão anterior para avaliar contexto';
      }
      if (state.classification === 'MID' && !this.config.allowMidContext) {
        return 'Contexto MID não permitido pela configuração';
      }
      return 'Contexto inválido para trading';
    }
    
    if (state.bias === 'NONE') {
      return 'Sem bias direcional definido';
    }
    
    return null;
  }
  
  /**
   * Cria um estado inicial vazio
   */
  static createEmptyState(): ContextEngineState {
    return {
      classification: null,
      bias: 'NONE',
      grade: 'NO_TRADE',
      currentPrice: 0,
      sessionRangeHigh: null,
      sessionRangeLow: null,
      sessionRangeMid: null,
      lastUpdateTime: Date.now(),
    };
  }
}

/**
 * Factory function para criar ContextEngine
 */
export function createContextEngine(symbol: string, config?: Partial<ContextEngineConfig>): ContextEngine {
  return new ContextEngine(symbol, config);
}
