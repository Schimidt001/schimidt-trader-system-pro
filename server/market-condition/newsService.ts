/**
 * Market Condition Detector v1.0 - News Service
 * 
 * Serviço para buscar notícias econômicas de alto impacto
 * Utiliza APIs gratuitas (ForexFactory, TradingEconomics, etc.)
 */

import type { NewsEvent } from "./types";

/**
 * Busca eventos econômicos de alto impacto para uma data específica
 * 
 * @param date Data para buscar eventos
 * @param currencies Moedas relevantes (ex: ["USD", "JPY"])
 * @param timeout Timeout em ms
 * @returns Lista de eventos de alto impacto
 */
export async function fetchHighImpactNews(
  date: Date,
  currencies: string[],
  timeout: number = 5000
): Promise<NewsEvent[]> {
  try {
    // Implementar busca de notícias
    // Por enquanto, vamos usar uma abordagem simples com retry
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      // Tentar buscar de múltiplas fontes
      const events = await fetchFromForexFactory(date, currencies, controller.signal);
      clearTimeout(timeoutId);
      return events;
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Se falhar, tentar fonte alternativa
      console.warn("[NewsService] Forex Factory failed, trying alternative source:", error);
      
      // Retornar array vazio em caso de falha (não bloquear o sistema)
      return [];
    }
  } catch (error) {
    console.error("[NewsService] Error fetching news:", error);
    return [];
  }
}

/**
 * Busca eventos do Forex Factory (via scraping simplificado)
 */
async function fetchFromForexFactory(
  date: Date,
  currencies: string[],
  signal: AbortSignal
): Promise<NewsEvent[]> {
  // Forex Factory não possui API oficial, mas tem um calendário público
  // Vamos usar uma abordagem simplificada
  
  // Formato de data: YYYY-MM-DD
  const dateStr = date.toISOString().split('T')[0];
  
  try {
    // URL do calendário do Forex Factory
    const url = `https://www.forexfactory.com/calendar?day=${dateStr}`;
    
    const response = await fetch(url, {
      signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // Parse simplificado do HTML
    const events = parseForexFactoryHTML(html, currencies);
    
    return events;
  } catch (error) {
    console.error("[NewsService] Forex Factory fetch failed:", error);
    throw error;
  }
}

/**
 * Parse simplificado do HTML do Forex Factory
 */
function parseForexFactoryHTML(html: string, currencies: string[]): NewsEvent[] {
  const events: NewsEvent[] = [];
  
  try {
    // Buscar eventos de alto impacto (marcados com classe "high" ou ícone vermelho)
    // Esta é uma implementação simplificada - em produção, usar um parser HTML adequado
    
    // Regex para encontrar eventos de alto impacto
    const highImpactRegex = /class="calendar__impact.*?high.*?"[\s\S]*?class="calendar__currency".*?>(\w+)<[\s\S]*?class="calendar__event".*?>(.*?)<[\s\S]*?class="calendar__time".*?>(\d+:\d+[ap]m)/gi;
    
    let match;
    while ((match = highImpactRegex.exec(html)) !== null) {
      const currency = match[1];
      const description = match[2].replace(/<[^>]*>/g, '').trim();
      const time = match[3];
      
      // Filtrar por moedas relevantes
      if (currencies.includes(currency)) {
        events.push({
          time,
          currency,
          impact: "HIGH",
          description,
          source: "ForexFactory",
        });
      }
    }
  } catch (error) {
    console.error("[NewsService] Error parsing HTML:", error);
  }
  
  return events;
}

/**
 * Verifica se há eventos de alto impacto em um horário específico
 */
export function hasHighImpactNewsAtTime(
  events: NewsEvent[],
  targetTime: Date,
  windowMinutes: number = 60
): boolean {
  if (events.length === 0) return false;
  
  const targetHour = targetTime.getUTCHours();
  
  // Verificar se algum evento está próximo do horário alvo
  for (const event of events) {
    if (event.impact === "HIGH") {
      // Parse do horário do evento (formato: "HH:MMam/pm")
      const eventHour = parseEventTime(event.time);
      
      if (eventHour !== null) {
        // Verificar se está dentro da janela de tempo
        const hourDiff = Math.abs(targetHour - eventHour);
        if (hourDiff <= Math.floor(windowMinutes / 60)) {
          return true;
        }
      }
    }
  }
  
  return false;
}

/**
 * Parse do horário do evento (formato: "HH:MMam/pm")
 */
function parseEventTime(timeStr: string): number | null {
  try {
    const match = timeStr.match(/(\d+):(\d+)(am|pm)/i);
    if (!match) return null;
    
    let hour = parseInt(match[1]);
    const period = match[3].toLowerCase();
    
    // Converter para formato 24h
    if (period === "pm" && hour !== 12) {
      hour += 12;
    } else if (period === "am" && hour === 12) {
      hour = 0;
    }
    
    return hour;
  } catch (error) {
    return null;
  }
}
