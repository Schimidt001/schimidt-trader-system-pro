/**
 * Persistence Utils - Utilitários de Persistência do Laboratório
 * 
 * Gerencia a persistência do estado do laboratório no localStorage para:
 * - Recuperação após recarregamento da página (F5)
 * - Continuidade ao trocar de aba e voltar
 * - Resiliência a erros temporários de conexão
 * 
 * CORREÇÃO v2.1.0:
 * - Suporte completo para todos os pipelines (otimização, walk-forward, monte carlo, etc.)
 * - Estado unificado para melhor gerenciamento
 * - Expiração configurável
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 2.1.0
 */

// ============================================================================
// CONSTANTS
// ============================================================================

export const STORAGE_KEY_OPTIMIZATION = "lab_optimization_state";
export const STORAGE_KEY_LAB_STATE = "lab_full_state";
export const EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 horas

// ============================================================================
// TYPES
// ============================================================================

export interface SavedLabState {
  runId: string;
  timestamp: number;
}

/**
 * Estado completo do laboratório para persistência
 */
export interface LabPersistenceState {
  /** RunId da otimização em andamento */
  optimizationRunId?: string;
  /** Walk-Forward está rodando */
  walkForwardRunning?: boolean;
  /** Monte Carlo está rodando */
  monteCarloRunning?: boolean;
  /** Regime Detection está rodando */
  regimeDetectionRunning?: boolean;
  /** Multi-Asset está rodando */
  multiAssetRunning?: boolean;
  /** Timestamp da última atualização */
  timestamp: number;
}

// ============================================================================
// STORAGE ABSTRACTION
// ============================================================================

// In-memory store for Node environment (testing)
const memoryStore: Record<string, string> = {};

// Mock localStorage for Node environment if needed
const storage = typeof localStorage !== 'undefined' ? localStorage : {
  getItem: (key: string) => memoryStore[key] || null,
  setItem: (key: string, value: string) => { memoryStore[key] = value; },
  removeItem: (key: string) => { delete memoryStore[key]; },
  clear: () => { for (const key in memoryStore) delete memoryStore[key]; }
};

// ============================================================================
// LEGACY FUNCTIONS (Compatibilidade)
// ============================================================================

/**
 * Salva o runId da otimização (compatibilidade com versão anterior)
 */
export const saveRunId = (runId: string) => {
  const state: SavedLabState = {
    runId,
    timestamp: Date.now(),
  };
  try {
    storage.setItem(STORAGE_KEY_OPTIMIZATION, JSON.stringify(state));
  } catch (e) {
    console.error("[persistenceUtils] Erro ao salvar runId:", e);
  }
};

/**
 * Carrega o runId da otimização (compatibilidade com versão anterior)
 */
export const loadRunId = (): string | null => {
  try {
    const raw = storage.getItem(STORAGE_KEY_OPTIMIZATION);
    if (!raw) return null;

    const state: SavedLabState = JSON.parse(raw);

    // Verificar expiração
    if (Date.now() - state.timestamp > EXPIRATION_MS) {
      storage.removeItem(STORAGE_KEY_OPTIMIZATION);
      return null;
    }

    return state.runId;
  } catch (e) {
    console.error("[persistenceUtils] Erro ao carregar runId:", e);
    return null;
  }
};

/**
 * Limpa o runId da otimização (compatibilidade com versão anterior)
 */
export const clearRunId = () => {
  try {
    storage.removeItem(STORAGE_KEY_OPTIMIZATION);
  } catch (e) {
    console.error("[persistenceUtils] Erro ao limpar runId:", e);
  }
};

// ============================================================================
// NEW UNIFIED PERSISTENCE FUNCTIONS
// ============================================================================

/**
 * Salva o estado completo do laboratório
 */
export const saveLabState = (state: LabPersistenceState) => {
  try {
    const stateWithTimestamp = {
      ...state,
      timestamp: Date.now(),
    };
    storage.setItem(STORAGE_KEY_LAB_STATE, JSON.stringify(stateWithTimestamp));
    console.log("[persistenceUtils] Estado do laboratório salvo:", stateWithTimestamp);
  } catch (e) {
    console.error("[persistenceUtils] Erro ao salvar estado do laboratório:", e);
  }
};

/**
 * Carrega o estado completo do laboratório
 */
export const loadLabState = (): LabPersistenceState | null => {
  try {
    const raw = storage.getItem(STORAGE_KEY_LAB_STATE);
    if (!raw) return null;

    const state: LabPersistenceState = JSON.parse(raw);

    // Verificar expiração
    if (Date.now() - state.timestamp > EXPIRATION_MS) {
      console.log("[persistenceUtils] Estado do laboratório expirado. Limpando...");
      storage.removeItem(STORAGE_KEY_LAB_STATE);
      return null;
    }

    console.log("[persistenceUtils] Estado do laboratório carregado:", state);
    return state;
  } catch (e) {
    console.error("[persistenceUtils] Erro ao carregar estado do laboratório:", e);
    return null;
  }
};

/**
 * Limpa o estado completo do laboratório
 */
export const clearLabState = () => {
  try {
    storage.removeItem(STORAGE_KEY_LAB_STATE);
    console.log("[persistenceUtils] Estado do laboratório limpo");
  } catch (e) {
    console.error("[persistenceUtils] Erro ao limpar estado do laboratório:", e);
  }
};

/**
 * Verifica se há algum pipeline rodando
 */
export const hasRunningPipeline = (): boolean => {
  const state = loadLabState();
  if (!state) return false;
  
  return !!(
    state.optimizationRunId ||
    state.walkForwardRunning ||
    state.monteCarloRunning ||
    state.regimeDetectionRunning ||
    state.multiAssetRunning
  );
};

/**
 * Atualiza parcialmente o estado do laboratório
 */
export const updateLabState = (updates: Partial<LabPersistenceState>) => {
  const currentState = loadLabState() || { timestamp: Date.now() };
  saveLabState({ ...currentState, ...updates });
};

// ============================================================================
// TESTING UTILITIES
// ============================================================================

// For testing purposes
export const _getStore = () => memoryStore;
export const _resetStore = () => { 
  if (typeof localStorage === 'undefined') { 
    for (const key in memoryStore) delete memoryStore[key]; 
  } 
};
