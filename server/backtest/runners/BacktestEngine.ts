/**
 * BacktestEngine - Motor de Execução para Backtest
 * 
 * Conecta a estratégia SMC/Hybrid ao BacktestAdapter para simular trades.
 * Este é o componente que faltava para gerar trades durante o backtest.
 * 
 * Fluxo:
 * 1. Recebe ticks do BacktestAdapter via callback
 * 2. Acumula candles e atualiza a estratégia
 * 3. Analisa sinais usando a estratégia configurada
 * 4. Executa ordens simuladas via BacktestAdapter
 * 
 * ISOLAMENTO TOTAL:
 * - Usa apenas BacktestAdapter (nunca CTraderAdapter)
 * - Não tem acesso a conexões reais
 * - Todas as ordens são simuladas
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 1.0.0
 */

import { BacktestAdapter } from "../adapters/BacktestAdapter";
import { BacktestConfig, BacktestStrategyType } from "../types/backtest.types";
import { SMCStrategy, SMCStrategyConfig, DEFAULT_SMC_CONFIG } from "../../adapters/ctrader/SMCStrategy";
import { ITradingStrategy, IMultiTimeframeStrategy, MultiTimeframeData, SignalResult } from "../../adapters/ctrader/ITradingStrategy";
import { TradeSide } from "../../adapters/ctrader/CTraderClient";
import { CandleData, PriceTick } from "../../adapters/IBrokerAdapter";
import { getPipValue } from "../../../shared/normalizationUtils";

// ============================================================================
// TYPES
// ============================================================================

export interface BacktestEngineConfig extends BacktestConfig {
  // Parâmetros da estratégia SMC (opcionais, usa defaults se não fornecidos)
  strategyParams?: Partial<SMCStrategyConfig>;
}

// ============================================================================
// BACKTEST ENGINE CLASS
// ============================================================================

export class BacktestEngine {
  private adapter: BacktestAdapter;
  private config: BacktestEngineConfig;
  private strategy: ITradingStrategy & IMultiTimeframeStrategy;
  
  // Candle buffers por timeframe
  private h1Candles: CandleData[] = [];
  private m15Candles: CandleData[] = [];
  private m5Candles: CandleData[] = [];
  
  // Estado
  private lastAnalysisTime: number = 0;
  private analysisIntervalMs: number = 5 * 60 * 1000; // Analisar a cada 5 minutos de dados
  private tradesExecuted: number = 0;
  private signalsGenerated: number = 0;
  
  constructor(config: BacktestEngineConfig) {
    this.config = config;
    this.adapter = new BacktestAdapter(config);
    
    // Criar estratégia SMC com configurações
    const strategyConfig: SMCStrategyConfig = {
      ...DEFAULT_SMC_CONFIG,
      ...config.strategyParams,
      // Desabilitar filtros que não fazem sentido em backtest
      sessionFilterEnabled: false,
      circuitBreakerEnabled: false,
      // Usar configurações de risco do backtest
      riskPercentage: config.riskPercent || 2,
      maxOpenTrades: config.maxPositions || 3,
    };
    
    this.strategy = new SMCStrategy(strategyConfig);
    // SMCStrategy tem setCurrentSymbol mas não está na interface
    (this.strategy as any).setCurrentSymbol?.(config.symbol);
    
    console.log(`[BacktestEngine] Inicializado para ${config.symbol} com estratégia ${config.strategy}`);
  }
  
