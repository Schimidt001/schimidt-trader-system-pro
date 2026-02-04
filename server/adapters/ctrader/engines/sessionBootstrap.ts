/**
 * sessionBootstrap.ts - Bootstrapping de Sessão Anterior
 * 
 * Responsável por calcular deterministicamente a última sessão completa
 * baseado apenas no timestamp UTC e na configuração de sessões.
 * 
 * Permite que o bot comece a operar imediatamente após o boot,
 * sem depender de mudança de sessão.
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 */

import { SessionType, SessionData, SessionTimeConfig } from "../SMCInstitutionalTypes";

/**
 * Representa uma janela de sessão com timestamps de início e fim
 */
export interface SessionWindow {
  type: SessionType;
  startTime: number;
  endTime: number;
}

/**
 * Calcula a última sessão completa baseado no timestamp atual
 * 
 * Algoritmo:
 * 1. Identifica a sessão atual
 * 2. Calcula o timestamp de início da sessão atual
 * 3. Retorna a sessão anterior (que terminou no início da atual)
 * 
 * @param nowUtc Timestamp atual em milissegundos (UTC)
 * @param config Configuração de horários das sessões (em minutos UTC)
 * @returns Janela da última sessão completa
 */
export function getLastCompletedSession(
  nowUtc: number,
  config: SessionTimeConfig
): SessionWindow {
  const now = new Date(nowUtc);
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  
  // Identificar sessão atual
  const currentSession = getCurrentSessionType(utcMinutes, config);
  
  // Calcular sessão anterior
  if (currentSession === 'ASIA') {
    // Se estamos em ASIA, a sessão anterior é NY
    return calculatePreviousNYSession(nowUtc, config);
  } else if (currentSession === 'LONDON') {
    // Se estamos em LONDON, a sessão anterior é ASIA
    return calculatePreviousAsiaSession(nowUtc, config);
  } else if (currentSession === 'NY') {
    // Se estamos em NY, a sessão anterior é LONDON
    return calculatePreviousLondonSession(nowUtc, config);
  } else {
    // OFF_SESSION: Calcular qual foi a última sessão que terminou
    return calculateLastSessionBeforeOffSession(nowUtc, utcMinutes, config);
  }
}

/**
 * Identifica o tipo de sessão baseado nos minutos UTC
 */
function getCurrentSessionType(utcMinutes: number, config: SessionTimeConfig): SessionType {
  // ASIA: Suporta wrap (23:00 - 07:00)
  if (config.asiaStart > config.asiaEnd) {
    if (utcMinutes >= config.asiaStart || utcMinutes < config.asiaEnd) {
      return 'ASIA';
    }
  } else {
    if (utcMinutes >= config.asiaStart && utcMinutes < config.asiaEnd) {
      return 'ASIA';
    }
  }
  
  // LONDON: 07:00 - 12:00 UTC
  if (utcMinutes >= config.londonStart && utcMinutes < config.londonEnd) {
    return 'LONDON';
  }
  
  // NY: 12:00 - 21:00 UTC
  if (utcMinutes >= config.nyStart && utcMinutes < config.nyEnd) {
    return 'NY';
  }
  
  return 'OFF_SESSION';
}

/**
 * Calcula a sessão NY anterior (terminou no início de ASIA)
 */
function calculatePreviousNYSession(nowUtc: number, config: SessionTimeConfig): SessionWindow {
  const now = new Date(nowUtc);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  
  // ASIA começa às 23:00 do dia anterior (ou 23:00 de hoje se ainda não passou)
  const asiaStartToday = new Date(today);
  asiaStartToday.setUTCHours(Math.floor(config.asiaStart / 60), config.asiaStart % 60, 0, 0);
  
  let nyEnd: Date;
  if (nowUtc >= asiaStartToday.getTime()) {
    // ASIA já começou hoje, então NY terminou ontem
    nyEnd = new Date(today);
    nyEnd.setUTCDate(nyEnd.getUTCDate() - 1);
    nyEnd.setUTCHours(Math.floor(config.nyEnd / 60), config.nyEnd % 60, 0, 0);
  } else {
    // Ainda não chegou na ASIA de hoje, então NY terminou ontem
    nyEnd = new Date(today);
    nyEnd.setUTCDate(nyEnd.getUTCDate() - 1);
    nyEnd.setUTCHours(Math.floor(config.nyEnd / 60), config.nyEnd % 60, 0, 0);
  }
  
  const nyStart = new Date(nyEnd);
  nyStart.setUTCHours(Math.floor(config.nyStart / 60), config.nyStart % 60, 0, 0);
  
  return {
    type: 'NY',
    startTime: nyStart.getTime(),
    endTime: nyEnd.getTime(),
  };
}

