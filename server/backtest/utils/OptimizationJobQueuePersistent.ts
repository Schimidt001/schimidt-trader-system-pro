/**
 * OptimizationJobQueuePersistent - Sistema de Fila de Jobs com Persistência em Banco de Dados
 * 
 * CORREÇÃO CRÍTICA #1: Persistência Real de Estado
 * 
 * Este módulo substitui o OptimizationJobQueue original que operava exclusivamente em memória.
 * Agora persiste runId, status, progress, errorMessage e result em banco de dados MySQL
 * imediatamente após submissão do job.
 * 
 * Benefícios:
 * - Estado sobrevive a reinicializações do servidor
 * - Estado sobrevive a crashes
 * - Permite consulta de status mesmo após restart
 * - Elimina erros 502 causados por perda de estado
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 3.0.0 - Persistent State
 */

import { labLogger, optimizationLogger } from "./LabLogger";
import { GridSearchEngine } from "../optimization/GridSearchEngine";
import { GridSearchEngineOptimized } from "../optimization/GridSearchEngineOptimized";
import { memoryManager } from "./MemoryManager";
import { OptimizationConfig, OptimizationProgress, OptimizationFinalResult, ParameterType } from "../optimization/types/optimization.types";
import { getDb } from "../../db";
import { optimizationJobs, OptimizationJobStatus, type OptimizationJobStatusType } from "../../../drizzle/schema/index";
import { eq, desc } from "drizzle-orm";

// ============================================================================
// TYPES
// ============================================================================

export type JobStatus = OptimizationJobStatusType;

export interface OptimizationJobData {
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
  /** Intervalo de persistência de progresso em ms */
  progressPersistIntervalMs: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_JOB_QUEUE_CONFIG: JobQueueConfig = {
  heartbeatIntervalMs: 3000,
  maxCombinations: 5000,
  maxParallelWorkers: 1,
  jobTimeoutMs: 0,
  progressPersistIntervalMs: 5000, // Persistir progresso a cada 5 segundos
};

// ============================================================================
// JOB QUEUE CLASS WITH PERSISTENCE
// ============================================================================

export class OptimizationJobQueuePersistent {
  private static instance: OptimizationJobQueuePersistent | null = null;
  private config: JobQueueConfig;
  
  // Estado em memória (cache para acesso rápido)
  private currentRunId: string | null = null;
  private activeEngine: GridSearchEngine | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private progressPersistInterval: NodeJS.Timeout | null = null;
  private cachedProgress: OptimizationProgress | null = null;
  
  constructor(config: Partial<JobQueueConfig> = {}) {
    this.config = { ...DEFAULT_JOB_QUEUE_CONFIG, ...config };
  }
  
  /**
   * Obtém instância singleton
   */
  static getInstance(): OptimizationJobQueuePersistent {
    if (!OptimizationJobQueuePersistent.instance) {
      OptimizationJobQueuePersistent.instance = new OptimizationJobQueuePersistent();
    }
    return OptimizationJobQueuePersistent.instance;
  }
  
  // ==========================================================================
  // DATABASE OPERATIONS
  // ==========================================================================
  
  /**
   * Cria um novo job no banco de dados
   */
  private async createJobInDb(
    runId: string, 
    config: OptimizationConfig, 
    totalCombinations: number
  ): Promise<void> {
    const db = await getDb();
    if (!db) {
      labLogger.warn("Database not available, job will only exist in memory", "JobQueue");
      return;
    }
    
    try {
      await db.insert(optimizationJobs).values({
        runId,
        status: OptimizationJobStatus.QUEUED,
        progressPercent: "0",
        currentCombination: 0,
        totalCombinations,
        currentPhase: "QUEUED",
        statusMessage: "Job enfileirado, aguardando execução",
        config: config as any,
        createdAt: new Date(),
      });
      
      labLogger.info(`Job ${runId} criado no banco de dados`, "JobQueue");
    } catch (error) {
      labLogger.error(`Erro ao criar job no banco: ${(error as Error).message}`, error as Error, "JobQueue");
    }
  }
  
