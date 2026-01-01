/**
 * Risk Manager - Gestão de Risco Dinâmica
 * 
 * Gerencia todos os aspectos de risco do trading:
 * - Cálculo de tamanho de posição baseado em % do equity
 * - Circuit breakers (limite de perda diária)
 * - Limite de trades simultâneos
 * - Filtro de horário de operação
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 */

import { getDb } from "../../db";
import { smcStrategyConfig, forexPositions } from "../../../drizzle/schema";
import { eq, and, gte, sql } from "drizzle-orm";

/**
 * Configuração do Risk Manager
 */
export interface RiskManagerConfig {
  userId: number;
  botId: number;
  
  // Risco por trade
  riskPercentage: number;
  
  // Limites
  maxOpenTrades: number;
  dailyLossLimitPercent: number;
  
  // Sessões de trading
  sessionFilterEnabled: boolean;
  londonSessionStart: string;
  londonSessionEnd: string;
  nySessionStart: string;
  nySessionEnd: string;
  
  // Circuit breaker
  circuitBreakerEnabled: boolean;
}

/**
 * Estado do Risk Manager
 */
export interface RiskState {
  dailyStartEquity: number;
  currentEquity: number;
  dailyPnL: number;
  dailyPnLPercent: number;
  openTradesCount: number;
  tradingBlocked: boolean;
  blockReason: string | null;
  lastResetDate: string;
}

/**
 * Resultado do cálculo de posição
 */
export interface PositionSizeCalculation {
  lotSize: number;
  riskAmount: number;
  riskPercent: number;
  stopLossPips: number;
  pipValue: number;
  canTrade: boolean;
  reason: string;
}

/**
 * Classe principal de gestão de risco
 */
export class RiskManager {
  private config: RiskManagerConfig;
  private state: RiskState;
  
  constructor(config: RiskManagerConfig) {
    this.config = config;
    this.state = {
      dailyStartEquity: 0,
      currentEquity: 0,
      dailyPnL: 0,
      dailyPnLPercent: 0,
      openTradesCount: 0,
      tradingBlocked: false,
      blockReason: null,
      lastResetDate: this.getTodayDate(),
    };
  }
  
  // ============= MÉTODOS PÚBLICOS =============
  
  /**
   * Inicializa o Risk Manager com dados do banco
   */
  async initialize(currentEquity: number): Promise<void> {
    const today = this.getTodayDate();
    
    // Verificar se precisa resetar o equity diário
    if (this.state.lastResetDate !== today) {
      this.state.dailyStartEquity = currentEquity;
      this.state.lastResetDate = today;
      this.state.tradingBlocked = false;
      this.state.blockReason = null;
      
      // Atualizar no banco de dados
      await this.updateDailyEquityInDB(currentEquity, today);
      
      console.log(`[RiskManager] Novo dia detectado. Equity inicial: $${currentEquity.toFixed(2)}`);
    } else {
      // Carregar equity do banco
      const dbConfig = await this.loadConfigFromDB();
      if (dbConfig?.dailyStartEquity) {
        this.state.dailyStartEquity = Number(dbConfig.dailyStartEquity);
      } else {
        this.state.dailyStartEquity = currentEquity;
      }
      
      this.state.tradingBlocked = dbConfig?.tradingBlockedToday || false;
    }
    
    this.state.currentEquity = currentEquity;
    this.updateDailyPnL();
    
    console.log(`[RiskManager] Inicializado. Equity inicial: $${this.state.dailyStartEquity.toFixed(2)}, Atual: $${currentEquity.toFixed(2)}`);
  }
  
  /**
   * Atualiza o equity atual e verifica circuit breakers
   */
  async updateEquity(currentEquity: number): Promise<void> {
    this.state.currentEquity = currentEquity;
    this.updateDailyPnL();
    
    // Verificar circuit breaker
    if (this.config.circuitBreakerEnabled) {
      await this.checkCircuitBreaker();
    }
  }
  
  /**
   * Verifica se pode abrir nova posição
   */
  async canOpenPosition(): Promise<{ allowed: boolean; reason: string }> {
    // 1. Verificar se trading está bloqueado
    if (this.state.tradingBlocked) {
      return {
        allowed: false,
        reason: this.state.blockReason || "Trading bloqueado pelo circuit breaker",
      };
    }
    
    // 2. Verificar limite de trades abertos
    const openTrades = await this.getOpenTradesCount();
    if (openTrades >= this.config.maxOpenTrades) {
      return {
        allowed: false,
        reason: `Limite de ${this.config.maxOpenTrades} trades simultâneos atingido (${openTrades} abertos)`,
      };
    }
    
    // 3. Verificar filtro de horário
    if (this.config.sessionFilterEnabled && !this.isWithinTradingSession()) {
      return {
        allowed: false,
        reason: "Fora do horário de trading permitido",
      };
    }
    
    // 4. Verificar circuit breaker de perda diária
    if (this.state.dailyPnLPercent <= -this.config.dailyLossLimitPercent) {
      await this.activateCircuitBreaker(`Limite de perda diária atingido: ${this.state.dailyPnLPercent.toFixed(2)}%`);
      return {
        allowed: false,
        reason: `Limite de perda diária de ${this.config.dailyLossLimitPercent}% atingido`,
      };
    }
    
    return { allowed: true, reason: "OK" };
  }
  
