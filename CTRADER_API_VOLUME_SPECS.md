# cTrader Open API - Especificações de Volume

## Fonte: https://help.ctrader.com/open-api/model-messages/#protooasymbol

## Campos de Volume no ProtoOASymbol

| Campo | Tipo | Label | Descrição |
|-------|------|-------|-----------|
| **minVolume** | int64 | Optional | Minimum allowed volume in cents for an order with a symbol. |
| **stepVolume** | int64 | Optional | Step of the volume in cents for an order. |
| **maxExposure** | uint64 | Optional | Value of max exposure per symbol, per account. Blocks execution if breached. |

## Conversão de Volume

- **1 lote** = 100 cents no protocolo
- **0.01 lote** = 1 cent no protocolo
- Exemplo: `minVolume = 100` significa mínimo de 1.00 lote
- Exemplo: `stepVolume = 1` significa step de 0.01 lote

## Observações Importantes

1. O volume é representado em **cents** (0.01 de unidade)
2. Exemplo: 1000 no protocolo = 10.00 lotes
3. O **stepVolume** define o incremento mínimo permitido

## Implicação para o Código Atual

O código atual em `RiskManager.ts` usa:
```typescript
// Arredondar para step de 0.01 (micro lote)
lotSize = Math.floor(lotSize * 100) / 100;

// Limitar entre 0.01 e 10 lotes
lotSize = Math.max(0.01, Math.min(10, lotSize));
```

**PROBLEMA:** O código assume step fixo de 0.01, mas deveria consultar `stepVolume` do símbolo.

## ProtoOAClientPermissionScope (Permissões do Token)

| Nome | Valor | Descrição |
|------|-------|-----------|
| **SCOPE_VIEW** | 0 | Allows to use only view commands. Trade is prohibited. |
| **SCOPE_TRADE** | 1 | Allows to use all commands. |

**IMPORTANTE:** Se o token tiver apenas `SCOPE_VIEW`, as ordens de trading serão rejeitadas.

