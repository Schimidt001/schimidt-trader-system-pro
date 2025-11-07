# Análise Detalhada do Bug do Filtro de Horário

**Data:** 06 de Novembro de 2025  
**Analista:** Manus AI  
**Status:** 🔴 BUG CRÍTICO IDENTIFICADO

---

## 🔍 PROBLEMA REPORTADO

O usuário reportou que o filtro de horário não está funcionando corretamente:

1. **Cenário 1:** Configurou horário PERMITIDO → Bot ficou em STAND BY
2. **Cenário 2:** Configurou horário NÃO PERMITIDO → Bot continuou trabalhando

---

## 🎯 CAUSA RAIZ IDENTIFICADA

### Problema Principal: Array Vazio no Banco de Dados

Ao verificar o banco de dados, encontrei:

```sql
SELECT hourlyFilterEnabled, hourlyFilterCustomHours FROM config;
-- Resultado:
-- hourlyFilterEnabled: 1 (TRUE)
-- hourlyFilterCustomHours: "[]"  ← ARRAY VAZIO!
```

### O que isso significa?

Quando `hourlyFilterCustomHours` está vazio (`[]`), a lógica do filtro funciona assim:

```typescript
// Em hourlyFilterLogic.ts linha 164
public isAllowedHour(date?: Date): boolean {
  if (!this.config.enabled) {
    return true; // Filtro desabilitado
  }

  const now = date || new Date();
  const currentHour = now.getUTCHours();

  return this.config.customHours.includes(currentHour);
  // ↑ Se customHours = [], NUNCA retorna true!
  // Resultado: NENHUM horário é permitido
}
```

**Conclusão:** Com array vazio, o bot SEMPRE fica em STAND BY, independente do horário atual!

---

## 🧪 ANÁLISE DOS COMMITS RECENTES

### Commit 6d93e28 (Mais Recente)
**Título:** "fix: Adiciona verificação contínua do filtro de horário a cada tick"

**O que foi feito:**
- Adicionou verificação do filtro NO INÍCIO do `handleTick()`
- Verifica a cada tick se horário é permitido
- Bloqueia imediatamente se não permitido
- Reativa automaticamente quando permitido

**Análise:**
✅ **Lógica de verificação está CORRETA**  
❌ **MAS não resolve o problema do array vazio**

A verificação funciona perfeitamente, mas se `customHours = []`, a função `isAllowedHour()` SEMPRE retorna `false`.

### Commit f55f088
**Título:** "debug: Adiciona logs para investigar problema de salvamento do filtro"

**O que foi feito:**
- Adicionou logs de debug no salvamento

**Análise:**
✅ Logs confirmam que o problema é no salvamento dos dados

### Commit e799cd4
**Título:** "fix: Adiciona campos do filtro de horário ao schema de validação"

**O que foi feito:**
- Adicionou campos do filtro ao schema Zod do tRPC

**Análise:**
✅ Schema está correto e aceita os campos
❌ **MAS não valida se array está vazio**

---

## 🐛 BUGS IDENTIFICADOS

### Bug #1: Salvamento de Array Vazio
**Localização:** `client/src/pages/Settings.tsx`

**Problema:**
Quando o usuário não seleciona nenhum horário na interface, o array `hourlyFilterCustomHours` fica vazio e é salvo assim no banco.

**Código Atual (linha 375):**
```typescript
hourlyFilterCustomHours: JSON.stringify(hourlyFilterCustomHours),
// Se hourlyFilterCustomHours = [], salva "[]"
```

**Comportamento Esperado:**
- Se array está vazio E filtro está habilitado → usar preset COMBINED
- Ou impedir salvamento se array vazio

### Bug #2: Falta de Validação no Backend
**Localização:** `server/routers.ts`

**Problema:**
O schema Zod aceita qualquer string em `hourlyFilterCustomHours`, incluindo array vazio.

**Código Atual (linha 98):**
```typescript
hourlyFilterCustomHours: z.string().optional(),
```

