/**
 * Trading Engine - Motor de Execução Automática
 * 
 * Gerencia o loop de trading automático para IC Markets/cTrader.
 * Este é o "elo perdido" que conecta os dados de preço à estratégia.
 * 
 * Responsabilidades:
 * - Controlar flag tradingActive (independente da conexão)
 * - Processar ticks de preço e chamar a estratégia
 * - Executar ordens baseadas nos sinais
 * - Gerenciar trailing stops das posições abertas
 * - Emitir logs de "batimento cardíaco"
 */

import { EventEmitter } from "events";
import { ctraderAdapter } from "../CTraderAdapter";
import { TrendSniperStrategy, trendSniperStrategy, SignalResult } from "./TrendSniperStrategy";
import { TradeSide, SpotEvent, TrendbarPeriod } from "./CTraderClient";
// REFATORAÇÃO: Importar módulo centralizado de normalização de pips
import { getPipValue as getCentralizedPipValue } from "../../../shared/normalizationUtils";

// Configuração do engine
export interface TradingEngineConfig {
  symbol: string;
  timeframe: string;
  lots: number;
  maxPositions: number;
  cooldownMs: number; // Tempo mínimo entre operações
}

// Status do bot
export interface BotStatus {
  isRunning: boolean;
  symbol: string | null;
  timeframe: string | null;
  lastTickPrice: number | null;
  lastTickTime: number | null;
  lastSignal: string | null;
  lastSignalTime: number | null;
  lastAnalysisTime: number | null;
  analysisCount: number;
  tradesExecuted: number;
  startTime: number | null;
  tickCount: number; // Contador de ticks processados
}

// Configuração padrão
const DEFAULT_CONFIG: TradingEngineConfig = {
  symbol: "USDJPY",
  timeframe: "M15",
  lots: 0.01,
  maxPositions: 1,
  cooldownMs: 60000, // 1 minuto entre operações
};

/**
 * Motor de Trading Automático
 */
export class TradingEngine extends EventEmitter {
  private config: TradingEngineConfig;
  private strategy: TrendSniperStrategy;
  
  // Estado do trading
  private _isRunning: boolean = false;
  private lastTradeTime: number = 0;
  private lastAnalysisTime: number = 0;
  private analysisCount: number = 0;
  private tradesExecuted: number = 0;
  private startTime: number | null = null;
  
  // Cache de dados
  private lastTickPrice: number | null = null;
  private lastTickTime: number | null = null;
  private lastSignal: string | null = null;
  private lastSignalTime: number | null = null;
  
  // Intervalo de análise
  private analysisInterval: NodeJS.Timeout | null = null;
  private trailingStopInterval: NodeJS.Timeout | null = null;
  
  // Subscrição de preços
  private priceSubscriptionActive: boolean = false;
  
  constructor(config: Partial<TradingEngineConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.strategy = trendSniperStrategy;
    
    console.log("[TradingEngine] Instância criada");
  }
  
