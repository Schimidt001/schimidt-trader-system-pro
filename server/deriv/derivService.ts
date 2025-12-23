import WebSocket from "ws";

/**
 * Formata stake de centavos para dólares com 2 casas decimais
 * Exemplo: 7000 centavos → "70.00" USD
 * @param centavos Valor em centavos
 * @returns String formatada com 2 casas decimais
 */
function formatStakeForDeriv(centavos: number): string {
  const dolares = centavos / 100;
  return dolares.toFixed(2);
}

/**
 * Serviço para conexão com a API DERIV
 * Suporta WebSocket para dados em tempo real e REST para operações
 */

export interface DerivTick {
  epoch: number;
  quote: number;
  symbol: string;
}

export interface DerivCandle {
  epoch: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface DerivContract {
  contract_id: string;
  buy_price: number;
  payout: number;
  longcode: string;
}

export class DerivService {
  private ws: WebSocket | null = null;
  private token: string;
  private appId: string; // DERIV app ID (padrão: 1089 para testes)
  private wsUrl: string = "wss://ws.derivws.com/websockets/v3";
  private subscriptions: Map<string, (data: any) => void> = new Map();
  private activeSubscriptions: Map<string, any> = new Map(); // Guardar subscrições para refazer após reconeexão
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = Infinity; // Tentar reconectar infinitamente para 24/7
  private reconnectDelay: number = 5000;
  private lastPongTime: number = Date.now(); // Último pong recebido
  private pingInterval: NodeJS.Timeout | null = null;
  private accountCurrency: string = "USD"; // ✅ Moeda da conta (obtida na autorização)
  
  constructor(token: string, isDemo: boolean = true, appId: string = "1089") {
    this.token = token;
    this.appId = appId; // Usar App ID fornecido ou padrão 1089
    if (!isDemo) {
      this.wsUrl = "wss://ws.derivws.com/websockets/v3";
    }
    console.log(`[DerivService] Inicializado com App ID: ${this.appId}`);
  }

  /**
   * Conecta ao WebSocket da DERIV
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`[DerivService] Conectando a ${this.wsUrl}?app_id=${this.appId}`);
        this.ws = new WebSocket(`${this.wsUrl}?app_id=${this.appId}`);
        let authorized = false;
        
        this.ws.on("open", () => {
          console.log("[DerivService] WebSocket connected");
          this.reconnectAttempts = 0;
                  this.startPing();
          
          // Autorizar com token
          if (this.token) {
            // Aguardar autorização antes de resolver
            const authHandler = (message: any) => {
              if (message.authorize) {
                console.log("[DerivService] Authorized successfully");
                // ✅ Capturar moeda da conta
                if (message.authorize.currency) {
                  this.accountCurrency = message.authorize.currency;
                  console.log(`[DerivService] Moeda da conta: ${this.accountCurrency}`);
                }
                this.subscriptions.delete("authorize");
                authorized = true;
                resolve();
              } else if (message.error) {
                // ✅ CORREÇÃO: Tratar TODOS os erros de autorização (não apenas AuthorizationRequired)
                this.subscriptions.delete("authorize");
                const errorCode = message.error.code || 'UnknownError';
                const errorMessage = message.error.message || 'Erro desconhecido na autorização';
                
                console.error(`[DerivService] Erro de autorização: ${errorCode} - ${errorMessage}`);
                console.error(`[DerivService] Detalhes completos:`, JSON.stringify(message.error, null, 2));
                
                reject(new Error(`Erro de autorização (${errorCode}): ${errorMessage}`));
              }
            };
            this.subscriptions.set("authorize", authHandler);
            this.send({ authorize: this.token });
            
            // Timeout de autorização
            setTimeout(() => {
              if (!authorized) {
                this.subscriptions.delete("authorize");
                reject(new Error("Timeout ao autorizar"));
              }
            }, 10000);
          } else {
            // Sem token, resolver imediatamente
            resolve();
          }
        });

        this.ws.on("message", (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            console.error("[DerivService] Error parsing message:", error);
          }
        });

        this.ws.on("error", (error: Error) => {
          console.error("[DerivService] WebSocket error:", error);
          
          // Verificar se é erro 503
          const errorMessage = error.message || error.toString();
          if (errorMessage.includes('503')) {
            console.error("[DerivService] Erro 503 detectado - Servidor indisponível");
            console.error("[DerivService] Possíveis causas: Rate limiting, App ID bloqueado, ou manutenção");
            console.error("[DerivService] Solução: Aguarde alguns minutos ou crie um App ID personalizado em api.deriv.com");
          }
          
          reject(new Error(`Erro ao conectar: ${errorMessage}`));
        });

        this.ws.on("close", () => {
          console.log("[DerivService] WebSocket closed");
          this.handleDisconnect();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Desconecta do WebSocket
   */
  disconnect(): void {
        this.stopPing();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
  }

