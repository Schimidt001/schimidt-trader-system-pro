/**
 * AdapterFactory - Fábrica de Adapters com Injeção de Dependências
 * 
 * CORREÇÃO CRÍTICA #4: Eliminação Total de Singleton ctraderAdapter
 * 
 * Este módulo substitui o padrão singleton do CTraderAdapter por uma fábrica
 * que gerencia instâncias de forma explícita, garantindo isolamento total
 * entre o Laboratório e o ambiente Live.
 * 
 * Princípios:
 * - Instâncias separadas para Lab e Live
 * - Lab NUNCA acessa o adapter real de produção
 * - Injeção de dependências em vez de singleton global
 * - Nenhum efeito colateral entre contextos
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { labLogger } from "../backtest/utils/LabLogger";
import { environmentContext } from "../backtest/utils/EnvironmentContext";

// ============================================================================
// TYPES
// ============================================================================

export type AdapterContext = "LIVE" | "LAB";

export interface AdapterInstance {
  context: AdapterContext;
  createdAt: Date;
  isConnected: () => boolean;
  disconnect: () => Promise<void>;
}

// ============================================================================
// ADAPTER FACTORY CLASS
// ============================================================================

/**
 * Fábrica de adapters com gerenciamento de instâncias por contexto
 * 
 * IMPORTANTE: Esta classe NÃO exporta um singleton do CTraderAdapter.
 * Em vez disso, gerencia instâncias separadas para cada contexto.
 */
export class AdapterFactory {
  private static instance: AdapterFactory | null = null;
  
  // Instância do adapter LIVE (única instância real)
  private liveAdapter: any | null = null;
  private liveAdapterInitialized: boolean = false;
  
  // Flag para prevenir acesso acidental do Lab ao adapter Live
  private labAccessBlocked: boolean = true;
  
  private constructor() {
    labLogger.info("AdapterFactory inicializado", "AdapterFactory");
  }
  
  /**
   * Obtém instância singleton da fábrica (não do adapter!)
   */
  static getInstance(): AdapterFactory {
    if (!AdapterFactory.instance) {
      AdapterFactory.instance = new AdapterFactory();
    }
    return AdapterFactory.instance;
  }
  
  // ==========================================================================
  // LIVE ADAPTER MANAGEMENT
  // ==========================================================================
  
  /**
   * Obtém o adapter para ambiente LIVE
   * 
   * IMPORTANTE: Este método só deve ser chamado em contexto Live.
   * O Lab deve usar getLabAdapter() ou BacktestAdapter.
   */
  getLiveAdapter(): any {
    // Verificar contexto
    if (environmentContext.isLabContext() && this.labAccessBlocked) {
      labLogger.error(
        "VIOLAÇÃO DE ISOLAMENTO: Tentativa de acessar LiveAdapter em contexto Lab",
        undefined,
        "AdapterFactory"
      );
      throw new Error("LiveAdapter não disponível em contexto Lab. Use BacktestAdapter.");
    }
    
    // Lazy load do adapter real
    if (!this.liveAdapterInitialized) {
      this.initializeLiveAdapter();
    }
    
    return this.liveAdapter;
  }
  
  /**
   * Inicializa o adapter Live de forma lazy
   */
  private initializeLiveAdapter(): void {
    if (this.liveAdapterInitialized) return;
    
    try {
      // Import dinâmico para evitar carregar em contexto Lab
      const { CTraderAdapter } = require("./CTraderAdapter");
      
      // Criar NOVA instância (não usar o singleton exportado)
      this.liveAdapter = new CTraderAdapter();
      this.liveAdapterInitialized = true;
      
      labLogger.info("LiveAdapter inicializado via AdapterFactory", "AdapterFactory");
    } catch (error) {
      labLogger.error(
        `Erro ao inicializar LiveAdapter: ${(error as Error).message}`,
        error as Error,
        "AdapterFactory"
      );
      throw error;
    }
  }
  
  /**
   * Verifica se o adapter Live está conectado
   */
  isLiveAdapterConnected(): boolean {
    if (!this.liveAdapterInitialized || !this.liveAdapter) {
      return false;
    }
    return this.liveAdapter.isConnected?.() || false;
  }
  
  /**
   * Desconecta o adapter Live
   */
  async disconnectLiveAdapter(): Promise<void> {
    if (this.liveAdapter && this.liveAdapter.disconnect) {
      await this.liveAdapter.disconnect();
      labLogger.info("LiveAdapter desconectado", "AdapterFactory");
    }
  }
  
  // ==========================================================================
  // LAB ADAPTER MANAGEMENT
  // ==========================================================================
  
  /**
   * Obtém um stub/mock do adapter para uso em Lab
   * 
   * Este método retorna um objeto que simula o adapter mas não faz
   * nenhuma operação real com o broker.
   */
  getLabAdapter(): LabAdapterStub {
    return new LabAdapterStub();
  }
  
