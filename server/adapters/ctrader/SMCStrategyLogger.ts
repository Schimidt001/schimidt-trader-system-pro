/**
 * SMC Strategy Logger - Sistema de Logging Estruturado para Estratégia SMC
 * 
 * Este módulo fornece logging detalhado e estruturado para a estratégia SMC,
 * permitindo monitoramento em tempo real através do console de logs da plataforma.
 * 
 * Categorias de Log:
 * - SMC_INIT: Inicialização da estratégia
 * - SMC_SWING: Detecção de Swing Points (topos e fundos)
 * - SMC_SWEEP: Detecção de Sweep (varredura de liquidez)
 * - SMC_CHOCH: Detecção de Change of Character
 * - SMC_OB: Order Block identificado
 * - SMC_ENTRY: Condições de entrada
 * - SMC_SIGNAL: Sinal gerado
 * - SMC_FILTER: Filtros aplicados (spread, sessão, etc.)
 * - SMC_STATE: Estado atual da estratégia
 * - SMC_ERROR: Erros e problemas
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 */

import { insertSystemLog, type LogLevel, type LogCategory } from "../../db";

// Tipos específicos para o logger SMC
export type SMCLogCategory = 
  | "SMC_INIT"
  | "SMC_SWING"
  | "SMC_SWEEP"
  | "SMC_CHOCH"
  | "SMC_OB"
  | "SMC_ENTRY"
  | "SMC_SIGNAL"
  | "SMC_FILTER"
  | "SMC_STATE"
  | "SMC_ERROR"
  | "SMC_TRADE"
  | "SMC_CONFIG"
  | "SMC_PIPELINE";

// Interface para dados de Swing Point
export interface SwingPointLogData {
  type: "HIGH" | "LOW";
  price: number;
  timestamp: number;
  index: number;
  timeframe: string;
}

// Interface para dados de Sweep
export interface SweepLogData {
  type: "HIGH" | "LOW";
  swingPrice: number;
  currentPrice: number;
  exceedPips: number;
  detectionMethod: "REALTIME" | "CANDLE_CLOSE";
}

// Interface para dados de CHoCH
export interface CHoCHLogData {
  direction: "BULLISH" | "BEARISH";
  swingPrice: number;
  closePrice: number;
  movementPips: number;
  minRequired: number;
  breakType: "CLOSE" | "WICK";
}

// Interface para dados de Order Block
export interface OrderBlockLogData {
  high: number;
  low: number;
  direction: "BULLISH" | "BEARISH";
  candleIndex: number;
}

// Interface para dados de entrada
export interface EntryLogData {
  direction: "BUY" | "SELL";
  price: number;
  confirmationType: string;
  orderBlock: { high: number; low: number };
  stopLoss?: number;
  takeProfit?: number;
}

// Interface para dados de filtro
export interface FilterLogData {
  filterName: string;
  reason: string;
  currentValue?: number | string;
  threshold?: number | string;
  blocked: boolean;
}

// Interface para estado da estratégia
export interface SMCStateLogData {
  symbol: string;
  swingHighs: number;
  swingLows: number;
  sweepConfirmed: boolean;
  lastSweepType: "HIGH" | "LOW" | null;
  chochDetected: boolean;
  chochDirection: "BULLISH" | "BEARISH" | null;
  activeOrderBlock: boolean;
  entryDirection: "BUY" | "SELL" | null;
  readyForEntry: boolean;
}

/**
 * Classe de Logger para Estratégia SMC
 */
export class SMCStrategyLogger {
  private userId: number;
  private botId: number;
  private verboseLogging: boolean;
  private source: string = "SMCStrategy";
  
  // Rate limiting para evitar spam de logs
  private lastLogTime: Map<string, number> = new Map();
  private readonly LOG_COOLDOWN_MS = 1000; // 1 segundo entre logs similares
  
  constructor(userId: number, botId: number, verboseLogging: boolean = true) {
    this.userId = userId;
    this.botId = botId;
    this.verboseLogging = verboseLogging;
  }
  
