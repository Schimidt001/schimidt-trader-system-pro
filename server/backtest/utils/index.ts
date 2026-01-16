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
