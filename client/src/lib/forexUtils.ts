/**
 * Utilitários de Formatação para Forex Trading
 * 
 * CORREÇÃO 2026-01-13: Centralização de formatação visual
 * - Mapeamento de Symbol IDs para nomes legíveis
 * - Formatação de direção (BUY/SELL) com cores
 * - Formatação de preços e lotes
 * - Formatação de P&L com cores
 */

// ============= MAPEAMENTO DE SÍMBOLOS =============

/**
 * Mapeamento de Symbol ID da cTrader para nome legível
 * Baseado nos símbolos mais comuns da IC Markets
 */
export const SYMBOL_ID_MAP: Record<number, string> = {
  1: "EURUSD",
  2: "GBPUSD",
  3: "USDJPY",
  4: "EURJPY",
  5: "GBPJPY",
  6: "AUDUSD",
  7: "USDCAD",
  8: "USDCHF",
  9: "NZDUSD",
  10: "EURGBP",
  11: "EURAUD",
  12: "EURCHF",
  13: "AUDJPY",
  14: "CADJPY",
  15: "CHFJPY",
  16: "NZDJPY",
  17: "GBPAUD",
  18: "GBPCAD",
  19: "GBPCHF",
  20: "AUDCAD",
  21: "AUDCHF",
  22: "AUDNZD",
  23: "CADCHF",
  24: "EURNZD",
  25: "EURCAD",
  26: "NZDCAD",
  27: "NZDCHF",
  28: "XAUUSD", // Ouro
  29: "XAGUSD", // Prata
  30: "BTCUSD", // Bitcoin
  31: "ETHUSD", // Ethereum
};

/**
 * Informações detalhadas de cada símbolo
 */
export const SYMBOL_INFO: Record<string, {
  label: string;
  pip: number;
  digits: number;
  category: "major" | "minor" | "exotic" | "metal" | "crypto";
}> = {
  EURUSD: { label: "EUR/USD", pip: 0.0001, digits: 5, category: "major" },
  GBPUSD: { label: "GBP/USD", pip: 0.0001, digits: 5, category: "major" },
  USDJPY: { label: "USD/JPY", pip: 0.01, digits: 3, category: "major" },
  EURJPY: { label: "EUR/JPY", pip: 0.01, digits: 3, category: "major" },
  GBPJPY: { label: "GBP/JPY", pip: 0.01, digits: 3, category: "major" },
  AUDUSD: { label: "AUD/USD", pip: 0.0001, digits: 5, category: "major" },
  USDCAD: { label: "USD/CAD", pip: 0.0001, digits: 5, category: "major" },
  USDCHF: { label: "USD/CHF", pip: 0.0001, digits: 5, category: "major" },
  NZDUSD: { label: "NZD/USD", pip: 0.0001, digits: 5, category: "major" },
  EURGBP: { label: "EUR/GBP", pip: 0.0001, digits: 5, category: "minor" },
  EURAUD: { label: "EUR/AUD", pip: 0.0001, digits: 5, category: "minor" },
  EURCHF: { label: "EUR/CHF", pip: 0.0001, digits: 5, category: "minor" },
  AUDJPY: { label: "AUD/JPY", pip: 0.01, digits: 3, category: "minor" },
  CADJPY: { label: "CAD/JPY", pip: 0.01, digits: 3, category: "minor" },
  CHFJPY: { label: "CHF/JPY", pip: 0.01, digits: 3, category: "minor" },
  NZDJPY: { label: "NZD/JPY", pip: 0.01, digits: 3, category: "minor" },
  GBPAUD: { label: "GBP/AUD", pip: 0.0001, digits: 5, category: "minor" },
  GBPCAD: { label: "GBP/CAD", pip: 0.0001, digits: 5, category: "minor" },
  GBPCHF: { label: "GBP/CHF", pip: 0.0001, digits: 5, category: "minor" },
  AUDCAD: { label: "AUD/CAD", pip: 0.0001, digits: 5, category: "minor" },
  AUDCHF: { label: "AUD/CHF", pip: 0.0001, digits: 5, category: "minor" },
  AUDNZD: { label: "AUD/NZD", pip: 0.0001, digits: 5, category: "minor" },
  CADCHF: { label: "CAD/CHF", pip: 0.0001, digits: 5, category: "minor" },
  EURNZD: { label: "EUR/NZD", pip: 0.0001, digits: 5, category: "minor" },
  EURCAD: { label: "EUR/CAD", pip: 0.0001, digits: 5, category: "minor" },
  NZDCAD: { label: "NZD/CAD", pip: 0.0001, digits: 5, category: "minor" },
  NZDCHF: { label: "NZD/CHF", pip: 0.0001, digits: 5, category: "minor" },
  XAUUSD: { label: "XAU/USD (Ouro)", pip: 0.01, digits: 2, category: "metal" },
  XAGUSD: { label: "XAG/USD (Prata)", pip: 0.001, digits: 3, category: "metal" },
  BTCUSD: { label: "BTC/USD", pip: 1, digits: 2, category: "crypto" },
  ETHUSD: { label: "ETH/USD", pip: 0.01, digits: 2, category: "crypto" },
};

