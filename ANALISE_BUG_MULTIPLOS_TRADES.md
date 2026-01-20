# Análise do Bug de Múltiplos Trades por Ativo

## Resumo do Problema

O sistema permite múltiplos trades (5, 7, 10) no mesmo ativo quando configurado para permitir apenas 1 trade por ativo. O problema é mais evidente com lotes pequenos (0.01).

## Arquitetura Identificada

### Engines de Trading
1. **TradingEngine.ts** - Engine básica (single symbol)
2. **SMCTradingEngine.ts** - Engine SMC multi-symbol
3. **HybridTradingEngine.ts** - Engine híbrida (SMC + RSI/VWAP)

### Fluxo de Execução
1. Loop de análise roda a cada 30 segundos
2. Para cada símbolo, analisa sinais
3. Se sinal válido, chama `executeSignal()`
4. `executeSignal()` verifica locks e posições antes de executar

## Mecanismos de Proteção Existentes

### HybridTradingEngine (5 camadas)
1. **Mutex per-symbol** (`isExecutingOrder`) com watchdog de 15s
2. **Cooldown por símbolo** (`lastTradeTime`)
3. **Posições pendentes** (`pendingPositions`) com timeout de 30s
4. **Filtro de candle M5** (`lastTradedCandleTimestamp`)
5. **Verificação via API** (`reconcilePositions`)

### SMCTradingEngine (2 camadas)
1. **Mutex per-symbol** (`isExecutingOrder`)
2. **Cooldown por símbolo** (`lastTradeTime`)

## Pontos Críticos Identificados

### PROBLEMA 1: Loop de Análise NÃO é Bloqueante

```typescript
// HybridTradingEngine.ts - linha 812-827
for (const symbol of this.config.symbols) {
  try {
    const wasAnalyzed = await this.analyzeSymbol(symbol);
    // ...
  } catch (error) {
    // ...
  }
}
```

O loop `for` é sequencial e usa `await`, mas **o problema está no intervalo de 30 segundos**. Se uma análise detecta sinal e inicia execução, o próximo ciclo de análise pode ocorrer antes da execução terminar.

### PROBLEMA 2: Mutex é Liberado ANTES da Confirmação Real

```typescript
// HybridTradingEngine.ts - linha 1362-1369
} finally {
  // DESTRAVAR O SÍMBOLO (SEMPRE, mesmo com erro ou return antecipado)
  this.isExecutingOrder.set(symbol, false);
  this.lockTimestamps.delete(symbol);
  console.log(`[HybridEngine] 🔓 ${symbol}: DESTRAVADO`);
}
```

O mutex é liberado no `finally`, mas a ordem pode ainda não ter sido confirmada pela corretora.

### PROBLEMA 3: Verificação de Posições Usa Cache Local

```typescript
// HybridTradingEngine.ts - linha 1137-1139
const openPositions = await ctraderAdapter.getOpenPositions();
const symbolPositions = openPositions.filter(p => p.symbol === symbol);
```

`getOpenPositions()` retorna do cache local (`this.openPositions`), que pode estar desatualizado.

```typescript
// CTraderAdapter.ts - linha 1453-1459
async getOpenPositions(): Promise<OpenPosition[]> {
  if (!this.isConnected()) {
    return [];
  }
  return Array.from(this.openPositions.values());
}
```

### PROBLEMA 4: reconcilePositions Pode Falhar Silenciosamente

```typescript
// HybridTradingEngine.ts - linha 1130-1135
try {
  await ctraderAdapter.reconcilePositions();
  console.log(`[HybridEngine] 🔄 ${symbol}: Posições sincronizadas com a API`);
} catch (reconcileError) {
  console.warn(`[HybridEngine] ⚠️ ${symbol}: Erro ao sincronizar posições, usando cache local:`, reconcileError);
}
```

Se `reconcilePositions()` falha, o código continua com o cache desatualizado.

### PROBLEMA 5: Condição de Corrida no Intervalo de Análise

O intervalo de 30 segundos entre análises é muito longo. Se:
1. Análise #1 detecta sinal às 00:00:00
2. Ordem é enviada às 00:00:01
3. Mutex é liberado às 00:00:02
4. Análise #2 começa às 00:00:30
5. Cache ainda não foi atualizado
6. Nova ordem é enviada

### PROBLEMA 6: maxTradesPerSymbol Não é Carregado do Banco

```typescript
// HybridTradingEngine.ts - linha 404-407
// Atualizar max positions
if (smcConfig[0].maxOpenTrades) {
  this.config.maxPositions = smcConfig[0].maxOpenTrades;
}
```

