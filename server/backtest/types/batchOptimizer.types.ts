/**
 * Batch Optimizer Types - Tipos para Otimização Avançada por Lotes
 * 
 * Este módulo define os tipos para o sistema de otimização que:
 * - Processa combinações em lotes para evitar memory overflow
 * - Suporta todos os parâmetros das estratégias SMC/Hybrid
 * - Gera rankings por múltiplas categorias
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 2.0.0
 */

import { BacktestStrategyType, BacktestMetrics } from "./backtest.types";

// ============================================================================
// PARAMETER RANGE TYPES
// ============================================================================

/**
 * Definição de um intervalo de parâmetro para otimização
 * Usado para gerar combinações automaticamente
 */
export interface ParameterRange {
  /** Nome do parâmetro (deve corresponder ao nome na configuração da estratégia) */
  name: string;
  
  /** Rótulo amigável para exibição na UI */
  label: string;
  
  /** Tipo do parâmetro */
  type: "number" | "boolean" | "select";
  
  /** Valor mínimo (para type: number) */
  min?: number;
  
  /** Valor máximo (para type: number) */
  max?: number;
  
  /** Incremento (para type: number) */
  step?: number;
  
  /** Opções disponíveis (para type: select) */
  options?: (string | number)[];
  
  /** Valores fixos a testar (alternativa a min/max/step) */
  values?: (number | string | boolean)[];
  
  /** Se está habilitado para otimização */
  enabled: boolean;
  
  /** Valor padrão quando não está sendo otimizado */
  defaultValue: number | string | boolean;
  
  /** Categoria do parâmetro para organização na UI */
  category: ParameterCategory;
  
  /** Descrição do parâmetro */
  description?: string;
}

/**
 * Categorias de parâmetros para organização na UI
 */
export type ParameterCategory = 
  | "structure"      // Parâmetros de estrutura (timeframes, lookback)
  | "sweep"          // Parâmetros de sweep/liquidez
  | "choch"          // Parâmetros de CHoCH
  | "orderBlock"     // Parâmetros de Order Block
  | "entry"          // Parâmetros de entrada
  | "risk"           // Parâmetros de risco
  | "session"        // Parâmetros de sessão
  | "trailing"       // Parâmetros de trailing stop
  | "spread";        // Parâmetros de spread

// ============================================================================
// BATCH OPTIMIZATION CONFIG
// ============================================================================

/**
 * Configuração completa para otimização em lotes
 */
export interface BatchOptimizationConfig {
  // Configurações básicas
  symbol: string;
  startDate: Date;
  endDate: Date;
  dataPath: string;
  
  // Conta simulada
  initialBalance: number;
  leverage: number;
  commission: number;
  slippage: number;
  spread: number;
  
  // Estratégias a testar
  strategies: BacktestStrategyType[];
  
  // Parâmetros com intervalos para otimização
  parameterRanges: ParameterRange[];
  
  // Configurações de batch
  batchSize: number;              // Combinações por lote (default: 50)
  topResultsToKeep: number;       // Melhores resultados a manter (default: 5)
  
  // Configurações de ranking
  rankingCategories: RankingCategory[];
}

/**
 * Categorias de ranking para os resultados
 */
export type RankingCategory = 
  | "profitability"     // 🏆 Maior Lucratividade Total
  | "recoveryFactor"    // 🛡️ Melhor Fator de Recuperação
  | "minDrawdown"       // 📉 Menor Drawdown
  | "winRate";          // 🎯 Maior Winrate

/**
 * Configuração de parâmetros da estratégia SMC para backtest
 * Espelha todos os parâmetros configuráveis da estratégia real
 */
export interface SMCBacktestParams {
  // Timeframe de Estrutura
  structureTimeframe: "H1" | "M15" | "M5";
  
  // Parâmetros de estrutura (Swing Points)
  swingH1Lookback: number;
  fractalLeftBars: number;
  fractalRightBars: number;
  
  // Parâmetros de Sweep
  sweepBufferPips: number;
  sweepValidationMinutes: number;
  
