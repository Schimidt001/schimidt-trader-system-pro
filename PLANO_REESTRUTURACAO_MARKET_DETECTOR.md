# Plano de Reestruturação - Market Condition Detector v2.0

**Data:** 14 de Novembro de 2025  
**Objetivo:** Reestruturação completa com arquitetura profissional, escalável e configurável

---

## 🏗️ ARQUITETURA NOVA

### Ciclo A - Coleta de Notícias (Independente)
```
Scheduler (node-cron ou setInterval)
  ↓
  Executa a cada 6 horas (ou configurável)
  ↓
  newsCollectorService.ts
  ↓
  Consulta APIs:
    - TradingEconomics (preferencial)
    - ForexFactory (fallback com scraping)
  ↓
  Filtra USD/JPY
  ↓
  Salva em marketEvents
  ↓
  Popula painel automaticamente
```

**Características:**
- Totalmente independente do candle
- Executa em background
- Fallback robusto se API falhar
- Coleta eventos futuros (24-48h) e recentes (12-24h)

### Ciclo B - Detector de Mercado (No Candle M60)
```
TradingBot.closeCurrentCandle()
  ↓
  Se timeframe === 3600 (M60)
  ↓
  marketConditionDetector.evaluate()
  ↓
  Lê candle anterior (OHLC)
  ↓
  Lê notícias do BANCO (não chama API)
  ↓
  Calcula score híbrido:
    - Critérios internos (ATR, Wicks, Fractal, Spread)
    - Critérios externos (Notícias HIGH/MEDIUM)
  ↓
  Classifica status (🟢🟡🔴)
  ↓
  Salva em marketConditions
  ↓
  Se 🔴 → Bloqueia operação
```

**Características:**
- Executa apenas no fechamento do candle M60
- Lê tudo do banco (zero chamadas de API)
- Score configurável pelo usuário
- Bloqueia operações se necessário

---

## 📊 BANCO DE DADOS

### Tabela: marketEvents
```sql
CREATE TABLE marketEvents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  timestampEvento BIGINT NOT NULL,
  moeda VARCHAR(10) NOT NULL,
  impacto ENUM('HIGH', 'MEDIUM', 'LOW') NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  horario VARCHAR(50),
  tipo ENUM('upcoming', 'recent') NOT NULL,
  fonte VARCHAR(100),
  actual VARCHAR(50),
  forecast VARCHAR(50),
  previous VARCHAR(50),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_timestamp (timestampEvento),
  INDEX idx_moeda (moeda),
  INDEX idx_tipo (tipo)
);
```

