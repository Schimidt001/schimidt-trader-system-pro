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
 * IMPLEMENTAÇÃO DE PERSISTÊNCIA E RESILIÊNCIA (TAREFA 2):
 * - Persistência do runId no localStorage
 * - Recuperação automática de estado após recarregamento (F5) ou troca de aba
 * - Tratamento robusto de erros 404/JobNotFound (reset automático)
 *
 * CORREÇÃO v2.1.0 - ERROS 502 E PERSISTÊNCIA:
 * - Implementação de retry automático com backoff exponencial para erros 502
 * - Contador de erros consecutivos para evitar loops infinitos
 * - Persistência do estado de polling mesmo ao sair da aba
 * - Isolamento completo do laboratório (não afeta conexão live)
 *
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 2.1.0
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
// PERSISTENCE UTILS (LocalStorage)
// ============================================================================

import { 
  saveRunId, 
  loadRunId, 
  clearRunId,
  saveLabState,
  loadLabState,
  clearLabState,
  LabPersistenceState,
} from "./persistenceUtils";

// ============================================================================
// CONSTANTS
// ============================================================================

/** Intervalo base de polling em ms */
const POLL_INTERVAL = 1000;

/** Número máximo de erros consecutivos antes de parar o polling */
const MAX_CONSECUTIVE_ERRORS = 10;

/** Tempo máximo de backoff em ms (30 segundos) */
const MAX_BACKOFF_MS = 30000;

/** Erros que devem acionar retry automático */
const RETRYABLE_ERROR_CODES = [502, 503, 504, 'FETCH_ERROR', 'TIMEOUT', 'NETWORK_ERROR'];

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
// HELPER FUNCTIONS
// ============================================================================

/**
 * Verifica se um erro é retentável (502, 503, 504, network errors)
 */
function isRetryableError(error: any): boolean {
  if (!error) return false;
  
  // Verificar código HTTP
  const httpCode = error.data?.httpStatus || error.status || error.code;
  if (typeof httpCode === 'number' && RETRYABLE_ERROR_CODES.includes(httpCode)) {
    return true;
  }
  
  // Verificar código de erro string
  const errorCode = error.data?.code || error.code;
  if (typeof errorCode === 'string' && RETRYABLE_ERROR_CODES.includes(errorCode)) {
    return true;
  }
  
  // Verificar mensagem de erro
  const message = error.message || '';
  if (
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('Bad Gateway') ||
    message.includes('Service Unavailable') ||
    message.includes('Gateway Timeout') ||
    message.includes('fetch failed') ||
    message.includes('network')
  ) {
    return true;
  }
  
  return false;
}

/**
 * Calcula o tempo de backoff exponencial
 */
