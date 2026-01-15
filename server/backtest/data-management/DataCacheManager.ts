/**
 * DataCacheManager - Gerenciador de Cache de Dados Históricos
 * 
 * Gerencia o cache de dados históricos para evitar downloads repetidos.
 * Verifica se os dados já existem no cache antes de baixar.
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import * as fs from "fs/promises";
import * as path from "path";
import { DataDownloader, DownloadConfig, DownloadResult } from "./DataDownloader";

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Resultado da verificação de cache
 */
export interface CacheCheckResult {
  /** Se todos os arquivos estão presentes */
  allPresent: boolean;
  
  /** Arquivos encontrados no cache */
  files: string[];
  
  /** Arquivos faltantes */
  missing: string[];
}

/**
 * Informações de um arquivo em cache
 */
export interface CachedFileInfo {
  /** Caminho do arquivo */
  path: string;
  
  /** Símbolo */
  symbol: string;
  
  /** Timeframe */
  timeframe: string;
  
  /** Tamanho em bytes */
  size: number;
  
  /** Data de modificação */
  modifiedAt: Date;
  
  /** Total de velas */
  totalBars: number;
  
  /** Data de início dos dados */
  startDate: Date;
  
  /** Data de fim dos dados */
  endDate: Date;
}

/**
 * Configuração do cache
 */
export interface CacheConfig {
  /** Diretório do cache */
  cacheDir: string;
  
  /** Tempo máximo de validade do cache em dias */
  maxAgeDays: number;
  
  /** Se deve verificar integridade dos arquivos */
  validateIntegrity: boolean;
}

// ============================================================================
// DATA CACHE MANAGER CLASS
// ============================================================================

export class DataCacheManager {
  private cacheDir: string;
  private maxAgeDays: number;
  private validateIntegrity: boolean;
  
  constructor(config: Partial<CacheConfig> = {}) {
    this.cacheDir = config.cacheDir || "./backtest-cache";
    this.maxAgeDays = config.maxAgeDays || 30;
    this.validateIntegrity = config.validateIntegrity ?? true;
  }
  
  /**
   * Obter dados do cache ou baixar se não existirem
   */
  async getOrDownload(config: DownloadConfig): Promise<string[]> {
    const downloader = new DataDownloader();
    
    // Verificar cache
    const cachedFiles = await this.checkCache(config);
    
    if (cachedFiles.allPresent) {
      console.log("[DataCache] ✅ Todos os dados encontrados no cache");
      return cachedFiles.files;
    }
    
    // Baixar dados faltantes
    console.log(`[DataCache] 📥 Baixando ${cachedFiles.missing.length} arquivos faltantes...`);
    
    // Criar config apenas para arquivos faltantes
    const missingSymbols = new Set<string>();
    const missingTimeframes = new Set<string>();
    
    for (const missing of cachedFiles.missing) {
      // Formato: SYMBOL_TIMEFRAME.json
      const match = missing.match(/^(.+)_([^_]+)\.json$/);
      if (match) {
        missingSymbols.add(match[1]);
        missingTimeframes.add(match[2]);
      }
    }
    
    const downloadConfig: DownloadConfig = {
      ...config,
      symbols: Array.from(missingSymbols),
      timeframes: Array.from(missingTimeframes),
      outputPath: config.outputPath,
    };
    
    const result = await downloader.downloadHistoricalData(downloadConfig);
    
    if (!result.success) {
      throw new Error(`Erro ao baixar dados: ${result.errors.join(", ")}`);
    }
    
    // Retornar todos os arquivos (cache + novos)
    return [...cachedFiles.files, ...result.filesCreated];
  }
  
  /**
   * Verificar quais dados já estão no cache
   */
  async checkCache(config: DownloadConfig): Promise<CacheCheckResult> {
    const files: string[] = [];
    const missing: string[] = [];
    
    for (const symbol of config.symbols) {
      for (const timeframe of config.timeframes) {
        const fileName = `${symbol}_${timeframe}.json`;
        const filePath = path.join(config.outputPath, fileName);
        
        const exists = await this.fileExists(filePath);
        
        if (exists) {
          // Verificar se o cache ainda é válido
          const isValid = await this.isCacheValid(filePath);
          
          if (isValid) {
            files.push(filePath);
          } else {
            console.log(`[DataCache] Cache expirado para ${fileName}`);
            missing.push(fileName);
          }
        } else {
          missing.push(fileName);
        }
      }
    }
    
    return {
      allPresent: missing.length === 0,
      files,
      missing,
    };
  }
  
