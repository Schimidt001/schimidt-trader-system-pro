/**
 * Market Condition Detector v1.0 - Types
 * 
 * Tipos e interfaces para o módulo de detecção de condições de mercado
 */

export type MarketStatus = "GREEN" | "YELLOW" | "RED";

export interface MarketConditionResult {
  status: MarketStatus;     // "GREEN" | "YELLOW" | "RED"
  score: number;            // 0–10
  reasons: string[];        // lista de motivos (ex.: ["ATR_HIGH", "LONG_WICKS", "HIGH_IMPACT_NEWS"])
  computedAt: Date;         // horário da avaliação
  candleTimestamp: number;  // timestamp do candle avaliado
  symbol: string;           // par/ativo avaliado
  details?: {               // detalhes opcionais para debug
    atr?: number;
    amplitude?: number;
    wickSuperior?: number;
    wickInferior?: number;
    corpo?: number;
    spread?: number;
    spreadMedio?: number;
    volatilityFractal?: boolean;
    newsEvents?: NewsEvent[];
  };
}

export interface NewsEvent {
  time: string;             // horário do evento
  currency: string;         // moeda afetada (USD, JPY, etc)
  impact: "LOW" | "MEDIUM" | "HIGH";
  description: string;      // descrição do evento
  source: string;           // fonte da informação
}

export interface MarketConditionConfig {
  enabled: boolean;
  
  // Critério 1: Amplitude anormal
  atrPeriod: number;                    // período do ATR (padrão: 14)
  atrMultiplier: number;                // multiplicador do ATR (padrão: 2.0)
  atrScore: number;                     // pontos adicionados (padrão: 2)
  
  // Critério 2: Sombras exageradas
  wickToBodyRatio: number;              // razão mínima wick/corpo (padrão: 2.0)
  wickScore: number;                    // pontos adicionados (padrão: 2)
  
  // Critério 3: Spread anormal
  spreadLookbackHours: number;          // horas para calcular spread médio (padrão: 24)
  spreadMultiplier: number;             // multiplicador do spread médio (padrão: 1.5)
  spreadScore: number;                  // pontos adicionados (padrão: 1)
  
  // Critério 4: Volatilidade fractal
  fractalBodyToAmplitudeRatio: number;  // razão máxima corpo/amplitude (padrão: 0.3)
  fractalScore: number;                 // pontos adicionados (padrão: 2)
  
  // Critério 5: Notícias de alto impacto
  newsEnabled: boolean;                 // habilitar busca de notícias (padrão: true)
  newsScore: number;                    // pontos adicionados (padrão: 3)
  newsApiTimeout: number;               // timeout da API em ms (padrão: 5000)
  
  // Classificação
  greenThreshold: number;               // score máximo para GREEN (padrão: 3)
  yellowThreshold: number;              // score máximo para YELLOW (padrão: 6)
  // RED é tudo acima de yellowThreshold
}

export const DEFAULT_MARKET_CONDITION_CONFIG: MarketConditionConfig = {
  enabled: true,
  
  // Critério 1: Amplitude anormal
  atrPeriod: 14,
  atrMultiplier: 2.5, // Aumentado de 2.0 para 2.5 para reduzir falsos positivos
  atrScore: 2,
  
  // Critério 2: Sombras exageradas
  wickToBodyRatio: 2.0,
  wickScore: 2,
  
  // Critério 3: Spread anormal
  spreadLookbackHours: 24,
  spreadMultiplier: 1.5,
  spreadScore: 1,
  
  // Critério 4: Volatilidade fractal
  fractalBodyToAmplitudeRatio: 0.3,
  fractalScore: 2,
  
  // Critério 5: Notícias de alto impacto
  newsEnabled: true,
  newsScore: 3,
  newsApiTimeout: 5000,
  
  // Classificação
  greenThreshold: 3,
  yellowThreshold: 6,
};
