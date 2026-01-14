/**
 * Backtest Module - Exports
 * 
 * Ponto de entrada para o módulo de backtesting.
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 1.0.0
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

// Router
export { backtestRouter } from "./backtestRouter";
