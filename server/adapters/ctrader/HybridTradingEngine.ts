/**
 * Hybrid Trading Engine - Motor de Execução de Estratégia Híbrida
 * 
 * Gerencia a execução simultânea das estratégias SMC e RSI+VWAP com:
 * - Priorização de sinais (SMC > RSI+VWAP)
 * - Resolução de conflitos
 * - Gestão de risco global
 * - Preservação da lógica de volume existente
 * 
 * IMPORTANTE: Este módulo NÃO altera a lógica de volume do CTraderClient.ts.
 * Todas as ordens são executadas através do pipeline existente.
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 * 
 * CORREÇÃO P0 v5.0 (2026-01-22):
 * - Implementado sistema de In-Flight Orders por símbolo
 * - Mutex por símbolo com seção crítica atômica
 * - Watchdog de 30s para timeout de locks
 * - Logs estruturados para observabilidade (LOCK_ACQUIRED, LOCK_BLOCKED, LOCK_RELEASED, LOCK_TIMEOUT)
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { ctraderAdapter } from "../CTraderAdapter";
import { TradeSide } from "./CTraderClient";
import { ITradingStrategy, IMultiTimeframeStrategy, StrategyType, SignalResult, MultiTimeframeData } from "./ITradingStrategy";
import { strategyFactory } from "./StrategyFactory";
import { SMCStrategy, SMCStrategyConfig } from "./SMCStrategy";
import { InstitutionalLogger } from "./InstitutionalLogger";
import { RsiVwapStrategy, RsiVwapStrategyConfig } from "./RsiVwapStrategy";
import { ORBStrategy, ORBStrategyConfig } from "./ORBStrategy";
import { RiskManager, createRiskManager, RiskManagerConfig, DEFAULT_RISK_CONFIG } from "./RiskManager";
import { getDb, insertSystemLog, type LogLevel, type LogCategory } from "../../db";
import { smcStrategyConfig, icmarketsConfig, rsiVwapConfig, orbTrendConfig } from "../../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { getPipValue as getCentralizedPipValue, calculateSpreadPips, calculateMonetaryPipValue, ConversionRates } from "../../../shared/normalizationUtils";

// ============= TIPOS E INTERFACES =============

/**
 * Modo de operação do motor híbrido
 */
export enum HybridMode {
  SMC_ONLY = "SMC_ONLY",           // Apenas SMC
  RSI_VWAP_ONLY = "RSI_VWAP_ONLY", // Apenas RSI+VWAP
  HYBRID = "HYBRID",               // Ambas com priorização
  ORB_ONLY = "ORB_ONLY",           // Apenas ORB (Opening Range Breakout)
}

/**
 * Configuração do motor híbrido
 */
export interface HybridEngineConfig {
  userId: number;
  botId: number;
  mode: HybridMode;
  symbols: string[];
  maxPositions: number;
  cooldownMs: number;
  maxSpread: number;
  
  // Configurações específicas de risco global
  maxTotalExposurePercent: number;  // Exposição máxima total (default: 7%)
  maxTradesPerSymbol: number;       // Máximo de trades por ativo (default: 1)
}

/**
 * Sinal combinado das estratégias
 */
interface CombinedSignal {
  smcSignal: SignalResult | null;
  rsiVwapSignal: SignalResult | null;
  orbSignal: SignalResult | null;
  finalSignal: SignalResult | null;
  source: "SMC" | "RSI_VWAP" | "ORB" | "NONE";
  conflictDetected: boolean;
  conflictReason?: string;
}

// ============= CORREÇÃO P0 v5.0: TIPOS PARA IN-FLIGHT ORDERS =============

/**
 * Informação de uma ordem in-flight (em voo)
 * Uma ordem é considerada in-flight desde o momento que decidimos enviar
 * até a confirmação real da API ou timeout.
 */
interface InFlightOrderInfo {
  timestamp: number;        // Quando a ordem foi marcada como in-flight
  orderId?: string;         // ID da ordem (preenchido após resposta da API)
  correlationId: string;    // ID único para rastreio nos logs
  status: 'pending' | 'sent' | 'confirmed' | 'failed' | 'timeout';
}

/**
 * Resultado da tentativa de adquirir lock
 */
interface LockAcquisitionResult {
  acquired: boolean;
  reason?: string;
  correlationId?: string;
}

// ============= CONFIGURAÇÃO PADRÃO =============

const DEFAULT_HYBRID_CONFIG: Omit<HybridEngineConfig, "userId" | "botId"> = {
  mode: HybridMode.HYBRID,
  symbols: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"],
  maxPositions: 3,
  cooldownMs: 60000,
  maxSpread: 2.0,
  maxTotalExposurePercent: 7.0,
  maxTradesPerSymbol: 1,
};

// ============= CONSTANTES DE TIMEOUT =============

/**
 * CORREÇÃO P0 v5.0: Timeout para ordens in-flight
 * Após este tempo, o lock é liberado automaticamente pelo watchdog
 */
const IN_FLIGHT_TIMEOUT_MS = 30000; // 30 segundos conforme especificação

// ============= CLASSE PRINCIPAL =============

/**
 * Motor de Trading Híbrido
 * 
 * Gerencia SMC e RSI+VWAP simultaneamente com lógica de priorização.
 */
export class HybridTradingEngine extends EventEmitter {
  private config: HybridEngineConfig;
  
  // Estratégias
  private smcStrategy: ITradingStrategy | null = null;
  private rsiVwapStrategy: ITradingStrategy | null = null;
  private orbStrategy: IMultiTimeframeStrategy | null = null;
  
  // Risk Manager
  private riskManager: RiskManager | null = null;
  
  // Institutional Logger
  private institutionalLogger: InstitutionalLogger | null = null;
  
  // Estado
  private _isRunning: boolean = false;
  private lastTradeTime: Map<string, number> = new Map();
  private analysisCount: number = 0;
  private tradesExecuted: number = 0;
  private startTime: number | null = null;
  
  // ============= CORREÇÃO P0 v5.0: SISTEMA DE IN-FLIGHT ORDERS =============
  
  /**
   * CORREÇÃO P0 v5.0: In-Flight Orders por Símbolo
   * 
   * Map que armazena informações de ordens "em voo" - ordens que foram
   * iniciadas mas ainda não confirmadas pela API.
   * 
   * REGRAS CRÍTICAS:
   * 1. SETAR in-flight ANTES de chamar placeOrder (fecha a janela de corrida)
   * 2. Se placeOrder lançar exceção ou retornar rejected → limpar imediatamente
   * 3. Se success=true → manter até confirmação via API
   * 4. Watchdog de 30s libera locks travados
   * 
   * Chave: symbol
   * Valor: InFlightOrderInfo
   */
  private inFlightOrdersBySymbol: Map<string, InFlightOrderInfo> = new Map();
  
  /**
   * CORREÇÃO P0 v5.0: Mutex por Símbolo (Promessas de Lock)
   * 
   * Map que armazena promessas de resolução para implementar mutex simples.
   * Quando um símbolo está sendo processado, outros ciclos aguardam a resolução.
   */
  private symbolMutexes: Map<string, Promise<void>> = new Map();
  private symbolMutexResolvers: Map<string, () => void> = new Map();
  
  // ============= CONTROLE DE CONCORRÊNCIA LEGADO (mantido para compatibilidade) =============
  
  /**
   * Map que controla se um símbolo está em processo de execução de ordem.
   * @deprecated Use inFlightOrdersBySymbol para controle mais preciso
   */
  private isExecutingOrder: Map<string, boolean> = new Map();
  
  /**
   * @deprecated Use inFlightOrdersBySymbol.timestamp
   */
  private lockTimestamps: Map<string, number> = new Map();
  
  // ============= CORREÇÃO v4.0: SISTEMA DE CONTROLE DE MÚLTIPLOS TRADES =============
  
  /**
   * CORREÇÃO v4.0: Posições Pendentes (Phantom Positions)
   * @deprecated Substituído por inFlightOrdersBySymbol na v5.0
   */
  private pendingPositions: Map<string, number> = new Map();
  
  /**
   * CORREÇÃO v4.0: Último Timestamp de Candle Operado
   * Map que armazena o timestamp do último candle M5 em que foi aberta uma posição.
   * Impede múltiplas ordens no mesmo candle (mesmo que o sinal continue válido).
   * 
   * Chave: symbol
   * Valor: timestamp do candle M5 (arredondado para 5 minutos)
   */
  private lastTradedCandleTimestamp: Map<string, number> = new Map();
  
  /**
   * CORREÇÃO v4.0: Estruturas Consumidas (Signal Consumption)
   * Set que armazena IDs únicos de estruturas (SwingPoints, OrderBlocks) já utilizadas.
   * Uma estrutura consumida não pode gerar outro trade.
   * 
   * Formato do ID: "SYMBOL_TYPE_PRICE_TIMESTAMP"
   * Exemplo: "USDCHF_SWING_HIGH_0.8950_1705234567000"
   */
  private consumedStructures: Set<string> = new Set();
  
  /**
   * CORREÇÃO v4.0: Timeout para Posições Pendentes
   * @deprecated Use IN_FLIGHT_TIMEOUT_MS
   */
  private readonly PENDING_POSITION_TIMEOUT_MS = 30000; // 30 segundos
  
  // Dados multi-timeframe
  private timeframeData: {
    h1: Map<string, any[]>;
    m15: Map<string, any[]>;
    m5: Map<string, any[]>;
  } = {
    h1: new Map(),
    m15: new Map(),
    m5: new Map(),
  };
  
  // Intervalos
  private analysisInterval: NodeJS.Timeout | null = null;
  private dataRefreshInterval: NodeJS.Timeout | null = null;
  
  // Subscrições
  private priceSubscriptions: Set<string> = new Set();
  
  // RSI+VWAP: Candle counts configuráveis (carregados do banco)
  private rsiCandleCounts: { h1: number; m15: number; m5: number } = { h1: 60, m15: 40, m5: 40 };
  
  // Cache
  private lastTickPrice: number | null = null;
  private lastTickTime: number | null = null;
  private currentSymbol: string | null = null;
  private tickCount: number = 0;
  private lastSignal: string | null = null;
  private lastSignalTime: number | null = null;
  
  constructor(userId: number, botId: number, config: Partial<HybridEngineConfig> = {}) {
    super();
    this.config = {
      ...DEFAULT_HYBRID_CONFIG,
      userId,
      botId,
      ...config,
    };
    
    console.log("[HybridEngine] Instância criada para usuário", userId, "bot", botId);
    console.log("[HybridEngine] Modo:", this.config.mode);
  }
  
  // ============= GETTERS PÚBLICOS =============
  
  /**
   * Retorna se o motor está em execução
   */
  get isRunning(): boolean {
    return this._isRunning;
  }
  
  // ============= CORREÇÃO P0 v5.0: MÉTODOS DE CONTROLE IN-FLIGHT =============
  
  /**
   * CORREÇÃO P0 v5.0: Verifica se existe ordem in-flight para o símbolo
   * 
   * @param symbol Símbolo a verificar
   * @returns true se existe ordem in-flight válida (não expirada)
   */
  private hasInFlightOrder(symbol: string): boolean {
    const inFlight = this.inFlightOrdersBySymbol.get(symbol);
    if (!inFlight) return false;
    
    const now = Date.now();
    const age = now - inFlight.timestamp;
    
    // Se expirou, limpar e retornar false
    if (age > IN_FLIGHT_TIMEOUT_MS) {
      this.logLockTimeout(symbol, age, inFlight.correlationId);
      this.clearInFlightOrder(symbol, 'timeout');
      return false;
    }
    
    return true;
  }
  
  /**
   * CORREÇÃO P0 v5.0: Marca uma ordem como in-flight
   * 
   * IMPORTANTE: Deve ser chamado ANTES de placeOrder para fechar a janela de corrida
   * 
   * @param symbol Símbolo da ordem
   * @returns correlationId para rastreio nos logs
   */
  private setInFlightOrder(symbol: string): string {
    const correlationId = randomUUID().substring(0, 8); // ID curto para logs
    
    this.inFlightOrdersBySymbol.set(symbol, {
      timestamp: Date.now(),
      correlationId,
      status: 'pending'
    });
    
    return correlationId;
  }
  
  /**
   * CORREÇÃO P0 v5.0: Atualiza status de ordem in-flight
   */
  private updateInFlightOrder(symbol: string, updates: Partial<InFlightOrderInfo>): void {
    const inFlight = this.inFlightOrdersBySymbol.get(symbol);
    if (inFlight) {
      this.inFlightOrdersBySymbol.set(symbol, { ...inFlight, ...updates });
    }
  }
  
