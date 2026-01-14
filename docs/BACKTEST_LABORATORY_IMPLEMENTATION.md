# Backtest Laboratory - Plano de Implementação

## Resumo Executivo

Este documento detalha o plano de refatoração para unificar os módulos "Backtest" e "BacktestLab" em uma única solução chamada **Backtest Laboratory**, conforme especificado na Ordem de Serviço Técnica.

## Análise da Situação Atual

### Frontend (client/src/)
- `pages/Backtest.tsx` (1226 linhas) - Interface de backtest simples e otimização básica
- `pages/BacktestLab.tsx` (867 linhas) - Interface avançada com otimização por lotes
- `App.tsx` - Contém duas rotas separadas: `/backtest` e `/backtest-lab`

### Backend (server/backtest/)
- `backtestRouter.ts` - Router tRPC com endpoints duplicados (legacy e batch)
- `adapters/BacktestAdapter.ts` - Adapter de simulação (bem implementado)
- `runners/BacktestRunner.ts` - Executor de backtests
- `runners/BatchOptimizer.ts` - Otimizador em lotes
- `types/backtest.types.ts` - Tipos básicos
- `types/batchOptimizer.types.ts` - Tipos avançados com definições de parâmetros

### Engines de Trading (server/adapters/ctrader/)
- `SMCTradingEngine.ts` - Engine principal SMC (1975 linhas)
- `HybridTradingEngine.ts` - Engine híbrida (1641 linhas)
- `SMCStrategy.ts` - Estratégia SMC (1842 linhas)

## Plano de Implementação

### Fase 1: Consolidação do Frontend

**Objetivo:** Criar uma única página `Laboratory.tsx` que combine as funcionalidades de ambas as páginas.

**Ações:**
1. Criar novo componente `pages/Laboratory.tsx` baseado em `BacktestLab.tsx`
2. Incorporar funcionalidades de `Backtest.tsx`:
   - Download de dados históricos
   - Simulação única (single backtest)
   - Visualização de resultados
3. Remover páginas antigas após validação
4. Atualizar `App.tsx`:
   - Remover rotas `/backtest` e `/backtest-lab`
   - Adicionar única rota `/laboratory`
   - Renomear item de menu para "Laboratório"

### Fase 2: Refatoração do Backend

**Objetivo:** Limpar endpoints duplicados e garantir arquitetura de espelhamento.

**Ações:**
1. Consolidar endpoints no `backtestRouter.ts`:
   - Manter endpoints de batch optimization como principais
   - Marcar endpoints legacy como deprecated
   - Remover código redundante
2. Verificar que `BacktestAdapter` usa as mesmas classes de estratégia da produção
3. Implementar `MockExecutionService` explícito para garantir isolamento

### Fase 3: Arquitetura de Espelhamento (Single Source of Truth)

**Objetivo:** Garantir que o backtest use exatamente a mesma lógica das engines de produção.

**Ações:**
1. Criar interface `IExecutionService` para abstrair execução
2. Implementar `MockExecutionService` que:
   - Simula execução de ordens sem enviar à cTrader
   - Registra todas as operações para análise
3. Modificar `BacktestAdapter` para usar `MockExecutionService`
4. Garantir que parâmetros da estratégia real reflitam no backtest

### Fase 4: Otimizador por Lotes Aprimorado

**Objetivo:** Melhorar o sistema de otimização para suportar testes massivos.

**Ações:**
1. Implementar descarte de dados intermediários entre lotes
2. Adicionar interface No-Code para definição de ranges
3. Persistir apenas Top 5 resultados de cada fase
4. Implementar limpeza de memória entre ciclos

### Fase 5: Coleta de Dados Reais

**Objetivo:** Garantir integridade dos dados históricos.

**Ações:**
1. Verificar download de candles da cTrader (H1, M15, M5)
2. Implementar cache local com verificação de gaps
3. Adicionar validação de integridade dos dados

### Fase 6: Consolidação de UI

**Objetivo:** Dashboard unificado com todas as funcionalidades.

**Componentes do Dashboard:**
1. **Seleção de Ativo e Período** - Dropdown de símbolos e date pickers
2. **Configuração de Parâmetros** - Accordion com categorias
3. **Modo de Otimização** - Toggle para ativar ranges dinâmicos
4. **Execução** - Botões de iniciar/abortar com progresso
5. **Resultados** - Ranking dos melhores sets por:
   - Lucro
   - Drawdown
   - Winrate
   - Recovery Factor

## Arquivos a Criar/Modificar

### Novos Arquivos
- `client/src/pages/Laboratory.tsx` - Página unificada
- `server/backtest/services/MockExecutionService.ts` - Serviço de execução simulada

### Arquivos a Modificar
- `client/src/App.tsx` - Atualizar rotas e navegação
- `server/backtest/backtestRouter.ts` - Consolidar endpoints
- `server/backtest/adapters/BacktestAdapter.ts` - Integrar MockExecutionService

### Arquivos a Remover (após validação)
- `client/src/pages/Backtest.tsx`
- `client/src/pages/BacktestLab.tsx`

## Migrações de Banco de Dados

Não são necessárias migrações de banco de dados para esta refatoração, pois:
- Os dados de backtest são processados em memória
- Os resultados são armazenados temporariamente no estado do servidor
- Não há persistência de resultados de backtest no banco

## Critérios de Aceitação

1. ✅ Existe apenas um botão "Laboratório" na navegação
2. ✅ O usuário pode replicar fielmente o comportamento do robô real
3. ✅ O usuário pode executar otimizações em lote
4. ✅ Os resultados do backtest são matematicamente idênticos ao ambiente real
5. ✅ Nenhuma ordem real é enviada durante os testes
6. ✅ Todo código legado foi removido

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Quebra de funcionalidade existente | Média | Alto | Testes extensivos antes de remover código antigo |
| Diferença entre backtest e produção | Baixa | Alto | Usar mesmas classes de estratégia |
| Memory overflow em otimizações grandes | Média | Médio | Processamento em lotes com limpeza |

## Cronograma Estimado

| Fase | Duração Estimada |
|------|------------------|
| Fase 1: Frontend | 2-3 horas |
| Fase 2: Backend | 1-2 horas |
| Fase 3: Espelhamento | 1-2 horas |
| Fase 4: Otimizador | 1 hora |
| Fase 5: Dados | 30 minutos |
| Fase 6: UI | 1-2 horas |
| **Total** | **7-11 horas** |
