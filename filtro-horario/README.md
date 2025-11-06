# Filtro de Horário - Módulo Isolado

**Versão**: 1.0.0  
**Autor**: Manus AI  
**Data**: 05 de Novembro de 2025

---

## 📋 Descrição

Módulo isolado e reutilizável para filtrar operações por horário (UTC). Permite configurar horários permitidos, horários GOLD com stake multiplicado, e gerenciar o estado de espera.

---

## 🚀 Instalação

### Copiar Módulo

```bash
cp -r filtro-horario/ seu-projeto/src/
```

### Dependências

```bash
npm install typescript
```

**Opcional** (se usar componente React):
```bash
npm install react @radix-ui/react-switch @radix-ui/react-select
```

---

## 📖 Uso Básico

### 1. Importar

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
  goldModeStakeMultiplier: 200, // 2x
});
```

### 3. Verificar Horário

```typescript
if (filter.isAllowedHour()) {
  console.log('Horário permitido, pode operar!');
} else {
  const nextHour = filter.getNextAllowedHour();
  console.log(`Aguardando próximo horário: ${nextHour}h UTC`);
}
```

### 4. Ajustar Stake

```typescript
const baseStake = 1000;
const adjustedStake = filter.getAdjustedStake(baseStake);

console.log(`Stake base: ${baseStake}`);
console.log(`Stake ajustado: ${adjustedStake}`);
// Se horário GOLD: 2000 (2x)
// Se horário normal: 1000 (1x)
```

---

## 📚 API Completa

### Classe `HourlyFilter`

#### Constructor

```typescript
constructor(config?: Partial<HourlyFilterConfig>)
```

Cria uma nova instância do filtro.

**Parâmetros**:
- `config` (opcional): Configuração parcial do filtro

**Exemplo**:
```typescript
const filter = new HourlyFilter({
  enabled: true,
  mode: 'IDEAL',
});
```

#### Métodos

##### `isAllowedHour(date?: Date): boolean`

Verifica se o horário está permitido.

**Parâmetros**:
- `date` (opcional): Data para verificar (padrão: agora)

**Retorna**: `true` se permitido, `false` caso contrário

**Exemplo**:
```typescript
if (filter.isAllowedHour()) {
  // Operar
}
```

##### `isGoldHour(date?: Date): boolean`

Verifica se o horário é GOLD.

**Parâmetros**:
- `date` (opcional): Data para verificar (padrão: agora)

**Retorna**: `true` se GOLD, `false` caso contrário

**Exemplo**:
```typescript
if (filter.isGoldHour()) {
  console.log('Horário GOLD! Stake multiplicado.');
}
```

##### `getNextAllowedHour(date?: Date): number | null`

Obtém o próximo horário permitido.

**Parâmetros**:
- `date` (opcional): Data de referência (padrão: agora)

**Retorna**: Próximo horário (0-23) ou `null`

**Exemplo**:
```typescript
const nextHour = filter.getNextAllowedHour();
console.log(`Próximo horário: ${nextHour}h UTC`);
```

##### `getHourlyInfo(date?: Date): HourlyInfo`

Obtém informações completas sobre o horário.

**Parâmetros**:
- `date` (opcional): Data para verificar (padrão: agora)

**Retorna**: Objeto `HourlyInfo`

**Exemplo**:
```typescript
const info = filter.getHourlyInfo();
console.log(`Hora atual: ${info.currentHour}h UTC`);
console.log(`Permitido: ${info.isAllowed}`);
console.log(`GOLD: ${info.isGold}`);
console.log(`Próximo: ${info.nextAllowedHour}h UTC`);
```

##### `getStatus(date?: Date): HourlyFilterStatus`

Obtém status completo do filtro.

**Parâmetros**:
- `date` (opcional): Data para verificar (padrão: agora)

**Retorna**: Objeto `HourlyFilterStatus`

**Exemplo**:
```typescript
const status = filter.getStatus();
console.log('Horários permitidos:', status.allowedHours);
console.log('Horários GOLD:', status.goldModeHours);
```

##### `getAdjustedStake(baseStake: number, date?: Date): number`

Ajusta o stake baseado no horário.

**Parâmetros**:
- `baseStake`: Stake base
- `date` (opcional): Data para verificar (padrão: agora)

**Retorna**: Stake ajustado

**Exemplo**:
```typescript
const stake = filter.getAdjustedStake(1000);
// Retorna 2000 se horário GOLD (2x)
// Retorna 1000 se horário normal
```

##### `shouldWaitNextHour(date?: Date): boolean`

Verifica se deve aguardar próximo horário.

**Parâmetros**:
- `date` (opcional): Data para verificar (padrão: agora)

**Retorna**: `true` se deve aguardar, `false` se pode operar

**Exemplo**:
```typescript
if (filter.shouldWaitNextHour()) {
  console.log('Aguardando próximo horário...');
  return;
}
```

##### `getStatusMessage(date?: Date): string`

Obtém mensagem de status para exibição.

**Parâmetros**:
- `date` (opcional): Data para verificar (padrão: agora)

**Retorna**: Mensagem de status

**Exemplo**:
```typescript
const message = filter.getStatusMessage();
console.log(message);
// "Horário 16h UTC permitido ⭐ GOLD (stake 2.0x)"
// ou "Aguardando próximo horário: 18h UTC"
```

##### `updateConfig(config: Partial<HourlyFilterConfig>): void`

Atualiza a configuração do filtro.

**Parâmetros**:
- `config`: Configuração parcial

**Exemplo**:
```typescript
filter.updateConfig({
  goldModeHours: [20, 22],
  goldModeStakeMultiplier: 300, // 3x
});
```

##### `getConfig(): Readonly<HourlyFilterConfig>`

Obtém a configuração atual.

**Retorna**: Configuração (somente leitura)

**Exemplo**:
```typescript
const config = filter.getConfig();
console.log('Modo:', config.mode);
console.log('Horários:', config.customHours);
```

##### `toJSON(): string`

Converte a configuração para JSON.

**Retorna**: String JSON

**Exemplo**:
```typescript
const json = filter.toJSON();
localStorage.setItem('hourlyFilter', json);
```

#### Métodos Estáticos

##### `HourlyFilter.getHoursForMode(mode, customHours?): number[]`

Obtém horários para um modo específico.

**Parâmetros**:
- `mode`: Modo do filtro
- `customHours` (opcional): Horários personalizados (para modo CUSTOM)

**Retorna**: Array de horários

**Exemplo**:
```typescript
const hours = HourlyFilter.getHoursForMode('IDEAL');
console.log(hours); // [16, 18]
```

##### `HourlyFilter.formatHours(hours): string`

Formata lista de horários para exibição.

**Parâmetros**:
- `hours`: Array de horários

**Retorna**: String formatada

**Exemplo**:
```typescript
const formatted = HourlyFilter.formatHours([16, 18, 20]);
console.log(formatted); // "16h, 18h, 20h"
```

##### `HourlyFilter.fromJSON(json): HourlyFilter`

Cria instância a partir de JSON.

**Parâmetros**:
- `json`: String JSON

**Retorna**: Nova instância

**Exemplo**:
```typescript
const json = localStorage.getItem('hourlyFilter');
const filter = HourlyFilter.fromJSON(json);
```

---

## 🎯 Exemplos Práticos

### Exemplo 1: Bot de Trading

```typescript
import { HourlyFilter } from './filtro-horario/hourlyFilterLogic';

