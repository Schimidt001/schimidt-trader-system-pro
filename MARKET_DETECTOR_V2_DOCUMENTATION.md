# Market Condition Detector v2.0 — Documentação Completa

## 📋 Resumo Executivo

O **Market Condition Detector v2.0** foi completamente reestruturado com arquitetura profissional e escalável, implementando dois ciclos independentes (coleta de notícias e detecção de mercado), configurações totalmente ajustáveis pelo usuário, painel completo de visualização e regras de segurança para bloqueio automático de operações.

---

## 🏗️ Arquitetura

### **Ciclo A: Coleta de Notícias (Independente)**
- **Frequência**: A cada 6 horas (00:00, 06:00, 12:00, 18:00 UTC)
- **Função**: Coleta notícias macroeconômicas de USD/JPY e armazena no banco de dados
- **Fontes**: TradingEconomics (preferencial) + ForexFactory (fallback)
- **Automação**: Scheduler automático iniciado com o servidor
- **Armazenamento**: Tabela `marketEvents` (timestamp, currency, impact, title, etc)

### **Ciclo B: Detector de Mercado (No Fechamento do Candle)**
- **Frequência**: Executado no fechamento de cada candle M60
- **Função**: Avalia condições de mercado e classifica em GREEN/YELLOW/RED
- **Dados**: Lê notícias do banco (não chama APIs externas)
- **Critérios**: 4 internos (ATR, Wicks, Fractal, Spread) + 1 externo (Notícias)
- **Armazenamento**: Tabela `marketConditions` (status, score, reasons, details)

---

## 📊 Critérios de Avaliação

### **Critérios Internos (Matemática do Candle)**

#### 1. **Amplitude Anormal (ATR)**
- **Descrição**: Detecta candles com amplitude muito maior que o ATR histórico
- **Cálculo**: `amplitude > ATR × multiplicador`
- **Padrões**:
  - Janela ATR: 14 candles
  - Multiplicador: 2.5×
  - Pontos: +2

#### 2. **Sombras Exageradas (Wicks)**
- **Descrição**: Detecta candles com sombras muito maiores que o corpo
- **Cálculo**: `max(wickSuperior, wickInferior) > corpo × multiplicador`
- **Padrões**:
  - Multiplicador: 2.0×
  - Pontos: +1

#### 3. **Volatilidade Fractal**
- **Descrição**: Detecta candles com corpo pequeno e amplitude grande
- **Cálculo**: `amplitude / corpo > threshold`
- **Padrões**:
  - Threshold: 1.8
  - Pontos: +1

#### 4. **Spread Anormal**
- **Descrição**: Detecta spread muito maior que a média histórica (24h)
- **Cálculo**: `spreadAtual > spreadMédio × multiplicador`
- **Padrões**:
  - Multiplicador: 2.0×
  - Pontos: +1

### **Critérios Externos (Notícias Macroeconômicas)**

#### 5. **Notícias de Alto Impacto**
- **Descrição**: Detecta eventos macroeconômicos relevantes (USD/JPY)
- **Janelas de Tempo**:
  - Próximas notícias: 60 minutos
  - Notícias passadas: 30 minutos
- **Pesos**:
  - HIGH (futuro): +3 pontos
  - MEDIUM (futuro): +1 ponto
  - HIGH (passado): +2 pontos

---

## 🎯 Classificação de Status

| Status | Score | Descrição | Ação do Bot |
|--------|-------|-----------|-------------|
| 🟢 **GREEN** | 0-3 | Mercado normal | Opera normalmente |
| 🟡 **YELLOW** | 4-6 | Mercado instável | Opera com cautela (apenas alerta) |
| 🔴 **RED** | 7-10 | Mercado anormal | **NÃO OPERA** (bloqueio automático) |

---

## 🗄️ Estrutura do Banco de Dados

