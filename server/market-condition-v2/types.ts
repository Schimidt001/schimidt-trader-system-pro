/**
 * Market Condition Detector v2.0 - Types
 * 
 * Tipos e interfaces para o módulo reestruturado
 */

export type MarketStatus = "GREEN" | "YELLOW" | "RED";

export interface MarketConditionResult {
  status: MarketStatus;
  score: number;
  reasons: string[];
  computedAt: Date;
  candleTimestamp: number;
  symbol: string;
  details?: {
    // Critérios internos
    atr?: number;
    amplitude?: number;
    wickSuperior?: number;
    wickInferior?: number;
    corpo?: number;
    spreadCurrent?: number;
    spreadMean?: number;
    volatilityFractal?: boolean;
    
    // Critérios externos
    newsEventsUpcoming?: number;
    newsEventsPast?: number;
    newsEventsDetails?: Array<{
      timestamp: number;
      currency: string;
      impact: string;
      title: string;
    }>;
  };
}

export interface NewsEvent {
  timestamp: number;
  currency: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description?: string;
  source: string;
  actual?: string;
  forecast?: string;
  previous?: string;
}

export interface MarketDetectorConfig {
  enabled: boolean;
  
  // Critérios internos
  atrWindow: number;
  atrMultiplier: number;
  atrScore: number;
  
  wickMultiplier: number;
  wickScore: number;
  
  fractalThreshold: number;
  fractalScore: number;
  
  spreadMultiplier: number;
  spreadScore: number;
  
  // Critérios externos (notícias)
  weightHigh: number;
  weightMedium: number;
  weightHighPast: number;
  windowNextNews: number; // minutos
  windowPastNews: number; // minutos
  
  // Thresholds de classificação
  greenThreshold: number;
  yellowThreshold: number;
}

export const DEFAULT_MARKET_DETECTOR_CONFIG: MarketDetectorConfig = {
  enabled: true,
  
  // Critérios internos
  atrWindow: 14,
  atrMultiplier: 2.5,
  atrScore: 2,
  
  wickMultiplier: 2.0,
  wickScore: 1,
  
  fractalThreshold: 1.8,
  fractalScore: 1,
  
  spreadMultiplier: 2.0,
  spreadScore: 1,
  
  // Critérios externos
  weightHigh: 3,
  weightMedium: 1,
  weightHighPast: 2,
  windowNextNews: 60,
  windowPastNews: 30,
  
  // Thresholds
  greenThreshold: 3,
  yellowThreshold: 6,
};

export interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  timestamp: number;
}
