/**
 * SMC Strategy Institutional - Módulo de Integração Institucional
 * 
 * Este módulo integra os engines institucionais (Session, Context, Liquidity, FVG)
 * com a estratégia SMC existente, implementando a FSM (Máquina de Estados Finitos).
 * 
 * Fluxo Institucional:
 * IDLE → WAIT_SWEEP → WAIT_CHOCH → WAIT_FVG → WAIT_MITIGATION → WAIT_ENTRY → COOLDOWN → IDLE
 * 
 * IMPORTANTE: Este módulo NÃO substitui a lógica existente, apenas adiciona
 * uma camada institucional que atua como gate (pré-condição) para a entrada.
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 */

import { TrendbarData } from "./CTraderClient";
import { SwingPoint, OrderBlock, SymbolSwarmState, SMCStrategyConfig } from "./SMCStrategy";
import { getLastClosedCandle, getLastNClosedCandles, isCandleClosed } from "../../../shared/candleUtils";
import {
  InstitutionalFSMState,
  InstitutionalState,
  InstitutionalConfig,
  InstitutionalLog,
  InstitutionalLogType,
  FinalDecision,
  FSMTransition,
  createEmptyInstitutionalState,
  isValidFSMTransition,
  getStateTimeout,
} from "./SMCInstitutionalTypes";
import {
  SessionEngine,
  ContextEngine,
  LiquidityEngine,
  FVGEngine,
} from "./engines";

// ============= TIPOS DE LOG =============

/**
 * Callback para logs institucionais
 */
export type InstitutionalLogCallback = (log: InstitutionalLog) => void;

// ============= CLASSE PRINCIPAL =============

/**
 * SMCInstitutionalManager - Gerenciador do fluxo institucional
 * 
 * Responsável por:
 * - Gerenciar a FSM por símbolo
 * - Orquestrar os engines (Session, Context, Liquidity, FVG)
 * - Verificar timeouts e transições de estado
 * - Emitir logs estruturados (PHASE_TRANSITION, DECISION_FINAL)
 */
export class SMCInstitutionalManager {
  private symbol: string;
  private config: InstitutionalConfig;
  private smcConfig: SMCStrategyConfig;
  
  // Engines
  private sessionEngine: SessionEngine;
  private contextEngine: ContextEngine;
  private liquidityEngine: LiquidityEngine;
  private fvgEngine: FVGEngine;
  
  // Estado institucional
  private state: InstitutionalState;
  
  // Callback de log
  private logCallback: InstitutionalLogCallback | null = null;
  
  constructor(
    symbol: string,
    config: InstitutionalConfig,
    smcConfig: SMCStrategyConfig
  ) {
    this.symbol = symbol;
    this.config = config;
    this.smcConfig = smcConfig;
    
    // Inicializar engines
    this.sessionEngine = new SessionEngine(symbol, {
      asiaStart: config.asiaSessionStartUtc,
      asiaEnd: config.asiaSessionEndUtc,
      londonStart: config.londonSessionStartUtc,
      londonEnd: config.londonSessionEndUtc,
      nyStart: config.nySessionStartUtc,
      nyEnd: config.nySessionEndUtc,
    });
    
    this.contextEngine = new ContextEngine(symbol);
    
    this.liquidityEngine = new LiquidityEngine(symbol, {
      sweepBufferPips: smcConfig.sweepBufferPips,
      includeSwingPoints: true,
    });
    
    this.fvgEngine = new FVGEngine(symbol, {
      minGapPips: config.minGapPips,
    });
    
    // Inicializar estado
    this.state = createEmptyInstitutionalState();
  }
  
  /**
   * Define callback para logs institucionais
   */
  setLogCallback(callback: InstitutionalLogCallback): void {
    this.logCallback = callback;
  }
  
  /**
   * Atualiza a configuração institucional
   */
  updateConfig(config: Partial<InstitutionalConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Atualizar engines
    this.sessionEngine.updateConfig({
      asiaStart: this.config.asiaSessionStartUtc,
      asiaEnd: this.config.asiaSessionEndUtc,
      londonStart: this.config.londonSessionStartUtc,
      londonEnd: this.config.londonSessionEndUtc,
      nyStart: this.config.nySessionStartUtc,
      nyEnd: this.config.nySessionEndUtc,
    });
    
    this.liquidityEngine.updateConfig({
      sweepBufferPips: this.smcConfig.sweepBufferPips,
    });
    
    this.fvgEngine.updateConfig({
      minGapPips: this.config.minGapPips,
    });
  }
  
