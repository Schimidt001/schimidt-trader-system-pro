/**
 * DataDownloader - Download Automático de Dados Históricos
 * 
 * Serviço para download de dados históricos de múltiplas fontes:
 * - cTrader Historical Data API (se disponível)
 * - FXCM Historical Data
 * - Dukascopy Historical Data (backup)
 * - Arquivos CSV manuais (fallback)
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import axios from "axios";
import * as fs from "fs/promises";
import * as path from "path";

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Configuração de uma fonte de dados
 */
export interface DataSource {
  /** Nome identificador da fonte */
  name: string;
  
  /** URL base da API */
  apiUrl: string;
  
  /** Chave de API (se necessária) */
  apiKey?: string;
  
  /** Limite de requisições por segundo */
  rateLimit: number;
}

/**
 * Configuração de download
 */
export interface DownloadConfig {
  /** Símbolos para baixar */
  symbols: string[];
  
  /** Data de início */
  startDate: Date;
  
  /** Data de fim */
  endDate: Date;
  
  /** Timeframes para baixar */
  timeframes: string[];
  
  /** Fonte de dados a usar */
  source: DataSource;
  
  /** Caminho de saída para os arquivos */
  outputPath: string;
}

/**
 * Resultado do download
 */
export interface DownloadResult {
  /** Se o download foi bem-sucedido */
  success: boolean;
  
  /** Arquivos criados */
  filesCreated: string[];
  
  /** Erros encontrados */
  errors: string[];
}

/**
 * Estrutura de uma vela
 */
export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/**
 * Resultado da validação de dados
 */
export interface DataValidationResult {
  /** Se os dados são válidos */
  isValid: boolean;
  
  /** Total de velas */
  totalBars: number;
  
  /** Gaps encontrados */
  gaps: { start: Date; end: Date }[];
  
  /** Avisos */
  warnings: string[];
}

// ============================================================================
// DATA DOWNLOADER CLASS
// ============================================================================

export class DataDownloader {
  private rateLimiter: Map<string, number> = new Map();
  
  /**
   * Download automático de dados históricos
   */
  async downloadHistoricalData(config: DownloadConfig): Promise<DownloadResult> {
    console.log(`[DataDownloader] Iniciando download de ${config.symbols.length} símbolos...`);
    
    const filesCreated: string[] = [];
    const errors: string[] = [];
    
    // Criar diretório se não existir
    await fs.mkdir(config.outputPath, { recursive: true });
    
    for (const symbol of config.symbols) {
      for (const timeframe of config.timeframes) {
        try {
          console.log(`[DataDownloader] Baixando ${symbol} ${timeframe}...`);
          
          // Aplicar rate limiting
          await this.applyRateLimit(config.source);
          
          // Tentar baixar da fonte configurada
          let candles: CandleData[] = [];
          
          switch (config.source.name) {
            case "dukascopy":
              candles = await this.downloadFromDukascopy(symbol, timeframe, config.startDate, config.endDate);
              break;
            case "fxcm":
              candles = await this.downloadFromFXCM(symbol, timeframe, config.startDate, config.endDate, config.source.apiKey);
              break;
            case "manual":
              // Para fonte manual, não faz download - assume que os arquivos já existem
              console.log(`[DataDownloader] Fonte manual - pulando download de ${symbol} ${timeframe}`);
              continue;
            default:
              throw new Error(`Fonte de dados desconhecida: ${config.source.name}`);
          }
          
          if (candles.length === 0) {
            errors.push(`Nenhum dado retornado para ${symbol} ${timeframe}`);
            continue;
          }
          
          // Validar dados
          const validation = this.validateData(candles, timeframe);
          if (!validation.isValid) {
            errors.push(`Dados inválidos para ${symbol} ${timeframe}: ${validation.warnings.join(", ")}`);
          }
          
          // Salvar arquivo
          const fileName = `${symbol}_${timeframe}.json`;
          const filePath = path.join(config.outputPath, fileName);
          
          const fileContent = {
            symbol,
            timeframe,
            startDate: config.startDate.toISOString(),
            endDate: config.endDate.toISOString(),
            totalBars: candles.length,
            bars: candles,
            metadata: {
              source: config.source.name,
              downloadedAt: new Date().toISOString(),
              broker: "N/A",
            },
          };
          
          await fs.writeFile(filePath, JSON.stringify(fileContent, null, 2));
          filesCreated.push(filePath);
          
          console.log(`[DataDownloader] ✅ ${symbol} ${timeframe}: ${candles.length} velas salvas`);
          
        } catch (error) {
          const errorMsg = `Erro ao baixar ${symbol} ${timeframe}: ${(error as Error).message}`;
          console.error(`[DataDownloader] ❌ ${errorMsg}`);
          errors.push(errorMsg);
        }
      }
    }
    
    const success = errors.length === 0;
    
    console.log(`[DataDownloader] Download concluído. Arquivos: ${filesCreated.length}, Erros: ${errors.length}`);
    
    return {
      success,
      filesCreated,
      errors,
    };
  }
  
