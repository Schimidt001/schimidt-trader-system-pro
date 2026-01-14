/**
 * CTrader Adapter - IC Markets via cTrader Open API
 * 
 * Implementação do IBrokerAdapter para operações Forex Spot
 * usando a cTrader Open API com Protocol Buffers.
 * 
 * Documentação oficial: https://help.ctrader.com/open-api/
 */

import {
  BaseBrokerAdapter,
  BrokerType,
  BrokerCredentials,
  CTraderCredentials,
  AccountInfo,
  PriceTick,
  CandleData,
  OrderRequest,
  OrderResult,
  ModifyPositionParams,
  OpenPosition,
  ConnectionState,
} from "./IBrokerAdapter";
import { CTraderClient, TradeSide, TrendbarPeriod, SpotEvent, ctraderClient } from "./ctrader/CTraderClient";
import { TrendSniperStrategy, trendSniperStrategy, TrendSniperConfig } from "./ctrader/TrendSniperStrategy";
// REFATORAÇÃO: Importar módulo centralizado de normalização de pips
import { getPipValue, calculateSpreadPips } from "../../shared/normalizationUtils";
// CORREÇÃO 2026-01-13: Importar funções de persistência de posições Forex
import { 
  insertForexPosition, 
  updateForexPosition, 
  getOpenForexPositions,
  getForexPositionById,
} from "../db";
import type { InsertForexPosition } from "../../drizzle/icmarkets-config";

/**
 * Mapeamento de timeframes para cTrader
 */
const TIMEFRAME_MAP: Record<string, TrendbarPeriod> = {
  "M1": TrendbarPeriod.M1,
  "M5": TrendbarPeriod.M5,
  "M15": TrendbarPeriod.M15,
  "M30": TrendbarPeriod.M30,
  "H1": TrendbarPeriod.H1,
  "H4": TrendbarPeriod.H4,
  "D1": TrendbarPeriod.D1,
  "W1": TrendbarPeriod.W1,
};

/**
 * REFATORAÇÃO: PIP_VALUES removido deste arquivo.
 * Agora utiliza o módulo centralizado: shared/normalizationUtils.ts
 * 
 * @see shared/normalizationUtils.ts para a definição centralizada
 */

/**
 * Função utilitária para arredondar preço baseado nos digits do símbolo
 * 
 * CORREÇÃO: Resolve o bug de precisão de ponto flutuante que causava
 * erro INVALID_REQUEST ao enviar ordens com preços como 4434.710000000003
 * 
 * @param price Preço a ser arredondado
 * @param digits Número de casas decimais do símbolo (obtido via getSymbolInfo)
 * @returns Preço arredondado para o número correto de casas decimais
 * 
 * @see https://help.ctrader.com/open-api/model-messages/#protooasymbol
 */
function roundToSymbolDigits(price: number, digits: number): number {
  const multiplier = Math.pow(10, digits);
  return Math.round(price * multiplier) / multiplier;
}

/**
 * Adaptador para IC Markets via cTrader Open API
 */
export class CTraderAdapter extends BaseBrokerAdapter {
  readonly brokerType: BrokerType = "ICMARKETS";
  
  // Cliente cTrader
  private client: CTraderClient;
  
  // Credenciais armazenadas
  private credentials: CTraderCredentials | null = null;
  
  // Estado da conta
  private accountInfo: AccountInfo | null = null;
  
  // Subscrições de preço ativas
  private priceSubscriptions: Map<string, (tick: PriceTick) => void> = new Map();
  private symbolSubscriptions: Map<string, number> = new Map(); // symbolName -> symbolId
  
  // Cache de preços
  private priceCache: Map<string, PriceTick> = new Map();
  
  // Posições abertas
  private openPositions: Map<string, OpenPosition> = new Map();
  
  // Símbolos disponíveis
  private availableSymbols: string[] = [];
  private symbolIdMap: Map<string, number> = new Map();
  private symbolIdToNameMap: Map<number, string> = new Map(); // Mapa reverso: ID -> Nome
  
  // Estratégia Trend Sniper
  private strategy: TrendSniperStrategy;
  
  // CORREÇÃO 2026-01-13: Contexto do usuário para persistência de posições
  private _userId: number | null = null;
  private _botId: number = 1;
  
  constructor() {
    super();
    this.client = ctraderClient;
    this.strategy = trendSniperStrategy;
    
    // Configurar event handlers do cliente
    this.setupClientEventHandlers();
    
    console.log("[CTraderAdapter] Instância criada");
  }
  
  /**
   * Configura handlers de eventos do cliente cTrader
   */
  private setupClientEventHandlers(): void {
    this.client.on("spot", (spotEvent: SpotEvent) => {
      this.handleSpotEvent(spotEvent);
    });
    
    this.client.on("execution", (event: any) => {
      this.handleExecutionEvent(event);
    });
    
    this.client.on("authenticated", (data: any) => {
      console.log(`[CTraderAdapter] Authenticated with account: ${data.accountId}`);
    });
    
    this.client.on("disconnected", (data: any) => {
      console.log(`[CTraderAdapter] Disconnected: ${data.code} - ${data.reason}`);
      this.setConnectionState("DISCONNECTED");
    });
    
    this.client.on("error", (error: Error) => {
      console.error("[CTraderAdapter] Client error:", error);
      this.emitError(error);
    });
  }
  
  /**
   * Processa eventos de preço
   * 
   * AUDITORIA: Adicionado log "Prova de Vida" conforme critério de aceitação
   * CORREÇÃO v3: Múltiplas fontes de mapeamento para garantir resolução do symbolId
   * 
   * Ordem de busca:
   * 1. Mapa reverso local (symbolIdToNameMap) - mais rápido
   * 2. Mapa do CTraderClient (symbolIdToName)
   * 3. Mapa de subscrições ativas (symbolSubscriptions)
   * 4. Busca iterativa no symbolIdMap (fallback)
   */
  private handleSpotEvent(spotEvent: SpotEvent): void {
    // ========== SANITY CHECK - FILTRO DE INTEGRIDADE ==========
    // A API cTrader ocasionalmente envia ticks parciais onde Bid ou Ask é 0.
    // Isso causa cálculos de spread absurdos (ex: 44 milhões de pips) ou negativos.
    // Ignoramos esses ticks inválidos para evitar falsos bloqueios de "Spread Alto".
    // 
    // Referência: Análise de logs 2026-01-07 - 1193 ocorrências de ticks inválidos
    // ============================================================
    if (spotEvent.bid <= 0 || spotEvent.ask <= 0) {
      // Log apenas em modo debug para não poluir os logs de produção
      // console.debug(`[CTraderAdapter] Tick inválido ignorado - symbolId: ${spotEvent.symbolId}, Bid: ${spotEvent.bid}, Ask: ${spotEvent.ask}`);
      return;
    }
    
    // Validação adicional: Ask deve ser maior que Bid (spread positivo)
    if (spotEvent.ask < spotEvent.bid) {
      // console.debug(`[CTraderAdapter] Tick com spread negativo ignorado - symbolId: ${spotEvent.symbolId}, Bid: ${spotEvent.bid}, Ask: ${spotEvent.ask}`);
      return;
    }
    
    let symbolName: string | undefined;
    
    // 1. Tentar mapa reverso local primeiro (O(1))
    symbolName = this.symbolIdToNameMap.get(spotEvent.symbolId);
    
    // 2. Tentar mapa do CTraderClient
    if (!symbolName) {
      symbolName = this.client.getSymbolNameById(spotEvent.symbolId);
      // Se encontrou no client, sincronizar com mapa local
      if (symbolName) {
        this.symbolIdToNameMap.set(spotEvent.symbolId, symbolName);
      }
    }
    
    // 3. Tentar mapa de subscrições ativas (symbolSubscriptions: nome -> id)
    if (!symbolName) {
      for (const [name, id] of Array.from(this.symbolSubscriptions.entries())) {
        if (id === spotEvent.symbolId) {
          symbolName = name;
          // Sincronizar com mapa reverso
          this.symbolIdToNameMap.set(spotEvent.symbolId, name);
          break;
        }
      }
    }
    
    // 4. Fallback: busca iterativa no symbolIdMap
    if (!symbolName) {
      for (const [name, id] of Array.from(this.symbolIdMap.entries())) {
        if (id === spotEvent.symbolId) {
          symbolName = name;
          // Sincronizar com mapa reverso para próximas consultas
          this.symbolIdToNameMap.set(spotEvent.symbolId, name);
          break;
        }
      }
    }
    
    if (!symbolName) {
      // Log detalhado para debug
      console.warn(`[CTraderAdapter] Tick recebido para symbolId desconhecido: ${spotEvent.symbolId}`);
      console.warn(`[CTraderAdapter] Estado dos mapas - IdToName: ${this.symbolIdToNameMap.size}, IdMap: ${this.symbolIdMap.size}, Subscriptions: ${this.symbolSubscriptions.size}`);
      return;
    }
    
    const tick: PriceTick = {
      symbol: symbolName,
      bid: spotEvent.bid,
      ask: spotEvent.ask,
      timestamp: spotEvent.timestamp || Date.now(),
      spread: calculateSpreadPips(spotEvent.bid, spotEvent.ask, symbolName),
    };
    
    // [PROVA DE VIDA] Log conforme critério de aceitação
    console.log(`[CTraderAdapter] Tick recebido para ${symbolName}: Bid: ${tick.bid.toFixed(5)}, Ask: ${tick.ask.toFixed(5)}`);
    
    // Atualizar cache
    this.priceCache.set(symbolName, tick);
    
    // Chamar callback de subscrição
    const callback = this.priceSubscriptions.get(symbolName);
    if (callback) {
      callback(tick);
    }
    
    // Emitir evento
    this.eventHandlers.onPriceTick?.(tick);
  }
  
