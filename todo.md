# Schimidt Trader System PRO - TODO

## Infraestrutura e Configuração
- [x] Configurar schema do banco de dados (candles, positions, metrics, config)
- [x] Criar estrutura de diretórios para engine de predição
- [x] Sistema configurado via interface web (Settings)
- [x] Implementar sistema de estados do bot (IDLE, COLLECTING, WAITING_MIDPOINT, etc)

## Engine de Predição
- [x] Integrar engine proprietária de predição
- [x] Criar endpoint POST /predict no backend
- [x] Validar interface da API de predição
- [x] Integrar engine de predição proprietária do cliente no backend
- [x] Criar servidor Flask para engine Python (porta 7070)
- [x] Testar algoritmo Fibonacci da Amplitude com dados reais
- [x] Engine proprietária integrada e funcional

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
- [x] Gráfico M15 com candles em tempo real
- [x] Visualizar linha de abertura do candle atual
- [x] Visualizar mínima e máxima parciais
- [x] Visualizar linha de predição do fechamento
- [x] Visualizar linha do gatilho
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

## Bugs Corrigidos
- [x] Erro "bot.status data is undefined" - Retorno padrão implementado

## Testes de Aceite
- [x] Engine integrada e funcional
- [ ] Validar /predict com teste de ouro do cliente (requer dados do cliente)
- [ ] Validar gatilho de entrada com preço real DERIV (requer tokens DERIV)
- [ ] Validar early close ≥ 90% payout
- [ ] Validar encerramento 20s antes do fechamento M15
- [ ] Validar bloqueio por stop diário
- [ ] Testar com dados reais da DERIV (sem placeholders)

## Documentação e Entrega
- [ ] Documentar API de predição
- [ ] Documentar fluxo de estados do bot
- [ ] Criar guia de configuração inicial
- [ ] Checkpoint final e validação completa



## Correções Críticas Pendentes
- [x] Implementar busca de saldo real via DERIV API
- [x] Remover TODOS os dados sintéticos/placeholders do Dashboard
- [x] Implementar cálculo de PnL real baseado em posições do banco
- [x] Implementar contador de trades real do dia
- [x] Implementar gráfico de candles M15 em tempo real
- [x] Garantir que TODAS as métricas venham da DERIV ou banco de dados
- [x] Validar que nenhum valor hardcoded está sendo exibido



## Bugs Reportados
- [x] Erro "config.get data is undefined" - Endpoint retornando undefined quando não há config



## Novas Features Solicitadas
- [x] Adicionar botão "Conectar à DERIV" para testar conexão antes de iniciar bot
- [x] Validar token DERIV e mostrar status de conexão
- [x] Exibir informações da conta após conexão bem-sucedida



- [x] Erro "Please log in" ao testar conexão - DerivService não aguarda conexão estabelecida



- [x] Erro de API aparecendo no dashboard - botão de reset adicionado



- [x] Bot entra em ERROR_API durante operação - faltava parâmetro currency na API



## Novas Tarefas
- [ ] Criar repositório no GitHub com todo o projeto
- [ ] Criar README.md completo e detalhado
- [ ] Fazer commit e push do código
- [ ] Gerar arquivo ZIP do projeto para backup




## Bug Reportado - Gráfico de Linhas
- [x] Gráfico de linhas não está atualizando em tempo real - RESOLVIDO: conectado à DERIV API
- [x] Conectar gráfico de linhas à API DERIV (endpoint liveCandles) - CONCLUÍDO
- [ ] Mostrar apenas ordem ativa (não ordens fechadas) - PENDENTE




## Bug Crítico - Exibição de Tempo Restante
- [x] Frontend mostra "Aguardando 8 minutos" fixo, mas deveria mostrar tempo restante dinâmico - RESOLVIDO
- [x] Calcular tempo decorrido desde início do candle atual - CONCLUÍDO
- [x] Atualizar display em tempo real (ex: 8min → 7min → 6min...) - CONCLUÍDO
- [x] Backend retorna candleStartTime (timestamp UTC do início do candle da DERIV) - CONCLUÍDO




## Bug CRÍTICO - Cálculo de Gatilho Invertido
- [x] Predição UP com gatilho ABAIXO do close (deveria estar ACIMA) - CORRIGIDO
- [x] Exemplo: Close=49517.8732, Gatilho=49517.8716 (errado!) - CORRIGIDO
- [x] Verificar lógica de cálculo do trigger na predictionService - CONCLUÍDO
- [x] Corrigir sinal do offset Fibonacci (+ para UP, - para DOWN) - CORRIGIDO
- [x] Adicionar logs detalhados com TODOS os valores usados na predição (abertura, máxima, mínima) - CONCLUÍDO




## Verificação Urgente - Lógica de Direção
- [ ] Verificar se engine retorna direção correta: close > abertura = UP (CALL), close < abertura = DOWN (PUT)
- [ ] Confirmar mapeamento de "up/down" para tipo de contrato DERIV
- [ ] Validar com logs: abertura vs close previsto vs direção retornada




## Bug CRÍTICO - Cálculo de PnL Incorreto
- [ ] PnL não bate com DERIV: lucro de $95 aparece como $6.65
- [ ] Duas perdas de -$100 cada registradas
- [ ] Saldo inicial $21,153 → atual $21,053 (diferença -$100)
- [ ] PnL total mostrado -$193.35 não bate com variação de saldo
- [x] Adicionar logs de debug: profit, sell_price, buy_price, payout, exit_tick - CONCLUÍDO
- [x] Log de cálculo: finalProfit DERIV vs pnlInCents (x100) - CONCLUÍDO
- [ ] Aguardar próxima operação para analisar logs e identificar problema




## Bug - Tempo Restante Não Atualiza
- [x] Frontend continua mostrando "Aguardando 8 minutos" mesmo após 8 minutos terem passado - RESOLVIDO
- [x] candleStartTime retornava 0 porque currentCandleTimestamp só era definido no próximo candle - CORRIGIDO
- [x] Adicionada inicialização do candle atual no primeiro tick recebido - CONCLUÍDO
- [x] Log CANDLE_INITIALIZED para confirmar timestamp correto - CONCLUÍDO




## Bug CRÍTICO - Offset do Gatilho Errado
- [x] Offset calculado como 0.0016 (16 * pipSize) mas deveria ser 16.0000 - CORRIGIDO
- [x] Exemplo: Close=49466.076, Gatilho=49466.0744 (diferença 0.0016) ❌ - IDENTIFICADO
- [x] Correto: Close=49466.076, Gatilho=49450.076 (diferença 16.0000) ✅ - IMPLEMENTADO
- [x] Removida multiplicação por pipSize - offset agora é 16.0 absoluto - CONCLUÍDO
- [x] Lógica correta: UP (verde) = close - 16 | DOWN (vermelho) = close + 16 - CONCLUÍDO

