# cTrader Open API - Descobertas Importantes

## ProtoOANewOrderReq - Parâmetros de SL/TP

### Parâmetros Absolutos (NÃO suportados para MARKET orders)
- **stopLoss** (double, Optional): The absolute Stop Loss price (1.23456 for example). **Not supported for MARKET orders.**
- **takeProfit** (double, Optional): The absolute Take Profit price (1.23456 for example). **Unsupported for MARKET orders.**

### Parâmetros Relativos (SUPORTADOS para MARKET orders)
- **relativeStopLoss** (int64, Optional): Relative Stop Loss that can be specified instead of the absolute one. 
  - Specified in **1/100000 of unit of a price** (e.g. 123000 in protocol means 1.23, 53423782 means 534.23782)
  - For BUY: stopLoss = entryPrice - relativeStopLoss
  - For SELL: stopLoss = entryPrice + relativeStopLoss

- **relativeTakeProfit** (int64, Optional): Relative Take Profit that can be specified instead of the absolute one.
  - Specified in **1/100000 of unit of a price** (e.g. 123000 in protocol means 1.23, 53423782 means 534.23782)
  - For BUY: takeProfit = entryPrice + relativeTakeProfit
  - For SELL: takeProfit = entryPrice - relativeTakeProfit

## Solução para o Erro EURJPY

O erro "INVALID_REQUEST: SL/TP in absolute values are allowed only for order types: [LIMIT, STOP, STOP_LIMIT]" ocorre porque:

1. O código atual usa `stopLoss` e `takeProfit` (valores absolutos) para ordens de mercado
2. A API cTrader **NÃO SUPORTA** valores absolutos para ordens MARKET
3. Deve-se usar `relativeStopLoss` e `relativeTakeProfit` em vez disso

### Conversão necessária:
- De pips para valor relativo: `relativeSL = distanciaEmPreco * 100000`
- Exemplo: Se SL está a 0.00150 do preço de entrada, relativeStopLoss = 150 (0.00150 * 100000)

## ProtoOAAmendPositionSLTPReq - Modificar SL/TP após abertura

Para modificar SL/TP de uma posição já aberta, usa-se `ProtoOAAmendPositionSLTPReq`:
- **stopLoss** (double, Optional): Absolute Stop Loss price - **SUPORTADO** para posições abertas
- **takeProfit** (double, Optional): Absolute Take Profit price - **SUPORTADO** para posições abertas

### Estratégia alternativa:
1. Abrir ordem de mercado SEM SL/TP
2. Imediatamente após, usar `ProtoOAAmendPositionSLTPReq` para definir SL/TP com valores absolutos

## Volume

- **volume** (int64, Required): Volume represented in 0.01 of a unit (e.g. 1000 in protocol means 10.00 units)
- Nota: O código atual já converte corretamente (1 lote = 10,000,000 cents)
