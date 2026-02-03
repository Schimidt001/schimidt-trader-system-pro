/**
 * FVGEngine - Motor de Fair Value Gaps Institucional
 * 
 * Responsável por:
 * - Detectar FVG apenas após Sweep + CHoCH confirmados
 * - Detecção em M5 usando 3 candles consecutivos
 * - Filtro por tamanho mínimo (minGapPips)
 * - Apenas 1 FVG ativo por setup
 * - Mitigação MVP: TOUCH (interseção do candle com a zona)
 * 
 * FVG (Fair Value Gap) é um gap de preço entre 3 candles consecutivos:
 * - Bullish FVG: Gap entre o high do candle 1 e o low do candle 3 (preço subiu rápido)
 * - Bearish FVG: Gap entre o low do candle 1 e o high do candle 3 (preço caiu rápido)
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 */

import { TrendbarData } from "../CTraderClient";
import {
  FVGZone,
  FVGDirection,
  FVGEngineState,
} from "../SMCInstitutionalTypes";
import { getPipValue as getCentralizedPipValue, priceToPips as centralizedPriceToPips } from "../../../../shared/normalizationUtils";

/**
 * Configuração do FVGEngine
 */
export interface FVGEngineConfig {
  // Tamanho mínimo do FVG em pips para ser considerado válido
  minGapPips: number;
  
  // Máximo de FVGs no histórico
  maxHistorySize: number;
}

/**
 * Configuração padrão do FVGEngine
 */
export const DEFAULT_FVG_CONFIG: FVGEngineConfig = {
  minGapPips: 2.0,
  maxHistorySize: 10,
};

/**
 * FVGEngine - Classe para detecção e gerenciamento de Fair Value Gaps
 */
export class FVGEngine {
  private config: FVGEngineConfig;
  private symbol: string;
  
  constructor(symbol: string, config: Partial<FVGEngineConfig> = {}) {
    this.symbol = symbol;
    this.config = { ...DEFAULT_FVG_CONFIG, ...config };
  }
  
