// Componentes existentes (legado - mantidos para compatibilidade)
export { DerivSettings } from "./DerivSettings";
export { ICMarketsSettings } from "./ICMarketsSettings";
export { SMCStrategySettings } from "./SMCStrategySettings";
export { RsiVwapSettings } from "./RsiVwapSettings";
export { HybridModeSettings } from "./HybridModeSettings";

// Novos componentes refatorados (v2.0 - Single Source of Truth)
export { OperationModeSelector } from "./OperationModeSelector";
export { GlobalExposureSettings } from "./GlobalExposureSettings";
export { SMCStrategySettingsClean } from "./SMCStrategySettingsClean";
export { RsiVwapSettingsClean } from "./RsiVwapSettingsClean";
