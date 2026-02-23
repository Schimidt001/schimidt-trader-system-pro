/**
 * ORB Trend Strategy - Opening Range Breakout + EMA200 Regime Filter
 * 
 * Estratégia baseada em breakout do opening range com filtro de regime de tendência.
 * Opera em M15 com máximo de 1 trade por dia por símbolo.
 * 
 * Lógica:
 * 1. Calcular Opening Range (primeiros X candles do dia em M15)
 * 2. Filtro de Regime: EMA200 + Slope
 * 3. Entrada: Breakout do range + confirmação de regime
 * 4. SL: Lado oposto do range ou ATR
 * 5. TP: Risk:Reward fixo
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
  BaseStrategyConfig,
  MultiTimeframeData 
} from "./ITradingStrategy";

// ============= CONFIGURAÇÃO =============

/**
 * Configuração específica da estratégia ORB Trend
 */
export interface ORBStrategyConfig extends BaseStrategyConfig {
  // Ativos monitorados
  activeSymbols: string[];
  
  // Opening Range
  openingCandles: number;
  
  // Filtro de Regime (EMA200)
  emaPeriod: number;
  slopeLookbackCandles: number;
  minSlope: number;
  
  // Stop Loss
  stopType: "rangeOpposite" | "atr";
  atrMult: number;
  atrPeriod: number;
  
  // Take Profit
  riskReward: number;
  
  // Frequência
  maxTradesPerDayPerSymbol: number;
  
  // Gestão de Risco
  riskPercentage: number;
  maxOpenTrades: number;
  
  // Spread
  maxSpreadPips: number;
  
  // Logging
  verboseLogging: boolean;
}

/**
 * Estado diário por símbolo
 */
interface ORBDailyState {
  dateKey: string;
  openingHigh: number | null;
  openingLow: number | null;
  rangeReady: boolean;
  tradedToday: boolean;
  dayLocked: boolean;
  lockReason?: string;
}

// ============= CONFIGURAÇÃO PADRÃO =============

export const DEFAULT_ORB_CONFIG: ORBStrategyConfig = {
  strategyType: StrategyType.ORB_TREND,
  
  // Ativos
  activeSymbols: [], // CORREÇÃO 2026-02-23: Removido hardcode. Ativos devem vir EXCLUSIVAMENTE do banco de dados (configuração via UI)
  
  // Opening Range
  openingCandles: 3,
  
  // Filtro de Regime
  emaPeriod: 200,
  slopeLookbackCandles: 10,
  minSlope: 0.0001, // Conservador
  
  // Stop Loss
  stopType: "rangeOpposite",
  atrMult: 1.5,
  atrPeriod: 14,
  
  // Take Profit
  riskReward: 1.0,
  
  // Frequência
  maxTradesPerDayPerSymbol: 1,
  
  // Gestão de Risco
  riskPercentage: 1.0,
  maxOpenTrades: 3,
  
  // Spread
  maxSpreadPips: 3.0,
  
  // Logging
  verboseLogging: true,
};

// ============= IMPLEMENTAÇÃO =============

/**
 * Implementação da estratégia ORB Trend
 */
export class ORBStrategy implements IMultiTimeframeStrategy {
  private config: ORBStrategyConfig;
  
  // Dados de timeframe
  private m15Data: TrendbarData[] = [];
  
  // Estado por símbolo
  private stateBySymbol: Map<string, ORBDailyState> = new Map();
  
  // Símbolo atual sendo analisado
  private currentSymbol: string = "";
  
  constructor(config: Partial<ORBStrategyConfig> = {}) {
    this.config = { ...DEFAULT_ORB_CONFIG, ...config };
    
    // Garantir que activeSymbols seja um array
    if (typeof this.config.activeSymbols === 'string') {
      try {
        this.config.activeSymbols = JSON.parse(this.config.activeSymbols);
      } catch (e) {
        console.warn('[ORB] Erro ao parsear activeSymbols:', e);
        this.config.activeSymbols = []; // CORREÇÃO 2026-02-23: Array vazio ao invés de hardcode
      }
    }
    
    if (!Array.isArray(this.config.activeSymbols)) {
      this.config.activeSymbols = []; // CORREÇÃO 2026-02-23: Array vazio ao invés de hardcode
    }
    
    console.log(`[ORB] ========== CONFIGURAÇÕES CARREGADAS ==========`);
    console.log(`[ORB] Opening Candles: ${this.config.openingCandles}`);
    console.log(`[ORB] EMA Period: ${this.config.emaPeriod}`);
    console.log(`[ORB] Slope Lookback: ${this.config.slopeLookbackCandles}`);
    console.log(`[ORB] Min Slope: ${this.config.minSlope}`);
    console.log(`[ORB] Stop Type: ${this.config.stopType}`);
    console.log(`[ORB] Risk:Reward: ${this.config.riskReward}`);
    console.log(`[ORB] Max Trades/Day/Symbol: ${this.config.maxTradesPerDayPerSymbol}`);
    console.log(`[ORB] Ativos monitorados: ${this.config.activeSymbols.join(', ')}`);
    console.log(`[ORB] ================================================`);
  }
  
