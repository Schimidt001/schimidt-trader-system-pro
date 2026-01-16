/**
 * PayloadOptimizer - Otimização de Payloads para Persistência
 * 
 * Implementa limites e otimizações para evitar explosão de JSON:
 * - Top-N trades por preview na UI
 * - Equity curve downsampled para gráficos
 * - Artefatos pesados salvos em arquivo com ponteiro no banco
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// TYPES
// ============================================================================

export interface PayloadLimits {
  /** Número máximo de trades para preview na UI */
  maxTradesPreview: number;
  /** Número máximo de pontos na equity curve para gráficos */
  maxEquityCurvePoints: number;
  /** Tamanho máximo do payload JSON em bytes */
  maxPayloadSizeBytes: number;
  /** Número máximo de simulações Monte Carlo para retornar */
  maxMonteCarloSimulations: number;
  /** Número máximo de regimes para retornar */
  maxRegimes: number;
}

export interface OptimizedPayload<T = unknown> {
  /** Dados otimizados para UI */
  data: T;
  /** Metadados sobre a otimização */
  meta: {
    originalSize: number;
    optimizedSize: number;
    compressionRatio: number;
    truncated: boolean;
    artifactPath?: string;
    artifactHash?: string;
  };
}

export interface ArtifactReference {
  /** Caminho do arquivo de artefato */
  path: string;
  /** Hash SHA-256 do conteúdo */
  hash: string;
  /** Tamanho em bytes */
  size: number;
  /** Timestamp de criação */
  createdAt: Date;
  /** Tipo de artefato */
  type: "trades" | "equity_curve" | "simulations" | "full_result";
}

// ============================================================================
// DEFAULT LIMITS
// ============================================================================

export const DEFAULT_PAYLOAD_LIMITS: PayloadLimits = {
  maxTradesPreview: 100,
  maxEquityCurvePoints: 500,
  maxPayloadSizeBytes: 1024 * 1024, // 1MB
  maxMonteCarloSimulations: 100,
  maxRegimes: 50,
};

// ============================================================================
// PAYLOAD OPTIMIZER
// ============================================================================

export class PayloadOptimizer {
  private limits: PayloadLimits;
  private artifactsDir: string;

  constructor(limits: Partial<PayloadLimits> = {}, artifactsDir?: string) {
    this.limits = { ...DEFAULT_PAYLOAD_LIMITS, ...limits };
    this.artifactsDir = artifactsDir || path.join(process.cwd(), "data", "artifacts");
    
    // Garantir que o diretório de artefatos existe
    if (!fs.existsSync(this.artifactsDir)) {
      fs.mkdirSync(this.artifactsDir, { recursive: true });
    }
  }

  // =========================================================================
  // TRADES OPTIMIZATION
  // =========================================================================

  /**
   * Otimiza lista de trades para preview na UI
   * Mantém os N mais recentes e os N mais lucrativos
   */
  optimizeTrades(trades: any[]): OptimizedPayload<any[]> {
    const originalSize = JSON.stringify(trades).length;

    if (trades.length <= this.limits.maxTradesPreview) {
      return {
        data: trades,
        meta: {
          originalSize,
          optimizedSize: originalSize,
          compressionRatio: 1,
          truncated: false,
        },
      };
    }

    // Estratégia: metade mais recentes, metade mais lucrativos
    const halfLimit = Math.floor(this.limits.maxTradesPreview / 2);

    // Ordenar por timestamp (mais recentes)
    const sortedByTime = [...trades].sort((a, b) => b.closeTimestamp - a.closeTimestamp);
    const recentTrades = sortedByTime.slice(0, halfLimit);

    // Ordenar por lucro (mais lucrativos)
    const sortedByProfit = [...trades].sort((a, b) => b.profit - a.profit);
    const profitableTrades = sortedByProfit.slice(0, halfLimit);

    // Combinar e remover duplicatas
    const combined = [...recentTrades];
    const recentIds = new Set(recentTrades.map(t => t.id));
    
    for (const trade of profitableTrades) {
      if (!recentIds.has(trade.id)) {
        combined.push(trade);
      }
    }

    // Limitar ao máximo
    const optimized = combined.slice(0, this.limits.maxTradesPreview);
    const optimizedSize = JSON.stringify(optimized).length;

    return {
      data: optimized,
      meta: {
        originalSize,
        optimizedSize,
        compressionRatio: originalSize / optimizedSize,
        truncated: true,
      },
    };
  }

