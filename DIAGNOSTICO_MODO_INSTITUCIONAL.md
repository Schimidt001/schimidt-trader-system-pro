# Diagnóstico: Modo Institucional SMC - ICMARKETS

**Data:** 04/02/2026  
**Plataforma:** Schimidt Trader System Pro  
**Modo:** ICMARKETS - Estratégia SMC  

---

## 1. Resumo Executivo

Após análise detalhada do código-fonte, foram identificados **dois problemas principais**:

### Problema 1: Modo Institucional Não Está Sendo Ativado
O modo institucional está configurado na UI, mas **não está sendo efetivamente ativado** no backend devido à forma como o valor é carregado do banco de dados.

### Problema 2: Sweep Ao Vivo Não Usa sweepBufferPips
O sweep ao vivo detecta qualquer ultrapassagem do preço (mesmo 0.1 pip), **ignorando completamente** o parâmetro `sweepBufferPips` configurado na UI.

---

## 2. Análise Detalhada

### 2.1 Problema do Modo Institucional

#### Localização do Problema
**Arquivo:** `server/adapters/ctrader/HybridTradingEngine.ts` (linha 741)

```typescript
// CORREÇÃO P0.5: Default = FALSE para compatibilidade com configs antigas
institutionalModeEnabled: smcConfig?.institutionalModeEnabled ?? false,
```

#### Causa Raiz
O campo `institutionalModeEnabled` no banco de dados (tabela `smcStrategyConfig`) é do tipo `boolean` com default `false`. Quando o valor é lido do MySQL via Drizzle ORM, pode vir como:
- `true` (boolean)
- `1` (number)
- `"1"` ou `"true"` (string)

O código atual usa `??` (nullish coalescing) que só trata `null` e `undefined`, mas **não trata valores falsy como `0` ou string vazia**.

#### Verificação no Código
O código verifica explicitamente `=== true`:

```typescript
// SMCStrategy.ts (linha 596)
if (instManager && this.config.institutionalModeEnabled === true) {
```

Se o valor vier do banco como `1` (number) ou `"1"` (string), a comparação `=== true` falha e o modo institucional **não é ativado**.

#### Evidência nos Logs
Se o modo institucional estivesse ativo, você veria nos logs:
- `[SMC-INST] Modo institucional HABILITADO para X símbolos`
- `[SMC-INST] FVG min: X pips | Max trades/sessão: X`
- Logs de `SMC_INST_STATUS` no formato JSON

A ausência desses logs confirma que o modo **não está sendo ativado**.

---

### 2.2 Problema do Sweep Ao Vivo (0.1 pip)

#### Localização do Problema
**Arquivo:** `server/adapters/ctrader/SMCStrategy.ts` (linhas 1266-1308)

```typescript
// NOVO: DETECÇÃO EM TEMPO REAL usando currentPrice
// Verifica se o preço atual ultrapassou o swing high
if (currentPrice > swingHigh.price) {  // ❌ NÃO USA sweepBufferPips!
  swingHigh.swept = true;
  // ...
  const exceedPips = this.priceToPips(currentPrice - swingHigh.price);
  console.log(`Excedeu: ${exceedPips.toFixed(1)} pips`);  // Mostra 0.1 pips
```

#### Causa Raiz
A detecção de sweep ao vivo **não utiliza** o parâmetro `sweepBufferPips`. O código apenas verifica se `currentPrice > swingHigh.price` (ou `currentPrice < swingLow.price` para fundos), sem nenhum buffer.

O `sweepBufferPips` só é usado na verificação de candle fechado (fallback):

```typescript
// Linha 1259 - Buffer é calculado mas NÃO usado na detecção ao vivo
const bufferPips = this.config.sweepBufferPips * this.getPipValue();

// Linha 1315 - Usado apenas para logging condicional
if (this.config.verboseLogging && lastCandle.high > swingHigh.price - bufferPips) {
```

#### Comportamento Atual
1. **Sweep Ao Vivo:** Detecta qualquer ultrapassagem (0.1 pip, 0.01 pip, etc.)
2. **Sweep Candle Fechado:** Também não usa buffer como filtro, apenas para logging

#### Impacto
- Sweeps são detectados com movimentos mínimos (ruído de mercado)
- Alta sensibilidade gera muitos falsos positivos
- O parâmetro `sweepBufferPips` configurado na UI é **ignorado**

---

## 3. Soluções Propostas

### 3.1 Correção do Modo Institucional

**Arquivo:** `server/adapters/ctrader/HybridTradingEngine.ts`

```typescript
// ANTES (linha 741)
institutionalModeEnabled: smcConfig?.institutionalModeEnabled ?? false,

// DEPOIS - Converter explicitamente para boolean
institutionalModeEnabled: Boolean(smcConfig?.institutionalModeEnabled) === true,
```

Ou, mais robusto:

```typescript
// Função helper para converter valor do banco para boolean
function toBooleanSafe(value: any): boolean {
  if (value === true || value === 1 || value === '1' || value === 'true') {
    return true;
  }
  return false;
}

// Uso
institutionalModeEnabled: toBooleanSafe(smcConfig?.institutionalModeEnabled),
```

### 3.2 Correção do Sweep Ao Vivo

**Arquivo:** `server/adapters/ctrader/SMCStrategy.ts`

```typescript
// ANTES (linha 1268)
if (currentPrice > swingHigh.price) {

// DEPOIS - Usar sweepBufferPips como filtro mínimo
const bufferPrice = this.config.sweepBufferPips * this.getPipValue();
if (currentPrice > swingHigh.price + bufferPrice) {
```

E para sweep de fundo:

```typescript
// ANTES (linha 1372)
if (currentPrice < swingLow.price) {

// DEPOIS
const bufferPrice = this.config.sweepBufferPips * this.getPipValue();
if (currentPrice < swingLow.price - bufferPrice) {
```

---

## 4. Arquivos Afetados

| Arquivo | Linha | Problema |
|---------|-------|----------|
| `server/adapters/ctrader/HybridTradingEngine.ts` | 741 | Conversão de boolean |
| `server/adapters/ctrader/SMCStrategy.ts` | 1268 | Sweep HIGH sem buffer |
| `server/adapters/ctrader/SMCStrategy.ts` | 1372 | Sweep LOW sem buffer |

---

## 5. Testes Recomendados

### 5.1 Verificar Modo Institucional
Após aplicar a correção, verificar nos logs do Railway:
```
[SMC-INST] Modo institucional HABILITADO para X símbolos
```

E logs JSON estruturados:
```json
{"level":"INFO","category":"INSTITUTIONAL","type":"SMC_INST_STATUS",...}
```

### 5.2 Verificar Sweep Buffer
Configurar `sweepBufferPips = 2.0` na UI e verificar que sweeps só são detectados quando o preço excede o swing point por **pelo menos 2 pips**.

---

## 6. Conclusão

Os dois problemas identificados são **bugs de implementação** que causam:

1. **Modo Institucional:** Nunca é ativado mesmo quando configurado na UI
2. **Sweep Ao Vivo:** Extremamente sensível, ignora configuração de buffer

Ambos os problemas têm correções simples e localizadas que não afetam outras partes do sistema.

---

**Autor:** Manus AI  
**Versão:** 1.0  
