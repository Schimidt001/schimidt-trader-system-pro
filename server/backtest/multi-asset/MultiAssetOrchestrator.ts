/**
 * MultiAssetOrchestrator - Orquestrador de Backtests Multi-Asset
 * 
 * IMPLEMENTAÇÃO WP6: Multi-Asset com relógio global (institucional)
 * 
 * Coordena backtests multi-asset com:
 * - GlobalClock para sincronização temporal
 * - Ledger para tracking de posições e equity
 * - RiskGovernor para limites globais
 * - CorrelationAnalyzer para análise de correlação
 * - PortfolioMetricsCalculator para métricas de portfólio
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { GlobalClock, createGlobalClock } from "./GlobalClock";
import { Ledger, createLedger, DEFAULT_LEDGER_CONFIG, LedgerConfig } from "./Ledger";
import { RiskGovernor, createRiskGovernor, DEFAULT_RISK_GOVERNOR_CONFIG, RiskGovernorConfig, OrderProposal } from "./RiskGovernor";
import { CorrelationAnalyzer, createCorrelationAnalyzer, DEFAULT_CORRELATION_ANALYZER_CONFIG, CorrelationAnalyzerConfig } from "./CorrelationAnalyzer";
import { PortfolioMetricsCalculator, createPortfolioMetricsCalculator, DEFAULT_PORTFOLIO_METRICS_CONFIG, PortfolioMetricsConfig, PortfolioMetrics } from "./PortfolioMetricsCalculator";
import { BacktestTrade, BacktestConfig, BacktestStrategyType } from "../types/backtest.types";
import { CandleData, PriceTick } from "../../adapters/IBrokerAdapter";
import { IsolatedBacktestRunner, createIsolatedRunner } from "../runners/IsolatedBacktestRunner";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuração do orquestrador multi-asset
 */
export interface MultiAssetOrchestratorConfig {
  symbols: string[];
  strategy: BacktestStrategyType;
  startDate: Date;
  endDate: Date;
  dataPath: string;
  timeframes: string[];
  parameters: Record<string, number | string | boolean>;
  
  // Configurações de componentes
  ledgerConfig?: Partial<LedgerConfig>;
  riskGovernorConfig?: Partial<RiskGovernorConfig>;
  correlationConfig?: Partial<CorrelationAnalyzerConfig>;
  portfolioMetricsConfig?: Partial<PortfolioMetricsConfig>;
  
  // Seed para determinismo
  seed?: number;
}

/**
 * Resultado do backtest multi-asset
 */
export interface MultiAssetBacktestResult {
  config: MultiAssetOrchestratorConfig;
  portfolioMetrics: PortfolioMetrics;
  tradesBySymbol: Record<string, BacktestTrade[]>;
  allTrades: BacktestTrade[];
  equityCurve: { timestamp: number; equity: number }[];
  correlationAnalysis: {
    finalMatrix: number[][];
    symbols: string[];
    diversificationScore: number;
  };
  riskAnalysis: {
    violations: { timestamp: number; type: string; message: string }[];
    maxDailyDrawdown: number;
    maxTotalExposure: number;
  };
  executionTime: number;
  seed: number;
}

/**
 * Callback de progresso
 */
export type MultiAssetProgressCallback = (progress: {
  phase: "LOADING" | "SIMULATING" | "ANALYZING";
  symbol?: string;
  percentComplete: number;
  message: string;
}) => void;

// ============================================================================
// MULTI-ASSET ORCHESTRATOR CLASS
// ============================================================================

export class MultiAssetOrchestrator {
  private config: MultiAssetOrchestratorConfig;
  private clock: GlobalClock;
  private ledger: Ledger;
  private riskGovernor: RiskGovernor;
  private correlationAnalyzer: CorrelationAnalyzer;
  private portfolioMetricsCalculator: PortfolioMetricsCalculator;
  
  private progressCallback?: MultiAssetProgressCallback;
  private isAborted: boolean = false;
  
  constructor(config: MultiAssetOrchestratorConfig) {
    this.config = config;
    
    // Criar GlobalClock
    this.clock = createGlobalClock(config.startDate, config.endDate);
    
    // Criar Ledger
    const ledgerConfig: LedgerConfig = {
      ...DEFAULT_LEDGER_CONFIG,
      ...config.ledgerConfig,
    };
    this.ledger = createLedger(ledgerConfig);
    
    // Criar RiskGovernor
    const riskConfig: RiskGovernorConfig = {
      ...DEFAULT_RISK_GOVERNOR_CONFIG,
      ...config.riskGovernorConfig,
    };
    this.riskGovernor = createRiskGovernor(riskConfig, this.ledger);
    
    // Criar CorrelationAnalyzer
    const correlationConfig: CorrelationAnalyzerConfig = {
      ...DEFAULT_CORRELATION_ANALYZER_CONFIG,
      ...config.correlationConfig,
    };
    this.correlationAnalyzer = createCorrelationAnalyzer(correlationConfig);
    
    // Criar PortfolioMetricsCalculator
    const portfolioConfig: PortfolioMetricsConfig = {
      ...DEFAULT_PORTFOLIO_METRICS_CONFIG,
      ...config.portfolioMetricsConfig,
    };
    this.portfolioMetricsCalculator = createPortfolioMetricsCalculator(portfolioConfig);
    
    // Registrar símbolos no clock
    for (const symbol of config.symbols) {
      this.clock.registerSymbol(symbol);
    }
    
    console.log(`[MultiAssetOrchestrator] Inicializado com ${config.symbols.length} símbolos`);
  }
  
