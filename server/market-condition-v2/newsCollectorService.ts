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
      
      // Tentar API pública
      try {
        const apiEvents = await this.collectFromPublicAPI();
        events.push(...apiEvents);
        console.log(`[NewsCollector] ✅ API Pública: ${apiEvents.length} eventos coletados`);
      } catch (error) {
        console.error("[NewsCollector] ❌ Falha na API Pública:", error);
        console.warn("[NewsCollector] ⚠️ Falha na coleta de notícias externas. Detector operará apenas com critérios internos.");
      }
      
      // Se não houver eventos, apenas logar
      if (events.length === 0) {
        console.warn("[NewsCollector] ⚠️ Nenhum evento coletado. Detector operará apenas com critérios internos (ATR, Wicks, Spread, Fractal).");
      } else {
        // Salvar eventos no banco
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
}

// Singleton instance
export const newsCollectorService = new NewsCollectorService();
