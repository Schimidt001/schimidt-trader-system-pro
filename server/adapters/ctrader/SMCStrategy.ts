/**
 * SMC Strategy - Smart Money Concepts Implementation
 * 
 * Estratégia baseada em Price Action Estrutural (SMC) para identificação
 * de padrões de manipulação de liquidez institucional.
 * 
 * Pipeline de Decisão (4 Etapas):
 * 1. Mapeamento de Liquidez (H1) - Identificar Swing Points via Fractais Williams
 * 2. Detecção de Sweep - Varredura de liquidez
 * 3. Quebra de Estrutura (CHoCH em M15) - Change of Character
 * 4. Gatilho de Entrada (M5) - Confirmação final
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 */

import { TrendbarData, TradeSide } from "./CTraderClient";
import {
  ITradingStrategy,
  IMultiTimeframeStrategy,
  StrategyType,
  SignalResult,
  SLTPResult,
  TrailingStopResult,
  PositionSizeResult,
  MultiTimeframeData,
  BaseStrategyConfig,
} from "./ITradingStrategy";
// REFATORAÇÃO: Importar módulo centralizado de normalização de pips
import { getPipValue as getCentralizedPipValue, priceToPips as centralizedPriceToPips } from "../../../shared/normalizationUtils";

// ============= TIPOS E INTERFACES =============

/**
 * Configuração específica da estratégia SMC
 */
export interface SMCStrategyConfig extends BaseStrategyConfig {
  // Ativos monitorados
  activeSymbols: string[];
  
  // Timeframe de Estrutura (Swing Points) - NOVO: Seleção dinâmica via UI
  structureTimeframe: 'H1' | 'M15' | 'M5';
  
  // Parametros de estrutura (H1)
  swingH1Lookback: number;
  fractalLeftBars: number;
  fractalRightBars: number;
  
  // Parametros de Sweep
  sweepBufferPips: number;
  sweepValidationMinutes: number;
  
  // Parametros de CHoCH (M15)
  chochM15Lookback: number;
  chochMinPips: number;
  
  // Parametros de Order Block
  orderBlockLookback: number;
  orderBlockExtensionPips: number;
  
  // Parametros de entrada (M5)
  entryConfirmationType: "ENGULF" | "REJECTION" | "ANY";
  rejectionWickPercent: number;
  
  // Gestao de risco
  riskPercentage: number;
  maxOpenTrades: number;
  dailyLossLimitPercent: number;
  stopLossBufferPips: number;
  rewardRiskRatio: number;
  
  // Filtro de Spread - AUDITORIA: Filtros Silenciosos
  spreadFilterEnabled: boolean;
  maxSpreadPips: number;
  
  // Sessoes de trading
  sessionFilterEnabled: boolean;
  londonSessionStart: string;
  londonSessionEnd: string;
  nySessionStart: string;
  nySessionEnd: string;
  
  // Trailing stop
  trailingEnabled: boolean;
  trailingTriggerPips: number;
  trailingStepPips: number;
  
  // Circuit breakers
  circuitBreakerEnabled: boolean;
  dailyStartEquity: number | null;
  tradingBlockedToday: boolean;
  
  // Logging
  verboseLogging: boolean;
}

/**
 * Swing Point identificado (Topo ou Fundo)
 */
export interface SwingPoint {
  type: "HIGH" | "LOW";
  price: number;
  timestamp: number;
  index: number;
  swept: boolean;
  sweptAt?: number;
  isValid: boolean;
}

/**
 * Order Block identificado
 */
export interface OrderBlock {
  type: "BULLISH" | "BEARISH";
  high: number;
  low: number;
  timestamp: number;
  index: number;
  isValid: boolean;
  testedCount: number;
}

/**
 * Estado do Swarm para um símbolo específico
 */
export interface SymbolSwarmState {
  symbol: string;
  
  // Swing Points H1
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  
  // Estado do Sweep
  lastSweepType: "HIGH" | "LOW" | null;
  lastSweepPrice: number | null;
  lastSweepTime: number | null;
  sweepConfirmed: boolean;
  
  // Estado do CHoCH
  chochDetected: boolean;
  chochDirection: "BULLISH" | "BEARISH" | null;
  chochPrice: number | null;
  chochTime: number | null;
  
  // Order Block
  activeOrderBlock: OrderBlock | null;
  
  // Estado de entrada
  readyForEntry: boolean;
  entryDirection: "BUY" | "SELL" | null;
  
  // Última atualização
  lastUpdateTime: number;
}

// ============= CONFIGURAÇÃO PADRÃO =============

export const DEFAULT_SMC_CONFIG: SMCStrategyConfig = {
  strategyType: StrategyType.SMC_SWARM,
  
  // Ativos padrao
  activeSymbols: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"],
  
  // Timeframe de Estrutura (Swing Points) - NOVO: Default H1 (Conservador)
  structureTimeframe: 'H1',
  
  // Estrutura H1
  swingH1Lookback: 50,
  fractalLeftBars: 2,
  fractalRightBars: 2,
  
  // Sweep
  sweepBufferPips: 2.0,
  sweepValidationMinutes: 60,
  
  // CHoCH M15 - AJUSTADO: Valor mais agressivo conforme briefing
  // Permite valores flutuantes pequenos (ex: 3.5)
  chochM15Lookback: 20,
  chochMinPips: 5.0,  // Reduzido de 10.0 para 5.0 para maior sensibilidade
  
  // Order Block
  orderBlockLookback: 10,
  orderBlockExtensionPips: 15.0,
  
  // Entrada M5
  entryConfirmationType: "ANY",
  rejectionWickPercent: 60.0,
  
  // Risco
  riskPercentage: 0.75,
  maxOpenTrades: 3,
  dailyLossLimitPercent: 3.0,
  stopLossBufferPips: 2.0,
  rewardRiskRatio: 4.0,
  
  // Filtro de Spread - AUDITORIA: Evita entradas com spread alto
  spreadFilterEnabled: true,
  maxSpreadPips: 3.0,  // Maximo de 3 pips de spread para entrada
  
  // Sessoes - Horarios em UTC-3 (Brasilia)
  sessionFilterEnabled: true,
  londonSessionStart: "04:00",
  londonSessionEnd: "07:00",
  nySessionStart: "09:30",
  nySessionEnd: "12:30",
  
  // Trailing
  trailingEnabled: true,
  trailingTriggerPips: 20.0,
  trailingStepPips: 10.0,
  
  // Circuit breakers
  circuitBreakerEnabled: true,
  dailyStartEquity: null,
  tradingBlockedToday: false,
  
  // Logging
  verboseLogging: true,
};

// ============= CLASSE PRINCIPAL =============

/**
 * Implementação da estratégia SMC (Smart Money Concepts)
 */
export class SMCStrategy implements IMultiTimeframeStrategy {
  private config: SMCStrategyConfig;
  
  // Dados de múltiplos timeframes
  private h1Data: TrendbarData[] = [];
  private m15Data: TrendbarData[] = [];
  private m5Data: TrendbarData[] = [];
  
  // Estado do Swarm por símbolo
  private swarmStates: Map<string, SymbolSwarmState> = new Map();
  
  // Símbolo atual sendo analisado
  private currentSymbol: string = "";
  
  constructor(config: Partial<SMCStrategyConfig> = {}) {
    this.config = { ...DEFAULT_SMC_CONFIG, ...config };
    
    // Garantir que activeSymbols seja um array (pode vir como string JSON do banco)
    if (typeof this.config.activeSymbols === 'string') {
      try {
        this.config.activeSymbols = JSON.parse(this.config.activeSymbols);
      } catch (e) {
        console.warn('[SMC] Erro ao parsear activeSymbols, usando default:', e);
        this.config.activeSymbols = DEFAULT_SMC_CONFIG.activeSymbols;
      }
    }
    
    // Garantir que é um array válido
    if (!Array.isArray(this.config.activeSymbols)) {
      this.config.activeSymbols = DEFAULT_SMC_CONFIG.activeSymbols;
    }
    
    this.initializeSwarmStates();
    
    // Log de inicialização com configurações carregadas
    console.log(`[SMC] Config carregada | Structure Timeframe: ${this.config.structureTimeframe}`);
    console.log(`[SMC] Ativos monitorados: ${this.config.activeSymbols.join(', ')}`);
  }
  
