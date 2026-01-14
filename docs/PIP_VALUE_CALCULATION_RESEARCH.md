# Pesquisa: Cálculo Correto de Pip Value Monetário

## Problema Identificado

O código atual usa `getPipValue()` que retorna o **tamanho do pip em termos de movimento de preço** (ex: 0.01 para EURJPY), mas a fórmula de cálculo de lote precisa do **valor monetário de 1 pip por lote standard** em USD.

## Fórmulas Corretas

### Para pares com USD como moeda de cotação (EURUSD, GBPUSD, etc.)
```
Pip Value (USD) = Lot Size × Pip Size
Pip Value (USD) = 100,000 × 0.0001 = $10 por lote standard
```

### Para pares JPY (USDJPY, EURJPY, GBPJPY, etc.)
```
Pip Value (USD) = (Lot Size × Pip Size) / Taxa de Conversão
Pip Value (USD) = (100,000 × 0.01) / USDJPY_Rate
```

**Exemplo EURJPY com USDJPY = 159.00:**
```
Pip Value (USD) = (100,000 × 0.01) / 159.00
Pip Value (USD) = 1000 / 159.00 = $6.29 por lote standard
```

### Para pares cross sem USD (EURGBP, AUDNZD, etc.)
```
Pip Value (USD) = (Lot Size × Pip Size) × Taxa de Conversão
```
Onde a taxa de conversão é o par XXX/USD onde XXX é a moeda de cotação.

## Valores Típicos de Pip por Lote Standard (conta USD)

| Par | Pip Value (USD/lote) |
|-----|---------------------|
| EURUSD | $10.00 |
| GBPUSD | $10.00 |
| USDJPY | ~$6.29 (varia com taxa) |
| EURJPY | ~$6.29 (varia com taxa) |
| GBPJPY | ~$6.29 (varia com taxa) |
| XAUUSD | ~$10.00 (por 0.10 de movimento) |

## Erro no Código Atual

```typescript
// ERRADO - usa movimento de preço, não valor monetário
const pipValue = getPipValue("EURJPY"); // Retorna 0.01

// Fórmula com valor errado
lotSize = $10.06 / (6.8 * 0.01) = 147.9 lotes ❌

// CORRETO - deve usar valor monetário por lote
const pipValueUSD = calculateMonetaryPipValue("EURJPY", usdjpyRate); // ~$6.29

// Fórmula correta
lotSize = $10.06 / (6.8 * 6.29) = 0.24 lotes ✅
```

## Solução Proposta

Criar uma nova função `calculateMonetaryPipValue()` que:
1. Identifica o tipo de par (USD cotação, JPY, cross)
2. Obtém a taxa de conversão necessária da API
3. Calcula o valor monetário do pip em USD por lote standard
4. Retorna o valor correto para uso na fórmula de position sizing

## Referências

- EarnForex Pip Value Formula: https://www.earnforex.com/guides/pip-value-formula/
- cTrader Open API Tick Value: https://spotware.github.io/OpenAPI.Net/calculating-symbol-tick-value/
- cTrader Help P&L Calculation: https://help.ctrader.com/open-api/profit-loss-calculation/
