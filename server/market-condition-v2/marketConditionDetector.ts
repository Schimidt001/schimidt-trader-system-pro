/**
 * Market Condition Detector v2.0 - Main Detector
 * 
 * CICLO B: Detector de mercado que executa no fechamento do candle M60
 * Lê dados do banco (não chama APIs externas)
 */

import type {
  MarketConditionResult,
  MarketDetectorConfig,
  MarketStatus,
  CandleData,
} from "./types";
import { DEFAULT_MARKET_DETECTOR_CONFIG } from "./types";
import {
  calculateATR,
  calculateAmplitude,
  calculateBody,
  calculateWicks,
  hasFractalVolatility,
  calculateAverageSpread,
} from "./technicalUtils";
import {
  getMarketDetectorConfig,
  getMarketEventsByDate,
} from "../db";

export class MarketConditionDetector {
  /**
   * Avalia as condições de mercado para um candle
   * 
   * @param previousCandle Candle anterior (H-1) que acabou de fechar
   * @param historicalCandles Histórico de candles para cálculos (mínimo: atrPeriod + 1)
   * @param symbol Par/ativo sendo avaliado
   * @param userId ID do usuário para buscar configuração personalizada
   * @returns Resultado da avaliação
   */
  public async evaluate(
    previousCandle: CandleData,
    historicalCandles: CandleData[],
    symbol: string,
    userId: number
  ): Promise<MarketConditionResult> {
    // Buscar configuração do usuário (ou usar padrão)
    const config = await this.getConfig(userId);
    
    if (!config.enabled) {
      // Se o detector está desabilitado, sempre retornar GREEN
      return {
        status: "GREEN",
        score: 0,
        reasons: ["DETECTOR_DISABLED"],
        computedAt: new Date(),
        candleTimestamp: previousCandle.timestamp,
        symbol,
      };
    }
    
    const reasons: string[] = [];
    let score = 0;
    const details: any = {};
    
    try {
      // ========================================
      // CRITÉRIOS INTERNOS (Matemática do Candle)
      // ========================================
      
      // Critério 1: Amplitude anormal (ATR)
      if (historicalCandles.length >= config.atrWindow + 1) {
        const atr = calculateATR(historicalCandles, config.atrWindow);
        const amplitude = calculateAmplitude(previousCandle);
        details.atr = atr;
        details.amplitude = amplitude;
        
        if (amplitude > atr * config.atrMultiplier) {
          score += config.atrScore;
          reasons.push("ATR_HIGH");
        }
      }
      
      // Critério 2: Sombras exageradas
      const wicks = calculateWicks(previousCandle);
      const corpo = calculateBody(previousCandle);
      details.wickSuperior = wicks.superior;
      details.wickInferior = wicks.inferior;
      details.corpo = corpo;
      
      const maxWick = Math.max(wicks.superior, wicks.inferior);
      if (corpo > 0 && maxWick > corpo * config.wickMultiplier) {
        score += config.wickScore;
        reasons.push("LONG_WICKS");
      }
      
      // Critério 3: Spread anormal
      if (historicalCandles.length >= 24) {
        const spreadCurrent = calculateAmplitude(previousCandle);
        const spreadMean = calculateAverageSpread(historicalCandles.slice(-24));
        details.spreadCurrent = spreadCurrent;
        details.spreadMean = spreadMean;
        
        if (spreadCurrent > spreadMean * config.spreadMultiplier) {
          score += config.spreadScore;
          reasons.push("SPREAD_ANORMAL");
        }
      }
      
      // Critério 4: Volatilidade fractal
      const isFractal = hasFractalVolatility(previousCandle, config.fractalThreshold);
      details.volatilityFractal = isFractal;
      
      if (isFractal) {
        score += config.fractalScore;
        reasons.push("FRACTAL_VOLATILITY");
      }
      
      // ========================================
      // CRITÉRIOS EXTERNOS (Notícias do Banco)
      // ========================================
      
      try {
        const candleDate = new Date(previousCandle.timestamp * 1000);
        const currencies = this.extractCurrenciesFromSymbol(symbol);
        
        // Buscar eventos do banco (não chama API)
        const newsEvents = await getMarketEventsByDate(currencies, candleDate);
        
        details.newsEventsTotal = newsEvents.length;
        
        // Filtrar eventos relevantes
        const now = previousCandle.timestamp;
        const windowNextSeconds = config.windowNextNews * 60;
        const windowPastSeconds = config.windowPastNews * 60;
        
        let newsEventsUpcoming = 0;
        let newsEventsPast = 0;
        const newsEventsDetails: any[] = [];
        
        for (const event of newsEvents) {
          const eventTime = event.timestamp;
          const timeDiff = eventTime - now;
          
          // Eventos futuros (próxima 1h)
          if (timeDiff > 0 && timeDiff <= windowNextSeconds) {
            if (event.impact === "HIGH") {
              score += config.weightHigh;
              reasons.push("HIGH_IMPACT_NEWS_UPCOMING");
              newsEventsUpcoming++;
            } else if (event.impact === "MEDIUM") {
              score += config.weightMedium;
              reasons.push("MEDIUM_IMPACT_NEWS_UPCOMING");
              newsEventsUpcoming++;
            }
            
            newsEventsDetails.push({
              timestamp: event.timestamp,
              currency: event.currency,
              impact: event.impact,
              title: event.title,
            });
          }
          
          // Eventos passados (últimos 30 min)
          if (timeDiff < 0 && Math.abs(timeDiff) <= windowPastSeconds) {
            if (event.impact === "HIGH") {
              score += config.weightHighPast;
              reasons.push("HIGH_IMPACT_NEWS_PAST");
              newsEventsPast++;
            }
            
            newsEventsDetails.push({
              timestamp: event.timestamp,
              currency: event.currency,
              impact: event.impact,
              title: event.title,
            });
          }
        }
        
        details.newsEventsUpcoming = newsEventsUpcoming;
        details.newsEventsPast = newsEventsPast;
        details.newsEventsDetails = newsEventsDetails.slice(0, 5); // Primeiros 5
        
      } catch (error) {
        console.error("[MarketConditionDetector] Erro ao buscar notícias:", error);
        reasons.push("NEWS_FETCH_ERROR");
      }
      
      // ========================================
      // CLASSIFICAÇÃO DO STATUS
      // ========================================
      
      const status = this.classifyStatus(score, config);
      
      return {
        status,
        score,
        reasons,
        computedAt: new Date(),
        candleTimestamp: previousCandle.timestamp,
        symbol,
        details,
      };
      
    } catch (error) {
      console.error("[MarketConditionDetector] Erro durante avaliação:", error);
      
      // Em caso de erro, retornar YELLOW (cautela)
      return {
        status: "YELLOW",
        score: 5,
        reasons: ["EVALUATION_ERROR"],
        computedAt: new Date(),
        candleTimestamp: previousCandle.timestamp,
        symbol,
      };
    }
  }
  
