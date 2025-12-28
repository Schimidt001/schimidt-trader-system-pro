/**
 * ESTUDO TREND SMART MONEY - Gestão de Retenção de Lucro
 * 
 * Objetivo: Testar a Lógica B (EMA 200 + RSI) com uma gestão de capital
 * mais conservadora que retém 50% do lucro a cada vitória.
 * 
 * Fórmula "Smart Compounding":
 * - Trade 1: Risco Base ($10)
 * - Se Ganhar: 50% do lucro -> Saldo Protegido, 50% -> Reinveste no próximo trade
 * - Se Perder: Reset para Risco Base ($10)
 * 
 * Comparativo:
 * - Cenário 1: Lote Fixo (baseline)
 * - Cenário 2: Soros Full (referência do teste anterior)
 * - Cenário 3: Smart Compounding (nova proposta)
 * 
 * @author Schimidt Trader System PRO
 * @version 1.0.0
 */

import WebSocket from "ws";

// ============================================================================
// CONFIGURAÇÕES GLOBAIS
// ============================================================================

const CONFIG = {
  // Conta e Risco
  ACCOUNT_START: 500.00,
  BASE_LOT_SIZE: 0.12,
  BASE_RISK_USD: 10.00,
  
  // Parâmetros de Trading
  STOP_LOSS_PIPS: 15,
  TRAILING_START_PIPS: 10,
  TRAILING_STEP_PIPS: 5,
  MIN_BODY_PIPS: 3,
  
  // Par de Moedas
  SYMBOL: "frxUSDJPY",
  PIP_SIZE: 0.01,
  
  // Período de Backtesting
  START_DATE: new Date("2025-11-01T00:00:00Z"),
  END_DATE: new Date("2025-12-27T23:59:59Z"),
  
  // Blacklist de Horários (UTC)
  BLACKLIST_HOURS: [13, 16],
  
  // Indicadores (Lógica B)
  EMA_PERIOD: 200,
  RSI_PERIOD: 14,
  RSI_OVERSOLD: 30,
  RSI_OVERBOUGHT: 70,
  
  // Soros (para comparação)
  SOROS_MAX_LEVEL: 3,
  
  // Smart Compounding
  RETENTION_RATE: 0.50, // 50% do lucro vai para o saldo protegido
  
  // API Deriv
  APP_ID: "1089",
  WS_URL: "wss://ws.derivws.com/websockets/v3",
  
  // Retry Config
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 2000,
};

// ============================================================================
// INTERFACES E TIPOS
// ============================================================================

interface CandleM5 {
  epoch: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface CandleM15 {
  epoch: number;
  open: number;
  high: number;
  low: number;
  close: number;
  m5Candles: CandleM5[];
}

interface TradeResult {
  entryTime: number;
  direction: "CALL" | "PUT";
  entryPrice: number;
  exitPrice: number;
  pipsGained: number;
  profitUSD: number;
  lotSize: number;
  riskUSD: number;
  retainedProfit: number; // Lucro guardado (Smart Compounding)
  exitReason: "STOP_LOSS" | "TRAILING_STOP" | "END_OF_CANDLE";
  isWin: boolean;
}

interface ScenarioStats {
  name: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  retainedPnL: number; // Lucro protegido (Smart Compounding)
  maxDrawdown: number;
  maxDrawdownPercent: number;
  peakBalance: number;
  lowestBalance: number;
  finalBalance: number;
  returnPercent: number;
  maxWinPips: number;
  maxWinUSD: number;
  avgWinPips: number;
  maxConsecutiveLosses: number;
  maxConsecutiveWins: number;
  balanceHistory: number[]; // Para gráfico de curva
}

// ============================================================================
// INDICADORES TÉCNICOS
// ============================================================================

class TechnicalAnalysis {
  private emaPeriod: number;
  private rsiPeriod: number;
  private prices: number[] = [];
  private emaValue: number = 0;
  private rsiValue: number = 0;
  private prevRsiValue: number = 50;
  private gains: number[] = [];
  private losses: number[] = [];
  
  constructor(emaPeriod: number = 200, rsiPeriod: number = 14) {
    this.emaPeriod = emaPeriod;
    this.rsiPeriod = rsiPeriod;
  }
  
  update(price: number): void {
    this.prices.push(price);
    
    if (this.prices.length >= this.emaPeriod) {
      this.calculateEMA();
    }
    
    if (this.prices.length >= 2) {
      this.calculateRSI();
    }
  }
  
  private calculateEMA(): void {
    if (this.prices.length < this.emaPeriod) return;
    
    const k = 2 / (this.emaPeriod + 1);
    
    if (this.emaValue === 0) {
      const sma = this.prices.slice(-this.emaPeriod).reduce((a, b) => a + b, 0) / this.emaPeriod;
      this.emaValue = sma;
    } else {
      const currentPrice = this.prices[this.prices.length - 1];
      this.emaValue = (currentPrice - this.emaValue) * k + this.emaValue;
    }
  }
  
