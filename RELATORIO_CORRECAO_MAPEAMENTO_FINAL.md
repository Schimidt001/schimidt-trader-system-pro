# Relatório de Correção: Mapeamento de Símbolos cTrader

**Autor:** Manus AI
**Data:** 07 de Janeiro de 2026
**Status:** Concluído

## 1. Visão Geral

Este relatório detalha a correção implementada no sistema de trading automatizado para resolver o problema de mapeamento de IDs de símbolos (`symbolId`) para nomes de ativos (ex: `XAUUSD`) na integração com a API da cTrader. O problema impedia o sistema de processar corretamente os ticks de preço recebidos, resultando no descarte de dados de mercado essenciais.

## 2. Análise do Problema

O sistema estava recebendo pacotes de preço (spot) da API da cTrader, como evidenciado pelos logs `[CTraderClient] [SPOT] Tick recebido para ID:41`. No entanto, o `CTraderAdapter` não conseguia traduzir o `symbolId` numérico para o nome do ativo correspondente, gerando o erro `[CTraderAdapter] Tick recebido para symbolId desconhecido: 41`.

### Causa Raiz

A investigação do código-fonte, principalmente dos arquivos `CTraderAdapter.ts` e `CTraderClient.ts`, revelou os seguintes pontos críticos:

- **Condição de Corrida (Race Condition):** Os eventos de tick (`spotEvent`) estavam sendo recebidos pelo `CTraderAdapter` antes que o processo de carregamento e mapeamento de símbolos (`loadAvailableSymbols`) fosse totalmente concluído. Isso resultava em consultas a mapas que ainda estavam vazios.

- **Falta de um Mapa Reverso Eficiente:** O `CTraderAdapter` possuía um mapa `symbolIdMap` para a conversão de `Nome -> ID`, mas não dispunha de um mapa reverso (`ID -> Nome`) para uma busca rápida e eficiente. A tentativa de encontrar o nome do símbolo por ID era feita através de uma iteração custosa (`O(n)`) sobre o mapa `symbolIdMap`, o que é ineficiente e suscetível a falhas se o mapa não estiver populado.

- **Sincronização Incompleta:** A lógica não garantia que, uma vez que um símbolo fosse subscrito, seu mapeamento ID-Nome estivesse imediatamente disponível e sincronizado no `CTraderAdapter` para o processamento dos ticks subsequentes.

## 3. Solução Implementada

Para resolver a questão de forma robusta e definitiva, foram realizadas as seguintes modificações no arquivo `server/adapters/CTraderAdapter.ts`:

### 3.1. Criação de um Mapa Reverso

Foi introduzido um novo mapa, `symbolIdToNameMap`, para armazenar o mapeamento reverso de `ID -> Nome`, permitindo consultas de alta performance (`O(1)`).

```typescript
// Símbolos disponíveis
private availableSymbols: string[] = [];
private symbolIdMap: Map<string, number> = new Map();
private symbolIdToNameMap: Map<number, string> = new Map(); // Mapa reverso: ID -> Nome
```

### 3.2. Lógica de Resolução de Símbolos Aprimorada

O método `handleSpotEvent` foi reestruturado para consultar múltiplas fontes em uma ordem de prioridade lógica, garantindo a máxima chance de resolução do ID do símbolo.

```typescript
// Ordem de busca no handleSpotEvent:
// 1. Tentar mapa reverso local primeiro (O(1))
symbolName = this.symbolIdToNameMap.get(spotEvent.symbolId);

// 2. Tentar mapa do CTraderClient
if (!symbolName) {
  symbolName = this.client.getSymbolNameById(spotEvent.symbolId);
  if (symbolName) {
    this.symbolIdToNameMap.set(spotEvent.symbolId, symbolName);
  }
}

// 3. Tentar mapa de subscrições ativas (symbolSubscriptions)
// ... (lógica de iteração e sincronização)

// 4. Fallback: busca iterativa no symbolIdMap
// ... (lógica de iteração e sincronização)
```

### 3.3. Sincronização Durante o Carregamento e Subscrição

- O método `loadAvailableSymbols` foi modificado para popular **ambos** os mapas (`symbolIdMap` e `symbolIdToNameMap`) simultaneamente, garantindo a consistência dos dados desde o início.

- O método `subscribePrice` agora garante que, no momento da subscrição de um ativo, o mapeamento reverso (`ID -> Nome`) seja imediatamente inserido no `symbolIdToNameMap`, eliminando a condição de corrida.

```typescript
// Em subscribePrice()
const symbolId = await this.getSymbolId(symbol);

// Garantir que o mapa reverso tenha esta entrada (CRÍTICO para handleSpotEvent)
this.symbolIdToNameMap.set(symbolId, symbol);
```

### 3.4. Otimização da Busca Reversa

O método `getSymbolNameById` foi otimizado para utilizar primariamente o novo mapa reverso, recorrendo à iteração apenas como um mecanismo de fallback.

## 4. Validação e Resultado Esperado

As alterações foram validadas com o compilador TypeScript (`tsc`), que não apontou erros de sintaxe ou tipo. O código foi devidamente versionado e enviado ao repositório GitHub do projeto.

Com esta correção, o resultado esperado é a completa resolução dos IDs de símbolos. O log de erro:

> [CTraderAdapter] Tick recebido para symbolId desconhecido: 41

Deverá ser substituído pelo log de sucesso, conforme o objetivo final:

> [CTraderAdapter] Tick recebido para XAUUSD: Bid=4430.68, Ask=4430.73

Isso permitirá que o robô reconheça os preços corretamente e execute as operações de trading pendentes conforme sua lógica estratégica.
