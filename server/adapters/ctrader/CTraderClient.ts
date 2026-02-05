/**
 * CTrader Open API Client
 * 
 * Cliente WebSocket para comunicação com a cTrader Open API.
 * Implementa conexão, autenticação e troca de mensagens usando Protocol Buffers.
 * 
 * Documentação: https://help.ctrader.com/open-api/
 */

import WebSocket from "ws";
import protobuf from "protobufjs";
import path from "path";
import { fileURLToPath } from "url";
import { EventEmitter } from "events";

// ESM compatibility - __dirname replacement
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Proto files path - works in both dev and production (bundled)
// In production, esbuild bundles to dist/index.js, so we need to use process.cwd()
const getProtoDir = (): string => {
  // Check if running in production (bundled)
  if (process.env.NODE_ENV === 'production') {
    // In production, proto files are at dist/adapters/ctrader/proto/
    return path.join(process.cwd(), 'dist', 'adapters', 'ctrader', 'proto');
  }
  // In development, use __dirname relative path
  return path.join(__dirname, 'proto');
};

// Configurações dos endpoints
const CTRADER_ENDPOINTS = {
  DEMO: {
    host: "demo.ctraderapi.com",
    port: 5035,
    url: "wss://demo.ctraderapi.com:5035",
  },
  LIVE: {
    host: "live.ctraderapi.com",
    port: 5035,
    url: "wss://live.ctraderapi.com:5035",
  },
};

// Payload Types (principais)
export enum PayloadType {
  // Common - Autenticação e Sistema
  PROTO_OA_APPLICATION_AUTH_REQ = 2100,
  PROTO_OA_APPLICATION_AUTH_RES = 2101,
  PROTO_OA_ACCOUNT_AUTH_REQ = 2102,
  PROTO_OA_ACCOUNT_AUTH_RES = 2103,
  PROTO_OA_ERROR_RES = 2142,
  PROTO_OA_CLIENT_DISCONNECT_EVENT = 2148,
  PROTO_OA_HEARTBEAT_EVENT = 51,  // ProtoHeartbeatEvent (comum)
  
  // Account - Gestão de Conta
  PROTO_OA_TRADER_REQ = 2121,
  PROTO_OA_TRADER_RES = 2122,
  PROTO_OA_TRADER_UPDATE_EVENT = 2123,
  PROTO_OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_REQ = 2149,
  PROTO_OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_RES = 2150,
  
  // Symbols - Lista de Símbolos
  PROTO_OA_SYMBOLS_LIST_REQ = 2114,
  PROTO_OA_SYMBOLS_LIST_RES = 2115,
  PROTO_OA_SYMBOL_BY_ID_REQ = 2116,
  PROTO_OA_SYMBOL_BY_ID_RES = 2117,
  
  // Prices - Subscrição de Preços (CORRIGIDO!)
  PROTO_OA_SUBSCRIBE_SPOTS_REQ = 2127,    // Era 2124 - CORRIGIDO
  PROTO_OA_SUBSCRIBE_SPOTS_RES = 2128,    // Era 2125 - CORRIGIDO
  PROTO_OA_UNSUBSCRIBE_SPOTS_REQ = 2129,  // Era 2126 - CORRIGIDO
  PROTO_OA_UNSUBSCRIBE_SPOTS_RES = 2130,  // Era 2127 - CORRIGIDO
  PROTO_OA_SPOT_EVENT = 2131,             // Era 2128 - CORRIGIDO
  
  // Trendbars - Candles (CORRIGIDO!)
  PROTO_OA_SUBSCRIBE_LIVE_TRENDBAR_REQ = 2135,  // Era 2139 - CORRIGIDO
  PROTO_OA_UNSUBSCRIBE_LIVE_TRENDBAR_REQ = 2136,
  PROTO_OA_GET_TRENDBARS_REQ = 2137,
  PROTO_OA_GET_TRENDBARS_RES = 2138,
  PROTO_OA_SUBSCRIBE_LIVE_TRENDBAR_RES = 2165,  // Era 2140 - CORRIGIDO
  PROTO_OA_UNSUBSCRIBE_LIVE_TRENDBAR_RES = 2166,
  
  // Orders - Ordens
  PROTO_OA_NEW_ORDER_REQ = 2106,
  PROTO_OA_TRAILING_SL_CHANGED_EVENT = 2107,
  PROTO_OA_CANCEL_ORDER_REQ = 2108,
  PROTO_OA_AMEND_ORDER_REQ = 2109,
  PROTO_OA_AMEND_POSITION_SLTP_REQ = 2110,
  PROTO_OA_CLOSE_POSITION_REQ = 2111,
  PROTO_OA_EXECUTION_EVENT = 2126,
  PROTO_OA_ORDER_ERROR_EVENT = 2132,
  
  // Positions - Reconciliação
  PROTO_OA_RECONCILE_REQ = 2124,
  PROTO_OA_RECONCILE_RES = 2125,
}

// Timeframes
export enum TrendbarPeriod {
  M1 = 1,
  M2 = 2,
  M3 = 3,
  M4 = 4,
  M5 = 5,
  M10 = 6,
  M15 = 7,
  M30 = 8,
  H1 = 9,
  H4 = 10,
  H12 = 11,
  D1 = 12,
  W1 = 13,
  MN1 = 14,
}

// Trade Side
export enum TradeSide {
  BUY = 1,
  SELL = 2,
}

// Order Type
export enum OrderType {
  MARKET = 1,
  LIMIT = 2,
  STOP = 3,
  STOP_LIMIT = 4,
}

export interface CTraderCredentials {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  accountId?: number;
  isDemo: boolean;
}

export interface SpotEvent {
  symbolId: number;
  bid: number;
  ask: number;
  timestamp?: number;
}

export interface TrendbarData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SymbolInfo {
  symbolId: number;
  symbolName: string;
  digits: number;
  pipPosition: number;
  baseAssetId: number;
  quoteAssetId: number;
  // Volume specs (em cents - 1 = 0.01 lote)
  minVolume: number;   // Volume mínimo permitido
  maxVolume: number;   // Volume máximo permitido
  stepVolume: number;  // Incremento de volume
}

type MessageHandler = (message: any) => void;

/**
 * Cliente para cTrader Open API
 */