class TradingBot {
  private filter: HourlyFilter;
  private baseStake = 1000;

  constructor() {
    this.filter = new HourlyFilter({
      enabled: true,
      mode: 'COMBINED',
      customHours: [5, 6, 12, 16, 17, 18, 20, 21, 22, 23],
      goldModeHours: [16, 18],
      goldModeStakeMultiplier: 200,
    });
  }

  async onTick(tick: Tick) {
    // Verificar se horário está permitido
    if (this.filter.shouldWaitNextHour()) {
      const nextHour = this.filter.getNextAllowedHour();
      console.log(`Aguardando próximo horário: ${nextHour}h UTC`);
      return;
    }

    // Ajustar stake se for horário GOLD
    const stake = this.filter.getAdjustedStake(this.baseStake);
    
    // Operar normalmente
    await this.openPosition(stake);
  }
}
```

### Exemplo 2: Scheduler de Tarefas

```typescript
import { HourlyFilter } from './filtro-horario/hourlyFilterLogic';

const scheduler = new HourlyFilter({
  enabled: true,
  mode: 'CUSTOM',
  customHours: [9, 10, 11, 14, 15, 16], // Horário comercial
  goldModeHours: [],
  goldModeStakeMultiplier: 100,
});

setInterval(() => {
  if (scheduler.isAllowedHour()) {
    executarTarefa();
  } else {
    console.log(scheduler.getStatusMessage());
  }
}, 60000); // Verificar a cada minuto
```

### Exemplo 3: API Rate Limiting

```typescript
import { HourlyFilter } from './filtro-horario/hourlyFilterLogic';
import express from 'express';

const app = express();

const rateLimiter = new HourlyFilter({
  enabled: true,
  mode: 'CUSTOM',
  customHours: [0, 1, 2, 3, 4, 5], // Horários de baixo tráfego
  goldModeHours: [2, 3], // Horários com limite maior
  goldModeStakeMultiplier: 300, // 3x mais requisições
});

