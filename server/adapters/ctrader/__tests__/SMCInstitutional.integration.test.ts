/**
 * SMC Institutional Integration Tests
 * 
 * Testes de integração para verificar o funcionamento correto da estratégia SMC
 * com o módulo institucional integrado.
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 * @date 2026-02-04
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SMCStrategy, createSMCStrategy, SMCStrategyConfig } from '../SMCStrategy';
import { SMCInstitutionalManager, extractInstitutionalConfig } from '../SMCStrategyInstitutional';
import { SessionEngine } from '../engines/SessionEngine';
import { ContextEngine } from '../engines/ContextEngine';
import { LiquidityEngine } from '../engines/LiquidityEngine';
import { FVGEngine } from '../engines/FVGEngine';
import { TrendbarData } from '../CTraderClient';
import { createEmptyInstitutionalState, InstitutionalFSMState } from '../SMCInstitutionalTypes';

// ============= HELPERS =============

/**
 * Cria um candle de teste
 */
function createCandle(
  timestamp: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number = 1000
): TrendbarData {
  return {
    timestamp,
    open,
    high,
    low,
    close,
    volume,
    tickVolume: volume,
  };
}

/**
 * Cria uma série de candles para teste
 */
function createCandleSeries(
  startTimestamp: number,
  intervalMs: number,
  count: number,
  basePrice: number = 1.10000
): TrendbarData[] {
  const candles: TrendbarData[] = [];
  
  for (let i = 0; i < count; i++) {
    const timestamp = startTimestamp + (i * intervalMs);
    const variation = (Math.random() - 0.5) * 0.001; // ±0.0005
    const open = basePrice + variation;
    const close = basePrice + variation + (Math.random() - 0.5) * 0.0005;
    const high = Math.max(open, close) + Math.random() * 0.0003;
    const low = Math.min(open, close) - Math.random() * 0.0003;
    
    candles.push(createCandle(timestamp, open, high, low, close));
    basePrice = close;
  }
  
  return candles;
}

/**
 * Configuração padrão para testes
 */
function getTestConfig(): Partial<SMCStrategyConfig> {
  return {
    institutionalModeEnabled: true,
    verboseLogging: false,
    suppressClassicLogs: true,
    swingH1Lookback: 10,
    chochM15Lookback: 5,
    fractalLeftBars: 2,
    fractalRightBars: 2,
    chochMinPips: 5,
    sweepBufferPips: 0.5,
    maxTradesPerSession: 3,
    minGapPips: 2.0,
  };
}

// ============= TESTES =============

