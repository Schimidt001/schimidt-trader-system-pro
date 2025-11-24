# Feature: Verificação de Payout Mínimo

## 🎯 Objetivo

Proteger o trader de entrar em operações com payout muito baixo, onde o risco é maior que o retorno potencial. O bot agora verifica o payout antes de fazer a predição e só entra se o payout for aceitável.

## 🔧 Como Funciona

### Fluxo de Verificação

```
1. Bot identifica momento de fazer predição (ex: 8min do candle)
2. ANTES de fazer predição, verifica payout atual na Deriv
3. Se payout >= mínimo configurado → faz predição e entra
4. Se payout < mínimo → aguarda X segundos
5. Verifica payout novamente
6. Se ainda baixo → pula operação e aguarda próximo candle
7. Se agora OK → faz predição e entra
```

### Parâmetros Configuráveis

Todas as configurações são editáveis no dashboard:

| Parâmetro | Descrição | Padrão | Exemplo |
|-----------|-----------|--------|---------|
| `payoutCheckEnabled` | Habilitar/desabilitar verificação | `true` | `true` ou `false` |
| `minPayoutPercent` | Payout mínimo aceitável (%) | `80` | `80` = 80% de retorno |
| `payoutRecheckDelay` | Tempo de espera para retry (segundos) | `300` | `300` = 5 minutos |

## 📊 Exemplo Prático

### Cenário 1: Payout Aceitável

```
[PAYOUT_CHECK] Verificando payout para frxEURJPY | Stake: 0.10 | Duration: 60m
[DERIV_PAYOUT] Payout: 0.185 | Stake: 0.10 | Payout %: 85.00%
[PAYOUT_CHECK] Payout atual: 85.00% | Mínimo: 80%
✅ Payout aceitável (85.00% >= 80%). Prosseguindo com predição.
```

**Resultado:** Bot faz predição e entra na operação.

### Cenário 2: Payout Baixo (Retry Bem-Sucedido)

```
[PAYOUT_CHECK] Verificando payout para frxEURJPY | Stake: 0.10 | Duration: 60m
[DERIV_PAYOUT] Payout: 0.15 | Stake: 0.10 | Payout %: 50.00%
[PAYOUT_CHECK] Payout atual: 50.00% | Mínimo: 80%
⚠️ Payout baixo (50.00%). Aguardando 300s para verificar novamente...
[PAYOUT_CHECK] Aguardando 300s antes de verificar novamente...
[PAYOUT_CHECK] Verificando payout novamente...
[DERIV_PAYOUT] Payout: 0.19 | Stake: 0.10 | Payout %: 90.00%
[PAYOUT_CHECK] Payout após retry: 90.00% | Mínimo: 80%
✅ Payout aceitável (90.00% >= 80%). Prosseguindo com predição.
```

**Resultado:** Bot aguarda 5 minutos, verifica novamente, payout melhorou, entra na operação.

### Cenário 3: Payout Baixo (Operação Cancelada)

```
[PAYOUT_CHECK] Verificando payout para frxEURJPY | Stake: 0.10 | Duration: 60m
[DERIV_PAYOUT] Payout: 0.15 | Stake: 0.10 | Payout %: 50.00%
[PAYOUT_CHECK] Payout atual: 50.00% | Mínimo: 80%
⚠️ Payout baixo (50.00%). Aguardando 300s para verificar novamente...
[PAYOUT_CHECK] Aguardando 300s antes de verificar novamente...
[PAYOUT_CHECK] Verificando payout novamente...
[DERIV_PAYOUT] Payout: 0.16 | Stake: 0.10 | Payout %: 60.00%
[PAYOUT_CHECK] Payout após retry: 60.00% | Mínimo: 80%
⚠️ Payout muito baixo (60.00% < 80%). Operação CANCELADA. Aguardando próximo candle.
```

**Resultado:** Bot pula operação e aguarda próximo candle.

## 🔧 Implementação Técnica

### 1. Schema (drizzle/schema.ts)

```typescript
export const config = mysqlTable("config", {
  // ... outros campos
  minPayoutPercent: int("minPayoutPercent").default(80).notNull(),
  payoutRecheckDelay: int("payoutRecheckDelay").default(300).notNull(),
  payoutCheckEnabled: boolean("payoutCheckEnabled").default(true).notNull(),
});
```

### 2. Migration no Banco

```sql
ALTER TABLE config 
ADD COLUMN minPayoutPercent INT NOT NULL DEFAULT 80,
ADD COLUMN payoutRecheckDelay INT NOT NULL DEFAULT 300,
ADD COLUMN payoutCheckEnabled TINYINT(1) NOT NULL DEFAULT 1;
```

### 3. DerivService (server/deriv/derivService.ts)

Nova função `getProposalPayout()`:

```typescript
async getProposalPayout(
  symbol: string,
  contractType: "CALL" | "PUT" | "CALLE" | "PUTE" | "ONETOUCH" | "NOTOUCH",
  stake: number,
  duration: number,
  durationType: string,
  barrier?: string
): Promise<number>
```

**Retorna:** Payout em porcentagem (ex: 85.5 para 85.5%)

### 4. TradingBot (server/deriv/tradingBot.ts)

Nova função `checkPayoutBeforePrediction()`:

```typescript
private async checkPayoutBeforePrediction(): Promise<{ 
  acceptable: boolean; 
  payout: number 
}>
```

