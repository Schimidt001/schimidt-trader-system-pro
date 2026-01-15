/**
 * Optimization Types - Tipos para o Módulo de Descoberta de Parâmetros
 * 
 * Este módulo define os tipos para o sistema de otimização que:
 * - Testa milhares de combinações automaticamente (Grid Search inteligente)
 * - Valida estatisticamente (Walk-Forward + Monte Carlo)
 * - Funciona com 10+ símbolos simultaneamente
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { BacktestMetrics, BacktestTrade, BacktestStrategyType } from "../../types/backtest.types";

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Categorias de parâmetros para organização na UI
 */
export enum ParameterCategory {
  STRUCTURE = "STRUCTURE",          // Swing Points, Fractais
  SWEEP = "SWEEP",                  // Detecção de Sweep
  CHOCH = "CHOCH",                  // Quebra de Estrutura
  ORDER_BLOCK = "ORDER_BLOCK",      // Order Blocks
  ENTRY = "ENTRY",                  // Confirmação de Entrada
  RISK = "RISK",                    // Gestão de Risco
  FILTERS = "FILTERS",              // Filtros (Spread, Sessão)
}

/**
 * Tipos de parâmetros suportados
 */
export enum ParameterType {
  INTEGER = "INTEGER",
  DECIMAL = "DECIMAL",
  PERCENTAGE = "PERCENTAGE",
  ENUM = "ENUM",
  BOOLEAN = "BOOLEAN",
}

// ============================================================================
// PARAMETER DEFINITION
// ============================================================================

/**
 * Definição de um parâmetro a ser otimizado
 */
export interface ParameterDefinition {
  /** Nome interno do parâmetro (ex: "swingH1Lookback") */
  name: string;
  
  /** Nome de exibição (ex: "Lookback da Estrutura (H1)") */
  displayName: string;
  
  /** Categoria do parâmetro */
  category: ParameterCategory;
  
  /** Tipo do parâmetro */
  type: ParameterType;
  
  /** Valor mínimo (para tipos numéricos) */
  min?: number;
  
  /** Valor máximo (para tipos numéricos) */
  max?: number;
  
  /** Incremento entre valores (para tipos numéricos) */
  step?: number;
  
  /** Lista explícita de valores (para ENUM ou valores fixos) */
  values?: (number | string)[];
  
  /** Valor padrão */
  default: number | string | boolean;
  
  /** Descrição/tooltip explicativo */
  description: string;
  
  /** Unidade de medida (ex: "barras", "pips", "%") */
  unit?: string;
  
  /** Se este parâmetro será otimizado */
  enabled: boolean;
  
  /** Se está travado no valor default (não pode ser alterado) */
  locked: boolean;
}

// ============================================================================
// PARAMETER COMBINATION
// ============================================================================

/**
 * Combinação de parâmetros testada
 */
export interface ParameterCombination {
  /** Hash único identificador da combinação */
  combinationId: string;
  
  /** Mapa de parâmetros e seus valores */
  parameters: Record<string, number | string | boolean>;
}

// ============================================================================
// COMBINATION RESULT
// ============================================================================

/**
 * Resultado de um teste de combinação
 */
export interface CombinationResult {
  /** Combinação testada */
  combination: ParameterCombination;
  
  /** Métricas In-Sample */
  inSample: {
    metrics: BacktestMetrics;
    trades: BacktestTrade[];
    equityCurve: { timestamp: number; equity: number }[];
  };
  
  /** Métricas Out-of-Sample (opcional, preenchido após validação) */
  outSample?: {
    metrics: BacktestMetrics;
    trades: BacktestTrade[];
    equityCurve: { timestamp: number; equity: number }[];
  };
  
  /** Score de robustez (0-100) */
  robustnessScore: number;
  
  /** Percentual de degradação in-sample -> out-sample */
  degradationPercent: number;
  
  /** Posição no ranking geral */
  rank?: number;
  
  /** Se é recomendado para uso */
  isRecommended: boolean;
  
  /** Avisos e alertas */
  warnings: string[];
}

// ============================================================================
// OPTIMIZATION OBJECTIVE
// ============================================================================

/**
 * Objetivo de otimização (métrica a otimizar)
 */
export interface OptimizationObjective {
  /** Nome da métrica (ex: "sharpeRatio", "profitFactor", "maxDrawdown") */
  metric: string;
  
  /** Direção da otimização */
  target: "MAXIMIZE" | "MINIMIZE";
  
  /** Peso no score final (0-1) */
  weight: number;
  
  /** Threshold mínimo/máximo (filtro) */
  threshold?: number;
}

// ============================================================================
// OPTIMIZATION CONFIG
// ============================================================================

/**
 * Configuração completa de otimização
 */
export interface OptimizationConfig {
  /** Símbolos a testar */
  symbols: string[];
  
  /** Data de início do período */
  startDate: Date;
  
  /** Data de fim do período */
  endDate: Date;
  
  /** Tipo de estratégia */
  strategyType: BacktestStrategyType;
  