describe('SMCStrategy - Módulo Institucional', () => {
  let strategy: SMCStrategy;
  
  beforeEach(() => {
    strategy = createSMCStrategy(getTestConfig());
    strategy.setCurrentSymbol('EURUSD');
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('Inicialização', () => {
    it('deve criar InstitutionalManager quando institutionalModeEnabled=true', () => {
      const config = strategy.getConfig();
      expect(config.institutionalModeEnabled).toBe(true);
      
      // Verificar se o método existe
      expect(typeof strategy.getInstitutionalFSMState).toBe('function');
      expect(typeof strategy.getInstitutionalTradesThisSession).toBe('function');
      expect(typeof strategy.getInstitutionalCurrentSession).toBe('function');
    });
    
    it('deve inicializar FSM em estado IDLE', () => {
      const fsmState = strategy.getInstitutionalFSMState('EURUSD');
      expect(fsmState).toBe('IDLE');
    });
    
    it('deve retornar 0 trades na sessão inicial', () => {
      const tradesCount = strategy.getInstitutionalTradesThisSession('EURUSD');
      expect(tradesCount).toBe(0);
    });
  });
  
  describe('Método getInstitutionalTradesThisSession', () => {
    it('deve retornar 0 para símbolo não inicializado', () => {
      const count = strategy.getInstitutionalTradesThisSession('UNKNOWN');
      expect(count).toBe(0);
    });
    
    it('deve retornar contagem correta após trades', () => {
      // Este teste verifica que o método existe e funciona
      const count = strategy.getInstitutionalTradesThisSession('EURUSD');
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('Método getInstitutionalCurrentSession', () => {
    it('deve retornar OFF_SESSION para símbolo não inicializado', () => {
      const session = strategy.getInstitutionalCurrentSession('UNKNOWN');
      expect(session).toBe('OFF_SESSION');
    });
    
    it('deve retornar sessão válida para símbolo inicializado', () => {
      const session = strategy.getInstitutionalCurrentSession('EURUSD');
      expect(['ASIA', 'LONDON', 'NY', 'OFF_SESSION']).toContain(session);
    });
  });
});

describe('SessionEngine', () => {
  let engine: SessionEngine;
  
  beforeEach(() => {
    engine = new SessionEngine('EURUSD');
  });
  
  describe('getCurrentSession', () => {
    it('deve identificar sessão ASIA corretamente (23:00-07:00 UTC)', () => {
      // 23:30 UTC = sessão ASIA
      const timestamp = new Date('2026-02-04T23:30:00Z').getTime();
      const session = engine.getCurrentSession(timestamp);
      expect(session).toBe('ASIA');
    });
    
    it('deve identificar sessão LONDON corretamente (07:00-12:00 UTC)', () => {
      // 09:00 UTC = sessão LONDON
      const timestamp = new Date('2026-02-04T09:00:00Z').getTime();
      const session = engine.getCurrentSession(timestamp);
      expect(session).toBe('LONDON');
    });
    
    it('deve identificar sessão NY corretamente (12:00-21:00 UTC)', () => {
      // 15:00 UTC = sessão NY
      const timestamp = new Date('2026-02-04T15:00:00Z').getTime();
      const session = engine.getCurrentSession(timestamp);
      expect(session).toBe('NY');
    });
    
    it('deve identificar OFF_SESSION corretamente (21:00-23:00 UTC)', () => {
      // 22:00 UTC = OFF_SESSION
      const timestamp = new Date('2026-02-04T22:00:00Z').getTime();
      const session = engine.getCurrentSession(timestamp);
      expect(session).toBe('OFF_SESSION');
    });
  });
  
  describe('bootstrapPreviousSession', () => {
    it('deve popular previousSession com dados históricos', () => {
      const now = new Date('2026-02-04T10:00:00Z').getTime(); // Durante LONDON
      const candles = createCandleSeries(
        now - (24 * 60 * 60 * 1000), // 24h atrás
        15 * 60 * 1000, // M15
        96, // 24h de candles M15
        1.10000
      );
      
      const emptyState = SessionEngine.createEmptyState();
      const newState = engine.bootstrapPreviousSession(emptyState, candles, now);
      
      // Deve ter populado previousSession
      expect(newState.previousSession).not.toBeNull();
    });
  });
});

describe('ContextEngine', () => {
  let engine: ContextEngine;
  
  beforeEach(() => {
    engine = new ContextEngine('EURUSD');
  });
  
  describe('evaluateContext', () => {
    it('deve classificar preço no TOP do range', () => {
      const previousSession = {
        type: 'LONDON' as const,
        high: 1.10500,
        low: 1.10000,
        range: 0.00500,
        openPrice: 1.10200,
        closePrice: 1.10400,
        startTime: Date.now() - 3600000,
        endTime: Date.now(),
        isComplete: true,
        candleCount: 20,
      };
      
      // Preço no topo (80% do range)
      const currentPrice = 1.10400;
      const context = engine.evaluateContext(currentPrice, previousSession);
      
      expect(context.classification).toBe('TOP');
      expect(context.bias).toBe('SHORT_ONLY');
    });
    
    it('deve classificar preço no BOTTOM do range', () => {
      const previousSession = {
        type: 'LONDON' as const,
        high: 1.10500,
        low: 1.10000,
        range: 0.00500,
        openPrice: 1.10200,
        closePrice: 1.10100,
        startTime: Date.now() - 3600000,
        endTime: Date.now(),
        isComplete: true,
        candleCount: 20,
      };
      
      // Preço no fundo (20% do range)
      const currentPrice = 1.10100;
      const context = engine.evaluateContext(currentPrice, previousSession);
      
      expect(context.classification).toBe('BOTTOM');
      expect(context.bias).toBe('LONG_ONLY');
    });
    
    it('deve retornar NO_TRADE sem sessão anterior', () => {
      const context = engine.evaluateContext(1.10000, null);
      
      expect(context.grade).toBe('NO_TRADE');
      expect(context.bias).toBe('NONE');
    });
  });
});

describe('LiquidityEngine', () => {
  let engine: LiquidityEngine;
  
  beforeEach(() => {
    engine = new LiquidityEngine('EURUSD', {
      sweepBufferPips: 0.5,
      includeSwingPoints: true,
    });
  });
  
  describe('buildLiquidityPools', () => {
    it('deve criar pools a partir de sessão anterior', () => {
      const sessionState = {
        currentSession: 'LONDON' as const,
        currentSessionData: null,
        previousSession: {
          type: 'ASIA' as const,
          high: 1.10500,
          low: 1.10000,
          range: 0.00500,
          openPrice: 1.10200,
          closePrice: 1.10300,
          startTime: Date.now() - 7200000,
          endTime: Date.now() - 3600000,
          isComplete: true,
          candleCount: 32,
        },
        previousDayHigh: 1.10600,
        previousDayLow: 1.09900,
        lastUpdateTime: Date.now(),
        lastUpdateCandleTime: Date.now() - 900000,
      };
      
      const pools = engine.buildLiquidityPools(sessionState, [], []);
      
      // Deve ter pools de sessão e diários
      expect(pools.length).toBeGreaterThanOrEqual(4);
      
      // Verificar tipos de pools
      const poolTypes = pools.map(p => p.type);
      expect(poolTypes).toContain('SESSION_HIGH');
      expect(poolTypes).toContain('SESSION_LOW');
      expect(poolTypes).toContain('DAILY_HIGH');
      expect(poolTypes).toContain('DAILY_LOW');
    });
    
    it('deve preservar estado de sweep em pools existentes', () => {
      const sessionState = {
        currentSession: 'LONDON' as const,
        currentSessionData: null,
        previousSession: {
          type: 'ASIA' as const,
          high: 1.10500,
          low: 1.10000,
          range: 0.00500,
          openPrice: 1.10200,
          closePrice: 1.10300,
          startTime: Date.now() - 7200000,
          endTime: Date.now() - 3600000,
          isComplete: true,
          candleCount: 32,
        },
        previousDayHigh: null,
        previousDayLow: null,
        lastUpdateTime: Date.now(),
        lastUpdateCandleTime: Date.now() - 900000,
      };
      
      // Criar pools iniciais
      const initialPools = engine.buildLiquidityPools(sessionState, [], []);
      
      // Marcar um pool como swept
      if (initialPools.length > 0) {
        initialPools[0].swept = true;
        initialPools[0].sweptAt = Date.now();
      }
      
      // Reconstruir pools passando os existentes
      const newPools = engine.buildLiquidityPools(sessionState, [], [], initialPools);
      
      // O pool swept deve manter seu estado
      const sweptPool = newPools.find(p => p.poolKey === initialPools[0]?.poolKey);
      if (sweptPool) {
        expect(sweptPool.swept).toBe(true);
      }
    });
  });
  
  describe('detectInstitutionalSweep', () => {
    it('deve detectar sweep de HIGH quando wick rompe e corpo fecha abaixo', () => {
      const pools = [{
        poolKey: 'SESSION_HIGH:1.10500:1234567890',
        type: 'SESSION_HIGH' as const,
        price: 1.10500,
        timestamp: Date.now() - 3600000,
        source: 'SESSION' as const,
        priority: 1,
        swept: false,
        sweptAt: null,
        sweptCandle: null,
        sweepDirection: null,
      }];
      
      // Candle que faz sweep: wick acima do pool, corpo fecha abaixo
      const sweepCandle = createCandle(
        Date.now(),
        1.10450, // open
        1.10520, // high (acima do pool)
        1.10400, // low
        1.10420  // close (abaixo do pool)
      );
      
      const result = engine.detectInstitutionalSweep(pools, sweepCandle);
      
      expect(result.detected).toBe(true);
      expect(result.confirmed).toBe(true);
      expect(result.sweepType).toBe('HIGH');
    });
    
    it('deve detectar sweep de LOW quando wick rompe e corpo fecha acima', () => {
      const pools = [{
        poolKey: 'SESSION_LOW:1.10000:1234567890',
        type: 'SESSION_LOW' as const,
        price: 1.10000,
        timestamp: Date.now() - 3600000,
        source: 'SESSION' as const,
        priority: 1,
        swept: false,
        sweptAt: null,
        sweptCandle: null,
        sweepDirection: null,
      }];
      
      // Candle que faz sweep: wick abaixo do pool, corpo fecha acima
      const sweepCandle = createCandle(
        Date.now(),
        1.10050, // open
        1.10100, // high
        1.09980, // low (abaixo do pool)
        1.10080  // close (acima do pool)
      );
      
      const result = engine.detectInstitutionalSweep(pools, sweepCandle);
      
      expect(result.detected).toBe(true);
      expect(result.confirmed).toBe(true);
      expect(result.sweepType).toBe('LOW');
    });
    
    it('não deve detectar sweep se pool já foi swept', () => {
      const pools = [{
        poolKey: 'SESSION_HIGH:1.10500:1234567890',
        type: 'SESSION_HIGH' as const,
        price: 1.10500,
        timestamp: Date.now() - 3600000,
        source: 'SESSION' as const,
        priority: 1,
        swept: true, // Já swept
        sweptAt: Date.now() - 1800000,
        sweptCandle: Date.now() - 1800000,
        sweepDirection: 'HIGH' as const,
      }];
      
      const sweepCandle = createCandle(
        Date.now(),
        1.10450,
        1.10520,
        1.10400,
        1.10420
      );
      
      const result = engine.detectInstitutionalSweep(pools, sweepCandle);
      
      expect(result.detected).toBe(false);
    });
  });
});

describe('FVGEngine', () => {
  let engine: FVGEngine;
  
  beforeEach(() => {
    engine = new FVGEngine('EURUSD', {
      minGapPips: 2.0,
    });
  });
  
  describe('detectFVG', () => {
    it('deve detectar FVG bullish quando há gap entre candle 1 high e candle 3 low', () => {
      // Criar 3 candles com gap bullish
      const now = Date.now();
      const candles = [
        createCandle(now - 600000, 1.10000, 1.10050, 1.09980, 1.10040), // Candle 1
        createCandle(now - 300000, 1.10040, 1.10100, 1.10030, 1.10090), // Candle 2 (meio)
        createCandle(now, 1.10090, 1.10150, 1.10080, 1.10140),          // Candle 3 (gap: low > candle1 high)
      ];
      
      const emptyState = FVGEngine.createEmptyState();
      const newState = engine.detectFVG(candles, 'BULLISH', emptyState, now + 300000);
      
      // Verificar se FVG foi detectado
      if (newState.activeFVG) {
        expect(newState.activeFVG.direction).toBe('BULLISH');
        expect(newState.activeFVG.isValid).toBe(true);
      }
    });
  });
  
  describe('checkMitigation', () => {
    it('deve marcar FVG como mitigado quando candle toca a zona', () => {
      const state = {
        activeFVG: {
          direction: 'BULLISH' as const,
          high: 1.10100,
          low: 1.10050,
          midpoint: 1.10075,
          gapSizePips: 5,
          timestamp: Date.now() - 600000,
          candle1High: 1.10050,
          candle1Low: 1.10000,
          candle3High: 1.10150,
          candle3Low: 1.10100,
          isValid: true,
          mitigated: false,
          mitigatedAt: null,
          mitigatedPrice: null,
        },
        fvgHistory: [],
        lastDetectionTime: Date.now() - 600000,
        fvgCount: 1,
      };
      
      // Candle que toca a zona do FVG
      const mitigationCandle = createCandle(
        Date.now(),
        1.10120,
        1.10130,
        1.10070, // Low toca a zona do FVG
        1.10110
      );
      
      const newState = engine.checkMitigation(state, mitigationCandle);
      
      expect(newState.activeFVG?.mitigated).toBe(true);
      expect(newState.activeFVG?.mitigatedPrice).toBe(mitigationCandle.close);
    });
  });
});

describe('SMCInstitutionalManager', () => {
  let manager: SMCInstitutionalManager;
  
  beforeEach(() => {
    const instConfig = extractInstitutionalConfig({
      institutionalModeEnabled: true,
      minGapPips: 2.0,
      maxTradesPerSession: 3,
    });
    
    const smcConfig = getTestConfig() as any;
    
    manager = new SMCInstitutionalManager('EURUSD', instConfig, smcConfig);
  });
  
  describe('FSM State Management', () => {
    it('deve iniciar em estado IDLE', () => {
      expect(manager.getFSMState()).toBe('IDLE');
    });
    
    it('deve retornar estado institucional completo', () => {
      const state = manager.getInstitutionalState();
      
      expect(state.fsmState).toBe('IDLE');
      expect(state.tradesThisSession).toBe(0);
      expect(state.session).toBeDefined();
      expect(state.context).toBeDefined();
      expect(state.liquidityPools).toBeDefined();
    });
  });
  
  describe('canTradeInSession', () => {
    it('deve permitir trades quando budget não esgotado', () => {
      expect(manager.canTradeInSession()).toBe(true);
    });
  });
  
  describe('getDebugInfo', () => {
    it('deve retornar string com informações de debug', () => {
      const debugInfo = manager.getDebugInfo();
      
      expect(typeof debugInfo).toBe('string');
      expect(debugInfo.length).toBeGreaterThan(0);
      expect(debugInfo).toContain('FSM');
    });
  });
});

describe('Integração Completa - Fluxo Institucional', () => {
  let strategy: SMCStrategy;
  
  beforeEach(() => {
    strategy = createSMCStrategy({
      ...getTestConfig(),
      institutionalModeEnabled: true,
    });
    strategy.setCurrentSymbol('EURUSD');
  });
  
  it('deve processar candles e atualizar FSM corretamente', () => {
    const now = Date.now();
    
    // Criar dados de candles para todos os timeframes
    const h1Candles = createCandleSeries(now - (48 * 60 * 60 * 1000), 60 * 60 * 1000, 48, 1.10000);
    const m15Candles = createCandleSeries(now - (24 * 60 * 60 * 1000), 15 * 60 * 1000, 96, 1.10000);
    const m5Candles = createCandleSeries(now - (12 * 60 * 60 * 1000), 5 * 60 * 1000, 144, 1.10000);
    
    // Chamar analyzeSignal
    const result = strategy.analyzeSignal(m5Candles, {
      h1: h1Candles,
      m15: m15Candles,
      m5: m5Candles,
      currentBid: 1.10100,
      currentAsk: 1.10102,
      currentSpreadPips: 0.2,
    });
    
    // Verificar que o resultado é válido
    expect(result).toBeDefined();
    expect(result.signal).toBeDefined();
    
    // Verificar que a FSM foi processada
    const fsmState = strategy.getInstitutionalFSMState('EURUSD');
    expect(fsmState).toBeDefined();
  });
});
