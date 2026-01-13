# Documentação cTrader Open API - ProtoOANewOrderReq

## Informação Crítica sobre Volume

Segundo a documentação oficial da cTrader Open API:

### ProtoOANewOrderReq - Campos Relevantes

| Field | Type | Label | Description |
|-------|------|-------|-------------|
| ctidTraderAccountId | int64 | Required | The unique identifier of the trader's account in cTrader platform |
| symbolId | int64 | Required | The unique identifier of a symbol in cTrader platform |
| orderType | ProtoOAOrderType | Required | The type of an order - MARKET, LIMIT, STOP, MARKET_RANGE, STOP_LIMIT |
| tradeSide | ProtoOATradeSide | Required | The trade direction - BUY or SELL |
| **volume** | **int64** | **Required** | **The volume represented in 0.01 of a unit (e.g. 1000 in protocol means 10.00 units)** |
| limitPrice | double | Optional | The limit price, can be specified for the LIMIT order only |
| stopPrice | double | Optional | Stop Price, can be specified for the STOP and the STOP_LIMIT orders only |
| stopLoss | double | Optional | The absolute Stop Loss price (1.23456 for example). Not supported for MARKET orders |
| takeProfit | double | Optional | The absolute Take Profit price (1.23456 for example). Unsupported for MARKET orders |

## IMPORTANTE - Conversão de Volume

A API cTrader usa **centésimos de unidade** (0.01 de uma unidade):
- **1000 na API = 10.00 unidades (lotes)**
- **100 na API = 1.00 unidade (lote)**
- **1 na API = 0.01 unidades**

### Fórmula de Conversão:
```
volumeParaAPI = lotes * 100
```

Por exemplo:
- 0.01 lotes → 1 (na API)
- 0.10 lotes → 10 (na API)
- 1.00 lotes → 100 (na API)
- 10.00 lotes → 1000 (na API)

## NOTA CRÍTICA

O código atual pode estar a usar um multiplicador de **10.000.000** (10 milhões), o que está **ERRADO**.

O multiplicador correto é **100** (cem), conforme documentação oficial.

Se o código envia `0.01 * 10.000.000 = 100.000` para a API, isso significa **1000 lotes**, não 0.01 lotes!

### Correção Necessária:
```javascript
// ERRADO (atual)
const volumeInCents = lots * 10000000;

// CORRETO (conforme documentação)
const volumeInCents = lots * 100;
```

Fonte: https://help.ctrader.com/open-api/messages/#protooaneworderreq


## ProtoOASymbol - Informação sobre Volume

### Campos Relevantes:

| Field | Type | Label | Description |
|-------|------|-------|-------------|
| **lotSize** | int64 | Optional | **Lot size of the Symbol (in cents)** |
| **maxVolume** | int64 | Optional | Maximum allowed volume in cents for an order with a symbol |
| **minVolume** | int64 | Optional | Minimum allowed volume in cents for an order with a symbol |
| **stepVolume** | int64 | Optional | Step of the volume in cents for an order |

### Interpretação CRÍTICA

A documentação diz:
- **lotSize** = "Lot size of the Symbol (in cents)"
- **maxVolume/minVolume/stepVolume** = "volume in cents"

Isto significa que **1 lote standard = lotSize cents**.

Para Forex padrão:
- 1 Lote Standard = 100,000 unidades
- Se lotSize = 10,000,000 cents (100,000 * 100), então:
  - 0.01 lotes = 100,000 cents
  - 1.0 lotes = 10,000,000 cents

**CONCLUSÃO**: O multiplicador de 10,000,000 pode estar CORRETO se:
- 1 Lote = 100,000 unidades
- 1 Unidade = 100 cents
- Logo: 1 Lote = 100,000 * 100 = 10,000,000 cents

### Verificação Necessária

Preciso verificar o valor real de `lotSize` retornado pela API para os símbolos utilizados.
Se `lotSize = 10,000,000`, então o multiplicador está correto.
Se `lotSize = 100`, então o multiplicador está errado.



## Convert lots to units (cTrader Algo)

Segundo a documentação da cTrader Algo:

> "By default, cTrader algos calculate volume in units instead of lots. However, in some cases you may find that working with lots is more convenient and familiar."
>
> "You can convert lots to units by using the `Symbol.QuantityToVolumeUnits()` method."

### Exemplo de código:
```csharp
var lots = 2.5;
var volumeInUnits = Symbol.QuantityToVolumeUnits(lots);
ExecuteMarketOrder(TradeType.Sell, SymbolName, volumeInUnits);
```

### Conclusão sobre Volume na Open API

A Open API (TCP/WebSocket) usa uma representação diferente da Algo API (C#/Python):

**Open API (ProtoOANewOrderReq):**
- Volume é representado em **0.01 de uma unidade** (centésimos)
- Exemplo: `1000` no protocolo = `10.00` unidades

**Relação com Lotes:**
- 1 Lote Standard = 100,000 unidades
- Se 1000 = 10 unidades, então:
  - 0.01 lotes = 1,000 unidades = 100,000 no protocolo
  - 1.0 lotes = 100,000 unidades = 10,000,000 no protocolo

**VERIFICAÇÃO DO MULTIPLICADOR:**
O multiplicador de **10,000,000** parece estar CORRETO para converter lotes em "cents" da API:
- 0.01 lotes × 10,000,000 = 100,000 (que representa 1,000 unidades no protocolo)

**MAS ESPERA!** A documentação diz:
> "Volume represented in 0.01 of a unit (e.g. 1000 in protocol means 10.00 units)"

Isto significa:
- 1000 no protocolo = 10 unidades
- Para 1,000 unidades (0.01 lotes), precisamos de: 1,000 × 100 = 100,000 no protocolo

Então o multiplicador correto é:
- **lotes × 100,000 × 100 = lotes × 10,000,000** ✅

O multiplicador de 10,000,000 está CORRETO!

