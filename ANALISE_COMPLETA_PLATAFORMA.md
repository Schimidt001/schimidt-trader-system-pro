# Análise Completa da Plataforma: Schimidt Trader System PRO

**Data da Análise:** 10 de Dezembro de 2025
**Autor:** Manus AI
**Versão do Repositório:** HEAD (Último commit analisado)

**Propósito:** Este documento consolida o conhecimento adquirido através de uma análise aprofundada do código-fonte e da documentação existente no repositório `Schimidt001/schimidt-trader-system-pro`. O objetivo é servir como uma referência técnica centralizada, detalhando a arquitetura, tecnologias, funcionalidades e lógica de negócio da plataforma.

---

## 📋 Índice

1.  [Visão Geral e Arquitetura](#1-visão-geral-e-arquitetura)
2.  [Stack Tecnológico](#2-stack-tecnológico)
3.  [Estrutura do Projeto](#3-estrutura-do-projeto)
4.  [Esquema do Banco de Dados](#4-esquema-do-banco-de-dados)
5.  [Lógica Central de Negócio: O Trading Bot](#5-lógica-central-de-negócio-o-trading-bot)
6.  [Módulos de Inteligência e Risco](#6-módulos-de-inteligência-e-risco)
    - 6.1. [Engine de Predição (Python)](#61-engine-de-predição-python)
    - 6.2. [IA Hedge Inteligente](#62-ia-hedge-inteligente)
    - 6.3. [Detector de Condições de Mercado v2](#63-detector-de-condições-de-mercado-v2)
    - 6.4. [Filtro de Horário](#64-filtro-de-horário)
    - 6.5. [DojiGuard (Filtro Anti-Doji)](#65-dojiguard-filtro-anti-doji)
7.  [Comunicação com a API DERIV](#7-comunicação-com-a-api-deriv)
8.  [Parâmetros de Configuração](#8-parâmetros-de-configuração)
9.  [Scripts e Comandos](#9-scripts-e-comandos)
10. [Conclusão e Próximos Passos](#10-conclusão-e-próximos-passos)

---

## 1. Visão Geral e Arquitetura

O **Schimidt Trader System PRO** é uma plataforma de trading automatizado de alta frequência, projetada para operar 24/7 nos mercados de ativos sintéticos da corretora DERIV. O seu núcleo é uma **engine de predição proprietária**, escrita em Python, que utiliza o "Algoritmo Fibonacci da Amplitude" para prever o movimento de preços e executar operações de compra (CALL) e venda (PUT).

A arquitetura é baseada em um monorepo com uma separação clara entre o frontend e o backend, utilizando tecnologias modernas para garantir comunicação em tempo real, segurança e escalabilidade.

| Camada | Componente Principal | Descrição |
| :--- | :--- | :--- |
| **Frontend** | React 19 + TypeScript | Interface de usuário reativa para monitoramento e configuração do bot. Inclui dashboard com gráficos, logs em tempo real e painel de configurações. |
| **API Layer** | tRPC 11 | Camada de comunicação type-safe entre o frontend e o backend, eliminando a necessidade de gerenciar endpoints REST/GraphQL tradicionais. |
| **Backend** | Node.js 22 + TypeScript | Orquestra toda a lógica de negócio. Gerencia o estado do bot, a comunicação com a API da DERIV, a interação com a engine de predição e o acesso ao banco de dados. |
| **Prediction Engine** | Python 3.11 + Flask | Microserviço interno que expõe a lógica de predição. Recebe dados parciais de um candle e retorna a previsão de fechamento e a direção do preço. |
| **Database** | MySQL / TiDB | Armazena todas as informações persistentes, incluindo configurações de usuário, estado do bot, histórico de candles, posições, métricas de performance e logs. |
| **Integração Externa**| WebSocket | Conexão direta com a API da DERIV para receber ticks de preço em tempo real e executar ordens de compra/venda. |

---

## 2. Stack Tecnológico

A plataforma utiliza um conjunto de tecnologias modernas e robustas, escolhidas para otimizar o desempenho, a segurança e a experiência de desenvolvimento.

| Categoria | Tecnologia | Versão | Propósito |
| :--- | :--- | :--- | :--- |
| **Frontend** | React | 19.1.1 | Construção da interface de usuário. |
| | TypeScript | 5.9.3 | Garante a segurança de tipos no código. |
| | Tailwind CSS | 4.1.14 | Framework de estilização CSS utilitário. |
| | shadcn/ui | - | Coleção de componentes de UI reutilizáveis. |
| | Recharts | 3.3.0 | Biblioteca para criação de gráficos. |
| | wouter | 3.3.5 | Solução de roteamento minimalista para React. |
| **Backend** | Node.js | 22 | Ambiente de execução do servidor. |
| | Express | 4.21.2 | Framework web para o servidor Node.js. |
| | tRPC | 11.6.0 | Criação de APIs type-safe. |
| | Drizzle ORM | 0.44.5 | ORM para interação com o banco de dados. |
| | Zod | 4.1.12 | Validação de schemas e tipos. |
| | WebSocket (ws) | 8.18.3 | Comunicação em tempo real com a API da DERIV. |
| **Prediction Engine** | Python | 3.11 | Ambiente de execução da engine. |
| | Flask | - | Micro-framework para expor a API da engine. |
| | NumPy | - | Computação numérica e manipulação de arrays. |
| **Banco de Dados** | MySQL / TiDB | - | Armazenamento de dados persistentes. |
| **Utilitários** | pnpm | 10.15.1 | Gerenciador de pacotes Node.js. |
| | tsx | 4.19.1 | Execução de arquivos TypeScript diretamente. |
| | Vitest | 2.1.4 | Framework de testes unitários. |


---

## 3. Estrutura do Projeto

O repositório está organizado de forma lógica, separando as responsabilidades em diretórios específicos. A estrutura principal é a seguinte:

```
/home/ubuntu/schimidt-trader-system-pro/
├── client/              # Código-fonte do Frontend (React)
├── server/              # Código-fonte do Backend (Node.js)
│   ├── _core/           # Arquivos centrais do framework (tRPC, auth)
│   ├── ai/              # Módulo de IA para Hedge
│   ├── deriv/           # Lógica de negócio e integração com a API DERIV
│   ├── doji-guard/      # Módulo de filtro Anti-Doji
│   ├── market-condition/ # Detector de Condições de Mercado (v1)
│   ├── market-condition-v2/ # Detector de Condições de Mercado (v2)
│   └── prediction/      # Engine de Predição (Python)
├── drizzle/             # Schema e migrations do banco de dados (Drizzle ORM)
├── filtro-horario/      # Módulo de Filtro de Horário
├── shared/              # Tipos e constantes compartilhados entre front e back
├── package.json         # Dependências e scripts do projeto
├── README.md            # Documentação geral do projeto
└── ...                  # Outros arquivos de configuração e documentação
```

---

## 4. Esquema do Banco de Dados

O banco de dados é o coração do sistema, persistindo todas as informações críticas. O schema é definido em `drizzle/schema.ts` e utiliza o Drizzle ORM. As tabelas principais são:

| Tabela | Propósito |
| :--- | :--- |
| `users` | Armazena informações dos usuários autenticados via Manus OAuth. |
| `config` | Contém todas as configurações personalizáveis do bot para cada usuário e `botId`, como stake, limites de risco, tokens de API, e configurações de módulos. |
| `botState` | Guarda o estado atual de cada bot (`IDLE`, `PREDICTING`, etc.) para persistência entre reinicializações. |
| `candles` | Armazena o histórico de candles (OHLC) para cada ativo e timeframe, usado pela engine de predição. |
| `positions` | Registra todas as operações de trading, incluindo detalhes de entrada, saída, predição, status e PnL (Profit and Loss). |
| `metrics` | Agrega dados de performance (PnL, total de trades, vitórias, derrotas) em base diária e mensal. |
| `eventLogs` | Log detalhado de todos os eventos importantes do sistema para auditoria e depuração. |
| `marketConditions` | Armazena os resultados da análise do `MarketConditionDetector` para cada candle. |
| `marketEvents` | Guarda informações sobre eventos macroeconômicos (notícias) coletadas de fontes externas. |
| `marketDetectorConfig` | Configurações específicas para o `MarketConditionDetector`. |

---

## 5. Lógica Central de Negócio: O Trading Bot

A lógica principal reside no arquivo `server/deriv/tradingBot.ts`. A classe `TradingBot` é uma máquina de estados que gerencia todo o ciclo de vida de uma operação, desde a coleta de dados até o fechamento da posição.

**Principais Estados do Bot:**

-   `IDLE`: O bot está inativo, aguardando o comando de início.
-   `COLLECTING`: Coletando o histórico de candles necessário para a predição.
-   `WAITING_MIDPOINT`: Aguardando o tempo configurado (`waitTime`) dentro do candle atual antes de fazer a predição.
-   `PREDICTING`: Chamando a engine de predição em Python para obter a previsão de fechamento.
-   `ARMED`: A predição foi recebida e um gatilho de entrada foi calculado. O bot está monitorando o preço para executar a ordem.
-   `ENTERED`: Uma posição foi aberta na corretora.
-   `MANAGING`: Gerenciando a posição aberta, aplicando lógicas como IA Hedge e Early Close.
-   `LOCK_RISK`: O bot atingiu o limite de perda (Stop Loss) ou ganho (Take Profit) diário e está bloqueado até o próximo dia.
-   `ERROR_API`: Ocorreu um erro na comunicação com a API da DERIV.

O fluxo de operação é rigorosamente controlado para executar apenas **um trade por candle**, evitando a superexposição ao mercado.

---

## 6. Módulos de Inteligência e Risco

A plataforma vai além de uma simples execução de sinais, incorporando múltiplos módulos para análise de mercado, gestão de risco e otimização de entradas. Estes módulos funcionam em conjunto para aumentar a assertividade e proteger o capital.

### 6.1. Engine de Predição (Python)

Localizada em `server/prediction/prediction_engine.py`, esta é a peça central da estratégia. Ela não utiliza um modelo de Machine Learning tradicional (`.pkl`), mas sim uma implementação direta do **"Algoritmo Fibonacci da Amplitude"**.

-   **Detecção de Fase:** A engine primeiro detecta a "fase" do mercado analisando a escala dos preços. Mercados com preços baixos (ex: ~0.9) são Fase 1, enquanto mercados com preços altos (ex: ~9400+) são Fase 2.
-   **Lógica de Predição:**
    -   **Fase 2 (Principal):** Aplica o algoritmo Fibonacci da Amplitude. A predição é calculada com base na posição do preço de abertura em relação ao ponto médio entre a máxima e a mínima do candle parcial. A fórmula exata é `abertura + 0.618 * (maxima - abertura)` para tendência de alta e `abertura - 0.618 * (abertura - minima)` para tendência de baixa.
    -   **Fase 1:** Utiliza uma metodologia de "descoberta de chave", testando diferentes funções matemáticas simples nos dados históricos para encontrar a que melhor se correlaciona com os movimentos de preço passados.
-   **Interface:** A engine é exposta como um microserviço Flask na porta 5070, recebendo os dados do candle parcial (OHL e preço atual) e retornando a predição de fechamento.

### 6.2. IA Hedge Inteligente

O módulo `server/ai/hedgeStrategy.ts` implementa uma lógica de gestão de posição em tempo real, decidindo se deve abrir uma segunda posição para proteger (`hedge`) ou aumentar (`reforçar`) a exposição.

-   **Análise:** A função `analyzePositionForHedge` é chamada periodicamente enquanto uma posição está aberta.
-   **Estratégias:** Com base no progresso do trade, no tempo decorrido e em métricas como a extensão do candle, a IA pode tomar uma das seguintes ações:
    1.  **HOLD:** Manter a posição original sem alterações.
    2.  **REINFORCE (Reforço):** Abrir uma nova posição na mesma direção se o mercado fez um *pullback*, oferecendo um ponto de entrada melhor.
    3.  **HEDGE (Proteção):** Abrir uma nova posição na direção oposta se uma forte reversão contra a predição original for detectada.
    4.  **REVERSAL_EDGE (Reversão de Ponta):** Abrir uma posição oposta perto do final do candle se o movimento a favor da predição foi tão extremo que uma exaustão e pequena reversão são prováveis.
-   **Configuração:** As regras e multiplicadores de stake para cada estratégia são configuráveis na tabela `config`.

### 6.3. Detector de Condições de Mercado v2

Implementado em `server/market-condition-v2/marketConditionDetector.ts`, este módulo atua como um supervisor, avaliando a "saúde" do mercado antes de permitir operações. Ele classifica o mercado em `GREEN`, `YELLOW`, ou `RED`.

-   **Critérios de Análise:**
    -   **Internos (Matemáticos):** Analisa o candle anterior em busca de anomalias, como amplitude excessiva (comparada ao ATR - Average True Range), sombras (wicks) muito longas em relação ao corpo, e volatilidade fractal.
    -   **Externos (Notícias):** Verifica no banco de dados (`marketEvents`) a proximidade de notícias de alto ou médio impacto que possam afetar o ativo, adicionando pontos de risco se houver eventos futuros ou recentes.
-   **Funcionamento:** Se a pontuação de risco acumulada ultrapassa os limiares configurados, o mercado é classificado como `YELLOW` ou `RED`, e o bot pode ser configurado para não operar nessas condições.

### 6.4. Filtro de Horário

O módulo `filtro-horario/hourlyFilterLogic.ts` permite restringir as operações do bot a horários específicos do dia, baseados em backtests que indicam maior probabilidade de ganho.

-   **Modos:** Oferece presets de horários (`IDEAL`, `COMPATIBLE`, `GOLDEN`, `COMBINED`) e um modo `CUSTOM`.
-   **Horários GOLD:** Permite a configuração de até dois "horários de ouro", nos quais o valor da operação (stake) é multiplicado por um fator configurável, aumentando a exposição nos momentos considerados mais lucrativos.

### 6.5. DojiGuard (Filtro Anti-Doji)

Localizado em `server/doji-guard/dojiGuard.ts`, este é um filtro de segurança que previne a abertura de posições em candles que demonstram extrema indecisão.

-   **Lógica:** Antes de armar um gatilho, o `DojiGuard` analisa o candle parcial. Ele bloqueia a operação se:
    1.  O **range** (diferença entre máxima e mínima) for muito pequeno.
    2.  A **proporção** entre o corpo do candle e o seu range total for muito baixa, indicando um formato de Doji.
-   **Propósito:** Evitar entrar em trades que não têm uma direção clara, reduzindo o risco de perdas por movimentos erráticos de preço.

---

## 7. Comunicação com a API DERIV

A interação com a corretora é gerenciada pelo `server/deriv/derivService.ts`. Este serviço encapsula toda a complexidade da comunicação via WebSocket.

-   **Conexão Segura:** Utiliza o `appId` configurável para se conectar ao endpoint `wss://ws.derivws.com/websockets/v3`.
-   **Autenticação:** Envia o token do usuário para autorizar a sessão e obter detalhes da conta, como a moeda (`accountCurrency`).
-   **Gestão de Conexão:** Implementa um mecanismo robusto de `ping/pong` para manter a conexão ativa e uma lógica de reconexão automática e infinita em caso de queda, garantindo a operação 24/7.
-   **Inscrições (Subscriptions):** Inscreve-se para receber ticks de preço em tempo real para o ativo selecionado (`ticks_history`) e gerencia as respostas de forma assíncrona.
-   **Execução de Ordens:** Formata e envia os pedidos de compra de contrato (`buy`), tratando a resposta da API para confirmar a abertura da posição.
-   **Tratamento de Erros:** Inclui tratamento específico para erros comuns, como o `503 Service Unavailable`, que pode indicar problemas de rate limiting ou bloqueio do `appId`.

---

## 8. Parâmetros de Configuração

A plataforma é altamente configurável através da tabela `config` no banco de dados. Os principais parâmetros que governam o comportamento do bot são:

| Parâmetro | Tabela `config` | Descrição |
| :--- | :--- | :--- |
| **Ativo** | `symbol` | O ativo sintético a ser operado (ex: `R_100`). |
| **Valor da Operação** | `stake` | Valor de cada posição, em centavos. |
| **Stop Loss Diário** | `stopDaily` | Limite máximo de perda diária, em centavos. |
| **Take Profit Diário** | `takeDaily` | Limite máximo de ganho diário, em centavos. |
| **Timeframe** | `timeframe` | Duração do candle a ser analisado (900s para M15, 1800s para M30, 3600s para M60). |
| **Tempo de Espera** | `waitTime` | Minutos a aguardar dentro do candle antes de fazer a predição (ex: 8 min para M15). |
| **Offset do Gatilho** | `triggerOffset` | Pontos a serem subtraídos/somados da predição para definir o gatilho de entrada. |
| **Payout Mínimo** | `minPayoutPercent` | Percentual mínimo de retorno oferecido pela corretora para que a entrada seja permitida. |
| **Habilitar IA Hedge** | `hedgeEnabled` | Ativa ou desativa o módulo de Hedge Inteligente. |
| **Habilitar Filtro Horário** | `hourlyFilterEnabled` | Ativa ou desativa o filtro de horários para operar. |
| **Habilitar Detector de Mercado** | `marketConditionEnabled` | Ativa ou desativa a análise de condições de mercado. |
| **Habilitar Filtro Anti-Doji** | `antiDojiEnabled` | Ativa ou desativa o filtro `DojiGuard`. |

---

## 9. Scripts e Comandos

O arquivo `package.json` define os scripts essenciais para desenvolvimento, build e execução da plataforma.

| Comando | Descrição |
| :--- | :--- |
| `pnpm dev` | Inicia o ambiente de desenvolvimento com hot-reloading para o frontend e o backend. |
| `pnpm build` | Compila o frontend e o backend para produção, gerando os arquivos na pasta `dist/`. |
| `pnpm start` | Inicia o servidor em modo de produção a partir dos arquivos da pasta `dist/`. |
| `pnpm db:push` | Aplica as alterações do schema (`drizzle/schema.ts`) ao banco de dados, gerando e executando as migrações necessárias. |
| `pnpm test` | Executa os testes unitários definidos com Vitest. |

---

## 10. Conclusão e Próximos Passos

A análise revela uma plataforma de trading algorítmico sofisticada, bem estruturada e com uma clara separação de responsabilidades. A combinação de uma engine de predição determinística com múltiplos módulos de análise de risco e inteligência artificial cria um sistema robusto e adaptável.

O conhecimento adquirido e consolidado neste documento fornece uma base sólida para a manutenção, evolução e implementação de novas funcionalidades na plataforma.

**O sistema agora possui um entendimento profundo de sua arquitetura e está pronto para receber as próximas diretrizes.**
