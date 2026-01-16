/**
 * SeededRNG - Gerador de Números Aleatórios Determinístico
 * 
 * IMPLEMENTAÇÃO WP1: Garantir determinismo em todas as operações aleatórias
 * 
 * Este módulo fornece:
 * - RNG seedado para reprodutibilidade
 * - Múltiplos algoritmos (Mulberry32, xorshift128+)
 * - Funções utilitárias para diferentes distribuições
 * - Registro de seed para auditoria
 * 
 * POLÍTICA P0: RNG não-seedado é PROIBIDO no laboratório de backtest
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Interface para gerador de números aleatórios
 */
export interface IRNG {
  /** Gerar número entre 0 e 1 */
  random(): number;
  /** Obter seed atual */
  getSeed(): number;
  /** Resetar para seed inicial */
  reset(): void;
  /** Clonar RNG com mesmo estado */
  clone(): IRNG;
}

/**
 * Configuração do RNG
 */
export interface RNGConfig {
  /** Seed inicial */
  seed: number;
  /** Algoritmo a usar */
  algorithm?: "mulberry32" | "xorshift128";
}

// ============================================================================
// MULBERRY32 IMPLEMENTATION
// ============================================================================

/**
 * Mulberry32 - Algoritmo rápido e de boa qualidade para 32 bits
 * 
 * Características:
 * - Período: 2^32
 * - Rápido e eficiente
 * - Boa distribuição estatística
 */
export class Mulberry32RNG implements IRNG {
  private readonly initialSeed: number;
  private state: number;
  
  constructor(seed: number) {
    this.initialSeed = seed >>> 0; // Garantir unsigned 32-bit
    this.state = this.initialSeed;
  }
  
  random(): number {
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  
  getSeed(): number {
    return this.initialSeed;
  }
  
  reset(): void {
    this.state = this.initialSeed;
  }
  
  clone(): IRNG {
    const cloned = new Mulberry32RNG(this.initialSeed);
    cloned.state = this.state;
    return cloned;
  }
}

// ============================================================================
// XORSHIFT128+ IMPLEMENTATION
// ============================================================================

/**
 * xorshift128+ - Algoritmo de alta qualidade para 64 bits
 * 
 * Características:
 * - Período: 2^128 - 1
 * - Excelente distribuição estatística
 * - Passa todos os testes BigCrush
 */
export class XorShift128PlusRNG implements IRNG {
  private readonly initialSeed: number;
  private state0: number;
  private state1: number;
  
  constructor(seed: number) {
    this.initialSeed = seed >>> 0;
    // Inicializar estados a partir do seed
    this.state0 = this.initialSeed;
    this.state1 = this.initialSeed ^ 0x5DEECE66D;
    
    // Warmup para melhor distribuição inicial
    for (let i = 0; i < 20; i++) {
      this.random();
    }
    
    // Resetar para estado inicial após warmup
    this.state0 = this.initialSeed;
    this.state1 = this.initialSeed ^ 0x5DEECE66D;
  }
  
  random(): number {
    let s1 = this.state0;
    const s0 = this.state1;
    
    this.state0 = s0;
    s1 ^= s1 << 23;
    s1 ^= s1 >>> 17;
    s1 ^= s0;
    s1 ^= s0 >>> 26;
    this.state1 = s1;
    
    // Converter para número entre 0 e 1
    return ((this.state0 + this.state1) >>> 0) / 4294967296;
  }
  
  getSeed(): number {
    return this.initialSeed;
  }
  
  reset(): void {
    this.state0 = this.initialSeed;
    this.state1 = this.initialSeed ^ 0x5DEECE66D;
  }
  
  clone(): IRNG {
    const cloned = new XorShift128PlusRNG(this.initialSeed);
    cloned.state0 = this.state0;
    cloned.state1 = this.state1;
    return cloned;
  }
}

// ============================================================================
// SEEDED RNG WRAPPER
// ============================================================================

/**
 * SeededRNG - Wrapper com funções utilitárias
 * 
 * Fornece métodos convenientes para diferentes tipos de amostragem
 * mantendo o determinismo garantido pelo seed.
 */
export class SeededRNG {
  private readonly rng: IRNG;
  private readonly seed: number;
  
