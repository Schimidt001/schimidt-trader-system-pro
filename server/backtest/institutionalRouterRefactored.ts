/**
 * Institutional Router Refatorado - Endpoints tRPC para Otimização Institucional
 * 
 * CORREÇÕES APLICADAS:
 * 1. Persistência Real de Estado (via OptimizationJobQueuePersistent)
 * 2. Remoção de Estado Global (via IsolatedStateManager)
 * 3. Correção do downloadData (via EnvironmentContext)
 * 4. Eliminação do Singleton ctraderAdapter (via AdapterFactory)
 * 5. Padronização de Respostas TRPC (via TrpcErrorHandler)
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 3.0.0 - Refactored
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

// CORREÇÃO #1: Usar OptimizationJobQueuePersistent em vez do original
import { optimizationJobQueuePersistent, LAB_ERROR_CODES } from "./utils/OptimizationJobQueuePersistent";

// CORREÇÃO #2: Usar IsolatedStateManager
import { isolatedStateManager } from "./utils/IsolatedStateManager";

// CORREÇÃO #5: Usar TrpcErrorHandler
import { 
  safeQueryHandler, 
  safeMutationHandler, 
  createSafeStatusHandler,
  ErrorCodes,
  logTrpcError,
  logTrpcSuccess,
} from "./utils/TrpcErrorHandler";

// Importar tipos
import { 
  OptimizationConfig, 
  ParameterDefinition, 
  ParameterType,
  ValidationConfig,
} from "./optimization/types/optimization.types";

// Importar logger
import { labLogger, optimizationLogger } from "./utils/LabLogger";

// ============================================================================
// SCHEMAS
// ============================================================================

const parameterDefinitionSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.nativeEnum(ParameterType),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  values: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
  enabled: z.boolean(),
  locked: z.boolean().optional(),
  currentValue: z.union([z.number(), z.string(), z.boolean()]).optional(),
  category: z.string().optional(),
  description: z.string().optional(),
});

const validationConfigSchema = z.object({
  enabled: z.boolean(),
  inSampleRatio: z.number().min(0.5).max(0.9),
  walkForward: z.object({
    enabled: z.boolean(),
    windowMonths: z.number().min(1).max(12),
    stepMonths: z.number().min(1).max(6),
  }),
});

const startOptimizationSchema = z.object({
  symbol: z.string().min(1),
  startDate: z.string(),
  endDate: z.string(),
  strategy: z.enum(["SMC", "HYBRID", "RSI_VWAP"]),
  parameters: z.array(parameterDefinitionSchema),
  validation: validationConfigSchema,
  initialBalance: z.number().min(100).default(10000),
  leverage: z.number().min(1).default(500),
  commission: z.number().min(0).default(7),
  slippage: z.number().min(0).default(0.5),
  spread: z.number().min(0).default(1),
  parallelWorkers: z.number().min(1).max(8).default(4),
});

// ============================================================================
// ROUTER
// ============================================================================

export const institutionalRouterRefactored = router({
  // =========================================================================
  // OPTIMIZATION MANAGEMENT
  // =========================================================================
  
  /**
   * Start a new optimization job
   * 
   * CORREÇÃO #1: Usa OptimizationJobQueuePersistent para persistência
   * CORREÇÃO #5: Tratamento de erro padronizado
   */
  startOptimization: protectedProcedure
    .input(startOptimizationSchema)
    .mutation(async ({ input }) => {
      return safeMutationHandler(async () => {
        labLogger.info("CHECKPOINT: startOptimization.enter", "InstitutionalRouter");
        
        // CORREÇÃO #1: Verificar se já há job em execução usando fila persistente
        const isRunning = await optimizationJobQueuePersistent.isRunning();
        if (isRunning) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Já existe uma otimização em execução. Aguarde a conclusão ou aborte.",
            cause: { code: LAB_ERROR_CODES.LAB_JOB_ALREADY_RUNNING }
          });
        }
        
        // Construir configuração
        const config: OptimizationConfig = {
          symbol: input.symbol,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          strategy: input.strategy,
          parameters: input.parameters as ParameterDefinition[],
          validation: input.validation as ValidationConfig,
          initialBalance: input.initialBalance,
          leverage: input.leverage,
          commission: input.commission,
          slippage: input.slippage,
          spread: input.spread,
          parallelWorkers: input.parallelWorkers,
        };
        
        // Validar e calcular combinações
        const validation = optimizationJobQueuePersistent.validateAndCalculateCombinations(config);
        
        if (!validation.valid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: validation.error || "Configuração inválida",
            cause: { 
              code: validation.errorCode || ErrorCodes.VALIDATION_ERROR,
              totalCombinations: validation.totalCombinations,
            }
          });
        }
        
        // CORREÇÃO #1: Enfileirar job com persistência imediata
        const { runId, enqueuedAt } = await optimizationJobQueuePersistent.enqueueJob(
          config, 
          validation.totalCombinations
        );
        
        labLogger.info(`CHECKPOINT: startOptimization.returning_runId | runId=${runId}`, "InstitutionalRouter");
        logTrpcSuccess("startOptimization", { runId, totalCombinations: validation.totalCombinations });
        
        return {
          success: true,
          runId,
          totalCombinations: validation.totalCombinations,
          message: `Otimização iniciada! ${validation.totalCombinations.toLocaleString()} combinações serão testadas.`,
          enqueuedAt: enqueuedAt.toISOString(),
        };
        
      }, "startOptimization");
    }),
  
  /**
   * Get optimization status
   * 
   * CORREÇÃO #1: Lê status do banco de dados persistente
   * CORREÇÃO #5: Tratamento de erro padronizado (nunca falha)
   */
  getOptimizationStatus: protectedProcedure
    .input(z.object({ runId: z.string().optional() }).optional())
    .query(async ({ input }) => {
      // CORREÇÃO #5: Usar createSafeStatusHandler para garantir resposta válida
      const safeHandler = createSafeStatusHandler(
        async () => {
          // CORREÇÃO #1: Buscar status da fila persistente
          const status = await optimizationJobQueuePersistent.getJobStatus(input?.runId);
          
          if (!status.hasJob) {
            return {
              hasJob: false,
              runId: null,
              status: null,
              progress: null,
              error: null,
              lastProgressAt: null,
            };
          }
          
          return {
            hasJob: status.hasJob,
            runId: status.runId,
            status: status.status,
            progress: status.progress ? {
              phase: status.progress.phase,
              currentCombination: status.progress.currentCombination,
              totalCombinations: status.progress.totalCombinations,
              percentComplete: status.progress.percentComplete,
              estimatedTimeRemaining: status.progress.estimatedTimeRemaining,
              elapsedTime: status.progress.elapsedTime,
              statusMessage: status.progress.statusMessage,
              currentParameters: status.progress.currentParameters,
            } : null,
            error: status.error,
            lastProgressAt: status.lastProgressAt?.toISOString() || null,
          };
        },
        // Default status em caso de erro
        {
          hasJob: false,
          runId: null,
          status: null,
          progress: null,
          error: null,
          lastProgressAt: null,
        },
        { context: "getOptimizationStatus" }
      );
      
      return safeHandler();
    }),
  
  /**
   * Get optimization result
   * 
   * CORREÇÃO #1: Lê resultado do banco de dados persistente
   * CORREÇÃO #5: Tratamento de erro padronizado
   */
  getOptimizationResult: protectedProcedure
    .input(z.object({ runId: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return safeQueryHandler(
        async () => {
          // CORREÇÃO #1: Buscar resultado da fila persistente
          const result = await optimizationJobQueuePersistent.getJobResult(input?.runId);
          
          if (!result) {
            return null;
          }
          
          return {
            totalCombinationsTested: result.totalCombinationsTested,
            executionTimeSeconds: result.executionTimeSeconds,
            bestResults: result.bestResults.slice(0, 20), // Limitar para performance
            aborted: result.aborted,
            errors: result.errors,
            metadata: result.metadata,
          };
        },
        null,
        { context: "getOptimizationResult" }
      );
    }),
  
  /**
   * Abort running optimization
   * 
   * CORREÇÃO #1: Usa fila persistente para abort
   * CORREÇÃO #5: Tratamento de erro padronizado
   */
  abortOptimization: protectedProcedure
    .mutation(async () => {
      return safeMutationHandler(async () => {
        const result = await optimizationJobQueuePersistent.abort();
        
        if (result.success) {
          logTrpcSuccess("abortOptimization", { message: result.message });
        }
        
        return result;
      }, "abortOptimization");
    }),
  
  /**
   * Clear optimization job
   * 
   * CORREÇÃO #1: Usa fila persistente
   */
  clearOptimization: protectedProcedure
    .mutation(async () => {
      await optimizationJobQueuePersistent.clearJob();
      return { success: true };
    }),
  
  // =========================================================================
  // CONFIGURATION
  // =========================================================================
  
  /**
   * Get available parameters for optimization
   * 
   * CORREÇÃO #5: Tratamento de erro padronizado
   */
  getAvailableParameters: protectedProcedure
    .input(z.object({ strategy: z.enum(["SMC", "HYBRID", "RSI_VWAP"]) }))
    .query(({ input }) => {
      return safeQueryHandler(
        () => {
          // Retornar definições de parâmetros baseado na estratégia
          const baseParameters: ParameterDefinition[] = [
            // Parâmetros de Estrutura
            {
              name: "lookbackPeriod",
              label: "Período de Lookback",
              type: ParameterType.INTEGER,
              min: 10,
              max: 100,
              step: 5,
              enabled: true,
              locked: false,
              currentValue: 50,
              category: "structure",
              description: "Número de candles para análise de estrutura",
            },
            {
              name: "swingStrength",
              label: "Força do Swing",
              type: ParameterType.INTEGER,
              min: 2,
              max: 10,
              step: 1,
              enabled: true,
              locked: false,
              currentValue: 5,
              category: "structure",
              description: "Número de candles para confirmar swing high/low",
            },
            // Parâmetros de Order Block
            {
              name: "obMinSize",
              label: "Tamanho Mínimo OB",
              type: ParameterType.DECIMAL,
              min: 0.1,
              max: 2.0,
              step: 0.1,
              enabled: true,
              locked: false,
              currentValue: 0.5,
              category: "orderBlock",
              description: "Tamanho mínimo do Order Block em ATR",
            },
            {
              name: "obMaxAge",
              label: "Idade Máxima OB",
              type: ParameterType.INTEGER,
              min: 10,
              max: 200,
              step: 10,
              enabled: true,
              locked: false,
              currentValue: 100,
              category: "orderBlock",
              description: "Número máximo de candles desde a formação do OB",
            },
            // Parâmetros de Risco
            {
              name: "riskPercent",
              label: "Risco por Trade (%)",
              type: ParameterType.PERCENTAGE,
              min: 0.5,
              max: 5.0,
              step: 0.5,
              enabled: true,
              locked: false,
              currentValue: 2.0,
              category: "risk",
              description: "Percentual do capital arriscado por trade",
            },
            {
              name: "maxPositions",
              label: "Máximo de Posições",
              type: ParameterType.INTEGER,
              min: 1,
              max: 5,
              step: 1,
              enabled: true,
              locked: false,
              currentValue: 3,
              category: "risk",
              description: "Número máximo de posições simultâneas",
            },
            // Parâmetros de Sessão
            {
              name: "tradeLondon",
              label: "Operar Londres",
              type: ParameterType.BOOLEAN,
              enabled: true,
              locked: false,
              currentValue: true,
              category: "session",
              description: "Habilitar trades na sessão de Londres",
            },
            {
              name: "tradeNewYork",
              label: "Operar Nova York",
              type: ParameterType.BOOLEAN,
              enabled: true,
              locked: false,
              currentValue: true,
              category: "session",
              description: "Habilitar trades na sessão de Nova York",
            },
          ];
          
          return {
            parameters: baseParameters,
            categories: [
              { value: "structure", label: "Estrutura de Mercado" },
              { value: "orderBlock", label: "Order Blocks" },
              { value: "risk", label: "Gestão de Risco" },
              { value: "session", label: "Sessões de Trading" },
            ],
          };
        },
        {
          parameters: [],
          categories: [],
        },
        { context: "getAvailableParameters" }
      );
    }),
  
  /**
   * Validate optimization configuration
   * 
   * CORREÇÃO #5: Tratamento de erro padronizado
   */
  validateConfig: protectedProcedure
    .input(startOptimizationSchema)
    .query(({ input }) => {
      return safeQueryHandler(
        () => {
          const config: OptimizationConfig = {
            symbol: input.symbol,
            startDate: new Date(input.startDate),
            endDate: new Date(input.endDate),
            strategy: input.strategy,
            parameters: input.parameters as ParameterDefinition[],
            validation: input.validation as ValidationConfig,
            initialBalance: input.initialBalance,
            leverage: input.leverage,
            commission: input.commission,
            slippage: input.slippage,
            spread: input.spread,
            parallelWorkers: input.parallelWorkers,
          };
          
          const validation = optimizationJobQueuePersistent.validateAndCalculateCombinations(config);
          
          return {
            valid: validation.valid,
            totalCombinations: validation.totalCombinations,
            error: validation.error,
            errorCode: validation.errorCode,
            estimatedTimeMinutes: Math.ceil(validation.totalCombinations * 0.1 / 60), // Estimativa
          };
        },
        {
          valid: false,
          totalCombinations: 0,
          error: "Validation failed",
          errorCode: ErrorCodes.INTERNAL_ERROR,
          estimatedTimeMinutes: 0,
        },
        { context: "validateConfig" }
      );
    }),
  
  // =========================================================================
  // DIAGNOSTICS
  // =========================================================================
  
  /**
   * Get queue configuration
   * 
   * CORREÇÃO #5: Tratamento de erro padronizado
   */
  getQueueConfig: protectedProcedure
    .query(() => {
      return safeQueryHandler(
        () => {
          const config = optimizationJobQueuePersistent.getConfig();
          return {
            maxCombinations: config.maxCombinations,
            maxParallelWorkers: config.maxParallelWorkers,
            heartbeatIntervalMs: config.heartbeatIntervalMs,
            jobTimeoutMs: config.jobTimeoutMs,
            progressPersistIntervalMs: config.progressPersistIntervalMs,
          };
        },
        {
          maxCombinations: 5000,
          maxParallelWorkers: 1,
          heartbeatIntervalMs: 3000,
          jobTimeoutMs: 0,
          progressPersistIntervalMs: 5000,
        },
        { context: "getQueueConfig" }
      );
    }),
  
  /**
   * Get state manager stats
   * 
   * CORREÇÃO #2: Usa IsolatedStateManager
   * CORREÇÃO #5: Tratamento de erro padronizado
   */
  getStateStats: protectedProcedure
    .query(() => {
      return safeQueryHandler(
        () => {
          return isolatedStateManager.getStats();
        },
        {
          backtestStates: 0,
          downloadStates: 0,
          optimizationStates: 0,
          batchOptimizationStates: 0,
        },
        { context: "getStateStats" }
      );
    }),
});
