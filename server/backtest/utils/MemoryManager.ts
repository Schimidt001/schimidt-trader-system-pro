/**
 * MemoryManager - Gerenciador de Memória para o Laboratório
 * 
 * CORREÇÃO OOM: Implementa monitoramento e otimização de memória
 * 
 * Funcionalidades:
 * - Monitoramento de uso de heap
 * - Garbage collection forçado
 * - Limites de memória configuráveis
 * - Alertas de memória alta
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { labLogger } from "./LabLogger";

// ============================================================================
// TYPES
// ============================================================================

export interface MemoryStats {
  /** Heap usado em bytes */
  heapUsed: number;
  /** Heap total em bytes */
  heapTotal: number;
  /** RSS (Resident Set Size) em bytes */
  rss: number;
  /** Memória externa em bytes */
  external: number;
  /** Percentual de heap usado */
  heapUsedPercent: number;
  /** Timestamp da medição */
  timestamp: number;
}

export interface MemoryConfig {
  /** Limite de heap em MB para alerta */
  heapWarningThresholdMB: number;
  /** Limite de heap em MB para ação crítica */
  heapCriticalThresholdMB: number;
  /** Intervalo de monitoramento em ms */
  monitoringIntervalMs: number;
  /** Habilitar GC forçado quando crítico */
  enableForcedGC: boolean;
  /** Habilitar logs de memória */
  enableMemoryLogs: boolean;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  heapWarningThresholdMB: 350, // 70% de 512MB
  heapCriticalThresholdMB: 450, // 90% de 512MB
  monitoringIntervalMs: 10000, // 10 segundos
  enableForcedGC: true,
  enableMemoryLogs: true,
};

// ============================================================================
// MEMORY MANAGER CLASS
// ============================================================================

export class MemoryManager {
  private static instance: MemoryManager | null = null;
  private config: MemoryConfig;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private memoryHistory: MemoryStats[] = [];
  private maxHistorySize = 100;
  private onWarningCallback?: (stats: MemoryStats) => void;
  private onCriticalCallback?: (stats: MemoryStats) => void;

  constructor(config: Partial<MemoryConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
  }

  /**
   * Obtém instância singleton
   */
  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  /**
   * Obtém estatísticas de memória atuais
   */
  getMemoryStats(): MemoryStats {
    const mem = process.memoryUsage();
    const heapUsedPercent = (mem.heapUsed / mem.heapTotal) * 100;

    return {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
      external: mem.external,
      heapUsedPercent,
      timestamp: Date.now(),
    };
  }

  /**
   * Formata bytes para string legível
   */
  formatBytes(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  }

  /**
   * Verifica se memória está em nível de alerta
   */
  isWarningLevel(): boolean {
    const stats = this.getMemoryStats();
    const heapMB = stats.heapUsed / (1024 * 1024);
    return heapMB >= this.config.heapWarningThresholdMB;
  }

  /**
   * Verifica se memória está em nível crítico
   */
  isCriticalLevel(): boolean {
    const stats = this.getMemoryStats();
    const heapMB = stats.heapUsed / (1024 * 1024);
    return heapMB >= this.config.heapCriticalThresholdMB;
  }

  /**
   * Força garbage collection se disponível
   */
  forceGC(): boolean {
    if (global.gc) {
      const before = this.getMemoryStats();
      global.gc();
      const after = this.getMemoryStats();
      
      if (this.config.enableMemoryLogs) {
        const freed = before.heapUsed - after.heapUsed;
        labLogger.info(
          `GC forçado: ${this.formatBytes(freed)} liberados | ` +
          `Heap: ${this.formatBytes(after.heapUsed)}/${this.formatBytes(after.heapTotal)}`,
          "MemoryManager"
        );
      }
      return true;
    }
    return false;
  }

  /**
   * Tenta liberar memória
   * Chamado automaticamente quando memória está crítica
   */
  tryFreeMemory(): void {
    // 1. Forçar GC se disponível
    if (this.config.enableForcedGC) {
      this.forceGC();
    }

    // 2. Limpar histórico de memória
    if (this.memoryHistory.length > 10) {
      this.memoryHistory = this.memoryHistory.slice(-10);
    }
  }

  /**
   * Inicia monitoramento de memória
   */
  startMonitoring(): void {
    if (this.monitoringInterval) {
      return; // Já está monitorando
    }

    labLogger.info("Iniciando monitoramento de memória", "MemoryManager");

    this.monitoringInterval = setInterval(() => {
      const stats = this.getMemoryStats();
      
      // Adicionar ao histórico
      this.memoryHistory.push(stats);
      if (this.memoryHistory.length > this.maxHistorySize) {
        this.memoryHistory.shift();
      }

      const heapMB = stats.heapUsed / (1024 * 1024);

      // Verificar níveis
      if (heapMB >= this.config.heapCriticalThresholdMB) {
        labLogger.warn(
          `⚠️ MEMÓRIA CRÍTICA: ${this.formatBytes(stats.heapUsed)} | ` +
          `RSS: ${this.formatBytes(stats.rss)}`,
          "MemoryManager"
        );
        
        this.onCriticalCallback?.(stats);
        this.tryFreeMemory();
        
      } else if (heapMB >= this.config.heapWarningThresholdMB) {
        if (this.config.enableMemoryLogs) {
          labLogger.warn(
            `Memória alta: ${this.formatBytes(stats.heapUsed)} | ` +
            `RSS: ${this.formatBytes(stats.rss)}`,
            "MemoryManager"
          );
        }
        this.onWarningCallback?.(stats);
      }
    }, this.config.monitoringIntervalMs);
  }

