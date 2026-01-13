/**
 * Interface Genérica para Adaptadores de Corretora
 * 
 * Padrão de Projeto: Adapter Pattern
 * 
 * O núcleo do robô (TradingEngine) não deve saber com qual corretora está a falar.
 * Ele deve comunicar com esta Interface Genérica.
 * 
 * Implementações:
 * - DerivAdapter: Binary Options via WebSocket API
 * - CTraderAdapter: Forex Spot via cTrader Open API (Protocol Buffers)
 */

/**
 * Tipos de corretora suportados
 */
export type BrokerType = "DERIV" | "ICMARKETS";

/**
 * Credenciais genéricas para conexão
 */
export interface BrokerCredentials {
  /** Tipo da corretora */
  brokerType: BrokerType;
  /** Modo demo ou real */
  isDemo: boolean;
  /** Credenciais específicas da corretora (variam por implementação) */
  [key: string]: any;
}

/**
 * Credenciais específicas para DERIV
 */
export interface DerivCredentials extends BrokerCredentials {
  brokerType: "DERIV";
  token: string;
  appId?: string;
}

/**
 * Credenciais específicas para IC Markets (cTrader)
 */
export interface CTraderCredentials extends BrokerCredentials {
  brokerType: "ICMARKETS";
  clientId: string;
  clientSecret: string;
  accessToken: string;
  accountId?: string;
}

/**
 * Informações da conta conectada
 */
export interface AccountInfo {
  /** ID da conta */
  accountId: string;
  /** Saldo atual */
  balance: number;
  /** Equity (saldo + P&L aberto) */
  equity?: number;
  /** Moeda da conta */
  currency: string;
  /** Tipo de conta (demo/real) */
  accountType: "demo" | "real";
  /** Se é conta demo */
  isDemo?: boolean;
  /** Alavancagem (apenas Forex) */
  leverage?: number;
  /** Nome do titular */
  accountName?: string;
}

/**
 * Tick de preço em tempo real
 */
export interface PriceTick {
  /** Símbolo do ativo */
  symbol: string;
  /** Preço de compra (ask) */
  ask: number;
  /** Preço de venda (bid) */
  bid: number;
  /** Timestamp Unix em milissegundos */
  timestamp: number;
  /** Spread em pips (calculado) */
  spread?: number;
}

/**
 * Candle OHLC
 */
export interface CandleData {
  /** Símbolo do ativo */
  symbol: string;
  /** Timeframe (M1, M5, M15, M30, H1, etc.) */
  timeframe: string;
  /** Timestamp de abertura (Unix segundos) */
  timestamp: number;
  /** Preço de abertura */
  open: number;
  /** Preço máximo */
  high: number;
  /** Preço mínimo */
  low: number;
  /** Preço de fechamento */
  close: number;
  /** Volume (se disponível) */
  volume?: number;
}

/**
 * Direção da ordem
 */
export type OrderDirection = "BUY" | "SELL";

/**
 * Tipo de ordem
 */
export type OrderType = 
  | "MARKET"      // Execução imediata ao preço de mercado
  | "LIMIT"       // Execução quando preço atingir limite
  | "STOP"        // Execução quando preço atingir stop
  | "CALL"        // Binary Option - Alta
  | "PUT";        // Binary Option - Baixa

/**
 * Requisição de ordem genérica
 */
export interface OrderRequest {
  /** Símbolo do ativo */
  symbol: string;
  /** Direção (BUY/SELL) */
  direction: OrderDirection;
  /** Tipo de ordem */
  orderType: OrderType;
  
  // Para Forex (IC Markets)
  /** Tamanho do lote (Forex) */
  lots?: number;
  /** Stop Loss em preço */
  stopLoss?: number;
  /** Take Profit em preço */
  takeProfit?: number;
  /** Stop Loss em pips */
  stopLossPips?: number;
  /** Take Profit em pips */
  takeProfitPips?: number;
  
