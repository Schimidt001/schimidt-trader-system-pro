/**
 * Backtest Lab Components Index
 * 
 * Exporta todos os componentes do laboratório de backtest institucional.
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 2.0.0
 */

// Main Page
export { BacktestLabPage } from "./BacktestLabPage";

// Charts and Visualizations
export { MonteCarloChart } from "./MonteCarloChart";
export { RegimeAnalysisChart } from "./RegimeAnalysisChart";
export { MultiAssetDashboard } from "./MultiAssetDashboard";

// Auxiliary Components
export { PipelineStatusCard } from "./components/PipelineStatusCard";
export { ErrorDisplay } from "./components/ErrorDisplay";

// Hooks
export { useInstitutionalLab } from "./hooks/useInstitutionalLab";
export type { 
  PipelineStatus, 
  PipelineProgress, 
  PipelineError, 
  PipelineState 
} from "./hooks/useInstitutionalLab";

// Default export
export { default } from "./BacktestLabPage";
