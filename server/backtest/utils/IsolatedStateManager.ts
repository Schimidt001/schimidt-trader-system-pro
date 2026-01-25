/**
 * IsolatedStateManager - Gerenciador de Estado Isolado por RunId
 * 
 * CORREÇÃO CRÍTICA #2: Remoção Total de Estado Global Compartilhado
 * 
 * Este módulo substitui as variáveis globais backtestState, downloadState,
 * optimizationState, etc. por um Map<runId, State> que garante isolamento
 * completo entre execuções simultâneas.
 * 
 * Benefícios:
 * - Elimina colisão entre execuções simultâneas
 * - Cada execução opera com seu próprio escopo de estado
 * - Sem mutabilidade global compartilhada
 * - Permite múltiplos backtests/downloads em paralelo
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { BacktestResult } from "../types/backtest.types";
import { OptimizationProgress, OptimizationFinalResult } from "../optimization/types/optimization.types";
import { labLogger } from "./LabLogger";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Estado de um backtest individual
 */
export interface BacktestState {
  runId: string;
  isRunning: boolean;
  progress: number;
  currentPhase: string;
  result: BacktestResult | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Estado de um download individual
 */
export interface DownloadState {
  runId: string;
  isDownloading: boolean;
  progress: number;
  currentSymbol: string;
  currentTimeframe: string;
  errors: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Estado de uma otimização individual (legacy)
 */
export interface OptimizationState {
  runId: string;
  isRunning: boolean;
  progress: OptimizationProgress | null;
  result: OptimizationFinalResult | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Estado de uma otimização em lote individual
 */
export interface BatchOptimizationState {
  runId: string;
  isRunning: boolean;
  progress: any | null;
  result: any | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// ISOLATED STATE MANAGER CLASS
// ============================================================================

/**
 * Gerenciador de estado isolado por runId
 * Substitui variáveis globais por Maps indexados por runId
 */
export class IsolatedStateManager {
  private static instance: IsolatedStateManager | null = null;
  
  // Maps isolados por runId
  private backtestStates: Map<string, BacktestState> = new Map();
  private downloadStates: Map<string, DownloadState> = new Map();
  private optimizationStates: Map<string, OptimizationState> = new Map();
  private batchOptimizationStates: Map<string, BatchOptimizationState> = new Map();
  
  // Configuração
  private maxStatesPerType: number = 100; // Limite para evitar memory leak
  private stateExpirationMs: number = 24 * 60 * 60 * 1000; // 24 horas
  
  private constructor() {
    // Iniciar limpeza periódica de estados antigos
    setInterval(() => this.cleanupOldStates(), 60 * 60 * 1000); // A cada hora
  }
  
  /**
   * Obtém instância singleton
   */
  static getInstance(): IsolatedStateManager {
    if (!IsolatedStateManager.instance) {
      IsolatedStateManager.instance = new IsolatedStateManager();
    }
    return IsolatedStateManager.instance;
  }
  
  // ==========================================================================
  // BACKTEST STATE MANAGEMENT
  // ==========================================================================
  
