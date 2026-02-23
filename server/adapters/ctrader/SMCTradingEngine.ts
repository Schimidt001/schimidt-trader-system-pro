/**
 * SMC Trading Engine - Motor de Execução Multi-Estratégia
 * 
 * Versão aprimorada do TradingEngine que suporta:
 * - Strategy Pattern para múltiplas estratégias (SMC, TrendSniper)
 * - Análise Multi-Timeframe (H1, M15, M5)
 * - Gestão de Risco Dinâmica
 * - Circuit Breakers
 * - Modo Swarm (múltiplos ativos simultâneos)
 * - INJEÇÃO DE DEPENDÊNCIA: Aceita adapter via construtor para suportar backtest
 * 
 * @author Schimidt Trader Pro
 * @version 2.0.0 - Refatorado para DI (2026-01-14)
 */

import { EventEmitter } from "events";
// REMOVIDO: import { ctraderAdapter } from "../CTraderAdapter"; - ISOLAMENTO GARANTIDO
import { ITradingAdapter } from "../../backtest/adapters/ITradingAdapter";
import { TrendbarPeriod, TradeSide } from "./CTraderClient";
import { ITradingStrategy, IMultiTimeframeStrategy, StrategyType, SignalResult, MultiTimeframeData } from "./ITradingStrategy";
import { strategyFactory } from "./StrategyFactory";
import { SMCStrategy, SMCStrategyConfig } from "./SMCStrategy";
import { InstitutionalLogger } from "./InstitutionalLogger";
import { RiskManager, createRiskManager, RiskManagerConfig, DEFAULT_RISK_CONFIG } from "./RiskManager";
import { getDb, insertSystemLog, type LogLevel, type LogCategory } from "../../db";
import { smcStrategyConfig, icmarketsConfig } from "../../../drizzle/schema";
import { eq, and } from "drizzle-orm";
// REFATORAÇÃO: Importar módulo centralizado de normalização de pips
import { getPipValue as getCentralizedPipValue, calculateSpreadPips, calculateMonetaryPipValue, ConversionRates } from "../../../shared/normalizationUtils";

// ============= FUNÇÃO HELPER PARA DELAY =============

/**
 * Função helper para criar delay entre requisições
 * Evita erro REQUEST_FREQUENCY_EXCEEDED da cTrader
 * @param ms Tempo em milissegundos para aguardar
 */
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// Delay padrão entre requisições à API (1 segundo)
const API_REQUEST_DELAY_MS = 1000;

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
  /** Spread máximo permitido em pips (TAREFA B - Proteção de Spread) */
  maxSpread: number;
  /** Máximo de trades por símbolo (CORREÇÃO CRÍTICA 2026-01-20) */
  maxTradesPerSymbol: number;
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
  // Métricas de Performance (Latência)
  performanceMetrics: {
    lastTickProcessingTime: number | null;  // Tempo de processamento do último tick (ms)
    avgTickProcessingTime: number | null;   // Média de tempo de processamento (ms)
    maxTickProcessingTime: number | null;   // Tempo máximo de processamento (ms)
    minTickProcessingTime: number | null;   // Tempo mínimo de processamento (ms)
    ticksProcessedCount: number;            // Total de ticks processados com medição
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
  symbols: [], // CORREÇÃO 2026-02-23: Removido hardcode. Symbols devem vir EXCLUSIVAMENTE do banco de dados (activeSymbols via UI)
  lots: 0.01,
  maxPositions: 3,
  cooldownMs: 60000,
  maxSpread: 2.0, // TAREFA B: Spread máximo padrão de 2 pips
  maxTradesPerSymbol: 1, // CORREÇÃO CRÍTICA 2026-01-20: Máximo de trades por símbolo
};

// ============= CLASSE PRINCIPAL =============

/**
 * Motor de Trading SMC Multi-Estratégia
 */
export class SMCTradingEngine extends EventEmitter {
  private config: SMCTradingEngineConfig;
  private strategy: ITradingStrategy | null = null;
  private riskManager: RiskManager | null = null;
  private institutionalLogger: InstitutionalLogger | null = null;
  
  // Estado do trading
  private _isRunning: boolean = false;
  private lastTradeTime: Map<string, number> = new Map();
  private lastAnalysisTime: number = 0;
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
  private trailingStopInterval: NodeJS.Timeout | null = null;  // CORREÇÃO AUDITORIA: Loop de Trailing Stop
  
  // Subscrições de preços
  private priceSubscriptions: Set<string> = new Set();
  
  // Contador de ticks
  private tickCount: number = 0;
  private lastTickLogTime: number = 0;
  
  // Métricas de Performance (Latência) - Implementação da Auditoria
  private tickProcessingTimes: number[] = [];  // Histórico de tempos de processamento
  private lastTickProcessingTime: number | null = null;
  private maxTickProcessingTime: number | null = null;
  private minTickProcessingTime: number | null = null;
  private ticksProcessedWithMetrics: number = 0;
  private readonly PERFORMANCE_HISTORY_SIZE = 100;  // Manter últimos 100 tempos para média
  
  // ============= INJEÇÃO DE DEPENDÊNCIA =============
  /**
   * Adapter de trading injetado via construtor.
   * Em produção: CTraderAdapter (singleton global)
   * Em backtest: BacktestAdapter (instância isolada)
   */
  private adapter: ITradingAdapter;
  
