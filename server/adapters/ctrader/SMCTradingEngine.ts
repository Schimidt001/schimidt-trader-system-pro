/**
 * SMC Trading Engine - Motor de Execução Multi-Estratégia
 * 
 * Versão aprimorada do TradingEngine que suporta:
 * - Strategy Pattern para múltiplas estratégias (SMC, TrendSniper)
 * - Análise Multi-Timeframe (H1, M15, M5)
 * - Gestão de Risco Dinâmica
 * - Circuit Breakers
 * - Modo Swarm (múltiplos ativos simultâneos)
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 */

import { EventEmitter } from "events";
import { ctraderAdapter } from "../CTraderAdapter";
import { TrendbarPeriod, TradeSide } from "./CTraderClient";
import { ITradingStrategy, IMultiTimeframeStrategy, StrategyType, SignalResult, MultiTimeframeData } from "./ITradingStrategy";
import { strategyFactory } from "./StrategyFactory";
import { SMCStrategy, SMCStrategyConfig } from "./SMCStrategy";
import { RiskManager, createRiskManager, RiskManagerConfig, DEFAULT_RISK_CONFIG } from "./RiskManager";
import { getDb } from "../../db";
import { smcStrategyConfig, icmarketsConfig } from "../../../drizzle/schema";
import { eq, and } from "drizzle-orm";

// ============= TIPOS E INTERFACES =============

/**
 * Configuração do SMC Trading Engine
 */
export interface SMCTradingEngineConfig {
  userId: number;
  botId: number;
  strategyType: StrategyType;
  symbols: string[];
  lots: number;
  maxPositions: number;
  cooldownMs: number;
}

/**
 * Status do bot SMC
 */
export interface SMCBotStatus {
  isRunning: boolean;
  strategyType: StrategyType;
  activeSymbols: string[];
  currentSymbol: string | null;
  lastTickPrice: number | null;
  lastTickTime: number | null;
  lastSignal: string | null;
  lastSignalTime: number | null;
  lastAnalysisTime: number | null;
  analysisCount: number;
  tradesExecuted: number;
  startTime: number | null;
  tickCount: number;
  riskState: {
    dailyPnL: number;
    dailyPnLPercent: number;
    openTrades: number;
    tradingBlocked: boolean;
  };
}

/**
 * Dados de candles por timeframe
 */
interface TimeframeData {
  h1: Map<string, any[]>;  // symbol -> candles
  m15: Map<string, any[]>;
  m5: Map<string, any[]>;
}

// ============= CONFIGURAÇÃO PADRÃO =============

const DEFAULT_ENGINE_CONFIG: Omit<SMCTradingEngineConfig, "userId" | "botId"> = {
  strategyType: StrategyType.SMC_SWARM,
  symbols: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"],
  lots: 0.01,
  maxPositions: 3,
  cooldownMs: 60000,
};

// ============= CLASSE PRINCIPAL =============

/**
 * Motor de Trading SMC Multi-Estratégia
 */
export class SMCTradingEngine extends EventEmitter {
  private config: SMCTradingEngineConfig;
  private strategy: ITradingStrategy | null = null;
  private riskManager: RiskManager | null = null;
  
  // Estado do trading
  private _isRunning: boolean = false;
  private lastTradeTime: Map<string, number> = new Map();
  private lastAnalysisTime: number = 0;
  private analysisCount: number = 0;
  private tradesExecuted: number = 0;
  private startTime: number | null = null;
  
  // Cache de dados
  private lastTickPrice: number | null = null;
  private lastTickTime: number | null = null;
  private lastSignal: string | null = null;
  private lastSignalTime: number | null = null;
  private currentSymbol: string | null = null;
  
  // Dados multi-timeframe
  private timeframeData: TimeframeData = {
    h1: new Map(),
    m15: new Map(),
    m5: new Map(),
  };
  
  // Intervalos
  private analysisInterval: NodeJS.Timeout | null = null;
  private dataRefreshInterval: NodeJS.Timeout | null = null;
  
  // Subscrições de preços
  private priceSubscriptions: Set<string> = new Set();
  
  // Contador de ticks
  private tickCount: number = 0;
  private lastTickLogTime: number = 0;
  
