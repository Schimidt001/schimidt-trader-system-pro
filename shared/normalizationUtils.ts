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
 * @version 2.0.0
 * @see Auditoria Técnica - Refatoração de Centralização de getPipValue
 * @see CORREÇÃO CRÍTICA 2026-01-13 - Adição de calculateMonetaryPipValue para position sizing
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
 * Tipo de símbolo para cálculo de pip value monetário
 */
export enum SymbolType {
  USD_QUOTE = "USD_QUOTE",       // EURUSD, GBPUSD, etc. (USD é moeda de cotação)
  USD_BASE = "USD_BASE",         // USDJPY, USDCAD, etc. (USD é moeda base)
  JPY_QUOTE = "JPY_QUOTE",       // EURJPY, GBPJPY, etc. (JPY é moeda de cotação)
  CROSS = "CROSS",               // EURGBP, AUDNZD, etc. (sem USD nem JPY)
  METAL_USD = "METAL_USD",       // XAUUSD, XAGUSD (metais cotados em USD)
  INDEX = "INDEX",               // Índices
}

/**
 * Interface para taxas de conversão necessárias
 */
export interface ConversionRates {
  USDJPY?: number;   // Taxa USD/JPY (necessária para pares JPY)
  EURUSD?: number;   // Taxa EUR/USD (para conversão de pares EUR cross)
  GBPUSD?: number;   // Taxa GBP/USD (para conversão de pares GBP cross)
  AUDUSD?: number;   // Taxa AUD/USD (para conversão de pares AUD cross)
  NZDUSD?: number;   // Taxa NZD/USD (para conversão de pares NZD cross)
  USDCAD?: number;   // Taxa USD/CAD (para conversão de pares CAD)
  USDCHF?: number;   // Taxa USD/CHF (para conversão de pares CHF)
}

/**
 * Obtém o valor do pip para um símbolo específico
 * 
 * ATENÇÃO: Esta função retorna o TAMANHO DO PIP em termos de movimento de preço,
 * NÃO o valor monetário. Para cálculo de position sizing, use calculateMonetaryPipValue().
 * 
 * @param symbol - Símbolo do ativo (ex: "EURUSD", "XAUUSD", "USDJPY")
 * @returns Valor do pip para o símbolo (movimento de preço)
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
 * Identifica o tipo de símbolo para cálculo de pip value monetário
 * 
 * @param symbol - Símbolo do ativo
 * @returns Tipo do símbolo
 */
export function getSymbolType(symbol: string): SymbolType {
  // Metais
  if (symbol.startsWith("XAU") || symbol.startsWith("XAG")) {
    return SymbolType.METAL_USD;
  }
  
  // Índices
  if (["US30", "US500", "US100", "DE40", "UK100", "JP225"].includes(symbol)) {
    return SymbolType.INDEX;
  }
  
  // Pares com USD como moeda de cotação (XXX/USD)
  if (symbol.endsWith("USD")) {
    return SymbolType.USD_QUOTE;
  }
  
  // Pares com USD como moeda base (USD/XXX)
  if (symbol.startsWith("USD")) {
    return SymbolType.USD_BASE;
  }
  
  // Pares com JPY como moeda de cotação (XXX/JPY)
  if (symbol.endsWith("JPY")) {
    return SymbolType.JPY_QUOTE;
  }
  
  // Cross pairs (sem USD)
  return SymbolType.CROSS;
}

/**
 * Obtém a moeda de cotação (quote currency) de um símbolo
 * 
 * @param symbol - Símbolo do ativo (ex: "EURUSD" -> "USD", "EURJPY" -> "JPY")
 * @returns Código da moeda de cotação
 */
export function getQuoteCurrency(symbol: string): string {
  // Metais e índices
  if (symbol.startsWith("XAU") || symbol.startsWith("XAG")) {
    return "USD";
  }
  if (["US30", "US500", "US100"].includes(symbol)) {
    return "USD";
  }
  
  // Forex: últimas 3 letras são a moeda de cotação
  return symbol.slice(-3);
}

/**
 * CORREÇÃO CRÍTICA 2026-01-13: Calcula o valor monetário do pip em USD por lote standard
 * 
 * Esta função é ESSENCIAL para o cálculo correto de position sizing.
 * 
 * Fórmulas por tipo de símbolo:
 * 
 * 1. USD_QUOTE (EURUSD, GBPUSD, AUDUSD):
 *    Pip Value (USD) = Lot Size × Pip Size = 100,000 × 0.0001 = $10.00
 * 
 * 2. USD_BASE (USDJPY, USDCAD, USDCHF):
 *    Pip Value (USD) = (Lot Size × Pip Size) / Exchange Rate
 *    Ex: USDJPY @ 159.00: (100,000 × 0.01) / 159.00 = $6.29
 * 
 * 3. JPY_QUOTE (EURJPY, GBPJPY):
 *    Pip Value (USD) = (Lot Size × Pip Size) / USDJPY Rate
 *    Ex: EURJPY com USDJPY @ 159.00: (100,000 × 0.01) / 159.00 = $6.29
 * 
 * 4. CROSS (EURGBP, AUDNZD):
 *    Pip Value (USD) = (Lot Size × Pip Size) × Quote Currency/USD Rate
 *    Ex: EURGBP com GBPUSD @ 1.27: (100,000 × 0.0001) × 1.27 = $12.70
 * 
 * 5. METAL_USD (XAUUSD):
 *    Pip Value (USD) = Lot Size × Pip Size = 100 × 0.10 = $10.00
 * 
 * @param symbol - Símbolo do ativo
 * @param conversionRates - Taxas de conversão necessárias (obtidas da API)
 * @param lotSize - Tamanho do lote (default: 1.0 = lote standard)
 * @returns Valor monetário do pip em USD por lote
 * 
 * @example
 * ```typescript
 * // EURUSD - USD é moeda de cotação
 * const pipValueEURUSD = calculateMonetaryPipValue("EURUSD", {}); // $10.00
 * 
 * // EURJPY - precisa da taxa USDJPY para conversão
 * const pipValueEURJPY = calculateMonetaryPipValue("EURJPY", { USDJPY: 159.00 }); // ~$6.29
 * 
 * // EURGBP - precisa da taxa GBPUSD para conversão
 * const pipValueEURGBP = calculateMonetaryPipValue("EURGBP", { GBPUSD: 1.27 }); // ~$12.70
 * ```
 */
