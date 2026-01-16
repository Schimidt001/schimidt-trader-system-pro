/**
 * MarketDataCollector - Coletor de Dados Históricos
 * 
 * Baixa candles históricos via cTrader Open API e salva em arquivos JSON
 * para uso posterior no backtesting offline.
 * 
 * Funcionalidades:
 * - Download de múltiplos timeframes (M5, M15, H1)
 * - Período configurável (padrão 6 meses)
 * - Alinhamento temporal entre timeframes
 * - Paginação correta para dados históricos longos
 * - Salvamento em JSON/CSV
 * - Progresso em tempo real
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 2.0.0 - Corrigido alinhamento e paginação
 */

import * as fs from "fs";
import * as path from "path";
import { ctraderAdapter } from "../../adapters/CTraderAdapter";
import { CandleData } from "../../adapters/IBrokerAdapter";
import { HistoricalDataFile, DataCollectorConfig, DataCollectorProgress } from "../types/backtest.types";

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"];
const DEFAULT_TIMEFRAMES = ["M5", "M15", "H1"];
const DEFAULT_MONTHS_BACK = 6;
const CANDLES_PER_REQUEST = 1000; // cTrader limit per request
const REQUEST_DELAY_MS = 2000; // Delay between requests to avoid rate limiting

// ============================================================================
// MARKET DATA COLLECTOR CLASS
// ============================================================================

export class MarketDataCollector {
  private config: DataCollectorConfig;
  private progress: DataCollectorProgress;
  private onProgress?: (progress: DataCollectorProgress) => void;
  
  // Período global para alinhamento entre timeframes
  private globalStartDate: Date | null = null;
  private globalEndDate: Date | null = null;
  
  constructor(config: Partial<DataCollectorConfig> = {}) {
    this.config = {
      clientId: config.clientId || process.env.CTRADER_CLIENT_ID || "",
      clientSecret: config.clientSecret || process.env.CTRADER_SECRET || "",
      accessToken: config.accessToken || process.env.CTRADER_ACCESS_TOKEN || "",
      accountId: config.accountId,
      symbols: config.symbols || DEFAULT_SYMBOLS,
      timeframes: config.timeframes || DEFAULT_TIMEFRAMES,
      monthsBack: config.monthsBack || DEFAULT_MONTHS_BACK,
      outputDir: config.outputDir || path.join(process.cwd(), "data", "candles"),
      format: config.format || "json",
    };
    
    this.progress = {
      currentSymbol: "",
      currentTimeframe: "",
      totalProgress: 0,
      candlesDownloaded: 0,
      errors: [],
    };
    
    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
    
    // Calcular período global uma única vez para garantir alinhamento
    this.calculateGlobalDateRange();
  }
  
  /**
   * Calcula o período global para todos os downloads
   * Isso garante que todos os timeframes tenham exatamente o mesmo período
   */
  private calculateGlobalDateRange(): void {
    // Fim: início do dia atual (00:00:00 UTC) para evitar candles incompletos
    this.globalEndDate = new Date();
    this.globalEndDate.setUTCHours(0, 0, 0, 0);
    
    // Início: X meses atrás, também no início do dia
    this.globalStartDate = new Date(this.globalEndDate);
    this.globalStartDate.setMonth(this.globalStartDate.getMonth() - this.config.monthsBack);
    this.globalStartDate.setUTCHours(0, 0, 0, 0);
    
    console.log(`[MarketDataCollector] Período global definido:`);
    console.log(`[MarketDataCollector]   Início: ${this.globalStartDate.toISOString()}`);
    console.log(`[MarketDataCollector]   Fim: ${this.globalEndDate.toISOString()}`);
    console.log(`[MarketDataCollector]   Duração: ${this.config.monthsBack} meses`);
  }
  
  /**
   * Set progress callback
   */
  setProgressCallback(callback: (progress: DataCollectorProgress) => void): void {
    this.onProgress = callback;
  }
  
