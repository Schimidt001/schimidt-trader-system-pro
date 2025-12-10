#!/usr/bin/env python3
"""
Script de Teste Comparativo: Predição Manual vs Automática
Objetivo: Diagnosticar divergências entre os dois modos
"""

import sys
import os
import json
import logging
from typing import List, Dict

# Adicionar diretório do servidor ao path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'server', 'prediction'))

from prediction_engine_debug import PredictionEngineDebug

# Configurar logging detalhado
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/tmp/prediction_comparison.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def carregar_dados_teste() -> Dict:
    """
    Carrega dados de teste para comparação
    Você deve fornecer os dados reais que estão causando divergência
    """
    dados_teste = {
        "symbol": "frxUSDJPY",
        "tf": "M60",
        "history": [
            {
                "abertura": 156.656,
                "minima": 156.56,
                "maxima": 156.683,
                "fechamento": 156.591,
                "timestamp": 1765335600
            },
            {
                "abertura": 156.591,
                "minima": 156.583,
                "maxima": 156.665,
                "fechamento": 156.63,
                "timestamp": 1765339200
            },
            {
                "abertura": 156.629,
                "minima": 156.599,
                "maxima": 156.723,
                "fechamento": 156.708,
                "timestamp": 1765342800
            },
            {
                "abertura": 156.709,
                "minima": 156.662,
                "maxima": 156.766,
                "fechamento": 156.673,
                "timestamp": 1765346400
            },
            {
                "abertura": 156.673,
                "minima": 156.638,
                "maxima": 156.754,
                "fechamento": 156.654,
                "timestamp": 1765350000
            },
            {
                "abertura": 156.653,
                "minima": 156.581,
                "maxima": 156.708,
                "fechamento": 156.675,
                "timestamp": 1765353600
            },
            {
                "abertura": 156.676,
                "minima": 156.676,
                "maxima": 156.889,
                "fechamento": 156.819,
                "timestamp": 1765357200
            },
            {
                "abertura": 156.82,
                "minima": 156.74,
                "maxima": 156.859,
                "fechamento": 156.772,
                "timestamp": 1765360800
            },
            {
                "abertura": 156.771,
                "minima": 156.69,
                "maxima": 156.778,
                "fechamento": 156.712,
                "timestamp": 1765364400
            },
            {
                "abertura": 156.712,
                "minima": 156.675,
                "maxima": 156.758,
                "fechamento": 156.718,
                "timestamp": 1765368000
            },
            {
                "abertura": 156.717,
                "minima": 156.554,
                "maxima": 156.719,
                "fechamento": 156.555,
                "timestamp": 1765371600
            },
            {
                "abertura": 156.554,
                "minima": 156.44,
                "maxima": 156.63,
                "fechamento": 156.501,
                "timestamp": 1765375200
            },
            {
                "abertura": 156.501,
                "minima": 156.355,
                "maxima": 156.534,
                "fechamento": 156.48,
                "timestamp": 1765378800
            },
            {
                "abertura": 156.48,
                "minima": 156.327,
                "maxima": 156.489,
                "fechamento": 156.338,
                "timestamp": 1765382400
            },
            {
                "abertura": 156.338,
                "minima": 156.25,
                "maxima": 156.398,
                "fechamento": 156.309,
                "timestamp": 1765386000
            }
        ],
        "partial_current": {
            "abertura": 156.307,
            "maxima_parcial": 156.477,
            "minima_parcial": 156.298
        }
    }
    
    return dados_teste


def teste_modo_manual(dados: Dict, bot_id: str = "MANUAL") -> Dict:
    """
    Simula predição em modo manual
    Cria uma engine nova e executa todo o pipeline
    """
    logger.info("=" * 80)
    logger.info(f"INICIANDO TESTE MODO MANUAL (BOT_ID: {bot_id})")
    logger.info("=" * 80)
    
    # Criar engine isolada para teste manual
    engine = PredictionEngineDebug(bot_id=bot_id)
    
    # Alimentar dados históricos
    resultado_alimentacao = engine.alimentar_dados(dados["history"])
    
    logger.info(f"[{bot_id}] Resultado da alimentação:")
    logger.info(json.dumps(resultado_alimentacao, indent=2))
    
    # Fazer predição com candle parcial
    partial = dados["partial_current"]
    resultado_predicao = engine.fazer_predicao(
        abertura=partial["abertura"],
        maxima=partial["maxima_parcial"],
        minima=partial["minima_parcial"]
    )
    
    logger.info(f"[{bot_id}] Resultado da predição:")
    logger.info(json.dumps(resultado_predicao, indent=2, default=str))
    
    # Obter estatísticas
    stats = engine.obter_estatisticas()
    logger.info(f"[{bot_id}] Estatísticas:")
    logger.info(json.dumps(stats, indent=2))
    
    return {
        "alimentacao": resultado_alimentacao,
        "predicao": resultado_predicao,
        "estatisticas": stats
    }