### Tabela: marketConditions
```sql
CREATE TABLE marketConditions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  botId INT NOT NULL,
  score INT NOT NULL,
  status ENUM('GREEN', 'YELLOW', 'RED') NOT NULL,
  timestamp BIGINT NOT NULL,
  candleReference BIGINT NOT NULL,
  motivos JSON NOT NULL,
  detalhes JSON,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_bot (userId, botId),
  INDEX idx_timestamp (timestamp),
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

### Tabela: marketDetectorConfig
```sql
CREATE TABLE marketDetectorConfig (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL UNIQUE,
  
  -- Habilitação
  enabled BOOLEAN DEFAULT TRUE,
  
  -- Critérios internos
  atrWindow INT DEFAULT 14,
  atrMultiplier DECIMAL(4,2) DEFAULT 2.5,
  wickMultiplier DECIMAL(4,2) DEFAULT 2.0,
  fractalThreshold DECIMAL(4,2) DEFAULT 1.8,
  spreadMultiplier DECIMAL(4,2) DEFAULT 2.0,
  
  -- Critérios externos (notícias)
  weightHigh INT DEFAULT 3,
  weightMedium INT DEFAULT 1,
  windowNextNews INT DEFAULT 60,
  windowPastNews INT DEFAULT 30,
  
  -- Thresholds de classificação
  greenThreshold INT DEFAULT 3,
  yellowThreshold INT DEFAULT 6,
  
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

---

## 📁 ESTRUTURA DE ARQUIVOS

### Backend
```
server/market-condition-v2/
├── types.ts                          # Tipos e interfaces
├── config.ts                         # Configurações padrão
├── newsCollectorService.ts           # Ciclo A - Coleta de notícias
├── marketConditionDetector.ts        # Ciclo B - Detector
├── technicalUtils.ts                 # Cálculos técnicos (ATR, etc)
├── newsScheduler.ts                  # Scheduler para Ciclo A
└── index.ts                          # Exports
```

### Frontend
```
client/src/pages/
├── MarketCalendar.tsx                # Painel "Calendário & Mercado"
└── Settings.tsx                      # + Seção "Market Detector Config"

client/src/components/
└── MarketDetectorSettings.tsx        # Componente de configurações
```

---

## 🔧 IMPLEMENTAÇÃO DETALHADA

### Fase 1: Schemas de Banco
- Criar migrations para `marketEvents`, `marketConditions`, `marketDetectorConfig`
- Atualizar `server/db.ts` com funções de acesso

### Fase 2: Ciclo A - Coleta de Notícias
- `newsCollectorService.ts`:
  - Função `collectNews()` que consulta APIs
  - Integração com TradingEconomics (preferencial)
  - Fallback para ForexFactory com scraping
  - Conversão US→USD, JP→JPY
  - Salvar em `marketEvents`
- `newsScheduler.ts`:
  - Usar `node-cron` ou `setInterval`
  - Executar a cada 6 horas (00:00, 06:00, 12:00, 18:00)
  - Iniciar automaticamente com o servidor

### Fase 3: Ciclo B - Detector
- `marketConditionDetector.ts`:
  - Método `evaluate(candle, config)`:
    - Calcular critérios internos (ATR, Wicks, Fractal, Spread)
    - Buscar notícias do banco (`marketEvents`)
    - Calcular score híbrido
    - Classificar status (🟢🟡🔴)
    - Retornar resultado completo
  - Método `getConfig(userId)`: buscar configuração do usuário
  - Método `applyDefaultConfig()`: valores padrão institucionais

### Fase 4: Configurações Ajustáveis
- Backend:
  - tRPC router `marketDetector`:
    - `getConfig`: buscar configuração
    - `updateConfig`: atualizar configuração
    - `resetConfig`: restaurar padrões
- Frontend:
  - Componente `MarketDetectorSettings.tsx`:
    - Seção "Configurações Avançadas"
    - Inputs para todos os parâmetros
    - Botão "Restaurar Padrões Institucionais"
    - Tooltips explicativos

### Fase 5: Painel "Calendário & Mercado"
- `MarketCalendar.tsx`:
  - Seção 1: Condição de Mercado Atual
    - Score, Status, Última avaliação, Motivos
  - Seção 2: Próximas Notícias Relevantes (24h)
    - Tabela com horário, moeda, impacto, título, fonte
  - Seção 3: Notícias Recentes (12h)
    - Tabela similar
  - Seção 4: Logs da Análise
    - Últimas 10 avaliações
    - Critérios acionados
    - Justificativas do score

### Fase 6: Integração com Trading Bot
- `tradingBot.ts`:
  - No método `closeCurrentCandle()`:
    - Chamar `marketConditionDetector.evaluate()`
    - Armazenar resultado em `this.currentMarketCondition`
  - No método `makePrediction()` ou `armTrigger()`:
    - Verificar `this.currentMarketCondition.status`
    - Se 🔴 (RED) → Bloquear operação e logar
    - Se 🟡 (YELLOW) → Exibir alerta mas permitir
    - Se 🟢 (GREEN) → Operar normalmente

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

### Banco de Dados
- [ ] Migration para `marketEvents`
- [ ] Migration para `marketConditions`
- [ ] Migration para `marketDetectorConfig`
- [ ] Funções de acesso em `db.ts`

### Backend - Ciclo A
- [ ] `newsCollectorService.ts` completo
- [ ] Integração TradingEconomics
- [ ] Fallback ForexFactory
- [ ] `newsScheduler.ts` com cron job
- [ ] Inicialização automática

### Backend - Ciclo B
- [ ] `marketConditionDetector.ts` completo
- [ ] Cálculos técnicos (ATR, Wicks, Fractal, Spread)
- [ ] Leitura de notícias do banco
- [ ] Score híbrido
- [ ] Classificação de status

### Backend - Configurações
- [ ] tRPC router `marketDetector`
- [ ] `getConfig`, `updateConfig`, `resetConfig`
- [ ] Validação de parâmetros

### Frontend - Configurações
- [ ] Componente `MarketDetectorSettings.tsx`
- [ ] Integração em `Settings.tsx`
- [ ] Todos os inputs configuráveis
- [ ] Botão de reset

### Frontend - Painel
- [ ] `MarketCalendar.tsx` completo
- [ ] Seção de condição atual
- [ ] Seção de próximas notícias
- [ ] Seção de notícias recentes
- [ ] Seção de logs

### Integração
- [ ] Trading Bot lê status do detector
- [ ] Bloqueio de operações em 🔴
- [ ] Alerta em 🟡
- [ ] Logs adequados

### Testes
- [ ] Testar coleta de notícias
- [ ] Testar cálculo de score
- [ ] Testar classificação de status
- [ ] Testar bloqueio de operações
- [ ] Testar painel completo

---

## 🎯 RESULTADO ESPERADO

Um Market Condition Detector:
- ✅ Inteligente e institucional
- ✅ Totalmente configurável
- ✅ Independente (não depende de APIs em tempo real)
- ✅ Escalável e profissional
- ✅ 100% confiável
- ✅ Com painel completo e limpo
- ✅ Funciona mesmo sem APIs externas

---

**Próximo passo:** Iniciar implementação das migrations de banco de dados.
