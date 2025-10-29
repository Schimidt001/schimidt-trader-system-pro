# 🚀 Guia Completo de Deploy no Railway

Este guia detalha o processo completo para fazer deploy do **Schimidt Trader System PRO** no Railway via GitHub.

## 📋 Pré-requisitos

Antes de começar, certifique-se de ter:

1. ✅ Conta no [Railway](https://railway.app) (gratuita)
2. ✅ Conta no GitHub com o repositório `schimidt-trader-system-pro`
3. ✅ Token da API DERIV (DEMO ou REAL)

## 🎯 Passo a Passo

### **Etapa 1: Criar Projeto no Railway**

1. Acesse https://railway.app
2. Faça login com sua conta GitHub
3. Clique em **"New Project"**
4. Selecione **"Deploy from GitHub repo"**
5. Autorize o Railway a acessar seus repositórios (se solicitado)
6. Selecione o repositório: **`Schimidt001/schimidt-trader-system-pro`**
7. Clique em **"Deploy Now"**

### **Etapa 2: Adicionar Banco de Dados MySQL**

O Railway detectará automaticamente que é um projeto Node.js, mas você precisa adicionar o banco de dados:

1. No dashboard do seu projeto, clique em **"+ New"**
2. Selecione **"Database"**
3. Escolha **"Add MySQL"**
4. Aguarde a criação do banco de dados (leva ~1 minuto)
5. O Railway criará automaticamente a variável `DATABASE_URL`

### **Etapa 3: Configurar Variáveis de Ambiente**

No painel do seu projeto Railway:

1. Clique no serviço principal (schimidt-trader-system-pro)
2. Vá na aba **"Variables"**
3. Adicione as seguintes variáveis:

```env
# Já configurado automaticamente pelo Railway
DATABASE_URL=<gerado_automaticamente_pelo_mysql>

# Configurações obrigatórias
NODE_ENV=production
PORT=3000

# Configurações opcionais (OAuth Manus - se necessário)
JWT_SECRET=seu_jwt_secret_aqui
OAUTH_SERVER_URL=https://oauth.manus.im
VITE_OAUTH_PORTAL_URL=https://portal.manus.im
VITE_APP_ID=seu_app_id
OWNER_OPEN_ID=seu_owner_id
OWNER_NAME=seu_nome

# Branding (opcional)
VITE_APP_TITLE=Schimidt Trader System PRO
VITE_APP_LOGO=https://sua-logo-url.com/logo.png
```

4. Clique em **"Add"** ou **"Save"** para cada variável

### **Etapa 4: Aplicar Schema do Banco de Dados**

Após o primeiro deploy (que pode falhar), você precisa aplicar o schema:

1. No dashboard do Railway, clique no serviço principal
2. Vá na aba **"Settings"**
3. Role até **"Deploy Triggers"**
4. Desabilite temporariamente o auto-deploy
5. Vá na aba **"Deployments"**
6. Clique no deployment mais recente
7. Clique em **"View Logs"**
8. Procure por erros relacionados ao banco de dados

**Opção A: Usar Railway CLI (Recomendado)**

```bash
# Instalar Railway CLI
npm i -g @railway/cli

# Fazer login
railway login

# Conectar ao projeto
railway link

# Executar migração
railway run pnpm db:push
```

**Opção B: Adicionar comando de migração ao build**

1. Edite o arquivo `railway.json` (já está configurado)
2. O comando de build já inclui a migração automática

### **Etapa 5: Verificar Deploy**

1. Aguarde o build completar (leva ~5-10 minutos na primeira vez)
2. Verifique os logs na aba **"Deployments"**
3. Procure por mensagens de sucesso:
   - ✅ `Engine de predição iniciada com sucesso`
   - ✅ `Server running on http://localhost:3000/`
   - ✅ `Sistema pronto para operar!`

4. Clique em **"View"** ou copie a URL pública do Railway

### **Etapa 6: Configurar o Sistema**

1. Acesse a URL pública do seu deploy
2. Faça login (se OAuth estiver configurado)
3. Vá em **"Configurações"**
4. Configure:
   - Token DERIV (DEMO recomendado para testes)
   - Ativo sintético (ex: R_75)
   - Stake por trade (ex: $1.00)
   - Stop diário (ex: $10.00)
   - Take diário (ex: $20.00)
5. Clique em **"Testar Conexão com DERIV"**
6. Aguarde confirmação de saldo

### **Etapa 7: Iniciar o Bot**

1. Volte ao **Dashboard**
2. Clique em **"Iniciar Bot"**
3. Aguarde a coleta de histórico de candles
4. Monitore as operações em tempo real

## 🔧 Configurações Avançadas

### **Persistência e Restart Policy**

O Railway já está configurado para reiniciar automaticamente em caso de falha:

```json
{
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### **Logs e Monitoramento**

- **Logs em tempo real**: Aba "Deployments" → Deployment ativo → "View Logs"
- **Métricas**: Aba "Metrics" mostra CPU, memória e rede
- **Alertas**: Configure notificações em "Settings" → "Notifications"

### **Domínio Customizado**

1. Vá em "Settings" do serviço
2. Role até "Domains"
3. Clique em "Generate Domain" (Railway fornece um domínio gratuito)
4. Ou adicione seu próprio domínio customizado

## 🐛 Troubleshooting

### **Erro: "Engine de predição não iniciou"**

**Causa**: Python ou dependências não instaladas corretamente

**Solução**:
1. Verifique os logs de build
2. Confirme que `nixpacks.toml` está presente
3. Verifique se `requirements.txt` existe em `server/prediction/`

### **Erro: "DATABASE_URL not found"**

**Causa**: Banco de dados MySQL não foi adicionado ou variável não está configurada

**Solução**:
1. Adicione MySQL database ao projeto
2. Verifique se a variável `DATABASE_URL` foi criada automaticamente
3. Redeploye o projeto

### **Erro: "Port already in use"**

**Causa**: Railway espera que a aplicação use a variável `PORT`

**Solução**:
- O código já está configurado para usar `process.env.PORT`
- Certifique-se de que a variável `PORT` não está hardcoded

### **Bot não conecta com DERIV**

**Causa**: Token inválido ou sem permissões

**Solução**:
1. Gere novo token em https://app.deriv.com/account/api-token
2. Certifique-se de marcar: Read, Trade, Payments
3. Use token DEMO para testes iniciais

### **Deploy falha no build**

**Causa**: Dependências faltando ou erro de compilação

**Solução**:
1. Verifique logs de build na aba "Deployments"
2. Confirme que `pnpm-lock.yaml` está commitado
3. Verifique se todos os arquivos de configuração estão presentes:
   - `package.json`
   - `railway.json`
   - `nixpacks.toml`
   - `Procfile`

## 📊 Monitoramento de Custos

O Railway oferece **$5 de crédito gratuito por mês**:

- **Estimativa de uso**: ~$3-5/mês para este projeto
- **Monitoramento**: Vá em "Account" → "Usage" para ver consumo
- **Alertas**: Configure alertas de billing em "Account" → "Settings"

## 🔐 Segurança

### **Tokens e Secrets**

- ✅ Nunca commite tokens no GitHub
- ✅ Use as variáveis de ambiente do Railway
- ✅ Tokens DERIV devem ser configurados via interface web

### **OAuth e Autenticação**

- Se usar Manus OAuth, configure as variáveis corretamente
- Para produção, considere adicionar autenticação adicional

## 🔄 Atualizações e Redeploy

### **Deploy Automático**

O Railway está configurado para fazer deploy automático a cada push no GitHub:

1. Faça alterações no código localmente
2. Commit e push para o GitHub
3. Railway detecta e faz deploy automaticamente

### **Deploy Manual**

1. Vá na aba "Deployments"
2. Clique em "Deploy" no canto superior direito
3. Selecione a branch desejada

## 📚 Recursos Adicionais

- **Documentação Railway**: https://docs.railway.app
- **Documentação DERIV API**: https://api.deriv.com
- **README do Projeto**: [README.md](./README.md)
- **Guia Deploy Manus**: [DEPLOY_MANUS.md](./DEPLOY_MANUS.md)

## ✅ Checklist Final

Antes de considerar o deploy completo, verifique:

- [ ] Projeto criado no Railway
- [ ] Banco de dados MySQL adicionado
- [ ] Variáveis de ambiente configuradas
- [ ] Schema do banco aplicado (`pnpm db:push`)
- [ ] Deploy completado com sucesso
- [ ] Engine de predição iniciada
- [ ] Servidor acessível via URL pública
- [ ] Token DERIV configurado e testado
- [ ] Bot inicia sem erros
- [ ] Primeiro trade executado com sucesso

## 🎉 Pronto!

Seu **Schimidt Trader System PRO** está agora rodando 24/7 no Railway!

Monitore as operações, ajuste parâmetros conforme necessário e acompanhe o desempenho do algoritmo **Fibonacci da Amplitude** com 84.85% de assertividade.

**Bons trades! 🚀📈**