  // =========================================================================
  // EQUITY CURVE OPTIMIZATION
  // =========================================================================

  /**
   * Downsample da equity curve para gráficos
   * Usa algoritmo LTTB (Largest Triangle Three Buckets) simplificado
   */
  optimizeEquityCurve(equityCurve: number[], timestamps?: number[]): OptimizedPayload<{
    values: number[];
    timestamps?: number[];
  }> {
    const originalSize = JSON.stringify(equityCurve).length;

    if (equityCurve.length <= this.limits.maxEquityCurvePoints) {
      return {
        data: { values: equityCurve, timestamps },
        meta: {
          originalSize,
          optimizedSize: originalSize,
          compressionRatio: 1,
          truncated: false,
        },
      };
    }

    // Downsample usando seleção uniforme com preservação de extremos
    const targetPoints = this.limits.maxEquityCurvePoints;
    const step = equityCurve.length / targetPoints;
    
    const downsampledValues: number[] = [];
    const downsampledTimestamps: number[] = [];

    // Sempre incluir primeiro e último ponto
    downsampledValues.push(equityCurve[0]);
    if (timestamps) downsampledTimestamps.push(timestamps[0]);

    // Pontos intermediários
    for (let i = 1; i < targetPoints - 1; i++) {
      const index = Math.floor(i * step);
      
      // Encontrar máximo e mínimo no bucket para preservar volatilidade
      const bucketStart = Math.floor((i - 0.5) * step);
      const bucketEnd = Math.floor((i + 0.5) * step);
      
      let max = equityCurve[bucketStart];
      let min = equityCurve[bucketStart];
      let maxIdx = bucketStart;
      let minIdx = bucketStart;
      
      for (let j = bucketStart; j < bucketEnd && j < equityCurve.length; j++) {
        if (equityCurve[j] > max) {
          max = equityCurve[j];
          maxIdx = j;
        }
        if (equityCurve[j] < min) {
          min = equityCurve[j];
          minIdx = j;
        }
      }

      // Usar o ponto mais distante da média do bucket
      const avg = (max + min) / 2;
      const useMax = Math.abs(max - avg) > Math.abs(min - avg);
      const selectedIdx = useMax ? maxIdx : minIdx;
      
      downsampledValues.push(equityCurve[selectedIdx]);
      if (timestamps) downsampledTimestamps.push(timestamps[selectedIdx]);
    }

    // Último ponto
    downsampledValues.push(equityCurve[equityCurve.length - 1]);
    if (timestamps) downsampledTimestamps.push(timestamps[timestamps.length - 1]);

    const optimizedSize = JSON.stringify(downsampledValues).length;

    return {
      data: {
        values: downsampledValues,
        timestamps: timestamps ? downsampledTimestamps : undefined,
      },
      meta: {
        originalSize,
        optimizedSize,
        compressionRatio: originalSize / optimizedSize,
        truncated: true,
      },
    };
  }

  // =========================================================================
  // MONTE CARLO OPTIMIZATION
  // =========================================================================

  /**
   * Otimiza resultados de Monte Carlo
   * Mantém estatísticas agregadas e amostra de simulações
   */
  optimizeMonteCarloResult(result: any): OptimizedPayload<any> {
    const originalSize = JSON.stringify(result).length;

    if (!result.simulations || result.simulations.length <= this.limits.maxMonteCarloSimulations) {
      return {
        data: result,
        meta: {
          originalSize,
          optimizedSize: originalSize,
          compressionRatio: 1,
          truncated: false,
        },
      };
    }

    // Manter estatísticas agregadas
    const optimized = {
      ...result,
      simulations: this.sampleSimulations(result.simulations, this.limits.maxMonteCarloSimulations),
      totalSimulations: result.simulations.length,
      simulationsSampled: this.limits.maxMonteCarloSimulations,
    };

    const optimizedSize = JSON.stringify(optimized).length;

    return {
      data: optimized,
      meta: {
        originalSize,
        optimizedSize,
        compressionRatio: originalSize / optimizedSize,
        truncated: true,
      },
    };
  }

  /**
   * Amostra simulações preservando distribuição
   */
  private sampleSimulations(simulations: any[], targetCount: number): any[] {
    // Ordenar por finalEquity
    const sorted = [...simulations].sort((a, b) => a.finalEquity - b.finalEquity);
    
    // Selecionar uniformemente para preservar distribuição
    const step = sorted.length / targetCount;
    const sampled: any[] = [];

    for (let i = 0; i < targetCount; i++) {
      const index = Math.floor(i * step);
      sampled.push(sorted[index]);
    }

    return sampled;
  }

