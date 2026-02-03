/**
 * SMC Institutional Types - Tipos e Interfaces para o Modelo Institucional
 * 
 * Define todas as interfaces, tipos e enums necessários para a implementação
 * do modelo institucional SMC PURO baseado em:
 * - FSM (Máquina de Estados Finitos)
 * - SessionEngine (Identificação de Sessões)
 * - ContextEngine (Classificação de Contexto)
 * - LiquidityEngine (Pools de Liquidez Institucionais)
 * - FVGEngine (Fair Value Gaps)
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 */

// ============= FSM - MÁQUINA DE ESTADOS =============

/**
 * Estados válidos da FSM Institucional
 * 
 * Fluxo: IDLE → WAIT_SWEEP → WAIT_CHOCH → WAIT_FVG → WAIT_MITIGATION → WAIT_ENTRY → COOLDOWN → IDLE
 */
export type InstitutionalFSMState = 
  | 'IDLE'           // Estado inicial, aguardando condições
  | 'WAIT_SWEEP'     // Aguardando sweep institucional confirmado
  | 'WAIT_CHOCH'     // Sweep confirmado, aguardando CHoCH
  | 'WAIT_FVG'       // CHoCH confirmado, aguardando formação de FVG
  | 'WAIT_MITIGATION'// FVG formado, aguardando mitigação
  | 'WAIT_ENTRY'     // FVG mitigado, aguardando gatilho de entrada
  | 'COOLDOWN';      // Trade executado, em período de cooldown

/**
 * Transição de estado da FSM com metadados
 */
export interface FSMTransition {
  fromState: InstitutionalFSMState;
  toState: InstitutionalFSMState;
  timestamp: number;
  reason: string;
  metadata?: Record<string, any>;
}

// ============= SESSION ENGINE =============

/**
 * Tipos de sessão de trading
 */
export type SessionType = 'ASIA' | 'LONDON' | 'NY' | 'OFF_SESSION';

/**
 * Dados de uma sessão de trading
 */
export interface SessionData {
  type: SessionType;
  high: number;
  low: number;
  range: number;
  openPrice: number;
  closePrice: number;
  startTime: number;  // timestamp UTC
  endTime: number;    // timestamp UTC
  isComplete: boolean;
  candleCount: number;
}

/**
 * Estado do SessionEngine para um símbolo
 */
export interface SessionEngineState {
  currentSession: SessionType;
  currentSessionData: SessionData | null;
  previousSession: SessionData | null;
  previousDayHigh: number | null;
  previousDayLow: number | null;
  lastUpdateTime: number;
  lastUpdateCandleTime: number;
}

/**
 * Configuração de horários de sessão (em minutos UTC)
 */
export interface SessionTimeConfig {
  asiaStart: number;   // 1380 (23:00 UTC)
  asiaEnd: number;     // 420 (07:00 UTC)
  londonStart: number; // 420 (07:00 UTC)
  londonEnd: number;   // 720 (12:00 UTC)
  nyStart: number;     // 720 (12:00 UTC)
  nyEnd: number;       // 1260 (21:00 UTC)
}

// ============= CONTEXT ENGINE =============

/**
 * Classificação de posição do preço em relação ao range da sessão anterior
 */
export type ContextClassification = 'TOP' | 'MID' | 'BOTTOM' | null;

/**
 * Bias direcional baseado no contexto
 */
export type ContextBias = 'LONG_ONLY' | 'SHORT_ONLY' | 'BOTH' | 'NONE';

/**
 * Grade de qualidade do setup
 */
export type ContextGrade = 'A' | 'B' | 'NO_TRADE';

/**
 * Estado do ContextEngine para um símbolo
 */
export interface ContextEngineState {
  classification: ContextClassification;
  bias: ContextBias;
  grade: ContextGrade;
  currentPrice: number;
  sessionRangeHigh: number | null;
  sessionRangeLow: number | null;
  sessionRangeMid: number | null;
  lastUpdateTime: number;
}

// ============= LIQUIDITY ENGINE =============

/**
 * Tipo de pool de liquidez
 */
export type LiquidityPoolType = 
  | 'SESSION_HIGH'      // High da sessão anterior
  | 'SESSION_LOW'       // Low da sessão anterior
  | 'DAILY_HIGH'        // High do dia anterior
  | 'DAILY_LOW'         // Low do dia anterior
  | 'SWING_HIGH'        // Swing High (fractal) - fallback
  | 'SWING_LOW';        // Swing Low (fractal) - fallback

