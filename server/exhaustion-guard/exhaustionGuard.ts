/**
 * ExhaustionGuard - Filtro de Exaustão de Candle
 * 
 * Bloqueia a armação do gatilho quando o candle atual apresenta
 * sinais estatísticos de exaustão excessiva, aumentando o risco
 * de reversão no final do candle.
 * 
 * O filtro NÃO prevê reversão, NÃO entra contra a tendência, NÃO cria operações.
 * Ele apenas responde:
 * ✅ Este candle é saudável para operar
 * ❌ Este candle deve ser ignorado
 * 
 * Versão: 1.0
 * Ambiente: Produção / Forex M60
 */

export interface ExhaustionGuardConfig {
  enabled: boolean;
  exhaustionRatioMax: number;      // Limite máximo de exaustão (ex: 0.70 = 70%)
  rangeLookback: number;           // Nº de candles para média de range (ex: 20)
  rangeMultiplier: number;         // Multiplicador de range anormal (ex: 1.5)
  logEnabled: boolean;             // Log detalhado ON/OFF
}

export interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;  // Preço atual (close parcial)
}

export interface HistoricalCandle {
  high: number;
  low: number;
}

export interface ExhaustionGuardResult {
  blocked: boolean;
  reason?: string;
  blockType?: 'HIGH_EXHAUSTION' | 'ABNORMAL_RANGE';
  metrics: {
    range: number;
    directionalMove: number;
    exhaustionRatio: number;
    avgRange: number | null;
    rangeRatio: number | null;
  };
  config: {
    exhaustionRatioMax: number;
    rangeLookback: number;
    rangeMultiplier: number;
  };
}

/**
 * Classe ExhaustionGuard - Filtro de Exaustão
 * 
 * Implementação modular e isolada do filtro de exaustão.
 * Não interfere com nenhuma outra funcionalidade existente.
 */
export class ExhaustionGuard {
  private config: ExhaustionGuardConfig;

  constructor(config: ExhaustionGuardConfig) {
    this.config = config;
  }

