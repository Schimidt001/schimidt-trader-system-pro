# Análise Abrangente da Plataforma Schimidt Trader System PRO

**Data da Análise:** 08 de Dezembro de 2025
**Autor:** Manus AI

## 1. Visão Geral e Arquitetura

O **Schimidt Trader System PRO** é uma plataforma de trading automatizado de alta frequência, projetada para operar 24/7 nos mercados de ativos sintéticos da corretora DERIV. O núcleo do sistema é uma **engine de predição proprietária** que utiliza o **Algoritmo Fibonacci da Amplitude** para prever o movimento de preços e executar operações de forma autônoma.

A arquitetura é baseada em um modelo cliente-servidor moderno, desacoplado em três componentes principais:

1.  **Frontend:** Uma interface de usuário reativa construída com **React 19** e **TypeScript**, permitindo que o usuário monitore o bot, configure parâmetros e visualize dados em tempo real.
2.  **Backend:** Um servidor **Node.js 22** com **Express** e **tRPC** que orquestra a lógica de negócio, gerencia a comunicação com a API da DERIV e interage com o banco de dados.
3.  **Prediction Engine:** Um microsserviço em **Python 3.11** com **Flask**, que expõe a lógica de predição do Algoritmo Fibonacci da Amplitude através de uma API REST interna.

O diagrama a seguir ilustra a interação entre os componentes:

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React 19)                       │
│  Dashboard │ Configurações │ Logs │ Gráfico (M15/M30/M60)  │
└──────────────────────┬──────────────────────────────────────┘
                       │ tRPC (API Type-safe)
┌──────────────────────┴──────────────────────────────────────┐
│                  BACKEND (Node.js + Express)                 │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────┐ │
│  │ Trading Bot  │  │ DERIV API   │  │ Prediction Engine  │ │
│  │ (TypeScript) │──│ (WebSocket) │──│ (Python Flask)     │ │
│  └──────────────┘  └─────────────┘  └────────────────────┘ │
└──────────────────────┬──────────────────────────────────────┘
                       │ Drizzle ORM
