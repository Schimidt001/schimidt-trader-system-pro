/**
 * Data Management Module Index
 * 
 * Exporta todos os componentes do módulo de gerenciamento de dados.
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

// DataDownloader
export {
  DataDownloader,
  createDataDownloader,
  DATA_SOURCES,
  type DataSource,
  type DownloadConfig,
  type DownloadResult,
  type CandleData,
  type DataValidationResult,
} from "./DataDownloader";

// DataCacheManager
export {
  DataCacheManager,
  createDataCacheManager,
  type CacheCheckResult,
  type CachedFileInfo,
  type CacheConfig,
} from "./DataCacheManager";