  /**
   * Download all historical data
   */
  async downloadAll(): Promise<{ success: boolean; filesCreated: string[]; errors: string[] }> {
    const filesCreated: string[] = [];
    const errors: string[] = [];
    
    console.log("\n[MarketDataCollector] ========================================");
    console.log("[MarketDataCollector] INICIANDO DOWNLOAD DE DADOS HISTÓRICOS");
    console.log("[MarketDataCollector] ========================================");
    console.log(`[MarketDataCollector] Símbolos: ${this.config.symbols.join(", ")}`);
    console.log(`[MarketDataCollector] Timeframes: ${this.config.timeframes.join(", ")}`);
    console.log(`[MarketDataCollector] Período: ${this.config.monthsBack} meses`);
    console.log(`[MarketDataCollector] De: ${this.globalStartDate?.toISOString()}`);
    console.log(`[MarketDataCollector] Até: ${this.globalEndDate?.toISOString()}`);
    console.log("[MarketDataCollector] ========================================\n");
    
    // Check connection
    if (!ctraderAdapter.isConnected()) {
      const error = "cTrader não está conectado. Por favor, conecte primeiro no Dashboard.";
      console.error(`[MarketDataCollector] ${error}`);
      return { success: false, filesCreated: [], errors: [error] };
    }
    
    const totalTasks = this.config.symbols.length * this.config.timeframes.length;
    let completedTasks = 0;
    
    for (const symbol of this.config.symbols) {
      for (const timeframe of this.config.timeframes) {
        this.progress.currentSymbol = symbol;
        this.progress.currentTimeframe = timeframe;
        this.progress.candlesDownloaded = 0;
        this.updateProgress();
        
        try {
          console.log(`\n[MarketDataCollector] >>> Baixando ${symbol} ${timeframe}...`);
          
          const candles = await this.downloadSymbolTimeframe(symbol, timeframe);
          
          if (candles.length > 0) {
            const filePath = await this.saveToFile(symbol, timeframe, candles);
            filesCreated.push(filePath);
            console.log(`[MarketDataCollector] ✓ Salvo ${candles.length} candles em ${filePath}`);
          } else {
            const warning = `Nenhum candle baixado para ${symbol} ${timeframe}`;
            console.warn(`[MarketDataCollector] ⚠ ${warning}`);
            errors.push(warning);
          }
          
        } catch (error) {
          const errorMsg = `Erro ao baixar ${symbol} ${timeframe}: ${(error as Error).message}`;
          console.error(`[MarketDataCollector] ✗ ${errorMsg}`);
          errors.push(errorMsg);
          this.progress.errors.push(errorMsg);
        }
        
        completedTasks++;
        this.progress.totalProgress = Math.round((completedTasks / totalTasks) * 100);
        this.updateProgress();
        
        // Delay between symbol/timeframe combinations
        await this.sleep(REQUEST_DELAY_MS);
      }
    }
    
    console.log("\n[MarketDataCollector] ========================================");
    console.log("[MarketDataCollector] DOWNLOAD CONCLUÍDO");
    console.log(`[MarketDataCollector] Arquivos criados: ${filesCreated.length}`);
    console.log(`[MarketDataCollector] Erros: ${errors.length}`);
    console.log("[MarketDataCollector] ========================================\n");
    
    return {
      success: errors.length === 0,
      filesCreated,
      errors,
    };
  }
  