  // ============= INTERFACE METHODS =============
  
  getStrategyType(): StrategyType {
    return StrategyType.ORB_TREND;
  }
  
  /**
   * Analisa os dados de mercado e gera sinal de trading
   */
  analyzeSignal(candles: TrendbarData[], mtfData?: MultiTimeframeData): SignalResult {
    if (!this.currentSymbol) {
      return this.createNoSignal("Símbolo não definido");
    }
    
    // Verificar se símbolo está ativo
    if (!this.config.activeSymbols.includes(this.currentSymbol)) {
      return this.createNoSignal(`Símbolo ${this.currentSymbol} não está na lista de ativos monitorados`);
    }
    
    // Verificar spread
    if (mtfData && mtfData.currentSpreadPips > this.config.maxSpreadPips) {
      const reason = `Spread alto: ${mtfData.currentSpreadPips.toFixed(1)} pips > max ${this.config.maxSpreadPips} pips`;
      if (this.config.verboseLogging) {
        console.log(`[ORB] ${this.currentSymbol}: BLOQUEADO | ${reason}`);
      }
      return this.createNoSignal(reason);
    }
    
    // Usar dados M15
    const m15Candles = this.m15Data;
    
    if (m15Candles.length < this.config.emaPeriod + this.config.slopeLookbackCandles) {
      return this.createNoSignal(`Dados M15 insuficientes: ${m15Candles.length} candles`);
    }
    
    // Obter ou criar estado do dia
    const state = this.getOrCreateDailyState(this.currentSymbol);
    
    // Verificar se dia já está travado
    if (state.dayLocked) {
      if (this.config.verboseLogging) {
        console.log(`[ORB] ${this.currentSymbol}: Dia travado | Razão: ${state.lockReason}`);
      }
      return this.createNoSignal(`Dia travado: ${state.lockReason}`);
    }
    
    // ETAPA 1: Calcular Opening Range (se ainda não calculado)
    if (!state.rangeReady) {
      this.calculateOpeningRange(m15Candles, state);
      
      if (state.rangeReady) {
        console.log(`[ORB] ORB_RANGE_DEFINED symbol=${this.currentSymbol} date=${state.dateKey} openingHigh=${state.openingHigh} openingLow=${state.openingLow} candles=${this.config.openingCandles}`);
      } else {
        return this.createNoSignal("Aguardando formação do Opening Range");
      }
    }
    
    // ETAPA 2: Verificar se preço está dentro do range (não operar)
    const currentPrice = m15Candles[m15Candles.length - 1].close;
    if (currentPrice > state.openingLow! && currentPrice < state.openingHigh!) {
      return this.createNoSignal("Preço dentro do Opening Range");
    }
    
    // ETAPA 3: Calcular EMA200 e Slope
    const ema200 = this.calculateEMA(m15Candles, this.config.emaPeriod);
    const currentEMA = ema200[ema200.length - 1];
    const pastEMA = ema200[ema200.length - 1 - this.config.slopeLookbackCandles];
    const slope = currentEMA - pastEMA;
    
    // ETAPA 4: Determinar direção permitida pelo filtro de regime
    let allowedDirection: "BUY" | "SELL" | "NONE" = "NONE";
    
    if (currentPrice > currentEMA && slope > this.config.minSlope) {
      allowedDirection = "BUY";
      console.log(`[ORB] ORB_FILTER_PASS symbol=${this.currentSymbol} side=BUY ema200=${currentEMA.toFixed(5)} slope=${slope.toFixed(6)} minSlope=${this.config.minSlope}`);
    } else if (currentPrice < currentEMA && slope < -this.config.minSlope) {
      allowedDirection = "SELL";
      console.log(`[ORB] ORB_FILTER_PASS symbol=${this.currentSymbol} side=SELL ema200=${currentEMA.toFixed(5)} slope=${slope.toFixed(6)} minSlope=${this.config.minSlope}`);
    } else {
      const reason = Math.abs(slope) <= this.config.minSlope ? "FLAT" : "WRONG_SIDE";
      console.log(`[ORB] ORB_FILTER_BLOCK symbol=${this.currentSymbol} reason=${reason} slope=${slope.toFixed(6)}`);
      return this.createNoSignal(`Filtro de regime bloqueou: ${reason}`);
    }
    
    // ETAPA 5: Verificar breakout
    const lastCandle = m15Candles[m15Candles.length - 1];
    
    // BUY: candle fecha acima do opening_high
    if (allowedDirection === "BUY" && lastCandle.close > state.openingHigh!) {
      console.log(`[ORB] ORB_BREAKOUT_TRIGGER symbol=${this.currentSymbol} side=BUY close=${lastCandle.close.toFixed(5)} level=openingHigh`);
      
      // Travar o dia
      state.tradedToday = true;
      state.dayLocked = true;
      state.lockReason = "Entrada BUY executada";
      
      return {
        signal: "BUY",
        confidence: 80,
        reason: `ORB Breakout: Close ${lastCandle.close.toFixed(5)} > Opening High ${state.openingHigh!.toFixed(5)} | EMA200 Bullish`,
        indicators: {
          openingHigh: state.openingHigh!,
          openingLow: state.openingLow!,
          ema200: currentEMA,
          slope: slope,
          currentPrice: currentPrice,
        },
        metadata: {
          strategy: "ORB_TREND",
          rangeHigh: state.openingHigh,
          rangeLow: state.openingLow,
        },
      };
    }
    
    // SELL: candle fecha abaixo do opening_low
    if (allowedDirection === "SELL" && lastCandle.close < state.openingLow!) {
      console.log(`[ORB] ORB_BREAKOUT_TRIGGER symbol=${this.currentSymbol} side=SELL close=${lastCandle.close.toFixed(5)} level=openingLow`);
      
      // Travar o dia
      state.tradedToday = true;
      state.dayLocked = true;
      state.lockReason = "Entrada SELL executada";
      
      return {
        signal: "SELL",
        confidence: 80,
        reason: `ORB Breakout: Close ${lastCandle.close.toFixed(5)} < Opening Low ${state.openingLow!.toFixed(5)} | EMA200 Bearish`,
        indicators: {
          openingHigh: state.openingHigh!,
          openingLow: state.openingLow!,
          ema200: currentEMA,
          slope: slope,
          currentPrice: currentPrice,
        },
        metadata: {
          strategy: "ORB_TREND",
          rangeHigh: state.openingHigh,
          rangeLow: state.openingLow,
        },
      };
    }
    
    return this.createNoSignal("Aguardando breakout do range");
  }
  
