/**
 * CorrelationAnalyzer - Analisador de Correlação Multi-Asset
 * 
 * IMPLEMENTAÇÃO WP6: Multi-Asset com relógio global (institucional)
 * 
 * Implementa análise de correlação entre ativos:
 * - Matriz de correlação de Pearson
 * - Correlação rolling (janela móvel)
 * - Detecção de mudanças de correlação
 * - Análise de diversificação
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Matriz de correlação
 */
export interface CorrelationMatrix {
  symbols: string[];
  matrix: number[][];
  timestamp: number;
  period: number; // Período usado para cálculo
}

/**
 * Par de correlação
 */
export interface CorrelationPair {
  symbol1: string;
  symbol2: string;
  correlation: number;
  strength: "STRONG_POSITIVE" | "MODERATE_POSITIVE" | "WEAK" | "MODERATE_NEGATIVE" | "STRONG_NEGATIVE";
}

/**
 * Resultado da análise de correlação
 */
export interface CorrelationAnalysisResult {
  matrix: CorrelationMatrix;
  pairs: CorrelationPair[];
  highlyCorrelated: CorrelationPair[];
  diversificationScore: number;
  warnings: string[];
}

/**
 * Configuração do analisador
 */
export interface CorrelationAnalyzerConfig {
  /** Período para cálculo de correlação (número de observações) */
  period: number;
  /** Threshold para correlação alta (positiva ou negativa) */
  highCorrelationThreshold: number;
  /** Threshold para correlação fraca */
  weakCorrelationThreshold: number;
}

// ============================================================================
// CORRELATION ANALYZER CLASS
// ============================================================================

export class CorrelationAnalyzer {
  private config: CorrelationAnalyzerConfig;
  
  // Histórico de retornos por símbolo
  private returnsHistory: Map<string, number[]> = new Map();
  
  // Histórico de matrizes de correlação
  private matrixHistory: CorrelationMatrix[] = [];
  
  constructor(config: CorrelationAnalyzerConfig) {
    this.config = config;
    console.log(`[CorrelationAnalyzer] Inicializado com período: ${config.period}`);
  }
  
  /**
   * Adicionar retorno para um símbolo
   */
  addReturn(symbol: string, returnValue: number): void {
    if (!this.returnsHistory.has(symbol)) {
      this.returnsHistory.set(symbol, []);
    }
    
    const returns = this.returnsHistory.get(symbol)!;
    returns.push(returnValue);
    
    // Manter apenas o período necessário
    if (returns.length > this.config.period * 2) {
      returns.shift();
    }
  }
  
  /**
   * Adicionar retornos de múltiplos símbolos (mesmo timestamp)
   */
  addReturns(returns: Record<string, number>): void {
    for (const [symbol, returnValue] of Object.entries(returns)) {
      this.addReturn(symbol, returnValue);
    }
  }
  