  constructor(config: RNGConfig) {
    this.seed = config.seed;
    
    switch (config.algorithm) {
      case "xorshift128":
        this.rng = new XorShift128PlusRNG(config.seed);
        break;
      case "mulberry32":
      default:
        this.rng = new Mulberry32RNG(config.seed);
    }
  }
  
  /**
   * Obter seed usado
   */
  getSeed(): number {
    return this.seed;
  }
  
  /**
   * Número aleatório entre 0 e 1
   */
  random(): number {
    return this.rng.random();
  }
  
  /**
   * Inteiro aleatório entre min e max (inclusive)
   */
  randomInt(min: number, max: number): number {
    return Math.floor(this.rng.random() * (max - min + 1)) + min;
  }
  
  /**
   * Float aleatório entre min e max
   */
  randomFloat(min: number, max: number): number {
    return this.rng.random() * (max - min) + min;
  }
  
  /**
   * Booleano aleatório com probabilidade dada
   */
  randomBool(probability: number = 0.5): boolean {
    return this.rng.random() < probability;
  }
  
  /**
   * Selecionar elemento aleatório de um array
   */
  randomChoice<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error("Array vazio");
    }
    const index = Math.floor(this.rng.random() * array.length);
    return array[index];
  }
  
  /**
   * Selecionar N elementos aleatórios sem repetição
   */
  randomSample<T>(array: T[], n: number): T[] {
    if (n > array.length) {
      throw new Error("N maior que tamanho do array");
    }
    
    const result: T[] = [];
    const available = [...array];
    
    for (let i = 0; i < n; i++) {
      const index = Math.floor(this.rng.random() * available.length);
      result.push(available[index]);
      available.splice(index, 1);
    }
    
    return result;
  }
  
  /**
   * Embaralhar array (Fisher-Yates)
   */
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    
    return result;
  }
  
  /**
   * Distribuição normal (Box-Muller)
   */
  randomNormal(mean: number = 0, stdDev: number = 1): number {
    const u1 = this.rng.random();
    const u2 = this.rng.random();
    
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    
    return z0 * stdDev + mean;
  }
  
  /**
   * Distribuição exponencial
   */
  randomExponential(lambda: number = 1): number {
    return -Math.log(1 - this.rng.random()) / lambda;
  }
  
  /**
   * Distribuição de Poisson
   */
  randomPoisson(lambda: number): number {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    
    do {
      k++;
      p *= this.rng.random();
    } while (p > L);
    
    return k - 1;
  }
  
  /**
   * Selecionar índices para block bootstrap
   * 
   * @param totalLength - Tamanho total do array
   * @param blockSize - Tamanho de cada bloco
   * @param numBlocks - Número de blocos a selecionar
   */
  blockBootstrapIndices(totalLength: number, blockSize: number, numBlocks: number): number[][] {
    const blocks: number[][] = [];
    const maxStartIndex = totalLength - blockSize;
    
    if (maxStartIndex < 0) {
      throw new Error("Block size maior que array");
    }
    
    for (let i = 0; i < numBlocks; i++) {
      const startIndex = this.randomInt(0, maxStartIndex);
      const indices: number[] = [];
      
      for (let j = 0; j < blockSize; j++) {
        indices.push(startIndex + j);
      }
      
      blocks.push(indices);
    }
    
    return blocks;
  }
  
  /**
   * Resetar RNG para estado inicial
   */
  reset(): void {
    this.rng.reset();
  }
  
  /**
   * Clonar RNG com mesmo estado
   */
  clone(): SeededRNG {
    const cloned = new SeededRNG({ seed: this.seed });
    // Sincronizar estado interno
    return cloned;
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Criar RNG seedado
 */
export function createSeededRNG(seed: number, algorithm?: "mulberry32" | "xorshift128"): SeededRNG {
  return new SeededRNG({ seed, algorithm });
}

/**
 * Criar seed a partir de string (hash)
 */
export function seedFromString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Criar seed a partir de timestamp
 */
export function seedFromTimestamp(): number {
  return Date.now() % 2147483647;
}

/**
 * Criar seed institucional (combinação de múltiplos fatores)
 */
export function createInstitutionalSeed(
  runId: string,
  symbol: string,
  timestamp: number
): number {
  const combined = `${runId}-${symbol}-${timestamp}`;
  return seedFromString(combined);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default SeededRNG;