  /**
   * Atualiza configuração de verbose logging
   */
  setVerboseLogging(enabled: boolean): void {
    this.verboseLogging = enabled;
  }
  
  /**
   * Verifica rate limiting para evitar spam
   */
  private shouldLog(key: string, forceLog: boolean = false): boolean {
    if (forceLog) return true;
    
    const now = Date.now();
    const lastTime = this.lastLogTime.get(key) || 0;
    
    if (now - lastTime < this.LOG_COOLDOWN_MS) {
      return false;
    }
    
    this.lastLogTime.set(key, now);
    return true;
  }
  
  /**
   * Método base para inserir log no banco de dados
   */
  private async log(
    level: LogLevel,
    category: string,
    message: string,
    options?: {
      symbol?: string;
      signal?: string;
      latencyMs?: number;
      data?: Record<string, unknown>;
      forceLog?: boolean;
    }
  ): Promise<void> {
    // Rate limiting
    const logKey = `${category}-${options?.symbol || 'global'}-${message.substring(0, 50)}`;
    if (!this.shouldLog(logKey, options?.forceLog)) {
      return;
    }
    
    try {
      await insertSystemLog({
        userId: this.userId,
        botId: this.botId,
        level,
        category: category as LogCategory,
        source: this.source,
        message,
        symbol: options?.symbol,
        signal: options?.signal,
        latencyMs: options?.latencyMs,
        data: options?.data,
      });
    } catch (error) {
      // Não deixar erro de log quebrar o fluxo principal
      console.error("[SMCStrategyLogger] Erro ao gravar log:", error);
    }
  }
  
  // ============= LOGS DE INICIALIZAÇÃO =============
  
  /**
   * Log de inicialização da estratégia
   */
  async logInit(config: Record<string, unknown>): Promise<void> {
    const message = `🚀 SMC Strategy inicializada | Símbolos: ${(config.activeSymbols as string[])?.join(', ') || 'N/A'}`;
    console.log(`[SMCStrategy] ${message}`);
    await this.log("INFO", "SYSTEM", message, {
      data: {
        category: "SMC_INIT",
        structureTimeframe: config.structureTimeframe,
        activeSymbols: config.activeSymbols,
        riskPercentage: config.riskPercentage,
        maxOpenTrades: config.maxOpenTrades,
        spreadFilterEnabled: config.spreadFilterEnabled,
        maxSpreadPips: config.maxSpreadPips,
        sessionFilterEnabled: config.sessionFilterEnabled,
      },
      forceLog: true,
    });
  }
  
  /**
   * Log de alteração de configuração
   */
  async logConfigChange(paramName: string, oldValue: unknown, newValue: unknown): Promise<void> {
    const message = `⚙️ CONFIG | ${paramName}: ${JSON.stringify(oldValue)} → ${JSON.stringify(newValue)}`;
    console.log(`[SMCStrategy] ${message}`);
    await this.log("INFO", "SYSTEM", message, {
      data: {
        category: "SMC_CONFIG",
        paramName,
        oldValue,
        newValue,
      },
      forceLog: true,
    });
  }
  
  // ============= LOGS DE SWING POINTS =============
  
  /**
   * Log de Swing Point detectado
   */
  async logSwingPointDetected(symbol: string, data: SwingPointLogData): Promise<void> {
    if (!this.verboseLogging) return;
    
    const emoji = data.type === "HIGH" ? "📈" : "📉";
    const message = `${emoji} SWING ${data.type} | ${symbol} @ ${data.price.toFixed(5)} | TF: ${data.timeframe}`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log("INFO", "ANALYSIS", message, {
      symbol,
      data: {
        category: "SMC_SWING",
        ...data,
      },
    });
  }
  
