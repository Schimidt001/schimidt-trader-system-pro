# Análise Detalhada da Plataforma Schimidt Trader System PRO

**Data de Criação:** 14 de Novembro de 2025
**Autor:** Manus AI

## 📋 Índice

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Estrutura de Diretórios](#3-estrutura-de-diretórios)
4. [Banco de Dados](#4-banco-de-dados)
5. [Fluxo de Dados](#5-fluxo-de-dados)
6. [Sistema de Trading](#6-sistema-de-trading)
7. [Filtro de Horário](#7-filtro-de-horário)
8. [IA Hedge Inteligente](#8-ia-hedge-inteligente)
9. [Engine de Predição](#9-engine-de-predição)
10. [Configurações e Parâmetros](#10-configurações-e-parâmetros)
11. [Estados do Bot](#11-estados-do-bot)
12. [Gestão de Risco](#12-gestão-de-risco)
13. [Logs e Monitoramento](#13-logs-e-monitoramento)
14. [Problemas Conhecidos](#14-problemas-conhecidos)

## 1. Visão Geral da Arquitetura

A plataforma **Schimidt Trader System PRO** é um sistema de trading automatizado que opera 24/7, projetado para interagir com a API da corretora DERIV. A arquitetura é baseada em um modelo cliente-servidor, com um frontend reativo e um backend robusto que gerencia a lógica de negócio, a comunicação com a API externa e a persistência de dados.

### Componentes Principais

A arquitetura pode ser dividida em três camadas principais:

- **Frontend:** Uma interface de usuário web, desenvolvida em React, que permite ao usuário monitorar o status do bot, visualizar gráficos de preços, configurar parâmetros de trading e analisar logs de operação em tempo real.

- **Backend:** O núcleo do sistema, desenvolvido em Node.js com TypeScript. Ele é responsável por orquestrar todas as operações, incluindo a gestão do estado do bot, a execução da lógica de trading, a comunicação com a API da DERIV via WebSockets e a interação com a engine de predição.

- **Engine de Predição:** Um microsserviço em Python, utilizando Flask, que implementa o algoritmo proprietário "Fibonacci da Amplitude". Este componente é chamado pelo backend para prever o movimento dos preços dos ativos.

- **Banco de Dados:** Um banco de dados relacional (MySQL/TiDB) que armazena todas as informações da plataforma, incluindo configurações de usuário, dados históricos de candles, posições de trade, métricas de performance e logs de eventos.

O diagrama a seguir ilustra a interação entre esses componentes:

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

## 2. Stack Tecnológico

A plataforma utiliza um conjunto de tecnologias modernas para garantir performance, segurança e escalabilidade.

| Camada | Tecnologia | Propósito |
| :--- | :--- | :--- |
| **Frontend** | React 19 | Construção da interface de usuário. |
| | TypeScript | Garante a tipagem estática do código. |
| | Tailwind CSS 4 | Framework de estilização para a UI. |
| | shadcn/ui | Biblioteca de componentes de UI. |
| | tRPC | Comunicação type-safe com o backend. |
| | Recharts | Criação de gráficos dinâmicos. |
| | Wouter | Gerenciamento de rotas no frontend. |
| **Backend** | Node.js 22 | Ambiente de execução do servidor. |
| | Express 4 | Framework para a criação do servidor web. |
| | tRPC 11 | Camada de API para comunicação com o frontend. |
| | Drizzle ORM | Mapeamento objeto-relacional para o banco de dados. |
| | WebSocket | Comunicação em tempo real com a API da DERIV. |
| **Engine de Predição** | Python 3.11 | Ambiente de execução da engine. |
| | Flask | Criação do microsserviço da engine. |
| | NumPy | Computação numérica para o algoritmo. |
| **Infraestrutura** | MySQL/TiDB | Armazenamento de dados. |
| | Manus OAuth | Sistema de autenticação. |
| | Railway | Plataforma de deployment. |

## 3. Estrutura de Diretórios

A estrutura do projeto é organizada de forma a separar as responsabilidades de cada componente da aplicação.

```
schimidt-trader-system-pro/
├── client/                    # Frontend React
│   ├── public/               # Assets estáticos
│   └── src/                  # Código fonte do frontend
│       ├── pages/            # Páginas da aplicação (Dashboard, Settings, Logs)
│       ├── components/       # Componentes de UI reutilizáveis
│       ├── lib/              # Bibliotecas e utilitários (cliente tRPC)
│       └── App.tsx           # Ponto de entrada e gerenciamento de rotas
├── server/                    # Backend Node.js
│   ├── _core/                # Framework base (OAuth, tRPC, etc)
│   ├── deriv/                # Integração com a API da DERIV
│   │   ├── derivService.ts   # Cliente WebSocket para a API
│   │   └── tradingBot.ts     # Lógica principal do bot de trading
│   ├── prediction/           # Engine de Predição
│   │   ├── engine_server.py  # Servidor Flask da engine
│   │   ├── prediction_engine.py # Algoritmo Fibonacci da Amplitude
│   │   ├── predictionService.ts # Cliente TypeScript para a engine
│   │   └── engineManager.ts  # Gerenciador do processo Python
│   ├── ai/                   # Lógica da IA de Hedge
│   │   └── hedgeStrategy.ts  # Estratégias de hedge
│   ├── routers.ts            # Endpoints da API tRPC
│   ├── db.ts                 # Funções de acesso ao banco de dados
│   └── db_reset.ts           # Scripts para resetar dados
├── drizzle/                   # Configuração do banco de dados
│   ├── schema.ts             # Definição das tabelas do banco
│   └── migrations/           # Arquivos de migração do banco
├── shared/                    # Código compartilhado entre frontend e backend
│   └── types/                # Tipos TypeScript
├── package.json               # Dependências e scripts do projeto
└── README.md                  # Documentação principal do projeto
```

## 4. Banco de Dados

O banco de dados é modelado utilizando o Drizzle ORM e o schema está definido em `drizzle/schema.ts`. As principais tabelas são:

| Tabela | Descrição |
| :--- | :--- |
| `users` | Armazena informações dos usuários da plataforma. |
| `config` | Guarda as configurações do bot para cada usuário, como tokens de API, stake, limites de risco, etc. |
| `candles` | Armazena o histórico de candles para cada ativo e timeframe. |
| `positions` | Registra todas as posições de trade, abertas e fechadas. |
| `metrics` | Agrega métricas de performance, como PnL diário e mensal. |
| `eventLogs` | Mantém um log de todos os eventos importantes do sistema. |
| `botState` | Armazena o estado atual do bot para cada usuário. |

## 5. Fluxo de Dados

O fluxo de dados é o coração da plataforma, garantindo que as operações sejam executadas com base em informações precisas e em tempo real.

1.  **Conexão e Autenticação:** O `derivService` estabelece uma conexão WebSocket com a API da DERIV e se autentica utilizando o token do usuário.
2.  **Coleta de Histórico:** O `tradingBot` solicita ao `derivService` o histórico de candles para o ativo configurado.
3.  **Processamento de Ticks:** O `derivService` se inscreve para receber ticks (atualizações de preço) em tempo real para o ativo. Cada tick é processado pelo `tradingBot`.
4.  **Construção de Candles:** O `tradingBot` constrói os candles em tempo real a partir dos ticks recebidos.
5.  **Predição:** Em um momento específico do candle (definido pelo parâmetro `waitTime`), o `tradingBot` envia os dados do candle parcial e o histórico para a `predictionEngine`.
6.  **Cálculo do Gatilho:** A `predictionEngine` retorna a predição de fechamento, e o `tradingBot` calcula o preço de gatilho para a entrada na operação.
7.  **Execução da Ordem:** O `tradingBot` monitora os ticks e, quando o preço atinge o gatilho, envia uma ordem de compra (CALL ou PUT) para a API da DERIV.
8.  **Monitoramento da Posição:** O `tradingBot` monitora a posição aberta, verificando a possibilidade de `Early Close` ou outras ações de gerenciamento.
9.  **Fechamento da Posição:** A posição é fechada no vencimento do contrato ou através do `Early Close`.
10. **Persistência:** Todos os eventos, candles, posições e métricas são salvos no banco de dados.

## 6. Sistema de Trading

A lógica de trading é implementada no arquivo `server/deriv/tradingBot.ts`. Este é o componente central que gerencia o ciclo de vida de uma operação.

### Lógica de Entrada

1.  **Aguardar Ponto de Predição:** O bot aguarda um tempo configurável (`waitTime`) dentro do candle atual antes de fazer uma predição. Por exemplo, em um candle de 15 minutos (M15), ele pode esperar 8 minutos.
2.  **Coletar Dados:** Após o tempo de espera, o bot coleta os dados do candle parcial (abertura, máxima, mínima e preço atual).
3.  **Chamar Engine de Predição:** Os dados são enviados para a `predictionEngine`.
4.  **Calcular Gatilho:** Com a predição de fechamento recebida, o bot calcula o preço de gatilho (`trigger`) para a entrada. O cálculo é:
    *   **CALL (Alta):** `gatilho = predição - offset`
    *   **PUT (Baixa):** `gatilho = predição + offset`
    O `offset` é um valor configurável em pontos.
5.  **Armar Posição:** O bot entra no estado `ARMED` e monitora o preço do ativo.
6.  **Executar Entrada:** Quando o preço do ativo cruza o gatilho, o bot envia a ordem de compra para a DERIV.

### Re-predição (M30/M60)

Para timeframes mais longos como M30 e M60, o bot possui uma funcionalidade de **re-predição**. Se o gatilho inicial não for atingido após um certo tempo (`repredictionDelay`), o bot realiza uma nova predição com os dados mais recentes do candle, calculando um novo gatilho e aumentando as chances de uma entrada válida.

## 7. Filtro de Horário

A plataforma inclui um módulo de **Filtro de Horário**, localizado em `filtro-horario/hourlyFilterLogic.ts`. Esta funcionalidade permite que o bot opere apenas em horários específicos do dia, considerados mais favoráveis para a estratégia.

### Modos de Operação

O filtro pode operar em diferentes modos:

- **IDEAL, COMPATIBLE, GOLDEN, COMBINED:** Presets de horários pré-definidos.
- **CUSTOM:** Permite ao usuário definir uma lista de horários personalizados.

### Horários GOLD

O filtro também suporta "Horários GOLD", que são horas específicas dentro dos horários permitidos onde o bot pode operar com um multiplicador de stake, aumentando a exposição em momentos de maior confiança.

## 8. IA Hedge Inteligente

O sistema possui uma camada de inteligência artificial para gerenciamento de risco chamada **IA Hedge Inteligente**, implementada em `server/ai/hedgeStrategy.ts`. Esta IA analisa a posição aberta e pode decidir tomar ações para proteger o capital ou maximizar os lucros.

### Estratégias da IA

A IA utiliza três estratégias principais, baseadas em cálculos matemáticos sobre o andamento do candle:

1.  **Detecção de Reversão:** Se o preço se move fortemente contra a predição original, a IA pode abrir uma posição de hedge na direção oposta para mitigar a perda.
2.  **Reforço em Pullback:** Se o preço se move a favor da predição, mas sofre um pequeno recuo (pullback), a IA pode abrir uma segunda posição na mesma direção, aproveitando um preço de entrada melhor.
3.  **Reversão de Ponta:** Se o preço se estende excessivamente na direção da predição perto do final do candle, a IA pode apostar em uma pequena reversão (exaustão), abrindo uma posição oposta.

## 9. Engine de Predição

A `predictionEngine` é um componente crucial e proprietário da plataforma. Ela é implementada em Python (`server/prediction/prediction_engine.py`) e exposta como um microsserviço Flask (`server/prediction/engine_server.py`).

### Algoritmo Fibonacci da Amplitude

O algoritmo principal, com uma assertividade declarada de **84.85%**, analisa o candle parcial (abertura, máxima e mínima) para prever o preço de fechamento. A lógica principal é:

- Se a abertura do candle está na metade inferior do range (entre a mínima e a máxima), a tendência é de alta.
- Se a abertura está na metade superior, a tendência é de baixa.

A predição é calculada aplicando a proporção de Fibonacci (0.618) à amplitude do movimento.

### Fases de Operação

A engine pode operar em duas fases, detectadas automaticamente com base na escala dos preços do ativo:

- **Fase 1:** Para ativos com preços baixos (ex: ~0.9). Utiliza uma metodologia de "descoberta de chave" para encontrar o melhor padrão.
- **Fase 2:** Para ativos com preços altos (ex: ~9400+). Utiliza o algoritmo Fibonacci da Amplitude.

## 10. Configurações e Parâmetros

As configurações do bot são armazenadas na tabela `config` e podem ser ajustadas pelo usuário na interface. As principais são:

| Parâmetro | Descrição |
| :--- | :--- |
| `mode` | Define se o bot opera em conta `DEMO` ou `REAL`. |
| `tokenDemo` / `tokenReal` | Tokens de API para as contas DEMO e REAL da DERIV. |
| `symbol` | O ativo a ser negociado (ex: `R_100`). |
| `stake` | O valor a ser investido em cada operação (em centavos). |
| `stopDaily` / `takeDaily` | Limites de perda e ganho diários (em centavos). |
| `lookback` | A quantidade de candles históricos a serem usados pela engine de predição. |
| `triggerOffset` | O offset em pontos para o cálculo do gatilho de entrada. |
| `waitTime` | O tempo em minutos que o bot aguarda dentro de um candle antes de fazer a predição. |
| `timeframe` | O tempo gráfico a ser operado: 900 (M15), 1800 (M30) ou 3600 (M60). |

## 11. Estados do Bot

O `tradingBot` opera como uma máquina de estados finitos. Os principais estados são:

| Estado | Descrição |
| :--- | :--- |
| `IDLE` | O bot está parado, aguardando o comando de início. |
| `COLLECTING` | O bot está coletando o histórico de candles da API. |
| `WAITING_MIDPOINT` | O bot está aguardando o momento certo no candle para fazer a predição (`waitTime`). |
| `WAITING_NEXT_HOUR` | O bot está em standby, aguardando um horário permitido pelo Filtro de Horário. |
| `PREDICTING` | O bot está chamando a `predictionEngine` para obter uma predição. |
| `ARMED` | A predição foi feita e o bot está aguardando o preço atingir o gatilho. |
| `ENTERED` | O bot abriu uma posição e está monitorando-a. |
| `MANAGING` | A IA Hedge está analisando a posição para tomar uma decisão. |
| `CLOSED` | A posição foi fechada. |
| `LOCK_RISK` | O bot foi bloqueado por ter atingido o limite de stop ou take diário. |
| `ERROR_API` | Ocorreu um erro na comunicação com a API da DERIV. |
| `DISCONNECTED` | O bot está desconectado da API da DERIV. |

## 12. Gestão de Risco

A plataforma possui múltiplos mecanismos para gerenciamento de risco:

- **Stop Diário:** O bot para de operar automaticamente se o prejuízo acumulado no dia atinge o valor configurado em `stopDaily`.
- **Take Diário:** O bot para de operar automaticamente se o lucro acumulado no dia atinge o valor configurado em `takeDaily`.
- **Early Close:** O bot pode fechar uma posição antes do vencimento se ela atingir um percentual de lucro configurável (`profitThreshold`), garantindo o ganho.
- **1 Trade por Candle:** O sistema previne o *overtrading* permitindo apenas uma operação por candle.
- **Watchdog de Inatividade:** Um componente (`inactivityWatchdog.ts`) monitora a atividade do bot. Se nenhum tick for processado por um período configurado, ele gera um alerta, prevenindo falhas silenciosas.

## 13. Logs e Monitoramento

Todos os eventos importantes são registrados na tabela `eventLogs` e podem ser visualizados na interface do usuário. Isso permite uma auditoria completa de todas as ações do bot, incluindo:

- Início e parada do bot.
- Coleta de candles.
- Predições feitas.
- Posições armadas, abertas e fechadas.
- Ativação de limites de risco.
- Erros de comunicação.

## 14. Problemas Conhecidos

Com base na análise dos arquivos de log e commits anteriores, alguns problemas foram identificados e corrigidos no passado:

- **Erro de Validação de Moeda:** Um erro `Input validation failed: parameters/currency` ocorria ao abrir posições. Isso foi corrigido garantindo que a moeda da conta do usuário seja corretamente identificada e enviada na requisição de compra.
- **Inatividade do Bot:** O bot poderia ficar inativo silenciosamente devido a problemas de conexão ou falhas no processamento de ticks. A implementação do `inactivityWatchdog` ajuda a detectar e alertar sobre essa condição.
- **Predição Invertida:** Houve casos em que a predição de direção (UP/DOWN) estava sendo interpretada de forma invertida. A lógica foi revisada para garantir a correspondência correta entre a predição e o tipo de contrato (CALL/PUT).
- **Bug no Filtro de Horário:** O filtro de horário apresentava bugs que o faziam não operar nos horários corretos. A lógica foi isolada e corrigida no módulo `filtro-horario`.
