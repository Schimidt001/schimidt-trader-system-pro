# Esclarecimento: Watchdog vs Pausas Estratégicas do Bot

**Data:** 11 de Novembro de 2025  
**Autor:** Manus AI

---

## 🤔 A Questão do Usuário

> "No forex ele opera o candle de 1h, espera 35 minutos do candle para realizar coleta de informações e previsão para só aí começar a entrar em posição. Essas implementações que você sugeriu não vão atrapalhar essas pausas que o bot dá?"

**Resposta Curta:** ✅ **NÃO, as correções NÃO atrapalham a estratégia!**

---

## 📊 Entendendo a Diferença

### O que é "Atividade" para o Watchdog?

O watchdog considera "atividade" como **processamento bem-sucedido de ticks**, não execução de operações. Vamos entender a diferença:

#### ❌ INATIVIDADE (Problema que o Watchdog Detecta)

```
Tick 1 → handleTick() → ❌ ERRO → Trava
Tick 2 → handleTick() → ❌ ERRO → Trava
Tick 3 → handleTick() → ❌ ERRO → Trava
...
[5 minutos depois]
Watchdog: 🚨 ALERTA! Nenhum tick foi processado!
```

**Causa:** Erro no código que impede processamento de ticks.  
**Sintoma:** Bot completamente travado, não responde a nada.

#### ✅ PAUSA ESTRATÉGICA (Comportamento Normal)

```
Candle M60 (1 hora) - Forex
├─ Minuto 0-35: WAITING_MIDPOINT
│  ├─ Tick 1 → handleTick() → ✅ Processa → Atualiza candle → Não faz nada ainda
│  ├─ Tick 2 → handleTick() → ✅ Processa → Atualiza candle → Não faz nada ainda
│  ├─ Tick 3 → handleTick() → ✅ Processa → Atualiza candle → Não faz nada ainda
│  └─ ... (centenas de ticks processados com sucesso)
│
├─ Minuto 35: PREDICTING
│  └─ Tick → handleTick() → ✅ Processa → Chama makePrediction() → Calcula gatilho
│
├─ Minuto 35-60: ARMED
│  ├─ Tick → handleTick() → ✅ Processa → Verifica gatilho → Ainda não atingiu
│  ├─ Tick → handleTick() → ✅ Processa → Verifica gatilho → Ainda não atingiu
│  └─ Tick → handleTick() → ✅ Processa → Gatilho atingido! → Entra em posição
│
└─ Minuto 35-60: ENTERED
   └─ Tick → handleTick() → ✅ Processa → Gerencia posição → Verifica early close
```

**Causa:** Lógica estratégica do bot (aguardar tempo configurado).  
**Sintoma:** Bot está ativo, processando ticks, mas aguardando momento certo.

---

## 🔍 Análise Técnica

### Como o handleTick Funciona

```typescript
private async handleTick(tick: DerivTick): Promise<void> {
  try {
    if (!this.isRunning) return;
    
    // 1. SEMPRE processa o tick (atualiza valores do candle)
    this.currentCandleHigh = Math.max(this.currentCandleHigh, tick.quote);
    this.currentCandleLow = Math.min(this.currentCandleLow, tick.quote);
    this.currentCandleClose = tick.quote;
    
    // 2. Calcula tempo decorrido
    const elapsedSeconds = Math.floor((tick.epoch - this.currentCandleTimestamp));
    
    // 3. Verifica se é hora de fazer predição (ex: 35 minutos = 2100 segundos)
    const waitTimeSeconds = this.waitTime * 60; // 35 * 60 = 2100
    if (elapsedSeconds >= waitTimeSeconds && this.state === "WAITING_MIDPOINT") {
      await this.makePrediction(elapsedSeconds); // SÓ AQUI faz predição
    }
    
    // 4. Se armado, verifica gatilho
    if (this.state === "ARMED" && this.prediction) {
      await this.checkTrigger(tick.quote, elapsedSeconds);
    }
    
    // 5. Se em posição, gerencia saída
    if (this.state === "ENTERED" && this.currentPositions.length > 0) {
      await this.managePosition(tick.quote, elapsedSeconds);
    }
    
    // 6. ✅ REGISTRA ATIVIDADE (tick foi processado com sucesso)
    if (this.inactivityWatchdog) {
      this.inactivityWatchdog.recordActivity(); // ← SEMPRE executa se chegou aqui
    }
  } catch (error) {
    // ❌ SÓ AQUI o watchdog NÃO registra atividade (porque houve erro)
  }
}
```

### O que o Watchdog Realmente Monitora

