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

// Types
export {
  type WalkForwardConfig,
  type WalkForwardWindow,
  type WalkForwardResult,
  type WindowResult,
  type MonteCarloConfig,
  type MonteCarloSimulation,
  type MonteCarloResult,
  MarketRegimeType,
  type RegimeDetectionConfig,
  type RegimePeriod,
  type RegimeDetectionResult,
  type ValidationProgress,
  type CombinedValidationResult,
} from "./types/validation.types";