  /**
   * Log de resumo de Swing Points
   */
  async logSwingPointsSummary(symbol: string, highCount: number, lowCount: number, timeframe: string): Promise<void> {
    const total = highCount + lowCount;
    const message = `📊 SWING POINTS | ${symbol} | Highs: ${highCount} | Lows: ${lowCount} | Total: ${total} | TF: ${timeframe}`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log("INFO", "ANALYSIS", message, {
      symbol,
      data: {
        category: "SMC_SWING",
        highCount,
        lowCount,
        total,
        timeframe,
      },
    });
  }
  
  /**
   * Log quando nenhum Swing Point é encontrado
   */
  async logNoSwingPoints(symbol: string, candleCount: number, timeframe: string): Promise<void> {
    const message = `⚠️ SWING POINTS | ${symbol} | Nenhum encontrado em ${candleCount} candles ${timeframe}`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log("WARN", "ANALYSIS", message, {
      symbol,
      data: {
        category: "SMC_SWING",
        candleCount,
        timeframe,
        issue: "NO_SWINGS_FOUND",
      },
      forceLog: true,
    });
  }
  
  // ============= LOGS DE SWEEP =============
  
  /**
   * Log de Sweep detectado
   */
  async logSweepDetected(symbol: string, data: SweepLogData): Promise<void> {
    const emoji = data.type === "HIGH" ? "⚡" : "💥";
    const direction = data.type === "HIGH" ? "TOPO" : "FUNDO";
    const method = data.detectionMethod === "REALTIME" ? "AO VIVO" : "CANDLE FECHADO";
    
    const message = `${emoji} SWEEP ${direction} (${method}) | ${symbol} | Nível: ${data.swingPrice.toFixed(5)} | Preço: ${data.currentPrice.toFixed(5)} | Excedeu: ${data.exceedPips.toFixed(1)} pips`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log("INFO", "ANALYSIS", message, {
      symbol,
      signal: data.type === "HIGH" ? "SELL_SETUP" : "BUY_SETUP",
      data: {
        category: "SMC_SWEEP",
        ...data,
      },
      forceLog: true,
    });
  }
  
  /**
   * Log de Sweep não detectado (status)
   */
  async logSweepStatus(symbol: string, lastSweepType: string | null, sweepConfirmed: boolean): Promise<void> {
    if (!this.verboseLogging) return;
    
    const status = sweepConfirmed ? "✅ CONFIRMADO" : "⏳ AGUARDANDO";
    const message = `🔍 SWEEP STATUS | ${symbol} | ${status} | Tipo: ${lastSweepType || 'NENHUM'}`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log("INFO", "ANALYSIS", message, {
      symbol,
      data: {
        category: "SMC_SWEEP",
        lastSweepType,
        sweepConfirmed,
      },
    });
  }
  
  // ============= LOGS DE CHoCH =============
  
  /**
   * Log de CHoCH detectado
   */
  async logCHoCHDetected(symbol: string, data: CHoCHLogData): Promise<void> {
    const emoji = data.direction === "BULLISH" ? "🟢" : "🔴";
    const message = `${emoji} CHoCH ${data.direction} CONFIRMADO (${data.breakType}) | ${symbol} | Swing: ${data.swingPrice.toFixed(5)} | Movimento: ${data.movementPips.toFixed(1)} pips (min: ${data.minRequired} pips)`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log("INFO", "ANALYSIS", message, {
      symbol,
      signal: data.direction === "BULLISH" ? "BUY" : "SELL",
      data: {
        category: "SMC_CHOCH",
        ...data,
      },
      forceLog: true,
    });
  }
  
  /**
   * Log de CHoCH rejeitado
   */
  async logCHoCHRejected(symbol: string, reason: string, details: Record<string, unknown>): Promise<void> {
    if (!this.verboseLogging) return;
    
    const message = `❌ CHoCH REJEITADO | ${symbol} | ${reason}`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log("INFO", "ANALYSIS", message, {
      symbol,
      data: {
        category: "SMC_CHOCH",
        rejected: true,
        reason,
        ...details,
      },
    });
  }
  
  // ============= LOGS DE ORDER BLOCK =============
  
