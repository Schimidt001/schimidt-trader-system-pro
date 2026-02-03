# Guia Rápido - Logs em Tempo Real

## 🎯 Como Usar os Novos Logs

### 1. Acessar a Aba LOGS
Na sua plataforma, acesse a aba **LOGS** para ver todos os eventos em tempo real.

### 2. Filtrar por Categoria

#### Logs da Estratégia SMC
- **SMC_PIPELINE** - Status do pipeline (início, sweep, choch, order block)
- **SMC_SIGNAL** - Sinais gerados (BUY/SELL)
- **SMC_ENTRY** - Condições de entrada
- **SMC_FILTER** - Filtros aplicados

#### Logs do Modo Institucional
- **INSTITUTIONAL_FSM** - Transições de estado (IDLE → WAIT_SWEEP → etc)
- **INSTITUTIONAL_FVG** - Fair Value Gaps (detecção e mitigação)
- **INSTITUTIONAL_SESSION** - Mudanças de sessão (ASIA/LONDON/NY)
- **INSTITUTIONAL_BUDGET** - Status do budget de trades
- **INSTITUTIONAL_DECISION** - Decisões finais (ALLOW/BLOCK/TRADE)
- **INSTITUTIONAL_CONTEXT** - Análise de contexto (BULLISH/BEARISH)

### 3. Entender os Emojis

#### Pipeline SMC
- 🚀 **INICIO_ANALISE** - Análise iniciada
- 🔍 **SWEEP_CHECK** - Verificando sweep
- 🔍 **CHOCH_CHECK** - Verificando CHoCH
- 🟥/🟩 **ORDER_BLOCK** - Order Block ativo
- 🏛️ **INSTITUTIONAL_CHECK** - Verificação institucional
- 🟢/🔴 **SINAL** - Sinal gerado (BUY/SELL)
- ⚪ **SEM SINAL** - Nenhum sinal gerado

#### Modo Institucional
- 🔄 **FSM TRANSITION** - Mudança de estado
- 🟩/🟥 **FVG DETECTADO** - Fair Value Gap encontrado
- ✅ **FVG MITIGADO** - FVG foi mitigado
- 🌍 **SESSÃO MUDOU** - Nova sessão iniciada
- ⏰ **TIMEOUT** - Estado expirou
- 🚫 **BUDGET ESGOTADO** - Limite de trades atingido
- 💹 **TRADE** - Trade executado
- 🟢/🔴/⚪ **CONTEXTO** - Análise de contexto

### 4. Interpretar os Status

#### Status do Pipeline
- **PROCESSING** - Em processamento
- **PASS** - Condição atendida
- **PENDING** - Aguardando condição
- **BLOCK** - Bloqueado
- **FAIL** - Falhou

#### Estados FSM
- **IDLE** - Aguardando condições
- **WAIT_SWEEP** - Aguardando sweep
- **WAIT_CHOCH** - Aguardando CHoCH
- **WAIT_FVG** - Aguardando FVG
- **WAIT_MITIGATION** - Aguardando mitigação
- **WAIT_ENTRY** - Pronto para entrada
- **COOLDOWN** - Em cooldown

### 5. Exemplos de Logs

#### Exemplo 1: Análise Completa SMC
```
🚀 INICIO_ANALISE | EURUSD | PROCESSING
   H1: 150 candles | M15: 200 candles | M5: 300 candles

🔍 SWEEP_CHECK | EURUSD | PASS
   Sweep HIGH confirmado em 1.08520

🔍 CHOCH_CHECK | EURUSD | PASS
   CHoCH BEARISH detectado em 1.08480

🟥 ORDER_BLOCK | EURUSD | PASS
   BEARISH | 1.08500 - 1.08480

🟢 SINAL SELL | EURUSD | Confiança: 85%
   Entrada confirmada em Order Block
```

#### Exemplo 2: Fluxo Institucional Completo
```
🌍 SESSÃO MUDOU | EURUSD | ASIA → LONDON

🟢 CONTEXTO BULLISH | EURUSD | ✅ PERMITIDO
   Preço no bottom do range

🔄 FSM TRANSITION | EURUSD | IDLE → WAIT_SWEEP
   Sessão anterior disponível

🔄 FSM TRANSITION | EURUSD | WAIT_SWEEP → WAIT_CHOCH
   Sweep HIGH confirmado em 1.08520

🔄 FSM TRANSITION | EURUSD | WAIT_CHOCH → WAIT_FVG
   CHoCH BEARISH confirmado em 1.08480

🟥 FVG BEARISH DETECTADO | EURUSD
   Range: 1.08450 - 1.08380 | Gap: 7.0 pips

🔄 FSM TRANSITION | EURUSD | WAIT_FVG → WAIT_MITIGATION
   FVG detectado

✅ FVG MITIGADO | EURUSD
   Preço: 1.08410 | Penetração: 42.8%

🔄 FSM TRANSITION | EURUSD | WAIT_MITIGATION → WAIT_ENTRY
   FVG mitigado

💹 DECISÃO INSTITUCIONAL | EURUSD | TRADE | SELL
   Trade executado

🔄 FSM TRANSITION | EURUSD | WAIT_ENTRY → COOLDOWN
   Trade SELL executado em 1.08410
```