app.use((req, res, next) => {
  if (!rateLimiter.isAllowedHour()) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: rateLimiter.getStatusMessage(),
      nextAllowedHour: rateLimiter.getNextAllowedHour(),
    });
  }

  const limit = rateLimiter.getAdjustedStake(100); // 100 req/h base
  req.rateLimit = limit;
  next();
});
```

### Exemplo 4: Persistência com LocalStorage

```typescript
import { HourlyFilter } from './filtro-horario/hourlyFilterLogic';

// Salvar configuração
const filter = new HourlyFilter({
  enabled: true,
  mode: 'IDEAL',
  customHours: [16, 18],
  goldModeHours: [16],
  goldModeStakeMultiplier: 200,
});

localStorage.setItem('hourlyFilter', filter.toJSON());

// Carregar configuração
const json = localStorage.getItem('hourlyFilter');
if (json) {
  const loadedFilter = HourlyFilter.fromJSON(json);
  console.log('Configuração carregada:', loadedFilter.getConfig());
}
```

---

## 🧪 Testes

### Teste com Jest

```typescript
import { HourlyFilter } from './filtro-horario/hourlyFilterLogic';

describe('HourlyFilter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('deve permitir horário configurado', () => {
    const filter = new HourlyFilter({
      enabled: true,
      mode: 'IDEAL',
      customHours: [16, 18],
      goldModeHours: [],
      goldModeStakeMultiplier: 100,
    });

    // Simular horário 16h UTC
    const mockDate = new Date('2025-11-05T16:00:00Z');
    jest.setSystemTime(mockDate);

    expect(filter.isAllowedHour()).toBe(true);
  });

  test('deve bloquear horário não configurado', () => {
    const filter = new HourlyFilter({
      enabled: true,
      mode: 'IDEAL',
      customHours: [16, 18],
      goldModeHours: [],
      goldModeStakeMultiplier: 100,
    });

    // Simular horário 15h UTC (não permitido)
    const mockDate = new Date('2025-11-05T15:00:00Z');
    jest.setSystemTime(mockDate);

    expect(filter.isAllowedHour()).toBe(false);
  });

  test('deve ajustar stake em horário GOLD', () => {
    const filter = new HourlyFilter({
      enabled: true,
      mode: 'COMBINED',
      customHours: [16, 18],
      goldModeHours: [16],
      goldModeStakeMultiplier: 200, // 2x
    });

    // Simular horário 16h UTC (GOLD)
    const mockDate = new Date('2025-11-05T16:00:00Z');
    jest.setSystemTime(mockDate);

    expect(filter.getAdjustedStake(1000)).toBe(2000);
  });

  test('deve retornar próximo horário permitido', () => {
    const filter = new HourlyFilter({
      enabled: true,
      mode: 'IDEAL',
      customHours: [16, 18],
      goldModeHours: [],
      goldModeStakeMultiplier: 100,
    });

    // Simular horário 15h UTC
    const mockDate = new Date('2025-11-05T15:00:00Z');
    jest.setSystemTime(mockDate);

    expect(filter.getNextAllowedHour()).toBe(16);
  });
});
```

---

## 📊 Tipos TypeScript

Veja `types.ts` para todos os tipos disponíveis:

- `HourlyFilterMode`
- `HourlyFilterConfig`
- `HourlyFilterStatus`
- `HourlyInfo`
- `HOURLY_FILTER_PRESETS`
- `DEFAULT_HOURLY_FILTER_CONFIG`

---

## 🎨 Componente React (Opcional)

Se você quiser usar o componente React completo com UI, veja:

- `HourlyFilterComponent.tsx` (componente isolado)
- Requer: `@radix-ui/react-switch`, `@radix-ui/react-select`

---

## 📄 Licença

Mesmo que o projeto principal.

---

## 🤝 Contribuindo

1. Faça um fork
2. Crie uma branch (`git checkout -b feature/melhoria`)
3. Commit suas mudanças (`git commit -am 'Adiciona melhoria'`)
4. Push para a branch (`git push origin feature/melhoria`)
5. Abra um Pull Request

---

## 📞 Suporte

Para dúvidas ou problemas, consulte:

- `ANALISE_FILTRO_HORARIO.md` - Análise técnica completa
- `FILTRO_HORARIO_ISOLADO.md` - Documentação do branch
- `GUIA_INTEGRACAO_FILTRO.md` - Guia de integração

---

**Desenvolvido por**: Manus AI  
**Versão**: 1.0.0  
**Data**: 05 de Novembro de 2025
