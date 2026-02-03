/**
 * SessionEngine - Motor de Identificação de Sessões de Trading
 * 
 * Responsável por:
 * - Identificar sessões ASIA, LONDON e NY em UTC
 * - Registrar High, Low, Range para cada sessão
 * - Armazenar sessão anterior e dia anterior
 * - Atualização somente no fechamento do candle M15
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 */

import { TrendbarData } from "../CTraderClient";
import {
  SessionType,
  SessionData,
  SessionEngineState,
  SessionTimeConfig,
} from "../SMCInstitutionalTypes";

/**
 * Configuração padrão de sessões (UTC em minutos)
 */
export const DEFAULT_SESSION_CONFIG: SessionTimeConfig = {
  asiaStart: 1380,   // 23:00 UTC
  asiaEnd: 420,      // 07:00 UTC
  londonStart: 420,  // 07:00 UTC
  londonEnd: 720,    // 12:00 UTC
  nyStart: 720,      // 12:00 UTC
  nyEnd: 1260,       // 21:00 UTC
};

/**
 * SessionEngine - Classe para gerenciamento de sessões de trading
 */
export class SessionEngine {
  private config: SessionTimeConfig;
  private symbol: string;
  
  constructor(symbol: string, config: Partial<SessionTimeConfig> = {}) {
    this.symbol = symbol;
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
  }
  
