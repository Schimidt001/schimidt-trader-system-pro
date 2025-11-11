# Análise Abrangente da Plataforma Schimidt Trader System PRO

**Data:** 11 de Novembro de 2025
**Autor:** Manus AI

## 1. Introdução

Este documento apresenta uma análise completa do repositório `Schimidt-Trader-System-PRO`, com o objetivo de fornecer um entendimento profundo de sua arquitetura, funcionalidades e histórico de desenvolvimento. A análise foi realizada através da inspeção do código-fonte, documentação interna e histórico de commits, preparando o terreno para futuras manutenções, correções de bugs e desenvolvimento de novas funcionalidades.

## 2. Arquitetura da Plataforma

A plataforma segue uma arquitetura de três camadas, bem definida e moderna, composta por um frontend, um backend e um microsserviço para predições.

| Camada | Tecnologia Principal | Descrição |
| :--- | :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite | Interface de usuário reativa para interação com o sistema. Inclui dashboard, painel de configurações e visualizador de logs. A comunicação com o backend é feita via tRPC, garantindo segurança de tipos de ponta a ponta. |
| **Backend** | Node.js 22, Express, TypeScript | Orquestra a lógica de negócio. Gerencia o bot de trading, a comunicação com a API da Deriv via WebSockets, o acesso ao banco de dados e a interação com a engine de predição. |
| **Prediction Engine** | Python 3.11, Flask, scikit-learn | Um microsserviço isolado que expõe um endpoint (`/predict`). Recebe dados parciais de um candle e retorna a predição de fechamento com base no algoritmo proprietário "Fibonacci da Amplitude". |
| **Banco de Dados** | MySQL/TiDB, Drizzle ORM | Persiste todas as informações vitais, incluindo configurações de usuário, estado do bot, candles históricos, posições de trade, métricas de performance e logs de eventos. |

O uso de `tRPC` e `Drizzle ORM` com `TypeScript` em todo o stack (exceto na engine Python) cria um sistema robusto e com forte segurança de tipos, o que reduz a probabilidade de erros em tempo de execução relacionados a inconsistências de dados entre as camadas.

## 3. Funcionalidades Principais

A plataforma é um sistema de trading automatizado sofisticado com várias funcionalidades avançadas.

- **Trading 100% Automatizado:** O `TradingBot` opera de forma autônoma, passando por um ciclo de estados bem definido (`COLLECTING`, `WAITING_MIDPOINT`, `PREDICTING`, `ARMED`, `POSITION_OPEN`, etc.) para executar operações 24/7.
- **Engine de Predição Proprietária:** Utiliza um modelo de machine learning (`modelo_otimizado_v2.pkl`) para prever o preço de fechamento de candles em múltiplos timeframes (M15, M30, M60) com uma assertividade reportada de 84.85%.
- **Gestão de Risco Avançada:** Inclui Stop-Loss e Take-Profit diários, encerramento antecipado de posições (`Early Close`) e uma regra estrita de uma operação por candle para evitar overtrading.
- **Suporte a Múltiplos Ativos e Contratos:** O sistema é configurado para operar com diversos ativos sintéticos da Deriv e suporta diferentes tipos de contrato, como `RISE_FALL`, `TOUCH`/`NO_TOUCH`.
- **Configurabilidade Extensiva:** A interface permite ao usuário ajustar dezenas de parâmetros, como `stake`, `timeframe`, `waitTime`, `triggerOffset`, e configurações específicas como filtros de horário e estratégias de hedge com IA.
- **Sistema Multi-Bot:** A arquitetura do banco de dados e a lógica do bot foram adaptadas para suportar múltiplos bots por usuário, identificados por `botId`, permitindo a execução de diferentes estratégias em paralelo.

## 4. Análise do Histórico de Commits e Problemas Recorrentes

A análise do histórico de commits revela um projeto em constante evolução, com um foco claro na resolução de bugs complexos e na adição de funcionalidades robustas. Alguns temas são recorrentes e indicam as áreas mais sensíveis do sistema:

- **Precisão dos Dados da Deriv:** Commits como os descritos em `CORRECOES_IMPLEMENTADAS.md` mostram um esforço significativo para garantir que o sistema utilize exclusivamente os dados oficiais da API da Deriv como fonte da verdade, implementando uma "tripla verificação" para evitar divergências causadas pela construção manual de candles a partir de ticks.

- **Lógica de Duração do Contrato:** Vários commits (`28077d0`, `dc2fd96`, `ef921e7`) abordam o erro `Trading is not offered for this duration`. Isso indica uma dificuldade em alinhar a duração calculada pelo bot com as regras específicas da API da Deriv para diferentes ativos (especialmente Forex) e timeframes. A solução parece ter convergido para o uso de durações em minutos, arredondadas para o inteiro mais próximo.

- **Filtro de Horário:** O arquivo `ANALISE_BUG_FILTRO_HORARIO.md` detalha um bug crítico onde uma configuração de filtro vazia (`[]`) era salva no banco, fazendo com que o bot ficasse permanentemente em stand-by. As correções envolveram adicionar validações no frontend, backend e fallbacks robustos na lógica do bot, demonstrando a complexidade da funcionalidade.

- **Debugging de Parâmetros de Compra:** Os commits mais recentes (`cb77bce`, `1720d7e`) adicionam logs detalhados imediatamente antes da chamada da função `buyContract`. Isso sugere fortemente que **o problema atual da plataforma está relacionado à validação de parâmetros pela API da Deriv no momento da compra**. A API pode estar rejeitando a combinação de parâmetros enviados, e os logs foram adicionados para capturar exatamente o que está sendo enviado e diagnosticar a inconsistência.

## 5. Pontos de Atenção e Problemas Potenciais

Com base na análise, os seguintes pontos merecem atenção especial:

1.  **Validação de Parâmetros da API Deriv:** Esta é a área mais provável do problema atual. A combinação de `contract_type`, `duration`, `duration_unit`, `barrier`, `allow_equals`, etc., é complexa e varia entre os ativos. Um parâmetro incorreto para um determinado tipo de contrato pode estar causando a falha na execução das ordens.

2.  **Complexidade das Configurações:** A vasta gama de parâmetros configuráveis pode levar a combinações inesperadas que não foram totalmente testadas. Por exemplo, a interação entre `useCandleDuration`, `forexMinDurationMinutes` e o `timeframe` do candle pode gerar durações inválidas.

3.  **Isolamento Multi-Bot:** A introdução do `botId` foi uma mudança estrutural importante. É crucial garantir que todas as consultas ao banco de dados e a lógica de estado do bot estejam corretamente isoladas por `botId` para evitar que um bot interfira no estado ou nas configurações de outro.

4.  **Cálculo de PnL:** O arquivo `todo.md` menciona um bug crítico no cálculo do PnL. Embora marcado como parcialmente resolvido, problemas de precisão com valores financeiros (ponto flutuante vs. inteiros em centavos) são comuns e exigem vigilância constante.

## 6. Conclusão

A plataforma Schimidt Trader System PRO é um sistema poderoso e bem arquitetado. O código é modular, documentado e utiliza tecnologias modernas. A análise indica que a equipe de desenvolvimento tem sido diligente na identificação e correção de bugs.

O problema atual parece estar concentrado na interação com a API da Deriv, especificamente na validação dos parâmetros de compra do contrato. Com o conhecimento detalhado adquirido sobre a arquitetura e o histórico do projeto, estou preparado para investigar e solucionar os problemas reportados de forma eficiente.
