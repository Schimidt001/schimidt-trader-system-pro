# Schimidt Trader System PRO

Sistema de Trading Automatizado 24/7 para DERIV com Engine de Predição Proprietária.

## 📋 Visão Geral

O **Schimidt Trader System PRO** é um bot trader totalmente automatizado que opera no mercado de ativos sintéticos da DERIV em timeframe M15. O sistema utiliza uma engine de predição proprietária imutável fornecida pelo cliente e executa trades automaticamente com gestão de risco integrada.

## 🎯 Funcionalidades Principais

### ✅ Implementado

- **Engine de Predição Proprietária**: Integração com modelo `modelo_otimizado_v2.pkl`
- **Coleta de Dados em Tempo Real**: WebSocket DERIV para candles M15
- **Trading Automatizado**: Execução automática baseada em gatilhos calculados
- **Gestão de Risco**: Stop diário, take diário, máximo 1 operação por candle
- **Interface Profissional**: Dashboard com métricas, configurações e logs
- **Sistema de Estados**: Máquina de estados completa (IDLE → COLLECTING → PREDICTING → ARMED → ENTERED)
- **Persistência**: Banco de dados MySQL com histórico completo
- **Reconexão Automática**: Sistema resiliente com reconexão sem duplicação de ordens

### 🔧 Configurável

- Modo DEMO ou REAL
- Tokens de API DERIV
- Ativo sintético (R_10, R_25, R_50, R_75, R_100, etc.)
- Stake por operação
- Stop diário (limite de perda)
- Take diário (objetivo de lucro)
- Lookback de candles históricos

## 🚀 Como Usar

### 1. Configuração Inicial

Acesse a página **Configurações** e preencha:

1. **Modo de Operação**: Escolha DEMO (para testes) ou REAL
2. **Tokens DERIV**: 
   - Obtenha seu token em: https://app.deriv.com/account/api-token
   - Token DEMO para conta de demonstração
   - Token REAL para conta real (use com cautela!)
3. **Ativo Sintético**: Selecione o ativo desejado (ex: Volatility 100 Index)
4. **Stake**: Valor por operação em USD (ex: 10.00)
5. **Stop Diário**: Limite de perda diária em USD (ex: 100.00)
6. **Take Diário**: Objetivo de lucro diário em USD (ex: 500.00)
7. **Lookback**: Quantidade de candles históricos para predição (ex: 100)

Clique em **Salvar Configurações**.

### 2. Integração da Engine de Predição

⚠️ **IMPORTANTE**: O sistema espera que a engine de predição proprietária esteja rodando localmente.

A engine deve expor os seguintes endpoints:

#### `POST /predict`

**Request:**
```json
{
  "symbol": "R_100",
  "tf": "M15",
  "history": [
    {
      "abertura": 1234.56,
      "minima": 1230.00,
      "maxima": 1240.00,
      "fechamento": 1235.00,
      "timestamp": 1234567890
    }
  ],
  "partial_current": {
    "timestamp_open": 1234567890,
    "elapsed_seconds": 480,
    "abertura": 1235.00,
    "minima_parcial": 1232.00,
    "maxima_parcial": 1238.00
  }
}
```

**Response:**
```json
{
  "predicted_close": 1236.50,
  "direction": "up",
  "phase": "accumulation",
  "strategy": "breakout",
  "confidence": 0.85
}
```

#### `GET /health`

Endpoint de health check que deve retornar status 200 quando a engine estiver disponível.

#### Configuração da URL

Por padrão, o sistema busca a engine em `http://localhost:5000`. Para alterar, defina a variável de ambiente:

```bash
PREDICTION_ENGINE_URL=http://seu-servidor:porta
```

### 3. Iniciar o Bot

1. Acesse o **Dashboard**
2. Verifique se todas as configurações estão corretas
3. Clique no botão **Iniciar Bot** (verde)
4. O bot começará a coletar dados e operar automaticamente

### 4. Monitoramento

O Dashboard exibe em tempo real:

- **Saldo da Conta**: Saldo atual na DERIV
- **PnL Diário**: Lucro/prejuízo do dia
- **PnL Mensal**: Lucro/prejuízo do mês
- **Trades Hoje**: Número de operações e perdas
- **Status**: Estado atual do bot (Parado, Coletando dados, Entrada armada, etc.)
- **Posições de Hoje**: Lista de todas as operações realizadas

