/**
 * EnvironmentContext - Gerenciador de Contexto de Ambiente Lab/Live
 * 
 * CORREÇÃO CRÍTICA #3: Correção no Comportamento do downloadData
 * 
 * Este módulo fornece uma forma clara de determinar o contexto atual
 * (Lab ou Live) e permite que operações como downloadData funcionem
 * corretamente em ambos os ambientes.
 * 
 * Regras:
 * - Em ambiente Lab com isolamento estrito: Bloqueia conexões com broker
 * - Em ambiente Lab sem isolamento estrito: Permite download de dados
 * - Em ambiente Live: Permite todas as operações com broker
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { labLogger } from "./LabLogger";

// ============================================================================
// TYPES
// ============================================================================

export type EnvironmentType = "LAB" | "LIVE" | "HYBRID";

export interface EnvironmentConfig {
  /** Tipo de ambiente atual */
  type: EnvironmentType;
  /** Se o isolamento estrito está ativo (bloqueia broker em Lab) */
  strictIsolation: boolean;
  /** Se permite download de dados no Lab */
  allowDataDownloadInLab: boolean;
  /** Se permite conexão com broker no Lab */
  allowBrokerInLab: boolean;
}

export interface EnvironmentStatus {
  /** Tipo de ambiente atual */
  environment: EnvironmentType;
  /** Se está em modo Lab */
  isLabMode: boolean;
  /** Se está em modo Live */
  isLiveMode: boolean;
  /** Se o isolamento estrito está ativo */
  isStrictIsolation: boolean;
  /** Se pode baixar dados */
  canDownloadData: boolean;
  /** Se pode conectar ao broker */
  canConnectBroker: boolean;
  /** Razão para bloqueio (se houver) */
  blockReason: string | null;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: EnvironmentConfig = {
  type: "HYBRID", // Por padrão, servidor único com Lab + Live
  strictIsolation: false, // Não bloquear broker por padrão
  allowDataDownloadInLab: true, // Permitir download de dados no Lab
  allowBrokerInLab: false, // Não permitir operações de trading no Lab
};

// ============================================================================
// ENVIRONMENT CONTEXT CLASS
// ============================================================================

export class EnvironmentContext {
  private static instance: EnvironmentContext | null = null;
  private config: EnvironmentConfig;
  private currentContext: "LAB" | "LIVE" = "LIVE";
  
  private constructor() {
    // Carregar configuração de variáveis de ambiente
    this.config = {
      ...DEFAULT_CONFIG,
      strictIsolation: process.env.STRICT_LAB_ISOLATION === "true",
      type: this.detectEnvironmentType(),
    };
    
    labLogger.info(`EnvironmentContext inicializado: ${JSON.stringify(this.config)}`, "EnvironmentContext");
  }
  
  /**
   * Obtém instância singleton
   */
  static getInstance(): EnvironmentContext {
    if (!EnvironmentContext.instance) {
      EnvironmentContext.instance = new EnvironmentContext();
    }
    return EnvironmentContext.instance;
  }
  
  /**
   * Detecta o tipo de ambiente baseado em variáveis de ambiente
   */
  private detectEnvironmentType(): EnvironmentType {
    if (process.env.LAB_ONLY === "true") {
      return "LAB";
    }
    if (process.env.LIVE_ONLY === "true") {
      return "LIVE";
    }
    return "HYBRID";
  }
  
  // ==========================================================================
  // CONTEXT MANAGEMENT
  // ==========================================================================
  
  /**
   * Define o contexto atual (Lab ou Live)
   * Chamado quando o usuário navega entre abas
   */
  setContext(context: "LAB" | "LIVE"): void {
    const previousContext = this.currentContext;
    this.currentContext = context;
    
    if (previousContext !== context) {
      labLogger.info(`Contexto alterado: ${previousContext} -> ${context}`, "EnvironmentContext");
    }
  }
  
  /**
   * Obtém o contexto atual
   */
  getContext(): "LAB" | "LIVE" {
    return this.currentContext;
  }
  
  /**
   * Verifica se está em contexto Lab
   */
  isLabContext(): boolean {
    return this.currentContext === "LAB" || this.config.type === "LAB";
  }
  
  /**
   * Verifica se está em contexto Live
   */
  isLiveContext(): boolean {
    return this.currentContext === "LIVE" || this.config.type === "LIVE";
  }
  
  // ==========================================================================
  // PERMISSION CHECKS
  // ==========================================================================
  