  // =========================================================================
  // ARTIFACT MANAGEMENT
  // =========================================================================

  /**
   * Salva dados pesados como artefato e retorna referência
   */
  saveAsArtifact(data: any, runId: string, type: ArtifactReference["type"]): ArtifactReference {
    const json = JSON.stringify(data);
    const hash = crypto.createHash("sha256").update(json).digest("hex");
    const filename = `${runId}_${type}_${hash.substring(0, 8)}.json`;
    const filepath = path.join(this.artifactsDir, filename);

    fs.writeFileSync(filepath, json);

    return {
      path: filepath,
      hash,
      size: json.length,
      createdAt: new Date(),
      type,
    };
  }

  /**
   * Carrega artefato do disco
   */
  loadArtifact(reference: ArtifactReference): any {
    if (!fs.existsSync(reference.path)) {
      throw new Error(`Artefato não encontrado: ${reference.path}`);
    }

    const json = fs.readFileSync(reference.path, "utf-8");
    const hash = crypto.createHash("sha256").update(json).digest("hex");

    if (hash !== reference.hash) {
      throw new Error(`Hash do artefato não confere. Esperado: ${reference.hash}, Obtido: ${hash}`);
    }

    return JSON.parse(json);
  }

  /**
   * Remove artefatos antigos (cleanup)
   */
  cleanupOldArtifacts(maxAgeDays: number = 30): number {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    let removed = 0;

    const files = fs.readdirSync(this.artifactsDir);
    for (const file of files) {
      const filepath = path.join(this.artifactsDir, file);
      const stats = fs.statSync(filepath);
      
      if (stats.mtimeMs < cutoff) {
        fs.unlinkSync(filepath);
        removed++;
      }
    }

    return removed;
  }

  // =========================================================================
  // FULL RESULT OPTIMIZATION
  // =========================================================================

  /**
   * Otimiza resultado completo de backtest
   * Combina todas as otimizações e salva artefatos se necessário
   */
  optimizeBacktestResult(result: any, runId: string): {
    optimized: any;
    artifacts: ArtifactReference[];
  } {
    const artifacts: ArtifactReference[] = [];
    const optimized = { ...result };

    // Otimizar trades
    if (result.trades && result.trades.length > this.limits.maxTradesPreview) {
      const tradesArtifact = this.saveAsArtifact(result.trades, runId, "trades");
      artifacts.push(tradesArtifact);
      
      const optimizedTrades = this.optimizeTrades(result.trades);
      optimized.trades = optimizedTrades.data;
      optimized.tradesArtifact = {
        path: tradesArtifact.path,
        hash: tradesArtifact.hash,
        totalCount: result.trades.length,
        previewCount: optimizedTrades.data.length,
      };
    }

    // Otimizar equity curve
    if (result.equityCurve && result.equityCurve.length > this.limits.maxEquityCurvePoints) {
      const ecArtifact = this.saveAsArtifact(result.equityCurve, runId, "equity_curve");
      artifacts.push(ecArtifact);
      
      const optimizedEC = this.optimizeEquityCurve(result.equityCurve, result.timestamps);
      optimized.equityCurve = optimizedEC.data.values;
      optimized.timestamps = optimizedEC.data.timestamps;
      optimized.equityCurveArtifact = {
        path: ecArtifact.path,
        hash: ecArtifact.hash,
        totalPoints: result.equityCurve.length,
        downsampledPoints: optimizedEC.data.values.length,
      };
    }

    // Verificar tamanho final
    const finalSize = JSON.stringify(optimized).length;
    if (finalSize > this.limits.maxPayloadSizeBytes) {
      // Salvar resultado completo como artefato
      const fullArtifact = this.saveAsArtifact(result, runId, "full_result");
      artifacts.push(fullArtifact);
      
      optimized.fullResultArtifact = {
        path: fullArtifact.path,
        hash: fullArtifact.hash,
        size: fullArtifact.size,
      };
    }

    return { optimized, artifacts };
  }

  // =========================================================================
  // GETTERS
  // =========================================================================

  getLimits(): PayloadLimits {
    return { ...this.limits };
  }

  getArtifactsDir(): string {
    return this.artifactsDir;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createPayloadOptimizer(
  limits?: Partial<PayloadLimits>,
  artifactsDir?: string
): PayloadOptimizer {
  return new PayloadOptimizer(limits, artifactsDir);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default PayloadOptimizer;
