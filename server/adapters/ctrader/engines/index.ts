/**
 * SMC Institutional Engines - Exportações Centralizadas
 * 
 * Este arquivo exporta todos os engines institucionais para uso na estratégia SMC PURO.
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 */

// Session Engine
export {
  SessionEngine,
  createSessionEngine,
  DEFAULT_SESSION_CONFIG,
} from './SessionEngine';
export type { SessionTimeConfig } from '../SMCInstitutionalTypes';

// Context Engine
export {
  ContextEngine,
  createContextEngine,
  DEFAULT_CONTEXT_CONFIG,
} from './ContextEngine';
export type { ContextEngineConfig } from './ContextEngine';

// Liquidity Engine
export {
  LiquidityEngine,
  createLiquidityEngine,
  DEFAULT_LIQUIDITY_CONFIG,
} from './LiquidityEngine';
export type { LiquidityEngineConfig } from './LiquidityEngine';

// FVG Engine
export {
  FVGEngine,
  createFVGEngine,
  DEFAULT_FVG_CONFIG,
} from './FVGEngine';
export type { FVGEngineConfig } from './FVGEngine';