  /**
   * CORREÇÃO P0 v5.0: Limpa ordem in-flight
   * 
   * @param symbol Símbolo da ordem
   * @param reason Motivo da limpeza (para logs)
   */
  private clearInFlightOrder(symbol: string, reason: 'confirmed' | 'failed' | 'rejected' | 'timeout'): void {
    const inFlight = this.inFlightOrdersBySymbol.get(symbol);
    if (inFlight) {
      this.logLockReleased(symbol, reason, inFlight.correlationId);
    }
    this.inFlightOrdersBySymbol.delete(symbol);
  }
  
  /**
   * CORREÇÃO P0 v5.0: Tenta adquirir lock para um símbolo
   * 
   * Esta função implementa a lógica de mutex por símbolo:
   * 1. Verifica se já existe ordem in-flight
   * 2. Se existir, bloqueia imediatamente
   * 3. Se não existir, adquire o lock
   * 
   * @param symbol Símbolo para adquirir lock
   * @returns Resultado da tentativa de aquisição
   */
  private tryAcquireLock(symbol: string): LockAcquisitionResult {
    // Verificar se já existe ordem in-flight
    if (this.hasInFlightOrder(symbol)) {
      const inFlight = this.inFlightOrdersBySymbol.get(symbol)!;
      const age = Date.now() - inFlight.timestamp;
      
      this.logLockBlocked(symbol, 'inflight', inFlight.correlationId, age);
      
      return {
        acquired: false,
        reason: `Ordem in-flight há ${Math.floor(age/1000)}s (correlationId: ${inFlight.correlationId})`
      };
    }
    
    // Adquirir lock
    const correlationId = this.setInFlightOrder(symbol);
    this.logLockAcquired(symbol, correlationId);
    
    return {
      acquired: true,
      correlationId
    };
  }
  
  /**
   * CORREÇÃO P0 v5.0: Executa watchdog para limpar locks expirados
   * 
   * Chamado periodicamente para garantir que locks travados sejam liberados
   */
  private runWatchdog(): void {
    const now = Date.now();
    
    for (const [symbol, inFlight] of this.inFlightOrdersBySymbol.entries()) {
      const age = now - inFlight.timestamp;
      
      if (age > IN_FLIGHT_TIMEOUT_MS) {
        this.logLockTimeout(symbol, age, inFlight.correlationId);
        this.clearInFlightOrder(symbol, 'timeout');
      }
    }
  }
  
  // ============= CORREÇÃO P0 v5.0: LOGS ESTRUTURADOS =============
  
  /**
   * Log estruturado: LOCK_ACQUIRED
   */
  private logLockAcquired(symbol: string, correlationId: string): void {
    const logMsg = `LOCK_ACQUIRED symbol=${symbol} correlationId=${correlationId}`;
    console.log(`[HybridEngine] 🔐 ${logMsg}`);
    this.logToDatabase("INFO", "SYSTEM", logMsg, { symbol, data: { correlationId, event: 'LOCK_ACQUIRED' } });
  }
  
  /**
   * Log estruturado: LOCK_BLOCKED
   */
  private logLockBlocked(symbol: string, reason: string, correlationId: string, ageMs?: number): void {
    const logMsg = `LOCK_BLOCKED symbol=${symbol} reason=${reason} correlationId=${correlationId}${ageMs ? ` ageMs=${ageMs}` : ''}`;
    console.log(`[HybridEngine] 🚫 ${logMsg}`);
    this.logToDatabase("WARN", "SYSTEM", logMsg, { symbol, data: { correlationId, reason, ageMs, event: 'LOCK_BLOCKED' } });
  }
  
  /**
   * Log estruturado: LOCK_RELEASED
   */
  private logLockReleased(symbol: string, reason: string, correlationId: string): void {
    const logMsg = `LOCK_RELEASED symbol=${symbol} reason=${reason} correlationId=${correlationId}`;
    console.log(`[HybridEngine] 🔓 ${logMsg}`);
    this.logToDatabase("INFO", "SYSTEM", logMsg, { symbol, data: { correlationId, reason, event: 'LOCK_RELEASED' } });
  }
  
  /**
   * Log estruturado: LOCK_TIMEOUT
   */
  private logLockTimeout(symbol: string, ageMs: number, correlationId: string): void {
    const logMsg = `LOCK_TIMEOUT symbol=${symbol} ageMs=${ageMs} correlationId=${correlationId}`;
    console.warn(`[HybridEngine] ⏰ ${logMsg}`);
    this.logToDatabase("WARN", "SYSTEM", logMsg, { symbol, data: { correlationId, ageMs, event: 'LOCK_TIMEOUT' } });
  }
  
  // ============= MÉTODOS PÚBLICOS =============
  
  /**
   * Inicia o motor híbrido
   */
  async start(): Promise<void> {
    if (this._isRunning) {
      console.log("[HybridEngine] Já está em execução");
      return;
    }
    
    if (!ctraderAdapter.isConnected()) {
      throw new Error("Não conectado ao IC Markets. Conecte primeiro.");
    }
    
    // CORREÇÃO: Nome do robô baseado no modo (não genérico "HÍBRIDO")
    const modeNames: Record<string, string> = {
      [HybridMode.SMC_ONLY]: "SMC INSTITUCIONAL",
      [HybridMode.RSI_VWAP_ONLY]: "RSI+VWAP REVERSAL",
      [HybridMode.HYBRID]: "HÍBRIDO SMC+RSI+VWAP",
      [HybridMode.ORB_ONLY]: "ORB TREND",
    };
    const modeName = modeNames[this.config.mode] || "HÍBRIDO";
    const logPrefix = this.config.mode === HybridMode.RSI_VWAP_ONLY ? "[RsiVwapEngine]" : "[HybridEngine]";
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`${logPrefix} 🚀 INICIANDO ROBÔ ${modeName}`);
    console.log(`${logPrefix} Modo: ${this.config.mode}`);
    console.log(`${logPrefix} Símbolos: ${this.config.symbols.join(", ")}`);
    console.log(`${logPrefix} 🔒 Sistema In-Flight ativo (timeout: 30s)`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    try {
      // CORREÇÃO: Reset de dados ao reiniciar - garante dados frescos e atuais
      this.timeframeData.h1.clear();
      this.timeframeData.m15.clear();
      this.timeframeData.m5.clear();
      this.lastTradedCandleTimestamp.clear();
      this.consumedStructures.clear();
      this.inFlightOrdersBySymbol.clear();
      this.isExecutingOrder.clear();
      this.lockTimestamps.clear();
      this.pendingPositions.clear();
      this.lastTradeTime.clear();
      console.log(`${logPrefix} 🔄 Dados anteriores resetados para coleta de dados frescos`);
      
      // CORREÇÃO 2026-01-13: Configurar contexto do usuário no CTraderAdapter
      // Isso permite que o handleExecutionEvent persista posições no banco de dados
      ctraderAdapter.setUserContext(this.config.userId, this.config.botId);
      console.log(`${logPrefix} ✅ Contexto de usuário configurado no CTraderAdapter`);
      
      // CORREÇÃO 2026-01-13: Reconciliar posições abertas com a cTrader
      // Sincroniza o banco de dados com as posições reais da corretora
      console.log("[HybridEngine] 🔄 Iniciando reconciliação de posições...");
      const syncedPositions = await ctraderAdapter.reconcilePositions();
      console.log(`[HybridEngine] ✅ Reconciliação concluída: ${syncedPositions} posições sincronizadas`);
      
      // Carregar configurações
      await this.loadConfigFromDB();
      
      // Inicializar estratégias baseado no modo
      await this.initializeStrategies();
      
      // Inicializar Risk Manager
      await this.initializeRiskManager();
      
      // CORREÇÃO P0 WARM-UP: Warm-Up obrigatório
      await this.warmUpSymbols();
      
      // Subscrever a preços
      await this.subscribeToAllPrices();
      
      // Iniciar loops
      this.startAnalysisLoop();
      this.startDataRefreshLoop();
      
      this._isRunning = true;
      this.startTime = Date.now();
      this.analysisCount = 0;
      this.tradesExecuted = 0;
      this.tickCount = 0;
      
      this.emit("started", {
        mode: this.config.mode,
        symbols: this.config.symbols,
      });
      
      console.log(`${logPrefix} ✅ Robô ${modeName} iniciado com sucesso!`);
      
      // Log para UI - CORREÇÃO: Nome específico por modo
      await this.logInfo(
        `🚀 ROBÔ ${modeName} INICIADO | Modo: ${this.config.mode} | Símbolos: ${this.config.symbols.join(", ")}`,
        "SYSTEM",
        { mode: this.config.mode, modeName, symbols: this.config.symbols, maxPositions: this.config.maxPositions }
      );
      
    } catch (error) {
      console.error("[HybridEngine] Erro ao iniciar:", error);
      throw error;
    }
  }
  
  /**
   * Para o motor híbrido
   */
  async stop(): Promise<void> {
    if (!this._isRunning) {
      console.log("[HybridEngine] Já está parado");
      return;
    }
    
    // CORREÇÃO: Nome do robô baseado no modo
    const modeNames: Record<string, string> = {
      [HybridMode.SMC_ONLY]: "SMC INSTITUCIONAL",
      [HybridMode.RSI_VWAP_ONLY]: "RSI+VWAP REVERSAL",
      [HybridMode.HYBRID]: "HÍBRIDO SMC+RSI+VWAP",
      [HybridMode.ORB_ONLY]: "ORB TREND",
    };
    const modeName = modeNames[this.config.mode] || "HÍBRIDO";
    const logPrefix = this.config.mode === HybridMode.RSI_VWAP_ONLY ? "[RsiVwapEngine]" : "[HybridEngine]";
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`${logPrefix} 🛑 PARANDO ROBÔ ${modeName}`);
    console.log(`${logPrefix} Análises: ${this.analysisCount} | Trades: ${this.tradesExecuted}`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    this._isRunning = false;
    
    // Parar loops
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
    
    if (this.dataRefreshInterval) {
      clearInterval(this.dataRefreshInterval);
      this.dataRefreshInterval = null;
    }
    
    // Cancelar subscrições
    await this.unsubscribeFromAllPrices();
    
    // CORREÇÃO P0 v5.0: Limpar todos os locks in-flight
    for (const [symbol, inFlight] of this.inFlightOrdersBySymbol.entries()) {
      console.log(`${logPrefix} 🔓 Limpando lock in-flight de ${symbol} (correlationId: ${inFlight.correlationId})`);
    }
    this.inFlightOrdersBySymbol.clear();
    
    // Limpar estado legado
    this.isExecutingOrder.clear();
    this.lockTimestamps.clear();
    this.pendingPositions.clear();
    
    // CORREÇÃO: Limpar timeframeData para garantir reset completo
    this.timeframeData.h1.clear();
    this.timeframeData.m15.clear();
    this.timeframeData.m5.clear();
    this.lastTradedCandleTimestamp.clear();
    this.consumedStructures.clear();
    this.lastTradeTime.clear();
    console.log(`${logPrefix} 🔄 Dados de timeframes resetados`);
    
    this.emit("stopped", {
      analysisCount: this.analysisCount,
      tradesExecuted: this.tradesExecuted,
      runtime: this.startTime ? Date.now() - this.startTime : 0,
    });
    
    console.log(`${logPrefix} ✅ Robô ${modeName} parado`);
    
    // Log para UI - CORREÇÃO: Nome específico por modo
    await this.logInfo(
      `🛑 ROBÔ ${modeName} PARADO | Análises: ${this.analysisCount} | Trades: ${this.tradesExecuted}`,
      "SYSTEM"
    );
  }
  
  /**
   * Retorna status atual do motor
   */
  getStatus(): {
    isRunning: boolean;
    mode: HybridMode;
    symbols: string[];
    analysisCount: number;
    tradesExecuted: number;
    runtime: number;
    inFlightOrders: Array<{ symbol: string; age: number; correlationId: string }>;
  } {
    // CORREÇÃO P0 v5.0: Incluir informações de ordens in-flight no status
    const inFlightOrders: Array<{ symbol: string; age: number; correlationId: string }> = [];
    const now = Date.now();
    
    for (const [symbol, inFlight] of this.inFlightOrdersBySymbol.entries()) {
      inFlightOrders.push({
        symbol,
        age: now - inFlight.timestamp,
        correlationId: inFlight.correlationId
      });
    }
    
    return {
      isRunning: this._isRunning,
      mode: this.config.mode,
      symbols: this.config.symbols,
      analysisCount: this.analysisCount,
      tradesExecuted: this.tradesExecuted,
      runtime: this.startTime ? Date.now() - this.startTime : 0,
      inFlightOrders
    };
  }
  
