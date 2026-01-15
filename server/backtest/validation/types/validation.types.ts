/**
 * Validation Types - Tipos para o Módulo de Validação Temporal
 * 
 * Este módulo define os tipos para:
 * - Walk-Forward Validation
 * - Monte Carlo Simulation
 * - Regime Detection
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { BacktestMetrics, BacktestTrade, BacktestStrategyType } from "../../types/backtest.types";

// ============================================================================
// WALK-FORWARD TYPES
// ============================================================================

/**
 * Configuração para validação Walk-Forward
 */
export interface WalkForwardConfig {
  /** Símbolo a validar */
  symbol: string;
  
  /** Parâmetros a testar */
  parameters: Record<string, number | string | boolean>;
  
  /** Data de início do período total */
  startDate: Date;
  
  /** Data de fim do período total */
  endDate: Date;
  
  /** Tamanho da janela de treino em meses */
  windowMonths: number;
  
  /** Avanço da janela em meses */
  stepMonths: number;
  
  /** Executar janelas em paralelo */
  parallelWindows: boolean;
  
  /** Tipo de estratégia */
  strategyType: BacktestStrategyType;
  
  /** Caminho dos dados */
  dataPath: string;
  
  /** Timeframes a usar */
  timeframes: string[];
  
  /** Saldo inicial */
  initialBalance: number;
  
  /** Alavancagem */
  leverage: number;
  
  /** Comissão por lote */
  commission: number;
  
  /** Slippage em pips */
  slippage: number;
  
  /** Spread em pips */
  spread: number;
}

/**
 * Definição de uma janela Walk-Forward
 */
export interface WalkForwardWindow {
  /** Número sequencial da janela */
  windowNumber: number;
  
  /** Início do período de treino */
  trainStart: Date;
  
  /** Fim do período de treino */
  trainEnd: Date;
  
  /** Início do período de teste */
  testStart: Date;
  
  /** Fim do período de teste */
  testEnd: Date;
}

/**
 * Resultado de uma janela individual
 */
export interface WindowResult {
  /** Definição da janela */
  window: WalkForwardWindow;
  
  /** Métricas do período de treino */
  trainMetrics: BacktestMetrics;
  
  /** Métricas do período de teste */
  testMetrics: BacktestMetrics;
  
  /** Degradação por métrica */
  degradation: {
    sharpe: number;
    winRate: number;
    profitFactor: number;
  };
  
  /** Score de estabilidade desta janela (0-100) */
  stabilityScore: number;
}

/**
 * Resultado completo da validação Walk-Forward
 */
export interface WalkForwardResult {
  /** Símbolo validado */
  symbol: string;
  
  /** Parâmetros testados */
  parameters: Record<string, number | string | boolean>;
  
  /** Resultados de cada janela */
  windows: WindowResult[];
  
  /** Métricas agregadas */
  aggregated: {
    /** Sharpe médio das janelas de teste */
    averageSharpe: number;
    
    /** Winrate médio das janelas de teste */
    averageWinRate: number;
    
    /** Degradação média */
    averageDegradation: number;
    
    /** Score de estabilidade geral (0-100) */
    stabilityScore: number;
    
    /** Pior janela */
    worstWindow: WindowResult;
    
    /** Melhor janela */
    bestWindow: WindowResult;
  };
  
  /** Se os parâmetros são considerados robustos */
  isRobust: boolean;
  
  /** Nível de confiança (0-100) */
  confidence: number;
  
  /** Avisos e alertas */
  warnings: string[];
}

// ============================================================================
// MONTE CARLO TYPES
// ============================================================================

/**
 * Configuração para simulação Monte Carlo
 */
export interface MonteCarloConfig {
  /** Trades originais para simular */
  originalTrades: BacktestTrade[];
  
  /** Número de simulações a executar */
  numSimulations: number;
  
  /** Saldo inicial */
  initialBalance: number;
  
  /** Percentil de confiança (ex: 95 para 95%) */
  confidenceLevel: number;
  
  /** Seed para reprodutibilidade (opcional) */
  seed?: number;
}

/**
 * Resultado de uma simulação Monte Carlo individual
 */
export interface MonteCarloSimulation {
  /** ID da simulação */
  simulationId: number;
  
  /** Ordem dos trades (índices) */
  tradeOrder: number[];
  
  /** Saldo final */
  finalBalance: number;
  
  /** Drawdown máximo */
  maxDrawdown: number;
  
  /** Drawdown máximo percentual */
  maxDrawdownPercent: number;
  
  /** Curva de equity */
  equityCurve: { timestamp: number; equity: number }[];
}

/**
 * Resultado completo da simulação Monte Carlo
 */
export interface MonteCarloResult {
  /** Configuração usada */
  config: MonteCarloConfig;
  
  /** Número de simulações executadas */
  numSimulations: number;
  
  /** Estatísticas do saldo final */
  finalBalance: {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    percentile5: number;
    percentile95: number;
  };
  
