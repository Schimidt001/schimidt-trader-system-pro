# Guia de Integração do Filtro de Horário

**Versão**: 1.0.0  
**Data**: 05 de Novembro de 2025  
**Autor**: Manus AI

---

## 📋 Índice

1. [Introdução](#introdução)
2. [Pré-requisitos](#pré-requisitos)
3. [Instalação](#instalação)
4. [Integração Básica](#integração-básica)
5. [Integração Avançada](#integração-avançada)
6. [Exemplos Completos](#exemplos-completos)
7. [Troubleshooting](#troubleshooting)

---

## 🎯 Introdução

Este guia mostra como integrar o **Filtro de Horário** em qualquer projeto TypeScript/JavaScript, seja um bot de trading, scheduler de tarefas, API com rate limiting, ou qualquer aplicação que precise filtrar operações por horário.

---

## ✅ Pré-requisitos

### Obrigatório
- Node.js 16+ ou TypeScript 4.5+
- Conhecimento básico de TypeScript/JavaScript

### Opcional (para componente React)
- React 18+
- @radix-ui/react-switch
- @radix-ui/react-select

---

## 📦 Instalação

### Passo 1: Copiar Módulo

```bash
# Clonar repositório
git clone https://github.com/Schimidt001/schimidt-trader-system-pro.git
cd schimidt-trader-system-pro

# Fazer checkout do branch isolado
git checkout feature/filtro-horario-isolado

# Copiar módulo para seu projeto
cp -r filtro-horario/ /caminho/para/seu-projeto/src/
```

### Passo 2: Instalar Dependências

```bash
cd /caminho/para/seu-projeto
npm install typescript
```

**Opcional** (se usar componente React):
```bash
npm install react @radix-ui/react-switch @radix-ui/react-select
```

---

## 🚀 Integração Básica

### 1. Importar Módulo

```typescript
import { HourlyFilter } from './filtro-horario/hourlyFilterLogic';
import type { HourlyFilterConfig } from './filtro-horario/types';
```

### 2. Criar Instância

```typescript
const filter = new HourlyFilter({
  enabled: true,
  mode: 'COMBINED',
  customHours: [5, 6, 12, 16, 17, 18, 20, 21, 22, 23],
  goldModeHours: [16, 18],
  goldModeStakeMultiplier: 200,
});
```

### 3. Usar no Código

```typescript
// Verificar se pode operar
if (filter.isAllowedHour()) {
  // Operar
  const stake = filter.getAdjustedStake(baseStake);
  await openPosition(stake);
} else {
  // Aguardar
  const nextHour = filter.getNextAllowedHour();
  console.log(`Aguardando ${nextHour}h UTC`);
}
```

---

## 🔧 Integração Avançada

### Integração em Bot de Trading

#### Passo 1: Adicionar ao Construtor

```typescript
import { HourlyFilter } from './filtro-horario/hourlyFilterLogic';
import type { HourlyFilterConfig } from './filtro-horario/types';

class TradingBot {
  private filter: HourlyFilter;
  private state: 'IDLE' | 'COLLECTING' | 'WAITING_NEXT_HOUR' | 'ENTERED';

  constructor(config: BotConfig) {
    // Inicializar filtro
    this.filter = new HourlyFilter(config.hourlyFilter);
    this.state = 'IDLE';
  }
}
```

#### Passo 2: Verificar no Loop Principal

```typescript
async onTick(tick: Tick) {
  // PRIMEIRO: Verificar se horário está permitido
  if (this.filter.shouldWaitNextHour()) {
    if (this.state !== 'WAITING_NEXT_HOUR') {
      // Fechar posição se estiver aberta
      if (this.state === 'ENTERED') {
        await this.closePosition('Horário não permitido');
      }
      
      // Mudar estado
      this.state = 'WAITING_NEXT_HOUR';
      console.log(this.filter.getStatusMessage());
    }
    return; // Não processar tick
  }

  // SEGUNDO: Se estava aguardando e horário se tornou permitido
  if (this.state === 'WAITING_NEXT_HOUR') {
    this.state = 'COLLECTING';
    console.log('Horário permitido, retomando operação');
  }

  // TERCEIRO: Processar tick normalmente
  await this.processTick(tick);
}
```

#### Passo 3: Ajustar Stake ao Abrir Posição

```typescript
async openPosition(direction: 'CALL' | 'PUT') {
  // Ajustar stake baseado no horário
  const baseStake = this.config.stake;
  const adjustedStake = this.filter.getAdjustedStake(baseStake);

  // Log se for horário GOLD
  if (this.filter.isGoldHour()) {
    console.log(`⭐ Horário GOLD! Stake: ${adjustedStake} (${this.filter.getConfig().goldModeStakeMultiplier / 100}x)`);
  }

  // Abrir posição
  await this.api.openPosition({
    direction,
    stake: adjustedStake,
    duration: 15,
  });
}
```

#### Passo 4: Adicionar ao Status

```typescript
getStatus() {
  const hourlyStatus = this.filter.getStatus();
  
  return {
    state: this.state,
    hourly: {
      enabled: this.filter.getConfig().enabled,
      currentHour: hourlyStatus.currentHour,
      isAllowed: hourlyStatus.isAllowed,
      isGold: hourlyStatus.isGold,
      nextAllowedHour: hourlyStatus.nextAllowedHour,
      message: this.filter.getStatusMessage(),
    },
  };
}
```

### Integração em API (Rate Limiting)

```typescript
import express from 'express';
import { HourlyFilter } from './filtro-horario/hourlyFilterLogic';

const app = express();

// Criar filtro para rate limiting
const rateLimiter = new HourlyFilter({
  enabled: true,
  mode: 'CUSTOM',
  customHours: [0, 1, 2, 3, 4, 5], // Horários de baixo tráfego
  goldModeHours: [2, 3], // Horários com limite maior
  goldModeStakeMultiplier: 300, // 3x mais requisições
});

// Middleware
app.use((req, res, next) => {
  // Verificar se horário está permitido
  if (!rateLimiter.isAllowedHour()) {
    return res.status(429).json({
      error: 'Service temporarily unavailable',
      message: rateLimiter.getStatusMessage(),
      nextAvailableHour: rateLimiter.getNextAllowedHour(),
    });
  }

  // Ajustar limite baseado no horário
  const baseLimit = 100; // 100 req/h
  const adjustedLimit = rateLimiter.getAdjustedStake(baseLimit);
  
  req.rateLimit = adjustedLimit;
  next();
});
```

### Integração em Scheduler

```typescript
import { HourlyFilter } from './filtro-horario/hourlyFilterLogic';

class TaskScheduler {
  private filter: HourlyFilter;
  private tasks: Task[] = [];

  constructor() {
    this.filter = new HourlyFilter({
      enabled: true,
      mode: 'CUSTOM',
      customHours: [9, 10, 11, 14, 15, 16], // Horário comercial
      goldModeHours: [10, 15], // Horários prioritários
      goldModeStakeMultiplier: 200, // 2x mais tarefas
    });

    // Verificar a cada minuto
    setInterval(() => this.checkAndRun(), 60000);
  }

  private async checkAndRun() {
    if (!this.filter.isAllowedHour()) {
      console.log(this.filter.getStatusMessage());
      return;
    }

    // Ajustar número de tarefas baseado no horário
    const baseTasks = 10;
    const maxTasks = this.filter.getAdjustedStake(baseTasks);

    // Executar tarefas
    const tasksToRun = this.tasks.slice(0, maxTasks);
    await Promise.all(tasksToRun.map(task => task.run()));
  }
}
```

---

## 📊 Exemplos Completos

### Exemplo 1: Bot de Trading Completo

```typescript
import { HourlyFilter } from './filtro-horario/hourlyFilterLogic';
import type { HourlyFilterConfig } from './filtro-horario/types';

interface BotConfig {
  stake: number;
  hourlyFilter: HourlyFilterConfig;
}

type BotState = 'IDLE' | 'COLLECTING' | 'ANALYZING' | 'WAITING_NEXT_HOUR' | 'ENTERED';

class TradingBot {
  private filter: HourlyFilter;
  private state: BotState = 'IDLE';
  private config: BotConfig;

  constructor(config: BotConfig) {
    this.config = config;
    this.filter = new HourlyFilter(config.hourlyFilter);
  }

  async start() {
    console.log('Bot iniciado');
    
    // Verificar se horário está permitido
    if (!this.filter.isAllowedHour()) {
      this.state = 'WAITING_NEXT_HOUR';
      console.log(this.filter.getStatusMessage());
    } else {
      this.state = 'COLLECTING';
      console.log('Horário permitido, iniciando coleta');
    }

    // Conectar ao stream de ticks
    this.connectToStream();
  }

  async onTick(tick: Tick) {
    // Verificar horário
    if (this.filter.shouldWaitNextHour()) {
      if (this.state !== 'WAITING_NEXT_HOUR') {
        if (this.state === 'ENTERED') {
          await this.closePosition('Horário não permitido');
        }
        this.state = 'WAITING_NEXT_HOUR';
        console.log(this.filter.getStatusMessage());
      }
      return;
    }

    // Retomar se estava aguardando
    if (this.state === 'WAITING_NEXT_HOUR') {
      this.state = 'COLLECTING';
      console.log('Horário permitido, retomando operação');
    }

    // Processar tick
    await this.processTick(tick);
  }

  async openPosition(direction: 'CALL' | 'PUT') {
    const baseStake = this.config.stake;
    const adjustedStake = this.filter.getAdjustedStake(baseStake);

    if (this.filter.isGoldHour()) {
      console.log(`⭐ GOLD! Stake: ${adjustedStake}`);
    }

    // Abrir posição
    await this.api.openPosition({
      direction,
      stake: adjustedStake,
      duration: 15,
    });

    this.state = 'ENTERED';
  }

  getStatus() {
    return {
      state: this.state,
      hourly: this.filter.getStatus(),
      message: this.filter.getStatusMessage(),
    };
  }
}

// Uso
const bot = new TradingBot({
  stake: 1000,
  hourlyFilter: {
    enabled: true,
    mode: 'COMBINED',
    customHours: [5, 6, 12, 16, 17, 18, 20, 21, 22, 23],
    goldModeHours: [16, 18],
    goldModeStakeMultiplier: 200,
  },
});

bot.start();
```

### Exemplo 2: Persistência com Banco de Dados

```typescript
import { HourlyFilter } from './filtro-horario/hourlyFilterLogic';
import { Database } from './database';

class BotWithPersistence {
  private filter: HourlyFilter;
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async loadConfig() {
    // Carregar do banco
    const config = await this.db.query(
      'SELECT hourlyFilterEnabled, hourlyFilterMode, customHours, goldModeHours, goldModeStakeMultiplier FROM config WHERE userId = ?',
      [this.userId]
    );

    // Criar filtro
    this.filter = new HourlyFilter({
      enabled: config.hourlyFilterEnabled,
      mode: config.hourlyFilterMode,
      customHours: JSON.parse(config.customHours),
      goldModeHours: JSON.parse(config.goldModeHours),
      goldModeStakeMultiplier: config.goldModeStakeMultiplier,
    });
  }

  async saveConfig() {
    const config = this.filter.getConfig();

    await this.db.query(
      'UPDATE config SET hourlyFilterEnabled = ?, hourlyFilterMode = ?, customHours = ?, goldModeHours = ?, goldModeStakeMultiplier = ? WHERE userId = ?',
      [
        config.enabled,
        config.mode,
        JSON.stringify(config.customHours),
        JSON.stringify(config.goldModeHours),
        config.goldModeStakeMultiplier,
        this.userId,
      ]
    );
  }
}
```

### Exemplo 3: Integração com React

```tsx
import React, { useState, useEffect } from 'react';
import { HourlyFilter } from './filtro-horario/hourlyFilterLogic';
import type { HourlyFilterConfig } from './filtro-horario/types';

function BotDashboard() {
  const [filter, setFilter] = useState<HourlyFilter | null>(null);
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    // Criar filtro
    const newFilter = new HourlyFilter({
      enabled: true,
      mode: 'COMBINED',
      customHours: [5, 6, 12, 16, 17, 18, 20, 21, 22, 23],
      goldModeHours: [16, 18],
      goldModeStakeMultiplier: 200,
    });

    setFilter(newFilter);

    // Atualizar status a cada minuto
    const interval = setInterval(() => {
      setStatus(newFilter.getStatusMessage());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  if (!filter) return <div>Carregando...</div>;

  const hourlyStatus = filter.getStatus();

  return (
    <div>
      <h2>Status do Filtro de Horário</h2>
      <p>{status}</p>
      
      <div>
        <strong>Horário Atual:</strong> {hourlyStatus.currentHour}h UTC
      </div>
      
      {hourlyStatus.isAllowed ? (
        <div style={{ color: 'green' }}>
          ✅ Operando {hourlyStatus.isGold && '⭐ GOLD'}
        </div>
      ) : (
        <div style={{ color: 'orange' }}>
          ⏳ Aguardando próximo horário: {hourlyStatus.nextAllowedHour}h UTC
        </div>
      )}

      <div>
        <strong>Horários Permitidos:</strong> {HourlyFilter.formatHours(hourlyStatus.allowedHours)}
      </div>

      {hourlyStatus.goldModeHours.length > 0 && (
        <div>
          <strong>Horários GOLD:</strong> {HourlyFilter.formatHours(hourlyStatus.goldModeHours)}
        </div>
      )}
    </div>
  );
}
```

---

## 🐛 Troubleshooting

### Problema 1: Horário não está sendo respeitado

**Sintoma**: Bot continua operando fora dos horários configurados

**Solução**:
1. Verificar se `enabled: true`
2. Verificar se `customHours` não está vazio
3. Verificar se está usando UTC (não horário local)

```typescript
// Verificar configuração
console.log('Config:', filter.getConfig());
console.log('Status:', filter.getStatus());
```

### Problema 2: Stake não está sendo multiplicado em horário GOLD

**Sintoma**: Stake permanece o mesmo em horários GOLD

**Solução**:
1. Verificar se horário está em `goldModeHours`
2. Verificar se `goldModeStakeMultiplier` está correto
3. Usar `getAdjustedStake()` ao invés de usar stake diretamente

```typescript
// Correto
const stake = filter.getAdjustedStake(baseStake);

// Errado
const stake = baseStake; // Não aplica multiplicador
```

### Problema 3: Próximo horário sempre retorna null

**Sintoma**: `getNextAllowedHour()` retorna `null`

**Solução**:
1. Verificar se `enabled: true`
2. Verificar se `customHours` não está vazio

```typescript
if (filter.getConfig().customHours.length === 0) {
  console.error('Nenhum horário configurado!');
}
```

### Problema 4: Erro ao parsear JSON

**Sintoma**: `JSON.parse()` lança erro

**Solução**:
1. Verificar se string JSON está válida
2. Usar try...catch ao carregar do banco

```typescript
try {
  const filter = HourlyFilter.fromJSON(jsonString);
} catch (error) {
  console.error('Erro ao carregar configuração:', error);
  // Usar configuração padrão
  const filter = new HourlyFilter();
}
```

---

## ✅ Checklist de Integração

- [ ] Módulo copiado para o projeto
- [ ] Dependências instaladas
- [ ] Importações corretas
- [ ] Instância criada com configuração válida
- [ ] Verificação de horário implementada no loop principal
- [ ] Ajuste de stake implementado
- [ ] Estado de espera implementado (opcional)
- [ ] Persistência implementada (opcional)
- [ ] Testes realizados
- [ ] Documentação atualizada

---

## 📚 Recursos Adicionais

- `filtro-horario/README.md` - Documentação completa da API
- `filtro-horario/types.ts` - Tipos TypeScript
- `filtro-horario/hourlyFilterLogic.ts` - Código fonte
- `ANALISE_FILTRO_HORARIO.md` - Análise técnica
- `FILTRO_HORARIO_ISOLADO.md` - Documentação do branch

---

## 🤝 Suporte

Para dúvidas ou problemas:

1. Consulte a documentação completa
2. Verifique os exemplos
3. Abra uma issue no GitHub

---

**Desenvolvido por**: Manus AI  
**Versão**: 1.0.0  
**Data**: 05 de Novembro de 2025
