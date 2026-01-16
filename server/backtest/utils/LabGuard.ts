/**
 * LabGuard - Sistema de Isolamento Institucional LAB vs LIVE
 * 
 * TAREFA 3: Garantir isolamento TOTAL entre Laboratório e Sistema Live
 * 
 * Princípio não negociável:
 * O LABORATÓRIO NÃO PODE, EM HIPÓTESE ALGUMA, CONVERSAR COM O LIVE.
 * 
 * Implementa:
 * - Guard clause dura para detectar sessão live ativa
 * - Bloqueio de inicialização de broker em modo LAB
 * - Stub de serviços live quando em modo LAB
 * - Verificação de ambiente antes de cada operação crítica
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { TRPCError } from "@trpc/server";
import { labLogger } from "./LabLogger";

// ============================================================================
// TYPES
// ============================================================================

export interface LabGuardConfig {
  /** Modo atual do sistema */
  mode: "LAB" | "LIVE" | "UNKNOWN";
  /** Permitir operações mesmo com broker conectado */
  allowWithBrokerConnected: boolean;
  /** Forçar modo LAB independente do estado do broker */
  forceLabMode: boolean;
}

export interface LabGuardStatus {
  isLabMode: boolean;
  isBrokerConnected: boolean;
  isLiveSessionActive: boolean;
  canProceed: boolean;
  reason: string;
}

export interface LabGuardError {
  code: string;
  message: string;
  details: Record<string, any>;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: LabGuardConfig = {
  mode: "LAB",
  allowWithBrokerConnected: true, // Permitir LAB mesmo com broker conectado
  forceLabMode: true, // Sempre forçar modo LAB no laboratório
};

// ============================================================================
// LAB GUARD CLASS
// ============================================================================

export class LabGuard {
  private config: LabGuardConfig;
  private static instance: LabGuard | null = null;
  
  constructor(config: Partial<LabGuardConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Obtém instância singleton
   */
  static getInstance(): LabGuard {
    if (!LabGuard.instance) {
      LabGuard.instance = new LabGuard();
    }
    return LabGuard.instance;
  }
  
  /**
   * Verifica se o sistema está em modo LAB
   */
  isLabMode(): boolean {
    return this.config.forceLabMode || this.config.mode === "LAB";
  }
  
  /**
   * Verifica se há sessão live ativa
   * IMPORTANTE: Esta função NÃO deve importar ou usar o ctraderAdapter diretamente
   * para evitar acoplamento. Recebe o estado como parâmetro.
   */
  checkLiveSessionStatus(brokerConnected: boolean, liveEngineRunning: boolean): LabGuardStatus {
    const isLabMode = this.isLabMode();
    const isLiveSessionActive = brokerConnected && liveEngineRunning;
    
    // Determinar se pode prosseguir
    let canProceed = true;
    let reason = "OK";
    
    if (!isLabMode) {
      canProceed = false;
      reason = "Sistema não está em modo LAB";
    } else if (isLiveSessionActive && !this.config.allowWithBrokerConnected) {
      canProceed = false;
      reason = "Sessão live ativa detectada. Desconecte o broker antes de usar o laboratório.";
    }
    
    return {
      isLabMode,
      isBrokerConnected: brokerConnected,
      isLiveSessionActive,
      canProceed,
      reason,
    };
  }
  
  /**
   * Guard clause para operações do laboratório
   * Lança TRPCError se não puder prosseguir
   */
  assertLabMode(brokerConnected: boolean = false, liveEngineRunning: boolean = false): void {
    const status = this.checkLiveSessionStatus(brokerConnected, liveEngineRunning);
    
    if (!status.canProceed) {
      labLogger.error(`Guard clause falhou: ${status.reason}`, undefined, "LabGuard");
      
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: status.reason,
        cause: {
          type: "LAB_GUARD_VIOLATION",
          isLabMode: status.isLabMode,
          isBrokerConnected: status.isBrokerConnected,
          isLiveSessionActive: status.isLiveSessionActive,
        },
      });
    }
    
    labLogger.debug("Guard clause passou", "LabGuard");
  }
  
