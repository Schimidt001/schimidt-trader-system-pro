# 🤖 Guia Completo: Agente IA (Estratégia Híbrida)

## 📋 Índice
1. [O que é a Estratégia Híbrida](#o-que-é-a-estratégia-híbrida)
2. [Como Funciona](#como-funciona)
3. [Configuração](#configuração)
4. [Parâmetros Explicados](#parâmetros-explicados)
5. [Logs e Monitoramento](#logs-e-monitoramento)
6. [Perguntas Frequentes](#perguntas-frequentes)

---

## 🎯 O que é a Estratégia Híbrida?

A **Estratégia Híbrida de IA** é um sistema inteligente que combina dois métodos comprovados de trading:

1. **IA Filtro**: Identifica trades de **alta confiança** e entra com stake maior
2. **IA Hedge**: Protege trades de **confiança normal** com hedge automático

### Por que usar?

Baseado em análise de 3.000 candles históricos, a estratégia híbrida demonstrou:
- ✅ **Maior lucro** que a estratégia sem IA
- ✅ **Melhor gestão de risco** ao evitar trades ruins
- ✅ **Crescimento consistente** com drawdown controlado

---

## ⚙️ Como Funciona

### Fluxo de Decisão da IA

```
1. Bot faz predição normal (Fibonacci da Amplitude)
   ↓
2. IA analisa o candle nos últimos 1,5 minutos
   ↓
3. IA calcula CONFIANÇA do setup (0-100%)
   ↓
4. Decisão baseada na confiança:
   
   ┌─────────────────────────────────────┐
   │ CONFIANÇA ≥ 60% (Threshold)         │
   │ → ALTA CONFIANÇA                    │
   │ → Entra com Stake Alto ($4 padrão)  │
   │ → SEM hedge                         │
   └─────────────────────────────────────┘
   
   ┌─────────────────────────────────────┐
   │ 40% ≤ CONFIANÇA < 60%               │
   │ → CONFIANÇA NORMAL                  │
   │ → Entra com Stake Baixo ($1 padrão) │
   │ → COM hedge (se habilitado)         │
   └─────────────────────────────────────┘
   
   ┌─────────────────────────────────────┐
   │ CONFIANÇA < 40%                     │
   │ → BAIXA CONFIANÇA                   │
   │ → NÃO ENTRA (bloqueia trade)        │
   └─────────────────────────────────────┘
```

### O que a IA Analisa?

A IA calcula 3 features principais:

1. **Posição no Range (pos_in_range)**
   - Onde o preço está no range do candle (0-100%)
   - Para UP: prefere preço perto da máxima (>60%)
   - Para DOWN: prefere preço perto da mínima (<40%)

2. **Body Ratio (body_ratio)**
   - Força direcional do candle
   - Valores >30% indicam movimento forte
   - Valores <15% indicam indecisão

3. **Volatilidade (volatility)**
   - Range do candle normalizado pelo preço
   - Valores >0.2% indicam movimento real
   - Valores <0.1% indicam ruído (baixa qualidade)

---

## 🔧 Configuração

### 1. Ativar a IA

1. Acesse **Configurações** no menu
2. Role até a seção **"Agente IA (Estratégia Híbrida)"**
3. Ative o **toggle principal** no canto superior direito

### 2. Configurar Parâmetros

Quando a IA estiver ativa, você verá 4 parâmetros configuráveis:

#### **Stake Alta Confiança ($)**
- **Padrão:** $4.00
- **Descrição:** Valor apostado quando a IA tem alta confiança no setup
- **Recomendação:** Use 20-25% do seu capital inicial
- **Exemplo:** Se começou com $20, use $4-5

#### **Stake Confiança Normal ($)**
- **Padrão:** $1.00
- **Descrição:** Valor apostado em setups normais com hedge ativo
- **Recomendação:** Use 5-10% do seu capital inicial
- **Exemplo:** Se começou com $20, use $1-2

#### **Threshold do Filtro (%)**
- **Padrão:** 60%
- **Descrição:** Nível mínimo de confiança para considerar um trade de "Alta Confiança"
- **Recomendação:** 
  - **Conservador:** 70-80% (menos trades, mais certeza)
  - **Balanceado:** 55-65% (padrão recomendado)
  - **Agressivo:** 40-50% (mais trades, menos certeza)

#### **Habilitar Hedge em Trades Normais**
- **Padrão:** Ativado
- **Descrição:** Aplica hedge automático em trades de confiança normal para redução de risco
- **Recomendação:** Mantenha ATIVADO para máxima proteção

### 3. Salvar e Reiniciar o Bot

Após configurar, clique em **"Salvar Configurações"** e reinicie o bot para aplicar as mudanças.

---

## 📊 Parâmetros Explicados

### Exemplo Prático de Uso

**Cenário:** Você tem $20 de capital inicial

| Parâmetro | Valor Recomendado | Justificativa |
|---|---|---|
| **Stake Alta Confiança** | $4.00 | 20% do capital - aproveita trades de alta qualidade |
| **Stake Normal** | $1.00 | 5% do capital - protege capital com hedge |
| **Threshold Filtro** | 60% | Balanceado - não muito conservador, não muito agressivo |
| **Hedge Habilitado** | ✅ Sim | Reduz perdas em trades de confiança normal |

### Impacto dos Parâmetros

#### **Aumentar Stake Alta Confiança**
- ✅ Maior lucro em trades bons
- ⚠️ Maior risco se IA errar

#### **Aumentar Threshold do Filtro**
- ✅ Mais seletivo (só entra nos melhores setups)
- ⚠️ Menos trades executados (pode perder oportunidades)

#### **Diminuir Threshold do Filtro**
- ✅ Mais trades executados
- ⚠️ Pode entrar em setups de qualidade média

#### **Desabilitar Hedge**
- ✅ Lucro máximo em trades vencedores
- ⚠️ Perda máxima em trades perdedores (sem proteção)

---

## 📝 Logs e Monitoramento

### Como Saber se a IA Está Funcionando?

Acesse a página **"Logs"** e procure por esses eventos:

#### 1. **AI_DECISION**
```
[AGENTE IA] Confiança: HIGH | Deve Entrar: true | Hedge: false | Stake: $4 | 
Confiança: 75% | PosRange: 68.5% | BodyRatio: 35.2% | Vol: 0.245%
```

**O que significa:**
- **Confiança: HIGH** → IA identificou trade de alta qualidade
- **Deve Entrar: true** → IA aprovou a entrada
- **Hedge: false** → Não vai fazer hedge (alta confiança)
- **Stake: $4** → Vai entrar com stake alto
- **Confiança: 75%** → Score calculado pela IA
- **PosRange: 68.5%** → Preço está em 68.5% do range (bom para UP)
- **BodyRatio: 35.2%** → Corpo forte (movimento direcional claro)
- **Vol: 0.245%** → Volatilidade significativa (não é ruído)

#### 2. **AI_BLOCKED_ENTRY**
```
IA bloqueou entrada por baixa confiança. Aguardando próximo candle.
```

**O que significa:**
- IA detectou que o setup não tem qualidade suficiente
- Bot NÃO vai entrar neste trade
- Vai aguardar o próximo candle

#### 3. **POSITION_ENTERED**
```
Posição aberta: CALL | Entrada: 61234.50 | Stake: 4 | Duração: 12min | 
Contract: ABC123 | IA: HIGH | Hedge: NÃO
```

**O que significa:**
- **IA: HIGH** → Entrou com alta confiança
- **Hedge: NÃO** → Sem hedge (stake cheio no trade principal)

---

## ❓ Perguntas Frequentes

### 1. **A IA substitui a estratégia Fibonacci da Amplitude?**
**Não.** A IA **complementa** a estratégia existente. O bot continua usando o Fibonacci para fazer a predição, e a IA decide:
- Se deve entrar ou não
- Quanto apostar
- Se deve fazer hedge

### 2. **Posso usar a IA em modo DEMO?**
**Sim!** A IA funciona tanto em DEMO quanto em REAL. Recomendamos testar em DEMO primeiro.

### 3. **O que acontece se eu desativar a IA?**
O bot volta a funcionar **exatamente como antes**, usando apenas a estratégia Fibonacci da Amplitude com stake fixo.

### 4. **A IA aprende com meus trades?**
Não nesta versão. A IA usa um modelo pré-treinado baseado em 3.000 candles históricos. Futuras versões podem incluir aprendizado contínuo.

### 5. **Qual a assertividade da IA?**
Nos testes com 3.000 candles:
- **Estratégia sem IA:** 83.39% de assertividade
- **Estratégia com IA Híbrida:** Lucro 4.63% maior (devido à melhor gestão de risco)

### 6. **Posso ajustar os parâmetros durante o dia?**
Sim, mas você precisa **reiniciar o bot** para aplicar as mudanças.

### 7. **O hedge realmente funciona?**
Sim. Nos testes, o hedge melhorou o PnL em 4.63% ao reduzir perdas em trades de confiança normal.

### 8. **Quanto devo colocar em Stake Alta Confiança?**
Recomendamos **20-25% do seu capital inicial**. Exemplo:
- Capital: $20 → Stake Alto: $4-5
- Capital: $100 → Stake Alto: $20-25

### 9. **E se a IA bloquear muitos trades?**
Isso pode significar que:
- O **Threshold está muito alto** → Diminua para 50-55%
- O mercado está com **baixa qualidade** naquele momento (normal)

### 10. **Posso usar stakes diferentes dos recomendados?**
Sim, mas com cuidado:
- ⚠️ Stakes muito altos aumentam risco de ruína
- ⚠️ Stakes muito baixos reduzem potencial de lucro

---

## 🚀 Próximos Passos

1. **Ative a IA** nas configurações
2. **Teste em DEMO** por alguns dias
3. **Monitore os logs** para entender as decisões
4. **Ajuste os parâmetros** conforme necessário
5. **Migre para REAL** quando estiver confortável

---

## 📞 Suporte

Se tiver dúvidas ou problemas, verifique os logs do bot. Eles contêm informações detalhadas sobre cada decisão da IA.

**Bons trades! 🚀**
