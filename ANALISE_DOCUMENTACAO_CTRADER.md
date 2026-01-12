# Análise da Documentação Oficial cTrader Open API

## Fonte: https://help.ctrader.com/open-api/messages/

## ProtoOANewOrderReq - Especificação de Volume

De acordo com a documentação oficial da cTrader Open API:

### Campo `volume` (int64, Required):
> **"The volume represented in 0.01 of a unit (e.g. 1000 in protocol means 10.00 units)."**

### Interpretação Correta:
- O volume é representado em **centésimos de unidade** (0.01 de uma unidade)
- Exemplo: `1000` no protocolo = `10.00 unidades`
- Portanto: `100` no protocolo = `1.00 unidade`

### Conversão de Lotes para o Protocolo cTrader:
- 1 Lote Standard = 100,000 Unidades
- 1 Unidade = 100 Cents (no protocolo)
- **1 Lote = 100,000 × 100 = 10,000,000 Cents**

### Verificação do Código Atual (CTraderClient.ts):
```typescript
const volumeInCents = Math.round(volume * 10000000);
```

**CONCLUSÃO: A conversão está CORRETA!**
- 0.01 lotes × 10,000,000 = 100,000 cents = 1,000 unidades ✓

## Campos relativeStopLoss e relativeTakeProfit

### Especificação:
> **"Specified in 1/100000 of unit of a price. (e.g. 123000 in protocol means 1.23)"**

### Verificação do Código Atual:
```typescript
const relativeStopLoss = Math.round(stopLossDistance * 100000);
```

**CONCLUSÃO: A conversão está CORRETA!**

## Resumo da Análise

| Item | Status | Observação |
|------|--------|------------|
| Conversão de Volume (Lotes → Cents) | ✅ CORRETO | Multiplicador 10,000,000 está correto |
| Conversão de SL/TP Relativo | ✅ CORRETO | Multiplicador 100,000 está correto |
| Mapeamento de Símbolos | ⚠️ VERIFICAR | Múltiplas fontes de busca implementadas |



## ProtoOASymbol - Especificações de Volume

### Campos de Volume (da documentação oficial):

| Campo | Tipo | Descrição |
|-------|------|-----------|
| minVolume | int64 | Minimum allowed volume **in cents** for an order with a symbol |
| maxVolume | int64 | Maximum allowed volume **in cents** for an order with a symbol |
| stepVolume | int64 | Step of the volume **in cents** for an order |

### Interpretação:
- Os volumes são retornados em **cents** (centésimos de unidade)
- Exemplo: `100000` cents = `1000` unidades = `0.01` lotes
- Para converter cents para lotes: `cents / 10,000,000`

### Verificação do Código (RiskManager.ts):
```typescript
// Volume specs em cents
minVolume: 100000,   // = 0.01 lotes
stepVolume: 100000,  // = 0.01 lotes
```

**CONCLUSÃO: A interpretação de volume specs está CORRETA!**

