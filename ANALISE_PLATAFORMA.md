# Análise da Plataforma Schimidt Trader System PRO

**Autor:** Manus AI
**Data:** 06 de novembro de 2025

## 1. Visão Geral

O **Schimidt Trader System PRO** é uma plataforma de trading automatizado de ponta a ponta, projetada para operar 24/7 nos mercados de ativos sintéticos da corretora **DERIV**. O sistema é construído com uma arquitetura moderna, separando o frontend (interface do usuário) do backend (lógica de negócio), e integra um motor de predição proprietário desenvolvido em Python.

A plataforma visa automatizar completamente o ciclo de trading, desde a coleta de dados e análise de mercado até a execução e gerenciamento de posições, incorporando estratégias de gestão de risco e uma interface de usuário para monitoramento e configuração.

## 2. Arquitetura do Sistema

A arquitetura é dividida em três camadas principais: **Frontend**, **Backend** e **Banco de Dados**, com um serviço de predição desacoplado. A comunicação entre o frontend e o backend é realizada através de uma API type-safe usando **tRPC**.

| Camada | Tecnologia Principal | Responsabilidade |
| :--- | :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite | Interface do usuário, dashboard, configurações, visualização de logs e gráficos. |
| **Backend** | Node.js 22, Express, tRPC | Orquestração, lógica de trading, comunicação com a API da DERIV, gerenciamento de estado. |
| **Motor de Predição** | Python 3.11, Flask | Análise de dados de mercado e predição do fechamento de candles (Algoritmo Fibonacci da Amplitude). |
| **Banco de Dados** | MySQL/TiDB, Drizzle ORM | Persistência de configurações, dados de mercado, posições, logs e estado do bot. |

```mermaid
graph TD
    subgraph Usuário
        A[Browser] --> B{Frontend (React)};
    end

    subgraph Servidor
        B -- tRPC API --> C{Backend (Node.js)};
        C -- WebSocket --> D[API da DERIV];
        C -- HTTP --> E{Motor de Predição (Python)};
        C -- SQL --> F[(Banco de Dados)];
    end

    style A fill:#f9f,stroke:#333,stroke-width:2px
    style B fill:#ccf,stroke:#333,stroke-width:2px
    style C fill:#cfc,stroke:#333,stroke-width:2px
    style D fill:#fcf,stroke:#333,stroke-width:2px
    style E fill:#ffc,stroke:#333,stroke-width:2px
    style F fill:#fec,stroke:#333,stroke-width:2px
```

## 3. Componentes Principais

A seguir, uma análise detalhada dos arquivos e módulos mais críticos do sistema.

### 3.1. Lógica do Bot de Trading (`server/deriv/tradingBot.ts`)

Este é o coração da aplicação. A classe `TradingBot` encapsula toda a lógica de operação, gerenciamento de estado e interação com outros serviços. 

**Principais Responsabilidades:**
- **Gerenciamento de Estado:** Controla o ciclo de vida do bot através de estados bem definidos como `IDLE`, `COLLECTING`, `PREDICTING`, `ARMED`, `ENTERED`, e `MANAGING`.
- **Orquestração do Fluxo:** Coordena a coleta de dados históricos, a espera pelo momento ideal do candle, a chamada ao motor de predição e a execução de ordens.
- **Gestão de Risco:** Implementa as regras de stop/take diário, fechamento antecipado (`Early Close`) e a lógica de apenas um trade por candle.
- **Interação com a DERIV:** Utiliza o `DerivService` para se conectar, subscrever a dados de mercado e executar ordens.
- **IA de Hedge:** Integra a lógica de hedge (`hedgeStrategy.ts`) para abrir posições secundárias (reforço ou proteção) com base em uma análise matemática do movimento do candle.

### 3.2. Serviço de Comunicação com a DERIV (`server/deriv/derivService.ts`)

Este módulo abstrai toda a comunicação com a API da DERIV, utilizando WebSockets para a recepção de dados em tempo real (ticks) e chamadas de API para ações como compra e venda de contratos.

**Funcionalidades Chave:**
- **Conexão e Autenticação:** Gerencia a conexão WebSocket e a autorização com o token do usuário.
- **Reconexão Automática:** Possui uma lógica robusta de reconexão para garantir a operação contínua (24/7).
- **Subscrição de Dados:** Permite a subscrição a `ticks` de um determinado ativo.
- **Execução de Ordens:** Fornece métodos para comprar (`buyContract`) e vender (`sellContract`) contratos.
- **Busca de Dados:** Permite obter o histórico de candles (`getCandleHistory`) e o saldo da conta (`getBalance`).

### 3.3. Motor de Predição (`server/prediction/prediction_engine.py`)

Este é um micro-serviço em Python que expõe um único endpoint (`/predict`) para prever o preço de fechamento de um candle M15. Ele implementa o **Algoritmo Fibonacci da Amplitude**.

**Funcionamento:**
1.  Recebe o histórico de candles e os dados parciais do candle atual (abertura, máxima, mínima).
2.  Calcula o ponto médio do candle (`(máxima + mínima) / 2`).
3.  Aplica a retração de Fibonacci (0.618) para projetar o fechamento com base na posição da abertura em relação ao ponto médio.
    - Se a abertura está na metade inferior, projeta uma alta.
    - Se a abertura está na metade superior, projeta uma baixa.
4.  Retorna a predição de fechamento e a direção (UP/DOWN).