  /** Parâmetros a otimizar */
  parameters: ParameterDefinition[];
  
  /** Configuração de validação */
  validation: {
    /** Se validação está habilitada */
    enabled: boolean;
    
    /** Proporção in-sample (ex: 0.7 = 70% treino, 30% teste) */
    inSampleRatio: number;
    
    /** Configuração Walk-Forward */
    walkForward: {
      enabled: boolean;
      windowMonths: number;
      stepMonths: number;
    };
  };
  
  /** Limite máximo de combinações a testar */
  maxCombinations?: number;
  
  /** Número de workers paralelos */
  parallelWorkers: number;
  
  /** Objetivos de otimização */
  objectives: OptimizationObjective[];
  
  /** Pesos dos objetivos (deve somar 1) */
  objectiveWeights: number[];
}

// ============================================================================
// OPTIMIZATION PROGRESS
// ============================================================================

/**
 * Progresso da otimização
 */
export interface OptimizationProgress {
  /** Fase atual */
  phase: "INITIALIZING" | "GENERATING_COMBINATIONS" | "TESTING" | "VALIDATING" | "RANKING" | "COMPLETED" | "ABORTED" | "ERROR";
  
  /** Combinação atual sendo testada */
  currentCombination: number;
  
  /** Total de combinações */
  totalCombinations: number;
  
  /** Percentual completo (0-100) */
  percentComplete: number;
  
  /** Tempo estimado restante (segundos) */
  estimatedTimeRemaining: number;
  
  /** Tempo decorrido (segundos) */
  elapsedTime: number;
  
  /** Símbolo atual sendo processado */
  currentSymbol?: string;
  
  /** Parâmetros atuais sendo testados */
  currentParams?: Record<string, number | string | boolean>;
  
  /** Melhores resultados parciais */
  partialBestResults?: CombinationResult[];
  
  /** Mensagem de status */
  statusMessage: string;
}

// ============================================================================
// OPTIMIZATION RESULT
// ============================================================================

/**
 * Resultado final da otimização
 */
export interface OptimizationFinalResult {
  /** Configuração usada */
  config: OptimizationConfig;
  
  /** Total de combinações testadas */
  totalCombinationsTested: number;
  
  /** Total de trades executados */
  totalTradesExecuted: number;
  
  /** Tempo de execução (segundos) */
  executionTimeSeconds: number;
  
  /** Todos os resultados (ordenados por score) */
  results: CombinationResult[];
  
  /** Top 10 melhores resultados */
  topResults: CombinationResult[];
  
  /** Melhor resultado geral */
  bestResult: CombinationResult | null;
  
  /** Se foi abortado */
  aborted: boolean;
  
  /** Erros encontrados */
  errors: string[];
  
  /** Timestamp de início */
  startedAt: Date;
  
  /** Timestamp de conclusão */
  completedAt: Date;
}

// ============================================================================
// DEFAULT PARAMETER DEFINITIONS
// ============================================================================

/**
 * Definições padrão de parâmetros otimizáveis para estratégia SMC
 */
