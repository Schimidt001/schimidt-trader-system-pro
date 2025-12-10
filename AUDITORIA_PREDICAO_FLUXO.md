# Auditoria de Predição - Mapeamento de Fluxo

**Data:** 10 de Dezembro de 2025  
**Autor:** Manus AI  
**Objetivo:** Diagnosticar divergência entre predição automática e manual

---

## 🔍 PROBLEMA IDENTIFICADO #1: Compartilhamento de Estado entre Bots

### Localização
`server/prediction/engine_server.py` - Linhas 30-32

### Código Problemático
```python
# Dicionário de engines por símbolo (para suportar multi-bot com ativos diferentes)
engines_by_symbol = {}
# engines_by_symbol[symbol] = {'engine': PredictionEngine(), 'initialized': bool}
```

### Descrição do Problema
A engine Python mantém **uma única instância** de `PredictionEngine` por símbolo, compartilhada entre todos os bots que operam o mesmo ativo.

### Impacto
1. **Fase Detectada Compartilhada:** A variável `self.fase_detectada` é compartilhada entre bots
2. **Chave de Fase 1 Compartilhada:** A variável `self.chave_ativa_fase1` é compartilhada
3. **Histórico Persistente:** O método `alimentar_dados()` só é chamado uma vez por símbolo
4. **Contaminação de Estado:** Um bot pode influenciar a predição de outro bot

### Exemplo de Cenário Problemático
```
Bot1 (R_100, M15) → Chama predição → Engine detecta Fase 2
Bot2 (R_100, M30) → Chama predição → Usa a MESMA engine com Fase 2 já detectada
```

---

## 📊 FLUXO DE PREDIÇÃO AUTOMÁTICA (Bot)

### 1. Preparação dos Dados
**Arquivo:** `server/deriv/tradingBot.ts` - Linha 1255-1278

```typescript
// Buscar histórico do banco de dados
const history = await getCandleHistory(
  this.symbol,      // Ex: "R_100"
  this.lookback,    // Ex: 500
  timeframeLabel,   // Ex: "M15"
  this.botId        // ✅ Filtrado por botId
);

// Converter para formato da engine
const historyData = [...history].reverse().map((c) => ({
  abertura: parseFloat(c.open),
  minima: parseFloat(c.low),
  maxima: parseFloat(c.high),
  fechamento: parseFloat(c.close),
  timestamp: c.timestampUtc,
}));

// Montar request
const request = {
  symbol: this.symbol,
  tf: timeframeLabel,
  history: historyData,
  partial_current: {
    timestamp_open: this.currentCandleTimestamp,
    elapsed_seconds: elapsedSeconds,
    abertura: this.currentCandleOpen,
    minima_parcial: this.currentCandleLow,
    maxima_parcial: this.currentCandleHigh,
  },
};
```

### 2. Chamada à Engine
**Arquivo:** `server/prediction/predictionService.ts` - Linha 26-52

```typescript
async predict(request: PredictionRequest): Promise<PredictionResponse> {
  const response = await fetch(`${this.engineUrl}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  
  const result: PredictionResponse = await response.json();
  return result;
}
```

### 3. Processamento na Engine Python
**Arquivo:** `server/prediction/engine_server.py` - Linha 104-132

```python
# Obter ou criar engine específica para este símbolo
if symbol not in engines_by_symbol:
    engines_by_symbol[symbol] = {
        'engine': PredictionEngine(),
        'initialized': False
    }

engine_data = engines_by_symbol[symbol]
engine = engine_data['engine']

# Alimentar engine com histórico (primeira vez APENAS)
if not engine_data['initialized']:
    result = engine.alimentar_dados(history)
    engine_data['initialized'] = True

# Fazer predição
predicao = engine.fazer_predicao(abertura, maxima, minima)
```

### 4. Detecção de Fase
**Arquivo:** `server/prediction/prediction_engine.py` - Linha 30-48

```python
def detectar_fase(self, dados: List[Dict]) -> int:
    if not dados:
        return 1
    
    # Analisar valores de abertura para detectar escala
    aberturas = [float(candle.get('abertura', 0)) for candle in dados]
    media_abertura = np.mean(aberturas)
    
    # Fase 1: valores ~0.9, Fase 2: valores ~9400+
    if media_abertura > 1000:
        fase = 2
    else:
        fase = 1
    
    self.fase_detectada = fase  # ⚠️ ESTADO PERSISTENTE
    return fase
```

### 5. Predição Baseada na Fase
**Arquivo:** `server/prediction/prediction_engine.py` - Linha 201-248

```python
def fazer_predicao(self, abertura, maxima, minima):
    fase = self.fase_detectada or 2  # ⚠️ Usa fase já detectada
    
    if fase == 1:
        fechamento_pred = self.predizer_fase1(...)
        algoritmo_usado = f"Fase 1 - {self.chave_ativa_fase1}"
    else:
        fechamento_pred = self.algoritmo_fibonacci_amplitude(...)
        algoritmo_usado = "Fibonacci da Amplitude"
    
    return {
        'fechamento_predito': fechamento_pred,
        'fase_usada': fase,
        'algoritmo': algoritmo_usado,
        ...
    }
```

---

## 🎯 PONTOS CRÍTICOS IDENTIFICADOS

### 1. Inicialização Única por Símbolo
- `alimentar_dados()` é chamado apenas uma vez
- A fase é detectada com base no primeiro histórico recebido
- Bots subsequentes do mesmo símbolo não re-detectam a fase

### 2. Estado Persistente na Engine
- `self.fase_detectada` permanece fixo após primeira detecção
- `self.chave_ativa_fase1` permanece fixo após primeira descoberta
- `self.historico_predicoes` acumula predições de todos os bots

### 3. Ausência de Identificador de Bot
- A engine não recebe `botId` no request
- Não há isolamento de contexto por bot
- Impossível rastrear qual bot fez qual predição

---

## 📝 PRÓXIMOS PASSOS

1. ✅ Instrumentar código com logs detalhados incluindo `botId`
2. ⏳ Criar teste comparativo manual vs automático
3. ⏳ Executar testes e coletar logs
4. ⏳ Analisar divergências
5. ⏳ Gerar relatório técnico de diagnóstico
