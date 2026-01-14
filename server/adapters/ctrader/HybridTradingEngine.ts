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
 */

import { EventEmitter } from "events";
import { ctraderAdapter } from "../CTraderAdapter";
import { TradeSide } from "./CTraderClient";
import { ITradingStrategy, IMultiTimeframeStrategy, StrategyType, SignalResult, MultiTimeframeData } from "./ITradingStrategy";
import { strategyFactory } from "./StrategyFactory";
import { SMCStrategy, SMCStrategyConfig } from "./SMCStrategy";
import { RsiVwapStrategy, RsiVwapStrategyConfig } from "./RsiVwapStrategy";
import { RiskManager, createRiskManager, RiskManagerConfig, DEFAULT_RISK_CONFIG } from "./RiskManager";
import { getDb, insertSystemLog, type LogLevel, type LogCategory } from "../../db";
import { smcStrategyConfig, icmarketsConfig, rsiVwapConfig } from "../../../drizzle/schema";
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
  finalSignal: SignalResult | null;
  source: "SMC" | "RSI_VWAP" | "NONE";
  conflictDetected: boolean;
  conflictReason?: string;
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
  
  // Risk Manager
  private riskManager: RiskManager | null = null;
  
  // Estado
  private _isRunning: boolean = false;
  private lastTradeTime: Map<string, number> = new Map();
  private analysisCount: number = 0;
  private tradesExecuted: number = 0;
  private startTime: number | null = null;
  
  // ============= CONTROLE DE CONCORRÊNCIA PER-SYMBOL =============
  /**
   * Map que controla se um símbolo está em processo de execução de ordem.
   * Previne Race Condition onde múltiplas ordens são enviadas para o mesmo ativo
   * antes da confirmação da API.
   * 
   * IMPORTANTE: Este lock é POR ATIVO, não global.
   * Se EURUSD está travado, GBPUSD continua livre para operar.
   */
  private isExecutingOrder: Map<string, boolean> = new Map();
  
  /**
   * CORREÇÃO v3.0: Watchdog de Deadlock
   * Map que armazena o timestamp de quando cada símbolo foi travado.
   * Usado para detectar e liberar locks que ficaram presos por mais de 15 segundos.
   */
  private lockTimestamps: Map<string, number> = new Map();
  
  // ============= CORREÇÃO v4.0: SISTEMA DE CONTROLE DE MÚLTIPLOS TRADES =============
  
  /**
   * CORREÇÃO v4.0: Posições Pendentes (Phantom Positions)
   * Map que armazena posições que foram enviadas à API mas ainda não confirmadas.
   * Isso previne race conditions onde múltiplas ordens são enviadas antes da confirmação.
   * 
   * Chave: symbol
   * Valor: timestamp de quando a ordem foi enviada
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
   * Após este tempo (em ms), uma posição pendente é considerada expirada.
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
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[HybridEngine] 🚀 INICIANDO MOTOR HÍBRIDO");
    console.log(`[HybridEngine] Modo: ${this.config.mode}`);
    console.log(`[HybridEngine] Símbolos: ${this.config.symbols.join(", ")}`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    try {
      // CORREÇÃO 2026-01-13: Configurar contexto do usuário no CTraderAdapter
      // Isso permite que o handleExecutionEvent persista posições no banco de dados
      ctraderAdapter.setUserContext(this.config.userId, this.config.botId);
      console.log("[HybridEngine] ✅ Contexto de usuário configurado no CTraderAdapter");
      
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
      
      // Carregar dados históricos
      await this.loadHistoricalData();
      
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
      
      console.log("[HybridEngine] ✅ Motor híbrido iniciado com sucesso!");
      
      // Log para UI
      await this.logInfo(
        `🚀 ROBÔ HÍBRIDO INICIADO | Modo: ${this.config.mode} | Símbolos: ${this.config.symbols.join(", ")}`,
        "SYSTEM",
        { mode: this.config.mode, symbols: this.config.symbols, maxPositions: this.config.maxPositions }
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
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[HybridEngine] 🛑 PARANDO MOTOR HÍBRIDO");
    console.log(`[HybridEngine] Análises: ${this.analysisCount} | Trades: ${this.tradesExecuted}`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    this._isRunning = false;
    
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
    
    if (this.dataRefreshInterval) {
      clearInterval(this.dataRefreshInterval);
      this.dataRefreshInterval = null;
    }
    
    await this.unsubscribeFromAllPrices();
    
    this.startTime = null;
    this.emit("stopped");
    
    console.log("[HybridEngine] ✅ Motor híbrido parado!");
  }
  
  /**
   * Obtém status atual
   */
  getStatus() {
    return {
      isRunning: this._isRunning,
      mode: this.config.mode,
      activeSymbols: this.config.symbols,
      currentSymbol: this.currentSymbol,
      lastTickPrice: this.lastTickPrice,
      lastTickTime: this.lastTickTime,
      lastSignal: this.lastSignal,
      lastSignalTime: this.lastSignalTime,
      analysisCount: this.analysisCount,
      tradesExecuted: this.tradesExecuted,
      startTime: this.startTime,
      tickCount: this.tickCount,
      strategies: {
        smc: this.smcStrategy !== null,
        rsiVwap: this.rsiVwapStrategy !== null,
      },
    };
  }
  
  /**
   * Altera o modo de operação
   */
  setMode(mode: HybridMode): void {
    this.config.mode = mode;
    console.log(`[HybridEngine] Modo alterado para: ${mode}`);
  }
  
  // ============= MÉTODOS PRIVADOS =============
  
  /**
   * Carrega configurações do banco de dados
   * 
   * CORREÇÃO CRÍTICA: Adicionado logs detalhados para debug
   */
  private async loadConfigFromDB(): Promise<void> {
    try {
      const db = await getDb();
      if (!db) {
        console.warn("[HybridEngine] ⚠️ Banco de dados não disponível, usando configurações padrão");
        return;
      }
      
      console.log(`[HybridEngine] [Config] Carregando config para userId=${this.config.userId}, botId=${this.config.botId}`);
      
      // Carregar configuração SMC
      const smcConfig = await db
        .select()
        .from(smcStrategyConfig)
        .where(
          and(
            eq(smcStrategyConfig.userId, this.config.userId),
            eq(smcStrategyConfig.botId, this.config.botId)
          )
        )
        .limit(1);
      
      if (smcConfig[0]) {
        console.log(`[HybridEngine] [Config] DEBUG - activeSymbols bruto: "${smcConfig[0].activeSymbols}"`);
        
        // Atualizar símbolos
        try {
          const symbols = JSON.parse(smcConfig[0].activeSymbols || "[]");
          console.log(`[HybridEngine] [Config] DEBUG - symbols parseados: ${JSON.stringify(symbols)}`);
          console.log(`[HybridEngine] [Config] DEBUG - é Array: ${Array.isArray(symbols)}, length: ${symbols.length}`);
          
          if (Array.isArray(symbols) && symbols.length > 0) {
            const oldSymbols = [...this.config.symbols];
            this.config.symbols = symbols;
            console.log(`[HybridEngine] [Config] ✅ Símbolos atualizados: ${oldSymbols.join(',')} → ${symbols.join(',')}`);
          } else {
            console.warn(`[HybridEngine] [Config] ⚠️ Símbolos inválidos ou vazios, mantendo: ${this.config.symbols.join(',')}`);
          }
        } catch (e) {
          console.error("[HybridEngine] ❌ Erro ao parsear activeSymbols:", e);
          console.error(`[HybridEngine] ❌ Valor que causou erro: "${smcConfig[0].activeSymbols}"`);
        }
        
        // Atualizar max positions
        if (smcConfig[0].maxOpenTrades) {
          this.config.maxPositions = smcConfig[0].maxOpenTrades;
        }
      } else {
        console.warn(`[HybridEngine] [Config] ⚠️ Nenhuma configuração SMC encontrada para userId=${this.config.userId}, botId=${this.config.botId}`);
      }
      
      console.log(`[HybridEngine] ✅ Configurações carregadas: ${this.config.symbols.length} símbolos | maxPositions=${this.config.maxPositions}`);
      
    } catch (error) {
      console.error("[HybridEngine] ❌ Erro ao carregar config:", error);
    }
  }
  
  /**
   * Inicializa as estratégias baseado no modo
   */
  private async initializeStrategies(): Promise<void> {
    const db = await getDb();
    let smcConfig: any = null;
    
    if (db) {
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
    
    // Inicializar SMC se necessário
    if (this.config.mode === HybridMode.SMC_ONLY || this.config.mode === HybridMode.HYBRID) {
      this.smcStrategy = strategyFactory.createStrategy(StrategyType.SMC_SWARM, smcConfig);
      console.log("[HybridEngine] Estratégia SMC inicializada");
    }
    
    // Inicializar RSI+VWAP se necessário
    if (this.config.mode === HybridMode.RSI_VWAP_ONLY || this.config.mode === HybridMode.HYBRID) {
      // CORREÇÃO CRÍTICA: Carregar configurações RSI+VWAP do banco de dados
      let rsiConfig: any = null;
      if (db) {
        const result = await db
          .select()
          .from(rsiVwapConfig)
          .where(
            and(
              eq(rsiVwapConfig.userId, this.config.userId),
              eq(rsiVwapConfig.botId, this.config.botId)
            )
          )
          .limit(1);
        rsiConfig = result[0];
        
        if (rsiConfig) {
          console.log("[HybridEngine] Configurações RSI+VWAP carregadas do banco de dados");
        } else {
          console.log("[HybridEngine] Nenhuma configuração RSI+VWAP encontrada, usando defaults");
        }
      }
      
      // Criar estratégia com configurações do banco ou defaults
      this.rsiVwapStrategy = strategyFactory.createStrategy(StrategyType.RSI_VWAP_REVERSAL, rsiConfig);
      console.log("[HybridEngine] Estratégia RSI+VWAP inicializada com configurações do DB");
    }
    
    console.log(`[HybridEngine] Estratégias ativas: SMC=${!!this.smcStrategy}, RSI+VWAP=${!!this.rsiVwapStrategy}`);
  }
  
  /**
   * Inicializa o Risk Manager
   */
  private async initializeRiskManager(): Promise<void> {
    const db = await getDb();
    let smcConfig: any = null;
    
    if (db) {
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
   * Carrega dados históricos de forma SEQUENCIAL para evitar Rate Limit
   * 
   * CORREÇÃO 2026-01-13: Mudança de paralelo para sequencial
   * - Delay de 1.5s entre cada requisição de timeframe
   * - Delay de 2s entre cada símbolo
   * - Retry específico para Rate Limit (erro 429) com espera de 5s
   * - Até 3 tentativas por símbolo antes de descartar
   */
  private async loadHistoricalData(): Promise<void> {
    const startTime = Date.now();
    console.log("[HybridEngine] 🚀 Carregando dados históricos (modo SEQUENCIAL - Anti Rate Limit)...");
    console.log(`[HybridEngine] Símbolos a carregar: ${this.config.symbols.join(', ')}`);
    await this.logInfo(`🚀 Iniciando carregamento SEQUENCIAL para ${this.config.symbols.length} ativos`, "SYSTEM");
    
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const DELAY_BETWEEN_REQUESTS = 1500; // 1.5s entre cada requisição de timeframe
    const DELAY_BETWEEN_SYMBOLS = 2000;  // 2s entre cada símbolo
    const RATE_LIMIT_RETRY_DELAY = 5000; // 5s de espera se receber Rate Limit
    const MAX_RETRIES = 3;
    
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
      
      console.log(`[HybridEngine] [${i + 1}/${this.config.symbols.length}] Baixando ${symbol}...`);
      
      // Retry loop para cada símbolo
      for (let attempt = 1; attempt <= MAX_RETRIES && !symbolSuccess; attempt++) {
        try {
          if (attempt > 1) {
            console.log(`[HybridEngine] 🔄 ${symbol}: Tentativa ${attempt}/${MAX_RETRIES}...`);
          }
          
          // Carregar H1
          const h1Candles = await ctraderAdapter.getCandleHistory(symbol, "H1", 250);
          this.timeframeData.h1.set(symbol, h1Candles);
          console.log(`[HybridEngine] ${symbol} H1: ${h1Candles.length} candles`);
          await sleep(DELAY_BETWEEN_REQUESTS);
          
          // Carregar M15
          const m15Candles = await ctraderAdapter.getCandleHistory(symbol, "M15", 250);
          this.timeframeData.m15.set(symbol, m15Candles);
          console.log(`[HybridEngine] ${symbol} M15: ${m15Candles.length} candles`);
          await sleep(DELAY_BETWEEN_REQUESTS);
          
          // Carregar M5
          const m5Candles = await ctraderAdapter.getCandleHistory(symbol, "M5", 250);
          this.timeframeData.m5.set(symbol, m5Candles);
          console.log(`[HybridEngine] ${symbol} M5: ${m5Candles.length} candles`);
          
          // Verificar se os dados são suficientes
          const isValid = h1Candles.length >= 50 && m15Candles.length >= 30 && m5Candles.length >= 20;
          
          if (isValid) {
            console.log(`[HybridEngine] ✅ ${symbol}: Carregado com sucesso!`);
            successSymbols.push(symbol);
            symbolSuccess = true;
          } else {
            console.warn(`[HybridEngine] ⚠️ ${symbol}: Dados insuficientes - H1=${h1Candles.length}/50, M15=${m15Candles.length}/30, M5=${m5Candles.length}/20`);
            if (attempt === MAX_RETRIES) {
              // Na última tentativa, aceitar dados parciais
              successSymbols.push(symbol);
              symbolSuccess = true;
              console.warn(`[HybridEngine] ⚠️ ${symbol}: Aceitando dados parciais`);
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
   */
  private async performAnalysis(): Promise<void> {
    if (!this._isRunning) return;
    
    this.analysisCount++;
    
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
    
    // CORREÇÃO CRÍTICA: Logar quando símbolo é ignorado por falta de dados
    if (h1Data.length < 50 || m15Data.length < 30 || m5Data.length < 20) {
      // Log apenas a cada 100 análises para não poluir
      if (this.analysisCount % 100 === 1) {
        console.log(`[HybridEngine] ⚠️ ${symbol}: Dados insuficientes - H1=${h1Data.length}/50 M15=${m15Data.length}/30 M5=${m5Data.length}/20`);
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
    
    // Aplicar lógica de priorização
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
   * CORREÇÃO CRÍTICA v4.0 (2026-01-14):
   * - Implementado controle de concorrência PER-SYMBOL (v3.0)
   * - Adicionado WATCHDOG de 15 segundos para liberar locks travados
   * - NOVO: Verificação em tempo real via API (reconcilePositions)
   * - NOVO: Sistema de Posições Pendentes (Phantom Positions)
   * - NOVO: Filtro de Candle (impede múltiplas ordens no mesmo candle M5)
   * - NOVO: Signal Consumption (marca estruturas já utilizadas)
   * 
   * LÓGICA DE PROTEÇÃO (5 CAMADAS):
   * 1. Mutex per-symbol com watchdog
   * 2. Cooldown por símbolo
   * 3. Verificação de posição pendente (phantom position)
   * 4. Filtro de candle M5 (impede múltiplas ordens no mesmo candle)
   * 5. Verificação em tempo real via API + cache local
   */
  private async executeSignal(symbol: string, combinedSignal: CombinedSignal): Promise<void> {
    const now = Date.now();
    
    // ═══════════════════════════════════════════════════════════════
    // CAMADA 1: CONTROLE DE CONCORRÊNCIA PER-SYMBOL (MUTEX) + WATCHDOG
    // ═══════════════════════════════════════════════════════════════
    
    if (this.isExecutingOrder.get(symbol)) {
      const lockTime = this.lockTimestamps.get(symbol) || 0;
      const lockDuration = now - lockTime;
      
      if (lockDuration > 15000) {
        console.warn(`[HybridEngine] ⚠️ WATCHDOG: ${symbol} travado há ${Math.floor(lockDuration/1000)}s - FORÇANDO DESTRAVAMENTO`);
        this.isExecutingOrder.set(symbol, false);
        this.lockTimestamps.delete(symbol);
      } else {
        console.log(`[HybridEngine] 🔒 ${symbol}: IGNORADO - Ordem em processamento (mutex ativo há ${Math.floor(lockDuration/1000)}s)`);
        return;
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // CAMADA 2: COOLDOWN POR SÍMBOLO
    // ═══════════════════════════════════════════════════════════════
    const lastTrade = this.lastTradeTime.get(symbol) || 0;
    if (now - lastTrade < this.config.cooldownMs) {
      console.log(`[HybridEngine] ⏳ ${symbol}: IGNORADO - Cooldown ativo (${Math.floor((this.config.cooldownMs - (now - lastTrade))/1000)}s restantes)`);
      return;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // CAMADA 3: VERIFICAÇÃO DE POSIÇÃO PENDENTE (PHANTOM POSITION)
    // ═══════════════════════════════════════════════════════════════
    const pendingTime = this.pendingPositions.get(symbol);
    if (pendingTime) {
      const pendingDuration = now - pendingTime;
      if (pendingDuration < this.PENDING_POSITION_TIMEOUT_MS) {
        console.log(`[HybridEngine] 👻 ${symbol}: IGNORADO - Posição PENDENTE aguardando confirmação (${Math.floor(pendingDuration/1000)}s)`);
        return;
      } else {
        // Timeout expirado, limpar posição pendente
        console.warn(`[HybridEngine] ⚠️ ${symbol}: Posição pendente expirada após ${Math.floor(pendingDuration/1000)}s - limpando`);
        this.pendingPositions.delete(symbol);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // CAMADA 4: FILTRO DE CANDLE M5 (IMPEDE MÚLTIPLAS ORDENS NO MESMO CANDLE)
    // ═══════════════════════════════════════════════════════════════
    const M5_MS = 5 * 60 * 1000; // 5 minutos em milissegundos
    const currentCandleTimestamp = Math.floor(now / M5_MS) * M5_MS;
    const lastTradedCandle = this.lastTradedCandleTimestamp.get(symbol) || 0;
    
    if (currentCandleTimestamp === lastTradedCandle) {
      console.log(`[HybridEngine] 🕯️ ${symbol}: IGNORADO - Já operou neste candle M5 (${new Date(currentCandleTimestamp).toISOString()})`);
      return;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // TRAVAR O SÍMBOLO ANTES DE QUALQUER OPERAÇÃO ASSÍNCRONA
    // ═══════════════════════════════════════════════════════════════
    this.isExecutingOrder.set(symbol, true);
    this.lockTimestamps.set(symbol, now);
    console.log(`[HybridEngine] 🔐 ${symbol}: TRAVADO para execução`);
    
    try {
      // Verificar Risk Manager
      if (this.riskManager) {
        const canOpen = await this.riskManager.canOpenPosition();
        if (!canOpen.allowed) {
          console.log(`[HybridEngine] ⚠️ ${canOpen.reason}`);
          return;
        }
      }
      
      // ═══════════════════════════════════════════════════════════════
      // CAMADA 5: VERIFICAÇÃO EM TEMPO REAL VIA API + CACHE LOCAL
      // CORREÇÃO CRÍTICA v4.0: Sincronizar com a API antes de verificar
      // ═══════════════════════════════════════════════════════════════
      
      // 5a. Primeiro, sincronizar posições com a API (reconcile)
      try {
        await ctraderAdapter.reconcilePositions();
        console.log(`[HybridEngine] 🔄 ${symbol}: Posições sincronizadas com a API`);
      } catch (reconcileError) {
        console.warn(`[HybridEngine] ⚠️ ${symbol}: Erro ao sincronizar posições, usando cache local:`, reconcileError);
      }
      
      // 5b. Agora verificar posições abertas (cache atualizado)
      const openPositions = await ctraderAdapter.getOpenPositions();
      const symbolPositions = openPositions.filter(p => p.symbol === symbol);
      
      // 5c. Contar também posições pendentes de outros símbolos
      const pendingCount = Array.from(this.pendingPositions.entries())
        .filter(([_, timestamp]) => (now - timestamp) < this.PENDING_POSITION_TIMEOUT_MS)
        .length;
      
      const totalPositions = openPositions.length + pendingCount;
      
      console.log(`[HybridEngine] 📊 ${symbol}: Posições abertas=${openPositions.length}, Pendentes=${pendingCount}, Total=${totalPositions}`);
      console.log(`[HybridEngine] 📊 ${symbol}: Posições neste ativo=${symbolPositions.length}, Limite=${this.config.maxTradesPerSymbol}`);
      
      if (symbolPositions.length >= this.config.maxTradesPerSymbol) {
        console.log(`[HybridEngine] ⚠️ ${symbol}: BLOQUEADO - Já existe ${symbolPositions.length} posição(ões) neste ativo (limite: ${this.config.maxTradesPerSymbol})`);
        return;
      }
      
      // Verificar limite total de posições (incluindo pendentes)
      if (totalPositions >= this.config.maxPositions) {
        console.log(`[HybridEngine] ⚠️ Limite de ${this.config.maxPositions} posições atingido (atual: ${totalPositions})`);
        return;
      }
      
      const signal = combinedSignal.finalSignal!;
      const strategy = combinedSignal.source === "SMC" ? this.smcStrategy : this.rsiVwapStrategy;
      
      if (!strategy) return;
      
      // ═══════════════════════════════════════════════════════════════
      // MARCAR POSIÇÃO COMO PENDENTE ANTES DE ENVIAR À API
      // Isso bloqueia novas ordens para este símbolo imediatamente
      // ═══════════════════════════════════════════════════════════════
      this.pendingPositions.set(symbol, now);
      console.log(`[HybridEngine] 👻 ${symbol}: Posição marcada como PENDENTE`);
      
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
        console.error(`[HybridEngine] Erro ao obter preço para ${symbol}`);
        this.pendingPositions.delete(symbol); // Limpar posição pendente em caso de erro
        return;
      }
      
      if (currentPrice <= 0) {
        this.pendingPositions.delete(symbol);
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
            console.warn(`[HybridEngine] ❌ Não pode operar: ${posSize.reason}`);
            this.pendingPositions.delete(symbol);
            return;
          }
        } catch (e) {
          console.warn(`[HybridEngine] Erro ao calcular volume, usando fallback:`, e);
        }
      }
      
      // Executar ordem via pipeline existente
      console.log("═══════════════════════════════════════════════════════════════");
      console.log(`[HybridEngine] 🎯 EXECUTANDO ORDEM: ${signal.signal} (${combinedSignal.source})`);
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
          this.lastTradeTime.set(symbol, now);
          this.lastTradedCandleTimestamp.set(symbol, currentCandleTimestamp); // Marcar candle como operado
          this.tradesExecuted++;
          console.log(`[HybridEngine] ✅ ORDEM EXECUTADA: ${result.orderId}`);
          
          // Marcar estrutura como consumida (Signal Consumption)
          if (signal.metadata?.structureId) {
            this.consumedStructures.add(signal.metadata.structureId);
            console.log(`[HybridEngine] 🏷️ Estrutura consumida: ${signal.metadata.structureId}`);
          }
          
          this.emit("trade", { symbol, signal, result, source: combinedSignal.source });
          
          // Limpar posição pendente após sucesso (a posição real já está no cache)
          this.pendingPositions.delete(symbol);
        } else {
          console.error(`[HybridEngine] ❌ ERRO: ${result.errorMessage}`);
          // Limpar posição pendente em caso de erro
          this.pendingPositions.delete(symbol);
        }
      } catch (error) {
        console.error("[HybridEngine] Erro ao executar ordem:", error);
        this.pendingPositions.delete(symbol);
      }
    } finally {
      // ═══════════════════════════════════════════════════════════════
      // DESTRAVAR O SÍMBOLO (SEMPRE, mesmo com erro ou return antecipado)
      // ═══════════════════════════════════════════════════════════════
      this.isExecutingOrder.set(symbol, false);
      this.lockTimestamps.delete(symbol);
      console.log(`[HybridEngine] 🔓 ${symbol}: DESTRAVADO`);
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
    const message = `📊 ANÁLISE | ${symbol} | SMC: ${smcSignal || 'N/A'} | RSI+VWAP: ${rsiVwapSignal || 'N/A'} | Final: ${finalSignal} (${source})`;
    console.log(`[HybridEngine] ${message}`);
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
