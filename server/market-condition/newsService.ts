/**
 * News Service - Coleta real de notícias macroeconômicas
 * 
 * Fontes:
 * 1. ForexFactory (scraping)
 * 2. TradingEconomics API (free tier)
 */

import axios from "axios";
import * as cheerio from "cheerio";

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

export interface NewsEvent {
  timestamp: number;        // Unix timestamp do evento
  currency: string;         // Moeda afetada (USD, JPY, EUR, etc)
  impact: "HIGH" | "MEDIUM" | "LOW";
  title: string;            // Título do evento
  description?: string;     // Descrição detalhada
  source: string;           // Fonte (ForexFactory, TradingEconomics, etc)
  actual?: string;          // Valor atual (se disponível)
  forecast?: string;        // Valor previsto
  previous?: string;        // Valor anterior
}

/**
 * Coleta eventos do ForexFactory (scraping)
 */
async function fetchForexFactoryEvents(
  date: Date,
  currencies: string[],
  timeout: number
): Promise<NewsEvent[]> {
  try {
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
    const url = `https://nfs.faireconomy.media/ff_calendar_thisweek.json`;
    
    const response = await axios.get(url, {
      timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    const data = response.data;
    const events: NewsEvent[] = [];
    
    if (!Array.isArray(data)) return events;
    
    const targetDate = date.toISOString().split('T')[0];
    
    for (const item of data) {
      // Filtrar por data
      const itemDate = item.date?.split('T')[0];
      if (itemDate !== targetDate) continue;
      
      // Filtrar por moeda
      // ForexFactory usa códigos de país (US, JP) ao invés de moedas (USD, JPY)
      const countryCode = item.country || '';
      const currencyCode = mapCountryToCurrency(countryCode);
      if (!currencies.includes(currencyCode)) continue;
      
      // Determinar impacto
      const impact = item.impact;
      if (impact !== 'High' && impact !== 'Medium') continue;
      
      // Parsear timestamp
      const eventDate = new Date(item.date);
      
      events.push({
        timestamp: Math.floor(eventDate.getTime() / 1000),
        currency: currencyCode,
        impact: impact === 'High' ? 'HIGH' : 'MEDIUM',
        title: item.title || 'Unknown Event',
        source: 'ForexFactory',
        actual: item.actual,
        forecast: item.forecast,
        previous: item.previous,
      });
    }
    
    return events;
  } catch (error) {
    console.error('[NewsService] Erro ao buscar ForexFactory:', error);
    return [];
  }
}

/**
 * Coleta eventos do TradingEconomics (API free tier)
 */
async function fetchTradingEconomicsEvents(
  date: Date,
  currencies: string[],
  timeout: number
): Promise<NewsEvent[]> {
  try {
    const dateStr = date.toISOString().split('T')[0];
    const url = `https://api.tradingeconomics.com/calendar?c=guest:guest&d1=${dateStr}&d2=${dateStr}`;
    
    const response = await axios.get(url, { timeout });
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
      
      // Filtrar por moeda
      if (!currencies.includes(mappedCurrency)) continue;
      
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
        source: "TradingEconomics",
        actual: item.Actual?.toString(),
        forecast: item.Forecast?.toString(),
        previous: item.Previous?.toString(),
      });
    }
    
    return events;
  } catch (error) {
    console.error('[NewsService] Erro ao buscar TradingEconomics:', error);
    return [];
  }
}

/**
 * Busca eventos de alto impacto para uma data e moedas específicas
 * 
 * @param date Data para buscar eventos
 * @param currencies Lista de moedas (ex: ["USD", "JPY"])
 * @param timeout Timeout em ms
 * @returns Lista de eventos encontrados
 */
export async function fetchHighImpactNews(
  date: Date,
  currencies: string[],
  timeout: number = 5000
): Promise<NewsEvent[]> {
  console.log(`[NewsService] Buscando notícias para ${currencies.join(', ')} em ${date.toISOString()}`);
  
  try {
    // Tentar ambas as fontes em paralelo
    const [forexFactoryEvents, tradingEconomicsEvents] = await Promise.allSettled([
      fetchForexFactoryEvents(date, currencies, timeout),
      fetchTradingEconomicsEvents(date, currencies, timeout),
    ]);
    
    const events: NewsEvent[] = [];
    
    // Adicionar eventos do ForexFactory
    if (forexFactoryEvents.status === 'fulfilled') {
      events.push(...forexFactoryEvents.value);
      console.log(`[NewsService] ForexFactory: ${forexFactoryEvents.value.length} eventos`);
    } else {
      console.warn('[NewsService] ForexFactory falhou:', forexFactoryEvents.reason);
    }
    
    // Adicionar eventos do TradingEconomics
    if (tradingEconomicsEvents.status === 'fulfilled') {
      events.push(...tradingEconomicsEvents.value);
      console.log(`[NewsService] TradingEconomics: ${tradingEconomicsEvents.value.length} eventos`);
    } else {
      console.warn('[NewsService] TradingEconomics falhou:', tradingEconomicsEvents.reason);
    }
    
    // Remover duplicatas (mesmo título e timestamp próximo)
    const uniqueEvents = events.filter((event, index, self) =>
      index === self.findIndex((e) =>
        e.title === event.title &&
        Math.abs(e.timestamp - event.timestamp) < 300 // 5 minutos
      )
    );
    
    // Ordenar por timestamp
    uniqueEvents.sort((a, b) => a.timestamp - b.timestamp);
    
    console.log(`[NewsService] Total de eventos únicos: ${uniqueEvents.length}`);
    
    return uniqueEvents;
  } catch (error) {
    console.error('[NewsService] Erro geral ao buscar notícias:', error);
    return [];
  }
}

/**
 * Verifica se há eventos de alto impacto em uma janela de tempo
 * 
 * @param events Lista de eventos
 * @param targetTime Data/hora alvo
 * @param windowMinutes Janela de tempo em minutos (antes e depois)
 * @returns true se houver evento HIGH na janela
 */
export function hasHighImpactNewsAtTime(
  events: NewsEvent[],
  targetTime: Date,
  windowMinutes: number = 60
): boolean {
  const targetTimestamp = Math.floor(targetTime.getTime() / 1000);
  const windowSeconds = windowMinutes * 60;
  
  return events.some(event => {
    if (event.impact !== "HIGH") return false;
    
    const diff = Math.abs(event.timestamp - targetTimestamp);
    return diff <= windowSeconds;
  });
}

/**
 * Filtra eventos futuros (próximas N horas)
 */
export function getUpcomingEvents(
  events: NewsEvent[],
  hoursAhead: number = 24
): NewsEvent[] {
  const now = Math.floor(Date.now() / 1000);
  const futureLimit = now + (hoursAhead * 3600);
  
  return events.filter(e => e.timestamp >= now && e.timestamp <= futureLimit);
}

/**
 * Filtra eventos recentes (últimas N horas)
 */
export function getRecentEvents(
  events: NewsEvent[],
  hoursBack: number = 12
): NewsEvent[] {
  const now = Math.floor(Date.now() / 1000);
  const pastLimit = now - (hoursBack * 3600);
  
  return events.filter(e => e.timestamp >= pastLimit && e.timestamp <= now);
}
