# Market Condition Detector v1.0

## 📋 Visão Geral

O **Market Condition Detector** é um módulo de análise de condições de mercado que avalia se o bot deve ou não operar em um determinado candle, baseado em critérios técnicos e fundamentais.

Este módulo foi projetado para ser **modular**, **facilmente desativável** e **não invasivo** à lógica existente do bot.

## 🎯 Objetivo

Adicionar uma camada de proteção que analisa as condições de mercado e gera um status entre:

- 🟢 **Modo Operar** (Score 0-3): Mercado normal, pode operar normalmente
- 🟡 **Modo Cautela** (Score 4-6): Mercado parcialmente instável, mas ainda operável
- 🔴 **Modo Parar** (Score 7-10): Mercado anormal, **NÃO operar** este candle

## 📊 Critérios de Avaliação

O detector calcula um **score de 0 a 10** baseado nos seguintes critérios:

### 1. Amplitude Anormal do Candle (2 pontos)
- **Cálculo:** `amplitude = high - low`
- **Condição:** Se `amplitude > ATR(14) * 2`
- **Motivo:** Movimentos muito grandes podem indicar volatilidade excessiva

### 2. Sombras Exageradas (2 pontos)
- **Cálculo:** 
  - `wickSuperior = high - max(open, close)`
  - `wickInferior = min(open, close) - low`
  - `corpo = abs(close - open)`
- **Condição:** Se `max(wickSuperior, wickInferior) > corpo * 2`
- **Motivo:** Sombras longas indicam indecisão e reversões bruscas

### 3. Spread Anormal (1 ponto)
- **Cálculo:** Comparar spread atual com média das últimas N horas
- **Condição:** Se `spreadAtual > spreadMedio * 1.5`
- **Status:** Não implementado ainda (requer dados de spread em tempo real)

### 4. Volatilidade Fractal (2 pontos)
- **Cálculo:** `razão = corpo / amplitude`
- **Condição:** Se `razão < 0.3` (corpo pequeno + amplitude grande)
- **Motivo:** Comportamento caótico sem direção clara

### 5. Evento Macroeconômico de Alto Impacto (3 pontos)
- **Fonte:** APIs gratuitas (ForexFactory, TradingEconomics)
- **Condição:** Notícia marcada como HIGH impact envolvendo USD ou JPY
- **Motivo:** Eventos macroeconômicos causam volatilidade imprevisível

## ⚙️ Configuração

Todos os parâmetros são configuráveis e estão centralizados em `server/market-condition/types.ts`:

```typescript
{
  enabled: true,                    // Habilitar/desabilitar o detector
  
  // Critério 1: Amplitude anormal
  atrPeriod: 14,                    // Período do ATR
  atrMultiplier: 2.0,               // Multiplicador do ATR
  atrScore: 2,                      // Pontos adicionados
  
  // Critério 2: Sombras exageradas
  wickToBodyRatio: 2.0,             // Razão mínima wick/corpo
  wickScore: 2,                     // Pontos adicionados
  
  // Critério 3: Spread anormal
  spreadLookbackHours: 24,          // Horas para calcular spread médio
  spreadMultiplier: 1.5,            // Multiplicador do spread médio
  spreadScore: 1,                   // Pontos adicionados
  
  // Critério 4: Volatilidade fractal
  fractalBodyToAmplitudeRatio: 0.3, // Razão máxima corpo/amplitude
  fractalScore: 2,                  // Pontos adicionados
  
  // Critério 5: Notícias de alto impacto
  newsEnabled: true,                // Habilitar busca de notícias
  newsScore: 3,                     // Pontos adicionados
  newsApiTimeout: 5000,             // Timeout da API em ms
  
  // Classificação
  greenThreshold: 3,                // Score máximo para GREEN
  yellowThreshold: 6,               // Score máximo para YELLOW
}
```

## 🔄 Momento de Execução

O detector roda **uma vez por candle**, seguindo esta lógica:

1. Candle anterior (H-1) fecha
2. Detector avalia dados do candle anterior + contexto
3. Gera um `marketStatus` (🟢🟡🔴) e um `marketScore` (0-10)
4. O bot só pode enviar ordens se o status **NÃO for 🔴**