  /**
   * Processa candles M15 e atualiza o estado institucional
   * IMPORTANTE: Esta é a função principal que deve ser chamada a cada candle M15 fechado
   * 
   * @param m15Candles Array de candles M15
   * @param m5Candles Array de candles M5
   * @param swarmState Estado atual do SMC (swing points, choch, etc.)
   * @param currentPrice Preço atual
   * @returns true se o setup institucional está pronto para entrada
   */
  processCandles(
    m15Candles: TrendbarData[],
    m5Candles: TrendbarData[],
    swarmState: SymbolSwarmState,
    currentPrice: number
  ): boolean {
    // Verificar se modo institucional está habilitado
    if (!this.config.institutionalModeEnabled) {
      return true; // Bypass institucional - permite entrada direta
    }
    
    const now = Date.now();
    
    // 1. Atualizar SessionEngine
    this.state.session = this.sessionEngine.processM15Candles(
      this.state.session,
      m15Candles
    );
    
    // 2. Atualizar ContextEngine
    this.state.context = this.contextEngine.evaluateContext(
      currentPrice,
      this.state.session.previousSession
    );
    
    // 3. Verificar se contexto permite trading
    if (!this.contextEngine.canTrade(this.state.context)) {
      // Contexto inválido - bloquear
      if (this.state.fsmState !== 'IDLE') {
        this.transitionTo('IDLE', 'Contexto inválido: ' + this.contextEngine.getBlockReason(this.state.context));
      }
      return false;
    }
    
    // 4. Construir pools de liquidez
    this.state.liquidityPools = this.liquidityEngine.buildLiquidityPools(
      this.state.session,
      swarmState.swingHighs,
      swarmState.swingLows
    );
    
    // 5. Verificar timeouts
    this.checkTimeouts();
    
    // 6. Processar FSM
    return this.processFSM(m15Candles, m5Candles, swarmState, currentPrice);
  }
  
  /**
   * Processa a FSM (Máquina de Estados Finitos)
   * 
   * CORREÇÃO P0.1 - LOOK-AHEAD: Agora usa getLastClosedCandle para garantir
   * que apenas candles FECHADOS são usados para tomada de decisão.
   */
  private processFSM(
    m15Candles: TrendbarData[],
    m5Candles: TrendbarData[],
    swarmState: SymbolSwarmState,
    currentPrice: number
  ): boolean {
    const now = Date.now();
    
    // CORREÇÃO P0.1: Usar getLastClosedCandle para garantir ZERO LOOK-AHEAD
    const m15Result = getLastClosedCandle(m15Candles, 15, now);
    const m5Result = getLastClosedCandle(m5Candles, 5, now);
    
    // Se não temos candles fechados, não podemos processar
    if (!m15Result.isConfirmed || !m15Result.candle) {
      console.log(`[SMC-INST] ${this.symbol}: Aguardando candle M15 fechado (look-ahead prevention)`);
      return false;
    }
    
    if (!m5Result.isConfirmed || !m5Result.candle) {
      console.log(`[SMC-INST] ${this.symbol}: Aguardando candle M5 fechado (look-ahead prevention)`);
      return false;
    }
    
    const lastM15Candle = m15Result.candle;
    const lastM5Candle = m5Result.candle;
    
    switch (this.state.fsmState) {
      case 'IDLE':
        // Verificar se temos sessão anterior e contexto válido
        if (this.state.session.previousSession && this.state.context.grade !== 'NO_TRADE') {
          this.transitionTo('WAIT_SWEEP', 'Sessão anterior disponível, aguardando sweep');
        }
        return false;
        
      case 'WAIT_SWEEP':
        // Detectar sweep institucional em candle fechado M15
        const sweepResult = this.liquidityEngine.detectInstitutionalSweep(
          this.state.liquidityPools,
          lastM15Candle
        );
        
        if (sweepResult.confirmed) {
          this.state.lastInstitutionalSweep = sweepResult;
          this.transitionTo('WAIT_CHOCH', `Sweep ${sweepResult.sweepType} confirmado em ${sweepResult.sweepPrice?.toFixed(5)}`);
        }
        return false;
        
      case 'WAIT_CHOCH':
        // Verificar se CHoCH foi detectado pelo SMC core
        if (swarmState.chochDetected && !this.state.chochConsumed) {
          // Verificar se direção do CHoCH é compatível com o sweep
          const sweepType = this.state.lastInstitutionalSweep?.sweepType;
          const chochDirection = swarmState.chochDirection;
          
          const isCompatible = (
            (sweepType === 'HIGH' && chochDirection === 'BEARISH') ||
            (sweepType === 'LOW' && chochDirection === 'BULLISH')
          );
          
          if (isCompatible) {
            this.state.chochConsumed = true;
            this.transitionTo('WAIT_FVG', `CHoCH ${chochDirection} confirmado em ${swarmState.chochPrice?.toFixed(5)}`);
          }
        }
        return false;
        
      case 'WAIT_FVG':
        // Detectar FVG em M5
        const expectedDirection = swarmState.chochDirection === 'BULLISH' ? 'BULLISH' : 'BEARISH';
        this.state.fvg = this.fvgEngine.detectFVG(
          m5Candles,
          expectedDirection,
          this.state.fvg
        );
        
        if (this.fvgEngine.hasValidFVG(this.state.fvg)) {
          const fvg = this.state.fvg.activeFVG!;
          this.transitionTo('WAIT_MITIGATION', `FVG ${fvg.direction} detectado: ${fvg.low.toFixed(5)}-${fvg.high.toFixed(5)} (${fvg.gapSizePips.toFixed(1)} pips)`);
        }
        return false;
        
      case 'WAIT_MITIGATION':
        // Verificar mitigação do FVG
        this.state.fvg = this.fvgEngine.checkMitigation(this.state.fvg, lastM5Candle);
        
        if (this.fvgEngine.isFVGMitigated(this.state.fvg)) {
          this.transitionTo('WAIT_ENTRY', `FVG mitigado em ${this.state.fvg.activeFVG?.mitigatedPrice?.toFixed(5)}`);
        }
        
        // Verificar se FVG foi invalidado
        if (this.fvgEngine.isFVGInvalidated(this.state.fvg, currentPrice)) {
          this.state.fvg = this.fvgEngine.invalidateFVG(this.state.fvg);
          this.transitionTo('IDLE', 'FVG invalidado - preço passou da zona');
        }
        return false;
        
      case 'WAIT_ENTRY':
        // Setup institucional completo - permitir entrada
        // A função analyzeEntryM5 do SMC core pode ser chamada
        return true;
        
      case 'COOLDOWN':
        // Em cooldown - não permitir entrada
        return false;
        
      default:
        return false;
    }
  }
  
