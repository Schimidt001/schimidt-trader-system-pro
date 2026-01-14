/**
 * Backtest Router - Endpoints tRPC para Backtesting
 * 
 * Expõe endpoints para:
 * - Download de dados históricos
 * - Execução de backtests
 * - Consulta de resultados
 * - Status de progresso
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 1.0.0
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import * as path from "path";
import * as fs from "fs";
import { getMarketDataCollector } from "./collectors/MarketDataCollector";
import { BacktestRunner, DEFAULT_BACKTEST_CONFIG } from "./runners/BacktestRunner";
import { BacktestOptimizer, OptimizationConfig, OptimizationResult, OptimizationProgress } from "./runners/BacktestOptimizer";
import { BacktestConfig, BacktestStrategyType, BacktestResult } from "./types/backtest.types";
import { ctraderAdapter } from "../adapters/CTraderAdapter";

// ============================================================================
// STATE
// ============================================================================

// Store running backtest state
interface BacktestState {
  isRunning: boolean;
  progress: number;
  currentPhase: string;
  result: BacktestResult | null;
  error: string | null;
}

const backtestState: BacktestState = {
  isRunning: false,
  progress: 0,
  currentPhase: "idle",
  result: null,
  error: null,
};

// Store data download state
interface DownloadState {
  isDownloading: boolean;
  progress: number;
  currentSymbol: string;
  currentTimeframe: string;
  errors: string[];
}

const downloadState: DownloadState = {
  isDownloading: false,
  progress: 0,
  currentSymbol: "",
  currentTimeframe: "",
  errors: [],
};

// Store optimization state
interface OptimizationState {
  isRunning: boolean;
  progress: OptimizationProgress | null;
  result: OptimizationResult | null;
  error: string | null;
}

const optimizationState: OptimizationState = {
  isRunning: false,
  progress: null,
  result: null,
  error: null,
};

// Active optimizer instance (for abort)
let activeOptimizer: BacktestOptimizer | null = null;

// ============================================================================
// SCHEMAS
// ============================================================================

const runBacktestSchema = z.object({
  symbol: z.string().min(1, "Símbolo é obrigatório"),
  strategy: z.enum(["SMC", "HYBRID", "RSI_VWAP"]),
  startDate: z.string().refine(val => !isNaN(Date.parse(val)), "Data inválida"),
  endDate: z.string().refine(val => !isNaN(Date.parse(val)), "Data inválida"),
  initialBalance: z.number().min(100).max(1000000).default(10000),
  leverage: z.number().min(1).max(1000).default(500),
  riskPercent: z.number().min(0.1).max(10).default(2),
  maxPositions: z.number().min(1).max(10).default(3),
  commission: z.number().min(0).max(50).default(7),
  slippage: z.number().min(0).max(5).default(0.5),
  spread: z.number().min(0).max(10).default(1),
  maxSpread: z.number().min(0).max(20).default(3),
});

const downloadDataSchema = z.object({
  symbols: z.array(z.string()).min(1).default(["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"]),
  timeframes: z.array(z.string()).min(1).default(["M5", "H1", "H4"]),
  monthsBack: z.number().min(1).max(24).default(6),
});

// ============================================================================
// ROUTER
// ============================================================================

export const backtestRouter = router({
  // =========================================================================
  // DATA MANAGEMENT
  // =========================================================================
  
  /**
   * Download historical data from cTrader
   */
  downloadData: protectedProcedure
    .input(downloadDataSchema)
    .mutation(async ({ input }) => {
      // Check if already downloading
      if (downloadState.isDownloading) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Download já em andamento",
        });
      }
      
      // Check cTrader connection
      if (!ctraderAdapter.isConnected()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "cTrader não está conectado. Conecte primeiro no Dashboard.",
        });
      }
      
      // Reset state
      downloadState.isDownloading = true;
      downloadState.progress = 0;
      downloadState.errors = [];
      
      try {
        const dataPath = path.join(process.cwd(), "data", "candles");
        
        const collector = getMarketDataCollector({
          symbols: input.symbols,
          timeframes: input.timeframes,
          monthsBack: input.monthsBack,
          outputDir: dataPath,
        });
        
        // Set progress callback
        collector.setProgressCallback((progress) => {
          downloadState.progress = progress.totalProgress;
          downloadState.currentSymbol = progress.currentSymbol;
          downloadState.currentTimeframe = progress.currentTimeframe;
          downloadState.errors = progress.errors;
        });
        
        // Start download
        const result = await collector.downloadAll();
        
        downloadState.isDownloading = false;
        downloadState.progress = 100;
        
        return {
          success: result.success,
          filesCreated: result.filesCreated.length,
          errors: result.errors,
          message: result.success
            ? `Download concluído! ${result.filesCreated.length} arquivos criados.`
            : `Download concluído com erros: ${result.errors.join(", ")}`,
        };
        
      } catch (error) {
        downloadState.isDownloading = false;
        downloadState.errors.push((error as Error).message);
        
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro no download: ${(error as Error).message}`,
        });
      }
    }),
  
  /**
   * Get download progress
   */
  getDownloadStatus: protectedProcedure
    .query(() => {
      return {
        isDownloading: downloadState.isDownloading,
        progress: downloadState.progress,
        currentSymbol: downloadState.currentSymbol,
        currentTimeframe: downloadState.currentTimeframe,
        errors: downloadState.errors,
      };
    }),
  
  /**
   * Get available data files
   */
  getAvailableData: protectedProcedure
    .query(() => {
      const dataPath = path.join(process.cwd(), "data", "candles");
      const collector = getMarketDataCollector({ outputDir: dataPath });
      
      const files = collector.getAvailableDataFiles();
      const summary = collector.getDataSummary();
      
      return {
        files: files.map(f => ({
          symbol: f.symbol,
          timeframe: f.timeframe,
          sizeKB: Math.round(f.size / 1024),
        })),
        summary: {
          totalFiles: summary.totalFiles,
          totalCandles: summary.totalCandles,
          symbols: summary.symbols,
          timeframes: summary.timeframes,
          dateRange: summary.dateRange,
        },
      };
    }),
  
  // =========================================================================
  // BACKTEST EXECUTION
  // =========================================================================
  
  /**
   * Run a backtest
   */
  runBacktest: protectedProcedure
    .input(runBacktestSchema)
    .mutation(async ({ input }) => {
      // Check if already running
      if (backtestState.isRunning) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Backtest já em execução",
        });
      }
      
      // Check if data exists
      const dataPath = path.join(process.cwd(), "data", "candles");
      const dataFile = path.join(dataPath, `${input.symbol}_M5.json`);
      
      if (!fs.existsSync(dataFile)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Dados históricos não encontrados para ${input.symbol}. Baixe os dados primeiro.`,
        });
      }
      
      // Reset state
      backtestState.isRunning = true;
      backtestState.progress = 0;
      backtestState.currentPhase = "initializing";
      backtestState.result = null;
      backtestState.error = null;
      
      try {
        // Build config
        const config: BacktestConfig = {
          symbol: input.symbol,
          strategy: input.strategy as BacktestStrategyType,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          initialBalance: input.initialBalance,
          leverage: input.leverage,
          commission: input.commission,
          slippage: input.slippage,
          spread: input.spread,
          dataPath,
          timeframes: ["M5", "M15", "H1"],
          riskPercent: input.riskPercent,
          maxPositions: input.maxPositions,
          maxSpread: input.maxSpread,
        };
        
        backtestState.currentPhase = "loading_data";
        backtestState.progress = 10;
        
        // Create runner
        const runner = new BacktestRunner(config);
        
        backtestState.currentPhase = "simulating";
        backtestState.progress = 30;
        
        // Run backtest
        const result = await runner.run();
        
        backtestState.currentPhase = "calculating_metrics";
        backtestState.progress = 90;
        
        // Store result
        backtestState.result = result;
        backtestState.isRunning = false;
        backtestState.progress = 100;
        backtestState.currentPhase = "completed";
        
        return {
          success: true,
          message: "Backtest concluído com sucesso!",
          metrics: {
            totalTrades: result.metrics.totalTrades,
            winningTrades: result.metrics.winningTrades,
            losingTrades: result.metrics.losingTrades,
            winRate: result.metrics.winRate,
            netProfit: result.metrics.netProfit,
            profitFactor: result.metrics.profitFactor,
            maxDrawdown: result.metrics.maxDrawdown,
            maxDrawdownPercent: result.metrics.maxDrawdownPercent,
            initialBalance: result.metrics.initialBalance,
            finalBalance: result.metrics.finalBalance,
            returnPercent: result.metrics.returnPercent,
            sharpeRatio: result.metrics.sharpeRatio,
            expectancy: result.metrics.expectancy,
          },
          executionTime: result.executionTime,
        };
        
      } catch (error) {
        backtestState.isRunning = false;
        backtestState.error = (error as Error).message;
        backtestState.currentPhase = "error";
        
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro no backtest: ${(error as Error).message}`,
        });
      }
    }),
  
  /**
   * Get backtest status
   */
  getBacktestStatus: protectedProcedure
    .query(() => {
      return {
        isRunning: backtestState.isRunning,
        progress: backtestState.progress,
        currentPhase: backtestState.currentPhase,
        error: backtestState.error,
      };
    }),
  
  /**
   * Get last backtest result
   */
  getLastResult: protectedProcedure
    .query(() => {
      if (!backtestState.result) {
        return null;
      }
      
      const result = backtestState.result;
      
      return {
        config: {
          symbol: result.config.symbol,
          strategy: result.config.strategy,
          startDate: result.config.startDate.toISOString(),
          endDate: result.config.endDate.toISOString(),
          initialBalance: result.config.initialBalance,
        },
        metrics: result.metrics,
        trades: result.trades.slice(-50), // Last 50 trades
        equityCurve: result.equityCurve.filter((_, i) => i % 10 === 0), // Sample every 10th point
        drawdownCurve: result.drawdownCurve.filter((_, i) => i % 10 === 0),
        executionTime: result.executionTime,
      };
    }),
  
  /**
   * Get detailed trade list
   */
  getTrades: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(10).max(100).default(20),
    }))
    .query(({ input }) => {
      if (!backtestState.result) {
        return {
          trades: [],
          total: 0,
          page: input.page,
          pageSize: input.pageSize,
          totalPages: 0,
        };
      }
      
      const trades = backtestState.result.trades;
      const total = trades.length;
      const totalPages = Math.ceil(total / input.pageSize);
      const start = (input.page - 1) * input.pageSize;
      const end = start + input.pageSize;
      
      return {
        trades: trades.slice(start, end),
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages,
      };
    }),
  
  // =========================================================================
  // UTILITIES
  // =========================================================================
  
  /**
   * Get available symbols for backtest
   */
  getAvailableSymbols: protectedProcedure
    .query(() => {
      return {
        symbols: [
          { value: "EURUSD", label: "EUR/USD" },
          { value: "GBPUSD", label: "GBP/USD" },
          { value: "USDJPY", label: "USD/JPY" },
          { value: "XAUUSD", label: "XAU/USD (Ouro)" },
          { value: "AUDUSD", label: "AUD/USD" },
          { value: "USDCAD", label: "USD/CAD" },
          { value: "NZDUSD", label: "NZD/USD" },
          { value: "USDCHF", label: "USD/CHF" },
        ],
      };
    }),
  
  /**
   * Get available strategies
   */
  getAvailableStrategies: protectedProcedure
    .query(() => {
      return {
        strategies: [
          { value: "SMC", label: "SMC (Smart Money Concepts)", description: "Estratégia baseada em estrutura de mercado, Order Blocks e Liquidity Sweeps" },
          { value: "HYBRID", label: "Híbrida (SMC + RSI)", description: "Combina SMC com indicadores RSI e VWAP" },
          { value: "RSI_VWAP", label: "RSI + VWAP", description: "Estratégia baseada em RSI sobrevendido/sobrecomprado com confirmação VWAP" },
        ],
      };
    }),
  
  /**
   * Clear backtest results
   */
  clearResults: protectedProcedure
    .mutation(() => {
      backtestState.result = null;
      backtestState.error = null;
      backtestState.currentPhase = "idle";
      backtestState.progress = 0;
      
      return { success: true };
    }),

  // =========================================================================
  // OPTIMIZATION
  // =========================================================================

  /**
   * Run parameter optimization
   */
  runOptimization: protectedProcedure
    .input(z.object({
      symbol: z.string().min(1),
      startDate: z.string(),
      endDate: z.string(),
      initialBalance: z.number().min(100).default(10000),
      leverage: z.number().min(1).default(500),
      strategies: z.array(z.enum(["SMC", "HYBRID", "RSI_VWAP"])).min(1),
      riskMin: z.number().min(0.5).max(10).default(1),
      riskMax: z.number().min(0.5).max(10).default(5),
      riskStep: z.number().min(0.5).max(2).default(1),
      maxPositionsMin: z.number().min(1).max(10).optional(),
      maxPositionsMax: z.number().min(1).max(10).optional(),
      maxPositionsStep: z.number().min(1).max(5).optional(),
    }))
    .mutation(async ({ input }) => {
      // Check if already running
      if (optimizationState.isRunning) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Otimização já em execução",
        });
      }

      // Check if data exists
      const dataPath = path.join(process.cwd(), "data", "candles");
      const dataFile = path.join(dataPath, `${input.symbol}_M5.json`);

      if (!fs.existsSync(dataFile)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Dados históricos não encontrados para ${input.symbol}. Baixe os dados primeiro.`,
        });
      }

      // Reset state
      optimizationState.isRunning = true;
      optimizationState.progress = null;
      optimizationState.result = null;
      optimizationState.error = null;

      try {
        // Build optimization config
        const config: OptimizationConfig = {
          symbol: input.symbol,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          dataPath,
          initialBalance: input.initialBalance,
          leverage: input.leverage,
          commission: 7,
          slippage: 0.5,
          spread: 1,
          maxSpread: 3,
          strategies: input.strategies as BacktestStrategyType[],
          riskRange: {
            min: input.riskMin,
            max: input.riskMax,
            step: input.riskStep,
          },
          maxPositionsRange: input.maxPositionsMin && input.maxPositionsMax ? {
            min: input.maxPositionsMin,
            max: input.maxPositionsMax,
            step: input.maxPositionsStep || 1,
          } : undefined,
        };

        // Create optimizer
        activeOptimizer = new BacktestOptimizer(config);

        // Set progress callback
        activeOptimizer.setProgressCallback((progress) => {
          optimizationState.progress = progress;
        });

        // Run optimization
        const result = await activeOptimizer.run();

        // Store result
        optimizationState.result = result;
        optimizationState.isRunning = false;
        activeOptimizer = null;

        return {
          success: true,
          message: `Otimização concluída! ${result.completedCombinations} combinações testadas.`,
          totalCombinations: result.totalCombinations,
          completedCombinations: result.completedCombinations,
          executionTime: result.executionTime,
          bestResult: result.bestResult,
        };

      } catch (error) {
        optimizationState.isRunning = false;
        optimizationState.error = (error as Error).message;
        activeOptimizer = null;

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro na otimização: ${(error as Error).message}`,
        });
      }
    }),

  /**
   * Get optimization status
   */
  getOptimizationStatus: protectedProcedure
    .query(() => {
      return {
        isRunning: optimizationState.isRunning,
        progress: optimizationState.progress,
        error: optimizationState.error,
      };
    }),

  /**
   * Get optimization results
   */
  getOptimizationResults: protectedProcedure
    .query(() => {
      if (!optimizationState.result) {
        return null;
      }

      return {
        results: optimizationState.result.results,
        totalCombinations: optimizationState.result.totalCombinations,
        completedCombinations: optimizationState.result.completedCombinations,
        executionTime: optimizationState.result.executionTime,
        bestResult: optimizationState.result.bestResult,
        worstResult: optimizationState.result.worstResult,
      };
    }),

  /**
   * Abort running optimization
   */
  abortOptimization: protectedProcedure
    .mutation(() => {
      if (activeOptimizer) {
        activeOptimizer.abort();
        optimizationState.isRunning = false;
        activeOptimizer = null;
        return { success: true, message: "Otimização abortada" };
      }
      return { success: false, message: "Nenhuma otimização em execução" };
    }),

  /**
   * Clear optimization results
   */
  clearOptimizationResults: protectedProcedure
    .mutation(() => {
      optimizationState.result = null;
      optimizationState.error = null;
      optimizationState.progress = null;
      return { success: true };
    }),
});
