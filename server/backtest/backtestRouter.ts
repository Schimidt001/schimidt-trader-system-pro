/**
 * Backtest Router - Endpoints tRPC para Backtesting
 * 
 * Expõe endpoints para:
 * - Download de dados históricos
 * - Execução de backtests
 * - Consulta de resultados
 * - Status de progresso
 * - Otimização em lotes (Batch Optimization)
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 2.1.0
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import * as path from "path";
import * as fs from "fs";
import { getMarketDataCollector } from "./collectors/MarketDataCollector";
import { getLabMarketDataCollector } from "./collectors/LabMarketDataCollector";
import { BacktestRunner, DEFAULT_BACKTEST_CONFIG } from "./runners/BacktestRunner";
import { LabBacktestRunner } from "./runners/LabBacktestRunner";
import { BacktestOptimizer, OptimizationConfig, OptimizationResult, OptimizationProgress } from "./runners/BacktestOptimizer";
import { BatchOptimizer, createBatchOptimizer, DEFAULT_BATCH_OPTIMIZATION_CONFIG } from "./runners/BatchOptimizer";
import { BacktestConfig, BacktestStrategyType, BacktestResult } from "./types/backtest.types";
import { 
  BatchOptimizationConfig, 
  BatchOptimizationResult, 
  BatchOptimizationProgress,
  ParameterRange,
  SMC_PARAMETER_DEFINITIONS,
  RANKING_CATEGORY_LABELS,
  RankingCategory,
} from "./types/batchOptimizer.types";
// CORREÇÃO TAREFA 4: Removida importação de ctraderAdapter do top-level
// Usar lazy import para evitar que o módulo seja carregado no contexto do LAB
import { labLogger } from "./utils/LabLogger";
import { labGuard } from "./utils/LabGuard";

/**
 * Obtém o ctraderAdapter de forma lazy para evitar import no top-level
 * IMPORTANTE: Este import só deve ser feito quando realmente necessário
 * para evitar que o módulo seja carregado no contexto do LAB
 */
function getCTraderAdapter() {
  // Import dinâmico para evitar carregar no contexto do LAB
  const { ctraderAdapter } = require("../adapters/CTraderAdapter");
  return ctraderAdapter;
}

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

// Store optimization state (legacy)
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

// Active optimizer instance (for abort) - legacy
let activeOptimizer: BacktestOptimizer | null = null;

// ============================================================================
// BATCH OPTIMIZATION STATE (NEW)
// ============================================================================

interface BatchOptimizationState {
  isRunning: boolean;
  progress: BatchOptimizationProgress | null;
  result: BatchOptimizationResult | null;
  error: string | null;
}

const batchOptimizationState: BatchOptimizationState = {
  isRunning: false,
  progress: null,
  result: null,
  error: null,
};

// Active batch optimizer instance
let activeBatchOptimizer: BatchOptimizer | null = null;

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
  symbols: z.array(z.string()).min(1).default(["XAUUSD"]),
  // Timeframes obrigatórios para estratégia SMC: M5 (execução), M15 (confirmação), H1 (contexto)
  timeframes: z.array(z.string()).min(1).default(["M5", "M15", "H1"]),
  monthsBack: z.number().min(1).max(24).default(6),
});

// Schema para parâmetro de otimização
const parameterRangeSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(["number", "boolean", "select"]),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  options: z.array(z.union([z.string(), z.number()])).optional(),
  values: z.array(z.union([z.number(), z.string(), z.boolean()])).optional(),
  enabled: z.boolean(),
  defaultValue: z.union([z.number(), z.string(), z.boolean()]),
  category: z.enum(["structure", "sweep", "choch", "orderBlock", "entry", "risk", "session", "trailing", "spread"]),
  description: z.string().optional(),
});