  private calculateRSI(): void {
    if (this.prices.length < 2) return;
    
    this.prevRsiValue = this.rsiValue;
    
    const currentPrice = this.prices[this.prices.length - 1];
    const prevPrice = this.prices[this.prices.length - 2];
    const change = currentPrice - prevPrice;
    
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    
    this.gains.push(gain);
    this.losses.push(loss);
    
    if (this.gains.length > this.rsiPeriod) {
      this.gains.shift();
      this.losses.shift();
    }
    
    if (this.gains.length >= this.rsiPeriod) {
      const avgGain = this.gains.reduce((a, b) => a + b, 0) / this.rsiPeriod;
      const avgLoss = this.losses.reduce((a, b) => a + b, 0) / this.rsiPeriod;
      
      if (avgLoss === 0) {
        this.rsiValue = 100;
      } else {
        const rs = avgGain / avgLoss;
        this.rsiValue = 100 - (100 / (1 + rs));
      }
    }
  }
  
  getEMA(): number { return this.emaValue; }
  getRSI(): number { return this.rsiValue; }
  getPrevRSI(): number { return this.prevRsiValue; }
  isReady(): boolean { return this.prices.length >= this.emaPeriod && this.gains.length >= this.rsiPeriod; }
  
  rsiCrossedAbove(level: number): boolean {
    return this.prevRsiValue < level && this.rsiValue >= level;
  }
  