  /**
   * Processa eventos de execução
   * 
   * CORREÇÃO 2026-01-13: Implementa persistência em tempo real no banco de dados
   * 
   * Tipos de evento de execução (executionType):
   * - ORDER_FILLED: Ordem executada (abrir posição)
   * - ORDER_PARTIAL_FILL: Execução parcial
   * - ORDER_CANCELLED: Ordem cancelada
   * - POSITION_CLOSED: Posição fechada
   * - POSITION_PARTIAL_CLOSE: Fechamento parcial
   * - STOP_LOSS_TRIGGERED: SL atingido
   * - TAKE_PROFIT_TRIGGERED: TP atingido
   * - ORDER_EXPIRED: Ordem expirada
   */
  private async handleExecutionEvent(event: any): Promise<void> {
    // ==================== GLOBAL EXECUTION LISTENER ====================
    // Este handler captura TODOS os eventos de execução da cTrader,
    // independente de qual estratégia (SMC, Hybrid, Manual) originou a ordem.
    // CORREÇÃO CRÍTICA 2026-01-13: Centralização da persistência
    // ===================================================================
    
    console.log("\n[GLOBAL] 🎯 ==================== EXECUTION EVENT RECEIVED ====================");
    console.log("[GLOBAL] 🎯 Este é o GLOBAL EXECUTION LISTENER - captura TODAS as ordens");
    
    // Extrair tipo de execução
    const executionType = event.executionType;
    const position = event.position;
    const order = event.order;
    const deal = event.deal;
    
    // Mapear tipos de execução para nomes legíveis
    const executionTypeNames: Record<number, string> = {
      1: "ORDER_ACCEPTED",
      2: "ORDER_FILLED",
      3: "ORDER_REPLACED",
      4: "ORDER_CANCELLED",
      5: "ORDER_EXPIRED",
      6: "ORDER_REJECTED",
      7: "POSITION_CLOSED",
      8: "STOP_LOSS_TRIGGERED",
      9: "TAKE_PROFIT_TRIGGERED",
      10: "POSITION_PARTIAL_CLOSE",
    };
    const executionTypeName = executionTypeNames[executionType] || `UNKNOWN(${executionType})`;
    
    console.log(`[GLOBAL] 🎯 Tipo de Execução: ${executionTypeName}`);
    console.log(`[GLOBAL] 🎯 Position ID: ${position?.positionId || 'N/A'}`);
    console.log(`[GLOBAL] 🎯 Order ID: ${order?.orderId || 'N/A'}`);
    console.log(`[GLOBAL] 🎯 User Context: userId=${this._userId}, botId=${this._botId}`);
    
    // Atualizar posições em memória
    if (position) {
      const openPosition = this.convertPosition(position);
      if (openPosition) {
        this.openPositions.set(openPosition.positionId, openPosition);
        this.eventHandlers.onPositionUpdate?.(openPosition);
      }
    }
    
    // CORREÇÃO CRÍTICA 2026-01-13: Persistir no banco de dados
    if (!this._userId) {
      console.warn("[GLOBAL] ⚠️ userId NÃO CONFIGURADO - posição NÃO será persistida no banco!");
      console.warn("[GLOBAL] ⚠️ Certifique-se de que setUserContext() foi chamado após connect()");
      console.log("[GLOBAL] 🎯 =================================================================");
      return;
    }
    
    try {
      // ORDER_FILLED (2) ou ORDER_ACCEPTED (1): Nova posição aberta
      if (executionType === 2 || executionType === "ORDER_FILLED") {
        await this.handlePositionOpened(event);
      }
      
      // POSITION_CLOSED (7), STOP_LOSS_TRIGGERED (8), TAKE_PROFIT_TRIGGERED (9): Posição fechada
      else if (
        executionType === 7 || executionType === "POSITION_CLOSED" ||
        executionType === 8 || executionType === "STOP_LOSS_TRIGGERED" ||
        executionType === 9 || executionType === "TAKE_PROFIT_TRIGGERED"
      ) {
        await this.handlePositionClosed(event);
      }
      
      // POSITION_PARTIAL_CLOSE (10): Fechamento parcial
      else if (executionType === 10 || executionType === "POSITION_PARTIAL_CLOSE") {
        await this.handlePositionPartialClose(event);
      }
      
    } catch (error) {
      console.error("[CTraderAdapter] Erro ao persistir evento de execução:", error);
    }
  }
  
  /**
   * Handler para posição aberta (ORDER_FILLED)
   * CORREÇÃO 2026-01-13: Persiste nova posição no banco de dados
   * CORREÇÃO 2026-01-13: Adicionados logs de debug detalhados
   */
  private async handlePositionOpened(event: any): Promise<void> {
    const position = event.position;
    const order = event.order;
    const deal = event.deal;
    
    console.log("[DB] 💾 ==================== GLOBAL EXECUTION LISTENER ====================");
    console.log("[DB] 💾 Evento ORDER_FILLED recebido - Iniciando persistência...");
    
    if (!position) {
      console.warn("[DB] ❌ ORDER_FILLED sem position - ignorando");
      return;
    }
    
    const positionId = String(position.positionId);
    const symbolId = position.tradeData?.symbolId;
    const symbolName = this.getSymbolNameById(symbolId) || `ID:${symbolId}`;
    const direction = position.tradeData?.tradeSide === 1 ? "BUY" : "SELL";
    const volumeInCents = position.tradeData?.volume || 0;
    const volumeInLots = volumeInCents / 10000000;
    const entryPrice = position.price || deal?.executionPrice || 0;
    const stopLoss = position.stopLoss;
    const takeProfit = position.takeProfit;
    
    console.log(`[DB] 💾 Dados da posição:`);
    console.log(`[DB] 💾   - Position ID: ${positionId}`);
    console.log(`[DB] 💾   - Símbolo: ${symbolName}`);
    console.log(`[DB] 💾   - Direção: ${direction}`);
    console.log(`[DB] 💾   - Volume: ${volumeInLots} lotes`);
    console.log(`[DB] 💾   - Preço de Entrada: ${entryPrice}`);
    console.log(`[DB] 💾   - Stop Loss: ${stopLoss || 'N/A'}`);
    console.log(`[DB] 💾   - Take Profit: ${takeProfit || 'N/A'}`);
    console.log(`[DB] 💾   - User ID: ${this._userId}`);
    console.log(`[DB] 💾   - Bot ID: ${this._botId}`);
    
    // Verificar se já existe no banco (evitar duplicatas)
    console.log(`[DB] 💾 Verificando se posição ${positionId} já existe no banco...`);
    const existingPosition = await getForexPositionById(positionId);
    if (existingPosition) {
      console.log(`[DB] 💾 Posição ${positionId} já existe no banco - atualizando`);
      try {
        await updateForexPosition(positionId, {
          entryPrice: String(entryPrice),
          initialStopLoss: stopLoss ? String(stopLoss) : undefined,
          currentStopLoss: stopLoss ? String(stopLoss) : undefined,
          takeProfit: takeProfit ? String(takeProfit) : undefined,
          status: "OPEN",
        });
        console.log(`[DB] ✅ Posição ${positionId} atualizada com sucesso`);
      } catch (updateError) {
        console.error(`[DB] ❌ ERRO ao atualizar posição ${positionId}:`, updateError);
      }
      console.log("[DB] 💾 =================================================================");
      return;
    }
    
    // Inserir nova posição
    console.log(`[DB] 💾 Salvando nova ordem #${positionId} (${symbolName}) no banco de dados...`);
    const newPosition: InsertForexPosition = {
      userId: this._userId!,
      botId: this._botId,
      positionId: positionId,
      openOrderId: order?.orderId ? String(order.orderId) : undefined,
      symbol: symbolName,
      direction: direction,
      lots: String(volumeInLots),
      entryPrice: String(entryPrice),
      initialStopLoss: stopLoss ? String(stopLoss) : undefined,
      currentStopLoss: stopLoss ? String(stopLoss) : undefined,
      takeProfit: takeProfit ? String(takeProfit) : undefined,
      status: "OPEN",
      openTime: new Date(),
    };
    
    try {
      const insertedId = await insertForexPosition(newPosition);
      console.log(`[DB] ✅ Ordem salva com sucesso. ID no banco: ${insertedId}`);
    } catch (insertError) {
      console.error(`[DB] ❌ ERRO ao salvar ordem #${positionId}:`, insertError);
      // Log detalhado do erro para diagnóstico
      if (insertError instanceof Error) {
        console.error(`[DB] ❌ Mensagem: ${insertError.message}`);
        console.error(`[DB] ❌ Stack: ${insertError.stack}`);
      }
    }
    console.log("[DB] 💾 =================================================================");
  }
  
