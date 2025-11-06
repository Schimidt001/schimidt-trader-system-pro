# 🔄 Guia: Re-Predição Automática para M30

## 📋 O que é?

A **Re-Predição M30** é uma funcionalidade exclusiva para o timeframe de 30 minutos que permite ao bot fazer uma **segunda predição** caso o gatilho da primeira predição não seja acionado dentro de um período configurável (padrão: 5 minutos).

---

## 🎯 Por que usar?

### Vantagens

1. **Adaptação ao Mercado**: Captura mudanças de tendência que ocorrem após a primeira predição
2. **Dados Mais Recentes**: A segunda predição usa dados do candle com mais 5 minutos de progresso
3. **Maior Precisão**: Reduz o risco de operar com predições desatualizadas
4. **Flexível**: Pode ser ativada/desativada conforme necessidade

### Quando é útil?

- Mercados voláteis onde a tendência muda rapidamente
- Pares Forex com alta liquidez
- Candles M30 onde há tempo suficiente para ajustes

---

## ⚙️ Como Funciona?

### Timeline M30 (30 minutos = 1800 segundos)

```
0s ──────────── 960s ──────────── 1260s ─────────── 1800s
│               │                 │                 │
Início          Predição 1        Re-Predição      Fim
do Candle       (16 min)          (21 min)         do Candle
                ↓                 ↓
                Gatilho 1         Gatilho 2
                Armado            (se não acionado)
```

### Fluxo Detalhado

1. **0s - 960s (16 min)**: Bot aguarda `waitTime` (padrão 16 min para M30)
2. **960s**: Bot faz primeira predição e arma gatilho
3. **960s - 1260s (5 min)**: Bot monitora se gatilho é acionado
4. **1260s (21 min)**: Se gatilho **NÃO** foi acionado:
   - Bot busca dados atualizados do candle
   - Faz nova predição com dados mais recentes
   - Atualiza o gatilho
   - Continua monitoramento até fim do candle
5. **Gatilho acionado**: Timer de re-predição é **cancelado automaticamente**

---

## 🔧 Configuração

### 1. Ativar M30

Primeiro, configure o timeframe para M30:

```
Configurações > Trading > Timeframe: M30 (30 minutos)
```

### 2. Configurar Re-Predição

Quando M30 estiver selecionado, aparecerá uma seção azul:

```
┌─────────────────────────────────────────────┐
│ Re-Predição M30                      [ON]   │
│ Fazer nova predição se o gatilho não for    │
│ acionado após o delay configurado           │
│                                             │
│ Delay para Re-Predição (segundos)          │
│ [300] ────────────────────────────────      │
│ Tempo de espera após primeira predição     │
│ antes de fazer nova predição (5 min)       │
└─────────────────────────────────────────────┘
```

### Parâmetros

| Parâmetro | Tipo | Padrão | Faixa | Descrição |
|-----------|------|--------|-------|-----------|
| `repredictionEnabled` | Boolean | `true` | ON/OFF | Habilita/desabilita re-predição |
| `repredictionDelay` | Integer | `300` | 180-600 | Delay em segundos (3-10 min) |

### Recomendações

| Cenário | Delay Recomendado | Motivo |
|---------|-------------------|--------|
| **Forex Volátil** | 240s (4 min) | Capturar mudanças rápidas |
| **Padrão** | 300s (5 min) | Equilíbrio entre adaptação e estabilidade |
| **Conservador** | 360s (6 min) | Evitar re-predições desnecessárias |
| **Sintéticos** | 300s (5 min) | Volatilidade constante |

---

## 📊 Exemplos Práticos

### Exemplo 1: Re-Predição Bem-Sucedida

**Cenário:**
- Ativo: EUR/USD
- Timeframe: M30
- Re-predição: Habilitada (delay 300s)

**Timeline:**
```
16:00 - Candle inicia
16:16 - Primeira predição: UP, gatilho 1.0850
16:21 - Preço não atingiu 1.0850
16:21 - Re-predição: DOWN, novo gatilho 1.0840
16:23 - Preço atinge 1.0840 → Entrada realizada
```

**Resultado:** Bot adaptou-se à reversão de tendência e entrou na direção correta.

---

### Exemplo 2: Gatilho Acionado Antes da Re-Predição

**Cenário:**
- Ativo: GBP/USD
- Timeframe: M30
- Re-predição: Habilitada (delay 300s)

**Timeline:**
```
14:00 - Candle inicia
14:16 - Primeira predição: UP, gatilho 1.2650
14:18 - Preço atinge 1.2650 → Entrada realizada
14:21 - Timer de re-predição cancelado automaticamente
```

**Resultado:** Primeira predição foi correta, re-predição não foi necessária.

---

### Exemplo 3: Re-Predição Desabilitada

**Cenário:**
- Ativo: R_100
- Timeframe: M30
- Re-predição: **Desabilitada**

**Timeline:**
```
10:00 - Candle inicia
10:16 - Primeira predição: UP, gatilho 57900
10:16 - 10:30 - Monitora gatilho até fim do candle
10:30 - Se não acionou, aguarda próximo candle
```

**Resultado:** Comportamento igual ao M15 (sem re-predição).

---

## 🔍 Logs e Monitoramento

### Logs Esperados

