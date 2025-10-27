import type { PredictionRequest, PredictionResponse } from "../../shared/types/prediction";

/**
 * Serviço de predição que se conecta à engine proprietária do cliente
 * A engine roda localmente e expõe POST /predict
 * 
 * IMPORTANTE: Esta é a interface com a engine proprietária IMUTÁVEL do cliente
 * NÃO MODIFICAR a lógica de predição ou substituir por outra engine
 */

const PREDICTION_ENGINE_URL = process.env.PREDICTION_ENGINE_URL || "http://localhost:5000";

export class PredictionService {
  private engineUrl: string;

  constructor(engineUrl: string = PREDICTION_ENGINE_URL) {
    this.engineUrl = engineUrl;
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