  /**
   * Atualiza modo de operação
   */
  setMode(mode: HybridMode): void {
    this.config.mode = mode;
    console.log(`[HybridEngine] Modo alterado para: ${mode}`);
  }
  
  // ============= MÉTODOS PRIVADOS =============
  
  /**
   * Carrega configuração do banco de dados
   */
  private async loadConfigFromDB(): Promise<void> {
    try {
      const db = await getDb();
      
      // Carregar configuração do ICMarkets
      const icConfig = await db
        .select()
        .from(icmarketsConfig)
        .where(
          and(
            eq(icmarketsConfig.userId, this.config.userId),
            eq(icmarketsConfig.botId, this.config.botId)
          )
        )
        .limit(1);
      
      if (icConfig[0]) {
        const cfg = icConfig[0];
        if (cfg.symbols) {
          this.config.symbols = cfg.symbols.split(",").map(s => s.trim()).filter(s => s);
        }
        if (cfg.maxPositions) {
          this.config.maxPositions = cfg.maxPositions;
        }
        if (cfg.cooldownMs) {
          this.config.cooldownMs = cfg.cooldownMs;
        }
        if (cfg.maxSpread) {
          this.config.maxSpread = Number(cfg.maxSpread);
        }
        if (cfg.maxTradesPerSymbol) {
          this.config.maxTradesPerSymbol = cfg.maxTradesPerSymbol;
        }
        
        console.log("[HybridEngine] Configuração carregada do banco:");
        console.log(`  - Símbolos: ${this.config.symbols.join(", ")}`);
        console.log(`  - Max Posições: ${this.config.maxPositions}`);
        console.log(`  - Max Trades/Símbolo: ${this.config.maxTradesPerSymbol}`);
        console.log(`  - Cooldown: ${this.config.cooldownMs}ms`);
        console.log(`  - Max Spread: ${this.config.maxSpread} pips`);
      }
    } catch (error) {
      console.warn("[HybridEngine] Erro ao carregar config do DB, usando defaults:", error);
    }
  }
  
  /**
   * Inicializa estratégias baseado no modo
   */
  private async initializeStrategies(): Promise<void> {
    const db = await getDb();
    
    // Inicializar SMC se necessário
    if (this.config.mode === HybridMode.SMC_ONLY || this.config.mode === HybridMode.HYBRID) {
      try {
        const smcConfigs = await db
          .select()
          .from(smcStrategyConfig)
          .where(
            and(
              eq(smcStrategyConfig.userId, this.config.userId),
              eq(smcStrategyConfig.botId, this.config.botId)
            )
          )
          .limit(1);
        
        const smcConfig = smcConfigs[0];
        
        // CORREÇÃO BUG #1: Parsear activeSymbols do banco de dados
        // Segue o mesmo padrão robusto usado na estratégia ORB
        let smcActiveSymbols = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"]; // Default
        if (smcConfig?.activeSymbols) {
          try {
            const parsed = typeof smcConfig.activeSymbols === 'string' 
              ? JSON.parse(smcConfig.activeSymbols) 
              : smcConfig.activeSymbols;
            if (Array.isArray(parsed) && parsed.length > 0) {
              smcActiveSymbols = parsed;
              console.log(`[HybridEngine] ✅ activeSymbols SMC carregados do banco: ${smcActiveSymbols.join(', ')}`);
            } else {
              console.warn("[HybridEngine] ⚠️ activeSymbols SMC inválido (não é array ou está vazio), usando default");
            }
          } catch (e) {
            console.warn("[HybridEngine] ⚠️ Erro ao parsear activeSymbols SMC, usando default:", e);
          }
        } else {
          console.log(`[HybridEngine] ℹ️ activeSymbols SMC não encontrado no banco, usando default: ${smcActiveSymbols.join(', ')}`);
        }
        
        // CORREÇÃO: Usar campos corretos do SMCStrategyConfig
        const strategyConfig: Partial<SMCStrategyConfig> = {
          activeSymbols: smcActiveSymbols,
          structureTimeframe: smcConfig?.structureTimeframe as 'H1' | 'M15' | 'M5' ?? 'M15',
          swingH1Lookback: smcConfig?.swingH1Lookback ?? 30,
          fractalLeftBars: smcConfig?.fractalLeftBars ?? 1,
          fractalRightBars: smcConfig?.fractalRightBars ?? 1,
          sweepBufferPips: smcConfig?.sweepBufferPips ? Number(smcConfig.sweepBufferPips) : 0.5,
          sweepValidationMinutes: smcConfig?.sweepValidationMinutes ?? 90,
          chochM15Lookback: smcConfig?.chochM15Lookback ?? 15,
          chochMinPips: smcConfig?.chochMinPips ? Number(smcConfig.chochMinPips) : 2.0,
          orderBlockLookback: smcConfig?.orderBlockLookback ?? 15,
          orderBlockExtensionPips: smcConfig?.orderBlockExtensionPips ? Number(smcConfig.orderBlockExtensionPips) : 3.0,
          entryConfirmationType: smcConfig?.entryConfirmationType as 'ENGULF' | 'REJECTION' | 'ANY' ?? 'ANY',
          rejectionWickPercent: smcConfig?.rejectionWickPercent ? Number(smcConfig.rejectionWickPercent) : 20.0,
          riskPercentage: smcConfig?.riskPercentage ? Number(smcConfig.riskPercentage) : 2.0,
          maxOpenTrades: smcConfig?.maxOpenTrades ?? 2,
          dailyLossLimitPercent: smcConfig?.dailyLossLimitPercent ? Number(smcConfig.dailyLossLimitPercent) : 10.0,
          stopLossBufferPips: smcConfig?.stopLossBufferPips ? Number(smcConfig.stopLossBufferPips) : 2.0,
          rewardRiskRatio: smcConfig?.rewardRiskRatio ? Number(smcConfig.rewardRiskRatio) : 3.0,
          spreadFilterEnabled: smcConfig?.spreadFilterEnabled ?? true,
          maxSpreadPips: smcConfig?.maxSpreadPips ? Number(smcConfig.maxSpreadPips) : 3.0,
          sessionFilterEnabled: smcConfig?.sessionFilterEnabled ?? true,
          londonSessionStart: smcConfig?.londonSessionStart ?? '05:00',
          londonSessionEnd: smcConfig?.londonSessionEnd ?? '12:00',
          nySessionStart: smcConfig?.nySessionStart ?? '09:00',
          nySessionEnd: smcConfig?.nySessionEnd ?? '17:00',
          trailingEnabled: smcConfig?.trailingEnabled ?? true,
          trailingTriggerPips: smcConfig?.trailingTriggerPips ? Number(smcConfig.trailingTriggerPips) : 10.0,
          trailingStepPips: smcConfig?.trailingStepPips ? Number(smcConfig.trailingStepPips) : 2.0,
          circuitBreakerEnabled: smcConfig?.circuitBreakerEnabled ?? true,
          verboseLogging: smcConfig?.verboseLogging ?? true,
          // Campos institucionais
          // CORREÇÃO P0.5: Default = FALSE para compatibilidade com configs antigas
          // CORREÇÃO 2026-02-04: Converter explicitamente para boolean (valor do MySQL pode vir como 1, "1", true)
          institutionalModeEnabled: smcConfig?.institutionalModeEnabled === true || smcConfig?.institutionalModeEnabled === 1 || smcConfig?.institutionalModeEnabled === '1' || smcConfig?.institutionalModeEnabled === 'true',
          minGapPips: smcConfig?.minGapPips ? Number(smcConfig.minGapPips) : 2.0,
          asiaSessionStartUtc: smcConfig?.asiaSessionStartUtc ?? 1380,
          asiaSessionEndUtc: smcConfig?.asiaSessionEndUtc ?? 420,
          londonSessionStartUtc: smcConfig?.londonSessionStartUtc ?? 420,
          londonSessionEndUtc: smcConfig?.londonSessionEndUtc ?? 720,
          nySessionStartUtc: smcConfig?.nySessionStartUtc ?? 720,
          nySessionEndUtc: smcConfig?.nySessionEndUtc ?? 1260,
          instWaitFvgMinutes: smcConfig?.instWaitFvgMinutes ?? 90,
          instWaitMitigationMinutes: smcConfig?.instWaitMitigationMinutes ?? 60,
          instWaitEntryMinutes: smcConfig?.instWaitEntryMinutes ?? 30,
          instCooldownMinutes: smcConfig?.instCooldownMinutes ?? 20,
          maxTradesPerSession: smcConfig?.maxTradesPerSession ?? 2,
        };
        
        this.smcStrategy = strategyFactory.createStrategy(StrategyType.SMC_SWARM, strategyConfig);
        console.log(`[HybridEngine] ✅ Estratégia SMC inicializada | Símbolos ativos: ${smcActiveSymbols.join(', ')}`);
        
        // CORREÇÃO: Integrar InstitutionalLogger se modo institucional estiver ativado
        if (strategyConfig.institutionalModeEnabled && this.smcStrategy instanceof SMCStrategy) {
          this.institutionalLogger = new InstitutionalLogger(this.config.userId, this.config.botId);
          this.smcStrategy.setInstitutionalLogCallback(this.institutionalLogger.createLogCallback());
          console.log(`[HybridEngine] ✅ InstitutionalLogger integrado ao SMCStrategy`);
          
          // Emitir log SMC_INST_STATUS no boot para cada símbolo
          for (const symbol of smcActiveSymbols) {
            const fsmState = this.smcStrategy.getInstitutionalFSMState(symbol);
            const tradesCount = this.smcStrategy.getInstitutionalTradesThisSession?.(symbol) ?? 0;
            
            this.institutionalLogger.logStatus(
              symbol,
              true, // enabled
              'OFF_SESSION', // session inicial (será atualizado no primeiro candle)
              fsmState || 'IDLE',
              tradesCount,
              strategyConfig.maxTradesPerSession
            );
          }
        }
      } catch (error) {
        console.error("[HybridEngine] Erro ao inicializar SMC:", error);
      }
    }
    
    // Inicializar RSI+VWAP se necessário
    if (this.config.mode === HybridMode.RSI_VWAP_ONLY || this.config.mode === HybridMode.HYBRID) {
      try {
        const rsiConfigs = await db
          .select()
          .from(rsiVwapConfig)
          .where(
            and(
              eq(rsiVwapConfig.userId, this.config.userId),
              eq(rsiVwapConfig.botId, this.config.botId)
            )
          )
          .limit(1);
        
        const rsiConfig = rsiConfigs[0];
        
        // CORREÇÃO: Carregar activeSymbols próprios do RSI+VWAP do banco de dados
        // Default: array vazio (usuário deve selecionar via UI)
        let rsiActiveSymbols: string[] = [];
        if (rsiConfig?.activeSymbols) {
          try {
            rsiActiveSymbols = typeof rsiConfig.activeSymbols === 'string'
              ? JSON.parse(rsiConfig.activeSymbols)
              : rsiConfig.activeSymbols;
          } catch (e) {
            console.warn("[RsiVwapEngine] Erro ao parsear activeSymbols RSI+VWAP, usando default");
          }
        }
        
        // CORREÇÃO: Carregar candle counts do banco de dados
        this.rsiCandleCounts = {
          h1: rsiConfig?.h1CandleCount ?? 60,
          m15: rsiConfig?.m15CandleCount ?? 40,
          m5: rsiConfig?.m5CandleCount ?? 40,
        };
        
        // CORREÇÃO ISOLAMENTO: Quando modo RSI_VWAP_ONLY, sobrescrever this.config.symbols
        // com os símbolos próprios da estratégia RSI+VWAP (assim como ORB faz)
        if (this.config.mode === HybridMode.RSI_VWAP_ONLY) {
          this.config.symbols = rsiActiveSymbols;
          console.log(`[RsiVwapEngine] ✅ Símbolos do engine sobrescritos com RSI+VWAP: ${rsiActiveSymbols.join(', ')}`);
          console.log(`[RsiVwapEngine] ✅ Candle counts: H1=${this.rsiCandleCounts.h1}, M15=${this.rsiCandleCounts.m15}, M5=${this.rsiCandleCounts.m5}`);
        }
        
        const strategyConfig: RsiVwapStrategyConfig = {
          strategyType: StrategyType.RSI_VWAP_REVERSAL,
          rsiPeriod: rsiConfig?.rsiPeriod ?? 14,
          rsiOverbought: rsiConfig?.rsiOverbought ?? 70,
          rsiOversold: rsiConfig?.rsiOversold ?? 30,
          vwapEnabled: rsiConfig?.vwapEnabled ?? true,
          riskPercentage: rsiConfig?.riskPercentage ? Number(rsiConfig.riskPercentage) : 1.0,
          stopLossPips: rsiConfig?.stopLossPips ? Number(rsiConfig.stopLossPips) : 10,
          takeProfitPips: rsiConfig?.takeProfitPips ? Number(rsiConfig.takeProfitPips) : 20,
          rewardRiskRatio: rsiConfig?.rewardRiskRatio ? Number(rsiConfig.rewardRiskRatio) : 2.0,
          minCandleBodyPercent: rsiConfig?.minCandleBodyPercent ? Number(rsiConfig.minCandleBodyPercent) : 30,
          spreadFilterEnabled: rsiConfig?.spreadFilterEnabled ?? true,
          maxSpreadPips: rsiConfig?.maxSpreadPips ? Number(rsiConfig.maxSpreadPips) : 2.0,
          sessionFilterEnabled: rsiConfig?.sessionFilterEnabled ?? true,
          sessionStart: rsiConfig?.sessionStart ?? "08:00",
          sessionEnd: rsiConfig?.sessionEnd ?? "17:00",
          trailingEnabled: rsiConfig?.trailingEnabled ?? false,
          trailingTriggerPips: rsiConfig?.trailingTriggerPips ? Number(rsiConfig.trailingTriggerPips) : 15,
          trailingStepPips: rsiConfig?.trailingStepPips ? Number(rsiConfig.trailingStepPips) : 5,
          verboseLogging: rsiConfig?.verboseLogging ?? true,
          activeSymbols: rsiActiveSymbols,
        };
        
        this.rsiVwapStrategy = strategyFactory.createStrategy(StrategyType.RSI_VWAP_REVERSAL, strategyConfig);
        console.log(`[RsiVwapEngine] ✅ Estratégia RSI+VWAP inicializada | Símbolos ativos: ${rsiActiveSymbols.join(', ')}`);
        
        // Log estruturado para UI (isolado)
        if (this.config.mode === HybridMode.RSI_VWAP_ONLY) {
          await insertSystemLog({
            userId: this.config.userId,
            botId: this.config.botId,
            level: "INFO",
            category: "STRATEGY",
            source: "RsiVwapEngine",
            message: `STRATEGY_ACTIVE=RSI_VWAP_ONLY | Símbolos: ${rsiActiveSymbols.join(', ')} | Candles: H1=${this.rsiCandleCounts.h1} M15=${this.rsiCandleCounts.m15} M5=${this.rsiCandleCounts.m5}`,
            data: {
              strategyType: "RSI_VWAP_ONLY",
              activeSymbols: rsiActiveSymbols,
              candleCounts: this.rsiCandleCounts,
              rsiPeriod: strategyConfig.rsiPeriod,
              rsiOversold: strategyConfig.rsiOversold,
              rsiOverbought: strategyConfig.rsiOverbought,
            },
          });
        }
      } catch (error) {
        console.error("[RsiVwapEngine] Erro ao inicializar RSI+VWAP:", error);
      }
    }
    
    // Inicializar ORB se necessário (modo exclusivo ORB_ONLY)
    if (this.config.mode === HybridMode.ORB_ONLY) {
      try {
        const orbConfigs = await db!
          .select()
          .from(orbTrendConfig)
          .where(
            and(
              eq(orbTrendConfig.userId, this.config.userId),
              eq(orbTrendConfig.botId, this.config.botId)
            )
          )
          .limit(1);
        
        const orbConfig = orbConfigs[0];
        
        // Parsear activeSymbols (pode vir como string JSON)
        let activeSymbols = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"];
        if (orbConfig?.activeSymbols) {
          try {
            activeSymbols = typeof orbConfig.activeSymbols === 'string' 
              ? JSON.parse(orbConfig.activeSymbols) 
              : orbConfig.activeSymbols;
          } catch (e) {
            console.warn("[HybridEngine] Erro ao parsear activeSymbols ORB, usando default");
          }
        }
        
        const strategyConfig: Partial<ORBStrategyConfig> = {
          strategyType: StrategyType.ORB_TREND,
          activeSymbols: activeSymbols,
          openingCandles: orbConfig?.openingCandles ?? 3,
          emaPeriod: orbConfig?.emaPeriod ?? 200,
          slopeLookbackCandles: orbConfig?.slopeLookbackCandles ?? 10,
          minSlope: orbConfig?.minSlope ? Number(orbConfig.minSlope) : 0.0001,
          stopType: (orbConfig?.stopType as "rangeOpposite" | "atr") ?? "rangeOpposite",
          atrMult: orbConfig?.atrMult ? Number(orbConfig.atrMult) : 1.5,
          atrPeriod: orbConfig?.atrPeriod ?? 14,
          riskReward: orbConfig?.riskReward ? Number(orbConfig.riskReward) : 1.0,
          maxTradesPerDayPerSymbol: orbConfig?.maxTradesPerDayPerSymbol ?? 1,
          riskPercentage: orbConfig?.riskPercentage ? Number(orbConfig.riskPercentage) : 1.0,
          maxOpenTrades: orbConfig?.maxOpenTrades ?? 3,
          maxSpreadPips: orbConfig?.maxSpreadPips ? Number(orbConfig.maxSpreadPips) : 3.0,
          verboseLogging: orbConfig?.verboseLogging ?? true,
        };
        
        this.orbStrategy = strategyFactory.createStrategy(StrategyType.ORB_TREND, strategyConfig) as IMultiTimeframeStrategy;
        
        // Log de confirmação obrigatório
        console.log("[HybridEngine] ✅ STRATEGY_ACTIVE=ORB_ONLY");
        console.log(`[HybridEngine] ✅ Estratégia ORB inicializada | Símbolos: ${activeSymbols.join(', ')}`);
        
        // Log estruturado para UI
        await insertSystemLog({
          userId: this.config.userId,
          botId: this.config.botId,
          level: "INFO",
          category: "STRATEGY",
          source: "HybridEngine",
          message: `STRATEGY_ACTIVE=ORB_ONLY | Símbolos: ${activeSymbols.join(', ')}`,
          data: {
            strategyType: "ORB_TREND",
            activeSymbols: activeSymbols,
            openingCandles: strategyConfig.openingCandles,
            emaPeriod: strategyConfig.emaPeriod,
            stopType: strategyConfig.stopType,
            riskReward: strategyConfig.riskReward,
          },
        });
        
      } catch (error) {
        console.error("[HybridEngine] Erro ao inicializar ORB:", error);
      }
    }
  }
  
