/**
 * Ledger - Livro de Registro de Posições e Equity Global
 * 
 * IMPLEMENTAÇÃO WP6: Multi-Asset com relógio global (institucional)
 * 
 * Implementa tracking centralizado de:
 * - Posições abertas por símbolo
 * - Equity global consolidada
 * - Histórico de transações
 * - Métricas de portfólio em tempo real
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.1.0
 * 
 * CORREÇÃO HANDOVER: Substituição de console.log por LabLogger
 */

import { BacktestTrade } from "../types/backtest.types";
import { multiAssetLogger } from "../utils/LabLogger";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Posição aberta
 */
export interface OpenPosition {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  currentPrice: number;
  size: number;
  openTimestamp: number;
  unrealizedPnL: number;
  margin: number;
}

/**
 * Transação registrada
 */
export interface LedgerTransaction {
  id: string;
  timestamp: number;
  type: "OPEN" | "CLOSE" | "DEPOSIT" | "WITHDRAWAL" | "COMMISSION" | "SWAP";
  symbol?: string;
  amount: number;
  balance: number;
  equity: number;
  description: string;
}

/**
 * Snapshot do estado do ledger
 */
export interface LedgerSnapshot {
  timestamp: number;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  unrealizedPnL: number;
  openPositions: number;
  positionsBySymbol: Record<string, number>;
}

/**
 * Configuração do ledger
 */
export interface LedgerConfig {
  initialBalance: number;
  leverage: number;
  marginCallLevel: number; // % (ex: 100 = margin call quando equity = margin)
  stopOutLevel: number; // % (ex: 50 = stop out quando equity = 50% margin)
}

// ============================================================================
// LEDGER CLASS
// ============================================================================

export class Ledger {
  private config: LedgerConfig;
  
  // Estado atual
  private balance: number;
  private positions: Map<string, OpenPosition> = new Map();
  private transactions: LedgerTransaction[] = [];
  private closedTrades: BacktestTrade[] = [];
  
  // Histórico
  private equityCurve: { timestamp: number; equity: number }[] = [];
  private snapshots: LedgerSnapshot[] = [];
  
  // Contadores
  private transactionCounter: number = 0;
  private positionCounter: number = 0;
  
  constructor(config: LedgerConfig) {
    this.config = config;
    this.balance = config.initialBalance;
    
    // Registrar depósito inicial
    this.recordTransaction({
      type: "DEPOSIT",
      amount: config.initialBalance,
      description: "Saldo inicial",
    });
    
    multiAssetLogger.debug(`Inicializado com saldo: $${config.initialBalance}`, "Ledger");
  }
  
  /**
   * Obter saldo atual
   */
  getBalance(): number {
    return this.balance;
  }
  
  /**
   * Obter equity atual (saldo + PnL não realizado)
   */
  getEquity(): number {
    const unrealizedPnL = this.getUnrealizedPnL();
    return this.balance + unrealizedPnL;
  }
  
  /**
   * Obter PnL não realizado total
   */
  getUnrealizedPnL(): number {
    let total = 0;
    for (const position of this.positions.values()) {
      total += position.unrealizedPnL;
    }
    return total;
  }
  
  /**
   * Obter margem utilizada
   */
  getUsedMargin(): number {
    let total = 0;
    for (const position of this.positions.values()) {
      total += position.margin;
    }
    return total;
  }
  
  /**
   * Obter margem livre
   */
  getFreeMargin(): number {
    return this.getEquity() - this.getUsedMargin();
  }
  
  /**
   * Obter nível de margem (%)
   */
  getMarginLevel(): number {
    const usedMargin = this.getUsedMargin();
    if (usedMargin === 0) return Infinity;
    return (this.getEquity() / usedMargin) * 100;
  }
  
  /**
   * Verificar se pode abrir nova posição
   */
  canOpenPosition(requiredMargin: number): boolean {
    return this.getFreeMargin() >= requiredMargin;
  }
  
  /**
   * Verificar margin call
   */
  isMarginCall(): boolean {
    return this.getMarginLevel() <= this.config.marginCallLevel;
  }
  
  /**
   * Verificar stop out
   */
  isStopOut(): boolean {
    return this.getMarginLevel() <= this.config.stopOutLevel;
  }
  
