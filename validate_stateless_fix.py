#!/usr/bin/env python3
"""
Script de Validação da Correção Stateless
Objetivo: Confirmar que a implementação stateless resolve a divergência
"""

import sys
import os
import json
import logging
import requests
import time
from typing import Dict, List

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/tmp/validation_stateless.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# URL do servidor de predição
PREDICTION_SERVER_URL = "http://localhost:5070"


def check_server_health() -> bool:
    """Verifica se o servidor está rodando e em modo stateless"""
    try:
        response = requests.get(f"{PREDICTION_SERVER_URL}/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Servidor respondendo: {data}")
            if data.get('mode') == 'stateless':
                logger.info("✅ Servidor está em modo STATELESS")
                return True
            else:
                logger.warning("⚠️ Servidor NÃO está em modo stateless")
                return False
        else:
            logger.error(f"❌ Servidor retornou status {response.status_code}")
            return False
    except Exception as e:
        logger.error(f"❌ Erro ao conectar ao servidor: {e}")
        return False


def load_test_data() -> Dict:
    """Carrega dados de teste do arquivo JSON"""
    try:
        with open('/tmp/test_data_prediction.json', 'r') as f:
            data = json.load(f)
        logger.info(f"✅ Dados de teste carregados: {data['metadata']['totalCandles']} candles")
        return data
    except Exception as e:
        logger.error(f"❌ Erro ao carregar dados de teste: {e}")
        return None


