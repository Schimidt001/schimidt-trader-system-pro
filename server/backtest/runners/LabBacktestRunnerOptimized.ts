/**
 * LabBacktestRunnerOptimized - Executor de Backtests Otimizado EXCLUSIVO do Laboratório
 *
 * Versão otimizada e isolada do BacktestRunner para uso exclusivo no laboratório.
 * - Usa cache compartilhado de candles
 * - Implementa estratégias de economia de memória agressivas
 * - NÃO conecta com brokers reais
 *
 * CORREÇÃO: Usa LabMarketDataCollector para leitura de dados offline
 *
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.1.0
 */

import {
  BacktestConfig,
  BacktestResult,
  BacktestMetrics,
  BacktestTrade,
  BacktestStrategyType,
} from "../types/backtest.types";
import { BacktestAdapterOptimized } from "../adapters/BacktestAdapterOptimized";
import { SMCTradingEngine, SMCTradingEngineConfig } from "../../adapters/ctrader/SMCTradingEngine";
import { StrategyType } from "../../adapters/ctrader/ITradingStrategy";
import { ITradingAdapter } from "../adapters/ITradingAdapter";
import { CandleData, PriceTick } from "../../adapters/IBrokerAdapter";
import { MultiTimeframeData } from "../../adapters/ctrader/ITradingStrategy";
import { backtestLogger } from "../utils/LabLogger";
import { memoryManager } from "../utils/MemoryManager";
import { yieldToEventLoop } from "../utils/AsyncUtils";
import { getLabMarketDataCollector } from "../collectors/LabMarketDataCollector";

// ============================================================================
// CONSTANTS
// ============================================================================

/** Limite máximo de pontos na curva de equity */
const MAX_EQUITY_POINTS = 200;

/** Intervalo de amostragem para curvas (em barras) */
const CURVE_SAMPLE_INTERVAL = 50;

// ============================================================================
// LAB BACKTEST RUNNER OPTIMIZED CLASS
// ============================================================================

export class LabBacktestRunnerOptimized {
  private config: BacktestConfig;
  private adapter: BacktestAdapterOptimized | null = null;
  private engine: SMCTradingEngine | null = null;

  constructor(config: BacktestConfig) {
    this.config = config;
  }

  /**
   * Run the backtest using optimized adapter
   */
  async run(): Promise<BacktestResult> {
    const startTime = Date.now();

    backtestLogger.debug(`LabBacktestRunnerOptimized: ${this.config.symbol}`, "LabBacktestRunnerOpt");

    try {
      // 1. Create optimized adapter (usa cache compartilhado)
      this.adapter = new BacktestAdapterOptimized(this.config);

      // 2. Load historical data (referências do cache)
      // CORREÇÃO: Usar LabMarketDataCollector para verificar dados offline
      // O Adapter Optimized deve ser capaz de carregar do disco sem broker
      await this.loadOfflineData();

      // Validate data
      const primaryTimeframe = this.config.timeframes[0] || "M5";
      const totalBars = this.adapter.getTotalBars(this.config.symbol, primaryTimeframe);
      if (totalBars === 0) {
        throw new Error(`Nenhum dado carregado para ${this.config.symbol}`);
      }

      // 3. Determine strategy type
      const strategyType = this.mapStrategyType(this.config.strategy);

      // 4. Create engine config
      const engineConfig: Partial<SMCTradingEngineConfig> = {
        strategyType,
        symbols: [this.config.symbol],
        lots: this.calculateLotSize(),
        maxPositions: this.config.maxPositions,
        cooldownMs: 0,
        maxSpread: this.config.maxSpread,
      };

      // 5. Create engine with optimized adapter
      this.engine = new SMCTradingEngine(
        0,
        0,
        engineConfig,
        this.adapter as unknown as ITradingAdapter
      );

      // 6. Initialize engine
      await this.engine.initializeForBacktest();

      // INJECTION: Apply custom parameters if they exist
      if (this.customParameters) {
        if (typeof (this.engine as any).getStrategyConfig === 'function' &&
            typeof (this.engine as any).updateStrategyConfig === 'function') {

          const currentConfig = (this.engine as any).getStrategyConfig();
          const mergedConfig = { ...currentConfig, ...this.customParameters };
          (this.engine as any).updateStrategyConfig(mergedConfig);

          backtestLogger.debug(`Parâmetros injetados: ${Object.keys(this.customParameters).length}`, "LabBacktestRunnerOpt");
        } else {
          backtestLogger.warn("Engine não suporta injeção de parâmetros (updateStrategyConfig ausente)", "LabBacktestRunnerOpt");
        }
      }

      // 7. Run simulation
      const { trades, equityCurve, drawdownCurve } = await this.runSimulationWithStrategy();

      // 8. Calculate metrics
      const metrics = this.calculateMetrics(trades, equityCurve, drawdownCurve);

      const executionTime = Date.now() - startTime;

      return {
        config: this.config,
        metrics,
        trades,
        equityCurve,
        drawdownCurve,
        startTimestamp: this.config.startDate.getTime(),
        endTimestamp: this.config.endDate.getTime(),
        executionTime,
      };

    } finally {
      // CORREÇÃO OOM: Sempre limpar recursos
      this.cleanup();
    }
  }