  /**
   * Download data for a single symbol and timeframe
   * 
   * CORREÇÃO v2.0: Implementa paginação correta usando getCandleHistoryRange
   * para buscar dados do passado para o presente, garantindo cobertura completa.
   */
  async downloadSymbolTimeframe(symbol: string, timeframe: string): Promise<CandleData[]> {
    const allCandles: CandleData[] = [];
    const candleMap = new Map<number, CandleData>(); // Para evitar duplicatas
    
    if (!this.globalStartDate || !this.globalEndDate) {
      throw new Error("Período global não definido");
    }
    
    const startTimestamp = this.globalStartDate.getTime();
    const endTimestamp = this.globalEndDate.getTime();
    
    // Calcular número estimado de candles
    const timeframeMs = this.getTimeframeMs(timeframe);
    const totalMs = endTimestamp - startTimestamp;
    const estimatedCandles = Math.ceil(totalMs / timeframeMs);
    
    console.log(`[MarketDataCollector] ${symbol} ${timeframe}: Estimativa de ${estimatedCandles} candles`);
    
    // Dividir o período em chunks para paginação
    // Cada chunk terá no máximo CANDLES_PER_REQUEST candles
    const chunkDurationMs = CANDLES_PER_REQUEST * timeframeMs;
    const numChunks = Math.ceil(totalMs / chunkDurationMs);
    
    console.log(`[MarketDataCollector] ${symbol} ${timeframe}: Dividido em ${numChunks} requisições`);
    
    let currentStart = startTimestamp;
    let chunkIndex = 0;
    
    while (currentStart < endTimestamp) {
      const currentEnd = Math.min(currentStart + chunkDurationMs, endTimestamp);
      
      try {
        console.log(`[MarketDataCollector] ${symbol} ${timeframe}: Chunk ${chunkIndex + 1}/${numChunks} - ${new Date(currentStart).toISOString().split('T')[0]} a ${new Date(currentEnd).toISOString().split('T')[0]}`);
        
        // Usar o novo método getCandleHistoryRange para buscar período específico
        const batch = await ctraderAdapter.getCandleHistoryRange(
          symbol,
          timeframe,
          currentStart,
          currentEnd,
          CANDLES_PER_REQUEST
        );
        
        if (batch.length > 0) {
          // Adicionar ao mapa para evitar duplicatas (usando timestamp como chave)
          for (const candle of batch) {
            // Verificar se o candle está dentro do período desejado
            const candleTimestamp = candle.timestamp * 1000; // Converter para ms se necessário
            if (candleTimestamp >= startTimestamp && candleTimestamp <= endTimestamp) {
              candleMap.set(candle.timestamp, candle);
            }
          }
          
          console.log(`[MarketDataCollector] ${symbol} ${timeframe}: Recebidos ${batch.length} candles, total único: ${candleMap.size}`);
        } else {
          console.log(`[MarketDataCollector] ${symbol} ${timeframe}: Nenhum candle no chunk ${chunkIndex + 1}`);
        }
        
        // Atualizar progresso
        this.progress.candlesDownloaded = candleMap.size;
        this.updateProgress();
        
      } catch (error) {
        console.error(`[MarketDataCollector] ${symbol} ${timeframe}: Erro no chunk ${chunkIndex + 1}: ${(error as Error).message}`);
        // Continuar para o próximo chunk mesmo com erro
      }
      
      // Avançar para o próximo chunk
      currentStart = currentEnd;
      chunkIndex++;
      
      // Delay entre requisições para evitar rate limiting
      if (currentStart < endTimestamp) {
        await this.sleep(REQUEST_DELAY_MS);
      }
    }
    
    // Converter mapa para array e ordenar por timestamp
    const sortedCandles = Array.from(candleMap.values())
      .sort((a, b) => a.timestamp - b.timestamp);
    
    console.log(`[MarketDataCollector] ${symbol} ${timeframe}: Total final: ${sortedCandles.length} candles`);
    
    if (sortedCandles.length > 0) {
      const firstCandle = sortedCandles[0];
      const lastCandle = sortedCandles[sortedCandles.length - 1];
      console.log(`[MarketDataCollector] ${symbol} ${timeframe}: Período coberto: ${new Date(firstCandle.timestamp * 1000).toISOString()} a ${new Date(lastCandle.timestamp * 1000).toISOString()}`);
    }
    
    return sortedCandles;
  }
  
  /**
   * Save candles to file
   */
  private async saveToFile(symbol: string, timeframe: string, candles: CandleData[]): Promise<string> {
    const fileName = `${symbol}_${timeframe}.${this.config.format}`;
    const filePath = path.join(this.config.outputDir, fileName);
    
    if (this.config.format === "json") {
      // Determinar timestamps em ms ou s
      const firstTimestamp = candles[0].timestamp;
      const lastTimestamp = candles[candles.length - 1].timestamp;
      
      // Se timestamp < 10000000000, está em segundos, converter para ms
      const startMs = firstTimestamp < 10000000000 ? firstTimestamp * 1000 : firstTimestamp;
      const endMs = lastTimestamp < 10000000000 ? lastTimestamp * 1000 : lastTimestamp;
      
      const data: HistoricalDataFile = {
        symbol,
        timeframe,
        startDate: new Date(startMs).toISOString(),
        endDate: new Date(endMs).toISOString(),
        totalBars: candles.length,
        bars: candles,
        metadata: {
          source: "cTrader Open API",
          downloadedAt: new Date().toISOString(),
          broker: "IC Markets",
          requestedPeriod: {
            monthsBack: this.config.monthsBack,
            from: this.globalStartDate?.toISOString() || "",
            to: this.globalEndDate?.toISOString() || "",
          },
        },
      };
      
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } else {
      // CSV format
      const header = "timestamp,open,high,low,close,volume\n";
      const rows = candles.map(c => 
        `${c.timestamp},${c.open},${c.high},${c.low},${c.close},${c.volume || 0}`
      ).join("\n");
      
      fs.writeFileSync(filePath, header + rows);
    }
    
    return filePath;
  }
  
