/**
 * Normalização de Preços e Pips - Módulo Centralizado
 * 
 * Este módulo centraliza toda a lógica de normalização de preços e cálculo de pips
 * para garantir consistência em toda a plataforma.
 * 
 * IMPORTANTE: Todas as funções de normalização de preço devem ser importadas deste módulo.
 * NÃO duplicar esta lógica em outros arquivos.
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 * @see Auditoria Técnica - Refatoração de Centralização de getPipValue
 */

/**
 * Mapeamento de pip values por símbolo
 * 
 * CRÍTICO: Valores corretos para normalização de preço
 * 
 * Referência:
 * - Forex Major/Cross: 0.0001 (4 casas decimais)
 * - Pares JPY: 0.01 (2 casas decimais)
 * - XAUUSD (Ouro): 0.10 (movimento de $0.10 no preço)
 * - XAGUSD (Prata): 0.001
 * - Índices: Varia conforme o ativo
 */
export const PIP_VALUES: Record<string, number> = {
  // ============= FOREX MAJOR =============
  "EURUSD": 0.0001,
  "GBPUSD": 0.0001,
  "USDJPY": 0.01,
  "AUDUSD": 0.0001,
  "USDCAD": 0.0001,
  "USDCHF": 0.0001,
  "NZDUSD": 0.0001,
  
  // ============= FOREX CROSS JPY =============
  "EURJPY": 0.01,
  "GBPJPY": 0.01,
  "AUDJPY": 0.01,
  "CADJPY": 0.01,
  "CHFJPY": 0.01,
  "NZDJPY": 0.01,
  
  // ============= FOREX CROSS =============
  "EURGBP": 0.0001,
  "EURAUD": 0.0001,
  "EURNZD": 0.0001,
  "GBPAUD": 0.0001,
  "GBPCAD": 0.0001,
  "GBPCHF": 0.0001,
  "GBPNZD": 0.0001,
  "AUDCAD": 0.0001,
  "AUDCHF": 0.0001,
  "AUDNZD": 0.0001,
  "CADCHF": 0.0001,
  "NZDCAD": 0.0001,
  "NZDCHF": 0.0001,
  "EURCHF": 0.0001,
  
  // ============= METAIS PRECIOSOS =============
  // CRÍTICO: XAUUSD usa 0.10 como pip (movimento de $0.10)
  "XAUUSD": 0.10,
  "XAGUSD": 0.001,
  
  // ============= ÍNDICES =============
  "US30": 1.0,
  "US500": 0.1,
  "US100": 0.1,
  "DE40": 0.1,
  "UK100": 0.1,
  "JP225": 1.0,
};

/**
 * Obtém o valor do pip para um símbolo específico
 * 
 * Esta função é o ponto único de acesso para obter o valor do pip.
 * Todos os módulos devem usar esta função em vez de implementar lógica própria.
 * 
 * @param symbol - Símbolo do ativo (ex: "EURUSD", "XAUUSD", "USDJPY")
 * @returns Valor do pip para o símbolo
 * 
 * @example
 * ```typescript
 * import { getPipValue } from "@/shared/normalizationUtils";
 * 
 * const pipValue = getPipValue("EURUSD"); // 0.0001
 * const xauPipValue = getPipValue("XAUUSD"); // 0.10
 * const jpyPipValue = getPipValue("USDJPY"); // 0.01
 * ```
 */
export function getPipValue(symbol: string): number {
  // 1. Verificar no mapeamento estático primeiro
  if (PIP_VALUES[symbol] !== undefined) {
    return PIP_VALUES[symbol];
  }
  
  // 2. Fallback para pares JPY (qualquer par que contenha JPY)
  if (symbol.includes("JPY")) {
    return 0.01;
  }
  
  // 3. Fallback para metais (XAU, XAG)
  if (symbol.startsWith("XAU")) {
    return 0.10;
  }
  if (symbol.startsWith("XAG")) {
    return 0.001;
  }
  
  // 4. Default para Forex padrão
  return 0.0001;
}

/**
 * Converte diferença de preço para pips
 * 
 * @param priceDiff - Diferença de preço bruta
 * @param symbol - Símbolo do ativo
 * @returns Valor em pips (sempre positivo)
 * 
 * @example
 * ```typescript
 * import { priceToPips } from "@/shared/normalizationUtils";
 * 
 * const pips = priceToPips(0.0015, "EURUSD"); // 15 pips
 * const xauPips = priceToPips(1.50, "XAUUSD"); // 15 pips
 * ```
 */
export function priceToPips(priceDiff: number, symbol: string): number {
  const pipValue = getPipValue(symbol);
  return Math.abs(priceDiff) / pipValue;
}

/**
 * Converte pips para diferença de preço
 * 
 * @param pips - Quantidade de pips
 * @param symbol - Símbolo do ativo
 * @returns Diferença de preço equivalente
 * 
 * @example
 * ```typescript
 * import { pipsToPrice } from "@/shared/normalizationUtils";
 * 
 * const price = pipsToPrice(15, "EURUSD"); // 0.0015
 * const xauPrice = pipsToPrice(15, "XAUUSD"); // 1.50
 * ```
 */
export function pipsToPrice(pips: number, symbol: string): number {
  const pipValue = getPipValue(symbol);
  return pips * pipValue;
}

/**
 * Calcula o spread em pips a partir de Bid e Ask
 * 
 * @param bid - Preço de compra (Bid)
 * @param ask - Preço de venda (Ask)
 * @param symbol - Símbolo do ativo
 * @returns Spread em pips
 * 
 * @example
 * ```typescript
 * import { calculateSpreadPips } from "@/shared/normalizationUtils";
 * 
 * const spread = calculateSpreadPips(1.10500, 1.10520, "EURUSD"); // 2 pips
 * ```
 */
export function calculateSpreadPips(bid: number, ask: number, symbol: string): number {
  const pipValue = getPipValue(symbol);
  return (ask - bid) / pipValue;
}

/**
 * Obtém o número de casas decimais para um símbolo
 * Útil para formatação de preços
 * 
 * @param symbol - Símbolo do ativo
 * @returns Número de casas decimais
 */
export function getDecimalPlaces(symbol: string): number {
  const pipValue = getPipValue(symbol);
  
  if (pipValue === 0.01) return 3;      // JPY pairs
  if (pipValue === 0.10) return 2;      // XAUUSD
  if (pipValue === 0.001) return 4;     // XAGUSD
  if (pipValue >= 1.0) return 1;        // Indices
  return 5;                              // Forex standard
}

/**
 * Formata um preço com o número correto de casas decimais
 * 
 * @param price - Preço a formatar
 * @param symbol - Símbolo do ativo
 * @returns Preço formatado como string
 */
export function formatPrice(price: number, symbol: string): string {
  const decimals = getDecimalPlaces(symbol);
  return price.toFixed(decimals);
}
