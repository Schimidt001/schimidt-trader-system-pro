# Análise Técnica Completa da Plataforma: Schimidt Trader System PRO

**Autor:** Manus AI
**Data:** 11 de Dezembro de 2025
**Versão:** 2.0

**Propósito:** Este documento consolida e expande as análises anteriores, fornecendo um conhecimento técnico aprofundado e atualizado da plataforma `schimidt-trader-system-pro`. O objetivo é servir como a principal fonte de verdade para o entendimento da arquitetura, funcionalidades e código-fonte, guiando futuras manutenções e desenvolvimentos.

---

## 1. Visão Geral e Arquitetura

A plataforma é um sistema de trading algorítmico completo, projetado para operar 24/7 nos mercados de ativos sintéticos da corretora DERIV. O núcleo do sistema é uma arquitetura de três camadas (frontend, backend, banco de dados) com um microserviço adicional para a engine de predição.

O fluxo de dados é orquestrado pelo backend em Node.js, que se comunica com a API da DERIV via WebSockets para dados de mercado em tempo real e execução de ordens. O frontend, construído em React, oferece uma interface de usuário para monitoramento e configuração, comunicando-se com o backend de forma segura através de tRPC.

```mermaid
graph TD
    subgraph Frontend (React)
        A[Dashboard] --> B(Gráficos em Tempo Real)
        A --> C(Monitoramento de Posições)
        D[Página de Configurações] --> E(Gerenciamento de API Keys)
        D --> F(Ajuste de Parâmetros do Bot)
        G[Página de Logs]
    end

    subgraph Backend (Node.js)
        H(Servidor tRPC) <--> I{Lógica de Negócios}
        I --> J(Trading Bot)
        J --> K(Gestão de Risco)
        J --> L(Módulos de IA)
    end

    subgraph Serviços Externos
        M(API da DERIV)
    end

    subgraph Microserviços Internos
        N(Engine de Predição - Python/Flask)
    end

    subgraph Banco de Dados (MySQL/TiDB)
        O[Tabelas: users, config, candles, etc.]
    end

    A & D & G -- tRPC --> H
    J -- WebSocket --> M
    J -- HTTP POST --> N
    I -- Drizzle ORM --> O
```

| Componente | Descrição |
| :--- | :--- |
| **Frontend** | Interface de usuário (UI) em React 19 para interação do usuário, exibindo dados em tempo real, permitindo configurações e visualizando logs. |
| **Backend** | Núcleo da aplicação em Node.js 22, que gerencia a lógica de trading, a comunicação com a API da DERIV e a persistência de dados. |
| **Engine de Predição** | Um microserviço em Python 3.11 com Flask, responsável por executar o algoritmo proprietário "Fibonacci da Amplitude" para prever o movimento dos preços. |
| **Banco de Dados** | Sistema de persistência de dados usando MySQL/TiDB, com schema gerenciado pelo Drizzle ORM. Armazena configurações, dados de mercado, posições, métricas e logs. |

---

## 2. Stack Tecnológico

A plataforma utiliza um conjunto de tecnologias modernas e robustas para garantir desempenho, segurança e escalabilidade.

### 2.1. Frontend

| Tecnologia | Versão | Propósito |
| :--- | :--- | :--- |
| React | 19.1.1 | Biblioteca para construção da interface de usuário. |
| TypeScript | 5.9.3 | Superset do JavaScript que adiciona tipagem estática. |
| Vite | 7.1.7 | Ferramenta de build para desenvolvimento frontend rápido. |
| Tailwind CSS | 4.1.14 | Framework CSS "utility-first" para estilização. |
| shadcn/ui | - | Coleção de componentes de UI reutilizáveis. |
| tRPC (Client) | 11.6.0 | Cliente para comunicação type-safe com o backend. |
| Recharts | 3.3.0 | Biblioteca para criação de gráficos. |
| Wouter | 3.3.5 | Solução de roteamento minimalista para React. |

### 2.2. Backend

| Tecnologia | Versão | Propósito |
| :--- | :--- | :--- |
| Node.js | 22 | Ambiente de execução para o JavaScript no servidor. |
| Express | 4.21.2 | Framework web para criação do servidor e APIs. |
| tRPC (Server) | 11.6.0 | Camada de API para criar endpoints type-safe. |
| Drizzle ORM | 0.44.5 | ORM "TypeScript-first" para interação com o banco de dados. |
| tsx | 4.19.1 | Execução de arquivos TypeScript diretamente (usado em desenvolvimento). |
| WebSocket (`ws`) | 8.18.3 | Biblioteca para comunicação em tempo real com a API da DERIV. |
| Zod | 4.1.12 | Biblioteca para validação de schemas e dados. |