  /**
   * Calcula Stop Loss e Take Profit
   */
  calculateSLTP(
    direction: TradeSide,
    entryPrice: number,
    candles: TrendbarData[],
    pipValue: number,
    metadata?: Record<string, any>
  ): SLTPResult {
    const state = this.getOrCreateDailyState(this.currentSymbol);
    
    let stopLoss: number;
    let stopLossPips: number;
    
    if (this.config.stopType === "rangeOpposite") {
      // BUY: SL = opening_low
      // SELL: SL = opening_high
      if (direction === TradeSide.BUY) {
        stopLoss = state.openingLow!;
      } else {
        stopLoss = state.openingHigh!;
      }
      
      stopLossPips = Math.abs(entryPrice - stopLoss) / pipValue;
    } else {
      // ATR Stop
      const atr = this.calculateATR(candles, this.config.atrPeriod);
      const atrValue = atr[atr.length - 1];
      
      stopLossPips = atrValue * this.config.atrMult / pipValue;
      
      if (direction === TradeSide.BUY) {
        stopLoss = entryPrice - (stopLossPips * pipValue);
      } else {
        stopLoss = entryPrice + (stopLossPips * pipValue);
      }
    }
    
    // Take Profit: Risk:Reward fixo
    const takeProfitPips = stopLossPips * this.config.riskReward;
    
    let takeProfit: number;
    if (direction === TradeSide.BUY) {
      takeProfit = entryPrice + (takeProfitPips * pipValue);
    } else {
      takeProfit = entryPrice - (takeProfitPips * pipValue);
    }
    
    console.log(`[ORB] SLTP | ${this.currentSymbol} | ${direction} | Entry: ${entryPrice.toFixed(5)} | SL: ${stopLoss.toFixed(5)} (${stopLossPips.toFixed(1)} pips) | TP: ${takeProfit.toFixed(5)} (${takeProfitPips.toFixed(1)} pips) | RR: ${this.config.riskReward}`);
    
    return {
      stopLoss,
      takeProfit,
      stopLossPips,
      takeProfitPips,
    };
  }
  
  getConfig(): ORBStrategyConfig {
    return { ...this.config };
  }
  