  /**
   * Inicializa o Risk Manager
   */
  private async initializeRiskManager(): Promise<void> {
    const db = await getDb();
    
    let smcConfig: any = null;
    if (this.config.mode === HybridMode.SMC_ONLY || this.config.mode === HybridMode.HYBRID) {
      const result = await db
        .select()
        .from(smcStrategyConfig)
        .where(
          and(
            eq(smcStrategyConfig.userId, this.config.userId),
            eq(smcStrategyConfig.botId, this.config.botId)
          )
        )
        .limit(1);
      smcConfig = result[0];
    }
    
    const riskConfig: RiskManagerConfig = {
      userId: this.config.userId,
      botId: this.config.botId,
      riskPercentage: smcConfig?.riskPercentage ? Number(smcConfig.riskPercentage) : DEFAULT_RISK_CONFIG.riskPercentage,
      maxOpenTrades: this.config.maxPositions,
      dailyLossLimitPercent: smcConfig?.dailyLossLimitPercent ? Number(smcConfig.dailyLossLimitPercent) : DEFAULT_RISK_CONFIG.dailyLossLimitPercent,
      sessionFilterEnabled: smcConfig?.sessionFilterEnabled ?? DEFAULT_RISK_CONFIG.sessionFilterEnabled,
      londonSessionStart: smcConfig?.londonSessionStart ?? DEFAULT_RISK_CONFIG.londonSessionStart,
      londonSessionEnd: smcConfig?.londonSessionEnd ?? DEFAULT_RISK_CONFIG.londonSessionEnd,
      nySessionStart: smcConfig?.nySessionStart ?? DEFAULT_RISK_CONFIG.nySessionStart,
      nySessionEnd: smcConfig?.nySessionEnd ?? DEFAULT_RISK_CONFIG.nySessionEnd,
      circuitBreakerEnabled: smcConfig?.circuitBreakerEnabled ?? DEFAULT_RISK_CONFIG.circuitBreakerEnabled,
    };
    
    this.riskManager = createRiskManager(riskConfig);
    
    const accountInfo = await ctraderAdapter.getAccountInfo();
    if (accountInfo?.balance) {
      await this.riskManager.initialize(accountInfo.balance);
    }
    
    console.log("[HybridEngine] Risk Manager inicializado");
  }
  
