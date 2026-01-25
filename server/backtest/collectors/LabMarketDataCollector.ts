/**
 * LabMarketDataCollector - Coletor de Dados EXCLUSIVO do Laboratório
 *
 * Versão isolada e offline do MarketDataCollector para uso no ambiente de laboratório.
 * - Lê APENAS arquivos locais (data/candles/)
 * - NÃO tem dependência com o broker (cTrader)
 * - Garante que o Lab funcione mesmo offline ou desconectado
 * - Retorna erros explícitos se dados faltarem, em vez de tentar baixar
 *
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.1.0 - Robust Metadata Parsing
 */

import * as fs from "fs";
import * as path from "path";
import { HistoricalDataFile, DataCollectorConfig } from "../types/backtest.types";
import { labLogger } from "../utils/LabLogger";
import { TRPCError } from "@trpc/server";

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_DATA_PATH = path.join(process.cwd(), "data", "candles");

// ============================================================================
// LAB MARKET DATA COLLECTOR CLASS
// ============================================================================

export class LabMarketDataCollector {
  private dataPath: string;

  constructor(dataPath?: string) {
    this.dataPath = dataPath || DEFAULT_DATA_PATH;

    // Ensure output directory exists (even if empty)
    if (!fs.existsSync(this.dataPath)) {
      try {
        fs.mkdirSync(this.dataPath, { recursive: true });
      } catch (e) {
        console.error("Failed to create data directory:", e);
      }
    }
  }

  /**
   * Verifica se os dados necessários existem localmente
   */
  checkDataAvailability(symbols: string[], timeframes: string[] = ["M5", "M15", "H1"]): {
    available: boolean;
    missing: string[];
  } {
    const missing: string[] = [];

    for (const symbol of symbols) {
      for (const timeframe of timeframes) {
        const filePath = this.getFilePath(symbol, timeframe);
        if (!fs.existsSync(filePath)) {
          missing.push(`${symbol} ${timeframe}`);
        }
      }
    }

    return {
      available: missing.length === 0,
      missing
    };
  }

  /**
   * Lê arquivo de dados histórico local
   * NÃO tenta baixar se não existir
   *
   * CORREÇÃO: Calcula startDate/endDate se estiverem faltando no JSON
   */
  loadDataFile(symbol: string, timeframe: string): HistoricalDataFile {
    const filePath = this.getFilePath(symbol, timeframe);

    if (!fs.existsSync(filePath)) {
      const errorMsg = `Dados históricos não encontrados para ${symbol} ${timeframe}.`;
      labLogger.warn(errorMsg, "LabDataCollector");

      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: errorMsg,
        cause: {
          code: "LAB_DATA_NOT_FOUND",
          symbol,
          timeframe,
          path: filePath
        }
      });
    }

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(content) as HistoricalDataFile;

      // CORREÇÃO ROBUSTEZ: Garantir que startDate e endDate existam
      if (!data.startDate && data.bars && data.bars.length > 0) {
        const firstTimestamp = data.bars[0].timestamp;
        // Auto-detectar se é ms ou seg (cTrader usa seg as vezes, mas internal é ms)
        // Se < 10bi, provavelmente é segundos (válido até 2286)
        const ts = firstTimestamp < 10000000000 ? firstTimestamp * 1000 : firstTimestamp;
        data.startDate = new Date(ts).toISOString();
      }

      if (!data.endDate && data.bars && data.bars.length > 0) {
        const lastTimestamp = data.bars[data.bars.length - 1].timestamp;
        const ts = lastTimestamp < 10000000000 ? lastTimestamp * 1000 : lastTimestamp;
        data.endDate = new Date(ts).toISOString();
      }

      // Fallback final se ainda undefined (array vazio)
      if (!data.startDate) data.startDate = new Date().toISOString();
      if (!data.endDate) data.endDate = new Date().toISOString();

      return data;
    } catch (error) {
      const errorMsg = `Erro ao ler arquivo de dados ${symbol} ${timeframe}: ${(error as Error).message}`;
      labLogger.error(errorMsg, error as Error, "LabDataCollector");

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: errorMsg,
        cause: { code: "LAB_DATA_CORRUPT" }
      });
    }
  }

  /**
   * Lista arquivos disponíveis com METADADOS COMPLETOS
   */
  getAvailableDataFiles(): {
    symbol: string;
    timeframe: string;
    size: number;
    lastModified: Date;
    startDate?: string;
    endDate?: string;
    recordCount?: number;
  }[] {
    const files: {
      symbol: string;
      timeframe: string;
      size: number;
      lastModified: Date;
      startDate?: string;
      endDate?: string;
      recordCount?: number;
    }[] = [];

    if (!fs.existsSync(this.dataPath)) {
      return files;
    }

    try {
      const fileNames = fs.readdirSync(this.dataPath);

      for (const fileName of fileNames) {
        // Regex mais permissivo para símbolos (letras, números, underscore)
        const match = fileName.match(/^([A-Z0-9_]+)_([A-Z0-9]+)\.json$/);
        if (match) {
          const filePath = path.join(this.dataPath, fileName);
          const stats = fs.statSync(filePath);

          let metadata = {};

          try {
            // Read file content to get metadata
            const content = fs.readFileSync(filePath, "utf-8");
            const data = JSON.parse(content);

            let start = data.startDate;
            let end = data.endDate;

            // Fallback calculation if dates missing
            if (!start && data.bars && data.bars.length > 0) {
               const ts = data.bars[0].timestamp;
               start = new Date(ts < 10000000000 ? ts * 1000 : ts).toISOString();
            }
            if (!end && data.bars && data.bars.length > 0) {
               const ts = data.bars[data.bars.length - 1].timestamp;
               end = new Date(ts < 10000000000 ? ts * 1000 : ts).toISOString();
            }

            if (start || end) {
               metadata = {
                startDate: start,
                endDate: end,
                recordCount: data.totalBars || (Array.isArray(data.bars) ? data.bars.length : 0)
              };
            }
          } catch (readError) {
            // Ignore read errors, file might be corrupt or locked
          }

          files.push({
            symbol: match[1],
            timeframe: match[2],
            size: stats.size,
            lastModified: stats.mtime,
            ...metadata
          });
        }
      }
    } catch (e) {
      labLogger.error("Erro ao listar arquivos de dados", e as Error, "LabDataCollector");
    }

    return files;
  }

  /**
   * Retorna sumário dos dados
   */
  getDataSummary() {
    const files = this.getAvailableDataFiles();
    const symbols = new Set(files.map(f => f.symbol));
    const timeframes = new Set(files.map(f => f.timeframe));

    return {
      totalFiles: files.length,
      symbols: Array.from(symbols),
      timeframes: Array.from(timeframes)
    };
  }

  // Helpers

  private getFilePath(symbol: string, timeframe: string): string {
    return path.join(this.dataPath, `${symbol}_${timeframe}.json`);
  }
}

// Singleton instance
let labCollectorInstance: LabMarketDataCollector | null = null;

export function getLabMarketDataCollector(): LabMarketDataCollector {
  if (!labCollectorInstance) {
    labCollectorInstance = new LabMarketDataCollector();
  }
  return labCollectorInstance;
}
