# Análise Técnica da Plataforma Schimidt Trader System PRO

**Data da Análise:** 17 de Novembro de 2025
**Autor:** Manus AI

## 1. Visão Geral

Esta análise documenta a arquitetura, os principais componentes e os fluxos de dados da plataforma **Schimidt Trader System PRO**, com foco especial nas conexões de API, gerenciamento de tokens e configurações, conforme solicitado. O objetivo é consolidar o conhecimento sobre o sistema para facilitar a manutenção, o desenvolvimento e a resolução de problemas.

## 2. Arquitetura e Stack Tecnológico

A plataforma segue uma arquitetura de micro-serviços moderna, desacoplando o frontend, o backend e a engine de predição. A comunicação entre o cliente e o servidor é realizada de forma segura e eficiente através de tRPC.

| Componente          | Tecnologia Principal | Descrição                                                                                             |
| ------------------- | -------------------- | ----------------------------------------------------------------------------------------------------- |
| **Frontend**        | React 19, TypeScript | Interface de usuário reativa para dashboard, configurações e logs.                                    |
| **Backend**         | Node.js 22, Express  | Orquestra a lógica de negócio, a comunicação com a API da Deriv e a persistência de dados.            |
| **API Layer**       | tRPC 11              | Garante a comunicação type-safe entre o frontend e o backend.                                         |
| **Banco de Dados**  | Drizzle ORM, MySQL   | Persiste todas as configurações, trades, logs e estados do sistema.                                   |
| **Engine de Predição** | Python 3.11, Flask   | Micro-serviço isolado que executa o algoritmo de predição e responde a chamadas do backend.         |
| **Comunicação Real-Time** | WebSocket            | Conexão direta com a API da Deriv para receber ticks de preços e gerenciar o estado das operações. |

## 3. Gerenciamento de Tokens e Chaves de API

O sistema gerencia diferentes tipos de credenciais para operar. A segurança é centralizada no backend para evitar a exposição de chaves sensíveis no lado do cliente.

### 3.1. Token da API DERIV

Este é o token mais crítico para a operação do bot.

- **Armazenamento:** Os tokens (DEMO e REAL) são armazenados de forma segura no banco de dados, na tabela `config`, associados ao `userId` e `botId`. Os campos são `tokenDemo` e `tokenReal`.
- **Utilização:** O token é recuperado do banco de dados pelo backend no momento de iniciar uma conexão. O arquivo `server/deriv/tradingBot.ts` carrega a configuração e instancia o `DerivService` com o token apropriado (`const token = this.mode === "DEMO" ? config.tokenDemo : config.tokenReal;`).
- **Conexão:** O `DerivService` (`server/deriv/derivService.ts`) utiliza o token para se autenticar na API da Deriv via WebSocket. A mensagem de autorização é enviada imediatamente após a conexão ser estabelecida: `this.send({ authorize: this.token });`.
- **App ID:** A conexão WebSocket também utiliza um `appId` da Deriv, que é configurável na tabela `config` (campo `derivAppId`) e possui um valor padrão (`1089`) para testes. A URL de conexão é montada dinamicamente: `wss://ws.derivws.com/websockets/v3?app_id=${this.appId}`.

### 3.2. Chaves de API Internas (Manus)

O template do projeto inclui um sistema de autenticação e integração com serviços da plataforma Manus, como armazenamento e LLMs.

- **Configuração:** As chaves são gerenciadas através de variáveis de ambiente no servidor, lidas no arquivo `server/_core/env.ts`. As principais variáveis são `BUILT_IN_FORGE_API_URL` e `BUILT_IN_FORGE_API_KEY`.
- **Utilização:** Essas chaves são usadas para autenticar chamadas `fetch` a serviços internos da Manus, como `storage.ts`, `dataApi.ts`, e `llm.ts`. A autenticação é feita através do header `Authorization: Bearer <apiKey>`.

## 4. Fluxo de Conexão e Autenticação

O fluxo de conexão com a API da Deriv é robusto e inclui lógica de autorização, reconexão automática e tratamento de erros.

1.  **Início:** O usuário inicia o bot através da interface.
2.  **Recuperação da Configuração:** O backend (`server/routers.ts`) busca as configurações do usuário no banco de dados, incluindo o modo (DEMO/REAL) e o token correspondente.
3.  **Instanciação do Serviço:** O `TradingBot` (`server/deriv/tradingBot.ts`) é instanciado e, dentro dele, o `DerivService` é criado com o token e o `appId` corretos.
4.  **Conexão WebSocket:** O `DerivService` estabelece a conexão com `wss://ws.derivws.com/websockets/v3`.
5.  **Autorização:** Assim que a conexão é aberta, uma mensagem `{ "authorize": "SEU_TOKEN" }` é enviada.
6.  **Confirmação:** O serviço aguarda uma resposta de sucesso da API. Em caso de falha (ex: token inválido), a conexão é rejeitada. Em caso de sucesso, a moeda da conta é capturada e a conexão é considerada pronta.
7.  **Keep-Alive:** Um sistema de `ping/pong` é iniciado para manter a conexão ativa e detectar desconexões.
8.  **Reconexão:** Em caso de queda da conexão, o `DerivService` tenta reconectar automaticamente com um delay exponencial, garantindo a resiliência do bot.

## 5. Pontos de Configuração Relevantes

A configuração do sistema é altamente centralizada na tabela `config` do banco de dados, permitindo ajustes finos sem a necessidade de alterar o código-fonte.

- **`drizzle/schema.ts`**: Define a estrutura completa da tabela `config`, incluindo todos os parâmetros do bot, desde o `stake` e `stopDaily` até configurações avançadas como `repredictionEnabled`, `hourlyFilterEnabled` e `hedgeEnabled`.
- **`server/routers.ts`**: Expõe os endpoints tRPC (`config.get` e `config.update`) que permitem ao frontend ler e salvar essas configurações de forma segura.
- **`.env.example`**: Lista as variáveis de ambiente necessárias para a operação do servidor, principalmente a `DATABASE_URL` para conexão com o banco de dados e as chaves da plataforma Manus.

## 6. Conclusão

A plataforma possui uma arquitetura bem definida e um sistema robusto para o gerenciamento de tokens e conexões de API. As credenciais da Deriv são armazenadas de forma segura no banco de dados e utilizadas exclusivamente pelo backend, seguindo as melhores práticas de segurança. O `DerivService` encapsula toda a complexidade da comunicação WebSocket, incluindo autenticação e reconexão, tornando a lógica do bot mais limpa e focada na estratégia de trading. O conhecimento detalhado desses fluxos é fundamental para diagnosticar problemas relacionados a autenticação, conexão e configuração do sistema.
