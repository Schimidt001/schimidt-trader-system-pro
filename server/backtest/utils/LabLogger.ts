/**
 * LabLogger - Sistema de Logging Institucional para o Laboratório
 * 
 * TAREFA 2: Reduzir logging para evitar rate limit do Railway (500 logs/sec)
 * 
 * Implementa:
 * - Níveis de log configuráveis (debug, info, warn, error)
 * - Throttling para logs em loops (máximo 1 log por intervalo)
 * - Logs agregados para operações em batch
 * - Controle de verbosidade por ambiente (dev vs prod)
 * 
 * Meta: < 50 logs/seg (ideal: < 10 logs/seg)
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

// ============================================================================
// TYPES
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggerConfig {
  /** Nível mínimo de log a ser exibido */
  level: LogLevel;
  /** Prefixo para todas as mensagens */
  prefix: string;
  /** Intervalo mínimo entre logs throttled (ms) */
  throttleIntervalMs: number;
  /** Habilitar logs de progresso em loops */
  enableProgressLogs: boolean;
  /** Intervalo para logs de progresso (número de iterações) */
  progressLogInterval: number;
}

interface ThrottleState {
  lastLogTime: number;
  suppressedCount: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: LoggerConfig = {
  level: process.env.LOG_LEVEL as LogLevel || "info",
  prefix: "[Lab]",
  throttleIntervalMs: 5000, // 5 segundos entre logs throttled
  enableProgressLogs: true,
  progressLogInterval: 1000, // Log a cada 1000 iterações
};

// Níveis de log ordenados por prioridade
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ============================================================================
// LAB LOGGER CLASS
// ============================================================================

export class LabLogger {
  private config: LoggerConfig;
  private throttleStates: Map<string, ThrottleState> = new Map();
  private aggregatedLogs: Map<string, { count: number; lastMessage: string }> = new Map();
  
  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Verifica se o nível de log deve ser exibido
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }
  
  /**
   * Formata a mensagem de log
   */
  private formatMessage(level: LogLevel, message: string, context?: string): string {
    const timestamp = new Date().toISOString().split("T")[1].slice(0, 12);
    const contextStr = context ? ` [${context}]` : "";
    return `${timestamp} ${this.config.prefix}${contextStr} ${message}`;
  }
  
  /**
   * Log de debug (apenas em desenvolvimento)
   */
  debug(message: string, context?: string): void {
    if (this.shouldLog("debug")) {
      console.log(this.formatMessage("debug", message, context));
    }
  }
  
  /**
   * Log de informação
   */
  info(message: string, context?: string): void {
    if (this.shouldLog("info")) {
      console.log(this.formatMessage("info", message, context));
    }
  }
  
  /**
   * Log de aviso
   */
  warn(message: string, context?: string): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", `⚠️ ${message}`, context));
    }
  }
  
  /**
   * Log de erro
   */
  error(message: string, error?: Error, context?: string): void {
    if (this.shouldLog("error")) {
      const errorDetails = error ? `: ${error.message}` : "";
      console.error(this.formatMessage("error", `❌ ${message}${errorDetails}`, context));
    }
  }
  
  /**
   * Log throttled - máximo 1 log por intervalo para a mesma chave
   * Útil para logs dentro de loops que não precisam aparecer a cada iteração
   */
  throttled(key: string, level: LogLevel, message: string, context?: string): void {
    if (!this.shouldLog(level)) return;
    
    const now = Date.now();
    const state = this.throttleStates.get(key) || { lastLogTime: 0, suppressedCount: 0 };
    
    if (now - state.lastLogTime >= this.config.throttleIntervalMs) {
      // Exibir log com contagem de suprimidos se houver
      const suppressedInfo = state.suppressedCount > 0 
        ? ` (${state.suppressedCount} logs suprimidos)` 
        : "";
      
      // Chamar o método correto baseado no nível
      switch (level) {
        case "debug":
          this.debug(`${message}${suppressedInfo}`, context);
          break;
        case "info":
          this.info(`${message}${suppressedInfo}`, context);
          break;
        case "warn":
          this.warn(`${message}${suppressedInfo}`, context);
          break;
        case "error":
          this.error(`${message}${suppressedInfo}`, undefined, context);
          break;
      }
      
      // Reset state
      this.throttleStates.set(key, { lastLogTime: now, suppressedCount: 0 });
    } else {
      // Incrementar contador de suprimidos
      state.suppressedCount++;
      this.throttleStates.set(key, state);
    }
  }
  
  /**
   * Log de progresso - exibe apenas a cada N iterações
   * Ideal para loops de processamento de velas
   */
  progress(
    current: number,
    total: number,
    message: string,
    context?: string
  ): void {
    if (!this.config.enableProgressLogs) return;
    if (!this.shouldLog("info")) return;
    
    // Log apenas a cada progressLogInterval iterações ou no final
    if (current % this.config.progressLogInterval === 0 || current === total) {
      const percent = ((current / total) * 100).toFixed(1);
      this.info(`${message} [${current}/${total}] (${percent}%)`, context);
    }
  }
  
  /**
   * Log agregado - acumula mensagens e exibe resumo
   * Útil para operações em batch
   */
  aggregate(key: string, message: string): void {
    const state = this.aggregatedLogs.get(key) || { count: 0, lastMessage: "" };
    state.count++;
    state.lastMessage = message;
    this.aggregatedLogs.set(key, state);
  }
  
  /**
   * Flush logs agregados
   */
  flushAggregated(key: string, context?: string): void {
    const state = this.aggregatedLogs.get(key);
    if (state && state.count > 0) {
      this.info(`${state.lastMessage} (${state.count} ocorrências)`, context);
      this.aggregatedLogs.delete(key);
    }
  }
  
  /**
   * Log de início de operação (sempre exibido)
   */
  startOperation(operation: string, details?: Record<string, any>): void {
    const detailsStr = details 
      ? ` | ${Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(", ")}`
      : "";
    console.log(`\n${"═".repeat(60)}`);
    console.log(`${this.config.prefix} 🚀 ${operation}${detailsStr}`);
    console.log(`${"═".repeat(60)}`);
  }
  
  /**
   * Log de fim de operação (sempre exibido)
   */
  endOperation(operation: string, success: boolean, details?: Record<string, any>): void {
    const status = success ? "✅ CONCLUÍDO" : "❌ FALHOU";
    const detailsStr = details 
      ? ` | ${Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(", ")}`
      : "";
    console.log(`${"═".repeat(60)}`);
    console.log(`${this.config.prefix} ${status}: ${operation}${detailsStr}`);
    console.log(`${"═".repeat(60)}\n`);
  }
  
  /**
   * Atualiza configuração do logger
   */
  setConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Obtém configuração atual
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }
  
  /**
   * Limpa estados internos
   */
  reset(): void {
    this.throttleStates.clear();
    this.aggregatedLogs.clear();
  }
}

