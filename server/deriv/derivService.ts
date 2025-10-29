import WebSocket from "ws";

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
  private appId: string = "1089"; // DERIV demo app ID
  private wsUrl: string = "wss://ws.derivws.com/websockets/v3";
  private subscriptions: Map<string, (data: any) => void> = new Map();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 5000;

      private pingInterval: NodeJS.Timeout | null = null;
  
  constructor(token: string, isDemo: boolean = true) {
    this.token = token;
    if (!isDemo) {
      this.wsUrl = "wss://ws.derivws.com/websockets/v3";
    }
  }

  /**
   * Conecta ao WebSocket da DERIV
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
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
                this.subscriptions.delete("authorize");
                authorized = true;
                resolve();
              } else if (message.error && message.error.code === "AuthorizationRequired") {
                this.subscriptions.delete("authorize");
                reject(new Error("Token inválido ou expirado"));
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
          reject(error);
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
   * Trata desconexão e reconexão
   */
  private handleDisconnect(): void {
            this.stopPing();
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[DerivService] Reconnecting... Attempt ${this.reconnectAttempts}`);
      
      setTimeout(() => {
        this.connect().catch((error) => {
          console.error("[DerivService] Reconnection failed:", error);
        });
      }, this.reconnectDelay);
    } else {
      console.error("[DerivService] Max reconnection attempts reached");
    }
  }

  /**
   * Inscreve-se em ticks de um símbolo
   */
  subscribeTicks(symbol: string, callback: (tick: DerivTick) => void): void {
    this.subscriptions.set(`tick_${symbol}`, callback);
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
   * Compra um contrato
   */
  async buyContract(
    symbol: string,
    contractType: "CALL" | "PUT",
    stake: number,
    duration: number = 1,
    durationType: string = "m"
  ): Promise<DerivContract> {
    return new Promise((resolve, reject) => {
      const handler = (message: any) => {
        if (message.buy) {
          this.subscriptions.delete("buy");
          resolve({
            contract_id: message.buy.contract_id,
            buy_price: message.buy.buy_price,
            payout: message.buy.payout,
            longcode: message.buy.longcode,
          });
        } else if (message.error) {
          this.subscriptions.delete("buy");
          reject(new Error(message.error.message));
        }
      };

      this.subscriptions.set("buy", handler);
      
      this.send({
        buy: 1,
        price: stake,
        parameters: {
          contract_type: contractType,
          symbol: symbol,
          duration: duration,
          duration_unit: durationType,
          basis: "stake",
          amount: stake,
          currency: "USD",
        },
      });

      setTimeout(() => {
        if (this.subscriptions.has("buy")) {
          this.subscriptions.delete("buy");
          reject(new Error("Buy contract timeout"));
        }
      }, 15000);
    });
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
   * Verifica se está conectado
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  
}


    /**
     * Inicia o envio de pings periódicos para manter a conexão viva
     */
    private startPing(): void {
        if (this.pingInterval) return;
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.send({ ping: 1 });
            }
        }, 30000);
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
