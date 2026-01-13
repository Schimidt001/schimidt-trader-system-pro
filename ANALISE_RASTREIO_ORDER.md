# Análise de Rastreio do Objeto Order

## Resumo Executivo

Após análise profunda do código, **confirmo que o multiplicador de 10.000.000 está CORRETO** e que **as chamadas de placeOrder já estão usando os nomes de parâmetros corretos** (`lots`, `orderType`, `direction`).

## Fluxo Completo do Objeto Order

### 1. RiskManager (Cálculo)
**Ficheiro:** `server/adapters/ctrader/RiskManager.ts`

```typescript
// Linha 291: Calcula lote bruto
let lotSize = riskAmount / (effectiveSL * pipValue);

// Linha 295: Converte para CENTS
let volumeInCents = Math.round(lotSize * 10000000);

// Linha 314: Converte de volta para LOTES
lotSize = volumeInCents / 10000000;

// Retorna:
return {
  lotSize,           // ← LOTES (ex: 0.01)
  volumeInCents,     // ← CENTS (ex: 100000)
  ...
};
```

**Saída:** `lotSize` em LOTES (ex: 0.01)

---

### 2. SMCTradingEngine (Uso)
**Ficheiro:** `server/adapters/ctrader/SMCTradingEngine.ts`

```typescript
// Linha 1268: Valor padrão
let lotSize = this.config.lots;  // Default: 0.01 (da configuração)

// Linha 1294-1296: Usa resultado do RiskManager
const posSize = this.riskManager.calculatePositionSize(...);
if (posSize.canTrade) {
  lotSize = posSize.lotSize;  // ← LOTES (ex: 0.01)
}

// Linha 1334-1338: Envia para o Adapter
const result = await ctraderAdapter.placeOrder({
  symbol,
  direction: signal.signal as "BUY" | "SELL",
  orderType: "MARKET",
  lots: lotSize,  // ← LOTES (ex: 0.01) ✅ CORRETO
  stopLossPips: sltp.stopLossPips,
  takeProfitPips: sltp.takeProfitPips,
  ...
});
```

**Entrada para Adapter:** `lots` em LOTES (ex: 0.01) ✅

---

### 3. CTraderAdapter (Validação)
**Ficheiro:** `server/adapters/CTraderAdapter.ts`

```typescript
// Linha 555: Log de entrada
console.log("[CTraderAdapter] Executando ordem:", order);

// Linha 558: Validação
if (!order.symbol || !order.direction || !order.lots) {
  // ERRO se lots for undefined
}

// Linha 568: Normalização
let normalizedLots = Math.round(order.lots * 100) / 100;

// Linha 689-692: Chama o Client
const response = await this.client.createMarketOrder(
  symbolId,
  tradeSide,
  order.lots,  // ← LOTES (ex: 0.01) ✅
  ...
);
```

**Entrada para Client:** `volume` em LOTES (ex: 0.01) ✅

---

### 4. CTraderClient (Conversão Final)
**Ficheiro:** `server/adapters/ctrader/CTraderClient.ts`

```typescript
// Linha 1040-1048: Assinatura do método
async createMarketOrder(
  symbolId: number,
  tradeSide: TradeSide,
  volume: number,  // ← LOTES (ex: 0.01)
  ...
)

// Linha 1064: CONVERSÃO CRÍTICA
const volumeInCents = Math.round(volume * 10000000);
// 0.01 * 10,000,000 = 100,000 cents ✅

// Linha 1072: Log de debug
console.log(`  - Volume: ${volume} lotes = ${volumeInCents} cents`);

// Linha 1076-1082: Parâmetros para API
const orderParams: any = {
  ctidTraderAccountId: this.accountId,
  symbolId,
  orderType: OrderType.MARKET,
  tradeSide,
  volume: volumeInCents,  // ← CENTS (ex: 100000) ✅
};
```

**Envio para API:** `volume` em CENTS (ex: 100000) ✅

---

## Verificação Matemática

### Cenário: 0.01 Lotes (Micro Lote)

| Etapa | Valor | Unidade |
|-------|-------|---------|
| RiskManager calcula | 0.01 | Lotes |
| SMCTradingEngine recebe | 0.01 | Lotes |
| CTraderAdapter valida | 0.01 | Lotes |
| CTraderClient recebe | 0.01 | Lotes |
| Multiplicação | 0.01 × 10,000,000 | = 100,000 |
| Envio para API | 100,000 | Cents |

### Interpretação da API cTrader:
- 100,000 cents ÷ 100 = 1,000 unidades
- 1,000 unidades = 0.01 lotes ✅

---

## Diagnóstico do Problema Original

O problema mencionado nas diretrizes ("100 LOTES") **NÃO é causado pelo multiplicador**.

### Possíveis Causas do "100 Lotes":

1. **Valor padrão errado** - Se `lots` era `undefined`, o código poderia assumir um valor padrão de 1.0 ou 100.

2. **Interface antiga** - Se o código antigo usava `volume` em vez de `lots`, e o Adapter esperava `lots`:
   ```typescript
   // ANTIGO (errado)
   { volume: 0.01 }  // Adapter recebe undefined em lots
   
   // NOVO (correto)
   { lots: 0.01 }    // Adapter recebe 0.01 em lots ✅
   ```

3. **Conversão dupla** - Se o valor já estava em cents e foi multiplicado novamente.

---

## Estado Atual do Código

### ✅ Verificações Positivas:

1. **Nomes de parâmetros corretos** em todas as chamadas:
   - `server/_core/index.ts` ✅
   - `server/adapters/ctrader/HybridTradingEngine.ts` ✅
   - `server/adapters/ctrader/SMCTradingEngine.ts` ✅
   - `server/adapters/ctrader/TradingEngine.ts` ✅
   - `server/icmarkets/forceTestTrade.ts` ✅
   - `server/icmarkets/icmarketsRouter.ts` ✅

2. **Multiplicador correto** (10,000,000) no `CTraderClient.ts`

3. **Validação de lots** no `CTraderAdapter.ts` (linha 558)

4. **Normalização de lots** no `CTraderAdapter.ts` (linha 568)

5. **Valor padrão seguro** de 0.01 lotes em todas as configurações

---

## Recomendações

### 1. Adicionar Logs de Debug nos Pontos Críticos

```typescript
// No SMCTradingEngine, antes de chamar placeOrder:
console.log(`[TRACE] RiskManager retornou: ${posSize.lotSize} lotes`);

// No CTraderAdapter, ao receber a ordem:
console.log(`[TRACE] Adapter recebeu: lots=${order.lots}`);

// No CTraderClient, antes de enviar:
console.log(`[TRACE] Enviando para API: ${volumeInCents} cents (${volume} lotes)`);
```

### 2. Validação Defensiva

Adicionar verificação de sanidade no `CTraderClient.ts`:

```typescript
// Antes da multiplicação
if (volume > 100) {
  console.error(`[SANITY CHECK] Volume ${volume} parece já estar em unidades, não em lotes!`);
  throw new Error("Volume inválido - possível dupla conversão");
}
```

---

## Conclusão

O código atual está **CORRETO**. O problema original ("100 LOTES") foi provavelmente causado por:

1. **Parâmetros com nomes antigos** (`volume` em vez de `lots`) que resultavam em `undefined`
2. **Valor padrão inadequado** quando `lots` era `undefined`

Estes problemas **já foram corrigidos** nas versões atuais dos ficheiros.