#### Exemplo 3: Entrada Bloqueada
```
🚀 INICIO_ANALISE | GBPUSD | PROCESSING

🔍 SWEEP_CHECK | GBPUSD | PASS
   Sweep LOW confirmado

🔍 CHOCH_CHECK | GBPUSD | PASS
   CHoCH BULLISH detectado

🟩 ORDER_BLOCK | GBPUSD | PASS
   BULLISH ativo

🏛️ INSTITUTIONAL_CHECK | GBPUSD | BLOCK
   FSM em WAIT_FVG - aguardando FVG

⚪ SEM SINAL | GBPUSD
   Institucional: FSM em WAIT_FVG - aguardando condições
```

#### Exemplo 4: Budget Esgotado
```
🌍 SESSÃO MUDOU | XAUUSD | LONDON → NY

🚫 BUDGET ESGOTADO | XAUUSD | Sessão: NY
   Trades: 2/2

⚪ SEM SINAL | XAUUSD
   Budget esgotado: máx trades/sessão atingido
```

#### Exemplo 5: Timeout FSM
```
⏰ TIMEOUT INSTITUCIONAL | EURUSD
   Estado: WAIT_FVG | Decorrido: 32.5min / 30min

🔄 FSM TRANSITION | EURUSD | WAIT_FVG → IDLE
   Timeout: WAIT_FVG expirou após 32.5 minutos
```

### 6. Configurar Verbose Logging

Para ver logs mais detalhados, habilite o **Verbose Logging** nas configurações:

1. Acesse as configurações da estratégia SMC
2. Habilite "Verbose Logging"
3. Salve as configurações

Com verbose logging habilitado, você verá:
- Logs de início de análise
- Status de sweep (mesmo quando pendente)
- Status de CHoCH (mesmo quando pendente)
- Verificações de entrada (mesmo quando rejeitadas)
- Logs de nenhum sinal

### 7. Troubleshooting

#### Logs não aparecem na aba LOGS
1. Verificar se o bot está rodando
2. Verificar se há dados de mercado chegando
3. Verificar console do navegador (fallback sempre ativo)
4. Verificar logs do Railway

#### Muitos logs aparecendo
1. Desabilitar "Verbose Logging" nas configurações
2. Rate limiting está ativo (1 log similar por segundo)
3. Logs críticos sempre aparecem (force log)

#### Logs aparecem no console mas não na aba LOGS
1. Verificar conexão com banco de dados
2. Verificar se logger foi inicializado
3. Verificar logs de erro no console

### 8. Dicas de Uso

#### Monitorar Modo Institucional
Foque nos logs:
- 🔄 **FSM TRANSITION** - Para ver o fluxo
- 🟥/🟩 **FVG DETECTADO** - Para ver oportunidades
- ✅ **FVG MITIGADO** - Para ver entradas potenciais
- 💹 **DECISÃO INSTITUCIONAL** - Para ver trades

#### Monitorar Estratégia SMC
Foque nos logs:
- 🔍 **SWEEP_CHECK** - Para ver liquidez
- 🔍 **CHOCH_CHECK** - Para ver mudança de estrutura
- 🟥/🟩 **ORDER_BLOCK** - Para ver zonas de entrada
- 🟢/🔴 **SINAL** - Para ver trades

#### Debugar Problemas
Foque nos logs:
- ⚠️ **DADOS INSUFICIENTES** - Problema de dados
- 🚫 **FILTRO ATIVO** - Entrada bloqueada por filtro
- ❌ **ERRO** - Erros do sistema
- ⚪ **SEM SINAL** - Razão de não entrada

### 9. Referência Rápida

| Emoji | Significado | Categoria |
|-------|-------------|-----------|
| 🚀 | Início de análise | SMC_PIPELINE |
| 🔍 | Verificação | SMC_PIPELINE |
| 🟩/🟥 | Order Block / FVG | SMC_OB / INSTITUTIONAL_FVG |
| 🔄 | Transição FSM | INSTITUTIONAL_FSM |
| 🌍 | Mudança de sessão | INSTITUTIONAL_SESSION |
| ✅ | Confirmado/Mitigado | Vários |
| 🚫 | Bloqueado/Esgotado | FILTER / BUDGET |
| 💹 | Trade executado | INSTITUTIONAL_DECISION |
| ⏰ | Timeout | INSTITUTIONAL_FSM |
| 🟢/🔴/⚪ | Sinal/Contexto | SIGNAL / CONTEXT |
| ⚠️ | Aviso | WARN |
| ❌ | Erro | ERROR |

---

**Dica Final**: Mantenha a aba LOGS aberta durante o trading para monitoramento em tempo real! 📊