  /**
   * Log de Order Block identificado
   */
  async logOrderBlockIdentified(symbol: string, data: OrderBlockLogData): Promise<void> {
    const emoji = data.direction === "BULLISH" ? "🟩" : "🟥";
    const message = `${emoji} ORDER BLOCK ${data.direction} | ${symbol} | Range: ${data.high.toFixed(5)} - ${data.low.toFixed(5)}`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log("INFO", "ANALYSIS", message, {
      symbol,
      signal: data.direction === "BULLISH" ? "BUY" : "SELL",
      data: {
        category: "SMC_OB",
        ...data,
      },
      forceLog: true,
    });
  }
  
  /**
   * Log de Order Block não encontrado
   */
  async logOrderBlockNotFound(symbol: string, direction: string): Promise<void> {
    const message = `⚠️ ORDER BLOCK | ${symbol} | Não encontrado para ${direction}`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log("WARN", "ANALYSIS", message, {
      symbol,
      data: {
        category: "SMC_OB",
        direction,
        found: false,
      },
    });
  }
  
  /**
   * Log de Order Block invalidado
   */
  async logOrderBlockInvalidated(symbol: string, reason: string): Promise<void> {
    const message = `🚫 ORDER BLOCK INVALIDADO | ${symbol} | ${reason}`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log("WARN", "ANALYSIS", message, {
      symbol,
      data: {
        category: "SMC_OB",
        invalidated: true,
        reason,
      },
      forceLog: true,
    });
  }
  
  // ============= LOGS DE ENTRADA =============
  
  /**
   * Log de condição de entrada verificada
   */
  async logEntryConditionCheck(symbol: string, inZone: boolean, currentPrice: number, obHigh: number, obLow: number): Promise<void> {
    if (!this.verboseLogging) return;
    
    const status = inZone ? "✅ NA ZONA" : "⏳ FORA DA ZONA";
    const message = `🎯 ENTRY CHECK | ${symbol} | ${status} | Preço: ${currentPrice.toFixed(5)} | OB: ${obHigh.toFixed(5)} - ${obLow.toFixed(5)}`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log("INFO", "ANALYSIS", message, {
      symbol,
      data: {
        category: "SMC_ENTRY",
        inZone,
        currentPrice,
        obHigh,
        obLow,
      },
    });
  }
  
  /**
   * Log de entrada confirmada
   */
  async logEntryConfirmed(symbol: string, data: EntryLogData): Promise<void> {
    const emoji = data.direction === "BUY" ? "🟢" : "🔴";
    const message = `${emoji} ENTRADA ${data.direction} CONFIRMADA | ${symbol} @ ${data.price.toFixed(5)} | Confirmação: ${data.confirmationType}`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log("INFO", "TRADE", message, {
      symbol,
      signal: data.direction,
      data: {
        category: "SMC_ENTRY",
        confirmed: true,
        ...data,
      },
      forceLog: true,
    });
  }
  
  /**
   * Log de entrada rejeitada
   */
  async logEntryRejected(symbol: string, direction: string, reason: string, details: Record<string, unknown>): Promise<void> {
    if (!this.verboseLogging) return;
    
    const message = `❌ ENTRADA ${direction} REJEITADA | ${symbol} | ${reason}`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log("INFO", "ANALYSIS", message, {
      symbol,
      data: {
        category: "SMC_ENTRY",
        confirmed: false,
        direction,
        reason,
        ...details,
      },
    });
  }
  
  // ============= LOGS DE SINAL =============
  
  /**
   * Log de sinal gerado
   */
  async logSignalGenerated(symbol: string, signal: string, confidence: number, reason: string): Promise<void> {
    const emoji = signal === "BUY" ? "🟢" : signal === "SELL" ? "🔴" : "⚪";
    const message = `${emoji} SINAL ${signal} | ${symbol} | Confiança: ${confidence}% | ${reason}`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log("INFO", "ANALYSIS", message, {
      symbol,
      signal,
      data: {
        category: "SMC_SIGNAL",
        confidence,
        reason,
      },
      forceLog: signal !== "NONE",
    });
  }
  
