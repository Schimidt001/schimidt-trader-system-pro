# Análise: Lógica de Re-Predição para M30

## 📋 Requisito

**Objetivo:** Implementar re-predição após 5 minutos para timeframe M30, caso o gatilho armado não seja acionado.

## 🔍 Fluxo Atual

### Timeline M30 (30 minutos = 1800 segundos)

```
0s ──────────── 960s ──────────── 1200s ─────────── 1800s
│               │                 │                 │
Início          Predição 1        Re-Predição      Fim
do Candle       (16 min)          (20 min)         do Candle
                ↓                 ↓
                Gatilho 1         Gatilho 2
                Armado            (se não acionado)
```

### Fluxo Proposto

1. **0s - 960s (16 min)**: Aguardar `waitTime` (padrão 16 min para M30)
2. **960s**: Fazer primeira predição e armar gatilho
3. **960s - 1200s (4 min)**: Monitorar se gatilho é acionado
4. **1200s (20 min)**: Se gatilho NÃO foi acionado:
   - Fazer nova predição
   - Atualizar gatilho
   - Continuar monitoramento
5. **1200s - 1800s**: Monitorar novo gatilho até fim do candle

## 🎯 Implementação

### 1. Variáveis Necessárias

```typescript
// No TradingBot
private repredictionTimer: NodeJS.Timeout | null = null;
private repredictionEnabled: boolean = true; // Configurável
private repredictionDelay: number = 300; // 5 minutos em segundos
private hasRepredicted: boolean = false; // Flag para evitar múltiplas re-predições
```

### 2. Lógica de Timer

```typescript
// Após primeira predição (estado ARMED)
if (this.timeframe === 1800 && this.repredictionEnabled) {
  this.scheduleReprediction(elapsedSeconds);
}

private scheduleReprediction(currentElapsed: number): void {
  // Limpar timer anterior se existir
  if (this.repredictionTimer) {
    clearTimeout(this.repredictionTimer);
  }
  
  // Calcular tempo até re-predição (5 minutos após predição inicial)
  const delayMs = this.repredictionDelay * 1000;
  
  this.repredictionTimer = setTimeout(async () => {
    // Verificar se ainda está ARMED (não entrou em posição)
    if (this.state === "ARMED" && !this.hasRepredicted) {
      await this.makeReprediction();
    }
  }, delayMs);
}
```

### 3. Método de Re-Predição

```typescript
private async makeReprediction(): Promise<void> {
  try {
    await this.logEvent(
      "REPREDICTION_START",
      `[RE-PREDIÇÃO M30] Gatilho não acionado em 5 min, fazendo nova predição...`
    );
    
    // Buscar dados atualizados do candle
    const currentCandles = await this.derivService.getCandleHistory(
      this.symbol, 
      this.timeframe, 
      2
    );
    
    const currentCandle = currentCandles.find(c => c.epoch === this.currentCandleTimestamp);
    
    if (!currentCandle) {
      throw new Error("Candle atual não encontrado para re-predição");
    }
    
    // Atualizar valores do candle
    this.currentCandleHigh = currentCandle.high;
    this.currentCandleLow = currentCandle.low;
    this.currentCandleClose = currentCandle.close;
    
    // Calcular elapsed seconds atual
    const now = Math.floor(Date.now() / 1000);
    const elapsedSeconds = now - this.currentCandleTimestamp;
    
    // Fazer nova predição
    const historyData = await this.getHistoryForPrediction();
    
    const request = {
      symbol: this.symbol,
      tf: "M30",
      history: historyData.slice(0, -1),
      partial_current: {
        timestamp_open: this.currentCandleTimestamp,
        elapsed_seconds: elapsedSeconds,
        abertura: this.currentCandleOpen,
        minima_parcial: this.currentCandleLow,
        maxima_parcial: this.currentCandleHigh,
      },
    };
    
    // Nova predição
    this.prediction = await predictionService.predict(request);
    
    // Recalcular gatilho
    const offset = this.triggerOffset;
    if (offset === 0) {
      this.trigger = this.prediction.predicted_close;
    } else if (this.prediction.direction === "up") {
      this.trigger = this.prediction.predicted_close - offset;
    } else {
      this.trigger = this.prediction.predicted_close + offset;
    }
    
    this.hasRepredicted = true;
    
    await this.logEvent(
      "REPREDICTION_COMPLETE",
      `[RE-PREDIÇÃO CONCLUÍDA] Nova Direção: ${this.prediction.direction.toUpperCase()} | Novo Gatilho: ${this.trigger} | Close Previsto: ${this.prediction.predicted_close}`
    );
    
  } catch (error) {
    await this.logEvent(
      "REPREDICTION_ERROR",
      `Erro na re-predição: ${error}`
    );
  }
}
```