```typescript
// Watchdog verifica: "Há quanto tempo o handleTick NÃO chegou até o final?"

// Cenário 1: Pausa Estratégica (35 minutos esperando)
Minuto 0: Tick → handleTick() → ✅ Chegou ao final → recordActivity()
Minuto 1: Tick → handleTick() → ✅ Chegou ao final → recordActivity()
Minuto 2: Tick → handleTick() → ✅ Chegou ao final → recordActivity()
...
Minuto 35: Tick → handleTick() → ✅ Chegou ao final → recordActivity()
// Watchdog: ✅ Tudo OK! Última atividade há poucos segundos

// Cenário 2: Bot Travado (problema real)
Minuto 0: Tick → handleTick() → ❌ ERRO → NÃO chegou ao final
Minuto 1: Tick → handleTick() → ❌ ERRO → NÃO chegou ao final
Minuto 2: Tick → handleTick() → ❌ ERRO → NÃO chegou ao final
...
Minuto 5: Watchdog: 🚨 ALERTA! Última atividade há 5 minutos!
```

---

## 📈 Fluxo Visual: Forex M60 com waitTime = 35 minutos

```
TEMPO (minutos)  ESTADO              TICKS/SEGUNDO    WATCHDOG
─────────────────────────────────────────────────────────────
0                WAITING_MIDPOINT    ~1 tick/seg      ✅ Ativo
1                WAITING_MIDPOINT    ~1 tick/seg      ✅ Ativo
2                WAITING_MIDPOINT    ~1 tick/seg      ✅ Ativo
...              ...                 ...              ...
34               WAITING_MIDPOINT    ~1 tick/seg      ✅ Ativo
35               PREDICTING          ~1 tick/seg      ✅ Ativo
35.1             ARMED               ~1 tick/seg      ✅ Ativo
36               ARMED               ~1 tick/seg      ✅ Ativo
...              ...                 ...              ...
45               ARMED               ~1 tick/seg      ✅ Ativo
45.5             ENTERED             ~1 tick/seg      ✅ Ativo
46               ENTERED             ~1 tick/seg      ✅ Ativo
...              ...                 ...              ...
60               CANDLE_CLOSED       ~1 tick/seg      ✅ Ativo
```

**Observação Crítica:** Durante TODA a hora, o bot está recebendo e processando ~3600 ticks (1 tick/segundo × 3600 segundos). O watchdog registra atividade a cada tick processado.

---

## 🎯 Por Que 5 Minutos é Seguro?

### Frequência de Ticks da Deriv

A API da Deriv envia aproximadamente **1 tick por segundo** para ativos sintéticos e Forex. Isso significa:

- **1 minuto = ~60 ticks processados**
- **5 minutos = ~300 ticks processados**

Se o bot não processar **nenhum** desses 300 ticks por 5 minutos, algo está **definitivamente errado**.

### Cenários Possíveis

| Cenário | Ticks Processados (5 min) | Watchdog Dispara? |
|---------|---------------------------|-------------------|
| Bot aguardando 35 min (estratégia) | ~300 ticks | ❌ NÃO (atividade normal) |
| Bot aguardando 60 min (M60) | ~300 ticks | ❌ NÃO (atividade normal) |
| Bot travado por erro | 0 ticks | ✅ SIM (problema real) |
| Conexão WebSocket morta | 0 ticks | ✅ SIM (problema real) |

---

## 🔧 Ajuste de Threshold (Se Necessário)

Se você quiser ser ainda mais conservador, podemos aumentar o threshold:

```typescript
// Atual: 5 minutos
this.inactivityWatchdog = new InactivityWatchdog(5, async (inactiveTimeMs) => {
  // ...
});

// Conservador: 10 minutos
this.inactivityWatchdog = new InactivityWatchdog(10, async (inactiveTimeMs) => {
  // ...
});

// Muito conservador: 15 minutos
this.inactivityWatchdog = new InactivityWatchdog(15, async (inactiveTimeMs) => {
  // ...
});
```

**Recomendação:** Manter em **5 minutos** é seguro e eficaz. Se o bot não processar um único tick por 5 minutos, é um problema real que precisa ser detectado rapidamente.

---

## ✅ Conclusão

### As Correções NÃO Interferem Porque:

1. **Watchdog monitora processamento de ticks, não execução de trades**
   - Bot processa ~3600 ticks por hora, mesmo sem fazer trades
   - Pausas estratégicas não param o processamento de ticks

2. **Try-catch só captura erros reais**
   - Não interfere na lógica de espera (`if (elapsedSeconds >= waitTimeSeconds)`)
   - Só age quando há exceção, não durante operação normal

3. **Threshold de 5 minutos é muito maior que qualquer pausa de processamento**
   - Ticks chegam a cada ~1 segundo
   - 5 minutos sem processar um único tick = problema real

### O que Realmente Mudou:

- **Antes:** Erros travavam o bot silenciosamente
- **Depois:** Erros são capturados, logados e alertados
- **Estratégia:** Permanece 100% intacta e funcional

**Resultado:** Sistema mais robusto SEM alterar a lógica de trading! 🎯
