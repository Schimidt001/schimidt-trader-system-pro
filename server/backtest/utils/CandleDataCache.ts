/**
 * CandleDataCache - Cache Singleton de Dados de Candles em Memória
 * 
 * CORREÇÃO OOM: Este módulo implementa um cache compartilhado de candles
 * que evita recarregar os mesmos dados para cada combinação de backtest.
 * 
 * Funcionalidades:
 * - Cache singleton compartilhado entre todas as combinações
 * - Evita duplicação de arrays de candles em memória
 * - Suporta múltiplos símbolos e timeframes
 * - Limpeza automática de cache não utilizado
 * - Monitoramento de uso de memória
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import * as fs from "fs";
import * as path from "path";
import { CandleData } from "../../adapters/IBrokerAdapter";
import { HistoricalDataFile } from "../types/backtest.types";
import { labLogger } from "./LabLogger";
import { memoryManager } from "./MemoryManager";

// ============================================================================
// TYPES
// ============================================================================

export interface CachedCandles {
  /** Símbolo do ativo */
  symbol: string;
  
  /** Timeframe */
  timeframe: string;
  
  /** Array de candles (referência única) */
  candles: CandleData[];
  
  /** Timestamp de quando foi carregado */
  loadedAt: number;
  
  /** Número de acessos */
  accessCount: number;
  
  /** Data de início dos dados */
  startDate: Date;
  
  /** Data de fim dos dados */
  endDate: Date;
}

export interface CacheStats {
  /** Total de entradas no cache */
  totalEntries: number;
  
  /** Total de candles em cache */
  totalCandles: number;
  
  /** Estimativa de memória usada em bytes */
  estimatedMemoryBytes: number;
  
  /** Símbolos em cache */
  symbols: string[];
  
  /** Timeframes em cache */
  timeframes: string[];
}

// ============================================================================
// CANDLE DATA CACHE CLASS
// ============================================================================

export class CandleDataCache {
  private static instance: CandleDataCache | null = null;
  
  /** Cache de candles: chave = "SYMBOL_TIMEFRAME" */
  private cache: Map<string, CachedCandles> = new Map();
  
  /** Tamanho estimado por candle em bytes (para monitoramento) */
  private readonly BYTES_PER_CANDLE = 80; // timestamp + OHLCV + overhead
  
  /** Limite máximo de candles em cache (para evitar OOM) */
  private maxCandlesInCache: number = 500000; // ~40MB
  
  private constructor() {
    labLogger.info("CandleDataCache inicializado", "CandleCache");
  }
  
  /**
   * Obtém instância singleton
   */
  static getInstance(): CandleDataCache {
    if (!CandleDataCache.instance) {
      CandleDataCache.instance = new CandleDataCache();
    }
    return CandleDataCache.instance;
  }
  
  /**
   * Gera chave de cache
   */
  private getCacheKey(symbol: string, timeframe: string): string {
    return `${symbol}_${timeframe}`;
  }
  
  /**
   * Obtém candles do cache ou carrega do arquivo
   * 
   * @param dataPath - Caminho do diretório de dados
   * @param symbol - Símbolo do ativo
   * @param timeframe - Timeframe
   * @param startDate - Data de início do período
   * @param endDate - Data de fim do período
   * @returns Array de candles (referência do cache)
   */
  getOrLoad(
    dataPath: string,
    symbol: string,
    timeframe: string,
    startDate: Date,
    endDate: Date
  ): CandleData[] {
    const cacheKey = this.getCacheKey(symbol, timeframe);
    
    // Verificar se já está em cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      // Verificar se o período está coberto
      if (cached.startDate <= startDate && cached.endDate >= endDate) {
        cached.accessCount++;
        labLogger.debug(`Cache hit: ${cacheKey} (acessos: ${cached.accessCount})`, "CandleCache");
        
        // Filtrar candles pelo período solicitado
        const startTime = startDate.getTime();
        const endTime = endDate.getTime();
        return cached.candles.filter(c => c.timestamp >= startTime && c.timestamp <= endTime);
      }
      
      // Período não coberto, recarregar
      labLogger.debug(`Cache miss (período): ${cacheKey}`, "CandleCache");
    }
    
    // Carregar do arquivo
    const candles = this.loadFromFile(dataPath, symbol, timeframe);
    
    if (candles.length === 0) {
      return [];
    }
    
    // Verificar limite de memória antes de adicionar ao cache
    const currentTotal = this.getTotalCandlesInCache();
    if (currentTotal + candles.length > this.maxCandlesInCache) {
      labLogger.warn(`Cache cheio (${currentTotal} candles), limpando entradas antigas...`, "CandleCache");
      this.evictOldestEntries(candles.length);
    }
    
    // Adicionar ao cache
    const entry: CachedCandles = {
      symbol,
      timeframe,
      candles,
      loadedAt: Date.now(),
      accessCount: 1,
      startDate: new Date(candles[0].timestamp),
      endDate: new Date(candles[candles.length - 1].timestamp),
    };
    
    this.cache.set(cacheKey, entry);
    
    labLogger.info(`Cache loaded: ${cacheKey} (${candles.length} candles)`, "CandleCache");
    
