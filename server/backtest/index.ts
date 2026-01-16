/**
 * Backtest Module - Exports
 * 
 * Ponto de entrada para o módulo de backtesting.
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 2.0.0
 */

// Types
export * from "./types/backtest.types";

// Adapters
export { BacktestAdapter } from "./adapters/BacktestAdapter";
export type { ITradingAdapter, SymbolInfo, VolumeSpecs } from "./adapters/ITradingAdapter";

// Collectors
export { MarketDataCollector, getMarketDataCollector } from "./collectors/MarketDataCollector";

// Runners
export { BacktestRunner, createBacktestRunner, DEFAULT_BACKTEST_CONFIG } from "./runners/BacktestRunner";
export { BacktestOptimizer, createBacktestOptimizer } from "./runners/BacktestOptimizer";
export type { OptimizationConfig, OptimizationResult, OptimizationResultItem, OptimizationProgress } from "./runners/BacktestOptimizer";

// Isolated Runner (WP1 - Determinismo)
export { IsolatedBacktestRunner, createIsolatedRunner } from "./runners/IsolatedBacktestRunner";

// Optimization Module (WP2)
export { GridSearchEngine } from "./optimization/GridSearchEngine";
export * from "./optimization/types/optimization.types";

// Validation Module (WP3/WP4/WP5)
export { WalkForwardValidator, createWalkForwardValidator } from "./validation/WalkForwardValidator";
export { MonteCarloSimulator, createMonteCarloSimulator, DEFAULT_MONTE_CARLO_CONFIG } from "./validation/MonteCarloSimulator";
export { RegimeDetector, createRegimeDetector, DEFAULT_REGIME_DETECTION_CONFIG } from "./validation/RegimeDetector";
export * from "./validation/types/validation.types";

// Multi-Asset Module (WP6)
export * from "./multi-asset";

// Data Management
export * from "./data-management";

// Utils
export { SeededRNG, createSeededRNG, seedFromTimestamp } from "./utils/SeededRNG";

// Routers
export { backtestRouter } from "./backtestRouter";
export { institutionalRouter } from "./institutionalRouter";