  /**
   * Para monitoramento de memória
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      labLogger.info("Monitoramento de memória parado", "MemoryManager");
    }
  }

  /**
   * Define callback para nível de alerta
   */
  onWarning(callback: (stats: MemoryStats) => void): void {
    this.onWarningCallback = callback;
  }

  /**
   * Define callback para nível crítico
   */
  onCritical(callback: (stats: MemoryStats) => void): void {
    this.onCriticalCallback = callback;
  }

  /**
   * Obtém histórico de memória
   */
  getMemoryHistory(): MemoryStats[] {
    return [...this.memoryHistory];
  }

  /**
   * Obtém estatísticas resumidas
   */
  getMemorySummary(): {
    current: MemoryStats;
    peak: MemoryStats | null;
    average: number;
    trend: "increasing" | "stable" | "decreasing";
  } {
    const current = this.getMemoryStats();
    
    if (this.memoryHistory.length === 0) {
      return {
        current,
        peak: null,
        average: current.heapUsed,
        trend: "stable",
      };
    }

    // Encontrar pico
    const peak = this.memoryHistory.reduce((max, stat) => 
      stat.heapUsed > max.heapUsed ? stat : max
    );

    // Calcular média
    const average = this.memoryHistory.reduce((sum, stat) => 
      sum + stat.heapUsed, 0
    ) / this.memoryHistory.length;

    // Determinar tendência (últimas 10 medições)
    const recent = this.memoryHistory.slice(-10);
    let trend: "increasing" | "stable" | "decreasing" = "stable";
    
    if (recent.length >= 2) {
      const first = recent[0].heapUsed;
      const last = recent[recent.length - 1].heapUsed;
      const change = ((last - first) / first) * 100;
      
      if (change > 10) trend = "increasing";
      else if (change < -10) trend = "decreasing";
    }

    return { current, peak, average, trend };
  }

  /**
   * Log de estatísticas de memória
   */
  logMemoryStats(context?: string): void {
    const stats = this.getMemoryStats();
    const summary = this.getMemorySummary();
    
    labLogger.info(
      `Memória | Heap: ${this.formatBytes(stats.heapUsed)}/${this.formatBytes(stats.heapTotal)} ` +
      `(${stats.heapUsedPercent.toFixed(1)}%) | RSS: ${this.formatBytes(stats.rss)} | ` +
      `Tendência: ${summary.trend}`,
      context || "MemoryManager"
    );
  }

  /**
   * Atualiza configuração
   */
  setConfig(config: Partial<MemoryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Obtém configuração atual
   */
  getConfig(): MemoryConfig {
    return { ...this.config };
  }

  /**
   * Limpa estado interno
   */
  reset(): void {
    this.memoryHistory = [];
    this.stopMonitoring();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const memoryManager = MemoryManager.getInstance();

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Decorator para monitorar memória antes/depois de uma função
 */
export function withMemoryMonitoring<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  return (async () => {
    const before = memoryManager.getMemoryStats();
    
    try {
      const result = await fn();
      
      const after = memoryManager.getMemoryStats();
      const diff = after.heapUsed - before.heapUsed;
      
      labLogger.info(
        `${context} | Memória: ${diff > 0 ? "+" : ""}${memoryManager.formatBytes(diff)} | ` +
        `Heap: ${memoryManager.formatBytes(after.heapUsed)}`,
        "MemoryMonitor"
      );
      
      return result;
    } catch (error) {
      const after = memoryManager.getMemoryStats();
      labLogger.error(
        `${context} FALHOU | Heap: ${memoryManager.formatBytes(after.heapUsed)}`,
        error as Error,
        "MemoryMonitor"
      );
      throw error;
    }
  })();
}

/**
 * Verifica se há memória suficiente para uma operação
 */
export function hasEnoughMemory(requiredMB: number = 50): boolean {
  const stats = memoryManager.getMemoryStats();
  const availableMB = (stats.heapTotal - stats.heapUsed) / (1024 * 1024);
  return availableMB >= requiredMB;
}

/**
 * Aguarda até que memória esteja abaixo do limite
 */
export async function waitForMemory(
  targetMB: number = 300,
  timeoutMs: number = 30000
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const stats = memoryManager.getMemoryStats();
    const heapMB = stats.heapUsed / (1024 * 1024);
    
    if (heapMB <= targetMB) {
      return true;
    }
    
    // Tentar liberar memória
    memoryManager.tryFreeMemory();
    
    // Aguardar um pouco
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return false;
}