  /**
   * Download de dados do Dukascopy
   */
  private async downloadFromDukascopy(
    symbol: string,
    timeframe: string,
    startDate: Date,
    endDate: Date
  ): Promise<CandleData[]> {
    // Dukascopy fornece dados em formato binário .bi5
    // Esta é uma implementação simplificada - em produção, usar biblioteca específica
    
    const dukascopySymbol = this.convertSymbolToDukascopy(symbol);
    const dukascopyTimeframe = this.convertTimeframeToDukascopy(timeframe);
    
    // Construir URL (exemplo simplificado)
    // Em produção, iterar por cada dia/hora conforme estrutura do Dukascopy
    const baseUrl = "https://datafeed.dukascopy.com/datafeed";
    
    const candles: CandleData[] = [];
    
    // Iterar por cada mês no período
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth()).padStart(2, "0"); // Dukascopy usa 0-indexed
      
      try {
        // Nota: Esta URL é ilustrativa - Dukascopy requer processamento específico
        const url = `${baseUrl}/${dukascopySymbol}/${year}/${month}/01/${dukascopyTimeframe}.bi5`;
        
        const response = await axios.get(url, {
          responseType: "arraybuffer",
          timeout: 30000,
          validateStatus: (status) => status === 200 || status === 404,
        });
        
        if (response.status === 200) {
          // Parsear dados binários (implementação simplificada)
          const parsedCandles = this.parseDukascopyBinary(response.data);
          candles.push(...parsedCandles);
        }
        
      } catch (error) {
        // Ignorar erros de dias sem dados (fins de semana, feriados)
        console.debug(`[DataDownloader] Sem dados para ${symbol} em ${year}/${month}`);
      }
      