  /**
   * CORREÇÃO P0 WARM-UP (2026-02-04): Warm-Up obrigatório por símbolo
   * 
   * No boot do engine, para cada símbolo ativo, executar getTrendbars com folga (+10)
   * para garantir que o bot esteja pronto para operar em minutos após deploy/restart.
   * 
   * Requisitos mínimos:
   * - H1: 50 candles (+ 10 folga = 60)
   * - M15: 30 candles (+ 10 folga = 40)
   * - M5: 20 candles (+ 10 folga = 30)
   * 
   * Aceite: em até 60-120s após boot, todos os símbolos devem emitir:
   * [SMC_INST_WARMUP_READY] symbol=X H1=n M15=n M5=n
   */
  private async warmUpSymbols(): Promise<void> {
    const startTime = Date.now();
    console.log("[HybridEngine] 🔥 WARM-UP OBRIGATÓRIO: Iniciando...");
    console.log(`[HybridEngine] Símbolos: ${this.config.symbols.join(', ')}`);
    await this.logInfo(`🔥 WARM-UP: Iniciando para ${this.config.symbols.length} ativos`, "SYSTEM");
    
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const DELAY_BETWEEN_REQUESTS = 1500; // 1.5s entre cada requisição de timeframe
    const DELAY_BETWEEN_SYMBOLS = 2000;  // 2s entre cada símbolo
    const RATE_LIMIT_RETRY_DELAY = 5000; // 5s de espera se receber Rate Limit
    const MAX_RETRIES = 3;
    
    // CORREÇÃO: Requisitos mínimos baseados no modo
    // RSI_VWAP_ONLY usa seus próprios candle counts (carregados do banco)
    // SMC/HYBRID/ORB usam requisitos do SMC (50/40/40 + folga)
    let REQUIRED_H1: number;
    let REQUIRED_M15: number;
    let REQUIRED_M5: number;
    
    if (this.config.mode === HybridMode.RSI_VWAP_ONLY) {
      // Usar candle counts específicos do RSI+VWAP (já carregados do banco)
      REQUIRED_H1 = this.rsiCandleCounts.h1;
      REQUIRED_M15 = this.rsiCandleCounts.m15;
      REQUIRED_M5 = this.rsiCandleCounts.m5;
      console.log(`[RsiVwapEngine] 🔥 WARM-UP com candle counts RSI+VWAP: H1=${REQUIRED_H1}, M15=${REQUIRED_M15}, M5=${REQUIRED_M5}`);
    } else {
      // Requisitos do SMC/HYBRID/ORB (50 + 10 folga)
      REQUIRED_H1 = 60;  // 50 + 10 folga
      REQUIRED_M15 = 50; // 40 + 10 folga
      REQUIRED_M5 = 50;  // 40 + 10 folga
      console.log(`[HybridEngine] 🔥 WARM-UP com candle counts SMC: H1=${REQUIRED_H1}, M15=${REQUIRED_M15}, M5=${REQUIRED_M5}`);
    }
    
    const successSymbols: string[] = [];
    const failedSymbols: string[] = [];
    
    // Helper para detectar erro de Rate Limit
    const isRateLimitError = (error: any): boolean => {
      const errorStr = String(error).toLowerCase();
      return errorStr.includes('429') || 
             errorStr.includes('rate') || 
             errorStr.includes('limit') ||
             errorStr.includes('frequency') ||
             errorStr.includes('too many');
    };
    
    // Processar cada símbolo SEQUENCIALMENTE
    for (let i = 0; i < this.config.symbols.length; i++) {
      const symbol = this.config.symbols[i];
      let symbolSuccess = false;
      
      console.log(`[HybridEngine] [${i + 1}/${this.config.symbols.length}] 🔥 WARM-UP: ${symbol}...`);
      const symbolStartTime = Date.now();
      
      // Retry loop para cada símbolo
      for (let attempt = 1; attempt <= MAX_RETRIES && !symbolSuccess; attempt++) {
        try {
          if (attempt > 1) {
            console.log(`[HybridEngine] 🔄 ${symbol}: Tentativa ${attempt}/${MAX_RETRIES}...`);
          }
          
          // Carregar H1 (getTrendbars)
          const h1FetchStart = Date.now();
          const h1Candles = await ctraderAdapter.getCandleHistory(symbol, "H1", REQUIRED_H1);
          const h1FetchTime = Date.now() - h1FetchStart;
          this.timeframeData.h1.set(symbol, h1Candles);
          console.log(`[HybridEngine] ${symbol} H1: ${h1Candles.length}/${REQUIRED_H1} candles (${h1FetchTime}ms)`);
          await sleep(DELAY_BETWEEN_REQUESTS);
          
          // Carregar M15 (getTrendbars)
          const m15FetchStart = Date.now();
          const m15Candles = await ctraderAdapter.getCandleHistory(symbol, "M15", REQUIRED_M15);
          const m15FetchTime = Date.now() - m15FetchStart;
          this.timeframeData.m15.set(symbol, m15Candles);
          console.log(`[HybridEngine] ${symbol} M15: ${m15Candles.length}/${REQUIRED_M15} candles (${m15FetchTime}ms)`);
          await sleep(DELAY_BETWEEN_REQUESTS);
          
          // Carregar M5 (getTrendbars)
          const m5FetchStart = Date.now();
          const m5Candles = await ctraderAdapter.getCandleHistory(symbol, "M5", REQUIRED_M5);
          const m5FetchTime = Date.now() - m5FetchStart;
          this.timeframeData.m5.set(symbol, m5Candles);
          console.log(`[HybridEngine] ${symbol} M5: ${m5Candles.length}/${REQUIRED_M5} candles (${m5FetchTime}ms)`);
          
          const symbolElapsedTime = Date.now() - symbolStartTime;
          
          // Verificar se os dados são suficientes (mínimo sem folga)
          const isValid = h1Candles.length >= 50 && m15Candles.length >= 30 && m5Candles.length >= 20;
          
          if (isValid) {
            // LOG ESTRUTURADO: WARMUP_READY
            console.log(`[SMC_INST_WARMUP_READY] ${symbol}: H1=${h1Candles.length} M15=${m15Candles.length} M5=${m5Candles.length} time=${symbolElapsedTime}ms`);
            successSymbols.push(symbol);
            symbolSuccess = true;
          } else {
            console.warn(`[HybridEngine] ⚠️ ${symbol}: Dados insuficientes - H1=${h1Candles.length}/50, M15=${m15Candles.length}/40, M5=${m5Candles.length}/40`);
            if (attempt === MAX_RETRIES) {
              // Na última tentativa, aceitar dados parciais
              console.warn(`[SMC_INST_WARMUP_PARTIAL] ${symbol}: H1=${h1Candles.length} M15=${m15Candles.length} M5=${m5Candles.length}`);
              successSymbols.push(symbol);
              symbolSuccess = true;
            }
          }
          
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`[HybridEngine] ❌ ${symbol}: Erro na tentativa ${attempt}: ${errorMsg}`);
          
          // Se for Rate Limit, esperar mais tempo antes de tentar novamente
          if (isRateLimitError(error)) {
            console.warn(`[HybridEngine] ⏳ ${symbol}: Rate Limit detectado! Aguardando ${RATE_LIMIT_RETRY_DELAY/1000}s...`);
            await sleep(RATE_LIMIT_RETRY_DELAY);
          } else if (attempt < MAX_RETRIES) {
            // Para outros erros, esperar um pouco antes de tentar novamente
            await sleep(DELAY_BETWEEN_REQUESTS * 2);
          }
          
          if (attempt === MAX_RETRIES) {
            console.error(`[HybridEngine] ❌ ${symbol}: FALHA DEFINITIVA após ${MAX_RETRIES} tentativas`);
            failedSymbols.push(symbol);
          }
        }
      }
      
      // Delay entre símbolos (exceto no último)
      if (i < this.config.symbols.length - 1) {
        await sleep(DELAY_BETWEEN_SYMBOLS);
      }
    }
    
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`[HybridEngine] 📊 RESUMO DO CARREGAMENTO`);
    console.log(`[HybridEngine] ⏱️ Tempo total: ${elapsedTime}s`);
    console.log(`[HybridEngine] ✅ Sucesso: ${successSymbols.length}/${this.config.symbols.length}`);
    console.log(`[HybridEngine] ✅ Símbolos OK: ${successSymbols.join(', ') || 'Nenhum'}`);
    if (failedSymbols.length > 0) {
      console.log(`[HybridEngine] ❌ Falhas: ${failedSymbols.length}`);
      console.log(`[HybridEngine] ❌ Símbolos com falha: ${failedSymbols.join(', ')}`);
    }
    console.log("═══════════════════════════════════════════════════════════════");
    
    await this.logInfo(
      `📊 Carregamento concluído em ${elapsedTime}s | Sucesso: ${successSymbols.length}/${this.config.symbols.length} | Falhas: ${failedSymbols.length}`,
      "SYSTEM"
    );
  }
  
  /**
   * Subscreve a preços
   */
  private async subscribeToAllPrices(): Promise<void> {
    for (const symbol of this.config.symbols) {
      try {
        await ctraderAdapter.subscribePrice(symbol, (tick) => {
          this.onPriceTick(symbol, tick);
        });
        this.priceSubscriptions.add(symbol);
        console.log(`[HybridEngine] Subscrito a ${symbol}`);
      } catch (error) {
        console.error(`[HybridEngine] Erro ao subscrever ${symbol}:`, error);
      }
    }
  }
  
  /**
   * Cancela subscrições
   */
  private async unsubscribeFromAllPrices(): Promise<void> {
    for (const symbol of Array.from(this.priceSubscriptions)) {
      try {
        await ctraderAdapter.unsubscribePrice(symbol);
      } catch (error) {
        console.error(`[HybridEngine] Erro ao cancelar ${symbol}:`, error);
      }
    }
    this.priceSubscriptions.clear();
  }
  
  /**
   * Processa tick de preço
   */
  private onPriceTick(symbol: string, tick: { bid: number; ask: number; timestamp: number }): void {
    if (!this._isRunning) return;
    
    this.lastTickPrice = tick.bid;
    this.lastTickTime = tick.timestamp;
    this.currentSymbol = symbol;
    this.tickCount++;
    
    this.emit("tick", { symbol, bid: tick.bid, ask: tick.ask, timestamp: tick.timestamp });
  }
  
  /**
   * Inicia loop de análise
   */
  private startAnalysisLoop(): void {
    const intervalMs = 30000; // 30 segundos
    
    this.performAnalysis();
    
    this.analysisInterval = setInterval(() => {
      this.performAnalysis();
    }, intervalMs);
    
    console.log(`[HybridEngine] Loop de análise iniciado (${intervalMs / 1000}s)`);
  }
  
  /**
   * Inicia loop de atualização de dados
   */
  private startDataRefreshLoop(): void {
    const intervalMs = 5 * 60 * 1000; // 5 minutos
    
    this.dataRefreshInterval = setInterval(() => {
      this.refreshTimeframeData();
    }, intervalMs);
    
    console.log(`[HybridEngine] Loop de refresh iniciado (${intervalMs / 60000}min)`);
  }
  
  /**
   * Atualiza dados de timeframes
   */
  private async refreshTimeframeData(): Promise<void> {
    if (!this._isRunning) return;
    
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    for (const symbol of this.config.symbols) {
      if (!this._isRunning) return;
      
      try {
        const h1 = await ctraderAdapter.getCandleHistory(symbol, "H1", 50);
        this.mergeCandles(symbol, "h1", h1);
        await sleep(1000);
        
        const m15 = await ctraderAdapter.getCandleHistory(symbol, "M15", 50);
        this.mergeCandles(symbol, "m15", m15);
        await sleep(1000);
        
        const m5 = await ctraderAdapter.getCandleHistory(symbol, "M5", 50);
        this.mergeCandles(symbol, "m5", m5);
        await sleep(1000);
      } catch (error) {
        console.error(`[HybridEngine] Erro ao atualizar ${symbol}:`, error);
      }
    }
  }
  
  /**
   * Mescla candles
   */
  private mergeCandles(symbol: string, timeframe: "h1" | "m15" | "m5", newCandles: any[]): void {
    const existing = this.timeframeData[timeframe].get(symbol) || [];
    const timestamps = new Set(existing.map(c => c.timestamp));
    
    for (const candle of newCandles) {
      if (!timestamps.has(candle.timestamp)) {
        existing.push(candle);
      } else {
        const idx = existing.findIndex(c => c.timestamp === candle.timestamp);
        if (idx >= 0) existing[idx] = candle;
      }
    }
    
    existing.sort((a, b) => a.timestamp - b.timestamp);
    if (existing.length > 300) existing.splice(0, existing.length - 300);
    
    this.timeframeData[timeframe].set(symbol, existing);
  }
  
  /**
   * Executa análise de mercado
   * 
   * CORREÇÃO CRÍTICA: Agora loga claramente quantos símbolos estão sendo analisados
   * e emite evento para a UI com status da análise
   * 
   * CORREÇÃO P0 v5.0: Executa watchdog a cada ciclo de análise
   */
  private async performAnalysis(): Promise<void> {
    if (!this._isRunning) return;
    
    this.analysisCount++;
    
    // CORREÇÃO P0 v5.0: Executar watchdog para limpar locks expirados
    this.runWatchdog();
    
    // Log de início de análise a cada 10 ciclos para confirmar que todos os símbolos estão sendo processados
    if (this.analysisCount % 10 === 0 || this.analysisCount === 1) {
      console.log(`[HybridEngine] 🔍 Análise #${this.analysisCount} | Símbolos configurados: ${this.config.symbols.length} | Lista: ${this.config.symbols.join(', ')}`);
      
      // Emitir evento para UI com status da análise
      this.emit("analysisStatus", {
        count: this.analysisCount,
        symbolsCount: this.config.symbols.length,
        symbols: this.config.symbols
      });
    }
    
    // Verificar se pode operar
    if (this.riskManager) {
      const canOpen = await this.riskManager.canOpenPosition();
      if (!canOpen.allowed) {
        if (this.analysisCount % 10 === 0) {
          console.log(`[HybridEngine] ⚠️ ${canOpen.reason}`);
        }
        return;
      }
    }
    
    // Contadores para feedback
    let analyzedCount = 0;
    let skippedCount = 0;
    const skippedSymbols: string[] = [];
    
    // Analisar cada símbolo
    for (const symbol of this.config.symbols) {
      try {
        const wasAnalyzed = await this.analyzeSymbol(symbol);
        if (wasAnalyzed) {
          analyzedCount++;
        } else {
          skippedCount++;
          skippedSymbols.push(symbol);
        }
      } catch (error) {
        console.error(`[HybridEngine] Erro ao analisar ${symbol}:`, error);
        skippedCount++;
        skippedSymbols.push(symbol);
      }
    }
    
    // Log de resumo a cada 10 ciclos
    if (this.analysisCount % 10 === 0 || this.analysisCount === 1) {
      console.log(`[HybridEngine] 📊 Resumo: ${analyzedCount}/${this.config.symbols.length} analisados | ${skippedCount} ignorados${skippedSymbols.length > 0 ? ` (${skippedSymbols.join(', ')})` : ''}`);
      
      // CORREÇÃO 2026-02-04: Emitir SMC_INST_STATUS periódico para cada símbolo
      // CORREÇÃO: Não executar InstitutionalLogger quando modo RSI_VWAP_ONLY
      if (this.institutionalLogger && this.smcStrategy instanceof SMCStrategy && this.config.mode !== HybridMode.RSI_VWAP_ONLY) {
        for (const symbol of this.config.symbols) {
          const fsmState = this.smcStrategy.getInstitutionalFSMState(symbol);
          const tradesCount = this.smcStrategy.getSessionTradeCount?.(symbol) ?? 0;
          const instDebug = this.smcStrategy.getInstitutionalDebugInfo?.(symbol);
          
          // Extrair sessão atual do debug info ou usar OFF_SESSION como fallback
          let currentSession: 'ASIA' | 'LONDON' | 'NY' | 'OFF_SESSION' = 'OFF_SESSION';
          if (instDebug) {
            if (instDebug.includes('ASIA')) currentSession = 'ASIA';
            else if (instDebug.includes('LONDON')) currentSession = 'LONDON';
            else if (instDebug.includes('NY')) currentSession = 'NY';
          }
          
          this.institutionalLogger.logStatus(
            symbol,
            true, // enabled (já sabemos que está habilitado se chegou aqui)
            currentSession,
            fsmState || 'IDLE',
            tradesCount,
            2 // maxTradesPerSession default
          );
        }
      }
    }
  }
  
  /**
   * Analisa um símbolo com ambas as estratégias
   * 
   * LÓGICA DE PRIORIZAÇÃO:
   * 1. Se SMC gera sinal válido → usar SMC (ignorar RSI+VWAP)
   * 2. Se sinais conflitantes → não operar
   * 3. Se apenas RSI+VWAP gera sinal → usar RSI+VWAP
   * 
   * CORREÇÃO CRÍTICA: Agora retorna boolean indicando se a análise foi executada
   * e loga quando símbolos são ignorados por falta de dados
   * 
   * @returns true se a análise foi executada, false se foi ignorada
   */
  private async analyzeSymbol(symbol: string): Promise<boolean> {
    const h1Data = this.timeframeData.h1.get(symbol) || [];
    const m15Data = this.timeframeData.m15.get(symbol) || [];
    const m5Data = this.timeframeData.m5.get(symbol) || [];
    
    // CORREÇÃO: Validação de dados baseada no modo
    // RSI_VWAP_ONLY usa requisitos menores (configuráveis via banco)
    // SMC/HYBRID/ORB usam requisitos do SMC (50/40/40)
    let minH1: number, minM15: number, minM5: number;
    
    if (this.config.mode === HybridMode.RSI_VWAP_ONLY) {
      // Usar requisitos do RSI+VWAP (mais flexíveis)
      minH1 = this.rsiCandleCounts.h1;
      minM15 = this.rsiCandleCounts.m15;
      minM5 = this.rsiCandleCounts.m5;
    } else {
      // Requisitos do SMC (mais rigorosos)
      minH1 = 50;
      minM15 = 40;
      minM5 = 40;
    }
    
    if (h1Data.length < minH1 || m15Data.length < minM15 || m5Data.length < minM5) {
      // Log estruturado a cada 100 análises para não poluir
      if (this.analysisCount % 100 === 1) {
        const logPrefix = this.config.mode === HybridMode.RSI_VWAP_ONLY ? "[RSI_VWAP_BLOCK]" : "[SMC_INST_BLOCK]";
        console.log(`${logPrefix} ${symbol}: BLOCK_REASON=INSUFFICIENT_CANDLES H1=${h1Data.length}/${minH1} M15=${m15Data.length}/${minM15} M5=${m5Data.length}/${minM5}`);
      }
      return false;
    }
    
    // Obter preço atual
    const pipValue = getCentralizedPipValue(symbol);
    let currentBid: number | undefined;
    let currentAsk: number | undefined;
    let currentSpreadPips: number | undefined;
    
    try {
      const price = await ctraderAdapter.getPrice(symbol);
      if (price && price.bid > 0 && price.ask > 0) {
        currentBid = price.bid;
        currentAsk = price.ask;
        currentSpreadPips = (currentAsk - currentBid) / pipValue;
      }
    } catch (e) {
      currentBid = m5Data[m5Data.length - 1]?.close;
    }
    
    // Preparar dados MTF
    const mtfData: MultiTimeframeData = {
      h1: h1Data.map(c => ({ timestamp: c.timestamp * 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 })),
      m15: m15Data.map(c => ({ timestamp: c.timestamp * 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 })),
      m5: m5Data.map(c => ({ timestamp: c.timestamp * 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 })),
      currentBid,
      currentAsk,
      currentSpreadPips,
    };
    
    // Obter sinais de ambas as estratégias
    const combinedSignal = this.getCombinedSignal(symbol, mtfData);
    
    // Log de análise para UI
    const smcSig = combinedSignal.smcSignal?.signal || "NONE";
    const rsiSig = combinedSignal.rsiVwapSignal?.signal || "NONE";
    const finalSig = combinedSignal.finalSignal?.signal || "NONE";
    
    // Sempre logar análise para a UI (mesmo quando NONE)
    await this.logAnalysis(
      symbol,
      smcSig,
      rsiSig,
      finalSig,
      combinedSignal.source
    );
    
    // Log de conflito se detectado
    if (combinedSignal.conflictDetected && combinedSignal.conflictReason) {
      await this.logConflict(symbol, combinedSignal.conflictReason);
    }
    
    // Log detalhado no console
    if (combinedSignal.finalSignal && combinedSignal.finalSignal.signal !== "NONE") {
      console.log("───────────────────────────────────────────────────────────────");
      console.log(`[HYBRID] 📊 Análise #${this.analysisCount} | ${symbol}`);
      console.log(`[HYBRID] Sinal SMC: ${smcSig}`);
      console.log(`[HYBRID] Sinal RSI+VWAP: ${rsiSig}`);
      console.log(`[HYBRID] Sinal Final: ${finalSig} (Fonte: ${combinedSignal.source})`);
      if (combinedSignal.conflictDetected) {
        console.log(`[HYBRID] ⚠️ Conflito: ${combinedSignal.conflictReason}`);
      }
      console.log("───────────────────────────────────────────────────────────────");
    }
    
    // Executar trade se houver sinal válido
    if (combinedSignal.finalSignal && 
        combinedSignal.finalSignal.signal !== "NONE" && 
        combinedSignal.finalSignal.confidence >= 50 &&
        !combinedSignal.conflictDetected) {
      await this.executeSignal(symbol, combinedSignal);
    }
    
    this.emit("analysis", { symbol, combinedSignal });
    
    return true; // Análise foi executada com sucesso
  }
  
  /**
   * Obtém sinal combinado das estratégias com lógica de priorização
   */
  private getCombinedSignal(symbol: string, mtfData: MultiTimeframeData): CombinedSignal {
    let smcSignal: SignalResult | null = null;
    let rsiVwapSignal: SignalResult | null = null;
    let orbSignal: SignalResult | null = null;
    
    // ============= MODO ORB_ONLY: CHAMAR EXCLUSIVAMENTE ORBStrategy =============
    if (this.config.mode === HybridMode.ORB_ONLY && this.orbStrategy) {
      // Setar símbolo atual na ORB
      if (this.orbStrategy instanceof ORBStrategy) {
        this.orbStrategy.setCurrentSymbol(symbol);
      }
      
      // Atualizar dados multi-timeframe (ORB usa M15)
      if ("updateTimeframeData" in this.orbStrategy) {
        this.orbStrategy.updateTimeframeData("H1", mtfData.h1!);
        this.orbStrategy.updateTimeframeData("M15", mtfData.m15!);
        this.orbStrategy.updateTimeframeData("M5", mtfData.m5!);
      }
      
      // Chamar analyzeSignal da ORB (usa M15 internamente)
      orbSignal = this.orbStrategy.analyzeSignal(mtfData.m15!, mtfData);
      
      // Retornar sinal ORB diretamente (modo exclusivo, sem priorização)
      return {
        smcSignal: null,
        rsiVwapSignal: null,
        orbSignal: orbSignal,
        finalSignal: orbSignal && orbSignal.signal !== "NONE" ? orbSignal : null,
        source: orbSignal && orbSignal.signal !== "NONE" ? "ORB" : "NONE",
        conflictDetected: false,
      };
    }
    
    // ============= MODOS SMC/RSI_VWAP/HYBRID: LÓGICA ORIGINAL =============
    
    // Obter sinal SMC
    if (this.smcStrategy) {
      if (this.smcStrategy instanceof SMCStrategy) {
        this.smcStrategy.setCurrentSymbol(symbol);
      }
      
      if ("updateTimeframeData" in this.smcStrategy) {
        const mtf = this.smcStrategy as IMultiTimeframeStrategy;
        mtf.updateTimeframeData("H1", mtfData.h1!);
        mtf.updateTimeframeData("M15", mtfData.m15!);
        mtf.updateTimeframeData("M5", mtfData.m5!);
      }
      
      smcSignal = this.smcStrategy.analyzeSignal(mtfData.m5!, mtfData);
    }
    
    // Obter sinal RSI+VWAP
    if (this.rsiVwapStrategy) {
      if (this.rsiVwapStrategy instanceof RsiVwapStrategy) {
        this.rsiVwapStrategy.setCurrentSymbol(symbol);
      }
      rsiVwapSignal = this.rsiVwapStrategy.analyzeSignal(mtfData.m5!, mtfData);
    }
    
    // Aplicar lógica de priorização (SMC/RSI_VWAP/HYBRID)
    return this.applyPrioritization(smcSignal, rsiVwapSignal);
  }
  
  /**
   * Aplica lógica de priorização e resolução de conflitos
   * 
   * Regras:
   * 1. SMC tem prioridade máxima
   * 2. Sinais conflitantes = não operar
   * 3. Sinais na mesma direção = usar SMC
   * 4. Apenas RSI+VWAP = usar RSI+VWAP
   */
  private applyPrioritization(smcSignal: SignalResult | null, rsiVwapSignal: SignalResult | null): CombinedSignal {
    const result: CombinedSignal = {
      smcSignal,
      rsiVwapSignal,
      orbSignal: null, // ORB não participa da priorização SMC/RSI_VWAP
      finalSignal: null,
      source: "NONE",
      conflictDetected: false,
    };
    
    const smcValid = smcSignal && smcSignal.signal !== "NONE";
    const rsiValid = rsiVwapSignal && rsiVwapSignal.signal !== "NONE";
    
    // Caso 1: Apenas SMC tem sinal
    if (smcValid && !rsiValid) {
      result.finalSignal = smcSignal;
      result.source = "SMC";
      return result;
    }
    
    // Caso 2: Apenas RSI+VWAP tem sinal
    if (!smcValid && rsiValid) {
      result.finalSignal = rsiVwapSignal;
      result.source = "RSI_VWAP";
      return result;
    }
    
    // Caso 3: Ambos têm sinal
    if (smcValid && rsiValid) {
      // Verificar conflito
      if (smcSignal!.signal !== rsiVwapSignal!.signal) {
        result.conflictDetected = true;
        result.conflictReason = `SMC=${smcSignal!.signal} vs RSI+VWAP=${rsiVwapSignal!.signal}`;
        result.finalSignal = null;
        result.source = "NONE";
        return result;
      }
      
      // Mesma direção: priorizar SMC
      result.finalSignal = smcSignal;
      result.source = "SMC";
      return result;
    }
    
    // Caso 4: Nenhum tem sinal
    return result;
  }
  
  /**
   * Executa o sinal combinado
   * 
   * IMPORTANTE: Usa o pipeline existente de execução (CTraderAdapter),
   * preservando a lógica de volume do CTraderClient.ts.
   * 
   * CORREÇÃO P0 v5.0 (2026-01-22):
   * - Sistema de In-Flight Orders com lock atômico
   * - Lock é setado ANTES de placeOrder (fecha janela de corrida)
   * - Lock mantido até confirmação real via API ou timeout de 30s
   * - Logs estruturados para observabilidade
   * 
   * LÓGICA DE PROTEÇÃO (6 CAMADAS):
   * 1. In-Flight Lock (NOVA - fecha race condition)
   * 2. Cooldown por símbolo
   * 3. Filtro de candle M5
   * 4. Verificação em tempo real via API (reconcilePositions)
   * 5. Verificação no banco de dados
   * 6. Verificação de limite total de posições
   */
  private async executeSignal(symbol: string, combinedSignal: CombinedSignal): Promise<void> {
    const now = Date.now();
    
    // ═══════════════════════════════════════════════════════════════
    // CAMADA 0: CORREÇÃO P0 v5.0 - LOCK IN-FLIGHT (SEÇÃO CRÍTICA)
    // ═══════════════════════════════════════════════════════════════
    // REGRA FUNDAMENTAL: Se existe ordem in-flight para o símbolo,
    // bloquear IMEDIATAMENTE. Não importa o estado do cache/DB/API.
    
    const lockResult = this.tryAcquireLock(symbol);
    
    if (!lockResult.acquired) {
      console.log(`[HybridEngine] 🚫 ${symbol}: BLOQUEADO - ${lockResult.reason}`);
      return;
    }
    
    const correlationId = lockResult.correlationId!;
    
    try {
      // ═══════════════════════════════════════════════════════════════
      // CAMADA 1: COOLDOWN POR SÍMBOLO
      // ═══════════════════════════════════════════════════════════════
      const lastTrade = this.lastTradeTime.get(symbol) || 0;
      if (now - lastTrade < this.config.cooldownMs) {
        console.log(`[HybridEngine] ⏳ ${symbol}: IGNORADO - Cooldown ativo (${Math.floor((this.config.cooldownMs - (now - lastTrade))/1000)}s restantes) correlationId=${correlationId}`);
        this.clearInFlightOrder(symbol, 'rejected');
        return;
      }
      
      // ═══════════════════════════════════════════════════════════════
      // CAMADA 2: FILTRO DE CANDLE M5 (IMPEDE MÚLTIPLAS ORDENS NO MESMO CANDLE)
      // ═══════════════════════════════════════════════════════════════
      const M5_MS = 5 * 60 * 1000; // 5 minutos em milissegundos
      const currentCandleTimestamp = Math.floor(now / M5_MS) * M5_MS;
      const lastTradedCandle = this.lastTradedCandleTimestamp.get(symbol) || 0;
      
      if (currentCandleTimestamp === lastTradedCandle) {
        console.log(`[HybridEngine] 🕯️ ${symbol}: IGNORADO - Já operou neste candle M5 correlationId=${correlationId}`);
        this.clearInFlightOrder(symbol, 'rejected');
        return;
      }
      
      // ═══════════════════════════════════════════════════════════════
      // CAMADA 3: VERIFICAÇÃO DE RISK MANAGER
      // ═══════════════════════════════════════════════════════════════
      if (this.riskManager) {
        const canOpen = await this.riskManager.canOpenPosition();
        if (!canOpen.allowed) {
          console.log(`[HybridEngine] ⚠️ ${symbol}: ${canOpen.reason} correlationId=${correlationId}`);
          this.clearInFlightOrder(symbol, 'rejected');
          return;
        }
      }
      
      // ═══════════════════════════════════════════════════════════════
      // CAMADA 4: VERIFICAÇÃO EM TEMPO REAL VIA API (DENTRO DO LOCK)
      // CORREÇÃO P0 v5.0: reconcilePositions() DENTRO da seção crítica
      // ═══════════════════════════════════════════════════════════════
      
      // 4a. Sincronizar posições com a API (reconcile)
      try {
        await ctraderAdapter.reconcilePositions();
        console.log(`[HybridEngine] 🔄 ${symbol}: Posições sincronizadas correlationId=${correlationId}`);
      } catch (reconcileError) {
        console.warn(`[HybridEngine] ⚠️ ${symbol}: Erro ao sincronizar, usando cache correlationId=${correlationId}:`, reconcileError);
      }
      
      // 4b. Verificar posições abertas (cache atualizado)
      const openPositions = await ctraderAdapter.getOpenPositions();
      const symbolPositions = openPositions.filter(p => p.symbol === symbol);
      
      console.log(`[HybridEngine] 📊 ${symbol}: Posições abertas=${openPositions.length}, Neste ativo=${symbolPositions.length}, Limite=${this.config.maxTradesPerSymbol} correlationId=${correlationId}`);
      
      if (symbolPositions.length >= this.config.maxTradesPerSymbol) {
        console.log(`[HybridEngine] ⚠️ ${symbol}: BLOQUEADO - Já existe ${symbolPositions.length} posição(ões) (limite: ${this.config.maxTradesPerSymbol}) correlationId=${correlationId}`);
        this.clearInFlightOrder(symbol, 'rejected');
        return;
      }
      
      // ═══════════════════════════════════════════════════════════════
      // CAMADA 5: VERIFICAÇÃO NO BANCO DE DADOS
      // ═══════════════════════════════════════════════════════════════
      if (this.riskManager) {
        const dbSymbolPositions = await this.riskManager.getOpenTradesCountBySymbol(symbol);
        console.log(`[HybridEngine] 📊 ${symbol}: Posições no DB=${dbSymbolPositions} correlationId=${correlationId}`);
        
        if (dbSymbolPositions >= this.config.maxTradesPerSymbol) {
          console.log(`[HybridEngine] ⚠️ ${symbol}: BLOQUEADO (DB) - ${dbSymbolPositions} posição(ões) no banco correlationId=${correlationId}`);
          this.clearInFlightOrder(symbol, 'rejected');
          return;
        }
      }
      
      // ═══════════════════════════════════════════════════════════════
      // CAMADA 6: VERIFICAÇÃO DE LIMITE TOTAL DE POSIÇÕES
      // ═══════════════════════════════════════════════════════════════
      if (openPositions.length >= this.config.maxPositions) {
        console.log(`[HybridEngine] ⚠️ ${symbol}: Limite total de ${this.config.maxPositions} posições atingido correlationId=${correlationId}`);
        this.clearInFlightOrder(symbol, 'rejected');
        return;
      }
      
      // ═══════════════════════════════════════════════════════════════
      // PREPARAÇÃO DA ORDEM
      // ═══════════════════════════════════════════════════════════════
      
      const signal = combinedSignal.finalSignal!;
      const strategy = combinedSignal.source === "SMC" ? this.smcStrategy : this.rsiVwapStrategy;
      
      if (!strategy) {
        this.clearInFlightOrder(symbol, 'failed');
        return;
      }
      
      // Atualizar status para 'sent' (ordem está sendo enviada)
      this.updateInFlightOrder(symbol, { status: 'sent' });
      
      // Obter informações da conta
      const accountInfo = await ctraderAdapter.getAccountInfo();
      const balance = accountInfo?.balance || 10000;
      const pipValue = getCentralizedPipValue(symbol);
      
      // Obter preço atual
      let currentPrice = 0;
      try {
        const priceData = await ctraderAdapter.getPrice(symbol);
        if (priceData && priceData.bid > 0 && priceData.ask > 0) {
          const direction = signal.signal === "BUY" ? TradeSide.BUY : TradeSide.SELL;
          currentPrice = direction === TradeSide.BUY ? priceData.ask : priceData.bid;
        }
      } catch (e) {
        console.error(`[HybridEngine] Erro ao obter preço para ${symbol} correlationId=${correlationId}`);
        this.clearInFlightOrder(symbol, 'failed');
        return;
      }
      
      if (currentPrice <= 0) {
        this.clearInFlightOrder(symbol, 'failed');
        return;
      }
      
      // Calcular SL/TP
      const direction = signal.signal === "BUY" ? TradeSide.BUY : TradeSide.SELL;
      const sltp = strategy.calculateSLTP(currentPrice, direction, pipValue, signal.metadata);
      
      // Calcular tamanho da posição via RiskManager
      let lotSize = 0.01;
      if (this.riskManager && sltp.stopLossPips) {
        try {
          const symbolInfo = await ctraderAdapter.getSymbolInfo(symbol);
          const realMinVolume = ctraderAdapter.getRealMinVolume(symbol);
          const realMinVolumeCents = Math.round(realMinVolume * 10000000);
          
          const volumeSpecs = symbolInfo ? {
            minVolume: Math.max(symbolInfo.minVolume, realMinVolumeCents),
            maxVolume: symbolInfo.maxVolume,
            stepVolume: symbolInfo.stepVolume,
          } : {
            minVolume: realMinVolumeCents,
            maxVolume: 100000000000000,
            stepVolume: 100000,
          };
          
          const conversionRates: ConversionRates = await this.getConversionRates(symbol);
          
          const posSize = this.riskManager.calculatePositionSize(balance, sltp.stopLossPips, symbol, conversionRates, volumeSpecs);
          if (posSize.canTrade) {
            lotSize = posSize.lotSize;
          } else {
            console.warn(`[HybridEngine] ❌ Não pode operar: ${posSize.reason} correlationId=${correlationId}`);
            this.clearInFlightOrder(symbol, 'rejected');
            return;
          }
        } catch (e) {
          console.warn(`[HybridEngine] Erro ao calcular volume, usando fallback correlationId=${correlationId}:`, e);
        }
      }
      
      // ═══════════════════════════════════════════════════════════════
      // EXECUÇÃO DA ORDEM (PONTO CRÍTICO)
      // ═══════════════════════════════════════════════════════════════
      // NOTA: O lock in-flight já está setado ANTES de chegar aqui
      // Isso fecha a janela de corrida entre ciclos concorrentes
      
      console.log("═══════════════════════════════════════════════════════════════");
      console.log(`[HybridEngine] 🎯 EXECUTANDO ORDEM: ${signal.signal} (${combinedSignal.source}) correlationId=${correlationId}`);
      console.log(`[HybridEngine] Símbolo: ${symbol} | Lotes: ${lotSize}`);
      console.log(`[HybridEngine] SL: ${sltp.stopLoss?.toFixed(5)} | TP: ${sltp.takeProfit?.toFixed(5)}`);
      console.log("═══════════════════════════════════════════════════════════════");
      
      try {
        const result = await ctraderAdapter.placeOrder({
          symbol,
          direction: signal.signal as "BUY" | "SELL",
          orderType: "MARKET",
          lots: lotSize,
          stopLossPips: sltp.stopLossPips,
          takeProfitPips: sltp.takeProfitPips,
          comment: `HYBRID ${combinedSignal.source} ${signal.signal}`,
        }, this.config.maxSpread);
        
        if (result.success) {
          // ═══════════════════════════════════════════════════════════════
          // SUCESSO: Atualizar estado e limpar lock
          // ═══════════════════════════════════════════════════════════════
          this.lastTradeTime.set(symbol, now);
          this.lastTradedCandleTimestamp.set(symbol, currentCandleTimestamp);
          this.tradesExecuted++;
          
          // Atualizar in-flight com orderId antes de limpar
          this.updateInFlightOrder(symbol, { orderId: result.orderId, status: 'confirmed' });
          
          console.log(`[HybridEngine] ✅ ORDEM EXECUTADA: ${result.orderId} correlationId=${correlationId}`);
          
          // Marcar estrutura como consumida
          if (signal.metadata?.structureId) {
            this.consumedStructures.add(signal.metadata.structureId);
          }
          
          this.emit("trade", { symbol, signal, result, source: combinedSignal.source });
          
          // Limpar lock após confirmação
          this.clearInFlightOrder(symbol, 'confirmed');
          
        } else {
          // ═══════════════════════════════════════════════════════════════
          // FALHA: Verificar via Safety Latch se a ordem entrou mesmo assim
          // ═══════════════════════════════════════════════════════════════
          console.error(`[HybridEngine] ❌ ERRO: ${result.errorMessage} correlationId=${correlationId}`);
          
          if (!(result as any).safetyLatchTriggered) {
            console.log(`[HybridEngine] 🔍 SAFETY LATCH: Verificando se a ordem entrou... correlationId=${correlationId}`);
            
            try {
              await ctraderAdapter.reconcilePositions();
              const checkPositions = await ctraderAdapter.getOpenPositions();
              const symbolPosition = checkPositions.find(p => p.symbol === symbol);
              
              if (symbolPosition) {
                // A ordem ENTROU apesar do erro reportado!
                console.log(`[HybridEngine] ✅ SAFETY LATCH: Ordem encontrada! ${symbolPosition.positionId} correlationId=${correlationId}`);
                
                this.lastTradeTime.set(symbol, now);
                this.lastTradedCandleTimestamp.set(symbol, currentCandleTimestamp);
                this.tradesExecuted++;
                
                if (signal.metadata?.structureId) {
                  this.consumedStructures.add(signal.metadata.structureId);
                }
                
                this.emit("trade", { symbol, signal, result: { success: true, orderId: symbolPosition.positionId }, source: combinedSignal.source });
                this.clearInFlightOrder(symbol, 'confirmed');
                return;
              }
            } catch (reconcileError) {
              console.error(`[HybridEngine] ❌ SAFETY LATCH: Erro na verificação correlationId=${correlationId}:`, reconcileError);
            }
          }
          
          // Ordem realmente não entrou
          this.clearInFlightOrder(symbol, 'failed');
        }
        
      } catch (error) {
        // ═══════════════════════════════════════════════════════════════
        // EXCEÇÃO: Verificar via Safety Latch
        // ═══════════════════════════════════════════════════════════════
        console.error(`[HybridEngine] Erro ao executar ordem correlationId=${correlationId}:`, error);
        
        console.log(`[HybridEngine] 🔍 SAFETY LATCH (catch): Verificando... correlationId=${correlationId}`);
        
        try {
          await ctraderAdapter.reconcilePositions();
          const checkPositions = await ctraderAdapter.getOpenPositions();
          const symbolPosition = checkPositions.find(p => p.symbol === symbol);
          
          if (symbolPosition) {
            console.log(`[HybridEngine] ✅ SAFETY LATCH (catch): Ordem encontrada! ${symbolPosition.positionId} correlationId=${correlationId}`);
            
            this.lastTradeTime.set(symbol, now);
            this.lastTradedCandleTimestamp.set(symbol, currentCandleTimestamp);
            this.tradesExecuted++;
            
            if (signal.metadata?.structureId) {
              this.consumedStructures.add(signal.metadata.structureId);
            }
            
            this.emit("trade", { symbol, signal, result: { success: true, orderId: symbolPosition.positionId }, source: combinedSignal.source });
            this.clearInFlightOrder(symbol, 'confirmed');
            return;
          }
        } catch (reconcileError) {
          console.error(`[HybridEngine] ❌ SAFETY LATCH (catch): Erro correlationId=${correlationId}:`, reconcileError);
        }
        
        this.clearInFlightOrder(symbol, 'failed');
      }
      
    } catch (outerError) {
      // Garantir que o lock seja liberado em caso de erro não tratado
      console.error(`[HybridEngine] Erro não tratado em executeSignal correlationId=${correlationId}:`, outerError);
      this.clearInFlightOrder(symbol, 'failed');
    }
  }
  
  // ============= MÉTODOS DE LOGGING PARA UI =============
  
  /**
   * Grava log no banco de dados para aparecer na interface
   */
  private async logToDatabase(
    level: LogLevel,
    category: LogCategory,
    message: string,
    options?: {
      symbol?: string;
      signal?: string;
      latencyMs?: number;
      data?: Record<string, unknown>;
    }
  ): Promise<void> {
    try {
      await insertSystemLog({
        userId: this.config.userId,
        botId: this.config.botId,
        level,
        category,
        source: "HybridTradingEngine",
        message,
        symbol: options?.symbol,
        signal: options?.signal,
        latencyMs: options?.latencyMs,
        data: options?.data,
      });
    } catch (error) {
      // Não deixar erro de log quebrar o fluxo principal
      console.error("[HybridEngine] Erro ao gravar log no banco:", error);
    }
  }

  /**
   * Obtém taxas de conversão para cálculo de pip value monetário
   * 
   * CORREÇÃO CRÍTICA 2026-01-14: Refatoração completa
   * - Adicionado suporte a USDCAD, USDCHF, NZDUSD
   * - Adicionado currentPrice para pares USD_BASE
   * 
   * Necessário para converter pip value para USD em diferentes tipos de pares:
   * - Direct pairs (EURUSD, etc.) - não precisa de conversão
   * - Indirect pairs (USDJPY, USDCAD, USDCHF) - precisa da taxa do próprio par
   * - Cross pairs (EURGBP, etc.) - precisa da taxa da moeda de cotação
   * 
   * @param symbol - Símbolo atual sendo operado (opcional, usado para currentPrice)
   */
  private async getConversionRates(symbol?: string): Promise<ConversionRates> {
    const rates: ConversionRates = {};
    
    try {
      // ============= PARES ESSENCIAIS PARA CONVERSÃO =============
      
      // USDJPY - essencial para pares JPY e USDJPY
      const usdjpyPrice = await ctraderAdapter.getPrice("USDJPY");
      if (usdjpyPrice && usdjpyPrice.bid > 0) {
        rates.USDJPY = (usdjpyPrice.bid + usdjpyPrice.ask) / 2;
      }
      
      // EURUSD - para pares EUR cross
      const eurusdPrice = await ctraderAdapter.getPrice("EURUSD");
      if (eurusdPrice && eurusdPrice.bid > 0) {
        rates.EURUSD = (eurusdPrice.bid + eurusdPrice.ask) / 2;
      }
      
      // GBPUSD - para pares GBP cross
      const gbpusdPrice = await ctraderAdapter.getPrice("GBPUSD");
      if (gbpusdPrice && gbpusdPrice.bid > 0) {
        rates.GBPUSD = (gbpusdPrice.bid + gbpusdPrice.ask) / 2;
      }
      
      // AUDUSD - para pares AUD cross
      const audusdPrice = await ctraderAdapter.getPrice("AUDUSD");
      if (audusdPrice && audusdPrice.bid > 0) {
        rates.AUDUSD = (audusdPrice.bid + audusdPrice.ask) / 2;
      }
      
      // ============= CORREÇÃO 2026-01-14: PARES USD_BASE =============
      
      // USDCAD - essencial para USDCAD e pares CAD cross
      const usdcadPrice = await ctraderAdapter.getPrice("USDCAD");
      if (usdcadPrice && usdcadPrice.bid > 0) {
        rates.USDCAD = (usdcadPrice.bid + usdcadPrice.ask) / 2;
      }
      
      // USDCHF - essencial para USDCHF e pares CHF cross
      const usdchfPrice = await ctraderAdapter.getPrice("USDCHF");
      if (usdchfPrice && usdchfPrice.bid > 0) {
        rates.USDCHF = (usdchfPrice.bid + usdchfPrice.ask) / 2;
      }
      
      // NZDUSD - para pares NZD cross
      const nzdusdPrice = await ctraderAdapter.getPrice("NZDUSD");
      if (nzdusdPrice && nzdusdPrice.bid > 0) {
        rates.NZDUSD = (nzdusdPrice.bid + nzdusdPrice.ask) / 2;
      }
      
      // ============= FALLBACK: PREÇO ATUAL DO SÍMBOLO =============
      // Se um símbolo foi especificado, obter seu preço atual como fallback
      if (symbol) {
        const currentSymbolPrice = await ctraderAdapter.getPrice(symbol);
        if (currentSymbolPrice && currentSymbolPrice.bid > 0) {
          rates.currentPrice = (currentSymbolPrice.bid + currentSymbolPrice.ask) / 2;
        }
      }
      
      console.log(`[HybridEngine] Taxas de conversão obtidas: USDJPY=${rates.USDJPY?.toFixed(3)}, EURUSD=${rates.EURUSD?.toFixed(5)}, GBPUSD=${rates.GBPUSD?.toFixed(5)}, USDCAD=${rates.USDCAD?.toFixed(5)}, USDCHF=${rates.USDCHF?.toFixed(5)}`);
    } catch (error) {
      console.warn(`[HybridEngine] Erro ao obter taxas de conversão:`, error);
      // NÃO usar fallbacks estimados - melhor bloquear do que calcular errado
      // O RiskManager vai detectar pip value 0 e bloquear a operação
    }
    
    return rates;
  }

  /**
   * Log de informação geral
   */
  public async logInfo(message: string, category: LogCategory = "SYSTEM", data?: Record<string, unknown>): Promise<void> {
    console.log(`[HybridEngine] ${message}`);
    await this.logToDatabase("INFO", category, message, { data });
  }
  
  /**
   * Log de análise de sinal
   */
  public async logAnalysis(
    symbol: string,
    smcSignal: string | null,
    rsiVwapSignal: string | null,
    finalSignal: string,
    source: string,
    latencyMs?: number
  ): Promise<void> {
    // CORREÇÃO: Logs específicos por modo - não mostrar SMC quando modo RSI_VWAP_ONLY
    let message: string;
    const logPrefix = this.config.mode === HybridMode.RSI_VWAP_ONLY ? "[RsiVwapEngine]" : "[HybridEngine]";
    
    if (this.config.mode === HybridMode.RSI_VWAP_ONLY) {
      // Modo RSI_VWAP_ONLY: mostrar apenas RSI+VWAP
      message = `📊 ANÁLISE | ${symbol} | RSI+VWAP: ${rsiVwapSignal || 'NONE'} | Final: ${finalSignal} (${source})`;
    } else if (this.config.mode === HybridMode.ORB_ONLY) {
      // Modo ORB_ONLY: mostrar apenas ORB
      message = `📊 ANÁLISE | ${symbol} | ORB: ${finalSignal} (${source})`;
    } else if (this.config.mode === HybridMode.SMC_ONLY) {
      // Modo SMC_ONLY: mostrar apenas SMC
      message = `📊 ANÁLISE | ${symbol} | SMC: ${smcSignal || 'NONE'} | Final: ${finalSignal} (${source})`;
    } else {
      // Modo HYBRID: mostrar ambos
      message = `📊 ANÁLISE | ${symbol} | SMC: ${smcSignal || 'NONE'} | RSI+VWAP: ${rsiVwapSignal || 'NONE'} | Final: ${finalSignal} (${source})`;
    }
    
    console.log(`${logPrefix} ${message}`);
    await this.logToDatabase("INFO", "ANALYSIS", message, {
      symbol,
      signal: finalSignal,
      latencyMs,
      data: { smcSignal, rsiVwapSignal, source }
    });
  }
  
  /**
   * Log de conflito entre estratégias
   */
  public async logConflict(symbol: string, reason: string): Promise<void> {
    const message = `⚠️ CONFLITO | ${symbol} | ${reason}`;
    console.log(`[HybridEngine] ${message}`);
    await this.logToDatabase("WARN", "SIGNAL", message, {
      symbol,
      data: { reason }
    });
  }
  
  /**
   * Log de entrada em posição
   */
  public async logEntry(
    symbol: string,
    direction: string,
    price: number,
    lots: number,
    stopLoss: number,
    takeProfit: number,
    source: string
  ): Promise<void> {
    const message = `✅ ENTRADA | ${symbol} | ${direction} @ ${price.toFixed(5)} | Lotes: ${lots} | SL: ${stopLoss.toFixed(5)} | TP: ${takeProfit.toFixed(5)} | Fonte: ${source}`;
    console.log(`[HybridEngine] ${message}`);
    await this.logToDatabase("INFO", "ENTRY", message, {
      symbol,
      signal: direction,
      data: { price, lots, stopLoss, takeProfit, source }
    });
  }
  
  /**
   * Log de rejeição de sinal
   */
  public async logRejection(symbol: string, reason: string, data?: Record<string, unknown>): Promise<void> {
    const message = `❌ REJEITADO | ${symbol} | ${reason}`;
    console.log(`[HybridEngine] ${message}`);
    await this.logToDatabase("INFO", "SIGNAL", message, {
      symbol,
      data: { reason, ...data }
    });
  }
  
  /**
   * Log de erro
   */
  public async logError(message: string, error?: unknown): Promise<void> {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const fullMessage = `❌ ERRO | ${message} | ${errorMsg}`;
    console.error(`[HybridEngine] ${fullMessage}`);
    await this.logToDatabase("ERROR", "SYSTEM", fullMessage, {
      data: { error: errorMsg }
    });
  }
}

