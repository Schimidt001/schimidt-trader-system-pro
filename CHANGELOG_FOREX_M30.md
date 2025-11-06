# Changelog: Suporte a Forex e Timeframe M30

**Data:** 06/11/2025  
**Versão:** 1.1.0  
**Autor:** Manus AI Agent

## Resumo das Alterações

Esta atualização adiciona suporte completo para **ativos Forex da DERIV** e **timeframe de 30 minutos (M30)**, mantendo total compatibilidade com o código existente e funcionalidades anteriores.

---

## 🗄️ Banco de Dados

### Schema (`drizzle/schema.ts`)
- **Adicionado campo `timeframe`** na tabela `config`
  - Tipo: `int` (segundos)
  - Valores aceitos: `900` (M15) ou `1800` (M30)
  - Valor padrão: `900` (M15)

### Migration (`drizzle/migrations/0005_add_timeframe_to_config.sql`)
- Nova migration criada para adicionar o campo `timeframe`
- **Ação necessária:** Executar `pnpm db:push` para aplicar a migration

---

## 🔧 Backend

### 1. DerivService (`server/deriv/derivService.ts`)

**Novo método adicionado:**
```typescript
async getActiveSymbols(market?: string): Promise<any[]>
```
- Busca lista completa de símbolos ativos da DERIV
- Suporta filtro por mercado (forex, synthetic_index, etc.)
- Retorna informações: symbol, display_name, market, submarket, pip

**Métodos atualizados:**
- `getCandleHistory()`: Agora aceita granularidade dinâmica (900 ou 1800)
- `subscribeCandles()`: Suporta diferentes timeframes

### 2. Trading Bot (`server/deriv/tradingBot.ts`)

**Propriedade adicionada:**
```typescript
private timeframe: number = 900; // 900 (M15) ou 1800 (M30)
```

**Métodos atualizados:**
- `start()`: Carrega timeframe da configuração
- `startDataCollection()`: Usa timeframe dinâmico para buscar histórico
- `handleTick()`: Calcula timestamp do candle com base no timeframe
- `scheduleCandleEnd()`: Agenda fim do candle de acordo com o timeframe
- Todos os cálculos de duração de contratos agora usam `this.timeframe`

**Logs adicionados:**
```
[TIMEFRAME] Timeframe configurado: 900s (M15)
[TIMEFRAME] Timeframe configurado: 1800s (M30)
```

### 3. API Router (`server/routers.ts`)

**Novo endpoint:**
```typescript
config.getActiveSymbols({ market?: string })
```
- Retorna lista de símbolos ativos da DERIV
- Pode filtrar por mercado (opcional)
- Requer token configurado

**Validação atualizada:**
- Campo `timeframe` adicionado ao schema Zod
- Validação: deve ser 900 ou 1800
- Campo `waitTime` agora aceita 1-29 minutos (antes era 1-14)

---

## 🎨 Frontend

### 1. Constantes (`client/src/const.ts`)

**Símbolos Forex adicionados:**
```typescript
// Forex - Pares Principais
{ value: "frxEURUSD", label: "EUR/USD" },
{ value: "frxGBPUSD", label: "GBP/USD" },
{ value: "frxUSDJPY", label: "USD/JPY" },
{ value: "frxAUDUSD", label: "AUD/USD" },
{ value: "frxUSDCAD", label: "USD/CAD" },
{ value: "frxUSDCHF", label: "USD/CHF" },
{ value: "frxNZDUSD", label: "NZD/USD" },

// Forex - Pares Menores
{ value: "frxEURGBP", label: "EUR/GBP" },
{ value: "frxEURJPY", label: "EUR/JPY" },
{ value: "frxEURAUD", label: "EUR/AUD" },
{ value: "frxGBPJPY", label: "GBP/JPY" },
{ value: "frxAUDJPY", label: "AUD/JPY" },
```

### 2. Configurações (`client/src/pages/Settings.tsx`)

**Novo campo adicionado:**
- **Timeframe Selector**
  - Opções: M15 (15 minutos) ou M30 (30 minutos)
  - Valor padrão: M15 (900 segundos)
  - Localização: Abaixo do campo "Tempo de Espera"

