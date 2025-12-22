/**
 * TTLFilter - Time-To-Close Filter
 * 
 * Bloqueia o armamento do gatilho quando não há tempo suficiente
 * até o fechamento do candle para executar uma operação saudável.
 * 
 * O TTL NÃO prevê mercado, NÃO altera preço, NÃO cancela contratos,
 * NÃO interfere após o gatilho armado.
 * 
 * Ele apenas responde:
 * ✅ Este candle ainda tem tempo operacional suficiente
 * ❌ Este candle deve ser ignorado por falta de tempo
 * 
 * Versão: 1.0
 * Ambiente: Produção / Forex M60
 */

export interface TTLFilterConfig {
  enabled: boolean;
  minimumSeconds: number;      // Tempo mínimo saudável para o trade (ex: 900s = 15min)
  triggerDelayBuffer: number;  // Buffer conservador para possível atraso no cruzamento do gatilho (ex: 300s = 5min)
  logEnabled: boolean;         // Log detalhado ON/OFF
}

export interface TTLFilterResult {
  blocked: boolean;
  reason?: string;
  metrics: {
    timeRemaining: number;
    requiredTime: number;
  };
  config: {
    minimumSeconds: number;
    triggerDelayBuffer: number;
  };
}

/**
 * Classe TTLFilter - Time-To-Close Filter
 * 
 * Implementação modular e isolada do filtro temporal.
 * Não interfere com nenhuma outra funcionalidade existente.
 */
export class TTLFilter {
  private config: TTLFilterConfig;

  constructor(config: TTLFilterConfig) {
    this.config = config;
  }

  /**
   * Atualiza a configuração do TTLFilter
   */
  public updateConfig(config: TTLFilterConfig): void {
    this.config = config;
  }

  /**
   * Verifica se o filtro está habilitado
   */
  public isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Verifica se o log detalhado está habilitado
   */
  public isLogEnabled(): boolean {
    return this.config.logEnabled;
  }

  /**
   * Verifica se ainda há tempo suficiente para armar o gatilho
   * 
   * @param candleCloseTimestamp Timestamp Unix (segundos) do fechamento do candle
   * @param currentTimestamp Timestamp Unix (segundos) atual
   * @returns Resultado da verificação com métricas e motivo do bloqueio
   */
  public check(
    candleCloseTimestamp: number,
    currentTimestamp: number
  ): TTLFilterResult {
    // Se o filtro está desabilitado, não bloqueia
    if (!this.config.enabled) {
      return {
        blocked: false,
        metrics: {
          timeRemaining: 0,
          requiredTime: 0,
        },
        config: {
          minimumSeconds: this.config.minimumSeconds,
          triggerDelayBuffer: this.config.triggerDelayBuffer,
        },
      };
    }

    // Calcular tempo restante até o fechamento do candle
    const timeRemaining = candleCloseTimestamp - currentTimestamp;
    
    // Calcular tempo mínimo exigido (tempo saudável + buffer de atraso)
    const requiredTime = this.config.minimumSeconds + this.config.triggerDelayBuffer;

    // Verificar se há tempo suficiente
    const blocked = timeRemaining < requiredTime;
    const reason = blocked 
      ? `Tempo restante insuficiente (${timeRemaining}s < ${requiredTime}s exigidos)`
      : undefined;

    return {
      blocked,
      reason,
      metrics: {
        timeRemaining,
        requiredTime,
      },
      config: {
        minimumSeconds: this.config.minimumSeconds,
        triggerDelayBuffer: this.config.triggerDelayBuffer,
      },
    };
  }

  /**
   * Formata o resultado para log
   */
  public formatLogMessage(result: TTLFilterResult): string {
    if (!result.blocked) {
      return `[TTLFilter] ✅ TTL_APPROVED | TimeRemaining=${result.metrics.timeRemaining}s`;
    }

    return `[TTLFilter] 🕒 TTL_BLOCKED | TimeRemaining=${result.metrics.timeRemaining}s | Required=${result.metrics.requiredTime}s | Reason=INSUFFICIENT_TIME`;
  }

  /**
   * Formata o resultado para exibição no painel
   */
  public formatPanelMessage(result: TTLFilterResult): string {
    if (!result.blocked) {
      return "Candle aprovado pelo TTL Filter - Tempo suficiente para operação";
    }

    const remainingMinutes = Math.floor(result.metrics.timeRemaining / 60);
    const requiredMinutes = Math.floor(result.metrics.requiredTime / 60);

    return `Tempo insuficiente até fechamento do candle\n` +
           `• Tempo restante: ${remainingMinutes} minutos (${result.metrics.timeRemaining}s)\n` +
           `• Tempo exigido: ${requiredMinutes} minutos (${result.metrics.requiredTime}s)\n` +
           `• Motivo: ${result.reason}`;
  }
}