  /**
   * Carrega dados usando LabMarketDataCollector (Offline) e injeta no adapter
   */
  private async loadOfflineData(): Promise<void> {
    if (!this.adapter) return;

    const labCollector = getLabMarketDataCollector();

    // Verificar disponibilidade
    const availability = labCollector.checkDataAvailability([this.config.symbol], this.config.timeframes);
    if (!availability.available) {
        throw new Error(`Dados offline incompletos para otimização: ${availability.missing.join(", ")}`);
    }

    // Carregar arquivos
    await this.adapter.loadHistoricalData(
        this.config.dataPath,
        this.config.symbol,
        this.config.timeframes
    );
  }

  /**
   * Run simulation with strategy integration
   */
  private async runSimulationWithStrategy(): Promise<{
    trades: BacktestTrade[];
    equityCurve: { timestamp: number; equity: number }[];
    drawdownCurve: { timestamp: number; drawdown: number; drawdownPercent: number }[];
  }> {
    if (!this.adapter || !this.engine) {
      throw new Error("Adapter ou Engine não inicializados");
    }

    const symbol = this.config.symbol;
    const primaryTimeframe = this.config.timeframes[0] || "M5";
    const totalBars = this.adapter.getTotalBars(symbol, primaryTimeframe);

    // Warmup period
    const warmupBars = Math.min(200, Math.floor(totalBars * 0.1));

    for (let i = 0; i < warmupBars; i++) {
      if (!this.adapter.advanceBar(symbol, primaryTimeframe)) break;
    }

    // Main simulation loop
    let barCount = 0;

    // CORREÇÃO OOM: Curvas com amostragem
    const equityCurve: { timestamp: number; equity: number }[] = [];
    const drawdownCurve: { timestamp: number; drawdown: number; drawdownPercent: number }[] = [];

    // Configurar callback
    await this.adapter.subscribePrice(symbol, async (tick: PriceTick) => {
      try {
        // Obter dados MTF e chamar análise
        const mtfData = await this.getMTFData(symbol);
        if (mtfData.m5 && mtfData.m5.length > 0) {
          await this.engine!.analyzeWithData(symbol, mtfData);
        }
      } catch (error) {
        // Ignorar erros durante simulação
      }
    });

    // Run simulation
    while (this.adapter.advanceBar(symbol, primaryTimeframe)) {
      barCount++;

      // COOPERATIVE MULTITASKING: Yield periodically to avoid blocking Event Loop
      if (barCount % 500 === 0) {
        await yieldToEventLoop();
      }

      // CORREÇÃO OOM: Amostrar curvas para economizar memória
      if (barCount % CURVE_SAMPLE_INTERVAL === 0 && equityCurve.length < MAX_EQUITY_POINTS) {
        const accountState = this.adapter.getAccountState();
        const timestamp = this.adapter.getCurrentSimulatedTimestamp();

        equityCurve.push({
          timestamp,
          equity: accountState.equity,
        });

        const drawdownPercent = accountState.peakEquity > 0
          ? (accountState.currentDrawdown / accountState.peakEquity) * 100
          : 0;

        drawdownCurve.push({
          timestamp,
          drawdown: accountState.currentDrawdown,
          drawdownPercent,
        });
      }
    }

    // Fechar posições abertas
    this.adapter.closeAllPositions();

    // Adicionar ponto final
    const finalState = this.adapter.getAccountState();
    const finalTimestamp = this.adapter.getCurrentSimulatedTimestamp();

    equityCurve.push({
      timestamp: finalTimestamp,
      equity: finalState.equity,
    });

    const finalDrawdownPercent = finalState.peakEquity > 0
      ? (finalState.currentDrawdown / finalState.peakEquity) * 100
      : 0;

    drawdownCurve.push({
      timestamp: finalTimestamp,
      drawdown: finalState.currentDrawdown,
      drawdownPercent: finalDrawdownPercent,
    });

    return {
      trades: this.adapter.getClosedTrades(),
      equityCurve,
      drawdownCurve,
    };
  }