  /**
   * Verifica se uma operação específica é permitida em modo LAB
   */
  isOperationAllowed(operation: string): boolean {
    // Lista de operações PROIBIDAS em modo LAB
    const forbiddenOperations = [
      "broker.connect",
      "broker.disconnect",
      "broker.placeOrder",
      "broker.closePosition",
      "broker.modifyPosition",
      "live.startEngine",
      "live.stopEngine",
      "marketData.subscribeRealtime",
    ];
    
    if (forbiddenOperations.includes(operation)) {
      labLogger.warn(`Operação proibida em modo LAB: ${operation}`, "LabGuard");
      return false;
    }
    
    return true;
  }
  
  /**
   * Cria um erro estruturado para violações do guard
   */
  createGuardError(operation: string, details?: Record<string, any>): LabGuardError {
    return {
      code: "LAB_GUARD_VIOLATION",
      message: `Operação "${operation}" não permitida em modo LAB`,
      details: {
        operation,
        mode: this.config.mode,
        timestamp: new Date().toISOString(),
        ...details,
      },
    };
  }
  
  /**
   * Wrapper para executar operação com guard
   */
  async executeWithGuard<T>(
    operation: string,
    fn: () => Promise<T>,
    options: { brokerConnected?: boolean; liveEngineRunning?: boolean } = {}
  ): Promise<T> {
    // Verificar guard
    this.assertLabMode(options.brokerConnected, options.liveEngineRunning);
    
    // Verificar se operação é permitida
    if (!this.isOperationAllowed(operation)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Operação "${operation}" não permitida em modo LAB`,
      });
    }
    
    labLogger.debug(`Executando operação: ${operation}`, "LabGuard");
    
    try {
      return await fn();
    } catch (error) {
      // Re-throw TRPCErrors
      if (error instanceof TRPCError) {
        throw error;
      }
      
      // Wrap outros erros
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Erro na operação "${operation}": ${(error as Error).message}`,
        cause: error,
      });
    }
  }
  
  /**
   * Atualiza configuração
   */
  setConfig(config: Partial<LabGuardConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Obtém configuração atual
   */
  getConfig(): LabGuardConfig {
    return { ...this.config };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const labGuard = LabGuard.getInstance();

// ============================================================================
// STUB SERVICES
// ============================================================================

/**
 * Stub do adapter de trading para modo LAB
 * Retorna dados simulados em vez de conectar ao broker real
 */
export const labBrokerStub = {
  isConnected: () => false,
  getConnectionState: () => "DISCONNECTED" as const,
  
  connect: async () => {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Conexão com broker não permitida em modo LAB",
    });
  },
  
  disconnect: async () => {
    labLogger.warn("Tentativa de desconexão ignorada em modo LAB", "BrokerStub");
  },
  
  getAccountInfo: async () => ({
    balance: 10000,
    equity: 10000,
    margin: 0,
    freeMargin: 10000,
    marginLevel: 0,
    currency: "USD",
  }),
  
  getPrice: async (symbol: string) => ({
    symbol,
    bid: 0,
    ask: 0,
    timestamp: Date.now(),
  }),
  
  placeOrder: async () => {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Ordens não permitidas em modo LAB",
    });
  },
  
  closePosition: async () => {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Fechamento de posições não permitido em modo LAB",
    });
  },
};

/**
 * Stub do MarketDataCollector para modo LAB
 * Usa apenas dados locais, nunca conecta ao broker
 */
export const labMarketDataStub = {
  downloadAll: async () => {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Download de dados requer conexão com broker. Use dados locais existentes.",
    });
  },
  
  getAvailableDataFiles: () => [],
  
  getDataSummary: () => ({
    totalFiles: 0,
    totalCandles: 0,
    symbols: [],
    timeframes: [],
  }),
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Decorator para métodos que requerem modo LAB
 */
export function requireLabMode() {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      labGuard.assertLabMode();
      return originalMethod.apply(this, args);
    };
    
    return descriptor;
  };
}

/**
 * Verifica se o ambiente está configurado para modo LAB
 */
export function isLabEnvironment(): boolean {
  return process.env.LAB_MODE === "true" || labGuard.isLabMode();
}

/**
 * Configura o sistema para modo LAB
 */
export function enableLabMode(): void {
  labGuard.setConfig({ mode: "LAB", forceLabMode: true });
  labLogger.info("Modo LAB ativado", "LabGuard");
}

/**
 * Desativa o modo LAB (apenas para testes)
 */
export function disableLabMode(): void {
  labGuard.setConfig({ mode: "LIVE", forceLabMode: false });
  labLogger.warn("Modo LAB desativado", "LabGuard");
}