  /**
   * Cria um novo estado de backtest isolado
   */
  createBacktestState(runId?: string): BacktestState {
    const id = runId || this.generateRunId("bt");
    
    const state: BacktestState = {
      runId: id,
      isRunning: false,
      progress: 0,
      currentPhase: "idle",
      result: null,
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.backtestStates.set(id, state);
    this.enforceLimit(this.backtestStates);
    
    labLogger.debug(`Backtest state criado: ${id}`, "StateManager");
    
    return state;
  }
  
  /**
   * Obtém estado de backtest por runId
   */
  getBacktestState(runId: string): BacktestState | null {
    return this.backtestStates.get(runId) || null;
  }
  
  /**
   * Atualiza estado de backtest
   */
  updateBacktestState(runId: string, updates: Partial<Omit<BacktestState, 'runId' | 'createdAt'>>): BacktestState | null {
    const state = this.backtestStates.get(runId);
    if (!state) {
      labLogger.warn(`Backtest state não encontrado: ${runId}`, "StateManager");
      return null;
    }
    
    const updatedState: BacktestState = {
      ...state,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.backtestStates.set(runId, updatedState);
    return updatedState;
  }
  
  /**
   * Verifica se há algum backtest em execução
   */
  hasRunningBacktest(): boolean {
    const states = Array.from(this.backtestStates.values());
    for (const state of states) {
      if (state.isRunning) return true;
    }
    return false;
  }
  
  /**
   * Obtém o backtest em execução mais recente
   */
  getRunningBacktest(): BacktestState | null {
    let latestRunning: BacktestState | null = null;
    const states = Array.from(this.backtestStates.values());
    
    for (const state of states) {
      if (state.isRunning) {
        if (!latestRunning || state.createdAt > latestRunning.createdAt) {
          latestRunning = state;
        }
      }
    }
    
    return latestRunning;
  }
  
  /**
   * Obtém o último resultado de backtest
   */
  getLastBacktestResult(): BacktestState | null {
    let latest: BacktestState | null = null;
    const states = Array.from(this.backtestStates.values());
    
    for (const state of states) {
      if (state.result) {
        if (!latest || state.updatedAt > latest.updatedAt) {
          latest = state;
        }
      }
    }
    
    return latest;
  }
  
  /**
   * Remove estado de backtest
   */
  removeBacktestState(runId: string): boolean {
    return this.backtestStates.delete(runId);
  }
  
  // ==========================================================================
  // DOWNLOAD STATE MANAGEMENT
  // ==========================================================================
  
  /**
   * Cria um novo estado de download isolado
   */
  createDownloadState(runId?: string): DownloadState {
    const id = runId || this.generateRunId("dl");
    
    const state: DownloadState = {
      runId: id,
      isDownloading: false,
      progress: 0,
      currentSymbol: "",
      currentTimeframe: "",
      errors: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.downloadStates.set(id, state);
    this.enforceLimit(this.downloadStates);
    
    labLogger.debug(`Download state criado: ${id}`, "StateManager");
    
    return state;
  }
  
  /**
   * Obtém estado de download por runId
   */
  getDownloadState(runId: string): DownloadState | null {
    return this.downloadStates.get(runId) || null;
  }
  
  /**
   * Atualiza estado de download
   */
  updateDownloadState(runId: string, updates: Partial<Omit<DownloadState, 'runId' | 'createdAt'>>): DownloadState | null {
    const state = this.downloadStates.get(runId);
    if (!state) {
      labLogger.warn(`Download state não encontrado: ${runId}`, "StateManager");
      return null;
    }
    
    const updatedState: DownloadState = {
      ...state,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.downloadStates.set(runId, updatedState);
    return updatedState;
  }
  
  /**
   * Verifica se há algum download em execução
   */
  hasRunningDownload(): boolean {
    const states = Array.from(this.downloadStates.values());
    for (const state of states) {
      if (state.isDownloading) return true;
    }
    return false;
  }
  
  /**
   * Obtém o download em execução mais recente
   */
  getRunningDownload(): DownloadState | null {
    let latestRunning: DownloadState | null = null;
    const states = Array.from(this.downloadStates.values());
    
    for (const state of states) {
      if (state.isDownloading) {
        if (!latestRunning || state.createdAt > latestRunning.createdAt) {
          latestRunning = state;
        }
      }
    }
    
    return latestRunning;
  }
  
  /**
   * Remove estado de download
   */
  removeDownloadState(runId: string): boolean {
    return this.downloadStates.delete(runId);
  }
  
  // ==========================================================================
  // OPTIMIZATION STATE MANAGEMENT (Legacy)
  // ==========================================================================
  
  /**
   * Cria um novo estado de otimização isolado
   */
  createOptimizationState(runId?: string): OptimizationState {
    const id = runId || this.generateRunId("opt");
    
    const state: OptimizationState = {
      runId: id,
      isRunning: false,
      progress: null,
      result: null,
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.optimizationStates.set(id, state);
    this.enforceLimit(this.optimizationStates);
    
    labLogger.debug(`Optimization state criado: ${id}`, "StateManager");
    
    return state;
  }
  
  /**
   * Obtém estado de otimização por runId
   */
  getOptimizationState(runId: string): OptimizationState | null {
    return this.optimizationStates.get(runId) || null;
  }
  
  /**
   * Atualiza estado de otimização
   */
  updateOptimizationState(runId: string, updates: Partial<Omit<OptimizationState, 'runId' | 'createdAt'>>): OptimizationState | null {
    const state = this.optimizationStates.get(runId);
    if (!state) {
      labLogger.warn(`Optimization state não encontrado: ${runId}`, "StateManager");
      return null;
    }
    
    const updatedState: OptimizationState = {
      ...state,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.optimizationStates.set(runId, updatedState);
    return updatedState;
  }
  
  /**
   * Verifica se há alguma otimização em execução
   */
  hasRunningOptimization(): boolean {
    const states = Array.from(this.optimizationStates.values());
    for (const state of states) {
      if (state.isRunning) return true;
    }
    return false;
  }
  
  /**
   * Remove estado de otimização
   */
  removeOptimizationState(runId: string): boolean {
    return this.optimizationStates.delete(runId);
  }
  
  // ==========================================================================
  // BATCH OPTIMIZATION STATE MANAGEMENT
  // ==========================================================================
  
  /**
   * Cria um novo estado de otimização em lote isolado
   */
  createBatchOptimizationState(runId?: string): BatchOptimizationState {
    const id = runId || this.generateRunId("batch");
    
    const state: BatchOptimizationState = {
      runId: id,
      isRunning: false,
      progress: null,
      result: null,
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.batchOptimizationStates.set(id, state);
    this.enforceLimit(this.batchOptimizationStates);
    
    labLogger.debug(`Batch optimization state criado: ${id}`, "StateManager");
    
    return state;
  }
  
  /**
   * Obtém estado de otimização em lote por runId
   */
  getBatchOptimizationState(runId: string): BatchOptimizationState | null {
    return this.batchOptimizationStates.get(runId) || null;
  }
  
  /**
   * Atualiza estado de otimização em lote
   */
  updateBatchOptimizationState(runId: string, updates: Partial<Omit<BatchOptimizationState, 'runId' | 'createdAt'>>): BatchOptimizationState | null {
    const state = this.batchOptimizationStates.get(runId);
    if (!state) {
      labLogger.warn(`Batch optimization state não encontrado: ${runId}`, "StateManager");
      return null;
    }
    
    const updatedState: BatchOptimizationState = {
      ...state,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.batchOptimizationStates.set(runId, updatedState);
    return updatedState;
  }
  
  /**
   * Verifica se há alguma otimização em lote em execução
   */
  hasRunningBatchOptimization(): boolean {
    const states = Array.from(this.batchOptimizationStates.values());
    for (const state of states) {
      if (state.isRunning) return true;
    }
    return false;
  }
  
  /**
   * Obtém a otimização em lote em execução mais recente
   */
  getRunningBatchOptimization(): BatchOptimizationState | null {
    let latestRunning: BatchOptimizationState | null = null;
    const states = Array.from(this.batchOptimizationStates.values());
    
    for (const state of states) {
      if (state.isRunning) {
        if (!latestRunning || state.createdAt > latestRunning.createdAt) {
          latestRunning = state;
        }
      }
    }
    
    return latestRunning;
  }
  
  /**
   * Obtém o último resultado de otimização em lote
   */
  getLastBatchOptimizationResult(): BatchOptimizationState | null {
    let latest: BatchOptimizationState | null = null;
    const states = Array.from(this.batchOptimizationStates.values());
    
    for (const state of states) {
      if (state.result) {
        if (!latest || state.updatedAt > latest.updatedAt) {
          latest = state;
        }
      }
    }
    
    return latest;
  }
  
  /**
   * Remove estado de otimização em lote
   */
  removeBatchOptimizationState(runId: string): boolean {
    return this.batchOptimizationStates.delete(runId);
  }
  
  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================
  
  /**
   * Gera um runId único
   */
  private generateRunId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
  
  /**
   * Aplica limite de estados para evitar memory leak
   */
  private enforceLimit<T extends { createdAt: Date }>(map: Map<string, T>): void {
    if (map.size <= this.maxStatesPerType) return;
    
    // Ordenar por data de criação e remover os mais antigos
    const entries = Array.from(map.entries())
      .sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime());
    
    const toRemove = entries.slice(0, map.size - this.maxStatesPerType);
    
    for (const entry of toRemove) {
      const key = entry[0];
      map.delete(key);
      labLogger.debug(`Estado removido por limite: ${key}`, "StateManager");
    }
  }
  
  /**
   * Limpa estados antigos (expirados)
   */
  private cleanupOldStates(): void {
    const now = Date.now();
    let cleaned = 0;
    
    const cleanMap = <T extends { updatedAt: Date; isRunning?: boolean; isDownloading?: boolean }>(
      map: Map<string, T>,
      isRunningKey: keyof T
    ) => {
      const entries = Array.from(map.entries());
      for (const entry of entries) {
        const key = entry[0];
        const state = entry[1];
        const isActive = state[isRunningKey];
        const age = now - state.updatedAt.getTime();
        
        if (!isActive && age > this.stateExpirationMs) {
          map.delete(key);
          cleaned++;
        }
      }
    };
    
    cleanMap(this.backtestStates, 'isRunning');
    cleanMap(this.downloadStates, 'isDownloading');
    cleanMap(this.optimizationStates, 'isRunning');
    cleanMap(this.batchOptimizationStates, 'isRunning');
    
    if (cleaned > 0) {
      labLogger.info(`Limpeza de estados: ${cleaned} estados expirados removidos`, "StateManager");
    }
  }
  
  /**
   * Obtém estatísticas de uso
   */
  getStats(): {
    backtestStates: number;
    downloadStates: number;
    optimizationStates: number;
    batchOptimizationStates: number;
  } {
    return {
      backtestStates: this.backtestStates.size,
      downloadStates: this.downloadStates.size,
      optimizationStates: this.optimizationStates.size,
      batchOptimizationStates: this.batchOptimizationStates.size,
    };
  }
  
  /**
   * Limpa todos os estados (para testes)
   */
  clearAll(): void {
    this.backtestStates.clear();
    this.downloadStates.clear();
    this.optimizationStates.clear();
    this.batchOptimizationStates.clear();
    labLogger.info("Todos os estados foram limpos", "StateManager");
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const isolatedStateManager = IsolatedStateManager.getInstance();