  // Para Binary Options (Deriv)
  /** Valor da aposta em centavos */
  stake?: number;
  /** Duração do contrato em segundos */
  duration?: number;
  /** Barreira (para Touch/No Touch) */
  barrier?: string;
  /** Tipo de contrato Deriv */
  contractType?: "RISE_FALL" | "TOUCH" | "NO_TOUCH";
  
  // Metadados
  /** Comentário/identificador da ordem */
  comment?: string;
  /** ID único do cliente */
  clientOrderId?: string;
}

/**
 * Resultado de uma ordem executada
 */
export interface OrderResult {
  /** Sucesso da execução */
  success: boolean;
  /** ID da ordem/posição na corretora */
  orderId?: string;
  /** ID do contrato (Deriv) */
  contractId?: string;
  /** Preço de execução */
  executionPrice?: number;
  /** Timestamp de execução */
  executionTime?: number;
  /** Mensagem de erro (se falhou) */
  errorMessage?: string;
  /** Código de erro */
  errorCode?: string;
  /** Dados adicionais específicos da corretora */
  rawResponse?: any;
  /** Volume mínimo detectado (quando erro de volume) - CORREÇÃO 2026-01-13 */
  detectedMinVolume?: number;
}

/**
 * Posição aberta
 */
export interface OpenPosition {
  /** ID da posição */
  positionId: string;
  /** Símbolo */
  symbol: string;
  /** Direção */
  direction: OrderDirection;
  /** Preço de entrada */
  entryPrice: number;
  /** Preço atual */
  currentPrice: number;
  /** Lucro/Prejuízo atual */
  unrealizedPnL: number;
  /** Tamanho (lotes ou stake) */
  size: number;
  /** Stop Loss atual */
  stopLoss?: number;
  /** Take Profit atual */
  takeProfit?: number;
  /** Timestamp de abertura */
  openTime: number;
  /** Swap acumulado (Forex) */
  swap?: number;
  /** Comissão */
  commission?: number;
}

/**
 * Parâmetros para modificar posição
 */
export interface ModifyPositionParams {
  /** ID da posição */
  positionId: string;
  /** Novo Stop Loss (preço) */
  stopLoss?: number;
  /** Novo Take Profit (preço) */
  takeProfit?: number;
  /** Novo Stop Loss em pips (relativo ao preço atual) */
  stopLossPips?: number;
  /** Novo Take Profit em pips (relativo ao preço atual) */
  takeProfitPips?: number;
}

/**
 * Estado de conexão do adaptador
 */
export type ConnectionState = 
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "AUTHENTICATED"
  | "ERROR"
  | "RECONNECTING";

/**
 * Eventos emitidos pelo adaptador
 */
export interface BrokerEvents {
  /** Mudança no estado de conexão */
  onConnectionStateChange?: (state: ConnectionState, error?: Error) => void;
  /** Novo tick de preço */
  onPriceTick?: (tick: PriceTick) => void;
  /** Novo candle fechado */
  onCandleClose?: (candle: CandleData) => void;
  /** Posição atualizada */
  onPositionUpdate?: (position: OpenPosition) => void;
  /** Posição fechada */
  onPositionClose?: (positionId: string, pnl: number) => void;
  /** Erro genérico */
  onError?: (error: Error) => void;
}

/**
 * Interface principal do Adaptador de Corretora
 * 
 * Todas as implementações (DerivAdapter, CTraderAdapter) devem seguir esta interface.
 */
export interface IBrokerAdapter {
  /**
   * Tipo da corretora
   */
  readonly brokerType: BrokerType;
  
  /**
   * Estado atual da conexão
   */
  readonly connectionState: ConnectionState;
  
  /**
   * Conecta à corretora e autentica
   * @param credentials Credenciais de acesso
   * @returns Informações da conta conectada
   */
  connect(credentials: BrokerCredentials): Promise<AccountInfo>;
  
  /**
   * Desconecta da corretora
   */
  disconnect(): Promise<void>;
  
  /**
   * Obtém informações atualizadas da conta
   */
  getAccountInfo(): Promise<AccountInfo>;
  
