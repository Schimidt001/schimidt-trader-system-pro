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
 * Especificações de volume do símbolo (da cTrader API)
 * 
 * CORREÇÃO DEFINITIVA: Valores em CENTS (protocolo cTrader)
 * Matemática:
 * - 1 Lote = 100,000 Unidades = 10,000,000 Cents
 * - 0.01 Lotes (micro lote) = 1,000 Unidades = 100,000 Cents
 * - A API retorna minVolume, maxVolume, stepVolume em CENTS
 */
export interface VolumeSpecs {
  minVolume: number;   // Volume mínimo em cents (ex: 100000 = 0.01 lotes)
  maxVolume: number;   // Volume máximo em cents
  stepVolume: number;  // Incremento de volume em cents (ex: 100000 = 0.01 lotes)
}

/**
 * Resultado do cálculo de posição
 */
export interface PositionSizeCalculation {
  lotSize: number;
  volumeInCents: number;  // CORREÇÃO DEFINITIVA: Volume em cents (1 lote = 10,000,000 cents)
  riskAmount: number;
  riskPercent: number;
  stopLossPips: number;
  pipValue: number;
  canTrade: boolean;
  reason: string;
  volumeAdjusted: boolean;  // Indica se o volume foi ajustado para respeitar limites
  originalLotSize?: number; // Lote original antes do ajuste
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
      // Log detalhado do filtro de sessão
      const now = new Date();
      const brasiliaOffset = -3 * 60;
      const localOffset = now.getTimezoneOffset();
      const brasiliaTime = new Date(now.getTime() + (localOffset + brasiliaOffset) * 60000);
      const currentTime = `${brasiliaTime.getHours().toString().padStart(2, '0')}:${brasiliaTime.getMinutes().toString().padStart(2, '0')}`;
      
      console.log(`[RiskManager] 🚫 Filtro de Sessão | Hora atual (Brasília): ${currentTime} | Londres: ${this.config.londonSessionStart}-${this.config.londonSessionEnd} | NY: ${this.config.nySessionStart}-${this.config.nySessionEnd}`);
      
