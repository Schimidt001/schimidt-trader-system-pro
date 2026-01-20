# 📋 CHECKLIST DE CORREÇÕES - LABORATÓRIO DE BACKTEST

## Contexto
Este checklist documenta as correções necessárias para resolver o problema de **OOM (Out of Memory)** no Laboratório de Backtest Institucional.

**Problema Principal:** O sistema está quebrando por falta de memória (heap overflow), causando:
- Backend Node crasha e reinicia
- Frontend recebe 502 Bad Gateway
- Erro "Unable to transform response from server"
- Otimização "some" se o usuário troca de aba

---

## FASE 1 — Mitigação Imediata

### 1.1 Configuração de Memória do Node.js
- [x] Adicionar `NODE_OPTIONS=--max-old-space-size=<valor>` no Dockerfile
- [x] Valor recomendado: 512MB para Railway (ajustar conforme plano)
- [x] Arquivo: `Dockerfile`

### 1.2 Monitoramento de Memória
- [x] Implementar logging de uso de memória (heapUsed, rss)
- [x] Adicionar métricas de memória no endpoint de status
- [x] Arquivo: `server/backtest/utils/MemoryManager.ts` (NOVO)

---

## FASE 2 — Correção Definitiva de Memória

### 2.1 Processamento por Streaming (Crítico)
- [ ] Refatorar `BacktestAdapter.loadHistoricalData()` para carregar dados em chunks
- [ ] Implementar leitura por janela deslizante no `BacktestRunner`
- [ ] Não carregar todos os candles de todos os timeframes simultaneamente
- [ ] Arquivos:
  - `server/backtest/adapters/BacktestAdapter.ts`
  - `server/backtest/runners/BacktestRunner.ts`

### 2.2 Resultados: Top-N Apenas (Crítico)
- [x] Limitar armazenamento de resultados no `GridSearchEngine`
- [x] Implementar min-heap/priority queue para manter apenas Top-N
- [x] Persistir resultados completos em arquivo/banco, não em memória
- [x] Arquivos:
  - `server/backtest/optimization/GridSearchEngineOptimized.ts` (NOVO)
  - `server/backtest/utils/OptimizationJobQueue.ts` (ATUALIZADO)

### 2.3 Cache sem Duplicação
- [ ] Garantir cache único de candles por símbolo/timeframe
- [ ] Eliminar cópias de arrays por combinação
- [ ] Usar referências em vez de cópias
- [ ] Arquivos:
  - `server/backtest/adapters/BacktestAdapter.ts`
  - `server/backtest/data-management/DataCacheManager.ts`

### 2.4 Liberação de Memória Após Cada Combinação
- [x] Limpar referências após processar cada combinação
- [x] Forçar garbage collection se disponível
- [x] Arquivos:
  - `server/backtest/optimization/GridSearchEngineOptimized.ts` (NOVO)
  - `server/backtest/runners/BacktestRunner.ts` (ATUALIZADO)
  - `server/backtest/runners/IsolatedBacktestRunner.ts` (ATUALIZADO)

---

## FASE 3 — Status e UI Resiliente

### 3.1 Endpoint de Status Leve
- [x] `getOptimizationStatus` deve retornar apenas metadata
- [x] Payload mínimo: status, progresso, heartbeat, runId
- [x] Remover dados pesados do status
- [x] Arquivo: `server/backtest/institutionalRouter.ts`

### 3.2 Resultados Pesados Sob Demanda
- [ ] Criar endpoint separado para resultados completos
- [ ] Só retornar quando status = DONE
- [ ] Arquivo: `server/backtest/institutionalRouter.ts`

### 3.3 Tratamento de Falhas
- [ ] Se backend reiniciar, marcar run como FAILED (OOM)
- [ ] Não "sumir" silenciosamente
- [ ] Implementar persistência de estado do job
- [ ] Arquivos:
  - `server/backtest/utils/OptimizationJobQueue.ts`
  - `server/backtest/institutionalRouter.ts`

---

## FASE 4 — Isolamento LAB vs LIVE (Crítico)

### 4.1 Verificação de Imports
- [ ] Verificar que nenhum código do LAB importa `ctraderAdapter`
- [ ] Verificar que nenhum código do LAB importa módulos de broker
- [ ] Arquivos: Todos em `server/backtest/`

### 4.2 Verificação de Conexões
- [ ] Garantir que LAB não faz check de conexão ICMarkets
- [ ] Garantir que LAB não acessa estado do LIVE
- [ ] Arquivos: Todos em `server/backtest/`

---

## Arquivos Principais a Modificar

| Arquivo | Prioridade | Tipo de Correção |
|---------|------------|------------------|
| `Dockerfile` | Alta | NODE_OPTIONS |
| `server/backtest/adapters/BacktestAdapter.ts` | Alta | Streaming, Cache |
| `server/backtest/optimization/GridSearchEngine.ts` | Alta | Top-N, Memória |
| `server/backtest/runners/BacktestRunner.ts` | Alta | Streaming |
| `server/backtest/utils/OptimizationJobQueue.ts` | Média | Persistência |
| `server/backtest/institutionalRouter.ts` | Média | Status Leve |
| `server/backtest/utils/LabLogger.ts` | Baixa | Monitoramento |

---

## Critérios de Aceite

- [ ] Não existe nenhum OOM no Railway
- [ ] Nenhum 502 durante execução
- [ ] Job continua rodando se usuário troca de aba
- [ ] Status funciona durante toda execução
- [ ] LIVE não cai ao rodar LAB

### Teste Mínimo Obrigatório
- 1 ativo
- 30 dias
- 1-2 parâmetros
- <1000 combinações
- Roda até DONE sem reinício

---

## Progresso

**Data de Início:** 2026-01-19
**Status:** Em andamento

### Log de Alterações
| Data | Arquivo | Alteração |
|------|---------|-----------|
| | | |