  /**
   * Construtor com suporte a Injeção de Dependência
   * 
   * @param userId - ID do usuário
   * @param botId - ID do bot
   * @param config - Configurações parciais do engine
   * @param adapter - Adapter de trading OBRIGATÓRIO (sem fallback global)
   */
  constructor(
    userId: number, 
    botId: number, 
    config: Partial<SMCTradingEngineConfig> = {},
    adapter: ITradingAdapter // OBRIGATÓRIO PARA ISOLAMENTO
  ) {
    super();
    this.config = {
      ...DEFAULT_ENGINE_CONFIG,
      userId,
      botId,
      ...config,
    };
    
    // INJEÇÃO DE DEPENDÊNCIA: OBRIGATÓRIA
    if (!adapter) {
      throw new Error("Adapter de trading obrigatório no construtor do SMCTradingEngine");
    }
    this.adapter = adapter;
    
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
    if (!this.adapter.isConnected()) {
      throw new Error("Não conectado ao IC Markets. Conecte primeiro antes de iniciar o robô.");
    }
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[SMCTradingEngine] 🚀 INICIANDO ROBÔ SMC SWARM");
    console.log(`[SMCTradingEngine] Usuário: ${this.config.userId}, Bot: ${this.config.botId}`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    try {
      // CORREÇÃO 2026-01-13: Configurar contexto do usuário no CTraderAdapter
      // Isso permite que o handleExecutionEvent persista posições no banco de dados
      this.adapter.setUserContext(this.config.userId, this.config.botId);
      console.log("[SMCTradingEngine] ✅ Contexto de usuário configurado no CTraderAdapter");
      
      // CORREÇÃO 2026-01-13: Reconciliar posições abertas com a cTrader
      // Sincroniza o banco de dados com as posições reais da corretora
      console.log("[SMCTradingEngine] 🔄 Iniciando reconciliação de posições...");
      const syncedPositions = await this.adapter.reconcilePositions();
      console.log(`[SMCTradingEngine] ✅ Reconciliação concluída: ${syncedPositions} posições sincronizadas`);
      
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
      this.startTrailingStopLoop();  // CORREÇÃO AUDITORIA: Iniciar loop de Trailing Stop
      
      this._isRunning = true;
      this.startTime = Date.now();
      this.analysisCount = 0;
      this.tradesExecuted = 0;
      this.tickCount = 0;
      
      // Resetar métricas de performance (AUDITORIA)
      this.resetPerformanceMetrics();
      
      this.emit("started", {
        strategyType: this.config.strategyType,
        symbols: this.config.symbols,
      });
      
      console.log("[SMCTradingEngine] ✅ Robô iniciado com sucesso!");
      console.log(`[SMCTradingEngine] Estratégia: ${this.config.strategyType}`);
      console.log(`[SMCTradingEngine] Símbolos: ${this.config.symbols.join(", ")}`);
      
      // Gravar log de início no banco de dados
      await this.logInfo(
        `🚀 Robô SMC SWARM iniciado | Estratégia: ${this.config.strategyType} | Símbolos: ${this.config.symbols.join(", ")}`,
        "SYSTEM",
        { strategyType: this.config.strategyType, symbols: this.config.symbols }
      );
      
      // Log detalhado das configurações iniciais
      await this.logInfo(
        `⚙️ Configurações carregadas | MaxSpread: ${this.config.maxSpread} pips | MaxPositions: ${this.config.maxPositions} | Lotes: ${this.config.lots}`,
        "CONFIG" as LogCategory,
        { maxSpread: this.config.maxSpread, maxPositions: this.config.maxPositions, lots: this.config.lots }
      );
      
      // Log de status de sessão ao iniciar
      if (this.riskManager) {
        const canOpen = await this.riskManager.canOpenPosition();
        if (!canOpen.allowed) {
          await this.logInfo(
            `🟡 BOT INICIADO - FORA DE SESSÃO | ${canOpen.reason}`,
            "SYSTEM",
            { status: "STARTED_OUT_OF_SESSION", reason: canOpen.reason }
          );
        } else {
          await this.logInfo(
            `🟢 BOT INICIADO - EM SESSÃO | Pronto para analisar mercado`,
            "SYSTEM",
            { status: "STARTED_IN_SESSION" }
          );
        }
      }
      
    } catch (error) {
      console.error("[SMCTradingEngine] Erro ao iniciar:", error);
      // Gravar log de erro no banco de dados
      await this.logError(`Erro ao iniciar robô: ${(error as Error).message}`, "SYSTEM");
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
    
    // CORREÇÃO AUDITORIA: Parar loop de Trailing Stop
    if (this.trailingStopInterval) {
      clearInterval(this.trailingStopInterval);
      this.trailingStopInterval = null;
    }
    
    // Cancelar subscrições de preços
    await this.unsubscribeFromAllPrices();
    
    this.startTime = null;
    
    this.emit("stopped");
    
    console.log("[SMCTradingEngine] ✅ Robô parado com sucesso!");
    
    // Gravar log de parada no banco de dados
    await this.logInfo(
      `🛑 Robô SMC SWARM parado | Análises: ${this.analysisCount} | Trades: ${this.tradesExecuted} | Ticks: ${this.tickCount}`,
      "SYSTEM",
      { analysisCount: this.analysisCount, tradesExecuted: this.tradesExecuted, tickCount: this.tickCount }
    );
    
    // Log de métricas de performance
    const perfMetrics = this.getPerformanceMetrics();
    if (perfMetrics.avgTickProcessingTime !== null) {
      await this.logInfo(
        `📊 Métricas de Performance | Avg: ${perfMetrics.avgTickProcessingTime?.toFixed(2)}ms | Max: ${perfMetrics.maxTickProcessingTime?.toFixed(2)}ms | Min: ${perfMetrics.minTickProcessingTime?.toFixed(2)}ms`,
        "PERFORMANCE",
        { ...perfMetrics }
      );
    }
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
      // Métricas de Performance (AUDITORIA)
      performanceMetrics: this.getPerformanceMetrics(),
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
   * Recarrega configuracoes do banco de dados
   * 
   * CORRECAO CRITICA: Esta funcao agora atualiza tanto a estrategia
   * quanto o RiskManager para garantir que as configuracoes de sessao
   * sejam aplicadas corretamente.
   */
  async reloadConfig(): Promise<void> {
    // Guardar símbolos antigos para comparação
    const oldSymbols = [...this.config.symbols];
    
    await this.loadConfigFromDB();
    
    const smcConfig = await this.getSMCConfigFromDB();
    
    // DEBUG: Log completo das configuracoes carregadas do banco
    console.log(`[SMCTradingEngine] [Config] DEBUG - Configuracoes brutas do banco:`);
    console.log(`[SMCTradingEngine] [Config] DEBUG - smcConfig existe: ${!!smcConfig}`);
    
    // CORREÇÃO CRÍTICA: Log dos símbolos ativos após reload
    console.log(`[SMCTradingEngine] [Config] DEBUG - Símbolos ANTES: ${JSON.stringify(oldSymbols)}`);
    console.log(`[SMCTradingEngine] [Config] DEBUG - Símbolos DEPOIS: ${JSON.stringify(this.config.symbols)}`);
    console.log(`[SMCTradingEngine] [Config] DEBUG - activeSymbols do banco: ${smcConfig?.activeSymbols}`);
    if (smcConfig) {
      console.log(`[SMCTradingEngine] [Config] DEBUG - sessionFilterEnabled: ${smcConfig.sessionFilterEnabled} (tipo: ${typeof smcConfig.sessionFilterEnabled})`);
      console.log(`[SMCTradingEngine] [Config] DEBUG - londonSessionStart: "${smcConfig.londonSessionStart}" (tipo: ${typeof smcConfig.londonSessionStart})`);
      console.log(`[SMCTradingEngine] [Config] DEBUG - londonSessionEnd: "${smcConfig.londonSessionEnd}" (tipo: ${typeof smcConfig.londonSessionEnd})`);
      console.log(`[SMCTradingEngine] [Config] DEBUG - nySessionStart: "${smcConfig.nySessionStart}" (tipo: ${typeof smcConfig.nySessionStart})`);
      console.log(`[SMCTradingEngine] [Config] DEBUG - nySessionEnd: "${smcConfig.nySessionEnd}" (tipo: ${typeof smcConfig.nySessionEnd})`);
    }
    
    // Atualizar estrategia
    if (this.strategy && smcConfig) {
      this.strategy.updateConfig(smcConfig);
      console.log(`[SMCTradingEngine] [Config] Estrategia atualizada`);
      console.log(`[SMCTradingEngine] [Config] Sessao Londres: ${smcConfig.londonSessionStart} - ${smcConfig.londonSessionEnd}`);
      console.log(`[SMCTradingEngine] [Config] Sessao NY: ${smcConfig.nySessionStart} - ${smcConfig.nySessionEnd}`);
    }
    
    // Atualizar RiskManager com configuracoes de sessao
    // NOTA: Usar nullish coalescing (??) em vez de || para preservar strings vazias
    if (this.riskManager && smcConfig) {
      const riskConfig = {
        sessionFilterEnabled: smcConfig.sessionFilterEnabled ?? true,
        londonSessionStart: smcConfig.londonSessionStart ?? "04:00",
        londonSessionEnd: smcConfig.londonSessionEnd ?? "07:00",
        nySessionStart: smcConfig.nySessionStart ?? "09:30",
        nySessionEnd: smcConfig.nySessionEnd ?? "12:30",
        riskPercentage: smcConfig.riskPercentage ? Number(smcConfig.riskPercentage) : undefined,
        maxOpenTrades: smcConfig.maxOpenTrades,
        dailyLossLimitPercent: smcConfig.dailyLossLimitPercent ? Number(smcConfig.dailyLossLimitPercent) : undefined,
        circuitBreakerEnabled: smcConfig.circuitBreakerEnabled,
      };
      console.log(`[SMCTradingEngine] [Config] DEBUG - RiskManager config a aplicar:`, JSON.stringify(riskConfig));
      this.riskManager.updateConfig(riskConfig);
      console.log(`[SMCTradingEngine] [Config] RiskManager atualizado`);
    }
    
    console.log("[SMCTradingEngine] [Config] Parametros atualizados via UI");
    
    // CORREÇÃO CRÍTICA: Re-subscrever preços se os símbolos mudaram
    const symbolsChanged = JSON.stringify(oldSymbols.sort()) !== JSON.stringify(this.config.symbols.sort());
    if (symbolsChanged && this._isRunning) {
      console.log(`[SMCTradingEngine] [Config] 🔄 Símbolos alterados! Re-subscrevendo preços...`);
      console.log(`[SMCTradingEngine] [Config] Símbolos antigos: ${JSON.stringify(oldSymbols)}`);
      console.log(`[SMCTradingEngine] [Config] Símbolos novos: ${JSON.stringify(this.config.symbols)}`);
      
      // Cancelar subscrições antigas
      await this.unsubscribeFromAllPrices();
      
      // Carregar dados históricos dos novos símbolos
      await this.loadHistoricalData();
      
      // Subscrever aos novos símbolos
      await this.subscribeToAllPrices();
      
      console.log(`[SMCTradingEngine] [Config] ✅ Re-subscrição concluída para ${this.config.symbols.length} símbolos`);
    }
    
    // Log para o banco de dados
    await this.logInfo(
      `⚙️ Parâmetros atualizados via UI | Sessão: ${smcConfig?.sessionFilterEnabled ? 'ATIVA' : 'DESATIVADA'} | Londres: ${smcConfig?.londonSessionStart}-${smcConfig?.londonSessionEnd} | NY: ${smcConfig?.nySessionStart}-${smcConfig?.nySessionEnd} | Símbolos: ${this.config.symbols.join(', ')}`,
      "CONFIG" as LogCategory,
      { 
        sessionFilterEnabled: smcConfig?.sessionFilterEnabled,
        londonSession: `${smcConfig?.londonSessionStart}-${smcConfig?.londonSessionEnd}`,
        nySession: `${smcConfig?.nySessionStart}-${smcConfig?.nySessionEnd}`,
        symbols: this.config.symbols,
        symbolsChanged: symbolsChanged
      }
    );
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
        
        // TAREFA B: Carregar maxSpread do banco de dados
        if (icConfig[0].maxSpread !== undefined && icConfig[0].maxSpread !== null) {
          this.config.maxSpread = parseFloat(String(icConfig[0].maxSpread));
          console.log(`[SMCTradingEngine] [Config] maxSpread carregado: ${this.config.maxSpread} pips`);
        }
      }
      
      // Carregar configuração SMC
      const smcConfig = await this.getSMCConfigFromDB();
      if (smcConfig) {
        // CORREÇÃO CRÍTICA: Log detalhado do activeSymbols
        console.log(`[SMCTradingEngine] [Config] DEBUG - activeSymbols bruto do banco: "${smcConfig.activeSymbols}"`);
        console.log(`[SMCTradingEngine] [Config] DEBUG - tipo de activeSymbols: ${typeof smcConfig.activeSymbols}`);
        
        // Atualizar símbolos ativos
        try {
          const symbols = JSON.parse(smcConfig.activeSymbols || "[]");
          console.log(`[SMCTradingEngine] [Config] DEBUG - symbols parseados: ${JSON.stringify(symbols)}`);
          console.log(`[SMCTradingEngine] [Config] DEBUG - é Array: ${Array.isArray(symbols)}, length: ${symbols.length}`);
          
          if (Array.isArray(symbols) && symbols.length > 0) {
            this.config.symbols = symbols;
            console.log(`[SMCTradingEngine] [Config] ✅ Símbolos atualizados: ${JSON.stringify(this.config.symbols)}`);
          } else {
            console.warn(`[SMCTradingEngine] [Config] ⚠️ Símbolos inválidos ou vazios, mantendo: ${JSON.stringify(this.config.symbols)}`);
          }
        } catch (e) {
          console.error("[SMCTradingEngine] ❌ Erro ao parsear activeSymbols:", e);
          console.error(`[SMCTradingEngine] ❌ Valor que causou erro: "${smcConfig.activeSymbols}"`);
        }
        
        // Atualizar max positions
        if (smcConfig.maxOpenTrades) {
          this.config.maxPositions = smcConfig.maxOpenTrades;
        }
        
        // CORREÇÃO CRÍTICA 2026-01-20: Carregar maxTradesPerSymbol do banco de dados
        // Este campo controla quantos trades simultâneos são permitidos POR ATIVO
        if (smcConfig.maxTradesPerSymbol !== undefined && smcConfig.maxTradesPerSymbol !== null) {
          this.config.maxTradesPerSymbol = smcConfig.maxTradesPerSymbol;
          console.log(`[SMCTradingEngine] [Config] ✅ maxTradesPerSymbol carregado do banco: ${this.config.maxTradesPerSymbol}`);
        } else {
          console.log(`[SMCTradingEngine] [Config] ⚠️ maxTradesPerSymbol não encontrado no banco, usando default: ${this.config.maxTradesPerSymbol}`);
        }
      } else {
        console.warn(`[SMCTradingEngine] [Config] ⚠️ smcConfig é NULL! Usando símbolos padrão: ${JSON.stringify(this.config.symbols)}`);
      }
      
      console.log(`[SMCTradingEngine] [Config] ✅ Configurações carregadas. Símbolos finais: ${JSON.stringify(this.config.symbols)}`);
      
    } catch (error) {
      console.error("[SMCTradingEngine] Erro ao carregar config do DB:", error);
    }
  }
  
  /**
   * Obtém configuração SMC do banco de dados
   */
  /**
   * CORREÇÃO CRÍTICA 2026-01-14: Obtém taxas de conversão para cálculo correto do pip value monetário
   * 
   * Refatoração completa:
   * - Adicionado suporte a USDCAD, USDCHF, NZDUSD
   * - Adicionado currentPrice para pares USD_BASE
   * 
   * Essas taxas são necessárias para converter o valor do pip para USD em pares:
   * - Direct pairs (EURUSD, etc.) - não precisa de conversão
   * - Indirect pairs (USDJPY, USDCAD, USDCHF) - precisa da taxa do próprio par
   * - JPY (EURJPY, GBPJPY, etc.) - precisa de USDJPY
   * - Cross pairs (EURGBP, etc.) - precisa da taxa da moeda de cotação
   * 
   * @param symbol - Símbolo atual sendo operado (opcional, usado para currentPrice)
   */
  private async getConversionRates(symbol?: string): Promise<ConversionRates> {
    const rates: ConversionRates = {};
    
    try {
      // ============= PARES ESSENCIAIS PARA CONVERSÃO =============
      
      // USDJPY - essencial para pares JPY e USDJPY
      const usdjpyPrice = await this.adapter.getPrice("USDJPY");
      if (usdjpyPrice && usdjpyPrice.bid > 0) {
        rates.USDJPY = (usdjpyPrice.bid + usdjpyPrice.ask) / 2;
      }
      
      // EURUSD - para pares EUR cross
      const eurusdPrice = await this.adapter.getPrice("EURUSD");
      if (eurusdPrice && eurusdPrice.bid > 0) {
        rates.EURUSD = (eurusdPrice.bid + eurusdPrice.ask) / 2;
      }
      
      // GBPUSD - para pares GBP cross
      const gbpusdPrice = await this.adapter.getPrice("GBPUSD");
      if (gbpusdPrice && gbpusdPrice.bid > 0) {
        rates.GBPUSD = (gbpusdPrice.bid + gbpusdPrice.ask) / 2;
      }
      
      // AUDUSD - para pares AUD cross
      const audusdPrice = await this.adapter.getPrice("AUDUSD");
      if (audusdPrice && audusdPrice.bid > 0) {
        rates.AUDUSD = (audusdPrice.bid + audusdPrice.ask) / 2;
      }
      
      // ============= CORREÇÃO 2026-01-14: PARES USD_BASE =============
      
      // USDCAD - essencial para USDCAD e pares CAD cross
      const usdcadPrice = await this.adapter.getPrice("USDCAD");
      if (usdcadPrice && usdcadPrice.bid > 0) {
        rates.USDCAD = (usdcadPrice.bid + usdcadPrice.ask) / 2;
      }
      
      // USDCHF - essencial para USDCHF e pares CHF cross
      const usdchfPrice = await this.adapter.getPrice("USDCHF");
      if (usdchfPrice && usdchfPrice.bid > 0) {
        rates.USDCHF = (usdchfPrice.bid + usdchfPrice.ask) / 2;
      }
      
      // NZDUSD - para pares NZD cross
      const nzdusdPrice = await this.adapter.getPrice("NZDUSD");
      if (nzdusdPrice && nzdusdPrice.bid > 0) {
        rates.NZDUSD = (nzdusdPrice.bid + nzdusdPrice.ask) / 2;
      }
      
      // ============= FALLBACK: PREÇO ATUAL DO SÍMBOLO =============
      // Se um símbolo foi especificado, obter seu preço atual como fallback
      if (symbol) {
        const currentSymbolPrice = await this.adapter.getPrice(symbol);
        if (currentSymbolPrice && currentSymbolPrice.bid > 0) {
          rates.currentPrice = (currentSymbolPrice.bid + currentSymbolPrice.ask) / 2;
        }
      }
      
      console.log(`[SMCTradingEngine] Taxas de conversão obtidas: USDJPY=${rates.USDJPY?.toFixed(3)}, EURUSD=${rates.EURUSD?.toFixed(5)}, GBPUSD=${rates.GBPUSD?.toFixed(5)}, USDCAD=${rates.USDCAD?.toFixed(5)}, USDCHF=${rates.USDCHF?.toFixed(5)}`);
    } catch (error) {
      console.warn(`[SMCTradingEngine] Erro ao obter taxas de conversão:`, error);
      // NÃO usar fallbacks estimados - melhor bloquear do que calcular errado
      // O RiskManager vai detectar pip value 0 e bloquear a operação
    }
    
    return rates;
  }
  
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
      
      // CORREÇÃO AUDITORIA 2026-02-02: Normalizar tipos numéricos antes de retornar
      if (result[0]) {
        return this.normalizeConfigTypes(result[0]);
      }
      
      return null;
    } catch (error) {
      console.error("[SMCTradingEngine] Erro ao carregar SMC config:", error);
      return null;
    }
  }
  
  /**
   * Normaliza tipos numéricos da configuração do banco de dados
   * 
   * CORREÇÃO AUDITORIA 2026-02-02:
   * Centraliza a conversão de tipos em um único ponto para evitar erros
   * matemáticos causados por concatenação de strings (ex: "2.0" + 0.1 = "2.00.1").
   * 
   * Valores Decimal do MySQL chegam como strings e precisam ser convertidos
   * para number antes de serem usados em cálculos.
   * 
   * @param config - Configuração bruta do banco de dados
   * @returns Configuração com tipos normalizados
   */
  private normalizeConfigTypes(config: any): any {
    if (!config) return config;
    
    // Lista de campos que devem ser convertidos para number
    const numericFields = [
      'chochMinPips',
      'sweepBufferPips',
      'riskPercentage',
      'dailyLossLimitPercent',
      'stopLossBufferPips',
      'rewardRiskRatio',
      'orderBlockExtensionPips',
      'maxSpreadPips',
      'trailingTriggerPips',
      'trailingStepPips',
      'rejectionWickPercent',
      'maxTotalExposurePercent',
    ];
    
    // Lista de campos que devem ser convertidos para integer
    const integerFields = [
      'swingH1Lookback',
      'chochM15Lookback',
      'orderBlockLookback',
      'fractalLeftBars',
      'fractalRightBars',
      'maxOpenTrades',
      'sweepValidationMinutes',
      'maxTradesPerSymbol',
    ];
    
    // Lista de campos que devem ser convertidos para boolean
    const booleanFields = [
      'trailingEnabled',
      'sessionFilterEnabled',
      'spreadFilterEnabled',
      'circuitBreakerEnabled',
      'tradingBlockedToday',
      'verboseLogging',
      'chochAcceptWickBreak',
    ];
    
    const normalized = { ...config };
    
    // Converter campos numéricos (float)
    for (const field of numericFields) {
      if (normalized[field] !== undefined && normalized[field] !== null) {
        if (typeof normalized[field] === 'string') {
          normalized[field] = parseFloat(normalized[field]);
        }
      }
    }
    
    // Converter campos inteiros
    for (const field of integerFields) {
      if (normalized[field] !== undefined && normalized[field] !== null) {
        if (typeof normalized[field] === 'string') {
          normalized[field] = parseInt(normalized[field], 10);
        }
      }
    }
    
    // Converter campos booleanos
    for (const field of booleanFields) {
      if (normalized[field] !== undefined && normalized[field] !== null) {
        if (typeof normalized[field] === 'string') {
          normalized[field] = normalized[field] === 'true' || normalized[field] === '1';
        } else if (typeof normalized[field] === 'number') {
          normalized[field] = normalized[field] === 1;
        }
      }
    }
    
    // Log de normalização (apenas em modo debug)
    console.log(`[SMCTradingEngine] ✅ Configuração normalizada | chochMinPips: ${typeof normalized.chochMinPips} = ${normalized.chochMinPips} | trailingEnabled: ${typeof normalized.trailingEnabled} = ${normalized.trailingEnabled}`);
    
    return normalized;
  }
  
  /**
   * Inicializa a estratégia baseada na configuração
   * 
   * CORREÇÃO: Agora loga todas as configurações carregadas do banco
   * para facilitar debug e garantir que a UI está sendo respeitada.
   */
  private async initializeStrategy(): Promise<void> {
    // Carregar configuração SMC do banco
    const smcConfig = await this.getSMCConfigFromDB();
    
    // DEBUG: Log detalhado das configurações carregadas do banco
    console.log(`[SMCTradingEngine] ========== CONFIGURAÇÕES DO BANCO ==========`);
    if (smcConfig) {
      console.log(`[SMCTradingEngine] structureTimeframe: ${smcConfig.structureTimeframe}`);
      console.log(`[SMCTradingEngine] chochMinPips: ${smcConfig.chochMinPips}`);
      console.log(`[SMCTradingEngine] sweepBufferPips: ${smcConfig.sweepBufferPips}`);
      console.log(`[SMCTradingEngine] riskPercentage: ${smcConfig.riskPercentage}`);
      console.log(`[SMCTradingEngine] maxOpenTrades: ${smcConfig.maxOpenTrades}`);
      console.log(`[SMCTradingEngine] rewardRiskRatio: ${smcConfig.rewardRiskRatio}`);
      console.log(`[SMCTradingEngine] fractalLeftBars: ${smcConfig.fractalLeftBars}`);
      console.log(`[SMCTradingEngine] fractalRightBars: ${smcConfig.fractalRightBars}`);
      console.log(`[SMCTradingEngine] swingH1Lookback: ${smcConfig.swingH1Lookback}`);
      console.log(`[SMCTradingEngine] chochM15Lookback: ${smcConfig.chochM15Lookback}`);
      console.log(`[SMCTradingEngine] hybridMode: ${smcConfig.hybridMode}`);
      console.log(`[SMCTradingEngine] ⚠️ REQUISITOS CALCULADOS: H1=${(smcConfig.swingH1Lookback || 30) + 10}, M15=${(smcConfig.chochM15Lookback || 15) + 10}, M5=20`);
    } else {
      console.log(`[SMCTradingEngine] AVISO: smcConfig é NULL! Usando valores padrão.`);
    }
    console.log(`[SMCTradingEngine] ================================================`);
    
    // Criar estratégia usando a factory
    this.strategy = strategyFactory.createStrategy(this.config.strategyType, smcConfig);
    
    console.log(`[SMCTradingEngine] Estratégia inicializada: ${this.config.strategyType}`);
    
    // LOGGING: Inicializar logger estruturado para SMC Strategy
    if (this.strategy instanceof SMCStrategy) {
      console.log(`[SMCTradingEngine] Inicializando logger estruturado para SMC Strategy...`);
      this.strategy.initializeLogger(this.config.userId, this.config.botId);
      console.log(`[SMCTradingEngine] ✅ Logger estruturado inicializado com sucesso`);
      
      // CORREÇÃO 2026-02-04: Integrar InstitutionalLogger se modo institucional estiver ativado
      const strategyConfig = this.strategy.getConfig();
      console.log(`[SMCTradingEngine] [INST] Verificando modo institucional: ${strategyConfig.institutionalModeEnabled}`);
      
      if (strategyConfig.institutionalModeEnabled === true) {
        this.institutionalLogger = new InstitutionalLogger(this.config.userId, this.config.botId);
        this.strategy.setInstitutionalLogCallback(this.institutionalLogger.createLogCallback());
        console.log(`[SMCTradingEngine] ✅ InstitutionalLogger integrado ao SMCStrategy`);
        
        // Emitir log SMC_INST_STATUS no boot para cada símbolo
        for (const symbol of this.config.symbols) {
          // CORREÇÃO: Usar o método correto que agora existe
          const fsmState = this.strategy.getInstitutionalFSMState(symbol);
          const tradesCount = this.strategy.getInstitutionalTradesThisSession(symbol);
          const currentSession = this.strategy.getInstitutionalCurrentSession(symbol);
          
          console.log(`[SMCTradingEngine] [INST] Boot status para ${symbol}: FSM=${fsmState}, Trades=${tradesCount}, Session=${currentSession}`);
          
          this.institutionalLogger.logStatus(
            symbol,
            true, // enabled
            currentSession as any, // sessão atual (pode ser OFF_SESSION no boot)
            fsmState || 'IDLE',
            tradesCount,
            strategyConfig.maxTradesPerSession || 3
          );
        }
      } else {
        console.log(`[SMCTradingEngine] [INST] Modo institucional DESATIVADO - InstitutionalLogger não será inicializado`);
      }
    }
  }
  
  /**
   * Inicializa o Risk Manager
   */
  private async initializeRiskManager(): Promise<void> {
    const smcConfig = await this.getSMCConfigFromDB();
    
    // DEBUG: Log das configuracoes carregadas do banco na inicializacao
    console.log(`[SMCTradingEngine] [Init] DEBUG - Configuracoes SMC do banco:`);
    if (smcConfig) {
      console.log(`[SMCTradingEngine] [Init] DEBUG - londonSessionStart: "${smcConfig.londonSessionStart}"`);
      console.log(`[SMCTradingEngine] [Init] DEBUG - londonSessionEnd: "${smcConfig.londonSessionEnd}"`);
      console.log(`[SMCTradingEngine] [Init] DEBUG - nySessionStart: "${smcConfig.nySessionStart}"`);
      console.log(`[SMCTradingEngine] [Init] DEBUG - nySessionEnd: "${smcConfig.nySessionEnd}"`);
    } else {
      console.log(`[SMCTradingEngine] [Init] DEBUG - smcConfig e NULL! Usando defaults.`);
    }
    
    // CORRECAO: Usar ?? em vez de || para preservar strings vazias e valores falsy validos
    // CORREÇÃO 2026-02-06: Adicionar sessionMode MULTI para SMC
    const riskConfig: RiskManagerConfig = {
      userId: this.config.userId,
      botId: this.config.botId,
      riskPercentage: smcConfig?.riskPercentage ? Number(smcConfig.riskPercentage) : DEFAULT_RISK_CONFIG.riskPercentage,
      maxOpenTrades: smcConfig?.maxOpenTrades ?? DEFAULT_RISK_CONFIG.maxOpenTrades,
      dailyLossLimitPercent: smcConfig?.dailyLossLimitPercent ? Number(smcConfig.dailyLossLimitPercent) : DEFAULT_RISK_CONFIG.dailyLossLimitPercent,
      sessionFilterEnabled: smcConfig?.sessionFilterEnabled ?? DEFAULT_RISK_CONFIG.sessionFilterEnabled,
      sessionMode: "MULTI",
      londonSessionStart: smcConfig?.londonSessionStart ?? DEFAULT_RISK_CONFIG.londonSessionStart,
      londonSessionEnd: smcConfig?.londonSessionEnd ?? DEFAULT_RISK_CONFIG.londonSessionEnd,
      nySessionStart: smcConfig?.nySessionStart ?? DEFAULT_RISK_CONFIG.nySessionStart,
      nySessionEnd: smcConfig?.nySessionEnd ?? DEFAULT_RISK_CONFIG.nySessionEnd,
      circuitBreakerEnabled: smcConfig?.circuitBreakerEnabled ?? DEFAULT_RISK_CONFIG.circuitBreakerEnabled,
    };
    
    console.log(`[SMCTradingEngine] [Init] DEBUG - RiskConfig final:`, JSON.stringify(riskConfig));
    
    this.riskManager = createRiskManager(riskConfig);
    
    // Obter equity atual da conta
    const accountInfo = await this.adapter.getAccountInfo();
    if (accountInfo?.balance) {
      await this.riskManager.initialize(accountInfo.balance);
    }
    
    console.log("[SMCTradingEngine] Risk Manager inicializado");
  }
  
  /**
   * Carrega dados históricos para todos os timeframes e símbolos
   * 
   * CORREÇÃO P0 2026-02-04: WARM-UP OBRIGATÓRIO
   * - Implementação portada do PR #16 (HybridTradingEngine)
   * - Quantidades FIXAS para garantir boot rápido e consistente:
   *   - H1: 60 candles (50 + 10 folga)
   *   - M15: 40 candles (30 + 10 folga)
   *   - M5: 30 candles (20 + 10 folga)
   * - Logs estruturados: [SMC_INST_WARMUP_READY], [SMC_INST_WARMUP_PARTIAL]
   * - Métricas de fetch por timeframe (tempo em ms)
   * - Gate institucional NÃO bloqueia warm-up
   * 
   * CORREÇÃO 2026-01-13: Implementado Retry Logic e Fail-Safe
   * - Cada símbolo tem até 3 tentativas de download
   * - Falha em um símbolo NÃO interrompe o download dos demais
   * - Delay progressivo entre tentativas (backoff)
   * - Log detalhado de sucesso/falha por símbolo
   */
  private async loadHistoricalData(): Promise<void> {
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`[SMCTradingEngine] 🔥 WARM-UP OBRIGATÓRIO INICIADO`);
    console.log(`[SMCTradingEngine] Símbolos: ${this.config.symbols.length} | ${JSON.stringify(this.config.symbols)}`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    const MAX_RETRIES = 3;
    const DELAY_BETWEEN_REQUESTS = 1500; // 1.5s entre cada requisição de timeframe
    const DELAY_BETWEEN_SYMBOLS = 2000;  // 2s entre cada símbolo
    const RATE_LIMIT_RETRY_DELAY = 5000; // 5s de espera se receber Rate Limit
    
    // CORREÇÃO P0 2026-02-04: QUANTIDADES FIXAS para warm-up obrigatório
    // CORREÇÃO AUDITORIA 2026-02-04: Aumentado M5 para 50 candles
    // Motivo: SMCStrategy usa Math.max(30, swingH1Lookback) para validar candles
    // Se swingH1Lookback=40 (configurável via UI), precisa de 40 candles M5
    // Valores com folga de +10 para garantir margem de segurança
    const REQUIRED_H1 = 60;   // 50 + 10 folga
    const REQUIRED_M15 = 50;  // 40 + 10 folga (CORRIGIDO: era 40)
    const REQUIRED_M5 = 50;   // 40 + 10 folga (CORRIGIDO: era 30)
    
    // Mínimos absolutos (sem folga) para validação
    // CORREÇÃO AUDITORIA 2026-02-04: Aumentado para suportar swingH1Lookback até 40
    const MIN_H1 = 50;
    const MIN_M15 = 40;  // CORRIGIDO: era 30
    const MIN_M5 = 40;   // CORRIGIDO: era 20
    
    console.log(`[SMCTradingEngine] 📊 Requisitos de Warm-Up: H1=${REQUIRED_H1} (min ${MIN_H1}), M15=${REQUIRED_M15} (min ${MIN_M15}), M5=${REQUIRED_M5} (min ${MIN_M5})`);
    
    // Helper para detectar erro de Rate Limit
    const isRateLimitError = (error: any): boolean => {
      const errorStr = String(error).toLowerCase();
      return errorStr.includes('429') || 
             errorStr.includes('rate') || 
             errorStr.includes('limit') ||
             errorStr.includes('frequency') ||
             errorStr.includes('too many');
    };
    const successfulSymbols: string[] = [];
    const failedSymbols: string[] = [];
    
    for (let i = 0; i < this.config.symbols.length; i++) {
      const symbol = this.config.symbols[i];
      let symbolSuccess = false;
      
      console.log(`[SMCTradingEngine] [${i + 1}/${this.config.symbols.length}] 🔄 Warm-Up: ${symbol}...`);
      const symbolStartTime = Date.now();
      
      // RETRY LOOP: Tentar até MAX_RETRIES vezes
      for (let attempt = 1; attempt <= MAX_RETRIES && !symbolSuccess; attempt++) {
        try {
          if (attempt > 1) {
            console.log(`[SMCTradingEngine] 🔄 ${symbol}: Tentativa ${attempt}/${MAX_RETRIES}...`);
          }
          
          // Carregar H1 (getTrendbars) - CORREÇÃO P0: quantidade fixa
          const h1FetchStart = Date.now();
          const h1Candles = await this.adapter.getCandleHistory(symbol, "H1", REQUIRED_H1);
          const h1FetchTime = Date.now() - h1FetchStart;
          this.timeframeData.h1.set(symbol, h1Candles);
          console.log(`[SMCTradingEngine] ${symbol} H1: ${h1Candles.length}/${REQUIRED_H1} candles (${h1FetchTime}ms)`);
          await sleep(DELAY_BETWEEN_REQUESTS);
          
          // Carregar M15 (getTrendbars) - CORREÇÃO P0: quantidade fixa
          const m15FetchStart = Date.now();
          const m15Candles = await this.adapter.getCandleHistory(symbol, "M15", REQUIRED_M15);
          const m15FetchTime = Date.now() - m15FetchStart;
          this.timeframeData.m15.set(symbol, m15Candles);
          console.log(`[SMCTradingEngine] ${symbol} M15: ${m15Candles.length}/${REQUIRED_M15} candles (${m15FetchTime}ms)`);
          await sleep(DELAY_BETWEEN_REQUESTS);
          
          // Carregar M5 (getTrendbars) - CORREÇÃO P0: quantidade fixa
          const m5FetchStart = Date.now();
          const m5Candles = await this.adapter.getCandleHistory(symbol, "M5", REQUIRED_M5);
          const m5FetchTime = Date.now() - m5FetchStart;
          this.timeframeData.m5.set(symbol, m5Candles);
          console.log(`[SMCTradingEngine] ${symbol} M5: ${m5Candles.length}/${REQUIRED_M5} candles (${m5FetchTime}ms)`);
          
          const symbolElapsedTime = Date.now() - symbolStartTime;
          
          // Verificar se os dados são suficientes (mínimo sem folga)
          const isValid = h1Candles.length >= MIN_H1 && m15Candles.length >= MIN_M15 && m5Candles.length >= MIN_M5;
          
          if (isValid) {
            // LOG ESTRUTURADO P0: WARMUP_READY
            console.log(`[SMC_INST_WARMUP_READY] ${symbol}: H1=${h1Candles.length} M15=${m15Candles.length} M5=${m5Candles.length} time=${symbolElapsedTime}ms`);
            successfulSymbols.push(symbol);
            symbolSuccess = true;
          } else {
            console.warn(`[SMCTradingEngine] ⚠️ ${symbol}: Dados insuficientes - H1=${h1Candles.length}/${MIN_H1}, M15=${m15Candles.length}/${MIN_M15}, M5=${m5Candles.length}/${MIN_M5}`);
            if (attempt === MAX_RETRIES) {
              // Na última tentativa, aceitar dados parciais
              // LOG ESTRUTURADO P0: WARMUP_PARTIAL
              console.warn(`[SMC_INST_WARMUP_PARTIAL] ${symbol}: H1=${h1Candles.length} M15=${m15Candles.length} M5=${m5Candles.length} reason=MAX_RETRIES_REACHED`);
              successfulSymbols.push(symbol);
              symbolSuccess = true;
            }
          }
          
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`[SMCTradingEngine] ❌ ${symbol}: Erro na tentativa ${attempt}/${MAX_RETRIES}: ${errorMsg}`);
          
          // Se for Rate Limit, esperar mais tempo antes de tentar novamente
          if (isRateLimitError(error)) {
            console.warn(`[SMCTradingEngine] ⏳ ${symbol}: Rate Limit detectado! Aguardando ${RATE_LIMIT_RETRY_DELAY/1000}s...`);
            await sleep(RATE_LIMIT_RETRY_DELAY);
          } else if (attempt < MAX_RETRIES) {
            // Para outros erros, esperar um pouco antes de tentar novamente
            await sleep(DELAY_BETWEEN_REQUESTS * 2);
          }
          
          // Se for a última tentativa, marcar como falha
          if (attempt === MAX_RETRIES) {
            console.error(`[SMCTradingEngine] ❌ ${symbol}: FALHA DEFINITIVA após ${MAX_RETRIES} tentativas`);
            failedSymbols.push(symbol);
          }
        }
      }
      
      // Delay antes do próximo símbolo (exceto no último)
      if (i < this.config.symbols.length - 1) {
        await sleep(DELAY_BETWEEN_SYMBOLS);
      }
    }
    
    // RESUMO FINAL
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`[SMCTradingEngine] 📊 RESUMO DO CARREGAMENTO DE DADOS`);
    console.log(`[SMCTradingEngine] ✅ Sucesso: ${successfulSymbols.length}/${this.config.symbols.length} símbolos`);
    console.log(`[SMCTradingEngine] ✅ Símbolos OK: ${successfulSymbols.join(", ") || "Nenhum"}`);
    if (failedSymbols.length > 0) {
      console.log(`[SMCTradingEngine] ❌ Falhas: ${failedSymbols.length} símbolos`);
      console.log(`[SMCTradingEngine] ❌ Símbolos com falha: ${failedSymbols.join(", ")}`);
    }
    console.log("═══════════════════════════════════════════════════════════════");
    
    // Gravar log no banco de dados
    await this.logInfo(
      `📊 Dados históricos carregados | Sucesso: ${successfulSymbols.length}/${this.config.symbols.length} | Falhas: ${failedSymbols.length}`,
      "SYSTEM",
      { successfulSymbols, failedSymbols }
    );
  }
  
  /**
   * Subscreve a preços em tempo real de todos os símbolos
   * 
   * CORREÇÃO: Agora suporta qualquer número de símbolos (10+)
   */
  private async subscribeToAllPrices(): Promise<void> {
    console.log(`[SMCTradingEngine] 📡 Iniciando subscrição de preços para ${this.config.symbols.length} símbolos...`);
    console.log(`[SMCTradingEngine] Símbolos a subscrever: ${JSON.stringify(this.config.symbols)}`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const symbol of this.config.symbols) {
      try {
        await this.adapter.subscribePrice(symbol, (tick) => {
          this.onPriceTick(symbol, tick);
        });
        
        this.priceSubscriptions.add(symbol);
        successCount++;
        console.log(`[SMCTradingEngine] ✅ Subscrito a preços de ${symbol} (${successCount}/${this.config.symbols.length})`);
        
        // Pequeno delay entre subscrições para evitar rate limit
        await sleep(100);
        
      } catch (error) {
        errorCount++;
        console.error(`[SMCTradingEngine] ❌ Erro ao subscrever ${symbol}:`, error);
      }
    }
    
    console.log(`[SMCTradingEngine] 📊 Subscrição concluída: ${successCount} sucesso, ${errorCount} erros`);
    console.log(`[SMCTradingEngine] Símbolos ativos: ${Array.from(this.priceSubscriptions).join(', ')}`);
  }
  
  /**
   * Cancela todas as subscrições de preços
   * 
   * CORREÇÃO: Agora loga claramente o processo de unsubscribe
   */
  private async unsubscribeFromAllPrices(): Promise<void> {
    const symbols = Array.from(this.priceSubscriptions);
    console.log(`[SMCTradingEngine] 🚫 Cancelando subscrições de ${symbols.length} símbolos...`);
    console.log(`[SMCTradingEngine] Símbolos a cancelar: ${JSON.stringify(symbols)}`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const symbol of symbols) {
      try {
        await this.adapter.unsubscribePrice(symbol);
        successCount++;
      } catch (error) {
        errorCount++;
        console.error(`[SMCTradingEngine] ❌ Erro ao cancelar subscrição de ${symbol}:`, error);
      }
    }
    
    this.priceSubscriptions.clear();
    console.log(`[SMCTradingEngine] 📊 Unsubscribe concluído: ${successCount} sucesso, ${errorCount} erros`);
  }
  
  /**
   * Processa tick de preço recebido
   * 
   * AUDITORIA: Implementação de medição de latência conforme recomendação crítica.
   * Grava timestamp quando tick chega e compara com timestamp após processamento.
   */
  private onPriceTick(symbol: string, tick: { bid: number; ask: number; timestamp: number }): void {
    // [PERFORMANCE] Iniciar medição de latência - Timestamp de chegada do tick
    const tickArrivalTime = performance.now();
    
    if (!this._isRunning) return;
    
    this.lastTickPrice = tick.bid;
    this.lastTickTime = tick.timestamp;
    this.currentSymbol = symbol;
    this.tickCount++;
    
    const now = Date.now();
    const spread = tick.ask - tick.bid;
    // CORREÇÃO: Usar getPipValue() para cálculo correto de spread para todos os símbolos
    // Antes: spreadPips = spread * 10000 (incorreto para XAUUSD - gerava 1000 pips para spread de $0.10)
    // Agora: spreadPips = spread / pipValue (correto - gera 1 pip para spread de $0.10)
    const pipValue = this.getPipValue(symbol);
    const spreadPips = spread / pipValue;
    
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
    
    // [PERFORMANCE] Finalizar medição de latência - Timestamp após processamento
    const tickProcessingEndTime = performance.now();
    const processingTime = tickProcessingEndTime - tickArrivalTime;
    
    // Atualizar métricas de performance
    this.updatePerformanceMetrics(processingTime, symbol);
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
  
  // ============= CORREÇÃO AUDITORIA: TRAILING STOP =============
  
  /**
   * Inicia loop de trailing stop
   * 
   * CORREÇÃO AUDITORIA 2026-02-02:
   * Implementação do loop de trailing stop que estava faltando no SMCTradingEngine.
   * O método calculateTrailingStop já existia na SMCStrategy, mas não era chamado.
   * 
   * Comportamento:
   * - Verifica trailing stop a cada 5 segundos
   * - Só executa se trailingEnabled === true na configuração
   * - Só atualiza posições que pertencem aos símbolos monitorados por este engine
   */
  private startTrailingStopLoop(): void {
    // Verificar trailing stop a cada 5 segundos
    const trailingIntervalMs = 5000;
    
    this.trailingStopInterval = setInterval(() => {
      this.updateTrailingStops();
    }, trailingIntervalMs);
    
    console.log(`[SMCTradingEngine] Loop de trailing stop iniciado (intervalo: ${trailingIntervalMs / 1000}s)`);
  }
  
  /**
   * Atualiza trailing stops de todas as posições abertas
   * 
   * CORREÇÃO AUDITORIA 2026-02-02:
   * Este método verifica todas as posições abertas e atualiza o stop loss
   * conforme a lógica de trailing stop da estratégia SMC.
   * 
   * Condições para atualização:
   * 1. Engine deve estar rodando
   * 2. trailingEnabled deve estar true na configuração da estratégia
   * 3. Posição deve pertencer a um símbolo monitorado por este engine
   * 4. Lucro em pips deve ser >= trailingTriggerPips
   * 5. Novo stop loss deve ser melhor que o atual
   */
  private async updateTrailingStops(): Promise<void> {
    if (!this._isRunning || !this.strategy) return;
    
    // Verificar se a estratégia é SMC e se trailing está habilitado
    if (!(this.strategy instanceof SMCStrategy)) return;
    
    const smcStrategy = this.strategy as SMCStrategy;
    const strategyConfig = smcStrategy.getConfig();
    if (!strategyConfig.trailingEnabled) return;
    
    try {
      const positions = await this.adapter.getOpenPositions();
      
      for (const position of positions) {
        // Só processar posições dos símbolos monitorados por este engine
        if (!this.config.symbols.includes(position.symbol)) continue;
        
        // Obter preço atual e pip value
        const currentPrice = await this.adapter.getPrice(position.symbol);
        if (!currentPrice || currentPrice.bid <= 0) continue;
        
        const pipValue = this.getPipValue(position.symbol);
        const price = position.direction === "BUY" ? currentPrice.bid : currentPrice.ask;
        
        // Calcular trailing stop usando a estratégia SMC
        const result = smcStrategy.calculateTrailingStop(
          position.entryPrice,
          price,
          position.stopLoss || position.entryPrice,
          position.direction === "BUY" ? TradeSide.BUY : TradeSide.SELL,
          pipValue
        );
        
        // Se deve atualizar, modificar a posição
        if (result.shouldUpdate) {
          const updated = await this.adapter.modifyPosition({
            positionId: position.positionId,
            stopLoss: result.newStopLoss,
          });
          
          if (updated) {
            console.log(`[SMCTradingEngine] 📈 Trailing stop atualizado para ${position.symbol} | Posição: ${position.positionId} | Novo SL: ${result.newStopLoss.toFixed(5)} | Lucro: ${result.profitPips.toFixed(1)} pips`);
            
            // Log no banco de dados
            await this.logInfo(
              `📈 Trailing Stop atualizado | ${position.symbol} | SL: ${result.newStopLoss.toFixed(5)} | Lucro: ${result.profitPips.toFixed(1)} pips`,
              "TRADE",
              { positionId: position.positionId, newStopLoss: result.newStopLoss, profitPips: result.profitPips }
            );
          }
        }
      }
    } catch (error) {
      // Silenciar erros de trailing stop para não poluir logs
      // Apenas logar em modo verbose
      if (strategyConfig.verboseLogging) {
        console.warn(`[SMCTradingEngine] Erro ao atualizar trailing stops:`, error);
      }
    }
  }
  
  /**
   * Atualiza dados de timeframes
   * NOTA: Usa loop sequencial com delay para evitar REQUEST_FREQUENCY_EXCEEDED
   */
  private async refreshTimeframeData(): Promise<void> {
    if (!this._isRunning) return;
    
    console.log("[SMCTradingEngine] Atualizando dados de timeframes (com delay entre requisições)...");
    
    for (let i = 0; i < this.config.symbols.length; i++) {
      const symbol = this.config.symbols[i];
      if (!this._isRunning) return; // Verifica se ainda está rodando a cada iteração
      
      try {
        // Atualizar apenas os últimos candles - SEQUENCIAL COM DELAY
        const h1Candles = await this.adapter.getCandleHistory(symbol, "H1", 50);
        this.mergeCandles(symbol, "h1", h1Candles);
        await sleep(API_REQUEST_DELAY_MS); // Delay para evitar rate limit
        
        const m15Candles = await this.adapter.getCandleHistory(symbol, "M15", 50);
        this.mergeCandles(symbol, "m15", m15Candles);
        await sleep(API_REQUEST_DELAY_MS); // Delay para evitar rate limit
        
        const m5Candles = await this.adapter.getCandleHistory(symbol, "M5", 50);
        this.mergeCandles(symbol, "m5", m5Candles);
        
        console.log(`[SMCTradingEngine] ${symbol}: dados atualizados`);
        
        // Delay antes do próximo símbolo (exceto no último)
        if (i < this.config.symbols.length - 1) {
          await sleep(API_REQUEST_DELAY_MS);
        }
        
      } catch (error) {
        console.error(`[SMCTradingEngine] Erro ao atualizar dados de ${symbol}:`, error);
        // Aguardar antes de tentar o próximo símbolo mesmo em caso de erro
        await sleep(API_REQUEST_DELAY_MS);
      }
    }
    
    console.log("[SMCTradingEngine] ✅ Atualização de dados concluída");
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
   * 
   * CORREÇÃO: Agora loga claramente quantos símbolos estão sendo analisados
   */
  private async performAnalysis(): Promise<void> {
    if (!this._isRunning || !this.strategy) return;
    
    const now = Date.now();
    this.lastAnalysisTime = now;
    this.analysisCount++;
    
    // LOG ESTRUTURADO: Heartbeat a cada 10 ciclos (5 minutos)
    if (this.analysisCount % 10 === 0) {
      console.log(`[SMCTradingEngine] 🔍 Análise #${this.analysisCount} | Símbolos: ${this.config.symbols.length} | Lista: ${this.config.symbols.join(', ')}`);
      
      // Gravar log estruturado no banco
      await this.logInfo(
        `🟢 BOT ATIVO - ANALISANDO MERCADO | Análise #${this.analysisCount} | Símbolos: ${this.config.symbols.join(', ')}`,
        "SYSTEM",
        {
          status: "ACTIVE_ANALYZING",
          analysisCount: this.analysisCount,
          symbols: this.config.symbols,
          symbolCount: this.config.symbols.length,
        }
      );
    }
    
    // Verificar se pode operar
    if (this.riskManager) {
      const canOpen = await this.riskManager.canOpenPosition();
      if (!canOpen.allowed) {
        // LOG ESTRUTURADO: Heartbeat quando fora de sessão
        if (this.analysisCount % 10 === 0) { // Log a cada 10 análises (5 minutos)
          console.log(`[SMCTradingEngine] ⚠️ ${canOpen.reason}`);
          
          // Gravar log estruturado no banco
          await this.logInfo(
            `🤖 BOT ATIVO - AGUARDANDO | ${canOpen.reason} | Símbolos monitorados: ${this.config.symbols.join(', ')}`,
            "SYSTEM",
            {
              status: "STANDBY",
              reason: canOpen.reason,
              symbols: this.config.symbols,
              analysisCount: this.analysisCount,
            }
          );
        }
        return;
      }
    }
    
    // Analisar cada símbolo e coletar estatísticas
    const symbolsWithInsufficientData: string[] = [];
    let minH1Candles = 999;
    let minM15Candles = 999;
    let minM5Candles = 999;
    
    // Obter requisitos mínimos da estratégia (consistente com SMCStrategy.hasAllTimeframeData)
    let requiredH1 = 50;
    let requiredM15 = 30;
    let requiredM5 = 20;
    
    if (this.strategy instanceof SMCStrategy) {
      const smcConfig = this.strategy.getConfig();
      
      // OTIMIZAÇÃO: Logs de DEBUG removidos para reduzir rate limiting
      
      if (smcConfig) {
        requiredH1 = (smcConfig.swingH1Lookback || 30) + 10;
        requiredM15 = (smcConfig.chochM15Lookback || 15) + 10;
        requiredM5 = 20; // M5 é fixo
        
        // OTIMIZAÇÃO: Logs de CONFIG DA UI removidos para reduzir rate limiting
      }
      // OTIMIZAÇÃO: Logs de fallback removidos para reduzir rate limiting
    }
    
    for (const symbol of this.config.symbols) {
      try {
        // Verificar dados antes de analisar
        const h1Data = this.timeframeData.h1.get(symbol) || [];
        const m15Data = this.timeframeData.m15.get(symbol) || [];
        const m5Data = this.timeframeData.m5.get(symbol) || [];
        
        if (h1Data.length < requiredH1 || m15Data.length < requiredM15 || m5Data.length < requiredM5) {
          symbolsWithInsufficientData.push(symbol);
          minH1Candles = Math.min(minH1Candles, h1Data.length);
          minM15Candles = Math.min(minM15Candles, m15Data.length);
          minM5Candles = Math.min(minM5Candles, m5Data.length);
        }
        
        await this.analyzeSymbol(symbol);
      } catch (error) {
        console.error(`[SMCTradingEngine] Erro ao analisar ${symbol}:`, error);
      }
    }
    
    // LOG AGREGADO: Se múltiplos símbolos têm dados insuficientes, mostrar resumo
    if (symbolsWithInsufficientData.length > 0 && this.analysisCount % 10 === 0) {
      await this.logInfo(
        `⚠️ AGUARDANDO DADOS | ${symbolsWithInsufficientData.length} símbolos com dados insuficientes | H1: ${minH1Candles}/${requiredH1} | M15: ${minM15Candles}/${requiredM15} | M5: ${minM5Candles}/${requiredM5} | Símbolos: ${symbolsWithInsufficientData.join(', ')}`,
        "SYSTEM",
        {
          status: "WAITING_DATA",
          symbolsCount: symbolsWithInsufficientData.length,
          symbols: symbolsWithInsufficientData,
          minH1Candles,
          requiredH1,
          minM15Candles,
          requiredM15,
          minM5Candles,
          requiredM5,
        }
      );
    }
  }
  
  /**
   * Analisa um símbolo com dados MTF fornecidos externamente
   * 
   * REFATORAÇÃO 2026-01-14: Método público para uso em backtest
   * Permite que o BacktestRunner forneça os dados históricos diretamente
   * 
   * @param symbol - Símbolo a analisar
   * @param mtfData - Dados multi-timeframe (H1, M15, M5)
   * @returns Sinal gerado pela estratégia
   */
  public async analyzeWithData(
    symbol: string,
    mtfData: MultiTimeframeData
  ): Promise<SignalResult | null> {
    if (!this.strategy) {
      console.warn("[SMCTradingEngine] Estratégia não inicializada");
      return null;
    }
    
    // Verificar dados mínimos
    if (!mtfData.h1 || mtfData.h1.length < 50 ||
        !mtfData.m15 || mtfData.m15.length < 30 ||
        !mtfData.m5 || mtfData.m5.length < 20) {
      return null;
    }
    
    // Configurar símbolo atual na estratégia (se for SMC)
    if (this.strategy instanceof SMCStrategy) {
      this.strategy.setCurrentSymbol(symbol);
    }
    
    // Atualizar dados na estratégia MTF
    if ("updateTimeframeData" in this.strategy) {
      const mtfStrategy = this.strategy as IMultiTimeframeStrategy;
      mtfStrategy.updateTimeframeData("H1", mtfData.h1);
      mtfStrategy.updateTimeframeData("M15", mtfData.m15);
      mtfStrategy.updateTimeframeData("M5", mtfData.m5);
    }
    
    // Analisar sinal
    const signal = this.strategy.analyzeSignal(mtfData.m5, mtfData);
    
    // Se houver sinal válido, executar trade via adapter
    if (signal.signal !== "NONE" && signal.confidence >= 50) {
      await this.executeBacktestTrade(symbol, signal, mtfData);
    }
    
    return signal;
  }
  
  /**
   * Executa trade em modo backtest
   * Usa o adapter injetado (BacktestAdapter em backtest)
   */
  private async executeBacktestTrade(
    symbol: string,
    signal: SignalResult,
    mtfData: MultiTimeframeData
  ): Promise<void> {
    if (!this.adapter) return;
    
    const pipValue = this.getPipValue(symbol);
    const direction = signal.signal === "BUY" ? TradeSide.BUY : TradeSide.SELL;
    const currentPrice = mtfData.currentBid || mtfData.m5![mtfData.m5!.length - 1].close;
    
    // Calcular SL/TP
    const sltp = this.strategy!.calculateSLTP(currentPrice, direction, pipValue, signal.metadata);
    
    // Executar ordem via adapter
    try {
      const result = await this.adapter.placeOrder({
        symbol,
        direction: signal.signal as "BUY" | "SELL",
        orderType: "MARKET",
        lots: this.config.lots,
        stopLossPips: sltp.stopLossPips,
        takeProfitPips: sltp.takeProfitPips,
        comment: `SMC ${signal.signal} | ${signal.reason.substring(0, 50)}`,
      }, this.config.maxSpread);
      
      if (result.success) {
        this.tradesExecuted++;
        console.log(`[SMCTradingEngine] ✅ Backtest trade executado: ${result.orderId}`);
      }
    } catch (error) {
      console.error(`[SMCTradingEngine] Erro ao executar backtest trade:`, error);
    }
  }
  
  /**
   * Inicializa a estratégia para backtest (sem iniciar loops)
   */
  public async initializeForBacktest(): Promise<void> {
    // Inicializar estratégia
    this.strategy = strategyFactory.createStrategy(this.config.strategyType);
    
    // Carregar configurações padrão
    if (this.strategy instanceof SMCStrategy) {
      // Usar configurações padrão para backtest
      console.log("[SMCTradingEngine] Estratégia SMC inicializada para backtest");
    }
    
    console.log("[SMCTradingEngine] ✅ Engine inicializado para backtest");
  }
  
  /**
   * Analisa um símbolo específico
   * 
   * AUDITORIA: Implementação de medição de latência na análise de sinal.
   * Mede o tempo entre início da análise e tomada de decisão.
   */
  private async analyzeSymbol(symbol: string): Promise<void> {
    // [PERFORMANCE] Iniciar medição de latência da análise
    const analysisStartTime = performance.now();
    
    if (!this.strategy) return;
    
    // Obter dados de todos os timeframes
    const h1Data = this.timeframeData.h1.get(symbol) || [];
    const m15Data = this.timeframeData.m15.get(symbol) || [];
    const m5Data = this.timeframeData.m5.get(symbol) || [];
    
    // Obter requisitos mínimos da estratégia (consistente com SMCStrategy.hasAllTimeframeData)
    let requiredH1 = 50;
    let requiredM15 = 30;
    let requiredM5 = 20;
    
    if (this.strategy instanceof SMCStrategy) {
      const smcConfig = this.strategy.getConfig();
      
      // OTIMIZAÇÃO: Logs de DEBUG removidos para reduzir rate limiting
      
      if (smcConfig) {
        requiredH1 = (smcConfig.swingH1Lookback || 30) + 10;
        requiredM15 = (smcConfig.chochM15Lookback || 15) + 10;
        requiredM5 = 20; // M5 é fixo
        
        // OTIMIZAÇÃO: Logs de CONFIG DA UI removidos para reduzir rate limiting
      }
      // OTIMIZAÇÃO: Logs de fallback removidos para reduzir rate limiting
    }
    
    // Verificar se temos dados suficientes
    if (h1Data.length < requiredH1 || m15Data.length < requiredM15 || m5Data.length < requiredM5) {
      // CORREÇÃO P0 2026-02-04: LOG ESTRUTURADO com BLOCK_REASON explícito
      // Log estruturado a cada 100 análises para não poluir
      if (this.analysisCount % 100 === 1) {
        // Determinar qual timeframe está bloqueando
        let blockReason = "INSUFFICIENT_CANDLES";
        if (h1Data.length < requiredH1) blockReason = "INSUFFICIENT_CANDLES_H1";
        else if (m15Data.length < requiredM15) blockReason = "INSUFFICIENT_CANDLES_M15";
        else if (m5Data.length < requiredM5) blockReason = "INSUFFICIENT_CANDLES_M5";
        
        console.log(`[SMC_INST_BLOCK] ${symbol}: BLOCK_REASON=${blockReason} H1=${h1Data.length}/${requiredH1} M15=${m15Data.length}/${requiredM15} M5=${m5Data.length}/${requiredM5}`);
        
        // Gravar no banco de dados para auditoria
        await this.logToDatabase("WARN", "SYSTEM", `[SMC_INST_BLOCK] ${symbol}: ${blockReason}`, { 
          symbol, 
          data: { 
            blockReason,
            h1: h1Data.length, 
            m15: m15Data.length, 
            m5: m5Data.length, 
            requiredH1, 
            requiredM15, 
            requiredM5 
          } 
        });
      }
      return;
    }
    
    // Configurar símbolo atual na estratégia (se for SMC)
    if (this.strategy instanceof SMCStrategy) {
      this.strategy.setCurrentSymbol(symbol);
    }
    
    // Calcular spread atual em pips - AUDITORIA: Filtro de Spread
    // BUG FIX: 2026-01-07 - Obter bid E ask do MESMO símbolo via getPrice()
    // Antes: currentBid usava lastTickPrice que podia ser de OUTRO símbolo!
    // Exemplo do bug: XAUUSD usava bid de GBPUSD (1.34) + ask de XAUUSD (4456)
    // Resultado: spread = (4456 - 1.34) / 0.10 = 44547 pips (ERRADO!)
    const pipValue = this.getPipValue(symbol);
    let currentBid: number | undefined;
    let currentAsk: number | undefined;
    let currentSpreadPips: number | undefined;
    
    try {
      const price = await this.adapter.getPrice(symbol);
      if (price && price.bid > 0 && price.ask > 0) {
        currentBid = price.bid;
        currentAsk = price.ask;
        currentSpreadPips = (currentAsk - currentBid) / pipValue;
      }
    } catch (error) {
      // Fallback para dados de candles se getPrice falhar
      console.warn(`[SMCTradingEngine] Erro ao obter preço para ${symbol}, usando fallback:`, error);
      currentBid = m5Data[m5Data.length - 1]?.close;
      currentAsk = undefined;
      currentSpreadPips = undefined;
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
      currentBid: currentBid,
      currentAsk: currentAsk,
      currentSpreadPips: currentSpreadPips,
    };
    
    // Atualizar dados na estratégia MTF
    if ("updateTimeframeData" in this.strategy) {
      const mtfStrategy = this.strategy as IMultiTimeframeStrategy;
      mtfStrategy.updateTimeframeData("H1", mtfData.h1!);
      mtfStrategy.updateTimeframeData("M15", mtfData.m15!);
      mtfStrategy.updateTimeframeData("M5", mtfData.m5!);
    }
    
    // NOTA: processCandles() é chamado automaticamente pela SMCStrategy.analyzeSignal()
    // NÃO devemos chamá-lo aqui, pois a estratégia já o faz com os parâmetros corretos
    // (m15Data, m5Data, state, currentPrice)
    
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
      // Log de sinal detectado ANTES de tentar executar
      await this.logSignalDetected(
        symbol,
        signal.signal,
        signal.confidence,
        signal.reason,
        signal.indicators
      );
      
      await this.evaluateAndExecuteTrade(symbol, signal);
    }
    
    // [PERFORMANCE] Finalizar medição de latência da análise
    const analysisEndTime = performance.now();
    const analysisLatency = analysisEndTime - analysisStartTime;
    
    // OTIMIZAÇÃO: Log de performance com throttle (a cada 10 análises ou quando houver sinal)
    if (signal.signal !== "NONE" || this.analysisCount % 10 === 0) {
      console.log(`[PERFORMANCE] Tick processado em ${analysisLatency.toFixed(2)}ms | ${symbol} | Sinal: ${signal.signal}`);
    }
    
    // Atualizar métricas de análise
    this.updateAnalysisPerformanceMetrics(analysisLatency, symbol, signal.signal);
    
    // Gravar log de análise no banco de dados para visualização em tempo real
    await this.logAnalysis(symbol, signal.signal, analysisLatency, {
      confidence: signal.confidence,
      reason: signal.reason,
      analysisCount: this.analysisCount,
    });
    
    this.emit("analysis", { symbol, signal, latencyMs: analysisLatency });
  }
  
  /**
   * Avalia e executa trade se condições forem atendidas
   * 
   * CORREÇÃO CRÍTICA v2.0: Implementado controle de concorrência PER-SYMBOL
   * para evitar Race Condition que causava múltiplas ordens duplicadas.
   */
  private async evaluateAndExecuteTrade(symbol: string, signal: SignalResult): Promise<void> {
    const now = Date.now();
    
    // ═══════════════════════════════════════════════════════════════
    // CONTROLE DE CONCORRÊNCIA PER-SYMBOL (MUTEX)
    // ═══════════════════════════════════════════════════════════════
    
    // VERIFICAÇÃO 1: Símbolo já está em processo de execução?
    if (this.isExecutingOrder.get(symbol)) {
      console.log(`[SMCTradingEngine] 🔒 ${symbol}: IGNORADO - Ordem em processamento (mutex ativo)`);
      return;
    }
    
    // VERIFICAÇÃO 2: Cooldown por símbolo
    const lastTrade = this.lastTradeTime.get(symbol) || 0;
    if (now - lastTrade < this.config.cooldownMs) {
      const remaining = Math.ceil((this.config.cooldownMs - (now - lastTrade)) / 1000);
      console.log(`[SMCTradingEngine] ⏳ Cooldown ativo para ${symbol}. Aguardando ${remaining}s...`);
      await this.logFilter("COOLDOWN", symbol, `Aguardando ${remaining}s para próxima operação`, { remainingSeconds: remaining });
      return;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // TRAVAR O SÍMBOLO ANTES DE QUALQUER OPERAÇÃO ASSÍNCRONA
    // ═══════════════════════════════════════════════════════════════
    this.isExecutingOrder.set(symbol, true);
    console.log(`[SMCTradingEngine] 🔐 ${symbol}: TRAVADO para execução`);
    
    try {
    // Verificar com Risk Manager
    if (this.riskManager) {
      const canOpen = await this.riskManager.canOpenPosition();
      if (!canOpen.allowed) {
        console.log(`[SMCTradingEngine] ⚠️ ${canOpen.reason}`);
        await this.logFilter("RISK_MANAGER", symbol, canOpen.reason);
        return;
      }
    }
    
    // Verificar posições abertas (cache local)
    const openPositions = await this.adapter.getOpenPositions();
    const symbolPositions = openPositions.filter(p => p.symbol === symbol);
    
    console.log(`[SMCTradingEngine] 📊 ${symbol}: Posições neste ativo=${symbolPositions.length}, Limite=${this.config.maxTradesPerSymbol}`);
    
    if (symbolPositions.length >= this.config.maxTradesPerSymbol) {
      console.log(`[SMCTradingEngine] ⚠️ ${symbol}: BLOQUEADO - Já existe ${symbolPositions.length} posição(ões) neste ativo (limite: ${this.config.maxTradesPerSymbol})`);
      await this.logFilter("POSITION_EXISTS", symbol, `Já existe ${symbolPositions.length} posição(s) aberta(s) (limite: ${this.config.maxTradesPerSymbol})`, { openPositions: symbolPositions.length, limit: this.config.maxTradesPerSymbol });
      return;
    }
    
    // CORREÇÃO CRÍTICA 2026-01-20: Verificação adicional no banco de dados
    // Esta é uma camada de segurança adicional para evitar race conditions
    if (this.riskManager) {
      const dbSymbolPositions = await this.riskManager.getOpenTradesCountBySymbol(symbol);
      console.log(`[SMCTradingEngine] 📊 ${symbol}: Posições no BANCO DE DADOS=${dbSymbolPositions}, Limite=${this.config.maxTradesPerSymbol}`);
      
      if (dbSymbolPositions >= this.config.maxTradesPerSymbol) {
        console.log(`[SMCTradingEngine] ⚠️ ${symbol}: BLOQUEADO (DB) - Já existe ${dbSymbolPositions} posição(ões) no banco de dados (limite: ${this.config.maxTradesPerSymbol})`);
        await this.logFilter("POSITION_EXISTS_DB", symbol, `Já existe ${dbSymbolPositions} posição(s) no banco de dados (limite: ${this.config.maxTradesPerSymbol})`, { dbPositions: dbSymbolPositions, limit: this.config.maxTradesPerSymbol });
        return;
      }
    }
    
    // Calcular tamanho da posição
    const accountInfo = await this.adapter.getAccountInfo();
    const balance = accountInfo?.balance || 10000;
    
    // Obter pip value para o símbolo
    const pipValue = this.getPipValue(symbol);
    
    // Calcular SL/TP usando a estratégia
    const direction = signal.signal === "BUY" ? TradeSide.BUY : TradeSide.SELL;
    
    // BUG FIX: 2026-01-07 - Obter preço do SÍMBOLO CORRETO via getPrice()
    // Antes: usava lastTickPrice que podia ser de outro símbolo
    let currentPrice = 0;
    let currentSpreadPips: number | undefined;
    try {
      const priceData = await this.adapter.getPrice(symbol);
      if (priceData && priceData.bid > 0 && priceData.ask > 0) {
        // Usar bid para BUY (entry no ask, mas SL/TP calculado a partir do bid)
        // Usar ask para SELL (entry no bid, mas SL/TP calculado a partir do ask)
        currentPrice = direction === TradeSide.BUY ? priceData.ask : priceData.bid;
        currentSpreadPips = (priceData.ask - priceData.bid) / pipValue;
      }
    } catch (e) {
      console.warn(`[SMCTradingEngine] Erro ao obter preço para ${symbol} em evaluateAndExecuteTrade:`, e);
      // Fallback para lastTickPrice apenas se for do mesmo símbolo
      if (this.currentSymbol === symbol && this.lastTickPrice && this.lastTickPrice > 0) {
        currentPrice = this.lastTickPrice;
      }
    }
    
    if (currentPrice <= 0) {
      console.error(`[SMCTradingEngine] Preço inválido para ${symbol}, abortando trade`);
      return;
    }
    
    // Incluir spread no metadata para cálculo de SL
    const metadataWithSpread = {
      ...signal.metadata,
      currentSpreadPips: currentSpreadPips ?? 0,
    };
    
    const sltp = this.strategy!.calculateSLTP(currentPrice, direction, pipValue, metadataWithSpread);
    
    // Calcular tamanho da posição
    // CORREÇÃO: Usar volume mínimo REAL detectado (prioridade sobre API)
    let lotSize = this.config.lots;
    if (this.riskManager && sltp.stopLossPips) {
      try {
        // Obter specs de volume do símbolo da cTrader API
        const symbolInfo = await this.adapter.getSymbolInfo(symbol);
        
        // CORREÇÃO DEFINITIVA: Verificar se temos um volume mínimo REAL detectado
        // Isso é necessário porque algumas contas têm limites diferentes do padrão
        const realMinVolume = this.adapter.getRealMinVolume?.(symbol) ?? 0.01;
        // Converter lotes para cents: 1 lote = 10,000,000 cents
        const realMinVolumeCents = Math.round(realMinVolume * 10000000);
        
        const volumeSpecs = symbolInfo ? {
          // CORREÇÃO: symbolInfo.minVolume já está em cents (da API)
          // Usar o MAIOR entre o minVolume da API e o detectado
          minVolume: Math.max(symbolInfo.minVolume ?? 100000, realMinVolumeCents),
          maxVolume: symbolInfo.maxVolume ?? 100000000000000,
          stepVolume: symbolInfo.stepVolume ?? 100000,
        } : {
          minVolume: realMinVolumeCents,
          maxVolume: 100000000000000, // 10,000 lotes
          stepVolume: 100000,          // 0.01 lotes
        };
        
        console.log(`[SMCTradingEngine] Volume specs para ${symbol}: minVol=${volumeSpecs.minVolume} cents (${volumeSpecs.minVolume/10000000} lotes), realMinDetected=${realMinVolume} lotes`);
        
        // CORREÇÃO CRÍTICA 2026-01-13: Obter taxas de conversão para cálculo correto do pip value
        // CORREÇÃO CRÍTICA 2026-01-14: Passar símbolo para obter currentPrice (essencial para USD_BASE)
        const conversionRates: ConversionRates = await this.getConversionRates(symbol);
        
        const posSize = this.riskManager.calculatePositionSize(balance, sltp.stopLossPips, symbol, conversionRates, volumeSpecs);
        if (posSize.canTrade) {
          lotSize = posSize.lotSize;
          // CORREÇÃO DEFINITIVA: Usar volumeInCents (1 lote = 10,000,000 cents)
          console.log(`[SMCTradingEngine] Volume normalizado: ${lotSize} lotes (${posSize.volumeInCents} cents = ${posSize.volumeInCents/100} unidades)`);
          if (posSize.volumeAdjusted) {
            console.log(`[SMCTradingEngine] ⚠️ Volume ajustado de ${posSize.originalLotSize?.toFixed(4)} para ${lotSize} lotes`);
          }
        } else {
          console.warn(`[SMCTradingEngine] ❌ Não pode operar: ${posSize.reason}`);
          
          // CORREÇÃO: Log adicional para ajudar no diagnóstico
          if (realMinVolume > 1) {
            console.warn(`[SMCTradingEngine] 📊 NOTA: Esta conta tem volume mínimo de ${realMinVolume} lotes`);
            console.warn(`[SMCTradingEngine] 📊 Considere usar uma conta com volume mínimo menor para operar com risco controlado.`);
          }
          
          return; // Abortar trade se não pode calcular volume válido
        }
      } catch (volumeError) {
        console.warn(`[SMCTradingEngine] ⚠️ Erro ao obter specs de volume, usando fallback:`, volumeError);
        // Fallback: usar cálculo sem specs (comportamento anterior)
        // CORREÇÃO CRÍTICA 2026-01-14: Passar símbolo para obter currentPrice
        const conversionRatesFallback: ConversionRates = await this.getConversionRates(symbol);
        const posSize = this.riskManager.calculatePositionSize(balance, sltp.stopLossPips, symbol, conversionRatesFallback);
        if (posSize.canTrade) {
          lotSize = posSize.lotSize;
        }
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
      // TAREFA B: Passar maxSpread para filtro de spread
      const result = await this.adapter.placeOrder({
        symbol,
        direction: signal.signal as "BUY" | "SELL",
        orderType: "MARKET",
        lots: lotSize,
        stopLossPips: sltp.stopLossPips,
        takeProfitPips: sltp.takeProfitPips,
        comment: `SMC ${signal.signal} | ${signal.reason.substring(0, 50)}`,
      }, this.config.maxSpread);
      
      if (result.success) {
        this.lastTradeTime.set(symbol, now);
        this.tradesExecuted++;
        
        console.log(`[SMCTradingEngine] ✅ ORDEM EXECUTADA: ${result.orderId} @ ${result.executionPrice}`);
        
        // Gravar log de entrada usando o novo método
        await this.logEntry(
          symbol,
          signal.signal,
          result.executionPrice || 0,
          lotSize,
          sltp.stopLoss || 0,
          sltp.takeProfit || 0,
          signal.reason
        );
        
        // Gravar log de trade no banco de dados (manter para compatibilidade)
        await this.logTrade(
          `✅ ORDEM EXECUTADA #${result.orderId}`,
          symbol,
          signal.signal,
          {
            orderId: result.orderId,
            executionPrice: result.executionPrice,
            lots: lotSize,
            stopLoss: sltp.stopLoss,
            takeProfit: sltp.takeProfit,
            confidence: signal.confidence,
            reason: signal.reason,
          }
        );
        
        this.emit("trade", {
          symbol,
          signal,
          result,
          timestamp: now,
        });
      } else {
        console.error(`[SMCTradingEngine] ❌ ERRO NA ORDEM: ${result.errorMessage}`);
        
        // Gravar log de erro no banco de dados
        await this.logError(
          `Erro ao executar ordem ${signal.signal} em ${symbol}: ${result.errorMessage}`,
          "TRADE",
          { symbol, signal: signal.signal, error: result.errorMessage }
        );
      }
      
    } catch (error) {
      console.error("[SMCTradingEngine] Erro ao executar ordem:", error);
      
      // Gravar log de erro no banco de dados
      await this.logError(
        `Exceção ao executar ordem ${signal.signal} em ${symbol}: ${(error as Error).message}`,
        "TRADE",
        { symbol, signal: signal.signal, error: (error as Error).message }
      );
    }
    } finally {
      // ═══════════════════════════════════════════════════════════════
      // DESTRAVAR O SÍMBOLO (SEMPRE, mesmo com erro)
      // ═══════════════════════════════════════════════════════════════
      this.isExecutingOrder.set(symbol, false);
      console.log(`[SMCTradingEngine] 🔓 ${symbol}: DESTRAVADO`);
    }
  }
  
  /**
   * Obtém o valor do pip para um símbolo
   * 
   * REFATORAÇÃO: Agora utiliza o módulo centralizado.
   */
  private getPipValue(symbol: string): number {
    return getCentralizedPipValue(symbol);
  }
  
  // ============= MÉTODOS DE MÉTRICAS DE PERFORMANCE (AUDITORIA) =============
  
  /**
   * Atualiza métricas de performance do processamento de ticks
   * 
   * AUDITORIA: Implementação de medição de latência conforme recomendação crítica.
   * Mantém histórico de tempos para cálculo de média, máximo e mínimo.
   */
  private updatePerformanceMetrics(processingTime: number, symbol: string): void {
    this.ticksProcessedWithMetrics++;
    this.lastTickProcessingTime = processingTime;
    
    // Atualizar máximo e mínimo
    if (this.maxTickProcessingTime === null || processingTime > this.maxTickProcessingTime) {
      this.maxTickProcessingTime = processingTime;
    }
    if (this.minTickProcessingTime === null || processingTime < this.minTickProcessingTime) {
      this.minTickProcessingTime = processingTime;
    }
    
    // Manter histórico para cálculo de média
    this.tickProcessingTimes.push(processingTime);
    if (this.tickProcessingTimes.length > this.PERFORMANCE_HISTORY_SIZE) {
      this.tickProcessingTimes.shift();
    }
    
    // Log de alerta se latência exceder 200ms (limite da auditoria)
    if (processingTime > 200) {
      console.warn(`[PERFORMANCE] ⚠️ ALERTA: Latência de tick elevada: ${processingTime.toFixed(2)}ms | ${symbol}`);
    }
  }
  
  /**
   * Atualiza métricas de performance da análise de sinal
   * 
   * AUDITORIA: Mede o tempo entre recebimento do tick e tomada de decisão.
   * Este é o KPI crítico mencionado no relatório de auditoria.
   */
  private updateAnalysisPerformanceMetrics(latency: number, symbol: string, signal: string): void {
    // Log de alerta se latência de análise exceder 200ms
    if (latency > 200) {
      console.warn(`[PERFORMANCE] ⚠️ ALERTA: Latência de análise elevada: ${latency.toFixed(2)}ms | ${symbol} | ${signal}`);
    }
    
    // Emitir evento de performance para monitorização externa
    this.emit("performance", {
      type: "analysis",
      symbol,
      signal,
      latencyMs: latency,
      timestamp: Date.now(),
      withinThreshold: latency < 200,
    });
  }
  
  /**
   * Calcula a média de tempo de processamento de ticks
   */
  private getAverageTickProcessingTime(): number | null {
    if (this.tickProcessingTimes.length === 0) return null;
    const sum = this.tickProcessingTimes.reduce((a, b) => a + b, 0);
    return sum / this.tickProcessingTimes.length;
  }
  
  /**
   * Obtém métricas de performance atuais
   */
  public getPerformanceMetrics(): SMCBotStatus["performanceMetrics"] {
    return {
      lastTickProcessingTime: this.lastTickProcessingTime,
      avgTickProcessingTime: this.getAverageTickProcessingTime(),
      maxTickProcessingTime: this.maxTickProcessingTime,
      minTickProcessingTime: this.minTickProcessingTime,
      ticksProcessedCount: this.ticksProcessedWithMetrics,
    };
  }
  
  /**
   * Reseta métricas de performance
   */
  public resetPerformanceMetrics(): void {
    this.tickProcessingTimes = [];
    this.lastTickProcessingTime = null;
    this.maxTickProcessingTime = null;
    this.minTickProcessingTime = null;
    this.ticksProcessedWithMetrics = 0;
    console.log("[SMCTradingEngine] Métricas de performance resetadas");
  }
  
  // ============= MÉTODOS DE LOGGING AO BANCO DE DADOS =============
  
  /**
   * Registra um log no banco de dados para visualização em tempo real
   * 
   * Este método persiste logs no MySQL para que o frontend possa
   * exibir os últimos 300 logs em tempo real na aba de Logs.
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
        source: "SMCTradingEngine",
        message,
        symbol: options?.symbol,
        signal: options?.signal,
        latencyMs: options?.latencyMs,
        data: options?.data,
      });
    } catch (error) {
      // Não deixar erro de log quebrar o fluxo principal
      console.error("[SMCTradingEngine] Erro ao gravar log no banco:", error);
    }
  }
  
  /**
   * Log de informação geral
   */
  public async logInfo(message: string, category: LogCategory = "SYSTEM", data?: Record<string, unknown>): Promise<void> {
    console.log(`[SMCTradingEngine] ${message}`);
    await this.logToDatabase("INFO", category, message, { data });
  }
  
  /**
   * Log de configuração alterada
   * Usado quando parâmetros são modificados via UI
   */
  public async logConfigChange(paramName: string, oldValue: any, newValue: any, source: string = "UI"): Promise<void> {
    const message = `⚙️ CONFIG ALTERADA | ${paramName}: ${JSON.stringify(oldValue)} → ${JSON.stringify(newValue)} | Fonte: ${source}`;
    console.log(`[SMCTradingEngine] ${message}`);
    await this.logToDatabase("INFO", "CONFIG" as LogCategory, message, { 
      data: { paramName, oldValue, newValue, source } 
    });
  }
  
  /**
   * Log de sinal detectado (antes da entrada)
   */
  public async logSignalDetected(
    symbol: string,
    signalType: string,
    confidence: number,
    reason: string,
    indicators?: Record<string, unknown>
  ): Promise<void> {
    const message = `📡 SINAL DETECTADO | ${symbol} | ${signalType} | Confiança: ${confidence}% | ${reason}`;
    console.log(`[SMCTradingEngine] ${message}`);
    await this.logToDatabase("INFO", "SIGNAL" as LogCategory, message, {
      symbol,
      signal: signalType,
      data: { confidence, reason, indicators }
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
    reason: string
  ): Promise<void> {
    const message = `✅ ENTRADA EXECUTADA | ${symbol} | ${direction} @ ${price.toFixed(5)} | Lotes: ${lots} | SL: ${stopLoss.toFixed(5)} | TP: ${takeProfit.toFixed(5)} | ${reason}`;
    console.log(`[SMCTradingEngine] ${message}`);
    await this.logToDatabase("INFO", "ENTRY" as LogCategory, message, {
      symbol,
      signal: direction,
      data: { price, lots, stopLoss, takeProfit, reason }
    });
  }
  
  /**
   * Log de saída de posição
   */
  public async logExit(
    symbol: string,
    direction: string,
    entryPrice: number,
    exitPrice: number,
    pnl: number,
    reason: string
  ): Promise<void> {
    const pnlEmoji = pnl >= 0 ? "🟢" : "🔴";
    const message = `${pnlEmoji} SAÍDA EXECUTADA | ${symbol} | ${direction} | Entry: ${entryPrice.toFixed(5)} → Exit: ${exitPrice.toFixed(5)} | PnL: $${pnl.toFixed(2)} | ${reason}`;
    console.log(`[SMCTradingEngine] ${message}`);
    await this.logToDatabase("INFO", "EXIT" as LogCategory, message, {
      symbol,
      signal: direction,
      data: { entryPrice, exitPrice, pnl, reason }
    });
  }
  
  /**
   * Log de filtro aplicado (bloqueio de operação)
   */
  public async logFilter(
    filterName: string,
    symbol: string,
    reason: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    const message = `🚫 FILTRO ATIVO | ${filterName} | ${symbol} | ${reason}`;
    console.log(`[SMCTradingEngine] ${message}`);
    await this.logToDatabase("WARN", "FILTER" as LogCategory, message, {
      symbol,
      data: { filterName, reason, ...details }
    });
  }
  
  /**
   * Log de etapa da estratégia SMC
   */
  public async logStrategyStep(
    symbol: string,
    step: string,
    status: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    const statusEmoji = status === "CONFIRMED" ? "✅" : status === "PENDING" ? "⏳" : "❌";
    const message = `${statusEmoji} SMC | ${symbol} | ${step}: ${status}`;
    console.log(`[SMCTradingEngine] ${message}`);
    await this.logToDatabase("INFO", "STRATEGY" as LogCategory, message, {
      symbol,
      data: { step, status, ...details }
    });
  }
  
  /**
   * Log de aviso
   */
  public async logWarn(message: string, category: LogCategory = "SYSTEM", data?: Record<string, unknown>): Promise<void> {
    console.warn(`[SMCTradingEngine] ⚠️ ${message}`);
    await this.logToDatabase("WARN", category, message, { data });
  }
  
  /**
   * Log de erro
   */
  public async logError(message: string, category: LogCategory = "SYSTEM", data?: Record<string, unknown>): Promise<void> {
    console.error(`[SMCTradingEngine] ❌ ${message}`);
    await this.logToDatabase("ERROR", category, message, { data });
  }
  
  /**
   * Log de performance (latência)
   */
  public async logPerformance(
    message: string,
    latencyMs: number,
    symbol?: string,
    signal?: string
  ): Promise<void> {
    const level: LogLevel = latencyMs > 200 ? "WARN" : "PERFORMANCE";
    console.log(`[PERFORMANCE] ${message}`);
    await this.logToDatabase(level, "PERFORMANCE", message, {
      symbol,
      signal,
      latencyMs,
    });
  }
  
  /**
   * Log de análise de sinal
   * 
   * ATUALIZADO: Agora inclui informações de Swing Points para debug
   */
  public async logAnalysis(
    symbol: string,
    signal: string,
    latencyMs: number,
    data?: Record<string, unknown>
  ): Promise<void> {
    // Obter informações de Swing Points da estratégia para debug
    let swingInfo = '';
    if (this.strategy instanceof SMCStrategy) {
      const state = this.strategy.getSwarmState(symbol);
      if (state) {
        swingInfo = ` | Swings: H=${state.swingHighs.length} L=${state.swingLows.length}`;
        if (state.sweepConfirmed) {
          swingInfo += ` | Sweep: ${state.lastSweepType}`;
        }
        if (state.chochDetected) {
          swingInfo += ` | CHoCH: ${state.chochDirection}`;
        }
      } else {
        swingInfo = ' | State: NULL';
      }
    }
    
    const message = `Tick processado em ${latencyMs.toFixed(2)}ms | ${symbol} | Sinal: ${signal}${swingInfo}`;
    await this.logToDatabase("INFO", "ANALYSIS", message, {
      symbol,
      signal,
      latencyMs,
      data,
    });
  }
  
  /**
   * Log de trade (abertura/fechamento de posição)
   */
  public async logTrade(
    action: string,
    symbol: string,
    direction: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    const message = `${action} | ${symbol} | ${direction}`;
    console.log(`[SMCTradingEngine] 💹 ${message}`);
    await this.logToDatabase("INFO", "TRADE", message, {
      symbol,
      signal: direction,
      data,
    });
  }
  
  /**
   * Log de risco
   */
  public async logRisk(message: string, data?: Record<string, unknown>): Promise<void> {
    console.log(`[SMCTradingEngine] ⚠️ RISK: ${message}`);
    await this.logToDatabase("WARN", "RISK", message, { data });
  }
  
  /**
   * Log de conexao
   */
  public async logConnection(message: string, isError: boolean = false): Promise<void> {
    if (isError) {
      console.error(`[SMCTradingEngine] CONNECTION: ${message}`);
      await this.logToDatabase("ERROR", "CONNECTION", message);
    } else {
      console.log(`[SMCTradingEngine] CONNECTION: ${message}`);
      await this.logToDatabase("INFO", "CONNECTION", message);
    }
  }
  
  /**
   * Obtem o preco ask atual para um simbolo
   * AUDITORIA: Necessario para calculo de spread
   */
  private async getCurrentAsk(symbol: string): Promise<number | undefined> {
    try {
      const price = await this.adapter.getPrice(symbol);
      return price?.ask;
    } catch (error) {
      // Nao deixar erro de preco quebrar o fluxo principal
      console.warn(`[SMCTradingEngine] Erro ao obter ask para ${symbol}:`, error);
      return undefined;
    }
  }
}
