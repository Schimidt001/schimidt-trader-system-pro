# 🏭 Market Detector v2.0 — Comportamento em Produção

## ⚠️ IMPORTANTE: Zero Dados Fictícios

Este documento descreve o comportamento **real e cirúrgico** do Market Detector v2.0 em ambiente de produção.

**Princípio fundamental:** O sistema **NUNCA** inventa dados. Falha de API = opera apenas com critérios internos.

---

## 🔄 Arquitetura: 2 Ciclos Independentes

### **Ciclo A: Coleta de Notícias (Independente do Candle)**

**Quando executa:**
- Automaticamente a cada 6 horas (00:00, 06:00, 12:00, 18:00 UTC)
- Imediatamente na inicialização do servidor
- Manualmente via botão "Atualizar Notícias"

**O que faz:**
1. Tenta coletar notícias de API pública
2. Filtra apenas USD/JPY
3. Filtra apenas HIGH e MEDIUM impact
4. **Salva no banco de dados** (tabela `marketEvents`)
5. Limpa eventos antigos (>7 dias)

**Comportamento em falha de API:**
```
❌ Falha na API Pública: [erro]
⚠️ Falha na coleta de notícias externas. Detector operará apenas com critérios internos.
```

**Resultado:**
- ✅ Sucesso: Notícias salvas no banco
- ❌ Falha: **Nenhum dado inventado**, apenas log de erro

**Importante:**
- Não bloqueia o bot
- Executa em paralelo
- Não afeta o Ciclo B

---

### **Ciclo B: Detector de Mercado (Fechamento do Candle M60)**

**Quando executa:**
- **Apenas no fechamento de candles M60**
- Chamado por `onCandleClose()` do Trading Bot
- Linha 947 do `tradingBot.ts`

**O que faz:**

#### **1. Busca Dados do Banco**
```typescript
// Busca histórico de candles
const history = await getCandleHistory(symbol, 20, "M60");

// Busca configuração do usuário
const config = await getMarketDetectorConfig(userId);

// Busca notícias do banco (NÃO chama API)
const newsEvents = await getMarketEventsByDate(currencies, candleDate);
```

#### **2. Avalia Critérios Internos (Matemática Pura)**

**Critério 1: Amplitude Anormal (ATR)**
- Calcula ATR dos últimos 14 candles
- `amplitude > ATR × 2.5` → +2 pontos

**Critério 2: Sombras Exageradas**
- `max(sombra) > corpo × 2.0` → +1 ponto

**Critério 3: Spread Anormal**
- `spread atual > média 24h × 2.0` → +1 ponto

**Critério 4: Volatilidade Fractal**
- `amplitude / corpo > 1.8` → +1 ponto

#### **3. Avalia Critérios Externos (Notícias do Banco)**

**Janelas de tempo:**
- Próximos 60 minutos (windowNextNews)
- Últimos 30 minutos (windowPastNews)

**Pontuação:**
- HIGH (futuro): +3 pontos
- MEDIUM (futuro): +1 ponto
- HIGH (passado): +2 pontos

**Comportamento se não houver notícias:**
- Score baseado **apenas em critérios internos**
- Nenhum ponto adicionado por notícias
- Sistema continua operando normalmente

#### **4. Calcula Score e Status**

**Score = Soma de todos os critérios**

**Classificação:**
- 🟢 **GREEN (0-3)**: Mercado normal → Opera normalmente
- 🟡 **YELLOW (4-6)**: Mercado instável → Opera com cautela (alerta)
- 🔴 **RED (7-10)**: Mercado anormal → **NÃO OPERA** (bloqueio)

#### **5. Salva Resultado**
- Banco de dados (tabela `marketConditions`)
- Memória (`currentMarketCondition`)

---

## 🚦 Bloqueio de Operações

**Quando verifica:**
- Antes de entrar em cada operação
- Método `enterPosition()` linha 1176-1189

**Como funciona:**
```typescript
if (this.currentMarketCondition.status === "RED") {
  // LOG: 🔴 Entrada bloqueada por condições de mercado
  // Volta para WAITING_MIDPOINT
  // NÃO ENTRA na operação
  return;
}
```

**Resultado:**
- 🔴 RED: **Bloqueia** entrada
- 🟡 YELLOW: Entra normalmente (apenas alerta)
- 🟢 GREEN: Entra normalmente

---

## ⚠️ Comportamento em Falha de API

### **Cenário 1: API falha na coleta (Ciclo A)**

**O que acontece:**
```
[NewsCollector] ❌ Falha na API Pública: [erro]
[NewsCollector] ⚠️ Falha na coleta de notícias externas. Detector operará apenas com critérios internos.
[NewsCollector] ⚠️ PRODUÇÃO: Nenhum evento coletado. Detector operará apenas com critérios internos (ATR, Wicks, Spread, Fractal).
```

**Resultado:**
- ✅ Nenhum dado inventado
- ✅ Banco permanece sem notícias (ou com notícias antigas)
- ✅ Detector continua operando

### **Cenário 2: Detector avalia sem notícias (Ciclo B)**

**O que acontece:**
- Busca notícias do banco: `[]` (vazio)
- Calcula score **apenas com critérios internos**
- Score máximo possível: 5 pontos (ATR + Wicks + Spread + Fractal)
- Status máximo: YELLOW (nunca RED por falta de notícias)

**Resultado:**
- ✅ Sistema continua operando
- ✅ Decisões baseadas em matemática do candle
- ✅ Nenhum comportamento imprevisível

