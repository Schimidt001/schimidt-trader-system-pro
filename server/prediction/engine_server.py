#!/usr/bin/env python3
"""
Servidor da Engine de Predição Proprietária
Integrado ao Schimidt Trader System PRO

Este servidor roda internamente e expõe a engine de predição via API REST
NÃO MODIFICAR a lógica de predição - é proprietária e imutável
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
import sys
import os

# Importar engine proprietária
from prediction_engine import PredictionEngine

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Criar aplicação Flask
app = Flask(__name__)
CORS(app)

# Instância global da engine
engine = PredictionEngine()
engine_initialized = False


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'engine': 'Fibonacci da Amplitude',
        'initialized': engine_initialized
    }), 200


@app.route('/predict', methods=['POST'])
def predict():
    """
    Endpoint de predição conforme especificação do cliente
    
    Request:
    {
        "symbol": "R_100",
        "tf": "M15",
        "history": [
            {
                "abertura": 1234.56,
                "minima": 1230.00,
                "maxima": 1240.00,
                "fechamento": 1235.00,
                "timestamp": 1234567890
            }
        ],
        "partial_current": {
            "timestamp_open": 1234567890,
            "elapsed_seconds": 480,
            "abertura": 1235.00,
            "minima_parcial": 1232.00,
            "maxima_parcial": 1238.00
        }
    }
    
    Response:
    {
        "predicted_close": 1236.50,
        "direction": "up",
        "phase": "accumulation",
        "strategy": "Fibonacci da Amplitude",
        "confidence": 0.85
    }
    """
    global engine_initialized
    
    try:
        data = request.json
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Validar campos obrigatórios
        required_fields = ['symbol', 'tf', 'history', 'partial_current']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        symbol = data['symbol']
        tf = data['tf']
        history = data['history']
        partial = data['partial_current']
        
        # Validar timeframe (aceita M15 e M30)
        if tf not in ['M15', 'M30']:
            return jsonify({'error': 'Only M15 and M30 timeframes are supported'}), 400
        
        # Alimentar engine com histórico (primeira vez)
        if not engine_initialized:
            logger.info(f"🔧 Inicializando engine com {len(history)} candles históricos")
            result = engine.alimentar_dados(history)
            if result['sucesso']:
                engine_initialized = True
                logger.info(f"✅ Engine inicializada - Fase: {result['fase_detectada']}")
            else:
                logger.error(f"❌ Erro ao inicializar engine: {result.get('erro')}")
        
        # Fazer predição com candle parcial atual
        abertura = float(partial['abertura'])
        minima = float(partial['minima_parcial'])
        maxima = float(partial['maxima_parcial'])
        
        logger.info(f"🎯 Predição para {symbol} - A:{abertura} H:{maxima} L:{minima}")
        
        # Chamar engine proprietária
        predicao = engine.fazer_predicao(abertura, maxima, minima)
        
        # Calcular gatilho (16 pontos de offset)
        # Assumindo pip_size = 0.01 para ativos sintéticos
        pip_size = 0.01
        offset_pontos = 16
        
        predicted_close = predicao['fechamento_predito']
        
        # Determinar direção
        if predicao['cor_predita'] == 'Verde':
            direction = 'up'
            # Para CALL, gatilho abaixo da predição
            # (mas aqui retornamos apenas a predição, o cálculo do gatilho fica no tradingBot)
        else:
            direction = 'down'
            # Para PUT, gatilho acima da predição
        
        # Montar resposta conforme especificação
        response = {
            'predicted_close': predicted_close,
            'direction': direction,
            'phase': predicao.get('algoritmo', 'Fibonacci da Amplitude'),
            'strategy': predicao.get('algoritmo', 'Fibonacci da Amplitude'),
            'confidence': 0.8485  # 84.85% de assertividade do algoritmo
        }
        
        logger.info(
            f"✅ Predição: {predicted_close:.4f} ({direction}) - "
            f"Fase: {predicao.get('fase_usada', 2)}"
        )
        
        return jsonify(response), 200
    
    except Exception as e:
        logger.error(f"❌ Erro na predição: {e}", exc_info=True)
        return jsonify({
            'error': str(e),
            'message': 'Erro ao processar predição'
        }), 500


@app.route('/reset', methods=['POST'])
def reset_engine():
    """Reinicia a engine (útil para testes)"""
    global engine, engine_initialized
    
    try:
        engine = PredictionEngine()
        engine_initialized = False
        logger.info("🔄 Engine reiniciada")
        
        return jsonify({
            'success': True,
            'message': 'Engine reiniciada com sucesso'
        }), 200
    
    except Exception as e:
        logger.error(f"❌ Erro ao reiniciar engine: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


if __name__ == '__main__':
    print("=" * 70)
    print("  🤖 SCHIMIDT TRADER SYSTEM PRO - ENGINE DE PREDIÇÃO")
    print("  Algoritmo Fibonacci da Amplitude - 84.85% de Assertividade")
    print("=" * 70)
    print()
    print("🚀 Servidor da engine iniciado com sucesso!")
    print("📊 Algoritmo proprietário integrado")
    print("⚡ Pronto para receber requisições de predição")
    print()
    print("Endpoints disponíveis:")
    print("  GET  /health  - Health check")
    print("  POST /predict - Fazer predição")
    print("  POST /reset   - Reiniciar engine")
    print()
    print("Servidor rodando em: http://localhost:5070")
    print("=" * 70)
    
    # Rodar na porta 5070 (interna)
    app.run(host='127.0.0.1', port=5070, debug=False)