  /**
   * Executa o backtest completo
   */
  async run(): Promise<{
    trades: any[];
    equityCurve: { timestamp: number; equity: number }[];
    drawdownCurve: { timestamp: number; drawdown: number; drawdownPercent: number }[];
  }> {
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[BacktestEngine] 🚀 INICIANDO BACKTEST COM ENGINE");
    console.log(`[BacktestEngine] Símbolo: ${this.config.symbol}`);
    console.log(`[BacktestEngine] Estratégia: ${this.config.strategy}`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    // Carregar dados históricos
    await this.adapter.loadHistoricalData(
      this.config.dataPath,
      this.config.symbol,
      this.config.timeframes
    );
    
    // Configurar callback de preço para processar cada tick
    await this.adapter.subscribePrice(this.config.symbol, (tick) => {
      this.onTick(tick);
    });
    
    // Executar simulação
    const primaryTimeframe = this.config.timeframes[0] || "M5";
    
    // Warmup: avançar algumas barras para ter dados suficientes
    const warmupBars = 200;
    for (let i = 0; i < warmupBars; i++) {
      if (!this.adapter.advanceBar(this.config.symbol, primaryTimeframe)) break;
    }
    
    console.log(`[BacktestEngine] Warmup concluído (${warmupBars} barras)`);
    console.log(`[BacktestEngine] Iniciando simulação principal...`);
    
    // Loop principal de simulação
    let barCount = 0;
    const startTime = Date.now();
    
    while (this.adapter.advanceBar(this.config.symbol, primaryTimeframe)) {
      barCount++;
      
      // Log de progresso
      if (barCount % 1000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`[BacktestEngine] Processadas ${barCount} barras | Trades: ${this.tradesExecuted} | Sinais: ${this.signalsGenerated} | ${elapsed.toFixed(1)}s`);
      }
    }
    
    const totalTime = (Date.now() - startTime) / 1000;
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[BacktestEngine] ✅ BACKTEST CONCLUÍDO");
    console.log(`[BacktestEngine] Barras processadas: ${barCount}`);
    console.log(`[BacktestEngine] Sinais gerados: ${this.signalsGenerated}`);
    console.log(`[BacktestEngine] Trades executados: ${this.tradesExecuted}`);
    console.log(`[BacktestEngine] Tempo: ${totalTime.toFixed(2)}s`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    // Obter resultados
    const accountState = this.adapter.getAccountState();
    const trades = this.adapter.getClosedTrades();
    
    // Construir curvas de equity e drawdown
    const equityCurve: { timestamp: number; equity: number }[] = [];
    const drawdownCurve: { timestamp: number; drawdown: number; drawdownPercent: number }[] = [];
    
    // Simular curva de equity baseada nos trades
    let equity = this.config.initialBalance;
    let peakEquity = equity;
    
    equityCurve.push({ timestamp: this.config.startDate.getTime(), equity });
    drawdownCurve.push({ timestamp: this.config.startDate.getTime(), drawdown: 0, drawdownPercent: 0 });
    
    for (const trade of trades) {
      equity += trade.netProfit;
      if (equity > peakEquity) peakEquity = equity;
      
      const drawdown = peakEquity - equity;
      const drawdownPercent = peakEquity > 0 ? (drawdown / peakEquity) * 100 : 0;
      
      equityCurve.push({ timestamp: trade.exitTime, equity });
      drawdownCurve.push({ timestamp: trade.exitTime, drawdown, drawdownPercent });
    }
    
    return {
      trades,
      equityCurve,
      drawdownCurve,
    };
  }
  
  /**
   * Processa cada tick recebido do adapter
   */
  private async onTick(tick: PriceTick): Promise<void> {
    // Atualizar buffers de candles
    await this.updateCandleBuffers();
    
    // Verificar se é hora de analisar (não analisar em cada tick)
    if (tick.timestamp - this.lastAnalysisTime < this.analysisIntervalMs) {
      return;
    }
    
    this.lastAnalysisTime = tick.timestamp;
    
    // Verificar se temos dados suficientes
    if (this.h1Candles.length < 50 || this.m15Candles.length < 30 || this.m5Candles.length < 20) {
      return;
    }
    
    // Preparar dados multi-timeframe
    const mtfData: MultiTimeframeData = {
      h1: this.h1Candles.map(c => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
      })),
      m15: this.m15Candles.map(c => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
      })),
      m5: this.m5Candles.map(c => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
      })),
      currentBid: tick.bid,
      currentAsk: tick.ask,
      currentSpreadPips: tick.spread,
    };
    
    // Atualizar dados na estratégia
    this.strategy.updateTimeframeData("H1", mtfData.h1!);
    this.strategy.updateTimeframeData("M15", mtfData.m15!);
    this.strategy.updateTimeframeData("M5", mtfData.m5!);
    
    // Analisar sinal
    const signal = this.strategy.analyzeSignal(mtfData.m5!, mtfData);
    
    if (signal.signal !== "NONE") {
      this.signalsGenerated++;
      
      // Verificar se pode abrir posição
      const openPositions = await this.adapter.getOpenPositions();
      const symbolPositions = openPositions.filter(p => p.symbol === this.config.symbol);
      
      if (symbolPositions.length >= (this.config.maxPositions || 1)) {
        return; // Já tem posição aberta
      }
      
      // Executar trade
      await this.executeTrade(signal, tick);
    }
  }
  
  /**
   * Atualiza os buffers de candles de cada timeframe
   */
  private async updateCandleBuffers(): Promise<void> {
    try {
      this.h1Candles = await this.adapter.getCandleHistory(this.config.symbol, "H1", 100);
      this.m15Candles = await this.adapter.getCandleHistory(this.config.symbol, "M15", 100);
      this.m5Candles = await this.adapter.getCandleHistory(this.config.symbol, "M5", 100);
    } catch (error) {
      // Ignorar erros de dados insuficientes durante warmup
    }
  }
  
  /**
   * Executa um trade baseado no sinal
   */
  private async executeTrade(signal: SignalResult, tick: PriceTick): Promise<void> {
    const direction = signal.signal as "BUY" | "SELL";
    const pipValue = getPipValue(this.config.symbol);
    
    // Calcular SL/TP usando a estratégia
    const tradeSide = direction === "BUY" ? TradeSide.BUY : TradeSide.SELL;
    const entryPrice = direction === "BUY" ? tick.ask : tick.bid;
    
    const sltp = this.strategy.calculateSLTP(entryPrice, tradeSide, pipValue, {
      currentSpreadPips: tick.spread,
    });
    
    // Calcular tamanho da posição baseado no risco
    const accountInfo = await this.adapter.getAccountInfo();
    const balance = accountInfo.balance;
    const riskPercent = this.config.riskPercent || 2;
    const riskUsd = balance * (riskPercent / 100);
    
    // Calcular lotes: riskUsd / (stopLossPips * pipValuePerLot)
    const pipValuePerLot = 10; // $10 por pip por lote padrão
    const stopLossPipsValue = sltp.stopLossPips ?? 10; // Default 10 pips se undefined
    let lots = riskUsd / (stopLossPipsValue * pipValuePerLot);
    lots = Math.max(0.01, Math.min(10, Math.floor(lots * 100) / 100));
    
    // Executar ordem
    const result = await this.adapter.placeOrder({
      symbol: this.config.symbol,
      direction,
      orderType: "MARKET",
      lots,
      stopLoss: sltp.stopLoss,
      takeProfit: sltp.takeProfit ?? undefined,
      comment: `BT ${direction} | ${signal.reason.substring(0, 30)}`,
    }, this.config.maxSpread);
    
    if (result.success) {
      this.tradesExecuted++;
      console.log(`[BacktestEngine] ✅ Trade #${this.tradesExecuted}: ${direction} ${lots} lots @ ${result.executionPrice?.toFixed(5)}`);
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createBacktestEngine(config: BacktestEngineConfig): BacktestEngine {
  return new BacktestEngine(config);
}