### **Tabela: `marketEvents`** (já existia)
```sql
CREATE TABLE marketEvents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp INT NOT NULL,
  currency VARCHAR(10) NOT NULL,
  impact ENUM('HIGH', 'MEDIUM', 'LOW') NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  source VARCHAR(50) NOT NULL,
  actual VARCHAR(50),
  forecast VARCHAR(50),
  previous VARCHAR(50),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### **Tabela: `marketConditions`** (já existia)
```sql
CREATE TABLE marketConditions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  botId INT NOT NULL,
  candleTimestamp INT NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  status ENUM('GREEN', 'YELLOW', 'RED') NOT NULL,
  score INT NOT NULL,
  reasons TEXT NOT NULL,
  details TEXT,
  computedAt TIMESTAMP NOT NULL
);
```

### **Tabela: `marketDetectorConfig`** (NOVA)
```sql
CREATE TABLE marketDetectorConfig (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT TRUE NOT NULL,
  
  -- Critérios internos
  atrWindow INT DEFAULT 14 NOT NULL,
  atrMultiplier DECIMAL(4,2) DEFAULT 2.50 NOT NULL,
  atrScore INT DEFAULT 2 NOT NULL,
  wickMultiplier DECIMAL(4,2) DEFAULT 2.00 NOT NULL,
  wickScore INT DEFAULT 1 NOT NULL,
  fractalThreshold DECIMAL(4,2) DEFAULT 1.80 NOT NULL,
  fractalScore INT DEFAULT 1 NOT NULL,
  spreadMultiplier DECIMAL(4,2) DEFAULT 2.00 NOT NULL,
  spreadScore INT DEFAULT 1 NOT NULL,
  
  -- Critérios externos
  weightHigh INT DEFAULT 3 NOT NULL,
  weightMedium INT DEFAULT 1 NOT NULL,
  weightHighPast INT DEFAULT 2 NOT NULL,
  windowNextNews INT DEFAULT 60 NOT NULL,
  windowPastNews INT DEFAULT 30 NOT NULL,
  
  -- Thresholds
  greenThreshold INT DEFAULT 3 NOT NULL,
  yellowThreshold INT DEFAULT 6 NOT NULL,
  
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
);
```

---

## 🔧 Arquivos Criados/Modificados

### **Backend (Novos Arquivos)**
```
server/market-condition-v2/
├── types.ts                        # Tipos e interfaces
├── technicalUtils.ts               # Funções de cálculo técnico (ATR, wicks, etc)
├── newsCollectorService.ts         # Serviço de coleta de notícias (Ciclo A)
├── newsScheduler.ts                # Scheduler automático (a cada 6h)
├── marketConditionDetector.ts      # Detector principal (Ciclo B)
├── index.ts                        # Exports do módulo
└── test.ts                         # Script de testes
```

### **Backend (Modificados)**
- `server/db.ts` — Adicionadas funções para `marketDetectorConfig`
- `server/routers.ts` — Adicionado router `marketDetector` com 3 endpoints
- `server/deriv/tradingBot.ts` — Atualizado para usar Market Detector v2
- `server/_core/index.ts` — Adicionada inicialização do News Scheduler
- `drizzle/schema.ts` — Adicionada tabela `marketDetectorConfig`

### **Frontend (Novos Arquivos)**
```
client/src/components/
└── MarketDetectorSettings.tsx      # Painel de configurações avançadas
```

### **Frontend (Modificados)**
- `client/src/pages/Settings.tsx` — Integrado `MarketDetectorSettings`
- `client/src/pages/MarketCalendar.tsx` — Reescrito com novo layout completo

---

## 🎨 Interface do Usuário

### **Página: Configurações**
- **Seção Market Detector**: Switch para ativar/desativar
- **Configurações Avançadas** (aparece quando ativado):
  - 4 critérios internos (ATR, Wicks, Fractal, Spread)
  - Pesos de notícias (HIGH, MEDIUM, HIGH_PAST)
  - Janelas de tempo (próximas/passadas)
  - Thresholds de classificação (GREEN, YELLOW)
  - Botão "Restaurar Padrões"

### **Página: Calendário & Mercado**
- **Condição de Mercado Atual**:
  - Status visual (🟢🟡🔴)
  - Score atual
  - Última avaliação
  - Motivos da classificação
- **Próximas Notícias Relevantes** (24h):
  - Lista de eventos USD/JPY
  - Badges de impacto (ALTO/MÉDIO)
  - Horário e fonte
- **Notícias Recentes** (12h):
  - Eventos que já ocorreram
  - Dados actual/forecast/previous
- **Histórico de Avaliações**:
  - Últimas 10 avaliações
  - Status, score e motivos

---

## 🔌 API (tRPC)

### **Router: `marketDetector`**

#### `marketDetector.getConfig`
```typescript
// GET - Obtém configuração do usuário
const config = await trpc.marketDetector.getConfig.useQuery();
```

#### `marketDetector.updateConfig`
```typescript
// POST - Atualiza configuração
await trpc.marketDetector.updateConfig.mutate({
  enabled: true,
  atrWindow: 14,
  atrMultiplier: "2.50",
  // ... outros parâmetros
});
```

#### `marketDetector.resetConfig`
```typescript
// POST - Restaura configuração padrão
await trpc.marketDetector.resetConfig.mutate();
```

---

## 🚀 Como Usar

### **1. Aplicar Migration do Banco de Dados**
```bash
# Conectar ao banco e executar:
mysql -h gondola.proxy.rlwy.net -P 25153 -u root -p railway < drizzle/0004_add_market_detector_config.sql
```

### **2. Iniciar o Servidor**
```bash
pnpm dev
```

O News Scheduler será iniciado automaticamente e executará a primeira coleta imediatamente.

### **3. Ativar no Frontend**
1. Acesse **Configurações**
2. Ative o switch **"Market Condition Detector"**
3. (Opcional) Ajuste os parâmetros em **"Configurações Avançadas"**
4. Clique em **"Salvar Configurações"**

### **4. Monitorar no Painel**
1. Acesse **Calendário & Mercado**
2. Visualize o status atual do mercado
3. Acompanhe as próximas notícias
4. Revise o histórico de avaliações

---

## 🧪 Testes

### **Executar Teste Manual**
```bash
npx tsx server/market-condition-v2/test.ts
```

**Resultado esperado:**
```
✅ Cenário 1 (Candle Normal): Status GREEN, Score 1/10
✅ Cenário 2 (Amplitude Anormal): Status YELLOW, Score 4/10
✅ Cenário 3 (Sombras Longas): Status YELLOW, Score 4/10
```

---

## 📝 Logs e Monitoramento

### **Logs do News Scheduler**
```
[NewsScheduler] Iniciando scheduler de coleta de notícias...
[NewsScheduler] ✅ Scheduler iniciado (executa a cada 6 horas)
[NewsCollector] Iniciando coleta de notícias...
[NewsCollector] ForexFactory: 15 eventos coletados
[NewsCollector] ✅ 15 eventos salvos no banco
```

### **Logs do Market Detector**
```
[MARKET_CONDITION] Iniciando avaliação de condições de mercado...
[MARKET_CONDITION] Avaliação concluída - Status: GREEN | Score: 2
```

### **Logs do Trading Bot**
```
🟢 Condições de mercado verificadas | Status: GREEN | Score: 2/10
🔴 Entrada bloqueada por condições de mercado | Status: RED | Score: 8/10
```

---

## ⚙️ Configurações Padrão (Institucionais)

```typescript
{
  enabled: true,
  
  // Critérios internos
  atrWindow: 14,
  atrMultiplier: 2.5,
  atrScore: 2,
  wickMultiplier: 2.0,
  wickScore: 1,
  fractalThreshold: 1.8,
  fractalScore: 1,
  spreadMultiplier: 2.0,
  spreadScore: 1,
  
  // Critérios externos
  weightHigh: 3,
  weightMedium: 1,
  weightHighPast: 2,
  windowNextNews: 60,  // minutos
  windowPastNews: 30,  // minutos
  
  // Thresholds
  greenThreshold: 3,
  yellowThreshold: 6,
}
```

---

## 🔒 Regras de Segurança

### **Bloqueio Automático (RED)**
- Quando `score > yellowThreshold` (padrão: 6)
- Trading Bot **NÃO entra** em novas operações
- Log de evento: `ENTRY_BLOCKED_MARKET_CONDITION`
- Bot retorna para estado `WAITING_MIDPOINT`

### **Modo Cautela (YELLOW)**
- Quando `score > greenThreshold && score <= yellowThreshold`
- Trading Bot **opera normalmente** (apenas alerta)
- Log de evento: `MARKET_CONDITION_CHECK`

### **Modo Normal (GREEN)**
- Quando `score <= greenThreshold` (padrão: 3)
- Trading Bot opera normalmente
- Sem restrições

---

## 🎯 Benefícios da Reestruturação

✅ **Arquitetura Profissional**: Separação clara de responsabilidades (Ciclo A e B)  
✅ **Escalabilidade**: Fácil adicionar novos critérios ou fontes de notícias  
✅ **Configurabilidade**: Todos os parâmetros ajustáveis pelo usuário  
✅ **Performance**: Coleta de notícias independente (não bloqueia o bot)  
✅ **Confiabilidade**: Lê dados do banco (não depende de APIs externas no Ciclo B)  
✅ **Observabilidade**: Logs detalhados e histórico completo  
✅ **Testabilidade**: Script de teste isolado  
✅ **UX Profissional**: Painel completo com status em tempo real  

---

## 📞 Suporte

Para dúvidas ou problemas, consulte:
- `PLANO_REESTRUTURACAO_MARKET_DETECTOR.md` — Planejamento da arquitetura
- `CONHECIMENTO_COMPLETO_PLATAFORMA.md` — Documentação geral da plataforma
- Logs do servidor: `/var/log/` ou console do terminal

---

**Versão**: 2.0  
**Data**: 14/11/2025  
**Status**: ✅ Implementado e Testado
