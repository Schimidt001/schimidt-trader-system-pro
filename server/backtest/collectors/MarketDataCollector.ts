/**
 * MarketDataCollector - Coletor de Dados Históricos
 * 
 * Baixa candles históricos via cTrader Open API e salva em arquivos JSON
 * para uso posterior no backtesting offline.
 * 
 * Funcionalidades:
 * - Download de múltiplos timeframes (M5, H1, H4)
 * - Janela deslizante de 6 meses
 * - Salvamento em JSON/CSV
 * - Progresso em tempo real
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 1.0.0
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
const DEFAULT_TIMEFRAMES = ["M5", "H1", "H4"];
const DEFAULT_MONTHS_BACK = 6;
const CANDLES_PER_REQUEST = 1000; // cTrader limit
const REQUEST_DELAY_MS = 1500; // Delay between requests to avoid rate limiting

// ============================================================================
// MARKET DATA COLLECTOR CLASS
// ============================================================================

export class MarketDataCollector {
  private config: DataCollectorConfig;
  private progress: DataCollectorProgress;
  private onProgress?: (progress: DataCollectorProgress) => void;
  
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
    
    console.log("[MarketDataCollector] Starting data download...");
    console.log(`[MarketDataCollector] Symbols: ${this.config.symbols.join(", ")}`);
    console.log(`[MarketDataCollector] Timeframes: ${this.config.timeframes.join(", ")}`);
    console.log(`[MarketDataCollector] Months back: ${this.config.monthsBack}`);
    
    // Check connection
    if (!ctraderAdapter.isConnected()) {
      const error = "cTrader not connected. Please connect first.";
      console.error(`[MarketDataCollector] ${error}`);
      return { success: false, filesCreated: [], errors: [error] };
    }
    
    const totalTasks = this.config.symbols.length * this.config.timeframes.length;
    let completedTasks = 0;
    
    for (const symbol of this.config.symbols) {
      for (const timeframe of this.config.timeframes) {
        this.progress.currentSymbol = symbol;
        this.progress.currentTimeframe = timeframe;
        this.updateProgress();
        
        try {
          console.log(`[MarketDataCollector] Downloading ${symbol} ${timeframe}...`);
          
          const candles = await this.downloadSymbolTimeframe(symbol, timeframe);
          
          if (candles.length > 0) {
            const filePath = await this.saveToFile(symbol, timeframe, candles);
            filesCreated.push(filePath);
            console.log(`[MarketDataCollector] Saved ${candles.length} candles to ${filePath}`);
          } else {
            const warning = `No candles downloaded for ${symbol} ${timeframe}`;
            console.warn(`[MarketDataCollector] ${warning}`);
            errors.push(warning);
          }
          
        } catch (error) {
          const errorMsg = `Error downloading ${symbol} ${timeframe}: ${(error as Error).message}`;
          console.error(`[MarketDataCollector] ${errorMsg}`);
          errors.push(errorMsg);
          this.progress.errors.push(errorMsg);
        }
        
        completedTasks++;
        this.progress.totalProgress = Math.round((completedTasks / totalTasks) * 100);
        this.updateProgress();
        
        // Delay between requests
        await this.sleep(REQUEST_DELAY_MS);
      }
    }
    
    console.log(`[MarketDataCollector] Download complete. Files created: ${filesCreated.length}`);
    
    return {
      success: errors.length === 0,
      filesCreated,
      errors,
    };
  }
  
  /**
   * Download data for a single symbol and timeframe
   */
  async downloadSymbolTimeframe(symbol: string, timeframe: string): Promise<CandleData[]> {
    const allCandles: CandleData[] = [];
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - this.config.monthsBack);
    
    // Calculate number of candles needed based on timeframe
    const timeframeMinutes = this.getTimeframeMinutes(timeframe);
    const totalMinutes = (endDate.getTime() - startDate.getTime()) / (1000 * 60);
    const estimatedCandles = Math.ceil(totalMinutes / timeframeMinutes);
    
    console.log(`[MarketDataCollector] Estimated candles for ${symbol} ${timeframe}: ${estimatedCandles}`);
    
    // Download in batches
    let candlesDownloaded = 0;
    let batchCount = 0;
    const maxBatches = Math.ceil(estimatedCandles / CANDLES_PER_REQUEST) + 1;
    
    while (candlesDownloaded < estimatedCandles && batchCount < maxBatches) {
      try {
        const batch = await ctraderAdapter.getCandleHistory(symbol, timeframe, CANDLES_PER_REQUEST);
        
        if (batch.length === 0) {
          console.log(`[MarketDataCollector] No more candles available for ${symbol} ${timeframe}`);
          break;
        }
        
        // Filter candles within date range
        const filteredBatch = batch.filter(candle => {
          const candleTime = candle.timestamp * 1000; // Convert to ms if in seconds
          return candleTime >= startDate.getTime() && candleTime <= endDate.getTime();
        });
        
        // Merge with existing candles (avoid duplicates)
        for (const candle of filteredBatch) {
          const exists = allCandles.some(c => c.timestamp === candle.timestamp);
          if (!exists) {
            allCandles.push(candle);
          }
        }
        
        candlesDownloaded = allCandles.length;
        this.progress.candlesDownloaded = candlesDownloaded;
        this.updateProgress();
        
        console.log(`[MarketDataCollector] ${symbol} ${timeframe}: Downloaded ${candlesDownloaded} candles (batch ${batchCount + 1})`);
        
        batchCount++;
        
        // If we got less than requested, we've reached the end
        if (batch.length < CANDLES_PER_REQUEST) {
          break;
        }
        
        // Delay between batches
        await this.sleep(REQUEST_DELAY_MS);
        
      } catch (error) {
        console.error(`[MarketDataCollector] Error in batch ${batchCount}: ${(error as Error).message}`);
        break;
      }
    }
    
    // Sort by timestamp
    allCandles.sort((a, b) => a.timestamp - b.timestamp);
    
    return allCandles;
  }
  
  /**
   * Save candles to file
   */
  private async saveToFile(symbol: string, timeframe: string, candles: CandleData[]): Promise<string> {
    const fileName = `${symbol}_${timeframe}.${this.config.format}`;
    const filePath = path.join(this.config.outputDir, fileName);
    
    if (this.config.format === "json") {
      const data: HistoricalDataFile = {
        symbol,
        timeframe,
        startDate: new Date(candles[0].timestamp * 1000).toISOString(),
        endDate: new Date(candles[candles.length - 1].timestamp * 1000).toISOString(),
        totalBars: candles.length,
        bars: candles,
        metadata: {
          source: "cTrader Open API",
          downloadedAt: new Date().toISOString(),
          broker: "IC Markets",
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
  if (!collectorInstance || config) {
    collectorInstance = new MarketDataCollector(config);
  }
  return collectorInstance;
}