### 2.3. Engine de Predição

| Tecnologia | Versão | Propósito |
| :--- | :--- | :--- |
| Python | 3.11 | Linguagem de programação para a lógica da engine. |
| Flask | - | Micro-framework web para expor a engine como uma API. |
| NumPy | - | Biblioteca para computação numérica e manipulação de arrays. |
| scikit-learn | - | Utilizada para carregar e (potencialmente) usar modelos de machine learning (`.pkl`). |

### 2.4. Banco de Dados e Infraestrutura

| Tecnologia | Versão | Propósito |
| :--- | :--- | :--- |
| MySQL / TiDB | - | Banco de dados relacional para persistência dos dados. |
| Drizzle Kit | 0.31.4 | Ferramenta de linha de comando para gerenciar o schema do banco. |
| Manus OAuth | - | Sistema de autenticação integrado à plataforma Manus. |
| Railway | - | Plataforma de deployment mencionada nos arquivos. |

---

## 3. Estrutura do Projeto

A estrutura de diretórios é bem organizada, separando claramente as responsabilidades entre frontend, backend, código compartilhado e configurações.

```
/home/ubuntu/schimidt-trader-system-pro/
├── client/              # Código do Frontend (React)
│   └── src/
│       ├── pages/       # Componentes de página (Dashboard, Settings)
│       ├── components/  # Componentes de UI reutilizáveis
│       ├── lib/         # Funções utilitárias, incluindo cliente tRPC
│       └── App.tsx      # Roteamento principal e layout
├── server/              # Código do Backend (Node.js)
│   ├── _core/           # Configurações centrais (tRPC, auth, servidor HTTP)
│   ├── deriv/           # Lógica de integração com a API DERIV
│   │   ├── tradingBot.ts  # Classe principal do bot de trading
│   │   └── derivService.ts# Serviço de comunicação WebSocket
│   ├── prediction/      # Engine de Predição (Python e wrappers TS)
│   │   ├── engine_server.py # Servidor Flask da engine
│   │   └── prediction_engine.py # Algoritmo de predição
│   ├── ai/              # Módulos de Inteligência Artificial
│   │   └── hedgeStrategy.ts # Lógica para operações de hedge
│   ├── market-condition-v2/ # Detector de Condições de Mercado
│   ├── doji-guard/      # Filtro para evitar trades em candles Doji
│   ├── routers.ts       # Definição dos endpoints da API tRPC
│   └── db.ts            # Funções de acesso ao banco de dados
├── drizzle/             # Configuração do banco de dados com Drizzle ORM
│   └── schema.ts        # Definição de todas as tabelas do banco
├── shared/              # Código e tipos compartilhados entre front e back
│   └── types.ts         # Definições de tipos TypeScript
├── package.json         # Dependências e scripts do projeto Node.js
├── Dockerfile           # Instruções para containerização da aplicação
└── README.md            # Documentação geral do projeto
```

---

## 4. Análise do Código-Fonte e Funcionalidades

### 4.1. Backend e Lógica de Trading (`server/deriv/tradingBot.ts`)

O coração da plataforma reside no arquivo `tradingBot.ts`. A classe `TradingBot` gerencia todo o ciclo de vida de uma operação, desde a coleta de dados até o fechamento da posição.

**Principais Estados do Bot:**

*   `IDLE`: Aguardando o comando de início.
*   `COLLECTING`: Coletando dados históricos de candles para a predição.
*   `WAITING_MIDPOINT`: Aguardando o tempo configurado (`waitTime`) dentro do candle atual para iniciar a análise.
*   `PREDICTING`: Chamando a engine de predição em Python.
*   `ARMED`: Predição recebida, aguardando o preço atingir o gatilho de entrada.
*   `ENTERED`: Posição aberta no mercado.
*   `MANAGING`: Monitorando a posição aberta, aplicando lógicas de IA (Hedge).
*   `LOCK_RISK`: Operações bloqueadas por atingir o stop diário (lucro ou prejuízo).

**Gestão de Risco:**

*   **Stop/Take Diário:** Limites de perda e ganho que, quando atingidos, pausam as operações do dia.
*   **Early Close:** Fecha uma posição antes do vencimento se atingir um limiar de lucro (padrão 90%).
*   **1 Trade por Candle:** Evita operar excessivamente no mesmo candle.
*   **Idempotência:** Mecanismos para prevenir a abertura de ordens duplicadas.

