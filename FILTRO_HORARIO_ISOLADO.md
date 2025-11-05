# Filtro de Horário - Módulo Isolado

**Branch**: `feature/filtro-horario-isolado`  
**Data**: 05 de Novembro de 2025  
**Status**: ✅ ISOLADO E PRONTO PARA USO

---

## 📋 Descrição

Este branch contém **apenas o código do Filtro de Horário**, completamente isolado da plataforma principal. Pode ser usado como referência ou integrado em outros projetos.

---

## 🎯 Funcionalidades

### 1. Filtro de Horário com 5 Modos Predefinidos

- **IDEAL**: 2 horários (16h, 18h UTC) - Máxima qualidade
- **COMPATIBLE**: 8 horários - Padrão recuo + continuação
- **GOLDEN**: 8 horários - Candles mais limpos
- **COMBINED**: 10 horários - Balanceado (recomendado)
- **CUSTOM**: Personalizado pelo usuário

### 2. Modo GOLD

- Selecione até 2 horários especiais
- Stake multiplicado nesses horários
- Multiplicador configurável (ex: 2x, 3x)

### 3. Estado WAITING_NEXT_HOUR

- Bot aguarda próximo horário permitido
- Não opera fora dos horários configurados
- Exibe próximo horário no frontend

---

## 📁 Arquivos Neste Branch

### 1. Documentação

- `FILTRO_HORARIO_ISOLADO.md` (este arquivo)
- `ANALISE_FILTRO_HORARIO.md` (análise técnica completa)
- `GUIA_INTEGRACAO_FILTRO.md` (como integrar em outros projetos)

### 2. Código Isolado

- `filtro-horario/HourlyFilterComponent.tsx` (componente React isolado)
- `filtro-horario/hourlyFilterLogic.ts` (lógica isolada do filtro)
- `filtro-horario/types.ts` (tipos TypeScript)
- `filtro-horario/README.md` (instruções de uso)

---

## 🚀 Como Usar

### Opção 1: Copiar Componente React

```tsx
import { HourlyFilterComponent } from './filtro-horario/HourlyFilterComponent';

function Settings() {
  const [config, setConfig] = useState({
    hourlyFilterEnabled: false,
    hourlyFilterMode: 'COMBINED',
    customHours: [],
    goldModeHours: [],
    goldModeStakeMultiplier: 200,
  });

  return (
    <HourlyFilterComponent
      config={config}
      onChange={setConfig}
    />
  );
}
```

### Opção 2: Usar Lógica Isolada

```typescript
import { HourlyFilter } from './filtro-horario/hourlyFilterLogic';

const filter = new HourlyFilter({
  enabled: true,
  mode: 'COMBINED',
  customHours: [5, 6, 12, 16, 17, 18, 20, 21, 22, 23],
  goldModeHours: [16, 18],
  goldModeStakeMultiplier: 200,
});

// Verificar se horário está permitido
if (filter.isAllowedHour()) {
  // Operar
}

// Obter stake ajustado
const adjustedStake = filter.getAdjustedStake(baseStake);

// Obter próximo horário
const nextHour = filter.getNextAllowedHour();
```

---

## 📊 Estrutura de Dados

### Configuração

```typescript
interface HourlyFilterConfig {
  enabled: boolean;
  mode: 'IDEAL' | 'COMPATIBLE' | 'GOLDEN' | 'COMBINED' | 'CUSTOM';
  customHours: number[]; // 0-23
  goldModeHours: number[]; // 0-2 elementos
  goldModeStakeMultiplier: number; // 100 = 1x, 200 = 2x
}
```

### Status

```typescript
interface HourlyFilterStatus {
  currentHour: number;
  isAllowed: boolean;
  isGold: boolean;
  nextAllowedHour: number | null;
  allowedHours: number[];
  goldModeHours: number[];
}
```

---

## 🔧 Integração em Outros Projetos

### 1. Instalar Dependências

```bash
npm install react zod
```

### 2. Copiar Arquivos

```bash
cp -r filtro-horario/ seu-projeto/src/
```

### 3. Importar e Usar

```tsx
import { HourlyFilterComponent } from './filtro-horario/HourlyFilterComponent';
```

---

## 📝 Exemplos de Uso

### Exemplo 1: Bot de Trading

