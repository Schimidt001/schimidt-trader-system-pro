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
 * CORREÇÃO P0.2: Implementado poolKey e merge para preservar estado de sweep
 * 
 * @author Schimidt Trader Pro
 * @version 1.1.0
 */

import { TrendbarData } from "../CTraderClient";
import {
  LiquidityPool,
  LiquidityPoolType,
  InstitutionalSweepResult,
  SessionEngineState,
  generatePoolKey,
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
  
  // Tempo máximo de vida de um pool em milissegundos (24h por padrão)
  poolExpirationMs: number;
}

/**
 * Configuração padrão do LiquidityEngine
 */
export const DEFAULT_LIQUIDITY_CONFIG: LiquidityEngineConfig = {
  sweepBufferPips: 0.5,
  includeSwingPoints: true,
  maxPoolsPerType: 5,
  poolExpirationMs: 24 * 60 * 60 * 1000, // 24 horas
};

/**
 * LiquidityEngine - Classe para gerenciamento de pools de liquidez
 * 
 * CORREÇÃO P0.2: Agora preserva estado de sweep através de poolKey e merge
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
   * Constrói pools de liquidez a partir de todas as fontes
   * 
   * CORREÇÃO P0.2: Agora recebe existingPools para fazer merge e preservar estado
   * 
   * @param sessionState Estado do SessionEngine
   * @param swingHighs Array de Swing Highs (fractais)
   * @param swingLows Array de Swing Lows (fractais)
   * @param existingPools Pools existentes para preservar estado de sweep
   * @returns Array de pools de liquidez ordenados por prioridade
   */
  buildLiquidityPools(
    sessionState: SessionEngineState,
    swingHighs: SwingPoint[] = [],
    swingLows: SwingPoint[] = [],
    existingPools: LiquidityPool[] = []
  ): LiquidityPool[] {
    const newPools: LiquidityPool[] = [];
    const now = Date.now();
    
    // Criar mapa de pools existentes por poolKey para lookup rápido
    const existingPoolsMap = new Map<string, LiquidityPool>();
    for (const pool of existingPools) {
      if (pool.poolKey) {
        existingPoolsMap.set(pool.poolKey, pool);
      }
    }
    
    // 1. Pools da sessão anterior (PRIORIDADE MÁXIMA)
    if (sessionState.previousSession) {
      // Session High
      const sessionHighKey = generatePoolKey(
        'SESSION_HIGH',
        sessionState.previousSession.high,
        sessionState.previousSession.endTime
      );
      newPools.push(this.createOrMergePool(
        sessionHighKey,
        'SESSION_HIGH',
        sessionState.previousSession.high,
        sessionState.previousSession.endTime,
        'SESSION',
        1,
        existingPoolsMap
      ));
      
      // Session Low
      const sessionLowKey = generatePoolKey(
        'SESSION_LOW',
        sessionState.previousSession.low,
        sessionState.previousSession.endTime
      );
      newPools.push(this.createOrMergePool(
        sessionLowKey,
        'SESSION_LOW',
        sessionState.previousSession.low,
        sessionState.previousSession.endTime,
        'SESSION',
        1,
        existingPoolsMap
      ));
    }
    
    // 2. Pools do dia anterior (PRIORIDADE MÉDIA)
    // Usar timestamp fixo baseado no dia para estabilidade
    const dayTimestamp = this.getDayTimestamp(now);
    
    if (sessionState.previousDayHigh !== null) {
      const dailyHighKey = generatePoolKey(
        'DAILY_HIGH',
        sessionState.previousDayHigh,
        dayTimestamp
      );
      newPools.push(this.createOrMergePool(
        dailyHighKey,
        'DAILY_HIGH',
        sessionState.previousDayHigh,
        dayTimestamp,
        'DAILY',
        2,
        existingPoolsMap
      ));
    }
    
    if (sessionState.previousDayLow !== null) {
      const dailyLowKey = generatePoolKey(
        'DAILY_LOW',
        sessionState.previousDayLow,
        dayTimestamp
      );
      newPools.push(this.createOrMergePool(
        dailyLowKey,
        'DAILY_LOW',
        sessionState.previousDayLow,
        dayTimestamp,
        'DAILY',
        2,
        existingPoolsMap
      ));
    }
    
    // 3. Swing Points como fallback (PRIORIDADE BAIXA)
    if (this.config.includeSwingPoints) {
      // Swing Highs
      const recentSwingHighs = swingHighs
        .filter(s => s.isValid)
        .slice(-this.config.maxPoolsPerType);
      
      for (const swing of recentSwingHighs) {
        const swingHighKey = generatePoolKey(
          'SWING_HIGH',
          swing.price,
          swing.timestamp
        );
        newPools.push(this.createOrMergePool(
          swingHighKey,
          'SWING_HIGH',
          swing.price,
          swing.timestamp,
          'SWING',
          3,
          existingPoolsMap,
          swing.swept,
          swing.sweptAt
        ));
      }
      
      // Swing Lows
      const recentSwingLows = swingLows
        .filter(s => s.isValid)
        .slice(-this.config.maxPoolsPerType);
      
      for (const swing of recentSwingLows) {
        const swingLowKey = generatePoolKey(
          'SWING_LOW',
          swing.price,
          swing.timestamp
        );
        newPools.push(this.createOrMergePool(
          swingLowKey,
          'SWING_LOW',
          swing.price,
          swing.timestamp,
          'SWING',
          3,
          existingPoolsMap,
          swing.swept,
          swing.sweptAt
        ));
      }
    }
    
    // Filtrar pools expirados
    const validPools = newPools.filter(pool => {
      const age = now - pool.timestamp;
      return age < this.config.poolExpirationMs;
    });
    
    // Ordenar por prioridade (menor = maior prioridade)
    return validPools.sort((a, b) => a.priority - b.priority);
  }
  
  /**
   * CORREÇÃO P0.2: Cria um novo pool ou faz merge com existente preservando estado
   * 
   * @param poolKey Chave única do pool
   * @param type Tipo do pool
   * @param price Preço do pool
   * @param timestamp Timestamp de criação
   * @param source Fonte do pool
   * @param priority Prioridade
   * @param existingPoolsMap Mapa de pools existentes
   * @param swingSwept Estado de swept do swing (para SWING pools)
   * @param swingSweptAt Timestamp de swept do swing
   * @returns Pool criado ou merged
   */
  private createOrMergePool(
    poolKey: string,
    type: LiquidityPoolType,
    price: number,
    timestamp: number,
    source: 'SESSION' | 'DAILY' | 'SWING',
    priority: number,
    existingPoolsMap: Map<string, LiquidityPool>,
    swingSwept: boolean = false,
    swingSweptAt: number | undefined = undefined
  ): LiquidityPool {
    // Verificar se já existe um pool com esta chave
    const existingPool = existingPoolsMap.get(poolKey);
    
    if (existingPool) {
      // CORREÇÃO P0.2: Preservar estado de sweep do pool existente
      return {
        poolKey,
        type,
        price,
        timestamp,
        source,
        priority,
        // Preservar estado de sweep
        swept: existingPool.swept,
        sweptAt: existingPool.sweptAt,
        sweptCandle: existingPool.sweptCandle,
        sweepDirection: existingPool.sweepDirection,
      };
    }
    
    // Criar novo pool
    return {
      poolKey,
      type,
      price,
      timestamp,
      source,
      priority,
      swept: swingSwept,
      sweptAt: swingSweptAt || null,
      sweptCandle: null,
      sweepDirection: null,
    };
  }
  
  /**
   * Obtém timestamp do início do dia UTC para estabilidade de poolKey
   */
  private getDayTimestamp(now: number): number {
    const date = new Date(now);
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime();
  }
  
  /**
   * Detecta sweep institucional em candle fechado M15
   * IMPORTANTE: Apenas sweeps confirmados em candle fechado podem armar a FSM
   * 
   * CORREÇÃO P0.2: Agora atualiza sweepDirection no pool
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
        pool.sweepDirection = 'HIGH'; // CORREÇÃO P0.2: Registrar direção
        
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
        pool.sweepDirection = 'LOW'; // CORREÇÃO P0.2: Registrar direção
        
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
      const highSwept = high?.swept ? '✓' : '';
      const lowSwept = low?.swept ? '✓' : '';
      parts.push(`Session[H:${high?.price.toFixed(5) || 'N/A'}${highSwept} L:${low?.price.toFixed(5) || 'N/A'}${lowSwept}]`);
    }
    
    if (dailyPools.length > 0) {
      const high = dailyPools.find(p => p.type === 'DAILY_HIGH');
      const low = dailyPools.find(p => p.type === 'DAILY_LOW');
      const highSwept = high?.swept ? '✓' : '';
      const lowSwept = low?.swept ? '✓' : '';
      parts.push(`Daily[H:${high?.price.toFixed(5) || 'N/A'}${highSwept} L:${low?.price.toFixed(5) || 'N/A'}${lowSwept}]`);
    }
    
    if (swingPools.length > 0) {
      const sweptCount = swingPools.filter(p => p.swept).length;
      parts.push(`Swings[${swingPools.length} (${sweptCount} swept)]`);
    }
    
    return parts.join(' | ') || 'No pools';
  }
  
  /**
   * Reseta o estado de swept de todos os pools
   * NOTA: Usar com cuidado - normalmente não deve ser chamado exceto em reset completo
   */
  resetPools(pools: LiquidityPool[]): LiquidityPool[] {
    return pools.map(p => ({
      ...p,
      swept: false,
      sweptAt: null,
      sweptCandle: null,
      sweepDirection: null,
    }));
  }
}

/**
 * Factory function para criar LiquidityEngine
 */
export function createLiquidityEngine(symbol: string, config?: Partial<LiquidityEngineConfig>): LiquidityEngine {
  return new LiquidityEngine(symbol, config);
}
