# Correção do 502 Bad Gateway - Laboratório de Otimização

**Data:** 19 de Janeiro de 2026  
**Autor:** Manus AI - Dev Senior  
**Versão:** 2.0.0

## Resumo do Problema

O endpoint `POST /api/trpc/institutional.startOptimization` retornava **502 Bad Gateway** após 10-20 segundos. Isso ocorria porque a execução pesada da otimização (Grid Search com milhares de combinações) bloqueava o event loop do Node.js dentro da própria request HTTP, causando timeout no Railway.

## Correções Implementadas

### 1. startOptimization como Enqueue-Only (Obrigatório)

**Arquivo:** `server/backtest/institutionalRouter.ts`

A procedure `startOptimization` agora:
- ✅ Valida input
- ✅ Cria runId único
- ✅ Persiste status QUEUED
- ✅ Dispara execução async via `setImmediate()`
- ✅ Retorna em **<300ms** com `{ runId, totalCombinations, enqueuedAt, requestTimeMs }`

```typescript
// ANTES (bloqueava a request)
const result = await activeGridSearchEngine.run(); // ❌ Podia levar minutos

// DEPOIS (enqueue-only)
const { runId, enqueuedAt } = optimizationJobQueue.enqueueJob(config, totalCombinations);
return { success: true, runId, requestTimeMs }; // ✅ Retorna em <300ms
```

### 2. Execução Pesada Fora da Request + Heartbeat

**Arquivo:** `server/backtest/utils/OptimizationJobQueue.ts`

Novo módulo `OptimizationJobQueue` que:
- ✅ Executa o job fora da request HTTP via `setImmediate()`
- ✅ Atualiza `lastProgressAt` a cada 5 segundos (heartbeat)
- ✅ Mantém estado do job (QUEUED, RUNNING, COMPLETED, FAILED, ABORTED)
- ✅ Permite consultar progresso sem bloquear

```typescript
// Heartbeat automático
private startHeartbeat(runId: string): void {
  this.heartbeatInterval = setInterval(() => {
    if (this.currentJob?.status === "RUNNING") {
      this.currentJob.lastProgressAt = new Date();
    }
  }, this.config.heartbeatIntervalMs); // 5000ms
}
```

### 3. Instrumentação com Logs Estruturados (6 Checkpoints)

**Arquivos:** `institutionalRouter.ts`, `OptimizationJobQueue.ts`, `GridSearchEngine.ts`

Checkpoints implementados:

| Checkpoint | Localização | Descrição |
|------------|-------------|-----------|
| `startOptimization.enter` | institutionalRouter | Início da request |
| `startOptimization.returning_runId` | institutionalRouter | Retorno da request com runId |
| `job.start(runId)` | OptimizationJobQueue | Job iniciou execução |
| `job.loaded_data` | OptimizationJobQueue | Dados carregados |
| `job.first_iteration` | GridSearchEngine | Primeira combinação testada |
| `job.progress_5_percent` | GridSearchEngine | 5% concluído |
| `job.completed` / `job.failed` | OptimizationJobQueue | Job finalizado |

**Exemplo de log:**
```
14:32:15.123 [Lab] [InstitutionalRouter] CHECKPOINT: startOptimization.enter
14:32:15.125 [Lab] [JobQueue] CHECKPOINT: startOptimization.returning_runId | runId=opt_1737311535123_abc1234 | requestTime=2ms
14:32:15.126 [Lab] [JobQueue] CHECKPOINT: job.start(opt_1737311535123_abc1234)
```

### 4. Guard Rails de Tempo e Carga

**Arquivos:** `OptimizationJobQueue.ts`, `GridSearchEngine.ts`

#### Limite de Combinações
```typescript
const MAX_COMBINATIONS_LIMIT = 10000;

if (totalCombinations > MAX_COMBINATIONS_LIMIT) {
  return {
    valid: false,
    errorCode: "LAB_TOO_MANY_COMBINATIONS",
    error: `LAB_TOO_MANY_COMBINATIONS: ${totalCombinations} excedem o limite de ${MAX_COMBINATIONS_LIMIT}`,
  };
}
```

#### Limite de Paralelismo
```typescript
// GridSearchEngine.ts
private createWorkerPool(): WorkerPool {
  const MAX_PARALLEL_WORKERS = 2; // Reduzido para não travar CPU do Railway
  const workers = Math.min(this.config.parallelWorkers, MAX_PARALLEL_WORKERS);
  // ...
}
```

## Arquivos Modificados

| Arquivo | Alteração |
|---------|-----------|
| `server/backtest/institutionalRouter.ts` | Refatorado startOptimization para enqueue-only |
| `server/backtest/utils/OptimizationJobQueue.ts` | **NOVO** - Sistema de fila de jobs |
| `server/backtest/utils/index.ts` | Exportação do novo módulo |
| `server/backtest/optimization/GridSearchEngine.ts` | Checkpoints e guard rail de paralelismo |
| `server/backtest/optimization/types/optimization.types.ts` | Campos adicionais na interface |

## Como Testar

### 1. Verificar que startOptimization retorna em <300ms

```bash
# No browser DevTools ou via curl
POST /api/trpc/institutional.startOptimization

# Resposta esperada (em <300ms):
{
  "success": true,
  "runId": "opt_1737311535123_abc1234",
  "message": "Otimização enfileirada com sucesso",
  "totalCombinations": 500,
  "enqueuedAt": "2026-01-19T14:32:15.123Z",
  "requestTimeMs": 2
}
```

### 2. Verificar que o job roda em background

```bash
# Consultar status
GET /api/trpc/institutional.getOptimizationStatus

# Resposta esperada:
{
  "isRunning": true,
  "runId": "opt_1737311535123_abc1234",
  "status": "RUNNING",
  "progress": { "percentComplete": 15.5, ... },
  "lastProgressAt": "2026-01-19T14:32:20.123Z"
}
```

### 3. Verificar logs de checkpoints

```bash
# No Railway logs, procurar por:
CHECKPOINT: startOptimization.enter
CHECKPOINT: startOptimization.returning_runId | runId=... | requestTime=2ms
CHECKPOINT: job.start(...)
CHECKPOINT: job.loaded_data
CHECKPOINT: job.first_iteration
CHECKPOINT: job.progress_5_percent
CHECKPOINT: job.completed | combinations=500 | time=45s
```

### 4. Testar guard rail de combinações

```bash
# Tentar iniciar otimização com muitas combinações
# Resposta esperada (erro estruturado):
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "LAB_TOO_MANY_COMBINATIONS: 50000 combinações excedem o limite de 10000"
  }
}
```

## Diagnóstico de Problemas

### Se o 502 ainda ocorrer:

1. **Verificar logs de checkpoints:**
   - Se `startOptimization.returning_runId` aparece → problema é no job
   - Se não aparece → problema é na validação/request

2. **Verificar heartbeat:**
   - Se `lastProgressAt` para de atualizar → job travou
   - Se continua atualizando → job está rodando normalmente

3. **Verificar memória/CPU do Railway:**
   - Se CPU está em 100% → reduzir `MAX_PARALLEL_WORKERS`
   - Se memória está alta → reduzir `MAX_COMBINATIONS_LIMIT`

## Conclusão

As correções implementadas garantem que:

1. ✅ A request HTTP retorna em <300ms (enqueue-only)
2. ✅ A execução pesada ocorre fora do request/response cycle
3. ✅ O heartbeat permite monitorar se o job está vivo
4. ✅ Guard rails previnem sobrecarga do servidor
5. ✅ Logs estruturados permitem diagnóstico preciso de problemas