    // Filtrar candles pelo período solicitado
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();
    return candles.filter(c => c.timestamp >= startTime && c.timestamp <= endTime);
  }
  
  /**
   * Carrega candles de um arquivo JSON
   */
  private loadFromFile(dataPath: string, symbol: string, timeframe: string): CandleData[] {
    const absolutePath = path.isAbsolute(dataPath)
      ? dataPath
      : path.resolve(process.cwd(), dataPath);
    
    const fileName = `${symbol}_${timeframe}.json`;
    const filePath = path.join(absolutePath, fileName);
    
    if (!fs.existsSync(filePath)) {
      labLogger.warn(`Arquivo não encontrado: ${filePath}`, "CandleCache");
      return [];
    }
    
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const data: HistoricalDataFile = JSON.parse(content);
      
      if (!data.bars || data.bars.length === 0) {
        labLogger.warn(`Arquivo sem dados: ${fileName}`, "CandleCache");
        return [];
      }
      
      // Detectar formato de timestamp
      const firstBar = data.bars[0];
      const isMilliseconds = firstBar.timestamp >= 1e12;
      
      // Normalizar timestamps para milissegundos
      const normalizedBars: CandleData[] = data.bars.map(bar => ({
        ...bar,
        timestamp: isMilliseconds ? bar.timestamp : bar.timestamp * 1000,
      }));
      
      labLogger.debug(`Carregados ${normalizedBars.length} candles de ${fileName}`, "CandleCache");
      
      return normalizedBars;
      
    } catch (error) {
      labLogger.error(`Erro ao carregar ${filePath}`, error as Error, "CandleCache");
      return [];
    }
  }
  
  /**
   * Remove entradas mais antigas do cache
   */
  private evictOldestEntries(requiredSpace: number): void {
    // Ordenar por accessCount (menos acessados primeiro) e loadedAt (mais antigos primeiro)
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => {
        if (a[1].accessCount !== b[1].accessCount) {
          return a[1].accessCount - b[1].accessCount;
        }
        return a[1].loadedAt - b[1].loadedAt;
      });
    
    let freedSpace = 0;
    
    for (const [key, entry] of entries) {
      if (freedSpace >= requiredSpace) break;
      
      freedSpace += entry.candles.length;
      this.cache.delete(key);
      labLogger.debug(`Evicted: ${key} (${entry.candles.length} candles)`, "CandleCache");
    }
  }
  
  /**
   * Obtém total de candles em cache
   */
  private getTotalCandlesInCache(): number {
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.candles.length;
    }
    return total;
  }
  
  /**
   * Verifica se um símbolo/timeframe está em cache
   */
  has(symbol: string, timeframe: string): boolean {
    return this.cache.has(this.getCacheKey(symbol, timeframe));
  }
  
  /**
   * Remove uma entrada específica do cache
   */
  remove(symbol: string, timeframe: string): boolean {
    const key = this.getCacheKey(symbol, timeframe);
    const existed = this.cache.has(key);
    this.cache.delete(key);
    if (existed) {
      labLogger.debug(`Removido do cache: ${key}`, "CandleCache");
    }
    return existed;
  }
  
  /**
   * Limpa todo o cache
   */
  clear(): void {
    const count = this.cache.size;
    this.cache.clear();
    labLogger.info(`Cache limpo: ${count} entradas removidas`, "CandleCache");
    
    // Forçar GC se disponível
    memoryManager.tryFreeMemory();
  }
  
  /**
   * Obtém estatísticas do cache
   */
  getStats(): CacheStats {
    const symbols = new Set<string>();
    const timeframes = new Set<string>();
    let totalCandles = 0;
    
    for (const entry of this.cache.values()) {
      symbols.add(entry.symbol);
      timeframes.add(entry.timeframe);
      totalCandles += entry.candles.length;
    }
    
    return {
      totalEntries: this.cache.size,
      totalCandles,
      estimatedMemoryBytes: totalCandles * this.BYTES_PER_CANDLE,
      symbols: Array.from(symbols),
      timeframes: Array.from(timeframes),
    };
  }
  
  /**
   * Log de estatísticas do cache
   */
  logStats(): void {
    const stats = this.getStats();
    const memMB = (stats.estimatedMemoryBytes / (1024 * 1024)).toFixed(2);
    
    labLogger.info(
      `Cache Stats | Entradas: ${stats.totalEntries} | Candles: ${stats.totalCandles.toLocaleString()} | ` +
      `Memória: ~${memMB}MB | Símbolos: ${stats.symbols.join(", ")} | TFs: ${stats.timeframes.join(", ")}`,
      "CandleCache"
    );
  }
  
  /**
   * Define limite máximo de candles em cache
   */
  setMaxCandles(max: number): void {
    this.maxCandlesInCache = max;
    labLogger.info(`Limite de cache ajustado para ${max.toLocaleString()} candles`, "CandleCache");
  }
  
  /**
   * Pré-carrega dados para múltiplos símbolos e timeframes
   */
  preload(
    dataPath: string,
    symbols: string[],
    timeframes: string[],
    startDate: Date,
    endDate: Date
  ): void {
    labLogger.info(`Pré-carregando dados: ${symbols.length} símbolos x ${timeframes.length} timeframes`, "CandleCache");
    
    for (const symbol of symbols) {
      for (const timeframe of timeframes) {
        this.getOrLoad(dataPath, symbol, timeframe, startDate, endDate);
      }
    }
    
    this.logStats();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const candleDataCache = CandleDataCache.getInstance();
