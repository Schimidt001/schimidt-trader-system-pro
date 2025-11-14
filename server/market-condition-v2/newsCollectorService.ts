/**
 * Market Condition Detector v2.0 - News Collector Service
 * 
 * CICLO A: Coleta de notícias independente do candle
 * Executa periodicamente (09:00, 15:00, 21:00) para popular o banco de dados
 * 
 * IMPORTANTE: 100% DADOS REAIS - Sem mock, sem simulação, sem placeholders
 */

import axios from "axios";
import type { NewsEvent } from "./types";
import { insertMarketEvents, cleanupOldMarketEvents } from "../db";

/**
 * Mapeia código de país para código de moeda
 */
function mapCountryToCurrency(countryCode: string): string {
  const mapping: Record<string, string> = {
    'US': 'USD',
    'JP': 'JPY',
    'EU': 'EUR',
    'GB': 'GBP',
    'CH': 'CHF',
    'CA': 'CAD',
    'AU': 'AUD',
    'NZ': 'NZD',
    'CN': 'CNY',
  };
  return mapping[countryCode] || countryCode;
}

/**
 * Serviço de coleta de notícias macroeconômicas
 */
export class NewsCollectorService {
  private isCollecting: boolean = false;
  
  /**
   * Coleta notícias de todas as fontes disponíveis
   */
  public async collectNews(): Promise<void> {
    if (this.isCollecting) {
      console.log("[NewsCollector] Coleta já em andamento, pulando...");
      return;
    }
    
    this.isCollecting = true;
    
    try {
      console.log("[NewsCollector] Iniciando coleta de notícias...");
      
      const events: NewsEvent[] = [];
      
      // Tentar ForexFactory primeiro
      try {
        const forexEvents = await this.collectFromForexFactory();
        events.push(...forexEvents);
        console.log(`[NewsCollector] ✅ ForexFactory: ${forexEvents.length} eventos coletados`);
      } catch (error) {
        console.error("[NewsCollector] ❌ Falha no ForexFactory:", error);
      }
      
      // Tentar TradingEconomics
      try {
        const tradingEvents = await this.collectFromTradingEconomics();
        events.push(...tradingEvents);
        console.log(`[NewsCollector] ✅ TradingEconomics: ${tradingEvents.length} eventos coletados`);
      } catch (error) {
        console.error("[NewsCollector] ❌ Falha no TradingEconomics:", error);
      }
      
      // Se não houver eventos, apenas logar
      console.log(`[NewsCollector] Total de eventos brutos coletados: ${events.length}`);
      
      if (events.length === 0) {
        console.warn("[NewsCollector] ⚠️ Nenhum evento coletado. Detector operará apenas com critérios internos (ATR, Wicks, Spread, Fractal).");
      } else {
        // Remover duplicatas (mesmo título e timestamp próximo)
        const uniqueEvents = events.filter((event, index, self) =>
          index === self.findIndex((e) =>
            e.title === event.title &&
            Math.abs(e.timestamp - event.timestamp) < 300 // 5 minutos
          )
        );
        
        // Salvar eventos no banco
        await insertMarketEvents(uniqueEvents.map(e => ({
          timestamp: e.timestamp,
          currency: e.currency,
          impact: e.impact,
          title: e.title,
          description: e.description || null,
          source: e.source,
          actual: e.actual || null,
          forecast: e.forecast || null,
          previous: e.previous || null,
        })));
        
        console.log(`[NewsCollector] ✅ ${uniqueEvents.length} eventos únicos salvos no banco`);
      }
      
      // Limpar eventos antigos (mais de 7 dias)
      await cleanupOldMarketEvents(7);
      
    } catch (error) {
      console.error("[NewsCollector] ❌ Erro crítico durante coleta:", error);
      console.warn("[NewsCollector] ⚠️ Detector continuará operando apenas com critérios internos");
    } finally {
      this.isCollecting = false;
    }
  }
  
