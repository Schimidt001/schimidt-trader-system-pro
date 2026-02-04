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
import { getLastClosedCandle, isCandleClosed } from "../../../../shared/candleUtils";
import { getLastCompletedSession, createSessionDataFromWindow } from "./sessionBootstrap";

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
  /**
   * CORREÇÃO P0.1 - LOOK-AHEAD: Agora usa getLastClosedCandle para garantir
   * que apenas candles FECHADOS são usados para atualização de sessão.
   */
  processM15Candles(state: SessionEngineState, candles: TrendbarData[], nowUtcMs: number = Date.now()): SessionEngineState {
    if (candles.length === 0) {
      return state;
    }
    
    // CORREÇÃO P0.1: Usar getLastClosedCandle para garantir ZERO LOOK-AHEAD
    const closedCandleResult = getLastClosedCandle(candles, 15, nowUtcMs);
    
    if (!closedCandleResult.isConfirmed || !closedCandleResult.candle) {
      // Nenhum candle M15 fechado disponível
      return state;
    }
    
    const lastCandle = closedCandleResult.candle;
    const lastCandleTime = lastCandle.timestamp;
    
    // Verificar se é um novo candle (evitar reprocessamento)
    if (lastCandleTime <= state.lastUpdateCandleTime) {
      return state;
    }
    
    const now = nowUtcMs;
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
      
      // CORREÇÃO P0.4: Verificar se mudou de trading day usando NY Close (21:00 UTC)
      // Isso resolve o problema da ASIA que cruza 00:00 UTC
      if (this.hasTradingDayChanged(state.lastUpdateCandleTime, lastCandleTime)) {
        // Novo trading day - atualizar high/low do trading day anterior
        const previousDayCandles = this.getPreviousTradingDayCandles(candles, lastCandleTime);
        if (previousDayCandles.length > 0) {
          newState.previousDayHigh = Math.max(...previousDayCandles.map(c => c.high));
          newState.previousDayLow = Math.min(...previousDayCandles.map(c => c.low));
          console.log(`[SessionEngine] ${this.symbol}: Trading day changed - previousDayHigh: ${newState.previousDayHigh?.toFixed(5)}, previousDayLow: ${newState.previousDayLow?.toFixed(5)}`);
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
   * 
   * CORREÇÃO P0.4: Implementado "Trading Day" baseado em NY Close (21:00 UTC)
   * 
   * Problema original: ASIA cruza 00:00 UTC, quebrando "dia calendário".
   * Solução: Usar NY Close (21:00 UTC) como divisor de trading day.
   * 
   * Trading Day = 21:00 UTC D-1 até 20:59 UTC D0
   * Isso é o padrão institucional usado por bancos e fundos.
   * 
   * Exemplo para 02:00 UTC de 15/Jan:
   * - Trading Day atual: 14/Jan 21:00 UTC até 15/Jan 20:59 UTC
   * - Previous Trading Day: 13/Jan 21:00 UTC até 14/Jan 20:59 UTC
   */
  private getDayCandles(candles: TrendbarData[], targetDate: Date): TrendbarData[] {
    // Calcular o início e fim do trading day usando NY Close (21:00 UTC)
    const { tradingDayStart, tradingDayEnd } = this.getTradingDayBounds(targetDate);
    
    return candles.filter(c => {
      return c.timestamp >= tradingDayStart && c.timestamp < tradingDayEnd;
    });
  }
  
  /**
   * CORREÇÃO P0.4: Calcula os limites do trading day baseado em NY Close
   * 
   * NY Close = 21:00 UTC (17:00 EST)
   * Trading Day = 21:00 UTC D-1 até 20:59 UTC D0
   * 
   * @param date Data de referência
   * @returns Início e fim do trading day em timestamps
   */
  private getTradingDayBounds(date: Date): { tradingDayStart: number; tradingDayEnd: number } {
    const NY_CLOSE_HOUR = 21; // 21:00 UTC = 17:00 EST (NY Close)
    
    // Criar uma cópia da data para não modificar a original
    const d = new Date(date.getTime());
    
    // Determinar se estamos antes ou depois do NY Close no dia atual
    const currentHour = d.getUTCHours();
    
    if (currentHour >= NY_CLOSE_HOUR) {
      // Estamos após NY Close - trading day começou hoje às 21:00
      d.setUTCHours(NY_CLOSE_HOUR, 0, 0, 0);
      const tradingDayStart = d.getTime();
      
      // Trading day termina amanhã às 21:00
      d.setUTCDate(d.getUTCDate() + 1);
      const tradingDayEnd = d.getTime();
      
      return { tradingDayStart, tradingDayEnd };
    } else {
      // Estamos antes do NY Close - trading day começou ontem às 21:00
      d.setUTCHours(NY_CLOSE_HOUR, 0, 0, 0);
      const tradingDayEnd = d.getTime();
      
      // Trading day começou ontem às 21:00
      d.setUTCDate(d.getUTCDate() - 1);
      const tradingDayStart = d.getTime();
      
      return { tradingDayStart, tradingDayEnd };
    }
  }
  
  /**
   * CORREÇÃO P0.4: Verifica se houve mudança de trading day
   * 
   * Usa NY Close (21:00 UTC) como divisor em vez de meia-noite UTC.
   * 
   * @param prevTimestamp Timestamp anterior
   * @param currTimestamp Timestamp atual
   * @returns true se mudou de trading day
   */
  private hasTradingDayChanged(prevTimestamp: number, currTimestamp: number): boolean {
    if (prevTimestamp === 0) return false;
    
    const prevBounds = this.getTradingDayBounds(new Date(prevTimestamp));
    const currBounds = this.getTradingDayBounds(new Date(currTimestamp));
    
    // Se os limites são diferentes, mudou de trading day
    return prevBounds.tradingDayStart !== currBounds.tradingDayStart;
  }
  
  /**
   * CORREÇÃO P0.4: Obtém candles do trading day anterior
   * 
   * @param candles Array de candles
   * @param currentTimestamp Timestamp atual
   * @returns Candles do trading day anterior
   */
  private getPreviousTradingDayCandles(candles: TrendbarData[], currentTimestamp: number): TrendbarData[] {
    const currentBounds = this.getTradingDayBounds(new Date(currentTimestamp));
    
    // Previous trading day termina onde o atual começa
    const prevTradingDayEnd = currentBounds.tradingDayStart;
    const prevTradingDayStart = prevTradingDayEnd - (24 * 60 * 60 * 1000); // 24 horas antes
    
    return candles.filter(c => {
      return c.timestamp >= prevTradingDayStart && c.timestamp < prevTradingDayEnd;
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
   * CORREÇÃO P0 - BOOTSTRAP: Popula previousSession no boot
   * 
   * Permite que o bot comece a operar imediatamente após o boot,
   * sem depender de mudança de sessão.
   * 
   * @param state Estado atual (pode ser vazio)
   * @param candles Array de candles M15 históricos (mínimo 24h)
   * @param nowUtcMs Timestamp atual em milissegundos (UTC)
   * @returns Estado atualizado com previousSession populada
   */
  bootstrapPreviousSession(
    state: SessionEngineState,
    candles: TrendbarData[],
    nowUtcMs: number = Date.now()
  ): SessionEngineState {
    // Se já temos previousSession, não fazer bootstrap
    if (state.previousSession) {
      return state;
    }
    
    // Calcular a última sessão completa
    const lastCompletedWindow = getLastCompletedSession(nowUtcMs, this.config);
    
    // Criar SessionData a partir dos candles históricos
    const previousSession = createSessionDataFromWindow(lastCompletedWindow, candles);
    
    if (!previousSession) {
      console.warn(`[SessionEngine] ${this.symbol}: BOOTSTRAP FALHOU - Não há candles suficientes para a sessão ${lastCompletedWindow.type}`);
      return state;
    }
    
    // Calcular previousDayHigh/Low
    const previousDayCandles = this.getPreviousTradingDayCandles(candles, nowUtcMs);
    let previousDayHigh: number | null = null;
    let previousDayLow: number | null = null;
    
    if (previousDayCandles.length > 0) {
      previousDayHigh = Math.max(...previousDayCandles.map(c => c.high));
      previousDayLow = Math.min(...previousDayCandles.map(c => c.low));
    }
    
    // Identificar sessão atual
    const currentSession = this.getCurrentSession(nowUtcMs);
    
    // Criar currentSessionData se estamos em uma sessão válida
    let currentSessionData: SessionData | null = null;
    if (currentSession !== 'OFF_SESSION' && candles.length > 0) {
      // Filtrar candles da sessão atual
      const now = new Date(nowUtcMs);
      const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const sessionStartMinutes = this.getSessionStartMinutes(currentSession);
      const sessionStart = new Date(todayStart);
      sessionStart.setUTCMinutes(sessionStartMinutes);
      
      const currentSessionCandles = candles.filter(c => c.timestamp >= sessionStart.getTime());
      if (currentSessionCandles.length > 0) {
        const firstCandle = currentSessionCandles[0];
        const lastCandle = currentSessionCandles[currentSessionCandles.length - 1];
        const high = Math.max(...currentSessionCandles.map(c => c.high));
        const low = Math.min(...currentSessionCandles.map(c => c.low));
        
        currentSessionData = {
          type: currentSession,
          high,
          low,
          range: high - low,
          openPrice: firstCandle.open,
          closePrice: lastCandle.close,
          startTime: firstCandle.timestamp,
          endTime: lastCandle.timestamp,
          isComplete: false,
          candleCount: currentSessionCandles.length,
        };
      }
    }
    
    console.log(`[SessionEngine] ${this.symbol}: ✅ BOOTSTRAP COMPLETO - previousSession: ${previousSession.type}, currentSession: ${currentSession}`);
    
    return {
      ...state,
      currentSession,
      currentSessionData,
      previousSession,
      previousDayHigh,
      previousDayLow,
      lastUpdateTime: nowUtcMs,
      lastUpdateCandleTime: candles.length > 0 ? candles[candles.length - 1].timestamp : 0,
    };
  }
  
  /**
   * Obtém os minutos UTC de início de uma sessão
   */
  private getSessionStartMinutes(session: SessionType): number {
    switch (session) {
      case 'ASIA':
        return this.config.asiaStart;
      case 'LONDON':
        return this.config.londonStart;
      case 'NY':
        return this.config.nyStart;
      default:
        return 0;
    }
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