  /**
   * Verifica se pode baixar dados
   * 
   * CORREÇÃO #3: Permite download em Lab se não estiver em isolamento estrito
   */
  canDownloadData(): { allowed: boolean; reason: string | null } {
    // Em isolamento estrito, bloquear sempre
    if (this.config.strictIsolation && this.isLabContext()) {
      return {
        allowed: false,
        reason: "Strict Lab Isolation Active: Cannot connect to broker. Data must be local.",
      };
    }
    
    // Em modo híbrido ou Live, permitir download
    if (this.config.type === "HYBRID" || this.config.type === "LIVE") {
      return { allowed: true, reason: null };
    }
    
    // Em modo Lab puro sem isolamento estrito, permitir download
    if (this.config.type === "LAB" && this.config.allowDataDownloadInLab) {
      return { allowed: true, reason: null };
    }
    
    return {
      allowed: false,
      reason: "Data download not allowed in current environment configuration.",
    };
  }
  
  /**
   * Verifica se pode conectar ao broker
   * 
   * CORREÇÃO #3: Respeita contexto Lab/Live corretamente
   */
  canConnectBroker(): { allowed: boolean; reason: string | null } {
    // Em isolamento estrito no Lab, bloquear sempre
    if (this.config.strictIsolation && this.isLabContext()) {
      return {
        allowed: false,
        reason: "Strict Lab Isolation Active: Broker connections are blocked.",
      };
    }
    
    // Em contexto Live, sempre permitir
    if (this.isLiveContext()) {
      return { allowed: true, reason: null };
    }
    
    // Em contexto Lab sem isolamento estrito, depende da configuração
    if (this.isLabContext() && !this.config.allowBrokerInLab) {
      return {
        allowed: false,
        reason: "Broker connections not allowed in Lab context.",
      };
    }
    
    return { allowed: true, reason: null };
  }
  
  /**
   * Verifica se pode executar operações de trading
   */
  canTrade(): { allowed: boolean; reason: string | null } {
    // Trading nunca permitido em Lab
    if (this.isLabContext()) {
      return {
        allowed: false,
        reason: "Trading operations are not allowed in Lab context.",
      };
    }
    
    return { allowed: true, reason: null };
  }
  
  /**
   * Verifica se pode usar o CTraderAdapter real
   * 
   * CORREÇÃO #3: Retorna true apenas em contexto Live
   */
  canUseCTraderAdapter(): { allowed: boolean; reason: string | null } {
    // Em contexto Lab, nunca usar o adapter real
    if (this.isLabContext()) {
      return {
        allowed: false,
        reason: "CTraderAdapter not available in Lab context. Use BacktestAdapter instead.",
      };
    }
    
    return { allowed: true, reason: null };
  }
  
  // ==========================================================================
  // STATUS AND CONFIGURATION
  // ==========================================================================
  
  /**
   * Obtém status completo do ambiente
   */
  getStatus(): EnvironmentStatus {
    const downloadCheck = this.canDownloadData();
    const brokerCheck = this.canConnectBroker();
    
    return {
      environment: this.config.type,
      isLabMode: this.isLabContext(),
      isLiveMode: this.isLiveContext(),
      isStrictIsolation: this.config.strictIsolation,
      canDownloadData: downloadCheck.allowed,
      canConnectBroker: brokerCheck.allowed,
      blockReason: downloadCheck.reason || brokerCheck.reason,
    };
  }
  
  /**
   * Obtém configuração atual
   */
  getConfig(): EnvironmentConfig {
    return { ...this.config };
  }
  
  /**
   * Atualiza configuração
   */
  setConfig(config: Partial<EnvironmentConfig>): void {
    this.config = { ...this.config, ...config };
    labLogger.info(`EnvironmentContext configuração atualizada: ${JSON.stringify(this.config)}`, "EnvironmentContext");
  }
  
  /**
   * Ativa isolamento estrito (para testes ou configuração dinâmica)
   */
  enableStrictIsolation(): void {
    this.config.strictIsolation = true;
    labLogger.warn("Isolamento estrito ATIVADO", "EnvironmentContext");
  }
  
  /**
   * Desativa isolamento estrito
   */
  disableStrictIsolation(): void {
    this.config.strictIsolation = false;
    labLogger.info("Isolamento estrito DESATIVADO", "EnvironmentContext");
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const environmentContext = EnvironmentContext.getInstance();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Verifica se pode baixar dados no contexto atual
 */
export function canDownloadDataInCurrentContext(): { allowed: boolean; reason: string | null } {
  return environmentContext.canDownloadData();
}

/**
 * Verifica se pode usar o broker no contexto atual
 */
export function canUseBrokerInCurrentContext(): { allowed: boolean; reason: string | null } {
  return environmentContext.canConnectBroker();
}

/**
 * Verifica se está em contexto Lab
 */
export function isInLabContext(): boolean {
  return environmentContext.isLabContext();
}

/**
 * Verifica se está em contexto Live
 */
export function isInLiveContext(): boolean {
  return environmentContext.isLiveContext();
}
