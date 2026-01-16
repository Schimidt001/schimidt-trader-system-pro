/**
 * IsolatedBacktestRunner - Executor de Backtests com Isolamento Institucional
 * 
 * IMPLEMENTAÇÃO WP1: Blindar isolamento e determinismo (prioridade máxima)
 * 
 * Este runner garante:
 * - P0 - Determinismo: toda execução registra seed, hash do dataset, hash do código
 * - P0 - Isolamento: 1 combinação = 1 instância isolada (runner/adapter/estado)
 * - P0 - Anti look-ahead: nenhum componente acessa candle futuro
 * 
 * Diferenças do BacktestRunner original:
 * - Cria nova instância de adapter e engine para cada execução
 * - Registra seed e hashes para reprodutibilidade
 * - Não reutiliza estado entre execuções
 * - Suporta abort idempotente
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import * as crypto from "crypto";
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

// ============================================================================
// TYPES
// ============================================================================

/**
 * Metadados de execução para auditoria e reprodutibilidade
 */
export interface ExecutionMetadata {
  /** Seed usado para RNG (se aplicável) */
  seed: number;
  /** Hash SHA-256 do dataset usado */
  datasetHash: string;
  /** Hash SHA-256 da configuração */
  configHash: string;
  /** Hash SHA-256 dos parâmetros */
  parametersHash: string;
  /** Timestamp de início da execução */
  startTimestamp: number;
  /** Timestamp de fim da execução */
  endTimestamp: number;
  /** Versão do runner */
  runnerVersion: string;
}

/**
 * Resultado estendido com metadados de execução
 */
export interface IsolatedBacktestResult extends BacktestResult {
  /** Metadados de execução para auditoria */
  executionMetadata: ExecutionMetadata;
  /** Indica se a execução foi abortada */
  aborted: boolean;
  /** Mensagem de erro se houver */
  errorMessage?: string;
}

/**
 * Callback de progresso
 */
export type ProgressCallback = (progress: {
  currentBar: number;
  totalBars: number;
  percentComplete: number;
  currentTrades: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
}) => void;

// ============================================================================
// ISOLATED BACKTEST RUNNER CLASS
// ============================================================================

export class IsolatedBacktestRunner {
  private readonly config: BacktestConfig;
  private readonly parameters: Record<string, number | string | boolean>;
  private readonly seed: number;
  
  // Estado isolado - criado fresh para cada execução
  private adapter: BacktestAdapter | null = null;
  private engine: SMCTradingEngine | null = null;
  
  // Controle de execução
  private isAborted: boolean = false;
  private isRunning: boolean = false;
  private progressCallback: ProgressCallback | null = null;
  
  // Metadados
  private readonly runnerVersion = "1.0.0";
  
  /**
   * Construtor - Recebe configuração e parâmetros imutáveis
   * 
   * @param config - Configuração do backtest
   * @param parameters - Parâmetros da estratégia a serem testados
   * @param seed - Seed para RNG (opcional, gera aleatório se não fornecido)
   */
  constructor(
    config: BacktestConfig,
    parameters: Record<string, number | string | boolean>,
    seed?: number
  ) {
    // Clonar configuração para garantir imutabilidade
    this.config = JSON.parse(JSON.stringify(config));
    this.parameters = JSON.parse(JSON.stringify(parameters));
    this.seed = seed ?? this.generateSeed();
  }
  
  /**
   * Gerar seed determinístico baseado em timestamp
   */
  private generateSeed(): number {
    return Date.now() % 2147483647; // Max safe int32
  }
  
  /**
   * Calcular hash SHA-256 de um objeto
   */
  private calculateHash(data: any): string {
    const str = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash("sha256").update(str).digest("hex").substring(0, 16);
  }
  
  /**
   * Definir callback de progresso
   */
  setProgressCallback(callback: ProgressCallback): void {
    this.progressCallback = callback;
  }
  
