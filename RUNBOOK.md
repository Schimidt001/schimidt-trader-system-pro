# Runbook: Laboratório de Backtest Institucional Plus

**Autor:** Manus AI (para Schimidt Trader Pro)
**Versão:** 1.0.0
**Data:** 15 de Janeiro de 2026

## 1. Visão Geral

Este runbook fornece instruções operacionais para executar, monitorar e interpretar os resultados dos pipelines do **Laboratório de Backtest Institucional Plus**. O objetivo é permitir que qualquer técnico consiga reproduzir um run institucional de forma consistente e segura.

## 2. Arquitetura e Contrato da API

O laboratório é acessado via endpoints tRPC no `institutionalRouter`. Todas as operações de longa duração seguem um contrato padronizado de `start` → `status` → `results`.

| Endpoint | Descrição | Tipo |
| :--- | :--- | :--- |
| `start<Pipeline>` | Inicia uma nova execução. Retorna um `runId`. | `mutation` |
| `get<Pipeline>Status` | Retorna o status atual de uma execução (RUNNING, COMPLETED, ERROR). | `query` |
| `abort<Pipeline>` | Aborta uma execução em andamento. | `mutation` |

### Contrato de Status

O endpoint de status retorna um objeto padronizado:

```json
{
  "runId": "opt-1673802384",
  "status": "RUNNING", // IDLE, STARTING, RUNNING, COMPLETED, ABORTED, ERROR
  "progress": {
    "percentComplete": 75.5,
    "currentPhase": "TESTING",
    "message": "Testando combinação 755/1000"
  },
  "startedAt": "2026-01-15T12:00:00Z",
  "finishedAt": null,
  "result": null, // Preenchido ao completar
  "error": null // Preenchido em caso de erro
}
```

## 3. Executando Pipelines via UI

A forma primária de operação é através da página **Laboratório de Backtest** na plataforma.

1.  **Navegue** até a página do laboratório.
2.  **Selecione o Pipeline** desejado (Otimização, Walk-Forward, Monte Carlo, etc.).
3.  **Configure os Parâmetros** na aba "Configuração":
    *   Símbolos
    *   Período (Data Início/Fim)
    *   Estratégia
    *   Configurações de validação (se aplicável)
    *   Seed (opcional, para reprodutibilidade)
4.  **Clique em "Iniciar"**.
5.  **Acompanhe o Progresso** na aba "Progresso". O card de status mostrará a fase atual, percentual de conclusão e tempo estimado.
6.  **Visualize os Resultados** na aba "Resultados" após a conclusão.

## 4. Executando Pipelines via Linha de Comando (tRPC)

Para automação e testes, os pipelines podem ser acionados via `curl` ou um cliente tRPC.

### Exemplo: Iniciar Otimização

```bash
# Payload (salvo em payload.json)
cat <<EOF > payload.json
{
  "symbols": ["XAUUSD"],
  "startDate": "2024-01-01",
  "endDate": "2025-01-01",
  "strategyType": "SMC",
  "parameters": [
    { "name": "swingH1Lookback", "default": 50, "min": 30, "max": 100, "step": 10, "enabled": true, "locked": false, "type": "number", "category": "STRUCTURE", "label": "Swing H1 Lookback" },
    { "name": "sweepBufferPips", "default": 1.5, "min": 0.5, "max": 3.0, "step": 0.5, "enabled": true, "locked": false, "type": "number", "category": "ENTRY", "label": "Sweep Buffer (pips)" }
  ],
  "validation": {
    "enabled": true,
    "inSampleRatio": 0.7,
    "walkForward": { "enabled": true, "windowMonths": 6, "stepMonths": 1 }
  },
  "objectives": [
    { "metric": "sharpeRatio", "target": "MAXIMIZE", "weight": 0.4 },
    { "metric": "profitFactor", "target": "MAXIMIZE", "weight": 0.3 },
    { "metric": "maxDrawdownPercent", "target": "MINIMIZE", "weight": 0.3 }
  ],
  "seed": 12345
}
EOF

# Comando para iniciar
curl -X POST \
  -H "Content-Type: application/json" \
  -d @payload.json \
  http://localhost:3000/api/trpc/institutional.startOptimization
```

### Exemplo: Verificar Status

```bash
curl http://localhost:3000/api/trpc/institutional.getOptimizationStatus
```

### Exemplo: Abortar Execução

```bash
curl -X POST http://localhost:3000/api/trpc/institutional.abortOptimization
```

## 5. Interpretação de Resultados e Logs

### Resultados na UI