export class CTraderClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private credentials: CTraderCredentials | null = null;
  private isConnected: boolean = false;
  private isAuthenticated: boolean = false;
  private accountId: number | null = null;
  
  // Protobuf root
  private protoRoot: protobuf.Root | null = null;
  private ProtoMessage: protobuf.Type | null = null;
  
  // Message handlers
  private messageHandlers: Map<number, MessageHandler[]> = new Map();
  private pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();
  
  // Heartbeat
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastHeartbeat: number = 0;
  
  // Reconnection - REFATORAÇÃO: Exponential Backoff com Jitter
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private baseReconnectDelay: number = 1000;  // Delay base: 1 segundo
  private maxReconnectDelay: number = 60000;  // Delay máximo: 60 segundos
  
  // Symbol cache
  private symbolCache: Map<string, SymbolInfo> = new Map();
  private symbolIdToName: Map<number, string> = new Map();
  
  // CORREÇÃO: Cache de volume mínimo REAL detectado por símbolo
  // A API pode reportar um minVolume diferente do que a conta realmente aceita
  // Este cache armazena o volume mínimo real detectado via erro TRADING_BAD_VOLUME
  private detectedMinVolumes: Map<string, number> = new Map();
  
  // CORREÇÃO 2026-01-13: Set de símbolos já subscritos para evitar erro ALREADY_SUBSCRIBED
  // Quando tentamos subscrever um símbolo que já está subscrito, a API retorna erro.
  // Este Set rastreia os symbolIds atualmente subscritos para evitar chamadas duplicadas.
  private subscribedSymbolIds: Set<number> = new Set();
  
  constructor() {
    super();
    this.loadProtoFiles();
  }
  
  /**
   * Carrega os arquivos .proto
   */
  private async loadProtoFiles(): Promise<void> {
    try {
      const protoDir = getProtoDir();
      console.log(`[CTraderClient] Loading proto files from: ${protoDir}`);
      
      this.protoRoot = await protobuf.load([
        path.join(protoDir, "OpenApiCommonMessages.proto"),
        path.join(protoDir, "OpenApiCommonModelMessages.proto"),
        path.join(protoDir, "OpenApiModelMessages.proto"),
        path.join(protoDir, "OpenApiMessages.proto"),
      ]);
      
      this.ProtoMessage = this.protoRoot.lookupType("ProtoMessage");
      
      console.log("[CTraderClient] Proto files loaded successfully");
    } catch (error) {
      console.error("[CTraderClient] Failed to load proto files:", error);
      throw error;
    }
  }
  
  /**
   * Conecta ao servidor cTrader
   */
  async connect(credentials: CTraderCredentials): Promise<void> {
    this.credentials = credentials;
    
    const endpoint = credentials.isDemo ? CTRADER_ENDPOINTS.DEMO : CTRADER_ENDPOINTS.LIVE;
    
    console.log(`[CTraderClient] Connecting to ${endpoint.url}...`);
    
    return new Promise((resolve, reject) => {
      // Local Variable Lock - Anti-Race Condition
      const socket = new WebSocket(endpoint.url);
      this.ws = socket;
      
      socket.on("open", async () => {
        // Verificar se este socket ainda é o atual (Anti-Race Condition)
        if (this.ws !== socket) {
          console.log("[CTraderClient] Socket obsoleto detectado no open, ignorando...");
          socket.close();
          return;
        }
        
        console.log("[CTraderClient] WebSocket connected");
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        try {
          // TRACE: Início da autenticação
          console.log("[CTraderClient] [TRACE] Iniciando fluxo de autenticação...");
          
          // Autenticar aplicação
          console.log("[CTraderClient] [TRACE] Etapa 1/3: authenticateApplication() - Iniciando...");
          await this.authenticateApplication();
          console.log("[CTraderClient] [TRACE] Etapa 1/3: authenticateApplication() - Concluída com sucesso");
          
          // Obter contas disponíveis
          console.log("[CTraderClient] [TRACE] Etapa 2/3: getAccountsByAccessToken() - Iniciando...");
          const accounts = await this.getAccountsByAccessToken();
          console.log(`[CTraderClient] [TRACE] Etapa 2/3: getAccountsByAccessToken() - Concluída. Encontradas ${accounts.length} contas`);
          
          if (accounts.length === 0) {
            throw new Error("No trading accounts found for this access token");
          }
          
          // Usar a primeira conta ou a especificada
          this.accountId = credentials.accountId || accounts[0].ctidTraderAccountId;
          console.log(`[CTraderClient] [TRACE] Account ID selecionado: ${this.accountId}`);
          
          // Autenticar conta
          console.log("[CTraderClient] [TRACE] Etapa 3/3: authenticateAccount() - Iniciando...");
          await this.authenticateAccount();
          console.log("[CTraderClient] [TRACE] Etapa 3/3: authenticateAccount() - Concluída com sucesso");
          
          // Iniciar heartbeat
          this.startHeartbeat();
          
          this.isAuthenticated = true;
          this.emit("authenticated", { accountId: this.accountId });
          
          console.log("[CTraderClient] Account authenticated");
          console.log("[CTraderClient] [TRACE] Fluxo de autenticação completo!");
          
          resolve();
        } catch (error) {
          console.error("[CTraderClient] [TRACE] Erro durante autenticação:", error);
          // Sanitizar erro antes de rejeitar
          const msg = error instanceof Error ? error.message : "Erro desconhecido durante autenticação cTrader";
          reject(new Error(msg));
        }
      });
      
      socket.on("message", (data: Buffer) => {
        // Verificar se este socket ainda é o atual (Anti-Race Condition)
        if (this.ws !== socket) return;
        this.handleMessage(data);
      });
      
      socket.on("error", (evt) => {
        // Verificar se este socket ainda é o atual (Anti-Race Condition)
        if (this.ws !== socket) return;
        
        // Sanitizar erro - CRUCIAL para não quebrar o TRPC
        const msg = evt instanceof Error ? evt.message : "Erro desconhecido de conexão cTrader";
        console.error("[CTraderClient] WebSocket error:", msg);
        this.emit("error", new Error(msg));
        reject(new Error(msg)); // Enviar apenas o erro limpo
      });
      
      socket.on("close", (code, reason) => {
        // Verificar se este socket ainda é o atual (Anti-Race Condition)
        if (this.ws !== socket) {
          console.log("[CTraderClient] Socket obsoleto fechado, ignorando...");
          return;
        }
        
        console.log(`[CTraderClient] WebSocket closed: ${code} - ${reason}`);
        this.isConnected = false;
        this.isAuthenticated = false;
        this.stopHeartbeat();
        
        // CORREÇÃO 2026-01-13: Limpar Set de símbolos subscritos ao fechar conexão
        // Isso é necessário porque após reconexão, as subscrições precisam ser refeitas
        const previousCount = this.subscribedSymbolIds.size;
        this.subscribedSymbolIds.clear();
        if (previousCount > 0) {
          console.log(`[CTraderClient] [CLOSE] Limpeza de estado: ${previousCount} subscrições removidas`);
        }
        
        this.emit("disconnected", { code, reason: reason.toString() });
        
        // Tentar reconectar
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      });
    });
  }
  
  /**
   * Desconecta do servidor
   * 
   * CORREÇÃO 2026-01-13: Limpa Set de símbolos subscritos na desconexão
   */
  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    this.isAuthenticated = false;
    this.credentials = null;
    this.accountId = null;
    
    // CORREÇÃO 2026-01-13: Limpar Set de símbolos subscritos
    // Após desconexão, todas as subscrições são perdidas no servidor
    const previousCount = this.subscribedSymbolIds.size;
    this.subscribedSymbolIds.clear();
    console.log(`[CTraderClient] [DISCONNECT] Limpeza de estado: ${previousCount} subscrições removidas`);
  }
  
  /**
   * Autentica a aplicação
   */
  private async authenticateApplication(): Promise<void> {
    if (!this.credentials) throw new Error("No credentials provided");
    
    console.log("[CTraderClient] Authenticating application...");
    console.log(`[CTraderClient] [TRACE] Enviando ProtoOAApplicationAuthReq com clientId: ${this.credentials.clientId.substring(0, 8)}...`);
    
    const startTime = Date.now();
    const response = await this.sendRequest("ProtoOAApplicationAuthReq", {
      clientId: this.credentials.clientId,
      clientSecret: this.credentials.clientSecret,
    }, PayloadType.PROTO_OA_APPLICATION_AUTH_RES);
    
    const elapsed = Date.now() - startTime;
    console.log(`[CTraderClient] [TRACE] ProtoOAApplicationAuthRes recebido em ${elapsed}ms`);
    console.log("[CTraderClient] Application authenticated");
  }
  
  /**
   * Obtém contas disponíveis pelo access token
   */
  private async getAccountsByAccessToken(): Promise<any[]> {
    if (!this.credentials) throw new Error("No credentials provided");
    
    console.log("[CTraderClient] Getting accounts by access token...");
    console.log(`[CTraderClient] [TRACE] Enviando ProtoOAGetAccountListByAccessTokenReq...`);
    
    const startTime = Date.now();
    const response = await this.sendRequest("ProtoOAGetAccountListByAccessTokenReq", {
      accessToken: this.credentials.accessToken,
    }, PayloadType.PROTO_OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_RES);
    
    const elapsed = Date.now() - startTime;
    console.log(`[CTraderClient] [TRACE] ProtoOAGetAccountListByAccessTokenRes recebido em ${elapsed}ms`);
    
    const accounts = response.ctidTraderAccount || [];
    console.log(`[CTraderClient] Found ${accounts.length} trading accounts`);
    
    // Log detalhado das contas encontradas
    if (accounts.length > 0) {
      accounts.forEach((acc: any, idx: number) => {
        console.log(`[CTraderClient] [TRACE] Conta ${idx + 1}: ID=${acc.ctidTraderAccountId}, isLive=${acc.isLive}`);
      });
    }
    
    return accounts;
  }
  
  /**
   * Autentica a conta de trading
   */
  private async authenticateAccount(): Promise<void> {
    if (!this.credentials || !this.accountId) {
      throw new Error("No credentials or account ID");
    }
    
    console.log(`[CTraderClient] Authenticating account ${this.accountId}...`);
    console.log(`[CTraderClient] [TRACE] Enviando ProtoOAAccountAuthReq para conta ${this.accountId}...`);
    
    const startTime = Date.now();
    const response = await this.sendRequest("ProtoOAAccountAuthReq", {
      ctidTraderAccountId: this.accountId,
      accessToken: this.credentials.accessToken,
    }, PayloadType.PROTO_OA_ACCOUNT_AUTH_RES);
    
    const elapsed = Date.now() - startTime;
    console.log(`[CTraderClient] [TRACE] ProtoOAAccountAuthRes recebido em ${elapsed}ms`);
    console.log("[CTraderClient] Account authenticated");
  }
  
  /**
   * Envia uma requisição e aguarda resposta
   */
  private sendRequest(
    messageType: string,
    payload: any,
    expectedResponseType: PayloadType,
    timeout: number = 10000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.protoRoot || !this.ProtoMessage) {
        reject(new Error("Not connected or proto not loaded"));
        return;
      }
      
      const clientMsgId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Criar mensagem
      const MessageType = this.protoRoot.lookupType(messageType);
      const message = MessageType.create(payload);
      const messageBuffer = MessageType.encode(message).finish();
      
      // Obter payload type
      const payloadType = this.getPayloadType(messageType);
      
      // Criar ProtoMessage wrapper
      const protoMessage = this.ProtoMessage.create({
        payloadType,
        payload: messageBuffer,
        clientMsgId,
      });
      
      const buffer = this.ProtoMessage.encode(protoMessage).finish();
      
      // Configurar timeout
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(clientMsgId);
        reject(new Error(`Request timeout: ${messageType}`));
      }, timeout);
      
      // Armazenar request pendente
      this.pendingRequests.set(clientMsgId, {
        resolve,
        reject,
        timeout: timeoutId,
      });
      
      // Enviar
      this.ws.send(buffer);
    });
  }
  
  /**
   * Processa mensagem recebida
   */
  private handleMessage(data: Buffer): void {
    if (!this.protoRoot || !this.ProtoMessage) return;
    
    try {
      const protoMessage = this.ProtoMessage.decode(data) as any;
      const payloadType = protoMessage.payloadType;
      const clientMsgId = protoMessage.clientMsgId;
      
      // Verificar se é resposta a um request pendente
      if (clientMsgId && this.pendingRequests.has(clientMsgId)) {
        const pending = this.pendingRequests.get(clientMsgId)!;
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(clientMsgId);
        
        // Verificar erro genérico
        if (payloadType === PayloadType.PROTO_OA_ERROR_RES) {
          const ErrorRes = this.protoRoot.lookupType("ProtoOAErrorRes");
          const error = ErrorRes.decode(protoMessage.payload);
          pending.reject(new Error(`cTrader Error: ${(error as any).errorCode} - ${(error as any).description}`));
          return;
        }
        
        // CORREÇÃO: Tratar PROTO_OA_ORDER_ERROR_EVENT como resposta a ordem
        // Este evento é retornado quando uma ordem falha (ex: TRADING_BAD_VOLUME)
        if (payloadType === PayloadType.PROTO_OA_ORDER_ERROR_EVENT) {
          const OrderErrorEvent = this.protoRoot.lookupType("ProtoOAOrderErrorEvent");
          const errorEvent = OrderErrorEvent.decode(protoMessage.payload) as any;
          
          console.error(`[CTraderClient] [ORDER_ERROR] Erro de ordem detectado:`);
          console.error(`  - Error Code: ${errorEvent.errorCode}`);
          console.error(`  - Descrição: ${errorEvent.description}`);
          
          // Extrair volume mínimo da mensagem de erro se disponível
          // Formato: "Order volume = X is smaller than minimum allowed volume = Y"
          let detectedMinVolume: number | undefined;
          if (errorEvent.description && errorEvent.description.includes('minimum allowed volume')) {
            const match = errorEvent.description.match(/minimum allowed volume = ([\d.]+)/);
            if (match) {
              detectedMinVolume = parseFloat(match[1]);
              console.log(`[CTraderClient] [ORDER_ERROR] Volume mínimo detectado: ${detectedMinVolume} lotes`);
            }
          }
          
          // Resolver com objeto de erro estruturado (não rejeitar, para permitir tratamento no CTraderAdapter)
          pending.resolve({
            errorCode: errorEvent.errorCode,
            description: errorEvent.description,
            detectedMinVolume,
            isOrderError: true,
          });
          return;
        }
        
        // Decodificar resposta
        const responseType = this.getMessageTypeByPayload(payloadType);
        if (responseType) {
          const ResponseType = this.protoRoot.lookupType(responseType);
          const response = ResponseType.decode(protoMessage.payload);
          pending.resolve(response);
        } else {
          pending.resolve(protoMessage);
        }
        return;
      }
      
      // Processar eventos
      this.processEvent(payloadType, protoMessage.payload);
      
    } catch (error) {
      console.error("[CTraderClient] Error handling message:", error);
    }
  }
  
  /**
   * Processa eventos do servidor
   * 
   * AUDITORIA: Adicionados logs de debug para rastrear eventos recebidos
   */
  private processEvent(payloadType: number, payload: Uint8Array): void {
    if (!this.protoRoot) return;
    
    // OTIMIZAÇÃO: Log de eventos removido para reduzir rate limiting
    // Eventos importantes (EXECUTION, ORDER_ERROR) ainda são logados individualmente
    
    switch (payloadType) {
      case PayloadType.PROTO_OA_SPOT_EVENT: {
        const SpotEvent = this.protoRoot.lookupType("ProtoOASpotEvent");
        const event = SpotEvent.decode(payload) as any;
        
        // Converter symbolId se for Long do protobuf
        let symbolId = event.symbolId;
        if (typeof symbolId === 'object' && symbolId !== null) {
          symbolId = symbolId.toNumber ? symbolId.toNumber() : Number(symbolId);
        }
        
        // Converter preços do protocolo
        const bid = this.priceFromProtocol(event.bid);
        const ask = this.priceFromProtocol(event.ask);
        
        // ========== SANITY CHECK - FILTRO DE INTEGRIDADE (CAMADA 1) ==========
        // A API cTrader ocasionalmente envia ticks parciais onde Bid ou Ask é undefined/0.
        // Rejeitamos esses ticks na ORIGEM para evitar que valores inválidos propaguem
        // pelo sistema e causem cálculos de spread absurdos (ex: 44530 pips).
        // 
        // BUG FIX: 2026-01-07 - Spread Alto falso em XAUUSD
        // Causa: priceFromProtocol retornava 0 para valores undefined
        // =====================================================================
        if (bid <= 0 || ask <= 0) {
          // console.debug(`[CTraderClient] [SPOT] Tick inválido ignorado na origem - symbolId: ${symbolId}, Bid: ${bid}, Ask: ${ask}`);
          break; // Não emitir tick inválido
        }
        
        // Validação adicional: Ask deve ser maior que Bid (spread positivo)
        if (ask < bid) {
          // console.debug(`[CTraderClient] [SPOT] Tick com spread negativo ignorado - symbolId: ${symbolId}, Bid: ${bid}, Ask: ${ask}`);
          break; // Não emitir tick com spread negativo
        }
        
        // OTIMIZAÇÃO: Log de tick removido para reduzir rate limiting
        // Ticks são logados no SMCTradingEngine com throttle de 5 segundos
        
        const spotData: SpotEvent = {
          symbolId: symbolId, // Usar o ID já convertido
          bid: bid,
          ask: ask,
          timestamp: event.timestamp ? Number(event.timestamp) : Date.now(),
        };
        
        this.emit("spot", spotData);
        break;
      }
      
      case PayloadType.PROTO_OA_EXECUTION_EVENT: {
        console.log(`[CTraderClient] [EXECUTION] Evento de execução recebido`);
        const ExecutionEvent = this.protoRoot.lookupType("ProtoOAExecutionEvent");
        const event = ExecutionEvent.decode(payload);
        this.emit("execution", event);
        break;
      }
      
      case PayloadType.PROTO_OA_HEARTBEAT_EVENT:
      case 51: { // ProtoHeartbeatEvent comum
        this.lastHeartbeat = Date.now();
        break;
      }
      
      case PayloadType.PROTO_OA_CLIENT_DISCONNECT_EVENT: {
        const DisconnectEvent = this.protoRoot.lookupType("ProtoOAClientDisconnectEvent");
        const event = DisconnectEvent.decode(payload) as any;
        console.log(`[CTraderClient] [DISCONNECT] Desconectado: ${event.reason}`);
        this.emit("clientDisconnect", event);
        break;
      }
      
      case PayloadType.PROTO_OA_ORDER_ERROR_EVENT: {
        console.log(`[CTraderClient] [ORDER_ERROR] Erro de ordem recebido`);
        const OrderErrorEvent = this.protoRoot.lookupType("ProtoOAOrderErrorEvent");
        const event = OrderErrorEvent.decode(payload) as any;
        console.error(`[CTraderClient] [ORDER_ERROR] Código: ${event.errorCode}, Descrição: ${event.description}`);
        this.emit("orderError", event);
        break;
      }
      
      case PayloadType.PROTO_OA_TRADER_UPDATE_EVENT: {
        console.log(`[CTraderClient] [TRADER_UPDATE] Atualização de conta recebida`);
        const TraderUpdateEvent = this.protoRoot.lookupType("ProtoOATraderUpdatedEvent");
        const event = TraderUpdateEvent.decode(payload);
        this.emit("traderUpdate", event);
        break;
      }
      
      default:
        // [DEBUG] Log de eventos não tratados
        console.log(`[CTraderClient] [UNKNOWN] Evento não tratado: payloadType=${payloadType}`);
        this.emit("message", { payloadType, payload });
    }
  }
  
  /**
   * Obtém lista de símbolos
   */
  async getSymbolsList(): Promise<SymbolInfo[]> {
    if (!this.accountId) throw new Error("Not authenticated");
    
    const response = await this.sendRequest("ProtoOASymbolsListReq", {
      ctidTraderAccountId: this.accountId,
    }, PayloadType.PROTO_OA_SYMBOLS_LIST_RES);
    
    const symbols: SymbolInfo[] = (response.symbol || []).map((s: any) => {
      // Converter Long do protobuf para number se necessário
      let symbolId = s.symbolId;
      if (typeof symbolId === 'object' && symbolId !== null && symbolId.toNumber) {
        symbolId = symbolId.toNumber();
      } else if (typeof symbolId !== 'number') {
        symbolId = Number(symbolId);
      }
      
      // Converter campos Long do protobuf para number
      const convertLong = (val: any, defaultVal: number = 0): number => {
        if (typeof val === 'object' && val !== null && val.toNumber) {
          return val.toNumber();
        }
        return typeof val === 'number' ? val : (Number(val) || defaultVal);
      };
      
      return {
        symbolId,
        symbolName: s.symbolName,
        digits: s.digits || 5,
        pipPosition: s.pipPosition || 4,
        baseAssetId: convertLong(s.baseAssetId),
        quoteAssetId: convertLong(s.quoteAssetId),
        // CORREÇÃO DEFINITIVA: Volume specs em CENTS (protocolo cTrader)
        // Documentação: "Volume in cents (e.g. 1000 in protocol means 10.00 units)"
        // Matemática: 1 Lote = 100,000 Unidades = 10,000,000 Cents
        // A API retorna valores em CENTS
        // 
        // CORREÇÃO 2026-01-14 (TAREFA #1): Default de maxVolume reduzido para 10 lotes
        // O valor anterior (10,000 lotes) era muito alto e não protegia contra erros TRADING_BAD_VOLUME
        // Agora usa 10 lotes (100,000,000 cents) como fallback conservador
        minVolume: convertLong(s.minVolume, 100000),       // Default: 0.01 lotes = 100,000 cents
        maxVolume: convertLong(s.maxVolume, 100000000),    // Default: 10 lotes = 100,000,000 cents (CORREÇÃO)
        stepVolume: convertLong(s.stepVolume, 100000),     // Default: 0.01 lotes = 100,000 cents
      };
    });
    
    // Atualizar cache
    for (const symbol of symbols) {
      this.symbolCache.set(symbol.symbolName, symbol);
      this.symbolIdToName.set(symbol.symbolId, symbol.symbolName);
    }
    
    console.log(`[CTraderClient] [getSymbolsList] ${symbols.length} símbolos carregados no cache interno`);
    
    // Log de debug para alguns símbolos importantes
    // CORREÇÃO 2026-01-14 (TAREFA #1): Log melhorado para mostrar maxVolume em lotes
    const importantSymbols = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'];
    for (const symName of importantSymbols) {
      const sym = this.symbolCache.get(symName);
      if (sym) {
        // CORREÇÃO DEFINITIVA: Mostrar conversão correta (1 lote = 10,000,000 cents)
        const minLots = sym.minVolume / 10000000;
        const maxLots = sym.maxVolume / 10000000;
        const stepLots = sym.stepVolume / 10000000;
        console.log(`[CTraderClient] [VOLUME_SPECS] ${symName}:`);
        console.log(`  - minVolume: ${sym.minVolume} cents = ${minLots} lotes`);
        console.log(`  - maxVolume: ${sym.maxVolume} cents = ${maxLots} lotes`);
        console.log(`  - stepVolume: ${sym.stepVolume} cents = ${stepLots} lotes`);
      }
    }
    
    return symbols;
  }
  
  /**
   * Obtém o mapa de ID para Nome de símbolo
   * Usado pelo CTraderAdapter para sincronizar o mapeamento reverso
   */
  getSymbolIdToNameMap(): Map<number, string> {
    return this.symbolIdToName;
  }
  
  /**
   * Obtém o nome do símbolo pelo ID
   */
  getSymbolNameById(symbolId: number): string | undefined {
    return this.symbolIdToName.get(symbolId);
  }
  
  /**
   * Obtém ID do símbolo pelo nome
   */
  async getSymbolId(symbolName: string): Promise<number> {
    if (this.symbolCache.has(symbolName)) {
      return this.symbolCache.get(symbolName)!.symbolId;
    }
    
    await this.getSymbolsList();
    
    if (this.symbolCache.has(symbolName)) {
      return this.symbolCache.get(symbolName)!.symbolId;
    }
    
    throw new Error(`Symbol not found: ${symbolName}`);
  }
  
  /**
   * Obtém informações completas do símbolo (incluindo specs de volume)
   */
  async getSymbolInfo(symbolName: string): Promise<SymbolInfo> {
    if (this.symbolCache.has(symbolName)) {
      return this.symbolCache.get(symbolName)!;
    }
    
    await this.getSymbolsList();
    
    if (this.symbolCache.has(symbolName)) {
      return this.symbolCache.get(symbolName)!;
    }
    
    throw new Error(`Symbol not found: ${symbolName}`);
  }
  
  /**
   * CORREÇÃO: Obtém o volume mínimo REAL para um símbolo
   * 
   * Prioriza o volume detectado via erro TRADING_BAD_VOLUME sobre o reportado pela API,
   * pois algumas contas têm limites diferentes do padrão.
   * 
   * @param symbolName Nome do símbolo (ex: "EURUSD")
   * @returns Volume mínimo em lotes (ex: 0.01, 1.0, 1000.0)
   */
  getRealMinVolume(symbolName: string): number {
    // Primeiro, verificar se temos um volume mínimo detectado via erro
    const detectedMin = this.detectedMinVolumes.get(symbolName);
    if (detectedMin !== undefined) {
      console.log(`[CTraderClient] [MIN_VOLUME] ${symbolName}: Usando volume mínimo DETECTADO: ${detectedMin} lotes`);
      return detectedMin;
    }
    
    // Fallback: usar o minVolume reportado pela API
    const symbolInfo = this.symbolCache.get(symbolName);
    if (symbolInfo) {
      // CORREÇÃO DEFINITIVA: Converter de CENTS para lotes (1 lote = 10,000,000 cents)
      const apiMinVolume = symbolInfo.minVolume / 10000000;
      console.log(`[CTraderClient] [MIN_VOLUME] ${symbolName}: Usando volume mínimo da API: ${apiMinVolume} lotes (${symbolInfo.minVolume} cents)`);
      return apiMinVolume;
    }
    
    // Default conservador se não houver informação
    console.warn(`[CTraderClient] [MIN_VOLUME] ${symbolName}: Sem informação, usando default: 0.01 lotes`);
    return 0.01;
  }
  
  /**
   * CORREÇÃO: Atualiza o volume mínimo detectado para um símbolo
   * 
   * Chamado quando recebemos erro TRADING_BAD_VOLUME com o volume mínimo real.
   * 
   * @param symbolName Nome do símbolo
   * @param minVolumeLots Volume mínimo em lotes
   */
  setDetectedMinVolume(symbolName: string, minVolumeLots: number): void {
    console.log(`[CTraderClient] [MIN_VOLUME] ${symbolName}: Atualizando volume mínimo detectado para ${minVolumeLots} lotes`);
    this.detectedMinVolumes.set(symbolName, minVolumeLots);
    
    // Emitir evento para que outros componentes possam reagir
    this.emit('minVolumeDetected', { symbolName, minVolumeLots });
  }
  
  /**
   * CORREÇÃO: Obtém todos os volumes mínimos detectados
   */
  getAllDetectedMinVolumes(): Map<string, number> {
    return new Map(this.detectedMinVolumes);
  }
  
  /**
   * Subscreve a preços em tempo real
   * 
   * AUDITORIA: Adicionados logs detalhados para debug de subscrição
   * CORREÇÃO 2026-01-13: Verificação de símbolos já subscritos para evitar erro ALREADY_SUBSCRIBED
   */
  async subscribeSpots(symbolIds: number[]): Promise<void> {
    if (!this.accountId) throw new Error("Not authenticated");
    
    // CORREÇÃO 2026-01-13: Filtrar símbolos que já estão subscritos
    const newSymbolIds = symbolIds.filter(id => !this.subscribedSymbolIds.has(id));
    const alreadySubscribed = symbolIds.filter(id => this.subscribedSymbolIds.has(id));
    
    if (alreadySubscribed.length > 0) {
      const alreadyNames = alreadySubscribed.map(id => this.symbolIdToName.get(id) || `ID:${id}`);
      console.log(`[CTraderClient] [SUBSCRIBE] ⚠️ Símbolos já subscritos (ignorando): ${alreadyNames.join(", ")}`);
    }
    
    // Se todos já estão subscritos, retornar sem fazer nada
    if (newSymbolIds.length === 0) {
      console.log(`[CTraderClient] [SUBSCRIBE] ✅ Todos os símbolos já estão subscritos. Nenhuma ação necessária.`);
      return;
    }
    
    // [DEBUG] Log detalhado da subscrição
    const symbolNames = newSymbolIds.map(id => this.symbolIdToName.get(id) || `ID:${id}`);
    console.log(`[CTraderClient] [SUBSCRIBE] Iniciando subscrição de spots...`);
    console.log(`[CTraderClient] [SUBSCRIBE] Account ID: ${this.accountId}`);
    console.log(`[CTraderClient] [SUBSCRIBE] Symbol IDs (novos): ${newSymbolIds.join(", ")}`);
    console.log(`[CTraderClient] [SUBSCRIBE] Symbol Names: ${symbolNames.join(", ")}`);
    console.log(`[CTraderClient] [SUBSCRIBE] PayloadType usado: ${PayloadType.PROTO_OA_SUBSCRIBE_SPOTS_REQ} (esperado: 2127)`);
    
    try {
      await this.sendRequest("ProtoOASubscribeSpotsReq", {
        ctidTraderAccountId: this.accountId,
        symbolId: newSymbolIds,
        subscribeToSpotTimestamp: true,
      }, PayloadType.PROTO_OA_SUBSCRIBE_SPOTS_RES);
      
      // CORREÇÃO 2026-01-13: Adicionar ao Set de símbolos subscritos
      for (const id of newSymbolIds) {
        this.subscribedSymbolIds.add(id);
      }
      
      console.log(`[CTraderClient] [SUBSCRIBE] ✅ Subscrição confirmada para: ${symbolNames.join(", ")}`);
      console.log(`[CTraderClient] [SUBSCRIBE] Total de símbolos subscritos: ${this.subscribedSymbolIds.size}`);
    } catch (error) {
      console.error(`[CTraderClient] [SUBSCRIBE] ❌ Erro na subscrição:`, error);
      throw error;
    }
  }
  
  /**
   * Cancela subscrição de preços
   * 
   * CORREÇÃO 2026-01-13: Remove símbolos do Set de subscritos após unsubscribe
   */
  async unsubscribeSpots(symbolIds: number[]): Promise<void> {
    if (!this.accountId) throw new Error("Not authenticated");
    
    // Filtrar apenas símbolos que estão realmente subscritos
    const subscribedIds = symbolIds.filter(id => this.subscribedSymbolIds.has(id));
    
    if (subscribedIds.length === 0) {
      console.log(`[CTraderClient] [UNSUBSCRIBE] Nenhum símbolo subscrito para cancelar.`);
      return;
    }
    
    const symbolNames = subscribedIds.map(id => this.symbolIdToName.get(id) || `ID:${id}`);
    console.log(`[CTraderClient] [UNSUBSCRIBE] Cancelando subscrição: ${symbolNames.join(", ")}`);
    
    await this.sendRequest("ProtoOAUnsubscribeSpotsReq", {
      ctidTraderAccountId: this.accountId,
      symbolId: subscribedIds,
    }, PayloadType.PROTO_OA_UNSUBSCRIBE_SPOTS_RES);
    
    // CORREÇÃO 2026-01-13: Remover do Set de símbolos subscritos
    for (const id of subscribedIds) {
      this.subscribedSymbolIds.delete(id);
    }
    
    console.log(`[CTraderClient] [UNSUBSCRIBE] ✅ Subscrição cancelada para: ${symbolNames.join(", ")}`);
    console.log(`[CTraderClient] [UNSUBSCRIBE] Total de símbolos subscritos restantes: ${this.subscribedSymbolIds.size}`);
  }
  
  /**
   * Obtém histórico de candles
   * 
   * ATUALIZADO: Adicionada validação e logs de debug para diagnosticar
   * problema de Swing Points não detetados.
   */
  async getTrendbars(
    symbolId: number,
    period: TrendbarPeriod,
    fromTimestamp: number,
    toTimestamp: number,
    count?: number
  ): Promise<TrendbarData[]> {
    if (!this.accountId) throw new Error("Not authenticated");
    
    const response = await this.sendRequest("ProtoOAGetTrendbarsReq", {
      ctidTraderAccountId: this.accountId,
      symbolId,
      period,
      fromTimestamp,
      toTimestamp,
      count,
    }, PayloadType.PROTO_OA_GET_TRENDBARS_RES);
    
    const rawBars = response.trendbar || [];
    
    // DEBUG: Log de quantidade de candles recebidos
    console.log(`[CTraderClient] getTrendbars: symbolId=${symbolId} period=${period} rawBars=${rawBars.length}`);
    
    // DEBUG: Verificar primeiro e último candle raw
    if (rawBars.length > 0) {
      const firstRaw = rawBars[0];
      const lastRaw = rawBars[rawBars.length - 1];
      console.log(`[CTraderClient] Primeiro raw: low=${firstRaw.low} deltaOpen=${firstRaw.deltaOpen} deltaHigh=${firstRaw.deltaHigh} deltaClose=${firstRaw.deltaClose}`);
      console.log(`[CTraderClient] Último raw: low=${lastRaw.low} deltaOpen=${lastRaw.deltaOpen} deltaHigh=${lastRaw.deltaHigh} deltaClose=${lastRaw.deltaClose}`);
    }
    
    const result = rawBars.map((bar: any) => {
      const low = this.priceFromProtocol(bar.low);
      const open = low + this.priceFromProtocol(bar.deltaOpen || 0);
      const close = low + this.priceFromProtocol(bar.deltaClose || 0);
      const high = low + this.priceFromProtocol(bar.deltaHigh || 0);
      
      return {
        timestamp: (bar.utcTimestampInMinutes || 0) * 60 * 1000,
        open,
        high,
        low,
        close,
        volume: Number(bar.volume || 0),
      };
    });
    
    // DEBUG: Verificar se os candles processados têm valores válidos
    const invalidCandles = result.filter((c: TrendbarData) => c.open === 0 || c.high === 0 || c.low === 0 || c.close === 0);
    if (invalidCandles.length > 0) {
      console.error(`[CTraderClient] ALERTA: ${invalidCandles.length}/${result.length} candles com valores ZERO!`);
    }
    
    // DEBUG: Log do primeiro e último candle processado
    if (result.length > 0) {
      const first = result[0];
      const last = result[result.length - 1];
      console.log(`[CTraderClient] Primeiro processado: O=${first.open.toFixed(5)} H=${first.high.toFixed(5)} L=${first.low.toFixed(5)} C=${first.close.toFixed(5)}`);
      console.log(`[CTraderClient] Último processado: O=${last.open.toFixed(5)} H=${last.high.toFixed(5)} L=${last.low.toFixed(5)} C=${last.close.toFixed(5)}`);
    }
    
    return result;
  }
  
  /**
   * Cria uma nova ordem de mercado
   * 
   * CORREÇÃO 2026-01-10: Para ordens de mercado, a cTrader API NÃO aceita
   * stopLoss/takeProfit como valores absolutos. Deve-se usar relativeStopLoss
   * e relativeTakeProfit em vez disso.
   * 
   * Documentação: https://help.ctrader.com/open-api/messages/#protooanewordereq
   * - stopLoss (absolute): "Not supported for MARKET orders"
   * - takeProfit (absolute): "Unsupported for MARKET orders"
   * - relativeStopLoss: Specified in 1/100000 of unit of a price
   * - relativeTakeProfit: Specified in 1/100000 of unit of a price
   * 
   * @param symbolId ID do símbolo
   * @param tradeSide BUY ou SELL
   * @param volume Volume em lotes
   * @param stopLossDistance Distância do SL em preço (será convertido para relativo)
   * @param takeProfitDistance Distância do TP em preço (será convertido para relativo)
   * @param trailingStopLoss Se true, ativa trailing stop
   * @param comment Comentário da ordem
   */
  async createMarketOrder(
    symbolId: number,
    tradeSide: TradeSide,
    volume: number,
    stopLossDistance?: number,
    takeProfitDistance?: number,
    trailingStopLoss?: boolean,
    comment?: string
  ): Promise<any> {
    if (!this.accountId) throw new Error("Not authenticated");
    
    // 🛡️ ============= TRAVA DE SEGURANÇA DE VOLUME - SEGUNDA LINHA (KILL SWITCH) =============
    // CORREÇÃO 2026-01-13: Segunda camada de defesa (redundância de segurança)
    // Esta validação é a última barreira antes da conversão para cents
    
    const MAX_ALLOWED_LOTS_CLIENT = 5.0;   // 🚨 Trava Máxima (deve ser igual ao Adapter)
    const MIN_ALLOWED_LOTS_CLIENT = 0.01; // Volume mínimo
    
    // 1️⃣ VERIFICAÇÃO DE INTEGRIDADE
    if (volume === undefined || volume === null || isNaN(volume)) {
      console.error(`[CTraderClient] [SECURITY_BLOCK] 🚨 CRITICAL: Volume inválido na camada Client!`);
      console.error(`[CTraderClient] [SECURITY_BLOCK] Valor: ${volume} (tipo: ${typeof volume})`);
      console.error(`[CTraderClient] [SECURITY_BLOCK] ISSO NÃO DEVERIA ACONTECER - O Adapter deveria ter bloqueado!`);
      throw new Error(`SECURITY BLOCK (Client): Volume inválido: ${volume}`);
    }
    
    // 2️⃣ VERIFICAÇÃO DE VOLUME POSITIVO
    if (volume <= 0) {
      console.error(`[CTraderClient] [SECURITY_BLOCK] 🚨 Volume não-positivo: ${volume}`);
      throw new Error(`SECURITY BLOCK (Client): Volume deve ser positivo: ${volume}`);
    }
    
    // 3️⃣ VERIFICAÇÃO "ANTI-BALEIA" (Segunda Camada)
    if (volume > MAX_ALLOWED_LOTS_CLIENT) {
      console.error(`[CTraderClient] [SECURITY_BLOCK] 🚨 VOLUME EXPLOSIVO NA CAMADA CLIENT!`);
      console.error(`[CTraderClient] [SECURITY_BLOCK] Volume: ${volume} lotes > Limite: ${MAX_ALLOWED_LOTS_CLIENT} lotes`);
      console.error(`[CTraderClient] [SECURITY_BLOCK] ALERTA: O Adapter deveria ter bloqueado isso!`);
      console.error(`[CTraderClient] [SECURITY_BLOCK] Possível bypass de segurança detectado!`);
      throw new Error(`SECURITY BLOCK (Client): Volume ${volume} excede limite de ${MAX_ALLOWED_LOTS_CLIENT} lotes`);
    }
    
    // Log de rastreio para debug
    console.log(`[CTraderClient] [TRACE] createMarketOrder recebeu: volume=${volume} lotes`);
    console.log(`[CTraderClient] [SECURITY_OK] ✅ Volume validado na camada Client: ${volume} lotes`);
    // 🛡️ ============= FIM DA TRAVA DE SEGURANÇA (CLIENT) =============
    
    // CORREÇÃO DEFINITIVA DE VOLUME (cTrader Protocol)
    // Documentação: "Volume in cents (e.g. 1000 in protocol means 10.00 units)"
    // 
    // Matemática:
    // - 1 Lote Standard = 100,000 Unidades
    // - 1 Unidade = 100 Cents (no protocolo)
    // - Logo: 1 Lote = 100,000 * 100 = 10,000,000 Cents
    // 
    // Multiplicador: 10,000,000 (Dez Milhões)
    // 
    // Prova Real:
    // - Se volume = 0.01 (Micro Lote)
    // - 0.01 * 10,000,000 = 100,000 Cents = 1,000 Unidades ✅
    const volumeInCents = Math.round(volume * 10000000);
    
    // Log detalhado dos parâmetros da ordem
    console.log(`[CTraderClient] [ORDER] Preparando ordem de mercado:`);
    console.log(`  - Symbol ID: ${symbolId}`);
    console.log(`  - Side: ${tradeSide === TradeSide.BUY ? 'BUY' : 'SELL'}`);
    // CORREÇÃO 2026-01-13: Log corrigido - 1 lote = 100,000 unidades, então cents/100 = unidades
    // Matemática: volumeInCents / 100 = unidades (correto para log)
    console.log(`  - Volume: ${volume} lotes = ${volumeInCents} cents (${volumeInCents/100} unidades)`);
    console.log(`  - Stop Loss Distance: ${stopLossDistance !== undefined ? stopLossDistance : 'N/A'}`);
    console.log(`  - Take Profit Distance: ${takeProfitDistance !== undefined ? takeProfitDistance : 'N/A'}`);
    
    const orderParams: any = {
      ctidTraderAccountId: this.accountId,
      symbolId,
      orderType: OrderType.MARKET,
      tradeSide,
      volume: volumeInCents,
    };
    
    // CORREÇÃO 2026-01-10: Usar relativeStopLoss e relativeTakeProfit para ordens de mercado
    // Documentação cTrader: "Specified in 1/100000 of unit of a price"
    // Exemplo: 0.00150 de distância = 0.00150 * 100000 = 150
    // 
    // IMPORTANTE: Os valores passados aqui são DISTÂNCIAS em preço, não preços absolutos
    // O CTraderAdapter calcula: distância = |entryPrice - stopLossPrice|
    if (stopLossDistance !== undefined && stopLossDistance > 0) {
      // Converter distância em preço para formato cTrader (1/100000)
      const relativeStopLoss = Math.round(stopLossDistance * 100000);
      orderParams.relativeStopLoss = relativeStopLoss;
      console.log(`  - Relative Stop Loss: ${relativeStopLoss} (distância: ${stopLossDistance})`);
    }
    
    if (takeProfitDistance !== undefined && takeProfitDistance > 0) {
      // Converter distância em preço para formato cTrader (1/100000)
      const relativeTakeProfit = Math.round(takeProfitDistance * 100000);
      orderParams.relativeTakeProfit = relativeTakeProfit;
      console.log(`  - Relative Take Profit: ${relativeTakeProfit} (distância: ${takeProfitDistance})`);
    }
    
    if (trailingStopLoss !== undefined) {
      orderParams.trailingStopLoss = trailingStopLoss;
    }
    
    if (comment) {
      orderParams.comment = comment;
    }
    
    console.log(`[CTraderClient] [ORDER] Parâmetros finais:`, JSON.stringify(orderParams, null, 2));
    
    try {
      const response = await this.sendRequest("ProtoOANewOrderReq", orderParams, PayloadType.PROTO_OA_EXECUTION_EVENT);
      
      // Verificar se há erro na resposta
      if (response.errorCode) {
        const errorMsg = this.translateErrorCode(response.errorCode, response.description);
        console.error(`[CTraderClient] [ORDER] ❌ ERRO NA EXECUÇÃO:`);
        console.error(`  - Error Code: ${response.errorCode}`);
        console.error(`  - Descrição: ${errorMsg}`);
        console.error(`  - Resposta completa:`, JSON.stringify(response, null, 2));
      } else {
        console.log(`[CTraderClient] [ORDER] ✅ Ordem enviada com sucesso`);
      }
      
      return response;
    } catch (error) {
      console.error(`[CTraderClient] [ORDER] ❌ EXCEÇÃO ao enviar ordem:`);
      console.error(`  - Erro: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Traduz códigos de erro da cTrader API para mensagens legíveis
   */
  private translateErrorCode(errorCode: string | number, description?: string): string {
    const errorMessages: Record<string, string> = {
      // Erros de Volume
      'INVALID_VOLUME': 'Volume inválido - verifique minVolume, maxVolume e stepVolume do símbolo',
      'NOT_ENOUGH_MONEY': 'Saldo insuficiente para abrir a posição',
      'MAX_EXPOSURE_REACHED': 'Exposição máxima atingida para este símbolo',
      
      // Erros de Símbolo
      'SYMBOL_NOT_FOUND': 'Símbolo não encontrado',
      'TRADING_DISABLED': 'Trading desativado para este símbolo',
      'MARKET_CLOSED': 'Mercado fechado',
      
      // Erros de Permissão
      'NO_TRADING_PERMISSION': 'Token sem permissão de trading (apenas SCOPE_VIEW)',
      'TRADING_BAD_ACCOUNT_STATE': 'Estado da conta não permite trading',
      
      // Erros de Ordem
      'INVALID_STOP_LOSS': 'Stop Loss inválido',
      'INVALID_TAKE_PROFIT': 'Take Profit inválido',
      'INVALID_PRICE': 'Preço inválido',
      
      // Outros
      'TIMEOUT': 'Timeout na execução da ordem',
      'SERVER_ERROR': 'Erro interno do servidor cTrader',
    };
    
    const code = String(errorCode);
    return errorMessages[code] || description || `Erro desconhecido: ${code}`;
  }
  
  /**
   * Modifica SL/TP de uma posição
   */
  async amendPositionSLTP(
    positionId: number,
    stopLoss?: number,
    takeProfit?: number,
    trailingStopLoss?: boolean
  ): Promise<any> {
    if (!this.accountId) throw new Error("Not authenticated");
    
    const params: any = {
      ctidTraderAccountId: this.accountId,
      positionId,
    };
    
    if (stopLoss !== undefined) {
      params.stopLoss = stopLoss;
    }
    
    if (takeProfit !== undefined) {
      params.takeProfit = takeProfit;
    }
    
    if (trailingStopLoss !== undefined) {
      params.trailingStopLoss = trailingStopLoss;
    }
    
    const response = await this.sendRequest("ProtoOAAmendPositionSLTPReq", params, PayloadType.PROTO_OA_EXECUTION_EVENT);
    
    return response;
  }
  
  /**
   * Fecha uma posição
   * 
   * CORREÇÃO 2026-01-13: Multiplicador de volume corrigido de * 100 para * 10000000
   * O protocolo cTrader espera volume em cents (1 lote = 10,000,000 cents)
   * 
   * @param positionId ID da posição a fechar
   * @param volume Volume em lotes a fechar (opcional - se não informado, fecha toda a posição)
   */
  async closePosition(positionId: number, volume?: number): Promise<any> {
    if (!this.accountId) throw new Error("Not authenticated");
    
    // 🛡️ TRAVA DE SEGURANÇA PARA FECHAMENTO DE POSIÇÃO
    if (volume !== undefined) {
      const MAX_CLOSE_LOTS = 5.0;
      if (isNaN(volume) || volume <= 0) {
        console.error(`[CTraderClient] [SECURITY_BLOCK] Volume de fechamento inválido: ${volume}`);
        throw new Error(`SECURITY BLOCK: Volume de fechamento inválido: ${volume}`);
      }
      if (volume > MAX_CLOSE_LOTS) {
        console.error(`[CTraderClient] [SECURITY_BLOCK] Volume de fechamento muito alto: ${volume} > ${MAX_CLOSE_LOTS}`);
        throw new Error(`SECURITY BLOCK: Volume de fechamento ${volume} excede limite de ${MAX_CLOSE_LOTS} lotes`);
      }
    }
    
    // CORREÇÃO DEFINITIVA DE VOLUME (cTrader Protocol)
    // Matemática: 1 Lote = 100,000 Unidades = 10,000,000 Cents
    // Multiplicador: 10,000,000 (Dez Milhões) - igual ao createMarketOrder
    const volumeInCents = volume ? Math.round(volume * 10000000) : undefined;
    
    if (volume) {
      console.log(`[CTraderClient] [CLOSE] Fechando posição ${positionId}: ${volume} lotes = ${volumeInCents} cents`);
    }
    
    const params: any = {
      ctidTraderAccountId: this.accountId,
      positionId,
      volume: volumeInCents,
    };
    
    const response = await this.sendRequest("ProtoOAClosePositionReq", params, PayloadType.PROTO_OA_EXECUTION_EVENT);
    
    return response;
  }
  
  /**
   * Obtém informações da conta
   */
  async getTrader(): Promise<any> {
    if (!this.accountId) throw new Error("Not authenticated");
    
    const response = await this.sendRequest("ProtoOATraderReq", {
      ctidTraderAccountId: this.accountId,
    }, PayloadType.PROTO_OA_TRADER_RES);
    
    return response.trader;
  }
  
  /**
   * Reconcilia posições abertas com a cTrader
   * 
   * CORREÇÃO 2026-01-13: Implementa sincronização de posições na inicialização
   * 
   * Usa ProtoOAReconcileReq para obter lista de posições abertas da conta.
   * Retorna array de posições com dados completos para persistência.
   * 
   * @returns Array de posições abertas da cTrader
   */
  async reconcilePositions(): Promise<any[]> {
    if (!this.accountId) throw new Error("Not authenticated");
    
    console.log("[CTraderClient] [RECONCILE] Iniciando reconciliação de posições...");
    
    try {
      const response = await this.sendRequest("ProtoOAReconcileReq", {
        ctidTraderAccountId: this.accountId,
      }, PayloadType.PROTO_OA_RECONCILE_RES);
      
      const positions = response.position || [];
      const orders = response.order || [];
      
      console.log(`[CTraderClient] [RECONCILE] Recebidas ${positions.length} posições e ${orders.length} ordens`);
      
      // Processar posições
      const processedPositions = positions.map((pos: any) => {
        const symbolId = pos.tradeData?.symbolId;
        const symbolName = this.symbolIdToName.get(symbolId) || `ID:${symbolId}`;
        const volumeInCents = pos.tradeData?.volume || 0;
        const volumeInLots = volumeInCents / 10000000;
        
        return {
          positionId: String(pos.positionId),
          symbol: symbolName,
          symbolId: symbolId,
          direction: pos.tradeData?.tradeSide === 1 ? "BUY" : "SELL",
          lots: volumeInLots,
          entryPrice: pos.price || 0,
          stopLoss: pos.stopLoss,
          takeProfit: pos.takeProfit,
          swap: (pos.swap || 0) / 100,
          commission: (pos.commission || 0) / 100,
          openTime: pos.tradeData?.openTimestamp ? new Date(Number(pos.tradeData.openTimestamp)) : new Date(),
          raw: pos,
        };
      });
      
      console.log(`[CTraderClient] [RECONCILE] Posições processadas:`);
      for (const pos of processedPositions) {
        console.log(`  - ${pos.positionId}: ${pos.symbol} ${pos.direction} ${pos.lots} lotes @ ${pos.entryPrice}`);
      }
      
      return processedPositions;
      
    } catch (error) {
      console.error("[CTraderClient] [RECONCILE] Erro na reconciliação:", error);
      throw error;
    }
  }
  
  // ============= Helpers =============
  
  /**
   * Converte preço do protocolo (1/100000) para decimal
   */
  private priceFromProtocol(value: number | Long | undefined): number {
    if (value === undefined) return 0;
    const num = typeof value === "number" ? value : Number(value);
    return num / 100000;
  }
  
  /**
   * Converte preço decimal para protocolo (1/100000)
   */
  private priceToProtocol(value: number): number {
    return Math.round(value * 100000);
  }
  
  /**
   * Obtém payload type pelo nome da mensagem
   */
  private getPayloadType(messageType: string): number {
    const typeMap: Record<string, number> = {
      "ProtoOAApplicationAuthReq": PayloadType.PROTO_OA_APPLICATION_AUTH_REQ,
      "ProtoOAAccountAuthReq": PayloadType.PROTO_OA_ACCOUNT_AUTH_REQ,
      "ProtoOAGetAccountListByAccessTokenReq": PayloadType.PROTO_OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_REQ,
      "ProtoOATraderReq": PayloadType.PROTO_OA_TRADER_REQ,
      "ProtoOASymbolsListReq": PayloadType.PROTO_OA_SYMBOLS_LIST_REQ,
      "ProtoOASubscribeSpotsReq": PayloadType.PROTO_OA_SUBSCRIBE_SPOTS_REQ,
      "ProtoOAUnsubscribeSpotsReq": PayloadType.PROTO_OA_UNSUBSCRIBE_SPOTS_REQ,
      "ProtoOAGetTrendbarsReq": PayloadType.PROTO_OA_GET_TRENDBARS_REQ,
      "ProtoOANewOrderReq": PayloadType.PROTO_OA_NEW_ORDER_REQ,
      "ProtoOAAmendPositionSLTPReq": PayloadType.PROTO_OA_AMEND_POSITION_SLTP_REQ,
      "ProtoOAClosePositionReq": PayloadType.PROTO_OA_CLOSE_POSITION_REQ,
      "ProtoOAReconcileReq": PayloadType.PROTO_OA_RECONCILE_REQ,
    };
    
    return typeMap[messageType] || 0;
  }
  
  /**
   * Obtém nome do tipo de mensagem pelo payload type
   */
  private getMessageTypeByPayload(payloadType: number): string | null {
    const typeMap: Record<number, string> = {
      [PayloadType.PROTO_OA_APPLICATION_AUTH_RES]: "ProtoOAApplicationAuthRes",
      [PayloadType.PROTO_OA_ACCOUNT_AUTH_RES]: "ProtoOAAccountAuthRes",
      [PayloadType.PROTO_OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_RES]: "ProtoOAGetAccountListByAccessTokenRes",
      [PayloadType.PROTO_OA_TRADER_RES]: "ProtoOATraderRes",
      [PayloadType.PROTO_OA_SYMBOLS_LIST_RES]: "ProtoOASymbolsListRes",
      [PayloadType.PROTO_OA_SUBSCRIBE_SPOTS_RES]: "ProtoOASubscribeSpotsRes",
      [PayloadType.PROTO_OA_UNSUBSCRIBE_SPOTS_RES]: "ProtoOAUnsubscribeSpotsRes",
      [PayloadType.PROTO_OA_GET_TRENDBARS_RES]: "ProtoOAGetTrendbarsRes",
      [PayloadType.PROTO_OA_ERROR_RES]: "ProtoOAErrorRes",
    };
    
    return typeMap[payloadType] || null;
  }
  
  /**
   * Inicia heartbeat
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Enviar heartbeat (mensagem vazia)
        this.ws.ping();
      }
    }, 10000);
  }
  
  /**
   * Para heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
  
  /**
   * Agenda reconexão com Exponential Backoff + Jitter
   * 
   * REFATORAÇÃO: Implementação de backoff exponencial para evitar
   * sobrecarga da API e possível bloqueio de IP pela corretora.
   * 
   * Fórmula: delay = min(baseDelay * 2^attempts, maxDelay) + jitter
   * Jitter: valor aleatório entre 0 e 1000ms para evitar "thundering herd"
   */
  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    
    // Exponential Backoff: delay = baseDelay * 2^(attempts-1)
    const exponentialDelay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    // Limitar ao delay máximo
    const cappedDelay = Math.min(exponentialDelay, this.maxReconnectDelay);
    
    // Adicionar jitter (0-1000ms) para evitar reconexões simultâneas
    const jitter = Math.floor(Math.random() * 1000);
    const finalDelay = cappedDelay + jitter;
    
    console.log(`[CTraderClient] 🔄 Scheduling reconnect in ${finalDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    console.log(`[CTraderClient]    Base: ${this.baseReconnectDelay}ms | Exponential: ${exponentialDelay}ms | Capped: ${cappedDelay}ms | Jitter: ${jitter}ms`);
    
    setTimeout(() => {
      if (this.credentials) {
        console.log(`[CTraderClient] 🔄 Attempting reconnection #${this.reconnectAttempts}...`);
        this.connect(this.credentials).catch((error) => {
          console.error(`[CTraderClient] ❌ Reconnect #${this.reconnectAttempts} failed:`, error);
          
          // Se ainda não atingiu o máximo, agendar próxima tentativa
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          } else {
            console.error(`[CTraderClient] 🛑 Max reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
            this.emit("reconnect_failed", { attempts: this.reconnectAttempts });
          }
        });
      }
    }, finalDelay);
  }
  
  // Getters
  get connected(): boolean {
    return this.isConnected;
  }
  
  get authenticated(): boolean {
    return this.isAuthenticated;
  }
  
  get currentAccountId(): number | null {
    return this.accountId;
  }
}

// Exportar instância singleton
export const ctraderClient = new CTraderClient();

// Type para Long (protobufjs)
interface Long {
  low: number;
  high: number;
  unsigned: boolean;
  toNumber(): number;
}