┌──────────────────────┴──────────────────────────────────────┐
│              BANCO DE DADOS (MySQL/TiDB)                     │
│  users │ config │ candles │ positions │ metrics │ eventLogs │
└─────────────────────────────────────────────────────────────┘
```

## 2. Stack Tecnológico

A plataforma utiliza um conjunto de tecnologias modernas e robustas para garantir desempenho, segurança e escalabilidade.

| Categoria         | Tecnologia            | Versão/Descrição                                      |
| ----------------- | --------------------- | ----------------------------------------------------- |
| **Frontend**      | React                 | 19 (com hooks)                                        |
|                   | TypeScript            | 5.9.3 (Segurança de tipos)                            |
|                   | Tailwind CSS          | 4.1.14 (Utilitários CSS)                              |
|                   | shadcn/ui             | Componentes de UI pré-construídos e customizáveis     |
|                   | tRPC                  | 11.6.0 (Cliente de API type-safe)                     |
|                   | Recharts              | Gráficos dinâmicos para visualização de dados         |
| **Backend**       | Node.js               | 22 (Runtime JavaScript assíncrono)                    |
|                   | Express               | 4.21.2 (Framework web)                                |
|                   | tRPC                  | 11.6.0 (Servidor de API type-safe)                    |
|                   | Drizzle ORM           | 0.31.4 (ORM para interação com o banco de dados)      |
|                   | WebSocket (`ws`)      | 8.18.3 (Comunicação em tempo real com a API da DERIV) |
| **Prediction Engine** | Python              | 3.11 (Linguagem para a engine de predição)            |
|                   | Flask                 | Microsserviço para expor a API da engine              |
|                   | scikit-learn          | Carregamento de modelos de ML (`.pkl`)                |
| **Banco de Dados**  | MySQL / TiDB          | Banco de dados relacional para persistência de dados  |
| **Autenticação**  | Manus OAuth           | Gerenciamento de usuários e autenticação              |

## 3. Estrutura do Banco de Dados

O schema do banco de dados, gerenciado pelo Drizzle ORM, é central para a operação da plataforma. Ele armazena desde configurações de usuário até o histórico detalhado de cada operação. As tabelas principais são:

-   `users`: Gerencia as informações dos usuários, vinculadas ao sistema de autenticação.
-   `config`: Armazena todas as configurações personalizadas de cada bot para cada usuário, incluindo tokens de API, stake, limites de risco, e parâmetros de funcionalidades avançadas como Filtro de Horário e IA Hedge.
-   `botState`: Mantém o estado atual de cada bot (`IDLE`, `PREDICTING`, `ENTERED`, etc.), permitindo a recuperação de estado em caso de reinicialização.
-   `candles`: Guarda o histórico de candles (OHLC) para cada ativo e timeframe, servindo como base para a engine de predição.
-   `positions`: Registra cada operação realizada, incluindo preços de entrada/saída, status, predição associada e PnL (Profit and Loss).
-   `metrics`: Agrega dados de performance (PnL, total de trades, vitórias, derrotas) em base diária e mensal para cada bot.
-   `eventLogs`: Log detalhado de todos os eventos importantes do sistema, crucial para auditoria e depuração.
-   `marketConditions`: Armazena os resultados da análise do **Market Condition Detector**, classificando o mercado como `GREEN`, `YELLOW` ou `RED`.
-   `marketEvents`: Cache de eventos macroeconômicos (notícias) obtidos de fontes externas, usado pelo Market Condition Detector.

## 4. Lógica de Negócio e Funcionalidades Principais

A plataforma é composta por vários módulos que trabalham em conjunto para automatizar o processo de trading.

### 4.1. Trading Bot (`tradingBot.ts`)

Esta é a classe principal que encapsula a máquina de estados do bot. Com mais de 2.200 linhas de código, ela gerencia todo o ciclo de vida de uma operação:

1.  **Inicialização:** Carrega as configurações do usuário do banco de dados.
2.  **Coleta de Dados:** Aguarda o momento ideal no ciclo de um candle (definido por `waitTime`) para coletar os dados parciais (OHLC).
3.  **Predição:** Envia os dados do candle para a **Prediction Engine** via API interna.
4.  **Armar Gatilho:** Com a predição de fechamento em mãos, calcula um preço de gatilho (`trigger`) aplicando um `offset`.
5.  **Entrada:** Monitora o preço do ativo em tempo real via WebSocket e abre uma posição (CALL ou PUT) quando o preço cruza o gatilho.
6.  **Gerenciamento:** Monitora a posição aberta, aplicando lógicas como **Early Close** (fechamento antecipado com lucro alto) e acionando a **IA Hedge** se necessário.
7.  **Finalização:** Registra o resultado da operação no banco de dados e atualiza as métricas de performance.

### 4.2. Engine de Predição (`prediction_engine.py`)

O cérebro do sistema. Este microsserviço Python implementa o **Algoritmo Fibonacci da Amplitude**. Sua lógica principal é:

-   Recebe os dados de um candle parcial (abertura, máxima, mínima).
-   Calcula o ponto médio (`(máxima + mínima) / 2`).
-   Se a abertura estiver abaixo do ponto médio, projeta um fechamento em alta usando a proporção de Fibonacci (0.618).
-   Se a abertura estiver acima, projeta um fechamento em baixa, também usando a proporção de 0.618.
-   Retorna o preço de fechamento previsto e a direção (`up` ou `down`).

### 4.3. IA Hedge Inteligente (`hedgeStrategy.ts`)

Um módulo de gerenciamento de risco avançado que entra em ação após uma posição ser aberta. Ele analisa a posição em tempo real e pode tomar uma das seguintes decisões com base em um conjunto de regras matemáticas e configurações (`HedgeConfig`):

-   **HOLD:** Manter a posição original sem intervenção.
-   **REINFORCE (Reforço):** Abrir uma segunda posição na mesma direção se o mercado fizer um *pullback* favorável, aumentando a exposição com um preço de entrada melhorado.
-   **HEDGE (Proteção):** Abrir uma posição na direção oposta se uma forte reversão de mercado for detectada, visando mitigar a perda da operação original.
-   **REVERSAL_EDGE:** Uma variação do hedge para reversões rápidas no final do candle.

### 4.4. Filtro de Horário (`hourlyFilterLogic.ts`)

Permite que o bot opere apenas em horários específicos do dia, que podem ser pré-definidos (`IDEAL`, `COMPATIBLE`, `GOLDEN`) ou customizados pelo usuário. A funcionalidade de **Horários GOLD** permite ainda que o stake (valor da operação) seja multiplicado automaticamente em horários de maior confiança.

### 4.5. Market Condition Detector (`marketConditionDetector.ts`)

Um sistema de análise que avalia o contexto geral do mercado para evitar operar em condições desfavoráveis. Ele executa periodicamente e analisa:

-   **Critérios Internos:** Volatilidade (usando ATR), tamanho das sombras (wicks) dos candles, e spread.
-   **Critérios Externos:** Proximidade de notícias de alto impacto (buscando na tabela `marketEvents`).

Com base nesses critérios, classifica o mercado como `GREEN` (ideal), `YELLOW` (cautela) ou `RED` (não operar), e o bot pode ser configurado para respeitar essa classificação.

## 5. Conclusão da Análise

A plataforma Schimidt Trader System PRO é um sistema complexo e bem arquitetado, que combina uma lógica de trading proprietária com tecnologias modernas de desenvolvimento web e de software. A separação clara entre frontend, backend e a engine de predição permite manutenibilidade e escalabilidade. As funcionalidades avançadas de gestão de risco, como a IA Hedge e o Market Condition Detector, demonstram um alto grau de sofisticação e visam proteger o capital do usuário enquanto maximizam as oportunidades de lucro.

A documentação existente no repositório, embora extensa, está fragmentada em múltiplos arquivos. Esta análise consolidada serve como um ponto de partida unificado para o entendimento completo do sistema, suas tecnologias e seu comportamento, e será salva na minha base de conhecimento para futuras interações.