      return {
        allowed: false,
        reason: `Fora do horário de trading permitido (${currentTime} Brasília)`,
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
   * 
   * REFATORAÇÃO: Agora respeita os limites de volume da cTrader API
   * - minVolume: Volume mínimo permitido
   * - maxVolume: Volume máximo permitido  
   * - stepVolume: Incremento de volume obrigatório
   */
  calculatePositionSize(
    accountBalance: number,
    stopLossPips: number,
    pipValue: number,
    volumeSpecs?: VolumeSpecs  // Specs do símbolo da cTrader API
  ): PositionSizeCalculation {
    // Verificar se pode operar
    if (this.state.tradingBlocked) {
      return {
        lotSize: 0,
        volumeInCents: 0,
        riskAmount: 0,
        riskPercent: 0,
        stopLossPips,
        pipValue,
        canTrade: false,
        reason: this.state.blockReason || "Trading bloqueado",
        volumeAdjusted: false,
      };
    }
    
    // CORREÇÃO DEFINITIVA: Defaults em CENTS (protocolo cTrader)
    // Matemática:
    // - 1 Lote = 100,000 Unidades = 10,000,000 Cents
    // - 0.01 Lotes = 1,000 Unidades = 100,000 Cents
    const specs: VolumeSpecs = volumeSpecs || {
      minVolume: 100000,           // 0.01 lotes = 100,000 cents
      maxVolume: 100000000000000,  // 10,000 lotes = 100 trilhões de cents
      stepVolume: 100000,          // 0.01 lotes = 100,000 cents
    };
    
    // Calcular risco em USD
    const riskAmount = accountBalance * (this.config.riskPercentage / 100);
    
    // Calcular tamanho do lote bruto
    let lotSize = riskAmount / (stopLossPips * pipValue);
    const originalLotSize = lotSize;
    
    // CORREÇÃO DEFINITIVA: Converter para CENTS (1 lote = 10,000,000 cents)
    let volumeInCents = Math.round(lotSize * 10000000);
    
    // ============= NORMALIZAÇÃO DE VOLUME (cTrader API) =============
    // 1. Arredondar para o stepVolume mais próximo (PARA BAIXO)
    volumeInCents = Math.floor(volumeInCents / specs.stepVolume) * specs.stepVolume;
    
    // 2. Garantir que >= minVolume
    if (volumeInCents < specs.minVolume) {
      console.log(`[RiskManager] ⚠️ Volume ${volumeInCents} cents < minVolume ${specs.minVolume} cents`);
      volumeInCents = specs.minVolume;
    }
    
    // 3. Garantir que <= maxVolume
    if (volumeInCents > specs.maxVolume) {
      console.log(`[RiskManager] ⚠️ Volume ${volumeInCents} cents > maxVolume ${specs.maxVolume} cents`);
      volumeInCents = specs.maxVolume;
    }
    
    // CORREÇÃO DEFINITIVA: Converter de volta para lotes (1 lote = 10,000,000 cents)
    lotSize = volumeInCents / 10000000;
    
    // Verificar se o volume foi ajustado
    const volumeAdjusted = Math.abs(lotSize - originalLotSize) > 0.0001;
    
    // Verificar se o volume mínimo excede o risco permitido
    const minLotSize = specs.minVolume / 10000000;
    const actualRiskAmount = lotSize * stopLossPips * pipValue;
    const actualRiskPercent = (actualRiskAmount / accountBalance) * 100;
    
    // Se o volume mínimo resultar em risco > 2x o configurado, bloquear
    if (actualRiskPercent > this.config.riskPercentage * 2) {
      console.log(`[RiskManager] ❌ Volume mínimo (${minLotSize} lotes) excede limite de risco seguro`);
      console.log(`  - Risco real: ${actualRiskPercent.toFixed(2)}% vs configurado: ${this.config.riskPercentage}%`);
      return {
        lotSize: 0,
        volumeInCents: 0,
        riskAmount: 0,
        riskPercent: 0,
        stopLossPips,
        pipValue,
        canTrade: false,
        reason: `Volume mínimo (${minLotSize} lotes) excede risco permitido (${actualRiskPercent.toFixed(1)}% > ${this.config.riskPercentage * 2}%)`,
        volumeAdjusted: true,
        originalLotSize,
      };
    }
    
    console.log(`[RiskManager] Cálculo de posição:`);
    console.log(`  - Balance: $${accountBalance.toFixed(2)}`);
    console.log(`  - Risco configurado: ${this.config.riskPercentage}% = $${riskAmount.toFixed(2)}`);
    console.log(`  - SL: ${stopLossPips} pips`);
    console.log(`  - Pip Value: $${pipValue}`);
    console.log(`  - Volume Specs: min=${specs.minVolume} cents (${minLotSize} lotes), max=${specs.maxVolume} cents, step=${specs.stepVolume} cents`);
    console.log(`  - Lote bruto: ${originalLotSize.toFixed(4)}`);
    console.log(`  - Lote normalizado: ${lotSize} lotes (${volumeInCents} cents)`);
    console.log(`  - Risco real: ${actualRiskPercent.toFixed(2)}% = $${actualRiskAmount.toFixed(2)}`);
    if (volumeAdjusted) {
      console.log(`  - ⚠️ VOLUME AJUSTADO para respeitar limites da corretora`);
    }
    
    return {
      lotSize,
      volumeInCents,
      riskAmount: actualRiskAmount,
      riskPercent: actualRiskPercent,
      stopLossPips,
      pipValue,
      canTrade: true,
      reason: "OK",
      volumeAdjusted,
      originalLotSize: volumeAdjusted ? originalLotSize : undefined,
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