**Comportamento Esperado:**
- Validar se o JSON parseado tem pelo menos 1 horário
- Ou aplicar preset padrão se vazio

### Bug #3: Inicialização do HourlyFilter no Bot
**Localização:** `server/deriv/tradingBot.ts` (linhas 196-204)

**Problema:**
O bot aceita array vazio sem validação.

**Código Atual:**
```typescript
const hourlyFilterCustomHours = config.hourlyFilterCustomHours 
  ? JSON.parse(config.hourlyFilterCustomHours) 
  : [];

this.hourlyFilter = new HourlyFilter({
  enabled: hourlyFilterEnabled,
  mode: hourlyFilterMode,
  customHours: hourlyFilterCustomHours.length > 0 
    ? hourlyFilterCustomHours 
    : HourlyFilter.getHoursForMode(hourlyFilterMode),
  // ...
});
```

**Análise:**
✅ **Tem fallback!** Se array vazio, usa `getHoursForMode()`  
❌ **MAS o modo é 'CUSTOM'** e `getHoursForMode('CUSTOM')` retorna array vazio também!

**Código de getHoursForMode (filtro-horario/hourlyFilterLogic.ts linha 135-148):**
```typescript
public static getHoursForMode(
  mode: HourlyFilterMode,
  customHours?: number[]
): number[] {
  if (mode === 'CUSTOM') {
    if (!customHours || customHours.length === 0) {
      console.warn('Modo CUSTOM sem horários personalizados, usando COMBINED');
      return HOURLY_FILTER_PRESETS.COMBINED;
    }
    return customHours;
  }

  return HOURLY_FILTER_PRESETS[mode];
}
```

**Análise:**
✅ **Tem fallback para COMBINED!**  
❌ **MAS não é chamado corretamente no bot**

O problema está na linha 199 do tradingBot.ts:
```typescript
customHours: hourlyFilterCustomHours.length > 0 
  ? hourlyFilterCustomHours 
  : HourlyFilter.getHoursForMode(hourlyFilterMode),
```

Se `hourlyFilterMode = 'CUSTOM'` e `hourlyFilterCustomHours = []`, chama:
```typescript
HourlyFilter.getHoursForMode('CUSTOM')
```

Mas o método `getHoursForMode` espera receber `customHours` como segundo parâmetro!

---

## 🎯 SOLUÇÃO PROPOSTA

### Correção #1: Validação no Frontend (Settings.tsx)

**Antes de salvar, validar:**
```typescript
const handleSave = () => {
  // ... validações existentes
  
  // NOVA VALIDAÇÃO
  if (hourlyFilterEnabled && hourlyFilterCustomHours.length === 0) {
    toast.error("Selecione pelo menos 1 horário ou desative o filtro");
    return;
  }
  
  // ... resto do código
};
```

### Correção #2: Validação no Backend (routers.ts)

**Adicionar validação customizada:**
```typescript
hourlyFilterCustomHours: z.string().optional().refine(
  (val) => {
    if (!val) return true; // Opcional, pode ser undefined
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed); // Deve ser array
    } catch {
      return false;
    }
  },
  { message: "hourlyFilterCustomHours deve ser um array JSON válido" }
),
```

### Correção #3: Fallback Robusto no Bot (tradingBot.ts)