  /**
   * Atualiza o status do job no banco de dados
   */
  private async updateJobStatusInDb(
    runId: string, 
    status: JobStatus, 
    additionalData?: {
      progressPercent?: number;
      currentCombination?: number;
      currentPhase?: string;
      statusMessage?: string;
      estimatedTimeRemaining?: number;
      elapsedTime?: number;
      errorMessage?: string;
      result?: OptimizationFinalResult;
      startedAt?: Date;
      completedAt?: Date;
      lastProgressAt?: Date;
    }
  ): Promise<void> {
    const db = await getDb();
    if (!db) return;
    
    try {
      const updateData: any = { status };
      
      if (additionalData) {
        if (additionalData.progressPercent !== undefined) {
          updateData.progressPercent = additionalData.progressPercent.toFixed(2);
        }
        if (additionalData.currentCombination !== undefined) {
          updateData.currentCombination = additionalData.currentCombination;
        }
        if (additionalData.currentPhase !== undefined) {
          updateData.currentPhase = additionalData.currentPhase;
        }
        if (additionalData.statusMessage !== undefined) {
          updateData.statusMessage = additionalData.statusMessage;
        }
        if (additionalData.estimatedTimeRemaining !== undefined) {
          updateData.estimatedTimeRemaining = additionalData.estimatedTimeRemaining;
        }
        if (additionalData.elapsedTime !== undefined) {
          updateData.elapsedTime = additionalData.elapsedTime;
        }
        if (additionalData.errorMessage !== undefined) {
          updateData.errorMessage = additionalData.errorMessage;
        }
        if (additionalData.result !== undefined) {
          updateData.result = additionalData.result;
        }
        if (additionalData.startedAt !== undefined) {
          updateData.startedAt = additionalData.startedAt;
        }
        if (additionalData.completedAt !== undefined) {
          updateData.completedAt = additionalData.completedAt;
        }
        if (additionalData.lastProgressAt !== undefined) {
          updateData.lastProgressAt = additionalData.lastProgressAt;
        }
      }
      
      await db.update(optimizationJobs)
        .set(updateData)
        .where(eq(optimizationJobs.runId, runId));
        
    } catch (error) {
      labLogger.error(`Erro ao atualizar job no banco: ${(error as Error).message}`, error as Error, "JobQueue");
    }
  }
  
  /**
   * Busca job por runId no banco de dados
   */
  private async getJobFromDb(runId: string): Promise<OptimizationJobData | null> {
    const db = await getDb();
    if (!db) return null;
    
    try {
      const results = await db.select()
        .from(optimizationJobs)
        .where(eq(optimizationJobs.runId, runId))
        .limit(1);
      
      if (results.length === 0) return null;
      
      const job = results[0];
      
      return {
        runId: job.runId,
        status: job.status as JobStatus,
        config: job.config as OptimizationConfig,
        progress: job.currentCombination ? {
          phase: (job.currentPhase || "TESTING") as "INITIALIZING" | "GENERATING_COMBINATIONS" | "TESTING" | "VALIDATING" | "RANKING" | "COMPLETED" | "ABORTED" | "ERROR",
          currentCombination: job.currentCombination || 0,
          totalCombinations: job.totalCombinations,
          percentComplete: parseFloat(job.progressPercent || "0"),
          estimatedTimeRemaining: job.estimatedTimeRemaining || 0,
          elapsedTime: job.elapsedTime || 0,
          statusMessage: job.statusMessage || "",
          currentParams: {},
        } : null,
        result: job.result as OptimizationFinalResult | null,
        error: job.errorMessage || null,
        createdAt: job.createdAt,
        startedAt: job.startedAt || null,
        completedAt: job.completedAt || null,
        lastProgressAt: job.lastProgressAt || null,
        totalCombinations: job.totalCombinations,
      };
    } catch (error) {
      labLogger.error(`Erro ao buscar job no banco: ${(error as Error).message}`, error as Error, "JobQueue");
      return null;
    }
  }
  
