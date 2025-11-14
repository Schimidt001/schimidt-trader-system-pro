/**
 * Market Condition Detector v1.0
 * 
 * Módulo principal que avalia as condições de mercado e decide se o bot pode operar
 */

import type {
  MarketConditionResult,
  MarketConditionConfig,
  MarketStatus,
} from "./types";
import { DEFAULT_MARKET_CONDITION_CONFIG } from "./types";
import {
  calculateATR,
  calculateAmplitude,
  calculateBody,
  calculateWicks,
  hasFractalVolatility,
  type CandleData,
} from "./technicalUtils";
import { fetchHighImpactNews, hasHighImpactNewsAtTime } from "./newsService";

export class MarketConditionDetector {
  private config: MarketConditionConfig;
  
  constructor(config?: Partial<MarketConditionConfig>) {
    this.config = {
      ...DEFAULT_MARKET_CONDITION_CONFIG,
      ...config,
    };
  }
  
  /**
   * Atualiza a configuração do detector
   */
  public updateConfig(config: Partial<MarketConditionConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }
  
  /**
   * Obtém a configuração atual
   */
  public getConfig(): Readonly<MarketConditionConfig> {
    return { ...this.config };
  }
  
  /**
   * Avalia as condições de mercado para um candle
   * 
   * @param previousCandle Candle anterior (H-1)
   * @param historicalCandles Histórico de candles para cálculos (mínimo: atrPeriod + 1)
   * @param symbol Par/ativo sendo avaliado
   * @returns Resultado da avaliação
   */
  public async evaluate(
    previousCandle: CandleData,
    historicalCandles: CandleData[],
    symbol: string
  ): Promise<MarketConditionResult> {
    if (!this.config.enabled) {
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
      // Critério 1: Amplitude anormal do candle anterior
      const atr = calculateATR(historicalCandles, this.config.atrPeriod);
      const amplitude = calculateAmplitude(previousCandle);
      details.atr = atr;
      details.amplitude = amplitude;
      
      if (amplitude > atr * this.config.atrMultiplier) {
        score += this.config.atrScore;
        reasons.push("ATR_HIGH");
      }
      
      // Critério 2: Sombras exageradas
      const wicks = calculateWicks(previousCandle);
      const corpo = calculateBody(previousCandle);
      details.wickSuperior = wicks.superior;
      details.wickInferior = wicks.inferior;
      details.corpo = corpo;
      
      const maxWick = Math.max(wicks.superior, wicks.inferior);
      if (corpo > 0 && maxWick > corpo * this.config.wickToBodyRatio) {
        score += this.config.wickScore;
        reasons.push("LONG_WICKS");
      }
      
      // Critério 3: Spread anormal
      // Aproximação: spread = high - low do candle
      // Compara com média dos spreads dos últimos N candles
      const spreadCurrent = amplitude; // spread atual = high - low
      const spreadHistory = historicalCandles.slice(-this.config.spreadLookbackHours).map(c => {
        return calculateAmplitude(c);
      });
      
      if (spreadHistory.length >= 3) {
        const spreadMean = spreadHistory.reduce((sum, s) => sum + s, 0) / spreadHistory.length;
        details.spreadCurrent = spreadCurrent;
        details.spreadMean = spreadMean;
        
        if (spreadCurrent > spreadMean * this.config.spreadMultiplier) {
          score += this.config.spreadScore;
          reasons.push("SPREAD_ANORMAL");
        }
      }
      
      // Critério 4: Volatilidade fractal
      const isFractal = hasFractalVolatility(
        previousCandle,
        this.config.fractalBodyToAmplitudeRatio
      );
      details.volatilityFractal = isFractal;
      
      if (isFractal) {
        score += this.config.fractalScore;
        reasons.push("FRACTAL_VOLATILITY");
      }
      
      // Critério 5: Evento macroeconômico de alto impacto
      if (this.config.newsEnabled) {
        try {
          const candleDate = new Date(previousCandle.timestamp * 1000);
          const currencies = this.extractCurrenciesFromSymbol(symbol);
          
          const newsEvents = await fetchHighImpactNews(
            candleDate,
            currencies,
            this.config.newsApiTimeout
          );
          
          // Salvar eventos no banco de dados
          if (newsEvents.length > 0) {
            const { insertMarketEvents } = await import("../db");
            await insertMarketEvents(newsEvents.map(e => ({
              timestamp: e.timestamp,
              currency: e.currency,
              impact: e.impact,
              title: e.title,
              description: e.description,
              source: e.source,
              actual: e.actual,
              forecast: e.forecast,
              previous: e.previous,
            })));
            console.log(`[MarketConditionDetector] Salvos ${newsEvents.length} eventos no banco`);
          }
          
          details.newsEvents = newsEvents.length;
          details.newsEventsDetails = newsEvents.slice(0, 3); // Primeiros 3 para detalhes
          
          // Verificar se há evento HIGH na janela de tempo
          const hasHighImpact = hasHighImpactNewsAtTime(newsEvents, candleDate, 60);
          
          if (hasHighImpact) {
            score += this.config.newsScore;
            reasons.push("HIGH_IMPACT_NEWS");
            console.log(`[MarketConditionDetector] Evento HIGH detectado! Score +${this.config.newsScore}`);
          }
        } catch (error) {
          console.error("[MarketConditionDetector] Error fetching news:", error);
          // Não adicionar pontos se a API falhar (fallback robusto)
          reasons.push("NEWS_API_FAILED");
        }
      }
      
      // Classificar o status baseado no score
      const status = this.classifyStatus(score);
      
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
      console.error("[MarketConditionDetector] Error during evaluation:", error);
      
      // Em caso de erro, retornar YELLOW (cautela) para não bloquear completamente
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
   * Classifica o status baseado no score
   */
  private classifyStatus(score: number): MarketStatus {
    if (score <= this.config.greenThreshold) {
      return "GREEN";
    } else if (score <= this.config.yellowThreshold) {
      return "YELLOW";
    } else {
      return "RED";
    }
  }
  
  /**
   * Extrai as moedas de um símbolo (ex: "USD/JPY" -> ["USD", "JPY"])
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