**Corrigir a inicialização:**
```typescript
// Linha 188-204 (aproximadamente)
const hourlyFilterEnabled = config.hourlyFilterEnabled ?? false;
if (hourlyFilterEnabled) {
  const hourlyFilterMode = config.hourlyFilterMode ?? 'COMBINED';
  let hourlyFilterCustomHours: number[] = [];
  
  // Parsear customHours
  if (config.hourlyFilterCustomHours) {
    try {
      hourlyFilterCustomHours = JSON.parse(config.hourlyFilterCustomHours);
    } catch (e) {
      console.warn('[HOURLY_FILTER] Erro ao parsear customHours, usando preset');
    }
  }
  
  // FALLBACK ROBUSTO: Se array vazio, usar preset do modo
  if (hourlyFilterCustomHours.length === 0) {
    if (hourlyFilterMode === 'CUSTOM') {
      console.warn('[HOURLY_FILTER] Modo CUSTOM sem horários, usando COMBINED');
      hourlyFilterCustomHours = HourlyFilter.getHoursForMode('COMBINED');
    } else {
      hourlyFilterCustomHours = HourlyFilter.getHoursForMode(hourlyFilterMode);
    }
  }
  
  const hourlyFilterGoldHours = config.hourlyFilterGoldHours 
    ? JSON.parse(config.hourlyFilterGoldHours) 
    : [];
  const hourlyFilterGoldMultiplier = config.hourlyFilterGoldMultiplier ?? 200;
  
  this.hourlyFilter = new HourlyFilter({
    enabled: hourlyFilterEnabled,
    mode: hourlyFilterMode,
    customHours: hourlyFilterCustomHours, // Agora SEMPRE tem valores
    goldModeHours: hourlyFilterGoldHours,
    goldModeStakeMultiplier: hourlyFilterGoldMultiplier,
  });
  
  // ... resto do código
}
```

### Correção #4: Inicialização Padrão no Frontend (Settings.tsx)

**Ao habilitar o filtro pela primeira vez, inicializar com preset:**
```typescript
const handleHourlyFilterToggle = (enabled: boolean) => {
  setHourlyFilterEnabled(enabled);
  
  // Se habilitando e array vazio, usar preset COMBINED
  if (enabled && hourlyFilterCustomHours.length === 0) {
    const combinedHours = [5, 6, 12, 16, 17, 18, 20, 21, 22, 23];
    setHourlyFilterCustomHours(combinedHours);
    toast.info("Horários padrão COMBINED aplicados. Ajuste conforme necessário.");
  }
};
```

---

## 🧪 TESTES NECESSÁRIOS APÓS CORREÇÃO

### Teste 1: Array Vazio no Frontend
1. Habilitar filtro sem selecionar horários
2. Tentar salvar
3. **Esperado:** Erro de validação

### Teste 2: Modo CUSTOM sem Horários
1. Salvar modo CUSTOM com array vazio (forçar via API)
2. Iniciar bot
3. **Esperado:** Bot usa preset COMBINED automaticamente

### Teste 3: Horário Permitido
1. Configurar horário atual como permitido
2. Iniciar bot
3. **Esperado:** Bot opera normalmente

### Teste 4: Horário Não Permitido
1. Configurar horário atual como NÃO permitido
2. Iniciar bot
3. **Esperado:** Bot entra em STAND BY imediatamente

### Teste 5: Transição de Horário
1. Bot operando em horário permitido
2. Aguardar mudança para horário não permitido
3. **Esperado:** Bot para em <1 segundo
4. Aguardar mudança para horário permitido
5. **Esperado:** Bot reativa em <1 segundo

---

## 📊 RESUMO EXECUTIVO

### Problema
O filtro de horário salva array vazio no banco de dados, fazendo com que NENHUM horário seja considerado permitido.

### Causa
Falta de validação em 3 camadas:
1. Frontend não impede salvamento de array vazio
2. Backend não valida conteúdo do array
3. Bot não aplica fallback corretamente para modo CUSTOM

### Solução
Adicionar validações e fallbacks robustos nas 3 camadas para garantir que sempre haja horários configurados quando o filtro estiver habilitado.

### Impacto
🔴 **CRÍTICO** - Bot não funciona com filtro habilitado

### Prioridade
🔥 **URGENTE** - Implementar correções imediatamente

---

## 📝 PRÓXIMOS PASSOS

1. ✅ Análise completa concluída
2. ⏳ Implementar correções nas 3 camadas
3. ⏳ Testar todos os cenários
4. ⏳ Commitar e fazer push
5. ⏳ Validar em produção

---

**Análise realizada por:** Manus AI  
**Revisão:** Pendente  
**Aprovação:** Pendente
