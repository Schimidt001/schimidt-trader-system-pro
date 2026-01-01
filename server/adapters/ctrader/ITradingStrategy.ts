/**
 * ITradingStrategy - Interface Base para Estratégias de Trading
 * 
 * Implementa o Strategy Pattern para permitir múltiplas estratégias
 * coexistirem no sistema (TrendSniper, SMC Swarm, etc.)
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 */

import { TrendbarData, TradeSide } from "./CTraderClient";

/**
 * Tipos de estratégia disponíveis
 */
export enum StrategyType {
  TREND_SNIPER = "TREND_SNIPER",
  SMC_SWARM = "SMC_SWARM",
}

/**
 * Resultado de um sinal de trading
 */
export interface SignalResult {
  /** Direção do sinal: BUY, SELL ou NONE */
  signal: "BUY" | "SELL" | "NONE";
  /** Confiança do sinal (0-100) */
  confidence: number;
  /** Razão/explicação do sinal */
  reason: string;
  /** Indicadores utilizados na análise */
  indicators: Record<string, number>;
  /** Metadados adicionais específicos da estratégia */
  metadata?: Record<string, any>;
}

/**
 * Resultado do cálculo de Stop Loss e Take Profit
 */
export interface SLTPResult {
  /** Preço do Stop Loss */
  stopLoss: number;
  /** Preço do Take Profit (null se infinito/trailing) */
  takeProfit: number | null;
  /** Stop Loss em pips */
  stopLossPips?: number;
  /** Take Profit em pips */
  takeProfitPips?: number;
}

/**
 * Resultado do cálculo de Trailing Stop
 */
export interface TrailingStopResult {
  /** Se deve atualizar o stop loss */
  shouldUpdate: boolean;
  /** Novo preço do stop loss */
  newStopLoss: number;
  /** Lucro atual em pips */
  profitPips: number;
}

/**
 * Resultado do cálculo de tamanho de posição
 */
export interface PositionSizeResult {
  /** Tamanho do lote calculado */
  lotSize: number;
  /** Risco em USD */
  riskUsd: number;
  /** Risco em porcentagem do equity */
  riskPercent: number;
}

/**
 * Dados de múltiplos timeframes para análise MTF
 */
export interface MultiTimeframeData {
  /** Candles do timeframe H1 */
  h1?: TrendbarData[];
  /** Candles do timeframe M15 */
  m15?: TrendbarData[];
  /** Candles do timeframe M5 */
  m5?: TrendbarData[];
  /** Candles do timeframe M1 */
  m1?: TrendbarData[];
  /** Preço atual (bid) */
  currentBid?: number;
  /** Preço atual (ask) */
  currentAsk?: number;
}

/**
 * Configuração base para todas as estratégias
 */
export interface BaseStrategyConfig {
  /** Tipo da estratégia */
  strategyType: StrategyType;
  /** Símbolo sendo operado */
  symbol?: string;
  /** Timeframe principal */
  timeframe?: string;
}

/**
 * Interface principal para estratégias de trading
 * Todas as estratégias devem implementar esta interface
 */
export interface ITradingStrategy {
  /**
   * Retorna o tipo da estratégia
   */
  getStrategyType(): StrategyType;

  /**
   * Analisa os dados de mercado e gera um sinal de trading
   * 
   * @param candles - Array de candles do timeframe principal
   * @param mtfData - Dados de múltiplos timeframes (opcional, para estratégias MTF)
   * @returns Resultado do sinal
   */
  analyzeSignal(candles: TrendbarData[], mtfData?: MultiTimeframeData): SignalResult;

  /**
   * Calcula Stop Loss e Take Profit para uma entrada
   * 
   * @param entryPrice - Preço de entrada
   * @param direction - Direção da operação (BUY/SELL)
   * @param pipValue - Valor do pip para o símbolo
   * @param metadata - Metadados adicionais (ex: swing points para SMC)
   * @returns Resultado do cálculo de SL/TP
   */
  calculateSLTP(
    entryPrice: number,
    direction: TradeSide,
    pipValue: number,
    metadata?: Record<string, any>
  ): SLTPResult;

  /**
   * Calcula o trailing stop para uma posição aberta
   * 
   * @param entryPrice - Preço de entrada
   * @param currentPrice - Preço atual
   * @param currentStopLoss - Stop loss atual
   * @param direction - Direção da operação
   * @param pipValue - Valor do pip
   * @returns Resultado do cálculo de trailing stop
   */
  calculateTrailingStop(
    entryPrice: number,
    currentPrice: number,
    currentStopLoss: number,
    direction: TradeSide,
    pipValue: number
  ): TrailingStopResult;

  /**
   * Calcula o tamanho da posição baseado no risco
   * 
   * @param accountBalance - Saldo da conta
   * @param stopLossPips - Distância do stop loss em pips
   * @param pipValue - Valor do pip por lote
   * @returns Resultado do cálculo de tamanho de posição
   */
  calculatePositionSize(
    accountBalance: number,
    stopLossPips: number,
    pipValue: number
  ): PositionSizeResult;

  /**
   * Retorna a configuração atual da estratégia
   */
  getConfig(): BaseStrategyConfig;

  /**
   * Atualiza a configuração da estratégia
   * 
   * @param config - Nova configuração parcial
   */
  updateConfig(config: Partial<BaseStrategyConfig>): void;

  /**
   * Verifica se a estratégia está pronta para operar
   * (ex: dados suficientes carregados, horário permitido, etc.)
   * 
   * @param currentTime - Timestamp atual
   * @returns true se pronta para operar
   */
  isReadyToTrade(currentTime?: number): boolean;

  /**
   * Reseta o estado interno da estratégia
   * (útil para reiniciar após erros ou mudança de configuração)
   */
  reset(): void;
}

/**
 * Interface para estratégias que suportam múltiplos timeframes
 */
export interface IMultiTimeframeStrategy extends ITradingStrategy {
  /**
   * Retorna os timeframes necessários para a estratégia
   */
  getRequiredTimeframes(): string[];

  /**
   * Atualiza os dados de um timeframe específico
   * 
   * @param timeframe - Timeframe sendo atualizado
   * @param candles - Novos candles
   */
  updateTimeframeData(timeframe: string, candles: TrendbarData[]): void;

  /**
   * Verifica se todos os timeframes têm dados suficientes
   */
  hasAllTimeframeData(): boolean;
}

/**
 * Factory para criar instâncias de estratégias
 */
export interface IStrategyFactory {
  /**
   * Cria uma instância da estratégia baseado no tipo
   * 
   * @param type - Tipo da estratégia
   * @param config - Configuração inicial
   * @returns Instância da estratégia
   */
  createStrategy(type: StrategyType, config?: any): ITradingStrategy;
}