  /**
   * Verifica timeouts da FSM
   */
  private checkTimeouts(): void {
    if (this.state.fsmState === 'IDLE') return;
    
    const now = Date.now();
    const stateChangedAt = this.state.fsmStateChangedAt || now;
    const elapsedMinutes = (now - stateChangedAt) / 60000;
    const timeout = getStateTimeout(this.state.fsmState, this.config);
    
    if (timeout > 0 && elapsedMinutes > timeout) {
      this.logDecisionFinal('EXPIRE', null, {
        expiredState: this.state.fsmState,
        elapsedMinutes,
        timeout,
      });
      this.transitionTo('IDLE', `Timeout: ${this.state.fsmState} expirou após ${elapsedMinutes.toFixed(1)} minutos`);
    }
  }
  
  /**
   * Transiciona para um novo estado da FSM
   */
  private transitionTo(newState: InstitutionalFSMState, reason: string): void {
    const oldState = this.state.fsmState;
    
    // Validar transição
    if (!isValidFSMTransition(oldState, newState)) {
      console.warn(`[SMC-INST] ${this.symbol}: Transição inválida ${oldState} → ${newState}`);
      return;
    }
    
    const now = Date.now();
    
    // Registrar transição
    const transition: FSMTransition = {
      fromState: oldState,
      toState: newState,
      timestamp: now,
      reason,
    };
    
    this.state.fsmTransitionHistory.push(transition);
    
    // Manter apenas últimas 20 transições
    if (this.state.fsmTransitionHistory.length > 20) {
      this.state.fsmTransitionHistory = this.state.fsmTransitionHistory.slice(-20);
    }
    
    // Atualizar estado
    this.state.fsmState = newState;
    this.state.fsmStateChangedAt = now;
    
    // Resetar estados específicos em certas transições
    if (newState === 'IDLE') {
      this.resetForNewSetup();
    }
    
    // Emitir log de transição
    this.logPhaseTransition(oldState, newState, reason);
  }
  
  /**
   * Reseta estados para novo setup
   */
  private resetForNewSetup(): void {
    this.state.lastInstitutionalSweep = null;
    this.state.chochConsumed = false;
    this.state.fvg = FVGEngine.createEmptyState();
    this.state.liquidityPools = this.liquidityEngine.resetPools(this.state.liquidityPools);
  }
  
  /**
   * Notifica que um trade foi executado
   */
  onTradeExecuted(direction: 'BUY' | 'SELL', entryPrice: number): void {
    this.state.tradesThisSession++;
    this.state.sessionTradeHistory.push({
      timestamp: Date.now(),
      direction,
      entryPrice,
      session: this.state.session.currentSession,
    });
    
    this.logDecisionFinal('TRADE', direction, { entryPrice });
    this.transitionTo('COOLDOWN', `Trade ${direction} executado em ${entryPrice.toFixed(5)}`);
  }
  
