# Guia Rápido de Validação das Correções

## 📋 Checklist de Validação

Após fazer o deploy das correções, siga este checklist para validar que tudo está funcionando corretamente:

### ✅ 1. Validar Métricas Mensais

**O que fazer:**
1. Abrir o dashboard da plataforma
2. Verificar a seção de métricas mensais
3. Realizar algumas operações com o bot
4. Verificar se os valores mensais estão sendo atualizados

**O que esperar:**
- Métricas mensais devem aumentar junto com as diárias
- Ao mudar de dia, métricas mensais devem persistir
- Formato da data mensal: `2025-11` (ano-mês)

**Como conferir no banco de dados:**
```sql
SELECT * FROM metrics 
WHERE userId = <seu_user_id> 
  AND period = 'monthly' 
ORDER BY date DESC 
LIMIT 5;
```

---

### ✅ 2. Validar Contagem de Trades

**O que fazer:**
1. Anotar quantos trades aparecem no dashboard antes de iniciar
2. Deixar o bot realizar 5 operações
3. Conferir quantos trades foram contabilizados

**O que esperar:**
- Dashboard deve mostrar exatamente 5 trades a mais
- Mesmo que o bot tenha usado hedge (múltiplas posições), cada operação completa = 1 trade
- Número de trades no dashboard deve bater com número de operações na Deriv

**Exemplo:**
```
Antes: 10 trades
Bot realiza 5 operações (algumas com hedge)
Depois: 15 trades ✅
```

---

### ✅ 3. Validar Sincronização com Deriv

**O que fazer:**
1. Abrir a plataforma Deriv em outra aba
2. Ir em "Reports" > "Statement"
3. Anotar os últimos 5 contratos executados
4. Comparar com o histórico no dashboard da sua plataforma

**O que esperar:**
- Cada contrato da Deriv deve aparecer no histórico
- Valores de stake devem ser idênticos
- PnL deve ser idêntico (ou muito próximo, considerando arredondamentos)

**Atenção:**
- Se houver hedge, você verá 2 contratos na Deriv mas 1 operação no dashboard
- Isso é **correto**: o dashboard agrupa posições relacionadas

---

### ✅ 4. Validar Logs de Auditoria

**O que fazer:**
1. Acessar os logs do servidor (Railway, Heroku, etc.)
2. Buscar pelos seguintes marcadores:
   - `[POSITION_SAVED]`
   - `[HEDGE_SAVED]`
   - `[POSITION_UPDATED]`
   - `[METRICS_UPDATED]`

**O que esperar:**

#### Ao abrir posição:
```
[POSITION_SAVED] Posição salva no banco | ID: 123 | Contract: CR_123456 | Stake: $1.00 | Bot: 1
```

#### Ao abrir hedge (se aplicável):
```
[HEDGE_SAVED] Hedge salvo no banco | ID: 124 | Contract: CR_123457 | Stake: $0.50 | Parent: 123 | Bot: 1
```

#### Ao fechar posição:
```
[POSITION_UPDATED] Posição atualizada no banco | ID: 123 | Contract: CR_123456 | PnL: $0.85 | Status: won | Bot: 1
[POSITION_UPDATED] Posição atualizada no banco | ID: 124 | Contract: CR_123457 | PnL: -$0.50 | Status: lost | Bot: 1
```

#### Ao atualizar métricas:
```
[METRICS_UPDATED] Métricas atualizadas | PnL Operação: $0.35 | PnL Diário Total: $5.20 | Trades Contabilizados: 1 | Posições Fechadas: 2 | Bot: 1
```

**Análise:**
- `PnL Operação`: Soma do PnL de todas as posições relacionadas ($0.85 - $0.50 = $0.35)
- `Trades Contabilizados`: Sempre 1 (uma operação completa)
- `Posições Fechadas`: 2 (posição original + hedge)

---

### ✅ 5. Validar PnL Diário e Mensal

**O que fazer:**
1. Anotar PnL diário e mensal no início do dia
2. Deixar o bot operar durante o dia
3. Ao final do dia, somar manualmente os PnLs dos logs
4. Comparar com o PnL mostrado no dashboard

**O que esperar:**
- PnL diário = soma de todos os `PnL Operação` do dia
- PnL mensal = soma de todos os `PnL Operação` do mês
- Valores devem bater exatamente

**Exemplo de cálculo manual:**
```
Operação 1: +$1.50
Operação 2: -$0.80
Operação 3: +$2.30
Operação 4: -$1.20
Operação 5: +$0.90

PnL Diário = $1.50 - $0.80 + $2.30 - $1.20 + $0.90 = $2.70 ✅
```