  /**
   * Calcular correlação de Pearson entre dois arrays
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;
    
    // Usar apenas os últimos n valores
    const xSlice = x.slice(-n);
    const ySlice = y.slice(-n);
    
    // Calcular médias
    const xMean = xSlice.reduce((a, b) => a + b, 0) / n;
    const yMean = ySlice.reduce((a, b) => a + b, 0) / n;
    
    // Calcular covariância e desvios padrão
    let covariance = 0;
    let xVariance = 0;
    let yVariance = 0;
    
    for (let i = 0; i < n; i++) {
      const xDiff = xSlice[i] - xMean;
      const yDiff = ySlice[i] - yMean;
      covariance += xDiff * yDiff;
      xVariance += xDiff * xDiff;
      yVariance += yDiff * yDiff;
    }
    
    const denominator = Math.sqrt(xVariance * yVariance);
    if (denominator === 0) return 0;
    
    return covariance / denominator;
  }
  
  /**
   * Calcular matriz de correlação atual
   */
  calculateMatrix(): CorrelationMatrix {
    const symbols = Array.from(this.returnsHistory.keys()).sort();
    const n = symbols.length;
    const matrix: number[][] = [];
    
    for (let i = 0; i < n; i++) {
      matrix[i] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          matrix[i][j] = 1; // Correlação consigo mesmo
        } else if (j < i) {
          matrix[i][j] = matrix[j][i]; // Matriz simétrica
        } else {
          const returns1 = this.returnsHistory.get(symbols[i]) || [];
          const returns2 = this.returnsHistory.get(symbols[j]) || [];
          matrix[i][j] = this.pearsonCorrelation(returns1, returns2);
        }
      }
    }
    
    const result: CorrelationMatrix = {
      symbols,
      matrix,
      timestamp: Date.now(),
      period: this.config.period,
    };
    
    // Salvar no histórico
    this.matrixHistory.push(result);
    if (this.matrixHistory.length > 100) {
      this.matrixHistory.shift();
    }
    
    return result;
  }
  
  /**
   * Extrair pares de correlação da matriz
   */
  extractPairs(matrix: CorrelationMatrix): CorrelationPair[] {
    const pairs: CorrelationPair[] = [];
    const { symbols, matrix: m } = matrix;
    
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const correlation = m[i][j];
        pairs.push({
          symbol1: symbols[i],
          symbol2: symbols[j],
          correlation,
          strength: this.classifyCorrelation(correlation),
        });
      }
    }
    
    // Ordenar por valor absoluto de correlação (decrescente)
    pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
    
    return pairs;
  }
  
  /**
   * Classificar força da correlação
   */
  private classifyCorrelation(correlation: number): CorrelationPair["strength"] {
    const abs = Math.abs(correlation);
    
    if (abs >= this.config.highCorrelationThreshold) {
      return correlation > 0 ? "STRONG_POSITIVE" : "STRONG_NEGATIVE";
    } else if (abs >= this.config.weakCorrelationThreshold) {
      return correlation > 0 ? "MODERATE_POSITIVE" : "MODERATE_NEGATIVE";
    } else {
      return "WEAK";
    }
  }
  
  /**
   * Calcular score de diversificação (0-100)
   * 
   * Score alto = portfólio bem diversificado
   * Score baixo = ativos muito correlacionados
   */
  calculateDiversificationScore(pairs: CorrelationPair[]): number {
    if (pairs.length === 0) return 100;
    
    // Média das correlações absolutas
    const avgAbsCorrelation = pairs.reduce((sum, p) => sum + Math.abs(p.correlation), 0) / pairs.length;
    
    // Score inversamente proporcional à correlação média
    // 0 correlação = 100 score, 1 correlação = 0 score
    return Math.max(0, (1 - avgAbsCorrelation) * 100);
  }
  
  /**
   * Executar análise completa de correlação
   */
  analyze(): CorrelationAnalysisResult {
    const matrix = this.calculateMatrix();
    const pairs = this.extractPairs(matrix);
    
    // Filtrar pares altamente correlacionados
    const highlyCorrelated = pairs.filter(
      p => Math.abs(p.correlation) >= this.config.highCorrelationThreshold
    );
    
    // Calcular score de diversificação
    const diversificationScore = this.calculateDiversificationScore(pairs);
    
    // Gerar warnings
    const warnings: string[] = [];
    
    if (highlyCorrelated.length > 0) {
      for (const pair of highlyCorrelated.slice(0, 3)) {
        warnings.push(
          `${pair.symbol1} e ${pair.symbol2} têm correlação ${pair.strength.toLowerCase().replace("_", " ")} ` +
          `(${(pair.correlation * 100).toFixed(1)}%)`
        );
      }
    }
    
    if (diversificationScore < 50) {
      warnings.push(
        `Score de diversificação baixo (${diversificationScore.toFixed(1)}%). ` +
        `Considere adicionar ativos menos correlacionados.`
      );
    }
    
    return {
      matrix,
      pairs,
      highlyCorrelated,
      diversificationScore,
      warnings,
    };
  }
  
  /**
   * Obter correlação entre dois símbolos específicos
   */
  getCorrelation(symbol1: string, symbol2: string): number {
    const returns1 = this.returnsHistory.get(symbol1);
    const returns2 = this.returnsHistory.get(symbol2);
    
    if (!returns1 || !returns2) return 0;
    
    return this.pearsonCorrelation(returns1, returns2);
  }
  
  /**
   * Verificar se dois símbolos estão altamente correlacionados
   */
  areHighlyCorrelated(symbol1: string, symbol2: string): boolean {
    const correlation = this.getCorrelation(symbol1, symbol2);
    return Math.abs(correlation) >= this.config.highCorrelationThreshold;
  }
  
  /**
   * Obter símbolos correlacionados com um símbolo específico
   */
  getCorrelatedSymbols(symbol: string): { symbol: string; correlation: number }[] {
    const result: { symbol: string; correlation: number }[] = [];
    
    for (const [otherSymbol] of this.returnsHistory) {
      if (otherSymbol !== symbol) {
        const correlation = this.getCorrelation(symbol, otherSymbol);
        if (Math.abs(correlation) >= this.config.weakCorrelationThreshold) {
          result.push({ symbol: otherSymbol, correlation });
        }
      }
    }
    
    // Ordenar por correlação absoluta
    result.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
    
    return result;
  }
  
  /**
   * Detectar mudança significativa na correlação
   */
  detectCorrelationChange(symbol1: string, symbol2: string, threshold: number = 0.2): {
    changed: boolean;
    previousCorrelation: number;
    currentCorrelation: number;
    change: number;
  } | null {
    if (this.matrixHistory.length < 2) return null;
    
    const current = this.matrixHistory[this.matrixHistory.length - 1];
    const previous = this.matrixHistory[this.matrixHistory.length - 2];
    
    const idx1Current = current.symbols.indexOf(symbol1);
    const idx2Current = current.symbols.indexOf(symbol2);
    const idx1Previous = previous.symbols.indexOf(symbol1);
    const idx2Previous = previous.symbols.indexOf(symbol2);
    
    if (idx1Current === -1 || idx2Current === -1 || idx1Previous === -1 || idx2Previous === -1) {
      return null;
    }
    
    const currentCorrelation = current.matrix[idx1Current][idx2Current];
    const previousCorrelation = previous.matrix[idx1Previous][idx2Previous];
    const change = currentCorrelation - previousCorrelation;
    
    return {
      changed: Math.abs(change) >= threshold,
      previousCorrelation,
      currentCorrelation,
      change,
    };
  }
  
  /**
   * Obter histórico de matrizes
   */
  getMatrixHistory(): CorrelationMatrix[] {
    return [...this.matrixHistory];
  }
  
  /**
   * Obter símbolos registrados
   */
  getSymbols(): string[] {
    return Array.from(this.returnsHistory.keys());
  }
  
  /**
   * Limpar dados de um símbolo
   */
  clearSymbol(symbol: string): void {
    this.returnsHistory.delete(symbol);
  }
  
  /**
   * Resetar analisador
   */
  reset(): void {
    this.returnsHistory.clear();
    this.matrixHistory = [];
    console.log(`[CorrelationAnalyzer] Resetado`);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Criar analisador de correlação
 */
export function createCorrelationAnalyzer(config: CorrelationAnalyzerConfig): CorrelationAnalyzer {
  return new CorrelationAnalyzer(config);
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_CORRELATION_ANALYZER_CONFIG: CorrelationAnalyzerConfig = {
  period: 50,
  highCorrelationThreshold: 0.7,
  weakCorrelationThreshold: 0.3,
};

// ============================================================================
// EXPORTS
// ============================================================================

export default CorrelationAnalyzer;
