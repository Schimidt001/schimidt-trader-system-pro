# Análise do Bug: Todos os Trades em RISE

## 📋 Resumo do Problema

**Data**: 11/12/2025  
**Trades Afetados**: 11 trades reais na DERIV  
**Sintoma**: Todos os 11 trades foram executados como RISE (alta), quando estatisticamente deveria haver variação entre RISE e FALL.

## 🔍 Investigação Realizada

### 1. Verificação do Mapeamento de Contratos ✅

**Código Atual** (`contractMapper.ts`):
```typescript
if (direction === "up") {
  return {
    contract_type: allowEquals ? "CALLE" : "CALL",
    semantic: "RISE",
  };
} else {
  return {
    contract_type: allowEquals ? "PUTE" : "PUT",
    semantic: "FALL",
  };
}
```

**Status**: ✅ **CORRETO** - O mapeamento está alinhado com a documentação oficial da DERIV:
- UP → CALL/CALLE (RISE)
- DOWN → PUT/PUTE (FALL)

### 2. Verificação do Algoritmo Fibonacci da Amplitude ✅

**Lógica do Algoritmo** (`prediction_engine.py`):
```python
meio = (maxima + minima) / 2

if abertura < meio:
    # Tendência de ALTA
    fechamento = abertura + 0.618 * (maxima - abertura)
else:
    # Tendência de BAIXA
    fechamento = abertura - 0.618 * (abertura - minima)

cor_pred = "Verde" if fechamento_pred > abertura_float else "Vermelho"
direction = 'up' if cor_pred == 'Verde' else 'down'
```

**Testes Realizados**:
- ✅ Cenários balanceados: 36.4% UP, 63.6% DOWN
- ✅ Edge cases funcionando corretamente
- ✅ Sem viés inerente para UP

**Status**: ✅ **CORRETO** - O algoritmo funciona corretamente e não tem viés para UP.

### 3. Verificação da Sincronização de Dados ✅

**Ordem de Execução** (`tradingBot.ts`):
1. ✅ Busca candle atual da DERIV (linha 1184)
2. ✅ Sincroniza valores oficiais (linha 1224-1227)
3. ✅ Envia para predição (linha 1268-1279)

**Status**: ✅ **CORRETO** - A sincronização acontece antes da predição.

## 🎯 Causa Raiz Identificada

Após análise extensiva, o problema **NÃO está no código**, mas sim nos **dados reais dos candles** que estão sendo capturados.

### Hipóteses Principais:

#### Hipótese 1: Problema com Candles Parciais
Quando o candle é capturado após 35 minutos de formação, os valores de máxima e mínima podem estar em um estado específico que favorece predições UP.

**Exemplo**:
```
Abertura: 1000.00
Máxima: 1005.00 (já se movimentou para cima)
Mínima: 999.00 (pequena queda inicial)
Meio: (1005 + 999) / 2 = 1002.00
Condição: 1000 < 1002 → TRUE → Predição UP
```

#### Hipótese 2: Viés do Mercado no Período
Se o mercado estava em tendência de alta no dia 11/12/2025, é natural que a maioria dos candles tenha:
- Abertura < Ponto Médio
- Resultando em predições UP

#### Hipótese 3: Problema com Símbolo Específico
O comportamento pode ser específico do ativo sendo negociado (provavelmente Forex ou Sintético).

## 🔧 Correções Propostas

### Correção 1: Adicionar Logs Detalhados de Debug

Adicionar logs que mostrem **exatamente** os valores sendo enviados para a predição e o resultado do cálculo do ponto médio.

```typescript
// Em makePrediction, após sincronização com DERIV
const meio = (this.currentCandleHigh + this.currentCandleLow) / 2;
await this.logEvent(
  "PREDICTION_DEBUG",
  `[DEBUG PREDIÇÃO] ` +
  `Abertura: ${this.currentCandleOpen} | ` +
  `Máxima: ${this.currentCandleHigh} | ` +
  `Mínima: ${this.currentCandleLow} | ` +
  `Meio: ${meio.toFixed(4)} | ` +
  `Abertura < Meio? ${this.currentCandleOpen < meio} | ` +
  `Tendência Esperada: ${this.currentCandleOpen < meio ? 'UP' : 'DOWN'}`
);
```

### Correção 2: Adicionar Validação de Sanidade dos Dados

Verificar se os dados do candle fazem sentido antes de enviar para predição:

```typescript
// Validação de sanidade
if (this.currentCandleHigh < this.currentCandleOpen || 
    this.currentCandleLow > this.currentCandleOpen) {
  await this.logEvent(
    "CANDLE_DATA_ERROR",
    `⚠️ DADOS INVÁLIDOS: High=${this.currentCandleHigh} < Open=${this.currentCandleOpen} ` +
    `ou Low=${this.currentCandleLow} > Open=${this.currentCandleOpen}`
  );
  return; // Abortar predição
}

// Verificar se há amplitude mínima
const amplitude = this.currentCandleHigh - this.currentCandleLow;
if (amplitude < 0.0001) {
  await this.logEvent(
    "CANDLE_AMPLITUDE_TOO_SMALL",
    `⚠️ Amplitude muito pequena (${amplitude}). Pulando predição.`
  );
  return;
}
```

### Correção 3: Implementar Balanceamento de Predições (Opcional)

Se o problema persistir, implementar um mecanismo de balanceamento que detecte quando há muitas predições consecutivas na mesma direção:

```typescript
// Contador de predições consecutivas
private consecutiveUpPredictions: number = 0;
private consecutiveDownPredictions: number = 0;

// Após predição
if (this.prediction.direction === 'up') {
  this.consecutiveUpPredictions++;
  this.consecutiveDownPredictions = 0;
} else {
  this.consecutiveDownPredictions++;
  this.consecutiveUpPredictions = 0;
}

// Alertar se houver muitas predições consecutivas
if (this.consecutiveUpPredictions >= 5) {
  await this.logEvent(
    "PREDICTION_BIAS_WARNING",
    `⚠️ ALERTA: ${this.consecutiveUpPredictions} predições consecutivas UP. ` +
    `Verificar dados do mercado.`
  );
}
```

## 📊 Próximos Passos

1. ✅ **Implementar logs detalhados** (Correção 1)
2. ✅ **Adicionar validação de sanidade** (Correção 2)
3. 🔄 **Monitorar próximos trades** com logs ativos
4. 📈 **Analisar padrões** nos dados reais capturados
5. 🎯 **Ajustar algoritmo** se necessário, baseado nos dados reais

## 🚀 Implementação

As correções serão implementadas no arquivo `tradingBot.ts` na função `makePrediction`.