  constructor(userId: number, botId: number, config: Partial<SMCTradingEngineConfig> = {}) {
    super();
    this.config = {
      ...DEFAULT_ENGINE_CONFIG,
      userId,
      botId,
      ...config,
    };
    
    console.log("[SMCTradingEngine] Instância criada para usuário", userId, "bot", botId);
  }
  
  // ============= MÉTODOS PÚBLICOS =============
  
  /**
   * Inicia o loop de trading
   */
  async start(): Promise<void> {
    if (this._isRunning) {
      console.log("[SMCTradingEngine] Já está em execução");
      return;
    }
    
    // Verificar conexão
    if (!ctraderAdapter.isConnected()) {
      throw new Error("Não conectado ao IC Markets. Conecte primeiro antes de iniciar o robô.");
    }
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[SMCTradingEngine] 🚀 INICIANDO ROBÔ SMC SWARM");
    console.log(`[SMCTradingEngine] Usuário: ${this.config.userId}, Bot: ${this.config.botId}`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    try {
      // Carregar configurações do banco de dados
      await this.loadConfigFromDB();
      
      // Inicializar estratégia
      await this.initializeStrategy();
      
      // Inicializar Risk Manager
      await this.initializeRiskManager();
      
      // Carregar dados históricos para todos os timeframes
      await this.loadHistoricalData();
      
      // Subscrever a preços em tempo real
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
        strategyType: this.config.strategyType,
        symbols: this.config.symbols,
      });
      
      console.log("[SMCTradingEngine] ✅ Robô iniciado com sucesso!");
      console.log(`[SMCTradingEngine] Estratégia: ${this.config.strategyType}`);
      console.log(`[SMCTradingEngine] Símbolos: ${this.config.symbols.join(", ")}`);
      
    } catch (error) {
      console.error("[SMCTradingEngine] Erro ao iniciar:", error);
      throw error;
    }
  }
  
  /**
   * Para o loop de trading
   */
  async stop(): Promise<void> {
    if (!this._isRunning) {
      console.log("[SMCTradingEngine] Já está parado");
      return;
    }
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[SMCTradingEngine] 🛑 PARANDO ROBÔ SMC SWARM");
    console.log(`[SMCTradingEngine] Análises realizadas: ${this.analysisCount}`);
    console.log(`[SMCTradingEngine] Trades executados: ${this.tradesExecuted}`);
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
    
    // Cancelar subscrições de preços
    await this.unsubscribeFromAllPrices();
    
    this.startTime = null;
    
    this.emit("stopped");
    
    console.log("[SMCTradingEngine] ✅ Robô parado com sucesso!");
  }
  
  /**
   * Obtém status atual do bot
   */
  getStatus(): SMCBotStatus {
    const riskState = this.riskManager?.getState();
    
    return {
      isRunning: this._isRunning,
      strategyType: this.config.strategyType,
      activeSymbols: this.config.symbols,
      currentSymbol: this.currentSymbol,
      lastTickPrice: this.lastTickPrice,
      lastTickTime: this.lastTickTime,
      lastSignal: this.lastSignal,
      lastSignalTime: this.lastSignalTime,
      lastAnalysisTime: this.lastAnalysisTime,
      analysisCount: this.analysisCount,
      tradesExecuted: this.tradesExecuted,
      startTime: this.startTime,
      tickCount: this.tickCount,
      riskState: {
        dailyPnL: riskState?.dailyPnL || 0,
        dailyPnLPercent: riskState?.dailyPnLPercent || 0,
        openTrades: riskState?.openTradesCount || 0,
        tradingBlocked: riskState?.tradingBlocked || false,
      },
    };
  }
  
  /**
   * Verifica se está rodando
   */
  get isRunning(): boolean {
    return this._isRunning;
  }
  
  /**
   * Atualiza configuração
   */
  async updateConfig(config: Partial<SMCTradingEngineConfig>): Promise<void> {
    const wasRunning = this._isRunning;
    
    // Parar se estiver rodando
    if (wasRunning) {
      await this.stop();
    }
    
    // Atualizar configuração
    this.config = { ...this.config, ...config };
    
    // Reiniciar se estava rodando
    if (wasRunning) {
      await this.start();
    }
    
    console.log("[SMCTradingEngine] Configuração atualizada:", config);
  }
  
  /**
   * Recarrega configurações do banco de dados
   */
  async reloadConfig(): Promise<void> {
    await this.loadConfigFromDB();
    
    // Atualizar estratégia se necessário
    if (this.strategy) {
      const smcConfig = await this.getSMCConfigFromDB();
      if (smcConfig) {
        this.strategy.updateConfig(smcConfig);
      }
    }
    
    console.log("[SMCTradingEngine] [Config] Parâmetros atualizados via UI");
  }
  
  // ============= MÉTODOS PRIVADOS =============
  
  /**
   * Carrega configurações do banco de dados
   */
  private async loadConfigFromDB(): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      
      // Carregar configuração do IC Markets
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
        // Atualizar tipo de estratégia
        if (icConfig[0].strategyType) {
          this.config.strategyType = strategyFactory.parseStrategyType(icConfig[0].strategyType);
        }
      }
      
      // Carregar configuração SMC
      const smcConfig = await this.getSMCConfigFromDB();
      if (smcConfig) {
        // Atualizar símbolos ativos
        try {
          const symbols = JSON.parse(smcConfig.activeSymbols || "[]");
          if (Array.isArray(symbols) && symbols.length > 0) {
            this.config.symbols = symbols;
          }
        } catch (e) {
          console.warn("[SMCTradingEngine] Erro ao parsear activeSymbols:", e);
        }
        
        // Atualizar max positions
        if (smcConfig.maxOpenTrades) {
          this.config.maxPositions = smcConfig.maxOpenTrades;
        }
      }
      
      console.log("[SMCTradingEngine] Configurações carregadas do banco de dados");
      
    } catch (error) {
      console.error("[SMCTradingEngine] Erro ao carregar config do DB:", error);
    }
  }
  
  /**
   * Obtém configuração SMC do banco de dados
   */
  private async getSMCConfigFromDB(): Promise<any> {
    try {
      const db = await getDb();
      if (!db) return null;
      
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
      
      return result[0] || null;
    } catch (error) {
      console.error("[SMCTradingEngine] Erro ao carregar SMC config:", error);
      return null;
    }
  }
  
  /**
   * Inicializa a estratégia baseada na configuração
   */
  private async initializeStrategy(): Promise<void> {
    // Carregar configuração SMC do banco
    const smcConfig = await this.getSMCConfigFromDB();
    
    // Criar estratégia usando a factory
    this.strategy = strategyFactory.createStrategy(this.config.strategyType, smcConfig);
    
    console.log(`[SMCTradingEngine] Estratégia inicializada: ${this.config.strategyType}`);
  }
  
  /**
   * Inicializa o Risk Manager
   */
  private async initializeRiskManager(): Promise<void> {
    const smcConfig = await this.getSMCConfigFromDB();
    
    const riskConfig: RiskManagerConfig = {
      userId: this.config.userId,
      botId: this.config.botId,
      riskPercentage: smcConfig?.riskPercentage ? Number(smcConfig.riskPercentage) : DEFAULT_RISK_CONFIG.riskPercentage,
      maxOpenTrades: smcConfig?.maxOpenTrades || DEFAULT_RISK_CONFIG.maxOpenTrades,
      dailyLossLimitPercent: smcConfig?.dailyLossLimitPercent ? Number(smcConfig.dailyLossLimitPercent) : DEFAULT_RISK_CONFIG.dailyLossLimitPercent,
      sessionFilterEnabled: smcConfig?.sessionFilterEnabled ?? DEFAULT_RISK_CONFIG.sessionFilterEnabled,
      londonSessionStart: smcConfig?.londonSessionStart || DEFAULT_RISK_CONFIG.londonSessionStart,
      londonSessionEnd: smcConfig?.londonSessionEnd || DEFAULT_RISK_CONFIG.londonSessionEnd,
      nySessionStart: smcConfig?.nySessionStart || DEFAULT_RISK_CONFIG.nySessionStart,
      nySessionEnd: smcConfig?.nySessionEnd || DEFAULT_RISK_CONFIG.nySessionEnd,
      circuitBreakerEnabled: smcConfig?.circuitBreakerEnabled ?? DEFAULT_RISK_CONFIG.circuitBreakerEnabled,
    };
    
    this.riskManager = createRiskManager(riskConfig);
    
    // Obter equity atual da conta
    const accountInfo = await ctraderAdapter.getAccountInfo();
    if (accountInfo?.balance) {
      await this.riskManager.initialize(accountInfo.balance);
    }
    
    console.log("[SMCTradingEngine] Risk Manager inicializado");
  }
  
  /**
   * Carrega dados históricos para todos os timeframes e símbolos
   */
  private async loadHistoricalData(): Promise<void> {
    console.log("[SMCTradingEngine] Carregando dados históricos...");
    
    for (const symbol of this.config.symbols) {
      try {
        // Carregar H1 (mínimo 200 candles)
        const h1Candles = await ctraderAdapter.getCandleHistory(symbol, "H1", 250);
        this.timeframeData.h1.set(symbol, h1Candles);
        
        // Carregar M15 (mínimo 200 candles)
        const m15Candles = await ctraderAdapter.getCandleHistory(symbol, "M15", 250);
        this.timeframeData.m15.set(symbol, m15Candles);
        
        // Carregar M5 (mínimo 200 candles)
        const m5Candles = await ctraderAdapter.getCandleHistory(symbol, "M5", 250);
        this.timeframeData.m5.set(symbol, m5Candles);
        
        console.log(`[SMCTradingEngine] ${symbol}: H1=${h1Candles.length}, M15=${m15Candles.length}, M5=${m5Candles.length} candles`);
        
      } catch (error) {
        console.error(`[SMCTradingEngine] Erro ao carregar dados de ${symbol}:`, error);
      }
    }
    
    console.log("[SMCTradingEngine] ✅ Dados históricos carregados");
  }
  
  /**
   * Subscreve a preços em tempo real de todos os símbolos
   */
  private async subscribeToAllPrices(): Promise<void> {
    for (const symbol of this.config.symbols) {
      try {
        await ctraderAdapter.subscribePrice(symbol, (tick) => {
          this.onPriceTick(symbol, tick);
        });
        
        this.priceSubscriptions.add(symbol);
        console.log(`[SMCTradingEngine] Subscrito a preços de ${symbol}`);
        
      } catch (error) {
        console.error(`[SMCTradingEngine] Erro ao subscrever ${symbol}:`, error);
      }
    }
  }
  
  /**
   * Cancela todas as subscrições de preços
   */
  private async unsubscribeFromAllPrices(): Promise<void> {
    const symbols = Array.from(this.priceSubscriptions);
    for (const symbol of symbols) {
      try {
        await ctraderAdapter.unsubscribePrice(symbol);
      } catch (error) {
        console.error(`[SMCTradingEngine] Erro ao cancelar subscrição de ${symbol}:`, error);
      }
    }
    
    this.priceSubscriptions.clear();
  }
  
  /**
   * Processa tick de preço recebido
   */
  private onPriceTick(symbol: string, tick: { bid: number; ask: number; timestamp: number }): void {
    if (!this._isRunning) return;
    
    this.lastTickPrice = tick.bid;
    this.lastTickTime = tick.timestamp;
    this.currentSymbol = symbol;
    this.tickCount++;
    
    const now = Date.now();
    const spread = tick.ask - tick.bid;
    const spreadPips = symbol.includes("JPY") ? spread * 100 : spread * 10000;
    
    // Log de batimento cardíaco a cada 5 segundos
    if (now - this.lastTickLogTime > 5000) {
      console.log(`[SMC] 💓 Tick #${this.tickCount}: ${symbol} = ${tick.bid.toFixed(5)} | Spread: ${spreadPips.toFixed(1)} pips | Sinal: ${this.lastSignal || "AGUARDANDO"}`);
      this.lastTickLogTime = now;
    }
    
    this.emit("tick", {
      symbol,
      bid: tick.bid,
      ask: tick.ask,
      spread: spreadPips,
      timestamp: tick.timestamp,
      tickCount: this.tickCount,
    });
  }
  
  /**
   * Inicia loop de análise periódica
   */
  private startAnalysisLoop(): void {
    // Análise a cada 30 segundos
    const analysisIntervalMs = 30000;
    
    // Executar primeira análise imediatamente
    this.performAnalysis();
    
    this.analysisInterval = setInterval(() => {
      this.performAnalysis();
    }, analysisIntervalMs);
    
    console.log(`[SMCTradingEngine] Loop de análise iniciado (intervalo: ${analysisIntervalMs / 1000}s)`);
  }
  
  /**
   * Inicia loop de atualização de dados
   */
  private startDataRefreshLoop(): void {
    // Atualizar dados a cada 5 minutos
    const refreshIntervalMs = 5 * 60 * 1000;
    
    this.dataRefreshInterval = setInterval(() => {
      this.refreshTimeframeData();
    }, refreshIntervalMs);
    
    console.log(`[SMCTradingEngine] Loop de atualização de dados iniciado (intervalo: ${refreshIntervalMs / 60000}min)`);
  }
  
  /**
   * Atualiza dados de timeframes
   */
  private async refreshTimeframeData(): Promise<void> {
    if (!this._isRunning) return;
    
    for (const symbol of this.config.symbols) {
      try {
        // Atualizar apenas os últimos candles
        const h1Candles = await ctraderAdapter.getCandleHistory(symbol, "H1", 50);
        const m15Candles = await ctraderAdapter.getCandleHistory(symbol, "M15", 50);
        const m5Candles = await ctraderAdapter.getCandleHistory(symbol, "M5", 50);
        
        // Mesclar com dados existentes
        this.mergeCandles(symbol, "h1", h1Candles);
        this.mergeCandles(symbol, "m15", m15Candles);
        this.mergeCandles(symbol, "m5", m5Candles);
        
      } catch (error) {
        console.error(`[SMCTradingEngine] Erro ao atualizar dados de ${symbol}:`, error);
      }
    }
  }
  
  /**
   * Mescla novos candles com existentes
   */
  private mergeCandles(symbol: string, timeframe: "h1" | "m15" | "m5", newCandles: any[]): void {
    const existing = this.timeframeData[timeframe].get(symbol) || [];
    
    // Criar mapa de timestamps existentes
    const existingTimestamps = new Set(existing.map(c => c.timestamp));
    
    // Adicionar apenas candles novos
    for (const candle of newCandles) {
      if (!existingTimestamps.has(candle.timestamp)) {
        existing.push(candle);
      } else {
        // Atualizar candle existente (pode ter mudado se ainda não fechou)
        const index = existing.findIndex(c => c.timestamp === candle.timestamp);
        if (index >= 0) {
          existing[index] = candle;
        }
      }
    }
    
    // Ordenar por timestamp
    existing.sort((a, b) => a.timestamp - b.timestamp);
    
    // Manter apenas os últimos 300 candles
    if (existing.length > 300) {
      existing.splice(0, existing.length - 300);
    }
    
    this.timeframeData[timeframe].set(symbol, existing);
  }
  
  /**
   * Executa análise de mercado para todos os símbolos
   */
  private async performAnalysis(): Promise<void> {
    if (!this._isRunning || !this.strategy) return;
    
    const now = Date.now();
    this.lastAnalysisTime = now;
    this.analysisCount++;
    
    // Verificar se pode operar
    if (this.riskManager) {
      const canOpen = await this.riskManager.canOpenPosition();
      if (!canOpen.allowed) {
        if (this.analysisCount % 10 === 0) { // Log a cada 10 análises
          console.log(`[SMCTradingEngine] ⚠️ ${canOpen.reason}`);
        }
        return;
      }
    }
    
    // Analisar cada símbolo
    for (const symbol of this.config.symbols) {
      try {
        await this.analyzeSymbol(symbol);
      } catch (error) {
        console.error(`[SMCTradingEngine] Erro ao analisar ${symbol}:`, error);
      }
    }
  }
  
  /**
   * Analisa um símbolo específico
   */
  private async analyzeSymbol(symbol: string): Promise<void> {
    if (!this.strategy) return;
    
    // Obter dados de todos os timeframes
    const h1Data = this.timeframeData.h1.get(symbol) || [];
    const m15Data = this.timeframeData.m15.get(symbol) || [];
    const m5Data = this.timeframeData.m5.get(symbol) || [];
    
    // Verificar se temos dados suficientes
    if (h1Data.length < 50 || m15Data.length < 30 || m5Data.length < 20) {
      return;
    }
    
    // Configurar símbolo atual na estratégia (se for SMC)
    if (this.strategy instanceof SMCStrategy) {
      this.strategy.setCurrentSymbol(symbol);
    }
    
    // Preparar dados MTF
    const mtfData: MultiTimeframeData = {
      h1: h1Data.map(c => ({
        timestamp: c.timestamp * 1000,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
      })),
      m15: m15Data.map(c => ({
        timestamp: c.timestamp * 1000,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
      })),
      m5: m5Data.map(c => ({
        timestamp: c.timestamp * 1000,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
      })),
      currentBid: this.lastTickPrice || m5Data[m5Data.length - 1]?.close,
    };
    
    // Atualizar dados na estratégia MTF
    if ("updateTimeframeData" in this.strategy) {
      const mtfStrategy = this.strategy as IMultiTimeframeStrategy;
      mtfStrategy.updateTimeframeData("H1", mtfData.h1!);
      mtfStrategy.updateTimeframeData("M15", mtfData.m15!);
      mtfStrategy.updateTimeframeData("M5", mtfData.m5!);
    }
    
    // Analisar sinal
    const signal = this.strategy.analyzeSignal(mtfData.m5!, mtfData);
    
    this.lastSignal = signal.signal;
    this.lastSignalTime = Date.now();
    this.currentSymbol = symbol;
    
    // Log de análise (apenas se houver sinal ou a cada 10 análises)
    if (signal.signal !== "NONE" || this.analysisCount % 10 === 0) {
      console.log("───────────────────────────────────────────────────────────────");
      console.log(`[SMC] 📊 Análise #${this.analysisCount} | ${symbol}`);
      console.log(`[SMC] Sinal: ${signal.signal} | Confiança: ${signal.confidence}%`);
      console.log(`[SMC] Razão: ${signal.reason}`);
      console.log("───────────────────────────────────────────────────────────────");
    }
    
    // Executar trade se houver sinal
    if (signal.signal !== "NONE" && signal.confidence >= 50) {
      await this.evaluateAndExecuteTrade(symbol, signal);
    }
    
    this.emit("analysis", { symbol, signal });
  }
  
  /**
   * Avalia e executa trade se condições forem atendidas
   */
  private async evaluateAndExecuteTrade(symbol: string, signal: SignalResult): Promise<void> {
    const now = Date.now();
    
    // Verificar cooldown por símbolo
    const lastTrade = this.lastTradeTime.get(symbol) || 0;
    if (now - lastTrade < this.config.cooldownMs) {
      const remaining = Math.ceil((this.config.cooldownMs - (now - lastTrade)) / 1000);
      console.log(`[SMCTradingEngine] ⏳ Cooldown ativo para ${symbol}. Aguardando ${remaining}s...`);
      return;
    }
    
    // Verificar com Risk Manager
    if (this.riskManager) {
      const canOpen = await this.riskManager.canOpenPosition();
      if (!canOpen.allowed) {
        console.log(`[SMCTradingEngine] ⚠️ ${canOpen.reason}`);
        return;
      }
    }
    
    // Verificar posições abertas
    const openPositions = await ctraderAdapter.getOpenPositions();
    const symbolPositions = openPositions.filter(p => p.symbol === symbol);
    
    if (symbolPositions.length >= 1) {
      console.log(`[SMCTradingEngine] ⚠️ Já existe posição aberta em ${symbol}`);
      return;
    }
    
    // Calcular tamanho da posição
    const accountInfo = await ctraderAdapter.getAccountInfo();
    const balance = accountInfo?.balance || 10000;
    
    // Obter pip value para o símbolo
    const pipValue = this.getPipValue(symbol);
    
    // Calcular SL/TP usando a estratégia
    const direction = signal.signal === "BUY" ? TradeSide.BUY : TradeSide.SELL;
    const currentPrice = this.lastTickPrice || 0;
    const sltp = this.strategy!.calculateSLTP(currentPrice, direction, pipValue, signal.metadata);
    
    // Calcular tamanho da posição
    let lotSize = this.config.lots;
    if (this.riskManager && sltp.stopLossPips) {
      const posSize = this.riskManager.calculatePositionSize(balance, sltp.stopLossPips, pipValue);
      if (posSize.canTrade) {
        lotSize = posSize.lotSize;
      }
    }
    
    // Executar ordem
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`[SMCTradingEngine] 🎯 EXECUTANDO ORDEM: ${signal.signal}`);
    console.log(`[SMCTradingEngine] Símbolo: ${symbol}`);
    console.log(`[SMCTradingEngine] Lotes: ${lotSize}`);
    console.log(`[SMCTradingEngine] SL: ${sltp.stopLoss?.toFixed(5)} | TP: ${sltp.takeProfit?.toFixed(5)}`);
    console.log(`[SMCTradingEngine] Confiança: ${signal.confidence}%`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    try {
      const result = await ctraderAdapter.placeOrder({
        symbol,
        direction: signal.signal as "BUY" | "SELL",
        orderType: "MARKET",
        lots: lotSize,
        stopLossPips: sltp.stopLossPips,
        takeProfitPips: sltp.takeProfitPips,
        comment: `SMC ${signal.signal} | ${signal.reason.substring(0, 50)}`,
      });
      
      if (result.success) {
        this.lastTradeTime.set(symbol, now);
        this.tradesExecuted++;
        
        console.log(`[SMCTradingEngine] ✅ ORDEM EXECUTADA: ${result.orderId} @ ${result.executionPrice}`);
        
        this.emit("trade", {
          symbol,
          signal,
          result,
          timestamp: now,
        });
      } else {
        console.error(`[SMCTradingEngine] ❌ ERRO NA ORDEM: ${result.errorMessage}`);
      }
      
    } catch (error) {
      console.error("[SMCTradingEngine] Erro ao executar ordem:", error);
    }
  }
  
  /**
   * Obtém o valor do pip para um símbolo
   */
  private getPipValue(symbol: string): number {
    // Valores aproximados - em produção, obter da corretora
    if (symbol.includes("JPY")) {
      return 0.01;
    }
    if (symbol === "XAUUSD") {
      return 0.1;
    }
    return 0.0001;
  }
}

