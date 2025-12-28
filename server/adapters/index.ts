/**
 * Adaptadores de Corretora
 * 
 * Padrão Adapter para suportar múltiplas corretoras:
 * - DERIV: Binary Options via WebSocket API
 * - IC MARKETS: Forex Spot via cTrader Open API
 */

export * from "./IBrokerAdapter";
export * from "./CTraderAdapter";

// TODO: Exportar DerivAdapter quando refatorado
// export * from "./DerivAdapter";