def teste_modo_automatico_simulado(dados: Dict, bot_id: str = "AUTO_1") -> Dict:
    """
    Simula predição em modo automático
    Simula o comportamento do servidor Flask com engines compartilhadas
    """
    logger.info("=" * 80)
    logger.info(f"INICIANDO TESTE MODO AUTOMÁTICO (BOT_ID: {bot_id})")
    logger.info("=" * 80)
    
    # Simular o dicionário global do servidor
    global engines_by_symbol
    if 'engines_by_symbol' not in globals():
        engines_by_symbol = {}
    
    symbol = dados["symbol"]
    
    # Obter ou criar engine (como no engine_server.py)
    if symbol not in engines_by_symbol:
        logger.info(f"[{bot_id}] Criando nova engine para símbolo: {symbol}")
        engines_by_symbol[symbol] = {
            'engine': PredictionEngineDebug(bot_id=f"SHARED_{symbol}"),
            'initialized': False
        }
    else:
        logger.info(f"[{bot_id}] Usando engine existente para símbolo: {symbol}")
    
    engine_data = engines_by_symbol[symbol]
    engine = engine_data['engine']
    
    # Alimentar engine (apenas se não inicializada)
    if not engine_data['initialized']:
        logger.info(f"[{bot_id}] Inicializando engine com histórico")
        resultado_alimentacao = engine.alimentar_dados(dados["history"])
        engine_data['initialized'] = True
    else:
        logger.info(f"[{bot_id}] Engine já inicializada, pulando alimentação")
        resultado_alimentacao = {
            "sucesso": True,
            "message": "Engine já estava inicializada",
            "fase_detectada": engine.fase_detectada,
            "chave_fase1": engine.chave_ativa_fase1
        }
    
    logger.info(f"[{bot_id}] Resultado da alimentação:")
    logger.info(json.dumps(resultado_alimentacao, indent=2))
    
    # Fazer predição com candle parcial
    partial = dados["partial_current"]
    resultado_predicao = engine.fazer_predicao(
        abertura=partial["abertura"],
        maxima=partial["maxima_parcial"],
        minima=partial["minima_parcial"]
    )
    
    logger.info(f"[{bot_id}] Resultado da predição:")
    logger.info(json.dumps(resultado_predicao, indent=2, default=str))
    
    # Obter estatísticas
    stats = engine.obter_estatisticas()
    logger.info(f"[{bot_id}] Estatísticas:")
    logger.info(json.dumps(stats, indent=2))
    
    return {
        "alimentacao": resultado_alimentacao,
        "predicao": resultado_predicao,
        "estatisticas": stats
    }