### **Cenário 3: Banco de dados falha**

**O que acontece:**
- Detector retorna GREEN (score 0) por segurança
- Log de erro crítico
- Bot opera normalmente

**Resultado:**
- ✅ Sistema não trava
- ✅ Bot continua operando
- ✅ Erro registrado para investigação

---

## 🔒 Garantias de Segurança

### **1. Zero Dados Fictícios em Produção**
```typescript
// Mock data APENAS em desenvolvimento
if (events.length === 0 && process.env.NODE_ENV !== 'production') {
  // Gera mock data
}

// Em produção: apenas log
if (events.length === 0 && process.env.NODE_ENV === 'production') {
  console.warn("⚠️ PRODUÇÃO: Nenhum evento coletado. Detector operará apenas com critérios internos.");
}
```

### **2. Detector NUNCA Chama API**
- Imports: Apenas `getMarketDetectorConfig` e `getMarketEventsByDate` (banco)
- Zero imports de `axios`, `fetch`, `http`, `request`
- 100% isolado de internet externa

### **3. Logs Estruturados**
```
✅ Sucesso: [NewsCollector] ✅ 15 eventos salvos no banco
❌ Falha API: [NewsCollector] ❌ Falha na API Pública: [erro]
⚠️ Sem dados: [NewsCollector] ⚠️ PRODUÇÃO: Nenhum evento coletado
🔴 Bloqueio: [MARKET_CONDITION] 🔴 Entrada bloqueada | Status: RED | Score: 8/10
```

### **4. Comportamento Previsível**
- Falha de API = critérios internos apenas
- Sem notícias = score máximo 5 (YELLOW)
- Erro de banco = GREEN (segurança)
- Nenhuma surpresa

---

## 📊 Exemplo Real de Operação

### **Dia Normal (API funcionando)**

```
06:00 - Ciclo A executa
  └─> API retorna 15 eventos USD/JPY
  └─> Salva no banco
  └─> ✅ 15 eventos salvos

07:00 - Candle M60 fecha
  └─> Ciclo B avalia
      ├─> ATR: 0 pontos (normal)
      ├─> Wicks: 0 pontos (normal)
      ├─> Spread: 0 pontos (normal)
      ├─> Fractal: 1 ponto (leve volatilidade)
      ├─> Notícias: 3 pontos (HIGH em 30min)
      └─> Score: 4 → YELLOW

07:30 - Bot tenta entrar
  └─> Status: YELLOW → ENTRA (apenas alerta)
```

### **Dia com Falha de API**

```
06:00 - Ciclo A executa
  └─> API falha (timeout)
  └─> ❌ Falha na API Pública
  └─> ⚠️ Nenhum evento coletado
  └─> Banco permanece vazio

07:00 - Candle M60 fecha
  └─> Ciclo B avalia
      ├─> ATR: 2 pontos (alta amplitude)
      ├─> Wicks: 1 ponto (sombras longas)
      ├─> Spread: 0 pontos (normal)
      ├─> Fractal: 1 ponto (volatilidade)
      ├─> Notícias: 0 pontos (banco vazio)
      └─> Score: 4 → YELLOW

07:30 - Bot tenta entrar
  └─> Status: YELLOW → ENTRA (apenas alerta)
```

**Observação:** Mesmo sem notícias, o sistema continua operando com critérios internos.

---

## 🎯 Checklist de Conformidade

- [x] Mock data APENAS em desenvolvimento (`NODE_ENV !== 'production'`)
- [x] Falha de API não gera dados fictícios
- [x] Detector NUNCA chama API (apenas banco)
- [x] Logs estruturados para todas as situações
- [x] Comportamento previsível em falhas
- [x] Zero surpresas em produção
- [x] 2 ciclos completamente independentes
- [x] Notícias salvas no banco (Ciclo A)
- [x] Detector lê apenas banco (Ciclo B)
- [x] RED bloqueia operações
- [x] Parâmetros configuráveis
- [x] Painel baseado em dados reais

---

## 📝 Variáveis de Ambiente

### **NODE_ENV**
- `production`: Mock data **desabilitado**
- `development` ou `test`: Mock data **habilitado**

**Configuração no servidor:**
```bash
export NODE_ENV=production
```

---

## 🔍 Monitoramento

### **Logs a observar:**

**Sucesso na coleta:**
```
[NewsCollector] ✅ 15 eventos salvos no banco
```

**Falha na coleta (produção):**
```
[NewsCollector] ❌ Falha na API Pública: [erro]
[NewsCollector] ⚠️ PRODUÇÃO: Nenhum evento coletado. Detector operará apenas com critérios internos.
```

**Avaliação normal:**
```
[MARKET_CONDITION] Avaliação concluída - Status: GREEN | Score: 2
```

**Bloqueio de operação:**
```
[MARKET_CONDITION] 🔴 Entrada bloqueada | Status: RED | Score: 8/10 | Motivos: ATR_HIGH, HIGH_IMPACT_NEWS_UPCOMING
```

---

## ✅ Conclusão

O Market Detector v2.0 em produção é:

- **Cirúrgico**: Comportamento exato e previsível
- **Seguro**: Zero dados fictícios
- **Resiliente**: Continua operando em falhas
- **Transparente**: Logs estruturados
- **Institucional**: Arquitetura profissional

**Princípio fundamental:** Falha de API = opera com critérios internos. Nunca inventa dados.

---

**Versão**: 2.0  
**Ambiente**: Production  
**Data**: 14/11/2025  
**Status**: ✅ Pronto para Operação Real
