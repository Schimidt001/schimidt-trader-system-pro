/**
 * ESTUDO TREND AGGRESSIVE - Escalando a Lucratividade
 * 
 * Objetivo: Testar a Lógica B (EMA 200 + RSI) com trailing stop agressivo
 * para capturar tendências longas, comparando dois cenários de gestão:
 * 
 * Cenário 1: Lote Fixo (0.12)
 * Cenário 2: Soros Nível 3 (reinvestir lucro de até 3 vitórias)
 * 
 * Configuração:
 * - Entrada: EMA 200 + RSI 14 (validada no teste A/B)
 * - TP: Infinito (sem limite de lucro)
 * - SL Inicial: 15 pips
 * - Trailing: Ativa após +10 pips, move a cada +5 pips
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
  STOP_LOSS_PIPS: 15,              // SL inicial mais amplo
  TRAILING_START_PIPS: 10,         // Trailing ativa após +10 pips
  TRAILING_STEP_PIPS: 5,           // Move a cada +5 pips
  MIN_BODY_PIPS: 3,                // Filtro de qualidade
  
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
  
  // Soros
  SOROS_MAX_LEVEL: 3,
  
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
  sorosLevel: number;
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
  tradeHistory: TradeResult[];
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
    
    console.log(`[DataService] Buscando candles de ${new Date(startEpoch * 1000).toISOString()} a ${new Date(endEpoch * 1000).toISOString()}`);
    
    while (currentStart < endEpoch) {
      const batchEnd = Math.min(currentStart + (BATCH_SIZE * GRANULARITY), endEpoch);
      
      console.log(`[DataService] Batch: ${new Date(currentStart * 1000).toISOString().split('T')[0]}`);
      
      try {
        const candles = await this.fetchCandleBatchWithRetry(currentStart, batchEnd, GRANULARITY);
        consecutiveErrors = 0;
        
        console.log(`[DataService] Recebidos ${candles.length} candles`);
        
        if (candles.length === 0) {
          currentStart = batchEnd + GRANULARITY;
          continue;
        }
        
        const newLastEpoch = candles[candles.length - 1].epoch;
        
        if (newLastEpoch === lastEpoch) {
          console.log(`[DataService] Fim dos dados disponíveis`);
          break;
        }
        
        const uniqueCandles = candles.filter(c => c.epoch > lastEpoch || lastEpoch === 0);
        allCandles.push(...uniqueCandles);
        
        console.log(`[DataService] Total acumulado: ${allCandles.length}`);
        
        lastEpoch = newLastEpoch;
        currentStart = newLastEpoch + GRANULARITY;
        
        await this.sleep(1000);
        
      } catch (error: any) {
        consecutiveErrors++;
        console.error(`[DataService] Erro (${consecutiveErrors}/3):`, error.message);
        if (consecutiveErrors >= 3) {
          console.log(`[DataService] Usando dados obtidos até agora`);
          break;
        }
        await this.sleep(3000);
      }
    }
    
    const uniqueMap = new Map<number, CandleM5>();
    allCandles.forEach(c => uniqueMap.set(c.epoch, c));
    const finalCandles = Array.from(uniqueMap.values()).sort((a, b) => a.epoch - b.epoch);
    
    console.log(`[DataService] Total final: ${finalCandles.length} candles M5`);
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
// SIMULADOR AGRESSIVO
// ============================================================================

class AggressiveSimulator {
  private technicalAnalysis: TechnicalAnalysis;
  private scenario1: ScenarioStats; // Lote Fixo
  private scenario2: ScenarioStats; // Soros
  
  // Estado Soros para Cenário 2
  private sorosLevel: number = 1;
  private accumulatedProfit: number = 0;
  
  constructor() {
    this.technicalAnalysis = new TechnicalAnalysis(CONFIG.EMA_PERIOD, CONFIG.RSI_PERIOD);
    
    this.scenario1 = this.createEmptyStats("LOTE FIXO (0.12)");
    this.scenario2 = this.createEmptyStats("SOROS NÍVEL 3");
  }
  
  private createEmptyStats(name: string): ScenarioStats {
    return {
      name,
      trades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnL: 0,
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
      tradeHistory: [],
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
  
  /**
   * Lógica B: Trend Following (EMA 200 + RSI 14)
   */
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
  
  /**
   * Simula trade com trailing stop agressivo
   */
  simulateTradeWithTrailing(
    direction: "CALL" | "PUT",
    entryPrice: number,
    tradingCandles: CandleM5[],
    lotSize: number,
    sorosLevel: number
  ): TradeResult {
    // Stop Loss inicial
    let currentStop = direction === "CALL"
      ? entryPrice - (CONFIG.STOP_LOSS_PIPS * CONFIG.PIP_SIZE)
      : entryPrice + (CONFIG.STOP_LOSS_PIPS * CONFIG.PIP_SIZE);
    
    let maxFavorableMove = 0;
    let exitPrice = entryPrice;
    let exitReason: "STOP_LOSS" | "TRAILING_STOP" | "END_OF_CANDLE" = "END_OF_CANDLE";
    let trailingActivated = false;
    
    // Simular usando high/low dos candles M5
    for (const candle of tradingCandles) {
      if (direction === "CALL") {
        // Verificar SL
        if (candle.low <= currentStop) {
          exitPrice = currentStop;
          exitReason = trailingActivated ? "TRAILING_STOP" : "STOP_LOSS";
          break;
        }
        
        // Calcular movimento favorável
        const favorableMove = (candle.high - entryPrice) / CONFIG.PIP_SIZE;
        
        if (favorableMove > maxFavorableMove) {
          maxFavorableMove = favorableMove;
          
          // Ativar trailing após TRAILING_START_PIPS
          if (favorableMove >= CONFIG.TRAILING_START_PIPS) {
            trailingActivated = true;
            
            // Calcular novo stop
            const pipsAboveStart = favorableMove - CONFIG.TRAILING_START_PIPS;
            const steps = Math.floor(pipsAboveStart / CONFIG.TRAILING_STEP_PIPS);
            
            // Primeiro trailing: breakeven (0 pips)
            // Depois: +5, +10, +15...
            const newStopPips = steps * CONFIG.TRAILING_STEP_PIPS;
            const newStop = entryPrice + (newStopPips * CONFIG.PIP_SIZE);
            
            if (newStop > currentStop) {
              currentStop = newStop;
            }
          }
        }
        
        exitPrice = candle.close;
        
      } else {
        // PUT
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
    
    // Calcular resultado
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
      sorosLevel,
      exitReason,
      isWin: profitUSD > 0,
    };
  }
  
  /**
   * Calcula lote para Soros
   */
  calculateSorosLot(): number {
    if (this.sorosLevel === 1) {
      return CONFIG.BASE_LOT_SIZE;
    }
    
    // Aumentar lote proporcionalmente ao lucro acumulado
    const riskMultiplier = 1 + (this.accumulatedProfit / CONFIG.BASE_RISK_USD);
    return CONFIG.BASE_LOT_SIZE * Math.min(riskMultiplier, 3); // Max 3x
  }
  
  /**
   * Aplica lógica Soros
   */
  applySorosLogic(trade: TradeResult): void {
    if (trade.isWin) {
      this.accumulatedProfit += trade.profitUSD;
      this.sorosLevel++;
      
      if (this.sorosLevel > CONFIG.SOROS_MAX_LEVEL) {
        console.log(`[Soros] Reset após ${CONFIG.SOROS_MAX_LEVEL} wins. Bolsado: $${this.accumulatedProfit.toFixed(2)}`);
        this.sorosLevel = 1;
        this.accumulatedProfit = 0;
      }
    } else {
      this.sorosLevel = 1;
      this.accumulatedProfit = 0;
    }
  }
  
  /**
   * Atualiza estatísticas
   */
  updateStats(stats: ScenarioStats, trade: TradeResult, consecutiveLosses: number): void {
    stats.trades++;
    stats.totalPnL += trade.profitUSD;
    
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
    
    // Calcular drawdown
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
    
    stats.tradeHistory.push(trade);
  }
  
  /**
   * Executa simulação comparativa
   */
  async runSimulation(candlesM15: CandleM15[]): Promise<void> {
    console.log(`\n${"=".repeat(60)}`);
    console.log("INICIANDO SIMULAÇÃO AGRESSIVA");
    console.log(`${"=".repeat(60)}\n`);
    
    let consecutiveLosses1 = 0;
    let consecutiveLosses2 = 0;
    
    for (let i = 0; i < candlesM15.length; i++) {
      const candle = candlesM15[i];
      
      // Atualizar indicadores
      this.technicalAnalysis.update(candle.close);
      
      // Verificar blacklist
      if (this.isBlacklistedHour(candle.epoch)) {
        continue;
      }
      
      // Obter sinal
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
        1
      );
      
      if (trade1.isWin) {
        consecutiveLosses1 = 0;
      } else {
        consecutiveLosses1++;
      }
      
      this.updateStats(this.scenario1, trade1, consecutiveLosses1);
      
      // ========== CENÁRIO 2: SOROS ==========
      const sorosLot = this.calculateSorosLot();
      const currentSorosLevel = this.sorosLevel;
      
      const trade2 = this.simulateTradeWithTrailing(
        signal,
        entryPrice,
        tradingCandles,
        sorosLot,
        currentSorosLevel
      );
      
      // Recalcular lucro com lote Soros
      const pipValue2 = sorosLot * 10;
      trade2.profitUSD = trade2.pipsGained * pipValue2;
      trade2.isWin = trade2.profitUSD > 0;
      
      if (trade2.isWin) {
        consecutiveLosses2 = 0;
      } else {
        consecutiveLosses2++;
      }
      
      this.updateStats(this.scenario2, trade2, consecutiveLosses2);
      this.applySorosLogic(trade2);
      
      // Log de progresso
      if (this.scenario1.trades % 20 === 0 && this.scenario1.trades > 0) {
        console.log(`[Progresso] ${this.scenario1.trades} trades`);
        console.log(`  - Lote Fixo: $${this.scenario1.finalBalance.toFixed(2)} (${this.scenario1.returnPercent.toFixed(1)}%)`);
        console.log(`  - Soros: $${this.scenario2.finalBalance.toFixed(2)} (${this.scenario2.returnPercent.toFixed(1)}%)`);
      }
    }
    
    // Calcular média de pips vencedores
    const wins1 = this.scenario1.tradeHistory.filter(t => t.isWin);
    const wins2 = this.scenario2.tradeHistory.filter(t => t.isWin);
    
    if (wins1.length > 0) {
      this.scenario1.avgWinPips = wins1.reduce((sum, t) => sum + t.pipsGained, 0) / wins1.length;
    }
    if (wins2.length > 0) {
      this.scenario2.avgWinPips = wins2.reduce((sum, t) => sum + t.pipsGained, 0) / wins2.length;
    }
  }
  
  /**
   * Gera relatório comparativo
   */
  generateReport(): void {
    console.log(`\n${"=".repeat(70)}`);
    console.log("           RELATÓRIO TREND AGGRESSIVE - ESCALANDO LUCROS");
    console.log(`${"=".repeat(70)}`);
    
    console.log(`\nConfiguração do Teste:`);
    console.log(`  - Entrada: EMA 200 + RSI 14 (Lógica B validada)`);
    console.log(`  - TP: INFINITO (sem limite)`);
    console.log(`  - SL Inicial: ${CONFIG.STOP_LOSS_PIPS} pips`);
    console.log(`  - Trailing: Ativa após +${CONFIG.TRAILING_START_PIPS} pips, move a cada +${CONFIG.TRAILING_STEP_PIPS} pips`);
    console.log(`  - Blacklist: ${CONFIG.BLACKLIST_HOURS.join('h, ')}h UTC`);
    
    // Tabela comparativa
    console.log(`\n╔════════════════════════════════════════════════════════════════════╗`);
    console.log(`║                    A PERGUNTA DE 1 MILHÃO                          ║`);
    console.log(`╠════════════════════════════════════════════════════════════════════╣`);
    console.log(`║ Métrica                │ Cenário 1 (Fixo) │ Cenário 2 (Soros)      ║`);
    console.log(`╠════════════════════════╪══════════════════╪════════════════════════╣`);
    
    // Win Rate
    console.log(`║ Win Rate               │ ${this.scenario1.winRate.toFixed(1).padStart(14)}% │ ${this.scenario2.winRate.toFixed(1).padStart(20)}% ║`);
    
    // Total Trades
    console.log(`║ Total Trades           │ ${this.scenario1.trades.toString().padStart(15)} │ ${this.scenario2.trades.toString().padStart(21)} ║`);
    
    // Wins / Losses
    console.log(`║ Wins / Losses          │ ${(this.scenario1.wins + "/" + this.scenario1.losses).padStart(15)} │ ${(this.scenario2.wins + "/" + this.scenario2.losses).padStart(21)} ║`);
    
    // Maior Trade
    console.log(`║ Maior Trade (pips)     │ ${this.scenario1.maxWinPips.toFixed(1).padStart(14)}p │ ${this.scenario2.maxWinPips.toFixed(1).padStart(20)}p ║`);
    
    // Média de Pips Vencedores
    console.log(`║ Média Pips (wins)      │ ${this.scenario1.avgWinPips.toFixed(1).padStart(14)}p │ ${this.scenario2.avgWinPips.toFixed(1).padStart(20)}p ║`);
    
    // Lucro Líquido
    const pnl1Color = this.scenario1.totalPnL >= 0 ? "+" : "";
    const pnl2Color = this.scenario2.totalPnL >= 0 ? "+" : "";
    console.log(`║ Lucro Líquido ($)      │ ${pnl1Color}$${this.scenario1.totalPnL.toFixed(2).padStart(13)} │ ${pnl2Color}$${this.scenario2.totalPnL.toFixed(2).padStart(19)} ║`);
    
    // Retorno %
    const ret1Color = this.scenario1.returnPercent >= 0 ? "+" : "";
    const ret2Color = this.scenario2.returnPercent >= 0 ? "+" : "";
    console.log(`║ RETORNO (%)            │ ${ret1Color}${this.scenario1.returnPercent.toFixed(1).padStart(14)}% │ ${ret2Color}${this.scenario2.returnPercent.toFixed(1).padStart(20)}% ║`);
    
    // Drawdown
    console.log(`║ Drawdown Máx ($)       │ -$${this.scenario1.maxDrawdown.toFixed(2).padStart(13)} │ -$${this.scenario2.maxDrawdown.toFixed(2).padStart(19)} ║`);
    console.log(`║ Drawdown Máx (%)       │ ${this.scenario1.maxDrawdownPercent.toFixed(1).padStart(14)}% │ ${this.scenario2.maxDrawdownPercent.toFixed(1).padStart(20)}% ║`);
    
    // Saldo Final
    console.log(`║ SALDO FINAL ($)        │ $${this.scenario1.finalBalance.toFixed(2).padStart(14)} │ $${this.scenario2.finalBalance.toFixed(2).padStart(20)} ║`);
    
    // Sequência de Perdas
    console.log(`║ Máx Perdas Seguidas    │ ${this.scenario1.maxConsecutiveLosses.toString().padStart(15)} │ ${this.scenario2.maxConsecutiveLosses.toString().padStart(21)} ║`);
    
    console.log(`╚════════════════════════════════════════════════════════════════════╝`);
    
    // Análise
    console.log(`\n${"─".repeat(70)}`);
    console.log("ANÁLISE:");
    console.log(`${"─".repeat(70)}`);
    
    // Verificar metas
    const meta100 = this.scenario1.returnPercent >= 100 || this.scenario2.returnPercent >= 100;
    const meta200 = this.scenario1.returnPercent >= 200 || this.scenario2.returnPercent >= 200;
    const seguro = this.scenario2.maxDrawdownPercent <= 50;
    
    if (meta200) {
      console.log(`🚀 META 200% ATINGIDA!`);
    } else if (meta100) {
      console.log(`✅ META 100% ATINGIDA!`);
    } else {
      console.log(`⚠️ Meta de 100% não atingida. Melhor retorno: ${Math.max(this.scenario1.returnPercent, this.scenario2.returnPercent).toFixed(1)}%`);
    }
    
    if (seguro) {
      console.log(`✅ Conta SEGURA: Drawdown Soros de ${this.scenario2.maxDrawdownPercent.toFixed(1)}% (limite: 50%)`);
    } else {
      console.log(`❌ Conta em RISCO: Drawdown Soros de ${this.scenario2.maxDrawdownPercent.toFixed(1)}% excede 50%`);
    }
    
    // Veredito
    console.log(`\n${"═".repeat(70)}`);
    if (this.scenario2.returnPercent > this.scenario1.returnPercent && seguro) {
      console.log(`🏆 RESPOSTA: SIM! Soros + Trailing na Lógica B = ${this.scenario2.returnPercent.toFixed(1)}% de retorno`);
      console.log(`   com drawdown de apenas ${this.scenario2.maxDrawdownPercent.toFixed(1)}%`);
    } else if (this.scenario1.returnPercent > 0) {
      console.log(`📊 Lote Fixo mais seguro com ${this.scenario1.returnPercent.toFixed(1)}% de retorno`);
    } else {
      console.log(`❌ Estratégia precisa de mais ajustes`);
    }
    console.log(`${"═".repeat(70)}`);
  }
  
  getResults(): { scenario1: ScenarioStats; scenario2: ScenarioStats } {
    return { scenario1: this.scenario1, scenario2: this.scenario2 };
  }
}

