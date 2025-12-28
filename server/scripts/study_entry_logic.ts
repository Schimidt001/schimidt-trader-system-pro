/**
 * ESTUDO COMPARATIVO DE ALGORITMOS (A/B Testing)
 * 
 * Objetivo: Comparar a eficácia de duas lógicas de entrada:
 * - Lógica A: Fibonacci Projection (Atual)
 * - Lógica B: Trend Following (EMA 200 + RSI 14)
 * 
 * Configuração do Teste (Ceteris Paribus):
 * - Dados: Histórico M5 de Nov/Dez 2025 (reconstruído para M15)
 * - Gestão de Risco: Lote Fixo 0.12, TP: 6 pips, SL: 8 pips
 * - Horário: Blacklist 13h e 16h UTC
 * - Sem Soros, Sem Trailing Stop
 * 
 * @author Schimidt Trader System PRO
 * @version 1.0.0
 */

import WebSocket from "ws";
// @ts-ignore - Compatibilidade ESM

// ============================================================================
// CONFIGURAÇÕES GLOBAIS
// ============================================================================

const CONFIG = {
  // Conta e Risco
  ACCOUNT_START: 500.00,
  LOT_SIZE: 0.12,                  // Lote fixo
  
  // Parâmetros de Trading (Fixos para ambas as estratégias)
  TAKE_PROFIT_PIPS: 6,             // TP fixo
  STOP_LOSS_PIPS: 8,               // SL fixo
  MIN_BODY_PIPS: 3,                // Filtro de qualidade
  
  // Par de Moedas
  SYMBOL: "frxUSDJPY",
  PIP_SIZE: 0.01,
  
  // Período de Backtesting
  START_DATE: new Date("2025-11-01T00:00:00Z"),
  END_DATE: new Date("2025-12-27T23:59:59Z"),
  
  // Blacklist de Horários (UTC)
  BLACKLIST_HOURS: [13, 16],       // Bloquear 13h e 16h UTC
  
  // Indicadores (Lógica B)
  EMA_PERIOD: 200,
  RSI_PERIOD: 14,
  RSI_OVERSOLD: 30,
  RSI_OVERBOUGHT: 70,
  
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
  isWin: boolean;
}

interface StrategyStats {
  name: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  maxDrawdown: number;
  peakBalance: number;
  lowestBalance: number;
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
  private prevRsiValue: number = 50; // Valor inicial neutro
  private gains: number[] = [];
  private losses: number[] = [];
  
  constructor(emaPeriod: number = 200, rsiPeriod: number = 14) {
    this.emaPeriod = emaPeriod;
    this.rsiPeriod = rsiPeriod;
  }
  
  /**
   * Atualiza os indicadores com um novo preço de fechamento
   */
  update(price: number): void {
    this.prices.push(price);
    
    // Calcular EMA
    if (this.prices.length >= this.emaPeriod) {
      this.calculateEMA();
    }
    
    // Calcular RSI
    if (this.prices.length >= 2) {
      this.calculateRSI();
    }
  }
  
  /**
   * Calcula a EMA (Exponential Moving Average)
   */
  private calculateEMA(): void {
    if (this.prices.length < this.emaPeriod) return;
    
    const k = 2 / (this.emaPeriod + 1); // Fator de suavização
    
    if (this.emaValue === 0) {
      // Primeira EMA: usar SMA como base
      const sma = this.prices.slice(-this.emaPeriod).reduce((a, b) => a + b, 0) / this.emaPeriod;
      this.emaValue = sma;
    } else {
      // EMA = (Preço Atual - EMA Anterior) * K + EMA Anterior
      const currentPrice = this.prices[this.prices.length - 1];
      this.emaValue = (currentPrice - this.emaValue) * k + this.emaValue;
    }
  }
  
