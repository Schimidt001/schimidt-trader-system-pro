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
 * @version 2.0.0
 * 
 * CORREÇÃO CRÍTICA 2026-01-13:
 * - Refatoração completa do cálculo de position size
 * - Agora usa valor monetário do pip (USD) ao invés do tamanho do pip (movimento de preço)
 * - Corrige bug que causava cálculo de 147 lotes ao invés de 0.02 lotes
 */

import { getDb } from "../../db";
import { smcStrategyConfig, forexPositions } from "../../../drizzle/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { 
  calculateMonetaryPipValue, 
  ConversionRates, 
  getSymbolType, 
  SymbolType 
} from "../../../shared/normalizationUtils";

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
  pipValueMonetary: number;  // CORREÇÃO 2026-01-13: Valor monetário do pip em USD
  canTrade: boolean;
  reason: string;
  volumeAdjusted: boolean;  // Indica se o volume foi ajustado para respeitar limites
  originalLotSize?: number; // Lote original antes do ajuste
}

/**
 * Limite máximo de segurança para volume (em lotes)
 * SECURITY BLOCK: Impede ordens absurdamente grandes
 */
const MAX_SECURITY_LOT_SIZE = 5.0;

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
      
      // Calcular próxima sessão
      const nextSession = this.getNextTradingSession(brasiliaTime);
      
      console.log(`[RiskManager] 🚫 Filtro de Sessão | Hora atual (Brasília): ${currentTime} | Londres: ${this.config.londonSessionStart}-${this.config.londonSessionEnd} | NY: ${this.config.nySessionStart}-${this.config.nySessionEnd}`);
      console.log(`[RiskManager] ⏰ Próxima sessão: ${nextSession.name} às ${nextSession.startTime} (em ${nextSession.minutesUntil} minutos)`);
      
      return {
        allowed: false,
        reason: `Fora de sessão | Próxima: ${nextSession.name} às ${nextSession.startTime} (em ${nextSession.minutesUntil}min)`,
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
   * CORREÇÃO CRÍTICA 2026-01-13: Calcula o tamanho da posição baseado no risco
   * 
   * FÓRMULA CORRIGIDA:
   * lotSize = riskAmount / (stopLossPips × pipValueMonetary)
   * 
   * Onde:
   * - riskAmount = accountBalance × (riskPercentage / 100)
   * - pipValueMonetary = valor em USD de 1 pip por 1 lote standard
   * 
   * IMPORTANTE: pipValueMonetary NÃO é o mesmo que pipSize (movimento de preço)!
   * - pipSize (EURJPY) = 0.01 (movimento de preço)
   * - pipValueMonetary (EURJPY) = ~$6.29 (valor em USD por lote)
   * 
   * @param accountBalance - Saldo da conta em USD
   * @param stopLossPips - Distância do stop loss em pips
   * @param symbol - Símbolo do ativo (ex: "EURJPY", "EURUSD")
   * @param conversionRates - Taxas de conversão para cálculo do pip value
   * @param volumeSpecs - Especificações de volume da cTrader API (opcional)
   */
  calculatePositionSize(
    accountBalance: number,
    stopLossPips: number,
    symbol: string,
    conversionRates: ConversionRates,
    volumeSpecs?: VolumeSpecs
  ): PositionSizeCalculation {
    // Verificar se pode operar
    if (this.state.tradingBlocked) {
      return {
        lotSize: 0,
        volumeInCents: 0,
        riskAmount: 0,
        riskPercent: 0,
        stopLossPips,
        pipValueMonetary: 0,
        canTrade: false,
        reason: this.state.blockReason || "Trading bloqueado",
        volumeAdjusted: false,
      };
    }
    
    // ============= PROTEÇÃO CONTRA VOLUME EXPLOSIVO =============
    // CORREÇÃO CRÍTICA: Stop Loss mínimo de segurança
    const MIN_SL_PIPS = 3.0;
    const originalStopLossPips = stopLossPips;
    const effectiveSL = Math.max(stopLossPips, MIN_SL_PIPS);
    
    if (stopLossPips < MIN_SL_PIPS) {
      console.warn(`[RiskManager] ⚠️ PROTEÇÃO ATIVADA: SL original (${stopLossPips.toFixed(2)} pips) < mínimo (${MIN_SL_PIPS} pips)`);
      console.warn(`[RiskManager] ⚠️ Usando SL efetivo de ${effectiveSL} pips para cálculo de volume`);
    }
    
    // Validar que SL efetivo é positivo
    if (effectiveSL <= 0) {
      console.error(`[RiskManager] ❌ ERRO CRÍTICO: SL efetivo é ${effectiveSL}. Bloqueando trade.`);
      return {
        lotSize: 0,
        volumeInCents: 0,
        riskAmount: 0,
        riskPercent: 0,
        stopLossPips: originalStopLossPips,
        pipValueMonetary: 0,
        canTrade: false,
        reason: `Stop Loss inválido (${originalStopLossPips} pips). Mínimo: ${MIN_SL_PIPS} pips.`,
        volumeAdjusted: false,
      };
    }
    
    // ============= CÁLCULO DO PIP VALUE MONETÁRIO (CORREÇÃO CRÍTICA) =============
    // Esta é a correção principal do bug de 147 lotes
    const pipValueMonetary = calculateMonetaryPipValue(symbol, conversionRates, 1.0);
    
    // Validar pip value monetário
    if (pipValueMonetary <= 0) {
      console.error(`[RiskManager] ❌ ERRO CRÍTICO: Pip Value Monetário inválido (${pipValueMonetary}) para ${symbol}`);
      return {
        lotSize: 0,
        volumeInCents: 0,
        riskAmount: 0,
        riskPercent: 0,
        stopLossPips: originalStopLossPips,
        pipValueMonetary: 0,
        canTrade: false,
        reason: `Pip Value Monetário inválido para ${symbol}. Verifique as taxas de conversão.`,
        volumeAdjusted: false,
      };
    }
    
    // CORREÇÃO DEFINITIVA: Defaults em CENTS (protocolo cTrader)
    // CORREÇÃO 2026-01-14 (TAREFA #1): Default de maxVolume reduzido para 10 lotes
    // O valor anterior (10,000 lotes) era muito alto e não protegia contra erros TRADING_BAD_VOLUME
    const specs: VolumeSpecs = volumeSpecs || {
      minVolume: 100000,           // 0.01 lotes = 100,000 cents
      maxVolume: 100000000,        // 10 lotes = 100,000,000 cents (CORREÇÃO - era 100 trilhões)
      stepVolume: 100000,          // 0.01 lotes = 100,000 cents
    };
    
    // ============= CÁLCULO DO LOTE (FÓRMULA CORRIGIDA) =============
    // Calcular risco em USD
    const riskAmount = accountBalance * (this.config.riskPercentage / 100);
    
    // FÓRMULA CORRIGIDA: lotSize = riskAmount / (stopLossPips × pipValueMonetary)
    // Exemplo EURJPY: $10.06 / (6.8 × $6.29) = 0.235 lotes ✅
    // Antes (ERRADO): $10.06 / (6.8 × 0.01) = 147.9 lotes ❌
    let lotSize = riskAmount / (effectiveSL * pipValueMonetary);
    const originalLotSize = lotSize;
    
    // ============= SECURITY BLOCK: Limite máximo de segurança =============
    if (lotSize > MAX_SECURITY_LOT_SIZE) {
      console.error("═══════════════════════════════════════════════════════════════");
      console.error(`[RiskManager] ❌ SECURITY BLOCK: Volume ${lotSize.toFixed(4)} lotes excede o limite de segurança de ${MAX_SECURITY_LOT_SIZE} lotes.`);
      console.error(`[RiskManager] Detalhes do cálculo:`);
      console.error(`  - Balance: $${accountBalance.toFixed(2)}`);
      console.error(`  - Risco: ${this.config.riskPercentage}% = $${riskAmount.toFixed(2)}`);
      console.error(`  - SL: ${effectiveSL.toFixed(2)} pips`);
      console.error(`  - Pip Value Monetário: $${pipValueMonetary.toFixed(4)}`);
      console.error(`  - Símbolo: ${symbol}`);
      console.error(`  - Taxas de conversão: ${JSON.stringify(conversionRates)}`);
      console.error("═══════════════════════════════════════════════════════════════");
      
      return {
        lotSize: 0,
        volumeInCents: 0,
        riskAmount,
        riskPercent: this.config.riskPercentage,
        stopLossPips: originalStopLossPips,
        pipValueMonetary,
        canTrade: false,
        reason: `SECURITY BLOCK: Volume ${lotSize.toFixed(4)} lotes excede o limite de segurança de ${MAX_SECURITY_LOT_SIZE} lotes.`,
        volumeAdjusted: false,
        originalLotSize,
      };
    }
    
    // ============= NORMALIZAÇÃO DE VOLUME (cTrader API) =============
    // Converter para CENTS (1 lote = 10,000,000 cents)
    let volumeInCents = Math.round(lotSize * 10000000);
    
    // 1. Arredondar para o stepVolume mais próximo (PARA BAIXO)
    volumeInCents = Math.floor(volumeInCents / specs.stepVolume) * specs.stepVolume;
    
    // 2. Garantir que >= minVolume
    if (volumeInCents < specs.minVolume) {
      console.log(`[RiskManager] ⚠️ Volume ${volumeInCents} cents < minVolume ${specs.minVolume} cents`);
      volumeInCents = specs.minVolume;
    }
    
    // 3. CLAMPING: Garantir que <= maxVolume (CORREÇÃO TAREFA #1)
    // Este é o ponto crítico que resolve o erro TRADING_BAD_VOLUME
    if (volumeInCents > specs.maxVolume) {
      const volumeOriginalLots = volumeInCents / 10000000;
      const maxVolumeLots = specs.maxVolume / 10000000;
      console.warn(`[RiskManager] ⚠️ CLAMPING ATIVADO: Volume ${volumeOriginalLots.toFixed(4)} lotes excede o máximo ${maxVolumeLots.toFixed(4)} lotes`);
      console.warn(`[RiskManager] ⚠️ Ajustando volume para o teto da corretora: ${maxVolumeLots.toFixed(4)} lotes`);
      console.warn(`[RiskManager] ⚠️ NOTA: O risco real será ligeiramente menor que o calculado`);
      volumeInCents = specs.maxVolume;
    }
    
    // Converter de volta para lotes
    lotSize = volumeInCents / 10000000;
    
    // Arredondar para 2 casas decimais
    lotSize = Math.round(lotSize * 100) / 100;
    
    // Verificar se o volume foi ajustado
    const volumeAdjusted = Math.abs(lotSize - originalLotSize) > 0.0001;
    
    // Calcular risco real após normalização
    const actualRiskAmount = lotSize * stopLossPips * pipValueMonetary;
    const actualRiskPercent = (actualRiskAmount / accountBalance) * 100;
    
    // Verificar se o volume mínimo excede o risco permitido (2x limite)
    const minLotSize = specs.minVolume / 10000000;
    if (actualRiskPercent > this.config.riskPercentage * 2) {
      console.log(`[RiskManager] ❌ Volume mínimo (${minLotSize} lotes) excede limite de risco seguro`);
      console.log(`  - Risco real: ${actualRiskPercent.toFixed(2)}% vs configurado: ${this.config.riskPercentage}%`);
      return {
        lotSize: 0,
        volumeInCents: 0,
        riskAmount: 0,
        riskPercent: 0,
        stopLossPips,
        pipValueMonetary,
        canTrade: false,
        reason: `Volume mínimo (${minLotSize} lotes) excede risco permitido (${actualRiskPercent.toFixed(1)}% > ${this.config.riskPercentage * 2}%)`,
        volumeAdjusted: true,
        originalLotSize,
      };
    }
    
    // ============= LOG DETALHADO DO CÁLCULO =============
    console.log(`[RiskManager] ═══════════════════════════════════════════════════════════════`);
    console.log(`[RiskManager] 📊 CÁLCULO DE POSIÇÃO (v2.0 - CORRIGIDO)`);
    console.log(`[RiskManager] ═══════════════════════════════════════════════════════════════`);
    console.log(`[RiskManager]   Símbolo: ${symbol}`);
    console.log(`[RiskManager]   Balance: $${accountBalance.toFixed(2)}`);
    console.log(`[RiskManager]   Risco configurado: ${this.config.riskPercentage}% = $${riskAmount.toFixed(2)}`);
    console.log(`[RiskManager]   SL original: ${originalStopLossPips.toFixed(2)} pips | SL efetivo: ${effectiveSL.toFixed(2)} pips`);
    console.log(`[RiskManager]   ✅ Pip Value Monetário: $${pipValueMonetary.toFixed(4)} (por lote standard)`);
    console.log(`[RiskManager]   Taxas de conversão: ${JSON.stringify(conversionRates)}`);
    console.log(`[RiskManager]   Volume Specs: min=${specs.minVolume} cents (${minLotSize} lotes), step=${specs.stepVolume} cents`);
    console.log(`[RiskManager]   ───────────────────────────────────────────────────────────────`);
    console.log(`[RiskManager]   Fórmula: lotSize = riskAmount / (SL × pipValueMonetary)`);
    console.log(`[RiskManager]   Cálculo: ${riskAmount.toFixed(2)} / (${effectiveSL.toFixed(2)} × ${pipValueMonetary.toFixed(4)}) = ${originalLotSize.toFixed(4)}`);
    console.log(`[RiskManager]   ───────────────────────────────────────────────────────────────`);
    console.log(`[RiskManager]   Lote bruto: ${originalLotSize.toFixed(4)}`);
    console.log(`[RiskManager]   Lote normalizado: ${lotSize} lotes (${volumeInCents} cents)`);
    console.log(`[RiskManager]   Risco real: ${actualRiskPercent.toFixed(2)}% = $${actualRiskAmount.toFixed(2)}`);
    if (originalStopLossPips < MIN_SL_PIPS) {
      console.log(`[RiskManager]   🛡️ PROTEÇÃO SL MÍNIMO: SL ajustado de ${originalStopLossPips.toFixed(2)} para ${effectiveSL.toFixed(2)} pips`);
    }
    if (volumeAdjusted) {
      console.log(`[RiskManager]   ⚠️ VOLUME AJUSTADO para respeitar limites da corretora`);
    }
    console.log(`[RiskManager] ═══════════════════════════════════════════════════════════════`);
    
    return {
      lotSize,
      volumeInCents,
      riskAmount: actualRiskAmount,
      riskPercent: actualRiskPercent,
      stopLossPips,
      pipValueMonetary,
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
   * Calcula a próxima sessão de trading
   */
  private getNextTradingSession(brasiliaTime: Date): { name: string; startTime: string; minutesUntil: number } {
    const currentHour = brasiliaTime.getHours();
    const currentMinute = brasiliaTime.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;
    
    const parseTime = (timeStr: string): number => {
      const [hours, minutes] = timeStr.split(":").map(Number);
      return hours * 60 + minutes;
    };
    
    const londonStart = parseTime(this.config.londonSessionStart);
    const nyStart = parseTime(this.config.nySessionStart);
    
    // Verificar qual é a próxima sessão
    if (currentTimeMinutes < londonStart) {
      // Próxima é Londres hoje
      return {
        name: "LONDRES",
        startTime: this.config.londonSessionStart,
        minutesUntil: londonStart - currentTimeMinutes,
      };
    } else if (currentTimeMinutes < nyStart) {
      // Próxima é NY hoje
      return {
        name: "NEW YORK",
        startTime: this.config.nySessionStart,
        minutesUntil: nyStart - currentTimeMinutes,
      };
    } else {
      // Próxima é Londres amanhã
      const minutesUntilMidnight = 24 * 60 - currentTimeMinutes;
      const minutesUntilLondon = minutesUntilMidnight + londonStart;
      return {
        name: "LONDRES",
        startTime: this.config.londonSessionStart,
        minutesUntil: minutesUntilLondon,
      };
    }
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
   * CORREÇÃO CRÍTICA 2026-01-20: Obtém o número de trades abertos por símbolo
   * Esta verificação é feita diretamente no banco de dados para garantir consistência
   * e evitar race conditions que ocorrem quando se usa apenas cache local.
   * 
   * @param symbol - Símbolo a verificar (ex: "EURUSD")
   * @returns Número de posições abertas para o símbolo
   */
  async getOpenTradesCountBySymbol(symbol: string): Promise<number> {
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
            eq(forexPositions.symbol, symbol),
            eq(forexPositions.status, "OPEN")
          )
        );
      
      const count = result[0]?.count || 0;
      console.log(`[RiskManager] Posições abertas para ${symbol}: ${count}`);
      return count;
    } catch (error) {
      console.error(`[RiskManager] Erro ao contar trades abertos para ${symbol}:`, error);
      return 0;
    }
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
