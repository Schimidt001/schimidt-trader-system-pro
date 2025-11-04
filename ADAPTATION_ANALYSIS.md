# Análise de Adaptação: Relatório de Parâmetros Otimizados → IA Hedge Dinâmica

**Data**: 04 de Novembro de 2025
**Analista**: Manus AI

---

## 🎯 Problema Identificado

### **Contexto do Relatório do Usuário**
- ⏱️ **Entrada fixa**: Aos 12 minutos do candle
- 🎯 **Janela de decisão**: Últimos 3 minutos (minutos 13, 14, 15 absolutos)
- 📊 **Análise**: 877 candles de 15 minutos
- 🛡️ **Função**: Hedge após 12 minutos

### **Contexto Real da Plataforma**
- ⏱️ **Entrada CONFIGURÁVEL**: Parâmetro `waitTime` (padrão: 8 minutos, mas pode ser 1-14)
- 🎯 **Janela de hedge**: Relativa ao tempo de entrada + margem
- 📊 **Análise**: Baseada em `elapsedSeconds` desde início do candle
- 🛡️ **Função**: Hedge após entrada (tempo variável)

### **Conflito Crítico**
O relatório usa **minutos absolutos fixos** (1, 2, 3 dos últimos 3 minutos), mas a plataforma precisa de **minutos relativos dinâmicos** porque:
1. `waitTime` é configurável (1-14 minutos)
2. Entrada pode acontecer em qualquer minuto
3. IA Hedge precisa trabalhar nos "últimos 3 minutos" **independente de quando entrou**

---

## 🔍 Análise Técnica da Plataforma

### **Como o Bot Funciona Atualmente**

```typescript
// 1. Bot aguarda waitTime configurável (padrão: 8 min)
if (elapsedSeconds >= this.waitTime * 60) {
  await this.makePrediction(elapsedSeconds);
}

// 2. Após predição, entra em posição (ARMED → ENTERED)
// Tempo de entrada = waitTime + tempo até gatilho ser atingido

// 3. IA Hedge analisa entre analysisStartMinute e analysisEndMinute
if (elapsedSeconds >= this.hedgeConfig.analysisStartMinute * 60 &&
    elapsedSeconds <= this.hedgeConfig.analysisEndMinute * 60) {
  const decision = analyzePositionForHedge({
    elapsedMinutes: elapsedSeconds / 60, // MINUTOS ABSOLUTOS DO CANDLE
    ...
  });
}
```

### **Problema com Minutos Absolutos**

Se `waitTime = 8` min (padrão):
- Entrada: ~8-9 min
- Hedge deveria analisar: minutos 12-15 (últimos 3-4 min) ✅

Se `waitTime = 12` min (como no relatório):
- Entrada: ~12-13 min
- Hedge deveria analisar: minutos 13-15 (últimos 2-3 min) ✅

Se `waitTime = 5` min (configuração agressiva):
- Entrada: ~5-6 min
- Hedge deveria analisar: minutos 12-15 (últimos 3-4 min) ❌ **ERRADO!**
  - Hedge estaria analisando 6-7 minutos **APÓS** a entrada
  - Não são os "últimos 3 minutos" do candle

---

## 💡 Solução: Parâmetros Relativos ao Fim do Candle

### **Conceito Chave**
O relatório descobriu que os **últimos 3 minutos** (13-15) são críticos. Isso significa:
- **Minuto 13** = 2 minutos antes do fim (15 - 2 = 13)
- **Minuto 14** = 1 minuto antes do fim (15 - 1 = 14)
- **Minuto 15** = último minuto (15 - 0 = 15)

### **Mapeamento Correto**

| Parâmetro do Relatório | Significado Real | Valor Absoluto Correto |
|------------------------|------------------|------------------------|
| `reversalDetectionMinute = 1` | 1º dos últimos 3 min | **Minuto 13** (15 - 2) |
| `pullbackDetectionStart = 1` | 1º dos últimos 3 min | **Minuto 13** (15 - 2) |
| `pullbackDetectionEnd = 3` | 3º dos últimos 3 min | **Minuto 15** (15 - 0) |
| `edgeReversalMinute = 1` | 1º dos últimos 3 min | **Minuto 13** (15 - 2) |

### **Fórmula de Conversão**

```typescript
// Relatório usa: "minuto X dos últimos 3"
// Plataforma precisa: "minuto absoluto do candle de 15 min"

const CANDLE_DURATION = 15; // minutos
const HEDGE_WINDOW_START = 13; // início dos "últimos 3 minutos"

// Converter "minuto relativo dos últimos 3" para "minuto absoluto"
function convertToAbsoluteMinute(relativeMinute: number): number {
  // relativeMinute = 1 → minuto 13 (primeiro dos últimos 3)
  // relativeMinute = 2 → minuto 14 (segundo dos últimos 3)
  // relativeMinute = 3 → minuto 15 (terceiro dos últimos 3)
  return HEDGE_WINDOW_START + (relativeMinute - 1);
}
```