  // ============= INTERFACE ITradingStrategy =============
  
  getStrategyType(): StrategyType {
    return StrategyType.SMC_SWARM;
  }
  
  /**
   * Analisa os dados de mercado e gera sinal de trading
   * 
   * IMPORTANTE: Esta é a função principal que executa o pipeline SMC completo
   */
  analyzeSignal(candles: TrendbarData[], mtfData?: MultiTimeframeData): SignalResult {
    // Atualizar dados MTF se fornecidos
    if (mtfData) {
      if (mtfData.h1) this.h1Data = mtfData.h1;
      if (mtfData.m15) this.m15Data = mtfData.m15;
      if (mtfData.m5) this.m5Data = mtfData.m5;
    }
    
    // Usar candles fornecidos como timeframe principal (M5)
    if (candles.length > 0) {
      this.m5Data = candles;
    }
    
    // ========== DEBUG: Verificar se os dados (velas) estão a chegar ==========
    console.log(`[DATA] ${this.currentSymbol} | Candles H1: ${this.h1Data.length} | M15: ${this.m15Data.length} | M5: ${this.m5Data.length}`);
    
    // DEBUG: Verificar se os dados têm valores válidos (não são zeros)
    if (this.h1Data.length > 0) {
      const lastH1 = this.h1Data[this.h1Data.length - 1];
      console.log(`[DATA] ${this.currentSymbol} | Última H1: O=${lastH1.open} H=${lastH1.high} L=${lastH1.low} C=${lastH1.close}`);
    }
    
    // Verificar se temos dados suficientes
    if (!this.hasAllTimeframeData()) {
      console.log(`[DATA] ${this.currentSymbol} | ❌ Dados insuficientes - H1 min: ${this.config.swingH1Lookback + 10}, M15 min: ${this.config.chochM15Lookback + 10}, M5 min: 20`);
      return this.createNoSignal("Dados insuficientes para analise MTF");
    }
    
    // AUDITORIA: Verificar filtro de spread antes de qualquer analise
    if (this.config.spreadFilterEnabled && mtfData?.currentSpreadPips !== undefined) {
      if (mtfData.currentSpreadPips > this.config.maxSpreadPips) {
        const reason = `Spread alto: ${mtfData.currentSpreadPips.toFixed(1)} pips > max ${this.config.maxSpreadPips} pips`;
        if (this.config.verboseLogging) {
          console.log(`[SMC] ${this.currentSymbol}: BLOQUEADO | ${reason}`);
        }
        return this.createNoSignal(reason);
      }
    }
    
    // NOTA: Filtro de sessao REMOVIDO daqui - verificacao centralizada no RiskManager
    // A verificacao de horario e feita pelo RiskManager.canOpenPosition() antes de chamar analyzeSignal()
    // Isso evita duplicacao de logica e erros de fuso horario
    
    // Verificar circuit breaker
    if (this.config.tradingBlockedToday) {
      return this.createNoSignal("Trading bloqueado hoje (circuit breaker ativo)");
    }
    
    // Obter estado do simbolo atual
    const state = this.getOrCreateSwarmState(this.currentSymbol);
    
    // ========== PIPELINE SMC ==========
    
    // ETAPA 1: Identificar Swing Points (H1)
    this.identifySwingPoints(state);
    
    // ETAPA 2: Detectar Sweep
    const sweepResult = this.detectSweep(state, mtfData?.currentBid || this.getLastPrice());
    
    // ETAPA 3: Detectar CHoCH (apenas se sweep confirmado)
    if (state.sweepConfirmed) {
      this.detectCHoCH(state);
    }
    
    // ETAPA 4: Identificar Order Block e verificar entrada
    if (state.chochDetected && state.activeOrderBlock) {
      // Verificar spread novamente antes de entrada
      if (this.config.spreadFilterEnabled && mtfData?.currentSpreadPips !== undefined) {
        if (mtfData.currentSpreadPips > this.config.maxSpreadPips) {
          const reason = `Entrada bloqueada: Spread ${mtfData.currentSpreadPips.toFixed(1)} pips > max ${this.config.maxSpreadPips} pips`;
          console.log(`[SMC] ${this.currentSymbol}: ${reason}`);
          return this.createNoSignal(reason);
        }
      }
      
      const entrySignal = this.checkEntryConditions(state, mtfData?.currentBid || this.getLastPrice());
      
      if (entrySignal.signal !== "NONE") {
        return entrySignal;
      }
    }
    
    // Construir razão detalhada do estado atual
    const reason = this.buildStateReason(state);
    
    return this.createNoSignal(reason);
  }
  
  calculateSLTP(
    entryPrice: number,
    direction: TradeSide,
    pipValue: number,
    metadata?: Record<string, any>
  ): SLTPResult {
    const state = this.getOrCreateSwarmState(this.currentSymbol);
    
    let stopLoss: number;
    let stopLossPips: number;
    
    // CORREÇÃO: Obter spread atual para adicionar ao SL de vendas
    // Ordens SELL são fechadas quando ASK atinge o SL, então precisamos de buffer extra
    const currentSpreadPips = metadata?.currentSpreadPips ?? 0;
    const spreadBuffer = currentSpreadPips * pipValue;
    
    // SL baseado no Swing Point que originou o movimento
    if (direction === TradeSide.SELL && state.swingHighs.length > 0) {
      // Para SELL: SL acima do Swing High + buffer + spread
      // CORREÇÃO: Adicionar spread ao SL para evitar stops prematuros
      const swingHigh = state.swingHighs[state.swingHighs.length - 1];
      stopLoss = swingHigh.price + (this.config.stopLossBufferPips * pipValue) + spreadBuffer;
      stopLossPips = Math.abs(stopLoss - entryPrice) / pipValue;
      
      if (this.config.verboseLogging && currentSpreadPips > 0) {
        console.log(`[SMC] SELL SL ajustado: SwingHigh=${swingHigh.price.toFixed(5)} + Buffer=${this.config.stopLossBufferPips}pips + Spread=${currentSpreadPips.toFixed(1)}pips = SL=${stopLoss.toFixed(5)}`);
      }
    } else if (direction === TradeSide.BUY && state.swingLows.length > 0) {
      // Para BUY: SL abaixo do Swing Low - buffer (spread não afeta BUY)
      const swingLow = state.swingLows[state.swingLows.length - 1];
      stopLoss = swingLow.price - (this.config.stopLossBufferPips * pipValue);
      stopLossPips = Math.abs(entryPrice - stopLoss) / pipValue;
    } else {
      // Fallback: usar buffer padrão
      stopLossPips = 20; // 20 pips padrão
      // Para SELL no fallback, também adicionar spread
      if (direction === TradeSide.SELL) {
        stopLoss = entryPrice + (stopLossPips * pipValue) + spreadBuffer;
      } else {
        stopLoss = entryPrice - (stopLossPips * pipValue);
      }
    }
    
    // TP baseado no Risk:Reward ratio
    const tpPips = stopLossPips * this.config.rewardRiskRatio;
    const takeProfit = direction === TradeSide.BUY
      ? entryPrice + (tpPips * pipValue)
      : entryPrice - (tpPips * pipValue);
    
    return {
      stopLoss,
      takeProfit,
      stopLossPips,
      takeProfitPips: tpPips,
    };
  }
  
