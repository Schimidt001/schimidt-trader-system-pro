/**
 * Validation Module Index
 * 
 * Exporta todos os componentes do módulo de validação.
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

// WalkForwardValidator
export {
  WalkForwardValidator,
  createWalkForwardValidator,
} from "./WalkForwardValidator";

// MonteCarloSimulator
export {
  MonteCarloSimulator,
  createMonteCarloSimulator,
  DEFAULT_MONTE_CARLO_CONFIG,
} from "./MonteCarloSimulator";

// RegimeDetector
export {
  RegimeDetector,
  createRegimeDetector,
  DEFAULT_REGIME_DETECTION_CONFIG,
  type TradeWithRegime,
  type RegimePerformance,
} from "./RegimeDetector";

// Types
export {
  type WalkForwardConfig,
  type WalkForwardWindow,
  type WalkForwardResult,
  type WindowResult,
  type MonteCarloConfig,
  type MonteCarloSimulation,
  type MonteCarloResult,
  type ConfidenceInterval,
  MarketRegimeType,
  type RegimeDetectionConfig,
  type RegimePeriod,
  type RegimeDetectionResult,
  type ValidationProgress,
  type CombinedValidationResult,
} from "./types/validation.types";
