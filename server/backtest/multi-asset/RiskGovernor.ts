/**
 * RiskGovernor - Governador de Risco Global
 * 
 * IMPLEMENTAÇÃO WP6: Multi-Asset com relógio global (institucional)
 * 
 * Implementa controle de limites globais ANTES de enviar ordens:
 * - Limite de posições totais
 * - Limite de posições por símbolo
 * - Limite de exposição por correlação
 * - Limite de drawdown diário
 * - Limite de risco por trade
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.1.0
 * 
 * CORREÇÃO HANDOVER: Substituição de console.log por LabLogger
 */

import { Ledger, OpenPosition } from "./Ledger";
import { multiAssetLogger } from "../utils/LabLogger";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuração do governador de risco
 */
export interface RiskGovernorConfig {
  /** Máximo de posições abertas totais */
  maxTotalPositions: number;
  /** Máximo de posições por símbolo */
  maxPositionsPerSymbol: number;
  /** Máximo de exposição por grupo correlacionado (%) */
  maxCorrelatedExposure: number;
  /** Drawdown diário máximo (%) */
  maxDailyDrawdown: number;
  /** Risco máximo por trade (% do equity) */
  maxRiskPerTrade: number;
  /** Exposição máxima total (% do equity) */
  maxTotalExposure: number;
  /** Grupos de correlação (símbolos correlacionados) */
  correlationGroups: string[][];
}

/**
 * Resultado da validação de risco
 */
export interface RiskValidationResult {
  allowed: boolean;
  reason?: string;
  riskScore: number; // 0-100 (0 = sem risco, 100 = risco máximo)
  warnings: string[];
}

/**
 * Proposta de ordem para validação
 */
export interface OrderProposal {
  symbol: string;
  direction: "LONG" | "SHORT";
  size: number;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
}

/**
 * Estado do risco atual
 */
export interface RiskState {
  totalPositions: number;
  positionsBySymbol: Record<string, number>;
  totalExposure: number;
  exposureBySymbol: Record<string, number>;
  dailyPnL: number;
  dailyDrawdown: number;
  riskScore: number;
  warnings: string[];
}

// ============================================================================
// RISK GOVERNOR CLASS
// ============================================================================

export class RiskGovernor {
  private config: RiskGovernorConfig;
  private ledger: Ledger;
  
  // Estado diário
  private dayStartEquity: number = 0;
  private currentDay: string = "";
  
  // Histórico de violações
  private violations: { timestamp: number; type: string; message: string }[] = [];
  
  constructor(config: RiskGovernorConfig, ledger: Ledger) {
    this.config = config;
    this.ledger = ledger;
    
    this.dayStartEquity = ledger.getEquity();
    this.currentDay = this.getDateString(Date.now());
    
    multiAssetLogger.debug(`Inicializado - Max posições: ${config.maxTotalPositions}, Max por símbolo: ${config.maxPositionsPerSymbol}, Max DD diário: ${config.maxDailyDrawdown}%`, "RiskGovernor");
  }
  
