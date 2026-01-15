/**
 * Backtest Lab Schema Index
 * 
 * Exporta todos os schemas do módulo de backtest institucional.
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

// Backtest Runs
export {
  backtestRuns,
  type BacktestRun,
  type NewBacktestRun,
  BacktestRunStatus,
  type BacktestRunStatusType,
} from "./backtest-runs";

// Optimization Results
export {
  optimizationResults,
  type OptimizationResult,
  type NewOptimizationResult,
} from "./optimization-results";

// Walk-Forward Validations
export {
  walkForwardValidations,
  type WalkForwardValidation,
  type NewWalkForwardValidation,
} from "./walk-forward-validations";

// Market Regimes
export {
  marketRegimes,
  type MarketRegime,
  type NewMarketRegime,
  MarketRegimeType,
  type MarketRegimeTypeValue,
} from "./market-regimes";
