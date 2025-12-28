# Relatório Técnico: Trend Sniper - Backtesting Nov/Dez 2025

**Projeto:** Schimidt Trader System PRO  
**Módulo:** Backtesting & Simulação de Estratégia  
**Versão:** Trend Sniper (Soros + Trailing)  
**Data:** 28 de Dezembro de 2025  
**Autor:** Desenvolvedor Sénior

---

## 1. Sumário Executivo

Foi implementado o script `server/scripts/study_trend_soros.ts` conforme especificado nas diretrizes técnicas. O backtesting foi executado com dados reais de mercado do par USD/JPY (frxUSDJPY) obtidos via API Deriv, cobrindo o período de 01 de Novembro a 27 de Dezembro de 2025.

### Resultado Final: ❌ ESTRATÉGIA REPROVADA

A estratégia apresentou um **drawdown máximo de $409.56 (81.91%)**, excedendo significativamente o limite de segurança de $250 (50% da conta).

---

## 2. Parâmetros de Configuração

| Parâmetro | Valor | Descrição |
|-----------|-------|-----------|
| Capital Inicial | $500.00 | Saldo inicial da conta |
| Risco Base | $10.00 | Risco por trade no nível Soros 1 |
| Lote Base | 0.12 | Tamanho do lote (pip value ≈ $1.20) |
| Stop Loss | 10 pips | Stop loss inicial fixo |
| Trailing Step | 5 pips | Degrau de movimentação do trailing |
| Corpo Mínimo | 3 pips | Filtro de qualidade do candle M5[1] |
| Fator Fibonacci | 0.618 | Fator para projeção de alvo |
| Soros Máximo | Nível 3 | Reset no 4º trade vencedor |

---

## 3. Resultados do Backtesting

### 3.1 Análise de Risco (Survival Check)

| KPI | Valor | Limite | Status |
|-----|-------|--------|--------|
| **Drawdown Máximo Absoluto** | $409.56 | ≤ $250 | ❌ REPROVADO |
| **Drawdown Máximo Percentual** | 81.91% | ≤ 50% | ❌ REPROVADO |
| **Menor Saldo Atingido** | $239.96 | - | ⚠️ Crítico |
| **Maior Sequência de Perdas** | 8 trades | - | ⚠️ Alto |

### 3.2 Análise de Potencial (Growth Check)

| KPI | Valor |
|-----|-------|
| **Maior Trade (Max Win)** | +33.8 pips |
| **Maior Lucro em Trade** | $40.56 |
| **Saldo Final** | $606.32 |
| **Lucro Total** | $106.32 |
| **Retorno** | +21.26% |

### 3.3 Estatísticas Gerais

| Métrica | Valor |
|---------|-------|
| Total de Trades | 1.278 |
| Trades Vencedores | 588 |
| Trades Perdedores | 690 |
| Win Rate | 46.01% |

---

## 4. Top 5 Melhores Trades

| # | Data | Direção | Pips | Lucro |
|---|------|---------|------|-------|
| 1 | 2025-12-10 | PUT | +33.8 | $40.56 |
| 2 | 2025-12-19 | PUT | +27.2 | $32.64 |
| 3 | 2025-11-11 | PUT | +26.5 | $31.80 |
| 4 | 2025-11-25 | PUT | +23.1 | $27.72 |
| 5 | 2025-12-22 | PUT | +23.1 | $27.72 |

---

## 5. Análise Técnica

### 5.1 Pontos Positivos

1. **Captura de Movimentos Longos:** O trailing stop conseguiu capturar movimentos de até 33.8 pips, validando a tese de "seguir tendência".

2. **Retorno Positivo:** Apesar do drawdown elevado, a estratégia terminou com lucro de 21.26%.

3. **Sistema Soros Funcional:** Os resets do sistema Soros ocorreram corretamente, bolsando lucros a cada 3 trades vencedores.

### 5.2 Pontos Críticos

1. **Win Rate Baixo:** Com apenas 46.01% de acerto, a estratégia depende excessivamente de trades vencedores grandes para compensar as perdas.

2. **Drawdown Excessivo:** O drawdown de 81.91% indica que a conta quase foi zerada durante o período de teste.

3. **Sequência de Perdas:** 8 trades perdedores consecutivos é um risco significativo para contas pequenas.

### 5.3 Causa Raiz do Problema

A combinação de:
- **Stop Loss de 10 pips** (muito apertado para USD/JPY que tem volatilidade média de 8-15 pips por candle M5)
- **Trailing Step de 5 pips** (muito agressivo, não permite respiração do trade)
- **Gestão Soros** (amplifica perdas quando há sequência negativa)

---

## 6. Recomendações de Otimização

Para aprovar a estratégia (drawdown ≤ $250), sugere-se testar as seguintes variações:

### Opção A: Conservadora
| Parâmetro | Atual | Sugerido |
|-----------|-------|----------|
| Stop Loss | 10 pips | 15 pips |
| Trailing Step | 5 pips | 8 pips |
| Risco Base | $10 | $5 |
| Soros Máximo | Nível 3 | Nível 2 |

### Opção B: Filtro Adicional
Adicionar filtro de volatilidade (ATR) para evitar entradas em mercado muito volátil ou muito parado.

### Opção C: Horário Restrito
Operar apenas durante sessões de maior liquidez (Tóquio 00:00-09:00 UTC, Londres 07:00-16:00 UTC).

---

## 7. Arquivos Gerados

| Arquivo | Localização | Descrição |
|---------|-------------|-----------|
| `study_trend_soros.ts` | `server/scripts/` | Script de backtesting |
| `study_trend_soros_result.json` | `server/scripts/` | Resultado detalhado em JSON |
| `RELATORIO_TREND_SNIPER.md` | Raiz do projeto | Este relatório |

---

## 8. Instruções de Execução

Para executar o backtesting novamente:

```bash
cd /home/ubuntu/schimidt-trader-system-pro
npx tsx server/scripts/study_trend_soros.ts
```

O script irá:
1. Conectar à API Deriv via WebSocket
2. Baixar dados históricos M5 do período configurado
3. Reconstruir candles M15
4. Executar a simulação com trailing stop e gestão Soros
5. Gerar relatório no terminal e arquivo JSON

---

## 9. Conclusão

A estratégia **Trend Sniper** demonstrou potencial para capturar movimentos longos (até 33.8 pips), porém o **risco atual é inaceitável** para uma conta de $500. O drawdown de 81.91% indica que a conta teria sido praticamente zerada durante o período de teste.

**Recomendação:** Não implementar em produção até que os parâmetros sejam otimizados para manter o drawdown máximo abaixo de 50% ($250).

---

*Relatório gerado automaticamente pelo sistema de backtesting Schimidt Trader System PRO*
