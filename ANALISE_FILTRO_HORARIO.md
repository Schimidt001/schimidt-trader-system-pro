# Análise do Filtro de Horário

**Branch**: `backup-filtro-horarios-2025-11-03`  
**Data da Análise**: 05 de Novembro de 2025

---

## 📋 Resumo

O filtro de horário é uma funcionalidade completa que permite ao bot operar apenas em horários específicos (UTC), com suporte a:

1. **5 modos predefinidos** (IDEAL, COMPATIBLE, GOLDEN, COMBINED, CUSTOM)
2. **Modo GOLD** (até 2 horários com stake multiplicado)
3. **Estado WAITING_NEXT_HOUR** (bot aguarda próximo horário permitido)
4. **Integração completa** frontend + backend + bot

---

## 🏗️ Arquitetura do Filtro

### Frontend (Settings.tsx)

**Linhas 701-914**: Card completo "Filtro de Horário"

**Estados**:
```typescript
const [hourlyFilterEnabled, setHourlyFilterEnabled] = useState(false);
const [hourlyFilterMode, setHourlyFilterMode] = useState("COMBINED");
const [customHours, setCustomHours] = useState<number[]>([]);
const [goldModeHours, setGoldModeHours] = useState<number[]>([]);
const [goldModeStakeMultiplier, setGoldModeStakeMultiplier] = useState("200");
```

**Componentes**:
1. Toggle on/off
2. Select com 5 modos
3. Grid 6x4 com 24 horas (0-23h UTC)
4. Seção GOLD com seleção de até 2 horários
5. Input para multiplicador de stake GOLD
6. Resumo da configuração

### Backend (routers.ts)

**Linhas 102-106**: Parâmetros aceitos na rota `config.update`

```typescript
hourlyFilterEnabled: z.boolean().optional(),
hourlyFilterMode: z.enum(["IDEAL", "COMPATIBLE", "GOLDEN", "COMBINED", "CUSTOM"]).optional(),
customHours: z.string().optional(), // JSON array
goldModeHours: z.string().optional(), // JSON array
goldModeStakeMultiplier: z.number().int().positive().optional(),
```

### Bot (tradingBot.ts)

**Linhas 84-88**: Propriedades privadas

```typescript
private hourlyFilterEnabled: boolean = false;
private hourlyFilterMode: "IDEAL" | "COMPATIBLE" | "GOLDEN" | "COMBINED" | "CUSTOM" = "COMBINED";
private allowedHours: number[] = [];
private goldModeHours: number[] = [];
private goldModeStakeMultiplier: number = 200; // 200 = 2x
```

**Métodos principais**:
- `getHoursForMode()` - Retorna horários baseado no modo
- `isAllowedHour()` - Verifica se horário atual está permitido
- `isGoldHour()` - Verifica se horário atual é GOLD
- `getHourlyInfo()` - Retorna info completa (hora atual, permitido, gold, próximo)
- `getAdjustedStake()` - Ajusta stake se for horário GOLD
- `getHourlyStatus()` - Retorna status para frontend

**Lógica de controle**:
1. No `start()`: Carrega configurações e verifica horário
2. No `onTick()`: 
   - Se `WAITING_NEXT_HOUR` e horário permitido → retoma operação
   - Se horário não permitido → entra em `WAITING_NEXT_HOUR`
3. No `openPosition()`: Aplica stake ajustado se GOLD

---

## 📊 Modos Predefinidos

| Modo | Horários UTC | Descrição |
|------|--------------|-----------|
| **IDEAL** | 16, 18 | 2 horários - Máxima qualidade |
| **COMPATIBLE** | 3, 6, 9, 10, 13, 16, 17, 18 | 8 horários - Padrão recuo + continuação |
| **GOLDEN** | 5, 12, 16, 18, 20, 21, 22, 23 | 8 horários - Candles mais limpos |
| **COMBINED** | 5, 6, 12, 16, 17, 18, 20, 21, 22, 23 | 10 horários - Balanceado (recomendado) |
| **CUSTOM** | Definido pelo usuário | Personalizado |

---

## ⭐ Modo GOLD

**Funcionalidade**: Permite selecionar até 2 horários especiais com stake multiplicado.

**Exemplo**:
- Horários permitidos: [5, 6, 12, 16, 17, 18, 20, 21, 22, 23]
- Horários GOLD: [16, 18]
- Multiplicador: 2x (200%)
- Stake base: $10
- Stake em horários normais: $10
- Stake em horários GOLD: $20

---

## 🔄 Fluxo de Dados

### Salvamento

```
Frontend (Settings.tsx)
    ↓ Usuário configura
    ↓ handleSave() serializa customHours e goldModeHours para JSON
Router (config.update)
    ↓ Valida e salva no banco
Banco de Dados
    ↓ Campos: hourlyFilterEnabled, hourlyFilterMode, customHours, goldModeHours, goldModeStakeMultiplier
```

### Carregamento no Bot

```
Bot.start()
    ↓ Carrega config do banco
    ↓ this.hourlyFilterEnabled = config.hourlyFilterEnabled
    ↓ this.hourlyFilterMode = config.hourlyFilterMode
    ↓ this.allowedHours = getHoursForMode(mode, config.customHours)
    ↓ this.goldModeHours = JSON.parse(config.goldModeHours)
    ↓ Verifica se horário atual está permitido
```

### Operação

```
Bot.onTick()
    ↓ hourlyInfo = getHourlyInfo()
    ↓ Se !hourlyInfo.isAllowed → WAITING_NEXT_HOUR
    ↓ Se WAITING_NEXT_HOUR e hourlyInfo.isAllowed → retoma
    ↓ Se operando normalmente → continua
```

