/**
 * Multi-Asset Module Index
 * 
 * Exporta todos os componentes do módulo multi-asset.
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

// Types
export {
  type MultiAssetConfig,
  type SymbolResult,
  type MultiAssetResult,
  type CorrelationAnalysis,
  type PeriodMetric,
  type MultiAssetProgress,
  AllocationStrategy,
  type AllocationConfig,
  type SymbolWeight,
} from "./types/multi-asset.types";

// GlobalClock
export {
  GlobalClock,
  createGlobalClock,
  type GlobalClockState,
  type ClockTickEvent,
  type ClockTickCallback,
} from "./GlobalClock";

// Ledger
export {
  Ledger,
  createLedger,
  DEFAULT_LEDGER_CONFIG,
  type OpenPosition,
  type LedgerTransaction,
  type LedgerSnapshot,
  type LedgerConfig,
} from "./Ledger";

// RiskGovernor
export {
  RiskGovernor,
  createRiskGovernor,
  DEFAULT_RISK_GOVERNOR_CONFIG,
  type RiskGovernorConfig,
  type RiskValidationResult,
  type OrderProposal,
  type RiskState,
} from "./RiskGovernor";

// CorrelationAnalyzer
export {
  CorrelationAnalyzer,
  createCorrelationAnalyzer,
  DEFAULT_CORRELATION_ANALYZER_CONFIG,
  type CorrelationMatrix,
  type CorrelationPair,
  type CorrelationAnalysisResult,
  type CorrelationAnalyzerConfig,
} from "./CorrelationAnalyzer";

// PortfolioMetricsCalculator
export {
  PortfolioMetricsCalculator,
  createPortfolioMetricsCalculator,
  DEFAULT_PORTFOLIO_METRICS_CONFIG,
  type AssetMetrics,
  type PortfolioMetrics,
  type PortfolioMetricsConfig,
} from "./PortfolioMetricsCalculator";

// MultiAssetOrchestrator
export {
  MultiAssetOrchestrator,
  createMultiAssetOrchestrator,
  type MultiAssetOrchestratorConfig,
  type MultiAssetBacktestResult,
  type MultiAssetProgressCallback,
} from "./MultiAssetOrchestrator";