  /**
   * Obtém o adapter apropriado baseado no contexto atual
   * 
   * CORREÇÃO #4: Este método garante que o Lab nunca acesse o adapter real
   */
  getAdapterForCurrentContext(): any {
    if (environmentContext.isLabContext()) {
      labLogger.debug("Retornando LabAdapterStub para contexto Lab", "AdapterFactory");
      return this.getLabAdapter();
    }
    
    labLogger.debug("Retornando LiveAdapter para contexto Live", "AdapterFactory");
    return this.getLiveAdapter();
  }
  
  // ==========================================================================
  // ISOLATION CONTROL
  // ==========================================================================
  
  /**
   * Ativa bloqueio de acesso do Lab ao adapter Live
   */
  enableLabIsolation(): void {
    this.labAccessBlocked = true;
    labLogger.info("Isolamento Lab->Live ATIVADO", "AdapterFactory");
  }
  
  /**
   * Desativa bloqueio (apenas para testes!)
   */
  disableLabIsolation(): void {
    this.labAccessBlocked = false;
    labLogger.warn("Isolamento Lab->Live DESATIVADO (apenas para testes)", "AdapterFactory");
  }
  
  /**
   * Verifica se o isolamento está ativo
   */
  isLabIsolationEnabled(): boolean {
    return this.labAccessBlocked;
  }
  
  // ==========================================================================
  // CLEANUP
  // ==========================================================================
  
  /**
   * Limpa todas as instâncias (para testes)
   */
  async cleanup(): Promise<void> {
    if (this.liveAdapter) {
      await this.disconnectLiveAdapter();
      this.liveAdapter = null;
      this.liveAdapterInitialized = false;
    }
    labLogger.info("AdapterFactory limpo", "AdapterFactory");
  }
}

// ============================================================================
// LAB ADAPTER STUB
// ============================================================================

/**
 * Stub do adapter para uso exclusivo em Lab
 * 
 * Simula a interface do CTraderAdapter mas não faz operações reais.
 * Todas as operações de trading lançam erro.
 */
export class LabAdapterStub {
  readonly brokerType = "LAB_STUB";
  
  constructor() {
    labLogger.debug("LabAdapterStub criado", "LabAdapterStub");
  }
  
  // Métodos de conexão (sempre retornam desconectado)
  isConnected(): boolean {
    return false;
  }
  
  getConnectionState(): string {
    return "DISCONNECTED";
  }
  
  async connect(): Promise<void> {
    throw new Error("Conexão com broker não permitida em modo Lab");
  }
  
  async disconnect(): Promise<void> {
    labLogger.debug("disconnect() ignorado em LabAdapterStub", "LabAdapterStub");
  }
  
  // Métodos de conta (retornam dados simulados)
  async getAccountInfo(): Promise<any> {
    return {
      balance: 10000,
      equity: 10000,
      margin: 0,
      freeMargin: 10000,
      marginLevel: 0,
      currency: "USD",
    };
  }
  
  // Métodos de preço (retornam dados vazios)
  async getPrice(symbol: string): Promise<any> {
    return {
      symbol,
      bid: 0,
      ask: 0,
      timestamp: Date.now(),
    };
  }
  
  async subscribeToPrice(symbol: string, callback: any): Promise<void> {
    labLogger.debug(`subscribeToPrice(${symbol}) ignorado em LabAdapterStub`, "LabAdapterStub");
  }
  
  async unsubscribeFromPrice(symbol: string): Promise<void> {
    labLogger.debug(`unsubscribeFromPrice(${symbol}) ignorado em LabAdapterStub`, "LabAdapterStub");
  }
  
  // Métodos de trading (sempre lançam erro)
  async placeOrder(): Promise<any> {
    throw new Error("Ordens não permitidas em modo Lab");
  }
  
  async closePosition(): Promise<any> {
    throw new Error("Fechamento de posições não permitido em modo Lab");
  }
  
  async modifyPosition(): Promise<any> {
    throw new Error("Modificação de posições não permitida em modo Lab");
  }
  
  async getOpenPositions(): Promise<any[]> {
    return [];
  }
  
  // Métodos de dados históricos (retornam vazio)
  async getHistoricalCandles(): Promise<any[]> {
    return [];
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const adapterFactory = AdapterFactory.getInstance();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Obtém o adapter apropriado para o contexto atual
 * 
 * CORREÇÃO #4: Substitui o uso direto de ctraderAdapter
 */
export function getAdapter(): any {
  return adapterFactory.getAdapterForCurrentContext();
}

/**
 * Obtém o adapter Live (apenas para contexto Live)
 */
export function getLiveAdapter(): any {
  return adapterFactory.getLiveAdapter();
}

/**
 * Obtém o adapter Lab (stub)
 */
export function getLabAdapter(): LabAdapterStub {
  return adapterFactory.getLabAdapter();
}

/**
 * Verifica se o adapter Live está conectado
 */
export function isLiveAdapterConnected(): boolean {
  return adapterFactory.isLiveAdapterConnected();
}