  calculateTrailingStop(
    entryPrice: number,
    currentPrice: number,
    currentStopLoss: number,
    direction: TradeSide,
    pipValue: number
  ): TrailingStopResult {
    if (!this.config.trailingEnabled) {
      return { shouldUpdate: false, newStopLoss: currentStopLoss, profitPips: 0 };
    }
    
    // Calcular lucro em pips
    let profitPips: number;
    if (direction === TradeSide.BUY) {
      profitPips = (currentPrice - entryPrice) / pipValue;
    } else {
      profitPips = (entryPrice - currentPrice) / pipValue;
    }
    
    // Verificar se atingiu trigger
    if (profitPips < this.config.trailingTriggerPips) {
      return { shouldUpdate: false, newStopLoss: currentStopLoss, profitPips };
    }
    
    // Calcular novo stop loss
    const trailingDistance = this.config.trailingStepPips * pipValue;
    let newStopLoss: number;
    
    if (direction === TradeSide.BUY) {
      newStopLoss = currentPrice - trailingDistance;
      if (newStopLoss <= currentStopLoss) {
        return { shouldUpdate: false, newStopLoss: currentStopLoss, profitPips };
      }
    } else {
      newStopLoss = currentPrice + trailingDistance;
      if (newStopLoss >= currentStopLoss) {
        return { shouldUpdate: false, newStopLoss: currentStopLoss, profitPips };
      }
    }
    
    return { shouldUpdate: true, newStopLoss, profitPips };
  }
  
  calculatePositionSize(
    accountBalance: number,
    stopLossPips: number,
    pipValue: number
  ): PositionSizeResult {
    // Risco em USD baseado na porcentagem configurada
    const riskUsd = accountBalance * (this.config.riskPercentage / 100);
    
    // Calcular tamanho do lote
    // Fórmula: lotSize = riskUsd / (stopLossPips * pipValue)
    const lotSize = riskUsd / (stopLossPips * pipValue);
    
    // Arredondar para step de 0.01 (micro lote)
    const roundedLotSize = Math.floor(lotSize * 100) / 100;
    
    // Limitar entre 0.01 e 10 lotes
    const finalLotSize = Math.max(0.01, Math.min(10, roundedLotSize));
    
    return {
      lotSize: finalLotSize,
      riskUsd,
      riskPercent: this.config.riskPercentage,
    };
  }
  
  getConfig(): SMCStrategyConfig {
    return { ...this.config };
  }
  
  updateConfig(config: Partial<SMCStrategyConfig>): void {
    const previousSessionConfig = {
      londonSessionStart: this.config.londonSessionStart,
      londonSessionEnd: this.config.londonSessionEnd,
      nySessionStart: this.config.nySessionStart,
      nySessionEnd: this.config.nySessionEnd,
    };
    
    this.config = { ...this.config, ...config };
    
    // Reinicializar estados se simbolos mudaram
    if (config.activeSymbols) {
      this.initializeSwarmStates();
    }
    
    // Log de alteração de Structure Timeframe (sempre logar, pois é crítico)
    if (config.structureTimeframe !== undefined) {
      console.log(`[SMC] Structure Timeframe ALTERADO para: ${this.config.structureTimeframe}`);
      console.log(`[SMC] Swing Points serão identificados no gráfico ${this.config.structureTimeframe}`);
    }
    
    // Log de alteracoes de sessao (sempre logar, pois e critico)
    const sessionChanged = 
      config.londonSessionStart !== undefined ||
      config.londonSessionEnd !== undefined ||
      config.nySessionStart !== undefined ||
      config.nySessionEnd !== undefined;
    
    if (sessionChanged) {
      console.log(`[SMC] [SESSAO] Configuracao de sessao atualizada:`);
      console.log(`[SMC] [SESSAO]   Londres: ${this.config.londonSessionStart} - ${this.config.londonSessionEnd}`);
      console.log(`[SMC] [SESSAO]   NY: ${this.config.nySessionStart} - ${this.config.nySessionEnd}`);
      console.log(`[SMC] [SESSAO]   Filtro ativo: ${this.config.sessionFilterEnabled}`);
    }
    
    if (this.config.verboseLogging) {
      console.log("[SMC] Configuracao atualizada:", config);
    }
  }
  
  isReadyToTrade(currentTime?: number): boolean {
    // Verificar se temos dados suficientes
    if (!this.hasAllTimeframeData()) {
      return false;
    }
    
    // NOTA: Filtro de sessao REMOVIDO - verificacao centralizada no RiskManager
    // A verificacao de horario e feita pelo RiskManager.canOpenPosition()
    
    // Verificar circuit breaker
    if (this.config.tradingBlockedToday) {
      return false;
    }
    
    return true;
  }
  
  reset(): void {
    this.h1Data = [];
    this.m15Data = [];
    this.m5Data = [];
    this.swarmStates.clear();
    this.initializeSwarmStates();
    
    if (this.config.verboseLogging) {
      console.log("[SMC] Estado resetado");
    }
  }
  
  // ============= INTERFACE IMultiTimeframeStrategy =============
  
  getRequiredTimeframes(): string[] {
    return ["H1", "M15", "M5"];
  }
  
  updateTimeframeData(timeframe: string, candles: TrendbarData[]): void {
    // DEBUG: Log de atualização de dados
    console.log(`[DEBUG-MTF] ${this.currentSymbol} | Atualizando ${timeframe}: ${candles.length} candles`);
    
    // DEBUG: Verificar se os candles têm dados válidos
    if (candles.length > 0) {
      const first = candles[0];
      const last = candles[candles.length - 1];
      console.log(`[DEBUG-MTF] ${this.currentSymbol} | ${timeframe} Primeiro: O=${first.open?.toFixed(5)} H=${first.high?.toFixed(5)} L=${first.low?.toFixed(5)} C=${first.close?.toFixed(5)}`);
      console.log(`[DEBUG-MTF] ${this.currentSymbol} | ${timeframe} Último: O=${last.open?.toFixed(5)} H=${last.high?.toFixed(5)} L=${last.low?.toFixed(5)} C=${last.close?.toFixed(5)}`);
      
      // ALERTA: Verificar se os dados são zeros (problema de API)
      if (first.open === 0 || first.high === 0 || first.low === 0 || first.close === 0) {
        console.error(`[ALERTA] ${this.currentSymbol} | ${timeframe} PRIMEIRO CANDLE TEM VALORES ZERO!`);
      }
      if (last.open === 0 || last.high === 0 || last.low === 0 || last.close === 0) {
        console.error(`[ALERTA] ${this.currentSymbol} | ${timeframe} ÚLTIMO CANDLE TEM VALORES ZERO!`);
      }
    } else {
      console.error(`[ALERTA] ${this.currentSymbol} | ${timeframe} ARRAY DE CANDLES VAZIO!`);
    }
    
    switch (timeframe.toUpperCase()) {
      case "H1":
        this.h1Data = candles;
        break;
      case "M15":
        this.m15Data = candles;
        break;
      case "M5":
        this.m5Data = candles;
        break;
      default:
        console.warn(`[SMC] Timeframe não suportado: ${timeframe}`);
    }
    
    if (this.config.verboseLogging) {
      console.log(`[SMC] Dados ${timeframe} atualizados: ${candles.length} candles`);
    }
  }
  
  hasAllTimeframeData(): boolean {
    const minH1 = this.config.swingH1Lookback + 10;
    const minM15 = this.config.chochM15Lookback + 10;
    const minM5 = 20;
    
    return (
      this.h1Data.length >= minH1 &&
      this.m15Data.length >= minM15 &&
      this.m5Data.length >= minM5
    );
  }
  
  // ============= MÉTODOS PÚBLICOS ADICIONAIS =============
  
  /**
   * Define o símbolo atual sendo analisado
   */
  setCurrentSymbol(symbol: string): void {
    this.currentSymbol = symbol;
  }
  
  /**
   * Obtém o estado do swarm para um símbolo
   */
  getSwarmState(symbol: string): SymbolSwarmState | undefined {
    return this.swarmStates.get(symbol);
  }
  
  /**
   * Obtém todos os símbolos ativos
   */
  getActiveSymbols(): string[] {
    return [...this.config.activeSymbols];
  }
  
  // ============= LÓGICA DE IDENTIFICAÇÃO DE TOPOS E FUNDOS =============
  