// Schema para batch optimization
const batchOptimizationSchema = z.object({
  symbol: z.string().min(1),
  startDate: z.string(),
  endDate: z.string(),
  initialBalance: z.number().min(100).default(10000),
  leverage: z.number().min(1).default(500),
  commission: z.number().min(0).default(7),
  slippage: z.number().min(0).default(0.5),
  spread: z.number().min(0).default(1),
  strategies: z.array(z.enum(["SMC", "HYBRID", "RSI_VWAP"])).min(1),
  parameterRanges: z.array(parameterRangeSchema),
  batchSize: z.number().min(10).max(200).default(50),
  topResultsToKeep: z.number().min(3).max(20).default(5),
  rankingCategories: z.array(z.enum(["profitability", "recoveryFactor", "minDrawdown", "winRate"])).default(["profitability", "recoveryFactor", "minDrawdown", "winRate"]),
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
   * CORREÇÃO: Agora utiliza o getMarketDataCollector (Online) ou lança erro se offline
   * Para uso em contexto Lab, os dados já devem estar baixados.
   */
  downloadData: protectedProcedure
    .input(downloadDataSchema)
    .mutation(async ({ input }) => {
      // GUARD RAIL: Bloqueio TOTAL em modo Lab
      // Em modo Lab, não permitimos conexão com broker para download.
      // Os dados devem ser importados manualmente ou estar presentes no disco.
      if (labGuard.isLabMode()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Lab cannot connect to broker. Data must be local.",
          cause: { code: "LAB_OFFLINE_MODE_STRICT" }
        });
      }

      // Check if already downloading
      if (downloadState.isDownloading) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Download já em andamento",
        });
      }
      
      // LAZY IMPORT: Só carrega o adapter se for conectar
      // Se estiver em modo Lab/Offline, isso pode falhar propositalmente ou ser ignorado
      let ctraderAdapter;
      try {
        ctraderAdapter = getCTraderAdapter();
        if (!ctraderAdapter.isConnected()) {
           throw new Error("cTrader não conectado");
        }
      } catch (e) {
         throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Falha ao conectar com cTrader para download. Verifique se o ambiente Live está ativo.",
          cause: e
        });
      }
      
      // Reset state
      downloadState.isDownloading = true;
      downloadState.progress = 0;
      downloadState.errors = [];
      
      try {
        const dataPath = path.join(process.cwd(), "data", "candles");
        
        // Usar o coletor ONLINE para baixar
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
   * CORREÇÃO: Usa LabMarketDataCollector para ler apenas arquivos locais (Offline Safe)
   */
  getAvailableData: protectedProcedure
    .query(() => {
      // Usar coletor OFFLINE para listar arquivos
      const collector = getLabMarketDataCollector();
      const summary = collector.getDataSummary();
      const files = collector.getAvailableDataFiles();
      
      return {
        files: files.map(f => ({
          symbol: f.symbol,
          timeframe: f.timeframe,
          sizeKB: Math.round(f.size / 1024),
        })),
        summary: {
          totalFiles: summary.totalFiles,
          totalCandles: 0, // Simplificação, LabCollector pode não ler tudo agora para ser rápido
          symbols: summary.symbols,
          timeframes: summary.timeframes,
          dateRange: null, // Pode ser implementado se necessário
        },
      };
    }),
  
  // =========================================================================
  // BACKTEST EXECUTION
  // =========================================================================
  
  /**
   * Run a backtest
   * CORREÇÃO: Usa LabBacktestRunner para garantir isolamento e leitura local
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
      
      // Check if data exists locally using LabCollector
      const labCollector = getLabMarketDataCollector();
      const availability = labCollector.checkDataAvailability([input.symbol], ["M5", "M15", "H1"]);
      
      if (!availability.available) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Dados históricos ausentes para: ${availability.missing.join(", ")}. Por favor, realize o download primeiro.`,
          cause: { code: "LAB_DATA_NOT_FOUND", missing: availability.missing }
        });
      }
      
      // Reset state
      backtestState.isRunning = true;
      backtestState.progress = 0;
      backtestState.currentPhase = "initializing";
      backtestState.result = null;
      backtestState.error = null;
      
      try {
        const dataPath = path.join(process.cwd(), "data", "candles");

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
        
        // CORREÇÃO: Usar LabBacktestRunner (Offline)
        const runner = new LabBacktestRunner(config);
        
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
      try {
        return {
          isRunning: backtestState.isRunning,
          progress: backtestState.progress,
          currentPhase: backtestState.currentPhase,
          error: backtestState.error,
        };
      } catch (error) {
        return {
          isRunning: false,
          progress: 0,
          currentPhase: "error",
          error: error instanceof Error ? error.message : "Unknown Status Error",
        };
      }
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
  // LEGACY OPTIMIZATION (mantido para compatibilidade)
  // =========================================================================

  /**
   * Run parameter optimization (legacy)
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

      // Check if data exists using LabCollector (Offline check)
      const labCollector = getLabMarketDataCollector();
      const availability = labCollector.checkDataAvailability([input.symbol], ["M5"]); // M5 is base for optimization

      if (!availability.available) {
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
        const dataPath = path.join(process.cwd(), "data", "candles");

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
   * Get optimization status (legacy)
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
   * Get optimization results (legacy)
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
   * Abort running optimization (legacy)
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
   * Clear optimization results (legacy)
   */
  clearOptimizationResults: protectedProcedure
    .mutation(() => {
      optimizationState.result = null;
      optimizationState.error = null;
      optimizationState.progress = null;
      return { success: true };
    }),

  // =========================================================================
  // BATCH OPTIMIZATION (NEW - Laboratório Avançado)
  // =========================================================================

  /**
   * Get available parameters for optimization
   */
  getOptimizableParameters: protectedProcedure
    .query(() => {
      return {
        parameters: SMC_PARAMETER_DEFINITIONS,
        categories: Object.entries(RANKING_CATEGORY_LABELS).map(([key, value]) => ({
          value: key,
          label: value.label,
          icon: value.icon,
          description: value.description,
        })),
      };
    }),

  /**
   * Run batch optimization
   */
  runBatchOptimization: protectedProcedure
    .input(batchOptimizationSchema)
    .mutation(async ({ input }) => {
      // Check if already running
      if (batchOptimizationState.isRunning) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Otimização em lotes já em execução",
        });
      }

      // Check if data exists using LabCollector
      const labCollector = getLabMarketDataCollector();
      const availability = labCollector.checkDataAvailability([input.symbol], ["M5"]);

      if (!availability.available) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Dados históricos não encontrados para ${input.symbol}. Baixe os dados primeiro.`,
        });
      }

      // Reset state
      batchOptimizationState.isRunning = true;
      batchOptimizationState.progress = null;
      batchOptimizationState.result = null;
      batchOptimizationState.error = null;

      try {
        const dataPath = path.join(process.cwd(), "data", "candles");

        // Build batch optimization config
        const config: BatchOptimizationConfig = {
          symbol: input.symbol,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          dataPath,
          initialBalance: input.initialBalance,
          leverage: input.leverage,
          commission: input.commission,
          slippage: input.slippage,
          spread: input.spread,
          strategies: input.strategies as BacktestStrategyType[],
          parameterRanges: input.parameterRanges as ParameterRange[],
          batchSize: input.batchSize,
          topResultsToKeep: input.topResultsToKeep,
          rankingCategories: input.rankingCategories as RankingCategory[],
        };

        // Create batch optimizer
        activeBatchOptimizer = createBatchOptimizer(config);

        // Set progress callback
        activeBatchOptimizer.setProgressCallback((progress) => {
          batchOptimizationState.progress = progress;
        });

        // Run batch optimization
        const result = await activeBatchOptimizer.run();

        // Store result
        batchOptimizationState.result = result;
        batchOptimizationState.isRunning = false;
        activeBatchOptimizer = null;

        return {
          success: true,
          message: `Otimização em lotes concluída! ${result.completedCombinations} combinações testadas em ${result.totalBatches} lotes.`,
          totalCombinations: result.totalCombinations,
          completedCombinations: result.completedCombinations,
          totalBatches: result.totalBatches,
          executionTime: result.executionTime,
          overallBest: result.overallBest,
          aborted: result.aborted,
        };

      } catch (error) {
        batchOptimizationState.isRunning = false;
        batchOptimizationState.error = (error as Error).message;
        activeBatchOptimizer = null;

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro na otimização em lotes: ${(error as Error).message}`,
        });
      }
    }),

  /**
   * Get batch optimization status
   */
  getBatchOptimizationStatus: protectedProcedure
    .query(() => {
      return {
        isRunning: batchOptimizationState.isRunning,
        progress: batchOptimizationState.progress,
        error: batchOptimizationState.error,
      };
    }),

  /**
   * Get batch optimization results
   */
  getBatchOptimizationResults: protectedProcedure
    .query(() => {
      if (!batchOptimizationState.result) {
        return null;
      }

      const result = batchOptimizationState.result;

      return {
        rankings: result.rankings,
        overallBest: result.overallBest,
        totalCombinations: result.totalCombinations,
        completedCombinations: result.completedCombinations,
        totalBatches: result.totalBatches,
        executionTime: result.executionTime,
        aborted: result.aborted,
        errors: result.errors,
      };
    }),

  /**
   * Abort running batch optimization
   */
  abortBatchOptimization: protectedProcedure
    .mutation(() => {
      if (activeBatchOptimizer) {
        activeBatchOptimizer.abort();
        batchOptimizationState.isRunning = false;
        activeBatchOptimizer = null;
        return { success: true, message: "Otimização em lotes abortada" };
      }
      return { success: false, message: "Nenhuma otimização em lotes em execução" };
    }),

  /**
   * Clear batch optimization results
   */
  clearBatchOptimizationResults: protectedProcedure
    .mutation(() => {
      batchOptimizationState.result = null;
      batchOptimizationState.error = null;
      batchOptimizationState.progress = null;
      return { success: true };
    }),
});
