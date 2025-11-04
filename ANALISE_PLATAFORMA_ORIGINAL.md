# Análise Completa da Plataforma Schimidt Trader System PRO

**Autor**: Manus AI
**Data**: 04 de novembro de 2025

## 1. Visão Geral

O **Schimidt Trader System PRO** é um sistema de trading 100% automatizado que opera 24/7 nos mercados de índices sintéticos da corretora DERIV. A plataforma utiliza uma engine de predição proprietária, baseada no **Algoritmo Fibonacci da Amplitude**, para prever o fechamento de candles de 15 minutos (M15) e executar operações de compra (CALL) ou venda (PUT).

O sistema é composto por um frontend em React, um backend em Node.js com tRPC, uma engine de predição em Python (Flask) e um banco de dados MySQL/TiDB para persistência de dados.

## 2. Arquitetura da Aplicação

A plataforma segue uma arquitetura de micro-serviços com três componentes principais:

| Componente | Tecnologia | Responsabilidade |
| :--- | :--- | :--- |
| **Frontend** | React 19, TypeScript, tRPC | Interface do usuário (Dashboard, Configurações, Logs) |
| **Backend** | Node.js 22, Express, tRPC | Orquestração, lógica de negócio, comunicação com a DERIV |
| **Prediction Engine** | Python 3.11, Flask | Algoritmo de predição (Fibonacci da Amplitude) |

O fluxo de comunicação é o seguinte:

1. **Frontend** se comunica com o **Backend** via tRPC (API type-safe).
2. **Backend** se comunica com a **DERIV API** via WebSocket para dados em tempo real (ticks e candles).
3. **Backend** chama a **Prediction Engine** via REST API (HTTP POST) para obter predições.
4. **Backend** armazena e lê dados do **Banco de Dados** (configurações, trades, logs, etc).

## 3. Estrutura do Projeto

O projeto está organizado da seguinte forma:

- `client/`: Contém o código do frontend em React.
- `server/`: Contém o código do backend em Node.js.
  - `_core/`: Framework base da Manus (tRPC, OAuth, etc).
  - `deriv/`: Integração com a API da DERIV (`derivService.ts`, `tradingBot.ts`).
  - `prediction/`: Engine de predição em Python e o serviço que a consome.
- `drizzle/`: Schema e migrações do banco de dados (Drizzle ORM).
- `shared/`: Tipos e constantes compartilhados entre frontend e backend.

## 4. Análise do Backend

### 4.1. Lógica do Bot de Trading (`tradingBot.ts`)

O coração do sistema é a classe `TradingBot`. Ela implementa uma máquina de estados que gerencia todo o ciclo de vida de uma operação.

**Principais Estados:**

- `IDLE`: Aguardando início.
- `COLLECTING`: Coletando histórico de 500 candles M15.
- `WAITING_MIDPOINT`: Aguardando 8 minutos do candle atual para iniciar a predição.
- `PREDICTING`: Chamando a engine de predição em Python.
- `ARMED`: Predição recebida, aguardando o preço atingir o gatilho de entrada.
- `ENTERED`: Posição aberta na DERIV, gerenciando a saída.
- `LOCK_RISK`: Meta de lucro (take) ou perda (stop) diária atingida.

**Fluxo de Operação:**

1. **Inicialização**: Carrega configurações do banco de dados (stake, stop/take, etc).
2. **Coleta de Dados**: Baixa o histórico de 500 candles da DERIV.
3. **Aguarda Momento Certo**: Espera o candle M15 atual atingir 8 minutos de duração.
4. **Predição**: Envia os dados do candle parcial para a engine Python e recebe a previsão de fechamento.
5. **Arma o Gatilho**: Calcula o preço de entrada (trigger) com base na predição e um offset (ex: predição ± 16 pontos).
6. **Entrada**: Se o preço atual cruzar o gatilho, abre a posição (CALL ou PUT) na DERIV.
7. **Gerenciamento**: Monitora a posição para um possível fechamento antecipado (early close) se o lucro atingir 90% do payout, ou encerra 20 segundos antes do fim do candle.
8. **Ciclo**: Repete o processo para o próximo candle, respeitando a regra de 1 trade por candle.

