# Análise Detalhada da Plataforma Schimidt Trader System PRO

**Data da Análise:** 11 de Dezembro de 2025
**Autor:** Manus AI

## 1. Visão Geral

O **Schimidt Trader System PRO** é uma plataforma de trading automatizado para a corretora DERIV, operando 24/7 em ativos sintéticos. O núcleo do sistema é uma engine de predição proprietária que utiliza o **Algoritmo Fibonacci da Amplitude** para prever o fechamento de candles e executar operações de trading de forma autônoma. A plataforma é composta por um frontend em React, um backend em Node.js, e uma engine de predição em Python.

## 2. Arquitetura e Tecnologias

A plataforma segue uma arquitetura de micro-serviços, com uma clara separação entre o frontend, o backend e a engine de predição.

| Componente | Tecnologias Principais |
|---|---|
| **Frontend** | React 19, TypeScript, Tailwind CSS 4, shadcn/ui, tRPC, Recharts, Wouter |
| **Backend** | Node.js 22, Express 4, tRPC 11, Drizzle ORM, WebSocket, Zod |
| **Prediction Engine** | Python 3.11, Flask, NumPy, scikit-learn |
| **Banco de Dados** | MySQL/TiDB |
| **Infraestrutura** | Manus OAuth, Railway (para deploy) |

O frontend se comunica com o backend através de tRPC, garantindo type-safety entre o cliente e o servidor. O backend, por sua vez, se conecta à API da DERIV via WebSocket para receber dados de mercado em tempo real e gerencia a lógica do bot de trading. A engine de predição é um serviço Python/Flask que expõe um endpoint para o backend.

## 3. Estrutura do Projeto

O código-fonte está organizado nos seguintes diretórios principais:

- `/client`: Contém todo o código do frontend em React.
- `/server`: Contém o código do backend em Node.js, incluindo a integração com a DERIV, a lógica do bot, e a comunicação com a engine de predição.
- `/drizzle`: Contém o schema e as migrações do banco de dados, gerenciados pelo Drizzle ORM.
- `/filtro-horario`: Módulo isolado para a lógica do filtro de horário.
- `/shared`: Contém tipos e constantes compartilhados entre o frontend e o backend.

## 4. Funcionalidades Principais

### 4.1. Engine de Predição

- **Algoritmo:** Fibonacci da Amplitude, com uma assertividade declarada de 84.85%.
- **Timeframes:** Suporta M15, M30 e M60.
- **Funcionamento:** A engine recebe dados parciais do candle atual e um histórico de candles para prever o preço de fechamento e a direção do movimento (alta ou baixa).

### 4.2. Bot de Trading

- **Lógica de Entrada:** O bot aguarda um tempo configurável dentro do candle, coleta os dados, envia para a engine de predição, e arma um gatilho de entrada com base na predição recebida.
- **Gestão de Risco:** Inclui stop/take diário, encerramento antecipado de posições com lucro, e limitação de um trade por candle.
- **Estados:** O bot opera através de uma máquina de estados bem definida (IDLE, COLLECTING, PREDICTING, ARMED, etc.).

### 4.3. Módulos Adicionais

- **IA Hedge Inteligente:** Um sistema para abrir posições de hedge ou reforçar posições existentes com base em uma análise matemática do movimento do preço.
- **Filtro de Horário:** Permite restringir as operações do bot a horários específicos do dia, com modos pré-definidos e personalizados.
- **Market Condition Detector:** Analisa as condições de mercado para evitar operar em momentos de alta volatilidade ou baixa liquidez.
- **DojiGuard:** Um filtro para evitar a abertura de posições em candles com alta probabilidade de se tornarem um doji.

## 5. Banco de Dados

O schema do banco de dados, definido em `/drizzle/schema.ts`, inclui as seguintes tabelas principais:

- `users`: Informações dos usuários.
- `config`: Configurações do bot para cada usuário.
- `candles`: Histórico de candles coletados.
- `positions`: Posições de trading abertas e fechadas.
- `metrics`: Métricas de performance (PnL, trades, etc.).
- `eventLogs`: Logs de eventos do sistema.
- `botState`: Estado atual do bot.

## 6. Configuração e Integrações

- **Variáveis de Ambiente:** O arquivo `.env.example` define as variáveis necessárias para a configuração do banco de dados, autenticação e outras configurações da aplicação.
- **API da DERIV:** A integração é feita através do `derivService.ts`, que gerencia a conexão WebSocket e a comunicação com a API da corretora.
- **Drizzle ORM:** O arquivo `drizzle.config.ts` configura a conexão com o banco de dados para o Drizzle ORM.

## 7. Conclusão

A plataforma Schimidt Trader System PRO é um sistema complexo e bem estruturado, com uma clara separação de responsabilidades entre seus componentes. A utilização de tecnologias modernas como React 19, Node.js 22, e tRPC, juntamente com uma arquitetura de micro-serviços, torna a plataforma robusta e escalável. A documentação existente no repositório, embora extensa, pode ser consolidada e organizada para facilitar futuras manutenções e desenvolvimentos. Esta análise serve como um ponto de partida para um conhecimento aprofundado da plataforma.
