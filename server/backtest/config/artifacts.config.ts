/**
 * Artifacts Configuration - Configuração de Artefatos para Produção
 * 
 * Este módulo define as configurações de armazenamento, cleanup e limites
 * para artefatos gerados pelo Laboratório de Backtest Institucional Plus.
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import * as path from "path";

// ============================================================================
// ENVIRONMENT VARIABLES
// ============================================================================

/**
 * Configurações carregadas de variáveis de ambiente
 */
export const ENV_CONFIG = {
  /** Diretório base para artefatos (configurável via env var) */
  ARTIFACTS_BASE_PATH: process.env.BACKTEST_ARTIFACTS_PATH || "/tmp/backtest-artifacts",
  
  /** TTL padrão em horas para artefatos (configurável via env var) */
  ARTIFACTS_TTL_HOURS: parseInt(process.env.BACKTEST_ARTIFACTS_TTL_HOURS || "168", 10), // 7 dias
  
  /** Tamanho máximo do diretório de artefatos em MB (configurável via env var) */
  ARTIFACTS_MAX_SIZE_MB: parseInt(process.env.BACKTEST_ARTIFACTS_MAX_SIZE_MB || "5120", 10), // 5GB
  
  /** Habilitar cleanup automático (configurável via env var) */
  ARTIFACTS_AUTO_CLEANUP: process.env.BACKTEST_ARTIFACTS_AUTO_CLEANUP !== "false",
  
  /** Intervalo de cleanup em horas (configurável via env var) */
  ARTIFACTS_CLEANUP_INTERVAL_HOURS: parseInt(process.env.BACKTEST_ARTIFACTS_CLEANUP_INTERVAL_HOURS || "6", 10),
  
  /** Habilitar compressão de artefatos (configurável via env var) */
  ARTIFACTS_COMPRESSION_ENABLED: process.env.BACKTEST_ARTIFACTS_COMPRESSION !== "false",
  
  /** Nível de log para artefatos (configurável via env var) */
  ARTIFACTS_LOG_LEVEL: process.env.BACKTEST_ARTIFACTS_LOG_LEVEL || "info",
};

// ============================================================================
// ARTIFACTS CONFIGURATION
// ============================================================================

/**
 * Configuração completa de artefatos
 */
export interface ArtifactsConfig {
  /** Diretório base para artefatos */
  basePath: string;
  
  /** Subdiretórios para diferentes tipos de artefatos */
  directories: {
    runs: string;
    optimizations: string;
    validations: string;
    monteCarlo: string;
    regimes: string;
    multiAsset: string;
    exports: string;
    temp: string;
  };
  
  /** Configurações de TTL (Time To Live) */
  ttl: {
    /** TTL padrão em horas */
    defaultHours: number;
    /** TTL para artefatos temporários em horas */
    tempHours: number;
    /** TTL para artefatos de exportação em horas */
    exportHours: number;
    /** TTL para artefatos de runs completos em horas */
    runsHours: number;
  };
  
  /** Limites de armazenamento */
  limits: {
    /** Tamanho máximo total em bytes */
    maxTotalSizeBytes: number;
    /** Tamanho máximo por arquivo em bytes */
    maxFileSizeBytes: number;
    /** Número máximo de arquivos por run */
    maxFilesPerRun: number;
    /** Número máximo de runs armazenados */
    maxStoredRuns: number;
  };
  
  /** Configurações de cleanup */
  cleanup: {
    /** Habilitar cleanup automático */
    enabled: boolean;
    /** Intervalo de cleanup em milissegundos */
    intervalMs: number;
    /** Estratégia de cleanup: "ttl" | "size" | "both" */
    strategy: "ttl" | "size" | "both";
    /** Porcentagem de espaço a liberar quando limite é atingido */
    targetFreePercent: number;
  };
  
  /** Configurações de compressão */
  compression: {
    /** Habilitar compressão */
    enabled: boolean;
    /** Tamanho mínimo para compressão em bytes */
    minSizeBytes: number;
    /** Algoritmo de compressão: "gzip" | "brotli" */
    algorithm: "gzip" | "brotli";
  };
  
  /** Configurações de segurança */
  security: {
    /** Lista de campos sensíveis a não salvar */
    sensitiveFields: string[];
    /** Habilitar sanitização de dados */
    sanitizeEnabled: boolean;
    /** Habilitar criptografia de artefatos */
    encryptionEnabled: boolean;
  };
}

/**
 * Configuração padrão de artefatos
 */