  /**
   * Calcula o tamanho da posição baseado no risco
   * 
   * Fórmula:
   * riskAmount = accountBalance * (riskPercentage / 100)
   * lotSize = riskAmount / (stopLossPips * pipValue)
   */
  calculatePositionSize(
    accountBalance: number,
    stopLossPips: number,
    pipValue: number
  ): PositionSizeCalculation {
    // Verificar se pode operar
    if (this.state.tradingBlocked) {
      return {
        lotSize: 0,
        riskAmount: 0,
        riskPercent: 0,
        stopLossPips,
        pipValue,
        canTrade: false,
        reason: this.state.blockReason || "Trading bloqueado",
      };
    }
    
    // Calcular risco em USD
    const riskAmount = accountBalance * (this.config.riskPercentage / 100);
    
    // Calcular tamanho do lote
    // lotSize = riskAmount / (stopLossPips * pipValue * 10)
    // O *10 é porque pipValue geralmente é dado por lote standard
    let lotSize = riskAmount / (stopLossPips * pipValue);
    
    // Arredondar para step de 0.01 (micro lote)
    lotSize = Math.floor(lotSize * 100) / 100;
    
    // Limitar entre 0.01 e 10 lotes
    lotSize = Math.max(0.01, Math.min(10, lotSize));
    
    console.log(`[RiskManager] Cálculo de posição:`);
    console.log(`  - Balance: $${accountBalance.toFixed(2)}`);
    console.log(`  - Risco: ${this.config.riskPercentage}% = $${riskAmount.toFixed(2)}`);
    console.log(`  - SL: ${stopLossPips} pips`);
    console.log(`  - Pip Value: $${pipValue}`);
    console.log(`  - Lote calculado: ${lotSize}`);
    
    return {
      lotSize,
      riskAmount,
      riskPercent: this.config.riskPercentage,
      stopLossPips,
      pipValue,
      canTrade: true,
      reason: "OK",
    };
  }
  
  /**
   * Obtém o estado atual do Risk Manager
   */
  getState(): RiskState {
    return { ...this.state };
  }
  
  /**
   * Atualiza a configuração do Risk Manager
   */
  updateConfig(config: Partial<RiskManagerConfig>): void {
    this.config = { ...this.config, ...config };
    console.log("[RiskManager] Configuração atualizada:", config);
  }
  
  /**
   * Reseta o circuit breaker (para uso administrativo)
   */
  async resetCircuitBreaker(): Promise<void> {
    this.state.tradingBlocked = false;
    this.state.blockReason = null;
    
    await this.updateTradingBlockedInDB(false);
    
    console.log("[RiskManager] Circuit breaker resetado manualmente");
  }
  
  // ============= MÉTODOS PRIVADOS =============
  
  /**
   * Atualiza o PnL diário
   */
  private updateDailyPnL(): void {
    if (this.state.dailyStartEquity > 0) {
      this.state.dailyPnL = this.state.currentEquity - this.state.dailyStartEquity;
      this.state.dailyPnLPercent = (this.state.dailyPnL / this.state.dailyStartEquity) * 100;
    }
  }
  
  /**
   * Verifica e ativa circuit breaker se necessário
   */
  private async checkCircuitBreaker(): Promise<void> {
    if (this.state.tradingBlocked) return;
    
    // Verificar limite de perda diária
    if (this.state.dailyPnLPercent <= -this.config.dailyLossLimitPercent) {
      await this.activateCircuitBreaker(
        `Limite de perda diária de ${this.config.dailyLossLimitPercent}% atingido. ` +
        `PnL atual: ${this.state.dailyPnLPercent.toFixed(2)}%`
      );
    }
  }
  
  /**
   * Ativa o circuit breaker
   */
  private async activateCircuitBreaker(reason: string): Promise<void> {
    this.state.tradingBlocked = true;
    this.state.blockReason = reason;
    
    await this.updateTradingBlockedInDB(true);
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[RiskManager] 🛑 CIRCUIT BREAKER ATIVADO!");
    console.log(`[RiskManager] Motivo: ${reason}`);
    console.log(`[RiskManager] PnL Diário: $${this.state.dailyPnL.toFixed(2)} (${this.state.dailyPnLPercent.toFixed(2)}%)`);
    console.log("[RiskManager] Trading bloqueado até o próximo dia.");
    console.log("═══════════════════════════════════════════════════════════════");
  }
  
