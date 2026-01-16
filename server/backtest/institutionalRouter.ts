/**
 * Institutional Router - Endpoints tRPC para Laboratório Institucional Plus
 * 
 * Expõe endpoints para:
 * - Otimização Grid Search institucional
 * - Validação Walk-Forward
 * - Simulação Monte Carlo
 * - Detecção de Regimes
 * - Backtest Multi-Asset
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import * as path from "path";
import * as fs from "fs";

// Importar módulos do laboratório
import { GridSearchEngine } from "./optimization/GridSearchEngine";
import { WalkForwardValidator, createWalkForwardValidator } from "./validation/WalkForwardValidator";
import { MonteCarloSimulator, createMonteCarloSimulator, DEFAULT_MONTE_CARLO_CONFIG } from "./validation/MonteCarloSimulator";
import { RegimeDetector, createRegimeDetector, DEFAULT_REGIME_DETECTION_CONFIG } from "./validation/RegimeDetector";
import { MultiAssetOrchestrator, createMultiAssetOrchestrator } from "./multi-asset/MultiAssetOrchestrator";
import { IsolatedBacktestRunner, createIsolatedRunner } from "./runners/IsolatedBacktestRunner";
import { createSeededRNG, seedFromTimestamp } from "./utils/SeededRNG";

// Importar tipos
import { BacktestStrategyType, BacktestTrade } from "./types/backtest.types";
import { 
  OptimizationConfig, 
  OptimizationProgress, 
  OptimizationFinalResult,
  DEFAULT_SMC_PARAMETER_DEFINITIONS,
  ParameterCategory,
} from "./optimization/types/optimization.types";
import {
  WalkForwardConfig,
  WalkForwardResult,
  MonteCarloConfig,
  MonteCarloResult,
  RegimeDetectionConfig,
  RegimeDetectionResult,
  ValidationProgress,
} from "./validation/types/validation.types";
import { MultiAssetBacktestResult } from "./multi-asset/MultiAssetOrchestrator";

// ============================================================================
// STATE
// ============================================================================

// Estado da otimização institucional
interface InstitutionalOptimizationState {
  isRunning: boolean;
  progress: OptimizationProgress | null;
  result: OptimizationFinalResult | null;
  error: string | null;
}

const institutionalOptimizationState: InstitutionalOptimizationState = {
  isRunning: false,
  progress: null,
  result: null,
  error: null,
};

let activeGridSearchEngine: GridSearchEngine | null = null;

// Estado da validação Walk-Forward
interface WalkForwardState {
  isRunning: boolean;
  progress: ValidationProgress | null;
  result: WalkForwardResult | null;
  error: string | null;
}

const walkForwardState: WalkForwardState = {
  isRunning: false,
  progress: null,
  result: null,
  error: null,
};

let activeWalkForwardValidator: WalkForwardValidator | null = null;

// Estado da simulação Monte Carlo
interface MonteCarloState {
  isRunning: boolean;
  progress: ValidationProgress | null;
  result: MonteCarloResult | null;
  error: string | null;
}

const monteCarloState: MonteCarloState = {
  isRunning: false,
  progress: null,
  result: null,
  error: null,
};

let activeMonteCarloSimulator: MonteCarloSimulator | null = null;

// Estado da detecção de regimes
interface RegimeDetectionState {
  isRunning: boolean;
  progress: ValidationProgress | null;
  result: RegimeDetectionResult | null;
  error: string | null;
}

const regimeDetectionState: RegimeDetectionState = {
  isRunning: false,
  progress: null,
  result: null,
  error: null,
};

let activeRegimeDetector: RegimeDetector | null = null;

// Estado do backtest multi-asset
interface MultiAssetState {
  isRunning: boolean;
  progress: { phase: string; percentComplete: number; message: string } | null;
  result: MultiAssetBacktestResult | null;
  error: string | null;
}

const multiAssetState: MultiAssetState = {
  isRunning: false,
  progress: null,
  result: null,
  error: null,
};

let activeMultiAssetOrchestrator: MultiAssetOrchestrator | null = null;

// ============================================================================
// SCHEMAS
// ============================================================================

// Schema para parâmetro de otimização
const parameterDefinitionSchema = z.object({
  name: z.string(),
  label: z.string(),
  category: z.nativeEnum(ParameterCategory),
  type: z.enum(["number", "boolean", "select"]),
  default: z.union([z.number(), z.string(), z.boolean()]),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  values: z.array(z.union([z.number(), z.string(), z.boolean()])).optional(),
  enabled: z.boolean(),
  locked: z.boolean(),
  description: z.string().optional(),
});

// Schema para objetivo de otimização
const objectiveSchema = z.object({
  metric: z.string(),
  target: z.enum(["MAXIMIZE", "MINIMIZE"]),
  weight: z.number().min(0).max(1),
  threshold: z.number().optional(),
});

// Schema para otimização institucional
const institutionalOptimizationSchema = z.object({
  symbols: z.array(z.string()).min(1),
  startDate: z.string(),
  endDate: z.string(),
  strategyType: z.enum(["SMC", "HYBRID", "RSI_VWAP"]),
  parameters: z.array(parameterDefinitionSchema),
  validation: z.object({
    enabled: z.boolean(),
    inSampleRatio: z.number().min(0.5).max(0.9).default(0.7),
    walkForward: z.object({
      enabled: z.boolean(),
      windowMonths: z.number().min(3).max(24).default(6),
      stepMonths: z.number().min(1).max(6).default(1),
    }),
  }),
  maxCombinations: z.number().min(100).max(100000).optional(),
  parallelWorkers: z.number().min(1).max(8).default(4),
  objectives: z.array(objectiveSchema),
  seed: z.number().optional(),
});

// Schema para Walk-Forward
const walkForwardSchema = z.object({
  symbol: z.string(),
  parameters: z.record(z.union([z.number(), z.string(), z.boolean()])),
  startDate: z.string(),
  endDate: z.string(),
  windowMonths: z.number().min(3).max(24).default(6),
  stepMonths: z.number().min(1).max(6).default(1),
  strategyType: z.enum(["SMC", "HYBRID", "RSI_VWAP"]),
  initialBalance: z.number().default(10000),
  leverage: z.number().default(500),
});

// Schema para Monte Carlo
const monteCarloSchema = z.object({
  trades: z.array(z.object({
    id: z.string(),
    symbol: z.string(),
    direction: z.enum(["LONG", "SHORT"]),
    entryPrice: z.number(),
    exitPrice: z.number(),
    size: z.number(),
    openTimestamp: z.number(),
    closeTimestamp: z.number(),
    profit: z.number(),
    commission: z.number(),
    pips: z.number(),
  })),
  simulations: z.number().min(100).max(10000).default(1000),
  method: z.enum(["BLOCK_BOOTSTRAP", "TRADE_RESAMPLING", "RANDOMIZE_ORDER"]).default("BLOCK_BOOTSTRAP"),
  confidenceLevel: z.number().min(90).max(99).default(95),
  initialBalance: z.number().default(10000),
  ruinThreshold: z.number().min(20).max(80).default(50),
  blockSize: z.number().min(5).max(50).optional(),
  seed: z.number().optional(),
});

// Schema para detecção de regimes
const regimeDetectionSchema = z.object({
  symbol: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  timeframe: z.string().default("H1"),
  lookbackPeriod: z.number().min(20).max(200).default(50),
  volatilityThreshold: z.number().default(1.5),
  trendThreshold: z.number().default(0.5),
  rangeThreshold: z.number().default(3.0),
});

// Schema para multi-asset
const multiAssetSchema = z.object({
  symbols: z.array(z.string()).min(2).max(10),
  strategy: z.enum(["SMC", "HYBRID", "RSI_VWAP"]),
  startDate: z.string(),
  endDate: z.string(),
  parameters: z.record(z.union([z.number(), z.string(), z.boolean()])),
  initialBalance: z.number().default(10000),
  leverage: z.number().default(500),
  maxTotalPositions: z.number().default(10),
  maxPositionsPerSymbol: z.number().default(3),
  maxDailyDrawdown: z.number().default(5),
  seed: z.number().optional(),
});

// ============================================================================
// ROUTER
// ============================================================================

export const institutionalRouter = router({
  // =========================================================================
  // DATA MANAGEMENT
  // =========================================================================

  /**
   * Get available datasets (symbols and timeframes with historical data)
   */
  getAvailableDatasets: protectedProcedure
    .query(() => {
      const dataPath = path.join(process.cwd(), "data", "candles");
      const datasets: Array<{
        symbol: string;
        timeframe: string;
        recordCount: number;
        startDate: string;
        endDate: string;
        lastUpdated: string;
      }> = [];

      // Verificar se o diretório existe
      if (!fs.existsSync(dataPath)) {
        return { datasets: [] };
      }

      // Listar arquivos de dados
      const files = fs.readdirSync(dataPath);
      
      for (const file of files) {
        if (file.endsWith(".json")) {
          const match = file.match(/^([A-Z]+)_([A-Z0-9]+)\.json$/);
          if (match) {
            const [, symbol, timeframe] = match;
            const filePath = path.join(dataPath, file);
            
            try {
              const stats = fs.statSync(filePath);
              const content = fs.readFileSync(filePath, "utf-8");
              const candles = JSON.parse(content);
              
              if (Array.isArray(candles) && candles.length > 0) {
                datasets.push({
                  symbol,
                  timeframe,
                  recordCount: candles.length,
                  startDate: new Date(candles[0].timestamp).toISOString(),
                  endDate: new Date(candles[candles.length - 1].timestamp).toISOString(),
                  lastUpdated: stats.mtime.toISOString(),
                });
              }
            } catch (error) {
              console.error(`Erro ao ler arquivo ${file}:`, error);
            }
          }
        }
      }

      return { datasets };
    }),

  // =========================================================================
  // INSTITUTIONAL OPTIMIZATION (Grid Search + Walk-Forward)
  // =========================================================================

  /**
   * Get parameter definitions for optimization
   */
  getParameterDefinitions: protectedProcedure
    .query(() => {
      return {
        parameters: DEFAULT_SMC_PARAMETER_DEFINITIONS,
        categories: Object.values(ParameterCategory),
      };
    }),

  /**
   * Start institutional optimization
   */
  startOptimization: protectedProcedure
    .input(institutionalOptimizationSchema)
    .mutation(async ({ input }) => {
      if (institutionalOptimizationState.isRunning) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Otimização institucional já em execução",
        });
      }

      // Verificar dados
      const dataPath = path.join(process.cwd(), "data", "candles");
      for (const symbol of input.symbols) {
        const dataFile = path.join(dataPath, `${symbol}_M5.json`);
        if (!fs.existsSync(dataFile)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Dados históricos não encontrados para ${symbol}. Baixe os dados primeiro.`,
          });
        }
      }

      // Reset state
      institutionalOptimizationState.isRunning = true;
      institutionalOptimizationState.progress = null;
      institutionalOptimizationState.result = null;
      institutionalOptimizationState.error = null;

      try {
        // Construir configuração
        const config: OptimizationConfig = {
          symbols: input.symbols,
          strategyType: input.strategyType as BacktestStrategyType,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          dataPath,
          timeframes: ["M5", "M15", "H1"],
          initialBalance: 10000,
          leverage: 500,
          commission: 7,
          slippage: 0.5,
          spread: 1.0,
          parameters: input.parameters.map(p => ({
            name: p.name,
            label: p.label,
            category: p.category,
            type: p.type,
            default: p.default,
            min: p.min,
            max: p.max,
            step: p.step,
            values: p.values,
            enabled: p.enabled,
            locked: p.locked,
            description: p.description,
          })),
          objectives: input.objectives.map(o => ({
            metric: o.metric,
            target: o.target,
            weight: o.weight,
            threshold: o.threshold,
          })),
          validation: {
            enabled: input.validation.enabled,
            inSampleRatio: input.validation.inSampleRatio,
            walkForward: {
              enabled: input.validation.walkForward.enabled,
              windowMonths: input.validation.walkForward.windowMonths,
              stepMonths: input.validation.walkForward.stepMonths,
            },
          },
          maxCombinations: input.maxCombinations,
          parallelWorkers: input.parallelWorkers,
          seed: input.seed || seedFromTimestamp(),
        };

        // Criar engine
        activeGridSearchEngine = new GridSearchEngine(config);

        // Set progress callback
        activeGridSearchEngine.setProgressCallback((progress) => {
          institutionalOptimizationState.progress = progress;
        });

        // Executar otimização
        const result = await activeGridSearchEngine.run();

        // Armazenar resultado
        institutionalOptimizationState.result = result;
        institutionalOptimizationState.isRunning = false;
        activeGridSearchEngine = null;

        return {
          success: true,
          message: `Otimização institucional concluída! ${result.totalCombinationsTested} combinações testadas.`,
          totalCombinations: result.totalCombinationsTested,
          executionTime: result.executionTimeSeconds,
          bestResult: result.bestResult,
          aborted: result.aborted,
        };

      } catch (error) {
        institutionalOptimizationState.isRunning = false;
        institutionalOptimizationState.error = (error as Error).message;
        activeGridSearchEngine = null;

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro na otimização institucional: ${(error as Error).message}`,
        });
      }
    }),

  /**
   * Get optimization status
   */
  getOptimizationStatus: protectedProcedure
    .query(() => {
      return {
        isRunning: institutionalOptimizationState.isRunning,
        progress: institutionalOptimizationState.progress,
        error: institutionalOptimizationState.error,
      };
    }),

  /**
   * Get optimization results
   */
  getOptimizationResults: protectedProcedure
    .query(() => {
      return institutionalOptimizationState.result;
    }),

  /**
   * Abort optimization
   */
  abortOptimization: protectedProcedure
    .mutation(() => {
      if (activeGridSearchEngine) {
        activeGridSearchEngine.abort();
        institutionalOptimizationState.isRunning = false;
        activeGridSearchEngine = null;
        return { success: true, message: "Otimização institucional abortada" };
      }
      return { success: false, message: "Nenhuma otimização em execução" };
    }),

  /**
   * Clear optimization results
   */
  clearOptimizationResults: protectedProcedure
    .mutation(() => {
      institutionalOptimizationState.result = null;
      institutionalOptimizationState.error = null;
      institutionalOptimizationState.progress = null;
      return { success: true };
    }),

  // =========================================================================
  // WALK-FORWARD VALIDATION
  // =========================================================================

  /**
   * Run Walk-Forward validation
   */
  runWalkForward: protectedProcedure
    .input(walkForwardSchema)
    .mutation(async ({ input }) => {
      if (walkForwardState.isRunning) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Validação Walk-Forward já em execução",
        });
      }

      // Verificar dados
      const dataPath = path.join(process.cwd(), "data", "candles");
      const dataFile = path.join(dataPath, `${input.symbol}_M5.json`);
      if (!fs.existsSync(dataFile)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Dados históricos não encontrados para ${input.symbol}.`,
        });
      }

      // Reset state
      walkForwardState.isRunning = true;
      walkForwardState.progress = null;
      walkForwardState.result = null;
      walkForwardState.error = null;

      try {
        // Construir configuração
        const config: WalkForwardConfig = {
          symbol: input.symbol,
          parameters: input.parameters,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          windowMonths: input.windowMonths,
          stepMonths: input.stepMonths,
          parallelWindows: false,
          strategyType: input.strategyType as BacktestStrategyType,
          dataPath,
          timeframes: ["M5", "M15", "H1"],
          initialBalance: input.initialBalance,
          leverage: input.leverage,
          commission: 7,
          slippage: 0.5,
          spread: 1.0,
        };

        // Criar validador
        activeWalkForwardValidator = createWalkForwardValidator(config);

        // Set progress callback
        activeWalkForwardValidator.setProgressCallback((progress) => {
          walkForwardState.progress = progress;
        });

        // Executar validação
        const result = await activeWalkForwardValidator.validate();

        // Armazenar resultado
        walkForwardState.result = result;
        walkForwardState.isRunning = false;
        activeWalkForwardValidator = null;

        return {
          success: true,
          message: `Validação Walk-Forward concluída! ${result.windows.length} janelas processadas.`,
          isRobust: result.isRobust,
          confidence: result.confidence,
          warnings: result.warnings,
        };

      } catch (error) {
        walkForwardState.isRunning = false;
        walkForwardState.error = (error as Error).message;
        activeWalkForwardValidator = null;

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro na validação Walk-Forward: ${(error as Error).message}`,
        });
      }
    }),

  /**
   * Get Walk-Forward status
   */
  getWalkForwardStatus: protectedProcedure
    .query(() => {
      return {
        isRunning: walkForwardState.isRunning,
        progress: walkForwardState.progress,
        error: walkForwardState.error,
      };
    }),

  /**
   * Get Walk-Forward results
   */
  getWalkForwardResults: protectedProcedure
    .query(() => {
      return walkForwardState.result;
    }),

  // =========================================================================
  // MONTE CARLO SIMULATION
  // =========================================================================

  /**
   * Run Monte Carlo simulation
   */
  runMonteCarlo: protectedProcedure
    .input(monteCarloSchema)
    .mutation(async ({ input }) => {
      if (monteCarloState.isRunning) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Simulação Monte Carlo já em execução",
        });
      }

      if (input.trades.length < 10) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Mínimo de 10 trades necessários para Monte Carlo",
        });
      }

      // Reset state
      monteCarloState.isRunning = true;
      monteCarloState.progress = null;
      monteCarloState.result = null;
      monteCarloState.error = null;

      try {
        // Construir configuração
        const config: MonteCarloConfig = {
          simulations: input.simulations,
          method: input.method,
          confidenceLevel: input.confidenceLevel,
          initialBalance: input.initialBalance,
          ruinThreshold: input.ruinThreshold,
          blockSize: input.blockSize,
          seed: input.seed || seedFromTimestamp(),
        };

        // Criar simulador
        activeMonteCarloSimulator = createMonteCarloSimulator(config);

        // Set progress callback
        activeMonteCarloSimulator.setProgressCallback((progress) => {
          monteCarloState.progress = progress;
        });

        // Executar simulação
        const result = await activeMonteCarloSimulator.simulate(input.trades as BacktestTrade[]);

        // Armazenar resultado
        monteCarloState.result = result;
        monteCarloState.isRunning = false;
        activeMonteCarloSimulator = null;

        return {
          success: true,
          message: `Simulação Monte Carlo concluída! ${result.simulations} simulações executadas.`,
          ruinProbability: result.ruinProbability,
          seed: result.seed,
        };

      } catch (error) {
        monteCarloState.isRunning = false;
        monteCarloState.error = (error as Error).message;
        activeMonteCarloSimulator = null;

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro na simulação Monte Carlo: ${(error as Error).message}`,
        });
      }
    }),

  /**
   * Get Monte Carlo status
   */
  getMonteCarloStatus: protectedProcedure
    .query(() => {
      return {
        isRunning: monteCarloState.isRunning,
        progress: monteCarloState.progress,
        error: monteCarloState.error,
      };
    }),

  /**
   * Get Monte Carlo results
   */
  getMonteCarloResults: protectedProcedure
    .query(() => {
      return monteCarloState.result;
    }),

  // =========================================================================
  // REGIME DETECTION
  // =========================================================================

  /**
   * Run regime detection
   */
  runRegimeDetection: protectedProcedure
    .input(regimeDetectionSchema)
    .mutation(async ({ input }) => {
      if (regimeDetectionState.isRunning) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Detecção de regimes já em execução",
        });
      }

      // Verificar dados
      const dataPath = path.join(process.cwd(), "data", "candles");
      const dataFile = path.join(dataPath, `${input.symbol}_${input.timeframe}.json`);
      if (!fs.existsSync(dataFile)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Dados históricos não encontrados para ${input.symbol} ${input.timeframe}.`,
        });
      }

      // Reset state
      regimeDetectionState.isRunning = true;
      regimeDetectionState.progress = null;
      regimeDetectionState.result = null;
      regimeDetectionState.error = null;

      try {
        // Carregar dados
        const rawData = fs.readFileSync(dataFile, "utf-8");
        const candles = JSON.parse(rawData);

        // Filtrar por período
        const startTs = new Date(input.startDate).getTime();
        const endTs = new Date(input.endDate).getTime();
        const filteredCandles = candles.filter((c: any) => 
          c.timestamp >= startTs && c.timestamp <= endTs
        );

        // Construir configuração
        const config: RegimeDetectionConfig = {
          lookbackPeriod: input.lookbackPeriod,
          volatilityThreshold: input.volatilityThreshold,
          trendThreshold: input.trendThreshold,
          rangeThreshold: input.rangeThreshold,
          minRegimeDuration: 10,
        };

        // Criar detector
        activeRegimeDetector = createRegimeDetector(config);

        // Set progress callback
        activeRegimeDetector.setProgressCallback((progress) => {
          regimeDetectionState.progress = progress;
        });

        // Detectar regimes
        const regimes = activeRegimeDetector.detectRegimes(filteredCandles);

        // Construir resultado
        const result: RegimeDetectionResult = {
          symbol: input.symbol,
          period: {
            start: new Date(input.startDate),
            end: new Date(input.endDate),
          },
          regimes,
          distribution: [],
          currentRegime: regimes.length > 0 ? regimes[regimes.length - 1] : null,
        };

        // Armazenar resultado
        regimeDetectionState.result = result;
        regimeDetectionState.isRunning = false;
        activeRegimeDetector = null;

        return {
          success: true,
          message: `Detecção de regimes concluída! ${regimes.length} regimes detectados.`,
          totalRegimes: regimes.length,
        };

      } catch (error) {
        regimeDetectionState.isRunning = false;
        regimeDetectionState.error = (error as Error).message;
        activeRegimeDetector = null;

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro na detecção de regimes: ${(error as Error).message}`,
        });
      }
    }),

  /**
   * Get regime detection status
   */
  getRegimeDetectionStatus: protectedProcedure
    .query(() => {
      return {
        isRunning: regimeDetectionState.isRunning,
        progress: regimeDetectionState.progress,
        error: regimeDetectionState.error,
      };
    }),

  /**
   * Get regime detection results
   */
  getRegimeDetectionResults: protectedProcedure
    .query(() => {
      return regimeDetectionState.result;
    }),

  // =========================================================================
  // MULTI-ASSET BACKTEST
  // =========================================================================

  /**
   * Run multi-asset backtest
   */
  runMultiAsset: protectedProcedure
    .input(multiAssetSchema)
    .mutation(async ({ input }) => {
      if (multiAssetState.isRunning) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Backtest multi-asset já em execução",
        });
      }

      // Verificar dados para todos os símbolos
      const dataPath = path.join(process.cwd(), "data", "candles");
      for (const symbol of input.symbols) {
        const dataFile = path.join(dataPath, `${symbol}_M5.json`);
        if (!fs.existsSync(dataFile)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Dados históricos não encontrados para ${symbol}.`,
          });
        }
      }

      // Reset state
      multiAssetState.isRunning = true;
      multiAssetState.progress = null;
      multiAssetState.result = null;
      multiAssetState.error = null;

      try {
        // Criar orquestrador
        activeMultiAssetOrchestrator = createMultiAssetOrchestrator({
          symbols: input.symbols,
          strategy: input.strategy as BacktestStrategyType,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          dataPath,
          timeframes: ["M5", "M15", "H1"],
          parameters: input.parameters,
          ledgerConfig: {
            initialBalance: input.initialBalance,
            leverage: input.leverage,
          },
          riskGovernorConfig: {
            maxTotalPositions: input.maxTotalPositions,
            maxPositionsPerSymbol: input.maxPositionsPerSymbol,
            maxDailyDrawdown: input.maxDailyDrawdown,
          },
          seed: input.seed,
        });

        // Set progress callback
        activeMultiAssetOrchestrator.setProgressCallback((progress) => {
          multiAssetState.progress = progress;
        });

        // Executar backtest
        const result = await activeMultiAssetOrchestrator.run();

        // Armazenar resultado
        multiAssetState.result = result;
        multiAssetState.isRunning = false;
        activeMultiAssetOrchestrator = null;

        return {
          success: true,
          message: `Backtest multi-asset concluído! ${result.allTrades.length} trades executados.`,
          totalTrades: result.allTrades.length,
          totalReturn: result.portfolioMetrics.totalReturn,
          sharpeRatio: result.portfolioMetrics.sharpeRatio,
          maxDrawdown: result.portfolioMetrics.maxDrawdown,
        };

      } catch (error) {
        multiAssetState.isRunning = false;
        multiAssetState.error = (error as Error).message;
        activeMultiAssetOrchestrator = null;

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro no backtest multi-asset: ${(error as Error).message}`,
        });
      }
    }),

  /**
   * Get multi-asset status
   */
  getMultiAssetStatus: protectedProcedure
    .query(() => {
      return {
        isRunning: multiAssetState.isRunning,
        progress: multiAssetState.progress,
        error: multiAssetState.error,
      };
    }),

  /**
   * Get multi-asset results
   */
  getMultiAssetResults: protectedProcedure
    .query(() => {
      return multiAssetState.result;
    }),

  /**
   * Abort multi-asset backtest
   */
  abortMultiAsset: protectedProcedure
    .mutation(() => {
      if (activeMultiAssetOrchestrator) {
        activeMultiAssetOrchestrator.abort();
        multiAssetState.isRunning = false;
        activeMultiAssetOrchestrator = null;
        return { success: true, message: "Backtest multi-asset abortado" };
      }
      return { success: false, message: "Nenhum backtest multi-asset em execução" };
    }),

  // =========================================================================
  // ISOLATED BACKTEST (Single run with determinism)
  // =========================================================================

  /**
   * Run isolated backtest with determinism
   */
  runIsolatedBacktest: protectedProcedure
    .input(z.object({
      symbol: z.string(),
      strategy: z.enum(["SMC", "HYBRID", "RSI_VWAP"]),
      startDate: z.string(),
      endDate: z.string(),
      parameters: z.record(z.union([z.number(), z.string(), z.boolean()])),
      initialBalance: z.number().default(10000),
      leverage: z.number().default(500),
      seed: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      // Verificar dados
      const dataPath = path.join(process.cwd(), "data", "candles");
      const dataFile = path.join(dataPath, `${input.symbol}_M5.json`);
      if (!fs.existsSync(dataFile)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Dados históricos não encontrados para ${input.symbol}.`,
        });
      }

      try {
        const seed = input.seed || seedFromTimestamp();

        // Criar runner isolado
        const runner = createIsolatedRunner(
          {
            symbol: input.symbol,
            strategy: input.strategy as BacktestStrategyType,
            startDate: new Date(input.startDate),
            endDate: new Date(input.endDate),
            dataPath,
            timeframes: ["M5", "M15", "H1"],
            initialBalance: input.initialBalance,
            leverage: input.leverage,
            commission: 7,
            slippage: 0.5,
            spread: 1.0,
            riskPercent: (input.parameters.riskPercentage as number) || 2,
            maxPositions: (input.parameters.maxOpenTrades as number) || 3,
            maxSpread: (input.parameters.maxSpreadPips as number) || 3,
          },
          input.parameters,
          seed
        );

        // Executar backtest
        const result = await runner.run();

        return {
          success: true,
          result,
          seed,
          message: `Backtest isolado concluído! ${result.metrics.totalTrades} trades executados.`,
        };

      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro no backtest isolado: ${(error as Error).message}`,
        });
      }
    }),
});
