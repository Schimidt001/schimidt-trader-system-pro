/**
 * SMC Trading Engine Manager - Gerenciador de Instâncias Live
 *
 * Responsável por gerenciar o ciclo de vida e injeção de dependências
 * das instâncias do SMCTradingEngine para o ambiente de PRODUÇÃO (Live).
 *
 * Separação de responsabilidades (SOLID):
 * - SMCTradingEngine: Lógica de negócio pura (agnóstico de adapter)
 * - SMCTradingEngineManager: Configuração e injeção (específico para Live)
 *
 * @author Schimidt Trader Pro
 * @version 1.0.0
 */

import { SMCTradingEngine, SMCBotStatus } from "./SMCTradingEngine";
import { ctraderAdapter } from "../CTraderAdapter";
import { ITradingAdapter } from "../../backtest/adapters/ITradingAdapter";

// ============= GERENCIADOR DE INSTÂNCIAS =============

const activeSMCEngines = new Map<string, SMCTradingEngine>();

function getEngineKey(userId: number, botId: number): string {
  return `${userId}-${botId}`;
}

/**
 * Obtém ou cria uma instância do SMCTradingEngine para ambiente LIVE
 * Injeta automaticamente o CTraderAdapter singleton
 */
export function getSMCTradingEngine(userId: number, botId: number = 1): SMCTradingEngine {
  const key = getEngineKey(userId, botId);

  if (!activeSMCEngines.has(key)) {
    console.log(`[SMCTradingEngineManager] Criando nova instância LIVE para usuário ${userId}, bot ${botId}`);

    // INJEÇÃO DE DEPENDÊNCIA: Aqui injetamos explicitamente o CTraderAdapter
    // Isso garante que apenas as instâncias criadas por este manager acessem a corretora
    activeSMCEngines.set(
      key,
      new SMCTradingEngine(
        userId,
        botId,
        {}, // Config inicial vazia (será carregada do DB)
        ctraderAdapter as unknown as ITradingAdapter
      )
    );
  }

  return activeSMCEngines.get(key)!;
}

/**
 * Remove uma instância do SMCTradingEngine
 */
export async function removeSMCTradingEngine(userId: number, botId: number = 1): Promise<void> {
  const key = getEngineKey(userId, botId);
  const engine = activeSMCEngines.get(key);
  if (engine) {
    if (engine.isRunning) {
      await engine.stop();
    }
    activeSMCEngines.delete(key);
    console.log(`[SMCTradingEngineManager] Instância removida para usuário ${userId}, bot ${botId}`);
  }
}

/**
 * Obtém status de todos os engines ativos
 */
export function getAllSMCEnginesStatus(): Array<{ userId: number; botId: number; status: SMCBotStatus }> {
  const result: Array<{ userId: number; botId: number; status: SMCBotStatus }> = [];

  const entries = Array.from(activeSMCEngines.entries());
  for (const [key, engine] of entries) {
    const [userId, botId] = key.split("-").map(Number);
    result.push({
      userId,
      botId,
      status: engine.getStatus(),
    });
  }

  return result;
}