  /**
   * Get list of available data files
   */
  getAvailableDataFiles(): { symbol: string; timeframe: string; filePath: string; size: number }[] {
    const files: { symbol: string; timeframe: string; filePath: string; size: number }[] = [];
    
    if (!fs.existsSync(this.config.outputDir)) {
      return files;
    }
    
    const fileNames = fs.readdirSync(this.config.outputDir);
    
    for (const fileName of fileNames) {
      const match = fileName.match(/^([A-Z]+)_([A-Z0-9]+)\.(json|csv)$/);
      if (match) {
        const filePath = path.join(this.config.outputDir, fileName);
        const stats = fs.statSync(filePath);
        
        files.push({
          symbol: match[1],
          timeframe: match[2],
          filePath,
          size: stats.size,
        });
      }
    }
    
    return files;
  }
  
  /**
   * Load data from file
   */
  loadDataFile(symbol: string, timeframe: string): HistoricalDataFile | null {
    const filePath = path.join(this.config.outputDir, `${symbol}_${timeframe}.json`);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as HistoricalDataFile;
    } catch (error) {
      console.error(`[MarketDataCollector] Error loading ${filePath}:`, error);
      return null;
    }
  }
  
  /**
   * Delete data file
   */
  deleteDataFile(symbol: string, timeframe: string): boolean {
    const filePath = path.join(this.config.outputDir, `${symbol}_${timeframe}.json`);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    
    return false;
  }
  
  /**
   * Get data summary
   */
  getDataSummary(): {
    totalFiles: number;
    totalCandles: number;
    symbols: string[];
    timeframes: string[];
    dateRange: { start: string; end: string } | null;
  } {
    const files = this.getAvailableDataFiles();
    
    let totalCandles = 0;
    const symbols = new Set<string>();
    const timeframes = new Set<string>();
    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    
    for (const file of files) {
      symbols.add(file.symbol);
      timeframes.add(file.timeframe);
      
      const data = this.loadDataFile(file.symbol, file.timeframe);
      if (data) {
        totalCandles += data.totalBars;
        
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);
        
        if (!minDate || start < minDate) minDate = start;
        if (!maxDate || end > maxDate) maxDate = end;
      }
    }
    
    return {
      totalFiles: files.length,
      totalCandles,
      symbols: Array.from(symbols),
      timeframes: Array.from(timeframes),
      dateRange: minDate && maxDate ? {
        start: minDate.toISOString(),
        end: maxDate.toISOString(),
      } : null,
    };
  }
  
  // -------------------------------------------------------------------------
  // Helper Methods
  // -------------------------------------------------------------------------
  
  private getTimeframeMs(timeframe: string): number {
    const map: Record<string, number> = {
      "M1": 1 * 60 * 1000,
      "M5": 5 * 60 * 1000,
      "M15": 15 * 60 * 1000,
      "M30": 30 * 60 * 1000,
      "H1": 60 * 60 * 1000,
      "H4": 4 * 60 * 60 * 1000,
      "D1": 24 * 60 * 60 * 1000,
      "W1": 7 * 24 * 60 * 60 * 1000,
    };
    return map[timeframe] || 5 * 60 * 1000;
  }
  
  private getTimeframeMinutes(timeframe: string): number {
    const map: Record<string, number> = {
      "M1": 1,
      "M5": 5,
      "M15": 15,
      "M30": 30,
      "H1": 60,
      "H4": 240,
      "D1": 1440,
      "W1": 10080,
    };
    return map[timeframe] || 5;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private updateProgress(): void {
    if (this.onProgress) {
      this.onProgress({ ...this.progress });
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let collectorInstance: MarketDataCollector | null = null;

export function getMarketDataCollector(config?: Partial<DataCollectorConfig>): MarketDataCollector {
  // Sempre criar nova instância quando config é fornecido para garantir período correto
  if (config) {
    collectorInstance = new MarketDataCollector(config);
  } else if (!collectorInstance) {
    collectorInstance = new MarketDataCollector();
  }
  return collectorInstance;
}
