# Conhecimento Completo da Plataforma - Schimidt Trader System PRO

**Data de Criação:** 06 de Novembro de 2025  
**Última Atualização:** 06 de Novembro de 2025  
**Propósito:** Documentação completa para manutenção e desenvolvimento futuro  
**Autor:** Manus AI

---

## 📋 ÍNDICE

1. [Visão Geral da Arquitetura](#visão-geral-da-arquitetura)
2. [Stack Tecnológico](#stack-tecnológico)
3. [Estrutura de Diretórios](#estrutura-de-diretórios)
4. [Banco de Dados](#banco-de-dados)
5. [Fluxo de Dados](#fluxo-de-dados)
6. [Sistema de Trading](#sistema-de-trading)
7. [Filtro de Horário](#filtro-de-horário)
8. [IA Hedge Inteligente](#ia-hedge-inteligente)
9. [Engine de Predição](#engine-de-predição)
10. [Configurações e Parâmetros](#configurações-e-parâmetros)
11. [Estados do Bot](#estados-do-bot)
12. [Gestão de Risco](#gestão-de-risco)
13. [Logs e Monitoramento](#logs-e-monitoramento)
14. [Problemas Conhecidos](#problemas-conhecidos)

---

## 1. VISÃO GERAL DA ARQUITETURA

### Descrição
Sistema de trading automatizado 24/7 para DERIV com engine de predição proprietária baseada no Algoritmo Fibonacci da Amplitude (84.85% de assertividade).

### Componentes Principais

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React 19)                       │
│  Dashboard │ Configurações │ Logs │ Gráfico M15 em Tempo Real│
└──────────────────────┬──────────────────────────────────────┘
                       │ tRPC (Type-safe API)
┌──────────────────────┴──────────────────────────────────────┐
│                  BACKEND (Node.js + Express)                 │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────┐ │
│  │ Trading Bot  │  │ DERIV API   │  │ Prediction Engine  │ │
│  │ (TypeScript) │──│ (WebSocket) │──│ (Python Flask)     │ │
│  └──────────────┘  └─────────────┘  └────────────────────┘ │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────┐
│              BANCO DE DADOS (MySQL/TiDB)                     │
│  users │ config │ candles │ positions │ metrics │ eventLogs │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. STACK TECNOLÓGICO

### Frontend
- **React 19** - Framework UI
- **TypeScript** - Type safety
- **Tailwind CSS 4** - Styling
- **shadcn/ui** - Componentes UI
- **tRPC Client** - API type-safe
- **Recharts** - Gráficos
- **Wouter** - Routing
- **Sonner** - Toast notifications

### Backend
- **Node.js 22** - Runtime
- **Express 4** - Web server
- **tRPC 11** - API layer type-safe
- **Drizzle ORM** - Database ORM
- **WebSocket** - DERIV API connection
- **Zod** - Schema validation

### Prediction Engine
- **Python 3.11** - Runtime
- **Flask** - Micro web framework
- **scikit-learn** - Machine learning
- **NumPy** - Computação numérica

### Infraestrutura
- **MySQL/TiDB** - Banco de dados relacional
- **Railway** - Deployment platform
- **Manus OAuth** - Autenticação

---

## 3. ESTRUTURA DE DIRETÓRIOS

```
schimidt-trader-system-pro/
├── client/                           # Frontend React
│   ├── public/                       # Assets estáticos
│   └── src/
│       ├── pages/                    # Páginas principais
│       │   ├── Dashboard.tsx         # Dashboard principal
│       │   ├── Settings.tsx          # Configurações do bot
│       │   └── Logs.tsx              # Visualização de logs
│       ├── components/               # Componentes UI (shadcn/ui)
│       │   └── ui/                   # Componentes base
│       ├── lib/                      # Utilitários
│       │   └── trpc.ts               # Cliente tRPC
│       ├── contexts/                 # React contexts
│       ├── hooks/                    # Custom hooks
│       ├── const.ts                  # Constantes
│       └── App.tsx                   # Routes e setup
│
├── server/                           # Backend Node.js
│   ├── _core/                        # Framework base
│   │   ├── trpc.ts                   # Setup tRPC
│   │   ├── context.ts                # Context tRPC
│   │   ├── oauth.ts                  # Autenticação Manus
│   │   └── sdk.ts                    # DERIV SDK
│   ├── deriv/                        # Integração DERIV
│   │   ├── derivService.ts           # Cliente WebSocket API
│   │   └── tradingBot.ts             # Lógica principal do bot
│   ├── prediction/                   # Engine de predição
│   │   ├── engine_server.py          # Servidor Flask
│   │   ├── prediction_engine.py      # Algoritmo Fibonacci
│   │   ├── predictionService.ts      # Cliente Node.js
│   │   └── engineManager.ts          # Gerenciador de processo
│   ├── ai/                           # IA Hedge
│   │   ├── hedgeStrategy.ts          # Lógica das 3 estratégias
│   │   └── hedgeConfigSchema.ts      # Validação Zod
│   ├── routers.ts                    # Rotas tRPC
│   ├── db.ts                         # Funções do banco
│   └── db_reset.ts                   # Reset de dados
│
├── filtro-horario/                   # Módulo Filtro de Horário
│   ├── hourlyFilterLogic.ts          # Classe principal
│   ├── types.ts                      # Tipos TypeScript
│   ├── test.ts                       # Testes unitários
│   └── README.md                     # Documentação
│
├── drizzle/                          # Migrations e schema
│   ├── schema.ts                     # Schema do banco
│   ├── migrations/                   # Migrations SQL
│   └── meta/                         # Metadados Drizzle
│
├── shared/                           # Código compartilhado
│   └── types/                        # Tipos compartilhados
│
├── package.json                      # Dependências Node.js
├── tsconfig.json                     # Config TypeScript
├── drizzle.config.ts                 # Config Drizzle ORM
└── README.md                         # Documentação principal
```

---

## 4. BANCO DE DADOS

### Schema Completo

#### Tabela: `users`
```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  openId VARCHAR(64) NOT NULL UNIQUE,
  name TEXT,
  email VARCHAR(320),
  loginMethod VARCHAR(64),
  role ENUM('user', 'admin') DEFAULT 'user' NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  lastSignedIn TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
```

#### Tabela: `config`
```sql
CREATE TABLE config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  mode ENUM('DEMO', 'REAL') DEFAULT 'DEMO' NOT NULL,
  tokenDemo TEXT,
  tokenReal TEXT,
  symbol VARCHAR(50) DEFAULT 'R_100' NOT NULL,
  stake INT DEFAULT 10 NOT NULL,                    -- em centavos
  stopDaily INT DEFAULT 10000 NOT NULL,             -- em centavos
  takeDaily INT DEFAULT 50000 NOT NULL,             -- em centavos
  lookback INT DEFAULT 500 NOT NULL,
  triggerOffset INT DEFAULT 16,
  profitThreshold INT DEFAULT 90,
  waitTime INT DEFAULT 8,
  timeframe INT DEFAULT 900 NOT NULL,               -- 900 (M15) ou 1800 (M30)
  
  -- Re-predição M30
  repredictionEnabled BOOLEAN DEFAULT TRUE NOT NULL,
  repredictionDelay INT DEFAULT 300 NOT NULL,
  
  -- Tipo de contrato e barreiras
  contractType ENUM('RISE_FALL', 'TOUCH', 'NO_TOUCH') DEFAULT 'RISE_FALL' NOT NULL,
  barrierHigh VARCHAR(20) DEFAULT '3.00',
  barrierLow VARCHAR(20) DEFAULT '-3.00',
  forexMinDurationMinutes INT DEFAULT 15 NOT NULL,
  
  -- Filtro de Horário
  hourlyFilterEnabled BOOLEAN DEFAULT FALSE NOT NULL,
  hourlyFilterMode ENUM('IDEAL', 'COMPATIBLE', 'GOLDEN', 'COMBINED', 'CUSTOM') DEFAULT 'COMBINED' NOT NULL,
  hourlyFilterCustomHours TEXT,                     -- JSON array
  hourlyFilterGoldHours TEXT,                       -- JSON array (máx 2)
  hourlyFilterGoldMultiplier INT DEFAULT 200 NOT NULL,
  
  -- IA Hedge
  hedgeEnabled BOOLEAN DEFAULT TRUE NOT NULL,
  hedgeConfig TEXT,                                 -- JSON
  
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
);
```

#### Tabela: `candles`
```sql
CREATE TABLE candles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  symbol VARCHAR(50) NOT NULL,
  timeframe VARCHAR(10) DEFAULT 'M15' NOT NULL,
  timestampUtc BIGINT NOT NULL,                     -- Unix timestamp
  open VARCHAR(20) NOT NULL,
  high VARCHAR(20) NOT NULL,
  low VARCHAR(20) NOT NULL,
  close VARCHAR(20) NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
```

#### Tabela: `positions`
```sql
CREATE TABLE positions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  contractId VARCHAR(100) UNIQUE,
  symbol VARCHAR(50) NOT NULL,
  direction ENUM('up', 'down') NOT NULL,
  stake INT NOT NULL,                               -- em centavos
  entryPrice VARCHAR(20) NOT NULL,
  exitPrice VARCHAR(20),
  predictedClose VARCHAR(20) NOT NULL,
  trigger VARCHAR(20) NOT NULL,
  phase VARCHAR(50),
  strategy VARCHAR(50),
  confidence VARCHAR(20),
  pnl INT,                                          -- em centavos
  status ENUM('ARMED', 'ENTERED', 'CLOSED', 'CANCELLED') NOT NULL,
  candleTimestamp BIGINT NOT NULL,
  entryTime TIMESTAMP,
  exitTime TIMESTAMP,
  
  -- IA Hedge
  isHedge BOOLEAN DEFAULT FALSE NOT NULL,
  parentPositionId INT,
  hedgeAction VARCHAR(50),
  hedgeReason TEXT,
  
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
);
```

#### Tabela: `metrics`
```sql
CREATE TABLE metrics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  date VARCHAR(10) NOT NULL,                        -- YYYY-MM-DD
  period ENUM('daily', 'monthly') NOT NULL,
  totalTrades INT DEFAULT 0 NOT NULL,
  wins INT DEFAULT 0 NOT NULL,
  losses INT DEFAULT 0 NOT NULL,
  pnl INT DEFAULT 0 NOT NULL,                       -- em centavos
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
);
```

#### Tabela: `eventLogs`
```sql
CREATE TABLE eventLogs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  eventType VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  data TEXT,                                        -- JSON
  timestampUtc BIGINT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
```

#### Tabela: `botState`
```sql
CREATE TABLE botState (
  userId INT PRIMARY KEY,
  state VARCHAR(50) NOT NULL,
  isRunning BOOLEAN DEFAULT FALSE NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
);
```

---

## 5. FLUXO DE DADOS

### Fluxo de Configuração

```
Frontend (Settings.tsx)
  ↓ Usuário edita configurações
  ↓ Clica em "Salvar"
  ↓ trpc.config.update.mutate()
  ↓
Backend (routers.ts)
  ↓ Valida com Zod schema
  ↓ upsertConfig()
  ↓
Database (config table)
  ↓ Salva configurações
  ↓
Bot (tradingBot.ts)
  ↓ Carrega no start()
  ↓ Aplica configurações
```

### Fluxo de Trading

```
DERIV API (WebSocket)
  ↓ Tick recebido
  ↓
TradingBot.handleTick()
  ↓ Verifica filtro de horário
  ↓ Constrói candle em tempo real
  ↓ Aguarda 8 minutos (waitTime)
  ↓
Prediction Engine (Python)
  ↓ Recebe dados do candle parcial
  ↓ Aplica Algoritmo Fibonacci
  ↓ Retorna predição
  ↓
TradingBot
  ↓ Calcula gatilho (predição ± offset)
  ↓ Monitora preço
  ↓ Executa trade quando gatilho atingido
  ↓
DERIV API
  ↓ Abre posição
  ↓ Monitora contrato
  ↓
IA Hedge (se habilitada)
  ↓ Analisa posição a cada tick
  ↓ Decide: HOLD, REINFORCE, HEDGE, REVERSAL_EDGE
  ↓ Abre hedge se necessário
  ↓
TradingBot
  ↓ Monitora até fechamento
  ↓ Calcula PnL
  ↓ Salva no banco
  ↓ Atualiza métricas
```

---

## 6. SISTEMA DE TRADING

### Lógica de Entrada

1. **Coleta de Histórico**
   - Busca últimos N candles (lookback)
   - Salva no banco de dados

2. **Espera do Midpoint**
   - Aguarda `waitTime` minutos do candle atual
   - Padrão: 8 minutos de um candle M15

3. **Captura de Dados Parciais**
   - Open, High, Low do candle atual
   - Preço atual (current)

4. **Predição**
   - Envia para engine Python
   - Recebe predição de fechamento

5. **Cálculo do Gatilho**
   - UP: `gatilho = predição - triggerOffset`
   - DOWN: `gatilho = predição + triggerOffset`
   - Padrão: offset de 16 pontos

6. **Monitoramento**
   - Monitora preço em tempo real
   - Quando preço cruza gatilho → executa trade

7. **Execução**
   - Abre CALL (se UP) ou PUT (se DOWN)
   - Duração: até fim do candle
   - Salva posição no banco

### Tipos de Contrato

#### RISE_FALL (Padrão)
- **CALL:** Aposta que preço sobe
- **PUT:** Aposta que preço desce
- **Sem barreiras**

#### TOUCH
- **ONE_TOUCH:** Preço deve tocar barreira
- **Barreira:** `predictedClose + barrierHigh`

#### NO_TOUCH
- **NO_TOUCH:** Preço NÃO deve tocar barreira
- **Barreira:** `predictedClose + barrierLow`

---

## 7. FILTRO DE HORÁRIO

### Conceito
Sistema que permite/bloqueia operações baseado em horários GMT específicos.

### Modos Predefinidos

| Modo | Horários GMT | Descrição |
|------|--------------|-----------|
| **IDEAL** | 16h, 18h | Máxima qualidade (2 horários) |
| **COMPATIBLE** | 3h, 6h, 9h, 10h, 13h, 16h, 17h, 18h | Padrão recuo + continuação (8 horários) |
| **GOLDEN** | 5h, 12h, 16h, 18h, 20h, 21h, 22h, 23h | Candles mais limpos (8 horários) |
| **COMBINED** | 5h, 6h, 12h, 16h, 17h, 18h, 20h, 21h, 22h, 23h | Balanceado - RECOMENDADO (10 horários) |
| **CUSTOM** | Definido pelo usuário | Personalizado |

### Horários GOLD
- Máximo de 2 horários especiais
- Stake é multiplicado (padrão: 2x)
- Exemplo: 16h e 18h com stake 2x

### Funcionamento

#### Verificação Contínua
```typescript
// A CADA TICK (< 1 segundo)
if (hourlyFilter && !hourlyFilter.isAllowedHour()) {
  // Horário NÃO permitido
  state = "WAITING_NEXT_HOUR";
  return; // Não processa nada
}

if (hourlyFilter && hourlyFilter.isAllowedHour() && state === "WAITING_NEXT_HOUR") {
  // Horário permitido, reativar
  state = "WAITING_MIDPOINT";
}
```

#### Estados Relacionados
- **WAITING_NEXT_HOUR:** Bot em stand-by aguardando horário permitido
- **WAITING_MIDPOINT:** Bot ativo, aguardando momento de predição

### Arquivos Principais
- `filtro-horario/hourlyFilterLogic.ts` - Classe principal
- `filtro-horario/types.ts` - Tipos e presets
- `server/deriv/tradingBot.ts` - Integração no bot
- `client/src/pages/Settings.tsx` - Interface de configuração
- `client/src/pages/Dashboard.tsx` - Indicador visual

---

## 8. IA HEDGE INTELIGENTE

### Conceito
Sistema de proteção e reforço de posições baseado em análise matemática em tempo real.

### 3 Estratégias Matemáticas

#### Estratégia 1: Detecção de Reversão
**Objetivo:** Abrir hedge quando preço vai contra predição

**Gatilho:**
- Preço > 60% do range na direção oposta
- Exemplo: Predição UP, mas preço caindo 60%+

**Ação:**
- Abre posição oposta (CALL→PUT ou PUT→CALL)
- Stake multiplicado (padrão: 1.5x)

**Parâmetros:**
- `reversalDetectionMinute`: 12.0 (min 8.0, max 14.0)
- `reversalThreshold`: 0.60 (min 0.30, max 0.95)
- `reversalStakeMultiplier`: 1.5 (min 0.1, max 2.0)

#### Estratégia 2: Reforço em Pullback
**Objetivo:** Reforçar posição quando movimento correto mas lento

**Gatilho:**
- Progresso entre 15% e 40% do esperado
- Exemplo: Predição UP, preço subindo mas devagar

**Ação:**
- Abre segunda posição na MESMA direção
- Stake multiplicado (padrão: 1.4x)

**Parâmetros:**
- `pullbackDetectionStart`: 12.0 (min 8.0, max 13.0)
- `pullbackDetectionEnd`: 14.0 (min 10.0, max 14.0)
- `pullbackMinProgress`: 0.15 (min 0.05, max 0.50)
- `pullbackMaxProgress`: 0.40 (min 0.20, max 0.80)
- `pullbackStakeMultiplier`: 1.4 (min 0.1, max 1.5)

#### Estratégia 3: Reversão de Ponta
**Objetivo:** Apostar em reversão quando preço esticou demais

**Gatilho:**
- Preço > 80% do range na direção prevista
- Exemplo: Predição UP, preço subiu 80%+ (exaustão)

**Ação:**
- Abre posição oposta (aposta em correção)
- Stake multiplicado (padrão: 1.5x)

**Parâmetros:**
- `edgeReversalMinute`: 12.0 (min 12.0, max 14.5)
- `edgeExtensionThreshold`: 0.80 (min 0.60, max 0.95)
- `edgeStakeMultiplier`: 1.5 (min 0.1, max 1.5)

### Janela de Análise
- `analysisStartMinute`: 12.0 (min 8.0, max 13.0)
- `analysisEndMinute`: 14.0 (min 12.0, max 14.0)
- Padrão: últimos 3 minutos do candle M15

### Validação e Segurança

#### Camada 1: Schema Zod
```typescript
// hedgeConfigSchema.ts
export const hedgeConfigSchema = z.object({
  enabled: z.boolean().default(true),
  reversalDetectionMinute: z.number().min(8.0).max(14.0).default(12.0),
  // ... outros campos com limites
}).refine(/* validações lógicas */);
```

#### Camada 2: Fallback Seguro
```typescript
export function validateHedgeConfig(config: unknown): HedgeConfigValidated {
  try {
    return hedgeConfigSchema.parse(config);
  } catch (error) {
    console.warn("Configuração inválida, usando padrões");
    return DEFAULT_HEDGE_CONFIG;
  }
}
```

**Garantia:** É IMPOSSÍVEL quebrar o sistema com valores inválidos!

### Arquivos Principais
- `server/ai/hedgeStrategy.ts` - Lógica das 3 estratégias
- `server/ai/hedgeConfigSchema.ts` - Validação Zod
- `server/deriv/tradingBot.ts` - Integração no bot
- `client/src/pages/Settings.tsx` - Interface de configuração

---

## 9. ENGINE DE PREDIÇÃO

### Algoritmo Fibonacci da Amplitude
- **Assertividade:** 84.85%
- **Timeframe:** M15 (15 minutos)
- **Método:** Análise de fase + descoberta de padrões

### Entrada
```python
{
  "symbol": "R_100",
  "tf": "M15",
  "history": [
    {
      "abertura": 48255.20,
      "minima": 48240.10,
      "maxima": 48270.50,
      "fechamento": 48260.00,
      "timestamp": 1699300800
    },
    # ... 49 candles anteriores
  ],
  "partial_current": {
    "timestamp_open": 1699304400,
    "elapsed_seconds": 480,  # 8 minutos
    "abertura": 48260.00,
    "minima_parcial": 48250.00,
    "maxima_parcial": 48275.00
  }
}
```

### Processamento
1. Calcula amplitude = high - low
2. Aplica sequência Fibonacci
3. Descobre fase do candle
4. Projeta fechamento baseado em padrões históricos

### Saída
```python
{
  "prediction": 48255.18,
  "direction": "down",
  "phase": "Fibonacci da Amplitude",
  "strategy": "Fibonacci da Amplitude",
  "confidence": 0.8485
}
```

### Integração
```typescript
// Backend chama engine via HTTP
const prediction = await predictionService.predict({
  open: candle.open,
  high: candle.high,
  low: candle.low,
  current: currentPrice
});
```

### Arquivos Principais
- `server/prediction/engine_server.py` - Servidor Flask (porta 5070)
- `server/prediction/prediction_engine.py` - Algoritmo Fibonacci
- `server/prediction/predictionService.ts` - Cliente Node.js
- `server/prediction/engineManager.ts` - Gerenciador de processo
- `server/prediction/modelo_otimizado_v2.pkl` - Modelo treinado

---

## 10. CONFIGURAÇÕES E PARÂMETROS

### Configurações Gerais

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `mode` | DEMO/REAL | DEMO | Modo de operação |
| `tokenDemo` | string | - | Token API DERIV DEMO |
| `tokenReal` | string | - | Token API DERIV REAL |
| `symbol` | string | R_100 | Ativo sintético |
| `stake` | number | 10 | Valor por trade (centavos) |
| `stopDaily` | number | 10000 | Stop diário (centavos) |
| `takeDaily` | number | 50000 | Take diário (centavos) |
| `lookback` | number | 500 | Candles históricos |
| `triggerOffset` | number | 16 | Offset do gatilho (pontos) |
| `profitThreshold` | number | 90 | Early close threshold (%) |
| `waitTime` | number | 8 | Tempo de espera (minutos) |
| `timeframe` | number | 900 | Timeframe (900=M15, 1800=M30) |

### Re-predição M30

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `repredictionEnabled` | boolean | true | Habilitar re-predição |
| `repredictionDelay` | number | 300 | Delay em segundos (5 min) |

### Tipo de Contrato

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `contractType` | enum | RISE_FALL | RISE_FALL, TOUCH, NO_TOUCH |
| `barrierHigh` | string | 3.00 | Barreira superior (pontos) |
| `barrierLow` | string | -3.00 | Barreira inferior (pontos) |
| `forexMinDurationMinutes` | number | 15 | Duração mínima Forex |

### Filtro de Horário

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `hourlyFilterEnabled` | boolean | false | Habilitar filtro |
| `hourlyFilterMode` | enum | COMBINED | Modo do filtro |
| `hourlyFilterCustomHours` | JSON array | [] | Horários personalizados |
| `hourlyFilterGoldHours` | JSON array | [] | Horários GOLD (máx 2) |
| `hourlyFilterGoldMultiplier` | number | 200 | Multiplicador stake (100=1x) |

### IA Hedge

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `hedgeEnabled` | boolean | true | Habilitar IA Hedge |
| `hedgeConfig` | JSON | - | Configurações das 3 estratégias |

---

## 11. ESTADOS DO BOT

### Estados Principais

| Estado | Descrição | Próximo Estado |
|--------|-----------|----------------|
| **IDLE** | Parado, aguardando início | COLLECTING |
| **COLLECTING** | Coletando histórico de candles | WAITING_MIDPOINT |
| **WAITING_MIDPOINT** | Aguardando 8 minutos do candle | PREDICTING |
| **PREDICTING** | Chamando engine de predição | ARMED |
| **ARMED** | Entrada armada, aguardando gatilho | POSITION_OPEN |
| **POSITION_OPEN** | Posição aberta, monitorando | WAITING_NEXT_CANDLE |
| **WAITING_NEXT_CANDLE** | Aguardando próximo candle | WAITING_MIDPOINT |
| **WAITING_NEXT_HOUR** | Stand-by por filtro de horário | WAITING_MIDPOINT |
| **LOCK_RISK** | Bloqueado por stop/take diário | IDLE |
| **ERROR_API** | Erro de comunicação com API | - |
| **DISCONNECTED** | Desconectado da DERIV | - |

### Transições de Estado

```
IDLE
  ↓ start()
COLLECTING
  ↓ histórico coletado
WAITING_MIDPOINT
  ↓ 8 minutos passados
PREDICTING
  ↓ predição recebida
ARMED
  ↓ gatilho atingido
POSITION_OPEN
  ↓ posição fechada
WAITING_NEXT_CANDLE
  ↓ novo candle iniciado
WAITING_MIDPOINT
  (ciclo continua)
```

### Estado no Frontend

```typescript
// client/src/const.ts
export const BOT_STATES = {
  IDLE: "⚪ Parado",
  COLLECTING: "🔄 Coletando Dados",
  WAITING_MIDPOINT: "⏳ Aguardando Momento",
  PREDICTING: "🧠 Analisando",
  ARMED: "🎯 Entrada Armada",
  POSITION_OPEN: "📈 Posição Aberta",
  WAITING_NEXT_CANDLE: "⏸️ Aguardando Próximo Candle",
  WAITING_NEXT_HOUR: "⚠️ STAND BY - Horário não permitido",
  LOCK_RISK: "🔒 Bloqueado (Stop/Take)",
  ERROR_API: "❌ Erro de API",
  DISCONNECTED: "🔌 Desconectado",
} as const;
```

---

## 12. GESTÃO DE RISCO

### Stop Diário
- **Objetivo:** Limitar prejuízo máximo por dia
- **Padrão:** $100.00 (10000 centavos)
- **Comportamento:** Quando atingido, bot entra em `LOCK_RISK`

### Take Diário
- **Objetivo:** Garantir lucro alvo por dia
- **Padrão:** $500.00 (50000 centavos)
- **Comportamento:** Quando atingido, bot entra em `LOCK_RISK`

### Early Close
- **Objetivo:** Encerrar posição com lucro garantido
- **Gatilho:** Payout ≥ 90% antes do vencimento
- **Comportamento:** Fecha posição automaticamente

### Encerramento Automático
- **Objetivo:** Evitar perda por vencimento
- **Gatilho:** 20 segundos antes do fim do candle
- **Comportamento:** Força fechamento da posição

### 1 Trade por Candle
- **Objetivo:** Evitar overtrading
- **Comportamento:** Após abrir posição, aguarda próximo candle

### Idempotência
- **Objetivo:** Prevenir duplicação de ordens
- **Comportamento:** Verifica se já existe posição no candle atual

---

## 13. LOGS E MONITORAMENTO

### Tipos de Eventos

| Tipo | Descrição |
|------|-----------|
| `BOT_STARTED` | Bot iniciado |
| `BOT_STOPPED` | Bot parado |
| `BOT_RESTARTED` | Bot reiniciado |
| `CANDLE_COLLECTED` | Histórico coletado |
| `CANDLE_INITIALIZED` | Novo candle iniciado |
| `PHASE_STRATEGY_DISCOVERED` | Fase e estratégia descobertas |
| `PREDICTION` | Predição realizada |
| `ENTRY_ARMED` | Entrada armada |
| `POSITION_OPENED` | Posição aberta |
| `POSITION_CLOSED` | Posição fechada |
| `HOURLY_FILTER_CONFIG` | Filtro de horário configurado |
| `HOURLY_FILTER_BLOCKED` | Bot bloqueado por horário |
| `HOURLY_FILTER_ACTIVATED` | Bot reativado por horário |
| `GOLD_HOUR_ACTIVE` | Horário GOLD ativo |
| `HEDGE_STATUS` | Status da IA Hedge |
| `HEDGE_OPENED` | Hedge aberto |
| `STOP_DAILY_HIT` | Stop diário atingido |
| `TAKE_DAILY_HIT` | Take diário atingido |
| `ERROR` | Erro genérico |
| `CONFIG_UPDATED` | Configuração atualizada |

### Estrutura de Log

```typescript
{
  id: number,
  userId: number,
  eventType: string,
  message: string,
  data: string | null,  // JSON
  timestampUtc: number,
  createdAt: Date
}
```

### Visualização
- **Dashboard:** Últimos 10 eventos
- **Página Logs:** Histórico completo com filtros

---

## 14. PROBLEMAS CONHECIDOS

### Bug #1: Array Vazio no Filtro de Horário
**Status:** 🔴 CRÍTICO - IDENTIFICADO

**Descrição:**
Quando `hourlyFilterCustomHours` está vazio no banco de dados, o bot SEMPRE fica em STAND BY, independente do horário.

**Causa:**
- Frontend não valida array vazio antes de salvar
- Backend não valida conteúdo do array
- Bot não aplica fallback corretamente para modo CUSTOM

**Solução Proposta:**
1. Validação no frontend (impedir salvamento de array vazio)
2. Validação no backend (schema Zod com refine)
3. Fallback robusto no bot (usar preset COMBINED se vazio)

**Arquivos Afetados:**
- `client/src/pages/Settings.tsx`
- `server/routers.ts`
- `server/deriv/tradingBot.ts`

**Prioridade:** 🔥 URGENTE

---

## 📝 NOTAS FINAIS

### Boas Práticas
1. **NUNCA** modificar `tradingBot.ts` sem entender o fluxo completo
2. **SEMPRE** testar em modo DEMO antes de REAL
3. **SEMPRE** validar dados no frontend E backend
4. **SEMPRE** usar fallbacks seguros para configurações críticas
5. **SEMPRE** logar eventos importantes para auditoria

### Contatos e Suporte
- **Repositório:** https://github.com/Schimidt001/schimidt-trader-system-pro
- **Deployment:** Railway
- **Banco de Dados:** TiDB (MySQL compatível)

### Histórico de Atualizações
- **06/11/2025:** Documentação completa criada
- **06/11/2025:** Bug do filtro de horário identificado

---

**Documento mantido por:** Manus AI  
**Última revisão:** 06 de Novembro de 2025  
**Versão:** 1.0.0