**Lógica:**
1. Verifica payout atual
2. Se >= mínimo → retorna `{ acceptable: true, payout }`
3. Se < mínimo → aguarda `payoutRecheckDelay` segundos
4. Verifica novamente
5. Retorna resultado final

## 📋 Configuração Recomendada

### Para Forex (EUR/JPY, USD/JPY, etc.)

```
minPayoutPercent: 80
payoutRecheckDelay: 300 (5 minutos)
payoutCheckEnabled: true
```

### Para Índices Sintéticos (R_100, R_50, etc.)

```
minPayoutPercent: 85
payoutRecheckDelay: 180 (3 minutos)
payoutCheckEnabled: true
```

### Para Desabilitar Verificação

```
payoutCheckEnabled: false
```

## ⚠️ Observações Importantes

### 1. Payout Varia com Volatilidade

O payout da Deriv varia de acordo com:
- **Volatilidade do mercado** - Maior volatilidade = menor payout
- **Horário** - Horários de baixa liquidez = menor payout
- **Duração** - Contratos mais longos = payout diferente
- **Distância da barreira** - Para TOUCH/NO_TOUCH

### 2. Retry Consome Tempo

Se o payout estiver baixo e o bot aguardar 5 minutos para verificar novamente, pode perder o momento ideal de entrada. Ajuste `payoutRecheckDelay` de acordo com seu timeframe:

- **M15:** 180s (3 min) - Não pode esperar muito
- **M30:** 300s (5 min) - Tempo razoável
- **M60:** 600s (10 min) - Pode esperar mais

### 3. Em Caso de Erro

Se houver erro ao verificar payout (ex: API Deriv indisponível), o bot **assume que payout é OK** e prossegue com a operação. Isso evita que bugs bloqueiem operações.

### 4. Compatibilidade

- ✅ Funciona com Bot 1 e Bot 2
- ✅ Funciona com todos os timeframes (M15, M30, M60)
- ✅ Funciona com RISE_FALL, TOUCH, NO_TOUCH
- ✅ Funciona em modo DEMO e REAL

## 🎯 Benefícios

### Proteção de Capital

Evita entrar em operações onde o risco/retorno é desfavorável. Exemplo:
- **Stake:** $1.00
- **Payout baixo:** $1.50 (50% de retorno)
- **Risco:** Perder $1.00 para ganhar apenas $0.50

Com payout mínimo de 80%:
- **Stake:** $1.00
- **Payout aceitável:** $1.80+ (80%+ de retorno)
- **Risco:** Perder $1.00 para ganhar $0.80+

### Flexibilidade

Você controla:
- Qual payout é aceitável para sua estratégia
- Quanto tempo aguardar antes de desistir
- Se quer usar essa proteção ou não

### Logs Detalhados

Todos os checks de payout são registrados nos logs para auditoria:
- `[PAYOUT_CHECK]` - Verificação inicial
- `[PAYOUT_LOW_RETRY]` - Payout baixo, aguardando retry
- `[PAYOUT_ACCEPTABLE]` - Payout OK, entrando
- `[PAYOUT_TOO_LOW]` - Payout muito baixo, cancelando

## 📊 Estatísticas Esperadas

Com `minPayoutPercent = 80`:

- **Operações aceitas:** ~70-80% (payout normal)
- **Operações com retry:** ~10-15% (payout temporariamente baixo)
- **Operações canceladas:** ~5-15% (payout persistentemente baixo)

Isso varia muito com:
- Volatilidade do mercado
- Horário de operação
- Símbolo negociado

## 🚀 Próximos Passos

1. **Fazer deploy** da aplicação
2. **Configurar** valores de payout mínimo no dashboard
3. **Monitorar logs** para ver quantas operações são filtradas
4. **Ajustar** `minPayoutPercent` de acordo com sua estratégia
5. **Ajustar** `payoutRecheckDelay` de acordo com seu timeframe

## 📝 Exemplo de Configuração no Dashboard

```json
{
  "minPayoutPercent": 80,
  "payoutRecheckDelay": 300,
  "payoutCheckEnabled": true
}
```

## ✅ Checklist de Validação

Após o deploy, verificar:

- [ ] Configurações aparecem no dashboard
- [ ] Bot 1 verifica payout antes de entrar
- [ ] Bot 2 verifica payout antes de entrar
- [ ] Logs `[PAYOUT_CHECK]` aparecem
- [ ] Operações com payout baixo são canceladas
- [ ] Retry funciona quando payout melhora
- [ ] Bot continua operando normalmente com payout OK

## 🔗 Arquivos Modificados

```
drizzle/schema.ts                 - Adicionado campos de payout
server/db.ts                      - (sem alterações)
server/deriv/derivService.ts      - Adicionado getProposalPayout()
server/deriv/tradingBot.ts        - Adicionado checkPayoutBeforePrediction()
```

## 🎉 Conclusão

Esta feature adiciona uma camada essencial de proteção de capital, evitando entradas em operações com risco/retorno desfavorável. É especialmente útil em:

- **Horários de baixa liquidez** (payout tende a cair)
- **Mercados voláteis** (payout pode variar muito)
- **Forex em horários específicos** (spreads altos = payout baixo)

Configure de acordo com sua estratégia e monitore os resultados! 🚀