def call_prediction_api(request_data: Dict, request_id: str) -> Dict:
    """Faz uma chamada à API de predição"""
    try:
        logger.info(f"[{request_id}] Enviando requisição ao servidor...")
        response = requests.post(
            f"{PREDICTION_SERVER_URL}/predict",
            json=request_data,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            logger.info(f"[{request_id}] ✅ Predição recebida: {result}")
            return result
        else:
            logger.error(f"[{request_id}] ❌ Erro na API: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        logger.error(f"[{request_id}] ❌ Erro ao chamar API: {e}")
        return None


def compare_predictions(pred1: Dict, pred2: Dict, label1: str, label2: str) -> bool:
    """Compara duas predições e retorna True se forem idênticas"""
    logger.info("=" * 80)
    logger.info(f"COMPARAÇÃO: {label1} vs {label2}")
    logger.info("=" * 80)
    
    all_match = True
    
    # Comparar predicted_close
    close1 = pred1.get('predicted_close')
    close2 = pred2.get('predicted_close')
    diff = abs(close1 - close2) if (close1 and close2) else float('inf')
    
    logger.info(f"📊 PREDICTED CLOSE:")
    logger.info(f"  {label1}: {close1}")
    logger.info(f"  {label2}: {close2}")
    logger.info(f"  Diferença: {diff:.10f}")
    
    if diff < 0.0001:  # Tolerância de 0.0001
        logger.info(f"  ✅ Valores idênticos")
    else:
        logger.error(f"  ❌ DIVERGÊNCIA DETECTADA!")
        all_match = False
    
    # Comparar direction
    dir1 = pred1.get('direction')
    dir2 = pred2.get('direction')
    
    logger.info(f"\n🎨 DIRECTION:")
    logger.info(f"  {label1}: {dir1}")
    logger.info(f"  {label2}: {dir2}")
    
    if dir1 == dir2:
        logger.info(f"  ✅ Direções idênticas")
    else:
        logger.error(f"  ❌ DIVERGÊNCIA DETECTADA!")
        all_match = False
    
    # Comparar phase/algorithm
    phase1 = pred1.get('phase')
    phase2 = pred2.get('phase')
    
    logger.info(f"\n⚙️ PHASE/ALGORITHM:")
    logger.info(f"  {label1}: {phase1}")
    logger.info(f"  {label2}: {phase2}")
    
    if phase1 == phase2:
        logger.info(f"  ✅ Fases/Algoritmos idênticos")
    else:
        logger.error(f"  ❌ DIVERGÊNCIA DETECTADA!")
        all_match = False
    
    # Comparar strategy
    strat1 = pred1.get('strategy')
    strat2 = pred2.get('strategy')
    
    logger.info(f"\n🎯 STRATEGY:")
    logger.info(f"  {label1}: {strat1}")
    logger.info(f"  {label2}: {strat2}")
    
    if strat1 == strat2:
        logger.info(f"  ✅ Estratégias idênticas")
    else:
        logger.error(f"  ❌ DIVERGÊNCIA DETECTADA!")
        all_match = False
    
    logger.info("=" * 80)
    
    if all_match:
        logger.info("✅ VALIDAÇÃO PASSOU: Todas as predições são idênticas!")
    else:
        logger.error("❌ VALIDAÇÃO FALHOU: Divergências detectadas!")
    
    return all_match


def main():
    """Função principal de validação"""
    logger.info("=" * 80)
    logger.info("VALIDAÇÃO DA CORREÇÃO STATELESS")
    logger.info("Objetivo: Confirmar que predições repetidas retornam resultados idênticos")
    logger.info("=" * 80)
    
    # 1. Verificar se o servidor está rodando
    logger.info("\n[ETAPA 1] Verificando servidor...")
    if not check_server_health():
        logger.error("❌ Servidor não está disponível ou não está em modo stateless")
        logger.error("Por favor, inicie o servidor com: python3 server/prediction/engine_server.py")
        return False
    
    # 2. Carregar dados de teste
    logger.info("\n[ETAPA 2] Carregando dados de teste...")
    test_data = load_test_data()
    if not test_data:
        logger.error("❌ Falha ao carregar dados de teste")
        return False
    
    # Montar request para a API
    request_data = {
        "symbol": test_data["symbol"],
        "tf": test_data["tf"],
        "history": test_data["history"],
        "partial_current": test_data["partial_current"]
    }
    
    # 3. Fazer múltiplas chamadas com os mesmos dados
    logger.info("\n[ETAPA 3] Executando múltiplas predições com os mesmos dados...")
    
    predictions = []
    num_calls = 5  # Fazer 5 chamadas para garantir consistência
    
    for i in range(num_calls):
        logger.info(f"\n--- Chamada {i+1}/{num_calls} ---")
        pred = call_prediction_api(request_data, f"CALL_{i+1}")
        if pred:
            predictions.append(pred)
        else:
            logger.error(f"❌ Falha na chamada {i+1}")
            return False
        
        # Pequeno delay entre chamadas
        time.sleep(0.5)
    
    # 4. Comparar todas as predições
    logger.info("\n[ETAPA 4] Comparando resultados...")
    
    all_valid = True
    baseline = predictions[0]
    
    for i in range(1, len(predictions)):
        logger.info(f"\n--- Comparação {i}: BASELINE vs CALL_{i+1} ---")
        is_match = compare_predictions(
            baseline,
            predictions[i],
            "BASELINE (Call 1)",
            f"CALL_{i+1}"
        )
        if not is_match:
            all_valid = False
    
    # 5. Resultado final
    logger.info("\n" + "=" * 80)
    logger.info("RESULTADO FINAL DA VALIDAÇÃO")
    logger.info("=" * 80)
    
    if all_valid:
        logger.info("✅ SUCESSO: Todas as {num_calls} predições retornaram resultados IDÊNTICOS")
        logger.info("✅ A correção stateless está funcionando corretamente")
        logger.info("✅ Não há mais contaminação de estado entre requisições")
        return True
    else:
        logger.error("❌ FALHA: Divergências detectadas entre as predições")
        logger.error("❌ A correção stateless pode não estar funcionando corretamente")
        return False


if __name__ == "__main__":
    success = main()
    
    logger.info("\n" + "=" * 80)
    logger.info("Logs completos salvos em: /tmp/validation_stateless.log")
    logger.info("=" * 80)
    
    sys.exit(0 if success else 1)
