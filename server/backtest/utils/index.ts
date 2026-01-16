/**
 * Backtest Utils Index
 * 
 * Exporta utilitários para o módulo de backtest.
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

export {
  SeededRNG,
  Mulberry32RNG,
  XorShift128PlusRNG,
  createSeededRNG,
  seedFromString,
  seedFromTimestamp,
  createInstitutionalSeed,
  type IRNG,
  type RNGConfig,
} from "./SeededRNG";

// Logger institucional
export {
  LabLogger,
  labLogger,
  optimizationLogger,
  backtestLogger,
  validationLogger,
  multiAssetLogger,
  setGlobalLogLevel,
  disableProgressLogs,
  enableSilentMode,
  enableVerboseMode,
  type LogLevel,
  type LoggerConfig,
} from "./LabLogger";

// Guard de isolamento LAB vs LIVE
export {
  LabGuard,
  labGuard,
  labBrokerStub,
  labMarketDataStub,
  requireLabMode,
  isLabEnvironment,
  enableLabMode,
  disableLabMode,
  type LabGuardConfig,
  type LabGuardStatus,
  type LabGuardError,
} from "./LabGuard";

// Erros estruturados
export {
  LabError,
  LAB_ERROR_CODES,
  createDataNotFoundError,
  createDataInsufficientError,
  createConfigInvalidError,
  createExecutionFailedError,
  createIsolationViolationError,
  createMetricsInvalidError,
  sanitizeNumber,
  sanitizeMetrics,
  sanitizeResponse,
  handleLabError,
  withErrorHandling,
  createSuccessResponse,
  type LabErrorCode,
  type LabErrorResponse,
  type LabSuccessResponse,
  type LabResponse,
} from "./LabErrors";