  /**
   * Definir callback de progresso
   */
  setProgressCallback(callback: MultiAssetProgressCallback): void {
    this.progressCallback = callback;
  }
  
  /**
   * Abortar execução
   */
  abort(): void {
    this.isAborted = true;
  }
  
  /**
   * Executar backtest multi-asset
   */
  async run(): Promise<MultiAssetBacktestResult> {
    const startTime = Date.now();
    const seed = this.config.seed || Date.now() % 2147483647;
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[MultiAssetOrchestrator] 🚀 INICIANDO BACKTEST MULTI-ASSET");
    console.log(`[MultiAssetOrchestrator] Símbolos: ${this.config.symbols.join(", ")}`);
    console.log(`[MultiAssetOrchestrator] Período: ${this.config.startDate.toISOString()} - ${this.config.endDate.toISOString()}`);
    console.log(`[MultiAssetOrchestrator] Seed: ${seed}`);
    console.log("═══════════════════════════════════════════════════════════════");
    
    this.isAborted = false;
    
    try {
      // Fase 1: Executar backtests individuais para cada símbolo
      this.reportProgress("LOADING", undefined, 0, "Iniciando backtests individuais...");
      
      const tradesBySymbol: Record<string, BacktestTrade[]> = {};
      const allTrades: BacktestTrade[] = [];
      
      for (let i = 0; i < this.config.symbols.length; i++) {
        if (this.isAborted) break;
        
        const symbol = this.config.symbols[i];
        const progress = ((i + 1) / this.config.symbols.length) * 50;
        
        this.reportProgress("SIMULATING", symbol, progress, `Executando backtest para ${symbol}...`);
        
        // Criar configuração para este símbolo
        const symbolConfig: BacktestConfig = {
          symbol,
          strategy: this.config.strategy,
          startDate: this.config.startDate,
          endDate: this.config.endDate,
          dataPath: this.config.dataPath,
          timeframes: this.config.timeframes,
          initialBalance: (this.ledger as any).config?.initialBalance || 10000,
          leverage: (this.ledger as any).config?.leverage || 500,
          commission: 7,
          slippage: 0.5,
          spread: 1.0,
          riskPercent: (this.config.parameters.riskPercentage as number) || 2,
          maxPositions: (this.config.parameters.maxOpenTrades as number) || 3,
          maxSpread: (this.config.parameters.maxSpreadPips as number) || 3,
        };
        
        // Executar backtest isolado
        const runner = createIsolatedRunner(symbolConfig, this.config.parameters, seed + i);
        const result = await runner.run();
        
        // Armazenar trades
        tradesBySymbol[symbol] = result.trades;
        allTrades.push(...result.trades);
        
        // Adicionar retornos ao correlation analyzer
        for (const trade of result.trades) {
          this.correlationAnalyzer.addReturn(symbol, trade.profit);
        }
        
        console.log(`[MultiAssetOrchestrator] ${symbol}: ${result.trades.length} trades, PnL: $${result.metrics.netProfit.toFixed(2)}`);
      }
      
      if (this.isAborted) {
        throw new Error("Execução abortada pelo usuário");
      }
      
      // Fase 2: Simular execução consolidada com RiskGovernor
      this.reportProgress("SIMULATING", undefined, 60, "Simulando execução consolidada...");
      
      // Ordenar todos os trades por timestamp
      allTrades.sort((a, b) => a.openTimestamp - b.openTimestamp);
      
      // Simular execução com validação de risco
      const validatedTrades: BacktestTrade[] = [];
      
      for (const trade of allTrades) {
        // Criar proposta de ordem
        const proposal: OrderProposal = {
          symbol: trade.symbol,
          direction: trade.direction,
          size: trade.size,
          entryPrice: trade.entryPrice,
        };
        
        // Validar com RiskGovernor
        const validation = this.riskGovernor.validateOrder(proposal, trade.openTimestamp);
        
        if (validation.allowed) {
          validatedTrades.push(trade);
          
          // Abrir posição no ledger
          const position = this.ledger.openPosition(
            trade.symbol,
            trade.direction,
            trade.entryPrice,
            trade.size,
            trade.openTimestamp
          );
          
          if (position) {
            // Fechar posição
            this.ledger.closePosition(
              position.id,
              trade.exitPrice,
              trade.closeTimestamp,
              trade.commission
            );
          }
          
          // Registrar snapshot
          this.ledger.recordSnapshot(trade.closeTimestamp);
        }
      }
      
      // Fase 3: Calcular métricas
      this.reportProgress("ANALYZING", undefined, 80, "Calculando métricas de portfólio...");
      
      const equityCurve = this.ledger.getEquityCurve();
      const portfolioMetrics = this.portfolioMetricsCalculator.calculate(
        validatedTrades,
        equityCurve,
        (this.ledger as any).config?.initialBalance || 10000
      );
      
      // Fase 4: Análise de correlação
      this.reportProgress("ANALYZING", undefined, 90, "Analisando correlações...");
      
      const correlationResult = this.correlationAnalyzer.analyze();
      
      // Fase 5: Compilar resultado
      this.reportProgress("ANALYZING", undefined, 95, "Compilando resultados...");
      
      const executionTime = (Date.now() - startTime) / 1000;
      
      const result: MultiAssetBacktestResult = {
        config: this.config,
        portfolioMetrics,
        tradesBySymbol,
        allTrades: validatedTrades,
        equityCurve,
        correlationAnalysis: {
          finalMatrix: correlationResult.matrix.matrix,
          symbols: correlationResult.matrix.symbols,
          diversificationScore: correlationResult.diversificationScore,
        },
        riskAnalysis: {
          violations: this.riskGovernor.getViolations(),
          maxDailyDrawdown: this.calculateMaxDailyDrawdown(),
          maxTotalExposure: this.calculateMaxTotalExposure(),
        },
        executionTime,
        seed,
      };
      
      this.reportProgress("ANALYZING", undefined, 100, "Concluído!");
      
      console.log("═══════════════════════════════════════════════════════════════");
      console.log("[MultiAssetOrchestrator] ✅ BACKTEST MULTI-ASSET CONCLUÍDO");
      console.log(`[MultiAssetOrchestrator] Tempo: ${executionTime.toFixed(2)}s`);
      console.log(`[MultiAssetOrchestrator] Trades totais: ${validatedTrades.length}`);
      console.log(`[MultiAssetOrchestrator] Retorno total: ${portfolioMetrics.totalReturn.toFixed(2)}%`);
      console.log(`[MultiAssetOrchestrator] Sharpe Ratio: ${portfolioMetrics.sharpeRatio.toFixed(2)}`);
      console.log(`[MultiAssetOrchestrator] Max Drawdown: ${portfolioMetrics.maxDrawdown.toFixed(2)}%`);
      console.log("═══════════════════════════════════════════════════════════════");
      
      return result;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[MultiAssetOrchestrator] ❌ Erro: ${errorMessage}`);
      throw error;
    }
  }
  
  /**
   * Reportar progresso
   */
  private reportProgress(
    phase: "LOADING" | "SIMULATING" | "ANALYZING",
    symbol: string | undefined,
    percentComplete: number,
    message: string
  ): void {
    if (this.progressCallback) {
      this.progressCallback({ phase, symbol, percentComplete, message });
    }
  }
  
  /**
   * Calcular max daily drawdown
   */
  private calculateMaxDailyDrawdown(): number {
    const snapshots = this.ledger.getSnapshots();
    if (snapshots.length === 0) return 0;
    
    let maxDD = 0;
    let dayStart = snapshots[0].equity;
    let currentDay = new Date(snapshots[0].timestamp).toDateString();
    
    for (const snapshot of snapshots) {
      const snapshotDay = new Date(snapshot.timestamp).toDateString();
      
      if (snapshotDay !== currentDay) {
        currentDay = snapshotDay;
        dayStart = snapshot.equity;
      }
      
      const dd = dayStart > 0 ? ((dayStart - snapshot.equity) / dayStart) * 100 : 0;
      if (dd > maxDD) {
        maxDD = dd;
      }
    }
    
    return maxDD;
  }
  
  /**
   * Calcular max total exposure
   */
  private calculateMaxTotalExposure(): number {
    const snapshots = this.ledger.getSnapshots();
    if (snapshots.length === 0) return 0;
    
    let maxExposure = 0;
    
    for (const snapshot of snapshots) {
      const exposure = snapshot.equity > 0 
        ? (snapshot.margin / snapshot.equity) * 100 
        : 0;
      
      if (exposure > maxExposure) {
        maxExposure = exposure;
      }
    }
    
    return maxExposure;
  }
  
  /**
   * Obter estado atual
   */
  getState(): {
    clockState: ReturnType<GlobalClock["getState"]>;
    ledgerSummary: ReturnType<Ledger["getSummary"]>;
    riskState: ReturnType<RiskGovernor["getRiskState"]>;
  } {
    return {
      clockState: this.clock.getState(),
      ledgerSummary: this.ledger.getSummary(),
      riskState: this.riskGovernor.getRiskState(),
    };
  }
  
  /**
   * Resetar orquestrador
   */
  reset(): void {
    this.clock.reset();
    this.ledger.reset();
    this.riskGovernor.reset();
    this.correlationAnalyzer.reset();
    this.isAborted = false;
    
    console.log(`[MultiAssetOrchestrator] Resetado`);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Criar orquestrador multi-asset
 */
export function createMultiAssetOrchestrator(config: MultiAssetOrchestratorConfig): MultiAssetOrchestrator {
  return new MultiAssetOrchestrator(config);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default MultiAssetOrchestrator;
