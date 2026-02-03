/**
 * Institutional Logger - Sistema de Logs Estruturados para Modo Institucional
 * 
 * Emite logs estruturados para Railway stdout conforme especificação:
 * - SMC_INST_STATUS: Status do modo institucional (boot + troca de sessão)
 * - SMC_INST_DECISION: Decisão final de trading
 * 
 * @author Schimidt Trader Pro
 * @version 1.0.0
 */

import { InstitutionalLog, InstitutionalFSMState, SessionType } from "./SMCInstitutionalTypes";
import { SMCInstitutionalManager } from "./SMCStrategyInstitutional";

/**
 * Log SMC_INST_STATUS
 * Emitido 1x por símbolo no boot + em troca de sessão
 */
export interface SMCInstStatusLog {
  type: 'SMC_INST_STATUS';
  symbol: string;
  timestamp: number;
  enabled: boolean;
  source: 'db' | 'config';
  session: SessionType;
  fsmPhase: InstitutionalFSMState;
  tradesThisSession: number;
  maxTradesPerSession: number;
}

/**
 * Log SMC_INST_DECISION
 * Emitido somente em decisão final
 */
export interface SMCInstDecisionLog {
  type: 'SMC_INST_DECISION';
  symbol: string;
  timestamp: number;
  decision: 'NO_TRADE' | 'TRADE' | 'EXPIRE';
  reason: string;
  poolKey?: string | null;
  fvgId?: string | null;
  chochPrice?: number | null;
  direction?: 'BUY' | 'SELL' | null;
}

/**
 * Classe responsável por emitir logs estruturados do modo institucional
 */
export class InstitutionalLogger {
  private userId: number;
  private botId: number;
  private statusLoggedSymbols: Set<string> = new Set();
  
  constructor(userId: number, botId: number) {
    this.userId = userId;
    this.botId = botId;
  }
  
  /**
   * Emite log SMC_INST_STATUS
   * Deve ser chamado 1x no boot e em cada troca de sessão
   */
  logStatus(
    symbol: string,
    enabled: boolean,
    session: SessionType,
    fsmPhase: InstitutionalFSMState,
    tradesThisSession: number,
    maxTradesPerSession: number
  ): void {
    const log: SMCInstStatusLog = {
      type: 'SMC_INST_STATUS',
      symbol,
      timestamp: Date.now(),
      enabled,
      source: 'db',
      session,
      fsmPhase,
      tradesThisSession,
      maxTradesPerSession,
    };
    
    // Log estruturado para Railway stdout (nível INFO)
    console.log(JSON.stringify({
      level: 'INFO',
      category: 'INSTITUTIONAL',
      userId: this.userId,
      botId: this.botId,
      ...log,
    }));
  }
  
  /**
   * Emite log SMC_INST_DECISION
   * Deve ser chamado somente em decisão final
   */
  logDecision(
    symbol: string,
    decision: 'NO_TRADE' | 'TRADE' | 'EXPIRE',
    reason: string,
    metadata?: {
      poolKey?: string | null;
      fvgId?: string | null;
      chochPrice?: number | null;
      direction?: 'BUY' | 'SELL' | null;
    }
  ): void {
    const log: SMCInstDecisionLog = {
      type: 'SMC_INST_DECISION',
      symbol,
      timestamp: Date.now(),
      decision,
      reason,
      poolKey: metadata?.poolKey,
      fvgId: metadata?.fvgId,
      chochPrice: metadata?.chochPrice,
      direction: metadata?.direction,
    };
    
    // Log estruturado para Railway stdout (nível INFO)
    console.log(JSON.stringify({
      level: 'INFO',
      category: 'INSTITUTIONAL',
      userId: this.userId,
      botId: this.botId,
      ...log,
    }));
  }
  
  /**
   * Callback para processar logs do InstitutionalManager
   * Converte logs internos para formato estruturado Railway
   */
  createLogCallback(): (log: InstitutionalLog) => void {
    return (log: InstitutionalLog) => {
      if (log.type === 'PHASE_TRANSITION') {
        // Transição de fase - não emitir log estruturado (apenas console.log interno)
        // SMC_INST_STATUS será emitido manualmente no boot e troca de sessão
        return;
      }
      
      if (log.type === 'DECISION_FINAL') {
        // Decisão final - emitir SMC_INST_DECISION
        this.logDecision(
          log.symbol,
          log.decision as 'NO_TRADE' | 'TRADE' | 'EXPIRE',
          log.reason || 'Unknown reason',
          {
            poolKey: log.metadata?.poolKey,
            fvgId: log.metadata?.fvgId,
            chochPrice: log.metadata?.chochPrice,
            direction: log.direction,
          }
        );
      }
    };
  }
  
  /**
   * Marca que o status já foi logado para um símbolo (boot)
   */
  markStatusLogged(symbol: string): void {
    this.statusLoggedSymbols.add(symbol);
  }
  
  /**
   * Verifica se o status já foi logado para um símbolo
   */
  hasStatusLogged(symbol: string): boolean {
    return this.statusLoggedSymbols.has(symbol);
  }
  
  /**
   * Reseta flag de status logado (útil em restart)
   */
  resetStatusLogged(): void {
    this.statusLoggedSymbols.clear();
  }
}