Quando re-predição está habilitada, você verá logs como:

```
[TIMEFRAME] Timeframe configurado: 1800s (M30)
[REPREDICTION_CONFIG] Re-predição M30 Habilitada: true
[REPREDICTION_CONFIG] Delay: 300s (5 min)
[PREDICTION_MADE] Direção: UP | Gatilho: 1.0850
[REPREDICTION_SCHEDULED] Re-predição agendada para daqui 300 segundos
```

Se o gatilho **NÃO** for acionado em 5 minutos:

```
[REPREDICTION_START] Gatilho não acionado em 5 min, fazendo nova predição...
[REPREDICTION_CANDLE_UPDATE] Candle atualizado: H=1.0865 | L=1.0842 | C=1.0848
[REPREDICTION_COMPLETE] Antiga: UP @ 1.0850 | Nova: DOWN @ 1.0840 | Close Previsto: 1.0856
```

Se o gatilho **for acionado antes**:

```
[TRIGGER_HIT] Preço atual: 1.0850 | Gatilho: 1.0850 | Direção: UP
[REPREDICTION_CANCELLED] Timer de re-predição cancelado (gatilho acionado)
```

---

## ⚠️ Considerações Importantes

### 1. Exclusivo para M30

- Re-predição **só funciona** quando `timeframe = 1800` (M30)
- Para M15, esta funcionalidade **não está disponível**
- Interface mostra opções apenas quando M30 está selecionado

### 2. Uma Única Re-Predição

- Apenas **uma re-predição** por candle
- Flag `hasRepredicted` evita múltiplas re-predições
- Reset automático ao fechar candle

### 3. Cancelamento Automático

- Timer é cancelado se gatilho for acionado
- Timer é limpo ao fechar candle
- Sem vazamento de memória ou timers órfãos

### 4. Validação de Delay

- Mínimo: 180 segundos (3 minutos)
- Máximo: 600 segundos (10 minutos)
- Validação no frontend e backend

---

## 🧪 Como Testar

### Teste 1: Re-Predição Funcional

1. Configure M30 com re-predição habilitada (delay 300s)
2. Configure `waitTime` para 16 minutos
3. Inicie o bot
4. Observe os logs:
   - Primeira predição aos 16 min
   - Re-predição aos 21 min (se gatilho não acionado)

### Teste 2: Cancelamento de Timer

1. Configure M30 com re-predição habilitada
2. Use um ativo volátil (ex: GBP/JPY)
3. Observe se o gatilho é acionado antes de 5 minutos
4. Verifique log: `REPREDICTION_CANCELLED`

### Teste 3: Desabilitação

1. Configure M30 com re-predição **desabilitada**
2. Inicie o bot
3. Verifique que não há logs de re-predição
4. Comportamento deve ser igual ao M15

---

## 📈 Melhores Práticas

### 1. Ajuste o Delay Conforme Volatilidade

```
Alta Volatilidade (Forex): 240-300s
Média Volatilidade: 300-360s
Baixa Volatilidade (Sintéticos): 300-420s
```

### 2. Combine com WaitTime Adequado

```
M30 Padrão:
- waitTime: 16 minutos (960s)
- repredictionDelay: 5 minutos (300s)
- Total: 21 minutos de análise antes de desistir
```

### 3. Monitore os Logs

- Verifique quantas re-predições são feitas
- Se muitas re-predições, considere:
  - Aumentar `triggerOffset`
  - Ajustar `waitTime`
  - Revisar estratégia de entrada

### 4. Teste em DEMO Primeiro

- Sempre teste em modo DEMO
- Observe por alguns candles
- Ajuste parâmetros conforme necessário

---

## 🐛 Solução de Problemas

### Problema: Re-predição não aparece nas configurações

**Solução:** Verifique se M30 está selecionado. A opção só aparece para `timeframe = 1800`.

### Problema: Re-predição não está sendo executada

**Solução:**
1. Verifique se `repredictionEnabled = true`
2. Confirme que o gatilho não foi acionado antes do delay
3. Veja os logs para erros

### Problema: Múltiplas re-predições no mesmo candle

**Solução:** Isso não deveria acontecer. Se ocorrer, reporte como bug. A flag `hasRepredicted` previne isso.

### Problema: Erro ao salvar configuração

**Solução:** Verifique se o delay está entre 180-600 segundos.

---

## 📞 Suporte

Para questões sobre re-predição M30:

1. Consulte `REPREDICTION_LOGIC_ANALYSIS.md` para detalhes técnicos
2. Verifique os logs do servidor
3. Teste com delay diferente (ex: 240s ou 360s)

---

## 🎓 Resumo

| Aspecto | Detalhes |
|---------|----------|
| **Objetivo** | Fazer nova predição se gatilho não for acionado |
| **Timeframe** | Apenas M30 (1800s) |
| **Delay Padrão** | 300s (5 minutos) |
| **Delay Mínimo** | 180s (3 minutos) |
| **Delay Máximo** | 600s (10 minutos) |
| **Cancelamento** | Automático ao acionar gatilho |
| **Limite** | Uma re-predição por candle |
| **Configurável** | Sim (ON/OFF + delay ajustável) |

---

**Boa sorte com suas operações M30! 🚀📈**