  /**
   * Validar proposta de ordem
   * 
   * Este método DEVE ser chamado ANTES de enviar qualquer ordem.
   * Retorna se a ordem é permitida e o motivo caso não seja.
   */
  validateOrder(proposal: OrderProposal, timestamp: number): RiskValidationResult {
    const warnings: string[] = [];
    let riskScore = 0;
    
    // Atualizar dia se necessário
    this.updateDay(timestamp);
    
    // 1. Verificar limite de posições totais
    const totalPositions = this.ledger.getOpenPositionCount();
    if (totalPositions >= this.config.maxTotalPositions) {
      this.recordViolation(timestamp, "MAX_POSITIONS", 
        `Limite de ${this.config.maxTotalPositions} posições atingido`);
      return {
        allowed: false,
        reason: `Limite de posições totais atingido (${totalPositions}/${this.config.maxTotalPositions})`,
        riskScore: 100,
        warnings,
      };
    }
    riskScore += (totalPositions / this.config.maxTotalPositions) * 20;
    
    // 2. Verificar limite de posições por símbolo
    const symbolPositions = this.ledger.getPositionsBySymbol(proposal.symbol).length;
    if (symbolPositions >= this.config.maxPositionsPerSymbol) {
      this.recordViolation(timestamp, "MAX_SYMBOL_POSITIONS",
        `Limite de ${this.config.maxPositionsPerSymbol} posições para ${proposal.symbol} atingido`);
      return {
        allowed: false,
        reason: `Limite de posições para ${proposal.symbol} atingido (${symbolPositions}/${this.config.maxPositionsPerSymbol})`,
        riskScore: 100,
        warnings,
      };
    }
    riskScore += (symbolPositions / this.config.maxPositionsPerSymbol) * 15;
    
    // 3. Verificar drawdown diário
    const dailyDrawdown = this.calculateDailyDrawdown();
    if (dailyDrawdown >= this.config.maxDailyDrawdown) {
      this.recordViolation(timestamp, "MAX_DAILY_DD",
        `Drawdown diário de ${dailyDrawdown.toFixed(2)}% excede limite de ${this.config.maxDailyDrawdown}%`);
      return {
        allowed: false,
        reason: `Drawdown diário máximo atingido (${dailyDrawdown.toFixed(2)}%/${this.config.maxDailyDrawdown}%)`,
        riskScore: 100,
        warnings,
      };
    }
    if (dailyDrawdown > this.config.maxDailyDrawdown * 0.7) {
      warnings.push(`Drawdown diário em ${dailyDrawdown.toFixed(2)}% (limite: ${this.config.maxDailyDrawdown}%)`);
    }
    riskScore += (dailyDrawdown / this.config.maxDailyDrawdown) * 25;
    
    // 4. Verificar risco por trade
    const tradeRisk = this.calculateTradeRisk(proposal);
    if (tradeRisk > this.config.maxRiskPerTrade) {
      this.recordViolation(timestamp, "MAX_TRADE_RISK",
        `Risco do trade de ${tradeRisk.toFixed(2)}% excede limite de ${this.config.maxRiskPerTrade}%`);
      return {
        allowed: false,
        reason: `Risco por trade excede limite (${tradeRisk.toFixed(2)}%/${this.config.maxRiskPerTrade}%)`,
        riskScore: 100,
        warnings,
      };
    }
    riskScore += (tradeRisk / this.config.maxRiskPerTrade) * 20;
    
    // 5. Verificar exposição total
    const currentExposure = this.calculateTotalExposure();
    const newExposure = currentExposure + this.calculateOrderExposure(proposal);
    if (newExposure > this.config.maxTotalExposure) {
      this.recordViolation(timestamp, "MAX_EXPOSURE",
        `Exposição total de ${newExposure.toFixed(2)}% excede limite de ${this.config.maxTotalExposure}%`);
      return {
        allowed: false,
        reason: `Exposição total excede limite (${newExposure.toFixed(2)}%/${this.config.maxTotalExposure}%)`,
        riskScore: 100,
        warnings,
      };
    }
    if (newExposure > this.config.maxTotalExposure * 0.8) {
      warnings.push(`Exposição total em ${newExposure.toFixed(2)}% (limite: ${this.config.maxTotalExposure}%)`);
    }
    riskScore += (newExposure / this.config.maxTotalExposure) * 10;
    
    // 6. Verificar exposição correlacionada
    const correlatedExposure = this.calculateCorrelatedExposure(proposal);
    if (correlatedExposure > this.config.maxCorrelatedExposure) {
      warnings.push(`Exposição correlacionada alta: ${correlatedExposure.toFixed(2)}%`);
      riskScore += 10;
    }
    
    // Normalizar risk score
    riskScore = Math.min(100, riskScore);
    
    return {
      allowed: true,
      riskScore,
      warnings,
    };
  }
  
  /**
   * Obter estado atual do risco
   */
  getRiskState(): RiskState {
    const positions = this.ledger.getOpenPositions();
    const positionsBySymbol = this.ledger.getPositionCountBySymbol();
    
    const exposureBySymbol: Record<string, number> = {};
    for (const position of positions) {
      const exposure = (position.currentPrice * position.size) / this.ledger.getEquity() * 100;
      exposureBySymbol[position.symbol] = (exposureBySymbol[position.symbol] || 0) + exposure;
    }
    
    const warnings: string[] = [];
    const dailyDrawdown = this.calculateDailyDrawdown();
    const totalExposure = this.calculateTotalExposure();
    
    if (dailyDrawdown > this.config.maxDailyDrawdown * 0.5) {
      warnings.push(`Drawdown diário: ${dailyDrawdown.toFixed(2)}%`);
    }
    if (totalExposure > this.config.maxTotalExposure * 0.7) {
      warnings.push(`Exposição total: ${totalExposure.toFixed(2)}%`);
    }
    if (positions.length > this.config.maxTotalPositions * 0.8) {
      warnings.push(`Posições: ${positions.length}/${this.config.maxTotalPositions}`);
    }
    
    const riskScore = this.calculateOverallRiskScore();
    
    return {
      totalPositions: positions.length,
      positionsBySymbol,
      totalExposure,
      exposureBySymbol,
      dailyPnL: this.calculateDailyPnL(),
      dailyDrawdown,
      riskScore,
      warnings,
    };
  }
  
  /**
   * Calcular drawdown diário
   */
  private calculateDailyDrawdown(): number {
    const currentEquity = this.ledger.getEquity();
    if (this.dayStartEquity === 0) return 0;
    
    const drawdown = ((this.dayStartEquity - currentEquity) / this.dayStartEquity) * 100;
    return Math.max(0, drawdown);
  }
  
  /**
   * Calcular PnL diário
   */
  private calculateDailyPnL(): number {
    return this.ledger.getEquity() - this.dayStartEquity;
  }
  
  /**
   * Calcular risco de um trade
   */
  private calculateTradeRisk(proposal: OrderProposal): number {
    const equity = this.ledger.getEquity();
    if (equity === 0) return 100;
    
    if (proposal.stopLoss) {
      const riskPips = Math.abs(proposal.entryPrice - proposal.stopLoss);
      const riskAmount = riskPips * proposal.size;
      return (riskAmount / equity) * 100;
    }
    
    // Sem stop loss, assumir risco baseado no tamanho da posição
    const notionalValue = proposal.entryPrice * proposal.size;
    return (notionalValue / equity) * 10; // 10% do notional como proxy
  }
  