/**
 * Calcula a sessão ASIA anterior (terminou no início de LONDON)
 */
function calculatePreviousAsiaSession(nowUtc: number, config: SessionTimeConfig): SessionWindow {
  const now = new Date(nowUtc);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  
  // LONDON começa hoje às 07:00
  const londonStart = new Date(today);
  londonStart.setUTCHours(Math.floor(config.londonStart / 60), config.londonStart % 60, 0, 0);
  
  // ASIA termina quando LONDON começa
  const asiaEnd = londonStart;
  
  // ASIA começa às 23:00 do dia anterior
  const asiaStart = new Date(asiaEnd);
  asiaStart.setUTCDate(asiaStart.getUTCDate() - 1);
  asiaStart.setUTCHours(Math.floor(config.asiaStart / 60), config.asiaStart % 60, 0, 0);
  
  return {
    type: 'ASIA',
    startTime: asiaStart.getTime(),
    endTime: asiaEnd.getTime(),
  };
}

/**
 * Calcula a sessão LONDON anterior (terminou no início de NY)
 */
function calculatePreviousLondonSession(nowUtc: number, config: SessionTimeConfig): SessionWindow {
  const now = new Date(nowUtc);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  
  // NY começa hoje às 12:00
  const nyStart = new Date(today);
  nyStart.setUTCHours(Math.floor(config.nyStart / 60), config.nyStart % 60, 0, 0);
  
  // LONDON termina quando NY começa
  const londonEnd = nyStart;
  
  // LONDON começa às 07:00 de hoje
  const londonStart = new Date(londonEnd);
  londonStart.setUTCHours(Math.floor(config.londonStart / 60), config.londonStart % 60, 0, 0);
  
  return {
    type: 'LONDON',
    startTime: londonStart.getTime(),
    endTime: londonEnd.getTime(),
  };
}

/**
 * Calcula a última sessão antes de OFF_SESSION
 * OFF_SESSION ocorre entre 21:00 e 23:00 UTC
 */
function calculateLastSessionBeforeOffSession(
  nowUtc: number,
  utcMinutes: number,
  config: SessionTimeConfig
): SessionWindow {
  const now = new Date(nowUtc);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  
  // OFF_SESSION está entre NY (21:00) e ASIA (23:00)
  // A última sessão completa é NY
  const nyEnd = new Date(today);
  nyEnd.setUTCHours(Math.floor(config.nyEnd / 60), config.nyEnd % 60, 0, 0);
  
  const nyStart = new Date(nyEnd);
  nyStart.setUTCHours(Math.floor(config.nyStart / 60), config.nyStart % 60, 0, 0);
  
  return {
    type: 'NY',
    startTime: nyStart.getTime(),
    endTime: nyEnd.getTime(),
  };
}

/**
 * Cria um SessionData a partir de uma SessionWindow e candles históricos
 * 
 * @param window Janela de sessão
 * @param candles Array de candles M15 (deve cobrir o período da sessão)
 * @returns SessionData com high, low, range calculados
 */
export function createSessionDataFromWindow(
  window: SessionWindow,
  candles: any[]
): SessionData | null {
  if (!candles || candles.length === 0) {
    return null;
  }
  
  // Filtrar candles que estão dentro da janela da sessão
  const sessionCandles = candles.filter(c => {
    const candleTime = c.timestamp || c.time;
    return candleTime >= window.startTime && candleTime < window.endTime;
  });
  
  if (sessionCandles.length === 0) {
    return null;
  }
  
  // Calcular high, low, open, close
  let high = -Infinity;
  let low = Infinity;
  const openPrice = sessionCandles[0].open;
  const closePrice = sessionCandles[sessionCandles.length - 1].close;
  
  for (const candle of sessionCandles) {
    if (candle.high > high) high = candle.high;
    if (candle.low < low) low = candle.low;
  }
  
  const range = high - low;
  
  return {
    type: window.type,
    startTime: window.startTime,
    endTime: window.endTime,
    high,
    low,
    range,
    openPrice,
    closePrice,
    isComplete: true,
  };
}