**Atualizações:**
- Label do campo de símbolo alterado para "Ativo (Sintético ou Forex)"
- Validação de `waitTime` expandida para 1-29 minutos
- Descrição do `waitTime` atualizada para mencionar M15 e M30

---

## 📋 Compatibilidade

### ✅ Mantido
- Todas as funcionalidades existentes continuam funcionando
- Configurações antigas são compatíveis (timeframe padrão M15)
- Símbolos sintéticos continuam disponíveis
- Algoritmo de predição não foi alterado
- IA Hedge continua funcionando normalmente

### 🔄 Migração Automática
- Usuários existentes receberão automaticamente `timeframe = 900` (M15)
- Nenhuma ação manual necessária para continuar usando a plataforma

---

## 🚀 Como Usar

### 1. Aplicar Migration
```bash
cd /home/ubuntu/schimidt-trader-system-pro
pnpm db:push
```

### 2. Reiniciar Servidor
```bash
pnpm dev
```

### 3. Configurar no Frontend
1. Acesse **Configurações**
2. No campo **"Ativo (Sintético ou Forex)"**, selecione um par Forex (ex: EUR/USD)
3. No campo **"Timeframe"**, escolha M15 ou M30
4. Ajuste o **"Tempo de Espera"** conforme necessário:
   - Para M15: recomendado 8 minutos
   - Para M30: recomendado 16 minutos
5. Clique em **"Salvar Configurações"**

---

## 🧪 Testes Recomendados

### Teste 1: Timeframe M30 com Sintético
- Símbolo: R_100
- Timeframe: M30
- Verificar: Candles de 30 minutos sendo processados corretamente

### Teste 2: Forex com M15
- Símbolo: frxEURUSD
- Timeframe: M15
- Verificar: Trading funcionando com par Forex

### Teste 3: Forex com M30
- Símbolo: frxGBPUSD
- Timeframe: M30
- Verificar: Combinação Forex + M30 funcionando

---

## 📝 Notas Técnicas

### API DERIV - Granularidades Disponíveis
- 60: 1 minuto (M1)
- 120: 2 minutos (M2)
- 180: 3 minutos (M3)
- 300: 5 minutos (M5)
- 600: 10 minutos (M10)
- **900: 15 minutos (M15)** ✅ Implementado
- **1800: 30 minutos (M30)** ✅ Implementado
- 3600: 1 hora (H1)
- 7200: 2 horas (H2)
- 14400: 4 horas (H4)
- 28800: 8 horas (H8)
- 86400: 1 dia (D1)

### Símbolos Forex na DERIV
- Prefixo: `frx` (ex: frxEURUSD)
- Market: `forex`
- Submarket: `major_pairs`, `minor_pairs`, etc.
- Pip size: Varia por par (geralmente 0.0001 para pares principais)

---

## 🔍 Arquivos Modificados

### Backend
- `drizzle/schema.ts`
- `drizzle/migrations/0005_add_timeframe_to_config.sql`
- `server/deriv/derivService.ts`
- `server/deriv/tradingBot.ts`
- `server/routers.ts`

### Frontend
- `client/src/const.ts`
- `client/src/pages/Settings.tsx`

### Documentação
- `CHANGELOG_FOREX_M30.md` (este arquivo)
- `deriv_api_research.md` (pesquisa sobre API DERIV)

---

## ⚠️ Avisos Importantes

1. **Teste em modo DEMO primeiro** antes de usar em modo REAL
2. **Ajuste o tempo de espera** de acordo com o timeframe escolhido
3. **Verifique a liquidez** dos pares Forex antes de operar
4. **Monitore os logs** para garantir que os candles estão sendo processados corretamente
5. **Faça backup** do banco de dados antes de aplicar a migration

---

## 📞 Suporte

Para questões ou problemas relacionados a esta atualização, consulte:
- Documentação da API DERIV: https://developers.deriv.com
- Arquivo de análise: `ANALISE_PLATAFORMA.md`
- Pesquisa sobre API: `deriv_api_research.md`
