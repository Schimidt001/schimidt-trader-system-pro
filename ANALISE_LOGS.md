# Análise dos Logs do Railway - Problema "Sinal Preso"

## Observações dos Logs

### 1. Sweeps Detectados Corretamente
Os logs mostram que os Sweeps estão sendo detectados corretamente:
- `[SMC] Razão: Swings H1: 5 highs, 7 lows | Sweep HIGH confirmado em 4477.36000 | Aguardando CHoCH (min: 2.0 pips)`
- `[SMC] Razão: Swings H1: 3 highs, 5 lows | Sweep LOW confirmado em 1.34040 | Aguardando CHoCH (min: 2.0 pips)`

### 2. CHoCH Check Logs - PROBLEMA IDENTIFICADO
Os logs de DEBUG mostram verificações de CHoCH que **NUNCA são confirmadas**:
- `[DEBUG] XAUUSD | CHoCH BEARISH Check | SwingLow: 4481.62000 | Close: 4496.91000`
- `[DEBUG] AUDUSD | CHoCH BULLISH Check | SwingHigh: 0.66889 | Close: 0.66857`
- `[DEBUG] EURUSD | CHoCH BULLISH Check | SwingHigh: 1.16400 | Close: 1.16355`

### 3. Problema Principal Identificado
**O preço de fechamento (Close) NUNCA ultrapassa o SwingPoint necessário para confirmar o CHoCH!**

Exemplo XAUUSD:
- SwingLow: 4481.62000
- Close: 4496.91000
- Para CHoCH BEARISH: Close deveria ser < SwingLow (4481.62000)
- Diferença: 4496.91 - 4481.62 = **15.29 pontos ACIMA do SwingLow**

Exemplo EURUSD:
- SwingHigh: 1.16400
- Close: 1.16355
- Para CHoCH BULLISH: Close deveria ser > SwingHigh (1.16400)
- Diferença: 1.16400 - 1.16355 = **0.00045 (4.5 pips) ABAIXO do SwingHigh**

### 4. Casos com CHoCH Detectado
Alguns pares mostram CHoCH detectado:
- `[SMC] Razão: Swings H1: 4 highs, 2 lows | Sweep HIGH confirmado em 157.73700 | CHoCH BEARISH em 157.99100 | OB: 158.06000-157.99900 | Dist: 13.1 pips`
- `[SMC] Razão: Swings H1: 4 highs, 3 lows | Sweep HIGH confirmado em 211.60200 | CHoCH BEARISH em 211.73200 | OB: 211.84800-211.76800 | Dist: 11.5 pips`

**MAS** mesmo com CHoCH detectado e Order Block identificado, o sinal final é NONE porque:
1. O preço não retorna à zona do Order Block
2. Ou não há confirmação de entrada (candle de rejeição/engolfo)

### 5. Problema da Função findLastSwingInArray
A função `findLastSwingInArray` usa `leftBars = 2` e `rightBars = 2` **hardcoded**, diferente da configuração principal que usa `fractalLeftBars = 1` e `fractalRightBars = 1`.

Isso significa que o CHoCH está a procurar swing points com critérios MAIS RESTRITIVOS que a detecção de Sweep!

## Conclusões

1. **Bug Principal**: A função `findLastSwingInArray` usa valores hardcoded (2,2) em vez dos valores configurados (1,1)
2. **Falta de Log de Rejeição**: Quando o CHoCH não é confirmado, não há log explicando o motivo
3. **Problema de Distância ao OB**: Mesmo quando CHoCH é detectado, a distância ao OB é grande (11-13 pips)

## Correções Necessárias

1. Usar os valores de configuração `fractalLeftBars` e `fractalRightBars` na função `findLastSwingInArray`
2. Adicionar logs de rejeição detalhados no CHoCH
3. Verificar se os swing points do CHoCH estão alinhados com os da detecção de Sweep
