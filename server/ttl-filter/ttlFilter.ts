/**
 * TTLFilter - Time-To-Live Filter (Janela Operacional)
 * 
 * CONTEXTO CRÍTICO:
 * No M60, o candle operacional NÃO tem 60 minutos disponíveis.
 * - Minuto 0–35: formação / análise (NÃO operável)
 * - Minuto 35–45: ÚNICA janela operável (10 minutos)
 * - Minuto 45–60: proibido pela Deriv
 * 
 * O TTL avalia o tempo restante DENTRO da janela operacional (35–45),
 * e NÃO o candle inteiro.
 * 
 * Definição formal:
 * TTL = tempo restante entre momento atual e limite máximo de entrada permitido (45min)
 * 
 * Regra objetiva:
 * timeRemaining = lastAllowedEntryTimestamp - currentTimestamp
 * requiredTime = ttlMinimumSeconds + ttlTriggerDelayBuffer
 * if (timeRemaining < requiredTime): BLOQUEIA armamento do gatilho
 * else: PERMITE armamento
 * 
 * O TTL NÃO cancela gatilho armado, NÃO interfere após a entrada,
 * NÃO altera direção, stake ou lógica da IA.
 * 
 * Versão: 2.0
 * Ambiente: Produção / Forex M60
 */

export interface TTLFilterConfig {
  enabled: boolean;
  minimumSeconds: number;      // Tempo mínimo para operação se desenvolver (ex: 180s = 3min)
  triggerDelayBuffer: number;  // Buffer para possível atraso no cruzamento do gatilho (ex: 120s = 2min)
  logEnabled: boolean;         // Log detalhado ON/OFF
}

export interface TTLFilterResult {
  blocked: boolean;
  reason?: string;
  metrics: {
    timeRemaining: number;     // Tempo restante até limite de entrada (minuto 45)
    requiredTime: number;      // Tempo mínimo exigido (minimumSeconds + triggerDelayBuffer)
    lastAllowedEntryTimestamp: number; // Timestamp do minuto 45 do candle
    currentTimestamp: number;  // Timestamp atual
  };
  config: {
    minimumSeconds: number;
    triggerDelayBuffer: number;
  };
}

/**
 * Classe TTLFilter - Time-To-Live Filter
 * 
 * Implementação modular e isolada do filtro temporal.
 * Avalia tempo restante dentro da JANELA OPERACIONAL (35-45min no M60).
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
   * IMPORTANTE: O parâmetro é lastAllowedEntryTimestamp (minuto 45),
   * NÃO o fechamento do candle (minuto 60).
   * 
   * @param lastAllowedEntryTimestamp Timestamp Unix (segundos) do limite máximo de entrada (minuto 45)
   * @param currentTimestamp Timestamp Unix (segundos) atual
   * @returns Resultado da verificação com métricas e motivo do bloqueio
   */
  public check(
    lastAllowedEntryTimestamp: number,
    currentTimestamp: number
  ): TTLFilterResult {
    // Se o filtro está desabilitado, não bloqueia
    if (!this.config.enabled) {
      return {
        blocked: false,
        metrics: {
          timeRemaining: 0,
          requiredTime: 0,
          lastAllowedEntryTimestamp,
          currentTimestamp,
        },
        config: {
          minimumSeconds: this.config.minimumSeconds,
          triggerDelayBuffer: this.config.triggerDelayBuffer,
        },
      };
    }

    // Calcular tempo restante até o LIMITE MÁXIMO DE ENTRADA (minuto 45)
    // NÃO até o fechamento do candle (minuto 60)
    const timeRemaining = lastAllowedEntryTimestamp - currentTimestamp;
    
    // Calcular tempo mínimo exigido (tempo para operação + buffer de atraso)
    const requiredTime = this.config.minimumSeconds + this.config.triggerDelayBuffer;

    // Verificar se há tempo suficiente dentro da janela operacional
    const blocked = timeRemaining < requiredTime;
    const reason = blocked 
      ? `Tempo restante na janela operacional insuficiente (${timeRemaining}s < ${requiredTime}s exigidos)`
      : undefined;

    return {
      blocked,
      reason,
      metrics: {
        timeRemaining,
        requiredTime,
        lastAllowedEntryTimestamp,
        currentTimestamp,
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
      return `[TTLFilter] ✅ TTL_APPROVED | TimeRemaining=${result.metrics.timeRemaining}s (até min45)`;
    }

    return `[TTLFilter] 🕒 TTL_BLOCKED | TimeRemaining=${result.metrics.timeRemaining}s (até min45) | Required=${result.metrics.requiredTime}s | Reason=INSUFFICIENT_TIME_IN_WINDOW`;
  }

  /**
   * Formata o resultado para exibição no painel
   */
  public formatPanelMessage(result: TTLFilterResult): string {
    if (!result.blocked) {
      return "Candle aprovado pelo TTL Filter - Tempo suficiente na janela operacional";
    }

    const remainingMinutes = Math.floor(result.metrics.timeRemaining / 60);
    const requiredMinutes = Math.floor(result.metrics.requiredTime / 60);

    return `Tempo insuficiente na janela operacional (35-45min)\n` +
           `• Tempo restante até min45: ${remainingMinutes} minutos (${result.metrics.timeRemaining}s)\n` +
           `• Tempo exigido: ${requiredMinutes} minutos (${result.metrics.requiredTime}s)\n` +
           `• Motivo: ${result.reason}`;
  }
}