  /**
   * Get MTF data for strategy analysis
   */
  private async getMTFData(symbol: string): Promise<MultiTimeframeData> {
    if (!this.adapter) {
      return { h1: [], m15: [], m5: [] };
    }

    const h1Candles = await this.adapter.getCandleHistory(symbol, "H1", 100);
    const m15Candles = await this.adapter.getCandleHistory(symbol, "M15", 100);
    const m5Candles = await this.adapter.getCandleHistory(symbol, "M5", 100);

    let currentBid: number | undefined;
    let currentAsk: number | undefined;
    let currentSpreadPips: number | undefined;

    try {
      const tick = await this.adapter.getPrice(symbol);
      currentBid = tick.bid;
      currentAsk = tick.ask;
      currentSpreadPips = tick.spread;
    } catch {
      if (m5Candles.length > 0) {
        currentBid = m5Candles[m5Candles.length - 1].close;
        currentAsk = currentBid + (this.config.spread || 1) * 0.0001;
        currentSpreadPips = this.config.spread || 1;
      }
    }

    return {
      h1: h1Candles as any,
      m15: m15Candles as any,
      m5: m5Candles as any,
      currentBid,
      currentAsk,
      currentSpreadPips,
    };
  }

  /**
   * Calculate metrics from trades
   */
  private calculateMetrics(
    trades: BacktestTrade[],
    equityCurve: { timestamp: number; equity: number }[],
    drawdownCurve: { timestamp: number; drawdown: number; drawdownPercent: number }[]
  ): BacktestMetrics {
    const totalTrades = trades.length;
    const initialBalance = this.config.initialBalance;

    if (totalTrades === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        grossProfit: 0,
        grossLoss: 0,
        netProfit: 0,
        profitFactor: 0,
        maxDrawdown: 0,
        maxDrawdownPercent: 0,
        maxConsecutiveWins: 0,
        maxConsecutiveLosses: 0,
        averageWin: 0,
        averageLoss: 0,
        averageTrade: 0,
        largestWin: 0,
        largestLoss: 0,
        averageWinLossRatio: 0,
        averageHoldingPeriod: 0,
        totalTradingDays: 0,
        tradesPerDay: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        calmarRatio: 0,
        expectancy: 0,
        recoveryFactor: 0,
        initialBalance,
        finalBalance: initialBalance,
        returnPercent: 0,
      };
    }

    const winningTrades = trades.filter(t => t.netProfit > 0);
    const losingTrades = trades.filter(t => t.netProfit <= 0);