### 4.2. Engine de Predição (`server/prediction/prediction_engine.py`)

Este módulo é um serviço Python que implementa o algoritmo "Fibonacci da Amplitude".

*   **Entrada:** Recebe um histórico de candles e os dados parciais do candle atual (abertura, máxima, mínima, preço corrente).
*   **Processamento:**
    1.  Calcula a amplitude (máxima - mínima) dos candles.
    2.  Aplica uma lógica baseada na sequência de Fibonacci para identificar a "fase" do mercado.
    3.  Projeta um preço de fechamento com base em padrões históricos e na fase identificada.
*   **Saída:** Retorna um objeto JSON com o preço de fechamento previsto e a direção (`up` ou `down`).

### 4.3. Módulos de Inteligência Artificial

A plataforma inclui módulos avançados para otimizar a tomada de decisão:

*   **IA Hedge Inteligente (`server/ai/hedgeStrategy.ts`):** Analisa uma posição aberta que está se movendo contra a predição inicial e decide entre três ações: `REINFORCE` (reforçar a posição), `HEDGE` (abrir uma posição oposta para mitigar perdas) ou `HOLD` (manter a posição).
*   **Detector de Condições de Mercado (`server/market-condition-v2/`):** Avalia o mercado com base em indicadores técnicos (ATR, fractais) e notícias econômicas para classificar a condição como `GREEN` (ideal), `YELLOW` (cautela) ou `RED` (perigosa), podendo pausar as operações.
*   **DojiGuard (`server/doji-guard/`):** Um filtro que impede a abertura de trades se o candle anterior for um Doji (candle de indecisão), que sinaliza volatilidade imprevisível.

### 4.4. Frontend e Interface do Usuário (`client/`)

A interface é dividida em três seções principais:

*   **Dashboard:** Exibe o status do bot, P&L (Profit and Loss) diário/mensal, saldo da conta, posições abertas e um gráfico em tempo real (usando Recharts) que plota os candles e as linhas de predição.
*   **Configurações:** Permite ao usuário inserir seus tokens da API da DERIV (modo `DEMO` ou `REAL`), selecionar o ativo, definir o valor da operação (stake), configurar os limites de risco (stop/take) e ajustar todos os parâmetros avançados dos módulos de IA e da engine.
*   **Logs:** Apresenta um histórico detalhado de todos os eventos do sistema, como predições, aberturas de posição, erros e status do bot, permitindo uma auditoria completa das operações.

---

## 5. Schema do Banco de Dados (`drizzle/schema.ts`)

O schema é bem estruturado e normalizado, cobrindo todas as necessidades da aplicação.

| Tabela | Propósito |
| :--- | :--- |
| `users` | Armazena informações dos usuários (autenticação via Manus OAuth). |
| `config` | Guarda todas as configurações personalizadas de cada bot para cada usuário. Crucial para a operação do sistema. |
| `candles` | Armazena o histórico de dados de candles (OHLC) para cada ativo e timeframe. |
| `positions` | Registra todas as operações de trading, tanto as abertas quanto as fechadas, incluindo preços, P&L e status. |
| `metrics` | Agrega dados de performance, como P&L diário/mensal, total de trades, vitórias e derrotas. |
| `eventLogs` | Log detalhado de todos os eventos importantes do sistema para auditoria. |
| `botState` | Salva o estado atual do bot, permitindo que ele se recupere de reinicializações. |
| `marketConditions` | Armazena os resultados das análises do Detector de Condições de Mercado. |
| `marketEvents` | Guarda informações sobre eventos macroeconômicos (notícias) que podem impactar o mercado. |
| `marketDetectorConfig` | Configurações específicas para o Detector de Condições de Mercado. |

---

## 6. Conclusão e Próximos Passos

A plataforma `schimidt-trader-system-pro` é um sistema de trading sofisticado, com uma arquitetura robusta e um código bem estruturado. A separação clara de responsabilidades, o uso de tecnologias modernas e a implementação de múltiplos mecanismos de gestão de risco e IA demonstram um alto nível de maturidade técnica.

Este estudo resultou na criação deste documento, que foi salvo na "semente de conhecimento" do agente. Estou pronto para receber as próximas diretrizes e aplicar o conhecimento adquirido para realizar as tarefas necessárias na plataforma.