  /**
   * Log de nenhum sinal
   */
  async logNoSignal(symbol: string, reason: string): Promise<void> {
    if (!this.verboseLogging) return;
    
    const message = `⚪ SEM SINAL | ${symbol} | ${reason}`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log("INFO", "ANALYSIS", message, {
      symbol,
      signal: "NONE",
      data: {
        category: "SMC_SIGNAL",
        reason,
      },
    });
  }
  
  // ============= LOGS DE FILTROS =============
  
  /**
   * Log de filtro aplicado
   */
  async logFilterApplied(symbol: string, data: FilterLogData): Promise<void> {
    const emoji = data.blocked ? "🚫" : "✅";
    const status = data.blocked ? "BLOQUEADO" : "PASSOU";
    const message = `${emoji} FILTRO ${data.filterName} | ${symbol} | ${status} | ${data.reason}`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log(data.blocked ? "WARN" : "INFO", "ANALYSIS", message, {
      symbol,
      data: {
        category: "SMC_FILTER",
        ...data,
      },
      forceLog: data.blocked,
    });
  }
  
  /**
   * Log de filtro de spread
   */
  async logSpreadFilter(symbol: string, currentSpread: number, maxSpread: number, blocked: boolean): Promise<void> {
    await this.logFilterApplied(symbol, {
      filterName: "SPREAD",
      reason: blocked 
        ? `Spread ${currentSpread.toFixed(1)} pips > máx ${maxSpread} pips`
        : `Spread ${currentSpread.toFixed(1)} pips OK (máx: ${maxSpread} pips)`,
      currentValue: currentSpread,
      threshold: maxSpread,
      blocked,
    });
  }
  
  /**
   * Log de filtro de sessão
   */
  async logSessionFilter(symbol: string, currentTime: string, sessionActive: boolean, sessionName: string): Promise<void> {
    await this.logFilterApplied(symbol, {
      filterName: "SESSION",
      reason: sessionActive 
        ? `Sessão ${sessionName} ativa (${currentTime})`
        : `Fora do horário de trading (${currentTime})`,
      currentValue: currentTime,
      threshold: sessionName,
      blocked: !sessionActive,
    });
  }
  
  /**
   * Log de filtro de cooldown
   */
  async logCooldownFilter(symbol: string, remainingSeconds: number): Promise<void> {
    await this.logFilterApplied(symbol, {
      filterName: "COOLDOWN",
      reason: `Aguardando ${remainingSeconds}s para próxima operação`,
      currentValue: remainingSeconds,
      blocked: true,
    });
  }
  
  /**
   * Log de filtro de posições máximas
   */
  async logMaxPositionsFilter(symbol: string, currentPositions: number, maxPositions: number): Promise<void> {
    const blocked = currentPositions >= maxPositions;
    await this.logFilterApplied(symbol, {
      filterName: "MAX_POSITIONS",
      reason: blocked
        ? `Limite de posições atingido (${currentPositions}/${maxPositions})`
        : `Posições: ${currentPositions}/${maxPositions}`,
      currentValue: currentPositions,
      threshold: maxPositions,
      blocked,
    });
  }
  
  // ============= LOGS DE ESTADO =============
  
  /**
   * Log do estado atual da estratégia para um símbolo
   */
  async logCurrentState(symbol: string, data: SMCStateLogData): Promise<void> {
    if (!this.verboseLogging) return;
    
    const sweepStatus = data.sweepConfirmed ? `✅ ${data.lastSweepType}` : "⏳ Aguardando";
    const chochStatus = data.chochDetected ? `✅ ${data.chochDirection}` : "⏳ Aguardando";
    const obStatus = data.activeOrderBlock ? "✅ Ativo" : "❌ Nenhum";
    const entryStatus = data.readyForEntry ? `✅ ${data.entryDirection}` : "⏳ Aguardando";
    
    const message = `📊 ESTADO SMC | ${symbol} | Swings: H${data.swingHighs}/L${data.swingLows} | Sweep: ${sweepStatus} | CHoCH: ${chochStatus} | OB: ${obStatus} | Entry: ${entryStatus}`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log("INFO", "ANALYSIS", message, {
      symbol,
      data: {
        category: "SMC_STATE",
        ...data,
      },
    });
  }
  
