_Análise de Commits Recentes - Schimidt Trader System PRO_

**1. Visão Geral**

A análise dos commits mais recentes no repositório `schimidt-trader-system-pro` revela um foco intenso em duas áreas principais:

- **Cálculo de Duração do Contrato:** Múltiplas alterações foram feitas para corrigir a forma como a duração das operações de trade é calculada e enviada para a API da Deriv.
- **Suporte ao Timeframe M30:** O sistema foi adaptado para suportar o timeframe de 30 minutos (M30), o que exigiu mudanças tanto no bot de negociação (TypeScript) quanto no motor de predição (Python).

**2. Principais Commits e Alterações**

A seguir, uma tabela que resume os commits mais relevantes e as mudanças que eles introduziram:

| Hash do Commit | Mensagem do Commit | Arquivos Modificados | Descrição da Mudança |
| :--- | :--- | :--- | :--- |
| `ef921e7` | `fix: Corrige ReferenceError - durationMinutes is not defined` | `server/deriv/tradingBot.ts` | Corrigido um erro de referência em um log, onde uma variável `durationMinutes` (que foi removida) ainda estava sendo usada. Substituída por `durationRounded`. |
| `dc2fd96` | `fix: Corrige erros de duração e suporte M30 no motor de predição` | `server/deriv/tradingBot.ts`, `server/prediction/engine_server.py` | - Aumentou a duração mínima do contrato para 120 segundos para ser compatível com Forex.<br>- Aumentou a margem de segurança para 30 segundos antes do fim do candle.<br>- Voltou a usar minutos (`m`) em vez de segundos (`s`) na API da Deriv para maior compatibilidade.<br>- Adicionou suporte ao timeframe `M30` no motor de predição em Python. |
| `28077d0` | `fix: Corrige erro 'Trading is not offered for this duration'` | `server/deriv/tradingBot.ts` | Alterou o envio da duração do contrato de minutos para segundos (`s`) na tentativa de corrigir o erro "Trading is not offered for this duration". Esta mudança foi posteriormente revertida no commit `dc2fd96`. |
| `a7e5bac` | `feat: Implementa re-predição automática para timeframe M30` | `server/deriv/tradingBot.ts` | Adicionada a funcionalidade de re-predição automática para o timeframe M30. |
| `2540c89` | `feat: Adiciona suporte a ativos Forex e timeframe M30` | `server/deriv/tradingBot.ts` | Adicionado suporte para ativos Forex e o timeframe M30. |

**3. Análise Detalhada das Mudanças**

As mudanças no arquivo `server/deriv/tradingBot.ts` foram as mais significativas. O fluxo de alterações no cálculo da duração foi o seguinte:

1.  **Commit `28077d0`:** A duração do contrato, que era enviada em minutos, foi alterada para ser enviada em segundos (`duration_unit: "s"`). A intenção era resolver o erro "Trading is not offered for this duration", provavelmente porque a API da Deriv é mais flexível com durações em segundos.

2.  **Commit `dc2fd96`:** A mudança anterior foi revertida. O sistema voltou a enviar a duração em minutos (`duration_unit: "m"`), mas com uma nova lógica: a duração em segundos é arredondada para o minuto completo mais próximo. Além disso, a duração mínima foi aumentada para 120 segundos. Isso sugere que o problema não era usar minutos, mas sim usar durações "quebradas" (não inteiras) que a API não aceitava para certos ativos (como Forex).

3.  **Commit `ef921e7`:** Uma correção menor, apenas para ajustar um log que usava uma variável que não existia mais.

O arquivo `server/prediction/engine_server.py` foi modificado no commit `dc2fd96` para permitir que o motor de predição aceite o timeframe `M30`, além do `M15` que já era suportado.

**4. Conclusão da Análise Técnica**

As atualizações recentes se concentraram em refinar a lógica de negociação para torná-la mais robusta e compatível com diferentes ativos (Forex) e timeframes (M30). As idas e vindas no cálculo da duração do contrato (minutos vs. segundos) indicam uma tentativa de encontrar a combinação correta de parâmetros que a API da Deriv aceita para todas as condições de negociação.

Com base nesta análise, estou pronto para receber a descrição do problema que você está enfrentando. É provável que o problema esteja relacionado a uma das seguintes áreas:

- O cálculo da duração do contrato ainda não está correto para todos os cenários.
- A integração com o timeframe M30 pode ter introduzido um efeito colateral inesperado.
- A lógica de re-predição para M30 pode não estar funcionando como esperado.

Fornecer detalhes específicos sobre o erro ou comportamento inesperado me ajudará a diagnosticar a causa raiz com mais precisão.
