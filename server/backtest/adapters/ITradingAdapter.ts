/**
 * ITradingAdapter - Interface comum para adapters de trading
 * 
 * Esta interface define o contrato que deve ser implementado tanto pelo
 * CTraderAdapter (produção) quanto pelo BacktestAdapter (simulação).
 * 
 * IMPORTANTE: Esta interface é baseada nos métodos realmente utilizados
 * pelos engines de produção (HybridTradingEngine, SMCTradingEngine).
 * 
 * A injeção de dependência nos Engines usa esta interface, permitindo
 * trocar entre produção e backtest sem alterar a lógica de trading.
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 1.0.0
 */

import {
  AccountInfo,
  PriceTick,
  CandleData,
  OrderRequest,
  OrderResult,
  ModifyPositionParams,
  OpenPosition,
  ConnectionState,
  BrokerEvents
} from "../../adapters/IBrokerAdapter";

// ============================================================================
// CALLBACK TYPES
// ============================================================================

export type OnTickCallback = (tick: PriceTick) => void;
export type OnBarCallback = (bar: CandleData) => void;

// ============================================================================
// MAIN INTERFACE
// ============================================================================

/**
 * Interface de Trading Adapter
 * 
 * Define todos os métodos necessários para que os engines de trading
 * funcionem tanto em produção quanto em backtest.
 * 
 * Baseada nos métodos realmente usados em:
 * - HybridTradingEngine.ts
 * - SMCTradingEngine.ts
 * - CTraderAdapter.ts
 */
export interface ITradingAdapter {
  // -------------------------------------------------------------------------
  // Connection Management
  // -------------------------------------------------------------------------
  
  /**
   * Verifica se está conectado
   */
  isConnected(): boolean;
  
  /**
   * Estado atual da conexão
   */
  readonly connectionState: ConnectionState;
  
  // -------------------------------------------------------------------------
  // Account Information
  // -------------------------------------------------------------------------
  
  /**
   * Obtém informações da conta
   */
  getAccountInfo(): Promise<AccountInfo>;
  
  /**
   * Configura contexto do usuário (userId, botId)
   * Usado para persistência de posições
   */
  setUserContext(userId: number, botId: number): void;
  
  // -------------------------------------------------------------------------
  // Market Data
  // -------------------------------------------------------------------------
  
  /**
   * Subscreve para receber ticks de um símbolo
   */
  subscribePrice(symbol: string, callback: OnTickCallback): Promise<void>;
  
  /**
   * Cancela subscrição de ticks
   */
  unsubscribePrice(symbol: string): Promise<void>;
  
  /**
   * Obtém histórico de candles
   */
  getCandleHistory(symbol: string, timeframe: string, count: number): Promise<CandleData[]>;
  
  /**
   * Obtém o preço atual de um símbolo
   */
  getPrice(symbol: string): Promise<PriceTick>;
  
  // -------------------------------------------------------------------------
  // Order Management
  // -------------------------------------------------------------------------
  
  /**
   * Executa uma ordem
   * @param order Parâmetros da ordem
   * @param maxSpread Spread máximo permitido em pips
   */
  placeOrder(order: OrderRequest, maxSpread?: number): Promise<OrderResult>;
  
  /**
   * Modifica uma posição (SL/TP)
   */
  modifyPosition(params: ModifyPositionParams): Promise<boolean>;
  
  /**
   * Fecha uma posição
   */
  closePosition(positionId: string): Promise<OrderResult>;
  
  // -------------------------------------------------------------------------
  // Position Management
  // -------------------------------------------------------------------------
  
  /**
   * Obtém todas as posições abertas
   */
  getOpenPositions(): Promise<OpenPosition[]>;
  
  /**
   * Reconcilia posições com a corretora
   * Retorna o número de posições sincronizadas
   */
  reconcilePositions(): Promise<number>;
  
  // -------------------------------------------------------------------------
  // Symbol Information
  // -------------------------------------------------------------------------
  
  /**
   * Obtém símbolos disponíveis
   */
  getAvailableSymbols(): Promise<string[]>;
  
  /**
   * Obtém informações de um símbolo (digits, pip size, etc)
   */
  getSymbolInfo(symbol: string): Promise<SymbolInfo | null>;
  
  /**
   * Obtém especificações de volume de um símbolo
   */
  getVolumeSpecs(symbol: string): Promise<VolumeSpecs | null>;
  
  // -------------------------------------------------------------------------
  // Event Handlers
  // -------------------------------------------------------------------------
  
  /**
   * Registra handlers de eventos
   */
  setEventHandlers(events: BrokerEvents): void;
}

// ============================================================================
// SYMBOL INFO
// ============================================================================

export interface SymbolInfo {
  /** Nome do símbolo */
  symbol: string;
  
  /** Número de casas decimais */
  digits: number;
  
  /** Tamanho do pip (ex: 0.0001 para EURUSD, 0.01 para USDJPY) */
  pipSize: number;
  
  /** Tamanho do lote padrão */
  lotSize: number;
  
  /** Tamanho do contrato */
  contractSize: number;
  
  /** Margem requerida por lote */
  marginRequired?: number;
}

// ============================================================================
// VOLUME SPECS
// ============================================================================

/**
 * Especificações de volume do símbolo (da cTrader API)
 * 
 * IMPORTANTE: Valores em CENTS (protocolo cTrader)
 * - 1 Lote = 100,000 Unidades = 10,000,000 Cents
 * - 0.01 Lotes (micro lote) = 1,000 Unidades = 100,000 Cents
 */
export interface VolumeSpecs {
  /** Volume mínimo em cents (ex: 100000 = 0.01 lotes) */
  minVolume: number;
  
  /** Volume máximo em cents */
  maxVolume: number;
  
  /** Incremento de volume em cents (ex: 100000 = 0.01 lotes) */
  stepVolume: number;
}

// ============================================================================
// ADAPTER FACTORY
// ============================================================================

/**
 * Tipo de adapter
 */
export type AdapterType = "PRODUCTION" | "BACKTEST";

/**
 * Factory para criar adapters
 */
export interface IAdapterFactory {
  createAdapter(type: AdapterType, config?: any): ITradingAdapter;
}