  /**
   * Log do pipeline SMC completo
   */
  async logPipelineStatus(symbol: string, step: string, status: string, details?: Record<string, unknown>): Promise<void> {
    const emoji = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⏳";
    const message = `${emoji} PIPELINE | ${symbol} | ${step}: ${status}`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log("INFO", "ANALYSIS", message, {
      symbol,
      data: {
        category: "SMC_PIPELINE",
        step,
        status,
        ...details,
      },
    });
  }
  
  // ============= LOGS DE ERRO =============
  
  /**
   * Log de erro
   */
  async logError(symbol: string, error: string, details?: Record<string, unknown>): Promise<void> {
    const message = `❌ ERRO | ${symbol} | ${error}`;
    console.error(`[SMCStrategy] ${message}`);
    
    await this.log("ERROR", "SYSTEM", message, {
      symbol,
      data: {
        category: "SMC_ERROR",
        error,
        ...details,
      },
      forceLog: true,
    });
  }
  
  /**
   * Log de dados insuficientes
   */
  async logInsufficientData(symbol: string, h1Count: number, m15Count: number, m5Count: number, required: { h1: number; m15: number; m5: number }): Promise<void> {
    const message = `⚠️ DADOS INSUFICIENTES | ${symbol} | H1: ${h1Count}/${required.h1} | M15: ${m15Count}/${required.m15} | M5: ${m5Count}/${required.m5}`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log("WARN", "SYSTEM", message, {
      symbol,
      data: {
        category: "SMC_ERROR",
        issue: "INSUFFICIENT_DATA",
        current: { h1: h1Count, m15: m15Count, m5: m5Count },
        required,
      },
    });
  }
  
  // ============= LOGS DE TRADE =============
  
  /**
   * Log de trade executado
   */
  async logTradeExecuted(
    symbol: string,
    direction: string,
    price: number,
    lots: number,
    stopLoss: number,
    takeProfit: number,
    reason: string
  ): Promise<void> {
    const emoji = direction === "BUY" ? "🟢" : "🔴";
    const message = `${emoji} TRADE EXECUTADO | ${symbol} ${direction} @ ${price.toFixed(5)} | Lotes: ${lots} | SL: ${stopLoss.toFixed(5)} | TP: ${takeProfit.toFixed(5)} | ${reason}`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log("INFO", "TRADE", message, {
      symbol,
      signal: direction,
      data: {
        category: "SMC_TRADE",
        action: "OPEN",
        price,
        lots,
        stopLoss,
        takeProfit,
        reason,
      },
      forceLog: true,
    });
  }
  
  /**
   * Log de trade fechado
   */
  async logTradeClosed(
    symbol: string,
    direction: string,
    entryPrice: number,
    exitPrice: number,
    pnl: number,
    reason: string
  ): Promise<void> {
    const pnlEmoji = pnl >= 0 ? "🟢" : "🔴";
    const message = `${pnlEmoji} TRADE FECHADO | ${symbol} ${direction} | Entry: ${entryPrice.toFixed(5)} → Exit: ${exitPrice.toFixed(5)} | PnL: $${pnl.toFixed(2)} | ${reason}`;
    console.log(`[SMCStrategy] ${message}`);
    
    await this.log("INFO", "TRADE", message, {
      symbol,
      signal: direction,
      data: {
        category: "SMC_TRADE",
        action: "CLOSE",
        entryPrice,
        exitPrice,
        pnl,
        reason,
      },
      forceLog: true,
    });
  }
}

/**
 * Factory function para criar logger SMC
 */
export function createSMCStrategyLogger(userId: number, botId: number, verboseLogging: boolean = true): SMCStrategyLogger {
  return new SMCStrategyLogger(userId, botId, verboseLogging);
}