    const grossProfit = winningTrades.reduce((sum, t) => sum + t.netProfit, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.netProfit, 0));
    const netProfit = grossProfit - grossLoss;

    const winRate = (winningTrades.length / totalTrades) * 100;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

    const maxDrawdownPercent = drawdownCurve.length > 0
      ? Math.max(...drawdownCurve.map(d => d.drawdownPercent))
      : 0;
    const maxDrawdown = drawdownCurve.length > 0
      ? Math.max(...drawdownCurve.map(d => d.drawdown))
      : 0;

    const averageWin = winningTrades.length > 0
      ? grossProfit / winningTrades.length
      : 0;
    const averageLoss = losingTrades.length > 0
      ? grossLoss / losingTrades.length
      : 0;
    const averageTrade = netProfit / totalTrades;

    const largestWin = winningTrades.length > 0
      ? Math.max(...winningTrades.map(t => t.netProfit))
      : 0;
    const largestLoss = losingTrades.length > 0
      ? Math.min(...losingTrades.map(t => t.netProfit))
      : 0;

    // Consecutive wins/losses
    let maxConsecutiveWins = 0;
    let maxConsecutiveLosses = 0;
    let currentWins = 0;
    let currentLosses = 0;

    for (const trade of trades) {
      if (trade.netProfit > 0) {
        currentWins++;
        currentLosses = 0;
        maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWins);
      } else {
        currentLosses++;
        currentWins = 0;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLosses);
      }
    }

    // Average holding time
    const totalHoldingTime = trades.reduce((sum, t) => sum + t.holdingPeriod, 0);
    const averageHoldingPeriod = (totalHoldingTime / totalTrades) / (1000 * 60 * 60); // Convert to hours

    // Trading days
    const tradeDays = new Set(trades.map(t => new Date(t.entryTime).toDateString()));
    const totalTradingDays = tradeDays.size;
    const tradesPerDay = totalTradingDays > 0 ? totalTrades / totalTradingDays : 0;

    // Risk metrics
    const returns = trades.map(t => t.netProfit / initialBalance);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );

    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    const negativeReturns = returns.filter(r => r < 0);
    const downstdDev = negativeReturns.length > 0
      ? Math.sqrt(negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length)
      : 0;
    const sortinoRatio = downstdDev > 0 ? (avgReturn / downstdDev) * Math.sqrt(252) : 0;

    const returnPercent = (netProfit / initialBalance) * 100;
    const calmarRatio = maxDrawdownPercent > 0 ? returnPercent / maxDrawdownPercent : 0;

    const recoveryFactor = maxDrawdown > 0 ? netProfit / maxDrawdown : 0;

    const expectancy = (winRate / 100) * averageWin - ((100 - winRate) / 100) * averageLoss;
    const averageWinLossRatio = averageLoss > 0 ? averageWin / averageLoss : 0;

    const finalBalance = initialBalance + netProfit;

    return {
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      grossProfit,
      grossLoss,
      netProfit,
      profitFactor,
      maxDrawdown,
      maxDrawdownPercent,
      maxConsecutiveWins,
      maxConsecutiveLosses,
      averageWin,
      averageLoss,
      averageTrade,
      largestWin,
      largestLoss,
      averageWinLossRatio,
      averageHoldingPeriod,
      totalTradingDays,
      tradesPerDay,
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
      expectancy,
      recoveryFactor,
      initialBalance,
      finalBalance,
      returnPercent,
    };
  }

  /**
   * Map strategy type
   */
  private mapStrategyType(strategy: BacktestStrategyType): StrategyType {
    switch (strategy) {
      case BacktestStrategyType.SMC:
        return StrategyType.SMC_SWARM;
      case BacktestStrategyType.HYBRID:
        return StrategyType.SMC_SWARM;
      case BacktestStrategyType.RSI_VWAP:
        return StrategyType.RSI_VWAP_REVERSAL;
      default:
        return StrategyType.SMC_SWARM;
    }
  }

  /**
   * Calculate lot size based on risk
   */
  private calculateLotSize(): number {
    const riskPercent = this.config.riskPercent || 2;
    const balance = this.config.initialBalance;
    const riskAmount = balance * (riskPercent / 100);

    // Simplified lot calculation
    const lots = Math.max(0.01, Math.min(10, riskAmount / 1000));
    return Math.round(lots * 100) / 100;
  }

  private customParameters: Record<string, number | string | boolean> | null = null;

  async runWithParameters(parameters: Record<string, number | string | boolean>): Promise<BacktestResult> {
    this.customParameters = parameters;

    if (parameters.riskPercentage !== undefined) {
      this.config.riskPercent = parameters.riskPercentage as number;
    }
    if (parameters.maxOpenTrades !== undefined) {
      this.config.maxPositions = parameters.maxOpenTrades as number;
    }
    if (parameters.maxSpreadPips !== undefined) {
      this.config.maxSpread = parameters.maxSpreadPips as number;
    }

    const result = await this.run();

    this.customParameters = null;

    return result;
  }

  getCustomParameters(): Record<string, number | string | boolean> | null {
    return this.customParameters;
  }

  /**
   * CORREÇÃO OOM: Limpar recursos após uso
   */
  cleanup(): void {
    if (this.adapter) {
      this.adapter.cleanup();
      this.adapter = null;
    }

    if (this.engine) {
      this.engine = null;
    }

    // Tentar liberar memória
    memoryManager.tryFreeMemory();
  }
}

export function createLabBacktestRunnerOptimized(config: BacktestConfig): LabBacktestRunnerOptimized {
  return new LabBacktestRunnerOptimized(config);
}