function calculateBackoff(errorCount: number): number {
  const baseDelay = POLL_INTERVAL;
  const exponentialDelay = baseDelay * Math.pow(2, Math.min(errorCount, 5));
  return Math.min(exponentialDelay, MAX_BACKOFF_MS);
}

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

  // Refs para contadores de erros consecutivos (para retry com backoff)
  const optimizationErrorCountRef = useRef<number>(0);
  const walkForwardErrorCountRef = useRef<number>(0);
  const monteCarloErrorCountRef = useRef<number>(0);
  const regimeDetectionErrorCountRef = useRef<number>(0);
  const multiAssetErrorCountRef = useRef<number>(0);

  // Ref para controlar se o componente está montado
  const isMountedRef = useRef<boolean>(true);

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
  // POLLING FUNCTIONS COM RETRY AUTOMÁTICO
  // =========================================================================

  /**
   * Agenda o próximo poll com backoff se necessário
   */
  const scheduleNextPoll = useCallback((
    pollRef: React.MutableRefObject<NodeJS.Timeout | null>,
    errorCountRef: React.MutableRefObject<number>,
    pollFn: () => Promise<void>
  ) => {
    if (!isMountedRef.current) return;
    
    // Limpar interval anterior
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    
    // Calcular delay com backoff se houver erros
    const delay = errorCountRef.current > 0 
      ? calculateBackoff(errorCountRef.current)
      : POLL_INTERVAL;
    
    // Agendar próximo poll
    pollRef.current = setTimeout(async () => {
      if (isMountedRef.current) {
        await pollFn();
      }
    }, delay);
  }, []);

  const pollOptimizationStatus = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    try {
      const status = await utils.institutional.getOptimizationStatus.fetch();
      
      // Reset contador de erros em caso de sucesso
      optimizationErrorCountRef.current = 0;
      
      // Verificar se job foi perdido (NOT_FOUND)
      if (status.status === "NOT_FOUND") {
        console.warn("[Lab] Job de otimização não encontrado. Resetando estado.");
        clearRunId();
        clearLabState();
        if (optimizationPollRef.current) {
          clearTimeout(optimizationPollRef.current);
          optimizationPollRef.current = null;
        }
        setOptimizationState(createInitialState());
        return;
      }
      
      setOptimizationState(prev => {
        // Se o status mudou para não rodando, limpar persistência
        if (!status.isRunning && status.status !== "QUEUED") {
          clearRunId();
        }

        return {
          ...prev,
          runId: status.runId || prev.runId,
          status: status.isRunning ? "RUNNING" : (status.error ? "ERROR" : (status.status === "COMPLETED" ? "COMPLETED" : prev.status)),
          progress: status.progress ? {
            percentComplete: status.progress.percentComplete,
            currentPhase: status.progress.phase || "RUNNING",
            message: status.progress.statusMessage || "Processando...",
            estimatedTimeRemaining: status.progress.estimatedTimeRemaining,
            elapsedTime: status.progress.elapsedTime,
          } : prev.progress,
          error: status.error ? { code: "OPTIMIZATION_ERROR", message: status.error } : null,
        };
      });

      // Se completou ou erro, buscar resultados separadamente e parar polling
      if (!status.isRunning && status.status !== "QUEUED") {
        if (optimizationPollRef.current) {
          clearTimeout(optimizationPollRef.current);
          optimizationPollRef.current = null;
        }

        // Buscar resultados separadamente
        try {
          const result = await utils.institutional.getOptimizationResults.fetch();
          if (result) {
            setOptimizationState(prev => ({
              ...prev,
              status: "COMPLETED",
              finishedAt: new Date(),
              result: result,
            }));
          }
        } catch (resultError) {
          console.error("Erro ao buscar resultados da otimização:", resultError);
        }
        return;
      }

      // Continuar polling se ainda estiver rodando
      if (status.isRunning || status.status === "QUEUED") {
        scheduleNextPoll(optimizationPollRef, optimizationErrorCountRef, pollOptimizationStatus);
      }

    } catch (error: any) {
      console.error("Erro ao buscar status da otimização:", error);

      // CORREÇÃO: Verificar se é erro retentável (502, etc)
      if (isRetryableError(error)) {
        optimizationErrorCountRef.current++;
        console.warn(`[Lab] Erro retentável (${optimizationErrorCountRef.current}/${MAX_CONSECUTIVE_ERRORS}). Tentando novamente com backoff...`);
        
        // Se ainda não atingiu o limite, continuar tentando
        if (optimizationErrorCountRef.current < MAX_CONSECUTIVE_ERRORS) {
          scheduleNextPoll(optimizationPollRef, optimizationErrorCountRef, pollOptimizationStatus);
          return;
        } else {
          console.error("[Lab] Limite de erros consecutivos atingido. Parando polling.");
          setOptimizationState(prev => ({
            ...prev,
            error: {
              code: "MAX_RETRIES_EXCEEDED",
              message: `Falha após ${MAX_CONSECUTIVE_ERRORS} tentativas. Verifique a conexão e tente novamente.`,
              context: { lastError: error.message },
            },
          }));
        }
      }

      // RESILIÊNCIA: Se erro 404 ou job not found, resetar estado e limpar persistência
      if (error?.data?.code === "NOT_FOUND" || error?.message?.includes("Job not found")) {
        console.warn("Job perdido ou expirado. Resetando estado.");
        clearRunId();
        clearLabState();
        if (optimizationPollRef.current) {
          clearTimeout(optimizationPollRef.current);
          optimizationPollRef.current = null;
        }
        setOptimizationState(createInitialState());
      }
    }
  }, [utils, scheduleNextPoll]);

  const pollWalkForwardStatus = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    try {
      const status = await utils.institutional.getWalkForwardStatus.fetch();
      
      // Reset contador de erros em caso de sucesso
      walkForwardErrorCountRef.current = 0;
      
      setWalkForwardState(prev => ({
        ...prev,
        status: status.isRunning ? "RUNNING" : (status.error ? "ERROR" : prev.status),
        progress: status.progress ? {
          percentComplete: status.progress.percentComplete,
          currentPhase: status.progress.phase || "RUNNING",
          message: status.progress.statusMessage || "Processando...",
        } : prev.progress,
        error: status.error ? { code: "WALKFORWARD_ERROR", message: status.error } : null,
      }));

      if (!status.isRunning) {
        if (walkForwardPollRef.current) {
          clearTimeout(walkForwardPollRef.current);
          walkForwardPollRef.current = null;
        }

        try {
          const result = await utils.institutional.getWalkForwardResults.fetch();
          if (result) {
            setWalkForwardState(prev => ({
              ...prev,
              status: "COMPLETED",
              finishedAt: new Date(),
              result: result,
            }));
          }
        } catch (resultError) {
          console.error("Erro ao buscar resultados do Walk-Forward:", resultError);
        }
        return;
      }

      // Continuar polling
      scheduleNextPoll(walkForwardPollRef, walkForwardErrorCountRef, pollWalkForwardStatus);

    } catch (error: any) {
      console.error("Erro ao buscar status do Walk-Forward:", error);
      
      if (isRetryableError(error)) {
        walkForwardErrorCountRef.current++;
        if (walkForwardErrorCountRef.current < MAX_CONSECUTIVE_ERRORS) {
          scheduleNextPoll(walkForwardPollRef, walkForwardErrorCountRef, pollWalkForwardStatus);
          return;
        }
      }
    }
  }, [utils, scheduleNextPoll]);

  const pollMonteCarloStatus = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    try {
      const status = await utils.institutional.getMonteCarloStatus.fetch();
      
      // Reset contador de erros em caso de sucesso
      monteCarloErrorCountRef.current = 0;
      
      setMonteCarloState(prev => ({
        ...prev,
        status: status.isRunning ? "RUNNING" : (status.error ? "ERROR" : prev.status),
        progress: status.progress ? {
          percentComplete: status.progress.percentComplete,
          currentPhase: status.progress.phase || "RUNNING",
          message: status.progress.statusMessage || "Processando...",
        } : prev.progress,
        error: status.error ? { code: "MONTECARLO_ERROR", message: status.error } : null,
      }));

      if (!status.isRunning) {
        if (monteCarloPollRef.current) {
          clearTimeout(monteCarloPollRef.current);
          monteCarloPollRef.current = null;
        }

        try {
          const result = await utils.institutional.getMonteCarloResults.fetch();
          if (result) {
            setMonteCarloState(prev => ({
              ...prev,
              status: "COMPLETED",
              finishedAt: new Date(),
              result: result,
            }));
          }
        } catch (resultError) {
          console.error("Erro ao buscar resultados do Monte Carlo:", resultError);
        }
        return;
      }

      // Continuar polling
      scheduleNextPoll(monteCarloPollRef, monteCarloErrorCountRef, pollMonteCarloStatus);

    } catch (error: any) {
      console.error("Erro ao buscar status do Monte Carlo:", error);
      
      if (isRetryableError(error)) {
        monteCarloErrorCountRef.current++;
        if (monteCarloErrorCountRef.current < MAX_CONSECUTIVE_ERRORS) {
          scheduleNextPoll(monteCarloPollRef, monteCarloErrorCountRef, pollMonteCarloStatus);
          return;
        }
      }
    }
  }, [utils, scheduleNextPoll]);

  const pollRegimeDetectionStatus = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    try {
      const status = await utils.institutional.getRegimeDetectionStatus.fetch();
      
      // Reset contador de erros em caso de sucesso
      regimeDetectionErrorCountRef.current = 0;
      
      setRegimeDetectionState(prev => ({
        ...prev,
        status: status.isRunning ? "RUNNING" : (status.error ? "ERROR" : prev.status),
        progress: status.progress ? {
          percentComplete: status.progress.percentComplete,
          currentPhase: status.progress.phase || "RUNNING",
          message: status.progress.statusMessage || "Processando...",
        } : prev.progress,
        error: status.error ? { code: "REGIME_ERROR", message: status.error } : null,
      }));

      if (!status.isRunning) {
        if (regimeDetectionPollRef.current) {
          clearTimeout(regimeDetectionPollRef.current);
          regimeDetectionPollRef.current = null;
        }

        try {
          const result = await utils.institutional.getRegimeDetectionResults.fetch();
          if (result) {
            setRegimeDetectionState(prev => ({
              ...prev,
              status: "COMPLETED",
              finishedAt: new Date(),
              result: result,
            }));
          }
        } catch (resultError) {
          console.error("Erro ao buscar resultados da detecção de regimes:", resultError);
        }
        return;
      }

      // Continuar polling
      scheduleNextPoll(regimeDetectionPollRef, regimeDetectionErrorCountRef, pollRegimeDetectionStatus);

    } catch (error: any) {
      console.error("Erro ao buscar status da detecção de regimes:", error);
      
      if (isRetryableError(error)) {
        regimeDetectionErrorCountRef.current++;
        if (regimeDetectionErrorCountRef.current < MAX_CONSECUTIVE_ERRORS) {
          scheduleNextPoll(regimeDetectionPollRef, regimeDetectionErrorCountRef, pollRegimeDetectionStatus);
          return;
        }
      }
    }
  }, [utils, scheduleNextPoll]);

  const pollMultiAssetStatus = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    try {
      const status = await utils.institutional.getMultiAssetStatus.fetch();
      
      // Reset contador de erros em caso de sucesso
      multiAssetErrorCountRef.current = 0;
      
      setMultiAssetState(prev => ({
        ...prev,
        status: status.isRunning ? "RUNNING" : (status.error ? "ERROR" : prev.status),
        progress: status.progress ? {
          percentComplete: status.progress.percentComplete,
          currentPhase: status.progress.phase || "RUNNING",
          message: status.progress.message || "Processando...",
        } : prev.progress,
        error: status.error ? { code: "MULTIASSET_ERROR", message: status.error } : null,
      }));

      if (!status.isRunning) {
        if (multiAssetPollRef.current) {
          clearTimeout(multiAssetPollRef.current);
          multiAssetPollRef.current = null;
        }

        try {
          const result = await utils.institutional.getMultiAssetResults.fetch();
          if (result) {
            setMultiAssetState(prev => ({
              ...prev,
              status: "COMPLETED",
              finishedAt: new Date(),
              result: result,
            }));
          }
        } catch (resultError) {
          console.error("Erro ao buscar resultados do Multi-Asset:", resultError);
        }
        return;
      }

      // Continuar polling
      scheduleNextPoll(multiAssetPollRef, multiAssetErrorCountRef, pollMultiAssetStatus);

    } catch (error: any) {
      console.error("Erro ao buscar status do Multi-Asset:", error);
      
      if (isRetryableError(error)) {
        multiAssetErrorCountRef.current++;
        if (multiAssetErrorCountRef.current < MAX_CONSECUTIVE_ERRORS) {
          scheduleNextPoll(multiAssetPollRef, multiAssetErrorCountRef, pollMultiAssetStatus);
          return;
        }
      }
    }
  }, [utils, scheduleNextPoll]);

  // =========================================================================
  // PERSISTENCE EFFECT (ON MOUNT)
  // =========================================================================

  useEffect(() => {
    isMountedRef.current = true;
    
    // Tentar recuperar estado completo do laboratório
    const savedState = loadLabState();
    
    if (savedState) {
      console.log(`[useInstitutionalLab] Estado persistido encontrado. Retomando polling...`);
      
      // Restaurar estado de otimização se houver
      if (savedState.optimizationRunId) {
        setOptimizationState(prev => ({
          ...prev,
          runId: savedState.optimizationRunId!,
          status: "RUNNING",
          startedAt: new Date(savedState.timestamp),
        }));
        
        // Iniciar polling imediatamente
        pollOptimizationStatus();
      }
      
      // Restaurar estado de walk-forward se houver
      if (savedState.walkForwardRunning) {
        setWalkForwardState(prev => ({
          ...prev,
          status: "RUNNING",
          startedAt: new Date(savedState.timestamp),
        }));
        pollWalkForwardStatus();
      }
      
      // Restaurar estado de monte carlo se houver
      if (savedState.monteCarloRunning) {
        setMonteCarloState(prev => ({
          ...prev,
          status: "RUNNING",
          startedAt: new Date(savedState.timestamp),
        }));
        pollMonteCarloStatus();
      }
      
      // Restaurar estado de regime detection se houver
      if (savedState.regimeDetectionRunning) {
        setRegimeDetectionState(prev => ({
          ...prev,
          status: "RUNNING",
          startedAt: new Date(savedState.timestamp),
        }));
        pollRegimeDetectionStatus();
      }
      
      // Restaurar estado de multi-asset se houver
      if (savedState.multiAssetRunning) {
        setMultiAssetState(prev => ({
          ...prev,
          status: "RUNNING",
          startedAt: new Date(savedState.timestamp),
        }));
        pollMultiAssetStatus();
      }
    } else {
      // Fallback: tentar recuperar apenas runId de otimização (compatibilidade)
      const savedRunId = loadRunId();
      if (savedRunId) {
        console.log(`[useInstitutionalLab] RunId persistido encontrado: ${savedRunId}. Retomando polling...`);
        setOptimizationState(prev => ({
          ...prev,
          runId: savedRunId,
          status: "RUNNING",
          startedAt: new Date(),
        }));
        pollOptimizationStatus();
      }
    }

    return () => {
      isMountedRef.current = false;
      
      // NÃO limpar os intervals aqui - queremos que o polling continue em background
      // Os intervals serão limpos apenas quando o job terminar ou for abortado
      
      // Salvar estado atual para persistência
      const currentState: LabPersistenceState = {
        optimizationRunId: optimizationState.runId || undefined,
        walkForwardRunning: walkForwardState.status === "RUNNING",
        monteCarloRunning: monteCarloState.status === "RUNNING",
        regimeDetectionRunning: regimeDetectionState.status === "RUNNING",
        multiAssetRunning: multiAssetState.status === "RUNNING",
        timestamp: Date.now(),
      };
      
      // Só salvar se houver algo rodando
      if (
        currentState.optimizationRunId ||
        currentState.walkForwardRunning ||
        currentState.monteCarloRunning ||
        currentState.regimeDetectionRunning ||
        currentState.multiAssetRunning
      ) {
        saveLabState(currentState);
      }
    };
  }, []); // Executar apenas na montagem

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
    // Resetar estado anterior
    if (optimizationPollRef.current) {
      clearTimeout(optimizationPollRef.current);
      optimizationPollRef.current = null;
    }
    clearRunId();
    clearLabState();
    optimizationErrorCountRef.current = 0;
    
    setOptimizationState({
      runId: null,
      status: "STARTING",
      progress: null,
      startedAt: new Date(),
      finishedAt: null,
      result: null,
      error: null,
    });

    try {
      const result = await startOptimizationMutation.mutateAsync(config);
      
      if (result.success && result.runId) {
        const runId = result.runId;

        // Salvar runId para persistência
        saveRunId(runId);
        saveLabState({
          optimizationRunId: runId,
          timestamp: Date.now(),
        });

        setOptimizationState(prev => ({
          ...prev,
          runId,
          status: "RUNNING",
        }));

        // Iniciar polling
        scheduleNextPoll(optimizationPollRef, optimizationErrorCountRef, pollOptimizationStatus);

        return { success: true, runId };
      } else {
        throw new Error("Falha ao iniciar otimização: runId não retornado");
      }
    } catch (error: any) {
      // CORREÇÃO TAREFA 5: Extrair código de erro estruturado do backend
      const errorCode = error.data?.code || 
                        error.data?.cause?.code || 
                        (error.message?.includes("LAB_") ? error.message.split(":")[0].trim() : "LAB_INTERNAL_ERROR");
      
      const errorMessage = error.message?.includes(":") 
        ? error.message.split(":").slice(1).join(":").trim()
        : error.message || "Erro desconhecido ao iniciar otimização";
      
      setOptimizationState(prev => ({
        ...prev,
        status: "ERROR",
        finishedAt: new Date(),
        error: {
          code: errorCode,
          message: errorMessage,
          context: error.data?.cause || error.data,
        },
      }));
      
      return { success: false, error: errorMessage, code: errorCode };
    }
  }, [startOptimizationMutation, pollOptimizationStatus, scheduleNextPoll]);

  const abortOptimization = useCallback(async () => {
    try {
      await abortOptimizationMutation.mutateAsync();
      
      if (optimizationPollRef.current) {
        clearTimeout(optimizationPollRef.current);
        optimizationPollRef.current = null;
      }

      // Limpar persistência ao abortar
      clearRunId();
      clearLabState();

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
    walkForwardErrorCountRef.current = 0;
    
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

      // Salvar estado para persistência
      const currentState = loadLabState() || { timestamp: Date.now() };
      saveLabState({ ...currentState, walkForwardRunning: true });

      // Iniciar polling
      scheduleNextPoll(walkForwardPollRef, walkForwardErrorCountRef, pollWalkForwardStatus);
      
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
  }, [runWalkForwardMutation, pollWalkForwardStatus, scheduleNextPoll]);

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
    monteCarloErrorCountRef.current = 0;
    
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

      // Salvar estado para persistência
      const currentState = loadLabState() || { timestamp: Date.now() };
      saveLabState({ ...currentState, monteCarloRunning: true });

      // Iniciar polling
      scheduleNextPoll(monteCarloPollRef, monteCarloErrorCountRef, pollMonteCarloStatus);
      
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
  }, [runMonteCarloMutation, pollMonteCarloStatus, scheduleNextPoll]);

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
    regimeDetectionErrorCountRef.current = 0;
    
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

      // Salvar estado para persistência
      const currentState = loadLabState() || { timestamp: Date.now() };
      saveLabState({ ...currentState, regimeDetectionRunning: true });

      // Iniciar polling
      scheduleNextPoll(regimeDetectionPollRef, regimeDetectionErrorCountRef, pollRegimeDetectionStatus);
      
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
  }, [runRegimeDetectionMutation, pollRegimeDetectionStatus, scheduleNextPoll]);

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
    multiAssetErrorCountRef.current = 0;
    
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

      // Salvar estado para persistência
      const currentState = loadLabState() || { timestamp: Date.now() };
      saveLabState({ ...currentState, multiAssetRunning: true });

      // Iniciar polling
      scheduleNextPoll(multiAssetPollRef, multiAssetErrorCountRef, pollMultiAssetStatus);
      
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
  }, [runMultiAssetMutation, pollMultiAssetStatus, scheduleNextPoll]);

  const abortMultiAsset = useCallback(async () => {
    try {
      await abortMultiAssetMutation.mutateAsync();
      
      if (multiAssetPollRef.current) {
        clearTimeout(multiAssetPollRef.current);
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
      // Mapear strategyType para strategy conforme esperado pelo backend
      const mutationConfig = {
        symbol: config.symbol,
        strategy: config.strategyType,
        startDate: config.startDate,
        endDate: config.endDate,
        parameters: config.parameters,
        initialBalance: config.initialBalance,
        leverage: config.leverage,
        seed: config.seed,
      };
      const result = await runIsolatedBacktestMutation.mutateAsync(mutationConfig);
      
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
      clearTimeout(optimizationPollRef.current);
      optimizationPollRef.current = null;
    }
    optimizationErrorCountRef.current = 0;
    clearRunId();
    clearLabState();
    setOptimizationState(createInitialState());
  }, []);

  const resetWalkForward = useCallback(() => {
    if (walkForwardPollRef.current) {
      clearTimeout(walkForwardPollRef.current);
      walkForwardPollRef.current = null;
    }
    walkForwardErrorCountRef.current = 0;
    setWalkForwardState(createInitialState());
  }, []);

  const resetMonteCarlo = useCallback(() => {
    if (monteCarloPollRef.current) {
      clearTimeout(monteCarloPollRef.current);
      monteCarloPollRef.current = null;
    }
    monteCarloErrorCountRef.current = 0;
    setMonteCarloState(createInitialState());
  }, []);

  const resetRegimeDetection = useCallback(() => {
    if (regimeDetectionPollRef.current) {
      clearTimeout(regimeDetectionPollRef.current);
      regimeDetectionPollRef.current = null;
    }
    regimeDetectionErrorCountRef.current = 0;
    setRegimeDetectionState(createInitialState());
  }, []);

  const resetMultiAsset = useCallback(() => {
    if (multiAssetPollRef.current) {
      clearTimeout(multiAssetPollRef.current);
      multiAssetPollRef.current = null;
    }
    multiAssetErrorCountRef.current = 0;
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