/**
 * Pool de liquidez institucional
 * 
 * CORREÇÃO P0.2: Adicionado poolKey para identificação estável e preservação de estado
 */
export interface LiquidityPool {
  /** Chave única e determinística para identificar o pool (type:price:timestamp) */
  poolKey: string;
  type: LiquidityPoolType;
  price: number;
  timestamp: number;
  source: 'SESSION' | 'DAILY' | 'SWING';
  priority: number;  // 1 = máxima (sessão), 2 = média (dia), 3 = baixa (swing)
  swept: boolean;
  sweptAt: number | null;
  sweptCandle: number | null;  // timestamp do candle que confirmou o sweep
  /** Direção do sweep quando ocorreu */
  sweepDirection: 'HIGH' | 'LOW' | null;
}

/**
 * Gera uma poolKey determinística para um pool de liquidez
 * Formato: type:price_normalized:timestamp
 * 
 * @param type Tipo do pool
 * @param price Preço do pool
 * @param timestamp Timestamp de criação
 * @returns Chave única e estável
 */
export function generatePoolKey(type: LiquidityPoolType, price: number, timestamp: number): string {
  // Normalizar preço para 5 casas decimais para evitar problemas de precisão
  const normalizedPrice = price.toFixed(5);
  return `${type}:${normalizedPrice}:${timestamp}`;
}

/**
 * Resultado da detecção de sweep institucional
 */
export interface InstitutionalSweepResult {
  detected: boolean;
  confirmed: boolean;  // true apenas se confirmado em candle fechado M15
  pool: LiquidityPool | null;
  sweepType: 'HIGH' | 'LOW' | null;
  sweepPrice: number | null;
  sweepTime: number | null;
  confirmationCandle: number | null;
}

// ============= FVG ENGINE =============

/**
 * Direção do FVG
 */
export type FVGDirection = 'BULLISH' | 'BEARISH';

/**
 * Fair Value Gap (FVG) identificado
 */
export interface FVGZone {
  direction: FVGDirection;
  high: number;         // Limite superior do gap
  low: number;          // Limite inferior do gap
  midpoint: number;     // Ponto médio do gap
  gapSizePips: number;  // Tamanho do gap em pips
  timestamp: number;    // Timestamp do candle 2 (meio)
  candle1High: number;  // High do candle 1
  candle1Low: number;   // Low do candle 1
  candle3High: number;  // High do candle 3
  candle3Low: number;   // Low do candle 3
  isValid: boolean;
  mitigated: boolean;
  mitigatedAt: number | null;
  mitigatedPrice: number | null;
}

/**
 * Estado do FVGEngine para um símbolo
 */
export interface FVGEngineState {
  activeFVG: FVGZone | null;
  fvgHistory: FVGZone[];  // Histórico de FVGs (para debug)
  lastDetectionTime: number;
  fvgCount: number;  // Contador de FVGs detectados na sessão
}

// ============= ESTADO INSTITUCIONAL COMPLETO =============

/**
 * Estado institucional completo para um símbolo
 * Estende o SymbolSwarmState existente
 */
export interface InstitutionalState {
  // FSM
  fsmState: InstitutionalFSMState;
  fsmStateChangedAt: number | null;
  fsmTransitionHistory: FSMTransition[];
  
  // Session Engine
  session: SessionEngineState;
  
  // Context Engine
  context: ContextEngineState;
  
  // Liquidity Engine
  liquidityPools: LiquidityPool[];
  lastInstitutionalSweep: InstitutionalSweepResult | null;
  
  // FVG Engine
  fvg: FVGEngineState;
  
  // CHoCH consumido (só pode ser usado uma vez por sweep)
  chochConsumed: boolean;
  
  // Budget por sessão
  tradesThisSession: number;
  sessionTradeHistory: Array<{
    timestamp: number;
    direction: 'BUY' | 'SELL';
    entryPrice: number;
    session: SessionType;
  }>;
  
  // Timeouts
  lastTimeoutCheck: number;
}

// ============= CONFIGURAÇÃO INSTITUCIONAL =============

/**
 * Configuração institucional extraída do banco de dados
 */
export interface InstitutionalConfig {
  // Modo institucional
  institutionalModeEnabled: boolean;
  
  // FVG
  minGapPips: number;
  
  // Sessões (UTC em minutos)
  asiaSessionStartUtc: number;
  asiaSessionEndUtc: number;
  londonSessionStartUtc: number;
  londonSessionEndUtc: number;
  nySessionStartUtc: number;
  nySessionEndUtc: number;
  
