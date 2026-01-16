# Fase 2 - Tarefas Extraídas do Documento Completo

## Estado Atual (Fase 1 Completa)
- Camada 1 (BacktestAdapter/Runner) existe e foi aprovada em auditoria
- Fase 1 já implementada: estrutura de pastas, tipos/interfaces, GridSearchEngine, WalkForwardValidator, data-management, schemas drizzle, migração SQL, rotas backend (placeholders), página frontend base

## Fase 2 Pendente
- MonteCarloSimulator
- RegimeDetector
- MultiAssetOrchestrator
- CorrelationAnalyzer
- PortfolioMetricsCalculator
- Gráficos e integração E2E + testes

---

## Work Packages (WP0-WP7)

### WP0 - Operacionalizar o que já existe
- [ ] Aplicar e validar migração (local/staging/prod)
- [ ] Tirar rotas do placeholder: start/status/results/abort (otimização) e endpoints WFO
- [ ] Persistir progresso e status do run; abort idempotente

### WP1 - Blindar isolamento e determinismo (prioridade máxima)
- [ ] Rever BacktestRunner.runWithParameters: evitar updateStrategyConfig em instância reutilizada. Preferir instância nova por execução
- [ ] Seed institucional para grid cap, MC, regime detection; registrar no banco
- [ ] Testes CI: (a) mesmo seed -> mesmos hashes; (b) A->B->A invariável; (c) abort não corrompe estado

### WP2 - Camada 3: Otimização multi-objetivo robusta
- [ ] Split temporal IS/OOS por símbolo; rodar grid no IS e validar top X% no OOS
- [ ] RobustnessScore penaliza degradação OOS, overtrading e complexidade
- [ ] Retornar ranking com warnings de overfitting e limiares explícitos

### WP3 - Camada 4: Walk-Forward Optimization (WFO)
- [ ] Para cada janela: otimizar no treino e testar no "futuro" (janela de teste)
- [ ] Persistir por janela e gerar curva concatenada OOS
- [ ] Stability Score fixo e versionado

### WP4 - Monte Carlo (robustez) com testes
- [ ] Implementar MonteCarloSimulator com RNG seedado e block bootstrap (não shuffle puro)
- [ ] Testes unitários: percentis/IC/determinismo
- [ ] Persistir apenas sumários (IC, prob ruína, piores/melhores) e amostra limitada

### WP5 - Regime Detection e performance por regime
- [ ] RegimeDetector online (sem look-ahead): regime do trade usa apenas dados até o timestamp do trade
- [ ] Persistir regimes e rodar análise de performance por regime
- [ ] Emitir warnings quando performance depende de um único regime

### WP6 - Camada 2: Multi-Asset com relógio global (institucional)
- [ ] Implementar GlobalClock + Ledger + RiskGovernor (limites globais antes de ordens)
- [ ] CorrelationAnalyzer rolling até t; limitar posições correlacionadas no tempo
- [ ] PortfolioMetricsCalculator usando equity curve do ledger (não soma posterior)

### WP7 - Dashboard (MVP operacional)
- [ ] UI mínima: painel de parâmetros, start run, progresso, tabela top-N, tela de detalhe (WFO/MC/regimes)
- [ ] Replay incremental: markers + decision log; multi-timeframe completo pode vir depois
- [ ] Export de relatórios como passo posterior (quando o pipeline estiver sólido)

---

## Definition of Done (DoD) - Entrega Institucional
- E2E operacional: start/status/results/abort funcionando para otimização e WFO
- Migração aplicada e validada; dados persistidos com integridade
- Determinismo: execuções repetidas com mesmo seed produzem hashes idênticos
- Isolamento: nenhuma contaminação entre combinações; runner/engine/estado por execução
- OOS automatizado: ranking sempre inclui validação out-of-sample e degradação
- WFO completo: janelas, curva concatenada e stabilityScore
- Monte Carlo e Regimes: implementados com testes; sem look-ahead
- Multi-asset real: relógio global + ledger + limites aplicados no tempo
- UI MVP: operação completa do laboratório sem scripts manuais

---

## Políticas Institucionais (Gates)
- **P0 - Determinismo e reprodutibilidade**: toda execução registra seed, hash do dataset, hash do código (git) e config completa. RNG não-seedado é proibido
- **P0 - Isolamento por execução**: 1 combinação = 1 instância isolada (runner/adapter/estado) ou reset total provado por teste. Parâmetros nunca vazam entre execuções
- **P0 - Anti look-ahead**: nenhum componente acessa candle futuro; MTF apenas em candles fechados conforme regra do robô real
- **P1 - Portfólio e temporal**: multi-asset deve rodar com relógio global e ledger único; limites globais aplicados antes de enviar ordens
- **P1 - Auditoria humana**: logs/eventos precisam permitir reconstruir "por que entrou / por que não entrou" em replay

---

*Extraído do documento: Plano_Perfeito_Laboratorio_Backtest_Institucional_Plus.pdf*
*Data: 15/01/2026*
