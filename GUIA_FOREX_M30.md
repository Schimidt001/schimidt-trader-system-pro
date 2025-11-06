# 🚀 Guia Rápido: Forex e Timeframe M30

## 📋 O que foi adicionado?

Sua plataforma agora suporta:

1. ✅ **Ativos Forex da DERIV** (EUR/USD, GBP/USD, USD/JPY, etc.)
2. ✅ **Timeframe M30** (candles de 30 minutos)
3. ✅ **Seleção dinâmica** nas configurações

---

## 🎯 Como Usar

### Passo 1: Aplicar Migration do Banco de Dados

```bash
cd /home/ubuntu/schimidt-trader-system-pro
pnpm db:push
```

Isso irá adicionar o campo `timeframe` na tabela de configurações.

### Passo 2: Reiniciar o Servidor

```bash
pnpm dev
```

### Passo 3: Configurar no Frontend

1. Acesse a página de **Configurações**
2. No campo **"Ativo (Sintético ou Forex)"**:
   - Selecione um par Forex (ex: EUR/USD, GBP/USD)
   - Ou continue usando sintéticos (R_100, R_50, etc.)

3. No campo **"Timeframe"**:
   - Escolha **M15** (15 minutos) - padrão
   - Ou escolha **M30** (30 minutos) - novo!

4. Ajuste o **"Tempo de Espera"**:
   - Para M15: recomendado **8 minutos**
   - Para M30: recomendado **16 minutos**

5. Clique em **"Salvar Configurações"**

---

## 💡 Exemplos de Configuração

### Configuração 1: Forex EUR/USD com M15
```
Ativo: EUR/USD (frxEURUSD)
Timeframe: M15 (15 minutos)
Tempo de Espera: 8 minutos
Stake: $10.00
```

### Configuração 2: Forex GBP/USD com M30
```
Ativo: GBP/USD (frxGBPUSD)
Timeframe: M30 (30 minutos)
Tempo de Espera: 16 minutos
Stake: $10.00
```

### Configuração 3: Sintético com M30
```
Ativo: Volatility 100 Index (R_100)
Timeframe: M30 (30 minutos)
Tempo de Espera: 16 minutos
Stake: $10.00
```

---

## 📊 Pares Forex Disponíveis

### Pares Principais (Major Pairs)
- **EUR/USD** - Euro / Dólar Americano
- **GBP/USD** - Libra Esterlina / Dólar Americano
- **USD/JPY** - Dólar Americano / Iene Japonês
- **AUD/USD** - Dólar Australiano / Dólar Americano
- **USD/CAD** - Dólar Americano / Dólar Canadense
- **USD/CHF** - Dólar Americano / Franco Suíço
- **NZD/USD** - Dólar Neozelandês / Dólar Americano

### Pares Menores (Minor Pairs)
- **EUR/GBP** - Euro / Libra Esterlina
- **EUR/JPY** - Euro / Iene Japonês
- **EUR/AUD** - Euro / Dólar Australiano
- **GBP/JPY** - Libra Esterlina / Iene Japonês
- **AUD/JPY** - Dólar Australiano / Iene Japonês

---

## ⚙️ Timeframes Disponíveis

| Código | Nome | Duração | Status |
|--------|------|---------|--------|
| M15 | 15 minutos | 900 segundos | ✅ Disponível |
| M30 | 30 minutos | 1800 segundos | ✅ **NOVO!** |

---

## ⚠️ Recomendações Importantes

### 1. Teste Sempre em Modo DEMO Primeiro
- Configure o modo DEMO nas configurações
- Use o token DEMO da DERIV
- Teste por alguns candles antes de ir para REAL

### 2. Ajuste o Tempo de Espera
- **M15**: Use 8 minutos (mais da metade do candle)
- **M30**: Use 16 minutos (mais da metade do candle)
- Isso garante dados mais estáveis para predição

### 3. Considere a Volatilidade
- **Forex**: Mais volátil durante horários de mercado
- **Sintéticos**: Volatilidade constante 24/7
- Ajuste o stake de acordo com a volatilidade

### 4. Monitore os Logs
- Verifique se os candles estão sendo processados corretamente
- Observe o log: `[TIMEFRAME] Timeframe configurado: 900s (M15)` ou `1800s (M30)`

### 5. Horários de Trading Forex
- Forex tem maior liquidez durante:
  - Sessão de Londres: 08:00 - 17:00 GMT
  - Sessão de Nova York: 13:00 - 22:00 GMT
  - Sobreposição: 13:00 - 17:00 GMT (melhor momento)

---

## 🔍 Verificando se Está Funcionando

### No Dashboard
1. Inicie o bot
2. Observe o status: "Coletando dados"
3. Verifique o log de eventos:
   - Deve aparecer: `[TIMEFRAME] Timeframe configurado: 1800s (M30)` (se M30)
   - Deve aparecer: `Novo candle: timestamp=...`

### Nos Logs do Servidor
```
[TIMEFRAME] Timeframe configurado: 1800s (M30)
[CONTRACT_TYPE] Tipo de contrato: RISE_FALL
Novo candle: timestamp=1699286400, firstTick=1.0856
```

---

## 🐛 Solução de Problemas

### Problema: Campo timeframe não aparece
**Solução:** Execute `pnpm db:push` para aplicar a migration

### Problema: Erro ao salvar configuração
**Solução:** Verifique se o timeframe é 900 ou 1800

### Problema: Bot não inicia com Forex
**Solução:** 
- Verifique se o token DERIV está correto
- Teste a conexão antes de iniciar o bot
- Verifique se o par Forex está disponível na sua conta

### Problema: Candles não estão sendo processados
**Solução:**
- Verifique os logs do servidor
- Confirme que o símbolo está correto (ex: frxEURUSD)
- Teste com um sintético primeiro para isolar o problema

---

## 📈 Próximos Passos

Após configurar e testar:

1. **Monitore por alguns candles** para garantir estabilidade
2. **Compare resultados** entre M15 e M30
3. **Ajuste parâmetros** conforme necessário:
   - Stake
   - Stop/Take diário
   - Tempo de espera
   - Trigger offset

4. **Explore diferentes pares Forex** para encontrar os melhores

---

## 💬 Dicas Avançadas

### Combinações Recomendadas

**Para Iniciantes:**
```
Ativo: R_100 (Sintético)
Timeframe: M15
Tempo de Espera: 8 min
```

**Para Forex Conservador:**
```
Ativo: EUR/USD
Timeframe: M30
Tempo de Espera: 16 min
Horário: Sobreposição Londres/NY
```

**Para Forex Agressivo:**
```
Ativo: GBP/JPY
Timeframe: M15
Tempo de Espera: 8 min
Horário: Sessão de Londres
```

---

## 📞 Suporte

Se encontrar problemas:

1. Consulte o arquivo `CHANGELOG_FOREX_M30.md`
2. Verifique os logs do servidor
3. Execute o script de teste: `./test_forex_m30.sh`
4. Revise a documentação da API DERIV

---

**Boa sorte com seus trades! 🚀📈**
