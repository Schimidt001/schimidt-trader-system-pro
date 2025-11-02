#!/usr/bin/env python3
"""
Preditor de Amplitude Final do Candle - Versão para Integração
Recebe dados via stdin (JSON) e retorna predição via stdout (JSON)
"""

import sys
import json
import statistics
import math
from typing import List, Dict

class AmplitudePredictor:
    """
    Prediz a amplitude final de um candle baseado em dados parciais
    """
    
    def __init__(self, historical_candles: List[Dict]):
        self.historical_candles = historical_candles
        self.mean_amplitude = 0
        self.std_amplitude = 0
        self.amplitude_percentiles = {}
        self._calculate_statistics()
    
    def _calculate_statistics(self):
        """Calcula estatísticas dos candles históricos"""
        if not self.historical_candles:
            return
        
        amplitudes = []
        for c in self.historical_candles:
            amp = c['maxima'] - c['minima']
            if amp > 0:  # Ignorar candles com amplitude zero
                amplitudes.append(amp)
        
        if not amplitudes:
            return
        
        self.mean_amplitude = statistics.mean(amplitudes)
        self.std_amplitude = statistics.stdev(amplitudes) if len(amplitudes) > 1 else 0
        
        # Calcular percentis
        percentiles = [10, 25, 50, 75, 90, 95]
        for p in percentiles:
            self.amplitude_percentiles[p] = self._percentile(amplitudes, p)
    
    def _percentile(self, data: List[float], percentile: int) -> float:
        """Calcula percentil manualmente (sem numpy)"""
        sorted_data = sorted(data)
        index = (percentile / 100) * (len(sorted_data) - 1)
        lower = math.floor(index)
        upper = math.ceil(index)
        
        if lower == upper:
            return sorted_data[int(index)]
        
        return sorted_data[lower] * (upper - index) + sorted_data[upper] * (index - lower)
    
    def predict_final_amplitude(
        self,
        current_high: float,
        current_low: float,
        current_price: float,
        elapsed_minutes: float,
        predicted_close: float,
        predicted_direction: str
    ) -> Dict:
        """
        Prediz a amplitude final do candle e gera recomendação estratégica
        
        Args:
            current_high: Máxima atual do candle
            current_low: Mínima atual do candle
            current_price: Preço atual
            elapsed_minutes: Minutos decorridos (0-15)
            predicted_close: Valor de fechamento previsto pela plataforma
            predicted_direction: Direção prevista ("compra" ou "venda")
        
        Returns:
            Dict com predição completa e recomendação estratégica
        """
        current_amplitude = current_high - current_low
        
        if current_amplitude == 0:
            current_amplitude = 0.01  # Evitar divisão por zero
        
        # === MÉTODO 1: Extrapolação Não-Linear ===
        time_ratio = elapsed_minutes / 15.0
        
        # Fator de crescimento baseado no tempo
        if time_ratio < 0.33:  # 0-5 min
            growth_factor = 1.8
        elif time_ratio < 0.67:  # 5-10 min
            growth_factor = 1.4
        elif time_ratio < 0.83:  # 10-12.5 min
            growth_factor = 1.2
        else:  # 12.5-15 min (CRÍTICO)
            growth_factor = 1.15
        
        predicted_amplitude_linear = current_amplitude * growth_factor
        
        # === MÉTODO 2: Baseado em Média Histórica ===
        if self.mean_amplitude > 0:
            amplitude_ratio = current_amplitude / self.mean_amplitude
            
            if amplitude_ratio > 1.5:  # Já muito volátil
                predicted_amplitude_mean = current_amplitude * 1.05
            elif amplitude_ratio < 0.5:  # Muito calmo
                predicted_amplitude_mean = self.mean_amplitude * 0.8
            else:
                predicted_amplitude_mean = self.mean_amplitude
        else:
            predicted_amplitude_mean = predicted_amplitude_linear
        
        # === MÉTODO 3: Baseado na Predição de Fechamento ===
        # Calcular onde o preço previsto está em relação ao range atual
        predicted_distance_from_high = abs(predicted_close - current_high)
        predicted_distance_from_low = abs(predicted_close - current_low)
        max_predicted_distance = max(predicted_distance_from_high, predicted_distance_from_low)
        
        # Se a predição aponta para fora do range atual, amplitude vai expandir
        if predicted_close > current_high:
            predicted_amplitude_from_close = (predicted_close - current_low) * 1.1
        elif predicted_close < current_low:
            predicted_amplitude_from_close = (current_high - predicted_close) * 1.1
        else:
            predicted_amplitude_from_close = current_amplitude * 1.05
        
        # === COMBINAR MÉTODOS ===
        weights = [0.3, 0.3, 0.4]  # Linear, Média, Predição
        predicted_amplitude = (
            weights[0] * predicted_amplitude_linear +
            weights[1] * predicted_amplitude_mean +
            weights[2] * predicted_amplitude_from_close
        )
        
        # === CALCULAR CONFIANÇA ===
        confidence = min(95, 40 + (time_ratio * 60))
        
        # === CALCULAR PROBABILIDADE DE EXPANSÃO ===
        expansion_probability = self._calculate_expansion_probability(
            current_amplitude,
            predicted_amplitude,
            elapsed_minutes,
            current_price,
            current_high,
            current_low,
            predicted_close,
            predicted_direction
        )
        
        # === ANALISAR POSIÇÃO DO PREÇO ===
        price_position = (current_price - current_low) / current_amplitude if current_amplitude > 0 else 0.5
        price_position_label = "TOP" if price_position > 0.7 else "BOTTOM" if price_position < 0.3 else "MIDDLE"
        
        # === ANALISAR PREDIÇÃO vs POSIÇÃO ATUAL ===
        predicted_price_position = (predicted_close - current_low) / current_amplitude if current_amplitude > 0 else 0.5
        
        # === GERAR RECOMENDAÇÃO ESTRATÉGICA ===
        recommendation = self._generate_strategic_recommendation(
            current_price,
            current_high,
            current_low,
            predicted_close,
            predicted_direction,
            predicted_amplitude,
            current_amplitude,
            expansion_probability,
            elapsed_minutes,
            price_position,
            predicted_price_position
        )
        
        return {
            "predicted_amplitude": round(predicted_amplitude, 4),
            "current_amplitude": round(current_amplitude, 4),
            "confidence": round(confidence, 2),
            "expansion_probability": round(expansion_probability, 4),
            "will_expand": expansion_probability > 0.6,
            "growth_potential": round((predicted_amplitude - current_amplitude) / current_amplitude, 4) if current_amplitude > 0 else 0,
            "price_position": round(price_position, 4),
            "price_position_label": price_position_label,
            "predicted_price_position": round(predicted_price_position, 4),
            "percentile_position": self._get_percentile_position(predicted_amplitude),
            "recommendation": recommendation
        }
    
    def _calculate_expansion_probability(
        self,
        current_amplitude: float,
        predicted_amplitude: float,
        elapsed_minutes: float,
        current_price: float,
        current_high: float,
        current_low: float,
        predicted_close: float,
        predicted_direction: str
    ) -> float:
        """Calcula probabilidade de expansão do candle"""
        
        # Fator 1: Potencial de crescimento
        growth_potential = (predicted_amplitude - current_amplitude) / current_amplitude if current_amplitude > 0 else 0
        growth_factor = min(1.0, max(0, growth_potential))
        
        # Fator 2: Posição do preço
        if current_amplitude > 0:
            price_position = (current_price - current_low) / current_amplitude
        else:
            price_position = 0.5
        
        position_factor = 1 - abs(price_position - 0.5) * 2
        
        # Fator 3: Tempo restante
        time_ratio = elapsed_minutes / 15.0
        if time_ratio > 0.83:  # Últimos 2.5 min
            time_factor = 0.85
        elif time_ratio > 0.67:
            time_factor = 0.65
        else:
            time_factor = 0.45
        
        # Fator 4: Alinhamento com predição
        # Se a predição aponta para fora do range, alta chance de expansão
        if predicted_close > current_high or predicted_close < current_low:
            prediction_factor = 0.9
        else:
            prediction_factor = 0.5
        
        # Combinar fatores
        expansion_prob = (
            growth_factor * 0.25 +
            position_factor * 0.20 +
            time_factor * 0.30 +
            prediction_factor * 0.25
        )
        
        return max(0, min(1, expansion_prob))
    
    def _get_percentile_position(self, amplitude: float) -> int:
        """Retorna em qual percentil a amplitude está"""
        if not self.amplitude_percentiles:
            return 50
        
        for p in sorted(self.amplitude_percentiles.keys(), reverse=True):
            if amplitude >= self.amplitude_percentiles[p]:
                return p
        return 10
    
    def _generate_strategic_recommendation(
        self,
        current_price: float,
        current_high: float,
        current_low: float,
        predicted_close: float,
        predicted_direction: str,
        predicted_amplitude: float,
        current_amplitude: float,
        expansion_probability: float,
        elapsed_minutes: float,
        price_position: float,
        predicted_price_position: float
    ) -> Dict:
        """
        Gera recomendação estratégica completa para a IA
        """
        
        # Analisar se vai recuar, ganhar força, parar ou trocar de cor
        movement_analysis = self._analyze_movement_expectation(
            current_price,
            current_high,
            current_low,
            predicted_close,
            predicted_direction,
            price_position,
            predicted_price_position,
            expansion_probability
        )
        
        # Determinar estratégia de entrada
        entry_strategy = self._determine_entry_strategy(
            predicted_direction,
            movement_analysis,
            expansion_probability,
            price_position,
            elapsed_minutes
        )
        
        return {
            "movement_expectation": movement_analysis["expectation"],
            "movement_confidence": movement_analysis["confidence"],
            "will_pullback": movement_analysis["will_pullback"],
            "will_gain_strength": movement_analysis["will_gain_strength"],
            "will_consolidate": movement_analysis["will_consolidate"],
            "will_reverse_color": movement_analysis["will_reverse_color"],
            "entry_strategy": entry_strategy["strategy"],
            "entry_reason": entry_strategy["reason"],
            "confidence_modifier": entry_strategy["confidence_modifier"],
            "suggested_stake_type": entry_strategy["stake_type"],
            "risk_level": entry_strategy["risk_level"]
        }
    
    def _analyze_movement_expectation(
        self,
        current_price: float,
        current_high: float,
        current_low: float,
        predicted_close: float,
        predicted_direction: str,
        price_position: float,
        predicted_price_position: float,
        expansion_probability: float
    ) -> Dict:
        """Analisa se o candle vai recuar, ganhar força, consolidar ou trocar de cor"""
        
        # Calcular distância entre preço atual e predição
        price_to_prediction_distance = abs(predicted_close - current_price)
        current_amplitude = current_high - current_low
        distance_ratio = price_to_prediction_distance / current_amplitude if current_amplitude > 0 else 0
        
        # Determinar se vai recuar
        will_pullback = False
        if price_position > 0.75 and predicted_price_position < 0.6:
            will_pullback = True
        elif price_position < 0.25 and predicted_price_position > 0.4:
            will_pullback = True
        
        # Determinar se vai ganhar força
        will_gain_strength = False
        if expansion_probability > 0.7 and distance_ratio > 0.3:
            will_gain_strength = True
        
        # Determinar se vai consolidar
        will_consolidate = False
        if expansion_probability < 0.4 and distance_ratio < 0.2:
            will_consolidate = True
        
        # Determinar se vai trocar de cor
        will_reverse_color = False
        current_color = "green" if current_price > (current_high + current_low) / 2 else "red"
        predicted_color = "green" if predicted_direction == "compra" else "red"
        if current_color != predicted_color and expansion_probability > 0.6:
            will_reverse_color = True
        
        # Gerar expectativa principal
        if will_pullback:
            expectation = "PULLBACK"
            confidence = 0.75
        elif will_gain_strength:
            expectation = "GAIN_STRENGTH"
            confidence = 0.80
        elif will_consolidate:
            expectation = "CONSOLIDATE"
            confidence = 0.70
        elif will_reverse_color:
            expectation = "REVERSE_COLOR"
            confidence = 0.65
        else:
            expectation = "NEUTRAL"
            confidence = 0.50
        
        return {
            "expectation": expectation,
            "confidence": confidence,
            "will_pullback": will_pullback,
            "will_gain_strength": will_gain_strength,
            "will_consolidate": will_consolidate,
            "will_reverse_color": will_reverse_color
        }
    
    def _determine_entry_strategy(
        self,
        predicted_direction: str,
        movement_analysis: Dict,
        expansion_probability: float,
        price_position: float,
        elapsed_minutes: float
    ) -> Dict:
        """Determina estratégia de entrada (defesa, alta confiança, hedge, etc.)"""
        
        expectation = movement_analysis["expectation"]
        movement_confidence = movement_analysis["confidence"]
        
        # === ESTRATÉGIA: ALTA CONFIANÇA ===
        if (expectation == "GAIN_STRENGTH" and expansion_probability > 0.75 and 
            movement_confidence > 0.75 and elapsed_minutes > 12.5):
            return {
                "strategy": "HIGH_CONFIDENCE",
                "reason": "Movimento forte esperado com alta confiança nos últimos minutos",
                "confidence_modifier": +25,  # Aumenta confiança da IA em 25%
                "stake_type": "HIGH",
                "risk_level": "MEDIUM"
            }
        
        # === ESTRATÉGIA: DEFESA ===
        if expectation == "PULLBACK" or expectation == "REVERSE_COLOR":
            return {
                "strategy": "DEFENSE",
                "reason": "Recuo ou reversão esperada - entrada defensiva",
                "confidence_modifier": -20,  # Reduz confiança da IA
                "stake_type": "LOW",
                "risk_level": "HIGH"
            }
        
        # === ESTRATÉGIA: CONSOLIDAÇÃO (AGUARDAR) ===
        if expectation == "CONSOLIDATE":
            return {
                "strategy": "WAIT",
                "reason": "Candle deve consolidar - evitar entrada",
                "confidence_modifier": -30,
                "stake_type": "NONE",
                "risk_level": "HIGH"
            }
        
        # === ESTRATÉGIA: HEDGE (NORMAL) ===
        if expansion_probability > 0.5 and expansion_probability < 0.75:
            return {
                "strategy": "HEDGE",
                "reason": "Probabilidade moderada - usar hedge",
                "confidence_modifier": 0,
                "stake_type": "NORMAL",
                "risk_level": "MEDIUM"
            }
        
        # === ESTRATÉGIA: NEUTRA ===
        return {
            "strategy": "NEUTRAL",
            "reason": "Sem sinal claro - seguir predição padrão",
            "confidence_modifier": 0,
            "stake_type": "NORMAL",
            "risk_level": "MEDIUM"
        }