  /**
   * ETAPA 1: Identificar Swing Points usando Fractais de Williams
   * 
   * REFATORADO: Agora usa timeframe dinâmico baseado em config.structureTimeframe
   * - H1 (Conservador): Menos sinais, maior precisão
   * - M15 (Agressivo): Mais sinais, maior volume de operações
   * - M5 (Scalper): Máximo de sinais, operações rápidas
   * 
   * Um TOPO (Swing High) é válido se:
   * - A máxima do candle central é MAIOR que as máximas dos N candles à esquerda
   * - A máxima do candle central é MAIOR que as máximas dos N candles à direita
   * 
   * Um FUNDO (Swing Low) é válido se:
   * - A mínima do candle central é MENOR que as mínimas dos N candles à esquerda
   * - A mínima do candle central é MENOR que as mínimas dos N candles à direita
   */
  private identifySwingPoints(state: SymbolSwarmState): void {
    // NOVO: Seleção dinâmica de timeframe baseada na configuração da UI
    const tf = this.config.structureTimeframe || 'H1';
    
    let candles: TrendbarData[] = [];
    let tfLabel: string = 'H1';
    
    // SELEÇÃO DINÂMICA DE DADOS
    if (tf === 'M5') {
      candles = this.m5Data;
      tfLabel = 'M5';
    } else if (tf === 'M15') {
      candles = this.m15Data;
      tfLabel = 'M15';
    } else {
      candles = this.h1Data; // Default H1
      tfLabel = 'H1';
    }
    
    const leftBars = this.config.fractalLeftBars;
    const rightBars = this.config.fractalRightBars;
    const lookback = this.config.swingH1Lookback;
    
    // ========== DEBUG: Verificar dados antes de processar Swing Points ==========
    console.log(`[DEBUG-SWING] ${this.currentSymbol} | TF: ${tfLabel} | Candles: ${candles.length} | leftBars: ${leftBars} | rightBars: ${rightBars} | lookback: ${lookback}`);
    
    // Precisamos de pelo menos leftBars + rightBars + 1 candles
    if (candles.length < leftBars + rightBars + 1) {
      console.log(`[DEBUG-SWING] ${this.currentSymbol} | ❌ Candles insuficientes: ${candles.length} < ${leftBars + rightBars + 1} (mínimo necessário)`);
      return;
    }
    
    // Limpar swings antigos e manter apenas os mais recentes
    const startIndex = Math.max(0, candles.length - lookback);
    
    // Arrays temporários para novos swings
    const newSwingHighs: SwingPoint[] = [];
    const newSwingLows: SwingPoint[] = [];
    
    // Iterar pelos candles (excluindo as bordas onde não podemos verificar fractais)
    for (let i = startIndex + leftBars; i < candles.length - rightBars; i++) {
      const currentCandle = candles[i];
      
      // ========== VERIFICAR SWING HIGH (TOPO) ==========
      let isSwingHigh = true;
      
      // Verificar candles à esquerda
      for (let j = 1; j <= leftBars; j++) {
        if (candles[i - j].high >= currentCandle.high) {
          isSwingHigh = false;
          break;
        }
      }
      
      // Verificar candles à direita (apenas se passou no teste da esquerda)
      if (isSwingHigh) {
        for (let j = 1; j <= rightBars; j++) {
          if (candles[i + j].high >= currentCandle.high) {
            isSwingHigh = false;
            break;
          }
        }
      }
      
      if (isSwingHigh) {
        // Verificar se já não existe um swing muito próximo
        const existingSimilar = newSwingHighs.find(
          s => Math.abs(s.price - currentCandle.high) < this.getPipValue() * 5
        );
        
        if (!existingSimilar) {
          newSwingHighs.push({
            type: "HIGH",
            price: currentCandle.high,
            timestamp: currentCandle.timestamp,
            index: i,
            swept: false,
            isValid: true,
          });
          
          if (this.config.verboseLogging) {
            console.log(`[SMC-${tfLabel}] ${this.currentSymbol}: Swing High detectado em ${currentCandle.high.toFixed(5)}`);
          }
        }
      }
      
      // ========== VERIFICAR SWING LOW (FUNDO) ==========
      let isSwingLow = true;
      
      // Verificar candles à esquerda
      for (let j = 1; j <= leftBars; j++) {
        if (candles[i - j].low <= currentCandle.low) {
          isSwingLow = false;
          break;
        }
      }
      
      // Verificar candles à direita (apenas se passou no teste da esquerda)
      if (isSwingLow) {
        for (let j = 1; j <= rightBars; j++) {
          if (candles[i + j].low <= currentCandle.low) {
            isSwingLow = false;
            break;
          }
        }
      }
      
      if (isSwingLow) {
        // Verificar se já não existe um swing muito próximo
        const existingSimilar = newSwingLows.find(
          s => Math.abs(s.price - currentCandle.low) < this.getPipValue() * 5
        );
        
        if (!existingSimilar) {
          newSwingLows.push({
            type: "LOW",
            price: currentCandle.low,
            timestamp: currentCandle.timestamp,
            index: i,
            swept: false,
            isValid: true,
          });
          
          if (this.config.verboseLogging) {
            console.log(`[SMC-${tfLabel}] ${this.currentSymbol}: Swing Low detectado em ${currentCandle.low.toFixed(5)}`);
          }
        }
      }
    }
    
    // Atualizar estado mantendo histórico de swept
    state.swingHighs = this.mergeSwingPoints(state.swingHighs, newSwingHighs);
    state.swingLows = this.mergeSwingPoints(state.swingLows, newSwingLows);
    
    // Manter apenas os últimos N swings
    const maxSwings = 10;
    if (state.swingHighs.length > maxSwings) {
      state.swingHighs = state.swingHighs.slice(-maxSwings);
    }
    if (state.swingLows.length > maxSwings) {
      state.swingLows = state.swingLows.slice(-maxSwings);
    }
    
    // ========== DEBUG: Verificar resultado da deteção de Swings ==========
    if (state.swingHighs.length === 0 && state.swingLows.length === 0) {
      // ESTE É O ERRO QUE SUSPEITAMOS:
      console.error(`[CRÍTICO] ${this.currentSymbol}: NENHUM Swing Point detetado! A estratégia parou aqui.`);
      console.error(`[CRÍTICO] ${this.currentSymbol}: Candles processados: ${candles.length} | startIndex: ${startIndex} | Range: [${startIndex + leftBars}, ${candles.length - rightBars})`);
      
      // DEBUG: Verificar se os dados dos candles são válidos
      if (candles.length > 0) {
        const sampleCandle = candles[Math.floor(candles.length / 2)];
        console.error(`[CRÍTICO] ${this.currentSymbol}: Candle de amostra (meio): O=${sampleCandle.open} H=${sampleCandle.high} L=${sampleCandle.low} C=${sampleCandle.close}`);
      }
    } else {
      console.log(`[DEBUG] ${this.currentSymbol}: Swings High: ${state.swingHighs.length} | Swings Low: ${state.swingLows.length}`);
      if (state.swingHighs.length > 0) {
        const lastHigh = state.swingHighs[state.swingHighs.length - 1];
        console.log(`[DEBUG] ${this.currentSymbol}: Último High: ${lastHigh.price.toFixed(5)} @ index ${lastHigh.index}`);
      }
      if (state.swingLows.length > 0) {
        const lastLow = state.swingLows[state.swingLows.length - 1];
        console.log(`[DEBUG] ${this.currentSymbol}: Último Low: ${lastLow.price.toFixed(5)} @ index ${lastLow.index}`);
      }
    }
  }
  
