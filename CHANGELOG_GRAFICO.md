# Changelog - Correções do Gráfico ICMarkets

## Versão 4.0.0 - 31/12/2025

### Problemas Corrigidos

#### 1. Gráfico não atualizava em tempo real (candles atrasados)

**Problema:** O gráfico mostrava apenas candles fechados, não o candle em formação. Se eram 21:00, o candle atual mostrado era o de 20:45.

**Causa identificada:** 
- O `useEffect` de inicialização do gráfico tinha dependências que causavam a recriação completa do gráfico a cada mudança de estado
- Isso fazia com que o candle em formação (armazenado em `currentCandleRef`) fosse perdido

**Solução implementada:**
- Separado o `useEffect` de inicialização do gráfico das dependências de desenho
- O gráfico agora é criado apenas uma vez e mantém o estado do candle em formação
- Reduzido o intervalo de atualização do preço de 1000ms para 500ms
- Reduzido o intervalo de atualização dos candles de 60s para 15s

**Arquivos modificados:**
- `client/src/components/SmartChart.tsx` (linhas 257-310)
- `client/src/pages/ICMarketsDashboard.tsx` (linha 111, 138)

---

#### 2. Ferramentas de desenho faziam o gráfico desaparecer

**Problema:** Ao clicar em qualquer ferramenta de desenho (linha horizontal, tendência, etc.), o gráfico desaparecia completamente.

**Causa identificada:**
- O `useEffect` de inicialização do gráfico incluía `selectedTool`, `isDrawing`, `drawingStart`, `localLines`, `localAnnotations` nas dependências
- Qualquer mudança nestas variáveis causava a destruição e recriação do gráfico
- Durante a recriação, o gráfico ficava vazio momentaneamente

**Solução implementada:**
- Removidas as dependências de desenho do `useEffect` de inicialização
- Criado um `useEffect` separado para gerir o handler de clique
- O handler de clique é agora atualizado dinamicamente via `subscribeClick`/`unsubscribeClick` sem destruir o gráfico

**Arquivos modificados:**
- `client/src/components/SmartChart.tsx` (linhas 312-380)

---

### Melhorias de UX Implementadas

#### Controlo de altura do gráfico

**Funcionalidade:** Adicionados botões para aumentar/diminuir a altura do gráfico.

**Detalhes:**
- Altura mínima: 300px
- Altura máxima: 900px
- Incremento: 100px por clique
- Altura padrão: 500px
- Indicador visual da altura atual

**Arquivos modificados:**
- `client/src/pages/ICMarketsDashboard.tsx` (linhas 96, 542-562)

---

### Resumo Técnico das Alterações

| Arquivo | Alteração |
|---------|-----------|
| `SmartChart.tsx` | Refatoração completa dos useEffects para separar inicialização de desenho |
| `ICMarketsDashboard.tsx` | Redução de intervalos de polling + controles de altura |

### Notas para Deploy

1. O build do cliente foi testado e compila sem erros
2. As alterações são retrocompatíveis
3. Não há alterações no backend ou banco de dados
4. O Railway deve fazer o redeploy automaticamente ao detectar o push

### Próximos Passos Recomendados

1. **Streaming WebSocket real:** Para uma experiência ainda mais fluida, considerar implementar `ProtoOASubscribeLiveTrendbarReq` da cTrader API para receber candles via WebSocket em vez de polling
2. **Persistência de preferências:** Guardar a altura preferida do gráfico no localStorage
3. **Linhas de tendência:** A funcionalidade de linhas de tendência ainda não renderiza visualmente no gráfico (apenas guarda os dados)