  /**
   * Obtém o preço atual de um símbolo
   * @param symbol Símbolo do ativo
   */
  getPrice(symbol: string): Promise<PriceTick>;
  
  /**
   * Subscreve a atualizações de preço em tempo real
   * @param symbol Símbolo do ativo
   * @param callback Função chamada a cada tick
   */
  subscribePrice(symbol: string, callback: (tick: PriceTick) => void): Promise<void>;
  
  /**
   * Cancela subscrição de preço
   * @param symbol Símbolo do ativo
   */
  unsubscribePrice(symbol: string): Promise<void>;
  
  /**
   * Obtém histórico de candles
   * @param symbol Símbolo do ativo
   * @param timeframe Timeframe (M1, M5, M15, etc.)
   * @param count Quantidade de candles
   */
  getCandleHistory(symbol: string, timeframe: string, count: number): Promise<CandleData[]>;
  
  /**
   * Executa uma ordem de compra/venda
   * @param order Parâmetros da ordem
   * @param maxSpread Spread máximo permitido em pips (opcional - TAREFA B)
   */
  placeOrder(order: OrderRequest, maxSpread?: number): Promise<OrderResult>;
  
  /**
   * Modifica uma posição aberta (SL/TP)
   * @param params Parâmetros de modificação
   */
  modifyPosition(params: ModifyPositionParams): Promise<boolean>;
  
  /**
   * Fecha uma posição aberta
   * @param positionId ID da posição
   */
  closePosition(positionId: string): Promise<OrderResult>;
  
  /**
   * Obtém todas as posições abertas
   */
  getOpenPositions(): Promise<OpenPosition[]>;
  
  /**
   * Registra handlers de eventos
   * @param events Objeto com callbacks de eventos
   */
  setEventHandlers(events: BrokerEvents): void;
  
  /**
   * Verifica se a conexão está ativa e autenticada
   */
  isConnected(): boolean;
  
  /**
   * Obtém símbolos disponíveis para trading
   */
  getAvailableSymbols(): Promise<string[]>;
}

/**
 * Classe base abstrata para adaptadores
 * Fornece implementação comum e helpers
 */
export abstract class BaseBrokerAdapter implements IBrokerAdapter {
  abstract readonly brokerType: BrokerType;
  protected _connectionState: ConnectionState = "DISCONNECTED";
  protected eventHandlers: BrokerEvents = {};
  
  get connectionState(): ConnectionState {
    return this._connectionState;
  }
  
  protected setConnectionState(state: ConnectionState, error?: Error): void {
    this._connectionState = state;
    this.eventHandlers.onConnectionStateChange?.(state, error);
  }
  
  protected emitError(error: Error): void {
    console.error(`[${this.brokerType}Adapter] Error:`, error);
    this.eventHandlers.onError?.(error);
  }
  
  setEventHandlers(events: BrokerEvents): void {
    this.eventHandlers = { ...this.eventHandlers, ...events };
  }
  
  isConnected(): boolean {
    return this._connectionState === "AUTHENTICATED" || this._connectionState === "CONNECTED";
  }
  
  // Métodos abstratos que cada implementação deve fornecer
  abstract connect(credentials: BrokerCredentials): Promise<AccountInfo>;
  abstract disconnect(): Promise<void>;
  abstract getAccountInfo(): Promise<AccountInfo>;
  abstract getPrice(symbol: string): Promise<PriceTick>;
  abstract subscribePrice(symbol: string, callback: (tick: PriceTick) => void): Promise<void>;
  abstract unsubscribePrice(symbol: string): Promise<void>;
  abstract getCandleHistory(symbol: string, timeframe: string, count: number): Promise<CandleData[]>;
  abstract placeOrder(order: OrderRequest, maxSpread?: number): Promise<OrderResult>;
  abstract modifyPosition(params: ModifyPositionParams): Promise<boolean>;
  abstract closePosition(positionId: string): Promise<OrderResult>;
  abstract getOpenPositions(): Promise<OpenPosition[]>;
  abstract getAvailableSymbols(): Promise<string[]>;
}