  /**
   * Atualiza a configuração de sessões
   */
  updateConfig(config: Partial<SessionTimeConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Identifica a sessão atual baseado no timestamp UTC
   * 
   * @param timestampMs Timestamp em milissegundos
   * @returns Tipo da sessão atual
   */
  getCurrentSession(timestampMs: number): SessionType {
    const date = new Date(timestampMs);
    const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
    
    // ASIA: Suporta wrap (23:00 - 07:00)
    if (this.config.asiaStart > this.config.asiaEnd) {
      // Sessão atravessa a meia-noite
      if (utcMinutes >= this.config.asiaStart || utcMinutes < this.config.asiaEnd) {
        return 'ASIA';
      }
    } else {
      if (utcMinutes >= this.config.asiaStart && utcMinutes < this.config.asiaEnd) {
        return 'ASIA';
      }
    }
    
    // LONDON: 07:00 - 12:00 UTC
    if (utcMinutes >= this.config.londonStart && utcMinutes < this.config.londonEnd) {
      return 'LONDON';
    }
    
    // NY: 12:00 - 21:00 UTC
    if (utcMinutes >= this.config.nyStart && utcMinutes < this.config.nyEnd) {
      return 'NY';
    }
    
    return 'OFF_SESSION';
  }
  
  /**
   * Processa candles M15 e atualiza o estado da sessão
   * IMPORTANTE: Atualização ocorre somente no fechamento do candle M15
   * 
   * @param state Estado atual do SessionEngine
   * @param candles Array de candles M15
   * @returns Estado atualizado
   */
  processM15Candles(state: SessionEngineState, candles: TrendbarData[]): SessionEngineState {
    if (candles.length === 0) {
      return state;
    }
    
    const lastCandle = candles[candles.length - 1];
    const lastCandleTime = lastCandle.timestamp;
    
    // Verificar se é um novo candle (evitar reprocessamento)
    if (lastCandleTime <= state.lastUpdateCandleTime) {
      return state;
    }
    
    const now = Date.now();
    const currentSession = this.getCurrentSession(lastCandleTime);
    
    // Criar novo estado
    const newState: SessionEngineState = {
      ...state,
      currentSession,
      lastUpdateTime: now,
      lastUpdateCandleTime: lastCandleTime,
    };
    
    // Verificar se houve mudança de sessão
    if (currentSession !== state.currentSession && state.currentSession !== 'OFF_SESSION') {
      // Sessão anterior terminou - salvar dados
      if (state.currentSessionData) {
        newState.previousSession = {
          ...state.currentSessionData,
          isComplete: true,
          closePrice: candles[candles.length - 2]?.close || state.currentSessionData.closePrice,
          endTime: lastCandleTime,
        };
      }
      
      // Verificar se mudou de dia (para previousDayHigh/Low)
      const prevDate = new Date(state.lastUpdateCandleTime);
      const currDate = new Date(lastCandleTime);
      if (prevDate.getUTCDate() !== currDate.getUTCDate()) {
        // Novo dia - atualizar high/low do dia anterior
        const previousDayCandles = this.getDayCandles(candles, prevDate);
        if (previousDayCandles.length > 0) {
          newState.previousDayHigh = Math.max(...previousDayCandles.map(c => c.high));
          newState.previousDayLow = Math.min(...previousDayCandles.map(c => c.low));
        }
      }
      
      // Iniciar nova sessão
      newState.currentSessionData = this.createNewSessionData(currentSession, lastCandle);
    } else if (currentSession !== 'OFF_SESSION') {
      // Mesma sessão - atualizar High/Low/Range
      if (state.currentSessionData) {
        newState.currentSessionData = this.updateSessionData(state.currentSessionData, lastCandle);
      } else {
        // Primeira vez na sessão
        newState.currentSessionData = this.createNewSessionData(currentSession, lastCandle);
      }
    }
    
    return newState;
  }
  
  /**
   * Cria dados de uma nova sessão
   */
  private createNewSessionData(type: SessionType, candle: TrendbarData): SessionData {
    return {
      type,
      high: candle.high,
      low: candle.low,
      range: candle.high - candle.low,
      openPrice: candle.open,
      closePrice: candle.close,
      startTime: candle.timestamp,
      endTime: candle.timestamp,
      isComplete: false,
      candleCount: 1,
    };
  }
  
  /**
   * Atualiza dados de uma sessão existente
   */
  private updateSessionData(session: SessionData, candle: TrendbarData): SessionData {
    const newHigh = Math.max(session.high, candle.high);
    const newLow = Math.min(session.low, candle.low);
    
    return {
      ...session,
      high: newHigh,
      low: newLow,
      range: newHigh - newLow,
      closePrice: candle.close,
      endTime: candle.timestamp,
      candleCount: session.candleCount + 1,
    };
  }
  
  /**
   * Obtém candles de um dia específico
   */
  private getDayCandles(candles: TrendbarData[], targetDate: Date): TrendbarData[] {
    const targetDay = targetDate.getUTCDate();
    const targetMonth = targetDate.getUTCMonth();
    const targetYear = targetDate.getUTCFullYear();
    
    return candles.filter(c => {
      const candleDate = new Date(c.timestamp);
      return (
        candleDate.getUTCDate() === targetDay &&
        candleDate.getUTCMonth() === targetMonth &&
        candleDate.getUTCFullYear() === targetYear
      );
    });
  }
  
  /**
   * Obtém o High/Low da sessão anterior
   * Usado pelo LiquidityEngine para criar pools
   */
  getSessionLiquidityLevels(state: SessionEngineState): { high: number | null; low: number | null } {
    if (state.previousSession) {
      return {
        high: state.previousSession.high,
        low: state.previousSession.low,
      };
    }
    return { high: null, low: null };
  }
  
  /**
   * Obtém o High/Low do dia anterior
   * Usado pelo LiquidityEngine para criar pools
   */
  getDailyLiquidityLevels(state: SessionEngineState): { high: number | null; low: number | null } {
    return {
      high: state.previousDayHigh,
      low: state.previousDayLow,
    };
  }
  
  /**
   * Verifica se estamos em uma sessão válida para trading
   */
  isInTradingSession(state: SessionEngineState): boolean {
    return state.currentSession !== 'OFF_SESSION';
  }
  
  /**
   * Obtém informações formatadas da sessão para logs
   */
  getSessionInfo(state: SessionEngineState): string {
    const parts: string[] = [];
    
    parts.push(`Sessão: ${state.currentSession}`);
    
    if (state.currentSessionData) {
      parts.push(`H: ${state.currentSessionData.high.toFixed(5)}`);
      parts.push(`L: ${state.currentSessionData.low.toFixed(5)}`);
      parts.push(`Range: ${state.currentSessionData.range.toFixed(5)}`);
    }
    
    if (state.previousSession) {
      parts.push(`Prev: ${state.previousSession.type}`);
      parts.push(`PrevH: ${state.previousSession.high.toFixed(5)}`);
      parts.push(`PrevL: ${state.previousSession.low.toFixed(5)}`);
    }
    
    return parts.join(' | ');
  }
  
  /**
   * Cria um estado inicial vazio
   */
  static createEmptyState(): SessionEngineState {
    return {
      currentSession: 'OFF_SESSION',
      currentSessionData: null,
      previousSession: null,
      previousDayHigh: null,
      previousDayLow: null,
      lastUpdateTime: Date.now(),
      lastUpdateCandleTime: 0,
    };
  }
}

/**
 * Factory function para criar SessionEngine
 */
export function createSessionEngine(symbol: string, config?: Partial<SessionTimeConfig>): SessionEngine {
  return new SessionEngine(symbol, config);
}