### 4.2. Engine de Predição (`prediction_engine.py`)

A engine em Python é um micro-serviço Flask que expõe o endpoint `/predict`. Ela implementa o algoritmo proprietário **Fibonacci da Amplitude**.

- **Entrada**: Histórico de candles e dados do candle parcial.
- **Processamento**: O algoritmo analisa a "fase" do mercado e aplica a lógica Fibonacci para projetar o preço de fechamento.
- **Saída**: Retorna um JSON com o preço previsto, a direção (up/down), a fase e a estratégia utilizada.

### 4.3. Banco de Dados (`schema.ts`)

O Drizzle ORM é usado para definir o schema do banco de dados. As principais tabelas são:

- `users`: Usuários da plataforma.
- `config`: Configurações do bot para cada usuário (tokens, stake, etc).
- `candles`: Histórico de candles M15.
- `positions`: Todas as operações de trading (abertas e fechadas).
- `metrics`: Métricas de performance (lucro/prejuízo diário e mensal).
- `eventLogs`: Logs de eventos importantes do sistema para auditoria.
- `botState`: O estado atual do bot, para persistência entre reinicializações.

## 5. Análise do Frontend

O frontend é construído com React, Vite e tRPC, utilizando componentes da biblioteca `shadcn/ui`.

**Principais Páginas:**

- **Dashboard (`Dashboard.tsx`)**: Tela principal que exibe:
  - Métricas de performance (P&L diário/mensal).
  - Saldo da conta DERIV.
  - Gráfico de candles em tempo real (Recharts).
  - Status atual do bot.
  - Botões para iniciar/parar o bot.
- **Configurações (`Settings.tsx`)**: Permite ao usuário configurar:
  - Tokens da API da DERIV (DEMO e REAL).
  - Ativo a ser operado.
  - Valor da operação (stake).
  - Limites de stop e take diário.
- **Logs (`Logs.tsx`)**: Exibe o histórico de eventos do sistema em tempo real.

O frontend utiliza o cliente tRPC para fazer chamadas ao backend de forma segura e tipada, com queries e mutations do `@tanstack/react-query` para gerenciamento de estado e cache.

## 6. Fluxo de Dados Completo (End-to-End)

1. **Usuário acessa o Dashboard**.
2. **Frontend (`Dashboard.tsx`)** busca o estado do bot (`trpc.bot.status.useQuery`).
3. **Backend (`routers.ts`)** retorna o estado do `botState` do banco de dados.
4. **Usuário clica em "Iniciar Bot"**.
5. **Frontend** chama a mutation `trpc.bot.start.useMutation`.
6. **Backend** cria uma instância da classe `TradingBot` e chama o método `start()`.
7. **`TradingBot`** inicia a máquina de estados, conecta-se à DERIV via `DerivService`, coleta o histórico de candles e começa a monitorar os ticks em tempo real.
8. A cada tick, o `TradingBot` atualiza o candle atual e verifica se é hora de fazer uma predição.
9. No momento da predição, o `TradingBot` chama o `predictionService`.
10. **`predictionService`** faz uma requisição HTTP para a engine Python.
11. **Engine Python** retorna a predição.
12. **`TradingBot`** recebe a predição, arma o gatilho e, se acionado, abre a posição na DERIV.
13. Todos os eventos (predição, entrada, saída) são salvos na tabela `eventLogs` e o estado do bot é atualizado no `botState`.
14. **Frontend** atualiza a interface a cada 2 segundos, refletindo o novo estado do bot, as posições e as métricas.

## 7. Conclusão da Análise

A plataforma original é um sistema robusto e bem arquitetado, com uma clara separação de responsabilidades entre o frontend, backend e a engine de predição. O uso de tRPC e Drizzle ORM moderniza o desenvolvimento e garante a segurança dos tipos.

Esta análise servirá como uma base sólida para entender as modificações introduzidas no branch `ATUALIZAÇÕES-EM-TESTE` e para diagnosticar os problemas reportados.