  /**
   * Coleta eventos do ForexFactory (scraping)
   */
  private async collectFromForexFactory(): Promise<NewsEvent[]> {
    try {
      const url = `https://nfs.faireconomy.media/ff_calendar_thisweek.json`;
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      
      const data = response.data;
      const events: NewsEvent[] = [];
      
      if (!Array.isArray(data)) return events;
      
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      console.log(`[ForexFactory] Buscando eventos de ${now.toISOString()} até ${sevenDaysFromNow.toISOString()}`);
      
      for (const item of data) {
        // Filtrar por data (próximos 7 dias)
        const itemDate = new Date(item.date);
        if (itemDate < now || itemDate > sevenDaysFromNow) continue;
        
        // Filtrar por moeda (ForexFactory já retorna códigos de moeda, não país)
        const currency = item.country || ''; // Na verdade é o código da moeda
        if (currency !== 'USD' && currency !== 'JPY') continue;
        
        // Determinar impacto
        const impact = item.impact;
        if (impact !== 'High' && impact !== 'Medium') continue;
        
        // Parsear timestamp
        const eventDate = new Date(item.date);
        
        events.push({
          timestamp: Math.floor(eventDate.getTime() / 1000),
          currency: currency,
          impact: impact === 'High' ? 'HIGH' : 'MEDIUM',
          title: item.title || 'Unknown Event',
          description: item.title || 'Unknown Event',
          source: 'ForexFactory',
          actual: item.actual,
          forecast: item.forecast,
          previous: item.previous,
        });
      }
      
      return events;
    } catch (error) {
      console.error('[NewsCollector] Erro ao buscar ForexFactory:', error);
      throw error;
    }
  }
  
  /**
   * Coleta eventos do TradingEconomics (API free tier)
   */
  private async collectFromTradingEconomics(): Promise<NewsEvent[]> {
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      console.log(`[TradingEconomics] Buscando eventos de ${today} até ${sevenDaysLater}`);
      
      const url = `https://api.tradingeconomics.com/calendar?c=guest:guest&d1=${today}&d2=${sevenDaysLater}`;
      
      const response = await axios.get(url, { timeout: 10000 });
      const data = response.data;
      
      if (!Array.isArray(data)) return [];
      
      const events: NewsEvent[] = [];
      
      // Mapear país para moeda
      const currencyMap: Record<string, string> = {
        'United States': 'USD',
        'Japan': 'JPY',
        'Euro Zone': 'EUR',
        'United Kingdom': 'GBP',
        'Canada': 'CAD',
        'Australia': 'AUD',
        'New Zealand': 'NZD',
        'Switzerland': 'CHF',
      };
      
      for (const item of data) {
        const country = item.Country || '';
        const mappedCurrency = currencyMap[country] || country;
        
        // Filtrar por moeda (apenas USD e JPY)
        if (mappedCurrency !== 'USD' && mappedCurrency !== 'JPY') continue;
        
        // Determinar impacto
        const importance = item.Importance || 1;
        let impact: "HIGH" | "MEDIUM" | "LOW" = "LOW";
        if (importance >= 3) impact = "HIGH";
        else if (importance >= 2) impact = "MEDIUM";
        
        // Apenas HIGH e MEDIUM
        if (impact === "LOW") continue;
        
        // Parsear timestamp
        const eventDate = new Date(item.Date);
        
        events.push({
          timestamp: Math.floor(eventDate.getTime() / 1000),
          currency: mappedCurrency,
          impact,
          title: item.Event || 'Unknown Event',
          description: item.Event || 'Unknown Event',
          source: "TradingEconomics",
          actual: item.Actual?.toString(),
          forecast: item.Forecast?.toString(),
          previous: item.Previous?.toString(),
        });
      }
      
      return events;
    } catch (error) {
      console.error('[NewsCollector] Erro ao buscar TradingEconomics:', error);
      throw error;
    }
  }
}

// Singleton instance
export const newsCollectorService = new NewsCollectorService();