### 4. Limpeza de Timers

```typescript
// No método enterPosition (quando gatilho é acionado)
if (this.repredictionTimer) {
  clearTimeout(this.repredictionTimer);
  this.repredictionTimer = null;
}

// No método closeCurrentCandle (fim do candle)
if (this.repredictionTimer) {
  clearTimeout(this.repredictionTimer);
  this.repredictionTimer = null;
}
this.hasRepredicted = false; // Reset flag
```

## ⚙️ Configuração

### Schema do Banco

```typescript
// drizzle/schema.ts
repredictionEnabled: boolean("repredictionEnabled").default(true).notNull(),
repredictionDelay: int("repredictionDelay").default(300).notNull(), // 5 min
```

### Frontend (Settings.tsx)

```typescript
// Mostrar apenas quando timeframe === 1800
{timeframe === "1800" && (
  <div className="space-y-4 p-4 bg-blue-900/20 rounded-lg border border-blue-700">
    <div className="flex items-center justify-between">
      <Label>Re-Predição M30</Label>
      <Switch 
        checked={repredictionEnabled}
        onCheckedChange={setRepredictionEnabled}
      />
    </div>
    
    {repredictionEnabled && (
      <div className="space-y-2">
        <Label>Tempo para Re-Predição (minutos)</Label>
        <Input
          type="number"
          value={repredictionDelay}
          onChange={(e) => setRepredictionDelay(e.target.value)}
          min="3"
          max="10"
        />
        <p className="text-xs text-slate-500">
          Tempo de espera após primeira predição antes de fazer nova predição (padrão: 5 min)
        </p>
      </div>
    )}
  </div>
)}
```

## 📊 Vantagens

1. **Adaptação ao Mercado**: Captura mudanças de tendência que ocorrem após a primeira predição
2. **Maior Precisão**: Usa dados mais recentes do candle (20 min vs 16 min)
3. **Flexibilidade**: Pode ser ativado/desativado conforme necessidade
4. **Específico para M30**: Não afeta o comportamento do M15

## ⚠️ Considerações

1. **Apenas para M30**: Lógica ativa somente quando `timeframe === 1800`
2. **Uma única re-predição**: Flag `hasRepredicted` evita múltiplas re-predições
3. **Cancelamento automático**: Timer é cancelado se gatilho for acionado
4. **Configurável**: Usuário pode ajustar o delay (3-10 minutos)

## 🧪 Cenários de Teste

### Cenário 1: Re-predição bem-sucedida
1. M30 ativo, re-predição habilitada
2. Primeira predição aos 16 min: UP, gatilho 1.0850
3. Preço não atinge 1.0850 em 5 minutos
4. Re-predição aos 21 min: DOWN, novo gatilho 1.0840
5. Preço atinge 1.0840, entrada realizada

### Cenário 2: Gatilho acionado antes da re-predição
1. Primeira predição aos 16 min: UP, gatilho 1.0850
2. Preço atinge 1.0850 aos 18 min
3. Entrada realizada
4. Timer de re-predição cancelado automaticamente

### Cenário 3: Re-predição desabilitada
1. M30 ativo, re-predição desabilitada
2. Comportamento igual ao M15 (sem re-predição)

## 📝 Logs Esperados

```
[TIMEFRAME] Timeframe configurado: 1800s (M30)
[REPREDICTION_CONFIG] Re-predição habilitada: true | Delay: 300s (5 min)
[PREDICTION_MADE] Direção: UP | Gatilho: 1.0850
[REPREDICTION_SCHEDULED] Re-predição agendada para daqui 300 segundos
[REPREDICTION_START] Gatilho não acionado em 5 min, fazendo nova predição...
[REPREDICTION_COMPLETE] Nova Direção: DOWN | Novo Gatilho: 1.0840
```