      // Avançar para próximo mês
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    return candles;
  }
  
  /**
   * Download de dados do FXCM
   */
  private async downloadFromFXCM(
    symbol: string,
    timeframe: string,
    startDate: Date,
    endDate: Date,
    apiKey?: string
  ): Promise<CandleData[]> {
    if (!apiKey) {
      throw new Error("API Key do FXCM não configurada");
    }
    
    // Implementação simplificada - em produção, usar SDK oficial do FXCM
    const baseUrl = "https://api.fxcm.com";
    
    const candles: CandleData[] = [];
    
    try {
      const response = await axios.get(`${baseUrl}/candles/${symbol}/${timeframe}`, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
        },
        params: {
          start: startDate.getTime(),
          end: endDate.getTime(),
        },
        timeout: 60000,
      });
      
      if (response.data && response.data.candles) {
        for (const candle of response.data.candles) {
          candles.push({
            timestamp: candle.timestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
          });
        }
      }
      
    } catch (error) {
      throw new Error(`Erro na API FXCM: ${(error as Error).message}`);
    }
    
    return candles;
  }
  
  /**
   * Validar dados baixados
   */
  validateData(candles: CandleData[], timeframe: string): DataValidationResult {
    const warnings: string[] = [];
    const gaps: { start: Date; end: Date }[] = [];
    
    if (candles.length === 0) {
      return {
        isValid: false,
        totalBars: 0,
        gaps: [],
        warnings: ["Nenhuma vela nos dados"],
      };
    }
    
    // Ordenar por timestamp
    candles.sort((a, b) => a.timestamp - b.timestamp);
    
    // Verificar gaps
    const expectedGap = this.getExpectedGap(timeframe);
    
    for (let i = 1; i < candles.length; i++) {
      const gap = candles[i].timestamp - candles[i - 1].timestamp;
      
      // Permitir gaps de até 3x o esperado (fins de semana, feriados)
      if (gap > expectedGap * 3) {
        gaps.push({
          start: new Date(candles[i - 1].timestamp),
          end: new Date(candles[i].timestamp),
        });
      }
    }
    
    if (gaps.length > 0) {
      warnings.push(`${gaps.length} gaps encontrados nos dados`);
    }
    
    // Verificar valores OHLC válidos
    for (const candle of candles) {
      if (candle.high < candle.low) {
        warnings.push(`Vela inválida: high < low em ${new Date(candle.timestamp).toISOString()}`);
      }
      if (candle.open <= 0 || candle.close <= 0) {
        warnings.push(`Vela com preço zero ou negativo em ${new Date(candle.timestamp).toISOString()}`);
      }
    }
    
    return {
      isValid: warnings.length === 0,
      totalBars: candles.length,
      gaps,
      warnings,
    };
  }
  
  /**
   * Aplicar rate limiting
   */
  private async applyRateLimit(source: DataSource): Promise<void> {
    const lastRequest = this.rateLimiter.get(source.name) || 0;
    const minInterval = 1000 / source.rateLimit;
    const timeSinceLastRequest = Date.now() - lastRequest;
    
    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.rateLimiter.set(source.name, Date.now());
  }
  
  // =========================================================================
  // FUNÇÕES AUXILIARES
  // =========================================================================
  
  private convertSymbolToDukascopy(symbol: string): string {
    // EURUSD -> EURUSD (sem conversão necessária para a maioria)
    // XAUUSD -> XAUUSD
    return symbol;
  }
  
  private convertTimeframeToDukascopy(timeframe: string): string {
    const map: Record<string, string> = {
      "M1": "1",
      "M5": "5",
      "M15": "15",
      "M30": "30",
      "H1": "60",
      "H4": "240",
      "D1": "1440",
    };
    return map[timeframe] || "5";
  }
  
  private parseDukascopyBinary(buffer: Buffer): CandleData[] {
    // Implementação do parser binário .bi5
    // Esta é uma estrutura complexa, referência:
    // https://github.com/Leo4815162342/dukascopy-node
    
    // Por simplicidade, retornar array vazio aqui
    // Na implementação real, usar biblioteca específica
    return [];
  }
  
  private getExpectedGap(timeframe: string): number {
    const gaps: Record<string, number> = {
      "M1": 60 * 1000,
      "M5": 5 * 60 * 1000,
      "M15": 15 * 60 * 1000,
      "M30": 30 * 60 * 1000,
      "H1": 60 * 60 * 1000,
      "H4": 4 * 60 * 60 * 1000,
      "D1": 24 * 60 * 60 * 1000,
    };
    return gaps[timeframe] || 5 * 60 * 1000;
  }
}

// ============================================================================
// CONFIGURAÇÃO DE FONTES DE DADOS
// ============================================================================

export const DATA_SOURCES: Record<string, DataSource> = {
  dukascopy: {
    name: "dukascopy",
    apiUrl: "https://datafeed.dukascopy.com",
    rateLimit: 2, // 2 requests por segundo
  },
  fxcm: {
    name: "fxcm",
    apiUrl: "https://api.fxcm.com",
    apiKey: process.env.FXCM_API_KEY,
    rateLimit: 5,
  },
  manual: {
    name: "manual",
    apiUrl: "", // Arquivos CSV manuais
    rateLimit: 999,
  },
};

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createDataDownloader(): DataDownloader {
  return new DataDownloader();
}
