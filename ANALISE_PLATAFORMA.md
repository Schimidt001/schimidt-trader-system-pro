# Análise Completa da Plataforma - Schimidt Trader System PRO

**Data**: 05 de Novembro de 2025
**Autor**: Manus AI

## 1. Visão Geral

O **Schimidt Trader System PRO** é uma plataforma de trading automatizado de alta frequência, projetada para operar 24/7 nos mercados de ativos sintéticos da corretora DERIV. O sistema é construído com uma arquitetura moderna e robusta, utilizando uma stack de tecnologias que inclui React, Node.js, Python e TypeScript. O core do sistema é uma engine de predição proprietária, baseada no algoritmo "Fibonacci da Amplitude", que visa prever o movimento de preços de candles de 15 minutos (M15) com alta assertividade.

A plataforma é composta por um frontend reativo para interação do usuário, um backend que orquestra as operações, uma engine de predição em Python para análise de dados de mercado, e um banco de dados para persistência de configurações, operações e logs. A comunicação entre o frontend e o backend é realizada através de uma API type-safe com tRPC.

## 2. Arquitetura do Sistema

A arquitetura do sistema é dividida em três componentes principais: Frontend, Backend e a Engine de Predição. A comunicação entre eles é bem definida, garantindo a separação de responsabilidades e a escalabilidade do sistema.

| Componente | Tecnologias | Responsabilidades |
| :--- | :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui, tRPC | Interface do usuário, dashboard, configurações, logs e gráficos. |
| **Backend** | Node.js 22, Express, tRPC, Drizzle ORM, WebSocket | Lógica de negócio do bot, gerenciamento de estado, comunicação com a API da DERIV, persistência de dados. |
| **Engine de Predição** | Python 3.11, Flask, scikit-learn | Análise de dados de mercado, execução do algoritmo de predição e fornecimento de previsões de preço. |
| **Banco de Dados** | MySQL/TiDB | Armazenamento de dados de usuários, configurações, candles, posições, métricas e logs de eventos. |

## 3. Fluxo de Dados e Lógica de Negócio

O fluxo de dados e a lógica de negócio do sistema são projetados para garantir a automação completa do processo de trading, desde a análise de mercado até a execução e gerenciamento de posições.

### 3.1. Ciclo de Vida do Bot

O bot opera em um ciclo de vida bem definido, representado por diferentes estados:

- **IDLE**: O bot está parado e aguardando o comando de início.
- **COLLECTING**: Coleta o histórico de candles para a análise inicial.
- **WAITING_MIDPOINT**: Aguarda 8 minutos do candle M15 para obter dados parciais.
- **PREDICTING**: Envia os dados para a engine de predição e aguarda o resultado.
- **ARMED**: A predição foi recebida e um gatilho de entrada foi definido. O bot monitora o preço para executar a ordem.
- **ENTERED**: Uma posição foi aberta no mercado.
- **MANAGING**: Gerencia a posição aberta, verificando a possibilidade de fechamento antecipado ou a necessidade de hedge.
- **CLOSED**: A posição foi fechada.
- **LOCK_RISK**: O bot está bloqueado devido ao atingimento do stop diário ou take diário.
- **ERROR_API**: Ocorreu um erro na comunicação com a API da DERIV.
- **DISCONNECTED**: O bot está desconectado da API da DERIV.

### 3.2. Engine de Predição e Estratégia de Entrada

A engine de predição, implementada em Python, utiliza o algoritmo "Fibonacci da Amplitude" para prever o preço de fechamento de um candle M15. A lógica de entrada é a seguinte:

1.  O bot aguarda 8 minutos do candle M15.
2.  Coleta os dados parciais do candle (abertura, máxima, mínima e preço atual).
3.  Envia os dados para a engine de predição.
4.  A engine retorna a predição de fechamento e a direção (alta ou baixa).
5.  O bot calcula um preço de gatilho (trigger) com base na predição, com um offset de 16 pontos (configurável).
6.  O bot monitora os ticks de preço em tempo real e executa uma ordem de compra (CALL) ou venda (PUT) quando o preço cruza o gatilho.

### 3.3. Gestão de Posição e IA de Hedge

Uma vez que uma posição está aberta, o sistema utiliza uma lógica de gerenciamento avançada, incluindo uma IA de Hedge, para otimizar os resultados e mitigar riscos.

- **Early Close**: A posição pode ser fechada antecipadamente se atingir 90% do lucro máximo esperado.
- **Fechamento Automático**: A posição é fechada 20 segundos antes do final do candle M15, se estiver em lucro.
- **IA de Hedge**: Uma estratégia de IA, implementada em `server/ai/hedgeStrategy.ts`, analisa a posição em tempo real e pode decidir por uma das seguintes ações:
    - **HOLD**: Manter a posição sem alterações.
    - **REINFORCE**: Aumentar a posição se o mercado se mover a favor, mas de forma lenta (pullback).
    - **HEDGE**: Abrir uma posição oposta para mitigar perdas se o mercado se mover contra a predição.
    - **REVERSAL_EDGE**: Abrir uma posição oposta se o preço se estender demais na direção prevista, antecipando uma reversão no final do candle.

## 4. Estrutura do Banco de Dados

O schema do banco de dados, definido em `drizzle/schema.ts`, é bem estruturado e normalizado para suportar as funcionalidades da plataforma. As principais tabelas são:

- **users**: Armazena informações dos usuários.
- **config**: Guarda as configurações do bot para cada usuário, incluindo tokens de API, stake, limites de risco e as configurações da IA de Hedge (em formato JSON).
- **candles**: Histórico de candles M15 para cada ativo.
- **positions**: Registro detalhado de todas as operações, incluindo informações sobre hedge.
- **metrics**: Métricas de desempenho agregadas por dia e mês.
- **eventLogs**: Logs de eventos importantes para auditoria e depuração.
- **botState**: Persiste o estado atual do bot, permitindo a recuperação em caso de reinicialização.

## 5. Rotas e Endpoints da API

A comunicação entre o frontend e o backend é feita através de tRPC, com os seguintes namespaces de rotas:

- **auth**: Autenticação de usuários.
- **config**: Leitura e atualização das configurações do bot.
- **bot**: Controle do ciclo de vida do bot (iniciar, parar, resetar).
- **dashboard**: Fornece dados para o dashboard, como saldo, métricas e candles.
- **positions**: Lista as posições abertas e históricas.
- **logs**: Fornece os logs de eventos do sistema.
- **prediction**: Verifica a saúde da engine de predição.

A engine de predição em Python expõe um endpoint `POST /predict` em `http://localhost:5070` para o backend Node.js.

## 6. Conclusão

A análise completa do repositório revela um sistema de trading automatizado robusto, bem arquitetado e com uma lógica de negócio sofisticada. A separação de responsabilidades, o uso de tecnologias modernas e a implementação de estratégias avançadas de gestão de risco e hedge demonstram um alto nível de maturidade técnica. A base de código é clara, bem documentada e preparada para futuras manutenções e evoluções.
