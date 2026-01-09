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
   */
  private handleExecutionEvent(event: any): void {
    console.log("[CTraderAdapter] Execution event:", event);
    
    // Atualizar posições se necessário
    if (event.position) {
      const position = this.convertPosition(event.position);
      if (position) {
        this.openPositions.set(position.positionId, position);
        this.eventHandlers.onPositionUpdate?.(position);
      }
    }
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
    
    console.log("[CTraderAdapter] Executando ordem:", order);
    
    // Validações básicas
    if (!order.symbol || !order.direction || !order.lots) {
      return {
        success: false,
        errorMessage: "Parâmetros obrigatórios: symbol, direction, lots",
      };
    }
    
    if (order.lots < 0.01 || order.lots > 100) {
      return {
        success: false,
        errorMessage: "Lote deve estar entre 0.01 e 100",
      };
    }
    
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
      
      // Calcular SL/TP se especificado em pips
      let stopLoss = order.stopLoss;
      let takeProfit = order.takeProfit;
      
      if (order.stopLossPips || order.takeProfitPips) {
        const currentPrice = await this.getPrice(order.symbol);
        const pipValue = getPipValue(order.symbol);
        const entryPrice = order.direction === "BUY" ? currentPrice.ask : currentPrice.bid;
        
        if (order.stopLossPips) {
          stopLoss = order.direction === "BUY" 
            ? entryPrice - (order.stopLossPips * pipValue)
            : entryPrice + (order.stopLossPips * pipValue);
        }
        
        if (order.takeProfitPips) {
          takeProfit = order.direction === "BUY"
            ? entryPrice + (order.takeProfitPips * pipValue)
            : entryPrice - (order.takeProfitPips * pipValue);
        }
      }
      
      const response = await this.client.createMarketOrder(
        symbolId,
        tradeSide,
        order.lots,
        stopLoss,
        takeProfit,
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
   */
  private convertPosition(ctraderPosition: any): OpenPosition | null {
    if (!ctraderPosition) return null;
    
    const symbolName = this.getSymbolNameById(ctraderPosition.tradeData?.symbolId);
    if (!symbolName) return null;
    
    return {
      positionId: String(ctraderPosition.positionId),
      symbol: symbolName,
      direction: ctraderPosition.tradeData?.tradeSide === 1 ? "BUY" : "SELL",
      entryPrice: ctraderPosition.price || 0,
      currentPrice: ctraderPosition.price || 0,
      unrealizedPnL: (ctraderPosition.swap || 0) / 100,
      size: (ctraderPosition.tradeData?.volume || 0) / 100,
      stopLoss: ctraderPosition.stopLoss,
      takeProfit: ctraderPosition.takeProfit,
      openTime: ctraderPosition.tradeData?.openTimestamp || Date.now(),
      swap: (ctraderPosition.swap || 0) / 100,
      commission: (ctraderPosition.commission || 0) / 100,
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
}

// Exportar instância singleton para uso global
export const ctraderAdapter = new CTraderAdapter();