  // Parâmetros de CHoCH
  chochM15Lookback: number;
  chochMinPips: number;
  chochAcceptWickBreak: boolean;
  
  // Parâmetros de Order Block
  orderBlockLookback: number;
  orderBlockExtensionPips: number;
  
  // Parâmetros de entrada
  entryConfirmationType: "ENGULF" | "REJECTION" | "ANY";
  rejectionWickPercent: number;
  
  // Gestão de risco
  riskPercentage: number;
  maxOpenTrades: number;
  dailyLossLimitPercent: number;
  stopLossBufferPips: number;
  rewardRiskRatio: number;
  
  // Filtro de Spread
  spreadFilterEnabled: boolean;
  maxSpreadPips: number;
  
  // Sessões de trading
  sessionFilterEnabled: boolean;
  londonSessionStart: string;
  londonSessionEnd: string;
  nySessionStart: string;
  nySessionEnd: string;
  
  // Trailing stop
  trailingEnabled: boolean;
  trailingTriggerPips: number;
  trailingStepPips: number;
}

// ============================================================================
// BATCH OPTIMIZATION RESULT TYPES
// ============================================================================

/**
 * Resultado de uma única combinação de parâmetros
 */
export interface OptimizationCombinationResult {
  /** ID único da combinação */
  id: string;
  
  /** Estratégia testada */
  strategy: BacktestStrategyType;
  
  /** Parâmetros usados nesta combinação */
  params: Partial<SMCBacktestParams>;
  
  /** Métricas completas do backtest */
  metrics: BacktestMetrics;
  
  /** Scores por categoria de ranking */
  categoryScores: {
    profitability: number;
    recoveryFactor: number;
    minDrawdown: number;
    winRate: number;
  };
  
  /** Score composto geral */
  compositeScore: number;
}

/**
 * Resultado de um lote de otimização
 */
export interface BatchResult {
  /** Número do lote */
  batchNumber: number;
  
  /** Total de combinações neste lote */
  combinationsInBatch: number;
  
  /** Combinações processadas com sucesso */
  successfulCombinations: number;
  
  /** Erros encontrados */
  errors: string[];
  
  /** Top resultados deste lote */
  topResults: OptimizationCombinationResult[];
  
  /** Tempo de execução do lote (ms) */
  executionTime: number;
}

/**
 * Resultado final da otimização por categoria
 */
export interface CategoryRanking {
  /** Categoria do ranking */
  category: RankingCategory;
  
  /** Rótulo amigável */
  label: string;
  
  /** Ícone (emoji) */
  icon: string;
  
  /** Top 5 resultados desta categoria */
  topResults: OptimizationCombinationResult[];
}

/**
 * Resultado completo da otimização em lotes
 */
export interface BatchOptimizationResult {
  /** Configuração usada */
  config: BatchOptimizationConfig;
  
  /** Total de combinações geradas */
  totalCombinations: number;
  
  /** Combinações processadas */
  completedCombinations: number;
  
  /** Total de lotes processados */
  totalBatches: number;
  
  /** Rankings por categoria */
  rankings: CategoryRanking[];
  
  /** Melhor resultado geral (score composto) */
  overallBest: OptimizationCombinationResult | null;
  
  /** Tempo total de execução (ms) */
  executionTime: number;
  
  /** Se a otimização foi abortada */
  aborted: boolean;
  
  /** Erros gerais */
  errors: string[];
}

// ============================================================================
// PROGRESS TYPES
// ============================================================================

/**
 * Progresso da otimização em lotes
 */
export interface BatchOptimizationProgress {
  /** Lote atual */
  currentBatch: number;
  
  /** Total de lotes */
  totalBatches: number;
  
  /** Combinação atual dentro do lote */
  currentCombinationInBatch: number;
  
  /** Total de combinações no lote atual */
  combinationsInCurrentBatch: number;
  
  /** Combinação global atual */
  currentCombination: number;
  
  /** Total global de combinações */
  totalCombinations: number;
  
  /** Estratégia sendo testada */
  currentStrategy: string;
  
  /** Parâmetros atuais sendo testados */
  currentParams: Record<string, number | string | boolean>;
  