  /**
   * Calcular exposição de uma ordem
   */
  private calculateOrderExposure(proposal: OrderProposal): number {
    const equity = this.ledger.getEquity();
    if (equity === 0) return 100;
    
    const notionalValue = proposal.entryPrice * proposal.size;
    return (notionalValue / equity) * 100;
  }
  
  /**
   * Calcular exposição total atual
   */
  private calculateTotalExposure(): number {
    const equity = this.ledger.getEquity();
    if (equity === 0) return 0;
    
    let totalNotional = 0;
    for (const position of this.ledger.getOpenPositions()) {
      totalNotional += position.currentPrice * position.size;
    }
    
    return (totalNotional / equity) * 100;
  }
  
  /**
   * Calcular exposição correlacionada
   */
  private calculateCorrelatedExposure(proposal: OrderProposal): number {
    // Encontrar grupo de correlação do símbolo
    const group = this.config.correlationGroups.find(g => g.includes(proposal.symbol));
    if (!group) return 0;
    
    const equity = this.ledger.getEquity();
    if (equity === 0) return 0;
    
    let correlatedNotional = 0;
    
    // Somar exposição de símbolos correlacionados
    for (const position of this.ledger.getOpenPositions()) {
      if (group.includes(position.symbol)) {
        correlatedNotional += position.currentPrice * position.size;
      }
    }
    
    // Adicionar a nova ordem
    correlatedNotional += proposal.entryPrice * proposal.size;
    
    return (correlatedNotional / equity) * 100;
  }
  
  /**
   * Calcular score de risco geral
   */
  private calculateOverallRiskScore(): number {
    let score = 0;
    
    // Componente: posições
    const positionRatio = this.ledger.getOpenPositionCount() / this.config.maxTotalPositions;
    score += positionRatio * 25;
    
    // Componente: drawdown diário
    const ddRatio = this.calculateDailyDrawdown() / this.config.maxDailyDrawdown;
    score += ddRatio * 35;
    
    // Componente: exposição
    const exposureRatio = this.calculateTotalExposure() / this.config.maxTotalExposure;
    score += exposureRatio * 25;
    
    // Componente: margin level
    const marginLevel = this.ledger.getMarginLevel();
    if (marginLevel < 200) {
      score += (200 - marginLevel) / 2;
    }
    
    return Math.min(100, score);
  }
  
  /**
   * Atualizar dia (para tracking de drawdown diário)
   */
  private updateDay(timestamp: number): void {
    const newDay = this.getDateString(timestamp);
    if (newDay !== this.currentDay) {
      this.currentDay = newDay;
      this.dayStartEquity = this.ledger.getEquity();
      multiAssetLogger.debug(`Novo dia: ${newDay}, equity inicial: $${this.dayStartEquity.toFixed(2)}`, "RiskGovernor");
    }
  }
  
  /**
   * Obter string de data (YYYY-MM-DD)
   */
  private getDateString(timestamp: number): string {
    return new Date(timestamp).toISOString().split("T")[0];
  }
  
  /**
   * Registrar violação
   */
  private recordViolation(timestamp: number, type: string, message: string): void {
    this.violations.push({ timestamp, type, message });
    multiAssetLogger.warn(`VIOLAÇÃO: ${type} - ${message}`, "RiskGovernor");
  }
  
  /**
   * Obter histórico de violações
   */
  getViolations(): { timestamp: number; type: string; message: string }[] {
    return [...this.violations];
  }
  
  /**
   * Resetar estado diário
   */
  resetDailyState(): void {
    this.dayStartEquity = this.ledger.getEquity();
    multiAssetLogger.debug("Estado diário resetado", "RiskGovernor");
  }
  
  /**
   * Resetar governador
   */
  reset(): void {
    this.dayStartEquity = this.ledger.getEquity();
    this.currentDay = this.getDateString(Date.now());
    this.violations = [];
    multiAssetLogger.debug("RiskGovernor resetado", "RiskGovernor");
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Criar governador de risco
 */
export function createRiskGovernor(config: RiskGovernorConfig, ledger: Ledger): RiskGovernor {
  return new RiskGovernor(config, ledger);
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_RISK_GOVERNOR_CONFIG: RiskGovernorConfig = {
  maxTotalPositions: 10,
  maxPositionsPerSymbol: 3,
  maxCorrelatedExposure: 50,
  maxDailyDrawdown: 5,
  maxRiskPerTrade: 2,
  maxTotalExposure: 100,
  correlationGroups: [
    ["EURUSD", "GBPUSD", "AUDUSD"], // Majors correlacionados
    ["USDJPY", "EURJPY", "GBPJPY"], // Pares JPY
    ["XAUUSD", "XAGUSD"], // Metais
  ],
};

// ============================================================================
// EXPORTS
// ============================================================================

export default RiskGovernor;
