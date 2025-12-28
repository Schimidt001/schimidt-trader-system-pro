# Relatório Comparativo: Trend Sniper - Otimização de Parâmetros

**Projeto:** Schimidt Trader System PRO  
**Módulo:** Backtesting & Simulação de Estratégia  
**Data:** 28 de Dezembro de 2025  
**Autor:** Desenvolvedor Sénior

---

## 1. Sumário Executivo

Conforme solicitado, foi executado um segundo backtesting da estratégia **Trend Sniper** com parâmetros mais conservadores para avaliar o impacto da gestão de risco e da alavancagem Soros no resultado final.

### Resultado Final: ❌ AMBAS AS VERSÕES REPROVADAS

A versão conservadora, embora tenha reduzido o drawdown percentual, resultou em prejuízo, demonstrando que a gestão Soros era o principal motor de lucratividade da versão original. Ambas as versões falharam no critério de segurança de drawdown máximo.

---

## 2. Comparativo de Parâmetros

| Parâmetro | Versão 1 (Agressiva) | Versão 2 (Conservadora) | Alteração |
|---|---|---|---|
| **Gestão Soros** | ✅ Ativada | ❌ Desativada | Desligamento da alavancagem |
| **Stop Loss** | 10 pips | 18 pips | Aumento de 80% |
| **Trailing Start** | 5 pips | 10 pips | Início do trailing mais tardio |

---

## 3. Comparativo de Resultados

| Métrica | Versão 1 (Agressiva) | Versão 2 (Conservadora) | Variação |
|---|---|---|---|
| **Status** | ❌ REPROVADO | ❌ REPROVADO | - |
| **Drawdown Máximo** | **$409.56** (81.91%) | **$371.04** (74.21%) | `+9.3%` (Melhora) |
| **Menor Saldo** | $239.96 | $150.44 | `-37.3%` (Piora) |
| **Saldo Final** | **$606.32** | **$346.52** | `-42.8%` (Piora) |
| **Retorno** | **+21.26%** | **-30.70%** | `-244.4%` (Piora) |
| **Win Rate** | 46.01% | 46.64% | `+1.3%` (Melhora) |
| **Maior Sequência de Perdas** | 8 trades | 10 trades | `-25.0%` (Piora) |

---

## 4. Análise Técnica Comparativa

### 4.1 Impacto da Remoção do Soros

A remoção da gestão Soros foi o fator mais impactante. Sem a alavancagem dos lucros, a estratégia não conseguiu se recuperar das sequências de perdas, resultando em um prejuízo de **-30.70%**.

> A versão agressiva, embora arriscada, utilizava os juros compostos para transformar pequenos ganhos em lucros exponenciais, mascarando a baixa taxa de acerto.

### 4.2 Impacto do Stop Loss Maior

O aumento do stop loss de 10 para 18 pips teve um efeito negativo. Em vez de dar mais "espaço para respirar", ele apenas aumentou o valor de cada perda individual. Como a taxa de acerto permaneceu em ~46%, o resultado foi um prejuízo maior por trade perdedor.

### 4.3 Impacto do Trailing Start Tardio

Iniciar o trailing stop apenas após 10 pips de lucro (em vez de 5) fez com que a estratégia perdesse a oportunidade de proteger pequenos ganhos. Muitos trades que poderiam ter saído no zero a zero ou com lucro mínimo acabaram revertendo e atingindo o stop loss.

---

## 5. Conclusão e Próximos Passos

O backtesting demonstrou que a estratégia **Trend Sniper**, em sua forma atual, não é viável para produção. A taxa de acerto de ~46% é o principal ponto fraco.

**Recomendações:**

1.  **Focar no Aumento do Win Rate:** Em vez de otimizar a gestão de risco, o foco deve ser em melhorar a qualidade das entradas. Sugiro investigar a implementação de filtros adicionais, como:
    *   **Análise de Volume:** Entrar apenas em movimentos com volume crescente.
    *   **Filtro de Notícias:** Evitar operar durante notícias de alto impacto.
    *   **Confluência de Timeframes:** Confirmar a tendência em um timeframe maior (ex: H1) antes de entrar no M15.

2.  **Reavaliar a Lógica de Predição:** A lógica de predição baseada no ponto médio do candle M5[1] pode ser muito simplista. Sugiro testar variações, como usar o fechamento em vez da abertura, ou adicionar um viés de tendência (ex: só entrar comprado se o preço estiver acima de uma média móvel de 200 períodos).

O código-fonte com as alterações para a versão conservadora está disponível para análise. Recomendo não prosseguir com otimizações de risco até que a taxa de acerto da estratégia seja melhorada.

---

*Relatório gerado automaticamente pelo sistema de backtesting Schimidt Trader System PRO*