A página **Logs** mostra todos os eventos do sistema com timestamps UTC.

## 📊 Lógica de Trading

### Fluxo de Operação

1. **COLLECTING**: Bot coleta histórico de candles M15 da DERIV
2. **WAITING_MIDPOINT**: Aguarda 8 minutos de formação do candle atual
3. **PREDICTING**: Envia dados para engine de predição
4. **ARMED**: Calcula gatilho de entrada (predicted_close ± 16 pontos)
5. **ENTERED**: Executa trade quando preço cruza o gatilho
6. **MANAGING**: Monitora posição para early close ou encerramento automático
7. **CLOSED**: Fecha posição e volta para WAITING_MIDPOINT

### Cálculo do Gatilho

```
1 ponto = pip_size do ativo
Offset fixo = 16 pontos

Se direção = UP:
  gatilho = predicted_close - (16 × pip_size)

Se direção = DOWN:
  gatilho = predicted_close + (16 × pip_size)
```

### Regras de Encerramento

1. **Early Close**: Fecha se lucro ≥ 90% do payout do contrato
2. **Encerramento Automático**: Fecha 20 segundos antes do fim do candle M15
3. **Stop Diário**: Para o bot se perda diária atingir o limite
4. **Take Diário**: Para o bot se lucro diário atingir o objetivo

### Gestão de Risco

- ✅ Máximo 1 operação por candle M15
- ✅ Idempotência de ordens (sem duplicação)
- ✅ Reconexão automática sem duplicar trades
- ✅ Bloqueios por risco (LOCK_RISK, ERROR_API, DISCONNECTED)

## 🗄️ Estrutura do Banco de Dados

### Tabelas Principais

- **users**: Usuários do sistema
- **config**: Configurações do bot por usuário
- **candles**: Histórico de candles M15
- **positions**: Posições abertas e históricas
- **metrics**: Métricas diárias e mensais
- **eventLogs**: Log de eventos do sistema
- **botState**: Estado atual do bot

## 🔒 Segurança

- Tokens DERIV armazenados com segurança no banco de dados
- Autenticação via Manus OAuth
- Separação de contas DEMO e REAL
- Logs completos de todas as operações

## ⚠️ Avisos Importantes

1. **Engine Proprietária**: O sistema NÃO substitui ou altera a engine de predição do cliente. Ela deve estar rodando separadamente.

2. **Modo DEMO Primeiro**: Sempre teste em modo DEMO antes de usar tokens REAL.

3. **Gestão de Risco**: Configure stop diário adequado para proteger seu capital.

4. **Monitoramento**: Acompanhe regularmente os logs e métricas do sistema.

5. **Conexão Internet**: O bot precisa de conexão estável com a DERIV.

## 🛠️ Desenvolvimento

### Estrutura do Projeto

```
server/
  ├── prediction/          # Integração com engine proprietária
  │   └── predictionService.ts
  ├── deriv/              # Integração com DERIV
  │   ├── derivService.ts
  │   └── tradingBot.ts
  ├── db.ts               # Queries do banco de dados
  └── routers.ts          # Endpoints tRPC

client/src/
  ├── pages/              # Páginas da UI
  │   ├── Dashboard.tsx
  │   ├── Settings.tsx
  │   └── Logs.tsx
  └── const.ts            # Constantes compartilhadas

drizzle/
  └── schema.ts           # Schema do banco de dados

shared/types/
  └── prediction.ts       # Tipos da API de predição
```

### Comandos Úteis

```bash
# Instalar dependências
pnpm install

# Aplicar schema ao banco
pnpm db:push

# Iniciar desenvolvimento
pnpm dev

# Build para produção
pnpm build
```

## 📝 Próximos Passos

Para completar o sistema, você precisa:

1. ✅ Subir a engine de predição proprietária em `http://localhost:5000`
2. ✅ Configurar tokens DERIV válidos
3. ✅ Testar em modo DEMO primeiro
4. ⚠️ Validar predições com o teste de ouro fornecido
5. ⚠️ Adicionar gráfico de candles em tempo real (opcional)

## 📞 Suporte

Para questões sobre:
- **Engine de Predição**: Consulte a documentação proprietária fornecida
- **API DERIV**: https://developers.deriv.com/
- **Sistema Schimidt Trader PRO**: Consulte os logs de eventos e métricas

---

**Desenvolvido para Rafael - Schimidt Trader System PRO**

