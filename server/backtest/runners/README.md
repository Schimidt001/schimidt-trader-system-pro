# Módulo de Runners: Determinismo e Isolamento

**Autor:** Manus AI
**Versão:** 1.0.0

## Visão Geral

Este módulo contém os executores de backtest, com foco em garantir **determinismo** e **isolamento**, dois pilares fundamentais para a validade de qualquer pesquisa quantitativa.

## `IsolatedBacktestRunner`

O `IsolatedBacktestRunner` é uma classe que encapsula a lógica de um único backtest, garantindo que sua execução seja completamente isolada e reprodutível.

### Contrato e Invariantes

1.  **Imutabilidade da Configuração:** Uma vez que um `runner` é instanciado com uma configuração, essa configuração é imutável. Não há métodos para alterar a configuração após a criação.
2.  **Nenhum Estado Global:** O `runner` não depende de nenhum estado global ou singleton. Todas as dependências (como o `SeededRNG`) são injetadas ou criadas internamente com base no `seed` da configuração.
3.  **Reprodutibilidade com Seed:** Dadas a mesma configuração e o mesmo `seed`, o `runner` **deve** produzir resultados idênticos. Isso é validado pelo **Gate A** dos testes de CI.

### Exemplo de Uso

```typescript
import { createIsolatedRunner } from "./IsolatedBacktestRunner";

const config = {
  runId: "my-test-run",
  symbol: "XAUUSD",
  startDate: new Date("2024-01-01"),
  endDate: new Date("2024-06-01"),
  strategyType: "SMC",
  parameters: { swingH1Lookback: 50 },
  seed: 12345, // Seed fixo para reprodutibilidade
};

const runner = createIsolatedRunner(config);

// A execução do runner usará o RNG seedado internamente
const result = await runner.run();
```

## `SeededRNG`

O `SeededRNG` (Random Number Generator) é a base do determinismo. Ele gera uma sequência de números pseudo-aleatórios que é sempre a mesma para um dado `seed` inicial.

### Contrato e Invariantes

1.  **Sequência Determinística:** Para um mesmo `seed`, a sequência de números gerada por `next()` será sempre idêntica.
2.  **Isolamento de Instância:** Duas instâncias de `SeededRNG` com `seeds` diferentes produzirão sequências diferentes e independentes. O estado de uma instância não afeta a outra.

### Exemplo de Uso

```typescript
import { createSeededRNG } from "../utils/SeededRNG";

// RNG com seed fixo
const rng1 = createSeededRNG(123);
console.log(rng1.next()); // Ex: 0.456
console.log(rng1.next()); // Ex: 0.789

// Nova instância com o mesmo seed produz a mesma sequência
const rng2 = createSeededRNG(123);
console.log(rng2.next()); // 0.456
console.log(rng2.next()); // 0.789
```