  /**
   * Abrir posição
   */
  openPosition(
    symbol: string,
    direction: "LONG" | "SHORT",
    entryPrice: number,
    size: number,
    timestamp: number
  ): OpenPosition | null {
    // Calcular margem necessária
    const notionalValue = entryPrice * size;
    const requiredMargin = notionalValue / this.config.leverage;
    
    // Verificar margem disponível
    if (!this.canOpenPosition(requiredMargin)) {
      multiAssetLogger.warn(`Margem insuficiente para abrir posição em ${symbol}`, "Ledger");
      return null;
    }
    
    // Criar posição
    const positionId = `pos-${++this.positionCounter}`;
    const position: OpenPosition = {
      id: positionId,
      symbol,
      direction,
      entryPrice,
      currentPrice: entryPrice,
      size,
      openTimestamp: timestamp,
      unrealizedPnL: 0,
      margin: requiredMargin,
    };
    
    this.positions.set(positionId, position);
    
    // Registrar transação
    this.recordTransaction({
      type: "OPEN",
      symbol,
      amount: 0,
      description: `Abrir ${direction} ${size} ${symbol} @ ${entryPrice}`,
      timestamp,
    });
    
    multiAssetLogger.debug(`Posição aberta: ${positionId} - ${direction} ${size} ${symbol} @ ${entryPrice}`, "Ledger");
    
    return position;
  }
  
  /**
   * Atualizar preço de posição
   */
  updatePositionPrice(positionId: string, currentPrice: number): void {
    const position = this.positions.get(positionId);
    if (!position) return;
    
    position.currentPrice = currentPrice;
    
    // Calcular PnL não realizado
    const priceDiff = currentPrice - position.entryPrice;
    const multiplier = position.direction === "LONG" ? 1 : -1;
    position.unrealizedPnL = priceDiff * position.size * multiplier;
  }
  
  /**
   * Atualizar preços de todas as posições de um símbolo
   */
  updateSymbolPrice(symbol: string, currentPrice: number): void {
    for (const position of this.positions.values()) {
      if (position.symbol === symbol) {
        this.updatePositionPrice(position.id, currentPrice);
      }
    }
  }
  
  /**
   * Fechar posição
   */
  closePosition(
    positionId: string,
    closePrice: number,
    timestamp: number,
    commission: number = 0
  ): BacktestTrade | null {
    const position = this.positions.get(positionId);
    if (!position) {
      multiAssetLogger.warn(`Posição não encontrada: ${positionId}`, "Ledger");
      return null;
    }
    
    // Calcular PnL realizado
    const priceDiff = closePrice - position.entryPrice;
    const multiplier = position.direction === "LONG" ? 1 : -1;
    const grossPnL = priceDiff * position.size * multiplier;
    const netPnL = grossPnL - commission;
    
    // Atualizar saldo
    this.balance += netPnL;
    
    // Criar trade fechado
    const trade: BacktestTrade = {
      id: position.id,
      symbol: position.symbol,
      direction: position.direction,
      entryPrice: position.entryPrice,
      exitPrice: closePrice,
      size: position.size,
      openTimestamp: position.openTimestamp,
      closeTimestamp: timestamp,
      profit: netPnL,
      commission,
      pips: Math.abs(priceDiff) * 10000, // Aproximação para forex
    };
    
    this.closedTrades.push(trade);
    
    // Remover posição
    this.positions.delete(positionId);
    
    // Registrar transação
    this.recordTransaction({
      type: "CLOSE",
      symbol: position.symbol,
      amount: netPnL,
      description: `Fechar ${position.direction} ${position.size} ${position.symbol} @ ${closePrice} (PnL: ${netPnL.toFixed(2)})`,
      timestamp,
    });
    
    // Registrar comissão se houver
    if (commission > 0) {
      this.recordTransaction({
        type: "COMMISSION",
        symbol: position.symbol,
        amount: -commission,
        description: `Comissão para ${position.symbol}`,
        timestamp,
      });
    }
    
    multiAssetLogger.debug(`Posição fechada: ${positionId} - PnL: $${netPnL.toFixed(2)}`, "Ledger");
    
    return trade;
  }
  
  /**
   * Obter posições abertas
   */
  getOpenPositions(): OpenPosition[] {
    return Array.from(this.positions.values());
  }
  
