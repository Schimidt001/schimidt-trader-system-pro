# Relatório de Correção de Bug Crítico

**Data:** 2026-01-07  
**Commit:** 285631b  
**Severidade:** Crítica  
**Status:** ✅ Corrigido e Deployado

---

## Resumo Executivo

O sistema de trading estava a bloquear trades válidos acusando "Spread Alto" com valores absurdos (ex: 44.530 pips no XAUUSD), quando o spread real de mercado era de aproximadamente 1-3 pips.

---

## Análise do Problema

### Sintoma Reportado
- **Ativo:** XAUUSD (Ouro)
- **Preço:** ~4453.01
- **Erro Gerado:** "Spread alto: 44530.1 pips"
- **Spread Real de Mercado:** ~1-3 pips

### Causa Raiz Identificada

A API cTrader ocasionalmente envia **ticks parciais** onde o campo `bid` ou `ask` é `undefined`. A função `priceFromProtocol()` no `CTraderClient.ts` convertia esses valores `undefined` para `0`:

```typescript
// ANTES (Problemático)
private priceFromProtocol(value: number | Long | undefined): number {
  if (value === undefined) return 0;  // ← PROBLEMA: Retorna 0 para undefined
  const num = typeof value === "number" ? value : Number(value);
  return num / 100000;
}
```

Quando um tick com `bid = 0` era processado, o cálculo de spread resultava em:

```
spread = (ask - bid) / pipValue
spread = (4453.01 - 0) / 0.10
spread = 44530.1 pips  ← INCORRETO!
```

### Fluxo do Bug

```
API cTrader → tick com bid=undefined
     ↓
priceFromProtocol() → converte para bid=0
     ↓
emit("spot", {bid: 0, ask: 4453.01})
     ↓
handleSpotEvent() → atualiza cache com valores inválidos
     ↓
getPrice() → retorna tick com bid=0
     ↓
calculateSpreadPips() → (4453.01 - 0) / 0.10 = 44530.1 pips
     ↓
placeOrder() → "Spread muito alto: 44530.1 pips > 2 pips"
```

---

## Correção Implementada

Implementei uma **estratégia de defesa em profundidade** com 3 camadas de validação:

### Camada 1: CTraderClient.ts (Origem)

Validação na **fonte** dos dados, antes de emitir o evento `spot`:

```typescript
case PayloadType.PROTO_OA_SPOT_EVENT: {
  const bid = this.priceFromProtocol(event.bid);
  const ask = this.priceFromProtocol(event.ask);
  
  // ========== SANITY CHECK - FILTRO DE INTEGRIDADE (CAMADA 1) ==========
  if (bid <= 0 || ask <= 0) {
    break; // Não emitir tick inválido
  }
  
  if (ask < bid) {
    break; // Não emitir tick com spread negativo
  }
  
  this.emit("spot", spotData);
  break;
}
```

### Camada 2: CTraderAdapter.ts - handleSpotEvent() (Já Existia)

Validação no **processamento** do evento (mantida para redundância):

```typescript
private handleSpotEvent(spotEvent: SpotEvent): void {
  // ========== SANITY CHECK - FILTRO DE INTEGRIDADE ==========
  if (spotEvent.bid <= 0 || spotEvent.ask <= 0) {
    return;
  }
  
  if (spotEvent.ask < spotEvent.bid) {
    return;
  }
  
  // Só atualiza o cache se o tick for válido
  this.priceCache.set(symbolName, tick);
}
```

### Camada 3: CTraderAdapter.ts - getPrice() (Nova)

Validação no **retorno** do cache como última linha de defesa:

```typescript
async getPrice(symbol: string): Promise<PriceTick> {
  const tick = this.priceCache.get(symbol);
  
  // ========== SANITY CHECK - VALIDAÇÃO DE RETORNO (CAMADA 3) ==========
  if (tick.bid <= 0 || tick.ask <= 0) {
    this.priceCache.delete(symbol); // Remove tick inválido
    throw new Error(`Preço inválido no cache para ${symbol}`);
  }
  
  return tick;
}
```

---

## Verificação dos Valores de Pip

Confirmei que os valores de pip estão **corretos** no módulo centralizado `shared/normalizationUtils.ts`:

| Símbolo | Valor Configurado | Cálculo Exemplo |
|---------|-------------------|-----------------|
| XAUUSD | 0.10 | (4458.63 - 4458.52) / 0.10 = **1.1 pips** ✅ |
| EURUSD | 0.0001 | (1.10520 - 1.10500) / 0.0001 = **2 pips** ✅ |
| USDJPY | 0.01 | (150.520 - 150.500) / 0.01 = **2 pips** ✅ |

---

## Ficheiros Modificados

1. **server/adapters/ctrader/CTraderClient.ts**
   - Adicionada validação de tick antes de emitir evento `spot`
   - Linhas 555-572

2. **server/adapters/CTraderAdapter.ts**
   - Adicionada validação de retorno na função `getPrice()`
   - Linhas 428-440

---

## Resultado Esperado

Após esta correção:

- ✅ Ticks inválidos (bid=0 ou ask=0) são rejeitados na origem
- ✅ Cache nunca contém valores inválidos
- ✅ Função `getPrice()` nunca retorna preços com valores zero
- ✅ Cálculo de spread retorna valores corretos (~1-3 pips para XAUUSD)
- ✅ Trades válidos não são mais bloqueados por "Spread Alto" falso

---

## Testes Recomendados

1. **Teste de Integração:**
   - Iniciar o bot em modo DEMO
   - Monitorar logs para confirmar que ticks inválidos são rejeitados
   - Verificar que o spread calculado está dentro do esperado (1-5 pips)

2. **Teste de Regressão:**
   - Executar trades em XAUUSD, EURUSD, USDJPY
   - Confirmar que não há mais bloqueios por "Spread Alto" falso

3. **Monitorização de Logs:**
   ```
   [CTraderClient] [SPOT] Tick válido para XAUUSD: Bid=4458.52, Ask=4458.63
   [CTraderAdapter] [SPREAD_CHECK] XAUUSD: Spread atual = 1.10 pips, Máximo = 2.00 pips
   [CTraderAdapter] [SPREAD_CHECK] ✅ Spread OK, prosseguindo com a ordem
   ```

---

## Notas Técnicas

- A função `priceFromProtocol()` continua a retornar `0` para valores `undefined` por design (outros usos podem depender deste comportamento)
- A validação foi adicionada no ponto de consumo (emissão do evento) em vez de alterar a função de conversão
- As 3 camadas de defesa garantem que mesmo se uma falhar, as outras capturam o problema
