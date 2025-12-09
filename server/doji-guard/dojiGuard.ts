/**
 * DojiGuard - Filtro Anti-Doji
 * 
 * Bloqueia a armação do gatilho em candles com alta probabilidade
 * de terminarem como doji ou extrema indecisão.
 * 
 * Versão: 1.0
 * Ambiente: Produção / Forex M60
 */

export interface DojiGuardConfig {
  enabled: boolean;
  rangeMin: number;  // Range mínimo aceitável (ex: 0.0500)
  ratioMin: number;  // Proporção mínima body/range (ex: 0.18)
}

export interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;  // Preço atual (close parcial)
}

export interface DojiGuardResult {
  blocked: boolean;
  reason?: string;
  metrics: {
    range: number;
    body: number;
    ratio: number;
  };
  config: {
    rangeMin: number;
    ratioMin: number;
  };
}

/**
 * Classe DojiGuard - Filtro Anti-Doji
 * 
 * Implementação modular e isolada do filtro anti-doji.
 * Não interfere com nenhuma outra funcionalidade existente.
 */
export class DojiGuard {
  private config: DojiGuardConfig;

  constructor(config: DojiGuardConfig) {
    this.config = config;
  }

  /**
   * Atualiza a configuração do DojiGuard
   */
  public updateConfig(config: DojiGuardConfig): void {
    this.config = config;
  }

  /**
   * Verifica se o filtro está habilitado
   */
  public isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Verifica se o candle deve ser bloqueado
   * 
   * @param candleData Dados do candle parcial (OHLC)
   * @returns Resultado da verificação com métricas e motivo do bloqueio
   */
  public check(candleData: CandleData): DojiGuardResult {
    // Se o filtro está desabilitado, não bloqueia
    if (!this.config.enabled) {
      return {
        blocked: false,
        metrics: {
          range: 0,
          body: 0,
          ratio: 0,
        },
        config: {
          rangeMin: this.config.rangeMin,
          ratioMin: this.config.ratioMin,
        },
      };
    }

    // Calcular métricas do candle
    const range = candleData.high - candleData.low;
    const body = Math.abs(candleData.close - candleData.open);
    
    // Evitar divisão por zero
    const ratio = range > 0 ? body / range : 0;

    // Verificar condições de bloqueio
    let blocked = false;
    let reason = "";

    // Regra 1: Range == 0 (candle completamente morto)
    if (range === 0) {
      blocked = true;
      reason = "Candle completamente morto (range = 0)";
    }
    // Regra 2: Range < rangeMin (volatilidade insuficiente)
    else if (range < this.config.rangeMin) {
      blocked = true;
      reason = `Range insuficiente (${range.toFixed(4)} < ${this.config.rangeMin.toFixed(4)})`;
    }
    // Regra 3: Ratio < ratioMin (alta probabilidade de doji)
    else if (ratio < this.config.ratioMin) {
      blocked = true;
      reason = `Proporção body/range muito baixa (${(ratio * 100).toFixed(2)}% < ${(this.config.ratioMin * 100).toFixed(2)}%)`;
    }

    return {
      blocked,
      reason,
      metrics: {
        range,
        body,
        ratio,
      },
      config: {
        rangeMin: this.config.rangeMin,
        ratioMin: this.config.ratioMin,
      },
    };
  }

  /**
   * Formata o resultado para log
   */
  public formatLogMessage(result: DojiGuardResult): string {
    if (!result.blocked) {
      return `[DojiGuard] ✅ Candle aprovado — range=${result.metrics.range.toFixed(4)} | ratio=${(result.metrics.ratio * 100).toFixed(2)}%`;
    }

    return `[DojiGuard] 🚫 Candle bloqueado — ${result.reason} | range=${result.metrics.range.toFixed(4)} | body=${result.metrics.body.toFixed(4)} | ratio=${(result.metrics.ratio * 100).toFixed(2)}% | config: range_min=${result.config.rangeMin.toFixed(4)}, ratio_min=${(result.config.ratioMin * 100).toFixed(2)}%`;
  }

  /**
   * Formata o resultado para exibição no painel
   */
  public formatPanelMessage(result: DojiGuardResult): string {
    if (!result.blocked) {
      return "Candle aprovado pelo DojiGuard";
    }

    return `Alta probabilidade de Doji\n` +
           `• Range: ${result.metrics.range.toFixed(4)} (mínimo: ${result.config.rangeMin.toFixed(4)})\n` +
           `• Proporção body/range: ${(result.metrics.ratio * 100).toFixed(2)}% (mínimo: ${(result.config.ratioMin * 100).toFixed(2)}%)\n` +
           `• Motivo: ${result.reason}`;
  }
}
