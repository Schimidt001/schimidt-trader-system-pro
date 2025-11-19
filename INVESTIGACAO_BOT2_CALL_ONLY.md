# Investigação: Bot 2 Realizando Apenas Trades CALL

## 🔍 Problema Reportado

O Bot 2 está realizando **mais de 10 trades consecutivos** todos na direção **CALL** (compra/alta), sem nenhum trade **PUT** (venda/baixa). Isso é estatisticamente improvável e indica um possível problema.

## 📊 Análise do Código

### 1. Lógica de Predição

A direção do trade (CALL ou PUT) é determinada pela **engine de predição externa** através do serviço `predictionService`. O código não força nenhuma direção específica.

**Fluxo:**
```typescript
// 1. Bot envia dados históricos para a engine
this.prediction = await predictionService.predict(request);

// 2. Engine retorna direção ("up" ou "down")
// 3. Bot converte para tipo de contrato
if (this.prediction.direction === "up") {
  contractType = "CALL";  // ou "CALLE" se allowEquals
} else {
  contractType = "PUT";   // ou "PUTE" se allowEquals
}
```

### 2. Diferenças Entre Bot 1 e Bot 2

**Não há diferenciação no código de predição entre Bot 1 e Bot 2.**

Ambos os bots:
- Usam a mesma engine de predição
- Usam a mesma lógica de conversão de direção
- Não têm nenhum código que force uma direção específica

### 3. Possíveis Causas

#### Causa 1: Engine de Predição (Mais Provável)
A engine externa pode estar retornando sempre "up" para o Bot 2 devido a:
- **Configurações diferentes** (símbolo, timeframe, lookback)
- **Dados históricos diferentes** enviados para análise
- **Bug na engine** que afeta apenas certas configurações
- **Condições de mercado** que favorecem alta no período analisado

#### Causa 2: Configurações do Bot 2
O Bot 2 pode ter configurações que fazem a IA sempre prever alta:
- **Símbolo diferente** (ex: R_100 vs R_50)
- **Timeframe diferente** (ex: M15 vs M30)
- **Lookback diferente** (ex: 50 vs 500 candles)
- **Horários de operação** (filtro horário ativo)

#### Causa 3: Condições de Mercado
Se o Bot 2 opera em:
- **Mercado fortemente altista** no período
- **Horários específicos** com tendência de alta
- **Símbolo com viés de alta** (alguns índices sintéticos)

## 🔧 Correção Implementada

### Logs Adicionais para Diagnóstico

Adicionei **logs detalhados** em 3 pontos críticos para rastrear exatamente o que está acontecendo:

#### 1. Request de Predição (Fase de Descoberta)
```typescript
console.log(`[PHASE_DISCOVERY] Bot: ${this.botId} | Enviando para IA: ${historyData.length} candles | Timeframe: ${timeframeLabel} | Symbol: ${this.symbol}`);
```

#### 2. Request e Response de Predição (Entrada de Posição)
```typescript
console.log(`[PREDICTION_REQUEST] Bot: ${this.botId} | Symbol: ${this.symbol} | TF: ${request.tf} | History candles: ${request.history.length} | Partial candle: Open=${request.partial_current.abertura}, High=${request.partial_current.maxima}, Low=${request.partial_current.minima}`);

console.log(`[PREDICTION_RESPONSE] Bot: ${this.botId} | Direction: ${this.prediction.direction.toUpperCase()} | Predicted Close: ${this.prediction.predicted_close} | Phase: ${this.prediction.phase} | Strategy: ${this.prediction.strategy} | Confidence: ${this.prediction.confidence}`);
```

#### 3. Request e Response de Re-predição (M30/M60)
```typescript
console.log(`[REPREDICTION_REQUEST] Bot: ${this.botId} | Symbol: ${this.symbol} | TF: ${request.tf} | History candles: ${request.history.length} | Partial candle: Open=${request.partial_current.abertura}, High=${request.partial_current.maxima}, Low=${request.partial_current.minima}`);

console.log(`[REPREDICTION_RESPONSE] Bot: ${this.botId} | OLD Direction: ${oldPrediction?.direction.toUpperCase()} | NEW Direction: ${this.prediction.direction.toUpperCase()} | Predicted Close: ${this.prediction.predicted_close} | Phase: ${this.prediction.phase}`);
```

## 📋 Como Diagnosticar o Problema

### Passo 1: Verificar Configurações dos Bots

Compare as configurações de Bot 1 e Bot 2:

```sql
SELECT botId, symbol, timeframe, lookback, triggerOffset, contractType
FROM config
WHERE userId = <seu_user_id>
ORDER BY botId;
```

**Verifique:**
- [ ] Ambos usam o mesmo **symbol**?
- [ ] Ambos usam o mesmo **timeframe**?
- [ ] Ambos usam o mesmo **lookback**?
- [ ] Ambos têm **filtro horário** com mesmas configurações?

