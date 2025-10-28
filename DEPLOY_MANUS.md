# Guia de Deploy na Plataforma Manus

## 📋 Pré-requisitos

Este projeto está configurado para ser hospedado na **Plataforma Manus** e requer:

1. **Banco de Dados MySQL/TiDB**
2. **Variáveis de Ambiente OAuth** (fornecidas automaticamente pela Manus)
3. **Python 3.11+** para a engine de predição
4. **Node.js 22+** para o servidor

## 🚀 Passos para Deploy

### 1. Configurar Variáveis de Ambiente

As seguintes variáveis serão fornecidas automaticamente pela plataforma Manus:

```env
# OAuth (automático)
JWT_SECRET=<fornecido_pela_manus>
OAUTH_SERVER_URL=<fornecido_pela_manus>
VITE_OAUTH_PORTAL_URL=<fornecido_pela_manus>
VITE_APP_ID=<fornecido_pela_manus>
OWNER_OPEN_ID=<fornecido_pela_manus>
OWNER_NAME=<fornecido_pela_manus>

# Database (configurar manualmente)
DATABASE_URL=mysql://user:password@host:port/database

# App Config (opcional)
VITE_APP_TITLE=Schimidt Trader System PRO
VITE_APP_LOGO=https://your-logo-url.com/logo.png
PORT=3000
```

### 2. Instalar Dependências

```bash
# Dependências Node.js
pnpm install

# Dependências Python
pip3 install -r server/prediction/requirements.txt
```

### 3. Configurar Banco de Dados

```bash
# Aplicar schema ao banco de dados
pnpm db:push
```

### 4. Build do Projeto

```bash
# Build para produção
pnpm build
```

### 5. Iniciar Servidor

```bash
# Modo produção
pnpm start

# Modo desenvolvimento
pnpm dev
```

## 🔧 Estrutura de Deploy

```
dist/
├── index.js          # Servidor Node.js compilado
└── public/           # Frontend React compilado
    ├── index.html
    └── assets/
```

## 🐍 Engine de Predição

A engine de predição Python é gerenciada automaticamente pelo servidor Node.js através do `engineManager`. Ela:

- Inicia automaticamente na porta **5070**
- Usa o algoritmo **Fibonacci da Amplitude**
- Processa predições em tempo real
- É reiniciada automaticamente em caso de falha

## 📊 Monitoramento

Após o deploy, verifique:

1. **Status do Servidor**: `http://localhost:3000/`
2. **Health Check da Engine**: `http://localhost:5070/health`
3. **Logs do Sistema**: Console do servidor

## 🔐 Configuração DERIV

Após o deploy, os usuários devem:

1. Acessar a página de **Configurações**
2. Inserir token DERIV (DEMO ou REAL)
3. Testar conexão antes de iniciar o bot
4. Configurar parâmetros de risco (stop/take diário)

## 🐛 Troubleshooting

### Erro de OAuth
- Verifique se as variáveis `VITE_OAUTH_PORTAL_URL` e `VITE_APP_ID` estão configuradas
- Em desenvolvimento local, o OAuth pode não funcionar sem as credenciais corretas

### Erro de Database
- Verifique a string de conexão `DATABASE_URL`
- Execute `pnpm db:push` para criar as tabelas

### Engine de Predição não inicia
- Verifique se Python 3.11+ está instalado
- Verifique se as dependências Python estão instaladas
- Verifique se a porta 5070 está disponível

## 📝 Notas Importantes

1. O projeto usa **vite-plugin-manus-runtime** para integração com a plataforma
2. O OAuth é gerenciado automaticamente pela Manus
3. O banco de dados deve ser MySQL ou TiDB compatível
4. A engine de predição é essencial para o funcionamento do bot

## 🔗 Links Úteis

- [Documentação DERIV API](https://api.deriv.com/)
- [Repositório GitHub](https://github.com/Schimidt001/schimidt-trader-system-pro)
- [README Principal](./README.md)