  /**
   * Handler para posição fechada (POSITION_CLOSED, SL, TP)
   * CORREÇÃO 2026-01-13: Atualiza posição no banco com status CLOSED
   * CORREÇÃO 2026-01-13: Adicionados logs de debug detalhados
   */
  private async handlePositionClosed(event: any): Promise<void> {
    const position = event.position;
    const deal = event.deal;
    const executionType = event.executionType;
    
    console.log("[DB] 💾 ==================== GLOBAL CLOSE LISTENER ====================");
    console.log("[DB] 💾 Evento POSITION_CLOSED recebido - Atualizando banco...");
    
    if (!position) {
      console.warn("[DB] ❌ POSITION_CLOSED sem position - ignorando");
      return;
    }
    
    const positionId = String(position.positionId);
    const exitPrice = deal?.executionPrice || position.price || 0;
    const swap = (position.swap || 0) / 100; // Converter de centavos
    const commission = (position.commission || 0) / 100;
    
    // Calcular PnL
    let pnlUsd = 0;
    if (deal?.closePositionDetail) {
      pnlUsd = (deal.closePositionDetail.grossProfit || 0) / 100; // Converter de centavos
    } else if (position.swap !== undefined) {
      // Fallback: usar swap como aproximação do PnL
      pnlUsd = swap;
    }
    
    // Determinar motivo do fechamento
    let closeReason = "MANUAL";
    if (executionType === 8 || executionType === "STOP_LOSS_TRIGGERED") {
      closeReason = "STOP_LOSS";
    } else if (executionType === 9 || executionType === "TAKE_PROFIT_TRIGGERED") {
      closeReason = "TAKE_PROFIT";
    }
    
    console.log(`[DB] 💾 Dados do fechamento:`);
    console.log(`[DB] 💾   - Position ID: ${positionId}`);
    console.log(`[DB] 💾   - Preço de Saída: ${exitPrice}`);
    console.log(`[DB] 💾   - PnL: $${pnlUsd.toFixed(2)}`);
    console.log(`[DB] 💾   - Swap: $${swap.toFixed(2)}`);
    console.log(`[DB] 💾   - Comissão: $${commission.toFixed(2)}`);
    console.log(`[DB] 💾   - Motivo: ${closeReason}`);
    
    // Remover da memória local
    this.openPositions.delete(positionId);
    
    // Atualizar no banco de dados
    console.log(`[DB] 💾 Atualizando posição #${positionId} no banco de dados...`);
    try {
      await updateForexPosition(positionId, {
        exitPrice: String(exitPrice),
        pnlUsd: String(pnlUsd),
        swap: String(swap),
        commission: String(commission),
        status: "CLOSED",
        closeReason: closeReason,
        closeTime: new Date(),
      });
      console.log(`[DB] ✅ Posição #${positionId} atualizada como CLOSED com sucesso`);
    } catch (updateError) {
      console.error(`[DB] ❌ ERRO ao atualizar posição #${positionId}:`, updateError);
      if (updateError instanceof Error) {
        console.error(`[DB] ❌ Mensagem: ${updateError.message}`);
      }
    }
    console.log("[DB] 💾 =================================================================");
    
    // Emitir evento de fechamento
    this.eventHandlers.onPositionClose?.(positionId, pnlUsd);
  }
  
  /**
   * Handler para fechamento parcial
   * CORREÇÃO 2026-01-13: Atualiza posição com volume parcial
   */
  private async handlePositionPartialClose(event: any): Promise<void> {
    const position = event.position;
    const deal = event.deal;
    
    if (!position) {
      console.warn("[CTraderAdapter] POSITION_PARTIAL_CLOSE sem position - ignorando");
      return;
    }
    
    const positionId = String(position.positionId);
    const volumeInCents = position.tradeData?.volume || 0;
    const volumeInLots = volumeInCents / 10000000;
    
    console.log(`[CTraderAdapter] 🟡 FECHAMENTO PARCIAL: ${positionId} | Volume restante: ${volumeInLots} lotes`);
    
    // Atualizar volume no banco
    await updateForexPosition(positionId, {
      lots: String(volumeInLots),
    });
    
    console.log(`[CTraderAdapter] ✅ Posição ${positionId} atualizada com volume parcial`);
  }
  
  /**
   * Define o contexto do usuário para persistência de posições
   * CORREÇÃO 2026-01-13: Método público para configurar userId e botId
   */
  setUserContext(userId: number, botId: number = 1): void {
    this._userId = userId;
    this._botId = botId;
    console.log(`[CTraderAdapter] Contexto de usuário configurado: userId=${userId}, botId=${botId}`);
  }
  
  /**
   * Obtém o contexto atual do usuário
   */
  getUserContext(): { userId: number | null; botId: number } {
    return { userId: this._userId, botId: this._botId };
  }
  
  /**
   * Conecta à cTrader Open API
   */
  async connect(credentials: BrokerCredentials): Promise<AccountInfo> {
    if (credentials.brokerType !== "ICMARKETS") {
      throw new Error("CTraderAdapter só suporta credenciais ICMARKETS");
    }
    
    const ctraderCreds = credentials as CTraderCredentials;
    this.credentials = ctraderCreds;
    
    console.log("[CTraderAdapter] Iniciando conexão...");
    console.log(`[CTraderAdapter] Modo: ${ctraderCreds.isDemo ? "DEMO" : "LIVE"}`);
    
    this.setConnectionState("CONNECTING");
    
    try {
      // Validar credenciais
      if (!ctraderCreds.clientId || !ctraderCreds.clientSecret || !ctraderCreds.accessToken) {
        throw new Error("Credenciais incompletas: clientId, clientSecret e accessToken são obrigatórios");
      }
      
      // Conectar ao cliente cTrader
      await this.client.connect({
        clientId: ctraderCreds.clientId,
        clientSecret: ctraderCreds.clientSecret,
        accessToken: ctraderCreds.accessToken,
        accountId: ctraderCreds.accountId ? Number(ctraderCreds.accountId) : undefined,
        isDemo: ctraderCreds.isDemo,
      });
      
      this.setConnectionState("CONNECTED");
      
      // Obter informações da conta
      const trader = await this.client.getTrader();
      
      this.accountInfo = {
        accountId: String(this.client.currentAccountId),
        balance: trader.balance / 100, // Converter de centavos
        currency: trader.depositAssetId === 1 ? "USD" : "EUR", // Simplificado
        accountType: ctraderCreds.isDemo ? "demo" : "real",
        leverage: trader.leverageInCents / 100,
        accountName: `IC Markets ${ctraderCreds.isDemo ? "Demo" : "Live"}`,
        isDemo: ctraderCreds.isDemo,
      };
      
      this.setConnectionState("AUTHENTICATED");
      
      console.log("[CTraderAdapter] Conexão estabelecida com sucesso");
      console.log(`[CTraderAdapter] Conta: ${this.accountInfo.accountId}`);
      console.log(`[CTraderAdapter] Saldo: ${this.accountInfo.currency} ${this.accountInfo.balance}`);
      
      // Carregar símbolos disponíveis
      await this.loadAvailableSymbols();
      
      return this.accountInfo;
      
    } catch (error) {
      this.setConnectionState("ERROR", error as Error);
      throw error;
    }
  }
  
  /**
   * Desconecta da cTrader Open API
   */
  async disconnect(): Promise<void> {
    console.log("[CTraderAdapter] Desconectando...");
    
    // Cancelar todas as subscrições
    for (const symbol of Array.from(this.priceSubscriptions.keys())) {
      await this.unsubscribePrice(symbol);
    }
    
    // Desconectar cliente
    await this.client.disconnect();
    
    this.credentials = null;
    this.accountInfo = null;
    this.priceCache.clear();
    this.openPositions.clear();
    
    this.setConnectionState("DISCONNECTED");
    
    console.log("[CTraderAdapter] Desconectado");
  }
  
  /**
   * Obtém informações atualizadas da conta
   */
  async getAccountInfo(): Promise<AccountInfo> {
    if (!this.isConnected() || !this.accountInfo) {
      throw new Error("Não conectado à cTrader");
    }
    
    try {
      const trader = await this.client.getTrader();
      
      this.accountInfo = {
        ...this.accountInfo,
        balance: trader.balance / 100,
      };
      
      return this.accountInfo;
    } catch (error) {
      console.error("[CTraderAdapter] Error getting account info:", error);
      return this.accountInfo;
    }
  }
  
