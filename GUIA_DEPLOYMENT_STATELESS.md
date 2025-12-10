# Guia de Deployment: Servidor de Predição Stateless 2.0

**Data:** 10 de Dezembro de 2025  
**Autor:** Manus AI

---

## 1. Visão Geral

Este guia descreve como colocar o servidor de predição stateless em produção no seu ambiente. O servidor foi atualizado e testado com sucesso no ambiente de desenvolvimento.

## 2. Arquivos Modificados

Os seguintes arquivos foram alterados ou criados:

| Arquivo | Status | Descrição |
| :------ | :----- | :-------- |
| `server/prediction/engine_server.py` | ✅ Modificado | Versão stateless 2.0 do servidor |
| `server/prediction/engine_server.py.backup` | ✅ Criado | Backup da versão anterior |
| `validate_stateless_fix.py` | ✅ Criado | Script de validação |
| `RELATORIO_AUDITORIA_PREDICAO.md` | ✅ Criado | Relatório de auditoria completo |
| `RELATORIO_IMPLEMENTACAO_STATELESS.md` | ✅ Criado | Relatório de implementação |

## 3. Passos para Deployment

### 3.1. Verificar o Ambiente de Produção

Certifique-se de que o ambiente de produção possui as dependências Python necessárias:

```bash
pip3 install flask flask-cors numpy
```

### 3.2. Parar o Servidor Antigo

Se o servidor de predição estiver rodando, pare-o:

```bash
# Encontrar o processo
ps aux | grep engine_server.py

# Matar o processo (substitua <PID> pelo ID do processo)
kill <PID>
```

### 3.3. Fazer Backup do Arquivo Antigo (Opcional)

Se você ainda não fez backup, faça agora:

```bash
cd /caminho/para/server/prediction
cp engine_server.py engine_server.py.backup_pre_stateless
```

### 3.4. Substituir o Arquivo

Copie o novo arquivo `engine_server.py` (versão stateless 2.0) para o ambiente de produção.

Se você estiver usando este repositório Git:

```bash
cd /caminho/para/schimidt-trader-system-pro
git pull origin main  # ou o branch correto
```

Caso contrário, copie manualmente o arquivo atualizado.

### 3.5. Iniciar o Servidor Stateless

Inicie o servidor de predição:

```bash
cd /caminho/para/server/prediction
python3 engine_server.py
```

Você deve ver a mensagem:

```
======================================================================
  🤖 SCHIMIDT TRADER SYSTEM PRO - ENGINE DE PREDIÇÃO
  Algoritmo Fibonacci da Amplitude - 84.85% de Assertividade
  VERSÃO STATELESS 2.0 - Isolamento Total de Requisições
======================================================================
```

### 3.6. Verificar o Health Check

Teste se o servidor está respondendo:

```bash
curl http://localhost:5070/health
```

Resposta esperada:

```json
{
  "status": "ok",
  "engine": "Fibonacci da Amplitude",
  "mode": "stateless",
  "version": "2.0"
}
```

O campo **`"mode": "stateless"`** confirma que o servidor está rodando a versão corrigida.

### 3.7. Reiniciar os Bots de Trading

Reinicie os bots de trading para que eles comecem a usar o novo servidor:

1.  Pare os bots ativos na interface da plataforma
2.  Aguarde alguns segundos
3.  Inicie os bots novamente

## 4. Validação em Produção

Após o deployment, execute os seguintes testes:

### 4.1. Teste Manual de Predição

Use a interface da plataforma ou a API para fazer uma predição manual e anote os resultados (fase, algoritmo, preço previsto, direção).

### 4.2. Teste Automático

Deixe o bot fazer uma predição automática com os mesmos dados de candle.

### 4.3. Comparação

Compare os resultados do teste manual com o teste automático. Eles devem ser **idênticos**.

### 4.4. Script de Validação (Opcional)

Se desejar, você pode executar o script `validate_stateless_fix.py` no ambiente de produção:

```bash
cd /caminho/para/schimidt-trader-system-pro
python3 validate_stateless_fix.py
```

O script fará 5 chamadas idênticas e confirmará que todas retornam o mesmo resultado.

## 5. Monitoramento

Após o deployment, monitore os logs do servidor e dos bots para garantir que tudo está funcionando corretamente:

```bash
# Logs do servidor de predição
tail -f /caminho/para/logs/engine_server.log

# Logs dos bots (se aplicável)
tail -f /caminho/para/logs/trading_bot.log
```

## 6. Rollback (Se Necessário)

Se houver algum problema, você pode reverter para a versão anterior:

```bash
cd /caminho/para/server/prediction
cp engine_server.py.backup engine_server.py
python3 engine_server.py
```

## 7. Suporte

Se encontrar problemas durante o deployment, verifique:

1.  Os logs do servidor de predição
2.  Os logs dos bots de trading
3.  A conectividade entre os bots e o servidor (porta 5070)

Em caso de dúvidas, consulte os relatórios de auditoria e implementação para mais detalhes técnicos.
