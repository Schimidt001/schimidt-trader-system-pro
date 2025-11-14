/**
 * Market Condition Detector v2.0 - News Collector Service
 * 
 * CICLO A: Coleta de notícias independente do candle
 * Executa periodicamente (a cada 6 horas) para popular o banco de dados
 */

import axios from "axios";
import * as cheerio from "cheerio";
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
      
      // Tentar TradingEconomics primeiro (preferencial)
      try {
        const teEvents = await this.collectFromTradingEconomics();
        events.push(...teEvents);
        console.log(`[NewsCollector] TradingEconomics: ${teEvents.length} eventos coletados`);
      } catch (error) {
        console.warn("[NewsCollector] TradingEconomics falhou:", error);
      }
      
      // Fallback para ForexFactory
      if (events.length === 0) {
        try {
          const ffEvents = await this.collectFromForexFactory();
          events.push(...ffEvents);
          console.log(`[NewsCollector] ForexFactory: ${ffEvents.length} eventos coletados`);
        } catch (error) {
          console.error("[NewsCollector] ForexFactory falhou:", error);
        }
      }
      
      // Salvar eventos no banco
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
      } else {
        console.warn("[NewsCollector] ⚠️ Nenhum evento coletado");
      }
      
      // Limpar eventos antigos (mais de 7 dias)
      await cleanupOldMarketEvents(7);
      
    } catch (error) {
      console.error("[NewsCollector] Erro durante coleta:", error);
    } finally {
      this.isCollecting = false;
    }
  }
  
  /**
   * Coleta notícias do TradingEconomics
   * TODO: Implementar quando tiver acesso à API
   */
  private async collectFromTradingEconomics(): Promise<NewsEvent[]> {
    // Por enquanto, retornar array vazio
    // Quando tiver API key, implementar aqui
    return [];
  }
  
  /**
   * Coleta notícias do ForexFactory via scraping
   */
  private async collectFromForexFactory(): Promise<NewsEvent[]> {
    const events: NewsEvent[] = [];
    
    try {
      const response = await axios.get("https://www.forexfactory.com/calendar", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 10000,
      });
      
      const $ = cheerio.load(response.data);
      
      // Parsear tabela de eventos
      $("tr.calendar__row").each((_, row) => {
        try {
          const $row = $(row);
          
          // Extrair dados
          const time = $row.find(".calendar__time").text().trim();
          const currency = $row.find(".calendar__currency").text().trim();
          const impact = $row.find(".calendar__impact span").attr("title") || "";
          const title = $row.find(".calendar__event").text().trim();
          const actual = $row.find(".calendar__actual").text().trim();
          const forecast = $row.find(".calendar__forecast").text().trim();
          const previous = $row.find(".calendar__previous").text().trim();
          
          // Filtrar apenas USD e JPY
          if (!currency || (currency !== "USD" && currency !== "JPY")) {
            return;
          }
          
          // Mapear impacto
          let impactLevel: "HIGH" | "MEDIUM" | "LOW" = "LOW";
          if (impact.includes("High")) {
            impactLevel = "HIGH";
          } else if (impact.includes("Medium")) {
            impactLevel = "MEDIUM";
          }
          
          // Filtrar apenas HIGH e MEDIUM
          if (impactLevel === "LOW") {
            return;
          }
          
          // Converter horário para timestamp
          const timestamp = this.parseForexFactoryTime(time);
          
          events.push({
            timestamp,
            currency,
            impact: impactLevel,
            title,
            description: title,
            source: "ForexFactory",
            actual: actual || undefined,
            forecast: forecast || undefined,
            previous: previous || undefined,
          });
        } catch (error) {
          // Ignorar erros de parsing de linhas individuais
        }
      });
      
    } catch (error) {
      console.error("[NewsCollector] Erro ao coletar ForexFactory:", error);
      throw error;
    }
    
    return events;
  }
  
  /**
   * Converte horário do ForexFactory para Unix timestamp
   */
  private parseForexFactoryTime(timeStr: string): number {
    // ForexFactory usa formato "HH:MMam/pm" ou "All Day"
    const now = new Date();
    
    if (!timeStr || timeStr === "All Day") {
      return Math.floor(now.getTime() / 1000);
    }
    
    // Parsear horário (ex: "8:30am")
    const match = timeStr.match(/(\d+):(\d+)(am|pm)/i);
    if (!match) {
      return Math.floor(now.getTime() / 1000);
    }
    
    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const period = match[3].toLowerCase();
    
    if (period === "pm" && hours !== 12) {
      hours += 12;
    } else if (period === "am" && hours === 12) {
      hours = 0;
    }
    
    const eventDate = new Date(now);
    eventDate.setHours(hours, minutes, 0, 0);
    
    return Math.floor(eventDate.getTime() / 1000);
  }
}

// Singleton instance
export const newsCollectorService = new NewsCollectorService();
