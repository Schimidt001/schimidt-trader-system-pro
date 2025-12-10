#!/usr/bin/env python3
"""
PREDICTION ENGINE - Motor de Predição (VERSÃO DEBUG)
Versão instrumentada para auditoria de divergências
"""

import logging
import numpy as np
from typing import Dict, List, Optional
from datetime import datetime
import json

logger = logging.getLogger(__name__)


class PredictionEngineDebug:
    """Motor de predição com logs detalhados para diagnóstico"""
    
    def __init__(self, bot_id: Optional[str] = None):
        self.bot_id = bot_id or "UNKNOWN"
        self.fase_detectada = None
        self.chave_ativa_fase1 = None
        self.historico_predicoes = []
        self.estatisticas = {
            'total_predicoes': 0,
            'acertos': 0,
            'assertividade': 0.0
        }
        
        logger.info(f"[BOT_{self.bot_id}] PredictionEngineDebug inicializado")
    
    def detectar_fase(self, dados: List[Dict]) -> int:
        """Detecta automaticamente se é Fase 1 ou Fase 2 baseado na escala dos valores"""
        logger.info(f"[BOT_{self.bot_id}] ========== DETECÇÃO DE FASE ==========")
        logger.info(f"[BOT_{self.bot_id}] Total de candles recebidos: {len(dados)}")
        
        if not dados:
            logger.warning(f"[BOT_{self.bot_id}] Nenhum dado fornecido, usando Fase 1 como padrão")
            return 1
        
        # Analisar valores de abertura para detectar escala
        aberturas = [float(candle.get('abertura', 0)) for candle in dados]
        media_abertura = np.mean(aberturas)
        min_abertura = np.min(aberturas)
        max_abertura = np.max(aberturas)
        
        logger.info(f"[BOT_{self.bot_id}] Análise de aberturas:")
        logger.info(f"[BOT_{self.bot_id}]   - Média: {media_abertura:.4f}")
        logger.info(f"[BOT_{self.bot_id}]   - Mínima: {min_abertura:.4f}")
        logger.info(f"[BOT_{self.bot_id}]   - Máxima: {max_abertura:.4f}")
        
        # Fase 1: valores ~0.9, Fase 2: valores ~9400+
        if media_abertura > 1000:
            fase = 2
            logger.info(f"[BOT_{self.bot_id}] ✅ FASE DETECTADA: 2 (média {media_abertura:.2f} > 1000)")
        else:
            fase = 1
            logger.info(f"[BOT_{self.bot_id}] ✅ FASE DETECTADA: 1 (média {media_abertura:.2f} <= 1000)")
        
        # Log dos primeiros e últimos candles
        if len(dados) >= 3:
            logger.info(f"[BOT_{self.bot_id}] Primeiros 3 candles:")
            for i in range(min(3, len(dados))):
                c = dados[i]
                logger.info(f"[BOT_{self.bot_id}]   [{i}] TS={c.get('timestamp', 'N/A')} O={c.get('abertura', 0):.4f} H={c.get('maxima', 0):.4f} L={c.get('minima', 0):.4f} C={c.get('fechamento', 0):.4f}")
            
            logger.info(f"[BOT_{self.bot_id}] Últimos 3 candles:")
            for i in range(max(0, len(dados) - 3), len(dados)):
                c = dados[i]
                logger.info(f"[BOT_{self.bot_id}]   [{i}] TS={c.get('timestamp', 'N/A')} O={c.get('abertura', 0):.4f} H={c.get('maxima', 0):.4f} L={c.get('minima', 0):.4f} C={c.get('fechamento', 0):.4f}")
        
        self.fase_detectada = fase
        logger.info(f"[BOT_{self.bot_id}] Estado interno atualizado: fase_detectada = {fase}")
        logger.info(f"[BOT_{self.bot_id}] =======================================")
        
        return fase
    
    def descobrir_chave_fase1(self, dados: List[Dict]) -> str:
        """Descobre chave para Fase 1 usando metodologia original"""
        logger.info(f"[BOT_{self.bot_id}] ========== DESCOBERTA DE CHAVE FASE 1 ==========")
        
        if len(dados) < 10:
            chave = 'sum_last_3'
            logger.info(f"[BOT_{self.bot_id}] Poucos dados ({len(dados)}), usando chave padrão: {chave}")
            return chave
        
        # Funções de chave da Fase 1
        funcoes_chave = {
            'sum_last_3': lambda x: sum([int(d) for d in str(x).replace('.', '')[-3:]]) % 2,
            '1st_digit_parity': lambda x: int(str(x).replace('.', '')[0]) % 2,
            'decimal_pattern': lambda x: (sum([int(d) for d in str(x).split('.')[-1]]) % 10) / 10,
            'last_integer_digit': lambda x: int(str(int(x))[-1]) % 2
        }
        
        melhor_chave = 'sum_last_3'
        melhor_score = 0
        
        logger.info(f"[BOT_{self.bot_id}] Testando {len(funcoes_chave)} funções de chave...")
        
        for nome_chave, funcao in funcoes_chave.items():
            try:
                score = self._testar_chave_fase1(dados, funcao)
                logger.info(f"[BOT_{self.bot_id}]   - {nome_chave}: score = {score:.4f}")
                if score > melhor_score:
                    melhor_score = score
                    melhor_chave = nome_chave
            except Exception as e:
                logger.warning(f"[BOT_{self.bot_id}] Erro ao testar chave {nome_chave}: {e}")
                continue
        
        self.chave_ativa_fase1 = melhor_chave
        logger.info(f"[BOT_{self.bot_id}] ✅ CHAVE SELECIONADA: {melhor_chave} (score: {melhor_score:.2%})")
        logger.info(f"[BOT_{self.bot_id}] Estado interno atualizado: chave_ativa_fase1 = {melhor_chave}")
        logger.info(f"[BOT_{self.bot_id}] ================================================")
        
        return melhor_chave
    
    def _testar_chave_fase1(self, dados: List[Dict], funcao_chave) -> float:
        """Testa uma chave específica na Fase 1"""
        if len(dados) < 5:
            return 0
        
        acertos = 0
        total = 0
        
        for i in range(1, len(dados)):
            try:
                candle_anterior = dados[i-1]
                candle_atual = dados[i]
                
                abertura = float(candle_anterior['abertura'])
                fechamento_real = float(candle_atual['fechamento'])
                
                # Aplicar função de chave
                chave_valor = funcao_chave(abertura)
                
                # Predição simples baseada na chave
                if chave_valor > 0.5:
                    predicao_cor = 1  # Verde
                else:
                    predicao_cor = 0  # Vermelho
                
                cor_real = 1 if fechamento_real > float(candle_atual['abertura']) else 0
                
                if predicao_cor == cor_real:
                    acertos += 1
                total += 1
            except Exception as e:
                continue
        
        return acertos / total if total > 0 else 0
    
    def algoritmo_fibonacci_amplitude(self, abertura: float, maxima: float, minima: float) -> float:
        """
        Algoritmo Fibonacci da Amplitude - Fase 2
        """
        logger.info(f"[BOT_{self.bot_id}] ========== FIBONACCI DA AMPLITUDE ==========")
        
        try:
            abertura = float(abertura)
            maxima = float(maxima)
            minima = float(minima)
            
            logger.info(f"[BOT_{self.bot_id}] Inputs:")
            logger.info(f"[BOT_{self.bot_id}]   - Abertura: {abertura:.4f}")
            logger.info(f"[BOT_{self.bot_id}]   - Máxima: {maxima:.4f}")
            logger.info(f"[BOT_{self.bot_id}]   - Mínima: {minima:.4f}")
            
            # Calcular ponto médio
            meio = (maxima + minima) / 2
            logger.info(f"[BOT_{self.bot_id}] Ponto médio: {meio:.4f}")
            
            if abertura < meio:
                # Abertura na metade inferior - tendência de alta
                fechamento = abertura + 0.618 * (maxima - abertura)
                logger.info(f"[BOT_{self.bot_id}] 📈 TENDÊNCIA ALTA: abertura ({abertura:.4f}) < meio ({meio:.4f})")
                logger.info(f"[BOT_{self.bot_id}] Cálculo: {abertura:.4f} + 0.618 * ({maxima:.4f} - {abertura:.4f}) = {fechamento:.4f}")
            else:
                # Abertura na metade superior - tendência de baixa
                fechamento = abertura - 0.618 * (abertura - minima)
                logger.info(f"[BOT_{self.bot_id}] 📉 TENDÊNCIA BAIXA: abertura ({abertura:.4f}) >= meio ({meio:.4f})")
                logger.info(f"[BOT_{self.bot_id}] Cálculo: {abertura:.4f} - 0.618 * ({abertura:.4f} - {minima:.4f}) = {fechamento:.4f}")
            
            logger.info(f"[BOT_{self.bot_id}] ✅ FECHAMENTO PREDITO: {fechamento:.4f}")
            logger.info(f"[BOT_{self.bot_id}] ============================================")
            
            return fechamento
        
        except Exception as e:
            logger.error(f"[BOT_{self.bot_id}] ❌ Erro no algoritmo Fibonacci: {e}")
            return abertura  # Fallback
    
    def predizer_fase1(self, abertura: float, maxima: float, minima: float, chave_ativa: str) -> float:
        """Predição para Fase 1 usando metodologia original"""
        logger.info(f"[BOT_{self.bot_id}] ========== PREDIÇÃO FASE 1 ==========")
        logger.info(f"[BOT_{self.bot_id}] Chave ativa: {chave_ativa}")
        
        try:
            # Funções de predição da Fase 1
            funcoes_predicao = {
                'sum_last_3': lambda a, mx, mn: mn + (mx - mn) * 0.6,
                '1st_digit_parity': lambda a, mx, mn: (a + mx + mn) / 3,
                'decimal_pattern': lambda a, mx, mn: mn + (mx - mn) * 0.382,
                'last_integer_digit': lambda a, mx, mn: a + (mx - a) * 0.5
            }
            
            if chave_ativa in funcoes_predicao:
                resultado = funcoes_predicao[chave_ativa](float(abertura), float(maxima), float(minima))
                logger.info(f"[BOT_{self.bot_id}] ✅ Resultado: {resultado:.4f}")
            else:
                # Fallback para média simples
                resultado = (float(abertura) + float(maxima) + float(minima)) / 3
                logger.warning(f"[BOT_{self.bot_id}] Chave não encontrada, usando média simples: {resultado:.4f}")
            
            logger.info(f"[BOT_{self.bot_id}] =====================================")
            return resultado
        
        except Exception as e:
            logger.error(f"[BOT_{self.bot_id}] ❌ Erro na predição Fase 1: {e}")
            return float(abertura)  # Fallback seguro
    
    def alimentar_dados(self, dados: List[Dict]) -> Dict:
        """Alimenta a plataforma com dados históricos"""
        logger.info(f"[BOT_{self.bot_id}] ========================================")
        logger.info(f"[BOT_{self.bot_id}] ALIMENTANDO DADOS HISTÓRICOS")
        logger.info(f"[BOT_{self.bot_id}] ========================================")
        logger.info(f"[BOT_{self.bot_id}] Total de candles: {len(dados)}")
        
        try:
            # Detectar fase automaticamente
            fase_detectada = self.detectar_fase(dados)
            
            if fase_detectada == 1:
                # Descobrir chave para Fase 1
                chave = self.descobrir_chave_fase1(dados)
                estrategia = f"Chave: {chave}"
            else:
                # Fase 2 usa algoritmo Fibonacci da Amplitude
                estrategia = "Fibonacci da Amplitude"
            
            logger.info(f"[BOT_{self.bot_id}] ✅ Dados alimentados com sucesso")
            logger.info(f"[BOT_{self.bot_id}]   - Fase: {fase_detectada}")
            logger.info(f"[BOT_{self.bot_id}]   - Estratégia: {estrategia}")
            logger.info(f"[BOT_{self.bot_id}] ========================================")
            
            return {
                'sucesso': True,
                'total_candles': len(dados),
                'fase_detectada': fase_detectada,
                'estrategia': estrategia,
                'chave_fase1': self.chave_ativa_fase1 if fase_detectada == 1 else None
            }
        
        except Exception as e:
            logger.error(f"[BOT_{self.bot_id}] ❌ Erro ao alimentar dados: {e}", exc_info=True)
            return {
                'sucesso': False,
                'erro': str(e)
            }
    
    def fazer_predicao(self, abertura: float, maxima: float, minima: float) -> Dict:
        """Faz predição baseada na fase detectada"""
        logger.info(f"[BOT_{self.bot_id}] ========================================")
        logger.info(f"[BOT_{self.bot_id}] FAZENDO PREDIÇÃO")
        logger.info(f"[BOT_{self.bot_id}] ========================================")
        
        try:
            fase = self.fase_detectada or 2  # Default Fase 2
            logger.info(f"[BOT_{self.bot_id}] Fase atual: {fase}")
            
            # Converter valores para float
            abertura_float = float(abertura)
            maxima_float = float(maxima)
            minima_float = float(minima)
            
            logger.info(f"[BOT_{self.bot_id}] Candle parcial:")
            logger.info(f"[BOT_{self.bot_id}]   - Abertura: {abertura_float:.4f}")
            logger.info(f"[BOT_{self.bot_id}]   - Máxima: {maxima_float:.4f}")
            logger.info(f"[BOT_{self.bot_id}]   - Mínima: {minima_float:.4f}")
            
            if fase == 1:
                # Usar metodologia da Fase 1
                fechamento_pred = self.predizer_fase1(abertura_float, maxima_float, minima_float, self.chave_ativa_fase1)
                algoritmo_usado = f"Fase 1 - {self.chave_ativa_fase1}"
            else:
                # Usar algoritmo Fibonacci da Amplitude para Fase 2
                fechamento_pred = self.algoritmo_fibonacci_amplitude(abertura_float, maxima_float, minima_float)
                algoritmo_usado = "Fibonacci da Amplitude"
            
            # Determinar cor baseada na abertura
            cor_pred = "Verde" if fechamento_pred > abertura_float else "Vermelho"
            
            # Determinar posição de trading
            posicao = "CALL" if cor_pred == "Verde" else "PUT"
            
            predicao = {
                'fechamento_predito': round(fechamento_pred, 4),
                'cor_predita': cor_pred,
                'posicao': posicao,
                'fase_usada': fase,
                'algoritmo': algoritmo_usado,
                'timestamp': datetime.now().isoformat(),
                'abertura_usada': abertura_float,
                'maxima_usada': maxima_float,
                'minima_usada': minima_float,
                'bot_id': self.bot_id
            }
            
            # Salvar no histórico
            self.historico_predicoes.append(predicao)
            
            logger.info(f"[BOT_{self.bot_id}] ========================================")
            logger.info(f"[BOT_{self.bot_id}] RESULTADO DA PREDIÇÃO")
            logger.info(f"[BOT_{self.bot_id}] ========================================")
            logger.info(f"[BOT_{self.bot_id}] Fechamento predito: {fechamento_pred:.4f}")
            logger.info(f"[BOT_{self.bot_id}] Cor predita: {cor_pred}")
            logger.info(f"[BOT_{self.bot_id}] Posição: {posicao}")
            logger.info(f"[BOT_{self.bot_id}] Algoritmo: {algoritmo_usado}")
            logger.info(f"[BOT_{self.bot_id}] ========================================")
            
            return predicao
        
        except Exception as e:
            logger.error(f"[BOT_{self.bot_id}] ❌ Erro na predição: {e}", exc_info=True)
            return {
                'erro': str(e),
                'fechamento_predito': float(abertura),
                'cor_predita': "Erro",
                'posicao': "NENHUMA",
                'bot_id': self.bot_id
            }
    
    def obter_estatisticas(self) -> Dict:
        """Retorna estatísticas atuais"""
        return {
            'bot_id': self.bot_id,
            'fase_detectada': self.fase_detectada,
            'chave_fase1': self.chave_ativa_fase1,
            'total_predicoes': len(self.historico_predicoes),
            'acertos': self.estatisticas['acertos'],
            'assertividade': round(self.estatisticas['assertividade'], 2),
        }
