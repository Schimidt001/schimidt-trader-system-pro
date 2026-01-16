/**
 * useInstitutionalLab - Hook para integração com o Laboratório Institucional
 * 
 * Gerencia todas as operações de:
 * - Otimização institucional (Grid Search + Walk-Forward)
 * - Validação Walk-Forward
 * - Simulação Monte Carlo
 * - Detecção de Regimes
 * - Backtest Multi-Asset
 * - Backtest Isolado
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";

// ============================================================================
// TYPES - Contrato de Retorno Padronizado
// ============================================================================

/**
 * Status padronizado para todas as operações
 */
export type PipelineStatus = 
  | "IDLE" 
  | "STARTING" 
  | "RUNNING" 
  | "COMPLETED" 
  | "ABORTED" 
  | "ERROR";

/**
 * Progresso padronizado para todas as operações
 */
export interface PipelineProgress {
  percentComplete: number;
  currentPhase: string;
  message: string;
  estimatedTimeRemaining?: number;
  elapsedTime?: number;
}

/**
 * Erro estruturado
 */
export interface PipelineError {
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Estado padronizado para qualquer pipeline
 */
export interface PipelineState<TResult = unknown> {
  runId: string | null;
  status: PipelineStatus;
  progress: PipelineProgress | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  result: TResult | null;
  error: PipelineError | null;
}

// ============================================================================
// INITIAL STATES
// ============================================================================

const createInitialState = <T>(): PipelineState<T> => ({
  runId: null,
  status: "IDLE",
  progress: null,
  startedAt: null,
  finishedAt: null,
  result: null,
  error: null,
});

// ============================================================================
// HOOK
// ============================================================================

export function useInstitutionalLab() {
  // Estados para cada pipeline
  const [optimizationState, setOptimizationState] = useState<PipelineState>(createInitialState());
  const [walkForwardState, setWalkForwardState] = useState<PipelineState>(createInitialState());
  const [monteCarloState, setMonteCarloState] = useState<PipelineState>(createInitialState());
  const [regimeDetectionState, setRegimeDetectionState] = useState<PipelineState>(createInitialState());
  const [multiAssetState, setMultiAssetState] = useState<PipelineState>(createInitialState());
  const [isolatedBacktestState, setIsolatedBacktestState] = useState<PipelineState>(createInitialState());

  // Refs para polling intervals
  const optimizationPollRef = useRef<NodeJS.Timeout | null>(null);
  const walkForwardPollRef = useRef<NodeJS.Timeout | null>(null);
  const monteCarloPollRef = useRef<NodeJS.Timeout | null>(null);
  const regimeDetectionPollRef = useRef<NodeJS.Timeout | null>(null);
  const multiAssetPollRef = useRef<NodeJS.Timeout | null>(null);

  // Polling interval (ms)
  const POLL_INTERVAL = 1000;

  // =========================================================================
  // tRPC MUTATIONS
  // =========================================================================

  // Otimização
  const startOptimizationMutation = trpc.institutional.startOptimization.useMutation();
  const abortOptimizationMutation = trpc.institutional.abortOptimization.useMutation();

  // Walk-Forward
  const runWalkForwardMutation = trpc.institutional.runWalkForward.useMutation();

  // Monte Carlo
  const runMonteCarloMutation = trpc.institutional.runMonteCarlo.useMutation();

  // Regime Detection
  const runRegimeDetectionMutation = trpc.institutional.runRegimeDetection.useMutation();

  // Multi-Asset
  const runMultiAssetMutation = trpc.institutional.runMultiAsset.useMutation();
  const abortMultiAssetMutation = trpc.institutional.abortMultiAsset.useMutation();

  // Isolated Backtest
  const runIsolatedBacktestMutation = trpc.institutional.runIsolatedBacktest.useMutation();

  // =========================================================================
  // tRPC QUERIES (para polling)
  // =========================================================================

  const utils = trpc.useUtils();

  // =========================================================================
  // POLLING FUNCTIONS
  // =========================================================================

  const pollOptimizationStatus = useCallback(async () => {
    try {
      const status = await utils.institutional.getOptimizationStatus.fetch();
      
      setOptimizationState(prev => ({
        ...prev,
        status: status.isRunning ? "RUNNING" : (status.error ? "ERROR" : (status.result ? "COMPLETED" : prev.status)),
        progress: status.progress ? {
          percentComplete: status.progress.percentComplete,
          currentPhase: status.progress.phase,
          message: status.progress.statusMessage,
          estimatedTimeRemaining: status.progress.estimatedTimeRemaining,
          elapsedTime: status.progress.elapsedTime,
        } : prev.progress,
        error: status.error ? { code: "OPTIMIZATION_ERROR", message: status.error } : null,
      }));

      // Se completou ou erro, buscar resultados e parar polling
      if (!status.isRunning) {
        if (optimizationPollRef.current) {
          clearInterval(optimizationPollRef.current);
          optimizationPollRef.current = null;
        }

        if (status.result) {
          setOptimizationState(prev => ({
            ...prev,
            status: "COMPLETED",
            finishedAt: new Date(),
            result: status.result,
          }));
        }
      }
    } catch (error) {
      console.error("Erro ao buscar status da otimização:", error);
    }
  }, [utils]);

  const pollWalkForwardStatus = useCallback(async () => {
    try {
      const status = await utils.institutional.getWalkForwardStatus.fetch();
      
      setWalkForwardState(prev => ({
        ...prev,
        status: status.isRunning ? "RUNNING" : (status.error ? "ERROR" : (status.result ? "COMPLETED" : prev.status)),
        progress: status.progress ? {
          percentComplete: status.progress.percentComplete,
          currentPhase: status.progress.phase,
          message: status.progress.message,
        } : prev.progress,
        error: status.error ? { code: "WALKFORWARD_ERROR", message: status.error } : null,
      }));

      if (!status.isRunning) {
        if (walkForwardPollRef.current) {
          clearInterval(walkForwardPollRef.current);
          walkForwardPollRef.current = null;
        }

        if (status.result) {
          setWalkForwardState(prev => ({
            ...prev,
            status: "COMPLETED",
            finishedAt: new Date(),
            result: status.result,
          }));
        }
      }
    } catch (error) {
      console.error("Erro ao buscar status do Walk-Forward:", error);
    }
  }, [utils]);

  const pollMonteCarloStatus = useCallback(async () => {
    try {
      const status = await utils.institutional.getMonteCarloStatus.fetch();
      
      setMonteCarloState(prev => ({
        ...prev,
        status: status.isRunning ? "RUNNING" : (status.error ? "ERROR" : (status.result ? "COMPLETED" : prev.status)),
        progress: status.progress ? {
          percentComplete: status.progress.percentComplete,
          currentPhase: status.progress.phase,
          message: status.progress.message,
        } : prev.progress,
        error: status.error ? { code: "MONTECARLO_ERROR", message: status.error } : null,
      }));

      if (!status.isRunning) {
        if (monteCarloPollRef.current) {
          clearInterval(monteCarloPollRef.current);
          monteCarloPollRef.current = null;
        }

        if (status.result) {
          setMonteCarloState(prev => ({
            ...prev,
            status: "COMPLETED",
            finishedAt: new Date(),
            result: status.result,
          }));
        }
      }
    } catch (error) {
      console.error("Erro ao buscar status do Monte Carlo:", error);
    }
  }, [utils]);

  const pollRegimeDetectionStatus = useCallback(async () => {
    try {
      const status = await utils.institutional.getRegimeDetectionStatus.fetch();
      
      setRegimeDetectionState(prev => ({
        ...prev,
        status: status.isRunning ? "RUNNING" : (status.error ? "ERROR" : (status.result ? "COMPLETED" : prev.status)),
        progress: status.progress ? {
          percentComplete: status.progress.percentComplete,
          currentPhase: status.progress.phase,
          message: status.progress.message,
        } : prev.progress,
        error: status.error ? { code: "REGIME_ERROR", message: status.error } : null,
      }));

      if (!status.isRunning) {
        if (regimeDetectionPollRef.current) {
          clearInterval(regimeDetectionPollRef.current);
          regimeDetectionPollRef.current = null;
        }

        if (status.result) {
          setRegimeDetectionState(prev => ({
            ...prev,
            status: "COMPLETED",
            finishedAt: new Date(),
            result: status.result,
          }));
        }
      }
    } catch (error) {
      console.error("Erro ao buscar status da detecção de regimes:", error);
    }
  }, [utils]);

  const pollMultiAssetStatus = useCallback(async () => {
    try {
      const status = await utils.institutional.getMultiAssetStatus.fetch();
      
      setMultiAssetState(prev => ({
        ...prev,
        status: status.isRunning ? "RUNNING" : (status.error ? "ERROR" : (status.result ? "COMPLETED" : prev.status)),
        progress: status.progress ? {
          percentComplete: status.progress.percentComplete,
          currentPhase: status.progress.phase,
          message: status.progress.message,
        } : prev.progress,
        error: status.error ? { code: "MULTIASSET_ERROR", message: status.error } : null,
      }));

      if (!status.isRunning) {
        if (multiAssetPollRef.current) {
          clearInterval(multiAssetPollRef.current);
          multiAssetPollRef.current = null;
        }

        if (status.result) {
          setMultiAssetState(prev => ({
            ...prev,
            status: "COMPLETED",
            finishedAt: new Date(),
            result: status.result,
          }));
        }
      }
    } catch (error) {
      console.error("Erro ao buscar status do Multi-Asset:", error);
    }
  }, [utils]);

  // =========================================================================
  // CLEANUP
  // =========================================================================

  useEffect(() => {
    return () => {
      // Limpar todos os intervals ao desmontar
      if (optimizationPollRef.current) clearInterval(optimizationPollRef.current);
      if (walkForwardPollRef.current) clearInterval(walkForwardPollRef.current);
      if (monteCarloPollRef.current) clearInterval(monteCarloPollRef.current);
      if (regimeDetectionPollRef.current) clearInterval(regimeDetectionPollRef.current);
      if (multiAssetPollRef.current) clearInterval(multiAssetPollRef.current);
    };
  }, []);

  // =========================================================================
  // OPTIMIZATION HANDLERS
  // =========================================================================

  const startOptimization = useCallback(async (config: {
    symbols: string[];
    startDate: string;
    endDate: string;
    strategyType: "SMC" | "HYBRID" | "RSI_VWAP";
    parameters: any[];
    validation: {
      enabled: boolean;
      inSampleRatio: number;
      walkForward: {
        enabled: boolean;
        windowMonths: number;
        stepMonths: number;
      };
    };
    objectives: any[];
    seed?: number;
  }) => {
    const runId = `opt-${Date.now()}`;
    
    setOptimizationState({
      runId,
      status: "STARTING",
      progress: null,
      startedAt: new Date(),
      finishedAt: null,
      result: null,
      error: null,
    });

    try {
      await startOptimizationMutation.mutateAsync(config);
      
      setOptimizationState(prev => ({
        ...prev,
        status: "RUNNING",
      }));

      // Iniciar polling
      optimizationPollRef.current = setInterval(pollOptimizationStatus, POLL_INTERVAL);
      
      return { success: true, runId };
    } catch (error: any) {
      setOptimizationState(prev => ({
        ...prev,
        status: "ERROR",
        finishedAt: new Date(),
        error: {
          code: error.data?.code || "UNKNOWN_ERROR",
          message: error.message || "Erro desconhecido ao iniciar otimização",
          context: error.data,
        },
      }));
      
      return { success: false, error: error.message };
    }
  }, [startOptimizationMutation, pollOptimizationStatus]);

  const abortOptimization = useCallback(async () => {
    try {
      await abortOptimizationMutation.mutateAsync();
      
      if (optimizationPollRef.current) {
        clearInterval(optimizationPollRef.current);
        optimizationPollRef.current = null;
      }

      setOptimizationState(prev => ({
        ...prev,
        status: "ABORTED",
        finishedAt: new Date(),
      }));

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }, [abortOptimizationMutation]);

  // =========================================================================
  // WALK-FORWARD HANDLERS
  // =========================================================================

  const runWalkForward = useCallback(async (config: {
    symbol: string;
    parameters: Record<string, number | string | boolean>;
    startDate: string;
    endDate: string;
    windowMonths: number;
    stepMonths: number;
    strategyType: "SMC" | "HYBRID" | "RSI_VWAP";
    initialBalance?: number;
    leverage?: number;
  }) => {
    const runId = `wf-${Date.now()}`;
    
    setWalkForwardState({
      runId,
      status: "STARTING",
      progress: null,
      startedAt: new Date(),
      finishedAt: null,
      result: null,
      error: null,
    });

    try {
      await runWalkForwardMutation.mutateAsync(config);
      
      setWalkForwardState(prev => ({
        ...prev,
        status: "RUNNING",
      }));

      // Iniciar polling
      walkForwardPollRef.current = setInterval(pollWalkForwardStatus, POLL_INTERVAL);
      
      return { success: true, runId };
    } catch (error: any) {
      setWalkForwardState(prev => ({
        ...prev,
        status: "ERROR",
        finishedAt: new Date(),
        error: {
          code: error.data?.code || "UNKNOWN_ERROR",
          message: error.message || "Erro desconhecido ao iniciar Walk-Forward",
          context: error.data,
        },
      }));
      
      return { success: false, error: error.message };
    }
  }, [runWalkForwardMutation, pollWalkForwardStatus]);

  // =========================================================================
  // MONTE CARLO HANDLERS
  // =========================================================================

  const runMonteCarlo = useCallback(async (config: {
    trades: any[];
    simulations?: number;
    method?: "BLOCK_BOOTSTRAP" | "TRADE_RESAMPLING" | "RANDOMIZE_ORDER";
    confidenceLevel?: number;
    initialBalance?: number;
    ruinThreshold?: number;
    blockSize?: number;
    seed?: number;
  }) => {
    const runId = `mc-${Date.now()}`;
    
    setMonteCarloState({
      runId,
      status: "STARTING",
      progress: null,
      startedAt: new Date(),
      finishedAt: null,
      result: null,
      error: null,
    });

    try {
      await runMonteCarloMutation.mutateAsync(config);
      
      setMonteCarloState(prev => ({
        ...prev,
        status: "RUNNING",
      }));

      // Iniciar polling
      monteCarloPollRef.current = setInterval(pollMonteCarloStatus, POLL_INTERVAL);
      
      return { success: true, runId };
    } catch (error: any) {
      setMonteCarloState(prev => ({
        ...prev,
        status: "ERROR",
        finishedAt: new Date(),
        error: {
          code: error.data?.code || "UNKNOWN_ERROR",
          message: error.message || "Erro desconhecido ao iniciar Monte Carlo",
          context: error.data,
        },
      }));
      
      return { success: false, error: error.message };
    }
  }, [runMonteCarloMutation, pollMonteCarloStatus]);

  // =========================================================================
  // REGIME DETECTION HANDLERS
  // =========================================================================

  const runRegimeDetection = useCallback(async (config: {
    symbol: string;
    startDate: string;
    endDate: string;
    timeframe?: string;
    lookbackPeriod?: number;
    volatilityThreshold?: number;
    trendThreshold?: number;
    rangeThreshold?: number;
  }) => {
    const runId = `rd-${Date.now()}`;
    
    setRegimeDetectionState({
      runId,
      status: "STARTING",
      progress: null,
      startedAt: new Date(),
      finishedAt: null,
      result: null,
      error: null,
    });

    try {
      await runRegimeDetectionMutation.mutateAsync(config);
      
      setRegimeDetectionState(prev => ({
        ...prev,
        status: "RUNNING",
      }));

      // Iniciar polling
      regimeDetectionPollRef.current = setInterval(pollRegimeDetectionStatus, POLL_INTERVAL);
      
      return { success: true, runId };
    } catch (error: any) {
      setRegimeDetectionState(prev => ({
        ...prev,
        status: "ERROR",
        finishedAt: new Date(),
        error: {
          code: error.data?.code || "UNKNOWN_ERROR",
          message: error.message || "Erro desconhecido ao iniciar detecção de regimes",
          context: error.data,
        },
      }));
      
      return { success: false, error: error.message };
    }
  }, [runRegimeDetectionMutation, pollRegimeDetectionStatus]);

  // =========================================================================
  // MULTI-ASSET HANDLERS
  // =========================================================================

  const runMultiAsset = useCallback(async (config: {
    symbols: string[];
    strategy: "SMC" | "HYBRID" | "RSI_VWAP";
    startDate: string;
    endDate: string;
    parameters: Record<string, number | string | boolean>;
    initialBalance?: number;
    leverage?: number;
    maxTotalPositions?: number;
    maxPositionsPerSymbol?: number;
    maxDailyDrawdown?: number;
    seed?: number;
  }) => {
    const runId = `ma-${Date.now()}`;
    
    setMultiAssetState({
      runId,
      status: "STARTING",
      progress: null,
      startedAt: new Date(),
      finishedAt: null,
      result: null,
      error: null,
    });

    try {
      await runMultiAssetMutation.mutateAsync(config);
      
      setMultiAssetState(prev => ({
        ...prev,
        status: "RUNNING",
      }));

      // Iniciar polling
      multiAssetPollRef.current = setInterval(pollMultiAssetStatus, POLL_INTERVAL);
      
      return { success: true, runId };
    } catch (error: any) {
      setMultiAssetState(prev => ({
        ...prev,
        status: "ERROR",
        finishedAt: new Date(),
        error: {
          code: error.data?.code || "UNKNOWN_ERROR",
          message: error.message || "Erro desconhecido ao iniciar Multi-Asset",
          context: error.data,
        },
      }));
      
      return { success: false, error: error.message };
    }
  }, [runMultiAssetMutation, pollMultiAssetStatus]);

  const abortMultiAsset = useCallback(async () => {
    try {
      await abortMultiAssetMutation.mutateAsync();
      
      if (multiAssetPollRef.current) {
        clearInterval(multiAssetPollRef.current);
        multiAssetPollRef.current = null;
      }

      setMultiAssetState(prev => ({
        ...prev,
        status: "ABORTED",
        finishedAt: new Date(),
      }));

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }, [abortMultiAssetMutation]);

  // =========================================================================
  // ISOLATED BACKTEST HANDLERS
  // =========================================================================

  const runIsolatedBacktest = useCallback(async (config: {
    symbol: string;
    startDate: string;
    endDate: string;
    parameters: Record<string, number | string | boolean>;
    strategyType: "SMC" | "HYBRID" | "RSI_VWAP";
    initialBalance?: number;
    leverage?: number;
    seed?: number;
  }) => {
    const runId = `iso-${Date.now()}`;
    
    setIsolatedBacktestState({
      runId,
      status: "STARTING",
      progress: null,
      startedAt: new Date(),
      finishedAt: null,
      result: null,
      error: null,
    });

    try {
      const result = await runIsolatedBacktestMutation.mutateAsync(config);
      
      setIsolatedBacktestState(prev => ({
        ...prev,
        status: "COMPLETED",
        finishedAt: new Date(),
        result,
      }));
      
      return { success: true, runId, result };
    } catch (error: any) {
      setIsolatedBacktestState(prev => ({
        ...prev,
        status: "ERROR",
        finishedAt: new Date(),
        error: {
          code: error.data?.code || "UNKNOWN_ERROR",
          message: error.message || "Erro desconhecido ao executar backtest isolado",
          context: error.data,
        },
      }));
      
      return { success: false, error: error.message };
    }
  }, [runIsolatedBacktestMutation]);

  // =========================================================================
  // RESET FUNCTIONS
  // =========================================================================

  const resetOptimization = useCallback(() => {
    if (optimizationPollRef.current) {
      clearInterval(optimizationPollRef.current);
      optimizationPollRef.current = null;
    }
    setOptimizationState(createInitialState());
  }, []);

  const resetWalkForward = useCallback(() => {
    if (walkForwardPollRef.current) {
      clearInterval(walkForwardPollRef.current);
      walkForwardPollRef.current = null;
    }
    setWalkForwardState(createInitialState());
  }, []);

  const resetMonteCarlo = useCallback(() => {
    if (monteCarloPollRef.current) {
      clearInterval(monteCarloPollRef.current);
      monteCarloPollRef.current = null;
    }
    setMonteCarloState(createInitialState());
  }, []);

  const resetRegimeDetection = useCallback(() => {
    if (regimeDetectionPollRef.current) {
      clearInterval(regimeDetectionPollRef.current);
      regimeDetectionPollRef.current = null;
    }
    setRegimeDetectionState(createInitialState());
  }, []);

  const resetMultiAsset = useCallback(() => {
    if (multiAssetPollRef.current) {
      clearInterval(multiAssetPollRef.current);
      multiAssetPollRef.current = null;
    }
    setMultiAssetState(createInitialState());
  }, []);

  const resetIsolatedBacktest = useCallback(() => {
    setIsolatedBacktestState(createInitialState());
  }, []);

  const resetAll = useCallback(() => {
    resetOptimization();
    resetWalkForward();
    resetMonteCarlo();
    resetRegimeDetection();
    resetMultiAsset();
    resetIsolatedBacktest();
  }, [resetOptimization, resetWalkForward, resetMonteCarlo, resetRegimeDetection, resetMultiAsset, resetIsolatedBacktest]);

  // =========================================================================
  // RETURN
  // =========================================================================

  return {
    // States
    optimization: optimizationState,
    walkForward: walkForwardState,
    monteCarlo: monteCarloState,
    regimeDetection: regimeDetectionState,
    multiAsset: multiAssetState,
    isolatedBacktest: isolatedBacktestState,

    // Optimization actions
    startOptimization,
    abortOptimization,
    resetOptimization,

    // Walk-Forward actions
    runWalkForward,
    resetWalkForward,

    // Monte Carlo actions
    runMonteCarlo,
    resetMonteCarlo,

    // Regime Detection actions
    runRegimeDetection,
    resetRegimeDetection,

    // Multi-Asset actions
    runMultiAsset,
    abortMultiAsset,
    resetMultiAsset,

    // Isolated Backtest actions
    runIsolatedBacktest,
    resetIsolatedBacktest,

    // Global actions
    resetAll,

    // Loading states
    isLoading: {
      optimization: startOptimizationMutation.isPending,
      walkForward: runWalkForwardMutation.isPending,
      monteCarlo: runMonteCarloMutation.isPending,
      regimeDetection: runRegimeDetectionMutation.isPending,
      multiAsset: runMultiAssetMutation.isPending,
      isolatedBacktest: runIsolatedBacktestMutation.isPending,
    },
  };
}

export default useInstitutionalLab;