export function calculateMonetaryPipValue(
  symbol: string,
  conversionRates: ConversionRates,
  lotSize: number = 1.0
): number {
  const symbolType = getSymbolType(symbol);
  const pipSize = getPipValue(symbol);
  
  // Tamanho do contrato base (unidades por lote)
  // Forex: 100,000 unidades por lote standard
  // XAUUSD: 100 onças por lote standard
  const contractSize = symbol.startsWith("XAU") ? 100 : 100000;
  
  // Valor base do pip (antes da conversão)
  const basePipValue = contractSize * pipSize * lotSize;
  
  switch (symbolType) {
    case SymbolType.USD_QUOTE:
    case SymbolType.METAL_USD:
      // Pares XXX/USD: pip value já está em USD
      // Ex: EURUSD = 100,000 × 0.0001 = $10.00
      // Ex: XAUUSD = 100 × 0.10 = $10.00
      return basePipValue;
    
    case SymbolType.USD_BASE:
      // Pares USD/XXX: dividir pela taxa do próprio par
      // Ex: USDJPY @ 159.00 = (100,000 × 0.01) / 159.00 = $6.29
      const usdBaseRate = conversionRates.USDJPY || conversionRates.USDCAD || conversionRates.USDCHF;
      if (symbol === "USDJPY" && conversionRates.USDJPY) {
        return basePipValue / conversionRates.USDJPY;
      }
      if (symbol === "USDCAD" && conversionRates.USDCAD) {
        return basePipValue / conversionRates.USDCAD;
      }
      if (symbol === "USDCHF" && conversionRates.USDCHF) {
        return basePipValue / conversionRates.USDCHF;
      }
      // Fallback: usar taxa estimada se não disponível
      console.warn(`[calculateMonetaryPipValue] Taxa de conversão não disponível para ${symbol}, usando estimativa`);
      return basePipValue / 150; // Estimativa conservadora
    
    case SymbolType.JPY_QUOTE:
      // Pares XXX/JPY: dividir pela taxa USDJPY
      // Ex: EURJPY com USDJPY @ 159.00 = (100,000 × 0.01) / 159.00 = $6.29
      if (conversionRates.USDJPY) {
        return basePipValue / conversionRates.USDJPY;
      }
      // Fallback: usar taxa estimada
      console.warn(`[calculateMonetaryPipValue] USDJPY não disponível para ${symbol}, usando estimativa`);
      return basePipValue / 150; // Estimativa conservadora (USDJPY ~150)
    
    case SymbolType.CROSS:
      // Pares cross: multiplicar pela taxa Quote/USD
      const quoteCurrency = getQuoteCurrency(symbol);
      let crossRate = 1.0;
      
      if (quoteCurrency === "GBP" && conversionRates.GBPUSD) {
        crossRate = conversionRates.GBPUSD;
      } else if (quoteCurrency === "EUR" && conversionRates.EURUSD) {
        crossRate = conversionRates.EURUSD;
      } else if (quoteCurrency === "AUD" && conversionRates.AUDUSD) {
        crossRate = conversionRates.AUDUSD;
      } else if (quoteCurrency === "NZD" && conversionRates.NZDUSD) {
        crossRate = conversionRates.NZDUSD;
      } else if (quoteCurrency === "CAD" && conversionRates.USDCAD) {
        // CAD é cotado como USD/CAD, então invertemos
        crossRate = 1 / conversionRates.USDCAD;
      } else if (quoteCurrency === "CHF" && conversionRates.USDCHF) {
        // CHF é cotado como USD/CHF, então invertemos
        crossRate = 1 / conversionRates.USDCHF;
      } else {
        console.warn(`[calculateMonetaryPipValue] Taxa de conversão não disponível para ${symbol} (quote: ${quoteCurrency})`);
      }
      
      return basePipValue * crossRate;
    
    case SymbolType.INDEX:
      // Índices: geralmente já em USD, mas pode variar
      // Para simplificar, assumimos que o pip value é direto
      return basePipValue;
    
    default:
      console.warn(`[calculateMonetaryPipValue] Tipo de símbolo desconhecido: ${symbol}`);
      return basePipValue;
  }
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
