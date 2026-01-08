# Relatório de Correção: SMC Cego + Remoção de Módulos Antigos

**Data:** 08 de Janeiro de 2026  
**Commit:** `639fafe`  
**Autor:** Manus AI

---

## Resumo Executivo

Este commit resolve dois problemas críticos identificados na plataforma:

1. **Remoção de código antigo** (Prediction Engine e News Scheduler)
2. **Correção do bug "SMC Cego"** (robô não detectava Swing Points)

---

## 1. Remoção de Módulos Antigos

### Arquivo: `server/_core/index.ts`

**Problema:** O deploy anterior reintroduziu módulos de ML/AI que não fazem parte do sistema SMC Puro.

**Módulos Removidos:**
- `engineManager` (Prediction Engine) - Sistema de predição ML/AI
- `newsScheduler` (News Scheduler) - Coleta automática de notícias

**Antes:**
```typescript
import { engineManager } from "../prediction/engineManager";
// ...
await engineManager.start();
// ...
const { newsScheduler } = await import("../market-condition-v2/newsScheduler");
newsScheduler.start();
```

**Depois:**
```typescript
// REMOVIDO: engineManager (Prediction Engine) - Sistema SMC Puro não usa ML/AI
// REMOVIDO: newsScheduler - Sistema SMC Puro não usa análise de notícias
console.log("🎯 Sistema SMC Puro inicializado (sem ML/AI)");
console.log("📊 Modo Price Action puro ativo");
```

---

## 2. Correção do Bug "SMC Cego"

### Arquivo: `server/adapters/ctrader/SMCStrategy.ts`

**Problema Identificado:**
- A configuração no banco de dados tinha `structureTimeframe = 'M15'`
- O código da estratégia SMC espera dados H1 para calcular a estrutura macro
- Resultado: Tabela `smcSwingPoints` vazia, robô não executava trades

**Solução Aplicada:**

```typescript
private identifySwingPoints(state: SymbolSwarmState): void {
  // ========== FIX CRÍTICO: FORÇAR H1 PARA DETECÇÃO DE SWINGS ==========
  // PROBLEMA: A config do banco pode estar como 'M15', mas a estrutura macro
  // DEVE ser calculada em H1 para maior precisão institucional.
  // SOLUÇÃO: Ignorar config.structureTimeframe e forçar H1.
  
  // FORÇAR H1 - Independente da configuração do banco de dados
  const candles: TrendbarData[] = this.h1Data;
  const tfLabel: string = 'H1';
  
  // Log de diagnóstico: avisar se a config estava diferente
  if (this.config.structureTimeframe !== 'H1') {
    console.warn(`[SMC-FIX] ${this.currentSymbol}: Config tinha structureTimeframe='${this.config.structureTimeframe}', mas FORÇANDO H1 para Swing Points`);
  }
  
  // ========== VALIDAÇÃO CRÍTICA: Garantir dados H1 suficientes ==========
  // FIX: Validação mínima de 50 candles H1 antes de processar
  if (candles.length < 50) {
    console.warn(`[SMC-FIX] ${this.currentSymbol}: H1 candles insuficientes (${candles.length} < 50). Aguardando mais dados...`);
    return;
  }
  // ...
}
```

**Log Adicionado (conforme solicitado):**
```typescript
console.log(`Swing Points encontrados: ${totalSwingPoints}`);
```

---

## 3. Verificação Pós-Deploy

### Logs Esperados (Sistema Funcionando):

```
🎯 Sistema SMC Puro inicializado (sem ML/AI)
📊 Modo Price Action puro ativo
🚀 Sistema SMC Puro pronto para operar!
[DEBUG-SWING] EURUSD | TF: H1 (FORÇADO) | Candles: 250 | leftBars: 2 | rightBars: 2 | lookback: 50
Swing Points encontrados: 8
[SMC-SWINGS] EURUSD: Highs=4 | Lows=4 | Total=8
```

### Logs de Erro (Se o problema persistir):

```
[SMC-FIX] EURUSD: Config tinha structureTimeframe='M15', mas FORÇANDO H1 para Swing Points
[SMC-FIX] EURUSD: H1 candles insuficientes (30 < 50). Aguardando mais dados...
```

---

## 4. Commits Preservados

Os commits críticos mencionados continuam no histórico:
- `e89ce83` - Correção de Spread XAUUSD
- `285631b` - Sanity Check de dados (ticks inválidos)

---

## 5. Próximos Passos

1. **Monitorar logs no Railway** após o deploy automático
2. **Verificar tabela `smcSwingPoints`** - deve começar a popular
3. **Confirmar execução de trades** - logs devem mostrar sinais diferentes de `NONE`

---

## Arquivos Modificados

| Arquivo | Alterações |
|---------|------------|
| `server/_core/index.ts` | Removido PredictionEngine e NewsScheduler |
| `server/adapters/ctrader/SMCStrategy.ts` | Forçado H1, validação de 50 candles, log de contagem |

---

**Status:** ✅ Deploy enviado para GitHub (Railway fará deploy automático)
