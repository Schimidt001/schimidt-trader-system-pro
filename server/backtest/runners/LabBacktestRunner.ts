/**
 * LabBacktestRunner - Executor de Backtests EXCLUSIVO do Laboratório
 *
 * Versão isolada do BacktestRunner para uso exclusivo no ambiente de laboratório.
 * Garante que alterações experimentais não afetem o ambiente LIVE.
 *
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import {
  BacktestConfig,
  BacktestResult,
  BacktestMetrics,
  BacktestTrade,
  BacktestStrategyType,
} from "../types/backtest.types";
import { BacktestAdapter } from "../adapters/BacktestAdapter";
import { SMCTradingEngine, SMCTradingEngineConfig } from "../../adapters/ctrader/SMCTradingEngine";
import { StrategyType } from "../../adapters/ctrader/ITradingStrategy";
import { ITradingAdapter } from "../adapters/ITradingAdapter";
import { CandleData, PriceTick } from "../../adapters/IBrokerAdapter";
import { backtestLogger } from "../utils/LabLogger";
import { memoryManager, hasEnoughMemory } from "../utils/MemoryManager";
import { yieldToEventLoop } from "../utils/AsyncUtils";

// ============================================================================
// LAB BACKTEST RUNNER CLASS
// ============================================================================

export class LabBacktestRunner {
  private config: BacktestConfig;
  private adapter: BacktestAdapter | null = null;
  private engine: SMCTradingEngine | null = null;

  constructor(config: BacktestConfig) {
    this.config = config;
  }

  /**
   * Run the backtest using the real SMCTradingEngine with injected BacktestAdapter
   */
  async run(): Promise<BacktestResult> {
    const startTime = Date.now();

    backtestLogger.startOperation("Lab Backtest MTF", {
      simbolo: this.config.symbol,
      estrategia: this.config.strategy,
    });

    // 1. Create BacktestAdapter (Mock da corretora)
    this.adapter = new BacktestAdapter(this.config);

    // 2. Load historical data into adapter
    await this.adapter.loadHistoricalData(
      this.config.dataPath,
      this.config.symbol,
      this.config.timeframes
    );

    // Validate data was loaded for all timeframes
    const primaryTimeframe = this.config.timeframes[0] || "M5";
    const totalBars = this.adapter.getTotalBars(this.config.symbol, primaryTimeframe);
    if (totalBars === 0) {
      throw new Error(`Nenhum dado carregado para ${this.config.symbol}. Verifique o caminho dos dados.`);
    }

    // Log MTF data availability
    backtestLogger.info(`Dados carregados para ${this.config.timeframes.length} timeframes`, "LabBacktestRunner");

    // 3. Determine strategy type
    const strategyType = this.mapStrategyType(this.config.strategy);

    // 4. Create engine config
    const engineConfig: Partial<SMCTradingEngineConfig> = {
      strategyType,
      symbols: [this.config.symbol],
      lots: this.calculateLotSize(),
      maxPositions: this.config.maxPositions,
      cooldownMs: 0, // No cooldown in backtest
      maxSpread: this.config.maxSpread,
    };

    // 5. INJEÇÃO DE DEPENDÊNCIA: Criar SMCTradingEngine com BacktestAdapter
    this.engine = new SMCTradingEngine(
      0, // userId fictício para backtest
      0, // botId fictício para backtest
      engineConfig,
      this.adapter as unknown as ITradingAdapter
    );

    backtestLogger.debug("SMCTradingEngine instanciado", "LabBacktestRunner");

    // 6. Inicializar engine para backtest (sem loops de produção)
    await this.engine.initializeForBacktest();
    backtestLogger.debug("Engine inicializado", "LabBacktestRunner");

    // INJECTION: Apply custom parameters if they exist
    if (this.customParameters) {
      this.injectCustomParameters(this.customParameters);
    }

    // 7. Run simulation with strategy integration
    const { trades, equityCurve, drawdownCurve } = await this.runSimulationWithStrategy();

    // 8. Calculate metrics
    const metrics = this.calculateMetrics(trades, equityCurve, drawdownCurve);

    const executionTime = Date.now() - startTime;

    backtestLogger.endOperation("Lab Backtest MTF", true, {
      tempo: `${(executionTime / 1000).toFixed(2)}s`,
      trades: metrics.totalTrades,
      lucro: `$${metrics.netProfit.toFixed(2)}`,
      winrate: `${metrics.winRate.toFixed(2)}%`,
    });

    // Validação de sanidade: alertar se 0 trades
    if (metrics.totalTrades === 0) {
      backtestLogger.warn("0 trades executados - verificar dados e filtros", "LabBacktestRunner");
    }

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
  }

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

    backtestLogger.info(`Simulação: ${totalBars} velas, TF: ${primaryTimeframe}`, "LabBacktestRunner");

    // Warmup period
    const warmupBars = Math.min(200, Math.floor(totalBars * 0.1));
    backtestLogger.debug(`Warmup: ${warmupBars} velas`, "LabBacktestRunner");

    for (let i = 0; i < warmupBars; i++) {
      if (!this.adapter.advanceBar(symbol, primaryTimeframe)) break;
    }

    backtestLogger.debug("Warmup completo", "LabBacktestRunner");

    // Main simulation loop
    let barCount = 0;
    const startTime = Date.now();

    // Configurar callback para receber ticks
    await this.adapter.subscribePrice(symbol, (tick: PriceTick) => {
      // O tick é processado automaticamente pelo adapter
      // A estratégia será chamada via eventos
    });

    while (this.adapter.advanceBar(symbol, primaryTimeframe)) {
      barCount++;

      // COOPERATIVE MULTITASKING
      if (barCount % 500 === 0) {
        await yieldToEventLoop();
      }

      // CORREÇÃO OOM: Verificar memória periodicamente
      if (barCount % 500 === 0 && !hasEnoughMemory(30)) {
        memoryManager.tryFreeMemory();
      }

      // Obter dados MTF para análise
      const mtfData = await this.buildMTFData(symbol);

      // Chamar análise da estratégia diretamente
      await this.triggerStrategyAnalysis(symbol, mtfData);

      // Log de progresso usando throttling
      backtestLogger.progress(barCount, totalBars, "Processando velas", "LabBacktestRunner");
    }

    // Close any remaining positions
    const accountState = this.adapter.getAccountState();
    const openPositionIds = Array.from(accountState.openPositions.keys());
    for (const positionId of openPositionIds) {
      await this.adapter.closePosition(positionId);
    }

    const closedTrades = this.adapter.getClosedTrades();

    backtestLogger.info(`Simulação concluída: ${barCount} velas, ${closedTrades.length} trades`, "LabBacktestRunner");

    return {
      trades: closedTrades,
      equityCurve: this.adapter["equityCurve"] || [],
      drawdownCurve: this.adapter["drawdownCurve"] || [],
    };
  }

  private async buildMTFData(symbol: string): Promise<{
    h1: CandleData[];
    m15: CandleData[];
    m5: CandleData[];
    currentBid?: number;
    currentAsk?: number;
    currentSpreadPips?: number;
  }> {
    if (!this.adapter) {
      return { h1: [], m15: [], m5: [] };
    }

    const h1Candles = await this.adapter.getCandleHistory(symbol, "H1", 250);
    const m15Candles = await this.adapter.getCandleHistory(symbol, "M15", 250);
    const m5Candles = await this.adapter.getCandleHistory(symbol, "M5", 250);

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
      h1: h1Candles,
      m15: m15Candles,
      m5: m5Candles,
      currentBid,
      currentAsk,
      currentSpreadPips,
    };
  }

  private async triggerStrategyAnalysis(
    symbol: string,
    mtfData: {
      h1: CandleData[];
      m15: CandleData[];
      m5: CandleData[];
      currentBid?: number;
      currentAsk?: number;
      currentSpreadPips?: number;
    }
  ): Promise<void> {
    if (!this.engine || !this.adapter) return;

    if (mtfData.h1.length < 50 || mtfData.m15.length < 30 || mtfData.m5.length < 20) {
      return;
    }

    const formattedMtfData = {
      h1: mtfData.h1.map(c => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
      })),
      m15: mtfData.m15.map(c => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
      })),
      m5: mtfData.m5.map(c => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
      })),
      currentBid: mtfData.currentBid,
      currentAsk: mtfData.currentAsk,
      currentSpreadPips: mtfData.currentSpreadPips,
    };

    await this.engine.analyzeWithData(symbol, formattedMtfData);
  }

  private mapStrategyType(backtestType: BacktestStrategyType): StrategyType {
    switch (backtestType) {
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

  private calculateLotSize(): number {
    const riskAmount = this.config.initialBalance * (this.config.riskPercent / 100);
    const estimatedSLPips = 30;
    const pipValue = 10;

    const lots = riskAmount / (estimatedSLPips * pipValue);
    return Math.max(0.01, Math.min(lots, 1));
  }

  private calculateMetrics(
    trades: BacktestTrade[],
    equityCurve: { timestamp: number; equity: number }[],
    drawdownCurve: { timestamp: number; drawdown: number; drawdownPercent: number }[]
  ): BacktestMetrics {
    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => t.netProfit > 0).length;
    const losingTrades = trades.filter(t => t.netProfit < 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    const grossProfit = trades.filter(t => t.netProfit > 0).reduce((sum, t) => sum + t.netProfit, 0);
    const grossLoss = Math.abs(trades.filter(t => t.netProfit < 0).reduce((sum, t) => sum + t.netProfit, 0));

    const netProfit = grossProfit - grossLoss;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    const maxDrawdown = Math.max(...drawdownCurve.map(d => d.drawdown), 0);
    const maxDrawdownPercent = Math.max(...drawdownCurve.map(d => d.drawdownPercent), 0);

    const { maxConsecutiveWins, maxConsecutiveLosses } = this.calculateConsecutive(trades);

    const winningProfits = trades.filter(t => t.netProfit > 0).map(t => t.netProfit);
    const losingProfits = trades.filter(t => t.netProfit < 0).map(t => Math.abs(t.netProfit));

    const averageWin = winningProfits.length > 0 ? winningProfits.reduce((a, b) => a + b, 0) / winningProfits.length : 0;
    const averageLoss = losingProfits.length > 0 ? losingProfits.reduce((a, b) => a + b, 0) / losingProfits.length : 0;

    const averageTrade = totalTrades > 0 ? netProfit / totalTrades : 0;

    const largestWin = winningProfits.length > 0 ? Math.max(...winningProfits) : 0;
    const largestLoss = losingProfits.length > 0 ? Math.max(...losingProfits) : 0;

    const averageWinLossRatio = averageLoss > 0 ? averageWin / averageLoss : averageWin > 0 ? Infinity : 0;

    const holdingPeriods = trades.map(t => t.holdingPeriod);
    const averageHoldingPeriod = holdingPeriods.length > 0 ? holdingPeriods.reduce((a, b) => a + b, 0) / holdingPeriods.length / (1000 * 60 * 60) : 0;

    const totalTradingDays = this.calculateTradingDays(trades);
    const tradesPerDay = totalTradingDays > 0 ? totalTrades / totalTradingDays : 0;

    const returns = this.calculateReturns(equityCurve);
    const sharpeRatio = this.calculateSharpeRatio(returns);
    const sortinoRatio = this.calculateSortinoRatio(returns);
    const calmarRatio = maxDrawdownPercent > 0 ? ((netProfit / this.config.initialBalance) * 100) / maxDrawdownPercent : 0;

    const expectancy = ((winRate / 100) * averageWin) - (((100 - winRate) / 100) * averageLoss);

    const recoveryFactor = maxDrawdown > 0 ? netProfit / maxDrawdown : netProfit > 0 ? Infinity : 0;

    const finalBalance = this.config.initialBalance + netProfit;
    const returnPercent = (netProfit / this.config.initialBalance) * 100;

    return {
      totalTrades,
      winningTrades,
      losingTrades,
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
      initialBalance: this.config.initialBalance,
      finalBalance,
      returnPercent,
    };
  }

  private calculateConsecutive(trades: BacktestTrade[]): {
    maxConsecutiveWins: number;
    maxConsecutiveLosses: number;
  } {
    let maxWins = 0;
    let maxLosses = 0;
    let currentWins = 0;
    let currentLosses = 0;

    for (const trade of trades) {
      if (trade.netProfit > 0) {
        currentWins++;
        currentLosses = 0;
        maxWins = Math.max(maxWins, currentWins);
      } else {
        currentLosses++;
        currentWins = 0;
        maxLosses = Math.max(maxLosses, currentLosses);
      }
    }

    return { maxConsecutiveWins: maxWins, maxConsecutiveLosses: maxLosses };
  }

  private calculateTradingDays(trades: BacktestTrade[]): number {
    if (trades.length === 0) return 0;

    const uniqueDays = new Set<string>();

    for (const trade of trades) {
      const date = new Date(trade.entryTime);
      const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      uniqueDays.add(dayKey);
    }

    return uniqueDays.size;
  }

  private calculateReturns(equityCurve: { timestamp: number; equity: number }[]): number[] {
    const returns: number[] = [];

    for (let i = 1; i < equityCurve.length; i++) {
      const prevEquity = equityCurve[i - 1].equity;
      const currEquity = equityCurve[i].equity;

      if (prevEquity > 0) {
        const returnPct = ((currEquity - prevEquity) / prevEquity) * 100;
        returns.push(returnPct);
      }
    }

    return returns;
  }

  private calculateSharpeRatio(returns: number[]): number {
    if (returns.length < 2) return 0;

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    const annualizedReturn = avgReturn * 252;
    const annualizedStdDev = stdDev * Math.sqrt(252);

    return annualizedReturn / annualizedStdDev;
  }

  private calculateSortinoRatio(returns: number[]): number {
    if (returns.length < 2) return 0;

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

    const negativeReturns = returns.filter(r => r < 0);
    if (negativeReturns.length === 0) return avgReturn > 0 ? Infinity : 0;

    const downsideVariance = negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);

    if (downsideDeviation === 0) return 0;

    const annualizedReturn = avgReturn * 252;
    const annualizedDownside = downsideDeviation * Math.sqrt(252);

    return annualizedReturn / annualizedDownside;
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
}

export function createLabBacktestRunner(config: BacktestConfig): LabBacktestRunner {
  return new LabBacktestRunner(config);
}