  /**
   * Busca o job mais recente (em execução ou não)
   */
  private async getLatestJobFromDb(): Promise<OptimizationJobData | null> {
    const db = await getDb();
    if (!db) return null;
    
    try {
      const results = await db.select()
        .from(optimizationJobs)
        .orderBy(desc(optimizationJobs.createdAt))
        .limit(1);
      
      if (results.length === 0) return null;
      
      const job = results[0];
      
      return {
        runId: job.runId,
        status: job.status as JobStatus,
        config: job.config as OptimizationConfig,
        progress: job.currentCombination ? {
          phase: (job.currentPhase || "TESTING") as "INITIALIZING" | "GENERATING_COMBINATIONS" | "TESTING" | "VALIDATING" | "RANKING" | "COMPLETED" | "ABORTED" | "ERROR",
          currentCombination: job.currentCombination || 0,
          totalCombinations: job.totalCombinations,
          percentComplete: parseFloat(job.progressPercent || "0"),
          estimatedTimeRemaining: job.estimatedTimeRemaining || 0,
          elapsedTime: job.elapsedTime || 0,
          statusMessage: job.statusMessage || "",
          currentParams: {},
        } : null,
        result: job.result as OptimizationFinalResult | null,
        error: job.errorMessage || null,
        createdAt: job.createdAt,
        startedAt: job.startedAt || null,
        completedAt: job.completedAt || null,
        lastProgressAt: job.lastProgressAt || null,
        totalCombinations: job.totalCombinations,
      };
    } catch (error) {
      labLogger.error(`Erro ao buscar último job: ${(error as Error).message}`, error as Error, "JobQueue");
      return null;
    }
  }
  
  // ==========================================================================
  // PUBLIC API
  // ==========================================================================
  