export const DEFAULT_SMC_PARAMETER_DEFINITIONS: ParameterDefinition[] = [
  // === STRUCTURE ===
  {
    name: "swingH1Lookback",
    displayName: "Lookback da Estrutura (H1)",
    category: ParameterCategory.STRUCTURE,
    type: ParameterType.INTEGER,
    min: 20,
    max: 100,
    step: 10,
    default: 50,
    description: "Número de barras H1 para identificar Swing Points",
    unit: "barras",
    enabled: true,
    locked: false,
  },
  {
    name: "fractalLeftBars",
    displayName: "Fractal Left Bars",
    category: ParameterCategory.STRUCTURE,
    type: ParameterType.INTEGER,
    min: 1,
    max: 5,
    step: 1,
    default: 2,
    description: "Barras à esquerda para identificação de fractais",
    unit: "barras",
    enabled: true,
    locked: false,
  },
  {
    name: "fractalRightBars",
    displayName: "Fractal Right Bars",
    category: ParameterCategory.STRUCTURE,
    type: ParameterType.INTEGER,
    min: 1,
    max: 5,
    step: 1,
    default: 2,
    description: "Barras à direita para identificação de fractais",
    unit: "barras",
    enabled: true,
    locked: false,
  },
  
  // === SWEEP ===
  {
    name: "sweepBufferPips",
    displayName: "Buffer de Sweep",
    category: ParameterCategory.SWEEP,
    type: ParameterType.DECIMAL,
    min: 0.5,
    max: 5.0,
    step: 0.5,
    default: 1.0,
    description: "Buffer em pips para validar sweep de liquidez",
    unit: "pips",
    enabled: true,
    locked: false,
  },
  {
    name: "sweepValidationMinutes",
    displayName: "Tempo de Validação do Sweep",
    category: ParameterCategory.SWEEP,
    type: ParameterType.INTEGER,
    min: 5,
    max: 60,
    step: 5,
    default: 15,
    description: "Minutos para validar se o sweep foi confirmado",
    unit: "minutos",
    enabled: true,
    locked: false,
  },
  
  // === CHOCH ===
  {
    name: "chochM15Lookback",
    displayName: "Lookback CHoCH (M15)",
    category: ParameterCategory.CHOCH,
    type: ParameterType.INTEGER,
    min: 10,
    max: 50,
    step: 5,
    default: 20,
    description: "Barras M15 para identificar CHoCH",
    unit: "barras",
    enabled: true,
    locked: false,
  },
  {
    name: "chochMinPips",
    displayName: "Mínimo CHoCH",
    category: ParameterCategory.CHOCH,
    type: ParameterType.DECIMAL,
    min: 1.0,
    max: 10.0,
    step: 0.5,
    default: 2.5,
    description: "Movimento mínimo em pips para validar CHoCH",
    unit: "pips",
    enabled: true,
    locked: false,
  },
  {
    name: "chochAcceptWickBreak",
    displayName: "Aceitar Wick Break",
    category: ParameterCategory.CHOCH,
    type: ParameterType.BOOLEAN,
    default: true,
    description: "Aceitar quebra por pavio como CHoCH válido",
    enabled: false,
    locked: false,
  },
  
  // === ORDER BLOCK ===
  {
    name: "orderBlockLookback",
    displayName: "Lookback Order Block",
    category: ParameterCategory.ORDER_BLOCK,
    type: ParameterType.INTEGER,
    min: 5,
    max: 30,
    step: 5,
    default: 10,
    description: "Barras para buscar Order Blocks",
    unit: "barras",
    enabled: true,
    locked: false,
  },
  {
    name: "orderBlockExtensionPips",
    displayName: "Extensão Order Block",
    category: ParameterCategory.ORDER_BLOCK,
    type: ParameterType.DECIMAL,
    min: 0.5,
    max: 5.0,
    step: 0.5,
    default: 1.0,
    description: "Extensão em pips da zona do Order Block",
    unit: "pips",
    enabled: true,
    locked: false,
  },
  
  // === ENTRY ===
  {
    name: "entryConfirmationType",
    displayName: "Tipo de Confirmação",
    category: ParameterCategory.ENTRY,
    type: ParameterType.ENUM,
    values: ["ENGULF", "REJECTION", "ANY"],
    default: "ANY",
    description: "Tipo de confirmação de entrada requerido",
    enabled: true,
    locked: false,
  },
  {
    name: "rejectionWickPercent",
    displayName: "Percentual Wick Rejeição",
    category: ParameterCategory.ENTRY,
    type: ParameterType.PERCENTAGE,
    min: 50,
    max: 90,
    step: 5,
    default: 70,
    description: "Percentual mínimo de wick para rejeição válida",
    unit: "%",
    enabled: true,
    locked: false,
  },
  
  // === RISK ===
  {
    name: "riskPercentage",
    displayName: "Risco por Trade",
    category: ParameterCategory.RISK,
    type: ParameterType.PERCENTAGE,
    min: 0.5,
    max: 5.0,
    step: 0.5,
    default: 2.0,
    description: "Percentual do saldo arriscado por trade",
    unit: "%",
    enabled: true,
    locked: false,
  },
  {
    name: "maxOpenTrades",
    displayName: "Máximo Trades Abertos",
    category: ParameterCategory.RISK,
    type: ParameterType.INTEGER,
    min: 1,
    max: 5,
    step: 1,
    default: 3,
    description: "Número máximo de trades simultâneos",
    unit: "trades",
    enabled: true,
    locked: false,
  },
  {
    name: "stopLossBufferPips",
    displayName: "Buffer Stop Loss",
    category: ParameterCategory.RISK,
    type: ParameterType.DECIMAL,
    min: 0.5,
    max: 5.0,
    step: 0.5,
    default: 1.0,
    description: "Buffer adicional para o Stop Loss",
    unit: "pips",
    enabled: true,
    locked: false,
  },
  {
    name: "rewardRiskRatio",
    displayName: "Reward/Risk Ratio",
    category: ParameterCategory.RISK,
    type: ParameterType.DECIMAL,
    min: 1.0,
    max: 5.0,
    step: 0.5,
    default: 2.0,
    description: "Proporção recompensa/risco para Take Profit",
    unit: "R:R",
    enabled: true,
    locked: false,
  },
  
  // === FILTERS ===
  {
    name: "maxSpreadPips",
    displayName: "Spread Máximo",
    category: ParameterCategory.FILTERS,
    type: ParameterType.DECIMAL,
    min: 1.0,
    max: 10.0,
    step: 0.5,
    default: 3.0,
    description: "Spread máximo permitido para entrada",
    unit: "pips",
    enabled: true,
    locked: false,
  },
  {
    name: "sessionFilterEnabled",
    displayName: "Filtro de Sessão",
    category: ParameterCategory.FILTERS,
    type: ParameterType.BOOLEAN,
    default: true,
    description: "Habilitar filtro de sessões de trading",
    enabled: false,
    locked: false,
  },
];
