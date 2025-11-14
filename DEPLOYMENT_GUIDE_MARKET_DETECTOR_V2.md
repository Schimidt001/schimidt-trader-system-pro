# 🚀 Guia de Implantação — Market Detector v2.0

## ✅ Checklist de Implantação

### **1. Aplicar Migration do Banco de Dados**

A nova tabela `marketDetectorConfig` precisa ser criada no banco de dados.

#### **Opção A: Via MySQL CLI**
```bash
mysql -h gondola.proxy.rlwy.net -P 25153 -u root -pqsnVGqprIkPodnxuERpjaHteHVziMuJV railway < drizzle/0004_add_market_detector_config.sql
```

#### **Opção B: Via Cliente MySQL (GUI)**
1. Conectar ao banco:
   - Host: `gondola.proxy.rlwy.net`
   - Port: `25153`
   - User: `root`
   - Password: `qsnVGqprIkPodnxuERpjaHteHVziMuJV`
   - Database: `railway`

2. Executar o SQL de `drizzle/0004_add_market_detector_config.sql`

#### **Opção C: Via Endpoint de Migration**
```bash
curl http://localhost:3000/api/migrate
```

---

### **2. Verificar Instalação de Dependências**

Todas as dependências já estão instaladas. Caso precise reinstalar:

```bash
pnpm install
```

---

### **3. Iniciar o Servidor**

```bash
pnpm dev
```

**Logs esperados na inicialização:**
```
🤖 Iniciando engine de predição proprietária...
✅ Engine de predição iniciada com sucesso
📰 Iniciando News Scheduler (coleta automática de notícias)...
✅ News Scheduler iniciado com sucesso
```

---

### **4. Verificar Funcionamento**

#### **4.1. Testar Market Detector**
```bash
npx tsx server/market-condition-v2/test.ts
```

**Resultado esperado:**
```
✅ Todos os testes passaram!
```

#### **4.2. Verificar News Scheduler**
Aguardar alguns minutos e verificar logs:
```
[NewsCollector] Iniciando coleta de notícias...
[NewsCollector] ✅ 15 eventos salvos no banco
```

#### **4.3. Testar Frontend**
1. Acesse `http://localhost:3000/settings`
2. Ative o **Market Condition Detector**
3. Verifique se o painel de **Configurações Avançadas** aparece
4. Acesse `http://localhost:3000/market`
5. Verifique se o painel **Calendário & Mercado** carrega

---

### **5. Configuração Inicial (Opcional)**

#### **5.1. Ajustar Parâmetros**
1. Acesse **Configurações**
2. Ative o **Market Condition Detector**
3. Clique em **Configurações Avançadas**
4. Ajuste os parâmetros conforme necessário
5. Clique em **Salvar Configurações**

#### **5.2. Restaurar Padrões**
Se precisar voltar aos valores institucionais:
1. Clique em **Restaurar Padrões**
2. Confirme a ação

---

## 🔍 Troubleshooting

### **Problema: News Scheduler não inicia**
**Solução:**
1. Verificar logs do servidor
2. Confirmar que o arquivo `server/market-condition-v2/newsScheduler.ts` existe
3. Reiniciar o servidor

### **Problema: Tabela marketDetectorConfig não existe**
**Solução:**
1. Aplicar a migration manualmente (ver passo 1)
2. Verificar conexão com o banco de dados

### **Problema: Painel de Configurações não aparece**
**Solução:**
1. Limpar cache do navegador (Ctrl+Shift+R)
2. Verificar console do navegador para erros
3. Confirmar que o Market Detector está ativado

### **Problema: Notícias não aparecem**
**Solução:**
1. Aguardar a primeira execução do News Scheduler (até 6h)
2. Executar coleta manual:
   ```typescript
   // No console do servidor (Node.js)
   const { newsCollectorService } = require('./server/market-condition-v2/newsCollectorService');
   await newsCollectorService.collectNews();
   ```

---

## 📊 Monitoramento

### **Verificar Status do News Scheduler**
```bash
# Verificar logs do servidor
tail -f logs/server.log | grep NewsScheduler
```

### **Verificar Últimas Avaliações**
```sql
SELECT * FROM marketConditions ORDER BY computedAt DESC LIMIT 10;
```

### **Verificar Notícias Coletadas**
```sql
SELECT COUNT(*) FROM marketEvents;
SELECT * FROM marketEvents WHERE timestamp > UNIX_TIMESTAMP(NOW()) ORDER BY timestamp ASC LIMIT 10;
```

### **Verificar Configurações de Usuários**
```sql
SELECT * FROM marketDetectorConfig;
```

---

## 🎯 Próximos Passos

1. ✅ Aplicar migration do banco
2. ✅ Iniciar servidor e verificar logs
3. ✅ Executar testes
4. ✅ Ativar Market Detector no frontend
5. ✅ Monitorar primeira coleta de notícias (até 6h)
6. ✅ Aguardar primeira avaliação no fechamento do candle M60

---

## 📝 Notas Importantes

- O **News Scheduler** executa automaticamente a cada 6 horas
- A primeira coleta é executada **imediatamente** na inicialização
- O **Market Detector** só avalia no fechamento de candles M60
- As configurações são **por usuário** (cada usuário pode ter seus próprios parâmetros)
- O status RED **bloqueia automaticamente** novas operações do Trading Bot

---

## 🆘 Suporte

Em caso de dúvidas ou problemas:
1. Consultar `MARKET_DETECTOR_V2_DOCUMENTATION.md`
2. Verificar logs do servidor
3. Executar script de teste
4. Verificar conexão com o banco de dados

---

**Boa implantação! 🚀**