*   **Otimização:** A aba de resultados mostrará as melhores combinações de parâmetros, ordenadas por um *robustness score*. Métricas In-Sample (IS) e Out-of-Sample (OOS) são apresentadas para comparação.
*   **Monte Carlo:** Um gráfico de distribuição de equity final e métricas de risco (como probabilidade de ruína) são exibidos.
*   **Regimes:** Um gráfico mostrando a classificação do mercado (Tendência, Volatilidade, Lateral) ao longo do tempo.
*   **Multi-Asset:** Um dashboard consolidado com a curva de equity do portfólio e métricas de risco globais.

### Logs e Artefatos

*   **Logs do Servidor:** Logs detalhados da execução são emitidos pelo servidor `tRPC`. Verifique o console do servidor para informações de debug.
*   **Artefatos:** Payloads pesados (como a lista completa de trades ou a equity curve em alta resolução) são salvos como artefatos no disco para evitar sobrecarga da API e do banco de dados.
    *   **Localização:** `/home/ubuntu/schimidt-trader-system-pro/data/artifacts/`
    *   **Formato:** `<runId>_<type>_<hash>.json`
    *   O resultado na API conterá uma referência ao caminho do artefato.

## 6. Checklist de Troubleshooting

Se uma execução falhar, verifique os seguintes pontos:

| Problema | Checklist de Verificação |
| :--- | :--- |
| **Falha ao Iniciar** | 1.  **Dados Históricos:** Verifique se os dados para os símbolos e período selecionados existem no diretório `data/candles/`. A API retornará um erro `PRECONDITION_FAILED` se não encontrar.
| | 2.  **Execução Concorrente:** Apenas uma instância de cada pipeline pode rodar por vez. Verifique se não há outra execução em andamento. A API retornará `CONFLICT`.
| | 3.  **Parâmetros Inválidos:** Confira se todos os parâmetros no payload estão corretos e dentro dos limites esperados. A API retornará `BAD_REQUEST`.
| **Erro Durante a Execução** | 1.  **Logs do Servidor:** Analise os logs do servidor para a stack trace do erro. Pode indicar problemas de memória, acesso a arquivos ou bugs na estratégia.
| | 2.  **Memória:** Execuções com muitas combinações ou períodos muito longos podem consumir muita memória. Monitore o uso de recursos do servidor.
| **Resultados Inesperados** | 1.  **Seed:** Para garantir reprodutibilidade, use sempre o mesmo `seed` na configuração.
| | 2.  **Dados de Entrada:** Verifique a qualidade e a integridade dos dados históricos. Gaps ou dados corrompidos podem levar a resultados incorretos.
| | 3.  **Lógica da Estratégia:** Revise a lógica da estratégia implementada no `BacktestRunner` para garantir que está se comportando como esperado.

### Como Retomar uma Execução Falha

Não é possível "retomar" uma execução falha. Cada execução é atômica. Para tentar novamente:

1.  Identifique e corrija a causa da falha usando o checklist acima.
2.  Inicie uma **nova execução** com os mesmos parâmetros. Um novo `runId` será gerado.

---


## 7. Migração e Rollback do Banco de Dados

### Arquivos de Migração

O laboratório de backtest utiliza as seguintes tabelas no banco de dados:

| Tabela | Descrição |
| :--- | :--- |
| `backtest_runs` | Armazena informações sobre cada execução de backtest/otimização |
| `optimization_results` | Armazena os resultados de cada combinação de parâmetros testada |
| `walk_forward_validations` | Armazena os resultados de cada janela de validação Walk-Forward |
| `market_regimes` | Armazena os regimes de mercado detectados para cada símbolo |

### Aplicar Migração

Para criar as tabelas do laboratório, execute a migração:

```bash
# Via Drizzle CLI
npx drizzle-kit push:mysql

# Ou manualmente
mysql -u <user> -p <database> < drizzle/0010_add_backtest_lab_tables.sql
```

### Executar Rollback

**ATENÇÃO:** O rollback é destrutivo e irá remover TODOS os dados das tabelas do laboratório.

```bash
# 1. Faça backup do banco de dados
mysqldump -u <user> -p <database> > backup_before_rollback.sql

# 2. Execute em staging primeiro
mysql -u <user> -p <staging_database> < drizzle/0010_rollback_backtest_lab_tables.sql

# 3. Verifique se as tabelas foram removidas
mysql -u <user> -p <staging_database> -e "SHOW TABLES LIKE 'backtest_%';"

# 4. Se tudo estiver OK, execute em produção
mysql -u <user> -p <production_database> < drizzle/0010_rollback_backtest_lab_tables.sql
```

### Verificação Pós-Rollback

Execute as queries abaixo para confirmar que as tabelas foram removidas:

```sql
SHOW TABLES LIKE 'backtest_%';
SHOW TABLES LIKE 'walk_forward_%';
SHOW TABLES LIKE 'optimization_%';
SHOW TABLES LIKE 'market_regimes';
```

Todas as queries acima devem retornar resultados vazios.

---
