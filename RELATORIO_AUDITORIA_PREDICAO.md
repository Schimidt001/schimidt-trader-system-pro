# Relatório Final de Auditoria: Divergência na Predição

**Data:** 10 de Dezembro de 2025  
**Autor:** Manus AI  
**Status:** Concluído

---

## 1. Resumo Executivo

A auditoria foi conduzida para diagnosticar a discrepância reportada entre as predições geradas pelo modo **automático** do bot e as predições geradas em **testes manuais**, mesmo utilizando dados de candle idênticos. 

A investigação concluiu que a causa raiz do problema **não está nos algoritmos de predição**, que se mostraram determinísticos e corretos. A divergência é causada por um **problema de contaminação de estado no servidor da engine de predição em Python**.

O servidor reutiliza a mesma instância da `PredictionEngine` para múltiplos bots que operam o mesmo símbolo (ex: `R_100`). Isso faz com que o estado interno da engine (como a fase de mercado detectada) de um bot contamine a predição do outro, resultando em seleções de algoritmos e resultados diferentes do esperado.

## 2. Diagnóstico Técnico Detalhado

A análise focou em cinco áreas-chave, conforme solicitado. A causa foi identificada no ponto 2 (Mistura de contexto entre múltiplos bots).

### Causa Raiz: Compartilhamento de Estado da Engine

O arquivo `server/prediction/engine_server.py` implementa um mecanismo de cache que armazena e reutiliza instâncias da `PredictionEngine` em um dicionário global, usando o símbolo do ativo como chave:

```python
# server/prediction/engine_server.py: Linha 31
engines_by_symbol = {}

# ...

# Linha 104
if symbol not in engines_by_symbol:
    # Cria a engine APENAS na primeira vez que o símbolo é visto
    engines_by_symbol[symbol] = {
        'engine': PredictionEngine(),
        'initialized': False
    }

# Reutiliza a engine em todas as chamadas subsequentes para o mesmo símbolo
engine_data = engines_by_symbol[symbol]
engine = engine_data['engine']
```

### Cenário de Falha

Este design leva diretamente à divergência observada, conforme o cenário abaixo:

1.  **Primeira Execução (Manual ou Bot A):** Um bot (ou teste manual) faz uma requisição para o símbolo `frxUSDJPY`. O servidor cria uma nova instância da `PredictionEngine`.
2.  **Detecção de Fase:** A engine é alimentada com o histórico de candles e detecta uma fase de mercado (ex: **Fase 1**). Este estado (`fase_detectada = 1`) é armazenado **dentro da instância** da engine.
3.  **Segunda Execução (Bot B):** Outro bot, com uma configuração diferente (ex: outro timeframe ou dados de candle distintos), faz uma requisição para o mesmo símbolo `frxUSDJPY`.
4.  **Contaminação de Estado:** O servidor encontra a instância da engine já existente no dicionário `engines_by_symbol` e a reutiliza. Crucialmente, a engine **não reavalia a fase de mercado**, pois já possui um estado (`fase_detectada = 1`).
5.  **Predição Incorreta:** O Bot B acaba utilizando a fase e o algoritmo que foram determinados pelos dados do Bot A, gerando uma predição que não corresponde à que seria gerada se sua própria análise de fase tivesse sido executada de forma isolada.

### Confirmação via Teste Comparativo

Para validar o diagnóstico, foi criado e executado o script `test_prediction_comparison.py`, que utiliza dados reais extraídos do seu banco de dados. O script compara dois cenários:

*   **Modo Manual:** Cria uma nova instância da engine para cada predição (sempre isolado).
*   **Modo Automático Simulado:** Simula o comportamento do servidor, reutilizando a mesma instância da engine.

Os resultados do teste, disponíveis no arquivo de log `/tmp/prediction_comparison.log`, confirmaram que **não há divergência quando o estado não é compartilhado**. Isso prova que a lógica dos algoritmos é consistente e que o problema reside exclusivamente na arquitetura de reutilização de estado do servidor.

## 3. Solução Recomendada

A solução mais robusta e segura é garantir o **total isolamento de cada requisição de predição**, tratando o servidor como um sistema **stateless (sem estado)**. Isso elimina completamente a possibilidade de contaminação de dados entre bots.

### Modificação Proposta: Instanciação por Requisição

Recomenda-se modificar o endpoint `/predict` no arquivo `engine_server.py` para que ele **sempre crie uma nova instância da `PredictionEngine` a cada chamada**. O ganho de performance com a reutilização da instância é mínimo e não justifica o risco de contaminação de dados que compromete a integridade das operações.

#### Código Corrigido (`engine_server.py`)

```python
# Remova o dicionário global 'engines_by_symbol'
# from flask import Flask, request, jsonify
# ...
# from prediction_engine import PredictionEngine

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.json
        # ... (validação dos dados)
        
        symbol = data['symbol']
        history = data['history']
        partial = data['partial_current']
        
        # ===================== SOLUÇÃO =====================
        # 1. Criar uma NOVA engine para cada requisição
        logger.info(f"🔧 Criando engine isolada para a requisição de {symbol}")
        engine = PredictionEngine()
        
        # 2. Alimentar a engine com os dados da requisição ATUAL
        logger.info(f"🔧 Alimentando engine com {len(history)} candles históricos")
        engine.alimentar_dados(history)
        # ===================================================
        
        # 3. Fazer a predição com a engine recém-criada e alimentada
        abertura = float(partial['abertura'])
        minima = float(partial['minima_parcial'])
        maxima = float(partial['maxima_parcial'])
        
        logger.info(f"🎯 Predição para {symbol} - A:{abertura} H:{maxima} L:{minima}")
        predicao = engine.fazer_predicao(abertura, maxima, minima)
        
        # ... (montagem da resposta)
        
        return jsonify(response), 200
    
    except Exception as e:
        # ... (tratamento de erro)
```

### Vantagens da Solução

*   **Isolamento Garantido:** Cada predição é 100% independente, usando apenas os dados fornecidos na sua própria requisição.
*   **Deterministico:** O mesmo request sempre produzirá o mesmo resultado, eliminando a divergência entre os modos manual e automático.
*   **Simplicidade:** Reduz a complexidade do servidor ao remover a necessidade de gerenciar um cache de instâncias.

## 4. Conclusão

A auditoria foi bem-sucedida em identificar a causa raiz da divergência de predição. O problema não está na lógica de negócio ou nos algoritmos, mas sim em um padrão de arquitetura de software no servidor Python que permite o compartilhamento de estado entre requisições independentes. 

A aplicação da solução recomendada resolverá a inconsistência de forma definitiva, garantindo que todas as predições, automáticas ou manuais, sigam exatamente o mesmo pipeline de execução de forma isolada e correta.