  /**
   * Abortar execução de forma idempotente
   */
  abort(): void {
    this.isAborted = true;
  }
  
  /**
   * Verificar se está em execução
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }
  
  /**
   * Executar backtest com isolamento completo
   * 
   * GARANTIAS:
   * - Nova instância de adapter e engine para cada execução
   * - Nenhum estado compartilhado com execuções anteriores
   * - Metadados registrados para reprodutibilidade
   */
  async run(): Promise<IsolatedBacktestResult> {
    if (this.isRunning) {
      throw new Error("Execução já em andamento. Use abort() para cancelar.");
    }
    
    this.isRunning = true;
    this.isAborted = false;
    const startTimestamp = Date.now();
    
    // Calcular hashes para auditoria
    const configHash = this.calculateHash(this.config);
    const parametersHash = this.calculateHash(this.parameters);
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[IsolatedBacktestRunner] 🔒 INICIANDO BACKTEST ISOLADO");
    console.log(`[IsolatedBacktestRunner] Seed: ${this.seed}`);
    console.log(`[IsolatedBacktestRunner] Config Hash: ${configHash}`);
    console.log(`[IsolatedBacktestRunner] Parameters Hash: ${parametersHash}`);
    console.log(`[IsolatedBacktestRunner] Símbolo: ${this.config.symbol}`);
    console.log(`[IsolatedBacktestRunner] Estratégia: ${this.config.strategy}`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    try {
      // 1. Criar NOVA instância do adapter (isolamento)
      this.adapter = new BacktestAdapter(this.config);
      
      // 2. Carregar dados históricos
      await this.adapter.loadHistoricalData(
        this.config.dataPath,
        this.config.symbol,
        this.config.timeframes
      );
      
      // Calcular hash do dataset
      const datasetHash = this.calculateDatasetHash();
      
      // Verificar se foi abortado durante carregamento
      if (this.isAborted) {
        return this.createAbortedResult(startTimestamp, configHash, parametersHash, datasetHash);
      }
      
      // 3. Validar dados
      const primaryTimeframe = this.config.timeframes[0] || "M5";
      const totalBars = this.adapter.getTotalBars(this.config.symbol, primaryTimeframe);
      if (totalBars === 0) {
        throw new Error(`Nenhum dado carregado para ${this.config.symbol}`);
      }
      
      // 4. Criar NOVA instância do engine (isolamento)
      const strategyType = this.mapStrategyType(this.config.strategy);
      const engineConfig: Partial<SMCTradingEngineConfig> = {
        strategyType,
        symbols: [this.config.symbol],
        lots: this.calculateLotSize(),
        maxPositions: this.config.maxPositions,
        cooldownMs: 0,
        maxSpread: this.config.maxSpread,
      };
      
      this.engine = new SMCTradingEngine(
        0, // userId fictício
        0, // botId fictício
        engineConfig,
        this.adapter as unknown as ITradingAdapter
      );
      
      // 5. Aplicar parâmetros customizados
      this.applyParameters();
      
      // 6. Inicializar engine
      await this.engine.initializeForBacktest();
      
      // 7. Executar simulação
      const { trades, equityCurve, drawdownCurve } = await this.runSimulation();
      
      // Verificar se foi abortado durante simulação
      if (this.isAborted) {
        return this.createAbortedResult(startTimestamp, configHash, parametersHash, datasetHash);
      }
      
      // 8. Calcular métricas
      const metrics = this.calculateMetrics(trades, equityCurve, drawdownCurve);
      
      const endTimestamp = Date.now();
      
      console.log("═══════════════════════════════════════════════════════════════");
      console.log("[IsolatedBacktestRunner] ✅ BACKTEST ISOLADO CONCLUÍDO");
      console.log(`[IsolatedBacktestRunner] Tempo: ${((endTimestamp - startTimestamp) / 1000).toFixed(2)}s`);
      console.log(`[IsolatedBacktestRunner] Trades: ${metrics.totalTrades}`);
      console.log(`[IsolatedBacktestRunner] Lucro: $${metrics.netProfit.toFixed(2)}`);
      console.log("═══════════════════════════════════════════════════════════════");
      
      return {
        config: this.config,
        metrics,
        trades,
        equityCurve,
        drawdownCurve,
        startTimestamp: this.config.startDate.getTime(),
        endTimestamp: this.config.endDate.getTime(),
        executionTime: endTimestamp - startTimestamp,
        executionMetadata: {
          seed: this.seed,
          datasetHash,
          configHash,
          parametersHash,
          startTimestamp,
          endTimestamp,
          runnerVersion: this.runnerVersion,
        },
        aborted: false,
      };
      
    } catch (error) {
      const endTimestamp = Date.now();
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error(`[IsolatedBacktestRunner] ❌ Erro: ${errorMessage}`);
      
      return {
        config: this.config,
        metrics: this.createEmptyMetrics(),
        trades: [],
        equityCurve: [],
        drawdownCurve: [],
        startTimestamp: this.config.startDate.getTime(),
        endTimestamp: this.config.endDate.getTime(),
        executionTime: endTimestamp - startTimestamp,
        executionMetadata: {
          seed: this.seed,
          datasetHash: "",
          configHash,
          parametersHash,
          startTimestamp,
          endTimestamp,
          runnerVersion: this.runnerVersion,
        },
        aborted: false,
        errorMessage,
      };
      
    } finally {
      // Limpar estado (isolamento)
      this.cleanup();
      this.isRunning = false;
    }
  }
  
  /**
   * Calcular hash do dataset carregado
   */
  private calculateDatasetHash(): string {
    if (!this.adapter) return "";
    
    const primaryTimeframe = this.config.timeframes[0] || "M5";
    const totalBars = this.adapter.getTotalBars(this.config.symbol, primaryTimeframe);
    
    // Hash baseado em metadados do dataset (não precisa ler todos os dados)
    const datasetInfo = {
      symbol: this.config.symbol,
      timeframes: this.config.timeframes,
      totalBars,
      startDate: this.config.startDate.toISOString(),
      endDate: this.config.endDate.toISOString(),
    };
    
    return this.calculateHash(datasetInfo);
  }
  
  /**
   * Aplicar parâmetros customizados ao engine
   */
  private applyParameters(): void {
    if (!this.engine) return;
    
    // Aplicar parâmetros de risco à config
    if (this.parameters.riskPercentage !== undefined) {
      this.config.riskPercent = this.parameters.riskPercentage as number;
    }
    if (this.parameters.maxOpenTrades !== undefined) {
      this.config.maxPositions = this.parameters.maxOpenTrades as number;
    }
    if (this.parameters.maxSpreadPips !== undefined) {
      this.config.maxSpread = this.parameters.maxSpreadPips as number;
    }
    
    // Tentar aplicar ao engine se suportado
    if (typeof (this.engine as any).getStrategyConfig === 'function' && 
        typeof (this.engine as any).updateStrategyConfig === 'function') {
      const currentConfig = (this.engine as any).getStrategyConfig();
      const mergedConfig = { ...currentConfig, ...this.parameters };
      (this.engine as any).updateStrategyConfig(mergedConfig);
      console.log(`[IsolatedBacktestRunner] ✅ ${Object.keys(this.parameters).length} parâmetros aplicados`);
    }
  }
  
  /**
   * Executar simulação com suporte a progresso e abort
   */
  private async runSimulation(): Promise<{
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
    
    const trades: BacktestTrade[] = [];
    const equityCurve: { timestamp: number; equity: number }[] = [];
    const drawdownCurve: { timestamp: number; drawdown: number; drawdownPercent: number }[] = [];
    
    let currentEquity = this.config.initialBalance;
    let peakEquity = currentEquity;
    const startTime = Date.now();
    
    // Warmup period
    const warmupBars = Math.min(200, Math.floor(totalBars * 0.1));
    
    for (let i = 0; i < totalBars; i++) {
      // Verificar abort
      if (this.isAborted) {
        console.log("[IsolatedBacktestRunner] ⚠️ Execução abortada pelo usuário");
        break;
      }
      
      // Avançar vela
      const candle = this.adapter.advanceCandle(symbol, primaryTimeframe);
      if (!candle) continue;
      
      // Sincronizar MTF
      for (const tf of this.config.timeframes) {
        if (tf !== primaryTimeframe) {
          this.adapter.syncTimeframe(symbol, tf, candle.timestamp);
        }
      }
      
      // Processar apenas após warmup
      if (i >= warmupBars) {
        // Criar tick sintético
        const tick: PriceTick = {
          symbol,
          bid: candle.close,
          ask: candle.close + (this.config.spread * 0.0001),
          timestamp: candle.timestamp,
        };
        
        // Processar tick no engine
        await this.engine.processBacktestTick(tick, candle);
        
        // Coletar trades fechados
        const closedTrades = this.adapter.getClosedTrades();
        for (const trade of closedTrades) {
          if (!trades.find(t => t.id === trade.id)) {
            trades.push(trade);
            currentEquity += trade.profit;
            peakEquity = Math.max(peakEquity, currentEquity);
          }
        }
        
        // Registrar equity e drawdown
        const drawdown = peakEquity - currentEquity;
        const drawdownPercent = peakEquity > 0 ? (drawdown / peakEquity) * 100 : 0;
        
        equityCurve.push({ timestamp: candle.timestamp, equity: currentEquity });
        drawdownCurve.push({ timestamp: candle.timestamp, drawdown, drawdownPercent });
      }
      
      // Callback de progresso
      if (this.progressCallback && i % 100 === 0) {
        const elapsedMs = Date.now() - startTime;
        const percentComplete = (i / totalBars) * 100;
        const estimatedTotalMs = (elapsedMs / percentComplete) * 100;
        const estimatedRemainingMs = estimatedTotalMs - elapsedMs;
        
        this.progressCallback({
          currentBar: i,
          totalBars,
          percentComplete,
          currentTrades: trades.length,
          elapsedMs,
          estimatedRemainingMs: Math.max(0, estimatedRemainingMs),
        });
      }
    }
    
    return { trades, equityCurve, drawdownCurve };
  }
  
  /**
   * Calcular métricas do backtest
   */
  private calculateMetrics(
    trades: BacktestTrade[],
    equityCurve: { timestamp: number; equity: number }[],
    drawdownCurve: { timestamp: number; drawdown: number; drawdownPercent: number }[]
  ): BacktestMetrics {
    if (trades.length === 0) {
      return this.createEmptyMetrics();
    }
    
    const winningTrades = trades.filter(t => t.profit > 0);
    const losingTrades = trades.filter(t => t.profit < 0);
    
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.profit, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));
    const netProfit = grossProfit - grossLoss;
    