O serviço é gerenciado pelo `engineManager.ts` no lado do Node.js, que é responsável por iniciar e parar o processo Python.

### 3.4. API e Roteamento (`server/routers.ts`)

Define todos os endpoints da API utilizando **tRPC**, o que garante a segurança de tipos entre o frontend e o backend. Os endpoints são agrupados por funcionalidade:

- **`config`**: Leitura e atualização das configurações do bot.
- **`bot`**: Iniciar, parar e obter o status do bot.
- **`dashboard`**: Obter dados para o painel, como saldo e métricas de performance.
- **`positions`**: Listar as posições de trading.
- **`logs`**: Obter os logs de eventos do sistema.

### 3.5. Esquema do Banco de Dados (`drizzle/schema.ts`)

O esquema define a estrutura de dados da aplicação, gerenciada pelo Drizzle ORM. As tabelas principais são:

- **`users`**: Informações dos usuários (gerenciado pelo Manus).
- **`config`**: Configurações do bot para cada usuário (token, stake, risco, etc.).
- **`candles`**: Armazena o histórico de candles M15.
- **`positions`**: Registra todas as posições abertas e fechadas, incluindo dados da predição e do hedge.
- **`botState`**: Salva o estado atual do bot, permitindo a recuperação em caso de reinicialização.
- **`eventLogs`**: Log detalhado de todos os eventos importantes do sistema para auditoria.
- **`metrics`**: Métricas de performance agregadas (diárias e mensais).

## 4. Fluxo de Operação Completo

O fluxo de uma operação de trade pode ser descrito nos seguintes passos:

1.  **Inicialização:** O usuário clica em "Iniciar Bot" no frontend.
2.  **Coleta de Dados:** O `TradingBot` é instanciado. Ele se conecta à DERIV e busca o histórico de 500 candles M15 (`COLLECTING`).
3.  **Espera Estratégica:** O bot aguarda até que 8 minutos do candle M15 atual tenham se passado (`WAITING_MIDPOINT`). Este é o momento ideal para a captura de dados, conforme a estratégia.
4.  **Predição:** O bot captura os dados do candle parcial (abertura, máxima, mínima) e os envia para o **Motor de Predição** (`PREDICTING`).
5.  **Armar Gatilho:** Com a predição de fechamento em mãos, o bot calcula um preço de gatilho (`trigger`), que é a predição +/- um offset (padrão de 16 pontos). O bot entra no estado `ARMED`.
6.  **Entrada na Posição:** O bot monitora os ticks em tempo real. Se o preço do ativo cruzar o gatilho na direção esperada, ele executa a ordem de compra (CALL ou PUT) via `DerivService` e entra no estado `ENTERED`.
7.  **Gerenciamento (IA Hedge):** Durante o tempo em que a posição está aberta, a lógica da **IA Hedge** (`analyzePositionForHedge`) é executada nos minutos finais do candle (12 a 14) para decidir se deve:
    - **Manter (`HOLD`):** Se a posição estiver progredindo bem.
    - **Reforçar (`REINFORCE`):** Abrir uma segunda posição na mesma direção se houver um pullback favorável.
    - **Proteger (`HEDGE`):** Abrir uma posição oposta se uma forte reversão for detectada.
8.  **Fechamento:** A posição é fechada automaticamente no vencimento do candle M15. O resultado (lucro ou prejuízo) é registrado, e as métricas são atualizadas.
9.  **Ciclo:** O bot aguarda o próximo candle para reiniciar o processo.

## 5. Dependências e Tecnologias

| Categoria | Tecnologia/Biblioteca | Propósito |
| :--- | :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, TailwindCSS, shadcn/ui, Recharts, Wouter | UI, tipagem, build, estilização, componentes, gráficos, roteamento. |
| **Backend** | Node.js 22, Express, tRPC, Drizzle ORM, Zod, WebSocket (`ws`) | Runtime, servidor, API type-safe, ORM, validação, comunicação com DERIV. |
| **Predição** | Python 3.11, Flask, NumPy | Servidor da engine, cálculos numéricos. |
| **Banco de Dados** | MySQL / TiDB | Armazenamento persistente. |
| **DevOps** | pnpm, tsx, esbuild, Docker | Gerenciamento de pacotes, execução em dev, build, containerização. |

## 6. Pontos de Atenção para Modificações

- **Tipagem Estrita:** O projeto utiliza TypeScript e Zod extensivamente. Qualquer modificação deve respeitar a tipagem para evitar erros em tempo de execução.
- **Estado do Bot:** A lógica de gerenciamento de estado em `tradingBot.ts` é complexa e sensível. Alterações nos estados ou transições devem ser feitas com cuidado.
- **Comunicação Assíncrona:** A interação com a API da DERIV e com o motor de predição é assíncrona. É crucial lidar corretamente com `Promises` e possíveis falhas de comunicação.
- **Variáveis de Ambiente:** O sistema depende de variáveis de ambiente para a conexão com o banco de dados e outras configurações. Certifique-se de que o arquivo `.env` esteja configurado corretamente.
- **Migrações de Banco de Dados:** Alterações no `drizzle/schema.ts` exigem a criação e aplicação de migrações (`pnpm db:push`) para atualizar o banco de dados de forma consistente.
- **Lógica Financeira:** Toda a lógica que envolve cálculos de stake, PnL e outras métricas financeiras utiliza **centavos** (inteiros) para evitar problemas de precisão com ponto flutuante. Mantenha este padrão.
