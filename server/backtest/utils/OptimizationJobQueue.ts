/**
 * OptimizationJobQueue - Sistema de Fila de Jobs para Otimização Assíncrona
 * 
 * CORREÇÃO DO 502 BAD GATEWAY:
 * Este módulo implementa um sistema de fila que permite:
 * - startOptimization retornar em <300ms (enqueue-only)
 * - Execução pesada fora da request HTTP
 * - Heartbeat para monitoramento de progresso
 * - Guard rails de combinações e paralelismo
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 2.0.0
 */

import { labLogger, optimizationLogger } from "./LabLogger";
import { GridSearchEngine } from "../optimization/GridSearchEngine";
import { GridSearchEngineOptimized } from "../optimization/GridSearchEngineOptimized";
import { memoryManager } from "./MemoryManager";
import { OptimizationConfig, OptimizationProgress, OptimizationFinalResult, ParameterType } from "../optimization/types/optimization.types";

// ============================================================================
// TYPES
// ============================================================================

export type JobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "ABORTED";

export interface OptimizationJob {
  runId: string;
  status: JobStatus;
  config: OptimizationConfig;
  progress: OptimizationProgress | null;
  result: OptimizationFinalResult | null;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  lastProgressAt: Date | null;
  totalCombinations: number;
}

export interface JobQueueConfig {
  /** Intervalo do heartbeat em ms (atualiza lastProgressAt) */
  heartbeatIntervalMs: number;
  /** Máximo de combinações permitidas */
  maxCombinations: number;
  /** Máximo de workers paralelos */
  maxParallelWorkers: number;
  /** Timeout para jobs em ms (0 = sem timeout) */
  jobTimeoutMs: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_JOB_QUEUE_CONFIG: JobQueueConfig = {
  heartbeatIntervalMs: 5000, // 5 segundos
  maxCombinations: 10000,
  maxParallelWorkers: 2, // Reduzido para não travar CPU do Railway
  jobTimeoutMs: 0, // Sem timeout por padrão
};

// ============================================================================
// JOB QUEUE CLASS
// ============================================================================

export class OptimizationJobQueue {
  private static instance: OptimizationJobQueue | null = null;
  private config: JobQueueConfig;
  private currentJob: OptimizationJob | null = null;
  private activeEngine: GridSearchEngine | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  
  constructor(config: Partial<JobQueueConfig> = {}) {
    this.config = { ...DEFAULT_JOB_QUEUE_CONFIG, ...config };
  }
  
  /**
   * Obtém instância singleton
   */
  static getInstance(): OptimizationJobQueue {
    if (!OptimizationJobQueue.instance) {
      OptimizationJobQueue.instance = new OptimizationJobQueue();
    }
    return OptimizationJobQueue.instance;
  }
  
  /**
   * CHECKPOINT: startOptimization.enter
   * Valida input e calcula combinações
   */
  validateAndCalculateCombinations(config: OptimizationConfig): { 
    valid: boolean; 
    totalCombinations: number; 
    error?: string;
    errorCode?: string;
  } {
    const startTime = Date.now();
    labLogger.info("CHECKPOINT: startOptimization.enter", "JobQueue");
    
    // Calcular número de combinações
    let totalCombinations = 1;
    
    for (const param of config.parameters) {
      if (param.enabled && !param.locked) {
        if (param.type === ParameterType.BOOLEAN) {
          totalCombinations *= 2;
        } else if (
          (param.type === ParameterType.INTEGER || 
           param.type === ParameterType.DECIMAL || 
           param.type === ParameterType.PERCENTAGE) && 
          param.min !== undefined && 
          param.max !== undefined && 
          param.step !== undefined
        ) {
          const steps = Math.floor((param.max - param.min) / param.step) + 1;
          totalCombinations *= Math.max(1, steps);
        } else if (param.type === ParameterType.ENUM && param.values && param.values.length > 0) {
          totalCombinations *= param.values.length;
        }
      }
    }
    
    labLogger.info(`Combinações calculadas: ${totalCombinations.toLocaleString()}`, "JobQueue");
    
    // Guard rail: verificar limite de combinações
    if (totalCombinations > this.config.maxCombinations) {
      const error = `LAB_TOO_MANY_COMBINATIONS: ${totalCombinations.toLocaleString()} combinações excedem o limite de ${this.config.maxCombinations.toLocaleString()}`;
      labLogger.error(error, undefined, "JobQueue");
      return {
        valid: false,
        totalCombinations,
        error,
        errorCode: "LAB_TOO_MANY_COMBINATIONS",
      };
    }
    
    const elapsed = Date.now() - startTime;
    labLogger.info(`Validação concluída em ${elapsed}ms`, "JobQueue");
    
    return { valid: true, totalCombinations };
  }
  
