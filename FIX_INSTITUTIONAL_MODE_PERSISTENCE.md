# Correção: Problema de Persistência do Modo Institucional

## Diagnóstico

Após análise minuciosa do código, identifiquei **dois problemas** que causam a não persistência do "Modo Institucional (Opt-in)":

### Problema 1: Falta de Invalidação de Cache (PRINCIPAL)

**Arquivo:** `client/src/pages/SettingsMultiBroker.tsx`
**Linha:** 288-296

Quando o usuário salva as configurações, a mutation `saveICMarketsConfig` não invalida o cache do React Query. Isso significa que:

1. Usuário ativa o Modo Institucional
2. Clica em "Salvar"
3. Dados são salvos no banco de dados corretamente
4. Ao recarregar a página, React Query usa dados em cache (antigos)
5. Toggle aparece desativado

**Código atual:**
```typescript
const saveICMarketsConfig = trpc.icmarkets.saveConfig.useMutation({
  onSuccess: () => {
    toast.success("Configurações IC Markets salvas com sucesso");
    setIsSaving(false);
  },
  // ... sem invalidação de cache
});
```

### Problema 2: Operador de Coalescência Nula Mal Posicionado (SECUNDÁRIO)

**Arquivo:** `server/icmarkets/icmarketsRouter.ts`
**Linha:** 285

O operador `??` está após o `Boolean()`, o que não faz diferença funcional mas é semanticamente incorreto:

```typescript
// Atual (funciona, mas semanticamente incorreto)
institutionalModeEnabled: Boolean(smcConfig?.institutionalModeEnabled) ?? false,

// Correto (mais claro e seguro)
institutionalModeEnabled: Boolean(smcConfig?.institutionalModeEnabled ?? false),
```

---

## Correção Implementada

### Correção 1: Adicionar Invalidação de Cache

**Arquivo:** `client/src/pages/SettingsMultiBroker.tsx`

1. Adicionar `const utils = trpc.useUtils();` após os hooks existentes
2. Modificar a mutation para invalidar o cache após salvar

### Correção 2: Ajustar Operador de Coalescência

**Arquivo:** `server/icmarkets/icmarketsRouter.ts`

Mover o `?? false` para dentro do `Boolean()` para maior clareza.

---

## Arquivos Modificados

1. `client/src/pages/SettingsMultiBroker.tsx` - Invalidação de cache
2. `server/icmarkets/icmarketsRouter.ts` - Ajuste semântico do operador

---

## Testes Recomendados

1. Ativar Modo Institucional → Salvar → Recarregar página → Verificar se permanece ativo
2. Desativar Modo Institucional → Salvar → Recarregar página → Verificar se permanece desativado
3. Verificar logs do backend para confirmar que o valor está sendo salvo corretamente

---

## Resumo das Alterações

### Arquivo: `client/src/pages/SettingsMultiBroker.tsx`

**Linha 54** (nova):
```typescript
const utils = trpc.useUtils();
```

**Linhas 291-298** (modificadas):
```typescript
const saveICMarketsConfig = trpc.icmarkets.saveConfig.useMutation({
  onSuccess: async () => {
    // CORREÇÃO: Invalidar cache para garantir que os dados sejam recarregados do servidor
    // Isso resolve o problema de persistência do Modo Institucional
    await utils.icmarkets.getConfig.invalidate();
    toast.success("Configurações IC Markets salvas com sucesso");
    setIsSaving(false);
  },
  // ...
});
```

### Arquivo: `server/icmarkets/icmarketsRouter.ts`

**Linha 285** (modificada):
```typescript
// Antes
institutionalModeEnabled: Boolean(smcConfig?.institutionalModeEnabled) ?? false,

// Depois
institutionalModeEnabled: Boolean(smcConfig?.institutionalModeEnabled ?? false),
```

---

## Impacto da Correção

- **Risco:** Mínimo - apenas adiciona invalidação de cache
- **Funcionalidades afetadas:** Nenhuma funcionalidade existente é alterada
- **Compatibilidade:** 100% compatível com versões anteriores
- **Performance:** Impacto mínimo - apenas uma chamada adicional ao servidor após salvar
