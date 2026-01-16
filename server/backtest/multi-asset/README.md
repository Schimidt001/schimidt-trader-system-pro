# Módulo Multi-Asset: Gestão de Risco de Portfólio

**Autor:** Manus AI
**Versão:** 1.0.0

## Visão Geral

Este módulo fornece as ferramentas para executar backtests em um portfólio de múltiplos ativos, com foco na gestão de risco consolidada. Ele garante que o resultado do portfólio não seja apenas a soma de backtests individuais, mas sim um reflexo das interações e correlações entre os ativos.

## Componentes Críticos

### `RiskGovernor`

O `RiskGovernor` é o cérebro da gestão de risco. Ele atua como um gatekeeper, decidindo se uma nova posição pode ser aberta com base em um conjunto de regras de risco globais.

#### Contrato e Invariantes

1.  **Limites Globais:** O `RiskGovernor` impõe limites que se aplicam ao portfólio como um todo, como `maxTotalPositions` e `maxDailyDrawdown`.
2.  **Limites por Símbolo:** Limites como `maxPositionsPerSymbol` são aplicados individualmente a cada ativo.
3.  **Análise de Correlação:** Antes de aprovar uma nova posição, o `RiskGovernor` verifica a correlação do novo ativo com as posições existentes. Se a correlação exceder o `correlationThreshold`, a posição pode ser bloqueada para evitar concentração de risco.
4.  **Estado Centralizado:** O `RiskGovernor` é o único ponto de verdade para as decisões de risco. Nenhuma outra parte do sistema pode autorizar a abertura de uma posição.

### `Ledger`

O `Ledger` é o livro-razão do portfólio. Ele rastreia todas as posições abertas, o P&L (Profit and Loss) não realizado e a curva de equity global.

#### Contrato e Invariantes

1.  **Equity Consolidado:** O `Ledger` calcula o equity total do portfólio em tempo real, somando o P&L de todas as posições abertas ao saldo inicial.
2.  **Tracking por Símbolo:** Permite consultar todas as posições abertas para um símbolo específico.
3.  **Transações Atômicas:** A abertura e o fechamento de posições são operações atômicas que atualizam o estado do `Ledger` de forma consistente.

### `GlobalClock`

O `GlobalClock` é responsável por sincronizar os dados de mercado de múltiplos ativos, garantindo que os eventos sejam processados na ordem cronológica correta.

#### Contrato e Invariantes

1.  **Ordenação Temporal:** O `GlobalClock` processa os candles de todos os símbolos em uma fila de prioridade baseada em seus timestamps. Isso garante que o sistema nunca processe um evento de `t+1` antes de um evento de `t`, mesmo que venham de ativos diferentes.
2.  **Sem Look-Ahead:** Ao fornecer os dados de mercado para um determinado ponto no tempo, o `GlobalClock` garante que apenas dados até aquele momento sejam visíveis, prevenindo o look-ahead bias.

## Fluxo de Execução Multi-Asset

1.  O `MultiAssetOrchestrator` é instanciado com uma lista de símbolos e uma configuração de estratégia.
2.  O `GlobalClock` é populado com os dados de mercado para todos os símbolos.
3.  O `CorrelationAnalyzer` calcula a matriz de correlação entre os ativos, que é fornecida ao `RiskGovernor`.
4.  O `MultiAssetOrchestrator` avança o `GlobalClock` tick a tick.
5.  A cada tick, a estratégia é executada para cada símbolo, gerando sinais de trading.
6.  Para cada sinal, o `MultiAssetOrchestrator` consulta o `RiskGovernor`:
    *   `canOpenPosition(signal, currentPositions, currentEquity)`
7.  Se o `RiskGovernor` aprovar, a posição é aberta e registrada no `Ledger`.
8.  Se o `RiskGovernor` bloquear, o sinal é ignorado e um log é gerado (ex: `RISK_GOVERNOR_BLOCKED:MAX_TOTAL_POSITIONS`).
9.  O processo continua até que o `GlobalClock` não tenha mais eventos.

Este fluxo garante que o backtest multi-asset seja uma simulação realista de como um portfólio seria gerenciado sob um framework de risco unificado.
