# Aplicação de Teste da IA Hedge Inteligente

## Visão Geral

Esta aplicação foi criada para testar a lógica da **IA Hedge Inteligente** em tempo real, conectando-se à API da DERIV e simulando posições abertas no ativo **R_75**.

A aplicação monitora candles M15 (15 minutos) em tempo real e, a cada candle, simula uma posição aberta aos 8 minutos (como o bot real faz). Entre os minutos 12 e 14, a IA Hedge é acionada para analisar se uma segunda posição (hedge ou reforço) deve ser aberta.

## Como Funciona

### Fluxo de Teste

1. **Conexão**: A aplicação conecta-se à API da DERIV usando o token fornecido.
2. **Monitoramento**: Subscreve aos ticks do ativo R_75 e constrói candles M15 em tempo real.
3. **Simulação de Posição**: Aos 8 minutos de cada candle, simula uma posição aberta (CALL ou PUT).
4. **Análise da IA**: Entre 12 e 14 minutos, chama a função `analyzePositionForHedge` para testar a lógica.
5. **Logs Detalhados**: Exibe no console todas as decisões da IA com informações completas.

### Decisões da IA Hedge

A IA pode tomar três decisões:

- **HOLD**: A posição está boa, não fazer nada.
- **REINFORCE**: Abrir uma segunda posição na mesma direção (reforço).
- **HEDGE**: Abrir uma segunda posição na direção oposta (proteção).

## Como Usar

### Pré-requisitos

- Node.js 22+
- Token da API da DERIV (recomendado: conta DEMO)

### Instalação

```bash
cd /home/ubuntu/schimidt-trader-system-pro
pnpm install
```

### Executar o Teste

```bash
tsx test_ia_hedge.ts <SEU_TOKEN_DERIV>
```

**Exemplo:**

```bash
tsx test_ia_hedge.ts abc123xyz456
```

### Saída Esperada

A aplicação exibirá logs no console conforme os eventos ocorrem:

```
🚀 Iniciando Teste da IA Hedge Inteligente
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Ativo: R_75
⏱️  Timeframe: M15 (15 minutos)
🔬 Modo: Simulação de Posições
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔌 Conectando à API da DERIV...
✅ Conectado com sucesso!

📡 Monitorando ticks do R_75...

🕐 Novo candle iniciado: 2025-11-04 16:45:00
   Abertura: 48255.20

================================================================================
🎯 POSIÇÃO SIMULADA ABERTA
================================================================================
Direção: UP
Preço de Entrada: 48260.00
Fechamento Previsto: 48275.50
Stake: $1.00
================================================================================

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 ANÁLISE DA IA HEDGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱️  Tempo Decorrido: 12.50 minutos
📊 Preço Atual: 48270.00
📈 Progresso: 64.5%

🎯 DECISÃO: HOLD
💡 Razão: Movimento forte: 64.5% do esperado alcançado. Posição está boa.

⏸️  Nenhuma ação necessária - posição está boa
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Interpretando os Resultados

### Cenário 1: HOLD (Posição Boa)

```
🎯 DECISÃO: HOLD
💡 Razão: Movimento forte: 64.5% do esperado alcançado. Posição está boa.
```

A IA detectou que o preço está se movendo conforme o esperado (mais de 30% do progresso). Nenhuma ação é necessária.

### Cenário 2: REINFORCE (Reforçar)

```
🎯 DECISÃO: REINFORCE
💡 Razão: Pullback insuficiente: movimento está em 18.2% do esperado (< 30%). Reforçando posição.

✅ SEGUNDA POSIÇÃO RECOMENDADA:
   Tipo: CALL
   Stake: $0.50
```

A IA detectou que o movimento está fraco (menos de 30% do esperado). Recomenda abrir uma segunda posição na mesma direção com 50% do stake original.

### Cenário 3: HEDGE (Proteger)

```
🎯 DECISÃO: HEDGE
💡 Razão: Reversão detectada: candle fechando verde mas predição era vermelho. Progresso: 45.0%

✅ SEGUNDA POSIÇÃO RECOMENDADA:
   Tipo: PUT
   Stake: $1.00
```

A IA detectou uma reversão no candle (o corpo está na direção oposta à prevista). Recomenda abrir uma posição de hedge (direção oposta) com 100% do stake original.

## Observações

- A aplicação **não abre posições reais** na DERIV, apenas simula e exibe as decisões da IA.
- Use uma conta **DEMO** para evitar custos de API.
- Deixe a aplicação rodando por pelo menos **2-3 candles** (30-45 minutos) para ver diferentes cenários.
- Pressione **Ctrl+C** para encerrar o teste.

## Próximos Passos

Após validar a lógica da IA Hedge com esta aplicação de teste, os próximos passos são:

1. Ajustar os parâmetros da IA (thresholds, multiplicadores) se necessário.
2. Integrar a IA Hedge na plataforma funcional.
3. Executar a migração do banco de dados (`add_ia_hedge.sql`).
4. Testar em produção com valores baixos.