O código carrega `maxOpenTrades` para `maxPositions`, mas **NÃO carrega `maxTradesPerSymbol`** do banco de dados! O valor fica fixo no default (1), mas o problema é que a verificação pode falhar.

## Causa Raiz Principal

**A verificação de posições abertas (`getOpenPositions()`) usa cache local que pode estar desatualizado entre o momento do lock e a verificação.**

O fluxo problemático:
1. Sinal detectado para EURUSD
2. Lock adquirido
3. `reconcilePositions()` chamado (pode falhar ou ser lento)
4. `getOpenPositions()` retorna cache desatualizado (0 posições)
5. Ordem enviada
6. Lock liberado
7. Próximo ciclo: cache ainda não atualizado
8. Nova ordem enviada

## Soluções Implementadas (2026-01-20)

### ✅ Correção 1: Carregar maxTradesPerSymbol do Banco de Dados

**Arquivo:** `HybridTradingEngine.ts` (linhas 409-417)

```typescript
// CORREÇÃO CRÍTICA 2026-01-20: Carregar maxTradesPerSymbol do banco de dados
if (smcConfig[0].maxTradesPerSymbol !== undefined && smcConfig[0].maxTradesPerSymbol !== null) {
  this.config.maxTradesPerSymbol = smcConfig[0].maxTradesPerSymbol;
  console.log(`[HybridEngine] [Config] ✅ maxTradesPerSymbol carregado do banco: ${this.config.maxTradesPerSymbol}`);
}
```

**Arquivo:** `SMCTradingEngine.ts` (linhas 580-587)

Mesma correção aplicada.

### ✅ Correção 2: Verificação Adicional no Banco de Dados

**Arquivo:** `RiskManager.ts` (linhas 569-601)

Novo método `getOpenTradesCountBySymbol(symbol)` que consulta diretamente o banco de dados.

```typescript
async getOpenTradesCountBySymbol(symbol: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(forexPositions)
    .where(
      and(
        eq(forexPositions.userId, this.config.userId),
        eq(forexPositions.botId, this.config.botId),
        eq(forexPositions.symbol, symbol),
        eq(forexPositions.status, "OPEN")
      )
    );
  return result[0]?.count || 0;
}
```

### ✅ Correção 3: Camada de Segurança Adicional (Camada 5d)

**Arquivo:** `HybridTradingEngine.ts` (linhas 1166-1179)

```typescript
// CAMADA 5d: VERIFICAÇÃO ADICIONAL NO BANCO DE DADOS (CORREÇÃO CRÍTICA 2026-01-20)
if (this.riskManager) {
  const dbSymbolPositions = await this.riskManager.getOpenTradesCountBySymbol(symbol);
  if (dbSymbolPositions >= this.config.maxTradesPerSymbol) {
    console.log(`[HybridEngine] ⚠️ ${symbol}: BLOQUEADO (DB)`);
    return;
  }
}
```

**Arquivo:** `SMCTradingEngine.ts` (linhas 1497-1508)

Mesma correção aplicada.

### ✅ Correção 4: Adicionar Campo na Interface do SMCTradingEngine

**Arquivo:** `SMCTradingEngine.ts` (linhas 57-58)

```typescript
/** Máximo de trades por símbolo (CORREÇÃO CRÍTICA 2026-01-20) */
maxTradesPerSymbol: number;
```

## Resumo das Alterações

| Arquivo | Tipo de Alteração | Descrição |
|---------|-------------------|----------|
| `HybridTradingEngine.ts` | Correção | Carregar `maxTradesPerSymbol` do banco |
| `HybridTradingEngine.ts` | Correção | Adicionar verificação no banco (Camada 5d) |
| `SMCTradingEngine.ts` | Correção | Adicionar campo `maxTradesPerSymbol` na interface |
| `SMCTradingEngine.ts` | Correção | Carregar `maxTradesPerSymbol` do banco |
| `SMCTradingEngine.ts` | Correção | Adicionar verificação no banco |
| `RiskManager.ts` | Novo método | `getOpenTradesCountBySymbol(symbol)` |

## Testes Recomendados

1. Configurar `maxTradesPerSymbol = 1` na interface
2. Iniciar o bot com múltiplos ativos
3. Verificar nos logs que:
   - `maxTradesPerSymbol carregado do banco: 1` aparece
   - `Posições no BANCO DE DADOS=X` aparece antes de cada trade
   - Trades são bloqueados quando já existe posição aberta
