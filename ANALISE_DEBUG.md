# Análise de Debug - Conectividade cTrader

## PROBLEMA CRÍTICO IDENTIFICADO: PayloadType Incorretos

### Descoberta Principal

Ao comparar o arquivo `CTraderClient.ts` com os arquivos `.proto` oficiais, identifiquei uma **discrepância crítica nos valores de PayloadType**:

#### Valores no CTraderClient.ts (INCORRETOS):
```typescript
PROTO_OA_SUBSCRIBE_SPOTS_REQ = 2124,
PROTO_OA_SUBSCRIBE_SPOTS_RES = 2125,
PROTO_OA_UNSUBSCRIBE_SPOTS_REQ = 2126,
PROTO_OA_UNSUBSCRIBE_SPOTS_RES = 2127,
PROTO_OA_SPOT_EVENT = 2128,
```

#### Valores nos arquivos .proto (CORRETOS):
```protobuf
PROTO_OA_SUBSCRIBE_SPOTS_REQ = 2127;
PROTO_OA_SUBSCRIBE_SPOTS_RES = 2128;
PROTO_OA_UNSUBSCRIBE_SPOTS_REQ = 2129;
PROTO_OA_UNSUBSCRIBE_SPOTS_RES = 2130;
PROTO_OA_SPOT_EVENT = 2131;
```

### Impacto

1. **Subscrição Silenciosamente Ignorada**: O robô envia `PROTO_OA_SUBSCRIBE_SPOTS_REQ` com payloadType `2124`, mas a API espera `2127`. A API ignora o pedido ou retorna erro que não está sendo capturado.

2. **SPOT_EVENT Nunca Capturado**: O cliente aguarda eventos com payloadType `2128`, mas a API envia com `2131`. Os ticks de preço chegam mas são ignorados pelo `processEvent()`.

3. **Conflito de PayloadTypes**: O valor `2124` na verdade corresponde a `PROTO_OA_RECONCILE_REQ` e `2126` a `PROTO_OA_EXECUTION_EVENT`, causando comportamento imprevisível.

### Outros PayloadTypes com Problemas

| Mensagem | Valor no Código | Valor Correto |
|----------|-----------------|---------------|
| PROTO_OA_EXECUTION_EVENT | 2126 | 2126 ✓ |
| PROTO_OA_RECONCILE_REQ | N/A | 2124 |
| PROTO_OA_RECONCILE_RES | N/A | 2125 |

### Solução Necessária

Corrigir todos os valores de PayloadType no arquivo `CTraderClient.ts` para corresponder aos valores oficiais da documentação cTrader Open API.