  /**
   * Obter posições abertas por símbolo
   */
  getPositionsBySymbol(symbol: string): OpenPosition[] {
    return Array.from(this.positions.values()).filter(p => p.symbol === symbol);
  }
  
  /**
   * Obter número de posições abertas
   */
  getOpenPositionCount(): number {
    return this.positions.size;
  }
  
  /**
   * Obter número de posições por símbolo
   */
  getPositionCountBySymbol(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const position of this.positions.values()) {
      counts[position.symbol] = (counts[position.symbol] || 0) + 1;
    }
    return counts;
  }
  
  /**
   * Obter trades fechados
   */
  getClosedTrades(): BacktestTrade[] {
    return [...this.closedTrades];
  }
  
  /**
   * Registrar transação
   */
  private recordTransaction(params: {
    type: LedgerTransaction["type"];
    symbol?: string;
    amount: number;
    description: string;
    timestamp?: number;
  }): void {
    const transaction: LedgerTransaction = {
      id: `tx-${++this.transactionCounter}`,
      timestamp: params.timestamp || Date.now(),
      type: params.type,
      symbol: params.symbol,
      amount: params.amount,
      balance: this.balance,
      equity: this.getEquity(),
      description: params.description,
    };
    
    this.transactions.push(transaction);
  }
  
  /**
   * Registrar snapshot do estado atual
   */
  recordSnapshot(timestamp: number): void {
    const snapshot: LedgerSnapshot = {
      timestamp,
      balance: this.balance,
      equity: this.getEquity(),
      margin: this.getUsedMargin(),
      freeMargin: this.getFreeMargin(),
      marginLevel: this.getMarginLevel(),
      unrealizedPnL: this.getUnrealizedPnL(),
      openPositions: this.positions.size,
      positionsBySymbol: this.getPositionCountBySymbol(),
    };
    
    this.snapshots.push(snapshot);
    this.equityCurve.push({ timestamp, equity: snapshot.equity });
  }
  
  /**
   * Obter curva de equity
   */
  getEquityCurve(): { timestamp: number; equity: number }[] {
    return [...this.equityCurve];
  }
  
  /**
   * Obter histórico de transações
   */
  getTransactions(): LedgerTransaction[] {
    return [...this.transactions];
  }
  
  /**
   * Obter snapshots
   */
  getSnapshots(): LedgerSnapshot[] {
    return [...this.snapshots];
  }
  
  /**
   * Obter resumo do ledger
   */
  getSummary(): {
    initialBalance: number;
    currentBalance: number;
    currentEquity: number;
    totalPnL: number;
    totalTrades: number;
    openPositions: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
  } {
    const winningTrades = this.closedTrades.filter(t => t.profit > 0).length;
    const losingTrades = this.closedTrades.filter(t => t.profit < 0).length;
    
    return {
      initialBalance: this.config.initialBalance,
      currentBalance: this.balance,
      currentEquity: this.getEquity(),
      totalPnL: this.balance - this.config.initialBalance,
      totalTrades: this.closedTrades.length,
      openPositions: this.positions.size,
      winningTrades,
      losingTrades,
      winRate: this.closedTrades.length > 0 
        ? (winningTrades / this.closedTrades.length) * 100 
        : 0,
    };
  }
  
  /**
   * Resetar ledger
   */
  reset(): void {
    this.balance = this.config.initialBalance;
    this.positions.clear();
    this.transactions = [];
    this.closedTrades = [];
    this.equityCurve = [];
    this.snapshots = [];
    this.transactionCounter = 0;
    this.positionCounter = 0;
    
    this.recordTransaction({
      type: "DEPOSIT",
      amount: this.config.initialBalance,
      description: "Saldo inicial (reset)",
    });
    
    multiAssetLogger.debug("Ledger resetado", "Ledger");
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Criar ledger
 */
export function createLedger(config: LedgerConfig): Ledger {
  return new Ledger(config);
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_LEDGER_CONFIG: LedgerConfig = {
  initialBalance: 10000,
  leverage: 500,
  marginCallLevel: 100,
  stopOutLevel: 50,
};

// ============================================================================
// EXPORTS
// ============================================================================

export default Ledger;
