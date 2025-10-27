# Schimidt Trader System PRO - TODO

## Infraestrutura e Configuração
- [x] Configurar schema do banco de dados (candles, positions, metrics, config)
- [x] Criar estrutura de diretórios para engine de predição
- [ ] Configurar variáveis de ambiente para tokens DERIV
- [x] Implementar sistema de estados do bot (IDLE, COLLECTING, WAITING_MIDPOINT, etc)

## Engine de Predição
- [x] Integrar engine proprietária de predição
- [x] Criar endpoint POST /predict no backend
- [x] Validar interface da API de predição
- [ ] Implementar carregamento do modelo modelo_otimizado_v2.pkl

## Coleta de Dados DERIV
- [x] Implementar conexão WebSocket com DERIV
- [x] Coletar histórico de candles M15
- [x] Atualizar candle atual em tempo real
- [x] Calcular segundos decorridos do candle atual
- [x] Persistir candles no banco de dados

## Lógica de Trading
- [x] Implementar detecção de 8 minutos do candle M15
- [x] Calcular gatilho de entrada (offset de 16 pontos)
- [x] Executar entrada automática ao cruzamento do gatilho
- [x] Implementar encerramento 20 segundos antes do fechamento
- [x] Implementar early close com condição de 90% payout
- [x] Garantir apenas 1 operação por candle
- [x] Implementar idempotência de ordens

## Gestão de Risco
- [x] Implementar stop diário
- [x] Implementar take diário
- [x] Sistema de bloqueios (LOCK_RISK, ERROR_API, DISCONNECTED)
- [x] Reconexão sem duplicação de ordens

## Interface do Usuário
- [x] Dashboard principal com métricas (saldo, PnL dia/mês, trades, perdas)
- [ ] Gráfico M15 com candles em tempo real
- [ ] Visualizar linha de abertura do candle atual
- [ ] Visualizar mínima e máxima parciais
- [ ] Visualizar linha de predição do fechamento
- [ ] Visualizar linha do gatilho
- [x] Log de eventos com timestamps UTC
- [x] Status de conexão em tempo real

## Configurações
- [x] Seletor de modo DEMO/REAL
- [x] Input para token DEMO
- [x] Input para token REAL
- [x] Seletor de ativo sintético DERIV
- [x] Input de stake
- [x] Input de stop diário
- [x] Input de take diário
- [x] Input de lookback de candles históricos
- [x] Botão Start/Stop do bot

## Testes de Aceite
- [ ] Validar /predict com teste de ouro do cliente
- [ ] Validar gatilho de entrada com preço real DERIV
- [ ] Validar early close ≥ 90% payout
- [ ] Validar encerramento 20s antes do fechamento M15
- [ ] Validar bloqueio por stop diário
- [ ] Testar com dados reais da DERIV (sem placeholders)

## Documentação e Entrega
- [ ] Documentar API de predição
- [ ] Documentar fluxo de estados do bot
- [ ] Criar guia de configuração inicial
- [ ] Checkpoint final e validação completa