export const DEFAULT_ARTIFACTS_CONFIG: ArtifactsConfig = {
  basePath: ENV_CONFIG.ARTIFACTS_BASE_PATH,
  
  directories: {
    runs: path.join(ENV_CONFIG.ARTIFACTS_BASE_PATH, "runs"),
    optimizations: path.join(ENV_CONFIG.ARTIFACTS_BASE_PATH, "optimizations"),
    validations: path.join(ENV_CONFIG.ARTIFACTS_BASE_PATH, "validations"),
    monteCarlo: path.join(ENV_CONFIG.ARTIFACTS_BASE_PATH, "monte-carlo"),
    regimes: path.join(ENV_CONFIG.ARTIFACTS_BASE_PATH, "regimes"),
    multiAsset: path.join(ENV_CONFIG.ARTIFACTS_BASE_PATH, "multi-asset"),
    exports: path.join(ENV_CONFIG.ARTIFACTS_BASE_PATH, "exports"),
    temp: path.join(ENV_CONFIG.ARTIFACTS_BASE_PATH, "temp"),
  },
  
  ttl: {
    defaultHours: ENV_CONFIG.ARTIFACTS_TTL_HOURS,
    tempHours: 24, // 1 dia
    exportHours: 72, // 3 dias
    runsHours: ENV_CONFIG.ARTIFACTS_TTL_HOURS,
  },
  
  limits: {
    maxTotalSizeBytes: ENV_CONFIG.ARTIFACTS_MAX_SIZE_MB * 1024 * 1024,
    maxFileSizeBytes: 100 * 1024 * 1024, // 100MB por arquivo
    maxFilesPerRun: 50,
    maxStoredRuns: 100,
  },
  
  cleanup: {
    enabled: ENV_CONFIG.ARTIFACTS_AUTO_CLEANUP,
    intervalMs: ENV_CONFIG.ARTIFACTS_CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000,
    strategy: "both",
    targetFreePercent: 20,
  },
  
  compression: {
    enabled: ENV_CONFIG.ARTIFACTS_COMPRESSION_ENABLED,
    minSizeBytes: 1024 * 1024, // 1MB
    algorithm: "gzip",
  },
  
  security: {
    sensitiveFields: [
      "apiKey",
      "apiSecret",
      "password",
      "token",
      "accessToken",
      "refreshToken",
      "privateKey",
      "secretKey",
    ],
    sanitizeEnabled: true,
    encryptionEnabled: false, // Desabilitado por padrão
  },
};

// ============================================================================
// PAYLOAD LIMITS
// ============================================================================

/**
 * Limites de payload para evitar explosão de JSON
 */
export const PAYLOAD_LIMITS = {
  /** Número máximo de trades por resposta */
  maxTradesPerResponse: 10000,
  
  /** Número máximo de pontos na equity curve */
  maxEquityCurvePoints: 5000,
  
  /** Número máximo de combinações de otimização por resposta */
  maxOptimizationCombinations: 1000,
  
  /** Número máximo de janelas WFO por resposta */
  maxWFOWindows: 50,
  
  /** Número máximo de simulações Monte Carlo detalhadas */
  maxMonteCarloDetailedSims: 100,
  
  /** Número máximo de regimes por resposta */
  maxRegimesPerResponse: 500,
  
  /** Número máximo de posições multi-asset por resposta */
  maxMultiAssetPositions: 1000,
  
  /** Tamanho máximo de JSON em bytes (10MB) */
  maxJsonSizeBytes: 10 * 1024 * 1024,
  
  /** Habilitar paginação automática */
  autoPaginationEnabled: true,
  
  /** Tamanho padrão de página */
  defaultPageSize: 100,
};

// ============================================================================
// ARTIFACT MANAGER
// ============================================================================

/**
 * Gerenciador de artefatos
 */
export class ArtifactManager {
  private config: ArtifactsConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;
  
  constructor(config: Partial<ArtifactsConfig> = {}) {
    this.config = { ...DEFAULT_ARTIFACTS_CONFIG, ...config };
  }
  
  /**
   * Inicializar o gerenciador de artefatos
   */
  async initialize(): Promise<void> {
    // Criar diretórios se não existirem
    const fs = await import("fs/promises");
    
    for (const dir of Object.values(this.config.directories)) {
      try {
        await fs.mkdir(dir, { recursive: true });
        console.log(`[ArtifactManager] Diretório criado/verificado: ${dir}`);
      } catch (error) {
        console.error(`[ArtifactManager] Erro ao criar diretório ${dir}:`, error);
      }
    }
    
    // Iniciar cleanup automático se habilitado
    if (this.config.cleanup.enabled) {
      this.startAutoCleanup();
    }
    
    console.log(`[ArtifactManager] Inicializado com sucesso`);
    console.log(`[ArtifactManager] Base path: ${this.config.basePath}`);
    console.log(`[ArtifactManager] TTL padrão: ${this.config.ttl.defaultHours}h`);
    console.log(`[ArtifactManager] Tamanho máximo: ${this.config.limits.maxTotalSizeBytes / 1024 / 1024}MB`);
  }
  