def comparar_resultados(manual: Dict, automatico: Dict) -> None:
    """
    Compara os resultados e identifica divergências
    """
    logger.info("=" * 80)
    logger.info("COMPARAÇÃO DE RESULTADOS")
    logger.info("=" * 80)
    
    # Comparar fase detectada
    fase_manual = manual["estatisticas"]["fase_detectada"]
    fase_auto = automatico["estatisticas"]["fase_detectada"]
    
    logger.info(f"\n📊 FASE DETECTADA:")
    logger.info(f"  Manual:     {fase_manual}")
    logger.info(f"  Automático: {fase_auto}")
    if fase_manual != fase_auto:
        logger.error(f"  ❌ DIVERGÊNCIA ENCONTRADA NA FASE!")
    else:
        logger.info(f"  ✅ Fases idênticas")
    
    # Comparar algoritmo/chave
    if fase_manual == 1:
        chave_manual = manual["estatisticas"]["chave_fase1"]
        chave_auto = automatico["estatisticas"]["chave_fase1"]
        logger.info(f"\n🔑 CHAVE FASE 1:")
        logger.info(f"  Manual:     {chave_manual}")
        logger.info(f"  Automático: {chave_auto}")
        if chave_manual != chave_auto:
            logger.error(f"  ❌ DIVERGÊNCIA ENCONTRADA NA CHAVE!")
        else:
            logger.info(f"  ✅ Chaves idênticas")
    
    # Comparar predição
    pred_manual = manual["predicao"]["fechamento_predito"]
    pred_auto = automatico["predicao"]["fechamento_predito"]
    
    logger.info(f"\n🎯 PREDIÇÃO DE FECHAMENTO:")
    logger.info(f"  Manual:     {pred_manual:.4f}")
    logger.info(f"  Automático: {pred_auto:.4f}")
    
    diferenca = abs(pred_manual - pred_auto)
    if diferenca > 0.0001:  # Tolerância de 0.0001
        logger.error(f"  ❌ DIVERGÊNCIA ENCONTRADA NA PREDIÇÃO! (diferença: {diferenca:.6f})")
    else:
        logger.info(f"  ✅ Predições idênticas (diferença: {diferenca:.6f})")
    
    # Comparar direção
    dir_manual = manual["predicao"]["cor_predita"]
    dir_auto = automatico["predicao"]["cor_predita"]
    
    logger.info(f"\n🎨 DIREÇÃO:")
    logger.info(f"  Manual:     {dir_manual}")
    logger.info(f"  Automático: {dir_auto}")
    if dir_manual != dir_auto:
        logger.error(f"  ❌ DIVERGÊNCIA ENCONTRADA NA DIREÇÃO!")
    else:
        logger.info(f"  ✅ Direções idênticas")
    
    # Comparar algoritmo usado
    algo_manual = manual["predicao"]["algoritmo"]
    algo_auto = automatico["predicao"]["algoritmo"]
    
    logger.info(f"\n⚙️ ALGORITMO:")
    logger.info(f"  Manual:     {algo_manual}")
    logger.info(f"  Automático: {algo_auto}")
    if algo_manual != algo_auto:
        logger.error(f"  ❌ DIVERGÊNCIA ENCONTRADA NO ALGORITMO!")
    else:
        logger.info(f"  ✅ Algoritmos idênticos")
    
    logger.info("=" * 80)


def main():
    """Função principal"""
    logger.info("=" * 80)
    logger.info("TESTE COMPARATIVO DE PREDIÇÃO")
    logger.info("Objetivo: Diagnosticar divergências entre modo manual e automático")
    logger.info("=" * 80)
    
    # Carregar dados de teste
    dados = carregar_dados_teste()
    
    if not dados["history"]:
        logger.error("❌ ERRO: Nenhum dado histórico fornecido!")
        logger.error("Por favor, edite a função carregar_dados_teste() com dados reais.")
        return
    
    # Executar teste manual
    resultado_manual = teste_modo_manual(dados, bot_id="MANUAL")
    
    # Executar teste automático (primeira chamada - inicializa engine)
    resultado_auto_1 = teste_modo_automatico_simulado(dados, bot_id="AUTO_1")
    
    # Executar teste automático (segunda chamada - reutiliza engine)
    resultado_auto_2 = teste_modo_automatico_simulado(dados, bot_id="AUTO_2")
    
    # Comparar manual vs automático (primeira chamada)
    logger.info("\n\n")
    logger.info("=" * 80)
    logger.info("COMPARAÇÃO 1: MANUAL vs AUTOMÁTICO (primeira chamada)")
    logger.info("=" * 80)
    comparar_resultados(resultado_manual, resultado_auto_1)
    
    # Comparar manual vs automático (segunda chamada)
    logger.info("\n\n")
    logger.info("=" * 80)
    logger.info("COMPARAÇÃO 2: MANUAL vs AUTOMÁTICO (segunda chamada - engine reutilizada)")
    logger.info("=" * 80)
    comparar_resultados(resultado_manual, resultado_auto_2)
    
    logger.info("\n\n")
    logger.info("=" * 80)
    logger.info("TESTE CONCLUÍDO")
    logger.info("Logs salvos em: /tmp/prediction_comparison.log")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