```
Bot.openPosition()
    ↓ baseStake = config.stake
    ↓ finalStake = getAdjustedStake(baseStake)
    ↓ Se isGoldHour() → finalStake *= goldModeStakeMultiplier / 100
    ↓ Abre posição com finalStake
```

---

## 🎯 Estado WAITING_NEXT_HOUR

**Novo estado** adicionado ao bot para aguardar próximo horário permitido.

**Estados possíveis**:
- `IDLE`
- `COLLECTING`
- `ANALYZING`
- `WAITING`
- `ENTERED`
- `CLOSED`
- **`WAITING_NEXT_HOUR`** ← NOVO

**Comportamento**:
- Bot não coleta dados
- Bot não analisa
- Bot não abre posições
- Bot aguarda até próximo horário permitido
- Frontend exibe: "Aguardando próximo horário: 16h UTC ⭐"

---

## 📁 Arquivos Envolvidos

### Frontend
- `client/src/pages/Settings.tsx` (linhas 701-914)
- `client/src/pages/Dashboard.tsx` (linhas 168-173, 196-197)

### Backend
- `server/routers.ts` (linhas 102-106)
- `server/deriv/tradingBot.ts` (linhas 84-88, 144-160, 204-210, 334-360, 759-763, 1099-1221)

### Schema
- `drizzle/schema.ts` (campos: hourlyFilterEnabled, hourlyFilterMode, customHours, goldModeHours, goldModeStakeMultiplier)

---

## 🔍 Dependências

### Componentes UI
- `Switch` (toggle on/off)
- `Select`, `SelectTrigger`, `SelectContent`, `SelectItem` (dropdown de modos)
- `Label` (labels dos campos)
- `Input` (multiplicador GOLD)
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` (estrutura)

### Bibliotecas
- `react` (useState)
- `sonner` (toast)
- `date-fns` (não usado diretamente, mas Date nativo é usado)

### Backend
- `zod` (validação)
- `drizzle-orm` (banco de dados)

---

## ✅ Funcionalidades Completas

1. ✅ Toggle on/off do filtro
2. ✅ 5 modos predefinidos + CUSTOM
3. ✅ Grid visual de 24 horas
4. ✅ Seleção de horários personalizados (modo CUSTOM)
5. ✅ Modo GOLD com até 2 horários
6. ✅ Multiplicador de stake configurável
7. ✅ Resumo da configuração
8. ✅ Salvamento no banco de dados
9. ✅ Carregamento no bot
10. ✅ Estado WAITING_NEXT_HOUR
11. ✅ Ajuste automático de stake em horários GOLD
12. ✅ Logs de eventos (HOURLY_FILTER_ENABLED, GOLD_MODE_CONFIGURED, etc.)
13. ✅ Exibição no Dashboard (próximo horário, horário GOLD)

---

## 🎨 Interface Visual

### Card "Filtro de Horário"

```
┌─────────────────────────────────────────────┐
│ Filtro de Horário                [  ON  ]   │
├─────────────────────────────────────────────┤
│                                             │
│ Modo do Filtro: [COMBINADO ⭐]              │
│                                             │
│ Horários Ativos - Modo COMBINED (UTC)      │
│ ┌──┬──┬──┬──┬──┬──┐                        │
│ │00│01│02│03│04│05│ ← 05 está verde       │
│ ├──┼──┼──┼──┼──┼──┤                        │
│ │06│07│08│09│10│11│ ← 06 está verde       │
│ ├──┼──┼──┼──┼──┼──┤                        │
│ │12│13│14│15│16│17│ ← 12,16,17 verdes     │
│ ├──┼──┼──┼──┼──┼──┤                        │
│ │18│19│20│21│22│23│ ← 18,20,21,22,23 verdes│
│ └──┴──┴──┴──┴──┴──┘                        │
│                                             │
│ ⭐ Modo GOLD (Opcional)                     │
│ Selecione até 2 horários especiais         │
│ ┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐           │
│ │05│06│12│16│17│18│20│21│22│23│           │
│ └──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘           │
│    ↑           ↑                            │
│   16h e 18h selecionados (amarelo + ⭐)     │
│                                             │
│ Multiplicador de Stake GOLD: [2.0] x       │
│ Nos horários GOLD (16h, 18h), stake será   │
│ multiplicado por 2.0x                       │
│                                             │
│ 📊 Resumo da Configuração:                  │
│ • Modo: COMBINED                            │
│ • Horários Ativos: 5h, 6h, 12h, 16h, ...   │
│ • Horários GOLD: 16h, 18h (Stake 2.0x)     │
│ ⚠️ O bot operará APENAS nos horários       │
│    selecionados                             │
└─────────────────────────────────────────────┘
```

---

## 🚀 Como Isolar

Para isolar o filtro de horário em um branch separado, preciso:

1. **Criar branch limpo** a partir do master atual (sem filtro)
2. **Copiar apenas os arquivos do filtro**:
   - Frontend: Seção do Settings.tsx (linhas 701-914)
   - Backend: Parâmetros no routers.ts (linhas 102-106)
   - Bot: Código do tradingBot.ts (linhas 84-88, 144-160, 204-210, 334-360, 759-763, 1099-1221)
   - Schema: Campos no drizzle/schema.ts
3. **Remover dependências** da plataforma principal
4. **Criar exemplo standalone** (opcional)
5. **Documentar uso** isolado

---

**Próximo passo**: Criar branch isolado `feature/filtro-horario-isolado`
