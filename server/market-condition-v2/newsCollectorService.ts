/**
 * Market Condition Detector v2.0 - News Collector Service
 * 
 * CICLO A: Coleta de notícias independente do candle
 * Executa periodicamente (a cada 6 horas) para popular o banco de dados
 * 
 * IMPORTANTE: Mock data APENAS em desenvolvimento (NODE_ENV !== 'production')
 */

import axios from "axios";
import type { NewsEvent } from "./types";
import { insertMarketEvents, cleanupOldMarketEvents } from "../db";

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
      
      // Tentar API pública primeiro
      try {
        const apiEvents = await this.collectFromPublicAPI();
        events.push(...apiEvents);
        console.log(`[NewsCollector] API Pública: ${apiEvents.length} eventos coletados`);
      } catch (error) {
        console.error("[NewsCollector] ❌ Falha na API Pública:", error);
        
        // Log estruturado de falha
        console.warn("[NewsCollector] ⚠️ Falha na coleta de notícias externas. Detector operará apenas com critérios internos.");
      }
      
      // Mock data APENAS em desenvolvimento/teste
      if (events.length === 0 && process.env.NODE_ENV !== 'production') {
        console.log("[NewsCollector] 🔧 Modo desenvolvimento detectado - Gerando mock data");
        try {
          const mockEvents = await this.generateMockEvents();
          events.push(...mockEvents);
          console.log(`[NewsCollector] Mock Data: ${mockEvents.length} eventos gerados (DEV ONLY)`);
        } catch (error) {
          console.error("[NewsCollector] Erro ao gerar mock data:", error);
        }
      }
      
      // Em produção, se não houver eventos, apenas logar
      if (events.length === 0 && process.env.NODE_ENV === 'production') {
        console.warn("[NewsCollector] ⚠️ PRODUÇÃO: Nenhum evento coletado. Detector operará apenas com critérios internos (ATR, Wicks, Spread, Fractal).");
      }
      
      // Salvar eventos no banco (se houver)
      if (events.length > 0) {
        await insertMarketEvents(events.map(e => ({
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
        
        console.log(`[NewsCollector] ✅ ${events.length} eventos salvos no banco`);
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
   * Coleta notícias de API pública gratuita
   * Usa: https://api.api-ninjas.com/v1/economiccalendar
   */
  private async collectFromPublicAPI(): Promise<NewsEvent[]> {
    const events: NewsEvent[] = [];
    
    try {
      // API Ninjas - Economic Calendar (gratuita)
      const response = await axios.get("https://api.api-ninjas.com/v1/economiccalendar", {
        headers: {
          "X-Api-Key": "FREE_API_KEY", // API pública sem necessidade de key
        },
        timeout: 10000,
      });
      
      if (response.data && Array.isArray(response.data)) {
        for (const event of response.data) {
          // Filtrar apenas USD e JPY
          if (!event.country || (event.country !== "United States" && event.country !== "Japan")) {
            continue;
          }
          
          // Mapear moeda
          const currency = event.country === "United States" ? "USD" : "JPY";
          
          // Mapear impacto
          let impact: "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
          if (event.importance && event.importance >= 3) {
            impact = "HIGH";
          } else if (event.importance && event.importance <= 1) {
            impact = "LOW";
          }
          
          // Filtrar apenas HIGH e MEDIUM
          if (impact === "LOW") {
            continue;
          }
          
          events.push({
            timestamp: new Date(event.date).getTime() / 1000,
            currency,
            impact,
            title: event.event || "Economic Event",
            description: event.event || "Economic Event",
            source: "EconomicCalendar",
            actual: event.actual?.toString(),
            forecast: event.forecast?.toString(),
            previous: event.previous?.toString(),
          });
        }
      }
    } catch (error) {
      console.error("[NewsCollector] Erro ao coletar da API pública:", error);
      throw error;
    }
    
    return events;
  }
  
  /**
   * Gera eventos mock realistas para desenvolvimento/teste
   * 
   * ⚠️ IMPORTANTE: Esta função NUNCA deve ser chamada em produção
   * Mock data pode criar decisões baseadas em eventos que não aconteceram
   */
  private async generateMockEvents(): Promise<NewsEvent[]> {
    // Garantia adicional: nunca executar em produção
    if (process.env.NODE_ENV === 'production') {
      console.error("[NewsCollector] ❌ ERRO CRÍTICO: generateMockEvents() chamado em PRODUÇÃO!");
      return [];
    }
    
    const events: NewsEvent[] = [];
    const now = Date.now() / 1000;
    
    // Eventos USD (próximos)
    const usdEvents = [
      {
        title: "US Non-Farm Payrolls",
        impact: "HIGH" as const,
        hoursOffset: 2,
        actual: undefined,
        forecast: "180K",
        previous: "175K",
      },
      {
        title: "US Federal Reserve Interest Rate Decision",
        impact: "HIGH" as const,
        hoursOffset: 6,
        actual: undefined,
        forecast: "5.50%",
        previous: "5.50%",
      },
      {
        title: "US Consumer Price Index (CPI)",
        impact: "HIGH" as const,
        hoursOffset: 12,
        actual: undefined,
        forecast: "3.2%",
        previous: "3.1%",
      },
      {
        title: "US Retail Sales",
        impact: "MEDIUM" as const,
        hoursOffset: 18,
        actual: undefined,
        forecast: "0.3%",
        previous: "0.4%",
      },
      {
        title: "US Unemployment Rate",
        impact: "HIGH" as const,
        hoursOffset: 24,
        actual: undefined,
        forecast: "3.9%",
        previous: "3.8%",
      },
    ];
    
    // Eventos JPY (próximos)
    const jpyEvents = [
      {
        title: "Japan GDP Growth Rate",
        impact: "HIGH" as const,
        hoursOffset: 4,
        actual: undefined,
        forecast: "1.2%",
        previous: "1.0%",
      },
      {
        title: "Bank of Japan Interest Rate Decision",
        impact: "HIGH" as const,
        hoursOffset: 8,
        actual: undefined,
        forecast: "-0.10%",
        previous: "-0.10%",
      },
      {
        title: "Japan Consumer Price Index (CPI)",
        impact: "MEDIUM" as const,
        hoursOffset: 16,
        actual: undefined,
        forecast: "2.5%",
        previous: "2.4%",
      },
    ];
    
    // Eventos USD (passados - últimas 12h)
    const usdPastEvents = [
      {
        title: "US Initial Jobless Claims",
        impact: "MEDIUM" as const,
        hoursOffset: -2,
        actual: "210K",
        forecast: "215K",
        previous: "220K",
      },
      {
        title: "US Producer Price Index (PPI)",
        impact: "MEDIUM" as const,
        hoursOffset: -6,
        actual: "2.8%",
        forecast: "2.7%",
        previous: "2.6%",
      },
    ];
    
    // Adicionar eventos USD
    for (const event of usdEvents) {
      events.push({
        timestamp: Math.floor(now + (event.hoursOffset * 3600)),
        currency: "USD",
        impact: event.impact,
        title: event.title,
        description: event.title,
        source: "MockData_DEV",
        actual: event.actual,
        forecast: event.forecast,
        previous: event.previous,
      });
    }
    
    // Adicionar eventos JPY
    for (const event of jpyEvents) {
      events.push({
        timestamp: Math.floor(now + (event.hoursOffset * 3600)),
        currency: "JPY",
        impact: event.impact,
        title: event.title,
        description: event.title,
        source: "MockData_DEV",
        actual: event.actual,
        forecast: event.forecast,
        previous: event.previous,
      });
    }
    
    // Adicionar eventos passados
    for (const event of usdPastEvents) {
      events.push({
        timestamp: Math.floor(now + (event.hoursOffset * 3600)),
        currency: "USD",
        impact: event.impact,
        title: event.title,
        description: event.title,
        source: "MockData_DEV",
        actual: event.actual,
        forecast: event.forecast,
        previous: event.previous,
      });
    }
    
    return events;
  }
}

// Singleton instance
export const newsCollectorService = new NewsCollectorService();
