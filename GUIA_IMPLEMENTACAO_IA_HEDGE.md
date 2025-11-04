# Guia de Implementação - IA Hedge Inteligente

**Autor:** Manus AI  
**Data:** 04 de novembro de 2025  
**Versão:** 2.0 - Estratégias Matemáticas para Ativos Sintéticos

---

## Visão Geral

Este documento descreve a **IA Hedge Inteligente 2.0**, uma solução completa e isolada que implementa três estratégias matemáticas avançadas para gerenciamento de risco em operações com ativos sintéticos da DERIV. A IA está pronta para ser integrada na plataforma principal quando você decidir ativá-la.

### Características Principais

A IA Hedge 2.0 foi projetada especificamente para **ativos sintéticos**, que são baseados em algoritmos matemáticos e não em mercados reais. Por isso, todas as estratégias utilizam **cálculos estatísticos precisos** ao invés de análise de sentimento de mercado.

**Diferenciais:**
- ✅ **Totalmente configurável** - Todos os parâmetros podem ser ajustados via interface
- ✅ **Sem valores fixos no código** - Tudo é armazenado no banco de dados
- ✅ **Validação robusta** - Schema Zod garante que configurações estejam sempre corretas
- ✅ **Isolada e pronta** - Não quebra nenhuma funcionalidade existente
- ✅ **Três estratégias independentes** - Cada uma atua em momentos diferentes do candle

---

## As Três Estratégias

### Estratégia 1: Detecção de Reversão

**Objetivo:** Proteger contra reversões completas do movimento previsto.

**Funcionamento:** Após a entrada da posição inicial (aos 8 minutos), a IA monitora se o preço está se movendo na direção oposta à predição. Se o preço atingir um determinado percentual no lado oposto, a IA identifica uma reversão em andamento e abre uma posição contrária para hedge.

**Parâmetros Configuráveis:**

| Parâmetro | Descrição | Padrão | Range |
|:---|:---|:---:|:---:|
| `reversalDetectionMinute` | Minuto para começar a detectar reversão | 9.5 | 8.0 - 14.0 |
| `reversalThreshold` | % no lado oposto para considerar reversão | 0.60 (60%) | 0.30 - 0.95 |
| `reversalStakeMultiplier` | Multiplicador do stake original | 1.0 (100%) | 0.1 - 2.0 |

**Cálculo Matemático:**

```typescript
// Calcular extensão do preço no lado oposto
const rangeFromEntry = currentPrice - entryPrice;
const oppositeProgress = direction === 'up' 
  ? -rangeFromEntry / (entryPrice - candleOpen)  // Para CALL, quanto desceu
  : rangeFromEntry / (candleOpen - entryPrice);  // Para PUT, quanto subiu

// Se passou do threshold, reversão detectada
if (oppositeProgress > reversalThreshold) {
  // Abrir posição contrária
  openPosition(oppositeDirection, stake * reversalStakeMultiplier);
}
```

---

### Estratégia 2: Reforço em Pullback

**Objetivo:** Aproveitar preços melhores quando a predição está correta mas atrasada.

**Funcionamento:** Entre os minutos configurados, a IA verifica se o movimento está na direção correta mas com progresso abaixo do esperado. Isso indica um "pullback" (recuo temporário). A IA então reforça a posição original com stake adicional, aproveitando o preço melhor.

**Parâmetros Configuráveis:**

| Parâmetro | Descrição | Padrão | Range |
|:---|:---|:---:|:---:|
| `pullbackDetectionStart` | Início da janela de detecção (min) | 9.5 | 8.0 - 13.0 |
| `pullbackDetectionEnd` | Fim da janela de detecção (min) | 12.0 | 10.0 - 14.0 |
| `pullbackMinProgress` | Progresso mínimo para considerar pullback | 0.15 (15%) | 0.05 - 0.50 |
| `pullbackMaxProgress` | Progresso máximo para considerar pullback | 0.40 (40%) | 0.20 - 0.80 |
| `pullbackStakeMultiplier` | Multiplicador do stake original | 0.5 (50%) | 0.1 - 1.5 |

**Cálculo Matemático:**

```typescript
// Calcular progresso em relação à meta
const progressRatio = (currentPrice - entryPrice) / (predictedClose - entryPrice);

// Se está na direção certa mas atrasado
if (progressRatio >= pullbackMinProgress && progressRatio <= pullbackMaxProgress) {
  // Reforçar posição na mesma direção
  openPosition(sameDirection, stake * pullbackStakeMultiplier);
}
```

---

### Estratégia 3: Reversão de Ponta

**Objetivo:** Capturar reversões de final de candle quando o movimento está sobreestendido.

**Funcionamento:** Próximo ao final do candle (13.5 minutos por padrão), a IA verifica se o movimento atingiu uma extensão muito grande em relação ao range do candle. Ativos sintéticos tendem a reverter quando atingem limites estatísticos. A IA abre uma posição contrária para aproveitar essa reversão final.

**Parâmetros Configuráveis:**

| Parâmetro | Descrição | Padrão | Range |
|:---|:---|:---:|:---:|
| `edgeReversalMinute` | Minuto para detectar reversão de ponta | 13.5 | 12.0 - 14.5 |
| `edgeExtensionThreshold` | % de extensão para considerar sobrecomprado | 0.80 (80%) | 0.60 - 0.95 |
| `edgeStakeMultiplier` | Multiplicador do stake original | 0.75 (75%) | 0.1 - 1.5 |

**Cálculo Matemático:**

