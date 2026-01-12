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
import { getPipValue as getCentralizedPipValue, calculateSpreadPips } from "../../../shared/normalizationUtils";

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
   */
  private async loadConfigFromDB(): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      
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
        // Atualizar símbolos
        try {
          const symbols = JSON.parse(smcConfig[0].activeSymbols || "[]");
          if (Array.isArray(symbols) && symbols.length > 0) {
            this.config.symbols = symbols;
          }
        } catch (e) {
          console.warn("[HybridEngine] Erro ao parsear activeSymbols:", e);
        }
        
        // Atualizar max positions
        if (smcConfig[0].maxOpenTrades) {
          this.config.maxPositions = smcConfig[0].maxOpenTrades;
        }
      }
      
      console.log("[HybridEngine] Configurações carregadas do banco");
      
    } catch (error) {
      console.error("[HybridEngine] Erro ao carregar config:", error);
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
   * Carrega dados históricos de forma PARALELA para acelerar inicialização
   * Usa batches de 3 símbolos para não sobrecarregar a API
   */
  private async loadHistoricalData(): Promise<void> {
    const startTime = Date.now();
    console.log("[HybridEngine] 🚀 Carregando dados históricos (modo PARALELO)...");
    await this.logInfo("🚀 Iniciando carregamento de dados históricos (modo paralelo)", "SYSTEM");
    
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const BATCH_SIZE = 3; // Processar 3 símbolos em paralelo
    const DELAY_BETWEEN_BATCHES = 500; // 500ms entre batches
    
    // Dividir símbolos em batches
    const batches: string[][] = [];
    for (let i = 0; i < this.config.symbols.length; i += BATCH_SIZE) {
      batches.push(this.config.symbols.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`[HybridEngine] Processando ${this.config.symbols.length} símbolos em ${batches.length} batches`);
    
    // Processar cada batch em paralelo
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`[HybridEngine] Batch ${batchIndex + 1}/${batches.length}: ${batch.join(", ")}`);
      
      // Carregar todos os símbolos do batch em paralelo
      const batchPromises = batch.map(async (symbol) => {
        try {
          // Carregar os 3 timeframes em paralelo para cada símbolo
          const [h1Candles, m15Candles, m5Candles] = await Promise.all([
            ctraderAdapter.getCandleHistory(symbol, "H1", 250),
            ctraderAdapter.getCandleHistory(symbol, "M15", 250),
            ctraderAdapter.getCandleHistory(symbol, "M5", 250),
          ]);
          
          this.timeframeData.h1.set(symbol, h1Candles);
          this.timeframeData.m15.set(symbol, m15Candles);
          this.timeframeData.m5.set(symbol, m5Candles);
          
          console.log(`[HybridEngine] ✅ ${symbol}: H1=${h1Candles.length}, M15=${m15Candles.length}, M5=${m5Candles.length}`);
          return { symbol, success: true };
        } catch (error) {
          console.error(`[HybridEngine] ❌ Erro ao carregar ${symbol}:`, error);
          return { symbol, success: false, error };
        }
      });
      
      // Aguardar todas as promessas do batch
      await Promise.all(batchPromises);
      
      // Delay entre batches para não sobrecarregar a API
      if (batchIndex < batches.length - 1) {
        await sleep(DELAY_BETWEEN_BATCHES);
      }
    }
    
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const successMsg = `✅ Dados históricos carregados em ${elapsedTime}s (${this.config.symbols.length} símbolos)`;
    console.log(`[HybridEngine] ${successMsg}`);
    await this.logInfo(successMsg, "SYSTEM");
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
   */
  private async performAnalysis(): Promise<void> {
    if (!this._isRunning) return;
    
    this.analysisCount++;
    
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
    
    // Analisar cada símbolo
    for (const symbol of this.config.symbols) {
      try {
        await this.analyzeSymbol(symbol);
      } catch (error) {
        console.error(`[HybridEngine] Erro ao analisar ${symbol}:`, error);
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
   */
  private async analyzeSymbol(symbol: string): Promise<void> {
    const h1Data = this.timeframeData.h1.get(symbol) || [];
    const m15Data = this.timeframeData.m15.get(symbol) || [];
    const m5Data = this.timeframeData.m5.get(symbol) || [];
    
    if (h1Data.length < 50 || m15Data.length < 30 || m5Data.length < 20) {
      return;
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
   */
  private async executeSignal(symbol: string, combinedSignal: CombinedSignal): Promise<void> {
    const now = Date.now();
    
    // Verificar cooldown
    const lastTrade = this.lastTradeTime.get(symbol) || 0;
    if (now - lastTrade < this.config.cooldownMs) {
      return;
    }
    
    // Verificar Risk Manager
    if (this.riskManager) {
      const canOpen = await this.riskManager.canOpenPosition();
      if (!canOpen.allowed) {
        console.log(`[HybridEngine] ⚠️ ${canOpen.reason}`);
        return;
      }
    }
    
    // Verificar posições abertas no símbolo
    const openPositions = await ctraderAdapter.getOpenPositions();
    const symbolPositions = openPositions.filter(p => p.symbol === symbol);
    
    if (symbolPositions.length >= this.config.maxTradesPerSymbol) {
      console.log(`[HybridEngine] ⚠️ Já existe posição em ${symbol}`);
      return;
    }
    
    // Verificar limite total de posições
    if (openPositions.length >= this.config.maxPositions) {
      console.log(`[HybridEngine] ⚠️ Limite de ${this.config.maxPositions} posições atingido`);
      return;
    }
    
    const signal = combinedSignal.finalSignal!;
    const strategy = combinedSignal.source === "SMC" ? this.smcStrategy : this.rsiVwapStrategy;
    
    if (!strategy) return;
    
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
      return;
    }
    
    if (currentPrice <= 0) return;
    
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
        
        const posSize = this.riskManager.calculatePositionSize(balance, sltp.stopLossPips, pipValue, volumeSpecs);
        if (posSize.canTrade) {
          lotSize = posSize.lotSize;
        } else {
          console.warn(`[HybridEngine] ❌ Não pode operar: ${posSize.reason}`);
          return;
        }
      } catch (e) {
        console.warn(`[HybridEngine] Erro ao calcular volume, usando fallback`);
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
        this.tradesExecuted++;
        console.log(`[HybridEngine] ✅ ORDEM EXECUTADA: ${result.orderId}`);
        
        this.emit("trade", { symbol, signal, result, source: combinedSignal.source });
      } else {
        console.error(`[HybridEngine] ❌ ERRO: ${result.errorMessage}`);
      }
    } catch (error) {
      console.error("[HybridEngine] Erro ao executar ordem:", error);
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
    await this.logToDatabase("WARNING", "SIGNAL", message, {
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