  updateConfig(config: Partial<ORBStrategyConfig>): void {
    console.log(`[ORB] [updateConfig] ========== PARÂMETROS RECEBIDOS ==========`);
    console.log(`[ORB] [updateConfig] openingCandles: ${config.openingCandles}`);
    console.log(`[ORB] [updateConfig] emaPeriod: ${config.emaPeriod}`);
    console.log(`[ORB] [updateConfig] slopeLookbackCandles: ${config.slopeLookbackCandles}`);
    console.log(`[ORB] [updateConfig] minSlope: ${config.minSlope}`);
    console.log(`[ORB] [updateConfig] stopType: ${config.stopType}`);
    console.log(`[ORB] [updateConfig] riskReward: ${config.riskReward}`);
    console.log(`[ORB] [updateConfig] maxTradesPerDayPerSymbol: ${config.maxTradesPerDayPerSymbol}`);
    console.log(`[ORB] [updateConfig] activeSymbols: ${config.activeSymbols}`);
    console.log(`[ORB] [updateConfig] ================================================`);
    
    this.config = { ...this.config, ...config };
    
    if (this.config.verboseLogging) {
      console.log("[ORB] Configuração atualizada:", config);
    }
  }
  
  reset(): void {
    this.m15Data = [];
    this.stateBySymbol.clear();
    
    if (this.config.verboseLogging) {
      console.log("[ORB] Estado resetado");
    }
  }
  
  // ============= MULTI-TIMEFRAME METHODS =============
  
  setCurrentSymbol(symbol: string): void {
    this.currentSymbol = symbol;
  }
  
  updateTimeframeData(timeframe: string, candles: TrendbarData[]): void {
    if (timeframe === "M15") {
      this.m15Data = candles;
    }
    
    if (this.config.verboseLogging) {
      console.log(`[ORB] Dados ${timeframe} atualizados: ${candles.length} candles`);
    }
  }
  
  // ============= HELPER METHODS =============
  
  /**
   * Obtém ou cria estado diário para um símbolo
   */
  private getOrCreateDailyState(symbol: string): ORBDailyState {
    const dateKey = this.getCurrentDateKey();
    
    if (!this.stateBySymbol.has(symbol)) {
      this.stateBySymbol.set(symbol, {
        dateKey,
        openingHigh: null,
        openingLow: null,
        rangeReady: false,
        tradedToday: false,
        dayLocked: false,
      });
    }
    
    const state = this.stateBySymbol.get(symbol)!;
    
    // Reset se mudou de dia
    if (state.dateKey !== dateKey) {
      console.log(`[ORB] ${symbol}: Novo dia detectado (${state.dateKey} → ${dateKey}). Resetando estado.`);
      state.dateKey = dateKey;
      state.openingHigh = null;
      state.openingLow = null;
      state.rangeReady = false;
      state.tradedToday = false;
      state.dayLocked = false;
      state.lockReason = undefined;
    }
    
    return state;
  }
  
  /**
   * Calcula o Opening Range
   */
  private calculateOpeningRange(candles: TrendbarData[], state: ORBDailyState): void {
    if (candles.length < this.config.openingCandles) {
      return;
    }
    
    // Pegar os primeiros X candles do dia
    const openingCandles = candles.slice(-this.config.openingCandles);
    
    const highs = openingCandles.map(c => c.high);
    const lows = openingCandles.map(c => c.low);
    
    state.openingHigh = Math.max(...highs);
    state.openingLow = Math.min(...lows);
    state.rangeReady = true;
  }
  
  /**
   * Obtém chave de data atual (formato: YYYY-MM-DD)
   */
  private getCurrentDateKey(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }
  
  /**
   * Calcula EMA (Exponential Moving Average)
   */
  private calculateEMA(candles: TrendbarData[], period: number): number[] {
    const result: number[] = [];
    const multiplier = 2 / (period + 1);
    
    // Primeiro valor é SMA
    let sum = 0;
    for (let i = 0; i < period && i < candles.length; i++) {
      sum += candles[i].close;
    }
    let ema = sum / period;
    result.push(ema);
    
    // Restante é EMA
    for (let i = period; i < candles.length; i++) {
      ema = (candles[i].close - ema) * multiplier + ema;
      result.push(ema);
    }
    
    return result;
  }
  
  /**
   * Calcula ATR (Average True Range)
   */
  private calculateATR(candles: TrendbarData[], period: number): number[] {
    const result: number[] = [];
    
    // Calcular True Range para cada candle
    const trueRanges: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      
      trueRanges.push(tr);
    }
    
    // Calcular ATR (média móvel simples do TR)
    for (let i = period - 1; i < trueRanges.length; i++) {
      const sum = trueRanges.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
    
    return result;
  }
  
  /**
   * Cria resultado de "sem sinal"
   */
  private createNoSignal(reason: string): SignalResult {
    return {
      signal: "NONE",
      confidence: 0,
      reason,
      indicators: {},
    };
  }
  
  /**
   * Obtém estado de um símbolo (para debug)
   */
  public getState(symbol: string): ORBDailyState | undefined {
    return this.stateBySymbol.get(symbol);
  }
}

// ============= FACTORY =============

export function createORBStrategy(config?: Partial<ORBStrategyConfig>): ORBStrategy {
  return new ORBStrategy(config);
}

// Instância singleton (opcional)
export const orbStrategy = new ORBStrategy();
