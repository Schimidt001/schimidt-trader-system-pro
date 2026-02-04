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
  
  // Logger estruturado (será injetado externamente)
  private logger: any = null;
  
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
   * Injeta logger estruturado (SMCStrategyLogger)
   */
  setLogger(logger: any): void {
    this.logger = logger;
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
    
    // CORREÇÃO P0 - BOOTSTRAP: Popular previousSession no boot
    if (!this.state.session.previousSession && m15Candles.length > 0) {
      this.state.session = this.sessionEngine.bootstrapPreviousSession(
        this.state.session,
        m15Candles,
        now
      );
      
      // LOG ESTRUTURADO: Boot institucional
      console.log(`[SMC_INST_BOOT] ${this.symbol}: nowUtc=${new Date(now).toISOString()}, currentSession=${this.state.session.currentSession}, previousSession=${this.state.session.previousSession?.type || 'null'}`);
    }
    
    // CORREÇÃO P0.3: Detectar mudança de sessão ANTES de atualizar
    const previousSession = this.state.session.currentSession;
    
    // 1. Atualizar SessionEngine
    this.state.session = this.sessionEngine.processM15Candles(
      this.state.session,
      m15Candles,
      now
    );
    
    // CORREÇÃO P0.3: Verificar se houve mudança de sessão e resetar budget
    const currentSession = this.state.session.currentSession;
    if (previousSession !== currentSession && previousSession !== 'OFF_SESSION') {
      // LOG ESTRUTURADO: Mudança de sessão
      if (this.logger) {
        this.logger.logSessionChange(this.symbol, previousSession, currentSession, now);
      } else {
        console.log(`[SMC-INST] ${this.symbol}: Sessão mudou de ${previousSession} para ${currentSession} - resetando budget`);
      }
      this.onSessionChange();
    }
    
    // 2. Atualizar ContextEngine
    this.state.context = this.contextEngine.evaluateContext(
      currentPrice,
      this.state.session.previousSession
    );
    
    // 3. Verificar se contexto permite trading
    if (!this.contextEngine.canTrade(this.state.context)) {
      // LOG ESTRUTURADO: Contexto bloqueou trading
      if (this.logger) {
        this.logger.logContextAnalysis(
          this.symbol,
          this.state.context.bias,
          false,
          this.contextEngine.getBlockReason(this.state.context)
        );
      }
      
      // Contexto inválido - bloquear
      // CORREÇÃO 2026-02-04: Emitir NO_TRADE para visibilidade
      this.logDecisionFinal('NO_TRADE', null, {
        reason: 'context_reject',
        blockReason: this.contextEngine.getBlockReason(this.state.context),
        contextGrade: this.state.context.grade,
        contextBias: this.state.context.bias,
      });
      if (this.state.fsmState !== 'IDLE') {
        this.transitionTo('IDLE', 'Contexto inválido: ' + this.contextEngine.getBlockReason(this.state.context));
      }
      return false;
    }
    
    // 4. Construir pools de liquidez
    // CORREÇÃO P0.2: Passar pools existentes para preservar estado de sweep
    const poolsBeforeCount = this.state.liquidityPools.length;
    this.state.liquidityPools = this.liquidityEngine.buildLiquidityPools(
      this.state.session,
      swarmState.swingHighs,
      swarmState.swingLows,
      this.state.liquidityPools // Passar pools existentes para merge
    );
    
    // LOG ESTRUTURADO: Pools construídos (1x por sessão ou boot)
    if (poolsBeforeCount === 0 && this.state.liquidityPools.length > 0) {
      const poolsSummary = this.state.liquidityPools.map(p => `${p.type}:${p.price.toFixed(5)}`).join(', ');
      console.log(`[SMC_INST_POOLS_BUILT] ${this.symbol}: poolsBuiltCount=${this.state.liquidityPools.length}, pools=[${poolsSummary}]`);
    }
    
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
          
          // LOG ESTRUTURADO: FVG detectado
          if (this.logger) {
            this.logger.logFVGDetected(
              this.symbol,
              fvg.direction,
              fvg.high,
              fvg.low,
              fvg.gapSizePips
            );
          }
          
          this.transitionTo('WAIT_MITIGATION', `FVG ${fvg.direction} detectado: ${fvg.low.toFixed(5)}-${fvg.high.toFixed(5)} (${fvg.gapSizePips.toFixed(1)} pips)`);
        }
        return false;
        
      case 'WAIT_MITIGATION':
        // Verificar mitigação do FVG
        this.state.fvg = this.fvgEngine.checkMitigation(this.state.fvg, lastM5Candle);
        
        if (this.fvgEngine.isFVGMitigated(this.state.fvg)) {
          const fvg = this.state.fvg.activeFVG!;
          
          // LOG ESTRUTURADO: FVG mitigado
          if (this.logger && fvg.mitigatedPrice) {
            // Calcular penetração manualmente (propriedade não existe em FVGZone)
            const fvgSize = Math.abs(fvg.high - fvg.low);
            const penetration = Math.abs(fvg.mitigatedPrice - (fvg.direction === 'BULLISH' ? fvg.low : fvg.high));
            const penetrationPercent = fvgSize > 0 ? (penetration / fvgSize) * 100 : 0;
            
            this.logger.logFVGMitigation(
              this.symbol,
              fvg.mitigatedPrice,
              fvg.high,
              fvg.low,
              penetrationPercent
            );
          }
          
          this.transitionTo('WAIT_ENTRY', `FVG mitigado em ${fvg.mitigatedPrice?.toFixed(5)}`);
        }
        
        // Verificar se FVG foi invalidado
        if (this.fvgEngine.isFVGInvalidated(this.state.fvg, currentPrice)) {
          // CORREÇÃO 2026-02-04: Emitir NO_TRADE para visibilidade
          this.logDecisionFinal('NO_TRADE', null, {
            reason: 'fvg_invalidated',
            fvgHigh: this.state.fvg.activeFVG?.high,
            fvgLow: this.state.fvg.activeFVG?.low,
            currentPrice,
          });
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
      // LOG ESTRUTURADO: Timeout institucional
      if (this.logger) {
        this.logger.logInstitutionalTimeout(
          this.symbol,
          this.state.fsmState,
          elapsedMinutes,
          timeout
        );
      }
      
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
    
    // LOG ESTRUTURADO: Transição FSM
    console.log(`[SMC_INST_FSM_TRANSITION] ${this.symbol}: ${oldState} → ${newState} | ${reason}`);
    
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
    const canTrade = this.state.tradesThisSession < this.config.maxTradesPerSession;
    
    // LOG ESTRUTURADO: Status do budget
    if (this.logger && !canTrade) {
      this.logger.logBudgetStatus(
        this.symbol,
        this.state.session.currentSession,
        this.state.tradesThisSession,
        this.config.maxTradesPerSession,
        true
      );
    }
    
    // CORREÇÃO 2026-02-04: Emitir NO_TRADE quando budget esgotado
    if (!canTrade) {
      this.logDecisionFinal('NO_TRADE', null, {
        reason: 'budget_exhausted',
        tradesThisSession: this.state.tradesThisSession,
        maxTradesPerSession: this.config.maxTradesPerSession,
        session: this.state.session.currentSession,
      });
    }
    
    return canTrade;
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
    
    // LOG ESTRUTURADO: Usar logger se disponível
    if (this.logger) {
      this.logger.logFSMTransition(this.symbol, fromState, toState, reason);
    } else {
      // Fallback para console
      console.log(`[SMC-INST] ${this.symbol}: ${fromState} → ${toState} | ${reason}`);
    }
    
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
    
    // LOG ESTRUTURADO: Usar logger se disponível
    if (this.logger) {
      this.logger.logInstitutionalDecision(this.symbol, decision, direction, metadata || {});
    } else {
      // Fallback para console
      const metadataStr = metadata ? JSON.stringify(metadata) : '';
      console.log(`[SMC_INST_DECISION] ${this.symbol}: ${decision} | ${direction || 'N/A'} | ${metadataStr}`);
    }
    
    // Callback
    if (this.logCallback) {
      this.logCallback(log);
    }
  }
  
  /**
   * Reseta a sessão (chamado quando muda de sessão)
   * 
   * CORREÇÃO P0.3: Agora reseta todos os estados relacionados à sessão
   */
  onSessionChange(): void {
    // Resetar budget de trades
    this.state.tradesThisSession = 0;
    this.state.sessionTradeHistory = [];
    
    // CORREÇÃO P0.3: Resetar FSM para IDLE em nova sessão
    // Isso garante que setups incompletos da sessão anterior não contaminem a nova
    if (this.state.fsmState !== 'IDLE') {
      console.log(`[SMC-INST] ${this.symbol}: FSM resetada de ${this.state.fsmState} para IDLE (nova sessão)`);
      this.state.fsmState = 'IDLE';
      this.state.fsmStateChangedAt = Date.now();
    }
    
    // Resetar estados de setup
    this.state.lastInstitutionalSweep = null;
    this.state.chochConsumed = false;
    this.state.fvg = FVGEngine.createEmptyState();
    
    // NÃO resetar pools - eles têm seu próprio ciclo de vida
    // NÃO resetar session/context - são atualizados pelo SessionEngine/ContextEngine
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
/**
 * CORREÇÃO P0.5: institutionalModeEnabled agora é FALSE por padrão
 * 
 * Isso garante que instalações antigas não tenham comportamento alterado
 * após migration. O modo institucional é OPT-IN, não OPT-OUT.
 */
export function extractInstitutionalConfig(config: any): InstitutionalConfig {
  return {
    // CORREÇÃO P0.5: Default = FALSE para compatibilidade com configs antigas
    institutionalModeEnabled: config.institutionalModeEnabled ?? false,
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
