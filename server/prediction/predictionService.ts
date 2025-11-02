import type { PredictionRequest, PredictionResponse } from "../../shared/types/prediction";
import { spawn } from "child_process";
import * as path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

/**
 * Serviço de predição que se conecta à engine proprietária do cliente
 * A engine roda localmente e expõe POST /predict
 * 
 * IMPORTANTE: Esta é a interface com a engine proprietária IMUTÁVEL do cliente
 * NÃO MODIFICAR a lógica de predição ou substituir por outra engine
 */

const PREDICTION_ENGINE_URL = process.env.PREDICTION_ENGINE_URL || "http://localhost:5070";

export class PredictionService {
  private engineUrl: string;

  constructor(engineUrl: string = PREDICTION_ENGINE_URL) {
    this.engineUrl = engineUrl;
    console.log(`[PredictionService] Engine URL configurada: ${this.engineUrl}`);
  }

  /**
   * Chama a engine de predição proprietária
   * @param request Dados do histórico e candle parcial atual
   * @returns Predição com close, direção, fase e estratégia
   */
  async predict(request: PredictionRequest): Promise<PredictionResponse> {
    try {
      const response = await fetch(`${this.engineUrl}/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Prediction engine error: ${response.status} ${response.statusText}`);
      }

      const result: PredictionResponse = await response.json();
      
      // Validar resposta
      if (
        typeof result.predicted_close !== "number" ||
        (result.direction !== "up" && result.direction !== "down") ||
        typeof result.phase !== "string" ||
        typeof result.strategy !== "string"
      ) {
        throw new Error("Invalid prediction response format");
      }

      return result;
    } catch (error) {
      console.error("[PredictionService] Error calling prediction engine:", error);
      throw error;
    }
  }

  /**
   * Verifica se a engine de predição está disponível
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.engineUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch (error) {
      console.error("[PredictionService] Health check failed:", error);
      return false;
    }
  }
}

// Singleton instance
export const predictionService = new PredictionService();


/**
 * Interface para request de predição de amplitude
 */
export interface AmplitudePredictionRequest {
  historical_candles: Array<{
    abertura: number;
    maxima: number;
    minima: number;
    fechamento: number;
  }>;
  current_high: number;
  current_low: number;
  current_price: number;
  elapsed_minutes: number;
  predicted_close: number;
  predicted_direction: string;
}

/**
 * Interface para response de predição de amplitude
 */
export interface AmplitudePredictionResponse {
  predicted_amplitude: number;
  current_amplitude: number;
  confidence: number;
  expansion_probability: number;
  will_expand: boolean;
  growth_potential: number;
  price_position: number;
  price_position_label: string;
  predicted_price_position: number;
  percentile_position: number;
  recommendation: {
    movement_expectation: string;
    movement_confidence: number;
    will_pullback: boolean;
    will_gain_strength: boolean;
    will_consolidate: boolean;
    will_reverse_color: boolean;
    entry_strategy: string;
    entry_reason: string;
    confidence_modifier: number;
    suggested_stake_type: string;
    risk_level: string;
  };
  error?: string;
}

/**
 * Chama o preditor de amplitude Python
 * @param request Dados do candle atual e histórico
 * @returns Predição de amplitude e recomendação estratégica
 */
export async function predictAmplitude(
  request: AmplitudePredictionRequest
): Promise<AmplitudePredictionResponse> {
  return new Promise((resolve, reject) => {
    // Determinar caminho do script Python
    // Se estamos em ESM, usar import.meta.url, senão usar __dirname
    let scriptPath: string;
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      scriptPath = path.join(__dirname, "amplitude_predictor.py");
    } catch {
      // Fallback para CommonJS
      scriptPath = path.join(__dirname, "amplitude_predictor.py");
    }
    
    // Spawn processo Python
    const pythonProcess = spawn("python3", [scriptPath]);
    
    let result = "";
    let errorOutput = "";
    
    // Capturar stdout
    pythonProcess.stdout.on("data", (data: Buffer) => {
      result += data.toString();
    });
    
    // Capturar stderr
    pythonProcess.stderr.on("data", (data: Buffer) => {
      errorOutput += data.toString();
    });
    
    // Enviar dados via stdin
    pythonProcess.stdin.write(JSON.stringify(request));
    pythonProcess.stdin.end();
    
    // Processar resultado
    pythonProcess.on("close", (code: number) => {
      if (code !== 0) {
        console.error(`[AmplitudePredictor] Error: ${errorOutput}`);
        // Retornar resposta neutra em caso de erro
        resolve({
          predicted_amplitude: request.current_high - request.current_low,
          current_amplitude: request.current_high - request.current_low,
          confidence: 50,
          expansion_probability: 0.5,
          will_expand: false,
          growth_potential: 0,
          price_position: 0.5,
          price_position_label: "MIDDLE",
          predicted_price_position: 0.5,
          percentile_position: 50,
          recommendation: {
            movement_expectation: "NEUTRAL",
            movement_confidence: 0.5,
            will_pullback: false,
            will_gain_strength: false,
            will_consolidate: false,
            will_reverse_color: false,
            entry_strategy: "NEUTRAL",
            entry_reason: "Erro na predição de amplitude",
            confidence_modifier: 0,
            suggested_stake_type: "NORMAL",
            risk_level: "MEDIUM"
          },
          error: errorOutput || "Unknown error"
        });
        return;
      }
      
      try {
        const prediction: AmplitudePredictionResponse = JSON.parse(result);
        resolve(prediction);
      } catch (e) {
        console.error(`[AmplitudePredictor] Parse error: ${e}`);
        reject(new Error(`Failed to parse amplitude prediction: ${e}`));
      }
    });
    
    // Timeout de 10 segundos
    setTimeout(() => {
      pythonProcess.kill();
      reject(new Error("Amplitude prediction timeout"));
    }, 10000);
  });
}