  /**
   * Iniciar cleanup automático
   */
  private startAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(async () => {
      await this.runCleanup();
    }, this.config.cleanup.intervalMs);
    
    console.log(`[ArtifactManager] Cleanup automático iniciado (intervalo: ${this.config.cleanup.intervalMs / 1000 / 60}min)`);
  }
  
  /**
   * Executar cleanup
   */
  async runCleanup(): Promise<{ deletedFiles: number; freedBytes: number }> {
    const fs = await import("fs/promises");
    const path = await import("path");
    
    let deletedFiles = 0;
    let freedBytes = 0;
    
    console.log(`[ArtifactManager] Iniciando cleanup...`);
    
    const now = Date.now();
    
    for (const [type, dir] of Object.entries(this.config.directories)) {
      try {
        const files = await fs.readdir(dir);
        
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stats = await fs.stat(filePath);
          
          // Determinar TTL baseado no tipo
          let ttlHours = this.config.ttl.defaultHours;
          if (type === "temp") ttlHours = this.config.ttl.tempHours;
          if (type === "exports") ttlHours = this.config.ttl.exportHours;
          
          const ttlMs = ttlHours * 60 * 60 * 1000;
          const fileAge = now - stats.mtime.getTime();
          
          // Deletar se expirado
          if (fileAge > ttlMs) {
            await fs.unlink(filePath);
            deletedFiles++;
            freedBytes += stats.size;
            console.log(`[ArtifactManager] Deletado (TTL): ${filePath}`);
          }
        }
      } catch (error) {
        console.error(`[ArtifactManager] Erro ao processar diretório ${dir}:`, error);
      }
    }
    
    console.log(`[ArtifactManager] Cleanup concluído: ${deletedFiles} arquivos, ${(freedBytes / 1024 / 1024).toFixed(2)}MB liberados`);
    
    return { deletedFiles, freedBytes };
  }
  
  /**
   * Obter estatísticas de uso
   */
  async getStats(): Promise<{
    totalSizeBytes: number;
    totalFiles: number;
    byDirectory: Record<string, { sizeBytes: number; files: number }>;
  }> {
    const fs = await import("fs/promises");
    const pathModule = await import("path");
    
    let totalSizeBytes = 0;
    let totalFiles = 0;
    const byDirectory: Record<string, { sizeBytes: number; files: number }> = {};
    
    for (const [type, dir] of Object.entries(this.config.directories)) {
      try {
        const files = await fs.readdir(dir);
        let dirSize = 0;
        
        for (const file of files) {
          const filePath = pathModule.join(dir, file);
          const stats = await fs.stat(filePath);
          dirSize += stats.size;
        }
        
        byDirectory[type] = { sizeBytes: dirSize, files: files.length };
        totalSizeBytes += dirSize;
        totalFiles += files.length;
      } catch (error) {
        byDirectory[type] = { sizeBytes: 0, files: 0 };
      }
    }
    
    return { totalSizeBytes, totalFiles, byDirectory };
  }
  
  /**
   * Sanitizar dados sensíveis
   */
  sanitizeData(data: any): any {
    if (!this.config.security.sanitizeEnabled) {
      return data;
    }
    
    const sanitized = JSON.parse(JSON.stringify(data));
    
    const sanitizeObject = (obj: any): void => {
      if (typeof obj !== "object" || obj === null) return;
      
      for (const key of Object.keys(obj)) {
        if (this.config.security.sensitiveFields.includes(key)) {
          obj[key] = "[REDACTED]";
        } else if (typeof obj[key] === "object") {
          sanitizeObject(obj[key]);
        }
      }
    };
    
    sanitizeObject(sanitized);
    return sanitized;
  }
  
  /**
   * Obter configuração atual
   */
  getConfig(): ArtifactsConfig {
    return { ...this.config };
  }
  
  /**
   * Parar cleanup automático
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      console.log(`[ArtifactManager] Cleanup automático parado`);
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Criar instância do gerenciador de artefatos
 */
export function createArtifactManager(config?: Partial<ArtifactsConfig>): ArtifactManager {
  return new ArtifactManager(config);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  ENV_CONFIG,
  DEFAULT_ARTIFACTS_CONFIG,
  PAYLOAD_LIMITS,
  ArtifactManager,
  createArtifactManager,
};