  /**
   * Atualiza a configuração do ExhaustionGuard
   */
  public updateConfig(config: ExhaustionGuardConfig): void {
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
   * Calcula a média de range dos últimos N candles
   */
  private calculateAverageRange(historicalCandles: HistoricalCandle[]): number | null {
    if (!historicalCandles || historicalCandles.length === 0) {
      return null;
    }

    const ranges = historicalCandles.map(c => c.high - c.low);
    const sum = ranges.reduce((acc, r) => acc + r, 0);
    return sum / ranges.length;
  }

  /**
   * Verifica se o candle deve ser bloqueado por exaustão
   * 
   * @param candleData Dados do candle parcial (OHLC)
   * @param historicalCandles Histórico de candles para cálculo de média (opcional)
   * @returns Resultado da verificação com métricas e motivo do bloqueio
   */
  public check(
    candleData: CandleData,
    historicalCandles?: HistoricalCandle[]
  ): ExhaustionGuardResult {
    // Se o filtro está desabilitado, não bloqueia
    if (!this.config.enabled) {
      return {
        blocked: false,
        metrics: {
          range: 0,
          directionalMove: 0,
          exhaustionRatio: 0,
          avgRange: null,
          rangeRatio: null,
        },
        config: {
          exhaustionRatioMax: this.config.exhaustionRatioMax,
          rangeLookback: this.config.rangeLookback,
          rangeMultiplier: this.config.rangeMultiplier,
        },
      };
    }

    // Calcular métricas do candle atual
    const range = candleData.high - candleData.low;
    const directionalMove = Math.abs(candleData.close - candleData.open);
    
    // Evitar divisão por zero
    const exhaustionRatio = range > 0 ? directionalMove / range : 0;

    // Calcular média de range histórico (se disponível)
    let avgRange: number | null = null;
    let rangeRatio: number | null = null;

    if (historicalCandles && historicalCandles.length >= this.config.rangeLookback) {
      // Pegar apenas os últimos N candles conforme configuração
      const relevantCandles = historicalCandles.slice(0, this.config.rangeLookback);
      avgRange = this.calculateAverageRange(relevantCandles);
      
      if (avgRange && avgRange > 0) {
        rangeRatio = range / avgRange;
      }
    }

    // Verificar condições de bloqueio
    let blocked = false;
    let reason = "";
    let blockType: 'HIGH_EXHAUSTION' | 'ABNORMAL_RANGE' | undefined;

    // 🔒 Condição 1 — Exhaustion Ratio Excessivo
    if (exhaustionRatio >= this.config.exhaustionRatioMax) {
      blocked = true;
      blockType = 'HIGH_EXHAUSTION';
      reason = `Exhaustion Ratio excessivo (${(exhaustionRatio * 100).toFixed(1)}% >= ${(this.config.exhaustionRatioMax * 100).toFixed(1)}%)`;
    }
    // 🔒 Condição 2 — Range Anormal (se tiver histórico suficiente)
    else if (rangeRatio !== null && rangeRatio >= this.config.rangeMultiplier) {
      blocked = true;
      blockType = 'ABNORMAL_RANGE';
      reason = `Range anormal (${rangeRatio.toFixed(2)}x >= ${this.config.rangeMultiplier}x da média)`;
    }

    return {
      blocked,
      reason,
      blockType,
      metrics: {
        range,
        directionalMove,
        exhaustionRatio,
        avgRange,
        rangeRatio,
      },
      config: {
        exhaustionRatioMax: this.config.exhaustionRatioMax,
        rangeLookback: this.config.rangeLookback,
        rangeMultiplier: this.config.rangeMultiplier,
      },
    };
  }

  /**
   * Formata o resultado para log
   */
  public formatLogMessage(result: ExhaustionGuardResult): string {
    if (!result.blocked) {
      const avgRangeInfo = result.metrics.avgRange !== null 
        ? ` | AvgRange(${result.config.rangeLookback})=${result.metrics.avgRange.toFixed(4)}`
        : '';
      return `[ExhaustionGuard] ✅ Candle aprovado — ExhaustionRatio=${(result.metrics.exhaustionRatio * 100).toFixed(1)}%${avgRangeInfo}`;
    }

    const avgRangeInfo = result.metrics.avgRange !== null 
      ? ` | AvgRange(${result.config.rangeLookback})=${result.metrics.avgRange.toFixed(4)}`
      : '';
    const rangeRatioInfo = result.metrics.rangeRatio !== null 
      ? ` | RangeRatio=${result.metrics.rangeRatio.toFixed(2)}x`
      : '';

    return `[ExhaustionGuard] 🛑 Candle bloqueado — ${result.reason} | ` +
           `Range=${result.metrics.range.toFixed(4)} | ` +
           `DirectionalMove=${result.metrics.directionalMove.toFixed(4)} | ` +
           `ExhaustionRatio=${(result.metrics.exhaustionRatio * 100).toFixed(1)}%` +
           `${avgRangeInfo}${rangeRatioInfo} | ` +
           `Motivo=${result.blockType}`;
  }

  /**
   * Formata o resultado para exibição no painel
   */
  public formatPanelMessage(result: ExhaustionGuardResult): string {
    if (!result.blocked) {
      return "Candle aprovado pelo ExhaustionGuard";
    }

    const avgRangeInfo = result.metrics.avgRange !== null 
      ? `\n• Média Range (${result.config.rangeLookback} candles): ${result.metrics.avgRange.toFixed(4)}`
      : '';
    const rangeRatioInfo = result.metrics.rangeRatio !== null 
      ? `\n• Proporção Range/Média: ${result.metrics.rangeRatio.toFixed(2)}x (máximo: ${result.config.rangeMultiplier}x)`
      : '';

    return `Alta probabilidade de reversão por exaustão\n` +
           `• Range: ${result.metrics.range.toFixed(4)}\n` +
           `• Movimento Direcional: ${result.metrics.directionalMove.toFixed(4)}\n` +
           `• Exhaustion Ratio: ${(result.metrics.exhaustionRatio * 100).toFixed(1)}% (máximo: ${(result.config.exhaustionRatioMax * 100).toFixed(1)}%)` +
           `${avgRangeInfo}${rangeRatioInfo}\n` +
           `• Motivo: ${result.reason}`;
  }
}