// ============= GERENCIADOR DE INSTÂNCIAS =============

const activeSMCEngines = new Map<string, SMCTradingEngine>();

function getEngineKey(userId: number, botId: number): string {
  return `${userId}-${botId}`;
}

/**
 * Obtém ou cria uma instância do SMCTradingEngine
 */
export function getSMCTradingEngine(userId: number, botId: number = 1): SMCTradingEngine {
  const key = getEngineKey(userId, botId);
  if (!activeSMCEngines.has(key)) {
    console.log(`[SMCTradingEngineManager] Criando nova instância para usuário ${userId}, bot ${botId}`);
    activeSMCEngines.set(key, new SMCTradingEngine(userId, botId));
  }
  return activeSMCEngines.get(key)!;
}

/**
 * Remove uma instância do SMCTradingEngine
 */
export async function removeSMCTradingEngine(userId: number, botId: number = 1): Promise<void> {
  const key = getEngineKey(userId, botId);
  const engine = activeSMCEngines.get(key);
  if (engine) {
    if (engine.isRunning) {
      await engine.stop();
    }
    activeSMCEngines.delete(key);
    console.log(`[SMCTradingEngineManager] Instância removida para usuário ${userId}, bot ${botId}`);
  }
}

/**
 * Obtém status de todos os engines ativos
 */
export function getAllSMCEnginesStatus(): Array<{ userId: number; botId: number; status: SMCBotStatus }> {
  const result: Array<{ userId: number; botId: number; status: SMCBotStatus }> = [];
  
  const entries = Array.from(activeSMCEngines.entries());
  for (const [key, engine] of entries) {
    const [userId, botId] = key.split("-").map(Number);
    result.push({
      userId,
      botId,
      status: engine.getStatus(),
    });
  }
  
  return result;
}