  /**
   * ETAPA 2: Detectar Sweep (Varredura de Liquidez) - REFATORADO PARA TEMPO REAL
   * 
   * IMPORTANTE: Agora usa currentPrice (preço ao vivo) para detecção imediata,
   * além de verificar também o lastCandle para confirmação tradicional.
   * 
   * Detecção em Tempo Real:
   * - Se currentPrice > SwingHigh: SWEEP AO VIVO detectado (sem esperar fechamento)
   * - Se currentPrice < SwingLow: SWEEP AO VIVO detectado (sem esperar fechamento)
   * 
   * Condição de Sweep Tradicional (Bearish):
   * - O preço supera a máxima do Swing High anterior
   * - MAS o candle fecha ABAIXO do nível (deixando pavio)
   */
  private detectSweep(state: SymbolSwarmState, currentPrice: number): boolean {
    // Obter timeframe configurado para logs
    const tf = this.config.structureTimeframe || 'H1';
    
    // Obter candles do timeframe selecionado
    let candles: TrendbarData[] = [];
    if (tf === 'M5') {
      candles = this.m5Data;
    } else if (tf === 'M15') {
      candles = this.m15Data;
    } else {
      candles = this.h1Data;
    }
    
    const lastCandle = candles[candles.length - 1];
    const bufferPips = this.config.sweepBufferPips * this.getPipValue();
    const pipValue = this.getPipValue();
    
    // ========== VERIFICAR SWEEP DE TOPO (BEARISH) - TEMPO REAL ==========
    for (const swingHigh of state.swingHighs) {
      if (swingHigh.swept) continue;
      
      // NOVO: DETECÇÃO EM TEMPO REAL usando currentPrice
      // Verifica se o preço atual ultrapassou o swing high
      if (currentPrice > swingHigh.price) {
        swingHigh.swept = true;
        swingHigh.sweptAt = Date.now();
        
        state.lastSweepType = "HIGH";
        state.lastSweepPrice = swingHigh.price;
        state.lastSweepTime = Date.now();
        state.sweepConfirmed = true;
        
        const exceedPips = this.priceToPips(currentPrice - swingHigh.price);
        
        console.log(`[SMC-${tf}] ${this.currentSymbol}: ⚡ SWEEP AO VIVO DETECTADO (TOPO)!`);
        console.log(`[SMC-${tf}] ${this.currentSymbol}: Nivel: ${swingHigh.price.toFixed(5)} | Preço Atual: ${currentPrice.toFixed(5)}`);
        console.log(`[SMC-${tf}] ${this.currentSymbol}: Excedeu: ${exceedPips.toFixed(1)} pips`);
        console.log(`[SMC-${tf}] ${this.currentSymbol}: Aguardando CHoCH em M15...`);
        
        return true;
      }
      
      // Verificação tradicional (candle fechado) como fallback
      if (lastCandle) {
        const highExceedsPips = this.priceToPips(lastCandle.high - swingHigh.price);
        const closeDistPips = this.priceToPips(swingHigh.price - lastCandle.close);
        
        if (this.config.verboseLogging && lastCandle.high > swingHigh.price - bufferPips) {
          this.logPriceDebug(
            `Sweep HIGH Check | SwingHigh: ${swingHigh.price.toFixed(5)} | High: ${lastCandle.high.toFixed(5)} | Close: ${lastCandle.close.toFixed(5)}`,
            lastCandle.high - swingHigh.price,
            highExceedsPips
          );
        }
        
        // Condicao tradicional: High superou o swing, mas Close ficou abaixo
        if (lastCandle.high > swingHigh.price && lastCandle.close < swingHigh.price) {
          swingHigh.swept = true;
          swingHigh.sweptAt = Date.now();
          
          state.lastSweepType = "HIGH";
          state.lastSweepPrice = swingHigh.price;
          state.lastSweepTime = Date.now();
          state.sweepConfirmed = true;
          
          console.log(`[SMC-${tf}] ${this.currentSymbol}: SWEEP DE TOPO CONFIRMADO (Candle Fechado)!`);
          console.log(`[SMC-${tf}] ${this.currentSymbol}: Nivel: ${swingHigh.price.toFixed(5)}`);
          console.log(`[SMC-${tf}] ${this.currentSymbol}: Pavio acima: ${highExceedsPips.toFixed(1)} pips | Close abaixo: ${closeDistPips.toFixed(1)} pips`);
          console.log(`[SMC-${tf}] ${this.currentSymbol}: Aguardando CHoCH em M15...`);
          
          return true;
        }
      }
    }
    
    // ========== VERIFICAR SWEEP DE FUNDO (BULLISH) - TEMPO REAL ==========
    for (const swingLow of state.swingLows) {
      if (swingLow.swept) continue;
      
      // NOVO: DETECÇÃO EM TEMPO REAL usando currentPrice
      // Verifica se o preço atual ultrapassou o swing low (para baixo)
      if (currentPrice < swingLow.price) {
        swingLow.swept = true;
        swingLow.sweptAt = Date.now();
        
        state.lastSweepType = "LOW";
        state.lastSweepPrice = swingLow.price;
        state.lastSweepTime = Date.now();
        state.sweepConfirmed = true;
        
        const exceedPips = this.priceToPips(swingLow.price - currentPrice);
        
        console.log(`[SMC-${tf}] ${this.currentSymbol}: ⚡ SWEEP AO VIVO DETECTADO (FUNDO)!`);
        console.log(`[SMC-${tf}] ${this.currentSymbol}: Nivel: ${swingLow.price.toFixed(5)} | Preço Atual: ${currentPrice.toFixed(5)}`);
        console.log(`[SMC-${tf}] ${this.currentSymbol}: Excedeu: ${exceedPips.toFixed(1)} pips`);
        console.log(`[SMC-${tf}] ${this.currentSymbol}: Aguardando CHoCH em M15...`);
        
        return true;
      }
      
      // Verificação tradicional (candle fechado) como fallback
      if (lastCandle) {
        const lowExceedsPips = this.priceToPips(swingLow.price - lastCandle.low);
        const closeDistPips = this.priceToPips(lastCandle.close - swingLow.price);
        
        if (this.config.verboseLogging && lastCandle.low < swingLow.price + bufferPips) {
          this.logPriceDebug(
            `Sweep LOW Check | SwingLow: ${swingLow.price.toFixed(5)} | Low: ${lastCandle.low.toFixed(5)} | Close: ${lastCandle.close.toFixed(5)}`,
            swingLow.price - lastCandle.low,
            lowExceedsPips
          );
        }
        
        // Condicao tradicional: Low superou o swing (para baixo), mas Close ficou acima
        if (lastCandle.low < swingLow.price && lastCandle.close > swingLow.price) {
          swingLow.swept = true;
          swingLow.sweptAt = Date.now();
          
          state.lastSweepType = "LOW";
          state.lastSweepPrice = swingLow.price;
          state.lastSweepTime = Date.now();
          state.sweepConfirmed = true;
          
          console.log(`[SMC-${tf}] ${this.currentSymbol}: SWEEP DE FUNDO CONFIRMADO (Candle Fechado)!`);
          console.log(`[SMC-${tf}] ${this.currentSymbol}: Nivel: ${swingLow.price.toFixed(5)}`);
          console.log(`[SMC-${tf}] ${this.currentSymbol}: Pavio abaixo: ${lowExceedsPips.toFixed(1)} pips | Close acima: ${closeDistPips.toFixed(1)} pips`);
          console.log(`[SMC-${tf}] ${this.currentSymbol}: Aguardando CHoCH em M15...`);
          
          return true;
        }
      }
    }
    
    // Verificar se sweep expirou (tempo de validacao)
    if (state.sweepConfirmed && state.lastSweepTime) {
      const elapsedMinutes = (Date.now() - state.lastSweepTime) / 60000;
      if (elapsedMinutes > this.config.sweepValidationMinutes) {
        state.sweepConfirmed = false;
        state.chochDetected = false;
        state.activeOrderBlock = null;
        
        console.log(`[SMC] ${this.currentSymbol}: Sweep EXPIRADO apos ${this.config.sweepValidationMinutes} minutos sem CHoCH`);
      }
    }
    
    return false;
  }
  