```typescript
import { HourlyFilter } from './filtro-horario/hourlyFilterLogic';

class TradingBot {
  private hourlyFilter: HourlyFilter;

  constructor(config: BotConfig) {
    this.hourlyFilter = new HourlyFilter(config.hourlyFilter);
  }

  async onTick(tick: Tick) {
    // Verificar se horário está permitido
    if (!this.hourlyFilter.isAllowedHour()) {
      console.log('Horário não permitido, aguardando...');
      return;
    }

    // Operar normalmente
    const stake = this.hourlyFilter.getAdjustedStake(this.baseStake);
    await this.openPosition(stake);
  }
}
```

### Exemplo 2: Scheduler de Tarefas

```typescript
import { HourlyFilter } from './filtro-horario/hourlyFilterLogic';

const filter = new HourlyFilter({
  enabled: true,
  mode: 'CUSTOM',
  customHours: [9, 10, 11, 14, 15, 16], // Horário comercial
  goldModeHours: [],
  goldModeStakeMultiplier: 100,
});

setInterval(() => {
  if (filter.isAllowedHour()) {
    executarTarefa();
  } else {
    console.log(`Aguardando próximo horário: ${filter.getNextAllowedHour()}h`);
  }
}, 60000); // Verificar a cada minuto
```

### Exemplo 3: API Rate Limiting

```typescript
import { HourlyFilter } from './filtro-horario/hourlyFilterLogic';

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
      nextAllowedHour: rateLimiter.getNextAllowedHour(),
    });
  }

  const limit = rateLimiter.getAdjustedStake(100); // 100 req/h base
  // Aplicar rate limiting com limite ajustado
  next();
});
```

---

## 🎨 Componente UI

O componente React inclui:

1. ✅ Toggle on/off
2. ✅ Select com 5 modos
3. ✅ Grid visual 6x4 (24 horas)
4. ✅ Seleção de horários GOLD
5. ✅ Input para multiplicador
6. ✅ Resumo da configuração
7. ✅ Validação de entrada
8. ✅ Feedback visual (cores, ícones)

---

## 📦 Dependências Mínimas

### Frontend
- `react` (hooks: useState)
- `@radix-ui/react-switch` (toggle)
- `@radix-ui/react-select` (dropdown)

### Backend
- `zod` (validação)
- Nenhuma dependência específica para lógica

---

## 🔒 Validação

### Frontend
- Modo CUSTOM: Mínimo 1 horário
- Modo GOLD: Máximo 2 horários
- Multiplicador: Mínimo 1.0x

### Backend (Zod)
```typescript
const hourlyFilterSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['IDEAL', 'COMPATIBLE', 'GOLDEN', 'COMBINED', 'CUSTOM']),
  customHours: z.array(z.number().int().min(0).max(23)),
  goldModeHours: z.array(z.number().int().min(0).max(23)).max(2),
  goldModeStakeMultiplier: z.number().int().min(100),
});
```

---

## 🧪 Testes

### Teste 1: Verificar Horário Permitido

```typescript
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
```

### Teste 2: Stake Ajustado em Horário GOLD

```typescript
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

expect(filter.getAdjustedStake(1000)).toBe(2000); // 1000 * 2x
```

### Teste 3: Próximo Horário Permitido

```typescript
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

expect(filter.getNextAllowedHour()).toBe(16);
```

---

## 📚 Documentação Adicional

- `ANALISE_FILTRO_HORARIO.md` - Análise técnica completa
- `GUIA_INTEGRACAO_FILTRO.md` - Guia passo a passo de integração
- `filtro-horario/README.md` - Documentação do módulo isolado

---

## 🤝 Contribuindo

Este branch é **somente leitura** e serve como referência. Para modificações:

1. Crie um fork
2. Faça suas alterações
3. Teste completamente
4. Documente as mudanças

---

## 📄 Licença

Mesmo que o projeto principal.

---

## ✅ Checklist de Isolamento

- [x] Código extraído do branch `backup-filtro-horarios-2025-11-03`
- [x] Componente React isolado criado
- [x] Lógica isolada criada
- [x] Tipos TypeScript definidos
- [x] Documentação completa
- [x] Exemplos de uso
- [x] Testes sugeridos
- [x] Guia de integração
- [x] Dependências mínimas identificadas
- [x] Validação implementada
- [x] Branch criado e isolado

---

**Desenvolvido por**: Manus AI  
**Data**: 05 de Novembro de 2025  
**Branch**: `feature/filtro-horario-isolado`
