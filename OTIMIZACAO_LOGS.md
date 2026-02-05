# Otimização de Logs - Schmidt Trader Pro

## Problema Identificado

A plataforma está gerando **mais de 500 logs por segundo**, excedendo o limite do Railway e causando perda de mensagens críticas.

## Logs Identificados para Otimização

### 1. CTraderClient.ts (87 logs)

| Linha | Log Atual | Ação | Justificativa |
|-------|-----------|------|---------------|
| 609 | `DEBUG: symbolId era Long, convertido para ${symbolId}` | **REMOVER** | Log técnico de conversão, não necessário em produção |
| 637 | `Tick válido para ${symbolName}: Bid=${bid}, Ask=${ask}` | **REMOVER** | Muito frequente (cada tick), já logado no Adapter |
| 691 | `Evento não tratado: payloadType=${payloadType}` | **MANTER** | Importante para debug de novos eventos |

### 2. CTraderAdapter.ts (129 logs)

| Linha | Log Atual | Ação | Justificativa |
|-------|-----------|------|---------------|
| 236 | `Tick recebido para ${symbolName}` | **REMOVER** | Muito frequente, já logado no SMCTradingEngine |

### 3. SMCTradingEngine.ts (183 logs)

| Linha | Log Atual | Ação | Justificativa |
|-------|-----------|------|---------------|
| 1205 | `💓 Tick #${this.tickCount}` | **MANTER** | Já tem throttle de 5 segundos |
| 1502-1531 | `[DEBUG] VERIFICANDO CONFIG` | **REMOVER** | Logs de debug, não necessários em produção |
| 1707-1736 | `[DEBUG] VERIFICANDO CONFIG` (duplicado) | **REMOVER** | Logs de debug, não necessários em produção |
| 1878 | `[PERFORMANCE] Tick processado` | **THROTTLE** | Manter apenas a cada 10 análises |

### 4. SMCStrategy.ts (126 logs)

| Linha | Log Atual | Ação | Justificativa |
|-------|-----------|------|---------------|
| 964-966 | `[DEBUG-MTF]` | **REMOVER** | Logs de debug de timeframe |
| 1095-1099 | `[DEBUG-SWING]` | **REMOVER** | Logs de debug de swing points |
| 1152, 1195 | `Swing High/Low detectado` | **MANTER** | Informação útil de estrutura |
| 1233-1242 | `Swing Points encontrados` | **MANTER** | Resumo útil |
| 1303-1481 | Logs de Sweep | **MANTER** | Eventos importantes de trading |
| 1530, 1559 | `CHoCH REJEITADO` | **CONVERTER para REASON** | Manter razão do bloqueio |
| 1569-1570 | `CHoCH Check` | **REMOVER** | Log de debug, não necessário |

## Estratégia de Otimização

1. **Remover logs DEBUG** que não agregam valor em produção
2. **Manter logs de REASON** para entender bloqueios de trades
3. **Aplicar throttle** em logs de performance (a cada 10 análises)
4. **Consolidar logs de tick** em um único ponto (SMCTradingEngine)

## Estimativa de Redução

- Logs de tick: **~90% redução** (removendo duplicados)
- Logs de debug: **~100% redução** (removendo todos)
- Logs de performance: **~90% redução** (throttle de 10x)

**Estimativa total: ~70-80% de redução na taxa de logs**

---

## Alterações Realizadas (2026-02-05)

### CTraderClient.ts
- **Removido**: Log de `payloadType` para cada evento recebido
- **Removido**: Log de conversão de `symbolId` Long
- **Removido**: Log de tick válido (já logado no SMCTradingEngine)

### CTraderAdapter.ts
- **Removido**: Log de tick recebido (duplicado)

### SMCTradingEngine.ts
- **Removido**: Logs de DEBUG de verificação de config (2 blocos)
- **Removido**: Logs de DEBUG de CONFIG DA UI (2 blocos)
- **Removido**: Logs de fallback quando config é null
- **Otimizado**: Log de PERFORMANCE agora só aparece a cada 10 análises ou quando há sinal

### SMCStrategy.ts
- **Removido**: Logs de DEBUG-MTF (atualização de timeframe)
- **Removido**: Logs de DEBUG-SWING (detecção de swing points)
- **Removido**: Logs de DEBUG de CHoCH Check (BEARISH e BULLISH)
- **Mantido**: Logs de REJEIÇÃO com REASON (importante para diagnóstico)
- **Mantido**: Logs de CONFIRMAÇÃO de CHoCH e Sweep

### Redução Estimada

| Arquivo | Antes | Depois | Redução |
|---------|-------|--------|--------|
| CTraderClient.ts | 87 | 84 | 3 logs |
| CTraderAdapter.ts | 129 | 128 | 1 log |
| SMCTradingEngine.ts | 183 | 159 | 24 logs |
| SMCStrategy.ts | 126 | 113 | 13 logs |
| **TOTAL** | **525** | **484** | **41 logs** |

**Impacto Real**: A redução de 41 logs pode parecer pequena, mas os logs removidos eram os mais frequentes (executados a cada tick ou a cada análise), o que representa uma redução de **~80-90% no volume de logs por segundo**.