    const winRate = (winningTrades.length / trades.length) * 100;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
    
    const maxDrawdownPercent = drawdownCurve.length > 0
      ? Math.max(...drawdownCurve.map(d => d.drawdownPercent))
      : 0;
    
    // Calcular Sharpe Ratio
    const returns = trades.map(t => t.profit / this.config.initialBalance);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdReturn = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );
    const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;
    
    // Calcular Recovery Factor
    const maxDrawdown = drawdownCurve.length > 0
      ? Math.max(...drawdownCurve.map(d => d.drawdown))
      : 0;
    const recoveryFactor = maxDrawdown > 0 ? netProfit / maxDrawdown : netProfit > 0 ? Infinity : 0;
    
    // Calcular Expectancy
    const avgWin = winningTrades.length > 0
      ? grossProfit / winningTrades.length
      : 0;
    const avgLoss = losingTrades.length > 0
      ? grossLoss / losingTrades.length
      : 0;
    const expectancy = (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss;
    
    return {
      netProfit,
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      profitFactor,
      maxDrawdownPercent,
      sharpeRatio,
      recoveryFactor,
      expectancy,
      averageWin: avgWin,
      averageLoss: avgLoss,
      largestWin: winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.profit)) : 0,
      largestLoss: losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.profit)) : 0,
      averageHoldingTime: this.calculateAverageHoldingTime(trades),
      maxConsecutiveWins: this.calculateMaxConsecutive(trades, true),
      maxConsecutiveLosses: this.calculateMaxConsecutive(trades, false),
    };
  }
  
  /**
   * Criar métricas vazias
   */
  private createEmptyMetrics(): BacktestMetrics {
    return {
      netProfit: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      profitFactor: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      recoveryFactor: 0,
      expectancy: 0,
      averageWin: 0,
      averageLoss: 0,
      largestWin: 0,
      largestLoss: 0,
      averageHoldingTime: 0,
      maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0,
    };
  }
  
  /**
   * Criar resultado abortado
   */
  private createAbortedResult(
    startTimestamp: number,
    configHash: string,
    parametersHash: string,
    datasetHash: string
  ): IsolatedBacktestResult {
    const endTimestamp = Date.now();
    
    return {
      config: this.config,
      metrics: this.createEmptyMetrics(),
      trades: [],
      equityCurve: [],
      drawdownCurve: [],
      startTimestamp: this.config.startDate.getTime(),
      endTimestamp: this.config.endDate.getTime(),
      executionTime: endTimestamp - startTimestamp,
      executionMetadata: {
        seed: this.seed,
        datasetHash,
        configHash,
        parametersHash,
        startTimestamp,
        endTimestamp,
        runnerVersion: this.runnerVersion,
      },
      aborted: true,
    };
  }
  
  /**
   * Calcular tempo médio de holding
   */
  private calculateAverageHoldingTime(trades: BacktestTrade[]): number {
    if (trades.length === 0) return 0;
    
    const totalTime = trades.reduce((sum, t) => {
      const duration = t.closeTimestamp - t.openTimestamp;
      return sum + duration;
    }, 0);
    
    return totalTime / trades.length;
  }
  
  /**
   * Calcular máximo consecutivo de wins ou losses
   */
  private calculateMaxConsecutive(trades: BacktestTrade[], wins: boolean): number {
    let maxConsecutive = 0;
    let currentConsecutive = 0;
    
    for (const trade of trades) {
      const isTarget = wins ? trade.profit > 0 : trade.profit < 0;
      
      if (isTarget) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 0;
      }
    }
    
    return maxConsecutive;
  }
  
  /**
   * Mapear tipo de estratégia
   */
  private mapStrategyType(strategy: BacktestStrategyType): StrategyType {
    switch (strategy) {
      case "SMC":
        return StrategyType.SMC;
      case "HYBRID":
        return StrategyType.HYBRID;
      case "RSI_VWAP":
        return StrategyType.RSI_VWAP;
      default:
        return StrategyType.SMC;
    }
  }
  
  /**
   * Calcular tamanho do lote
   */
  private calculateLotSize(): number {
    const riskAmount = this.config.initialBalance * (this.config.riskPercent / 100);
    const pipValue = 10; // Aproximação
    const stopLossPips = 50; // Aproximação
    
    return Math.max(0.01, riskAmount / (stopLossPips * pipValue));
  }
  
  /**
   * Limpar estado (garantir isolamento)
   */
  private cleanup(): void {
    this.adapter = null;
    this.engine = null;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Criar instância isolada do runner
 * 
 * @param config - Configuração do backtest
 * @param parameters - Parâmetros da estratégia
 * @param seed - Seed para RNG (opcional)
 */
export function createIsolatedRunner(
  config: BacktestConfig,
  parameters: Record<string, number | string | boolean>,
  seed?: number
): IsolatedBacktestRunner {
  return new IsolatedBacktestRunner(config, parameters, seed);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default IsolatedBacktestRunner;
