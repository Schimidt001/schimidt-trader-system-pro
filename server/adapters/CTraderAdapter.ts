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
 * Pip values para diferentes pares
 */
const PIP_VALUES: Record<string, number> = {
  "EURUSD": 0.0001,
  "GBPUSD": 0.0001,
  "USDJPY": 0.01,
  "AUDUSD": 0.0001,
  "USDCAD": 0.0001,
  "USDCHF": 0.0001,
  "NZDUSD": 0.0001,
  "EURGBP": 0.0001,
  "EURJPY": 0.01,
  "GBPJPY": 0.01,
  "AUDJPY": 0.01,
  "EURAUD": 0.0001,
  "EURNZD": 0.0001,
  "GBPAUD": 0.0001,
};

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
   */
  private handleSpotEvent(spotEvent: SpotEvent): void {
    // Encontrar nome do símbolo pelo ID
    let symbolName: string | undefined;
    for (const [name, id] of Array.from(this.symbolIdMap.entries())) {
      if (id === spotEvent.symbolId) {
        symbolName = name;
        break;
      }
    }
    
    if (!symbolName) return;
    
    const tick: PriceTick = {
      symbol: symbolName,
      bid: spotEvent.bid,
      ask: spotEvent.ask,
      timestamp: spotEvent.timestamp || Date.now(),
      spread: (spotEvent.ask - spotEvent.bid) / (PIP_VALUES[symbolName] || 0.0001),
    };
    
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
   */
  async getPrice(symbol: string): Promise<PriceTick> {
    if (!this.isConnected()) {
      throw new Error("Não conectado à cTrader");
    }
    
    // Verificar cache primeiro
    const cached = this.priceCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < 5000) {
      return cached;
    }
    
    // Se não tiver subscrição ativa, criar uma temporária
    if (!this.priceSubscriptions.has(symbol)) {
      const symbolId = await this.getSymbolId(symbol);
      await this.client.subscribeSpots([symbolId]);
      
      // Aguardar primeiro tick
      await new Promise<void>((resolve) => {
        const checkCache = setInterval(() => {
          if (this.priceCache.has(symbol)) {
            clearInterval(checkCache);
            resolve();
          }
        }, 100);
        
        // Timeout após 5 segundos
        setTimeout(() => {
          clearInterval(checkCache);
          resolve();
        }, 5000);
      });
      
      // Cancelar subscrição temporária
      await this.client.unsubscribeSpots([symbolId]);
    }
    
    const tick = this.priceCache.get(symbol);
    if (!tick) {
      throw new Error(`Preço não disponível para ${symbol}`);
    }
    
    return tick;
  }
  
  /**
   * Subscreve a atualizações de preço em tempo real
   */
  async subscribePrice(symbol: string, callback: (tick: PriceTick) => void): Promise<void> {
    if (!this.isConnected()) {
      throw new Error("Não conectado à cTrader");
    }
    
    console.log(`[CTraderAdapter] Subscrevendo preço: ${symbol}`);
    
    const symbolId = await this.getSymbolId(symbol);
    
    this.priceSubscriptions.set(symbol, callback);
    this.symbolSubscriptions.set(symbol, symbolId);
    
    await this.client.subscribeSpots([symbolId]);
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
   */
  async placeOrder(order: OrderRequest): Promise<OrderResult> {
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
    
    try {
      const symbolId = await this.getSymbolId(order.symbol);
      const tradeSide = order.direction === "BUY" ? TradeSide.BUY : TradeSide.SELL;
      
      // Calcular SL/TP se especificado em pips
      let stopLoss = order.stopLoss;
      let takeProfit = order.takeProfit;
      
      if (order.stopLossPips || order.takeProfitPips) {
        const currentPrice = await this.getPrice(order.symbol);
        const pipValue = PIP_VALUES[order.symbol] || 0.0001;
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
      
      const orderId = response.position?.positionId?.toString() || `ORD-${Date.now()}`;
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
        const pipValue = PIP_VALUES[position.symbol] || 0.0001;
        
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
    const pipValue = PIP_VALUES[position.symbol] || 0.0001;
    
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
   * Carrega lista de símbolos disponíveis
   */
  private async loadAvailableSymbols(): Promise<void> {
    try {
      const symbols = await this.client.getSymbolsList();
      
      this.availableSymbols = symbols.map(s => s.symbolName);
      
      for (const symbol of symbols) {
        this.symbolIdMap.set(symbol.symbolName, symbol.symbolId);
      }
      
      console.log(`[CTraderAdapter] ${this.availableSymbols.length} símbolos carregados`);
    } catch (error) {
      console.error("[CTraderAdapter] Error loading symbols:", error);
      
      // Fallback para lista estática
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
   */
  private getSymbolNameById(symbolId: number): string | null {
    for (const [name, id] of Array.from(this.symbolIdMap.entries())) {
      if (id === symbolId) return name;
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