  /** Percentual completo (0-100) */
  percentComplete: number;
  
  /** Tempo estimado restante (segundos) */
  estimatedTimeRemaining: number;
  
  /** Fase atual */
  phase: "initializing" | "processing" | "ranking" | "completed" | "aborted";
  
  /** Melhores resultados parciais até agora */
  partialBestResults: {
    profitability: OptimizationCombinationResult | null;
    recoveryFactor: OptimizationCombinationResult | null;
    minDrawdown: OptimizationCombinationResult | null;
    winRate: OptimizationCombinationResult | null;
  };
}

// ============================================================================
// PARAMETER DEFINITIONS - SMC Strategy
// ============================================================================

/**
 * Definições padrão de parâmetros otimizáveis para estratégia SMC
 * Estes são os parâmetros que podem ser configurados na UI de otimização
 */
export const SMC_PARAMETER_DEFINITIONS: ParameterRange[] = [
  // === STRUCTURE ===
  {
    name: "structureTimeframe",
    label: "Timeframe de Estrutura",
    type: "select",
    options: ["H1", "M15", "M5"],
    enabled: false,
    defaultValue: "M15",
    category: "structure",
    description: "Timeframe usado para identificar Swing Points"
  },
  {
    name: "fractalLeftBars",
    label: "Fractal Left Bars",
    type: "number",
    min: 1,
    max: 5,
    step: 1,
    enabled: false,
    defaultValue: 1,
    category: "structure",
    description: "Barras à esquerda para identificação de fractais"
  },
  {
    name: "fractalRightBars",
    label: "Fractal Right Bars",
    type: "number",
    min: 1,
    max: 5,
    step: 1,
    enabled: false,
    defaultValue: 1,
    category: "structure",
    description: "Barras à direita para identificação de fractais"
  },
  {
    name: "swingH1Lookback",
    label: "Swing H1 Lookback",
    type: "number",
    min: 20,
    max: 100,
    step: 10,
    enabled: false,
    defaultValue: 50,
    category: "structure",
    description: "Número de candles para análise de swing points"
  },
  
  // === SWEEP ===
  {
    name: "sweepBufferPips",
    label: "Sweep Buffer (pips)",
    type: "number",
    min: 0.5,
    max: 10,
    step: 0.5,
    enabled: false,
    defaultValue: 2.0,
    category: "sweep",
    description: "Buffer em pips para detecção de sweep"
  },
  {
    name: "sweepValidationMinutes",
    label: "Sweep Validation (min)",
    type: "number",
    min: 30,
    max: 180,
    step: 15,
    enabled: false,
    defaultValue: 90,
    category: "sweep",
    description: "Tempo máximo para validação do sweep"
  },
  
  // === CHOCH ===
  {
    name: "chochMinPips",
    label: "CHoCH Min Pips",
    type: "number",
    min: 1,
    max: 20,
    step: 1,
    enabled: true,
    defaultValue: 2.0,
    category: "choch",
    description: "Movimento mínimo em pips para confirmar CHoCH"
  },
  {
    name: "chochM15Lookback",
    label: "CHoCH M15 Lookback",
    type: "number",
    min: 5,
    max: 30,
    step: 5,
    enabled: false,
    defaultValue: 15,
    category: "choch",
    description: "Número de candles M15 para análise de CHoCH"
  },
  {
    name: "chochAcceptWickBreak",
    label: "Aceitar CHoCH por Pavio",
    type: "boolean",
    enabled: false,
    defaultValue: false,
    category: "choch",
    description: "Se true, aceita CHoCH por pavio além de fechamento"
  },
  
  // === ORDER BLOCK ===
  {
    name: "orderBlockLookback",
    label: "Order Block Lookback",
    type: "number",
    min: 5,
    max: 20,
    step: 1,
    enabled: false,
    defaultValue: 10,
    category: "orderBlock",
    description: "Número de candles para buscar Order Blocks"
  },
  {
    name: "orderBlockExtensionPips",
    label: "OB Extension (pips)",
    type: "number",
    min: 1,
    max: 20,
    step: 1,
    enabled: false,
    defaultValue: 3.0,
    category: "orderBlock",
    description: "Extensão da zona do Order Block em pips"
  },
  
  // === ENTRY ===
  {
    name: "entryConfirmationType",
    label: "Tipo de Confirmação",
    type: "select",
    options: ["ENGULF", "REJECTION", "ANY"],
    enabled: false,
    defaultValue: "ANY",
    category: "entry",
    description: "Tipo de confirmação para entrada"
  },
  {
    name: "rejectionWickPercent",
    label: "Rejection Wick (%)",
    type: "number",
    min: 10,
    max: 80,
    step: 10,
    enabled: false,
    defaultValue: 20.0,
    category: "entry",
    description: "Percentual mínimo de pavio para rejeição"
  },
  
  // === RISK ===
  {
    name: "riskPercentage",
    label: "Risco por Trade (%)",
    type: "number",
    min: 0.5,
    max: 5,
    step: 0.5,
    enabled: true,
    defaultValue: 2.0,
    category: "risk",
    description: "Percentual do saldo arriscado por trade"
  },
  {
    name: "maxOpenTrades",
    label: "Max Trades Abertos",
    type: "number",
    min: 1,
    max: 10,
    step: 1,
    enabled: false,
    defaultValue: 3,
    category: "risk",
    description: "Número máximo de trades simultâneos"
  },
  {
    name: "stopLossBufferPips",
    label: "SL Buffer (pips)",
    type: "number",
    min: 1,
    max: 10,
    step: 0.5,
    enabled: false,
    defaultValue: 2.0,
    category: "risk",
    description: "Buffer adicional no Stop Loss"
  },
  {
    name: "rewardRiskRatio",
    label: "Reward:Risk Ratio",
    type: "number",
    min: 1,
    max: 10,
    step: 0.5,
    enabled: true,
    defaultValue: 3.0,
    category: "risk",
    description: "Razão Take Profit / Stop Loss"
  },
  {
    name: "dailyLossLimitPercent",
    label: "Limite Perda Diária (%)",
    type: "number",
    min: 3,
    max: 20,
    step: 1,
    enabled: false,
    defaultValue: 10.0,
    category: "risk",
    description: "Limite de perda diária para circuit breaker"
  },
  
  // === SPREAD ===
  {
    name: "maxSpreadPips",
    label: "Spread Máximo (pips)",
    type: "number",
    min: 1,
    max: 10,
    step: 0.5,
    enabled: false,
    defaultValue: 3.0,
    category: "spread",
    description: "Spread máximo permitido para entrada"
  },
  
  // === TRAILING ===
  {
    name: "trailingEnabled",
    label: "Trailing Stop Ativo",
    type: "boolean",
    enabled: false,
    defaultValue: true,
    category: "trailing",
    description: "Se o trailing stop está ativo"
  },
  {
    name: "trailingTriggerPips",
    label: "Trailing Trigger (pips)",
    type: "number",
    min: 5,
    max: 50,
    step: 5,
    enabled: false,
    defaultValue: 20.0,
    category: "trailing",
    description: "Pips de lucro para ativar trailing"
  },
  {
    name: "trailingStepPips",
    label: "Trailing Step (pips)",
    type: "number",
    min: 2,
    max: 20,
    step: 2,
    enabled: false,
    defaultValue: 10.0,
    category: "trailing",
    description: "Distância do trailing stop"
  },
];

/**
 * Rótulos das categorias de ranking
 */
export const RANKING_CATEGORY_LABELS: Record<RankingCategory, { label: string; icon: string; description: string }> = {
  profitability: {
    label: "Maior Lucratividade",
    icon: "🏆",
    description: "Saldo final mais alto"
  },
  recoveryFactor: {
    label: "Melhor Fator de Recuperação",
    icon: "🛡️",
    description: "Lucro dividido pelo Drawdown"
  },
  minDrawdown: {
    label: "Menor Drawdown",
    icon: "📉",
    description: "A estratégia mais segura"
  },
  winRate: {
    label: "Maior Winrate",
    icon: "🎯",
    description: "A que mais acerta"
  }
};