  /**
   * CORREÇÃO 1: Enqueue-only - Cria job e retorna runId em <300ms
   * CHECKPOINT: startOptimization.returning_runId
   */
  enqueueJob(config: OptimizationConfig, totalCombinations: number): { runId: string; enqueuedAt: Date } {
    const startTime = Date.now();
    
    // Gerar runId único
    const runId = `opt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Criar job com status QUEUED
    this.currentJob = {
      runId,
      status: "QUEUED",
      config,
      progress: null,
      result: null,
      error: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      lastProgressAt: null,
      totalCombinations,
    };
    
    const elapsed = Date.now() - startTime;
    labLogger.info(`CHECKPOINT: startOptimization.returning_runId | runId=${runId} | elapsed=${elapsed}ms`, "JobQueue");
    
    // Disparar execução async (fora da request)
    setImmediate(() => this.executeJob(runId));
    
    return { runId, enqueuedAt: this.currentJob.createdAt };
  }
  
  /**
   * CORREÇÃO 2: Execução pesada fora da request com heartbeat
   * CHECKPOINTS: job.start, job.loaded_data, job.first_iteration, job.progress_5_percent, job.completed/job.failed
   */
  private async executeJob(runId: string): Promise<void> {
    if (!this.currentJob || this.currentJob.runId !== runId) {
      labLogger.error(`Job ${runId} não encontrado`, undefined, "JobQueue");
      return;
    }
    
    // CHECKPOINT: job.start
    labLogger.info(`CHECKPOINT: job.start(${runId})`, "JobQueue");
    optimizationLogger.startOperation("Grid Search Async", { 
      runId, 
      combinacoes: this.currentJob.totalCombinations 
    });
    
    this.currentJob.status = "RUNNING";
    this.currentJob.startedAt = new Date();
    this.currentJob.lastProgressAt = new Date();
    
    // Iniciar heartbeat
    this.startHeartbeat(runId);
    
    try {
      // Limitar paralelismo para não travar CPU
      const adjustedConfig: OptimizationConfig = {
        ...this.currentJob.config,
        parallelWorkers: Math.min(
          this.currentJob.config.parallelWorkers || 4,
          this.config.maxParallelWorkers
        ),
      };
      
      labLogger.info(`Workers ajustados: ${adjustedConfig.parallelWorkers} (max: ${this.config.maxParallelWorkers})`, "JobQueue");
      
      // CORREÇÃO OOM: Usar engine otimizado para memória
      // O GridSearchEngineOptimized mantém apenas Top-N resultados em memória
      const useOptimizedEngine = true; // Feature flag para rollback se necessário
      
      if (useOptimizedEngine) {
        const optimizedEngine = new GridSearchEngineOptimized(adjustedConfig);
        this.activeEngine = optimizedEngine as unknown as GridSearchEngine;
        labLogger.info("Usando GridSearchEngineOptimized (memória otimizada)", "JobQueue");
      } else {
        this.activeEngine = new GridSearchEngine(adjustedConfig);
        labLogger.info("Usando GridSearchEngine (padrão)", "JobQueue");
      }
      
      // Log de memória inicial
      memoryManager.logMemoryStats("JobQueue - Antes da otimização");
      
      // CHECKPOINT: job.loaded_data (será logado pelo GridSearchEngine)
      labLogger.info(`CHECKPOINT: job.loaded_data(${runId})`, "JobQueue");
      
      let firstIterationLogged = false;
      let progress5PercentLogged = false;
      
      // Set progress callback com checkpoints
      this.activeEngine.setProgressCallback((progress) => {
        this.currentJob!.progress = progress;
        this.currentJob!.lastProgressAt = new Date();
        
        // CHECKPOINT: job.first_iteration
        if (!firstIterationLogged && progress.currentCombination >= 1) {
          labLogger.info(`CHECKPOINT: job.first_iteration(${runId}) | combination=1/${progress.totalCombinations}`, "JobQueue");
          firstIterationLogged = true;
        }
        
        // CHECKPOINT: job.progress_5_percent
        if (!progress5PercentLogged && progress.percentComplete >= 5) {
          labLogger.info(`CHECKPOINT: job.progress_5_percent(${runId}) | ${progress.percentComplete.toFixed(1)}%`, "JobQueue");
          progress5PercentLogged = true;
        }
      });
      
      // Executar otimização
      const result = await this.activeEngine.run();
      
      // CHECKPOINT: job.completed
      labLogger.info(`CHECKPOINT: job.completed(${runId}) | combinations=${result.totalCombinationsTested} | time=${result.executionTimeSeconds}s`, "JobQueue");
      
      this.currentJob.status = result.aborted ? "ABORTED" : "COMPLETED";
      this.currentJob.result = result;
      this.currentJob.completedAt = new Date();
      
      optimizationLogger.endOperation("Grid Search Async", true, {
        runId,
        combinacoes: result.totalCombinationsTested,
        tempo: `${result.executionTimeSeconds}s`,
      });
      
    } catch (error) {
      // CHECKPOINT: job.failed
      const errorMessage = (error as Error).message;
      labLogger.error(`CHECKPOINT: job.failed(${runId}) | error=${errorMessage}`, error as Error, "JobQueue");
      
      this.currentJob.status = "FAILED";
      this.currentJob.error = errorMessage;
      this.currentJob.completedAt = new Date();
      
      optimizationLogger.endOperation("Grid Search Async", false, {
        runId,
        error: errorMessage,
      });
      
    } finally {
      this.stopHeartbeat();
      this.activeEngine = null;
    }
  }
  
  /**
   * Inicia heartbeat para atualizar lastProgressAt
   */
  private startHeartbeat(runId: string): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.currentJob && this.currentJob.runId === runId && this.currentJob.status === "RUNNING") {
        this.currentJob.lastProgressAt = new Date();
        labLogger.throttled(
          `heartbeat_${runId}`,
          "debug",
          `Heartbeat: job ${runId} alive`,
          "JobQueue"
        );
      }
    }, this.config.heartbeatIntervalMs);
  }
  
  /**
   * Para o heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
  
  /**
   * Obtém status do job atual
   */
  getJobStatus(): {
    hasJob: boolean;
    runId: string | null;
    status: JobStatus | null;
    progress: OptimizationProgress | null;
    error: string | null;
    lastProgressAt: Date | null;
  } {
    if (!this.currentJob) {
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
      hasJob: true,
      runId: this.currentJob.runId,
      status: this.currentJob.status,
      progress: this.currentJob.progress,
      error: this.currentJob.error,
      lastProgressAt: this.currentJob.lastProgressAt,
    };
  }
  
  /**
   * Obtém resultado do job
   */
  getJobResult(): OptimizationFinalResult | null {
    return this.currentJob?.result || null;
  }
  
  /**
   * Verifica se há job em execução
   */
  isRunning(): boolean {
    return this.currentJob?.status === "RUNNING" || this.currentJob?.status === "QUEUED";
  }
  
  /**
   * Aborta job em execução
   */
  abort(): { success: boolean; message: string } {
    if (!this.currentJob || !this.isRunning()) {
      return { success: false, message: "Nenhum job em execução" };
    }
    
    if (this.activeEngine) {
      this.activeEngine.abort();
    }
    
    this.currentJob.status = "ABORTED";
    this.currentJob.completedAt = new Date();
    this.stopHeartbeat();
    
    labLogger.info(`Job ${this.currentJob.runId} abortado`, "JobQueue");
    
    return { success: true, message: `Job ${this.currentJob.runId} abortado` };
  }
  
  /**
   * Limpa job atual
   */
  clearJob(): void {
    if (this.isRunning()) {
      this.abort();
    }
    this.currentJob = null;
    this.activeEngine = null;
  }
  
  /**
   * Obtém configuração atual
   */
  getConfig(): JobQueueConfig {
    return { ...this.config };
  }
  
  /**
   * Atualiza configuração
   */
  setConfig(config: Partial<JobQueueConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const optimizationJobQueue = OptimizationJobQueue.getInstance();

// ============================================================================
// ERROR CODES
// ============================================================================

export const LAB_ERROR_CODES = {
  LAB_TOO_MANY_COMBINATIONS: "LAB_TOO_MANY_COMBINATIONS",
  LAB_JOB_ALREADY_RUNNING: "LAB_JOB_ALREADY_RUNNING",
  LAB_JOB_NOT_FOUND: "LAB_JOB_NOT_FOUND",
  LAB_DATA_NOT_FOUND: "LAB_DATA_NOT_FOUND",
} as const;
