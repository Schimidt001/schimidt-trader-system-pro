/**
 * Constantes para IC Markets / cTrader
 * Símbolos Forex disponíveis para trading via cTrader Open API
 */

// Símbolos Forex disponíveis na IC Markets via cTrader
export const ICMARKETS_SYMBOLS = [
  // Pares Principais (Majors)
  { value: "EURUSD", label: "EUR/USD", category: "major" },
  { value: "GBPUSD", label: "GBP/USD", category: "major" },
  { value: "USDJPY", label: "USD/JPY", category: "major" },
  { value: "AUDUSD", label: "AUD/USD", category: "major" },
  { value: "USDCAD", label: "USD/CAD", category: "major" },
  { value: "USDCHF", label: "USD/CHF", category: "major" },
  { value: "NZDUSD", label: "NZD/USD", category: "major" },
  
  // Pares Menores (Minors)
  { value: "EURGBP", label: "EUR/GBP", category: "minor" },
  { value: "EURJPY", label: "EUR/JPY", category: "minor" },
  { value: "EURAUD", label: "EUR/AUD", category: "minor" },
  { value: "EURNZD", label: "EUR/NZD", category: "minor" },
  { value: "EURCHF", label: "EUR/CHF", category: "minor" },
  { value: "EURCAD", label: "EUR/CAD", category: "minor" },
  { value: "GBPJPY", label: "GBP/JPY", category: "minor" },
  { value: "GBPAUD", label: "GBP/AUD", category: "minor" },
  { value: "GBPNZD", label: "GBP/NZD", category: "minor" },
  { value: "GBPCHF", label: "GBP/CHF", category: "minor" },
  { value: "GBPCAD", label: "GBP/CAD", category: "minor" },
  { value: "AUDJPY", label: "AUD/JPY", category: "minor" },
  { value: "AUDNZD", label: "AUD/NZD", category: "minor" },
  { value: "AUDCAD", label: "AUD/CAD", category: "minor" },
  { value: "AUDCHF", label: "AUD/CHF", category: "minor" },
  { value: "NZDJPY", label: "NZD/JPY", category: "minor" },
  { value: "NZDCAD", label: "NZD/CAD", category: "minor" },
  { value: "NZDCHF", label: "NZD/CHF", category: "minor" },
  { value: "CADJPY", label: "CAD/JPY", category: "minor" },
  { value: "CADCHF", label: "CAD/CHF", category: "minor" },
  { value: "CHFJPY", label: "CHF/JPY", category: "minor" },
  
  // Pares Exóticos (Exotics) - Mais populares
  { value: "USDZAR", label: "USD/ZAR", category: "exotic" },
  { value: "USDMXN", label: "USD/MXN", category: "exotic" },
  { value: "USDTRY", label: "USD/TRY", category: "exotic" },
  { value: "USDSEK", label: "USD/SEK", category: "exotic" },
  { value: "USDNOK", label: "USD/NOK", category: "exotic" },
  { value: "USDSGD", label: "USD/SGD", category: "exotic" },
  { value: "USDHKD", label: "USD/HKD", category: "exotic" },
];

// Configurações padrão para IC Markets
export const ICMARKETS_DEFAULTS = {
  // Gestão de Risco
  defaultLots: 0.01, // Lote mínimo
  maxLots: 100, // Lote máximo
  defaultLeverage: 500, // Alavancagem padrão
  
  // Stop Loss e Take Profit em Pips
  defaultStopLossPips: 15,
  defaultTakeProfitPips: 0, // 0 = Infinito (Trailing Stop)
  
  // Trailing Stop
  trailingTriggerPips: 10, // Ativar quando lucro >= 10 pips
  trailingStepPips: 5, // Mover SL a cada 5 pips de lucro adicional
  
  // Timeframe padrão
  defaultTimeframe: "M15",
};

// Timeframes disponíveis para cTrader
export const ICMARKETS_TIMEFRAMES = [
  { value: "M1", label: "1 Minuto", seconds: 60 },
  { value: "M5", label: "5 Minutos", seconds: 300 },
  { value: "M15", label: "15 Minutos", seconds: 900 },
  { value: "M30", label: "30 Minutos", seconds: 1800 },
  { value: "H1", label: "1 Hora", seconds: 3600 },
  { value: "H4", label: "4 Horas", seconds: 14400 },
  { value: "D1", label: "1 Dia", seconds: 86400 },
];

// Categorias de símbolos para agrupamento na UI
export const SYMBOL_CATEGORIES = {
  major: { label: "Pares Principais", color: "text-green-400" },
  minor: { label: "Pares Menores", color: "text-blue-400" },
  exotic: { label: "Pares Exóticos", color: "text-yellow-400" },
};
