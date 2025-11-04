# Resumo Técnico - Schimidt Trader System PRO

**Documento de Referência Rápida para Tarefas Futuras**

## Estrutura de Diretórios

```
schimidt-trader-system-pro/
├── client/                    # Frontend React
│   └── src/
│       ├── pages/            # Dashboard, Settings, Logs
│       ├── components/       # CandleChart, UI components
│       └── lib/              # tRPC client
├── server/                    # Backend Node.js
│   ├── deriv/                # DERIV API integration
│   │   ├── derivService.ts   # WebSocket client
│   │   └── tradingBot.ts     # Bot logic (927 linhas)
│   ├── prediction/           # Python prediction engine
│   │   ├── engine_server.py  # Flask server (porta 5070)
│   │   └── prediction_engine.py  # Algoritmo Fibonacci
│   ├── db.ts                 # Database queries
│   └── routers.ts            # tRPC endpoints
├── drizzle/                   # Database schema
│   └── schema.ts             # Tabelas: users, config, candles, positions, metrics, eventLogs, botState
└── shared/                    # Tipos compartilhados
```

## Componentes Principais

### 1. TradingBot (`server/deriv/tradingBot.ts`)

**Estados do Bot**:
- `IDLE`: Parado
- `COLLECTING`: Coletando histórico de candles
- `WAITING_MIDPOINT`: Aguardando 8 minutos do candle M15
- `PREDICTING`: Chamando engine de predição
- `ARMED`: Entrada armada, aguardando gatilho
- `ENTERED`: Posição aberta
- `MANAGING`: Gerenciando posição aberta
- `CLOSED`: Posição fechada
- `LOCK_RISK`: Bloqueado por stop/take diário
- `ERROR_API`: Erro de comunicação com API
- `DISCONNECTED`: Desconectado da DERIV

**Fluxo de Operação**:
1. Coleta 500 candles históricos
2. Aguarda 8 minutos do candle M15
3. Captura dados parciais (open, high, low)
4. Envia para engine de predição
5. Recebe predição de fechamento
6. Calcula gatilho = predição ± 16 pontos
7. Monitora preço em tempo real
8. Executa CALL/PUT quando preço cruza gatilho
9. Gerencia posição até fechamento

### 2. DerivService (`server/deriv/derivService.ts`)

**Funções Principais**:
- `connect()`: Conecta ao WebSocket da DERIV
- `subscribeTicks()`: Subscreve ticks em tempo real
- `getCandleHistory()`: Busca histórico de candles
- `getBalance()`: Obtém saldo da conta
- `buyContract()`: Executa ordem CALL/PUT
- `sellContract()`: Fecha posição antecipadamente

### 3. Prediction Engine (`server/prediction/prediction_engine.py`)

**Algoritmo Fibonacci da Amplitude**:
```python
meio = (maxima + minima) / 2

if abertura < meio:
    # Tendência de alta
    fechamento = abertura + 0.618 * (maxima - abertura)
else:
    # Tendência de baixa
    fechamento = abertura - 0.618 * (abertura - minima)
```

**Endpoint**: `POST http://localhost:5070/predict`

**Request**:
```json
{
  "symbol": "R_100",
  "tf": "M15",
  "history": [...],
  "partial_current": {
    "timestamp_open": 1234567890,
    "elapsed_seconds": 480,
    "abertura": 1235.00,
    "minima_parcial": 1232.00,
    "maxima_parcial": 1238.00
  }
}
```

**Response**:
```json
{
  "predicted_close": 1236.50,
  "direction": "up",
  "phase": "Fibonacci da Amplitude",
  "strategy": "Fibonacci da Amplitude",
  "confidence": 0.8485
}
```

## Configurações Importantes

### Variáveis de Ambiente

```env
DATABASE_URL=mysql://user:password@host:port/database
JWT_SECRET=<auto>
OAUTH_SERVER_URL=<auto>
VITE_OAUTH_PORTAL_URL=<auto>
OWNER_OPEN_ID=<auto>
OWNER_NAME=<auto>
```

### Configurações do Bot (tabela `config`)

| Campo | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `mode` | ENUM | DEMO | DEMO ou REAL |
| `symbol` | VARCHAR | R_100 | Ativo sintético |
| `stake` | INT | 100 | Valor por trade (centavos) |
| `stopDaily` | INT | 1000 | Stop diário (centavos) |
| `takeDaily` | INT | 2000 | Take diário (centavos) |
| `lookback` | INT | 500 | Candles históricos |
| `triggerOffset` | INT | 16 | Offset do gatilho (pontos) |
| `profitThreshold` | INT | 90 | Threshold de lucro (%) |
| `waitTime` | INT | 8 | Tempo de espera (minutos) |

## Endpoints tRPC

### Auth
- `auth.me`: Retorna usuário atual
- `auth.logout`: Faz logout

### Config
- `config.get`: Busca configuração
- `config.update`: Salva configuração
- `config.testConnection`: Testa conexão DERIV

### Bot
- `bot.status`: Retorna estado atual
- `bot.start`: Inicia bot
- `bot.stop`: Para bot
- `bot.reset`: Reseta estado de erro

### Dashboard
- `dashboard.balance`: Busca saldo DERIV
- `dashboard.metrics`: Métricas diárias/mensais
- `dashboard.liveCandles`: Candles em tempo real

### Positions
- `positions.today`: Posições do dia

### Logs
- `logs.recent`: Últimos eventos

## Scripts Úteis

```bash
# Desenvolvimento
pnpm dev

# Build
pnpm build

# Produção
pnpm start

# Database
pnpm db:push        # Aplica schema
pnpm db:migrate     # Roda migrations

# Testes
pnpm test
```

## Pontos de Atenção

1. **Sincronização de Dados**: Sistema implementa tripla verificação com DERIV API (início, predição, fechamento).
2. **Engine de Predição**: Deve estar rodando na porta 5070 antes de iniciar o bot.
3. **Gestão de Estado**: Estado do bot é persistido no banco (tabela `botState`).
4. **Idempotência**: Sistema previne duplicação de ordens.
5. **Logs Detalhados**: Todos os eventos são registrados em `eventLogs`.

## Métricas do Projeto

- **Linhas de Código**: ~15.680 (TypeScript + Python)
- **Arquivos**: 1050 objetos no repositório
- **Tamanho**: 456.82 KB
- **Versão**: 1.0.1
- **Status**: ✅ Pronto para Deploy

---

**Este documento foi criado para facilitar a execução de tarefas futuras relacionadas ao Schimidt Trader System PRO.**
