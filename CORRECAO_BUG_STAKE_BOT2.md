# Correção do Bug de STAKE do Bot 2

## Problema Identificado

O Bot 2 não estava respeitando o valor de STAKE configurado pelo usuário. Mesmo após editar e salvar o valor nas configurações, o bot continuava operando com um valor fixo de 10 (provavelmente o valor do Bot 1).

## Causa Raiz

O problema estava localizado no arquivo `server/deriv/tradingBot.ts`, especificamente na função `reloadConfig()` (linha 429).

### Código com Bug

```typescript
const config = await getConfigByUserId(this.userId);
```

A função `getConfigByUserId()` aceita dois parâmetros:
- `userId: number` (obrigatório)
- `botId: number = 1` (opcional, com valor padrão 1)

Quando o `botId` não é passado, a função sempre retorna a configuração do Bot 1 (padrão). Isso fazia com que o Bot 2, ao recarregar suas configurações, sempre carregasse os valores do Bot 1.

### Impacto

- **Bot 1**: Funcionava corretamente, pois sempre carregava suas próprias configurações (botId = 1)
- **Bot 2**: Sempre carregava as configurações do Bot 1, ignorando suas próprias configurações salvas no banco de dados

## Solução Implementada

### Código Corrigido

```typescript
const config = await getConfigByUserId(this.userId, this.botId);
```

Agora a função `reloadConfig()` passa corretamente o `botId` do bot atual, garantindo que cada bot carregue suas próprias configurações.

## Validação

### Verificação de Consistência

Foi verificado que a função `start()` (linha 135) já estava implementada corretamente:

```typescript
const config = await getConfigByUserId(this.userId, this.botId);
```

Isso explica por que o problema só aparecia após editar as configurações (que aciona o `reloadConfig()`), mas não ao iniciar o bot pela primeira vez.

### Arquivos Modificados

- `server/deriv/tradingBot.ts` (1 linha alterada)

### Diff da Alteração

```diff
-    const config = await getConfigByUserId(this.userId);
+    const config = await getConfigByUserId(this.userId, this.botId);
```

## Resultado Esperado

Após esta correção:

1. ✅ O Bot 2 agora carrega suas próprias configurações corretamente
2. ✅ Alterações no STAKE do Bot 2 serão respeitadas imediatamente
3. ✅ Bot 1 continua funcionando normalmente (sem alterações)
4. ✅ Todas as outras configurações (stopDaily, takeDaily, etc.) também serão respeitadas corretamente para cada bot

## Próximos Passos

Para aplicar a correção em produção:

1. Fazer commit da alteração:
   ```bash
   git add server/deriv/tradingBot.ts
   git commit -m "fix: Bot 2 não respeitava configuração de STAKE ao recarregar config"
   ```

2. Fazer push para o repositório:
   ```bash
   git push origin main
   ```

3. Fazer deploy da aplicação (Railway, Heroku, ou sua plataforma de deploy)

4. Reiniciar o Bot 2 para aplicar a correção

## Observações

- Esta correção é **cirúrgica** e afeta apenas 1 linha de código
- Não há risco de quebrar funcionalidades existentes
- A lógica de negócio permanece intacta
- Apenas corrige o carregamento de configurações específicas de cada bot
