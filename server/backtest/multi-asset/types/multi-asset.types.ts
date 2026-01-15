/**
 * Multi-Asset Types - Tipos para o Módulo de Orquestração Multi-Asset
 * 
 * Este módulo define os tipos para:
 * - Orquestração de múltiplos símbolos
 * - Análise de correlação
 * - Métricas de portfólio
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { BacktestMetrics, BacktestTrade, BacktestStrategyType } from "../../types/backtest.types";
import { CombinationResult } from "../../optimization/types/optimization.types";
import { WalkForwardResult } from "../../validation/types/validation.types";

// ============================================================================
// MULTI-ASSET ORCHESTRATOR TYPES
// ============================================================================

/**
 * Configuração para orquestração multi-asset
 */
export interface MultiAssetConfig {
  /** Lista de símbolos a processar */
  symbols: string[];
  
  /** Data de início */
  startDate: Date;
  
  /** Data de fim */
  endDate: Date;
  
  /** Tipo de estratégia */
  strategyType: BacktestStrategyType;
  
  /** Parâmetros base (podem ser otimizados por símbolo) */
  baseParameters: Record<string, number | string | boolean>;
  
  /** Se deve otimizar parâmetros por símbolo */
  optimizePerSymbol: boolean;
  
  /** Número máximo de workers paralelos */
  maxParallelWorkers: number;
  
  /** Caminho dos dados */
  dataPath: string;
  
  /** Timeframes a usar */
  timeframes: string[];
  
  /** Saldo inicial */
  initialBalance: number;
  
  /** Alavancagem */
  leverage: number;
}

/**
 * Resultado por símbolo
 */
export interface SymbolResult {
  /** Símbolo */
  symbol: string;
  
  /** Melhor combinação de parâmetros encontrada */
  bestCombination: CombinationResult | null;
  
  /** Resultado da validação Walk-Forward */
  walkForwardResult: WalkForwardResult | null;
  
  /** Métricas finais */
  metrics: BacktestMetrics | null;
  
  /** Se é recomendado para trading */
  isRecommended: boolean;
  
  /** Score de robustez */
  robustnessScore: number;
  
  /** Avisos */
  warnings: string[];
  
  /** Erros encontrados */
  errors: string[];
  
  /** Tempo de processamento (segundos) */
  processingTime: number;
}

/**
 * Resultado completo multi-asset
 */
export interface MultiAssetResult {
  /** Configuração usada */
  config: MultiAssetConfig;
  
  /** Resultados por símbolo */
  symbolResults: SymbolResult[];
  
  /** Análise de correlação */
  correlationAnalysis: CorrelationAnalysis;
  
  /** Métricas de portfólio */
  portfolioMetrics: PortfolioMetrics;
  
  /** Símbolos recomendados */
  recommendedSymbols: string[];
  
  /** Tempo total de execução (segundos) */
  totalExecutionTime: number;
  
  /** Timestamp de conclusão */
  completedAt: Date;
}

// ============================================================================
// CORRELATION ANALYSIS TYPES
// ============================================================================

/**
 * Análise de correlação entre símbolos
 */
export interface CorrelationAnalysis {
  /** Matriz de correlação */
  correlationMatrix: CorrelationMatrix;
  
  /** Pares altamente correlacionados (> 0.7) */
  highlyCorrelatedPairs: CorrelationPair[];
  
  /** Pares negativamente correlacionados (< -0.5) */
  negativelyCorrelatedPairs: CorrelationPair[];
  
  /** Score de diversificação do portfólio (0-100) */
  diversificationScore: number;
  
  /** Recomendações de diversificação */
  diversificationRecommendations: string[];
}

/**
 * Matriz de correlação
 */
export interface CorrelationMatrix {
  /** Símbolos (ordem das linhas e colunas) */
  symbols: string[];
  
  /** Valores da matriz (symbols.length x symbols.length) */
  values: number[][];
}

/**
 * Par de correlação
 */
export interface CorrelationPair {
  /** Primeiro símbolo */
  symbol1: string;
  
  /** Segundo símbolo */
  symbol2: string;
  
  /** Coeficiente de correlação (-1 a 1) */
  correlation: number;
  
  /** Tipo de correlação */
  type: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
}

