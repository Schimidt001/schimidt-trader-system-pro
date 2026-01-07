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
  
  // Reconnection
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 5000;
  
  // Symbol cache
  private symbolCache: Map<string, SymbolInfo> = new Map();
  private symbolIdToName: Map<number, string> = new Map();
  
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
        
        // Verificar erro
        if (payloadType === PayloadType.PROTO_OA_ERROR_RES) {
          const ErrorRes = this.protoRoot.lookupType("ProtoOAErrorRes");
          const error = ErrorRes.decode(protoMessage.payload);
          pending.reject(new Error(`cTrader Error: ${(error as any).errorCode} - ${(error as any).description}`));
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
    
    // [DEBUG] Log de todos os eventos recebidos (exceto heartbeat para não poluir)
    if (payloadType !== PayloadType.PROTO_OA_HEARTBEAT_EVENT && payloadType !== 51) {
      console.log(`[CTraderClient] [EVENT] Recebido payloadType: ${payloadType}`);
    }
    
    switch (payloadType) {
      case PayloadType.PROTO_OA_SPOT_EVENT: {
        const SpotEvent = this.protoRoot.lookupType("ProtoOASpotEvent");
        const event = SpotEvent.decode(payload) as any;
        
        // [DEBUG] Verificar tipo do symbolId - pode ser Long do protobuf
        let symbolId = event.symbolId;
        if (typeof symbolId === 'object' && symbolId !== null) {
          // É um Long do protobuf - converter para number
          symbolId = symbolId.toNumber ? symbolId.toNumber() : Number(symbolId);
          console.log(`[CTraderClient] [SPOT] DEBUG: symbolId era Long, convertido para ${symbolId}`);
        }
        
        // [DEBUG] Log do tick recebido
        const symbolName = this.symbolIdToName.get(symbolId) || `ID:${symbolId}`;
        console.log(`[CTraderClient] [SPOT] Tick recebido para ${symbolName}: Bid=${this.priceFromProtocol(event.bid)}, Ask=${this.priceFromProtocol(event.ask)}`);
        
        const spotData: SpotEvent = {
          symbolId: symbolId, // Usar o ID já convertido
          bid: this.priceFromProtocol(event.bid),
          ask: this.priceFromProtocol(event.ask),
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
      
      return {
        symbolId,
        symbolName: s.symbolName,
        digits: s.digits || 5,
        pipPosition: s.pipPosition || 4,
        baseAssetId: s.baseAssetId,
        quoteAssetId: s.quoteAssetId,
      };
    });
    
    // Atualizar cache
    for (const symbol of symbols) {
      this.symbolCache.set(symbol.symbolName, symbol);
      this.symbolIdToName.set(symbol.symbolId, symbol.symbolName);
    }
    
    console.log(`[CTraderClient] [getSymbolsList] ${symbols.length} símbolos carregados no cache interno`);
    
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
   * Subscreve a preços em tempo real
   * 
   * AUDITORIA: Adicionados logs detalhados para debug de subscrição
   */
  async subscribeSpots(symbolIds: number[]): Promise<void> {
    if (!this.accountId) throw new Error("Not authenticated");
    
    // [DEBUG] Log detalhado da subscrição
    const symbolNames = symbolIds.map(id => this.symbolIdToName.get(id) || `ID:${id}`);
    console.log(`[CTraderClient] [SUBSCRIBE] Iniciando subscrição de spots...`);
    console.log(`[CTraderClient] [SUBSCRIBE] Account ID: ${this.accountId}`);
    console.log(`[CTraderClient] [SUBSCRIBE] Symbol IDs: ${symbolIds.join(", ")}`);
    console.log(`[CTraderClient] [SUBSCRIBE] Symbol Names: ${symbolNames.join(", ")}`);
    console.log(`[CTraderClient] [SUBSCRIBE] PayloadType usado: ${PayloadType.PROTO_OA_SUBSCRIBE_SPOTS_REQ} (esperado: 2127)`);
    
    try {
      await this.sendRequest("ProtoOASubscribeSpotsReq", {
        ctidTraderAccountId: this.accountId,
        symbolId: symbolIds,
        subscribeToSpotTimestamp: true,
      }, PayloadType.PROTO_OA_SUBSCRIBE_SPOTS_RES);
      
      console.log(`[CTraderClient] [SUBSCRIBE] ✅ Subscrição confirmada para: ${symbolNames.join(", ")}`);
    } catch (error) {
      console.error(`[CTraderClient] [SUBSCRIBE] ❌ Erro na subscrição:`, error);
      throw error;
    }
  }
  
  /**
   * Cancela subscrição de preços
   */
  async unsubscribeSpots(symbolIds: number[]): Promise<void> {
    if (!this.accountId) throw new Error("Not authenticated");
    
    await this.sendRequest("ProtoOAUnsubscribeSpotsReq", {
      ctidTraderAccountId: this.accountId,
      symbolId: symbolIds,
    }, PayloadType.PROTO_OA_UNSUBSCRIBE_SPOTS_RES);
    
    console.log(`[CTraderClient] Unsubscribed from spots for symbols: ${symbolIds.join(", ")}`);
  }
  
  /**
   * Obtém histórico de candles
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
    
    return (response.trendbar || []).map((bar: any) => {
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
  }
  
  /**
   * Cria uma nova ordem de mercado
   */
  async createMarketOrder(
    symbolId: number,
    tradeSide: TradeSide,
    volume: number,
    stopLoss?: number,
    takeProfit?: number,
    trailingStopLoss?: boolean,
    comment?: string
  ): Promise<any> {
    if (!this.accountId) throw new Error("Not authenticated");
    
    // Volume em 0.01 de unidade (1000 = 10.00 lotes)
    const volumeInProtocol = Math.round(volume * 100);
    
    const orderParams: any = {
      ctidTraderAccountId: this.accountId,
      symbolId,
      orderType: OrderType.MARKET,
      tradeSide,
      volume: volumeInProtocol,
    };
    
    if (stopLoss !== undefined) {
      orderParams.stopLoss = stopLoss;
    }
    
    if (takeProfit !== undefined) {
      orderParams.takeProfit = takeProfit;
    }
    
    if (trailingStopLoss !== undefined) {
      orderParams.trailingStopLoss = trailingStopLoss;
    }
    
    if (comment) {
      orderParams.comment = comment;
    }
    
    const response = await this.sendRequest("ProtoOANewOrderReq", orderParams, PayloadType.PROTO_OA_EXECUTION_EVENT);
    
    return response;
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
   */
  async closePosition(positionId: number, volume?: number): Promise<any> {
    if (!this.accountId) throw new Error("Not authenticated");
    
    const params: any = {
      ctidTraderAccountId: this.accountId,
      positionId,
      volume: volume ? Math.round(volume * 100) : undefined,
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
   * Agenda reconexão
   */
  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    
    console.log(`[CTraderClient] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      if (this.credentials) {
        this.connect(this.credentials).catch((error) => {
          console.error("[CTraderClient] Reconnect failed:", error);
        });
      }
    }, delay);
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