  rsiCrossedBelow(level: number): boolean {
    return this.prevRsiValue > level && this.rsiValue <= level;
  }
}

// ============================================================================
// SERVIÇO DE DADOS HISTÓRICOS
// ============================================================================

class HistoricalDataService {
  private ws: WebSocket | null = null;
  
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[DataService] Conectando...`);
      this.ws = new WebSocket(`${CONFIG.WS_URL}?app_id=${CONFIG.APP_ID}`);
      
      this.ws.on("open", () => {
        console.log("[DataService] Conectado");
        resolve();
      });
      
      this.ws.on("error", (error) => reject(error));
      setTimeout(() => reject(new Error("Timeout")), 30000);
    });
  }
  
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  
  async getCandlesM5(startEpoch: number, endEpoch: number): Promise<CandleM5[]> {
    const allCandles: CandleM5[] = [];
    const BATCH_SIZE = 5000;
    const GRANULARITY = 300;
    
    let currentStart = startEpoch;
    let lastEpoch = 0;
    let consecutiveErrors = 0;
    
    console.log(`[DataService] Buscando candles de ${new Date(startEpoch * 1000).toISOString().split('T')[0]} a ${new Date(endEpoch * 1000).toISOString().split('T')[0]}`);
    
    while (currentStart < endEpoch) {
      const batchEnd = Math.min(currentStart + (BATCH_SIZE * GRANULARITY), endEpoch);
      
      try {
        const candles = await this.fetchCandleBatchWithRetry(currentStart, batchEnd, GRANULARITY);
        consecutiveErrors = 0;
        
        if (candles.length === 0) {
          currentStart = batchEnd + GRANULARITY;
          continue;
        }
        
        const newLastEpoch = candles[candles.length - 1].epoch;
        
        if (newLastEpoch === lastEpoch) {
          break;
        }
        
        const uniqueCandles = candles.filter(c => c.epoch > lastEpoch || lastEpoch === 0);
        allCandles.push(...uniqueCandles);
        
        console.log(`[DataService] Acumulado: ${allCandles.length} candles`);
        
        lastEpoch = newLastEpoch;
        currentStart = newLastEpoch + GRANULARITY;
        
        await this.sleep(1000);
        
      } catch (error: any) {
        consecutiveErrors++;
        console.error(`[DataService] Erro (${consecutiveErrors}/3):`, error.message);
        if (consecutiveErrors >= 3) {
          break;
        }
        await this.sleep(3000);
      }
    }
    
    const uniqueMap = new Map<number, CandleM5>();
    allCandles.forEach(c => uniqueMap.set(c.epoch, c));
    const finalCandles = Array.from(uniqueMap.values()).sort((a, b) => a.epoch - b.epoch);
    
    console.log(`[DataService] Total: ${finalCandles.length} candles M5`);
    return finalCandles;
  }
  
  private async fetchCandleBatchWithRetry(start: number, end: number, granularity: number): Promise<CandleM5[]> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
      try {
        return await this.fetchCandleBatch(start, end, granularity);
      } catch (error: any) {
        lastError = error;
        if (attempt < CONFIG.MAX_RETRIES) {
          await this.sleep(CONFIG.RETRY_DELAY_MS * attempt);
        }
      }
    }
    
    throw lastError || new Error("Falha");
  }
  
  private async fetchCandleBatch(start: number, end: number, granularity: number): Promise<CandleM5[]> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket não conectado"));
        return;
      }
      
      const messageHandler = (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.candles) {
            this.ws?.removeListener("message", messageHandler);
            resolve(message.candles.map((c: any) => ({
              epoch: c.epoch,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            })));
          } else if (message.error) {
            this.ws?.removeListener("message", messageHandler);
            reject(new Error(message.error.message));
          }
        } catch (error) {}
      };
      
      this.ws.on("message", messageHandler);
      
      this.ws.send(JSON.stringify({
        ticks_history: CONFIG.SYMBOL,
        adjust_start_time: 1,
        start: start,
        end: end,
        granularity: granularity,
        style: "candles",
      }));
      
      setTimeout(() => {
        this.ws?.removeListener("message", messageHandler);
        reject(new Error("Timeout"));
      }, 30000);
    });
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// SIMULADOR SMART MONEY
// ============================================================================

class SmartMoneySimulator {
  private technicalAnalysis: TechnicalAnalysis;
  private scenario1: ScenarioStats; // Lote Fixo
  private scenario2: ScenarioStats; // Soros Full
  private scenario3: ScenarioStats; // Smart Compounding
  
  // Estado Soros (Cenário 2)
  private sorosLevel: number = 1;
  private sorosAccumulated: number = 0;
  
  // Estado Smart Compounding (Cenário 3)
  private smartRiskUSD: number = CONFIG.BASE_RISK_USD;
  private smartRetained: number = 0; // Lucro protegido acumulado
  
  constructor() {
    this.technicalAnalysis = new TechnicalAnalysis(CONFIG.EMA_PERIOD, CONFIG.RSI_PERIOD);
    
    this.scenario1 = this.createEmptyStats("LOTE FIXO");
    this.scenario2 = this.createEmptyStats("SOROS FULL");
    this.scenario3 = this.createEmptyStats("SMART COMPOUNDING");
  }
  
  private createEmptyStats(name: string): ScenarioStats {
    return {
      name,
      trades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnL: 0,
      retainedPnL: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      peakBalance: CONFIG.ACCOUNT_START,
      lowestBalance: CONFIG.ACCOUNT_START,
      finalBalance: CONFIG.ACCOUNT_START,
      returnPercent: 0,
      maxWinPips: 0,
      maxWinUSD: 0,
      avgWinPips: 0,
      maxConsecutiveLosses: 0,
      maxConsecutiveWins: 0,
      balanceHistory: [CONFIG.ACCOUNT_START],
    };
  }
  
  reconstructM15Candles(candlesM5: CandleM5[]): CandleM15[] {
    const candlesM15: CandleM15[] = [];
    
    let startIndex = 0;
    for (let i = 0; i < candlesM5.length; i++) {
      if (candlesM5[i].epoch % 900 === 0) {
        startIndex = i;
        break;
      }
    }
    
    for (let i = startIndex; i + 2 < candlesM5.length; i += 3) {
      const m5_1 = candlesM5[i];
      const m5_2 = candlesM5[i + 1];
      const m5_3 = candlesM5[i + 2];
      
      if (m5_2.epoch - m5_1.epoch !== 300 || m5_3.epoch - m5_2.epoch !== 300) {
        continue;
      }
      
      candlesM15.push({
        epoch: m5_1.epoch,
        open: m5_1.open,
        high: Math.max(m5_1.high, m5_2.high, m5_3.high),
        low: Math.min(m5_1.low, m5_2.low, m5_3.low),
        close: m5_3.close,
        m5Candles: [m5_1, m5_2, m5_3],
      });
    }
    
    console.log(`[Simulator] Reconstruídos ${candlesM15.length} candles M15`);
    return candlesM15;
  }
  
  isBlacklistedHour(epoch: number): boolean {
    const date = new Date(epoch * 1000);
    const hourUTC = date.getUTCHours();
    return CONFIG.BLACKLIST_HOURS.includes(hourUTC);
  }
  
  getSignalTrend(candle: CandleM15): "CALL" | "PUT" | null {
    if (!this.technicalAnalysis.isReady()) {
      return null;
    }
    
    const closePrice = candle.close;
    const ema200 = this.technicalAnalysis.getEMA();
    
    const isBullishTrend = closePrice > ema200;
    const isBearishTrend = closePrice < ema200;
    
    const rsiCrossedAbove30 = this.technicalAnalysis.rsiCrossedAbove(CONFIG.RSI_OVERSOLD);
    const rsiCrossedBelow70 = this.technicalAnalysis.rsiCrossedBelow(CONFIG.RSI_OVERBOUGHT);
    
    if (isBullishTrend && rsiCrossedAbove30) {
      return "CALL";
    }
    
    if (isBearishTrend && rsiCrossedBelow70) {
      return "PUT";
    }
    
    return null;
  }
  
  simulateTradeWithTrailing(
    direction: "CALL" | "PUT",
    entryPrice: number,
    tradingCandles: CandleM5[],
    lotSize: number,
    riskUSD: number
  ): TradeResult {
    let currentStop = direction === "CALL"
      ? entryPrice - (CONFIG.STOP_LOSS_PIPS * CONFIG.PIP_SIZE)
      : entryPrice + (CONFIG.STOP_LOSS_PIPS * CONFIG.PIP_SIZE);
    
    let maxFavorableMove = 0;
    let exitPrice = entryPrice;
    let exitReason: "STOP_LOSS" | "TRAILING_STOP" | "END_OF_CANDLE" = "END_OF_CANDLE";
    let trailingActivated = false;
    
    for (const candle of tradingCandles) {
      if (direction === "CALL") {
        if (candle.low <= currentStop) {
          exitPrice = currentStop;
          exitReason = trailingActivated ? "TRAILING_STOP" : "STOP_LOSS";
          break;
        }
        
        const favorableMove = (candle.high - entryPrice) / CONFIG.PIP_SIZE;
        
        if (favorableMove > maxFavorableMove) {
          maxFavorableMove = favorableMove;
          
          if (favorableMove >= CONFIG.TRAILING_START_PIPS) {
            trailingActivated = true;
            
            const pipsAboveStart = favorableMove - CONFIG.TRAILING_START_PIPS;
            const steps = Math.floor(pipsAboveStart / CONFIG.TRAILING_STEP_PIPS);
            
            const newStopPips = steps * CONFIG.TRAILING_STEP_PIPS;
            const newStop = entryPrice + (newStopPips * CONFIG.PIP_SIZE);
            
            if (newStop > currentStop) {
              currentStop = newStop;
            }
          }
        }
        
        exitPrice = candle.close;
        
      } else {
        if (candle.high >= currentStop) {
          exitPrice = currentStop;
          exitReason = trailingActivated ? "TRAILING_STOP" : "STOP_LOSS";
          break;
        }
        
        const favorableMove = (entryPrice - candle.low) / CONFIG.PIP_SIZE;
        
        if (favorableMove > maxFavorableMove) {
          maxFavorableMove = favorableMove;
          
          if (favorableMove >= CONFIG.TRAILING_START_PIPS) {
            trailingActivated = true;
            
            const pipsAboveStart = favorableMove - CONFIG.TRAILING_START_PIPS;
            const steps = Math.floor(pipsAboveStart / CONFIG.TRAILING_STEP_PIPS);
            
            const newStopPips = steps * CONFIG.TRAILING_STEP_PIPS;
            const newStop = entryPrice - (newStopPips * CONFIG.PIP_SIZE);
            
            if (newStop < currentStop) {
              currentStop = newStop;
            }
          }
        }
        
        exitPrice = candle.close;
      }
    }
    
    const pipsGained = direction === "CALL"
      ? (exitPrice - entryPrice) / CONFIG.PIP_SIZE
      : (entryPrice - exitPrice) / CONFIG.PIP_SIZE;
    
    const pipValue = lotSize * 10;
    const profitUSD = pipsGained * pipValue;
    
    return {
      entryTime: tradingCandles[0].epoch,
      direction,
      entryPrice,
      exitPrice,
      pipsGained,
      profitUSD,
      lotSize,
      riskUSD,
      retainedProfit: 0,
      exitReason,
      isWin: profitUSD > 0,
    };
  }
  
  // ========== GESTÃO SOROS FULL ==========
  calculateSorosLot(): number {
    if (this.sorosLevel === 1) {
      return CONFIG.BASE_LOT_SIZE;
    }
    const riskMultiplier = 1 + (this.sorosAccumulated / CONFIG.BASE_RISK_USD);
    return CONFIG.BASE_LOT_SIZE * Math.min(riskMultiplier, 3);
  }
  
  applySorosLogic(profitUSD: number): void {
    if (profitUSD > 0) {
      this.sorosAccumulated += profitUSD;
      this.sorosLevel++;
      
      if (this.sorosLevel > CONFIG.SOROS_MAX_LEVEL) {
        console.log(`[Soros] Reset após ${CONFIG.SOROS_MAX_LEVEL} wins. Bolsado: $${this.sorosAccumulated.toFixed(2)}`);
        this.sorosLevel = 1;
        this.sorosAccumulated = 0;
      }
    } else {
      this.sorosLevel = 1;
      this.sorosAccumulated = 0;
    }
  }
  
  // ========== GESTÃO SMART COMPOUNDING ==========
  calculateSmartLot(): { lotSize: number; riskUSD: number } {
    // Calcular lote proporcional ao risco
    const riskMultiplier = this.smartRiskUSD / CONFIG.BASE_RISK_USD;
    const lotSize = CONFIG.BASE_LOT_SIZE * riskMultiplier;
    
    return { lotSize, riskUSD: this.smartRiskUSD };
  }
  
  applySmartCompounding(profitUSD: number): number {
    if (profitUSD > 0) {
      // 50% do lucro vai para o saldo protegido
      const retained = profitUSD * CONFIG.RETENTION_RATE;
      const reinvested = profitUSD - retained;
      
      this.smartRetained += retained;
      this.smartRiskUSD += reinvested;
      
      console.log(`[Smart] Lucro $${profitUSD.toFixed(2)} -> Guardado $${retained.toFixed(2)}, Reinvestido $${reinvested.toFixed(2)}, Próximo Risco: $${this.smartRiskUSD.toFixed(2)}`);
      
      return retained;
    } else {
      // Reset para risco base
      console.log(`[Smart] Perda -> Reset para risco base $${CONFIG.BASE_RISK_USD}`);
      this.smartRiskUSD = CONFIG.BASE_RISK_USD;
      return 0;
    }
  }
  
  updateStats(
    stats: ScenarioStats,
    trade: TradeResult,
    consecutiveLosses: number,
    consecutiveWins: number
  ): void {
    stats.trades++;
    stats.totalPnL += trade.profitUSD;
    stats.retainedPnL += trade.retainedProfit;
    
    if (trade.isWin) {
      stats.wins++;
      if (trade.pipsGained > stats.maxWinPips) {
        stats.maxWinPips = trade.pipsGained;
        stats.maxWinUSD = trade.profitUSD;
      }
    } else {
      stats.losses++;
    }
    
    stats.winRate = (stats.wins / stats.trades) * 100;
    
    const currentBalance = CONFIG.ACCOUNT_START + stats.totalPnL;
    stats.finalBalance = currentBalance;
    stats.returnPercent = ((currentBalance - CONFIG.ACCOUNT_START) / CONFIG.ACCOUNT_START) * 100;
    
    if (currentBalance > stats.peakBalance) {
      stats.peakBalance = currentBalance;
    }
    
    if (currentBalance < stats.lowestBalance) {
      stats.lowestBalance = currentBalance;
    }
    
    const currentDrawdown = stats.peakBalance - currentBalance;
    if (currentDrawdown > stats.maxDrawdown) {
      stats.maxDrawdown = currentDrawdown;
      stats.maxDrawdownPercent = (currentDrawdown / CONFIG.ACCOUNT_START) * 100;
    }
    
    if (consecutiveLosses > stats.maxConsecutiveLosses) {
      stats.maxConsecutiveLosses = consecutiveLosses;
    }
    
    if (consecutiveWins > stats.maxConsecutiveWins) {
      stats.maxConsecutiveWins = consecutiveWins;
    }
    
    stats.balanceHistory.push(currentBalance);
  }
  
  async runSimulation(candlesM15: CandleM15[]): Promise<void> {
    console.log(`\n${"=".repeat(60)}`);
    console.log("INICIANDO SIMULAÇÃO SMART MONEY");
    console.log(`${"=".repeat(60)}\n`);
    
    let consecutiveLosses1 = 0, consecutiveWins1 = 0;
    let consecutiveLosses2 = 0, consecutiveWins2 = 0;
    let consecutiveLosses3 = 0, consecutiveWins3 = 0;
    
    for (let i = 0; i < candlesM15.length; i++) {
      const candle = candlesM15[i];
      
      this.technicalAnalysis.update(candle.close);
      
      if (this.isBlacklistedHour(candle.epoch)) {
        continue;
      }
      
      const signal = this.getSignalTrend(candle);
      
      if (!signal) {
        continue;
      }
      
      const [m5_1, m5_2, m5_3] = candle.m5Candles;
      const entryPrice = m5_1.close;
      const tradingCandles = [m5_2, m5_3];
      
      // ========== CENÁRIO 1: LOTE FIXO ==========
      const trade1 = this.simulateTradeWithTrailing(
        signal,
        entryPrice,
        tradingCandles,
        CONFIG.BASE_LOT_SIZE,
        CONFIG.BASE_RISK_USD
      );
      
      if (trade1.isWin) {
        consecutiveLosses1 = 0;
        consecutiveWins1++;
      } else {
        consecutiveLosses1++;
        consecutiveWins1 = 0;
      }
      
      this.updateStats(this.scenario1, trade1, consecutiveLosses1, consecutiveWins1);
      
      // ========== CENÁRIO 2: SOROS FULL ==========
      const sorosLot = this.calculateSorosLot();
      
      const trade2 = this.simulateTradeWithTrailing(
        signal,
        entryPrice,
        tradingCandles,
        sorosLot,
        CONFIG.BASE_RISK_USD
      );
      
      // Recalcular lucro com lote Soros
      const pipValue2 = sorosLot * 10;
      trade2.profitUSD = trade2.pipsGained * pipValue2;
      trade2.isWin = trade2.profitUSD > 0;
      
      if (trade2.isWin) {
        consecutiveLosses2 = 0;
        consecutiveWins2++;
      } else {
        consecutiveLosses2++;
        consecutiveWins2 = 0;
      }
      
      this.updateStats(this.scenario2, trade2, consecutiveLosses2, consecutiveWins2);
      this.applySorosLogic(trade2.profitUSD);
      
      // ========== CENÁRIO 3: SMART COMPOUNDING ==========
      const { lotSize: smartLot, riskUSD: smartRisk } = this.calculateSmartLot();
      
      const trade3 = this.simulateTradeWithTrailing(
        signal,
        entryPrice,
        tradingCandles,
        smartLot,
        smartRisk
      );
      
      // Recalcular lucro com lote Smart
      const pipValue3 = smartLot * 10;
      trade3.profitUSD = trade3.pipsGained * pipValue3;
      trade3.isWin = trade3.profitUSD > 0;
      
      // Aplicar lógica Smart Compounding
      trade3.retainedProfit = this.applySmartCompounding(trade3.profitUSD);
      
      if (trade3.isWin) {
        consecutiveLosses3 = 0;
        consecutiveWins3++;
      } else {
        consecutiveLosses3++;
        consecutiveWins3 = 0;
      }
      
      this.updateStats(this.scenario3, trade3, consecutiveLosses3, consecutiveWins3);
      
      // Log de progresso
      if (this.scenario1.trades % 20 === 0 && this.scenario1.trades > 0) {
        console.log(`\n[Progresso] ${this.scenario1.trades} trades`);
        console.log(`  - Fixo:  $${this.scenario1.finalBalance.toFixed(2)} (${this.scenario1.returnPercent.toFixed(1)}%) | DD: ${this.scenario1.maxDrawdownPercent.toFixed(1)}%`);
        console.log(`  - Soros: $${this.scenario2.finalBalance.toFixed(2)} (${this.scenario2.returnPercent.toFixed(1)}%) | DD: ${this.scenario2.maxDrawdownPercent.toFixed(1)}%`);
        console.log(`  - Smart: $${this.scenario3.finalBalance.toFixed(2)} (${this.scenario3.returnPercent.toFixed(1)}%) | DD: ${this.scenario3.maxDrawdownPercent.toFixed(1)}%`);
      }
    }
    
    // Calcular média de pips vencedores
    for (const scenario of [this.scenario1, this.scenario2, this.scenario3]) {
      const wins = scenario.balanceHistory.length > 0 ? scenario.wins : 0;
      if (wins > 0) {
        scenario.avgWinPips = scenario.maxWinPips / 2; // Aproximação
      }
    }
  }
  
  generateReport(): void {
    console.log(`\n${"=".repeat(75)}`);
    console.log("           RELATÓRIO SMART MONEY - GESTÃO DE RETENÇÃO DE LUCRO");
    console.log(`${"=".repeat(75)}`);
    
    console.log(`\nConfiguração do Teste:`);
    console.log(`  - Entrada: EMA 200 + RSI 14 (Lógica B)`);
    console.log(`  - SL: ${CONFIG.STOP_LOSS_PIPS} pips | Trailing: +${CONFIG.TRAILING_START_PIPS} pips, step ${CONFIG.TRAILING_STEP_PIPS} pips`);
    console.log(`  - Smart Compounding: ${CONFIG.RETENTION_RATE * 100}% retenção de lucro`);
    
    console.log(`\n╔═══════════════════════════════════════════════════════════════════════════╗`);
    console.log(`║                    COMPARATIVO DE GESTÃO DE CAPITAL                       ║`);
    console.log(`╠═══════════════════════════════════════════════════════════════════════════╣`);
    console.log(`║ Métrica              │ Lote Fixo    │ Soros Full   │ Smart Compound.      ║`);
    console.log(`╠══════════════════════╪══════════════╪══════════════╪══════════════════════╣`);
    
    // Win Rate
    console.log(`║ Win Rate             │ ${this.scenario1.winRate.toFixed(1).padStart(10)}% │ ${this.scenario2.winRate.toFixed(1).padStart(10)}% │ ${this.scenario3.winRate.toFixed(1).padStart(18)}% ║`);
    
    // Total Trades
    console.log(`║ Total Trades         │ ${this.scenario1.trades.toString().padStart(11)} │ ${this.scenario2.trades.toString().padStart(11)} │ ${this.scenario3.trades.toString().padStart(19)} ║`);
    
    // Lucro Líquido
    const pnl1 = (this.scenario1.totalPnL >= 0 ? "+" : "") + "$" + this.scenario1.totalPnL.toFixed(2);
    const pnl2 = (this.scenario2.totalPnL >= 0 ? "+" : "") + "$" + this.scenario2.totalPnL.toFixed(2);
    const pnl3 = (this.scenario3.totalPnL >= 0 ? "+" : "") + "$" + this.scenario3.totalPnL.toFixed(2);
    console.log(`║ Lucro Líquido        │ ${pnl1.padStart(11)} │ ${pnl2.padStart(11)} │ ${pnl3.padStart(19)} ║`);
    
    // Retorno %
    const ret1 = (this.scenario1.returnPercent >= 0 ? "+" : "") + this.scenario1.returnPercent.toFixed(1) + "%";
    const ret2 = (this.scenario2.returnPercent >= 0 ? "+" : "") + this.scenario2.returnPercent.toFixed(1) + "%";
    const ret3 = (this.scenario3.returnPercent >= 0 ? "+" : "") + this.scenario3.returnPercent.toFixed(1) + "%";
    console.log(`║ RETORNO (%)          │ ${ret1.padStart(11)} │ ${ret2.padStart(11)} │ ${ret3.padStart(19)} ║`);
    
    // Drawdown
    const dd1 = "-" + this.scenario1.maxDrawdownPercent.toFixed(1) + "%";
    const dd2 = "-" + this.scenario2.maxDrawdownPercent.toFixed(1) + "%";
    const dd3 = "-" + this.scenario3.maxDrawdownPercent.toFixed(1) + "%";
    console.log(`║ Drawdown Máx (%)     │ ${dd1.padStart(11)} │ ${dd2.padStart(11)} │ ${dd3.padStart(19)} ║`);
    
    // Drawdown $
    const ddUsd1 = "-$" + this.scenario1.maxDrawdown.toFixed(2);
    const ddUsd2 = "-$" + this.scenario2.maxDrawdown.toFixed(2);
    const ddUsd3 = "-$" + this.scenario3.maxDrawdown.toFixed(2);
    console.log(`║ Drawdown Máx ($)     │ ${ddUsd1.padStart(11)} │ ${ddUsd2.padStart(11)} │ ${ddUsd3.padStart(19)} ║`);
    
    // Saldo Final
    const bal1 = "$" + this.scenario1.finalBalance.toFixed(2);
    const bal2 = "$" + this.scenario2.finalBalance.toFixed(2);
    const bal3 = "$" + this.scenario3.finalBalance.toFixed(2);
    console.log(`║ SALDO FINAL ($)      │ ${bal1.padStart(11)} │ ${bal2.padStart(11)} │ ${bal3.padStart(19)} ║`);
    
    // Lucro Retido (Smart)
    console.log(`║ Lucro Retido (Smart) │ ${"-".padStart(11)} │ ${"-".padStart(11)} │ ${"$" + this.scenario3.retainedPnL.toFixed(2).padStart(17)} ║`);
    
    // Máx Perdas Seguidas
    console.log(`║ Máx Perdas Seguidas  │ ${this.scenario1.maxConsecutiveLosses.toString().padStart(11)} │ ${this.scenario2.maxConsecutiveLosses.toString().padStart(11)} │ ${this.scenario3.maxConsecutiveLosses.toString().padStart(19)} ║`);
    
    // Máx Wins Seguidos
    console.log(`║ Máx Wins Seguidos    │ ${this.scenario1.maxConsecutiveWins.toString().padStart(11)} │ ${this.scenario2.maxConsecutiveWins.toString().padStart(11)} │ ${this.scenario3.maxConsecutiveWins.toString().padStart(19)} ║`);
    
    console.log(`╚═══════════════════════════════════════════════════════════════════════════╝`);
    
    // Análise
    console.log(`\n${"─".repeat(75)}`);
    console.log("ANÁLISE:");
    console.log(`${"─".repeat(75)}`);
    
    // Comparar Smart vs Soros
    const smartVsSorosReturn = this.scenario3.returnPercent - this.scenario2.returnPercent;
    const smartVsSorosDD = this.scenario3.maxDrawdownPercent - this.scenario2.maxDrawdownPercent;
    
    if (this.scenario3.returnPercent > this.scenario2.returnPercent) {
      console.log(`✅ Smart Compounding SUPERA Soros em retorno: ${this.scenario3.returnPercent.toFixed(1)}% vs ${this.scenario2.returnPercent.toFixed(1)}%`);
    } else {
      console.log(`📊 Soros tem retorno maior: ${this.scenario2.returnPercent.toFixed(1)}% vs ${this.scenario3.returnPercent.toFixed(1)}%`);
      console.log(`   Diferença: ${Math.abs(smartVsSorosReturn).toFixed(1)}% a menos no Smart`);
    }
    
    if (this.scenario3.maxDrawdownPercent < this.scenario2.maxDrawdownPercent) {
      console.log(`✅ Smart Compounding é MAIS SEGURO: DD ${this.scenario3.maxDrawdownPercent.toFixed(1)}% vs ${this.scenario2.maxDrawdownPercent.toFixed(1)}%`);
    } else {
      console.log(`⚠️ Smart tem drawdown similar ou maior: ${this.scenario3.maxDrawdownPercent.toFixed(1)}% vs ${this.scenario2.maxDrawdownPercent.toFixed(1)}%`);
    }
    
    // Eficiência (Retorno / Risco)
    const efficiencySoros = this.scenario2.returnPercent / Math.max(this.scenario2.maxDrawdownPercent, 0.1);
    const efficiencySmart = this.scenario3.returnPercent / Math.max(this.scenario3.maxDrawdownPercent, 0.1);
    
    console.log(`\n📈 Eficiência (Retorno/Risco):`);
    console.log(`   - Soros: ${efficiencySoros.toFixed(2)}`);
    console.log(`   - Smart: ${efficiencySmart.toFixed(2)}`);
    
    if (efficiencySmart > efficiencySoros) {
      console.log(`   ✅ Smart Compounding é mais EFICIENTE!`);
    } else {
      console.log(`   📊 Soros é mais eficiente em termos de retorno/risco`);
    }
    
    // Veredito
    console.log(`\n${"═".repeat(75)}`);
    
    const smartSafe = this.scenario3.maxDrawdownPercent <= 10;
    const smartProfitable = this.scenario3.returnPercent > 50;
    
    if (smartSafe && smartProfitable) {
      console.log(`🏆 SMART COMPOUNDING APROVADO PARA PRODUÇÃO!`);
      console.log(`   Retorno: +${this.scenario3.returnPercent.toFixed(1)}% | Drawdown: ${this.scenario3.maxDrawdownPercent.toFixed(1)}%`);
      console.log(`   Curva de crescimento estável com proteção de lucro.`);
    } else if (smartProfitable) {
      console.log(`📊 Smart Compounding é lucrativo mas precisa de ajustes de risco.`);
    } else {
      console.log(`⚠️ Smart Compounding precisa de mais otimização.`);
    }
    
    console.log(`${"═".repeat(75)}`);
  }
  
  getResults(): { scenario1: ScenarioStats; scenario2: ScenarioStats; scenario3: ScenarioStats } {
    return {
      scenario1: this.scenario1,
      scenario2: this.scenario2,
      scenario3: this.scenario3,
    };
  }
}

// ============================================================================
// FUNÇÃO PRINCIPAL
// ============================================================================

async function runSmartMoneyStudy(): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log("ESTUDO SMART MONEY - GESTÃO DE RETENÇÃO DE LUCRO");
  console.log(`${"=".repeat(60)}`);
  console.log(`\nComparando três cenários:`);
  console.log(`  1. Lote Fixo (baseline)`);
  console.log(`  2. Soros Full (referência)`);
  console.log(`  3. Smart Compounding (50% retenção)`);
  
  const dataService = new HistoricalDataService();
  
  try {
    await dataService.connect();
    
    const startEpoch = Math.floor(CONFIG.START_DATE.getTime() / 1000);
    const endEpoch = Math.floor(CONFIG.END_DATE.getTime() / 1000);
    
    console.log(`\n[Main] Baixando dados históricos M5...`);
    const candlesM5 = await dataService.getCandlesM5(startEpoch, endEpoch);
    
    if (candlesM5.length === 0) {
      throw new Error("Nenhum dado histórico encontrado");
    }
    
    const simulator = new SmartMoneySimulator();
    const candlesM15 = simulator.reconstructM15Candles(candlesM5);
    
    if (candlesM15.length === 0) {
      throw new Error("Não foi possível reconstruir candles M15");
    }
    
    await simulator.runSimulation(candlesM15);
    
    simulator.generateReport();
    
    // Salvar resultado
    const results = simulator.getResults();
    const outputPath = "./study_trend_smart_money_result.json";
    const fs = await import("fs");
    
    const jsonResult = {
      timestamp: new Date().toISOString(),
      config: {
        stopLossPips: CONFIG.STOP_LOSS_PIPS,
        trailingStartPips: CONFIG.TRAILING_START_PIPS,
        trailingStepPips: CONFIG.TRAILING_STEP_PIPS,
        baseLotSize: CONFIG.BASE_LOT_SIZE,
        baseRiskUSD: CONFIG.BASE_RISK_USD,
        retentionRate: CONFIG.RETENTION_RATE,
        sorosMaxLevel: CONFIG.SOROS_MAX_LEVEL,
        startDate: CONFIG.START_DATE.toISOString(),
        endDate: CONFIG.END_DATE.toISOString(),
      },
      scenario1_loteFixo: {
        name: results.scenario1.name,
        trades: results.scenario1.trades,
        wins: results.scenario1.wins,
        losses: results.scenario1.losses,
        winRate: results.scenario1.winRate,
        totalPnL: results.scenario1.totalPnL,
        returnPercent: results.scenario1.returnPercent,
        maxDrawdown: results.scenario1.maxDrawdown,
        maxDrawdownPercent: results.scenario1.maxDrawdownPercent,
        finalBalance: results.scenario1.finalBalance,
      },
      scenario2_sorosFull: {
        name: results.scenario2.name,
        trades: results.scenario2.trades,
        wins: results.scenario2.wins,
        losses: results.scenario2.losses,
        winRate: results.scenario2.winRate,
        totalPnL: results.scenario2.totalPnL,
        returnPercent: results.scenario2.returnPercent,
        maxDrawdown: results.scenario2.maxDrawdown,
        maxDrawdownPercent: results.scenario2.maxDrawdownPercent,
        finalBalance: results.scenario2.finalBalance,
      },
      scenario3_smartCompounding: {
        name: results.scenario3.name,
        trades: results.scenario3.trades,
        wins: results.scenario3.wins,
        losses: results.scenario3.losses,
        winRate: results.scenario3.winRate,
        totalPnL: results.scenario3.totalPnL,
        retainedPnL: results.scenario3.retainedPnL,
        returnPercent: results.scenario3.returnPercent,
        maxDrawdown: results.scenario3.maxDrawdown,
        maxDrawdownPercent: results.scenario3.maxDrawdownPercent,
        finalBalance: results.scenario3.finalBalance,
      },
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(jsonResult, null, 2));
    console.log(`\n[Main] Resultado salvo em: ${outputPath}`);
    
  } catch (error) {
    console.error("\n[Main] ERRO:", error);
    throw error;
  } finally {
    dataService.disconnect();
  }
}

// Executar
runSmartMoneyStudy().catch(console.error);