// ============================================================================
// PORTFOLIO METRICS TYPES
// ============================================================================

/**
 * Métricas de portfólio agregadas
 */
export interface PortfolioMetrics {
  /** Número de símbolos no portfólio */
  symbolCount: number;
  
  /** Retorno total combinado (%) */
  totalReturn: number;
  
  /** Sharpe Ratio do portfólio */
  portfolioSharpe: number;
  
  /** Sortino Ratio do portfólio */
  portfolioSortino: number;
  
  /** Drawdown máximo do portfólio (%) */
  maxPortfolioDrawdown: number;
  
  /** Volatilidade do portfólio (%) */
  portfolioVolatility: number;
  
  /** Calmar Ratio do portfólio */
  portfolioCalmar: number;
  
  /** Distribuição de peso por símbolo */
  weightDistribution: SymbolWeight[];
  
  /** Curva de equity do portfólio */
  portfolioEquityCurve: { timestamp: number; equity: number }[];
  
  /** Métricas por período */
  periodMetrics: {
    monthly: PeriodMetric[];
    quarterly: PeriodMetric[];
    yearly: PeriodMetric[];
  };
}

/**
 * Peso de um símbolo no portfólio
 */
export interface SymbolWeight {
  /** Símbolo */
  symbol: string;
  
  /** Peso (0-1) */
  weight: number;
  
  /** Contribuição para o retorno (%) */
  returnContribution: number;
  
  /** Contribuição para o risco (%) */
  riskContribution: number;
}

/**
 * Métrica por período
 */
export interface PeriodMetric {
  /** Período (ex: "2025-01", "2025-Q1", "2025") */
  period: string;
  
  /** Retorno do período (%) */
  return: number;
  
  /** Drawdown máximo do período (%) */
  maxDrawdown: number;
  
  /** Número de trades */
  trades: number;
  
  /** Winrate (%) */
  winRate: number;
}

// ============================================================================
// PROGRESS TYPES
// ============================================================================

/**
 * Progresso da orquestração multi-asset
 */
export interface MultiAssetProgress {
  /** Fase atual */
  phase: "INITIALIZING" | "DOWNLOADING_DATA" | "OPTIMIZING" | "VALIDATING" | "ANALYZING" | "COMPLETED" | "ERROR";
  
  /** Símbolo atual sendo processado */
  currentSymbol: string;
  
  /** Índice do símbolo atual */
  currentSymbolIndex: number;
  
  /** Total de símbolos */
  totalSymbols: number;
  
  /** Progresso geral (0-100) */
  overallProgress: number;
  
  /** Progresso do símbolo atual (0-100) */
  symbolProgress: number;
  
  /** Mensagem de status */
  statusMessage: string;
  
  /** Tempo estimado restante (segundos) */
  estimatedTimeRemaining: number;
  
  /** Símbolos já processados */
  completedSymbols: string[];
  
  /** Símbolos com erros */
  errorSymbols: string[];
}

// ============================================================================
// ALLOCATION STRATEGY TYPES
// ============================================================================

/**
 * Estratégia de alocação de capital
 */
export enum AllocationStrategy {
  /** Peso igual para todos os símbolos */
  EQUAL_WEIGHT = "EQUAL_WEIGHT",
  
  /** Peso baseado no Sharpe Ratio */
  SHARPE_WEIGHTED = "SHARPE_WEIGHTED",
  
  /** Peso baseado no inverso da volatilidade */
  INVERSE_VOLATILITY = "INVERSE_VOLATILITY",
  
  /** Peso baseado no Risk Parity */
  RISK_PARITY = "RISK_PARITY",
  
  /** Peso customizado pelo usuário */
  CUSTOM = "CUSTOM",
}

/**
 * Configuração de alocação
 */
export interface AllocationConfig {
  /** Estratégia de alocação */
  strategy: AllocationStrategy;
  
  /** Pesos customizados (para CUSTOM) */
  customWeights?: Record<string, number>;
  
  /** Peso mínimo por símbolo (0-1) */
  minWeight: number;
  
  /** Peso máximo por símbolo (0-1) */
  maxWeight: number;
  
  /** Se deve rebalancear periodicamente */
  rebalance: boolean;
  
  /** Período de rebalanceamento (dias) */
  rebalancePeriodDays: number;
}
