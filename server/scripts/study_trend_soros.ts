/**
 * TREND SNIPER - Estudo de Estratégia com Soros + Trailing Stop
 * 
 * Objetivo: Simular a estratégia "Trend Sniper" usando dados históricos M5 de Nov/Dez 2025
 * para validar a tese de seguir tendência com juros compostos.
 * 
 * Regras de Negócio:
 * - Reconstruir candles M15 a partir de 3 candles M5
 * - Candle M5[1]: Zona de Leitura (Wait Time = 5 min) - coleta High/Low/Open para predição
 * - Candles M5[2] e M5[3]: Zona de Trading - verifica entrada, stop e alvo
 * - Filtro de Qualidade: Corpo do candle M5[1] > 3 pips
 * - Trailing Stop: Stop inicial 10 pips, move a cada 5 pips de lucro
 * - Gestão Soros Nível 3: Juros compostos com reset a cada 4 trades
 * 
 * @author Schimidt Trader System PRO
 * @version 1.1.0
 */

import WebSocket from "ws";
// @ts-ignore - Compatibilidade ESM

// ============================================================================
// CONFIGURAÇÕES GLOBAIS
// ============================================================================

const CONFIG = {
  // Conta e Risco
  ACCOUNT_START: 500.00,           // Capital inicial em USD
  BASE_RISK_USD: 10.00,            // Risco base por trade em USD
  LOT_SIZE: 0.12,                  // Lote base (valor do pip aprox. $1.20)
  
  // Parâmetros de Trading
  STOP_LOSS_PIPS: 10,              // Stop loss inicial em pips
  TRAILING_STEP_PIPS: 5,           // Degrau do trailing stop em pips
  MIN_BODY_PIPS: 3,                // Corpo mínimo do candle M5[1] para entrada
  
  // Fibonacci (Lógica de Predição)
  FIBONACCI_FACTOR: 0.618,         // Fator Fibonacci para projeção
  
  // Par de Moedas
  SYMBOL: "frxUSDJPY",             // USD/JPY na Deriv
  PIP_SIZE: 0.01,                  // Tamanho do pip para USD/JPY
  
  // Período de Backtesting - Ajustado para dados disponíveis
  START_DATE: new Date("2025-11-01T00:00:00Z"),
  END_DATE: new Date("2025-12-27T23:59:59Z"), // Ajustado para ontem (dados disponíveis)
  
  // API Deriv
  APP_ID: "1089",                  // App ID para API Deriv
  WS_URL: "wss://ws.derivws.com/websockets/v3",
  
  // Soros
  SOROS_MAX_LEVEL: 3,              // Máximo de níveis Soros (reset no 4º trade)
  
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
  m5Candles: CandleM5[];  // Os 3 candles M5 que compõem este M15
}

interface TradeResult {
  entryTime: number;
  direction: "CALL" | "PUT";
  entryPrice: number;
  exitPrice: number;
  pipsGained: number;
  riskUSD: number;
  profitUSD: number;
  sorosLevel: number;
  trailingStops: number[];  // Histórico de movimentações do stop
  exitReason: "STOP_LOSS" | "TRAILING_STOP" | "END_OF_CANDLE";
}

interface SimulationResult {
  // Análise de Risco
  maxDrawdownUSD: number;
  maxDrawdownPercent: number;
  maxConsecutiveLosses: number;
  lowestBalance: number;
  
  // Análise de Potencial
  maxWinPips: number;
  maxWinUSD: number;
  finalBalance: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  
  // Detalhes
  trades: TradeResult[];
  
  // Validação
  isApproved: boolean;
  rejectionReason?: string;
}

// ============================================================================
// SERVIÇO DE DADOS HISTÓRICOS
// ============================================================================