  /**
   * Obtém o preço atual de um símbolo
   * 
   * CORREÇÃO v2: Implementa subscrição persistente com logs detalhados
   * - PayloadTypes corrigidos para valores oficiais da API
   * - Logs de debug para rastreamento completo
   * - Timeout aumentado para 15 segundos
   * - Cache com validade de 10 segundos
   */
  async getPrice(symbol: string): Promise<PriceTick> {
    console.log(`[CTraderAdapter] [getPrice] Solicitando preço para ${symbol}...`);
    
    if (!this.isConnected()) {
      console.error(`[CTraderAdapter] [getPrice] Não conectado à cTrader`);
      throw new Error("Não conectado à cTrader");
    }

    // 1. Garantir que símbolos foram carregados
    if (this.symbolIdMap.size === 0) {
      console.log(`[CTraderAdapter] [getPrice] Carregando símbolos disponíveis...`);
      await this.loadAvailableSymbols();
    }

    // 2. Verificar cache primeiro (Validade: 10s)
    const cached = this.priceCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < 10000) {
      console.log(`[CTraderAdapter] [getPrice] Retornando preço do cache para ${symbol}`);
      return cached;
    }

    // 3. Lógica de Subscrição Permanente
    if (!this.symbolSubscriptions.has(symbol)) {
      console.log(`[CTraderAdapter] [getPrice] Criando subscrição permanente para ${symbol}`);
      
      const symbolId = await this.getSymbolId(symbol);
      console.log(`[CTraderAdapter] [getPrice] Symbol ID mapeado: ${symbol} -> ${symbolId}`);
      
      if (!symbolId || symbolId === undefined) {
        console.error(`[CTraderAdapter] [getPrice] ERRO: Symbol ID é undefined para ${symbol}`);
        throw new Error(`Symbol ID não encontrado para ${symbol}`);
      }
      
      this.symbolSubscriptions.set(symbol, symbolId);
      
      // Inscreve para receber Spots (Ticks)
      console.log(`[CTraderAdapter] [getPrice] Enviando subscrição de spots para symbolId: ${symbolId}`);
      await this.client.subscribeSpots([symbolId]);
      console.log(`[CTraderAdapter] [getPrice] Subscrição enviada, aguardando primeiro tick...`);

      // Aguarda o primeiro tick chegar (Timeout: 15s)
      const startWait = Date.now();
      await new Promise<void>((resolve) => {
        const checkCache = setInterval(() => {
          if (this.priceCache.has(symbol)) {
            const elapsed = Date.now() - startWait;
            console.log(`[CTraderAdapter] [getPrice] ✅ Tick recebido após ${elapsed}ms`);
            clearInterval(checkCache);
            resolve();
          }
        }, 100);
        
        setTimeout(() => {
          clearInterval(checkCache);
          const elapsed = Date.now() - startWait;
          console.warn(`[CTraderAdapter] [getPrice] ⚠️ Timeout de ${elapsed}ms atingido sem receber tick`);
          resolve();
        }, 15000);
      });
    } else {
      console.log(`[CTraderAdapter] [getPrice] Subscrição já existe para ${symbol}`);
    }

    // 4. Retorno Final
    const tick = this.priceCache.get(symbol);
    if (!tick) {
      console.error(`[CTraderAdapter] [getPrice] ❌ ERRO CRÍTICO: Preço não disponível para ${symbol}`);
      console.error(`[CTraderAdapter] [getPrice] Estado do cache: ${this.priceCache.size} símbolos`);
      console.error(`[CTraderAdapter] [getPrice] Subscrições ativas: ${Array.from(this.symbolSubscriptions.keys()).join(", ")}`);
      throw new Error(`Preço não disponível para ${symbol}`);
    }

    // ========== SANITY CHECK - VALIDAÇÃO DE RETORNO (CAMADA 3) ==========
    // Garantir que nunca retornamos preços inválidos do cache.
    // Esta é uma camada de segurança adicional caso algum tick inválido
    // tenha passado pelas validações anteriores.
    // 
    // BUG FIX: 2026-01-07 - Spread Alto falso em XAUUSD
    // =====================================================================
    if (tick.bid <= 0 || tick.ask <= 0) {
      console.error(`[CTraderAdapter] [getPrice] ❌ ERRO CRÍTICO: Preço inválido no cache para ${symbol} - Bid: ${tick.bid}, Ask: ${tick.ask}`);
      // Remover o tick inválido do cache para forçar nova subscrição
      this.priceCache.delete(symbol);
      throw new Error(`Preço inválido no cache para ${symbol} (Bid: ${tick.bid}, Ask: ${tick.ask})`);
    }