def main():
    """Função principal para integração com backend"""
    try:
        # Ler dados do stdin
        input_data = json.loads(sys.stdin.read())
        
        # Extrair parâmetros
        historical_candles = input_data.get("historical_candles", [])
        current_high = float(input_data.get("current_high", 0))
        current_low = float(input_data.get("current_low", 0))
        current_price = float(input_data.get("current_price", 0))
        elapsed_minutes = float(input_data.get("elapsed_minutes", 0))
        predicted_close = float(input_data.get("predicted_close", 0))
        predicted_direction = input_data.get("predicted_direction", "compra")
        
        # Criar preditor
        predictor = AmplitudePredictor(historical_candles)
        
        # Fazer predição
        result = predictor.predict_final_amplitude(
            current_high=current_high,
            current_low=current_low,
            current_price=current_price,
            elapsed_minutes=elapsed_minutes,
            predicted_close=predicted_close,
            predicted_direction=predicted_direction
        )
        
        # Retornar resultado como JSON
        print(json.dumps(result))
        sys.exit(0)
        
    except Exception as e:
        error_result = {
            "error": str(e),
            "recommendation": {
                "strategy": "NEUTRAL",
                "confidence_modifier": 0
            }
        }
        print(json.dumps(error_result))
        sys.exit(1)


if __name__ == "__main__":
    main()