**Importante:** A avaliação ocorre apenas para **timeframe M60** e **ativos Forex**.

## 🛡️ Comportamento em Caso de Falha

Se a API de notícias falhar:
- ✅ **NÃO** coloca o sistema automaticamente em 🔴
- ✅ Registra o erro em log
- ✅ Calcula o score apenas com os critérios internos
- ✅ A falta de notícia **NÃO bloqueia** o bot sozinha

## 🗄️ Banco de Dados

Nova tabela: `marketConditions`

```sql
CREATE TABLE marketConditions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  botId INT NOT NULL DEFAULT 1,
  candleTimestamp BIGINT NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  status ENUM('GREEN', 'YELLOW', 'RED') NOT NULL,
  score INT NOT NULL,
  reasons TEXT NOT NULL,
  details TEXT,
  computedAt TIMESTAMP NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🌐 Endpoints tRPC

### `marketCondition.current`
Obtém a última condição de mercado para o bot/símbolo atual.

### `marketCondition.history`
Obtém o histórico de condições (últimas 24h ou X registros).

### `marketCondition.byDate`
Obtém condições de mercado para uma data específica.

## 🖥️ Interface

### Dashboard
- Indicador visual ao lado do status do bot
- Exibe status (🟢🟡🔴), score e hora da última avaliação

### Aba "Calendário & Mercado"
- **Condição Atual:** Card com status, score e motivos
- **Histórico:** Tabela com todas as avaliações das últimas 24h
- **Legenda:** Explicação dos critérios e classificação

## 🔧 Como Desativar

Para desativar o Market Condition Detector:

1. **Via Banco de Dados:**
   ```sql
   UPDATE config SET marketConditionEnabled = 0 WHERE userId = <seu_user_id>;
   ```

2. **Via Código:**
   ```typescript
   // Em server/market-condition/types.ts
   export const DEFAULT_MARKET_CONDITION_CONFIG = {
     enabled: false,  // Desabilitar aqui
     // ...
   };
   ```

## 📁 Estrutura de Arquivos

```
server/market-condition/
├── types.ts                    # Tipos e configurações
├── technicalUtils.ts           # Funções para cálculos técnicos (ATR, etc)
├── newsService.ts              # Serviço de busca de notícias
└── marketConditionDetector.ts  # Classe principal do detector

drizzle/schema.ts               # Schema do banco (tabela marketConditions)
server/db.ts                    # Funções de acesso ao banco
server/routers.ts               # Endpoints tRPC
server/deriv/tradingBot.ts      # Integração com o bot

client/src/pages/
├── Dashboard.tsx               # Indicador no dashboard
└── MarketCalendar.tsx          # Nova página de análise
```

## ⚠️ Limitações Conhecidas

1. **Critério de Spread:** Não implementado ainda (requer dados de spread em tempo real)
2. **API de Notícias:** Depende de scraping do ForexFactory (pode falhar)
3. **Apenas M60 e Forex:** O detector só opera nessas condições

## 🚀 Próximos Passos

- [ ] Implementar critério de spread anormal
- [ ] Adicionar mais fontes de notícias (TradingEconomics, MyFXBook)
- [ ] Permitir configuração via interface (sem editar código)
- [ ] Adicionar gráficos de evolução do score ao longo do tempo
- [ ] Suportar outros timeframes além de M60

## 📝 Logs Importantes

O detector gera os seguintes eventos de log:

- `MARKET_CONDITION_CONFIG`: Configuração do detector ao iniciar
- `MARKET_CONDITION_EVALUATED`: Resultado da avaliação
- `ENTRY_BLOCKED_MARKET_CONDITION`: Entrada bloqueada por condições ruins
- `MARKET_CONDITION_CHECK`: Verificação de condições antes de entrar
- `MARKET_CONDITION_ERROR`: Erro durante a avaliação

## 📞 Suporte

Para dúvidas ou problemas, consulte os logs do sistema ou entre em contato com o desenvolvedor.

---

**Versão:** 1.0  
**Data:** 14 de Novembro de 2025  
**Autor:** Manus AI