    console.log(`[CTraderAdapter] [getPrice] ✅ Retornando preço: ${symbol} Bid=${tick.bid} Ask=${tick.ask}`);
    return tick;
  }
  
  /**
   * Subscreve a atualizações de preço em tempo real
   * 
   * CORREÇÃO v3: Garante que o mapa reverso seja populado antes da subscrição
   */
  async subscribePrice(symbol: string, callback: (tick: PriceTick) => void): Promise<void> {
    if (!this.isConnected()) {
      throw new Error("Não conectado à cTrader");
    }
    
    console.log(`[CTraderAdapter] Subscrevendo preço: ${symbol}`);
    
    const symbolId = await this.getSymbolId(symbol);
    
    // Garantir que o mapa reverso tenha esta entrada (CRÍTICO para handleSpotEvent)
    this.symbolIdToNameMap.set(symbolId, symbol);
    console.log(`[CTraderAdapter] [subscribePrice] Mapa reverso atualizado: ${symbolId} -> ${symbol}`);
    
    this.priceSubscriptions.set(symbol, callback);
    this.symbolSubscriptions.set(symbol, symbolId);
    
    await this.client.subscribeSpots([symbolId]);
    
    console.log(`[CTraderAdapter] [subscribePrice] ✅ Subscrição ativa para ${symbol} (ID: ${symbolId})`);
  }
  
  /**
   * Cancela subscrição de preço
   */
  async unsubscribePrice(symbol: string): Promise<void> {
    console.log(`[CTraderAdapter] Cancelando subscrição: ${symbol}`);
    
    const symbolId = this.symbolSubscriptions.get(symbol);
    if (symbolId) {
      await this.client.unsubscribeSpots([symbolId]);
    }
    
    this.priceSubscriptions.delete(symbol);
    this.symbolSubscriptions.delete(symbol);
  }
  
  /**
   * Obtém histórico de candles
   */
  async getCandleHistory(symbol: string, timeframe: string, count: number): Promise<CandleData[]> {
    if (!this.isConnected()) {
      throw new Error("Não conectado à cTrader");
    }
    
    console.log(`[CTraderAdapter] Buscando ${count} candles ${timeframe} de ${symbol}`);
    
    const symbolId = await this.getSymbolId(symbol);
    const period = TIMEFRAME_MAP[timeframe] || TrendbarPeriod.M15;
    
    const toTimestamp = Date.now();
    const fromTimestamp = toTimestamp - (count * this.getTimeframeMs(timeframe));
    
    const trendbars = await this.client.getTrendbars(
      symbolId,
      period,
      fromTimestamp,
      toTimestamp,
      count
    );
    
    return trendbars.map(bar => ({
      symbol,
      timeframe,
      timestamp: Math.floor(bar.timestamp / 1000),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    }));
  }
  
  /**
   * Executa uma ordem de compra/venda
   * 
   * TAREFA B: Adicionado filtro de spread para proteção em Scalping
   * Se (Ask - Bid) > maxSpread -> ABORTAR TRADE
   */
  async placeOrder(order: OrderRequest, maxSpread?: number): Promise<OrderResult> {
    if (!this.isConnected()) {
      return {
        success: false,
        errorMessage: "Não conectado à cTrader",
      };
    }
    
    // ============= LOG DE RASTREIO (DEBUG) =============
    // CORREÇÃO 2026-01-13: Logs detalhados para rastreio do objeto order
    console.log("[CTraderAdapter] [TRACE] ========== RECEBENDO ORDEM ==========");
    console.log(`[CTraderAdapter] [TRACE] symbol: ${order.symbol}`);
    console.log(`[CTraderAdapter] [TRACE] direction: ${order.direction}`);
    console.log(`[CTraderAdapter] [TRACE] orderType: ${order.orderType}`);
    console.log(`[CTraderAdapter] [TRACE] lots: ${order.lots} (tipo: ${typeof order.lots})`);
    console.log(`[CTraderAdapter] [TRACE] stopLossPips: ${order.stopLossPips}`);
    console.log(`[CTraderAdapter] [TRACE] takeProfitPips: ${order.takeProfitPips}`);
    console.log("[CTraderAdapter] [TRACE] ======================================");
    
    // 🛡️ ============= TRAVA DE SEGURANÇA DE VOLUME (KILL SWITCH) =============
    // CORREÇÃO 2026-01-13: Implementação das 3 Travas de Segurança
    // Esta é a primeira linha de defesa contra volumes absurdos
    
    const MAX_ALLOWED_LOTS = 5.0;   // 🚨 Trava Máxima "Anti-Baleia" (5 lotes)
    const MIN_ALLOWED_LOTS = 0.01; // Volume mínimo permitido
    
    // 1️⃣ VERIFICAÇÃO DE INTEGRIDADE (undefined/null/NaN)
    if (order.lots === undefined || order.lots === null || isNaN(order.lots)) {
      console.error(`[CTraderAdapter] [SECURITY_BLOCK] 🚨 CRITICAL: Volume inválido detectado!`);
      console.error(`[CTraderAdapter] [SECURITY_BLOCK] Valor recebido: ${order.lots} (tipo: ${typeof order.lots})`);
      console.error(`[CTraderAdapter] [SECURITY_BLOCK] Possível causa: parâmetro 'lots' não foi passado corretamente`);
      return {
        success: false,
        errorMessage: "SECURITY BLOCK: Volume is undefined, null or NaN. Verifique se está usando 'lots' (não 'volume').",
        errorCode: "SECURITY_INVALID_VOLUME",
      };
    }
    
    // 2️⃣ VERIFICAÇÃO DE LIMITES - "ANTI-BALEIA" (Volume Explosivo)
    if (order.lots > MAX_ALLOWED_LOTS) {
      console.error(`[CTraderAdapter] [SECURITY_BLOCK] 🚨 VOLUME EXPLOSIVO DETECTADO!`);
      console.error(`[CTraderAdapter] [SECURITY_BLOCK] Volume solicitado: ${order.lots} lotes`);
      console.error(`[CTraderAdapter] [SECURITY_BLOCK] Limite máximo: ${MAX_ALLOWED_LOTS} lotes`);
      console.error(`[CTraderAdapter] [SECURITY_BLOCK] Ação: ORDEM BLOQUEADA para proteger a conta`);
      console.error(`[CTraderAdapter] [SECURITY_BLOCK] Diagnóstico: Verifique se houve erro de conversão (lotes vs unidades vs cents)`);
      return {
        success: false,
        errorMessage: `SECURITY BLOCK: Volume ${order.lots} lotes excede o limite de segurança de ${MAX_ALLOWED_LOTS} lotes. Ordem bloqueada.`,
        errorCode: "SECURITY_MAX_VOLUME_EXCEEDED",
      };
    }
    
    // 3️⃣ VERIFICAÇÃO MÍNIMA (Ajuste automático)
    let normalizedLots = order.lots;
    if (normalizedLots < MIN_ALLOWED_LOTS) {
      console.warn(`[CTraderAdapter] [SECURITY_WARN] ⚠️ Volume muito baixo: ${order.lots} lotes`);
      console.warn(`[CTraderAdapter] [SECURITY_WARN] Ajustando para mínimo: ${MIN_ALLOWED_LOTS} lotes`);
      normalizedLots = MIN_ALLOWED_LOTS;
    }
    
    // Arredondar para 2 casas decimais (precisão padrão de lotes)
    normalizedLots = Math.round(normalizedLots * 100) / 100;
    
    // Atualizar o valor do lote na ordem
    order.lots = normalizedLots;
    
    console.log(`[CTraderAdapter] [SECURITY_OK] ✅ Volume validado: ${normalizedLots} lotes (dentro dos limites ${MIN_ALLOWED_LOTS}-${MAX_ALLOWED_LOTS})`);
    // 🛡️ ============= FIM DA TRAVA DE SEGURANÇA =============
    
    // 📊 ============= NORMALIZAÇÃO DE VOLUME (CORREÇÃO TRADING_BAD_VOLUME) =============
    // CORREÇÃO 2026-01-13: Normalizar volume para respeitar minVolume e stepVolume do ativo
    // O erro TRADING_BAD_VOLUME ocorre quando o volume não é múltiplo do stepVolume
    try {
      const symbolInfo = await this.client.getSymbolInfo(order.symbol);
      
      if (symbolInfo) {
        // Os valores da API estão em CENTS (1 lote = 10,000,000 cents)
        const minVolumeLots = symbolInfo.minVolume / 10000000;
        const stepVolumeLots = symbolInfo.stepVolume / 10000000;
        const maxVolumeLots = symbolInfo.maxVolume / 10000000;
        
        const volumeAnterior = normalizedLots;
        
        console.log(`[CTraderAdapter] [VOLUME_NORM] ========== NORMALIZAÇÃO DE VOLUME ==========`);
        console.log(`[CTraderAdapter] [VOLUME_NORM] Símbolo: ${order.symbol}`);
        console.log(`[CTraderAdapter] [VOLUME_NORM] Volume calculado: ${volumeAnterior} lotes`);
        console.log(`[CTraderAdapter] [VOLUME_NORM] Specs do ativo:`);
        console.log(`  - minVolume: ${minVolumeLots} lotes (${symbolInfo.minVolume} cents)`);
        console.log(`  - stepVolume: ${stepVolumeLots} lotes (${symbolInfo.stepVolume} cents)`);
        console.log(`  - maxVolume: ${maxVolumeLots} lotes (${symbolInfo.maxVolume} cents)`);
        
        // 1️⃣ Arredondar para o stepVolume mais próximo (PARA BAIXO por segurança)
        // Fórmula: floor(volume / step) * step
        if (stepVolumeLots > 0) {
          normalizedLots = Math.floor(normalizedLots / stepVolumeLots) * stepVolumeLots;
          // Arredondar para evitar erros de ponto flutuante (ex: 0.019999999 -> 0.02)
          normalizedLots = Math.round(normalizedLots * 100000) / 100000;
        }
        
        // 2️⃣ Garantir que está acima do mínimo
        if (normalizedLots < minVolumeLots) {
          console.warn(`[CTraderAdapter] [VOLUME_NORM] ⚠️ Volume ${normalizedLots} < mínimo ${minVolumeLots}`);
          normalizedLots = minVolumeLots;
        }
        
        // 3️⃣ Garantir que está abaixo do máximo
        if (normalizedLots > maxVolumeLots) {
          console.warn(`[CTraderAdapter] [VOLUME_NORM] ⚠️ Volume ${normalizedLots} > máximo ${maxVolumeLots}`);
          normalizedLots = maxVolumeLots;
        }
        
        // Log do resultado da normalização
        if (volumeAnterior !== normalizedLots) {
          console.log(`[CTraderAdapter] [VOLUME_NORM] 🔄 Normalização: ${volumeAnterior} -> ${normalizedLots} lotes`);
        } else {
          console.log(`[CTraderAdapter] [VOLUME_NORM] ✅ Volume já normalizado: ${normalizedLots} lotes`);
        }
        console.log(`[CTraderAdapter] [VOLUME_NORM] =============================================`);
        
        // Atualizar o valor do lote na ordem
        order.lots = normalizedLots;
      } else {
        console.warn(`[CTraderAdapter] [VOLUME_NORM] ⚠️ Não foi possível obter specs do símbolo, usando volume sem normalização`);
      }
    } catch (normError) {
      console.warn(`[CTraderAdapter] [VOLUME_NORM] ⚠️ Erro na normalização:`, normError);
      // Continuar com o volume atual (fail-open)
    }
    // 📊 ============= FIM DA NORMALIZAÇÃO DE VOLUME =============
    
    // ============= FILTRO DE SPREAD (TAREFA B) =============
    // Verificar spread atual antes de executar a ordem
    if (maxSpread !== undefined && maxSpread > 0) {
      try {
        const currentPrice = await this.getPrice(order.symbol);
        const currentSpreadPips = calculateSpreadPips(currentPrice.bid, currentPrice.ask, order.symbol);
        
        console.log(`[CTraderAdapter] [SPREAD_CHECK] ${order.symbol}: Spread atual = ${currentSpreadPips.toFixed(2)} pips, Máximo = ${maxSpread} pips`);
        
        if (currentSpreadPips > maxSpread) {
          console.warn(`[CTraderAdapter] [SPREAD_CHECK] ❌ TRADE ABORTADO: Spread (${currentSpreadPips.toFixed(2)}) > MaxSpread (${maxSpread})`);
          return {
            success: false,
            errorMessage: `Spread muito alto: ${currentSpreadPips.toFixed(2)} pips > ${maxSpread} pips (máximo permitido)`,
          };
        }
        
        console.log(`[CTraderAdapter] [SPREAD_CHECK] ✅ Spread OK, prosseguindo com a ordem`);
      } catch (spreadError) {
        console.warn(`[CTraderAdapter] [SPREAD_CHECK] ⚠️ Não foi possível verificar spread:`, spreadError);
        // Continuar mesmo sem verificar spread (fail-open)
      }
    }
    
    try {
      const symbolId = await this.getSymbolId(order.symbol);
      const tradeSide = order.direction === "BUY" ? TradeSide.BUY : TradeSide.SELL;
      
      // CORREÇÃO: Obter digits do símbolo para arredondamento correto de preços
      // Isso resolve o bug de precisão de ponto flutuante (ex: 4434.710000000003)
      // Referência: https://help.ctrader.com/open-api/model-messages/#protooasymbol
      let symbolDigits = 5; // Default para pares Forex
      try {
        const symbolInfo = await this.client.getSymbolInfo(order.symbol);
        symbolDigits = symbolInfo.digits;
        console.log(`[CTraderAdapter] [PRICE_PRECISION] ${order.symbol}: digits = ${symbolDigits}`);
      } catch (infoError) {
        // Fallback para valores conhecidos se não conseguir obter do cache
        if (order.symbol.includes('XAU') || order.symbol.includes('XAG')) {
          symbolDigits = 2; // Metais preciosos
        } else if (order.symbol.includes('JPY')) {
          symbolDigits = 3; // Pares com JPY
        } else {
          symbolDigits = 5; // Pares Forex padrão
        }
        console.warn(`[CTraderAdapter] [PRICE_PRECISION] Usando fallback digits = ${symbolDigits} para ${order.symbol}`);
      }
      
      // CORREÇÃO 2026-01-10: Calcular DISTÂNCIAS de SL/TP para ordens de mercado
      // A cTrader API não aceita valores absolutos de SL/TP para ordens MARKET
      // Deve-se usar relativeStopLoss e relativeTakeProfit (distâncias em preço)
      // Documentação: https://help.ctrader.com/open-api/messages/#protooanewordereq
      
      let stopLossDistance: number | undefined;
      let takeProfitDistance: number | undefined;
      
      // Obter preço atual para calcular distâncias
      const currentPrice = await this.getPrice(order.symbol);
      const pipValue = getPipValue(order.symbol);
      const entryPrice = order.direction === "BUY" ? currentPrice.ask : currentPrice.bid;
      
      console.log(`[CTraderAdapter] [SL/TP] Calculando distâncias para ordem de mercado:`);
      console.log(`  - Entry Price: ${entryPrice}`);
      console.log(`  - Pip Value: ${pipValue}`);
      
      // Calcular distância do SL
      if (order.stopLossPips) {
        // Se especificado em pips, converter para distância em preço
        stopLossDistance = order.stopLossPips * pipValue;
        console.log(`  - SL em pips: ${order.stopLossPips} -> distância: ${stopLossDistance}`);
      } else if (order.stopLoss !== undefined) {
        // Se especificado como preço absoluto, calcular a distância
        stopLossDistance = Math.abs(entryPrice - order.stopLoss);
        console.log(`  - SL absoluto: ${order.stopLoss} -> distância: ${stopLossDistance}`);
      }
      
      // Calcular distância do TP
      if (order.takeProfitPips) {
        // Se especificado em pips, converter para distância em preço
        takeProfitDistance = order.takeProfitPips * pipValue;
        console.log(`  - TP em pips: ${order.takeProfitPips} -> distância: ${takeProfitDistance}`);
      } else if (order.takeProfit !== undefined) {
        // Se especificado como preço absoluto, calcular a distância
        takeProfitDistance = Math.abs(order.takeProfit - entryPrice);
        console.log(`  - TP absoluto: ${order.takeProfit} -> distância: ${takeProfitDistance}`);
      }
      
      // Arredondar distâncias para precisão do símbolo
      if (stopLossDistance !== undefined) {
        stopLossDistance = roundToSymbolDigits(stopLossDistance, symbolDigits);
      }
      if (takeProfitDistance !== undefined) {
        takeProfitDistance = roundToSymbolDigits(takeProfitDistance, symbolDigits);
      }
      
      console.log(`[CTraderAdapter] [SL/TP] Distâncias finais: SL=${stopLossDistance}, TP=${takeProfitDistance}`);
      
      const response = await this.client.createMarketOrder(
        symbolId,
        tradeSide,
        order.lots,
        stopLossDistance,
        takeProfitDistance,
        false, // trailingStopLoss - será gerido manualmente
        order.comment
      );
      
      // DEBUG: Log completo da resposta da API para diagnóstico
      console.log("[CTraderAdapter] [DEBUG] Resposta completa da API cTrader:");
      console.log(JSON.stringify(response, null, 2));
      
      // ============= TRATAMENTO DE ERROS MELHORADO =============
      // CORREÇÃO: Verificar se é um erro de ordem (isOrderError) ou erro genérico
      if (response.errorCode || response.isOrderError) {
        const errorCode = String(response.errorCode);
        const errorDesc = response.description || 'Sem descrição';
        
        // Log estruturado do erro
        console.error(`[CTraderAdapter] ❌ ERRO DE EXECUÇÃO:`);
        console.error(`  - Error Code: ${errorCode}`);
        console.error(`  - Descrição: ${errorDesc}`);
        console.error(`  - Símbolo: ${order.symbol}`);
        console.error(`  - Volume: ${order.lots} lotes`);
        console.error(`  - Direção: ${order.direction}`);
        
        // CORREÇÃO: Detectar e armazenar volume mínimo real se disponível
        if (response.detectedMinVolume !== undefined) {
          console.log(`[CTraderAdapter] 📊 Volume mínimo REAL detectado para ${order.symbol}: ${response.detectedMinVolume} lotes`);
          this.client.setDetectedMinVolume(order.symbol, response.detectedMinVolume);
        }
        
        // Mensagens específicas para erros comuns
        let userMessage = `cTrader Error: ${errorCode}`;
        if (errorCode.includes('VOLUME') || errorCode === 'INVALID_VOLUME' || errorCode === 'TRADING_BAD_VOLUME') {
          const minVol = response.detectedMinVolume ? ` Mínimo: ${response.detectedMinVolume} lotes.` : '';
          userMessage = `Volume inválido (${order.lots} lotes).${minVol} Verifique os limites do símbolo.`;
        } else if (errorCode.includes('PERMISSION') || errorCode === 'NO_TRADING_PERMISSION') {
          userMessage = 'Token sem permissão de trading. Verifique se o token tem SCOPE_TRADE.';
        } else if (errorCode.includes('MONEY') || errorCode === 'NOT_ENOUGH_MONEY') {
          userMessage = 'Saldo insuficiente para abrir a posição.';
        } else if (errorCode.includes('MARKET') || errorCode === 'MARKET_CLOSED') {
          userMessage = 'Mercado fechado. Aguarde a abertura.';
        } else {
          userMessage = `${errorCode}: ${errorDesc}`;
        }
        
        return {
          success: false,
          errorMessage: userMessage,
          errorCode: errorCode,
          detectedMinVolume: response.detectedMinVolume,
        };
      }
      
      // Verificar se a posição foi criada
      if (!response.position && !response.deal) {
        console.error("[CTraderAdapter] ❌ Resposta da API não contém position nem deal!");
        console.error("[CTraderAdapter] Resposta recebida:", JSON.stringify(response, null, 2));
        console.error("[CTraderAdapter] Possíveis causas:");
        console.error("  1. Volume inválido (abaixo do mínimo ou acima do máximo)");
        console.error("  2. Token sem permissão de trading (SCOPE_VIEW apenas)");
        console.error("  3. Saldo insuficiente");
        console.error("  4. Mercado fechado");
        console.error("  5. Símbolo inválido ou não disponível");
        return {
          success: false,
          errorMessage: "Ordem não executada: resposta da API vazia. Verifique: volume, permissões do token, saldo e mercado.",
        };
      }
      
      const orderId = response.position?.positionId?.toString() || response.deal?.dealId?.toString() || `ORD-${Date.now()}`;
      const executionPrice = response.position?.price || response.deal?.executionPrice;
      
      // Criar posição local
      if (response.position) {
        const position = this.convertPosition(response.position);
        if (position) {
          this.openPositions.set(position.positionId, position);
        }
      }
      
      console.log(`[CTraderAdapter] Ordem executada: ${orderId} @ ${executionPrice}`);
      
      return {
        success: true,
        orderId,
        executionPrice,
        executionTime: Date.now(),
        rawResponse: response,
      };
      
    } catch (error) {
      console.error("[CTraderAdapter] Error placing order:", error);
      return {
        success: false,
        errorMessage: (error as Error).message,
      };
    }
  }
  
  /**
   * Modifica uma posição aberta (SL/TP)
   */
  async modifyPosition(params: ModifyPositionParams): Promise<boolean> {
    if (!this.isConnected()) {
      throw new Error("Não conectado à cTrader");
    }
    
    const position = this.openPositions.get(params.positionId);
    if (!position) {
      console.error(`[CTraderAdapter] Posição não encontrada: ${params.positionId}`);
      return false;
    }
    
    console.log(`[CTraderAdapter] Modificando posição ${params.positionId}:`, params);
    
    try {
      // CORREÇÃO: Obter digits do símbolo para arredondamento correto de preços
      let symbolDigits = 5; // Default para pares Forex
      try {
        const symbolInfo = await this.client.getSymbolInfo(position.symbol);
        symbolDigits = symbolInfo.digits;
        console.log(`[CTraderAdapter] [PRICE_PRECISION] ${position.symbol}: digits = ${symbolDigits}`);
      } catch (infoError) {
        // Fallback para valores conhecidos
        if (position.symbol.includes('XAU') || position.symbol.includes('XAG')) {
          symbolDigits = 2;
        } else if (position.symbol.includes('JPY')) {
          symbolDigits = 3;
        }
        console.warn(`[CTraderAdapter] [PRICE_PRECISION] Usando fallback digits = ${symbolDigits} para ${position.symbol}`);
      }
      
      // Calcular SL/TP se especificado em pips
      let stopLoss = params.stopLoss;
      let takeProfit = params.takeProfit;
      
      if (params.stopLossPips || params.takeProfitPips) {
        const currentPrice = await this.getPrice(position.symbol);
        const pipValue = getPipValue(position.symbol);
        
        if (params.stopLossPips) {
          stopLoss = position.direction === "BUY"
            ? currentPrice.bid - (params.stopLossPips * pipValue)
            : currentPrice.ask + (params.stopLossPips * pipValue);
        }
        
        if (params.takeProfitPips) {
          takeProfit = position.direction === "BUY"
            ? currentPrice.bid + (params.takeProfitPips * pipValue)
            : currentPrice.ask - (params.takeProfitPips * pipValue);
        }
      }
      
      // CORREÇÃO: Arredondar preços para digits do símbolo antes de enviar
      if (stopLoss !== undefined) {
        stopLoss = roundToSymbolDigits(stopLoss, symbolDigits);
      }
      if (takeProfit !== undefined) {
        takeProfit = roundToSymbolDigits(takeProfit, symbolDigits);
      }
      
      console.log(`[CTraderAdapter] [PRICE_PRECISION] SL/TP arredondados: SL=${stopLoss}, TP=${takeProfit}`);
      
      await this.client.amendPositionSLTP(
        Number(params.positionId),
        stopLoss,
        takeProfit
      );
      
      // Atualizar posição local
      if (stopLoss !== undefined) position.stopLoss = stopLoss;
      if (takeProfit !== undefined) position.takeProfit = takeProfit;
      this.openPositions.set(params.positionId, position);
      
      console.log(`[CTraderAdapter] Posição modificada: SL=${stopLoss}, TP=${takeProfit}`);
      
      return true;
      
    } catch (error) {
      console.error("[CTraderAdapter] Error modifying position:", error);
      return false;
    }
  }
  
  /**
   * Fecha uma posição aberta
   */
  async closePosition(positionId: string): Promise<OrderResult> {
    if (!this.isConnected()) {
      return {
        success: false,
        errorMessage: "Não conectado à cTrader",
      };
    }
    
    const position = this.openPositions.get(positionId);
    if (!position) {
      return {
        success: false,
        errorMessage: `Posição não encontrada: ${positionId}`,
      };
    }
    
    console.log(`[CTraderAdapter] Fechando posição: ${positionId}`);
    
    try {
      const response = await this.client.closePosition(Number(positionId));
      
      const exitPrice = response.deal?.executionPrice;
      const pnl = response.position?.swap || 0; // Simplificado
      
      this.openPositions.delete(positionId);
      
      // Emitir evento de fechamento
      this.eventHandlers.onPositionClose?.(positionId, pnl);
      
      // Processar resultado no compounding
      this.strategy.processTradeResult(pnl, pnl > 0);
      
      console.log(`[CTraderAdapter] Posição fechada: ${positionId} @ ${exitPrice}, PnL: ${pnl}`);
      
      return {
        success: true,
        orderId: positionId,
        executionPrice: exitPrice,
        executionTime: Date.now(),
        rawResponse: response,
      };
      
    } catch (error) {
      console.error("[CTraderAdapter] Error closing position:", error);
      return {
        success: false,
        errorMessage: (error as Error).message,
      };
    }
  }
  
  /**
   * Obtém todas as posições abertas
   */
  async getOpenPositions(): Promise<OpenPosition[]> {
    if (!this.isConnected()) {
      return [];
    }
    
    return Array.from(this.openPositions.values());
  }
  
  /**
   * Obtém símbolos disponíveis para trading
   */
  async getAvailableSymbols(): Promise<string[]> {
    return this.availableSymbols;
  }
  
  // ============= MÉTODOS DA ESTRATÉGIA =============
  
  /**
   * Configura a estratégia Trend Sniper
   */
  configureStrategy(config: Partial<TrendSniperConfig>): void {
    this.strategy.updateConfig(config);
  }
  
  /**
   * Obtém configuração atual da estratégia
   */
  getStrategyConfig(): TrendSniperConfig {
    return this.strategy.getConfig();
  }
  
  /**
   * Analisa sinal de trading
   */
  async analyzeSignal(symbol: string, timeframe: string = "M15"): Promise<any> {
    const candles = await this.getCandleHistory(symbol, timeframe, 250);
    
    const trendbarData = candles.map(c => ({
      timestamp: c.timestamp * 1000,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume || 0,
    }));
    
    return this.strategy.analyzeSignal(trendbarData);
  }
  
  /**
   * Atualiza trailing stop de uma posição
   */
  async updateTrailingStop(positionId: string): Promise<boolean> {
    const position = this.openPositions.get(positionId);
    if (!position) return false;
    
    const currentPrice = await this.getPrice(position.symbol);
    const pipValue = getPipValue(position.symbol);
    
    const price = position.direction === "BUY" ? currentPrice.bid : currentPrice.ask;
    
    const result = this.strategy.calculateTrailingStop(
      position.entryPrice,
      price,
      position.stopLoss || position.entryPrice,
      position.direction === "BUY" ? TradeSide.BUY : TradeSide.SELL,
      pipValue
    );
    
    if (result.shouldUpdate) {
      return await this.modifyPosition({
        positionId,
        stopLoss: result.newStopLoss,
      });
    }
    
    return false;
  }
  
  // ============= MÉTODOS AUXILIARES =============
  
  /**
   * Carrega lista de símbolos disponíveis da API
   * 
   * AUDITORIA: Adicionados logs detalhados para debug de mapeamento
   * CORREÇÃO v3: Popula também o mapa reverso (ID -> Nome) para resolução rápida
   */
  private async loadAvailableSymbols(): Promise<void> {
    console.log(`[CTraderAdapter] [loadSymbols] Carregando símbolos da API...`);
    
    try {
      const symbols = await this.client.getSymbolsList();
      
      this.availableSymbols = symbols.map(s => s.symbolName);
      
      // Limpar mapas anteriores
      this.symbolIdMap.clear();
      this.symbolIdToNameMap.clear();
      
      // Popular ambos os mapas: nome->ID e ID->nome
      // DEBUG: Mostrar os primeiros 10 IDs para verificar o formato
      const first10 = symbols.slice(0, 10);
      console.log(`[CTraderAdapter] [loadSymbols] DEBUG - Primeiros 10 símbolos:`);
      for (const s of first10) {
        console.log(`[CTraderAdapter] [loadSymbols]   -> ${s.symbolName} = ID ${s.symbolId} (tipo: ${typeof s.symbolId})`);
      }
      
      for (const symbol of symbols) {
        this.symbolIdMap.set(symbol.symbolName, symbol.symbolId);
        this.symbolIdToNameMap.set(symbol.symbolId, symbol.symbolName);
      }
      
      // DEBUG: Verificar se IDs 1, 2, 4, 41 estão no mapa
      const testIds = [1, 2, 4, 41];
      console.log(`[CTraderAdapter] [loadSymbols] DEBUG - Verificando IDs de teste:`);
      for (const testId of testIds) {
        const name = this.symbolIdToNameMap.get(testId);
        console.log(`[CTraderAdapter] [loadSymbols]   -> ID ${testId} = ${name || 'NÃO ENCONTRADO'}`);
      }
      
      console.log(`[CTraderAdapter] [loadSymbols] ✅ ${this.availableSymbols.length} símbolos carregados`);
      console.log(`[CTraderAdapter] [loadSymbols] ✅ Mapa reverso populado com ${this.symbolIdToNameMap.size} entradas`);
      
      // Log dos principais símbolos para debug
      const mainSymbols = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "AUDUSD"];
      for (const sym of mainSymbols) {
        const id = this.symbolIdMap.get(sym);
        console.log(`[CTraderAdapter] [loadSymbols] Mapeamento: ${sym} <-> ${id || "NÃO ENCONTRADO"}`);
      }
      
    } catch (error) {
      console.error("[CTraderAdapter] [loadSymbols] ❌ Erro ao carregar símbolos:", error);
      
      // Fallback para lista estática (NÃO RECOMENDADO - apenas para debug)
      console.warn("[CTraderAdapter] [loadSymbols] ⚠️ Usando lista estática de fallback");
      this.availableSymbols = [
        "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
        "EURGBP", "EURJPY", "GBPJPY", "AUDJPY", "EURAUD", "EURNZD", "GBPAUD",
      ];
    }
  }
  
  /**
   * Obtém ID do símbolo pelo nome
   */
  private async getSymbolId(symbolName: string): Promise<number> {
    if (this.symbolIdMap.has(symbolName)) {
      return this.symbolIdMap.get(symbolName)!;
    }
    
    // Tentar carregar símbolos
    await this.loadAvailableSymbols();
    
    if (this.symbolIdMap.has(symbolName)) {
      return this.symbolIdMap.get(symbolName)!;
    }
    
    throw new Error(`Símbolo não encontrado: ${symbolName}`);
  }
  
  /**
   * Obtém informações completas do símbolo (incluindo specs de volume)
   * 
   * REFATORAÇÃO: Novo método para expor specs de volume para normalização
   */
  async getSymbolInfo(symbolName: string): Promise<{
    symbolId: number;
    symbolName: string;
    digits: number;
    pipPosition: number;
    minVolume: number;
    maxVolume: number;
    stepVolume: number;
  } | null> {
    try {
      const symbolInfo = await this.client.getSymbolInfo(symbolName);
      return symbolInfo;
    } catch (error) {
      console.warn(`[CTraderAdapter] Erro ao obter info do símbolo ${symbolName}:`, error);
      return null;
    }
  }
  
  /**
   * CORREÇÃO: Obtém o volume mínimo REAL para um símbolo
   * 
   * Prioriza o volume detectado via erro TRADING_BAD_VOLUME sobre o reportado pela API.
   * Isso é necessário porque algumas contas têm limites diferentes do padrão.
   * 
   * @param symbolName Nome do símbolo (ex: "EURUSD")
   * @returns Volume mínimo em lotes
   */
  getRealMinVolume(symbolName: string): number {
    return this.client.getRealMinVolume(symbolName);
  }
  
  /**
   * CORREÇÃO: Obtém todos os volumes mínimos detectados
   */
  getAllDetectedMinVolumes(): Map<string, number> {
    return this.client.getAllDetectedMinVolumes();
  }
  
  /**
   * Converte posição do formato cTrader para formato interno
   * 
   * CORREÇÃO 2026-01-13: Divisor de volume corrigido de / 100 para / 10000000
   * O protocolo cTrader retorna volume em cents (1 lote = 10,000,000 cents)
   * 
   * Matemática:
   * - 1 Lote = 100,000 Unidades = 10,000,000 Cents
   * - Se API retorna 1,000,000 cents -> 1,000,000 / 10,000,000 = 0.1 lotes
   */
  private convertPosition(ctraderPosition: any): OpenPosition | null {
    if (!ctraderPosition) return null;
    
    const symbolName = this.getSymbolNameById(ctraderPosition.tradeData?.symbolId);
    if (!symbolName) return null;
    
    // CORREÇÃO DEFINITIVA: Converter volume de cents para lotes (1 lote = 10,000,000 cents)
    const volumeInCents = ctraderPosition.tradeData?.volume || 0;
    const volumeInLots = volumeInCents / 10000000;
    
    return {
      positionId: String(ctraderPosition.positionId),
      symbol: symbolName,
      direction: ctraderPosition.tradeData?.tradeSide === 1 ? "BUY" : "SELL",
      entryPrice: ctraderPosition.price || 0,
      currentPrice: ctraderPosition.price || 0,
      unrealizedPnL: (ctraderPosition.swap || 0) / 100, // swap em centavos USD
      size: volumeInLots, // CORREÇÃO: Agora converte corretamente de cents para lotes
      stopLoss: ctraderPosition.stopLoss,
      takeProfit: ctraderPosition.takeProfit,
      openTime: ctraderPosition.tradeData?.openTimestamp || Date.now(),
      swap: (ctraderPosition.swap || 0) / 100, // swap em centavos USD
      commission: (ctraderPosition.commission || 0) / 100, // commission em centavos USD
    };
  }
  
  /**
   * Obtém nome do símbolo pelo ID
   * 
   * CORREÇÃO v3: Usa mapa reverso para busca O(1) em vez de iteração O(n)
   */
  private getSymbolNameById(symbolId: number): string | null {
    // Primeiro tentar o mapa reverso (O(1))
    const fromReverseMap = this.symbolIdToNameMap.get(symbolId);
    if (fromReverseMap) return fromReverseMap;
    
    // Fallback: iteração no mapa original (O(n))
    for (const [name, id] of Array.from(this.symbolIdMap.entries())) {
      if (id === symbolId) {
        // Sincronizar com mapa reverso para próximas consultas
        this.symbolIdToNameMap.set(symbolId, name);
        return name;
      }
    }
    return null;
  }
  
  /**
   * Obtém duração do timeframe em milissegundos
   */
  private getTimeframeMs(timeframe: string): number {
    const map: Record<string, number> = {
      "M1": 60 * 1000,
      "M5": 5 * 60 * 1000,
      "M15": 15 * 60 * 1000,
      "M30": 30 * 60 * 1000,
      "H1": 60 * 60 * 1000,
      "H4": 4 * 60 * 60 * 1000,
      "D1": 24 * 60 * 60 * 1000,
      "W1": 7 * 24 * 60 * 60 * 1000,
    };
    return map[timeframe] || 15 * 60 * 1000;
  }
  
  /**
   * Reconcilia posições abertas com a cTrader e sincroniza com o banco de dados
   * 
   * CORREÇÃO 2026-01-13: Implementa sincronização de posições na inicialização
   * 
   * Este método deve ser chamado após a conexão para garantir que o banco de dados
   * está sincronizado com as posições reais da cTrader.
   * 
   * Lógica:
   * 1. Obtém lista de posições abertas da cTrader via ProtoOAReconcileReq
   * 2. Para cada posição, verifica se existe no banco de dados
   * 3. Se não existir, cria (INSERT)
   * 4. Se existir, atualiza (UPDATE)
   * 5. Marca posições no banco que não existem mais na cTrader como CLOSED
   * 
   * @returns Número de posições sincronizadas
   */
  async reconcilePositions(): Promise<number> {
    if (!this.isConnected()) {
      console.warn("[CTraderAdapter] [RECONCILE] Não conectado - reconciliação adiada");
      return 0;
    }
    
    if (!this._userId) {
      console.warn("[CTraderAdapter] [RECONCILE] userId não configurado - reconciliação adiada");
      return 0;
    }
    
    console.log("[CTraderAdapter] [RECONCILE] Iniciando reconciliação de posições...");
    
    try {
      // 1. Obter posições da cTrader
      const ctraderPositions = await this.client.reconcilePositions();
      console.log(`[CTraderAdapter] [RECONCILE] ${ctraderPositions.length} posições encontradas na cTrader`);
      
      // 2. Obter posições abertas do banco de dados
      const dbPositions = await getOpenForexPositions(this._userId);
      console.log(`[CTraderAdapter] [RECONCILE] ${dbPositions.length} posições abertas no banco de dados`);
      
      // Criar mapa de posições do banco por positionId
      const dbPositionMap = new Map(dbPositions.map(p => [p.positionId, p]));
      
      // Criar set de positionIds da cTrader
      const ctraderPositionIds = new Set(ctraderPositions.map(p => p.positionId));
      
      let syncedCount = 0;
      
      // 3. Para cada posição da cTrader, verificar/criar no banco
      for (const pos of ctraderPositions) {
        const existingPosition = dbPositionMap.get(pos.positionId);
        
        if (!existingPosition) {
          // Posição não existe no banco - criar
          console.log(`[CTraderAdapter] [RECONCILE] Criando posição ${pos.positionId} no banco...`);
          
          const newPosition: InsertForexPosition = {
            userId: this._userId!,
            botId: this._botId,
            positionId: pos.positionId,
            symbol: pos.symbol,
            direction: pos.direction,
            lots: String(pos.lots),
            entryPrice: String(pos.entryPrice),
            initialStopLoss: pos.stopLoss ? String(pos.stopLoss) : undefined,
            currentStopLoss: pos.stopLoss ? String(pos.stopLoss) : undefined,
            takeProfit: pos.takeProfit ? String(pos.takeProfit) : undefined,
            swap: String(pos.swap || 0),
            commission: String(pos.commission || 0),
            status: "OPEN",
            openTime: pos.openTime,
          };
          
          await insertForexPosition(newPosition);
          syncedCount++;
          console.log(`[CTraderAdapter] [RECONCILE] ✅ Posição ${pos.positionId} criada`);
          
        } else {
          // Posição existe - atualizar se necessário
          console.log(`[CTraderAdapter] [RECONCILE] Atualizando posição ${pos.positionId}...`);
          
          await updateForexPosition(pos.positionId, {
            currentStopLoss: pos.stopLoss ? String(pos.stopLoss) : undefined,
            takeProfit: pos.takeProfit ? String(pos.takeProfit) : undefined,
            swap: String(pos.swap || 0),
            commission: String(pos.commission || 0),
          });
          syncedCount++;
        }
        
        // Atualizar memória local
        const openPosition: OpenPosition = {
          positionId: pos.positionId,
          symbol: pos.symbol,
          direction: pos.direction as "BUY" | "SELL",
          entryPrice: pos.entryPrice,
          currentPrice: pos.entryPrice,
          unrealizedPnL: 0,
          size: pos.lots,
          stopLoss: pos.stopLoss,
          takeProfit: pos.takeProfit,
          openTime: pos.openTime.getTime(),
          swap: pos.swap,
          commission: pos.commission,
        };
        this.openPositions.set(pos.positionId, openPosition);
      }
      
      // 4. Marcar posições no banco que não existem mais na cTrader como CLOSED
      for (const dbPos of dbPositions) {
        if (dbPos.positionId && !ctraderPositionIds.has(dbPos.positionId)) {
          console.log(`[CTraderAdapter] [RECONCILE] Posição ${dbPos.positionId} não existe mais na cTrader - marcando como CLOSED`);
          
          await updateForexPosition(dbPos.positionId, {
            status: "CLOSED",
            closeReason: "RECONCILE_SYNC",
            closeTime: new Date(),
          });
          
          // Remover da memória local
          this.openPositions.delete(dbPos.positionId);
        }
      }
      
      console.log(`[CTraderAdapter] [RECONCILE] ✅ Reconciliação concluída: ${syncedCount} posições sincronizadas`);
      return syncedCount;
      
    } catch (error) {
      console.error("[CTraderAdapter] [RECONCILE] Erro na reconciliação:", error);
      throw error;
    }
  }
}

// Exportar instância singleton para uso global
export const ctraderAdapter = new CTraderAdapter();
