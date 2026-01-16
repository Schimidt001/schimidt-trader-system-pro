# Schimidt Trader System PRO

Sistema de Trading Automatizado 24/7 para DERIV com Engine de Predição Proprietária baseada no Algoritmo Fibonacci da Amplitude.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Funcionalidades](#funcionalidades)
- [Tecnologias](#tecnologias)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Uso](#uso)
- [Engine de Predição](#engine-de-predição)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [API e Endpoints](#api-e-endpoints)
- [Banco de Dados](#banco-de-dados)
- [Troubleshooting](#troubleshooting)

## 🎯 Visão Geral

O **Schimidt Trader System PRO** é uma plataforma completa de trading automatizado que opera 24/7 em ativos sintéticos da DERIV. O sistema utiliza uma engine de predição proprietária baseada no **Algoritmo Fibonacci da Amplitude** com **84.85% de assertividade** para prever o fechamento de candles (M15, M30, M60) e executar trades automaticamente.

### Características Principais

- ✅ **Trading 100% Automatizado** - Opera sem intervenção humana
- ✅ **Engine Proprietária** - Algoritmo Fibonacci da Amplitude integrado
- ✅ **Gestão de Risco Avançada** - Stop/Take diário, early close inteligente
- ✅ **Dados Reais** - Integração direta com API DERIV via WebSocket
- ✅ **Interface Profissional** - Dashboard em tempo real com gráficos dinâmicos
- ✅ **Modo DEMO e REAL** - Teste seguro antes de operar com dinheiro real

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React 19)                       │
│  Dashboard │ Configurações │ Logs │ Gráfico (M15/M30/M60)  │
└──────────────────────┬──────────────────────────────────────┘
                       │ tRPC
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

## ⚡ Funcionalidades

### 1. Engine de Predição Proprietária

- **Algoritmo**: Fibonacci da Amplitude
- **Assertividade**: 84.85%
- **Timeframes**: M15 (15 min), M30 (30 min), M60 (1 hora)
- **Método**: Análise de fase + descoberta de padrões
- **Entrada**: 50 candles históricos + candle atual parcial
- **Saída**: Predição de fechamento + direção (UP/DOWN)

### 2. Sistema de Trading Automatizado

#### Estados do Bot
- `IDLE` - Parado, aguardando início
- `COLLECTING` - Coletando histórico de candles
- `WAITING_MIDPOINT` - Aguardando waitTime configurado do candle
- `PREDICTING` - Chamando engine de predição
- `ARMED` - Entrada armada, aguardando gatilho
- `POSITION_OPEN` - Posição aberta, monitorando
- `WAITING_NEXT_CANDLE` - Aguardando próximo candle (1 trade/candle)
- `LOCK_RISK` - Bloqueado por stop/take diário
- `ERROR_API` - Erro de comunicação com API
- `DISCONNECTED` - Desconectado da DERIV

#### Lógica de Entrada
1. Aguarda **waitTime configurado** do candle atual (ex: 8 min para M15, 15 min para M30, 20 min para M60)
2. Coleta candle parcial (open, high, low, current)
3. Envia para engine de predição
4. Recebe predição de fechamento
5. Calcula **gatilho** = predição ± offset configurado (padrão: 16 pontos)
   - UP: gatilho = predição - offset
   - DOWN: gatilho = predição + offset
6. Monitora preço em tempo real
7. Executa CALL/PUT quando preço cruza gatilho
8. **Re-predição** (M30/M60): Faz nova predição se gatilho não for acionado após delay configurado

#### Gestão de Risco
- **Stop Diário**: Para bot ao atingir prejuízo máximo
- **Take Diário**: Para bot ao atingir lucro alvo
- **Early Close**: Encerra posição com 90%+ de payout antes do vencimento
- **Encerramento Automático**: 20 segundos antes do fechamento do candle
- **1 Trade por Candle**: Evita overtrading
- **Idempotência**: Previne duplicação de ordens

### 3. Interface do Usuário

#### Dashboard
- **Saldo Real**: Busca via API DERIV
- **PnL Diário/Mensal**: Calculado de posições reais
- **Trades Hoje**: Contador em tempo real
- **Gráfico Dinâmico**: Candles (M15/M30/M60) com linhas de referência
  - Linha azul: Fechamento previsto
  - Linha verde: Máxima
  - Linha vermelha: Mínima
- **Posições Abertas**: Lista de trades ativos
- **Status do Bot**: Indicador visual com estados

#### Configurações
- **Modo**: DEMO ou REAL
- **Token DERIV**: Configuração segura
- **Ativo**: Seleção de sintético (R_10, R_25, R_50, R_75, R_100)
- **Stake**: Valor por trade
- **Stop/Take Diário**: Limites de risco
- **Lookback**: Quantidade de candles históricos
- **Teste de Conexão**: Valida token antes de operar

#### Logs
- **Eventos do Sistema**: Timestamped em UTC
- **Filtros**: Por tipo de evento
- **Histórico Completo**: Auditoria de operações

## 🛠️ Tecnologias

### Frontend
- **React 19** - Framework UI
- **TypeScript** - Type safety
- **Tailwind CSS 4** - Styling
- **shadcn/ui** - Componentes
- **tRPC** - Type-safe API
- **Recharts** - Gráficos
- **Wouter** - Routing

### Backend
- **Node.js 22** - Runtime
- **Express 4** - Web server
- **tRPC 11** - API layer
- **Drizzle ORM** - Database
- **WebSocket** - DERIV API
- **Python 3.11** - Prediction engine
- **Flask** - Engine server
- **scikit-learn** - ML models

### Infraestrutura
- **MySQL/TiDB** - Database
- **Manus OAuth** - Authentication
- **Manus Platform** - Deployment

## 📦 Instalação

### Pré-requisitos
- Node.js 22+
- Python 3.11+
- pnpm
- MySQL/TiDB database

### Passo a Passo

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/schimidt-trader-system-pro.git
cd schimidt-trader-system-pro

# 2. Instale dependências Node.js
pnpm install

# 3. Instale dependências Python
cd server/prediction
pip3 install -r requirements.txt
cd ../..

# 4. Configure variáveis de ambiente
cp .env.example .env
# Edite .env com suas credenciais

# 5. Aplique schema ao banco de dados
pnpm db:push

# 6. Inicie o servidor de desenvolvimento
pnpm dev
```

## ⚙️ Configuração

### Variáveis de Ambiente

```env
# Database
DATABASE_URL=mysql://user:password@host:port/database

# Manus OAuth (fornecido automaticamente pela plataforma)
JWT_SECRET=auto
OAUTH_SERVER_URL=auto
VITE_OAUTH_PORTAL_URL=auto
OWNER_OPEN_ID=auto
OWNER_NAME=auto

# App Config
VITE_APP_TITLE=Schimidt Trader System PRO
VITE_APP_LOGO=https://your-logo-url.com/logo.png
```

### Tokens DERIV

1. Acesse https://app.deriv.com/account/api-token
2. Crie um token com permissões:
   - ✅ Read
   - ✅ Trade
   - ✅ Payments
3. Copie o token
4. No sistema, vá em **Configurações**
5. Cole o token no campo apropriado (DEMO ou REAL)
6. Clique em **"Testar Conexão com DERIV"**
7. Aguarde confirmação de saldo

## 🚀 Uso

### Iniciando o Bot

1. **Configure o Token**
   - Vá em **Configurações**
   - Insira token DERIV (DEMO recomendado para testes)
   - Teste a conexão

2. **Ajuste Parâmetros**
   - Selecione ativo sintético (ex: R_75)
   - Defina stake (ex: $1.00)
   - Configure stop diário (ex: $10.00)
   - Configure take diário (ex: $20.00)
   - Defina lookback (padrão: 50 candles)

3. **Inicie o Bot**
   - Volte ao **Dashboard**
   - Clique em **"Iniciar Bot"**
   - Aguarde coleta de histórico
   - Bot entrará em modo de espera

4. **Monitore Operações**
   - Acompanhe gráfico em tempo real (M15/M30/M60)
   - Veja predições nos **Logs**
   - Monitore posições abertas
   - Acompanhe PnL diário

### Parando o Bot

- Clique em **"Parar Bot"** no Dashboard
- Bot encerrará posições abertas
- Estado será salvo no banco de dados

### Recuperando de Erros

Se o bot entrar em **"Erro de API"**:
1. Clique em **"Limpar Erro"**
2. Verifique configurações
3. Teste conexão DERIV
4. Inicie bot novamente

## 🧠 Engine de Predição

### Algoritmo Fibonacci da Amplitude

A engine proprietária utiliza o **Algoritmo Fibonacci da Amplitude** para prever o fechamento de candles (M15, M30, M60) com 84.85% de assertividade.

#### Funcionamento

```python
# Entrada
{
  "open": 48255.20,
  "high": 48270.50,
  "low": 48240.10,
  "current": 48260.00
}

# Processamento
1. Calcula amplitude = high - low
2. Aplica sequência Fibonacci
3. Descobre fase do candle
4. Projeta fechamento baseado em padrões históricos

# Saída
{
  "prediction": 48255.18,
  "direction": "down",
  "phase": "Fibonacci da Amplitude",
  "strategy": "Fibonacci da Amplitude"
}
```

#### Integração

A engine roda como **micro-serviço Python interno** na porta 5070:

```typescript
// Backend chama engine
const prediction = await predictionService.predict({
  open: candle.open,
  high: candle.high,
  low: candle.low,
  current: currentPrice
});

// Engine responde
// prediction.prediction = 48255.18
// prediction.direction = "down"
```

#### Modelo Treinado

- **Arquivo**: `server/prediction/modelo_otimizado_v2.pkl`
- **Formato**: scikit-learn pickle
- **Features**: 10+ indicadores técnicos
- **Target**: Preço de fechamento
- **Validação**: 84.85% de acurácia em backtest

## 📁 Estrutura do Projeto

```
schimidt-trader-system-pro/
├── client/                    # Frontend React
│   ├── public/               # Assets estáticos
│   └── src/
│       ├── pages/            # Dashboard, Settings, Logs
│       ├── components/       # UI components (shadcn/ui)
│       ├── lib/              # tRPC client
│       └── App.tsx           # Routes
├── server/                    # Backend Node.js
│   ├── _core/                # Framework (OAuth, tRPC, etc)
│   ├── deriv/                # DERIV integration
│   │   ├── derivService.ts   # WebSocket API client
│   │   └── tradingBot.ts     # Bot logic
│   ├── prediction/           # Prediction engine
│   │   ├── engine_server.py  # Flask server
│   │   ├── prediction_engine.py  # Fibonacci algorithm
│   │   ├── modelo_otimizado_v2.pkl  # Trained model
│   │   ├── predictionService.ts  # TS wrapper
│   │   └── engineManager.ts  # Process manager
│   ├── db.ts                 # Database queries
│   └── routers.ts            # tRPC endpoints
├── drizzle/                   # Database
│   └── schema.ts             # Tables definition
├── shared/                    # Shared types
│   └── types/
└── README.md                  # Este arquivo
```

## 🔌 API e Endpoints

### tRPC Endpoints

#### Auth
- `auth.me` - Retorna usuário atual
- `auth.logout` - Faz logout

#### Config
- `config.get` - Busca configuração do usuário
- `config.save` - Salva configuração
- `config.testConnection` - Testa conexão DERIV

#### Bot
- `bot.status` - Retorna estado atual do bot
- `bot.start` - Inicia bot
- `bot.stop` - Para bot
- `bot.reset` - Reseta estado de erro

#### Dashboard
- `dashboard.balance` - Busca saldo DERIV
- `dashboard.positions` - Lista posições abertas
- `dashboard.todayPositions` - Posições do dia
- `dashboard.candles` - Histórico de candles (timeframe configurado)

#### Logs
- `logs.recent` - Últimos eventos do sistema

### Prediction Engine API

**Endpoint Interno**: `http://localhost:5070/predict`

```bash
# Request
POST /predict
Content-Type: application/json

{
  "open": 48255.20,
  "high": 48270.50,
  "low": 48240.10,
  "current": 48260.00
}

# Response
{
  "prediction": 48255.18,
  "direction": "down",
  "phase": "Fibonacci da Amplitude",
  "strategy": "Fibonacci da Amplitude"
}
```

## 🗄️ Banco de Dados

### Schema

#### users
- `id` - PK
- `openId` - Manus OAuth ID
- `name`, `email`, `loginMethod`
- `role` - admin | user
- `createdAt`, `updatedAt`, `lastSignedIn`

#### config
- `id` - PK
- `userId` - FK
- `mode` - DEMO | REAL
- `demoToken`, `realToken`
- `symbol` - Ativo (R_10, R_75, etc)
- `stake`, `dailyStop`, `dailyTake`
- `lookbackCandles`

#### candles
- `id` - PK
- `userId` - FK
- `symbol`
- `timestampUtc` - Timestamp do candle
- `open`, `high`, `low`, `close`
- `volume`

#### positions
- `id` - PK
- `userId` - FK
- `contractId` - ID DERIV
- `symbol`, `contractType` (CALL/PUT)
- `entryPrice`, `exitPrice`
- `stake`, `payout`, `profit`
- `prediction`, `trigger`
- `status` - OPEN | CLOSED | EXPIRED
- `openedAt`, `closedAt`

#### metrics
- `id` - PK
- `userId` - FK
- `period` - DAY | MONTH
- `periodKey` - YYYY-MM-DD | YYYY-MM
- `pnl`, `totalTrades`, `wins`, `losses`

#### eventLogs
- `id` - PK
- `userId` - FK
- `eventType` - BOT_STARTED, PREDICTION_MADE, etc
- `message`, `data` (JSON)
- `timestampUtc`

#### botState
- `userId` - PK
- `state` - Estado atual do bot
- `isRunning` - Boolean
- `currentCandleTimestamp`
- `currentPositionId`

## 🐛 Troubleshooting

### Bot não inicia

**Erro**: "Erro de API" ao iniciar

**Solução**:
1. Verifique token DERIV em Configurações
2. Teste conexão com botão "Testar Conexão"
3. Confirme que token tem permissões de Trade
4. Clique em "Limpar Erro" e tente novamente

### Predição não funciona

**Erro**: Engine de predição não responde

**Solução**:
```bash
# Verifique se engine está rodando
ps aux | grep engine_server

# Reinicie engine manualmente
cd server/prediction
python3 engine_server.py

# Verifique logs
tail -f /tmp/prediction_engine.log
```

### Posição não abre

**Erro**: "Input validation failed: parameters/currency"

**Solução**: Já corrigido na versão atual. Atualize para última versão.

### Gráfico não carrega

**Erro**: "Carregando candles..."

**Solução**:
1. Verifique token DERIV configurado
2. Confirme que bot está conectado
3. Aguarde alguns segundos para coleta de dados
4. Recarregue página

### Banco de dados

**Erro**: Tabelas não existem

**Solução**:
```bash
# Aplique migrations
pnpm db:push

# Verifique tabelas
mysql -u user -p database -e "SHOW TABLES;"
```

## 🧪 Laboratório de Backtest Institucional Plus

O sistema inclui um **Laboratório de Backtest Institucional Plus** completo para validação e otimização de estratégias.

### Funcionalidades

- **Otimização Grid Search** - Busca exaustiva de parâmetros com split IS/OOS
- **Walk-Forward Optimization** - Validação temporal com janelas deslizantes
- **Monte Carlo Simulation** - Análise de robustez estocástica (1000+ simulações)
- **Regime Detection** - Detecção de regimes de mercado sem look-ahead
- **Multi-Asset Backtest** - Portfólio com RiskGovernor e Ledger global
- **Determinismo** - Resultados 100% reproduzíveis com SeededRNG

### Como Usar

#### Via UI

1. Acesse o **Laboratório de Backtest** no menu lateral
2. Configure os parâmetros de otimização
3. Selecione o período e símbolo
4. Inicie a otimização
5. Visualize resultados com gráficos interativos

#### Via API

```typescript
// Iniciar otimização
const result = await trpc.institutional.startOptimization.mutate({
  symbol: "XAUUSD",
  startDate: "2024-01-01",
  endDate: "2024-06-30",
  parameterRanges: {
    stopLoss: { min: 10, max: 50, step: 5 },
    takeProfit: { min: 20, max: 100, step: 10 },
  },
  enableWFO: true,
  wfoWindowMonths: 6,
  wfoStepMonths: 1,
});

// Verificar status
const status = await trpc.institutional.getOptimizationStatus.query({
  runId: result.runId,
});

// Obter resultados
const results = await trpc.institutional.getOptimizationResults.query({
  runId: result.runId,
});
```

### Documentação Detalhada

- **Runbook Operacional**: [RUNBOOK.md](./RUNBOOK.md)
- **Checklist de Implementação**: [CHECKLIST_IMPLEMENTACAO.md](./CHECKLIST_IMPLEMENTACAO.md)
- **Documentação Técnica**: [server/backtest/runners/README.md](./server/backtest/runners/README.md)
- **Multi-Asset**: [server/backtest/multi-asset/README.md](./server/backtest/multi-asset/README.md)

### Configuração de Artefatos

Variáveis de ambiente para configuração de artefatos:

```env
# Diretório base para artefatos
BACKTEST_ARTIFACTS_PATH=/tmp/backtest-artifacts

# TTL em horas (padrão: 168 = 7 dias)
BACKTEST_ARTIFACTS_TTL_HOURS=168

# Tamanho máximo em MB (padrão: 5120 = 5GB)
BACKTEST_ARTIFACTS_MAX_SIZE_MB=5120

# Habilitar cleanup automático
BACKTEST_ARTIFACTS_AUTO_CLEANUP=true

# Intervalo de cleanup em horas
BACKTEST_ARTIFACTS_CLEANUP_INTERVAL_HOURS=6
```

### Executar Testes

```bash
# Executar todos os Gates de CI
npx vitest run server/backtest/__tests__/

# Executar com coverage
npx vitest run --coverage server/backtest/__tests__/

# Executar validação E2E
npx tsx server/backtest/__tests__/e2e-validation.ts
```

## 📝 Licença

Propriedade de **Schimidt Trading Systems**. Todos os direitos reservados.

## 🤝 Suporte

Para suporte técnico ou dúvidas:
- Email: suporte@schimidt-trading.com
- GitHub Issues: https://github.com/seu-usuario/schimidt-trader-system-pro/issues

---

**Desenvolvido com ❤️ por Manus AI Agent**