  /**
   * Verifica se pode executar mais trades nesta sessão
   */
  canTradeInSession(): boolean {
    return this.state.tradesThisSession < this.config.maxTradesPerSession;
  }
  
  /**
   * Verifica se a direção é permitida pelo contexto
   */
  isDirectionAllowed(direction: 'BUY' | 'SELL'): boolean {
    return this.contextEngine.isDirectionAllowed(this.state.context, direction);
  }
  
  /**
   * Obtém o estado atual da FSM
   */
  getFSMState(): InstitutionalFSMState {
    return this.state.fsmState;
  }
  
  /**
   * Obtém o estado institucional completo
   */
  getInstitutionalState(): InstitutionalState {
    return { ...this.state };
  }
  
  /**
   * Obtém informações formatadas para debug
   */
  getDebugInfo(): string {
    const parts: string[] = [];
    
    parts.push(`FSM: ${this.state.fsmState}`);
    parts.push(this.sessionEngine.getSessionInfo(this.state.session));
    parts.push(this.contextEngine.getContextInfo(this.state.context));
    parts.push(this.liquidityEngine.getPoolsInfo(this.state.liquidityPools));
    parts.push(this.fvgEngine.getFVGInfo(this.state.fvg));
    parts.push(`Trades: ${this.state.tradesThisSession}/${this.config.maxTradesPerSession}`);
    
    return parts.join(' | ');
  }
  
  // ============= LOGS INSTITUCIONAIS =============
  
  /**
   * Emite log de transição de fase
   */
  private logPhaseTransition(
    fromState: InstitutionalFSMState,
    toState: InstitutionalFSMState,
    reason: string
  ): void {
    const log: InstitutionalLog = {
      type: 'PHASE_TRANSITION',
      symbol: this.symbol,
      timestamp: Date.now(),
      fromState,
      toState,
      reason,
    };
    
    // Log no console (estruturado)
    console.log(`[SMC-INST] ${this.symbol}: ${fromState} → ${toState} | ${reason}`);
    
    // Callback
    if (this.logCallback) {
      this.logCallback(log);
    }
  }
  
  /**
   * Emite log de decisão final
   */
  private logDecisionFinal(
    decision: FinalDecision,
    direction: 'BUY' | 'SELL' | null,
    metadata?: Record<string, any>
  ): void {
    const log: InstitutionalLog = {
      type: 'DECISION_FINAL',
      symbol: this.symbol,
      timestamp: Date.now(),
      decision,
      direction,
      metadata,
    };
    
    // Log no console (estruturado)
    console.log(`[SMC-INST] ${this.symbol}: DECISION_FINAL | ${decision} | ${direction || 'N/A'}`);
    
    // Callback
    if (this.logCallback) {
      this.logCallback(log);
    }
  }
  
  /**
   * Reseta a sessão (chamado quando muda de sessão)
   */
  onSessionChange(): void {
    this.state.tradesThisSession = 0;
    this.state.sessionTradeHistory = [];
  }
}

/**
 * Factory function para criar SMCInstitutionalManager
 */
export function createInstitutionalManager(
  symbol: string,
  config: InstitutionalConfig,
  smcConfig: SMCStrategyConfig
): SMCInstitutionalManager {
  return new SMCInstitutionalManager(symbol, config, smcConfig);
}

/**
 * Extrai configuração institucional do SMCStrategyConfig
 */
export function extractInstitutionalConfig(config: any): InstitutionalConfig {
  return {
    institutionalModeEnabled: config.institutionalModeEnabled ?? true,
    minGapPips: parseFloat(config.minGapPips) || 2.0,
    asiaSessionStartUtc: parseInt(config.asiaSessionStartUtc) || 1380,
    asiaSessionEndUtc: parseInt(config.asiaSessionEndUtc) || 420,
    londonSessionStartUtc: parseInt(config.londonSessionStartUtc) || 420,
    londonSessionEndUtc: parseInt(config.londonSessionEndUtc) || 720,
    nySessionStartUtc: parseInt(config.nySessionStartUtc) || 720,
    nySessionEndUtc: parseInt(config.nySessionEndUtc) || 1260,
    sweepValidationMinutes: parseInt(config.sweepValidationMinutes) || 90,
    instWaitFvgMinutes: parseInt(config.instWaitFvgMinutes) || 90,
    instWaitMitigationMinutes: parseInt(config.instWaitMitigationMinutes) || 60,
    instWaitEntryMinutes: parseInt(config.instWaitEntryMinutes) || 30,
    instCooldownMinutes: parseInt(config.instCooldownMinutes) || 20,
    maxTradesPerSession: parseInt(config.maxTradesPerSession) || 2,
  };
}