  /**
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
   * Enfileira um novo job - PERSISTE IMEDIATAMENTE NO BANCO
   */
  async enqueueJob(config: OptimizationConfig, totalCombinations: number): Promise<{ runId: string; enqueuedAt: Date }> {
    const startTime = Date.now();
    
    // Gerar runId único
    const runId = `opt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // CORREÇÃO #1: Persistir IMEDIATAMENTE no banco de dados
    await this.createJobInDb(runId, config, totalCombinations);
    
    // Guardar referência em memória para acesso rápido
    this.currentRunId = runId;
    
    const elapsed = Date.now() - startTime;
    labLogger.info(`CHECKPOINT: startOptimization.returning_runId | runId=${runId} | elapsed=${elapsed}ms`, "JobQueue");
    
    // Disparar execução async (fora da request)
    setImmediate(() => this.executeJob(runId, config, totalCombinations));
    
    return { runId, enqueuedAt: new Date() };
  }
  
  /**
   * Executa o job de forma assíncrona
   */
  private async executeJob(runId: string, config: OptimizationConfig, totalCombinations: number): Promise<void> {
    labLogger.info(`CHECKPOINT: job.start(${runId})`, "JobQueue");
    optimizationLogger.startOperation("Grid Search Async", { 
      runId, 
      combinacoes: totalCombinations 
    });
    
    // Atualizar status para RUNNING no banco
    await this.updateJobStatusInDb(runId, OptimizationJobStatus.RUNNING, {
      startedAt: new Date(),
      lastProgressAt: new Date(),
      currentPhase: "INITIALIZING",
      statusMessage: "Iniciando otimização...",
    });
    
    // Iniciar heartbeat
    this.startHeartbeat(runId);
    
    // Iniciar persistência periódica de progresso
    this.startProgressPersistence(runId);
    
    try {
      const adjustedConfig: OptimizationConfig = {
        ...config,
        parallelWorkers: Math.min(
          config.parallelWorkers || 4,
          this.config.maxParallelWorkers
        ),
      };
      
      labLogger.info(`Workers ajustados: ${adjustedConfig.parallelWorkers}`, "JobQueue");
      
      // Usar engine otimizado
      const optimizedEngine = new GridSearchEngineOptimized(adjustedConfig);
      this.activeEngine = optimizedEngine as unknown as GridSearchEngine;
      
      labLogger.info("Usando GridSearchEngineOptimized (memória otimizada)", "JobQueue");
      memoryManager.logMemoryStats("JobQueue - Antes da otimização");
      
      labLogger.info(`CHECKPOINT: job.loaded_data(${runId})`, "JobQueue");
      
      let firstIterationLogged = false;
      let progress5PercentLogged = false;
      
      // Set progress callback
      this.activeEngine.setProgressCallback((progress) => {
        this.cachedProgress = progress;
        
        if (!firstIterationLogged && progress.currentCombination >= 1) {
          labLogger.info(`CHECKPOINT: job.first_iteration(${runId})`, "JobQueue");
          firstIterationLogged = true;
        }
        
        if (!progress5PercentLogged && progress.percentComplete >= 5) {
          labLogger.info(`CHECKPOINT: job.progress_5_percent(${runId})`, "JobQueue");
          progress5PercentLogged = true;
        }
      });
      
      // Executar otimização
      const result = await this.activeEngine.run();
      
      labLogger.info(`CHECKPOINT: job.completed(${runId})`, "JobQueue");
      
      // Atualizar status para COMPLETED no banco
      await this.updateJobStatusInDb(runId, result.aborted ? OptimizationJobStatus.ABORTED : OptimizationJobStatus.COMPLETED, {
        progressPercent: 100,
        currentCombination: result.totalCombinationsTested,
        currentPhase: "COMPLETED",
        statusMessage: result.aborted ? "Otimização abortada" : "Otimização concluída com sucesso",
        elapsedTime: result.executionTimeSeconds,
        result: result,
        completedAt: new Date(),
        lastProgressAt: new Date(),
      });
      
      optimizationLogger.endOperation("Grid Search Async", true, {
        runId,
        combinacoes: result.totalCombinationsTested,
        tempo: `${result.executionTimeSeconds}s`,
      });
      
    } catch (error) {
      const errorMessage = (error as Error).message;
      labLogger.error(`CHECKPOINT: job.failed(${runId}) | error=${errorMessage}`, error as Error, "JobQueue");
      
      // Atualizar status para FAILED no banco
      await this.updateJobStatusInDb(runId, OptimizationJobStatus.FAILED, {
        currentPhase: "FAILED",
        statusMessage: `Erro: ${errorMessage}`,
        errorMessage: errorMessage,
        completedAt: new Date(),
        lastProgressAt: new Date(),
      });
      
      optimizationLogger.endOperation("Grid Search Async", false, {
        runId,
        error: errorMessage,
      });
      
    } finally {
      this.stopHeartbeat();
      this.stopProgressPersistence();
      this.activeEngine = null;
      this.cachedProgress = null;
    }
  }
  
  /**
   * Inicia heartbeat para atualizar lastProgressAt
   */
  private startHeartbeat(runId: string): void {
    this.heartbeatInterval = setInterval(async () => {
      await this.updateJobStatusInDb(runId, OptimizationJobStatus.RUNNING, {
        lastProgressAt: new Date(),
      });
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
   * Inicia persistência periódica de progresso
   */
  private startProgressPersistence(runId: string): void {
    this.progressPersistInterval = setInterval(async () => {
      if (this.cachedProgress) {
        await this.updateJobStatusInDb(runId, OptimizationJobStatus.RUNNING, {
          progressPercent: this.cachedProgress.percentComplete,
          currentCombination: this.cachedProgress.currentCombination,
          currentPhase: this.cachedProgress.phase,
          statusMessage: this.cachedProgress.statusMessage,
          estimatedTimeRemaining: this.cachedProgress.estimatedTimeRemaining,
          elapsedTime: this.cachedProgress.elapsedTime,
          lastProgressAt: new Date(),
        });
      }
    }, this.config.progressPersistIntervalMs);
  }
  
  /**
   * Para persistência de progresso
   */
  private stopProgressPersistence(): void {
    if (this.progressPersistInterval) {
      clearInterval(this.progressPersistInterval);
      this.progressPersistInterval = null;
    }
  }
  
  /**
   * Obtém status do job - LEITURA DO BANCO DE DADOS
   */
  async getJobStatus(requestedRunId?: string): Promise<{
    hasJob: boolean;
    runId: string | null;
    status: JobStatus | null;
    progress: OptimizationProgress | null;
    error: string | null;
    lastProgressAt: Date | null;
  }> {
    // Se temos progresso em cache e é o job atual, usar cache para resposta mais rápida
    if (this.currentRunId && this.cachedProgress && (!requestedRunId || requestedRunId === this.currentRunId)) {
      return {
        hasJob: true,
        runId: this.currentRunId,
        status: OptimizationJobStatus.RUNNING,
        progress: this.cachedProgress,
        error: null,
        lastProgressAt: new Date(),
      };
    }
    
    // Buscar do banco de dados
    const runIdToFetch = requestedRunId || this.currentRunId;
    
    if (runIdToFetch) {
      const job = await this.getJobFromDb(runIdToFetch);
      if (job) {
        return {
          hasJob: true,
          runId: job.runId,
          status: job.status,
          progress: job.progress,
          error: job.error,
          lastProgressAt: job.lastProgressAt,
        };
      }
    }
    
    // Buscar último job se nenhum específico foi solicitado
    if (!requestedRunId) {
      const latestJob = await this.getLatestJobFromDb();
      if (latestJob) {
        return {
          hasJob: true,
          runId: latestJob.runId,
          status: latestJob.status,
          progress: latestJob.progress,
          error: latestJob.error,
          lastProgressAt: latestJob.lastProgressAt,
        };
      }
    }
    
    return {
      hasJob: false,
      runId: null,
      status: null,
      progress: null,
      error: null,
      lastProgressAt: null,
    };
  }
  
  /**
   * Obtém resultado do job - LEITURA DO BANCO DE DADOS
   */
  async getJobResult(runId?: string): Promise<OptimizationFinalResult | null> {
    const runIdToFetch = runId || this.currentRunId;
    
    if (runIdToFetch) {
      const job = await this.getJobFromDb(runIdToFetch);
      return job?.result || null;
    }
    
    const latestJob = await this.getLatestJobFromDb();
    return latestJob?.result || null;
  }
  
  /**
   * Verifica se há job em execução
   */
  async isRunning(): Promise<boolean> {
    if (this.activeEngine) return true;
    
    if (this.currentRunId) {
      const job = await this.getJobFromDb(this.currentRunId);
      return job?.status === OptimizationJobStatus.RUNNING || job?.status === OptimizationJobStatus.QUEUED;
    }
    
    return false;
  }
  
  /**
   * Aborta job em execução
   */
  async abort(): Promise<{ success: boolean; message: string }> {
    if (!this.activeEngine || !this.currentRunId) {
      return { success: false, message: "Nenhum job em execução" };
    }
    
    this.activeEngine.abort();
    
    await this.updateJobStatusInDb(this.currentRunId, OptimizationJobStatus.ABORTED, {
      currentPhase: "ABORTED",
      statusMessage: "Otimização abortada pelo usuário",
      completedAt: new Date(),
      lastProgressAt: new Date(),
    });
    
    this.stopHeartbeat();
    this.stopProgressPersistence();
    
    labLogger.info(`Job ${this.currentRunId} abortado`, "JobQueue");
    
    return { success: true, message: `Job ${this.currentRunId} abortado` };
  }
  
  /**
   * Limpa referência ao job atual (não apaga do banco)
   */
  async clearJob(): Promise<void> {
    if (await this.isRunning()) {
      await this.abort();
    }
    this.currentRunId = null;
    this.activeEngine = null;
    this.cachedProgress = null;
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

export const optimizationJobQueuePersistent = OptimizationJobQueuePersistent.getInstance();

// ============================================================================
// ERROR CODES
// ============================================================================

export const LAB_ERROR_CODES = {
  LAB_TOO_MANY_COMBINATIONS: "LAB_TOO_MANY_COMBINATIONS",
  LAB_JOB_ALREADY_RUNNING: "LAB_JOB_ALREADY_RUNNING",
  LAB_JOB_NOT_FOUND: "LAB_JOB_NOT_FOUND",
  LAB_DATA_NOT_FOUND: "LAB_DATA_NOT_FOUND",
} as const;