  /**
   * ETAPA 3: Detectar CHoCH (Change of Character) em M15
   * 
   * Após um Sweep de Topo:
   * - Identificar o último fundo (Higher Low) que impulsionou o preço
   * - CHoCH ocorre quando o preço rompe e fecha ABAIXO desse fundo
   * 
   * Após um Sweep de Fundo:
   * - Identificar o último topo (Lower High) que impulsionou o preço
   * - CHoCH ocorre quando o preço rompe e fecha ACIMA desse topo
   */
  private detectCHoCH(state: SymbolSwarmState): void {
    if (!state.sweepConfirmed || state.chochDetected) return;
    
    const candles = this.m15Data;
    if (candles.length < this.config.chochM15Lookback) return;
    
    const lookback = this.config.chochM15Lookback;
    const recentCandles = candles.slice(-lookback);
    const lastCandle = candles[candles.length - 1];
    const pipValue = this.getPipValue();
    const minPipsRequired = this.config.chochMinPips;
    
    if (state.lastSweepType === "HIGH") {
      // Apos sweep de topo: procurar CHoCH bearish
      // Encontrar o ultimo Higher Low (fundo que impulsionou para o topo)
      const swingLow = this.findLastSwingInArray(recentCandles, "LOW");
      
      if (swingLow) {
        // Calcular movimento em pips (CORRECAO CRITICA)
        const priceDiff = swingLow.price - lastCandle.close;
        const movementPips = this.priceToPips(priceDiff);
        
        // Log de DEBUG obrigatorio
        this.logPriceDebug(
          `CHoCH BEARISH Check | SwingLow: ${swingLow.price.toFixed(5)} | Close: ${lastCandle.close.toFixed(5)}`,
          priceDiff,
          movementPips
        );
        
        // Verificar se movimento atinge minimo em pips
        if (lastCandle.close < swingLow.price && movementPips >= minPipsRequired) {
          // CHoCH confirmado - preco fechou abaixo do ultimo fundo com movimento suficiente
          state.chochDetected = true;
          state.chochDirection = "BEARISH";
          state.chochPrice = swingLow.price;
          state.chochTime = Date.now();
          
          // Identificar Order Block
          state.activeOrderBlock = this.identifyOrderBlock(recentCandles, "BEARISH");
          state.entryDirection = "SELL";
          
          console.log(`[SMC-M15] ${this.currentSymbol}: CHoCH BEARISH CONFIRMADO!`);
          console.log(`[SMC-M15] ${this.currentSymbol}: Movimento: ${movementPips.toFixed(1)} pips (minimo: ${minPipsRequired} pips)`);
          console.log(`[SMC-M15] ${this.currentSymbol}: Fundo quebrado em ${swingLow.price.toFixed(5)}`);
          if (state.activeOrderBlock) {
            console.log(`[SMC-M15] ${this.currentSymbol}: Order Block: ${state.activeOrderBlock.high.toFixed(5)} - ${state.activeOrderBlock.low.toFixed(5)}`);
          }
        } else if (lastCandle.close < swingLow.price) {
          // Movimento insuficiente - LOG DE REJEICAO CLARO
          console.log(`[SMC-M15] ${this.currentSymbol}: CHoCH REJEITADO | Motivo: Movimento de ${movementPips.toFixed(1)} pips menor que minimo de ${minPipsRequired} pips`);
        }
      }
    } else if (state.lastSweepType === "LOW") {
      // Apos sweep de fundo: procurar CHoCH bullish
      // Encontrar o ultimo Lower High (topo que impulsionou para o fundo)
      const swingHigh = this.findLastSwingInArray(recentCandles, "HIGH");
      
      if (swingHigh) {
        // Calcular movimento em pips (CORRECAO CRITICA)
        const priceDiff = lastCandle.close - swingHigh.price;
        const movementPips = this.priceToPips(priceDiff);
        
        // Log de DEBUG obrigatorio
        this.logPriceDebug(
          `CHoCH BULLISH Check | SwingHigh: ${swingHigh.price.toFixed(5)} | Close: ${lastCandle.close.toFixed(5)}`,
          priceDiff,
          movementPips
        );
        
        // Verificar se movimento atinge minimo em pips
        if (lastCandle.close > swingHigh.price && movementPips >= minPipsRequired) {
          // CHoCH confirmado - preco fechou acima do ultimo topo com movimento suficiente
          state.chochDetected = true;
          state.chochDirection = "BULLISH";
          state.chochPrice = swingHigh.price;
          state.chochTime = Date.now();
          
          // Identificar Order Block
          state.activeOrderBlock = this.identifyOrderBlock(recentCandles, "BULLISH");
          state.entryDirection = "BUY";
          
          console.log(`[SMC-M15] ${this.currentSymbol}: CHoCH BULLISH CONFIRMADO!`);
          console.log(`[SMC-M15] ${this.currentSymbol}: Movimento: ${movementPips.toFixed(1)} pips (minimo: ${minPipsRequired} pips)`);
          console.log(`[SMC-M15] ${this.currentSymbol}: Topo quebrado em ${swingHigh.price.toFixed(5)}`);
          if (state.activeOrderBlock) {
            console.log(`[SMC-M15] ${this.currentSymbol}: Order Block: ${state.activeOrderBlock.high.toFixed(5)} - ${state.activeOrderBlock.low.toFixed(5)}`);
          }
        } else if (lastCandle.close > swingHigh.price) {
          // Movimento insuficiente - LOG DE REJEICAO CLARO
          console.log(`[SMC-M15] ${this.currentSymbol}: CHoCH REJEITADO | Motivo: Movimento de ${movementPips.toFixed(1)} pips menor que minimo de ${minPipsRequired} pips`);
        }
      }
    }
  }
  
  /**
   * Identificar Order Block
   * 
   * Para CHoCH Bearish:
   * - Última vela de ALTA (verde) antes do movimento forte de baixa
   * 
   * Para CHoCH Bullish:
   * - Última vela de BAIXA (vermelha) antes do movimento forte de alta
   */
  private identifyOrderBlock(candles: TrendbarData[], direction: "BULLISH" | "BEARISH"): OrderBlock | null {
    const lookback = Math.min(this.config.orderBlockLookback, candles.length);
    
    for (let i = candles.length - 2; i >= candles.length - lookback; i--) {
      const candle = candles[i];
      const isBullishCandle = candle.close > candle.open;
      const isBearishCandle = candle.close < candle.open;
      
      if (direction === "BEARISH" && isBullishCandle) {
        // Para entrada de venda: OB é a última vela de alta
        return {
          type: "BEARISH",
          high: candle.high,
          low: candle.low,
          timestamp: candle.timestamp,
          index: i,
          isValid: true,
          testedCount: 0,
        };
      } else if (direction === "BULLISH" && isBearishCandle) {
        // Para entrada de compra: OB é a última vela de baixa
        return {
          type: "BULLISH",
          high: candle.high,
          low: candle.low,
          timestamp: candle.timestamp,
          index: i,
          isValid: true,
          testedCount: 0,
        };
      }
    }
    
    return null;
  }
  