  /**
   * Verifica se está dentro do horário de trading
   */
  private isWithinTradingSession(): boolean {
    const now = new Date();
    
    // Converter para horário de Brasília (UTC-3)
    const brasiliaOffset = -3 * 60;
    const localOffset = now.getTimezoneOffset();
    const brasiliaTime = new Date(now.getTime() + (localOffset + brasiliaOffset) * 60000);
    
    const currentHour = brasiliaTime.getHours();
    const currentMinute = brasiliaTime.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;
    
    // Parse horários configurados
    const parseTime = (timeStr: string): number => {
      const [hours, minutes] = timeStr.split(":").map(Number);
      return hours * 60 + minutes;
    };
    
    const londonStart = parseTime(this.config.londonSessionStart);
    const londonEnd = parseTime(this.config.londonSessionEnd);
    const nyStart = parseTime(this.config.nySessionStart);
    const nyEnd = parseTime(this.config.nySessionEnd);
    
    // Verificar se está em alguma sessão
    const inLondon = currentTimeMinutes >= londonStart && currentTimeMinutes <= londonEnd;
    const inNY = currentTimeMinutes >= nyStart && currentTimeMinutes <= nyEnd;
    
    return inLondon || inNY;
  }
  
  /**
   * Obtém a data de hoje no formato YYYY-MM-DD
   */
  private getTodayDate(): string {
    const now = new Date();
    return now.toISOString().split("T")[0];
  }
  
  /**
   * Obtém o número de trades abertos do banco de dados
   */
  private async getOpenTradesCount(): Promise<number> {
    try {
      const db = await getDb();
      if (!db) return 0;
      
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(forexPositions)
        .where(
          and(
            eq(forexPositions.userId, this.config.userId),
            eq(forexPositions.botId, this.config.botId),
            eq(forexPositions.status, "OPEN")
          )
        );
      
      return result[0]?.count || 0;
    } catch (error) {
      console.error("[RiskManager] Erro ao contar trades abertos:", error);
      return 0;
    }
  }
  
  /**
   * Carrega configuração do banco de dados
   */
  private async loadConfigFromDB(): Promise<any> {
    try {
      const db = await getDb();
      if (!db) return null;
      
      const result = await db
        .select()
        .from(smcStrategyConfig)
        .where(
          and(
            eq(smcStrategyConfig.userId, this.config.userId),
            eq(smcStrategyConfig.botId, this.config.botId)
          )
        )
        .limit(1);
      
      return result[0] || null;
    } catch (error) {
      console.error("[RiskManager] Erro ao carregar config do DB:", error);
      return null;
    }
  }
  
  /**
   * Atualiza equity diário no banco de dados
   */
  private async updateDailyEquityInDB(equity: number, date: string): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      
      await db
        .update(smcStrategyConfig)
        .set({
          dailyStartEquity: equity.toString(),
          dailyEquityResetDate: date,
          tradingBlockedToday: false,
        })
        .where(
          and(
            eq(smcStrategyConfig.userId, this.config.userId),
            eq(smcStrategyConfig.botId, this.config.botId)
          )
        );
    } catch (error) {
      console.error("[RiskManager] Erro ao atualizar equity no DB:", error);
    }
  }
  
  /**
   * Atualiza flag de trading bloqueado no banco de dados
   */
  private async updateTradingBlockedInDB(blocked: boolean): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      
      await db
        .update(smcStrategyConfig)
        .set({ tradingBlockedToday: blocked })
        .where(
          and(
            eq(smcStrategyConfig.userId, this.config.userId),
            eq(smcStrategyConfig.botId, this.config.botId)
          )
        );
    } catch (error) {
      console.error("[RiskManager] Erro ao atualizar trading blocked no DB:", error);
    }
  }
}

// ============= FACTORY E EXPORTAÇÕES =============

/**
 * Cria uma instância do RiskManager
 */
export function createRiskManager(config: RiskManagerConfig): RiskManager {
  return new RiskManager(config);
}

/**
 * Configuração padrão do RiskManager
 */
export const DEFAULT_RISK_CONFIG: Omit<RiskManagerConfig, "userId" | "botId"> = {
  riskPercentage: 0.75,
  maxOpenTrades: 3,
  dailyLossLimitPercent: 3.0,
  sessionFilterEnabled: true,
  londonSessionStart: "04:00",
  londonSessionEnd: "07:00",
  nySessionStart: "09:30",
  nySessionEnd: "12:30",
  circuitBreakerEnabled: true,
};