  // Timeouts FSM
  sweepValidationMinutes: number;  // Reutilizado para timeout CHoCH
  instWaitFvgMinutes: number;
  instWaitMitigationMinutes: number;
  instWaitEntryMinutes: number;
  instCooldownMinutes: number;
  
  // Budget
  maxTradesPerSession: number;
}

// ============= LOGS INSTITUCIONAIS =============

/**
 * Tipos de log institucional permitidos
 */
export type InstitutionalLogType = 'PHASE_TRANSITION' | 'DECISION_FINAL';

/**
 * Decisão final do sistema
 */
export type FinalDecision = 'TRADE' | 'NO_TRADE' | 'EXPIRE';

/**
 * Estrutura de log institucional
 */
export interface InstitutionalLog {
  type: InstitutionalLogType;
  symbol: string;
  timestamp: number;
  
  // Para PHASE_TRANSITION
  fromState?: InstitutionalFSMState;
  toState?: InstitutionalFSMState;
  reason?: string;
  
  // Para DECISION_FINAL
  decision?: FinalDecision;
  direction?: 'BUY' | 'SELL' | null;
  entryPrice?: number;
  metadata?: Record<string, any>;
}

// ============= FUNÇÕES HELPER =============

/**
 * Cria um estado institucional vazio
 */
export function createEmptyInstitutionalState(): InstitutionalState {
  const now = Date.now();
  
  return {
    // FSM
    fsmState: 'IDLE',
    fsmStateChangedAt: now,
    fsmTransitionHistory: [],
    
    // Session Engine
    session: {
      currentSession: 'OFF_SESSION',
      currentSessionData: null,
      previousSession: null,
      previousDayHigh: null,
      previousDayLow: null,
      lastUpdateTime: now,
      lastUpdateCandleTime: 0,
    },
    
    // Context Engine
    context: {
      classification: null,
      bias: 'NONE',
      grade: 'NO_TRADE',
      currentPrice: 0,
      sessionRangeHigh: null,
      sessionRangeLow: null,
      sessionRangeMid: null,
      lastUpdateTime: now,
    },
    
    // Liquidity Engine
    liquidityPools: [],
    lastInstitutionalSweep: null,
    
    // FVG Engine
    fvg: {
      activeFVG: null,
      fvgHistory: [],
      lastDetectionTime: 0,
      fvgCount: 0,
    },
    
    // CHoCH
    chochConsumed: false,
    
    // Budget
    tradesThisSession: 0,
    sessionTradeHistory: [],
    
    // Timeouts
    lastTimeoutCheck: now,
  };
}

/**
 * Verifica se uma transição de estado é válida
 */
export function isValidFSMTransition(from: InstitutionalFSMState, to: InstitutionalFSMState): boolean {
  const validTransitions: Record<InstitutionalFSMState, InstitutionalFSMState[]> = {
    'IDLE': ['WAIT_SWEEP'],
    'WAIT_SWEEP': ['WAIT_CHOCH', 'IDLE'],  // IDLE se timeout
    'WAIT_CHOCH': ['WAIT_FVG', 'IDLE'],    // IDLE se timeout
    'WAIT_FVG': ['WAIT_MITIGATION', 'IDLE'], // IDLE se timeout
    'WAIT_MITIGATION': ['WAIT_ENTRY', 'IDLE'], // IDLE se timeout
    'WAIT_ENTRY': ['COOLDOWN', 'IDLE'],    // COOLDOWN se trade, IDLE se timeout
    'COOLDOWN': ['IDLE'],
  };
  
  return validTransitions[from]?.includes(to) ?? false;
}

/**
 * Obtém o timeout em minutos para um estado
 */
export function getStateTimeout(state: InstitutionalFSMState, config: InstitutionalConfig): number {
  switch (state) {
    case 'WAIT_SWEEP':
      return config.sweepValidationMinutes;
    case 'WAIT_CHOCH':
      return config.sweepValidationMinutes;  // Reutiliza sweepValidationMinutes
    case 'WAIT_FVG':
      return config.instWaitFvgMinutes;
    case 'WAIT_MITIGATION':
      return config.instWaitMitigationMinutes;
    case 'WAIT_ENTRY':
      return config.instWaitEntryMinutes;
    case 'COOLDOWN':
      return config.instCooldownMinutes;
    default:
      return 0;  // IDLE não tem timeout
  }
}

/**
 * Converte minutos UTC para string HH:MM
 */
export function minutesToTimeString(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Converte string HH:MM para minutos UTC
 */
export function timeStringToMinutes(timeStr: string): number {
  const [hours, mins] = timeStr.split(':').map(Number);
  return hours * 60 + mins;
}