// ============================================================================
// SINGLETON INSTANCES
// ============================================================================

/** Logger para o módulo de otimização */
export const optimizationLogger = new LabLogger({
  prefix: "[Optimization]",
  progressLogInterval: 100, // Log a cada 100 combinações
});

/** Logger para o módulo de backtest */
export const backtestLogger = new LabLogger({
  prefix: "[Backtest]",
  progressLogInterval: 1000, // Log a cada 1000 velas
});

/** Logger para o módulo de validação */
export const validationLogger = new LabLogger({
  prefix: "[Validation]",
  progressLogInterval: 10, // Log a cada 10 janelas
});

/** Logger para o módulo multi-asset */
export const multiAssetLogger = new LabLogger({
  prefix: "[MultiAsset]",
  progressLogInterval: 500,
});

/** Logger para o módulo de configuração */
export const configLogger = new LabLogger({
  prefix: "[Config]",
  progressLogInterval: 100,
});

/** Logger para o módulo de dados */
export const dataLogger = new LabLogger({
  prefix: "[Data]",
  progressLogInterval: 500,
});

/** Logger genérico para o laboratório */
export const labLogger = new LabLogger({
  prefix: "[Lab]",
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Configura o nível de log global para todos os loggers
 */
export function setGlobalLogLevel(level: LogLevel): void {
  optimizationLogger.setConfig({ level });
  backtestLogger.setConfig({ level });
  validationLogger.setConfig({ level });
  multiAssetLogger.setConfig({ level });
  configLogger.setConfig({ level });
  dataLogger.setConfig({ level });
  labLogger.setConfig({ level });
}

/**
 * Desabilita logs de progresso (útil para produção)
 */
export function disableProgressLogs(): void {
  optimizationLogger.setConfig({ enableProgressLogs: false });
  backtestLogger.setConfig({ enableProgressLogs: false });
  validationLogger.setConfig({ enableProgressLogs: false });
  multiAssetLogger.setConfig({ enableProgressLogs: false });
  configLogger.setConfig({ enableProgressLogs: false });
  dataLogger.setConfig({ enableProgressLogs: false });
}

/**
 * Habilita modo silencioso (apenas erros)
 */
export function enableSilentMode(): void {
  setGlobalLogLevel("error");
  disableProgressLogs();
}

/**
 * Habilita modo verbose (debug)
 */
export function enableVerboseMode(): void {
  setGlobalLogLevel("debug");
  optimizationLogger.setConfig({ enableProgressLogs: true });
  backtestLogger.setConfig({ enableProgressLogs: true });
  validationLogger.setConfig({ enableProgressLogs: true });
  multiAssetLogger.setConfig({ enableProgressLogs: true });
  configLogger.setConfig({ enableProgressLogs: true });
  dataLogger.setConfig({ enableProgressLogs: true });
}
