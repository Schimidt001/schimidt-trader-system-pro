
// ============================================================================
// PERSISTENCE UTILS (LocalStorage)
// ============================================================================

export const STORAGE_KEY_OPTIMIZATION = "lab_optimization_state";
export const EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 horas

export interface SavedLabState {
  runId: string;
  timestamp: number;
}

// In-memory store for Node environment (testing)
const memoryStore: Record<string, string> = {};

// Mock localStorage for Node environment if needed
const storage = typeof localStorage !== 'undefined' ? localStorage : {
  getItem: (key: string) => memoryStore[key] || null,
  setItem: (key: string, value: string) => { memoryStore[key] = value; },
  removeItem: (key: string) => { delete memoryStore[key]; },
  clear: () => { for (const key in memoryStore) delete memoryStore[key]; }
};

export const saveRunId = (runId: string) => {
  const state: SavedLabState = {
    runId,
    timestamp: Date.now(),
  };
  storage.setItem(STORAGE_KEY_OPTIMIZATION, JSON.stringify(state));
};

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
    console.error("Erro ao carregar estado do laboratório:", e);
    return null;
  }
};

export const clearRunId = () => {
  storage.removeItem(STORAGE_KEY_OPTIMIZATION);
};

// For testing purposes
export const _getStore = () => memoryStore;
export const _resetStore = () => { if (typeof localStorage === 'undefined') { for (const key in memoryStore) delete memoryStore[key]; } };