### Passo 2: Analisar Logs de Predição

Após fazer deploy, monitore os logs do servidor:

```bash
# Filtrar logs do Bot 2
grep "Bot: 2" logs.txt

# Buscar especificamente predições do Bot 2
grep "\[PREDICTION_RESPONSE\] Bot: 2" logs.txt
```

**Exemplo de log esperado:**
```
[PREDICTION_REQUEST] Bot: 2 | Symbol: R_100 | TF: M15 | History candles: 500 | Partial candle: Open=12345.67, High=12350.00, Low=12340.00
[PREDICTION_RESPONSE] Bot: 2 | Direction: UP | Predicted Close: 12355.50 | Phase: EXPANSION | Strategy: MOMENTUM | Confidence: 0.85
```

**O que analisar:**
- Todas as predições retornam `Direction: UP`?
- Os dados do `Partial candle` parecem corretos?
- O `Symbol` e `TF` estão corretos?

### Passo 3: Comparar com Bot 1

Execute ambos os bots simultaneamente e compare os logs:

```bash
# Bot 1
grep "\[PREDICTION_RESPONSE\] Bot: 1" logs.txt | tail -10

# Bot 2
grep "\[PREDICTION_RESPONSE\] Bot: 2" logs.txt | tail -10
```

**Verifique:**
- Bot 1 tem predições variadas (UP e DOWN)?
- Bot 2 tem apenas UP?
- Os dados enviados são diferentes?

### Passo 4: Testar Engine de Predição Diretamente

Teste a engine de predição diretamente com dados do Bot 2:

```bash
curl -X POST http://localhost:5070/predict \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "R_100",
    "tf": "M15",
    "history": [...],
    "partial_current": {...}
  }'
```

**Verifique:**
- A engine retorna sempre "up"?
- Mudando os dados, a direção muda?

## 🎯 Soluções Possíveis

### Solução 1: Ajustar Configurações do Bot 2

Se o problema for configuração:

1. **Igualar configurações** com Bot 1 temporariamente
2. Verificar se o problema persiste
3. Identificar qual configuração causa o problema

### Solução 2: Verificar/Corrigir Engine de Predição

Se o problema for na engine:

1. Verificar logs da engine de predição
2. Testar com dados variados
3. Verificar se há bug na engine para certas configurações

### Solução 3: Limpar Cache/Estado

Se houver cache ou estado corrompido:

1. Parar ambos os bots
2. Limpar estado do Bot 2:
   ```sql
   DELETE FROM bot_state WHERE userId = <seu_user_id> AND botId = 2;
   ```
3. Reiniciar Bot 2

### Solução 4: Forçar Diversidade (Temporário)

**⚠️ Apenas para teste, não para produção:**

Adicionar lógica temporária para alternar direções:

```typescript
// APENAS PARA DEBUG - REMOVER DEPOIS
let forceAlternate = false;
if (forceAlternate && this.prediction.direction === "up") {
  console.log("[DEBUG] Forçando direção DOWN para teste");
  this.prediction.direction = "down";
}
```

## 📊 Checklist de Validação

Após implementar correções:

- [ ] Logs `[PREDICTION_REQUEST]` aparecem para Bot 2
- [ ] Logs `[PREDICTION_RESPONSE]` mostram direções variadas
- [ ] Bot 2 realiza trades CALL e PUT
- [ ] Configurações de Bot 1 e Bot 2 estão corretas
- [ ] Engine de predição funciona corretamente

## 🚨 Observações Importantes

### Sobre a Engine de Predição

A engine de predição é **proprietária e externa**. O código da plataforma apenas:
1. Envia dados históricos
2. Recebe direção prevista
3. Executa o trade

**Não há lógica na plataforma que force uma direção específica.**

### Sobre Condições de Mercado

É possível (mas improvável) que:
- O mercado esteja em **forte tendência de alta**
- O Bot 2 opere em **horários específicos** com viés de alta
- O **símbolo** tenha características que favorecem alta

### Sobre Estatística

10+ trades consecutivos na mesma direção tem probabilidade de:
- **0.5^10 = 0.098%** (se fosse aleatório)
- Isso indica que **não é aleatório** e há uma causa

## 📝 Próximos Passos

1. **Deploy das correções** (logs adicionados)
2. **Reiniciar Bot 2**
3. **Monitorar logs** por algumas horas
4. **Analisar padrões** nos logs de predição
5. **Comparar com Bot 1**
6. **Identificar causa raiz** com base nos logs
7. **Aplicar solução específica**

## 📦 Arquivos Modificados

- `server/deriv/tradingBot.ts` - Adicionados logs de diagnóstico

## 🔗 Referências

- `CORRECAO_BUG_STAKE_BOT2.md` - Correção anterior do Bot 2
- `CORRECAO_PNL_TRADES_METRICAS.md` - Sistema de métricas
- `server/prediction/predictionService.ts` - Serviço de predição
