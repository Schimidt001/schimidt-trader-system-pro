/**
 * LiquidityEngine - Motor de Pools de Liquidez Institucional
 * 
 * Responsável por:
 * - Construir pools de liquidez a partir de:
 *   1. High/Low da sessão anterior (prioridade máxima)
 *   2. High/Low do dia anterior (prioridade média)
 *   3. Swing Points (fractais) como fallback (prioridade baixa)
 * - Detectar sweep institucional apenas em candle fechado M15
 * - Sweep em tempo real serve apenas como telemetria (não arma FSM)
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 */

import { TrendbarData } from "../CTraderClient";
import {
  LiquidityPool,
  LiquidityPoolType,
  InstitutionalSweepResult,
  SessionEngineState,
} from "../SMCInstitutionalTypes";
import { SwingPoint } from "../SMCStrategy";
import { getPipValue as getCentralizedPipValue, priceToPips as centralizedPriceToPips } from "../../../../shared/normalizationUtils";

/**
 * Configuração do LiquidityEngine
 */
export interface LiquidityEngineConfig {
  // Buffer em pips para considerar sweep
  sweepBufferPips: number;
  
  // Se true, inclui swing points como pools de liquidez
  includeSwingPoints: boolean;
  
  // Máximo de pools por tipo
  maxPoolsPerType: number;
}

/**
 * Configuração padrão do LiquidityEngine
 */
export const DEFAULT_LIQUIDITY_CONFIG: LiquidityEngineConfig = {
  sweepBufferPips: 0.5,
  includeSwingPoints: true,
  maxPoolsPerType: 5,
};

/**
 * LiquidityEngine - Classe para gerenciamento de pools de liquidez
 */
export class LiquidityEngine {
  private config: LiquidityEngineConfig;
  private symbol: string;
  
  constructor(symbol: string, config: Partial<LiquidityEngineConfig> = {}) {
    this.symbol = symbol;
    this.config = { ...DEFAULT_LIQUIDITY_CONFIG, ...config };
  }
  