  /** Estatísticas do drawdown máximo */
  maxDrawdown: {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    percentile5: number;
    percentile95: number;
  };
  
  /** Probabilidade de ruína (drawdown > X%) */
  ruinProbability: {
    above20Percent: number;
    above30Percent: number;
    above50Percent: number;
  };
  
  /** Intervalo de confiança para o retorno */
  confidenceInterval: {
    lower: number;
    upper: number;
    level: number;
  };
  
  /** Todas as simulações (para visualização) */
  simulations: MonteCarloSimulation[];
  
  /** Score de robustez Monte Carlo (0-100) */
  robustnessScore: number;
}

// ============================================================================
// REGIME DETECTION TYPES
// ============================================================================

/**
 * Tipos de regime de mercado
 */
export enum MarketRegimeType {
  BULL = "BULL",           // Tendência de alta
  BEAR = "BEAR",           // Tendência de baixa
  SIDEWAYS = "SIDEWAYS",   // Mercado lateral
  HIGH_VOL = "HIGH_VOL",   // Alta volatilidade
  LOW_VOL = "LOW_VOL",     // Baixa volatilidade
}

/**
 * Configuração para detecção de regime
 */
export interface RegimeDetectionConfig {
  /** Símbolo a analisar */
  symbol: string;
  
  /** Data de início */
  startDate: Date;
  
  /** Data de fim */
  endDate: Date;
  
  /** Timeframe para análise */
  timeframe: string;
  
  /** Período para cálculo de tendência */
  trendPeriod: number;
  
  /** Período para cálculo de volatilidade (ATR) */
  volatilityPeriod: number;
  
  /** Threshold para classificar como tendência */
  trendThreshold: number;
  
  /** Threshold para classificar como alta volatilidade */
  highVolThreshold: number;
  
  /** Threshold para classificar como baixa volatilidade */
  lowVolThreshold: number;
}

/**
 * Período de regime detectado
 */
export interface RegimePeriod {
  /** Tipo de regime */
  regime: MarketRegimeType;
  
  /** Data de início do regime */
  startDate: Date;
  
  /** Data de fim do regime */
  endDate: Date;
  
  /** Duração em dias */
  durationDays: number;
  
  /** Confiança na classificação (0-100) */
  confidence: number;
  
  /** Força da tendência (se aplicável) */
  trendStrength?: number;
  
  /** Nível de volatilidade (se aplicável) */
  volatilityLevel?: number;
  
  /** Range médio do período */
  averageRange?: number;
}

/**
 * Resultado da detecção de regimes
 */
export interface RegimeDetectionResult {
  /** Símbolo analisado */
  symbol: string;
  
  /** Período analisado */
  period: {
    start: Date;
    end: Date;
  };
  
  /** Regimes detectados */
  regimes: RegimePeriod[];
  
  /** Distribuição de tempo por regime */
  distribution: {
    regime: MarketRegimeType;
    percentOfTime: number;
    totalDays: number;
  }[];
  
  /** Regime atual (último detectado) */
  currentRegime: RegimePeriod | null;
}

// ============================================================================
// VALIDATION PROGRESS
// ============================================================================

/**
 * Progresso da validação
 */
export interface ValidationProgress {
  /** Tipo de validação em execução */
  validationType: "WALK_FORWARD" | "MONTE_CARLO" | "REGIME_DETECTION";
  
  /** Fase atual */
  phase: "INITIALIZING" | "PROCESSING" | "AGGREGATING" | "COMPLETED" | "ERROR";
  
  /** Progresso atual (0-100) */
  percentComplete: number;
  
  /** Item atual sendo processado */
  currentItem: number;
  
  /** Total de itens */
  totalItems: number;
  
  /** Mensagem de status */
  statusMessage: string;
  
  /** Tempo estimado restante (segundos) */
  estimatedTimeRemaining: number;
}

// ============================================================================
// COMBINED VALIDATION RESULT
// ============================================================================

/**
 * Resultado combinado de todas as validações
 */
export interface CombinedValidationResult {
  /** Símbolo validado */
  symbol: string;
  
  /** Parâmetros testados */
  parameters: Record<string, number | string | boolean>;
  
  /** Resultado Walk-Forward */
  walkForward?: WalkForwardResult;
  
  /** Resultado Monte Carlo */
  monteCarlo?: MonteCarloResult;
  
  /** Resultado de detecção de regime */
  regimeDetection?: RegimeDetectionResult;
  
  /** Score de robustez combinado (0-100) */
  combinedRobustnessScore: number;
  
  /** Recomendação final */
  recommendation: {
    /** Se é recomendado para uso */
    isRecommended: boolean;
    
    /** Nível de confiança */
    confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
    
    /** Regimes onde funciona melhor */
    bestRegimes: MarketRegimeType[];
    
    /** Regimes a evitar */
    avoidRegimes: MarketRegimeType[];
    
    /** Resumo textual */
    summary: string;
  };
  
  /** Todos os avisos */
  warnings: string[];
  
  /** Timestamp da validação */
  validatedAt: Date;
}