  /**
   * Obtém a configuração do usuário (ou padrão)
   */
  private async getConfig(userId: number): Promise<MarketDetectorConfig> {
    try {
      const dbConfig = await getMarketDetectorConfig(userId);
      
      if (dbConfig) {
        return {
          enabled: dbConfig.enabled,
          atrWindow: dbConfig.atrWindow,
          atrMultiplier: parseFloat(dbConfig.atrMultiplier as any),
          atrScore: dbConfig.atrScore,
          wickMultiplier: parseFloat(dbConfig.wickMultiplier as any),
          wickScore: dbConfig.wickScore,
          fractalThreshold: parseFloat(dbConfig.fractalThreshold as any),
          fractalScore: dbConfig.fractalScore,
          spreadMultiplier: parseFloat(dbConfig.spreadMultiplier as any),
          spreadScore: dbConfig.spreadScore,
          weightHigh: dbConfig.weightHigh,
          weightMedium: dbConfig.weightMedium,
          weightHighPast: dbConfig.weightHighPast,
          windowNextNews: dbConfig.windowNextNews,
          windowPastNews: dbConfig.windowPastNews,
          greenThreshold: dbConfig.greenThreshold,
          yellowThreshold: dbConfig.yellowThreshold,
        };
      }
    } catch (error) {
      console.error("[MarketConditionDetector] Erro ao buscar config:", error);
    }
    
    // Retornar configuração padrão
    return DEFAULT_MARKET_DETECTOR_CONFIG;
  }
  
  /**
   * Classifica o status baseado no score e thresholds
   */
  private classifyStatus(score: number, config: MarketDetectorConfig): MarketStatus {
    if (score <= config.greenThreshold) {
      return "GREEN";
    } else if (score <= config.yellowThreshold) {
      return "YELLOW";
    } else {
      return "RED";
    }
  }
  
  /**
   * Extrai as moedas de um símbolo (ex: "frxUSDJPY" -> ["USD", "JPY"])
   */
  private extractCurrenciesFromSymbol(symbol: string): string[] {
    // Remover prefixos comuns (ex: "frx" para Forex)
    const cleanSymbol = symbol.replace(/^frx/i, "");
    
    // Dividir por "/" ou extrair pares de 3 letras
    if (cleanSymbol.includes("/")) {
      return cleanSymbol.split("/");
    }
    
    // Assumir formato XXXYYY (ex: USDJPY)
    if (cleanSymbol.length === 6) {
      return [cleanSymbol.substring(0, 3), cleanSymbol.substring(3, 6)];
    }
    
    // Fallback: retornar o símbolo completo
    return [cleanSymbol];
  }
}

// Singleton instance
export const marketConditionDetector = new MarketConditionDetector();