  /**
   * Atualiza a configuração
   */
  updateConfig(config: Partial<LiquidityEngineConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Gera uma chave estável e determinística para o pool.
   * Resolve o problema P0.3 (Pools reconstruídos perdem estado).
   * Ajuste: Inclui identificadores temporais para evitar colisões entre dias/sessões.
   */
  private generatePoolKey(pool: Partial<LiquidityPool>): string {
    const roundedPrice = pool.price ? pool.price.toFixed(5) : "0";
    
    // Para pools de Swing, usamos o timestamp original do fractal
    if (pool.source === 'SWING') {
      return `${pool.type}_${pool.timestamp}_${roundedPrice}`;
    }
    
    // Para pools de Sessão ou Diários, usamos o timestamp (que representa o fim do período)
    // Isso garante que pools de dias/sessões diferentes tenham chaves diferentes
    return `${pool.type}_${pool.timestamp}_${roundedPrice}`;
  }

  /**
   * Constrói pools de liquidez a partir de todas as fontes e faz o merge com os existentes.
   * 
   * @param sessionState Estado do SessionEngine
   * @param existingPools Pools de liquidez atuais (para preservar estado swept)
   * @param swingHighs Array de Swing Highs (fractais)
   * @param swingLows Array de Swing Lows (fractais)
   * @returns Array de pools de liquidez ordenados por prioridade
   */
  buildLiquidityPools(
    sessionState: SessionEngineState,
    existingPools: LiquidityPool[] = [],
    swingHighs: SwingPoint[] = [],
    swingLows: SwingPoint[] = []
  ): LiquidityPool[] {
    const pools: LiquidityPool[] = [];
    const now = Date.now();
    
    // 1. Pools da sessão anterior (PRIORIDADE MÁXIMA)
    if (sessionState.previousSession) {
      // Session High
      pools.push({
        type: 'SESSION_HIGH',
        price: sessionState.previousSession.high,
        timestamp: sessionState.previousSession.endTime,
        source: 'SESSION',
        priority: 1,
        swept: false,
        sweptAt: null,
        sweptCandle: null,
      });
      
      // Session Low
      pools.push({
        type: 'SESSION_LOW',
        price: sessionState.previousSession.low,
        timestamp: sessionState.previousSession.endTime,
        source: 'SESSION',
        priority: 1,
        swept: false,
        sweptAt: null,
        sweptCandle: null,
      });
    }
    
    // 2. Pools do dia anterior (PRIORIDADE MÉDIA)
    if (sessionState.previousDayHigh !== null) {
      pools.push({
        type: 'DAILY_HIGH',
        price: sessionState.previousDayHigh,
        timestamp: now,
        source: 'DAILY',
        priority: 2,
        swept: false,
        sweptAt: null,
        sweptCandle: null,
      });
    }
    
    if (sessionState.previousDayLow !== null) {
      pools.push({
        type: 'DAILY_LOW',
        price: sessionState.previousDayLow,
        timestamp: now,
        source: 'DAILY',
        priority: 2,
        swept: false,
        sweptAt: null,
        sweptCandle: null,
      });
    }
    
    // 3. Swing Points como fallback (PRIORIDADE BAIXA)
    if (this.config.includeSwingPoints) {
      // Swing Highs
      const recentSwingHighs = swingHighs
        .filter(s => s.isValid && !s.swept)
        .slice(-this.config.maxPoolsPerType);
      
      for (const swing of recentSwingHighs) {
        pools.push({
          type: 'SWING_HIGH',
          price: swing.price,
          timestamp: swing.timestamp,
          source: 'SWING',
          priority: 3,
          swept: swing.swept,
          sweptAt: swing.sweptAt || null,
          sweptCandle: null,
        });
      }
      
      // Swing Lows
      const recentSwingLows = swingLows
        .filter(s => s.isValid && !s.swept)
        .slice(-this.config.maxPoolsPerType);
      
      for (const swing of recentSwingLows) {
        pools.push({
          type: 'SWING_LOW',
          price: swing.price,
          timestamp: swing.timestamp,
          source: 'SWING',
          priority: 3,
          swept: swing.swept,
          sweptAt: swing.sweptAt || null,
          sweptCandle: null,
        });
      }
    }
    
    // 4. Merge com pools existentes para preservar estado "swept"
    const mergedPools = pools.map(newPool => {
      const key = this.generatePoolKey(newPool);
      const existing = existingPools.find(p => this.generatePoolKey(p) === key);
      
      if (existing && existing.swept) {
        return {
          ...newPool,
          swept: true,
          sweptAt: existing.sweptAt,
          sweptCandle: existing.sweptCandle,
        };
      }
      return newPool;
    });

    // Ordenar por prioridade (menor = maior prioridade)
    return mergedPools.sort((a, b) => a.priority - b.priority);
  }
  
  /**
   * Detecta sweep institucional em candle fechado M15
   * IMPORTANTE: Apenas sweeps confirmados em candle fechado podem armar a FSM
   * 
   * @param pools Array de pools de liquidez
   * @param lastClosedCandle Último candle M15 fechado
   * @returns Resultado da detecção de sweep
   */
  detectInstitutionalSweep(
    pools: LiquidityPool[],
    lastClosedCandle: TrendbarData
  ): InstitutionalSweepResult {
    const pipValue = getCentralizedPipValue(this.symbol);
    const bufferPrice = this.config.sweepBufferPips * pipValue;
    
    // Verificar sweep de HIGH pools
    const highPools = pools.filter(p => 
      p.type === 'SESSION_HIGH' || 
      p.type === 'DAILY_HIGH' || 
      p.type === 'SWING_HIGH'
    );
    
    for (const pool of highPools) {
      if (pool.swept) continue;
      
      // Condição de sweep: Wick rompe o nível, corpo fecha de volta dentro do range
      const wickBrokeLevel = lastClosedCandle.high > pool.price;
      const bodyClosedBelow = lastClosedCandle.close < pool.price;
      
      if (wickBrokeLevel && bodyClosedBelow) {
        // Sweep confirmado!
        pool.swept = true;
        pool.sweptAt = Date.now();
        pool.sweptCandle = lastClosedCandle.timestamp;
        
        return {
          detected: true,
          confirmed: true,
          pool,
          sweepType: 'HIGH',
          sweepPrice: pool.price,
          sweepTime: Date.now(),
          confirmationCandle: lastClosedCandle.timestamp,
        };
      }
    }
    
    // Verificar sweep de LOW pools
    const lowPools = pools.filter(p => 
      p.type === 'SESSION_LOW' || 
      p.type === 'DAILY_LOW' || 
      p.type === 'SWING_LOW'
    );
    
    for (const pool of lowPools) {
      if (pool.swept) continue;
      
      // Condição de sweep: Wick rompe o nível (para baixo), corpo fecha de volta dentro do range
      const wickBrokeLevel = lastClosedCandle.low < pool.price;
      const bodyClosedAbove = lastClosedCandle.close > pool.price;
      
      if (wickBrokeLevel && bodyClosedAbove) {
        // Sweep confirmado!
        pool.swept = true;
        pool.sweptAt = Date.now();
        pool.sweptCandle = lastClosedCandle.timestamp;
        
        return {
          detected: true,
          confirmed: true,
          pool,
          sweepType: 'LOW',
          sweepPrice: pool.price,
          sweepTime: Date.now(),
          confirmationCandle: lastClosedCandle.timestamp,
        };
      }
    }
    
    // Nenhum sweep detectado
    return {
      detected: false,
      confirmed: false,
      pool: null,
      sweepType: null,
      sweepPrice: null,
      sweepTime: null,
      confirmationCandle: null,
    };
  }
  
  /**
   * Detecta sweep em tempo real (apenas para telemetria)
   * IMPORTANTE: Este método NÃO arma a FSM, serve apenas para pré-alertas
   * 
   * @param pools Array de pools de liquidez
   * @param currentPrice Preço atual em tempo real
   * @returns Resultado da detecção (confirmed sempre false)
   */
  detectRealtimeSweep(
    pools: LiquidityPool[],
    currentPrice: number
  ): InstitutionalSweepResult {
    const pipValue = getCentralizedPipValue(this.symbol);
    const bufferPrice = this.config.sweepBufferPips * pipValue;
    
    // Verificar sweep de HIGH pools
    const highPools = pools.filter(p => 
      !p.swept && (
        p.type === 'SESSION_HIGH' || 
        p.type === 'DAILY_HIGH' || 
        p.type === 'SWING_HIGH'
      )
    );
    
    for (const pool of highPools) {
      if (currentPrice > pool.price) {
        // Sweep em tempo real detectado (NÃO confirmado)
        return {
          detected: true,
          confirmed: false,  // NUNCA confirma em tempo real
          pool,
          sweepType: 'HIGH',
          sweepPrice: pool.price,
          sweepTime: Date.now(),
          confirmationCandle: null,
        };
      }
    }
    
    // Verificar sweep de LOW pools
    const lowPools = pools.filter(p => 
      !p.swept && (
        p.type === 'SESSION_LOW' || 
        p.type === 'DAILY_LOW' || 
        p.type === 'SWING_LOW'
      )
    );
    
    for (const pool of lowPools) {
      if (currentPrice < pool.price) {
        // Sweep em tempo real detectado (NÃO confirmado)
        return {
          detected: true,
          confirmed: false,  // NUNCA confirma em tempo real
          pool,
          sweepType: 'LOW',
          sweepPrice: pool.price,
          sweepTime: Date.now(),
          confirmationCandle: null,
        };
      }
    }
    
    return {
      detected: false,
      confirmed: false,
      pool: null,
      sweepType: null,
      sweepPrice: null,
      sweepTime: null,
      confirmationCandle: null,
    };
  }
  
  /**
   * Obtém o pool mais próximo do preço atual
   */
  getNearestPool(pools: LiquidityPool[], currentPrice: number, type: 'HIGH' | 'LOW'): LiquidityPool | null {
    const relevantPools = pools.filter(p => {
      if (type === 'HIGH') {
        return (p.type === 'SESSION_HIGH' || p.type === 'DAILY_HIGH' || p.type === 'SWING_HIGH') && !p.swept;
      } else {
        return (p.type === 'SESSION_LOW' || p.type === 'DAILY_LOW' || p.type === 'SWING_LOW') && !p.swept;
      }
    });
    
    if (relevantPools.length === 0) return null;
    
    // Ordenar por distância do preço atual
    relevantPools.sort((a, b) => {
      const distA = Math.abs(a.price - currentPrice);
      const distB = Math.abs(b.price - currentPrice);
      return distA - distB;
    });
    
    return relevantPools[0];
  }
  
  /**
   * Obtém informações formatadas dos pools para logs
   */
  getPoolsInfo(pools: LiquidityPool[]): string {
    const sessionPools = pools.filter(p => p.source === 'SESSION');
    const dailyPools = pools.filter(p => p.source === 'DAILY');
    const swingPools = pools.filter(p => p.source === 'SWING');
    
    const parts: string[] = [];
    
    if (sessionPools.length > 0) {
      const high = sessionPools.find(p => p.type === 'SESSION_HIGH');
      const low = sessionPools.find(p => p.type === 'SESSION_LOW');
      parts.push(`Session[H:${high?.price.toFixed(5) || 'N/A'} L:${low?.price.toFixed(5) || 'N/A'}]`);
    }
    
    if (dailyPools.length > 0) {
      const high = dailyPools.find(p => p.type === 'DAILY_HIGH');
      const low = dailyPools.find(p => p.type === 'DAILY_LOW');
      parts.push(`Daily[H:${high?.price.toFixed(5) || 'N/A'} L:${low?.price.toFixed(5) || 'N/A'}]`);
    }
    
    if (swingPools.length > 0) {
      parts.push(`Swings[${swingPools.length}]`);
    }
    
    return parts.join(' | ') || 'No pools';
  }
  
  /**
   * Reseta o estado de swept de todos os pools
   */
  resetPools(pools: LiquidityPool[]): LiquidityPool[] {
    return pools.map(p => ({
      ...p,
      swept: false,
      sweptAt: null,
      sweptCandle: null,
    }));
  }
}

/**
 * Factory function para criar LiquidityEngine
 */
export function createLiquidityEngine(symbol: string, config?: Partial<LiquidityEngineConfig>): LiquidityEngine {
  return new LiquidityEngine(symbol, config);
}