// ============================================================================
// FUNÇÃO PRINCIPAL
// ============================================================================

async function runAggressiveStudy(): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log("ESTUDO TREND AGGRESSIVE - ESCALANDO LUCROS");
  console.log(`${"=".repeat(60)}`);
  console.log(`\nObjetivo: Testar Lógica B com trailing agressivo`);
  console.log(`Cenário 1: Lote Fixo (${CONFIG.BASE_LOT_SIZE})`);
  console.log(`Cenário 2: Soros Nível ${CONFIG.SOROS_MAX_LEVEL}`);
  
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
    
    const simulator = new AggressiveSimulator();
    const candlesM15 = simulator.reconstructM15Candles(candlesM5);
    
    if (candlesM15.length === 0) {
      throw new Error("Não foi possível reconstruir candles M15");
    }
    
    await simulator.runSimulation(candlesM15);
    
    simulator.generateReport();
    
    // Salvar resultado
    const results = simulator.getResults();
    const outputPath = "./study_trend_aggressive_result.json";
    const fs = await import("fs");
    
    const jsonResult = {
      timestamp: new Date().toISOString(),
      config: {
        stopLossPips: CONFIG.STOP_LOSS_PIPS,
        trailingStartPips: CONFIG.TRAILING_START_PIPS,
        trailingStepPips: CONFIG.TRAILING_STEP_PIPS,
        baseLotSize: CONFIG.BASE_LOT_SIZE,
        sorosMaxLevel: CONFIG.SOROS_MAX_LEVEL,
        emaPeriod: CONFIG.EMA_PERIOD,
        rsiPeriod: CONFIG.RSI_PERIOD,
        blacklistHours: CONFIG.BLACKLIST_HOURS,
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
        maxWinPips: results.scenario1.maxWinPips,
        avgWinPips: results.scenario1.avgWinPips,
        maxConsecutiveLosses: results.scenario1.maxConsecutiveLosses,
      },
      scenario2_soros: {
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
        maxWinPips: results.scenario2.maxWinPips,
        avgWinPips: results.scenario2.avgWinPips,
        maxConsecutiveLosses: results.scenario2.maxConsecutiveLosses,
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
runAggressiveStudy().catch(console.error);
