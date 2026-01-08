# Auditoria Estática de Execução - cTrader API

## Data: 2026-01-08

---

## 1. MAPEAMENTO DE SÍMBOLOS (Symbol Suffix)

### Análise do Código

**Localização:** `server/adapters/CTraderAdapter.ts`

**Mecanismo de Mapeamento:**
- O sistema carrega a lista de símbolos diretamente da API cTrader via `loadAvailableSymbols()`
- Usa `client.getSymbolsList()` que retorna os símbolos disponíveis na conta
- Cria dois mapas:
  - `symbolIdMap`: nome → ID (ex: "XAUUSD" → 41)
  - `symbolIdToNameMap`: ID → nome (mapa reverso)

**Código Relevante (linhas 870-922):**
```typescript
private async loadAvailableSymbols(): Promise<void> {
  const symbols = await this.client.getSymbolsList();
  this.availableSymbols = symbols.map(s => s.symbolName);
  
  for (const symbol of symbols) {
    this.symbolIdMap.set(symbol.symbolName, symbol.symbolId);
    this.symbolIdToNameMap.set(symbol.symbolId, symbol.symbolName);
  }
}
```

**Função getSymbolId (linhas 928-941):**
```typescript
private async getSymbolId(symbolName: string): Promise<number> {
  if (this.symbolIdMap.has(symbolName)) {
    return this.symbolIdMap.get(symbolName)!;
  }
  
  await this.loadAvailableSymbols();
  
  if (this.symbolIdMap.has(symbolName)) {
    return this.symbolIdMap.get(symbolName)!;
  }
  
  throw new Error(`Símbolo não encontrado: ${symbolName}`);
}
```

### Diagnóstico

**✅ PONTO POSITIVO:**
- O sistema carrega os símbolos dinamicamente da API
- Não usa sufixos hardcoded
- Logs de debug mostram o mapeamento correto nos logs do Railway

**⚠️ POTENCIAL PROBLEMA:**
- Se a corretora usar sufixos (ex: XAUUSD.pro), o sistema deve receber esse nome da API
- O código NÃO faz normalização de sufixos
- Se o sinal vier com "XAUUSD" mas a API retornar "XAUUSD.pro", haverá mismatch

**Evidência dos Logs:**
```
[CTraderClient] [SPOT] Tick válido para XAUUSD: Bid=4463.6, Ask=4463.65
```
- Os logs mostram que XAUUSD está a funcionar sem sufixo
- Isso indica que a conta IC Markets não requer sufixos

### Recomendação
- **BAIXO RISCO** - O mapeamento está correto para a conta atual
- Adicionar fallback com sufixos comuns (.pro, .ecn, +) se símbolo não for encontrado

---

## 2. NORMALIZAÇÃO DE VOLUME (Lot Size)

### Análise do Código

**Localização:** `server/adapters/ctrader/RiskManager.ts`

**Função calculatePositionSize (linhas 189-237):**
```typescript
calculatePositionSize(
  accountBalance: number,
  stopLossPips: number,
  pipValue: number
): PositionSizeCalculation {
  // Calcular risco em USD
  const riskAmount = accountBalance * (this.config.riskPercentage / 100);
  
  // Calcular tamanho do lote
  let lotSize = riskAmount / (stopLossPips * pipValue);
  
  // Arredondar para step de 0.01 (micro lote)
  lotSize = Math.floor(lotSize * 100) / 100;
  
  // Limitar entre 0.01 e 10 lotes
  lotSize = Math.max(0.01, Math.min(10, lotSize));
  
  return { lotSize, ... };
}
```

**Conversão no CTraderClient (linhas 835-836):**
```typescript
// Volume em 0.01 de unidade (1000 = 10.00 lotes)
const volumeInProtocol = Math.round(volume * 100);
```

### Diagnóstico

**⚠️ PROBLEMA IDENTIFICADO:**

1. **Step fixo de 0.01:**
   - O código assume step de 0.01 (micro lote)
   - Não consulta o `stepVolume` do símbolo na API
   - Se XAUUSD tiver step diferente (ex: 0.1), pode gerar volume inválido

