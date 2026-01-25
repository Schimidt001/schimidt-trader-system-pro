/**
 * Backtest Router Refatorado - Endpoints tRPC para Backtesting
 * 
 * CORREÇÕES APLICADAS:
 * 1. Persistência Real de Estado (via OptimizationJobQueuePersistent)
 * 2. Remoção de Estado Global (via IsolatedStateManager)
 * 3. Correção do downloadData (via EnvironmentContext)
 * 4. Eliminação do Singleton ctraderAdapter (via AdapterFactory)
 * 5. Padronização de Respostas TRPC (via TrpcErrorHandler)
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 3.0.0 - Refactored
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import * as path from "path";
import * as fs from "fs";

// Importar coletores de dados
import { getMarketDataCollector } from "./collectors/MarketDataCollector";
import { getLabMarketDataCollector } from "./collectors/LabMarketDataCollector";

// Importar runners
import { LabBacktestRunner } from "./runners/LabBacktestRunner";
import { BacktestOptimizer, OptimizationConfig as LegacyOptimizationConfig, OptimizationResult, OptimizationProgress as LegacyOptimizationProgress } from "./runners/BacktestOptimizer";
import { BatchOptimizer, createBatchOptimizer, DEFAULT_BATCH_OPTIMIZATION_CONFIG } from "./runners/BatchOptimizer";

// Importar tipos
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

// CORREÇÃO #1, #2, #3, #4, #5: Importar novos módulos de correção
import { isolatedStateManager, BacktestState, DownloadState, OptimizationState, BatchOptimizationState } from "./utils/IsolatedStateManager";
import { environmentContext, canDownloadDataInCurrentContext } from "./utils/EnvironmentContext";
import { adapterFactory, getLiveAdapter } from "../adapters/AdapterFactory";
import { labLogger } from "./utils/LabLogger";
import { labGuard } from "./utils/LabGuard";
import { 
  safeQueryHandler, 
  safeMutationHandler, 
  createSafeStatusHandler,
  assertPrecondition,
  logTrpcError,
  logTrpcSuccess,
  ErrorCodes,
} from "./utils/TrpcErrorHandler";

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
  timeframes: z.array(z.string()).min(1).default(["M5", "M15", "H1"]),
  monthsBack: z.number().min(1).max(24).default(6),
});

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
// ACTIVE INSTANCES (isoladas por runId)
// ============================================================================

// Map de optimizers ativos por runId
const activeOptimizers: Map<string, BacktestOptimizer> = new Map();
const activeBatchOptimizers: Map<string, BatchOptimizer> = new Map();

// ============================================================================
// ROUTER
// ============================================================================

export const backtestRouterRefactored = router({
  // =========================================================================
  // DATA MANAGEMENT
  // =========================================================================
  
  /**
   * Download historical data from cTrader
   * 
   * CORREÇÃO #3: Respeita contexto Lab/Live corretamente
   * CORREÇÃO #4: Usa AdapterFactory em vez de singleton
   * CORREÇÃO #5: Tratamento de erro padronizado
   */
  downloadData: protectedProcedure
    .input(downloadDataSchema)
    .mutation(async ({ input }) => {
      return safeMutationHandler(async () => {
        // CORREÇÃO #3: Verificar permissão de download no contexto atual
        const downloadPermission = canDownloadDataInCurrentContext();
        
        if (!downloadPermission.allowed) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: downloadPermission.reason || "Download não permitido no contexto atual",
            cause: { code: ErrorCodes.LAB_ISOLATION_VIOLATION }
          });
        }

        labLogger.info(`[downloadData] Iniciando download. Contexto: ${environmentContext.getContext()}`, "BacktestRouter");

        // CORREÇÃO #2: Verificar se já há download em execução usando IsolatedStateManager
        if (isolatedStateManager.hasRunningDownload()) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Download já em andamento",
            cause: { code: ErrorCodes.ALREADY_RUNNING }
          });
        }
        
        // CORREÇÃO #4: Usar AdapterFactory para obter adapter
        let adapter;
        try {
          adapter = getLiveAdapter();
          if (!adapter.isConnected()) {
            throw new Error("cTrader não conectado");
          }
        } catch (e) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Falha ao conectar com cTrader para download. Verifique se o ambiente Live está ativo.",
            cause: { code: ErrorCodes.BROKER_NOT_CONNECTED, originalError: e }
          });
        }
        
        // CORREÇÃO #2: Criar estado isolado para este download
        const downloadState = isolatedStateManager.createDownloadState();
        const runId = downloadState.runId;
        
        isolatedStateManager.updateDownloadState(runId, {
          isDownloading: true,
          progress: 0,
          errors: [],
        });
        
        try {
          const dataPath = path.join(process.cwd(), "data", "candles");
          
          const collector = getMarketDataCollector({
            symbols: input.symbols,
            timeframes: input.timeframes,
            monthsBack: input.monthsBack,
            outputDir: dataPath,
          });
          
          collector.setProgressCallback((progress) => {
            isolatedStateManager.updateDownloadState(runId, {
              progress: progress.totalProgress,
              currentSymbol: progress.currentSymbol,
              currentTimeframe: progress.currentTimeframe,
              errors: progress.errors,
            });
          });
          
          const result = await collector.downloadAll();
          
          isolatedStateManager.updateDownloadState(runId, {
            isDownloading: false,
            progress: 100,
          });
          
          logTrpcSuccess("downloadData", { filesCreated: result.filesCreated.length });
          
          return {
            success: result.success,
            runId,
            filesCreated: result.filesCreated.length,
            errors: result.errors,
            message: result.success
              ? `Download concluído! ${result.filesCreated.length} arquivos criados.`
              : `Download concluído com erros: ${result.errors.join(", ")}`,
          };
          
        } catch (error) {
          isolatedStateManager.updateDownloadState(runId, {
            isDownloading: false,
            errors: [(error as Error).message],
          });
          
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Erro no download: ${(error as Error).message}`,
          });
        }
      }, "downloadData");
    }),
  
  /**
   * Get download progress
   * 
   * CORREÇÃO #2: Usa IsolatedStateManager
   * CORREÇÃO #5: Tratamento de erro padronizado
   */
  getDownloadStatus: protectedProcedure
    .input(z.object({ runId: z.string().optional() }).optional())
    .query(({ input }) => {
      return safeQueryHandler(
        () => {
          // Se runId específico, buscar esse estado
          if (input?.runId) {
            const state = isolatedStateManager.getDownloadState(input.runId);
            if (state) {
              return {
                isDownloading: state.isDownloading,
                progress: state.progress,
                currentSymbol: state.currentSymbol,
                currentTimeframe: state.currentTimeframe,
                errors: state.errors,
                runId: state.runId,
              };
            }
          }
          
          // Buscar download em execução mais recente
          const runningDownload = isolatedStateManager.getRunningDownload();
          if (runningDownload) {
            return {
              isDownloading: runningDownload.isDownloading,
              progress: runningDownload.progress,
              currentSymbol: runningDownload.currentSymbol,
              currentTimeframe: runningDownload.currentTimeframe,
              errors: runningDownload.errors,
              runId: runningDownload.runId,
            };
          }
          
          // Nenhum download ativo
          return {
            isDownloading: false,
            progress: 0,
            currentSymbol: "",
            currentTimeframe: "",
            errors: [],
            runId: null,
          };
        },
        // Fallback em caso de erro
        {
          isDownloading: false,
          progress: 0,
          currentSymbol: "",
          currentTimeframe: "",
          errors: [],
          runId: null,
        },
        { context: "getDownloadStatus" }
      );
    }),
  
  /**
   * Get available data files
   * 
   * CORREÇÃO #5: Tratamento de erro padronizado
   */
  getAvailableData: protectedProcedure
    .query(() => {
      return safeQueryHandler(
        () => {
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
              totalCandles: 0,
              symbols: summary.symbols,
              timeframes: summary.timeframes,
              dateRange: null,
            },
          };
        },
        // Fallback
        {
          files: [],
          summary: {
            totalFiles: 0,
            totalCandles: 0,
            symbols: [],
            timeframes: [],
            dateRange: null,
          },
        },
        { context: "getAvailableData" }
      );
    }),
  
  // =========================================================================
  // BACKTEST EXECUTION
  // =========================================================================
  
  /**
   * Run a backtest
   * 
   * CORREÇÃO #2: Usa IsolatedStateManager
   * CORREÇÃO #5: Tratamento de erro padronizado
   */
  runBacktest: protectedProcedure
    .input(runBacktestSchema)
    .mutation(async ({ input }) => {
      return safeMutationHandler(async () => {
        // CORREÇÃO #2: Verificar usando IsolatedStateManager
        if (isolatedStateManager.hasRunningBacktest()) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Backtest já em execução",
            cause: { code: ErrorCodes.ALREADY_RUNNING }
          });
        }
        
        // Verificar dados locais
        const labCollector = getLabMarketDataCollector();
        const availability = labCollector.checkDataAvailability([input.symbol], ["M5", "M15", "H1"]);
        
        if (!availability.available) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Dados históricos ausentes para: ${availability.missing.join(", ")}. Por favor, realize o download primeiro.`,
            cause: { code: ErrorCodes.DATA_NOT_FOUND, missing: availability.missing }
          });
        }
        
        // CORREÇÃO #2: Criar estado isolado
        const backtestState = isolatedStateManager.createBacktestState();
        const runId = backtestState.runId;
        
        isolatedStateManager.updateBacktestState(runId, {
          isRunning: true,
          progress: 0,
          currentPhase: "initializing",
          result: null,
          error: null,
        });
        
        try {
          const dataPath = path.join(process.cwd(), "data", "candles");

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
          
          isolatedStateManager.updateBacktestState(runId, {
            currentPhase: "loading_data",
            progress: 10,
          });
          
          const runner = new LabBacktestRunner(config);
          
          isolatedStateManager.updateBacktestState(runId, {
            currentPhase: "simulating",
            progress: 30,
          });
          
          const result = await runner.run();
          
          isolatedStateManager.updateBacktestState(runId, {
            currentPhase: "calculating_metrics",
            progress: 90,
          });
          
          isolatedStateManager.updateBacktestState(runId, {
            result: result,
            isRunning: false,
            progress: 100,
            currentPhase: "completed",
          });
          
          logTrpcSuccess("runBacktest", { totalTrades: result.metrics.totalTrades });
          
          return {
            success: true,
            runId,
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
          isolatedStateManager.updateBacktestState(runId, {
            isRunning: false,
            error: (error as Error).message,
            currentPhase: "error",
          });
          
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Erro no backtest: ${(error as Error).message}`,
          });
        }
      }, "runBacktest");
    }),
  
  /**
   * Get backtest status
   * 
   * CORREÇÃO #2: Usa IsolatedStateManager
   * CORREÇÃO #5: Tratamento de erro padronizado
   */
  getBacktestStatus: protectedProcedure
    .input(z.object({ runId: z.string().optional() }).optional())
    .query(({ input }) => {
      return safeQueryHandler(
        () => {
          if (input?.runId) {
            const state = isolatedStateManager.getBacktestState(input.runId);
            if (state) {
              return {
                isRunning: state.isRunning,
                progress: state.progress,
                currentPhase: state.currentPhase,
                error: state.error,
                runId: state.runId,
              };
            }
            // RunId não encontrado
            return {
              isRunning: false,
              progress: 0,
              currentPhase: "not_found",
              error: "Job not found",
              runId: input.runId,
            };
          }
          
          const runningBacktest = isolatedStateManager.getRunningBacktest();
          if (runningBacktest) {
            return {
              isRunning: runningBacktest.isRunning,
              progress: runningBacktest.progress,
              currentPhase: runningBacktest.currentPhase,
              error: runningBacktest.error,
              runId: runningBacktest.runId,
            };
          }
          
          return {
            isRunning: false,
            progress: 0,
            currentPhase: "idle",
            error: null,
            runId: null,
          };
        },
        {
          isRunning: false,
          progress: 0,
          currentPhase: "error",
          error: "Status check failed",
          runId: null,
        },
        { context: "getBacktestStatus" }
      );
    }),
  
  /**
   * Get last backtest result
   * 
   * CORREÇÃO #2: Usa IsolatedStateManager
   * CORREÇÃO #5: Tratamento de erro padronizado
   */
  getLastResult: protectedProcedure
    .input(z.object({ runId: z.string().optional() }).optional())
    .query(({ input }) => {
      return safeQueryHandler(
        () => {
          let state: BacktestState | null = null;
          
          if (input?.runId) {
            state = isolatedStateManager.getBacktestState(input.runId);
          } else {
            state = isolatedStateManager.getLastBacktestResult();
          }
          
          if (!state?.result) {
            return null;
          }
          
          const result = state.result;
          
          return {
            runId: state.runId,
            config: {
              symbol: result.config.symbol,
              strategy: result.config.strategy,
              startDate: result.config.startDate.toISOString(),
              endDate: result.config.endDate.toISOString(),
              initialBalance: result.config.initialBalance,
            },
            metrics: result.metrics,
            trades: result.trades.slice(-50),
            equityCurve: result.equityCurve.filter((_, i) => i % 10 === 0),
            drawdownCurve: result.drawdownCurve.filter((_, i) => i % 10 === 0),
            executionTime: result.executionTime,
          };
        },
        null,
        { context: "getLastResult" }
      );
    }),
  
  /**
   * Get detailed trade list
   * 
   * CORREÇÃO #5: Tratamento de erro padronizado
   */
  getTrades: protectedProcedure
    .input(z.object({
      runId: z.string().optional(),
      page: z.number().min(1).default(1),
      pageSize: z.number().min(10).max(100).default(20),
    }))
    .query(({ input }) => {
      return safeQueryHandler(
        () => {
          let state: BacktestState | null = null;
          
          if (input.runId) {
            state = isolatedStateManager.getBacktestState(input.runId);
          } else {
            state = isolatedStateManager.getLastBacktestResult();
          }
          
          if (!state?.result) {
            return {
              trades: [],
              total: 0,
              page: input.page,
              pageSize: input.pageSize,
              totalPages: 0,
            };
          }
          
          const trades = state.result.trades;
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
        },
        {
          trades: [],
          total: 0,
          page: input.page,
          pageSize: input.pageSize,
          totalPages: 0,
        },
        { context: "getTrades" }
      );
    }),
  
  // =========================================================================
  // UTILITIES
  // =========================================================================
  
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
   * 
   * CORREÇÃO #2: Usa IsolatedStateManager
   */
  clearResults: protectedProcedure
    .input(z.object({ runId: z.string().optional() }).optional())
    .mutation(({ input }) => {
      if (input?.runId) {
        isolatedStateManager.removeBacktestState(input.runId);
      }
      return { success: true };
    }),

  // =========================================================================
  // BATCH OPTIMIZATION
  // =========================================================================

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
   * 
   * CORREÇÃO #2: Usa IsolatedStateManager
   * CORREÇÃO #5: Tratamento de erro padronizado
   */
  runBatchOptimization: protectedProcedure
    .input(batchOptimizationSchema)
    .mutation(async ({ input }) => {
      return safeMutationHandler(async () => {
        if (isolatedStateManager.hasRunningBatchOptimization()) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Otimização em lotes já em execução",
            cause: { code: ErrorCodes.ALREADY_RUNNING }
          });
        }

        const labCollector = getLabMarketDataCollector();
        const availability = labCollector.checkDataAvailability([input.symbol], ["M5"]);

        if (!availability.available) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Dados históricos não encontrados para ${input.symbol}. Baixe os dados primeiro.`,
            cause: { code: ErrorCodes.DATA_NOT_FOUND }
          });
        }

        // CORREÇÃO #2: Criar estado isolado
        const batchState = isolatedStateManager.createBatchOptimizationState();
        const runId = batchState.runId;

        isolatedStateManager.updateBatchOptimizationState(runId, {
          isRunning: true,
          progress: null,
          result: null,
          error: null,
        });

        try {
          const dataPath = path.join(process.cwd(), "data", "candles");

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

          const optimizer = createBatchOptimizer(config);
          activeBatchOptimizers.set(runId, optimizer);

          optimizer.setProgressCallback((progress) => {
            isolatedStateManager.updateBatchOptimizationState(runId, {
              progress: progress,
            });
          });

          const result = await optimizer.run();

          isolatedStateManager.updateBatchOptimizationState(runId, {
            result: result,
            isRunning: false,
          });
          
          activeBatchOptimizers.delete(runId);

          logTrpcSuccess("runBatchOptimization", { 
            completedCombinations: result.completedCombinations 
          });

          return {
            success: true,
            runId,
            message: `Otimização em lotes concluída! ${result.completedCombinations} combinações testadas em ${result.totalBatches} lotes.`,
            totalCombinations: result.totalCombinations,
            completedCombinations: result.completedCombinations,
            totalBatches: result.totalBatches,
            executionTime: result.executionTime,
            overallBest: result.overallBest,
            aborted: result.aborted,
          };

        } catch (error) {
          isolatedStateManager.updateBatchOptimizationState(runId, {
            isRunning: false,
            error: (error as Error).message,
          });
          
          activeBatchOptimizers.delete(runId);

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Erro na otimização em lotes: ${(error as Error).message}`,
          });
        }
      }, "runBatchOptimization");
    }),

  /**
   * Get batch optimization status
   * 
   * CORREÇÃO #2: Usa IsolatedStateManager
   * CORREÇÃO #5: Tratamento de erro padronizado
   */
  getBatchOptimizationStatus: protectedProcedure
    .input(z.object({ runId: z.string().optional() }).optional())
    .query(({ input }) => {
      return safeQueryHandler(
        () => {
          if (input?.runId) {
            const state = isolatedStateManager.getBatchOptimizationState(input.runId);
            if (state) {
              return {
                isRunning: state.isRunning,
                progress: state.progress,
                error: state.error,
                runId: state.runId,
              };
            }
          }
          
          const runningBatch = isolatedStateManager.getRunningBatchOptimization();
          if (runningBatch) {
            return {
              isRunning: runningBatch.isRunning,
              progress: runningBatch.progress,
              error: runningBatch.error,
              runId: runningBatch.runId,
            };
          }
          
          return {
            isRunning: false,
            progress: null,
            error: null,
            runId: null,
          };
        },
        {
          isRunning: false,
          progress: null,
          error: null,
          runId: null,
        },
        { context: "getBatchOptimizationStatus" }
      );
    }),

  /**
   * Get batch optimization results
   * 
   * CORREÇÃO #2: Usa IsolatedStateManager
   * CORREÇÃO #5: Tratamento de erro padronizado
   */
  getBatchOptimizationResults: protectedProcedure
    .input(z.object({ runId: z.string().optional() }).optional())
    .query(({ input }) => {
      return safeQueryHandler(
        () => {
          let state: BatchOptimizationState | null = null;
          
          if (input?.runId) {
            state = isolatedStateManager.getBatchOptimizationState(input.runId);
          } else {
            state = isolatedStateManager.getLastBatchOptimizationResult();
          }
          
          if (!state?.result) {
            return null;
          }

          const result = state.result;

          return {
            runId: state.runId,
            rankings: result.rankings,
            overallBest: result.overallBest,
            totalCombinations: result.totalCombinations,
            completedCombinations: result.completedCombinations,
            totalBatches: result.totalBatches,
            executionTime: result.executionTime,
            aborted: result.aborted,
            errors: result.errors,
          };
        },
        null,
        { context: "getBatchOptimizationResults" }
      );
    }),

  /**
   * Abort running batch optimization
   * 
   * CORREÇÃO #2: Usa IsolatedStateManager
   */
  abortBatchOptimization: protectedProcedure
    .input(z.object({ runId: z.string().optional() }).optional())
    .mutation(({ input }) => {
      const runningBatch = input?.runId 
        ? isolatedStateManager.getBatchOptimizationState(input.runId)
        : isolatedStateManager.getRunningBatchOptimization();
      
      if (runningBatch && runningBatch.isRunning) {
        const optimizer = activeBatchOptimizers.get(runningBatch.runId);
        if (optimizer) {
          optimizer.abort();
          activeBatchOptimizers.delete(runningBatch.runId);
        }
        
        isolatedStateManager.updateBatchOptimizationState(runningBatch.runId, {
          isRunning: false,
        });
        
        return { success: true, message: "Otimização em lotes abortada" };
      }
      
      return { success: false, message: "Nenhuma otimização em lotes em execução" };
    }),

  /**
   * Clear batch optimization results
   * 
   * CORREÇÃO #2: Usa IsolatedStateManager
   */
  clearBatchOptimizationResults: protectedProcedure
    .input(z.object({ runId: z.string().optional() }).optional())
    .mutation(({ input }) => {
      if (input?.runId) {
        isolatedStateManager.removeBatchOptimizationState(input.runId);
      }
      return { success: true };
    }),
});
