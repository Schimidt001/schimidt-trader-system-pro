/**
 * Tipos para a API de predição proprietária
 * NÃO MODIFICAR - Interface imutável do cliente
 */

export interface CandleData {
  abertura: number;
  minima: number;
  maxima: number;
  fechamento: number;
  timestamp: number; // Unix timestamp em segundos
}

export interface PartialCurrentCandle {
  timestamp_open: number; // Unix timestamp em segundos
  elapsed_seconds: number; // Segundos decorridos (deve ser 480 para predição)
  abertura: number;
  minima_parcial: number;
  maxima_parcial: number;
}

export interface PredictionRequest {
  symbol: string;
  tf: string; // Sempre "M15"
  history: CandleData[];
  partial_current: PartialCurrentCandle;
}

export interface PredictionResponse {
  predicted_close: number;
  direction: "up" | "down";
  phase: string;
  strategy: string;
  confidence: number;
}

/**
 * Estados do bot trader
 */
export type BotStateType =
  | "IDLE"
  | "COLLECTING"
  | "WAITING_MIDPOINT"
  | "PREDICTING"
  | "ARMED"
  | "ENTERED"
  | "MANAGING"
  | "CLOSED"
  | "LOCK_RISK"
  | "ERROR_API"
  | "DISCONNECTED";

/**
 * Tipos de eventos do sistema
 */
export type EventType =
  | "BOT_STARTED"
  | "BOT_STOPPED"
  | "CANDLE_COLLECTED"
  | "PREDICTION_MADE"
  | "POSITION_ARMED"
  | "POSITION_ENTERED"
  | "POSITION_CLOSED"
  | "STOP_DAILY_HIT"
  | "TAKE_DAILY_HIT"
  | "ERROR"
  | "RECONNECTED"
  | "DISCONNECTED";