---

## 🚨 Problemas Comuns e Soluções

### Problema: Métricas mensais não aparecem
**Solução:**
1. Verificar se o bot está rodando na versão atualizada
2. Reiniciar o bot
3. Verificar logs para confirmar que `[METRICS_UPDATED]` está sendo chamado

### Problema: Contagem de trades ainda incorreta
**Solução:**
1. Verificar nos logs se `Trades Contabilizados: 1` aparece
2. Se aparecer outro número, reportar o problema
3. Limpar cache do navegador e recarregar dashboard

### Problema: Valores diferentes da Deriv
**Solução:**
1. Verificar nos logs o `Contract ID` da operação
2. Buscar o mesmo `Contract ID` na Deriv
3. Comparar valores exatos (buy_price, sell_price, profit)
4. Se houver discrepância, verificar se há arredondamento ou conversão de moeda

### Problema: Logs não aparecem
**Solução:**
1. Verificar se o deploy foi feito corretamente
2. Confirmar que está visualizando os logs do servidor correto
3. Verificar se o bot está realmente rodando

---

## 📊 Exemplo de Validação Completa

### Cenário: Bot realiza 3 operações

#### Operação 1 (sem hedge):
```
[POSITION_SAVED] Posição salva no banco | ID: 100 | Contract: CR_100001 | Stake: $1.00 | Bot: 1
[POSITION_UPDATED] Posição atualizada no banco | ID: 100 | Contract: CR_100001 | PnL: $0.85 | Status: won | Bot: 1
[METRICS_UPDATED] Métricas atualizadas | PnL Operação: $0.85 | PnL Diário Total: $0.85 | Trades Contabilizados: 1 | Posições Fechadas: 1 | Bot: 1
```

#### Operação 2 (com hedge):
```
[POSITION_SAVED] Posição salva no banco | ID: 101 | Contract: CR_100002 | Stake: $1.00 | Bot: 1
[HEDGE_SAVED] Hedge salvo no banco | ID: 102 | Contract: CR_100003 | Stake: $0.50 | Parent: 101 | Bot: 1
[POSITION_UPDATED] Posição atualizada no banco | ID: 101 | Contract: CR_100002 | PnL: -$1.00 | Status: lost | Bot: 1
[POSITION_UPDATED] Posição atualizada no banco | ID: 102 | Contract: CR_100003 | PnL: $0.90 | Status: won | Bot: 1
[METRICS_UPDATED] Métricas atualizadas | PnL Operação: -$0.10 | PnL Diário Total: $0.75 | Trades Contabilizados: 1 | Posições Fechadas: 2 | Bot: 1
```

#### Operação 3 (sem hedge):
```
[POSITION_SAVED] Posição salva no banco | ID: 103 | Contract: CR_100004 | Stake: $1.00 | Bot: 1
[POSITION_UPDATED] Posição atualizada no banco | ID: 103 | Contract: CR_100004 | PnL: $0.95 | Status: won | Bot: 1
[METRICS_UPDATED] Métricas atualizadas | PnL Operação: $0.95 | PnL Diário Total: $1.70 | Trades Contabilizados: 1 | Posições Fechadas: 1 | Bot: 1
```

### Validação:

**✅ Contagem de Trades:**
- Dashboard deve mostrar: **+3 trades**
- Deriv mostra: **4 contratos** (3 originais + 1 hedge)
- **Correto!** Cada operação = 1 trade, independente de hedge

**✅ PnL Total:**
- Operação 1: +$0.85
- Operação 2: -$0.10 (soma de -$1.00 + $0.90)
- Operação 3: +$0.95
- **Total: $1.70** ✅ (bate com o último log)

**✅ Posições no Banco:**
- 4 posições salvas (IDs: 100, 101, 102, 103)
- 1 delas é hedge (ID: 102, parentPositionId: 101)
- Todas com status "CLOSED"

**✅ Métricas:**
- Diárias: 3 trades, PnL $1.70
- Mensais: 3 trades, PnL $1.70
- Wins: 3 (operações 1, 2 hedge, 3)
- Losses: 1 (operação 2 original)

---

## 🎯 Conclusão

Se todos os checkpoints acima passarem, as correções estão funcionando perfeitamente! 

Em caso de dúvidas ou problemas, consulte o arquivo `CORRECAO_PNL_TRADES_METRICAS.md` para mais detalhes técnicos.
