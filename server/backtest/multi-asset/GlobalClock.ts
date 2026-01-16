/**
 * GlobalClock - Relógio Global para Sincronização Multi-Asset
 * 
 * IMPLEMENTAÇÃO WP6: Multi-Asset com relógio global (institucional)
 * 
 * Implementa sincronização temporal para:
 * - Garantir que todos os símbolos processem o mesmo timestamp
 * - Aplicar limites globais ANTES de enviar ordens
 * - Manter consistência temporal entre ativos
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Estado do relógio global
 */
export interface GlobalClockState {
  currentTimestamp: number;
  currentDate: Date;
  tickCount: number;
  startTimestamp: number;
  endTimestamp: number;
  isRunning: boolean;
}

/**
 * Evento de tick do relógio
 */
export interface ClockTickEvent {
  timestamp: number;
  date: Date;
  tickNumber: number;
  symbols: string[];
}

/**
 * Callback de tick
 */
export type ClockTickCallback = (event: ClockTickEvent) => Promise<void>;

// ============================================================================
// GLOBAL CLOCK CLASS
// ============================================================================

export class GlobalClock {
  private currentTimestamp: number;
  private startTimestamp: number;
  private endTimestamp: number;
  private tickCount: number = 0;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  
  private symbols: Set<string> = new Set();
  private tickCallbacks: ClockTickCallback[] = [];
  
  // Controle de sincronização
  private symbolTimestamps: Map<string, number> = new Map();
  
  constructor(startTimestamp: number, endTimestamp: number) {
    this.startTimestamp = startTimestamp;
    this.endTimestamp = endTimestamp;
    this.currentTimestamp = startTimestamp;
    
    console.log(`[GlobalClock] Inicializado: ${new Date(startTimestamp).toISOString()} - ${new Date(endTimestamp).toISOString()}`);
  }
  
  /**
   * Registrar símbolo para sincronização
   */
  registerSymbol(symbol: string): void {
    this.symbols.add(symbol);
    this.symbolTimestamps.set(symbol, this.currentTimestamp);
    console.log(`[GlobalClock] Símbolo registrado: ${symbol}`);
  }
  
  /**
   * Desregistrar símbolo
   */
  unregisterSymbol(symbol: string): void {
    this.symbols.delete(symbol);
    this.symbolTimestamps.delete(symbol);
  }
  
  /**
   * Adicionar callback de tick
   */
  onTick(callback: ClockTickCallback): void {
    this.tickCallbacks.push(callback);
  }
  
  /**
   * Remover callback de tick
   */
  offTick(callback: ClockTickCallback): void {
    const index = this.tickCallbacks.indexOf(callback);
    if (index !== -1) {
      this.tickCallbacks.splice(index, 1);
    }
  }
  
  /**
   * Obter timestamp atual
   */
  getCurrentTimestamp(): number {
    return this.currentTimestamp;
  }
  
  /**
   * Obter data atual
   */
  getCurrentDate(): Date {
    return new Date(this.currentTimestamp);
  }
  
  /**
   * Obter estado do relógio
   */
  getState(): GlobalClockState {
    return {
      currentTimestamp: this.currentTimestamp,
      currentDate: new Date(this.currentTimestamp),
      tickCount: this.tickCount,
      startTimestamp: this.startTimestamp,
      endTimestamp: this.endTimestamp,
      isRunning: this.isRunning,
    };
  }
  
  /**
   * Verificar se timestamp é válido (não está no futuro)
   */
  isValidTimestamp(timestamp: number): boolean {
    return timestamp <= this.currentTimestamp;
  }
  
  /**
   * Avançar para próximo timestamp
   * 
   * @param timestamp - Próximo timestamp a processar
   * @returns true se avançou, false se timestamp inválido
   */
  async advanceTo(timestamp: number): Promise<boolean> {
    // Validar timestamp
    if (timestamp < this.currentTimestamp) {
      console.warn(`[GlobalClock] Tentativa de voltar no tempo: ${timestamp} < ${this.currentTimestamp}`);
      return false;
    }
    
    if (timestamp > this.endTimestamp) {
      console.log(`[GlobalClock] Fim do período atingido`);
      this.isRunning = false;
      return false;
    }
    
    // Atualizar timestamp
    this.currentTimestamp = timestamp;
    this.tickCount++;
    
    // Atualizar timestamps de todos os símbolos
    for (const symbol of this.symbols) {
      this.symbolTimestamps.set(symbol, timestamp);
    }
    
    // Disparar callbacks
    const event: ClockTickEvent = {
      timestamp,
      date: new Date(timestamp),
      tickNumber: this.tickCount,
      symbols: Array.from(this.symbols),
    };
    
    for (const callback of this.tickCallbacks) {
      await callback(event);
    }
    
    return true;
  }
  
  /**
   * Verificar se símbolo está sincronizado
   */
  isSymbolSynced(symbol: string): boolean {
    const symbolTs = this.symbolTimestamps.get(symbol);
    return symbolTs === this.currentTimestamp;
  }
  
  /**
   * Obter timestamp de um símbolo
   */
  getSymbolTimestamp(symbol: string): number | undefined {
    return this.symbolTimestamps.get(symbol);
  }
  
  /**
   * Iniciar relógio
   */
  start(): void {
    this.isRunning = true;
    this.isPaused = false;
    console.log(`[GlobalClock] Iniciado`);
  }
  
  /**
   * Pausar relógio
   */
  pause(): void {
    this.isPaused = true;
    console.log(`[GlobalClock] Pausado`);
  }
  
  /**
   * Retomar relógio
   */
  resume(): void {
    this.isPaused = false;
    console.log(`[GlobalClock] Retomado`);
  }
  
  /**
   * Parar relógio
   */
  stop(): void {
    this.isRunning = false;
    console.log(`[GlobalClock] Parado`);
  }
  
  /**
   * Resetar relógio
   */
  reset(): void {
    this.currentTimestamp = this.startTimestamp;
    this.tickCount = 0;
    this.isRunning = false;
    this.isPaused = false;
    
    for (const symbol of this.symbols) {
      this.symbolTimestamps.set(symbol, this.startTimestamp);
    }
    
    console.log(`[GlobalClock] Resetado`);
  }
  
  /**
   * Obter progresso (0-100)
   */
  getProgress(): number {
    const total = this.endTimestamp - this.startTimestamp;
    const current = this.currentTimestamp - this.startTimestamp;
    return (current / total) * 100;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Criar relógio global
 */
export function createGlobalClock(startDate: Date, endDate: Date): GlobalClock {
  return new GlobalClock(startDate.getTime(), endDate.getTime());
}

// ============================================================================
// EXPORTS
// ============================================================================

export default GlobalClock;