  /**
   * Atualiza a configuração
   */
  updateConfig(config: Partial<FVGEngineConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Detecta FVG em candles M5
   * IMPORTANTE: Só deve ser chamado após Sweep + CHoCH confirmados
   * 
   * @param candles Array de candles M5
   * @param expectedDirection Direção esperada baseada no CHoCH
   * @param state Estado atual do FVGEngine
   * @returns Estado atualizado com FVG detectado (se houver)
   */
  detectFVG(
    candles: TrendbarData[],
    expectedDirection: 'BULLISH' | 'BEARISH',
    state: FVGEngineState
  ): FVGEngineState {
    // Se já temos um FVG ativo, não detectar outro
    if (state.activeFVG && state.activeFVG.isValid && !state.activeFVG.mitigated) {
      return state;
    }
    
    // Precisamos de pelo menos 3 candles
    if (candles.length < 3) {
      return state;
    }
    
    const pipValue = getCentralizedPipValue(this.symbol);
    const now = Date.now();
    
    // Analisar os últimos 3 candles
    const candle1 = candles[candles.length - 3];
    const candle2 = candles[candles.length - 2];
    const candle3 = candles[candles.length - 1];
    
    let fvg: FVGZone | null = null;
    
    if (expectedDirection === 'BULLISH') {
      // Bullish FVG: Gap entre high do candle 1 e low do candle 3
      // O preço subiu tão rápido que deixou um gap
      const gapHigh = candle3.low;
      const gapLow = candle1.high;
      
      if (gapHigh > gapLow) {
        // Existe um gap bullish
        const gapSizePips = centralizedPriceToPips(gapHigh - gapLow, this.symbol);
        
        if (gapSizePips >= this.config.minGapPips) {
          fvg = {
            direction: 'BULLISH',
            high: gapHigh,
            low: gapLow,
            midpoint: (gapHigh + gapLow) / 2,
            gapSizePips,
            timestamp: candle2.timestamp,
            candle1High: candle1.high,
            candle1Low: candle1.low,
            candle3High: candle3.high,
            candle3Low: candle3.low,
            isValid: true,
            mitigated: false,
            mitigatedAt: null,
            mitigatedPrice: null,
          };
        }
      }
    } else {
      // Bearish FVG: Gap entre low do candle 1 e high do candle 3
      // O preço caiu tão rápido que deixou um gap
      const gapHigh = candle1.low;
      const gapLow = candle3.high;
      
      if (gapHigh > gapLow) {
        // Existe um gap bearish
        const gapSizePips = centralizedPriceToPips(gapHigh - gapLow, this.symbol);
        
        if (gapSizePips >= this.config.minGapPips) {
          fvg = {
            direction: 'BEARISH',
            high: gapHigh,
            low: gapLow,
            midpoint: (gapHigh + gapLow) / 2,
            gapSizePips,
            timestamp: candle2.timestamp,
            candle1High: candle1.high,
            candle1Low: candle1.low,
            candle3High: candle3.high,
            candle3Low: candle3.low,
            isValid: true,
            mitigated: false,
            mitigatedAt: null,
            mitigatedPrice: null,
          };
        }
      }
    }
    
    if (fvg) {
      // FVG detectado!
      const newHistory = [...state.fvgHistory, fvg].slice(-this.config.maxHistorySize);
      
      return {
        activeFVG: fvg,
        fvgHistory: newHistory,
        lastDetectionTime: now,
        fvgCount: state.fvgCount + 1,
      };
    }
    
    return state;
  }
  
  /**
   * Verifica se o FVG foi mitigado (TOUCH)
   * Mitigação MVP: Qualquer interseção do candle com a zona do FVG
   * 
   * @param state Estado atual do FVGEngine
   * @param candle Candle atual M5
   * @returns Estado atualizado com mitigação (se houver)
   */
  checkMitigation(state: FVGEngineState, candle: TrendbarData): FVGEngineState {
    if (!state.activeFVG || !state.activeFVG.isValid || state.activeFVG.mitigated) {
      return state;
    }
    
    const fvg = state.activeFVG;
    const now = Date.now();
    
    // Verificar TOUCH: Candle intersecta a zona do FVG
    const candleTouchesFVG = (
      candle.high >= fvg.low && candle.low <= fvg.high
    );
    
    if (candleTouchesFVG) {
      // FVG mitigado!
      const mitigatedFVG: FVGZone = {
        ...fvg,
        mitigated: true,
        mitigatedAt: now,
        mitigatedPrice: candle.close,
      };
      
      return {
        ...state,
        activeFVG: mitigatedFVG,
      };
    }
    
    return state;
  }
  
  /**
   * Verifica se o FVG foi invalidado (preço passou completamente)
   * 
   * @param state Estado atual do FVGEngine
   * @param currentPrice Preço atual
   * @param bufferPips Buffer em pips além da zona
   * @returns true se FVG foi invalidado
   */
  isFVGInvalidated(state: FVGEngineState, currentPrice: number, bufferPips: number = 5): boolean {
    if (!state.activeFVG || !state.activeFVG.isValid) {
      return false;
    }
    
    const fvg = state.activeFVG;
    const pipValue = getCentralizedPipValue(this.symbol);
    const buffer = bufferPips * pipValue;
    
    if (fvg.direction === 'BULLISH') {
      // FVG bullish invalidado se preço caiu muito abaixo
      return currentPrice < fvg.low - buffer;
    } else {
      // FVG bearish invalidado se preço subiu muito acima
      return currentPrice > fvg.high + buffer;
    }
  }
  
  /**
   * Invalida o FVG ativo
   */
  invalidateFVG(state: FVGEngineState): FVGEngineState {
    if (!state.activeFVG) {
      return state;
    }
    
    return {
      ...state,
      activeFVG: {
        ...state.activeFVG,
        isValid: false,
      },
    };
  }
  
  /**
   * Verifica se há um FVG ativo e válido
   */
  hasValidFVG(state: FVGEngineState): boolean {
    return state.activeFVG !== null && state.activeFVG.isValid && !state.activeFVG.mitigated;
  }
  
  /**
   * Verifica se o FVG foi mitigado
   */
  isFVGMitigated(state: FVGEngineState): boolean {
    return state.activeFVG !== null && state.activeFVG.mitigated;
  }
  
  /**
   * Obtém informações formatadas do FVG para logs
   */
  getFVGInfo(state: FVGEngineState): string {
    if (!state.activeFVG) {
      return 'No FVG';
    }
    
    const fvg = state.activeFVG;
    const parts: string[] = [];
    
    parts.push(`FVG ${fvg.direction}`);
    parts.push(`Zone: ${fvg.low.toFixed(5)}-${fvg.high.toFixed(5)}`);
    parts.push(`Size: ${fvg.gapSizePips.toFixed(1)} pips`);
    parts.push(`Valid: ${fvg.isValid}`);
    parts.push(`Mitigated: ${fvg.mitigated}`);
    
    return parts.join(' | ');
  }
  
  /**
   * Reseta o estado do FVGEngine
   */
  resetState(): FVGEngineState {
    return FVGEngine.createEmptyState();
  }
  
  /**
   * Cria um estado inicial vazio
   */
  static createEmptyState(): FVGEngineState {
    return {
      activeFVG: null,
      fvgHistory: [],
      lastDetectionTime: 0,
      fvgCount: 0,
    };
  }
}

/**
 * Factory function para criar FVGEngine
 */
export function createFVGEngine(symbol: string, config?: Partial<FVGEngineConfig>): FVGEngine {
  return new FVGEngine(symbol, config);
}