2. **Limites hardcoded:**
   - Mínimo: 0.01 lotes
   - Máximo: 10 lotes
   - Não consulta `minVolume` e `maxVolume` da API

3. **Teste Mock (conta $1000, risco 1%):**
   ```
   riskAmount = 1000 * 0.01 = $10
   Se SL = 20 pips e pipValue = $10/pip (para 1 lote XAUUSD):
   lotSize = 10 / (20 * 10) = 0.05 lotes
   
   Arredondado: 0.05 lotes (válido se step = 0.01)
   ```

**❌ PROBLEMA CRÍTICO:**
- O código não valida se o volume calculado é aceite pela corretora
- Se `minVolume` for 0.1 e o cálculo der 0.05, a ordem será rejeitada

### Recomendação
- **ALTO RISCO** - Implementar validação de volume contra specs do símbolo
- Consultar `symbolInfo.minVolume`, `symbolInfo.maxVolume`, `symbolInfo.stepVolume`
- Arredondar para o step correto do símbolo

---

## 3. PERMISSÕES DO TOKEN (Scope)

### Análise do Código

**Localização:** `drizzle/icmarkets-config.ts`

**Credenciais armazenadas no banco:**
```typescript
clientId: varchar("clientId", { length: 100 }),
clientSecret: text("clientSecret"),
accessToken: text("accessToken"),
refreshToken: text("refreshToken"),
tokenExpiresAt: timestamp("tokenExpiresAt"),
```

### Diagnóstico

**⚠️ NÃO É POSSÍVEL VERIFICAR DIRETAMENTE:**
- O scope do token é definido no momento da autorização OAuth
- Não há como verificar o scope programaticamente após a emissão
- O token está armazenado no banco de dados (encriptado)

**Verificação Indireta:**
- Se o token tiver apenas scope de "View", a ordem retornará erro
- O código atual NÃO verifica o scope antes de tentar executar

**Evidência do Problema Original:**
```
Ordem executada: ORD... @ undefined
```
- `executionPrice = undefined` indica que a API não retornou dados de execução
- Possíveis causas:
  1. Token sem permissão de trading
  2. Resposta da API vazia
  3. Erro silencioso na API

### Código de Tratamento de Resposta (linhas 614-635):
```typescript
// DEBUG: Log completo da resposta da API para diagnóstico
console.log("[CTraderAdapter] [DEBUG] Resposta completa da API cTrader:");
console.log(JSON.stringify(response, null, 2));

// Verificar se há erro na resposta
if (response.errorCode) {
  console.error(`[CTraderAdapter] ❌ Erro da API cTrader: ${response.errorCode}`);
  return { success: false, errorMessage: ... };
}

// Verificar se a posição foi criada
if (!response.position && !response.deal) {
  console.error("[CTraderAdapter] ❌ Resposta da API não contém position nem deal!");
  return { success: false, errorMessage: ... };
}
```

### Recomendação
- **MÉDIO RISCO** - Verificar manualmente no painel cTrader se o token tem scope "Trading"
- O código já tem diagnóstico para detectar respostas vazias
- Aguardar próximo sinal para ver os logs detalhados

---

## RESUMO DO DIAGNÓSTICO

| Ponto | Status | Risco | Ação Recomendada |
|-------|--------|-------|------------------|
| Mapeamento de Símbolos | ✅ OK | Baixo | Adicionar fallback com sufixos |
| Normalização de Volume | ⚠️ Problema | **Alto** | Validar contra specs do símbolo |
| Permissões do Token | ❓ Não verificável | Médio | Verificar manualmente no painel |

---

## CAUSA PROVÁVEL DO ERRO "@ undefined"

Com base na análise, a causa mais provável é:

1. **Volume inválido** - O lote calculado pode estar fora dos limites do símbolo
2. **Token sem permissão** - Menos provável se a conexão está ativa
3. **Resposta vazia da API** - O código agora tem diagnóstico para isso

O código atual (após o commit "fix: Adicionar diagnóstico detalhado") já inclui:
- Log completo da resposta JSON
- Verificação de `errorCode`
- Verificação de `position` e `deal`

**Próximo passo:** Aguardar um novo sinal e verificar os logs detalhados no Railway.