// ============= FUNÇÕES DE FORMATAÇÃO =============

/**
 * Converte Symbol ID numérico para nome do símbolo
 */
export function getSymbolName(symbolIdOrName: number | string): string {
  if (typeof symbolIdOrName === "string") {
    // Já é uma string, retornar como está ou formatar
    return symbolIdOrName.toUpperCase();
  }
  return SYMBOL_ID_MAP[symbolIdOrName] || `Symbol ${symbolIdOrName}`;
}

/**
 * Obtém o label formatado do símbolo (ex: "EUR/USD")
 */
export function getSymbolLabel(symbol: string): string {
  const info = SYMBOL_INFO[symbol.toUpperCase()];
  return info?.label || symbol;
}

/**
 * Formata preço com o número correto de casas decimais
 */
export function formatPrice(price: number | string | null | undefined, symbol?: string): string {
  if (price === null || price === undefined) return "-";
  
  const numPrice = typeof price === "string" ? parseFloat(price) : price;
  if (isNaN(numPrice)) return "-";
  
  // Determinar casas decimais baseado no símbolo
  let digits = 5;
  if (symbol) {
    const info = SYMBOL_INFO[symbol.toUpperCase()];
    if (info) digits = info.digits;
  } else {
    // Inferir pelo valor do preço
    if (numPrice > 100) digits = 3; // Provavelmente JPY pair
    if (numPrice > 1000) digits = 2; // Provavelmente ouro ou crypto
  }
  
  return numPrice.toFixed(digits);
}

/**
 * Formata lotes com 2 casas decimais
 */
export function formatLots(lots: number | string | null | undefined): string {
  if (lots === null || lots === undefined) return "-";
  
  const numLots = typeof lots === "string" ? parseFloat(lots) : lots;
  if (isNaN(numLots)) return "-";
  
  return numLots.toFixed(2);
}

/**
 * Formata P&L em USD
 */
export function formatPnL(pnl: number | string | null | undefined): string {
  if (pnl === null || pnl === undefined) return "-";
  
  const numPnL = typeof pnl === "string" ? parseFloat(pnl) : pnl;
  if (isNaN(numPnL)) return "-";
  
  const sign = numPnL >= 0 ? "+" : "";
  return `${sign}$${numPnL.toFixed(2)}`;
}

/**
 * Formata P&L em pips
 */
export function formatPips(pips: number | string | null | undefined): string {
  if (pips === null || pips === undefined) return "-";
  
  const numPips = typeof pips === "string" ? parseFloat(pips) : pips;
  if (isNaN(numPips)) return "-";
  
  const sign = numPips >= 0 ? "+" : "";
  return `${sign}${numPips.toFixed(1)} pips`;
}

/**
 * Converte direção numérica para string
 */
export function getDirectionString(direction: number | string): "BUY" | "SELL" {
  if (typeof direction === "string") {
    return direction.toUpperCase() === "BUY" ? "BUY" : "SELL";
  }
  // 1 = BUY, 2 = SELL (padrão cTrader)
  return direction === 1 ? "BUY" : "SELL";
}

/**
 * Formata data/hora para exibição
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "-";
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Formata data/hora curta (sem ano)
 */
export function formatDateTimeShort(date: Date | string | null | undefined): string {
  if (!date) return "-";
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============= CLASSES CSS =============

/**
 * Retorna classes CSS para direção (BUY/SELL)
 */
export function getDirectionClasses(direction: string | number): {
  text: string;
  bg: string;
  border: string;
  badge: string;
} {
  const isBuy = typeof direction === "string" 
    ? direction.toUpperCase() === "BUY" 
    : direction === 1;
  
  if (isBuy) {
    return {
      text: "text-green-400",
      bg: "bg-green-500/10",
      border: "border-green-500/30",
      badge: "bg-green-500/20 text-green-400 border-green-500/30",
    };
  } else {
    return {
      text: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      badge: "bg-red-500/20 text-red-400 border-red-500/30",
    };
  }
}

/**
 * Retorna classes CSS para P&L
 */
export function getPnLClasses(pnl: number | string | null | undefined): string {
  if (pnl === null || pnl === undefined) return "text-slate-400";
  
  const numPnL = typeof pnl === "string" ? parseFloat(pnl) : pnl;
  if (isNaN(numPnL)) return "text-slate-400";
  
  if (numPnL > 0) return "text-green-400";
  if (numPnL < 0) return "text-red-400";
  return "text-slate-400";
}

/**
 * Retorna classes CSS para status
 */
export function getStatusClasses(status: string): {
  text: string;
  badge: string;
} {
  switch (status.toUpperCase()) {
    case "OPEN":
      return {
        text: "text-blue-400",
        badge: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      };
    case "CLOSED":
      return {
        text: "text-slate-400",
        badge: "bg-slate-500/20 text-slate-400 border-slate-500/30",
      };
    case "PENDING":
      return {
        text: "text-yellow-400",
        badge: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      };
    default:
      return {
        text: "text-slate-400",
        badge: "bg-slate-500/20 text-slate-400 border-slate-500/30",
      };
  }
}