  /**
   * Calcula o RSI (Relative Strength Index)
   */
  private calculateRSI(): void {
    if (this.prices.length < 2) return;
    
    // Guardar RSI anterior para detectar cruzamentos
    this.prevRsiValue = this.rsiValue;
    
    // Calcular variação
    const currentPrice = this.prices[this.prices.length - 1];
    const prevPrice = this.prices[this.prices.length - 2];
    const change = currentPrice - prevPrice;
    
    // Separar ganhos e perdas
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    
    this.gains.push(gain);
    this.losses.push(loss);
    
    // Manter apenas os últimos N períodos
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
  
  getEMA(): number {
    return this.emaValue;
  }
  
  getRSI(): number {
    return this.rsiValue;
  }
  
  getPrevRSI(): number {
    return this.prevRsiValue;
  }
  
  isReady(): boolean {
    return this.prices.length >= this.emaPeriod && this.gains.length >= this.rsiPeriod;
  }
  
  /**
   * Detecta cruzamento do RSI para cima do nível especificado
   */
  rsiCrossedAbove(level: number): boolean {
    return this.prevRsiValue < level && this.rsiValue >= level;
  }
  
  /**
   * Detecta cruzamento do RSI para baixo do nível especificado
   */
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
      console.log(`[DataService] Conectando a ${CONFIG.WS_URL}?app_id=${CONFIG.APP_ID}`);
      this.ws = new WebSocket(`${CONFIG.WS_URL}?app_id=${CONFIG.APP_ID}`);
      
      this.ws.on("open", () => {
        console.log("[DataService] Conectado com sucesso");
        resolve();
      });
      
      this.ws.on("error", (error) => {
        console.error("[DataService] Erro de conexão:", error);
        reject(error);
      });
      
      setTimeout(() => reject(new Error("Timeout de conexão")), 30000);
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
    
    while (currentStart < endEpoch) {
      const batchEnd = Math.min(currentStart + (BATCH_SIZE * GRANULARITY), endEpoch);
      
      console.log(`[DataService] Buscando candles de ${new Date(currentStart * 1000).toISOString().split('T')[0]}`);
      
      try {
        const candles = await this.fetchCandleBatchWithRetry(currentStart, batchEnd, GRANULARITY);
        consecutiveErrors = 0;
        
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
        
        lastEpoch = newLastEpoch;
        currentStart = newLastEpoch + GRANULARITY;
        
        await this.sleep(1000);
        
      } catch (error: any) {
        consecutiveErrors++;
        console.error(`[DataService] Erro (tentativa ${consecutiveErrors}):`, error.message);
        
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
    
    throw lastError || new Error("Falha ao buscar dados");
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
        } catch (error) {
          // Ignorar
        }
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
// SIMULADOR COMPARATIVO
// ============================================================================

class ComparativeSimulator {
  private stratA: StrategyStats;
  private stratB: StrategyStats;
  private technicalAnalysis: TechnicalAnalysis;
  
  constructor() {
    this.stratA = {
      name: "FIBONACCI (Atual)",
      trades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnL: 0,
      maxDrawdown: 0,
      peakBalance: CONFIG.ACCOUNT_START,
      lowestBalance: CONFIG.ACCOUNT_START,
      tradeHistory: [],
    };
    
    this.stratB = {
      name: "TREND (EMA+RSI)",
      trades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnL: 0,
      maxDrawdown: 0,
      peakBalance: CONFIG.ACCOUNT_START,
      lowestBalance: CONFIG.ACCOUNT_START,
      tradeHistory: [],
    };
    
    this.technicalAnalysis = new TechnicalAnalysis(CONFIG.EMA_PERIOD, CONFIG.RSI_PERIOD);
  }
  
  /**
   * Reconstrói candles M15 a partir de M5
   */
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
  
  /**
   * Verifica se o horário está na blacklist
   */
  isBlacklistedHour(epoch: number): boolean {
    const date = new Date(epoch * 1000);
    const hourUTC = date.getUTCHours();
    return CONFIG.BLACKLIST_HOURS.includes(hourUTC);
  }
  
  /**
   * Lógica A: Fibonacci Projection
   */
  getSignalFibonacci(candle: CandleM15): "CALL" | "PUT" | null {
    const m5_1 = candle.m5Candles[0];
    const { open, high, low } = m5_1;
    
    // Filtro de qualidade: corpo > 3 pips
    const bodySize = Math.abs(m5_1.close - m5_1.open) / CONFIG.PIP_SIZE;
    if (bodySize < CONFIG.MIN_BODY_PIPS) {
      return null;
    }
    
    // Calcular ponto médio
    const midpoint = (high + low) / 2;
    
    // Determinar direção
    if (open < midpoint) {
      return "CALL";
    } else if (open > midpoint) {
      return "PUT";
    }
    
    return null;
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
    const rsi = this.technicalAnalysis.getRSI();
    
    // Filtro de Tendência
    const isBullishTrend = closePrice > ema200;
    const isBearishTrend = closePrice < ema200;
    
    // Gatilho RSI
    const rsiCrossedAbove30 = this.technicalAnalysis.rsiCrossedAbove(CONFIG.RSI_OVERSOLD);
    const rsiCrossedBelow70 = this.technicalAnalysis.rsiCrossedBelow(CONFIG.RSI_OVERBOUGHT);
    
    // COMPRA: Tendência de Alta + RSI cruzou acima de 30
    if (isBullishTrend && rsiCrossedAbove30) {
      return "CALL";
    }
    
    // VENDA: Tendência de Baixa + RSI cruzou abaixo de 70
    if (isBearishTrend && rsiCrossedBelow70) {
      return "PUT";
    }
    
    return null;
  }
  
  /**
   * Simula um trade com TP/SL fixo
   */
  simulateTrade(
    direction: "CALL" | "PUT",
    entryPrice: number,
    tradingCandles: CandleM5[]
  ): TradeResult {
    const tpPrice = direction === "CALL"
      ? entryPrice + (CONFIG.TAKE_PROFIT_PIPS * CONFIG.PIP_SIZE)
      : entryPrice - (CONFIG.TAKE_PROFIT_PIPS * CONFIG.PIP_SIZE);
    
    const slPrice = direction === "CALL"
      ? entryPrice - (CONFIG.STOP_LOSS_PIPS * CONFIG.PIP_SIZE)
      : entryPrice + (CONFIG.STOP_LOSS_PIPS * CONFIG.PIP_SIZE);
    
    let exitPrice = entryPrice;
    let isWin = false;
    
    // Simular usando high/low dos candles M5
    for (const candle of tradingCandles) {
      if (direction === "CALL") {
        // Verificar SL primeiro (mais conservador)
        if (candle.low <= slPrice) {
          exitPrice = slPrice;
          isWin = false;
          break;
        }
        // Verificar TP
        if (candle.high >= tpPrice) {
          exitPrice = tpPrice;
          isWin = true;
          break;
        }
      } else {
        // PUT
        if (candle.high >= slPrice) {
          exitPrice = slPrice;
          isWin = false;
          break;
        }
        if (candle.low <= tpPrice) {
          exitPrice = tpPrice;
          isWin = true;
          break;
        }
      }
      
      exitPrice = candle.close;
    }
    
    // Calcular resultado
    const pipsGained = direction === "CALL"
      ? (exitPrice - entryPrice) / CONFIG.PIP_SIZE
      : (entryPrice - exitPrice) / CONFIG.PIP_SIZE;
    
    const pipValue = CONFIG.LOT_SIZE * 10;
    const profitUSD = pipsGained * pipValue;
    
    // Se não atingiu TP nem SL, verificar resultado pelo fechamento
    if (exitPrice !== tpPrice && exitPrice !== slPrice) {
      isWin = pipsGained > 0;
    }
    
    return {
      entryTime: tradingCandles[0].epoch,
      direction,
      entryPrice,
      exitPrice,
      pipsGained,
      profitUSD,
      isWin,
    };
  }
  
  /**
   * Atualiza estatísticas da estratégia
   */
  updateStats(stats: StrategyStats, trade: TradeResult): void {
    stats.trades++;
    stats.totalPnL += trade.profitUSD;
    
    if (trade.isWin) {
      stats.wins++;
    } else {
      stats.losses++;
    }
    
    stats.winRate = (stats.wins / stats.trades) * 100;
    
    // Calcular drawdown
    const currentBalance = CONFIG.ACCOUNT_START + stats.totalPnL;
    
    if (currentBalance > stats.peakBalance) {
      stats.peakBalance = currentBalance;
    }
    
    if (currentBalance < stats.lowestBalance) {
      stats.lowestBalance = currentBalance;
    }
    
    const currentDrawdown = stats.peakBalance - currentBalance;
    if (currentDrawdown > stats.maxDrawdown) {
      stats.maxDrawdown = currentDrawdown;
    }
    
    stats.tradeHistory.push(trade);
  }
  
  /**
   * Executa a simulação comparativa
   */
  async runComparison(candlesM15: CandleM15[]): Promise<void> {
    console.log(`\n${"=".repeat(60)}`);
    console.log("INICIANDO ESTUDO COMPARATIVO A/B");
    console.log(`${"=".repeat(60)}\n`);
    
    let skippedBlacklist = 0;
    let skippedNoSignal = 0;
    
    for (let i = 0; i < candlesM15.length; i++) {
      const candle = candlesM15[i];
      
      // Atualizar indicadores técnicos com o preço de fechamento
      this.technicalAnalysis.update(candle.close);
      
      // Verificar blacklist de horário
      if (this.isBlacklistedHour(candle.epoch)) {
        skippedBlacklist++;
        continue;
      }
      
      const [m5_1, m5_2, m5_3] = candle.m5Candles;
      const entryPrice = m5_1.close;
      const tradingCandles = [m5_2, m5_3];
      
      // ========== LÓGICA A: FIBONACCI ==========
      const signalA = this.getSignalFibonacci(candle);
      if (signalA) {
        const tradeA = this.simulateTrade(signalA, entryPrice, tradingCandles);
        this.updateStats(this.stratA, tradeA);
      }
      
      // ========== LÓGICA B: TREND (EMA + RSI) ==========
      const signalB = this.getSignalTrend(candle);
      if (signalB) {
        const tradeB = this.simulateTrade(signalB, entryPrice, tradingCandles);
        this.updateStats(this.stratB, tradeB);
      }
      
      // Log de progresso
      if ((i + 1) % 500 === 0) {
        console.log(`[Progresso] ${i + 1}/${candlesM15.length} candles processados`);
        console.log(`  - Strat A: ${this.stratA.trades} trades, Win Rate: ${this.stratA.winRate.toFixed(1)}%`);
        console.log(`  - Strat B: ${this.stratB.trades} trades, Win Rate: ${this.stratB.winRate.toFixed(1)}%`);
      }
    }
    
    console.log(`\n[Info] Candles ignorados por blacklist: ${skippedBlacklist}`);
  }
  
  /**
   * Gera o relatório comparativo final
   */
  generateReport(): void {
    console.log(`\n${"=".repeat(70)}`);
    console.log("                    RELATÓRIO COMPARATIVO A/B");
    console.log(`${"=".repeat(70)}`);
    
    console.log(`\nConfiguração do Teste:`);
    console.log(`  - TP: ${CONFIG.TAKE_PROFIT_PIPS} pips | SL: ${CONFIG.STOP_LOSS_PIPS} pips`);
    console.log(`  - Lote: ${CONFIG.LOT_SIZE} (fixo)`);
    console.log(`  - Blacklist: ${CONFIG.BLACKLIST_HOURS.join('h, ')}h UTC`);
    console.log(`  - Período: ${CONFIG.START_DATE.toISOString().split('T')[0]} a ${CONFIG.END_DATE.toISOString().split('T')[0]}`);
    
    // Calcular diferenças
    const winRateDiff = this.stratB.winRate - this.stratA.winRate;
    const pnlDiff = this.stratB.totalPnL - this.stratA.totalPnL;
    const drawdownDiff = this.stratB.maxDrawdown - this.stratA.maxDrawdown;
    
    console.log(`\n╔════════════════════════════════════════════════════════════════════╗`);
    console.log(`║                         O VEREDITO                                 ║`);
    console.log(`╠════════════════════════════════════════════════════════════════════╣`);
    console.log(`║ Métrica              │ Lógica A (Fibo)  │ Lógica B (Trend) │ Dif.  ║`);
    console.log(`╠══════════════════════╪══════════════════╪══════════════════╪═══════╣`);
    
    // Win Rate
    const winRateColor = winRateDiff > 0 ? "+" : "";
    console.log(`║ Win Rate             │ ${this.stratA.winRate.toFixed(1).padStart(14)}% │ ${this.stratB.winRate.toFixed(1).padStart(14)}% │ ${winRateColor}${winRateDiff.toFixed(1).padStart(4)}% ║`);
    
    // Total Trades
    const tradesDiff = this.stratB.trades - this.stratA.trades;
    console.log(`║ Total Trades         │ ${this.stratA.trades.toString().padStart(15)} │ ${this.stratB.trades.toString().padStart(15)} │ ${(tradesDiff >= 0 ? "+" : "") + tradesDiff.toString().padStart(4)}  ║`);
    
    // Wins / Losses
    console.log(`║ Wins / Losses        │ ${(this.stratA.wins + "/" + this.stratA.losses).padStart(15)} │ ${(this.stratB.wins + "/" + this.stratB.losses).padStart(15)} │       ║`);
    
    // Lucro Líquido
    const pnlColorA = this.stratA.totalPnL >= 0 ? "+" : "";
    const pnlColorB = this.stratB.totalPnL >= 0 ? "+" : "";
    const pnlDiffColor = pnlDiff >= 0 ? "+" : "";
    console.log(`║ Lucro Líquido ($)    │ ${pnlColorA}$${this.stratA.totalPnL.toFixed(2).padStart(13)} │ ${pnlColorB}$${this.stratB.totalPnL.toFixed(2).padStart(13)} │ ${pnlDiffColor}$${pnlDiff.toFixed(0).padStart(3)} ║`);
    
    // Drawdown
    const ddDiffColor = drawdownDiff <= 0 ? "" : "+";
    console.log(`║ Drawdown Máx ($)     │ -$${this.stratA.maxDrawdown.toFixed(2).padStart(13)} │ -$${this.stratB.maxDrawdown.toFixed(2).padStart(13)} │ ${ddDiffColor}$${drawdownDiff.toFixed(0).padStart(3)} ║`);
    
    // Saldo Final
    const finalA = CONFIG.ACCOUNT_START + this.stratA.totalPnL;
    const finalB = CONFIG.ACCOUNT_START + this.stratB.totalPnL;
    console.log(`║ Saldo Final ($)      │ $${finalA.toFixed(2).padStart(14)} │ $${finalB.toFixed(2).padStart(14)} │       ║`);
    
    console.log(`╚════════════════════════════════════════════════════════════════════╝`);
    
    // Análise
    console.log(`\n${"─".repeat(70)}`);
    console.log("ANÁLISE:");
    console.log(`${"─".repeat(70)}`);
    
    if (this.stratB.winRate > this.stratA.winRate) {
      console.log(`✅ Lógica B (Trend) tem WIN RATE SUPERIOR: ${this.stratB.winRate.toFixed(1)}% vs ${this.stratA.winRate.toFixed(1)}%`);
    } else {
      console.log(`❌ Lógica A (Fibonacci) mantém WIN RATE SUPERIOR: ${this.stratA.winRate.toFixed(1)}% vs ${this.stratB.winRate.toFixed(1)}%`);
    }
    
    if (this.stratB.totalPnL > this.stratA.totalPnL) {
      console.log(`✅ Lógica B (Trend) é MAIS LUCRATIVA: $${this.stratB.totalPnL.toFixed(2)} vs $${this.stratA.totalPnL.toFixed(2)}`);
    } else {
      console.log(`❌ Lógica A (Fibonacci) é MAIS LUCRATIVA: $${this.stratA.totalPnL.toFixed(2)} vs $${this.stratB.totalPnL.toFixed(2)}`);
    }
    
    if (this.stratB.maxDrawdown < this.stratA.maxDrawdown) {
      console.log(`✅ Lógica B (Trend) tem MENOR RISCO: -$${this.stratB.maxDrawdown.toFixed(2)} vs -$${this.stratA.maxDrawdown.toFixed(2)}`);
    } else {
      console.log(`❌ Lógica A (Fibonacci) tem MENOR RISCO: -$${this.stratA.maxDrawdown.toFixed(2)} vs -$${this.stratB.maxDrawdown.toFixed(2)}`);
    }
    
    // Vencedor
    console.log(`\n${"═".repeat(70)}`);
    let scoreA = 0;
    let scoreB = 0;
    
    if (this.stratA.winRate > this.stratB.winRate) scoreA++; else scoreB++;
    if (this.stratA.totalPnL > this.stratB.totalPnL) scoreA++; else scoreB++;
    if (this.stratA.maxDrawdown < this.stratB.maxDrawdown) scoreA++; else scoreB++;
    
    if (scoreB > scoreA) {
      console.log(`🏆 VENCEDOR: LÓGICA B (TREND EMA + RSI) - Score: ${scoreB} x ${scoreA}`);
    } else if (scoreA > scoreB) {
      console.log(`🏆 VENCEDOR: LÓGICA A (FIBONACCI) - Score: ${scoreA} x ${scoreB}`);
    } else {
      console.log(`🤝 EMPATE: Ambas as lógicas tiveram desempenho similar - Score: ${scoreA} x ${scoreB}`);
    }
    console.log(`${"═".repeat(70)}`);
  }
  
  getResults(): { stratA: StrategyStats; stratB: StrategyStats } {
    return { stratA: this.stratA, stratB: this.stratB };
  }
}

// ============================================================================
// FUNÇÃO PRINCIPAL
// ============================================================================

async function runComparativeStudy(): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log("ESTUDO COMPARATIVO DE ALGORITMOS (A/B Testing)");
  console.log(`${"=".repeat(60)}`);
  console.log(`\nLógica A: Fibonacci Projection (Atual)`);
  console.log(`Lógica B: Trend Following (EMA 200 + RSI 14)`);
  console.log(`\nParâmetros Fixos: TP ${CONFIG.TAKE_PROFIT_PIPS} pips | SL ${CONFIG.STOP_LOSS_PIPS} pips | Lote ${CONFIG.LOT_SIZE}`);
  
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
    
    const simulator = new ComparativeSimulator();
    const candlesM15 = simulator.reconstructM15Candles(candlesM5);
    
    if (candlesM15.length === 0) {
      throw new Error("Não foi possível reconstruir candles M15");
    }
    
    await simulator.runComparison(candlesM15);
    
    simulator.generateReport();
    
    // Salvar resultado em JSON
    const results = simulator.getResults();
    const outputPath = "./study_entry_logic_result.json";
    const fs = await import("fs");
    
    const jsonResult = {
      timestamp: new Date().toISOString(),
      config: {
        takeProfitPips: CONFIG.TAKE_PROFIT_PIPS,
        stopLossPips: CONFIG.STOP_LOSS_PIPS,
        lotSize: CONFIG.LOT_SIZE,
        emaPeriod: CONFIG.EMA_PERIOD,
        rsiPeriod: CONFIG.RSI_PERIOD,
        blacklistHours: CONFIG.BLACKLIST_HOURS,
        startDate: CONFIG.START_DATE.toISOString(),
        endDate: CONFIG.END_DATE.toISOString(),
      },
      strategyA: {
        name: results.stratA.name,
        trades: results.stratA.trades,
        wins: results.stratA.wins,
        losses: results.stratA.losses,
        winRate: results.stratA.winRate,
        totalPnL: results.stratA.totalPnL,
        maxDrawdown: results.stratA.maxDrawdown,
        finalBalance: CONFIG.ACCOUNT_START + results.stratA.totalPnL,
      },
      strategyB: {
        name: results.stratB.name,
        trades: results.stratB.trades,
        wins: results.stratB.wins,
        losses: results.stratB.losses,
        winRate: results.stratB.winRate,
        totalPnL: results.stratB.totalPnL,
        maxDrawdown: results.stratB.maxDrawdown,
        finalBalance: CONFIG.ACCOUNT_START + results.stratB.totalPnL,
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
runComparativeStudy().catch(console.error);