class HistoricalDataService {
  private ws: WebSocket | null = null;
  
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[HistoricalDataService] Conectando a ${CONFIG.WS_URL}?app_id=${CONFIG.APP_ID}`);
      this.ws = new WebSocket(`${CONFIG.WS_URL}?app_id=${CONFIG.APP_ID}`);
      
      this.ws.on("open", () => {
        console.log("[HistoricalDataService] Conectado com sucesso");
        resolve();
      });
      
      this.ws.on("error", (error) => {
        console.error("[HistoricalDataService] Erro de conexão:", error);
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
  
  /**
   * Busca candles históricos por período com retry logic
   */
  async getCandlesM5(startEpoch: number, endEpoch: number): Promise<CandleM5[]> {
    const allCandles: CandleM5[] = [];
    const BATCH_SIZE = 5000;
    const GRANULARITY = 300; // 5 minutos em segundos
    
    let currentStart = startEpoch;
    let lastEpoch = 0;
    let consecutiveErrors = 0;
    
    while (currentStart < endEpoch) {
      const batchEnd = Math.min(currentStart + (BATCH_SIZE * GRANULARITY), endEpoch);
      
      console.log(`[HistoricalDataService] Buscando candles de ${new Date(currentStart * 1000).toISOString()} a ${new Date(batchEnd * 1000).toISOString()}`);
      
      try {
        const candles = await this.fetchCandleBatchWithRetry(currentStart, batchEnd, GRANULARITY);
        consecutiveErrors = 0;
        
        if (candles.length === 0) {
          console.log(`[HistoricalDataService] Nenhum dado retornado, avançando...`);
          currentStart = batchEnd + GRANULARITY;
          continue;
        }
        
        const newLastEpoch = candles[candles.length - 1].epoch;
        
        // Detectar fim dos dados
        if (newLastEpoch === lastEpoch) {
          console.log(`[HistoricalDataService] Fim dos dados disponíveis em ${new Date(newLastEpoch * 1000).toISOString()}`);
          break;
        }
        
        // Filtrar duplicados
        const uniqueCandles = candles.filter(c => c.epoch > lastEpoch || lastEpoch === 0);
        allCandles.push(...uniqueCandles);
        
        console.log(`[HistoricalDataService] Obtidos ${uniqueCandles.length} candles únicos. Total: ${allCandles.length}`);
        
        lastEpoch = newLastEpoch;
        currentStart = newLastEpoch + GRANULARITY;
        
        // Delay entre requisições
        await this.sleep(1000);
        
      } catch (error: any) {
        consecutiveErrors++;
        console.error(`[HistoricalDataService] Erro ao buscar batch (tentativa ${consecutiveErrors}):`, error.message);
        
        if (consecutiveErrors >= 3) {
          console.log(`[HistoricalDataService] Muitos erros consecutivos, usando dados obtidos até agora`);
          break;
        }
        
        // Aguardar antes de tentar novamente
        await this.sleep(3000);
      }
    }
    
    // Remover duplicatas e ordenar
    const uniqueMap = new Map<number, CandleM5>();
    allCandles.forEach(c => uniqueMap.set(c.epoch, c));
    const finalCandles = Array.from(uniqueMap.values()).sort((a, b) => a.epoch - b.epoch);
    
    console.log(`[HistoricalDataService] Total final: ${finalCandles.length} candles`);
    return finalCandles;
  }
  
  private async fetchCandleBatchWithRetry(start: number, end: number, granularity: number): Promise<CandleM5[]> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
      try {
        return await this.fetchCandleBatch(start, end, granularity);
      } catch (error: any) {
        lastError = error;
        console.warn(`[HistoricalDataService] Tentativa ${attempt}/${CONFIG.MAX_RETRIES} falhou: ${error.message}`);
        
        if (attempt < CONFIG.MAX_RETRIES) {
          await this.sleep(CONFIG.RETRY_DELAY_MS * attempt);
        }
      }
    }
    
    throw lastError || new Error("Falha ao buscar dados após múltiplas tentativas");
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
            // Log detalhado do erro
            console.error(`[HistoricalDataService] Erro da API: ${message.error.code} - ${message.error.message}`);
            reject(new Error(message.error.message));
          }
        } catch (error) {
          // Ignorar erros de parsing de outras mensagens
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
        reject(new Error("Timeout ao buscar candles"));
      }, 30000);
    });
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// MOTOR DE SIMULAÇÃO
// ============================================================================

class TrendSniperSimulator {
  private balance: number = CONFIG.ACCOUNT_START;
  private peakBalance: number = CONFIG.ACCOUNT_START;
  private lowestBalance: number = CONFIG.ACCOUNT_START;
  private trades: TradeResult[] = [];
  
  // Soros State
  private sorosLevel: number = 1;
  private accumulatedProfit: number = 0;
  
  /**
   * Reconstrói candles M15 a partir de candles M5
   * Agrupa cada 3 candles M5 consecutivos
   */
  reconstructM15Candles(candlesM5: CandleM5[]): CandleM15[] {
    const candlesM15: CandleM15[] = [];
    
    // Alinhar ao início de um período M15 (epoch divisível por 900)
    let startIndex = 0;
    for (let i = 0; i < candlesM5.length; i++) {
      if (candlesM5[i].epoch % 900 === 0) {
        startIndex = i;
        break;
      }
    }
    
    // Agrupar em conjuntos de 3
    for (let i = startIndex; i + 2 < candlesM5.length; i += 3) {
      const m5_1 = candlesM5[i];
      const m5_2 = candlesM5[i + 1];
      const m5_3 = candlesM5[i + 2];
      
      // Verificar se são consecutivos (diferença de 300 segundos)
      if (m5_2.epoch - m5_1.epoch !== 300 || m5_3.epoch - m5_2.epoch !== 300) {
        continue; // Pular se houver gap nos dados
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
    
    console.log(`[TrendSniperSimulator] Reconstruídos ${candlesM15.length} candles M15 a partir de ${candlesM5.length} candles M5`);
    return candlesM15;
  }
  
  /**
   * Calcula a predição baseada na lógica Fibonacci
   * Usando o primeiro candle M5 como zona de leitura
   */
  calculatePrediction(readingCandle: CandleM5): { direction: "CALL" | "PUT"; targetPrice: number } | null {
    const { open, high, low } = readingCandle;
    
    // Filtro de Qualidade: Corpo do candle > 3 pips
    const bodySize = Math.abs(readingCandle.close - readingCandle.open) / CONFIG.PIP_SIZE;
    if (bodySize < CONFIG.MIN_BODY_PIPS) {
      return null; // Mercado morto/Doji - ignorar
    }
    
    // Calcular ponto médio
    const midpoint = (high + low) / 2;
    
    // Determinar direção
    let direction: "CALL" | "PUT";
    let targetPrice: number;
    
    if (open < midpoint) {
      // Predição de COMPRA (Call)
      direction = "CALL";
      const range = high - low;
      targetPrice = low + (range * CONFIG.FIBONACCI_FACTOR);
    } else {
      // Predição de VENDA (Put)
      direction = "PUT";
      const range = high - low;
      targetPrice = high - (range * CONFIG.FIBONACCI_FACTOR);
    }
    
    return { direction, targetPrice };
  }
  
  /**
   * Simula o trade com trailing stop usando os candles M5[2] e M5[3]
   */
  simulateTrade(
    direction: "CALL" | "PUT",
    entryPrice: number,
    tradingCandles: CandleM5[],
    riskUSD: number
  ): TradeResult {
    let currentStop = direction === "CALL" 
      ? entryPrice - (CONFIG.STOP_LOSS_PIPS * CONFIG.PIP_SIZE)
      : entryPrice + (CONFIG.STOP_LOSS_PIPS * CONFIG.PIP_SIZE);
    
    let maxFavorableMove = 0;
    let exitPrice = entryPrice;
    let exitReason: "STOP_LOSS" | "TRAILING_STOP" | "END_OF_CANDLE" = "END_OF_CANDLE";
    const trailingStops: number[] = [currentStop];
    
    // Simular tick-a-tick usando high/low dos candles M5
    for (const candle of tradingCandles) {
      // Verificar se o stop foi atingido
      if (direction === "CALL") {
        // Para CALL, verificar se low tocou no stop
        if (candle.low <= currentStop) {
          exitPrice = currentStop;
          exitReason = maxFavorableMove > 0 ? "TRAILING_STOP" : "STOP_LOSS";
          break;
        }
        
        // Calcular movimento favorável (high - entry)
        const favorableMove = (candle.high - entryPrice) / CONFIG.PIP_SIZE;
        
        // Atualizar trailing stop se necessário
        if (favorableMove > maxFavorableMove) {
          maxFavorableMove = favorableMove;
          
          // Mover stop a cada degrau de 5 pips
          const steps = Math.floor(favorableMove / CONFIG.TRAILING_STEP_PIPS);
          if (steps > 0) {
            // Primeiro step: move para breakeven
            // Segundo step: move para +5 pips
            // E assim por diante
            const newStopPips = (steps - 1) * CONFIG.TRAILING_STEP_PIPS;
            const newStop = entryPrice + (newStopPips * CONFIG.PIP_SIZE);
            
            if (newStop > currentStop) {
              currentStop = newStop;
              trailingStops.push(currentStop);
            }
          }
        }
        
        exitPrice = candle.close;
      } else {
        // Para PUT, verificar se high tocou no stop
        if (candle.high >= currentStop) {
          exitPrice = currentStop;
          exitReason = maxFavorableMove > 0 ? "TRAILING_STOP" : "STOP_LOSS";
          break;
        }
        
        // Calcular movimento favorável (entry - low)
        const favorableMove = (entryPrice - candle.low) / CONFIG.PIP_SIZE;
        
        // Atualizar trailing stop se necessário
        if (favorableMove > maxFavorableMove) {
          maxFavorableMove = favorableMove;
          
          const steps = Math.floor(favorableMove / CONFIG.TRAILING_STEP_PIPS);
          if (steps > 0) {
            const newStopPips = (steps - 1) * CONFIG.TRAILING_STEP_PIPS;
            const newStop = entryPrice - (newStopPips * CONFIG.PIP_SIZE);
            
            if (newStop < currentStop) {
              currentStop = newStop;
              trailingStops.push(currentStop);
            }
          }
        }
        
        exitPrice = candle.close;
      }
    }
    
    // Calcular resultado em pips
    const pipsGained = direction === "CALL"
      ? (exitPrice - entryPrice) / CONFIG.PIP_SIZE
      : (entryPrice - exitPrice) / CONFIG.PIP_SIZE;
    
    // Calcular lucro/prejuízo em USD
    // Com lote 0.12, cada pip vale aproximadamente $1.20 para USD/JPY
    const pipValue = CONFIG.LOT_SIZE * 10; // Aproximação para USD/JPY
    const profitUSD = pipsGained * pipValue;
    
    return {
      entryTime: tradingCandles[0].epoch,
      direction,
      entryPrice,
      exitPrice,
      pipsGained,
      riskUSD,
      profitUSD,
      sorosLevel: this.sorosLevel,
      trailingStops,
      exitReason,
    };
  }
  
  /**
   * Aplica a lógica Soros ao resultado do trade
   */
  applySorosLogic(trade: TradeResult): void {
    if (trade.profitUSD > 0) {
      // Ganhou - acumular lucro para próximo trade
      this.accumulatedProfit += trade.profitUSD;
      this.sorosLevel++;
      
      // Reset após 3 trades vencedores (no 4º trade)
      if (this.sorosLevel > CONFIG.SOROS_MAX_LEVEL) {
        console.log(`[Soros] Reset após ${CONFIG.SOROS_MAX_LEVEL} trades vencedores. Lucro bolsado: $${this.accumulatedProfit.toFixed(2)}`);
        this.sorosLevel = 1;
        this.accumulatedProfit = 0;
      }
    } else {
      // Perdeu - reset para risco base
      this.sorosLevel = 1;
      this.accumulatedProfit = 0;
    }
  }
  
  /**
   * Calcula o risco do próximo trade baseado no nível Soros
   */
  calculateNextRisk(): number {
    if (this.sorosLevel === 1) {
      return CONFIG.BASE_RISK_USD;
    }
    // Risco = Base + Lucro acumulado
    return CONFIG.BASE_RISK_USD + this.accumulatedProfit;
  }
  
  /**
   * Executa a simulação completa
   */
  async runSimulation(candlesM15: CandleM15[]): Promise<SimulationResult> {
    console.log(`\n${"=".repeat(60)}`);
    console.log("INICIANDO SIMULAÇÃO TREND SNIPER");
    console.log(`${"=".repeat(60)}\n`);
    
    let consecutiveLosses = 0;
    let maxConsecutiveLosses = 0;
    
    for (let i = 0; i < candlesM15.length; i++) {
      const candle = candlesM15[i];
      const [m5_1, m5_2, m5_3] = candle.m5Candles;
      
      // 1. Calcular predição usando M5[1] (zona de leitura)
      const prediction = this.calculatePrediction(m5_1);
      
      if (!prediction) {
        // Filtro de qualidade não passou - pular
        continue;
      }
      
      // 2. Determinar preço de entrada (close do M5[1])
      const entryPrice = m5_1.close;
      
      // 3. Calcular risco baseado no nível Soros
      const riskUSD = this.calculateNextRisk();
      
      // 4. Simular trade usando M5[2] e M5[3]
      const trade = this.simulateTrade(
        prediction.direction,
        entryPrice,
        [m5_2, m5_3],
        riskUSD
      );
      
      // 5. Atualizar saldo
      this.balance += trade.profitUSD;
      
      // 6. Atualizar métricas de drawdown
      if (this.balance > this.peakBalance) {
        this.peakBalance = this.balance;
      }
      if (this.balance < this.lowestBalance) {
        this.lowestBalance = this.balance;
      }
      
      // 7. Atualizar sequência de perdas
      if (trade.profitUSD < 0) {
        consecutiveLosses++;
        if (consecutiveLosses > maxConsecutiveLosses) {
          maxConsecutiveLosses = consecutiveLosses;
        }
      } else {
        consecutiveLosses = 0;
      }
      
      // 8. Aplicar lógica Soros
      this.applySorosLogic(trade);
      
      // 9. Registrar trade
      this.trades.push(trade);
      
      // Log de progresso a cada 100 trades
      if (this.trades.length % 100 === 0) {
        console.log(`[Simulação] ${this.trades.length} trades processados. Saldo: $${this.balance.toFixed(2)}`);
      }
    }
    
    // Calcular resultados finais
    const winningTrades = this.trades.filter(t => t.profitUSD > 0).length;
    const losingTrades = this.trades.filter(t => t.profitUSD <= 0).length;
    const maxWinTrade = this.trades.length > 0 
      ? this.trades.reduce((max, t) => t.pipsGained > max.pipsGained ? t : max, this.trades[0])
      : null;
    
    const maxDrawdownUSD = this.peakBalance - this.lowestBalance;
    const maxDrawdownPercent = (maxDrawdownUSD / CONFIG.ACCOUNT_START) * 100;
    
    const result: SimulationResult = {
      // Análise de Risco
      maxDrawdownUSD,
      maxDrawdownPercent,
      maxConsecutiveLosses,
      lowestBalance: this.lowestBalance,
      
      // Análise de Potencial
      maxWinPips: maxWinTrade?.pipsGained || 0,
      maxWinUSD: maxWinTrade?.profitUSD || 0,
      finalBalance: this.balance,
      totalTrades: this.trades.length,
      winningTrades,
      losingTrades,
      winRate: this.trades.length > 0 ? (winningTrades / this.trades.length) * 100 : 0,
      
      // Detalhes
      trades: this.trades,
      
      // Validação
      isApproved: maxDrawdownUSD <= 250,
      rejectionReason: maxDrawdownUSD > 250 
        ? `Drawdown de $${maxDrawdownUSD.toFixed(2)} excede limite de $250 (50% da conta)`
        : undefined,
    };
    
    return result;
  }
}

// ============================================================================
// GERADOR DE RELATÓRIO
// ============================================================================

function generateReport(result: SimulationResult): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log("RELATÓRIO TREND SNIPER - BACKTESTING NOV/DEZ 2025");
  console.log(`${"=".repeat(60)}\n`);
  
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                   ANÁLISE DE RISCO                         ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║ Drawdown Máximo Absoluto:    $${result.maxDrawdownUSD.toFixed(2).padStart(10)} USD            ║`);
  console.log(`║ Drawdown Máximo Percentual:  ${result.maxDrawdownPercent.toFixed(2).padStart(10)}%              ║`);
  console.log(`║ Menor Saldo Atingido:        $${result.lowestBalance.toFixed(2).padStart(10)} USD            ║`);
  console.log(`║ Maior Sequência de Perdas:   ${result.maxConsecutiveLosses.toString().padStart(10)} trades          ║`);
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║ STATUS: ${result.isApproved ? "✅ APROVADO" : "❌ REPROVADO"}                                      ║`);
  if (result.rejectionReason) {
    console.log(`║ Motivo: ${result.rejectionReason.substring(0, 50).padEnd(50)} ║`);
  }
  console.log("╚════════════════════════════════════════════════════════════╝");
  
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                  ANÁLISE DE POTENCIAL                      ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║ Maior Trade (Max Win):       ${result.maxWinPips.toFixed(1).padStart(10)} pips            ║`);
  console.log(`║ Maior Lucro em Trade:        $${result.maxWinUSD.toFixed(2).padStart(10)} USD            ║`);
  console.log(`║ Saldo Final:                 $${result.finalBalance.toFixed(2).padStart(10)} USD            ║`);
  console.log(`║ Lucro Total:                 $${(result.finalBalance - CONFIG.ACCOUNT_START).toFixed(2).padStart(10)} USD            ║`);
  console.log(`║ Retorno:                     ${((result.finalBalance / CONFIG.ACCOUNT_START - 1) * 100).toFixed(2).padStart(10)}%              ║`);
  console.log("╚════════════════════════════════════════════════════════════╝");
  
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                    ESTATÍSTICAS                            ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║ Total de Trades:             ${result.totalTrades.toString().padStart(10)}                  ║`);
  console.log(`║ Trades Vencedores:           ${result.winningTrades.toString().padStart(10)}                  ║`);
  console.log(`║ Trades Perdedores:           ${result.losingTrades.toString().padStart(10)}                  ║`);
  console.log(`║ Win Rate:                    ${result.winRate.toFixed(2).padStart(10)}%              ║`);
  console.log("╚════════════════════════════════════════════════════════════╝");
  
  // Top 5 melhores trades
  if (result.trades.length > 0) {
    const topTrades = [...result.trades]
      .sort((a, b) => b.pipsGained - a.pipsGained)
      .slice(0, 5);
    
    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║                  TOP 5 MELHORES TRADES                     ║");
    console.log("╠════════════════════════════════════════════════════════════╣");
    topTrades.forEach((trade, i) => {
      const date = new Date(trade.entryTime * 1000).toISOString().split("T")[0];
      console.log(`║ ${i + 1}. ${date} | ${trade.direction.padEnd(4)} | +${trade.pipsGained.toFixed(1).padStart(6)} pips | $${trade.profitUSD.toFixed(2).padStart(8)} ║`);
    });
    console.log("╚════════════════════════════════════════════════════════════╝");
  }
}

// ============================================================================
// FUNÇÃO PRINCIPAL
// ============================================================================

async function runStrategy(): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log("TREND SNIPER - BACKTESTING ENGINE");
  console.log(`${"=".repeat(60)}`);
  console.log(`\nConfiguração:`);
  console.log(`  - Capital Inicial: $${CONFIG.ACCOUNT_START}`);
  console.log(`  - Risco Base: $${CONFIG.BASE_RISK_USD}`);
  console.log(`  - Stop Loss: ${CONFIG.STOP_LOSS_PIPS} pips`);
  console.log(`  - Trailing Step: ${CONFIG.TRAILING_STEP_PIPS} pips`);
  console.log(`  - Período: ${CONFIG.START_DATE.toISOString().split("T")[0]} a ${CONFIG.END_DATE.toISOString().split("T")[0]}`);
  console.log(`  - Par: ${CONFIG.SYMBOL}\n`);
  
  // 1. Conectar ao serviço de dados
  const dataService = new HistoricalDataService();
  
  try {
    await dataService.connect();
    
    // 2. Baixar candles M5 de Nov/Dez 2025
    const startEpoch = Math.floor(CONFIG.START_DATE.getTime() / 1000);
    const endEpoch = Math.floor(CONFIG.END_DATE.getTime() / 1000);
    
    console.log(`\n[Main] Baixando dados históricos M5...`);
    const candlesM5 = await dataService.getCandlesM5(startEpoch, endEpoch);
    
    if (candlesM5.length === 0) {
      throw new Error("Nenhum dado histórico encontrado para o período especificado");
    }
    
    console.log(`[Main] Total de candles M5 obtidos: ${candlesM5.length}`);
    
    // 3. Reconstruir candles M15
    const simulator = new TrendSniperSimulator();
    const candlesM15 = simulator.reconstructM15Candles(candlesM5);
    
    if (candlesM15.length === 0) {
      throw new Error("Não foi possível reconstruir candles M15 a partir dos dados M5");
    }
    
    // 4. Executar simulação
    const result = await simulator.runSimulation(candlesM15);
    
    // 5. Gerar relatório no terminal
    generateReport(result);
    
    // 6. Salvar resultado em JSON
    const outputPath = "./study_trend_soros_result.json";
    const fs = await import("fs");
    
    const jsonResult = {
      timestamp: new Date().toISOString(),
      config: {
        accountStart: CONFIG.ACCOUNT_START,
        baseRiskUSD: CONFIG.BASE_RISK_USD,
        lotSize: CONFIG.LOT_SIZE,
        stopLossPips: CONFIG.STOP_LOSS_PIPS,
        trailingStepPips: CONFIG.TRAILING_STEP_PIPS,
        minBodyPips: CONFIG.MIN_BODY_PIPS,
        fibonacciFactor: CONFIG.FIBONACCI_FACTOR,
        symbol: CONFIG.SYMBOL,
        pipSize: CONFIG.PIP_SIZE,
        startDate: CONFIG.START_DATE.toISOString(),
        endDate: CONFIG.END_DATE.toISOString(),
        sorosMaxLevel: CONFIG.SOROS_MAX_LEVEL,
      },
      summary: {
        maxDrawdownUSD: result.maxDrawdownUSD,
        maxDrawdownPercent: result.maxDrawdownPercent,
        maxConsecutiveLosses: result.maxConsecutiveLosses,
        lowestBalance: result.lowestBalance,
        maxWinPips: result.maxWinPips,
        maxWinUSD: result.maxWinUSD,
        finalBalance: result.finalBalance,
        totalTrades: result.totalTrades,
        winningTrades: result.winningTrades,
        losingTrades: result.losingTrades,
        winRate: result.winRate,
        isApproved: result.isApproved,
        rejectionReason: result.rejectionReason,
      },
      trades: result.trades.map(t => ({
        entryTime: new Date(t.entryTime * 1000).toISOString(),
        direction: t.direction,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        pipsGained: t.pipsGained,
        profitUSD: t.profitUSD,
        sorosLevel: t.sorosLevel,
        exitReason: t.exitReason,
      })),
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
runStrategy().catch(console.error);