// ============= FACTORY =============

export function createHybridEngine(userId: number, botId: number, config?: Partial<HybridEngineConfig>): HybridTradingEngine {
  return new HybridTradingEngine(userId, botId, config);
}

// ============= GERENCIADOR DE INSTÂNCIAS =============

const activeHybridEngines = new Map<string, HybridTradingEngine>();

function getHybridEngineKey(userId: number, botId: number): string {
  return `hybrid-${userId}-${botId}`;
}

/**
 * Obtém ou cria uma instância do HybridTradingEngine
 */
export function getHybridTradingEngine(userId: number, botId: number = 1, mode?: HybridMode): HybridTradingEngine {
  const key = getHybridEngineKey(userId, botId);
  if (!activeHybridEngines.has(key)) {
    console.log(`[HybridEngineManager] Criando nova instância para usuário ${userId}, bot ${botId}`);
    activeHybridEngines.set(key, new HybridTradingEngine(userId, botId, mode ? { mode } : undefined));
  }
  const engine = activeHybridEngines.get(key)!;
  
  // Atualizar modo se fornecido
  if (mode && engine.getStatus().mode !== mode) {
    engine.setMode(mode);
  }
  
  return engine;
}

/**
 * Remove uma instância do HybridTradingEngine
 */
export async function removeHybridTradingEngine(userId: number, botId: number = 1): Promise<void> {
  const key = getHybridEngineKey(userId, botId);
  const engine = activeHybridEngines.get(key);
  if (engine) {
    if (engine.isRunning) {
      await engine.stop();
    }
    activeHybridEngines.delete(key);
    console.log(`[HybridEngineManager] Instância removida para usuário ${userId}, bot ${botId}`);
  }
}

/**
 * Obtém status de todos os engines híbridos ativos
 */
export function getAllHybridEnginesStatus(): Array<{ userId: number; botId: number; status: ReturnType<HybridTradingEngine["getStatus"]> }> {
  const statuses: Array<{ userId: number; botId: number; status: ReturnType<HybridTradingEngine["getStatus"]> }> = [];
  
  activeHybridEngines.forEach((engine, key) => {
    const [, userIdStr, botIdStr] = key.split("-");
    statuses.push({
      userId: parseInt(userIdStr),
      botId: parseInt(botIdStr),
      status: engine.getStatus(),
    });
  });
  
  return statuses;
}