  /**
   * Verificar se um arquivo existe
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Verificar se o cache ainda é válido (não expirou)
   */
  private async isCacheValid(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);
      const ageMs = Date.now() - stats.mtime.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      
      if (ageDays > this.maxAgeDays) {
        return false;
      }
      
      // Verificar integridade se configurado
      if (this.validateIntegrity) {
        return await this.validateFileIntegrity(filePath);
      }
      
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Validar integridade do arquivo
   */
  private async validateFileIntegrity(filePath: string): Promise<boolean> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(content);
      
      // Verificar estrutura básica
      if (!data.symbol || !data.timeframe || !data.bars || !Array.isArray(data.bars)) {
        return false;
      }
      
      // Verificar se tem dados
      if (data.bars.length === 0) {
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Obter informações de todos os arquivos em cache
   */
  async getCachedFiles(): Promise<CachedFileInfo[]> {
    const files: CachedFileInfo[] = [];
    
    try {
      const entries = await fs.readdir(this.cacheDir);
      
      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        
        const filePath = path.join(this.cacheDir, entry);
        
        try {
          const stats = await fs.stat(filePath);
          const content = await fs.readFile(filePath, "utf-8");
          const data = JSON.parse(content);
          
          files.push({
            path: filePath,
            symbol: data.symbol,
            timeframe: data.timeframe,
            size: stats.size,
            modifiedAt: stats.mtime,
            totalBars: data.totalBars || data.bars?.length || 0,
            startDate: new Date(data.startDate),
            endDate: new Date(data.endDate),
          });
        } catch {
          // Ignorar arquivos inválidos
          console.warn(`[DataCache] Arquivo inválido ignorado: ${entry}`);
        }
      }
    } catch {
      // Diretório não existe
    }
    
    return files;
  }
  
  /**
   * Limpar cache expirado
   */
  async cleanExpiredCache(): Promise<{ deleted: number; freedBytes: number }> {
    let deleted = 0;
    let freedBytes = 0;
    
    try {
      const entries = await fs.readdir(this.cacheDir);
      
      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        
        const filePath = path.join(this.cacheDir, entry);
        
        try {
          const stats = await fs.stat(filePath);
          const ageMs = Date.now() - stats.mtime.getTime();
          const ageDays = ageMs / (1000 * 60 * 60 * 24);
          
          if (ageDays > this.maxAgeDays) {
            await fs.unlink(filePath);
            deleted++;
            freedBytes += stats.size;
            console.log(`[DataCache] Arquivo expirado removido: ${entry}`);
          }
        } catch {
          // Ignorar erros de arquivos individuais
        }
      }
    } catch {
      // Diretório não existe
    }
    
    return { deleted, freedBytes };
  }
  
  /**
   * Limpar todo o cache
   */
  async clearAllCache(): Promise<{ deleted: number; freedBytes: number }> {
    let deleted = 0;
    let freedBytes = 0;
    
    try {
      const entries = await fs.readdir(this.cacheDir);
      
      for (const entry of entries) {
        const filePath = path.join(this.cacheDir, entry);
        
        try {
          const stats = await fs.stat(filePath);
          await fs.unlink(filePath);
          deleted++;
          freedBytes += stats.size;
        } catch {
          // Ignorar erros de arquivos individuais
        }
      }
    } catch {
      // Diretório não existe
    }
    
    return { deleted, freedBytes };
  }
  
  /**
   * Obter estatísticas do cache
   */
  async getCacheStats(): Promise<{
    totalFiles: number;
    totalSizeBytes: number;
    oldestFile: Date | null;
    newestFile: Date | null;
    symbols: string[];
    timeframes: string[];
  }> {
    const files = await this.getCachedFiles();
    
    if (files.length === 0) {
      return {
        totalFiles: 0,
        totalSizeBytes: 0,
        oldestFile: null,
        newestFile: null,
        symbols: [],
        timeframes: [],
      };
    }
    
    const symbols = new Set<string>();
    const timeframes = new Set<string>();
    let totalSize = 0;
    let oldest: Date | null = null;
    let newest: Date | null = null;
    
    for (const file of files) {
      symbols.add(file.symbol);
      timeframes.add(file.timeframe);
      totalSize += file.size;
      
      if (!oldest || file.modifiedAt < oldest) {
        oldest = file.modifiedAt;
      }
      if (!newest || file.modifiedAt > newest) {
        newest = file.modifiedAt;
      }
    }
    
    return {
      totalFiles: files.length,
      totalSizeBytes: totalSize,
      oldestFile: oldest,
      newestFile: newest,
      symbols: Array.from(symbols),
      timeframes: Array.from(timeframes),
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createDataCacheManager(config?: Partial<CacheConfig>): DataCacheManager {
  return new DataCacheManager(config);
}
