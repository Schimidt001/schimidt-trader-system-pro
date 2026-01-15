/**
 * Optimization Module Index
 * 
 * Exporta todos os componentes do módulo de otimização.
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

// GridSearchEngine
export {
  GridSearchEngine,
  createGridSearchEngine,
} from "./GridSearchEngine";

// Types
export {
  ParameterCategory,
  ParameterType,
  type ParameterDefinition,
  type ParameterCombination,
  type CombinationResult,
  type OptimizationConfig,
  type OptimizationObjective,
  type OptimizationProgress,
  type OptimizationFinalResult,
  DEFAULT_SMC_PARAMETER_DEFINITIONS,
} from "./types/optimization.types";