  /**
   * ETAPA 4: Verificar condições de entrada em M5
   * 
   * Contexto: Preço retornou à zona do Order Block
   * 
   * Gatilho Final:
   * - Aguardar fechamento de candle M5
   * - VENDA: Candle de rejeição (pavio superior longo) ou engolfo vendedor
   * - COMPRA: Candle de rejeição (pavio inferior longo) ou engolfo comprador
   */
  private checkEntryConditions(state: SymbolSwarmState, currentPrice: number): SignalResult {
    if (!state.activeOrderBlock || !state.entryDirection) {
      return this.createNoSignal("Aguardando Order Block");
    }
    
    const ob = state.activeOrderBlock;
    const lastCandle = this.m5Data[this.m5Data.length - 1];
    const prevCandle = this.m5Data[this.m5Data.length - 2];
    
    if (!lastCandle || !prevCandle) {
      return this.createNoSignal("Dados M5 insuficientes");
    }
    
    // Verificar se preço está na zona do OB
    const inOBZone = currentPrice >= ob.low && currentPrice <= ob.high;
    
    if (!inOBZone) {
      // Verificar se OB foi invalidado (preço passou completamente)
      if (state.entryDirection === "SELL" && currentPrice > ob.high + this.config.orderBlockExtensionPips * this.getPipValue()) {
        state.activeOrderBlock = null;
        state.chochDetected = false;
        return this.createNoSignal("Order Block invalidado (preço passou)");
      }
      if (state.entryDirection === "BUY" && currentPrice < ob.low - this.config.orderBlockExtensionPips * this.getPipValue()) {
        state.activeOrderBlock = null;
        state.chochDetected = false;
        return this.createNoSignal("Order Block invalidado (preço passou)");
      }
      
      return this.createNoSignal("Aguardando retorno à zona do Order Block");
    }
    
    // ========== VERIFICAR CONFIRMAÇÃO DE ENTRADA ==========
    
    const candleRange = lastCandle.high - lastCandle.low;
    const candleBody = Math.abs(lastCandle.close - lastCandle.open);
    const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
    const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
    
    let entryConfirmed = false;
    let confirmationType = "";
    
    if (state.entryDirection === "SELL") {
      // Para VENDA: verificar rejeição ou engolfo bearish
      
      // Rejeição: pavio superior longo
      const wickPercent = (upperWick / candleRange) * 100;
      if (wickPercent >= this.config.rejectionWickPercent) {
        entryConfirmed = true;
        confirmationType = "REJECTION";
      }
      
      // Engolfo bearish
      if (!entryConfirmed && this.config.entryConfirmationType !== "REJECTION") {
        const isBearishEngulf = 
          lastCandle.close < lastCandle.open && // Candle atual é bearish
          prevCandle.close > prevCandle.open && // Candle anterior é bullish
          lastCandle.open >= prevCandle.close && // Abre acima ou igual ao close anterior
          lastCandle.close <= prevCandle.open;   // Fecha abaixo ou igual ao open anterior
        
        if (isBearishEngulf) {
          entryConfirmed = true;
          confirmationType = "ENGULF";
        }
      }
      
      // ANY: aceitar qualquer candle bearish na zona
      if (!entryConfirmed && this.config.entryConfirmationType === "ANY") {
        if (lastCandle.close < lastCandle.open) {
          entryConfirmed = true;
          confirmationType = "BEARISH_CANDLE";
        }
      }
      
    } else if (state.entryDirection === "BUY") {
      // Para COMPRA: verificar rejeição ou engolfo bullish
      
      // Rejeição: pavio inferior longo
      const wickPercent = (lowerWick / candleRange) * 100;
      if (wickPercent >= this.config.rejectionWickPercent) {
        entryConfirmed = true;
        confirmationType = "REJECTION";
      }
      
      // Engolfo bullish
      if (!entryConfirmed && this.config.entryConfirmationType !== "REJECTION") {
        const isBullishEngulf = 
          lastCandle.close > lastCandle.open && // Candle atual é bullish
          prevCandle.close < prevCandle.open && // Candle anterior é bearish
          lastCandle.open <= prevCandle.close && // Abre abaixo ou igual ao close anterior
          lastCandle.close >= prevCandle.open;   // Fecha acima ou igual ao open anterior
        
        if (isBullishEngulf) {
          entryConfirmed = true;
          confirmationType = "ENGULF";
        }
      }
      
      // ANY: aceitar qualquer candle bullish na zona
      if (!entryConfirmed && this.config.entryConfirmationType === "ANY") {
        if (lastCandle.close > lastCandle.open) {
          entryConfirmed = true;
          confirmationType = "BULLISH_CANDLE";
        }
      }
    }
    
    if (entryConfirmed) {
      // Resetar estado após entrada
      const signal = state.entryDirection;
      
      // Log de entrada
      if (this.config.verboseLogging) {
        console.log("═══════════════════════════════════════════════════════════════");
        console.log(`[SMC-M5] ${this.currentSymbol}: 🚀 ENTRADA DE ${signal} EXECUTADA!`);
        console.log(`[SMC-M5] Confirmação: ${confirmationType}`);
        console.log(`[SMC-M5] Preço: ${currentPrice.toFixed(5)}`);
        console.log(`[SMC-M5] Order Block: ${ob.high.toFixed(5)} - ${ob.low.toFixed(5)}`);
        console.log("═══════════════════════════════════════════════════════════════");
      }
      
      // Resetar estado para próxima operação
      state.sweepConfirmed = false;
      state.chochDetected = false;
      state.activeOrderBlock = null;
      state.readyForEntry = false;
      state.entryDirection = null;
      
      return {
        signal: signal as "BUY" | "SELL",
        confidence: 85,
        reason: `SMC Entry: Sweep ${state.lastSweepType} -> CHoCH ${state.chochDirection} -> OB ${confirmationType}`,
        indicators: {
          sweepPrice: state.lastSweepPrice || 0,
          chochPrice: state.chochPrice || 0,
          obHigh: ob.high,
          obLow: ob.low,
          entryPrice: currentPrice,
        },
        metadata: {
          confirmationType,
          sweepType: state.lastSweepType,
          chochDirection: state.chochDirection,
        },
      };
    }
    
    return this.createNoSignal("Aguardando confirmação de entrada na zona do OB");
  }
  
  // ============= MÉTODOS AUXILIARES =============
  
  /**
   * Inicializa estados do swarm para todos os símbolos ativos
   */
  private initializeSwarmStates(): void {
    this.swarmStates.clear();
    
    for (const symbol of this.config.activeSymbols) {
      this.swarmStates.set(symbol, this.createEmptySwarmState(symbol));
    }
  }
  
  /**
   * Cria um estado vazio para um símbolo
   */
  private createEmptySwarmState(symbol: string): SymbolSwarmState {
    return {
      symbol,
      swingHighs: [],
      swingLows: [],
      lastSweepType: null,
      lastSweepPrice: null,
      lastSweepTime: null,
      sweepConfirmed: false,
      chochDetected: false,
      chochDirection: null,
      chochPrice: null,
      chochTime: null,
      activeOrderBlock: null,
      readyForEntry: false,
      entryDirection: null,
      lastUpdateTime: Date.now(),
    };
  }
  
  /**
   * Obtém ou cria estado do swarm para um símbolo
   */
  private getOrCreateSwarmState(symbol: string): SymbolSwarmState {
    if (!this.swarmStates.has(symbol)) {
      this.swarmStates.set(symbol, this.createEmptySwarmState(symbol));
    }
    return this.swarmStates.get(symbol)!;
  }
  
  /**
   * Mescla swing points novos com existentes, preservando estado de swept
   */
  private mergeSwingPoints(existing: SwingPoint[], newPoints: SwingPoint[]): SwingPoint[] {
    const merged: SwingPoint[] = [];
    
    for (const newPoint of newPoints) {
      const existingPoint = existing.find(
        e => e.timestamp === newPoint.timestamp && e.type === newPoint.type
      );
      
      if (existingPoint) {
        // Preservar estado de swept
        merged.push({ ...newPoint, swept: existingPoint.swept, sweptAt: existingPoint.sweptAt });
      } else {
        merged.push(newPoint);
      }
    }
    
    return merged;
  }
  
  /**
   * Encontra o último swing point em um array de candles
   */
  private findLastSwingInArray(candles: TrendbarData[], type: "HIGH" | "LOW"): { price: number; index: number } | null {
    const leftBars = 2;
    const rightBars = 2;
    
    for (let i = candles.length - rightBars - 1; i >= leftBars; i--) {
      const current = candles[i];
      let isSwing = true;
      
      if (type === "HIGH") {
        // Verificar swing high
        for (let j = 1; j <= leftBars; j++) {
          if (candles[i - j].high >= current.high) {
            isSwing = false;
            break;
          }
        }
        if (isSwing) {
          for (let j = 1; j <= rightBars; j++) {
            if (candles[i + j].high >= current.high) {
              isSwing = false;
              break;
            }
          }
        }
        if (isSwing) {
          return { price: current.high, index: i };
        }
      } else {
        // Verificar swing low
        for (let j = 1; j <= leftBars; j++) {
          if (candles[i - j].low <= current.low) {
            isSwing = false;
            break;
          }
        }
        if (isSwing) {
          for (let j = 1; j <= rightBars; j++) {
            if (candles[i + j].low <= current.low) {
              isSwing = false;
              break;
            }
          }
        }
        if (isSwing) {
          return { price: current.low, index: i };
        }
      }
    }
    
    return null;
  }
  