---

## 🎯 Parâmetros Adaptados para a Plataforma

### **Perfil Equilibrado (Baseado no Relatório)**

```typescript
{
  // Estratégia 1: Detecção de Reversão
  reversalDetectionMinute: 13.0,        // Minuto 13 absoluto (1º dos últimos 3)
  reversalThreshold: 0.0004,            // 0.04% (valor do relatório)
  reversalStakeMultiplier: 1.5,        // 1.5x (valor do relatório)
  
  // Estratégia 2: Reforço em Pullback
  pullbackDetectionStart: 13.0,        // Minuto 13 absoluto (1º dos últimos 3)
  pullbackDetectionEnd: 15.0,          // Minuto 15 absoluto (3º dos últimos 3)
  pullbackMinProgress: 0.0002,         // 0.02% (valor do relatório)
  pullbackMaxProgress: 0.0011,         // 0.11% (valor do relatório)
  pullbackStakeMultiplier: 1.4,       // 1.4x (valor do relatório)
  
  // Estratégia 3: Reversão de Ponta
  edgeReversalMinute: 13.0,            // Minuto 13 absoluto (1º dos últimos 3)
  edgeExtensionThreshold: 0.0045,      // 0.45% (valor do relatório)
  edgeStakeMultiplier: 1.5,            // Não especificado, usando reversalStakeMultiplier
  
  // Janela geral de análise
  analysisStartMinute: 13.0,           // Início dos últimos 3 minutos
  analysisEndMinute: 15.0              // Fim do candle
}
```

---

## ⚠️ Limitações e Considerações

### **1. Independência do waitTime**
✅ **RESOLVIDO**: Ao usar minutos absolutos 13-15, a IA Hedge sempre analisa os últimos 3 minutos, **independente** de quando o bot entrou.

### **2. Risco de Entrada Tardia**
⚠️ **ATENÇÃO**: Se `waitTime > 12`, o bot pode entrar **DEPOIS** do início da janela de hedge (minuto 13).

**Exemplo:**
- `waitTime = 13` min
- Bot faz predição aos 13 min
- Gatilho atingido aos 13.5 min
- Posição aberta aos 13.5 min
- IA Hedge começa a analisar aos 13 min (já passou!)

**Solução**: A IA Hedge já tem proteção:
```typescript
if (elapsedSeconds >= this.hedgeConfig.analysisStartMinute * 60 &&
    elapsedSeconds <= this.hedgeConfig.analysisEndMinute * 60) {
  // Só analisa se estiver na janela
}
```
Se a posição for aberta após o minuto 13, a IA Hedge ainda terá os minutos 14-15 para agir.

### **3. Thresholds em Formato Decimal**
⚠️ **CONVERSÃO NECESSÁRIA**: O relatório usa porcentagens (0.04%), mas o código pode esperar decimais (0.0004).

**Verificação necessária**: Confirmar como `reversalThreshold` é usado no código:
```typescript
// Se o código faz: currentChange > reversalThreshold
// E currentChange = 0.0004 (0.04% em decimal)
// Então reversalThreshold deve ser 0.0004 (não 0.04)
```

---

## 📋 Checklist de Implementação

### **Fase 1: Validação de Formato**
- [ ] Verificar se thresholds são em decimal (0.0004) ou porcentagem (0.04)
- [ ] Confirmar se multiplicadores são aplicados corretamente
- [ ] Testar com `waitTime = 8` (padrão)
- [ ] Testar com `waitTime = 12` (como no relatório)
- [ ] Testar com `waitTime = 5` (agressivo)

### **Fase 2: Aplicação dos Parâmetros**
- [ ] Atualizar `DEFAULT_HEDGE_CONFIG` com valores do relatório
- [ ] Converter minutos relativos (1, 2, 3) para absolutos (13, 14, 15)
- [ ] Aplicar thresholds otimizados (0.04%, 0.02-0.11%, 0.45%)
- [ ] Aplicar multiplicadores otimizados (1.5x, 1.4x)

### **Fase 3: Testes**
- [ ] Simular 10 candles com entrada aos 8 min
- [ ] Simular 10 candles com entrada aos 12 min
- [ ] Verificar se hedge sempre age nos minutos 13-15
- [ ] Validar que decisões são tomadas no minuto 13 (79.63% das reversões)

---

## ✅ Recomendação Final

**Aplicar os parâmetros do relatório com conversão para minutos absolutos 13-15.**

Isso garante que:
1. ✅ A IA Hedge sempre analisa os "últimos 3 minutos" (13-15)
2. ✅ Funciona independente do `waitTime` configurado
3. ✅ Aproveita os insights do relatório (79.63% das reversões no minuto 13)
4. ✅ Mantém a flexibilidade de configuração da plataforma

**Próximo passo**: Implementar os valores adaptados no código.
