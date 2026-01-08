# Diagnóstico Prévio de Execução (cTrader API)

**Data da Análise:** 08 de janeiro de 2026
**Autor:** Manus AI

## 1. Introdução

Este documento apresenta os resultados de uma auditoria estática de código e análise de logs, focada em três pontos críticos que frequentemente causam falhas silenciosas na execução de ordens via cTrader API. O objetivo é diagnosticar a causa do erro `Ordem executada: ORD... @ undefined`, onde a API não retornou uma confirmação de preço na execução.

## 2. Resumo do Diagnóstico

A análise revelou uma falha crítica na lógica de cálculo de volume e a ausência de verificação de permissões do token, que são as causas mais prováveis para a falha de execução. O mapeamento de símbolos, por outro lado, parece estar a funcionar corretamente.

| Ponto Crítico | Status | Risco | Causa Provável do Erro? |
| :--- | :--- | :--- | :--- |
| **1. Mapeamento de Símbolos** | ✅ **Adequado** | Baixo | Não |
| **2. Normalização de Volume** | ❌ **Crítico** | **Alto** | **Sim** |
| **3. Permissões do Token** | ⚠️ **Não Verificado** | Médio | **Sim** |

---

## 3. Análise Detalhada

### 3.1. Mapeamento de Símbolos (Symbol Suffix)

**Diagnóstico:** O sistema está a utilizar um método robusto para o mapeamento de símbolos. A função `loadAvailableSymbols` no `CTraderAdapter` carrega dinamicamente a lista de todos os símbolos disponíveis diretamente da conta da corretora, incluindo os seus nomes exatos e IDs numéricos. Este mecanismo evita o uso de nomes de símbolos "hardcoded" e adapta-se automaticamente a qualquer sufixo que a corretora possa exigir (ex: `XAUUSD.pro`).

**Evidência:** Os logs do Railway confirmam que o sistema está a receber cotações (ticks) para `XAUUSD` sem qualquer sufixo, indicando que a configuração atual da conta não os requer. O código não apresenta erros de mapeamento para os símbolos em operação.

> **Conclusão:** O mapeamento de símbolos **não é** a causa do erro de execução.

### 3.2. Normalização de Volume (Lot Size)

**Diagnóstico:** Foi identificado um **problema crítico** na função `calculatePositionSize` dentro do `RiskManager.ts`. A lógica atual calcula o tamanho do lote e arredonda-o para um valor fixo de 2 casas decimais (step de 0.01), assumindo que este é o padrão para todos os ativos. No entanto, o código **não consulta** as especificações do símbolo (`ProtoOASymbol`) fornecidas pela API para validar o volume.

De acordo com a documentação oficial da cTrader API [1], cada símbolo possui os seus próprios limites de volume:

- `minVolume`: O volume mínimo permitido para uma ordem.
- `maxVolume`: O volume máximo permitido.
- `stepVolume`: O incremento de volume obrigatório.

Todos estes valores são expressos em "céntimos" de lote (1 = 0.01 lote).

**Causa Provável do Erro:** Se a função `calculatePositionSize` gerar um lote de `0.05` para um símbolo como XAUUSD, mas o `minVolume` exigido pela corretora for `10` (equivalente a 0.10 lotes), a API da cTrader rejeitará a ordem. Como o código de tratamento de erro não estava a capturar esta rejeição de forma explícita, a resposta da API pode ter sido vazia ou conter um código de erro que não foi processado, resultando no `executionPrice` como `undefined`.

> **Conclusão:** A falha na normalização do volume é a **causa mais provável** do erro de execução silenciosa. É uma falha crítica que precisa de ser corrigida.

### 3.3. Permissões do Token (Scope)

**Diagnóstico:** O `access_token` utilizado para autenticação na cTrader API possui "scopes" (escopos) que definem as permissões concedidas. Para executar ordens, o token **deve** ter o scope `SCOPE_TRADE`. Se tiver apenas `SCOPE_VIEW`, a conexão será bem-sucedida, a receção de cotações funcionará, mas qualquer tentativa de negociação será rejeitada pela API.

O código atual não tem uma forma de verificar programaticamente o scope do token. Esta verificação é tipicamente feita no momento da geração do token no website da cTrader ou através da análise da resposta de erro da API ao tentar executar uma ordem.

**Causa Provável do Erro:** Se o token em uso não tiver permissões de `Trading`, a API rejeitará a ordem. Semelhante ao problema de volume, se o tratamento de erro não for específico para este cenário, pode resultar numa resposta vazia e, consequentemente, no log `Ordem executada: ORD... @ undefined`.

> **Conclusão:** Um token com permissões incorretas é uma **causa provável e comum** para este tipo de erro. A verificação do scope é um passo essencial.

---

## 4. Recomendações e Próximos Passos

Para resolver a falha de execução e robustecer o sistema, recomendo as seguintes ações, por ordem de prioridade:

1.  **Corrigir a Normalização de Volume (Urgente):**
    -   Modificar a interface `SymbolInfo` e a função `getSymbolsList` no `CTraderClient.ts` para obter e armazenar `minVolume`, `maxVolume`, e `stepVolume` para cada símbolo.
    -   Atualizar a função `calculatePositionSize` no `RiskManager.ts` para receber as especificações de volume do símbolo como argumento.
    -   Dentro da função, após calcular o `lotSize`, adicionar uma lógica para **validar e ajustar** o volume de acordo com os limites (`minVolume`, `maxVolume`) e arredondá-lo corretamente usando o `stepVolume`.

2.  **Verificar as Permissões do Token:**
    -   Aceder à área de gestão de API no website da cTrader onde o token foi gerado.
    -   Confirmar que a aplicação associada ao `clientId` e `accessToken` em uso tem a permissão de **"Trading"** ativa, e não apenas "Leitura" (View).

3.  **Melhorar o Tratamento de Erros de Execução:**
    -   Na função `placeOrder` do `CTraderAdapter.ts`, expandir o bloco `catch` e a análise da `response` para identificar códigos de erro específicos da cTrader (ex: `INVALID_VOLUME`, `NO_TRADING_PERMISSION`) e gerar logs mais descritivos.

Após a implementação destas correções, o sistema estará mais resiliente e as futuras falhas de execução fornecerão mensagens de erro claras, permitindo um diagnóstico rápido e eficaz.

## 5. Referências

[1] cTrader. (2026). *Open API Model Messages - ProtoOASymbol*. Acedido em 08 de janeiro de 2026, em [https://help.ctrader.com/open-api/model-messages/#protooasymbol](https://help.ctrader.com/open-api/model-messages/#protooasymbol)