  /**
   * Envia mensagem para a API
   */
  private send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.error("[DerivService] WebSocket not connected");
    }
  }

  /**
   * Trata mensagens recebidas
   */
  private handleMessage(message: any): void {
    const msgType = message.msg_type;
    
    // ✅ CORREÇÃO: Tratar pong (resposta ao ping keep-alive)
    // A API Deriv responde com msg_type: "ping" e ping: "pong"
    // OU apenas com o campo "pong" contendo um timestamp
    if (msgType === "ping" || message.pong !== undefined) {
      // Ping/pong bem-sucedido, conexão está viva
      this.lastPongTime = Date.now();
      // Log reduzido para não poluir console (apenas a cada 60s)
      return;
    }
    
    // ✅ CORREÇÃO: Processar mensagens de proposal para payout check
    if (message.proposal && this.subscriptions.has("proposal_payout")) {
      const handler = this.subscriptions.get("proposal_payout");
      if (handler) {
        handler(message);
        return;
      }
    }
    
    if (msgType && this.subscriptions.has(msgType)) {
      const handler = this.subscriptions.get(msgType);
      if (handler) {
        handler(message);
      }
    }

    // Tratar ticks
    if (message.tick) {
      const handler = this.subscriptions.get(`tick_${message.tick.symbol}`);
      if (handler) {
        handler(message.tick);
      }
    }

    // Tratar candles
    if (message.candles) {
      const handler = this.subscriptions.get("candles");
      if (handler) {
        handler(message.candles);
      }
    }

    // Tratar ohlc (candle stream)
    if (message.ohlc) {
      const handler = this.subscriptions.get("ohlc");
      if (handler) {
        handler(message.ohlc);
      }
    }
  }

  /**
   * Trata desconexão e reconeexão
   * ✅ MELHORADO v2: Reconexão mais rápida para evitar perda de dados
   * - Delay inicial reduzido de 5s para 2s
   * - Delay máximo reduzido de 60s para 30s
   * - Logs mais detalhados para debug
   */
  private handleDisconnect(): void {
    this.stopPing();
    
    this.reconnectAttempts++;
    
    // ✅ CORREÇÃO: Delay exponencial mais agressivo: 2s, 4s, 8s, 16s, max 30s
    const baseDelay = 2000; // Reduzido de 5000 para 2000
    const maxDelay = 30000; // Reduzido de 60000 para 30000
    const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), maxDelay);
    
    console.log(`[DerivService] 🔄 Conexão perdida. Reconectando em ${delay/1000}s... (Tentativa ${this.reconnectAttempts})`);
    
    setTimeout(async () => {
      try {
        console.log(`[DerivService] 🔄 Tentando reconexão #${this.reconnectAttempts}...`);
        await this.connect();
        console.log("[DerivService] ✅ Reconectado com sucesso!");
        
        // Refazer subscrições ativas após reconeexão
        this.resubscribe();
        
        // Resetar contador após sucesso
        this.reconnectAttempts = 0;
      } catch (error) {
        console.error(`[DerivService] ❌ Reconexão #${this.reconnectAttempts} falhou:`, error);
        // handleDisconnect será chamado novamente pelo evento 'close'
        // Se muitas tentativas falharem, o delay exponencial vai aumentar
      }
    }, delay);
  }

  /**
   * Inscreve-se em ticks de um símbolo
   */
  subscribeTicks(symbol: string, callback: (tick: DerivTick) => void): void {
    this.subscriptions.set(`tick_${symbol}`, callback);
    this.activeSubscriptions.set(`tick_${symbol}`, { type: 'ticks', symbol }); // Guardar para refazer
    this.send({
      ticks: symbol,
      subscribe: 1,
    });
  }

  /**
   * Cancela inscrição de ticks
   */
  unsubscribeTicks(symbol: string): void {
    this.subscriptions.delete(`tick_${symbol}`);
    this.activeSubscriptions.delete(`tick_${symbol}`); // Remover da lista ativa
    this.send({
      forget_all: "ticks",
    });
  }

  /**
   * Busca histórico de candles
   */
  async getCandleHistory(
    symbol: string,
    granularity: number = 900, // 900 segundos = 15 minutos
    count: number = 100
  ): Promise<DerivCandle[]> {
    return new Promise((resolve, reject) => {
      const reqId = `candles_${Date.now()}`;
      
      const handler = (message: any) => {
        if (message.candles) {
          this.subscriptions.delete(reqId);
          resolve(message.candles as DerivCandle[]);
        } else if (message.error) {
          this.subscriptions.delete(reqId);
          reject(new Error(message.error.message));
        }
      };

      this.subscriptions.set("candles", handler);
      
      this.send({
        ticks_history: symbol,
        adjust_start_time: 1,
        count: count,
        end: "latest",
        granularity: granularity,
        style: "candles",
      });

      // Timeout após 30 segundos
      setTimeout(() => {
        if (this.subscriptions.has(reqId)) {
          this.subscriptions.delete(reqId);
          reject(new Error("Candle history request timeout"));
        }
      }, 30000);
    });
  }

  /**
   * Inscreve-se em candles em tempo real
   */
  subscribeCandles(
    symbol: string,
    granularity: number = 900,
    callback: (candle: DerivCandle) => void
  ): void {
    this.subscriptions.set("ohlc", callback);
    this.send({
      ticks_history: symbol,
      adjust_start_time: 1,
      count: 1,
      end: "latest",
      granularity: granularity,
      style: "candles",
      subscribe: 1,
    });
  }

  /**
   * Obtém saldo da conta
   */
  async getBalance(): Promise<number> {
    return new Promise((resolve, reject) => {
      const handler = (message: any) => {
        if (message.balance) {
          this.subscriptions.delete("balance");
          resolve(parseFloat(message.balance.balance));
        } else if (message.error) {
          this.subscriptions.delete("balance");
          reject(new Error(message.error.message));
        }
      };

      this.subscriptions.set("balance", handler);
      this.send({ balance: 1 });

      setTimeout(() => {
        if (this.subscriptions.has("balance")) {
          this.subscriptions.delete("balance");
          reject(new Error("Balance request timeout"));
        }
      }, 10000);
    });
  }

  /**
   * Obter payout de uma proposta sem comprar
   * Retorna o payout em valor absoluto USD (ex: 17.20 para $17.20)
   */
  async getProposalPayout(
    symbol: string,
    contractType: "CALL" | "PUT" | "CALLE" | "PUTE" | "ONETOUCH" | "NOTOUCH",
    stake: number,
    duration: number,
    durationType: string,
    barrier?: string
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const handler = (message: any) => {
        if (message.proposal) {
          this.subscriptions.delete("proposal_payout");
          
          // Retornar payout em valor absoluto USD
          const payout = message.proposal.payout || 0;
          
          console.log(`[DERIV_PAYOUT] Payout: $${payout.toFixed(2)} USD | Stake: $${stake.toFixed(2)} USD`);
          
          resolve(payout);
        } else if (message.error) {
          this.subscriptions.delete("proposal_payout");
          console.error('[DERIV_PAYOUT_ERROR]', message.error.message);
          reject(new Error(message.error.message));
        }
      };

      this.subscriptions.set("proposal_payout", handler);
      
      // Construir parâmetros da proposta
      // ✅ CORREÇÃO: Garantir stake sempre com 2 casas decimais
      const stakeFormatted = typeof stake === 'number' ? stake.toFixed(2) : stake;
      const proposalParams: any = {
        proposal: 1,
        contract_type: contractType,
        symbol: symbol,
        duration: duration,
        duration_unit: durationType,
        basis: "stake",
        amount: stakeFormatted,
        currency: this.accountCurrency,
      };
      
      // Adicionar barreira se for TOUCH ou NO_TOUCH
      if (barrier && (contractType === "ONETOUCH" || contractType === "NOTOUCH")) {
        proposalParams.barrier = barrier;
      }
      
      this.send(proposalParams);

      setTimeout(() => {
        if (this.subscriptions.has("proposal_payout")) {
          this.subscriptions.delete("proposal_payout");
          reject(new Error("Proposal payout timeout"));
        }
      }, 15000); // Aumentado de 10s para 15s
    });
  }

  /**
   * Criar proposta de contrato
   */
  async createProposal(
    symbol: string,
    contractType: "CALL" | "PUT" | "CALLE" | "PUTE" | "ONETOUCH" | "NOTOUCH",
    stake: number,
    duration: number,
    durationType: string,
    barrier?: string,
    allowEquals?: boolean
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const handler = (message: any) => {
        if (message.proposal) {
          this.subscriptions.delete("proposal");
          resolve(message.proposal.id);
        } else if (message.error) {
          this.subscriptions.delete("proposal");
          const error: any = new Error(message.error.message);
          error.code = message.error.code;
          error.details = message.error.details;
          error.apiResponse = message.error;
          console.error('[DERIV_PROPOSAL_ERROR]', JSON.stringify(message.error, null, 2));
          reject(error);
        }
      };

      this.subscriptions.set("proposal", handler);
      
      // Construir parâmetros da proposta
      // ✅ CORREÇÃO: Garantir stake sempre com 2 casas decimais
      const stakeFormatted = typeof stake === 'number' ? stake.toFixed(2) : stake;
      const proposalParams: any = {
        proposal: 1,
        contract_type: contractType,
        symbol: symbol,
        duration: duration,
        duration_unit: durationType,
        basis: "stake",
        amount: stakeFormatted,
        currency: this.accountCurrency,
      };
      
      // Adicionar barreira se for TOUCH ou NO_TOUCH
      if (barrier && (contractType === "ONETOUCH" || contractType === "NOTOUCH")) {
        proposalParams.barrier = barrier;
      }
      
      // NOTA: allow_equals NÃO é suportado pela API Deriv
      // Removido para evitar erro "Properties not allowed"
      
      console.log('[DERIV_PROPOSAL] Criando proposta:', JSON.stringify(proposalParams, null, 2));
      
      this.send(proposalParams);

      setTimeout(() => {
        if (this.subscriptions.has("proposal")) {
          this.subscriptions.delete("proposal");
          reject(new Error("Proposal timeout"));
        }
      }, 10000);
    });
  }

  /**
   * Comprar contrato usando ID de proposta
   */
  async buyContract(
    symbol: string,
    contractType: "CALL" | "PUT" | "CALLE" | "PUTE" | "ONETOUCH" | "NOTOUCH",
    stake: number,
    duration: number = 1,
    durationType: string = "m",
    barrier?: string,
    allowEquals?: boolean
  ): Promise<DerivContract> {
    try {
      // Primeiro, criar uma proposta
      console.log('[DERIV_BUY] Iniciando compra: criando proposta primeiro...');
      
      let adjustedStake = stake;
      let proposalId: string;
      
      try {
        proposalId = await this.createProposal(
          symbol,
          contractType,
          adjustedStake,
          duration,
          durationType,
          barrier,
          allowEquals
        );
      } catch (error: any) {
        // Se o erro for de payout máximo excedido, tentar ajustar o stake
        if (error.message && error.message.includes('maximum payout')) {
          console.warn('[DERIV_BUY] Payout máximo excedido, ajustando stake...');
          
          // Extrair o payout máximo da mensagem de erro
          const maxPayoutMatch = error.message.match(/maximum payout of ([\d.]+)/);
          const currentPayoutMatch = error.message.match(/Current payout is ([\d.]+)/);
          
          if (maxPayoutMatch && currentPayoutMatch) {
            const maxPayout = parseFloat(maxPayoutMatch[1]);
            const currentPayout = parseFloat(currentPayoutMatch[1]);
            
            // Calcular stake ajustado: stake * (maxPayout / currentPayout) * 0.95 (margem de segurança)
            adjustedStake = stake * (maxPayout / currentPayout) * 0.95;
            
            console.log(`[DERIV_BUY] Stake ajustado: $${stake.toFixed(2)} -> $${adjustedStake.toFixed(2)} USD`);
            
            // Tentar novamente com stake ajustado
            proposalId = await this.createProposal(
              symbol,
              contractType,
              adjustedStake,
              duration,
              durationType,
              barrier,
              allowEquals
            );
          } else {
            throw error; // Re-lançar se não conseguir extrair os valores
          }
        } else {
          throw error; // Re-lançar se não for erro de payout máximo
        }
      }
      
      console.log('[DERIV_BUY] Proposta criada com sucesso. ID:', proposalId);
      
      // Agora, comprar usando o ID da proposta
      return new Promise((resolve, reject) => {
        const handler = (message: any) => {
          if (message.buy) {
            this.subscriptions.delete("buy");
            console.log('[DERIV_BUY] Contrato comprado com sucesso!');
            resolve({
              contract_id: message.buy.contract_id,
              buy_price: message.buy.buy_price,
              payout: message.buy.payout,
              longcode: message.buy.longcode,
            });
          } else if (message.error) {
            this.subscriptions.delete("buy");
            const error: any = new Error(message.error.message);
            error.code = message.error.code;
            error.details = message.error.details;
            error.apiResponse = message.error;
            console.error('[DERIV_BUY_ERROR]', JSON.stringify(message.error, null, 2));
            reject(error);
          }
        };

        this.subscriptions.set("buy", handler);
        
        console.log('[DERIV_BUY] Comprando contrato com proposal_id:', proposalId);
        
        // ✅ CORREÇÃO: Garantir price sempre com 2 casas decimais
        const priceFormatted = typeof adjustedStake === 'number' ? adjustedStake.toFixed(2) : adjustedStake;
        this.send({
          buy: proposalId,
          price: priceFormatted, // Usar stake ajustado se foi modificado
        });

        setTimeout(() => {
          if (this.subscriptions.has("buy")) {
            this.subscriptions.delete("buy");
            reject(new Error("Buy timeout"));
          }
        }, 10000);
      });
    } catch (error) {
      console.error('[DERIV_BUY] Erro ao criar proposta ou comprar:', error);
      throw error;
    }
  }

  /**
   * Vende um contrato (early close)
   */
  async sellContract(contractId: string, price: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const handler = (message: any) => {
        if (message.sell) {
          this.subscriptions.delete("sell");
          resolve(message.sell);
        } else if (message.error) {
          this.subscriptions.delete("sell");
          reject(new Error(message.error.message));
        }
      };

      this.subscriptions.set("sell", handler);
      
      this.send({
        sell: contractId,
        price: price,
      });

      setTimeout(() => {
        if (this.subscriptions.has("sell")) {
          this.subscriptions.delete("sell");
          reject(new Error("Sell contract timeout"));
        }
      }, 15000);
    });
  }

  /**
   * Obtém informações de um contrato
   */
  async getContractInfo(contractId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const handler = (message: any) => {
        if (message.proposal_open_contract) {
          this.subscriptions.delete("proposal_open_contract");
          resolve(message.proposal_open_contract);
        } else if (message.error) {
          this.subscriptions.delete("proposal_open_contract");
          reject(new Error(message.error.message));
        }
      };

      this.subscriptions.set("proposal_open_contract", handler);
      
      this.send({
        proposal_open_contract: 1,
        contract_id: contractId,
      });

      setTimeout(() => {
        if (this.subscriptions.has("proposal_open_contract")) {
          this.subscriptions.delete("proposal_open_contract");
          reject(new Error("Contract info timeout"));
        }
      }, 10000);
    });
  }

  /**
   * Obtém pip_size do ativo
   */
  async getSymbolInfo(symbol: string): Promise<{ pip_size: number; display_name: string }> {
    return new Promise((resolve, reject) => {
      const handler = (message: any) => {
        if (message.active_symbols) {
          this.subscriptions.delete("active_symbols");
          const symbolInfo = message.active_symbols.find((s: any) => s.symbol === symbol);
          if (symbolInfo) {
            resolve({
              pip_size: symbolInfo.pip || 0.01,
              display_name: symbolInfo.display_name || symbol,
            });
          } else {
            reject(new Error(`Symbol ${symbol} not found`));
          }
        } else if (message.error) {
          this.subscriptions.delete("active_symbols");
          reject(new Error(message.error.message));
        }
      };

      this.subscriptions.set("active_symbols", handler);
      
      this.send({
        active_symbols: "brief",
        product_type: "basic",
      });

      setTimeout(() => {
        if (this.subscriptions.has("active_symbols")) {
          this.subscriptions.delete("active_symbols");
          reject(new Error("Symbol info timeout"));
        }
      }, 10000);
    });
  }

  /**
   * Obtém lista completa de símbolos ativos (Forex e Sintéticos)
   */
  async getActiveSymbols(market?: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const handler = (message: any) => {
        if (message.active_symbols) {
          this.subscriptions.delete("active_symbols_list");
          let symbols = message.active_symbols;
          
          // Filtrar por mercado se especificado
          if (market) {
            symbols = symbols.filter((s: any) => s.market === market);
          }
          
          resolve(symbols);
        } else if (message.error) {
          this.subscriptions.delete("active_symbols_list");
          reject(new Error(message.error.message));
        }
      };

      this.subscriptions.set("active_symbols_list", handler);
      
      this.send({
        active_symbols: "brief",
        product_type: "basic",
      });

      setTimeout(() => {
        if (this.subscriptions.has("active_symbols_list")) {
          this.subscriptions.delete("active_symbols_list");
          reject(new Error("Active symbols request timeout"));
        }
      }, 10000);
    });
  }

  /**
   * Refaz subscrições ativas após reconexão
   * ✅ MELHORADO: Adiciona delay entre resubscrições para evitar sobrecarga
   */
  private async resubscribe(): Promise<void> {
    const subscriptionCount = this.activeSubscriptions.size;
    console.log(`[DerivService] 🔄 Refazendo ${subscriptionCount} subscrições ativas após reconexão...`);
    
    let resubscribed = 0;
    // Usar Array.from para compatibilidade com versões mais antigas do TypeScript
    const entries = Array.from(this.activeSubscriptions.entries());
    for (const [key, sub] of entries) {
      if (sub.type === 'ticks') {
        console.log(`[DerivService] 🔄 Resubscrevendo ticks: ${sub.symbol}`);
        this.send({
          ticks: sub.symbol,
          subscribe: 1,
        });
        resubscribed++;
        
        // Pequeno delay entre subscrições para não sobrecarregar a API
        if (resubscribed < subscriptionCount) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
    
    console.log(`[DerivService] ✅ ${resubscribed} subscrições refeitas com sucesso`);
  }

  /**
   * Verifica se está conectado
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Envia mensagem para a API (método público para uso externo)
   * Usado pelo serviço de reconciliação
   */
  public sendMessage(data: any): void {
    this.send(data);
  }

  /**
   * Inscreve-se em um tipo de mensagem específico
   * Usado pelo serviço de reconciliação para profit_table
   */
  public subscribeToMessage(msgType: string, callback: (message: any) => void): void {
    this.subscriptions.set(msgType, callback);
  }

  /**
   * Remove inscrição de um tipo de mensagem
   */
  public unsubscribeFromMessage(msgType: string): void {
    this.subscriptions.delete(msgType);
  }


    /**
     * Inicia o envio de pings periódicos para manter a conexão viva
     * ✅ MELHORADO v2: Verificação mais frequente (10s) e detecção mais rápida de conexão morta (45s)
     * A Deriv fecha conexões após 2 minutos de inatividade, então precisamos ser mais agressivos
     * 
     * CORREÇÃO PARA DESCONEXÕES FREQUENTES:
     * - Intervalo de ping reduzido de 15s para 10s
     * - Threshold de conexão morta reduzido de 60s para 45s
     * - Threshold de aviso reduzido de 30s para 20s
     * - Adicionado log de ping enviado para debug
     */
    private startPing(): void {
        if (this.pingInterval) return;
        
        this.lastPongTime = Date.now(); // Inicializar
        console.log("[DerivService] Ping/pong keep-alive iniciado (intervalo: 10s, timeout: 45s)");
        
        this.pingInterval = setInterval(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                console.warn("[DerivService] WebSocket não está aberto durante ping check - estado:", this.ws?.readyState);
                return; // Não fazer nada se não estiver conectado
            }
            
            const timeSinceLastPong = Date.now() - this.lastPongTime;
            
            // ✅ CORREÇÃO: Se não recebemos pong em 45s, a conexão está provavelmente morta
            // Reduzido de 60s para 45s para detecção mais rápida
            if (timeSinceLastPong > 45000) {
                console.error(`[DerivService] ⚠️ CONEXÃO MORTA: Nenhum pong recebido em ${Math.round(timeSinceLastPong/1000)}s - forçando reconexão`);
                this.ws.close();
                return;
            }
            
            // ✅ CORREÇÃO: Se não recebemos pong em 20s, logar aviso (reduzido de 30s)
            if (timeSinceLastPong > 20000) {
                console.warn(`[DerivService] ⚠️ Possível instabilidade: nenhum pong em ${Math.round(timeSinceLastPong/1000)}s`);
            }
            
            // Enviar ping
            this.send({ ping: 1 });
        }, 10000); // ✅ CORREÇÃO: Verificar a cada 10 segundos (era 15s)
    }

    /**
     * Para o envio de pings
     */
    private stopPing(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }


}