  /**
   * Obtém o último preço disponível
   */
  private getLastPrice(): number {
    if (this.m5Data.length > 0) {
      return this.m5Data[this.m5Data.length - 1].close;
    }
    if (this.m15Data.length > 0) {
      return this.m15Data[this.m15Data.length - 1].close;
    }
    if (this.h1Data.length > 0) {
      return this.h1Data[this.h1Data.length - 1].close;
    }
    return 0;
  }
  
  /**
   * REFATORAÇÃO: PIP_VALUES removido deste arquivo.
   * Agora utiliza o módulo centralizado: shared/normalizationUtils.ts
   * 
   * @see shared/normalizationUtils.ts para a definição centralizada
   */

  /**
   * Obtem o valor do pip para o simbolo atual
   * 
   * REFATORAÇÃO: Agora utiliza o módulo centralizado.
   * 
   * @returns Valor do pip para o simbolo atual
   */
  private getPipValue(): number {
    return getCentralizedPipValue(this.currentSymbol);
  }

  /**
   * Converte diferenca de preco para pips
   * 
   * REFATORAÇÃO: Agora utiliza o módulo centralizado.
   * 
   * @param priceDiff Diferenca de preco bruta
   * @param symbol Simbolo do ativo (opcional, usa currentSymbol se nao fornecido)
   * @returns Valor em pips
   */
  private priceToPips(priceDiff: number, symbol?: string): number {
    const sym = symbol || this.currentSymbol;
    return centralizedPriceToPips(priceDiff, sym);
  }

  /**
   * Log de DEBUG para normalizacao de preco
   * Mostra valor bruto e valor convertido em pips
   * 
   * @see Briefing Tecnico - Implementacao Obrigatoria de logs DEBUG
   */
  private logPriceDebug(context: string, rawPrice: number, convertedPips: number): void {
    if (this.config.verboseLogging) {
      const pipValue = this.getPipValue();
      console.log(`[DEBUG] ${this.currentSymbol} | ${context}`);
      console.log(`[DEBUG]   Movimento Bruto: ${rawPrice.toFixed(5)}`);
      console.log(`[DEBUG]   Pip Value: ${pipValue}`);
      console.log(`[DEBUG]   Convertido: ${convertedPips.toFixed(1)} Pips`);
    }
  }
  
  /**
   * Verifica se esta dentro do horario de trading permitido
   * 
   * CORRECAO: Adicionado logs de DEBUG para diagnostico de problemas
   * com filtro de sessao.
   */
  private isWithinTradingSession(currentTime?: number): boolean {
    const now = currentTime ? new Date(currentTime) : new Date();
    
    // Converter para horario de Brasilia (UTC-3)
    const brasiliaOffset = -3 * 60;
    const localOffset = now.getTimezoneOffset();
    const brasiliaTime = new Date(now.getTime() + (localOffset + brasiliaOffset) * 60000);
    
    const currentHour = brasiliaTime.getHours();
    const currentMinute = brasiliaTime.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;
    
    // Parse horarios configurados
    const parseTime = (timeStr: string): number => {
      const [hours, minutes] = timeStr.split(":").map(Number);
      return hours * 60 + minutes;
    };
    
    const londonStart = parseTime(this.config.londonSessionStart);
    const londonEnd = parseTime(this.config.londonSessionEnd);
    const nyStart = parseTime(this.config.nySessionStart);
    const nyEnd = parseTime(this.config.nySessionEnd);
    
    // Verificar se esta em alguma sessao
    const inLondon = currentTimeMinutes >= londonStart && currentTimeMinutes <= londonEnd;
    const inNY = currentTimeMinutes >= nyStart && currentTimeMinutes <= nyEnd;
    
    const isWithinSession = inLondon || inNY;
    
    // Log de DEBUG para diagnostico (a cada 60 segundos para nao poluir)
    const shouldLog = this.config.verboseLogging || (!isWithinSession && Math.random() < 0.01);
    if (shouldLog && !isWithinSession) {
      const timeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
      console.log(`[SMC] [SESSAO] Horario atual (Brasilia): ${timeStr}`);
      console.log(`[SMC] [SESSAO] Londres: ${this.config.londonSessionStart} - ${this.config.londonSessionEnd} | Dentro: ${inLondon}`);
      console.log(`[SMC] [SESSAO] NY: ${this.config.nySessionStart} - ${this.config.nySessionEnd} | Dentro: ${inNY}`);
      console.log(`[SMC] [SESSAO] Resultado: ${isWithinSession ? 'PERMITIDO' : 'BLOQUEADO'}`);
    }
    
    return isWithinSession;
  }
  
  /**
   * Cria resultado de sinal vazio
   */
  private createNoSignal(reason: string): SignalResult {
    return {
      signal: "NONE",
      confidence: 0,
      reason,
      indicators: {
        swingHighs: this.getOrCreateSwarmState(this.currentSymbol).swingHighs.length,
        swingLows: this.getOrCreateSwarmState(this.currentSymbol).swingLows.length,
      },
    };
  }
  
  /**
   * Constroi razao detalhada do estado atual
   * 
   * IMPORTANTE: Logs de rejeicao devem ser claros e matematicos
   * @see Briefing Tecnico - Logs de Rejeicao Claros
   */
  private buildStateReason(state: SymbolSwarmState): string {
    const parts: string[] = [];
    const pipValue = this.getPipValue();
    const lastPrice = this.getLastPrice();
    
    // Info sobre Swing Points
    parts.push(`Swings H1: ${state.swingHighs.length} highs, ${state.swingLows.length} lows`);
    
    // Estado do Sweep com detalhes matematicos
    if (state.sweepConfirmed) {
      parts.push(`Sweep ${state.lastSweepType} confirmado em ${state.lastSweepPrice?.toFixed(5)}`);
    } else {
      // Calcular distancia ate proximo sweep potencial
      if (state.swingHighs.length > 0 || state.swingLows.length > 0) {
        const nearestHigh = state.swingHighs.length > 0 
          ? state.swingHighs[state.swingHighs.length - 1].price 
          : null;
        const nearestLow = state.swingLows.length > 0 
          ? state.swingLows[state.swingLows.length - 1].price 
          : null;
        
        if (nearestHigh && lastPrice > 0) {
          const distToHigh = this.priceToPips(nearestHigh - lastPrice);
          parts.push(`Aguardando Sweep | Dist. ao Topo: ${distToHigh.toFixed(1)} pips`);
        } else if (nearestLow && lastPrice > 0) {
          const distToLow = this.priceToPips(lastPrice - nearestLow);
          parts.push(`Aguardando Sweep | Dist. ao Fundo: ${distToLow.toFixed(1)} pips`);
        } else {
          parts.push("Aguardando Varredura (Sweep)");
        }
      } else {
        parts.push("Aguardando formacao de Swing Points");
      }
    }
    
    // Estado do CHoCH com detalhes matematicos
    if (state.chochDetected) {
      parts.push(`CHoCH ${state.chochDirection} em ${state.chochPrice?.toFixed(5)}`);
    } else if (state.sweepConfirmed) {
      parts.push(`Aguardando CHoCH (min: ${this.config.chochMinPips} pips)`);
    }
    
    // Order Block
    if (state.activeOrderBlock) {
      const obMidpoint = (state.activeOrderBlock.high + state.activeOrderBlock.low) / 2;
      const distToOB = this.priceToPips(Math.abs(lastPrice - obMidpoint));
      parts.push(`OB: ${state.activeOrderBlock.high.toFixed(5)}-${state.activeOrderBlock.low.toFixed(5)} | Dist: ${distToOB.toFixed(1)} pips`);
    }
    
    return parts.join(" | ");
  }
}

// ============= EXPORTAÇÕES =============

// Instância singleton para uso global
export const smcStrategy = new SMCStrategy();

// Factory function para criar novas instâncias
export function createSMCStrategy(config?: Partial<SMCStrategyConfig>): SMCStrategy {
  return new SMCStrategy(config);
}