```typescript
// Calcular extensão do movimento
const candleRange = candleHigh - candleLow;
const priceExtension = direction === 'up'
  ? (currentPrice - candleOpen) / candleRange
  : (candleOpen - currentPrice) / candleRange;

// Se está muito estendido
if (priceExtension > edgeExtensionThreshold) {
  // Abrir posição contrária para pegar reversão
  openPosition(oppositeDirection, stake * edgeStakeMultiplier);
}
```

---

## Arquitetura da Solução

### Estrutura de Arquivos

```
server/
├── ai/
│   ├── hedgeStrategy.ts          # Lógica principal das 3 estratégias
│   └── hedgeConfigSchema.ts      # Validação Zod e valores padrão
drizzle/
├── schema.ts                     # Schema já tem campo hedgeConfig
└── migrations/
    └── add_ia_hedge_config.sql   # Migração (opcional, config já existe)
```

### Fluxo de Dados

```
[Banco de Dados]
     ↓ (lê hedgeConfig JSON)
[Validação Zod]
     ↓ (garante valores corretos)
[hedgeStrategy.ts]
     ↓ (executa análise)
[Decisão: HOLD | REINFORCE | HEDGE | REVERSAL_EDGE]
     ↓
[TradingBot.ts]
     ↓ (abre segunda posição se necessário)
[DERIV API]
```

---

## Como Implementar

### Passo 1: Merge do Branch

```bash
# No repositório principal
git checkout master  # ou sua branch principal
git merge IA-HEDGE-PRONTA
```

### Passo 2: Atualizar o TradingBot

No arquivo `server/deriv/tradingBot.ts`, localize onde a IA Hedge é chamada e certifique-se de que está passando a configuração:

```typescript
import { analyzePositionForHedge } from '../ai/hedgeStrategy';
import { validateHedgeConfig } from '../ai/hedgeConfigSchema';

// Dentro do loop principal do bot
const hedgeConfigRaw = await db.query.config.findFirst({
  where: eq(config.userId, userId),
  columns: { hedgeConfig: true, hedgeEnabled: true }
});

if (hedgeConfigRaw?.hedgeEnabled) {
  // Validar configuração
  const hedgeConfig = validateHedgeConfig(
    hedgeConfigRaw.hedgeConfig ? JSON.parse(hedgeConfigRaw.hedgeConfig) : {}
  );
  
  // Chamar IA Hedge
  const decision = analyzePositionForHedge({
    entryPrice,
    currentPrice,
    predictedClose,
    candleOpen,
    direction,
    elapsedMinutes,
    originalStake
  }, hedgeConfig);
  
  // Processar decisão
  if (decision.shouldOpenSecondPosition) {
    await openPosition(
      decision.secondPositionType,
      decision.secondPositionStake
    );
  }
}
```

### Passo 3: Criar Interface de Configuração (Opcional)

Se quiser permitir que o usuário configure a IA pela interface, crie um componente similar ao que fizemos no testador:

```tsx
// client/src/components/HedgeConfigModal.tsx
import { useState } from 'react';
import { trpc } from '@/lib/trpc';

export function HedgeConfigModal() {
  const { data: config } = trpc.config.getHedgeConfig.useQuery();
  const updateConfig = trpc.config.updateHedgeConfig.useMutation();
  
  // ... implementar formulário com os campos
}
```

### Passo 4: Testar

1. **Ativar a IA** nas configurações do bot
2. **Monitorar logs** para ver as decisões sendo tomadas
3. **Ajustar parâmetros** conforme necessário
4. **Validar resultados** em conta DEMO primeiro

---

## Configuração Padrão

A configuração padrão foi calibrada para um equilíbrio entre proteção e agressividade:

```json
{
  "enabled": true,
  "reversalDetectionMinute": 9.5,
  "reversalThreshold": 0.60,
  "reversalStakeMultiplier": 1.0,
  "pullbackDetectionStart": 9.5,
  "pullbackDetectionEnd": 12.0,
  "pullbackMinProgress": 0.15,
  "pullbackMaxProgress": 0.40,
  "pullbackStakeMultiplier": 0.5,
  "edgeReversalMinute": 13.5,
  "edgeExtensionThreshold": 0.80,
  "edgeStakeMultiplier": 0.75,
  "analysisStartMinute": 9.5,
  "analysisEndMinute": 14.5
}
```

---

## Segurança e Validação

### Validação Zod

Todos os parâmetros são validados antes de serem usados. Se a configuração no banco estiver inválida ou corrompida, a IA automaticamente usa os valores padrão seguros.

### Limites de Segurança

- **Multiplicadores de stake** limitados a 2x no máximo
- **Thresholds** com ranges seguros (30% - 95%)
- **Janelas de tempo** validadas para não se sobreporem incorretamente
- **Progressos** validados para garantir lógica matemática (min < max)

---

## Próximos Passos

1. **Testar em conta DEMO** por pelo menos 1 semana
2. **Ajustar parâmetros** baseado nos resultados
3. **Monitorar métricas** (win rate, drawdown, etc.)
4. **Ativar em conta REAL** quando estiver confiante

---

## Suporte

Se tiver dúvidas ou problemas durante a implementação, revise:

1. Este guia de implementação
2. Os comentários no código de `hedgeStrategy.ts`
3. A documentação de validação em `hedgeConfigSchema.ts`
4. Os logs do bot para entender as decisões da IA

---

**Última atualização:** 04/11/2025  
**Versão da IA:** 2.0 - Estratégias Matemáticas