  /**
   * Inicia o loop de trading automático
   */
  async start(symbol?: string, timeframe?: string): Promise<void> {
    if (this._isRunning) {
      console.log("[TradingEngine] Já está em execução");
      return;
    }
    
    // Verificar se está conectado
    if (!ctraderAdapter.isConnected()) {
      throw new Error("Não conectado ao IC Markets. Conecte primeiro antes de iniciar o robô.");
    }
    
    // Atualizar configuração se fornecida
    if (symbol) this.config.symbol = symbol;
    if (timeframe) this.config.timeframe = timeframe;
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[TradingEngine] 🚀 INICIANDO ROBÔ DE TRADING");
    console.log(`[TradingEngine] Símbolo: ${this.config.symbol}`);
    console.log(`[TradingEngine] Timeframe: ${this.config.timeframe}`);
    console.log(`[TradingEngine] Lotes: ${this.config.lots}`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    this._isRunning = true;
    this.startTime = Date.now();
    this.analysisCount = 0;
    this.tradesExecuted = 0;
    this.tickCount = 0;
    this.lastTickLogTime = 0;
    
    // Carregar configurações da estratégia do banco de dados
    await this.loadStrategyConfig();
    
    // Subscrever a preços em tempo real
    await this.subscribeToPrice();
    
    // Iniciar loop de análise periódica
    this.startAnalysisLoop();
    
    // Iniciar loop de trailing stop
    this.startTrailingStopLoop();
    
    this.emit("started", { symbol: this.config.symbol, timeframe: this.config.timeframe });
    
    console.log("[TradingEngine] ✅ Robô iniciado com sucesso!");
  }
  
  /**
   * Para o loop de trading
   */
  async stop(): Promise<void> {
    if (!this._isRunning) {
      console.log("[TradingEngine] Já está parado");
      return;
    }
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[TradingEngine] 🛑 PARANDO ROBÔ DE TRADING");
    console.log(`[TradingEngine] Análises realizadas: ${this.analysisCount}`);
    console.log(`[TradingEngine] Trades executados: ${this.tradesExecuted}`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    this._isRunning = false;
    
    // Parar loops
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
    
    if (this.trailingStopInterval) {
      clearInterval(this.trailingStopInterval);
      this.trailingStopInterval = null;
    }
    
    // Cancelar subscrição de preços
    await this.unsubscribeFromPrice();
    
    this.startTime = null;
    
    this.emit("stopped");
    
    console.log("[TradingEngine] ✅ Robô parado com sucesso!");
  }
  
  /**
   * Obtém status atual do bot
   */
  getStatus(): BotStatus {
    return {
      isRunning: this._isRunning,
      symbol: this._isRunning ? this.config.symbol : null,
      timeframe: this._isRunning ? this.config.timeframe : null,
      lastTickPrice: this.lastTickPrice,
      lastTickTime: this.lastTickTime,
      lastSignal: this.lastSignal,
      lastSignalTime: this.lastSignalTime,
      lastAnalysisTime: this.lastAnalysisTime,
      analysisCount: this.analysisCount,
      tradesExecuted: this.tradesExecuted,
      startTime: this.startTime,
      tickCount: this.tickCount,
    };
  }
  
  /**
   * Verifica se está rodando
   */
  get isRunning(): boolean {
    return this._isRunning;
  }
  
  /**
   * Carrega configurações da estratégia
   */
  private async loadStrategyConfig(): Promise<void> {
    try {
      const config = ctraderAdapter.getStrategyConfig();
      this.strategy.updateConfig(config);
      console.log("[TradingEngine] Configurações da estratégia carregadas:", config);
    } catch (error) {
      console.error("[TradingEngine] Erro ao carregar configurações:", error);
    }
  }
  
  /**
   * Subscreve a preços em tempo real
   */
  private async subscribeToPrice(): Promise<void> {
    if (this.priceSubscriptionActive) return;
    
    try {
      await ctraderAdapter.subscribePrice(this.config.symbol, (tick) => {
        this.onPriceTick(tick);
      });
      
      this.priceSubscriptionActive = true;
      console.log(`[TradingEngine] Subscrito a preços de ${this.config.symbol}`);
    } catch (error) {
      console.error("[TradingEngine] Erro ao subscrever preços:", error);
    }
  }
  
  /**
   * Cancela subscrição de preços
   */
  private async unsubscribeFromPrice(): Promise<void> {
    if (!this.priceSubscriptionActive) return;
    
    try {
      await ctraderAdapter.unsubscribePrice(this.config.symbol);
      this.priceSubscriptionActive = false;
      console.log(`[TradingEngine] Subscrição de ${this.config.symbol} cancelada`);
    } catch (error) {
      console.error("[TradingEngine] Erro ao cancelar subscrição:", error);
    }
  }
  
  // Contador de ticks para throttling de logs
  private tickCount: number = 0;
  private lastTickLogTime: number = 0;

  /**
   * Processa tick de preço recebido
   * IMPORTANTE: Este é o "elo perdido" - cada tick é processado aqui
   */
  private onPriceTick(tick: { symbol: string; bid: number; ask: number; timestamp: number }): void {
    if (!this._isRunning) return;
    
    this.lastTickPrice = tick.bid;
    this.lastTickTime = tick.timestamp;
    this.tickCount++;
    
    const now = Date.now();
    const spread = (tick.ask - tick.bid);
    // CORREÇÃO: Usar getPipValue() para cálculo correto de spread para todos os símbolos
    // Antes: spreadPips = spread * 10000 (incorreto para XAUUSD - gerava 1000 pips para spread de $0.10)
    // Agora: spreadPips = spread / pipValue (correto - gera 1 pip para spread de $0.10)
    const pipValue = this.getPipValue(this.config.symbol);
    const spreadPips = spread / pipValue;
    
    // LOG DE BATIMENTO CARDÍACO - A cada 5 segundos ou a cada 50 ticks
    // Isso garante visibilidade no terminal sem sobrecarregar
    if (now - this.lastTickLogTime > 5000 || this.tickCount % 50 === 0) {
      console.log(`[BOT] 💓 Analisando Tick #${this.tickCount}: ${this.config.symbol} = ${tick.bid.toFixed(5)} | Spread: ${spreadPips.toFixed(1)} pips | Sinal: ${this.lastSignal || 'AGUARDANDO'}`);
      this.lastTickLogTime = now;
    }
    
    // Emitir evento de tick para outros componentes
    this.emit("tick", {
      symbol: this.config.symbol,
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
    
    console.log(`[TradingEngine] Loop de análise iniciado (intervalo: ${analysisIntervalMs / 1000}s)`);
  }
  
  /**
   * Executa análise de mercado e decide se entra na operação
   */
  private async performAnalysis(): Promise<void> {
    if (!this._isRunning) return;
    
    const now = Date.now();
    this.lastAnalysisTime = now;
    this.analysisCount++;
    
    try {
      // Buscar candles para análise
      // IMPORTANTE: Solicitamos 500 candles para garantir margem de segurança
      // A corretora pode retornar menos devido a horários de mercado fechado
      const candles = await ctraderAdapter.getCandleHistory(
        this.config.symbol,
        this.config.timeframe,
        500 // Buffer aumentado: garante > 210 mesmo com gaps de mercado
      );
      
      if (candles.length < 210) {
        console.log(`[TradingEngine] ⚠️ Dados insuficientes: ${candles.length} candles (mínimo: 210)`);
        return;
      }
      
      // Log de confirmação de dados OK (apenas na primeira análise)
      if (this.analysisCount === 1) {
        console.log(`[TradingEngine] ✅ Dados OK: ${candles.length} candles recebidos. Analisando mercado...`);
      }
      
      // Converter para formato da estratégia
      const trendbarData = candles.map(c => ({
        timestamp: c.timestamp * 1000,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
      }));
      
      // Analisar sinal
      const signal = this.strategy.analyzeSignal(trendbarData);
      
      this.lastSignal = signal.signal;
      this.lastSignalTime = now;
      
      // Log de batimento cardíaco com resultado da análise
      const currentPrice = this.lastTickPrice || candles[candles.length - 1].close;
      console.log("───────────────────────────────────────────────────────────────");
      console.log(`[Strategy] 📊 Análise #${this.analysisCount} | ${this.config.symbol} ${this.config.timeframe}`);
      console.log(`[Strategy] Preço: ${currentPrice.toFixed(5)} | EMA200: ${signal.indicators.ema200.toFixed(5)} | RSI: ${signal.indicators.rsi.toFixed(2)}`);
      console.log(`[Strategy] Sinal: ${signal.signal} | Confiança: ${signal.confidence}%`);
      console.log(`[Strategy] Razão: ${signal.reason}`);
      console.log("───────────────────────────────────────────────────────────────");
      
      // Verificar se deve executar trade
      if (signal.signal !== "NONE" && signal.confidence >= 50) {
        await this.evaluateAndExecuteTrade(signal);
      }
      
      this.emit("analysis", signal);
      
    } catch (error) {
      console.error("[TradingEngine] Erro na análise:", error);
    }
  }
  
  /**
   * Avalia e executa trade se condições forem atendidas
   */
  private async evaluateAndExecuteTrade(signal: SignalResult): Promise<void> {
    const now = Date.now();
    
    // Verificar cooldown
    if (now - this.lastTradeTime < this.config.cooldownMs) {
      const remaining = Math.ceil((this.config.cooldownMs - (now - this.lastTradeTime)) / 1000);
      console.log(`[TradingEngine] ⏳ Cooldown ativo. Aguardando ${remaining}s...`);
      return;
    }
    
    // Verificar número de posições abertas
    const openPositions = await ctraderAdapter.getOpenPositions();
    const symbolPositions = openPositions.filter(p => p.symbol === this.config.symbol);
    
    if (symbolPositions.length >= this.config.maxPositions) {
      console.log(`[TradingEngine] ⚠️ Máximo de posições atingido (${symbolPositions.length}/${this.config.maxPositions})`);
      return;
    }
    
    // Verificar se já existe posição na mesma direção
    const sameDirectionPosition = symbolPositions.find(p => p.direction === signal.signal);
    if (sameDirectionPosition) {
      console.log(`[TradingEngine] ⚠️ Já existe posição ${signal.signal} aberta`);
      return;
    }
    
    // Executar ordem
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`[TradingEngine] 🎯 EXECUTANDO ORDEM: ${signal.signal}`);
    console.log(`[TradingEngine] Símbolo: ${this.config.symbol}`);
    console.log(`[TradingEngine] Lotes: ${this.config.lots}`);
    console.log(`[TradingEngine] Confiança: ${signal.confidence}%`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    try {
      const strategyConfig = this.strategy.getConfig();
      
      const result = await ctraderAdapter.placeOrder({
        symbol: this.config.symbol,
        direction: signal.signal as "BUY" | "SELL",
        orderType: "MARKET",
        lots: this.config.lots,
        stopLossPips: strategyConfig.stopLossPips,
        takeProfitPips: strategyConfig.takeProfitPips > 0 ? strategyConfig.takeProfitPips : undefined,
        comment: `TrendSniper ${signal.signal} | Conf: ${signal.confidence}%`,
      });
      
      if (result.success) {
        this.lastTradeTime = now;
        this.tradesExecuted++;
        
        console.log(`[TradingEngine] ✅ ORDEM EXECUTADA: ${result.orderId} @ ${result.executionPrice}`);
        
        this.emit("trade", {
          signal,
          result,
          timestamp: now,
        });
      } else {
        console.error(`[TradingEngine] ❌ ERRO NA ORDEM: ${result.errorMessage}`);
      }
      
    } catch (error) {
      console.error("[TradingEngine] Erro ao executar ordem:", error);
    }
  }
  
  /**
   * Inicia loop de trailing stop
   */
  private startTrailingStopLoop(): void {
    // Verificar trailing stop a cada 5 segundos
    const trailingIntervalMs = 5000;
    
    this.trailingStopInterval = setInterval(() => {
      this.updateTrailingStops();
    }, trailingIntervalMs);
    
    console.log(`[TradingEngine] Loop de trailing stop iniciado (intervalo: ${trailingIntervalMs / 1000}s)`);
  }
  
  /**
   * Atualiza trailing stops de todas as posições
   */
  private async updateTrailingStops(): Promise<void> {
    if (!this._isRunning) return;
    
    const strategyConfig = this.strategy.getConfig();
    if (!strategyConfig.trailingEnabled) return;
    
    try {
      const positions = await ctraderAdapter.getOpenPositions();
      
      for (const position of positions) {
        if (position.symbol !== this.config.symbol) continue;
        
        const updated = await ctraderAdapter.updateTrailingStop(position.positionId);
        
        if (updated) {
          console.log(`[TradingEngine] 📈 Trailing stop atualizado para posição ${position.positionId}`);
        }
      }
    } catch (error) {
      // Silenciar erros de trailing stop para não poluir logs
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
  
  /**
   * Atualiza configuração do engine
   */
  updateConfig(config: Partial<TradingEngineConfig>): void {
    this.config = { ...this.config, ...config };
    console.log("[TradingEngine] Configuração atualizada:", this.config);
  }
}

// ============= GERENCIADOR DE MÚLTIPLOS BOTS =============
// Seguindo o mesmo padrão da Deriv para garantir independência entre bots

// Map de bots ativos: chave = "userId-botId"
const activeTradingEngines = new Map<string, TradingEngine>();

/**
 * Gera chave única para identificar um bot
 */
function getEngineKey(userId: number, botId: number): string {
  return `${userId}-${botId}`;
}

/**
 * Obtém ou cria uma instância do TradingEngine para um usuário/bot específico
 * Cada bot é independente e não afeta outros bots
 */
export function getTradingEngine(userId: number, botId: number = 1): TradingEngine {
  const key = getEngineKey(userId, botId);
  if (!activeTradingEngines.has(key)) {
    console.log(`[TradingEngineManager] Criando nova instância para usuário ${userId}, bot ${botId}`);
    activeTradingEngines.set(key, new TradingEngine());
  }
  return activeTradingEngines.get(key)!;
}

/**
 * Remove uma instância do TradingEngine
 */
export function removeTradingEngine(userId: number, botId: number = 1): void {
  const key = getEngineKey(userId, botId);
  const engine = activeTradingEngines.get(key);
  if (engine) {
    if (engine.isRunning) {
      engine.stop();
    }
    activeTradingEngines.delete(key);
    console.log(`[TradingEngineManager] Instância removida para usuário ${userId}, bot ${botId}`);
  }
}

/**
 * Obtém status de todos os bots ativos
 */
export function getAllEnginesStatus(): Array<{ userId: number; botId: number; status: BotStatus }> {
  const result: Array<{ userId: number; botId: number; status: BotStatus }> = [];
  
  const entries = Array.from(activeTradingEngines.entries());
  for (const [key, engine] of entries) {
    const [userId, botId] = key.split('-').map(Number);
    result.push({
      userId,
      botId,
      status: engine.getStatus(),
    });
  }
  
  return result;
}

// COMPATÍVEL COM CÓDIGO LEGADO: Exportar instância padrão (será substituída pelo gerenciador)
// AVISO: Este export é mantido apenas para compatibilidade temporária
// O código deve migrar para usar getTradingEngine(userId, botId)
export const tradingEngine = new TradingEngine();
