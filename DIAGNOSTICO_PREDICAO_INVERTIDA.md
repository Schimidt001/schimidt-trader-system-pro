# 🔍 DIAGNÓSTICO: Predição Invertida (CALL em vez de PUT)

**Data:** 2025-11-12  
**Símbolo:** frxUSDJPY  
**Timeframe:** M60 (3600s)  
**Problema:** Bot entrou em CALL quando deveria ser PUT

---

## 📊 Dados do Caso

### Log do Bot (Predição Errada)
```
[ENTRADA DA PREDIÇÃO] 
Abertura: 154.741
Máxima: 154.775
Mínima: 154.674
Timestamp: 1762963200 (2025-11-12 11:00:00 UTC)
Tempo decorrido: 2100s (35 minutos)

[POSITION_ENTERED]
Posição: CALLE (CALL com Allow Equals)
Entrada: 154.72
Stake: 10
Duração: 25min
Resultado: LOSS ❌
```

### Predição Manual (Correta)
```
Fechamento Predito: 154.7126
Fase: 1
Algoritmo: decimal_pattern
Cor Predita: Vermelho
Direção: PUT ✅
Resultado: WIN (se tivesse entrado)
```

---

## 🧪 Testes Realizados

### Teste 1: Algoritmo Fibonacci Puro
```python
abertura = 154.741
maxima = 154.775
minima = 154.674
meio = (maxima + minima) / 2  # 154.7245

# abertura (154.741) > meio (154.7245) → Tendência BAIXA
fechamento = abertura - 0.618 * (abertura - minima)
# = 154.741 - 0.618 * (154.741 - 154.674)
# = 154.741 - 0.618 * 0.067
# = 154.741 - 0.0414
# = 154.6996

Resultado: 154.6996 < 154.741 → Vermelho (PUT) ✅
```

### Teste 2: Engine Python com Histórico Real
```python
# Usando 160 candles históricos fornecidos
Fase detectada: 1 (Forex ~154 < 1000)
Chave descoberta: decimal_pattern
Fechamento Predito: 154.7126
Cor: Vermelho
Posição: PUT ✅
```

**Conclusão:** A engine Python está funcionando CORRETAMENTE!

---

## 🔍 Análise da Causa Raiz

### Hipóteses Investigadas

#### ✅ Hipótese 1: Lógica de Predição Incorreta
**Status:** DESCARTADA  
**Motivo:** Código Python idêntico à plataforma original e testes confirmam resultado correto (PUT)

#### ✅ Hipótese 2: Detecção de Fase Errada
**Status:** CONFIRMADA PARCIALMENTE  
**Motivo:** Forex (~154) é classificado como Fase 1, não Fase 2. Mas isso está correto segundo a lógica original.

#### ⚠️ Hipótese 3: Candles Diferentes
**Status:** EM INVESTIGAÇÃO  
**Motivo:** Possível que o bot tenha coletado candles diferentes dos usados manualmente

#### ⚠️ Hipótese 4: Engine Não Inicializada
**Status:** EM INVESTIGAÇÃO  
**Motivo:** Se a engine não foi alimentada com histórico, pode usar chave padrão errada

#### ⚠️ Hipótese 5: Conversão Python → TypeScript
**Status:** EM INVESTIGAÇÃO  
**Motivo:** Possível inversão no mapeamento de direção

---

## 🎯 Próximos Passos

1. ✅ Verificar se engine Python está sendo inicializada corretamente
2. ✅ Comparar candles coletados pelo bot vs candles manuais
3. ✅ Adicionar logs detalhados na conversão Python → TypeScript
4. ✅ Verificar se há cache de predição antiga
5. ✅ Testar com dados reais do timestamp exato

---

## 📝 Observações Importantes

- A plataforma original e a engine Python têm código **IDÊNTICO**
- O algoritmo Fibonacci da Amplitude está **CORRETO**
- A detecção de Fase 1 para Forex está **CORRETA** (valores < 1000)
- A chave `decimal_pattern` foi descoberta corretamente
- O problema está **APÓS** a predição Python, provavelmente na integração TypeScript

---

## 🚨 Ação Requerida

Investigar o fluxo completo desde a coleta de candles até a execução do trade:

1. Coleta de candles (`derivService.getCandleHistory`)
2. Alimentação da engine (`/predict` endpoint)
3. Inicialização da engine por símbolo
4. Conversão da resposta Python
5. Mapeamento de direção (`up`/`down` → `CALL`/`PUT`)
6. Execução do contrato

**Suspeita Principal:** Engine não foi inicializada com histórico correto ou está usando cache de outro símbolo.
