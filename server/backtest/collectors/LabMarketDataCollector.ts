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
 * @version 1.0.0
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
      return JSON.parse(content) as HistoricalDataFile;
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
   * Lista arquivos disponíveis
   */
  getAvailableDataFiles(): { symbol: string; timeframe: string; size: number; lastModified: Date }[] {
    const files: { symbol: string; timeframe: string; size: number; lastModified: Date }[] = [];

    if (!fs.existsSync(this.dataPath)) {
      return files;
    }

    try {
      const fileNames = fs.readdirSync(this.dataPath);

      for (const fileName of fileNames) {
        const match = fileName.match(/^([A-Z]+)_([A-Z0-9]+)\.json$/);
        if (match) {
          const filePath = path.join(this.dataPath, fileName);
          const stats = fs.statSync(filePath);

          files.push({
            symbol: match[1],
            timeframe: match[2],
            size: stats.size,
            lastModified: stats.mtime
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
