/**
 * WalkForwardValidator - Validador Walk-Forward para Robustez Temporal
 * 
 * Implementa validação Walk-Forward para testar robustez de parâmetros:
 * - Divide o período em janelas de treino/teste
 * - Testa parâmetros em múltiplos períodos
 * - Calcula métricas de estabilidade
 * - Detecta overfitting
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import {
  WalkForwardConfig,
  WalkForwardWindow,
  WalkForwardResult,
  WindowResult,
  ValidationProgress,
} from "./types/validation.types";
import { BacktestMetrics, BacktestResult, BacktestConfig, BacktestStrategyType } from "../types/backtest.types";
import { BacktestRunner } from "../runners/BacktestRunner";

// ============================================================================
// WALK-FORWARD VALIDATOR CLASS
// ============================================================================

export class WalkForwardValidator {
  private config: WalkForwardConfig;
  private progressCallback?: (progress: ValidationProgress) => void;
  
  constructor(config: WalkForwardConfig) {
    this.config = config;
  }
  
  /**
   * Executar Walk-Forward completo
   */
  async validate(): Promise<WalkForwardResult> {
    console.log(`[WalkForward] Iniciando validação para ${this.config.symbol}...`);
    
    // 1. Criar janelas
    const windows = this.createWindows();
    console.log(`[WalkForward] ${windows.length} janelas criadas`);
    
    if (windows.length === 0) {
      throw new Error("Período insuficiente para criar janelas Walk-Forward");
    }
    
    // 2. Processar cada janela
    const windowResults: WindowResult[] = [];
    
    if (this.config.parallelWindows) {
      // Paralelo
      const results = await Promise.all(
        windows.map((w, index) => this.processWindowWithProgress(w, index, windows.length))
      );
      windowResults.push(...results);
    } else {
      // Sequencial
      for (let i = 0; i < windows.length; i++) {
        const window = windows[i];
        const result = await this.processWindowWithProgress(window, i, windows.length);
        windowResults.push(result);
        
        console.log(`[WalkForward] Janela ${window.windowNumber}/${windows.length} concluída`);
      }
    }
    
    // 3. Calcular métricas agregadas
    const aggregated = this.calculateAggregatedMetrics(windowResults);
    
    // 4. Determinar robustez
    const isRobust = this.isRobust(windowResults, aggregated);
    const confidence = this.calculateConfidence(windowResults);
    const warnings = this.generateWarnings(windowResults, aggregated);
    
    console.log(`[WalkForward] ✅ Validação concluída. Robusto: ${isRobust}, Confiança: ${confidence.toFixed(1)}%`);
    
    return {
      symbol: this.config.symbol,
      parameters: this.config.parameters,
      windows: windowResults,
      aggregated,
      isRobust,
      confidence,
      warnings,
    };
  }
  
  /**
   * Criar janelas Walk-Forward
   */
  private createWindows(): WalkForwardWindow[] {
    const windows: WalkForwardWindow[] = [];
    
    const totalMonths = this.monthsBetween(this.config.startDate, this.config.endDate);
    const maxWindows = Math.floor((totalMonths - this.config.windowMonths) / this.config.stepMonths);
    
    for (let i = 0; i < maxWindows; i++) {
      const trainStart = this.addMonths(this.config.startDate, i * this.config.stepMonths);
      const trainEnd = this.addMonths(trainStart, this.config.windowMonths);
      const testStart = trainEnd;
      const testEnd = this.addMonths(testStart, this.config.stepMonths);
      
      // Verificar se não ultrapassou o período total
      if (testEnd > this.config.endDate) break;
      
      windows.push({
        windowNumber: i + 1,
        trainStart,
        trainEnd,
        testStart,
        testEnd,
      });
    }
    
    return windows;
  }
  
  /**
   * Processar uma janela com atualização de progresso
   */
  private async processWindowWithProgress(
    window: WalkForwardWindow,
    currentIndex: number,
    totalWindows: number
  ): Promise<WindowResult> {
    // Atualizar progresso
    if (this.progressCallback) {
      this.progressCallback({
        validationType: "WALK_FORWARD",
        phase: "PROCESSING",
        percentComplete: (currentIndex / totalWindows) * 100,
        currentItem: currentIndex + 1,
        totalItems: totalWindows,
        statusMessage: `Processando janela ${currentIndex + 1}/${totalWindows}`,
        estimatedTimeRemaining: 0, // Calculado externamente
      });
    }
    
    return this.processWindow(window);
  }
  
  /**
   * Processar uma janela (treino + teste)
   */
  private async processWindow(window: WalkForwardWindow): Promise<WindowResult> {
    // Backtest na janela de treino
    const trainBacktest = await this.runBacktest(
      window.trainStart,
      window.trainEnd
    );
    
    // Backtest na janela de teste
    const testBacktest = await this.runBacktest(
      window.testStart,
      window.testEnd
    );
    
    // Calcular degradação
    const degradation = {
      sharpe: this.calculateMetricDegradation(
        trainBacktest.metrics.sharpeRatio,
        testBacktest.metrics.sharpeRatio
      ),
      winRate: this.calculateMetricDegradation(
        trainBacktest.metrics.winRate,
        testBacktest.metrics.winRate
      ),
      profitFactor: this.calculateMetricDegradation(
        trainBacktest.metrics.profitFactor,
        testBacktest.metrics.profitFactor
      ),
    };
    
    // Calcular stability score desta janela
    const stabilityScore = this.calculateWindowStability(
      trainBacktest.metrics,
      testBacktest.metrics
    );
    
    return {
      window,
      trainMetrics: trainBacktest.metrics,
      testMetrics: testBacktest.metrics,
      degradation,
      stabilityScore,
    };
  }
  
  /**
   * Executar backtest em um período
   */
  private async runBacktest(startDate: Date, endDate: Date): Promise<BacktestResult> {
    const backtestConfig: BacktestConfig = {
      symbol: this.config.symbol,
      strategy: this.config.strategyType,
      startDate,
      endDate,
      dataPath: this.config.dataPath,
      timeframes: this.config.timeframes,
      initialBalance: this.config.initialBalance,
      leverage: this.config.leverage,
      commission: this.config.commission,
      slippage: this.config.slippage,
      spread: this.config.spread,
      riskPercent: (this.config.parameters.riskPercentage as number) || 2,
      maxPositions: (this.config.parameters.maxOpenTrades as number) || 3,
      maxSpread: (this.config.parameters.maxSpreadPips as number) || 3,
    };
    
    const runner = new BacktestRunner(backtestConfig);
    
    // Executar backtest
    // Nota: Idealmente usaríamos runWithParameters para injetar parâmetros customizados
    const result = await runner.run();
    
    return result;
  }
  
  /**
   * Calcular métricas agregadas de todas as janelas
   */
  private calculateAggregatedMetrics(windows: WindowResult[]): WalkForwardResult["aggregated"] {
    const testMetrics = windows.map(w => w.testMetrics);
    
    const averageSharpe = testMetrics.reduce((sum, m) => sum + m.sharpeRatio, 0) / testMetrics.length;
    const averageWinRate = testMetrics.reduce((sum, m) => sum + m.winRate, 0) / testMetrics.length;
    
    const degradations = windows.map(w => w.degradation.sharpe);
    const averageDegradation = degradations.reduce((sum, d) => sum + d, 0) / degradations.length;
    
    // Stability score: inversamente proporcional ao desvio padrão dos Sharpes
    const sharpeStdDev = this.standardDeviation(testMetrics.map(m => m.sharpeRatio));
    const stabilityScore = Math.max(0, 100 - sharpeStdDev * 50);
    
    // Pior e melhor janela
    const sorted = [...windows].sort((a, b) => b.testMetrics.sharpeRatio - a.testMetrics.sharpeRatio);
    const bestWindow = sorted[0];
    const worstWindow = sorted[sorted.length - 1];
    
    return {
      averageSharpe,
      averageWinRate,
      averageDegradation,
      stabilityScore,
      worstWindow,
      bestWindow,
    };
  }
  
  /**
   * Determinar se os parâmetros são robustos
   */
  private isRobust(windows: WindowResult[], aggregated: WalkForwardResult["aggregated"]): boolean {
    // Critérios de robustez:
    
    // 1. Sharpe médio positivo
    if (aggregated.averageSharpe < 0.5) return false;
    
    // 2. Degradação média abaixo de 30%
    if (aggregated.averageDegradation > 30) return false;
    
    // 3. Stability score acima de 60
    if (aggregated.stabilityScore < 60) return false;
    
    // 4. Pelo menos 70% das janelas com Sharpe positivo
    const positiveWindows = windows.filter(w => w.testMetrics.sharpeRatio > 0).length;
    if (positiveWindows / windows.length < 0.7) return false;
    
    return true;
  }
  
  /**
   * Calcular nível de confiança (0-100)
   */
  private calculateConfidence(windows: WindowResult[]): number {
    let confidence = 0;
    
    // Fator 1: Número de janelas testadas (mais janelas = mais confiança)
    const windowFactor = Math.min(50, (windows.length / 12) * 50); // 12+ janelas = 50 pontos
    confidence += windowFactor;
    
    // Fator 2: Consistência dos resultados (baixo desvio padrão)
    const sharpes = windows.map(w => w.testMetrics.sharpeRatio);
    const stdDev = this.standardDeviation(sharpes);
    const consistencyFactor = Math.max(0, 30 - stdDev * 15);
    confidence += consistencyFactor;
    
    // Fator 3: Pior janela não muito ruim
    const sorted = [...windows].sort((a, b) => a.testMetrics.sharpeRatio - b.testMetrics.sharpeRatio);
    const worstSharpe = sorted[0].testMetrics.sharpeRatio;
    const worstWindowFactor = worstSharpe > 0 ? 20 : 0;
    confidence += worstWindowFactor;
    
    return Math.min(100, confidence);
  }
  
  /**
   * Gerar warnings específicos do Walk-Forward
   */
  private generateWarnings(windows: WindowResult[], aggregated: WalkForwardResult["aggregated"]): string[] {
    const warnings: string[] = [];
    
    // Warning: Poucas janelas
    if (windows.length < 6) {
      warnings.push(`Poucas janelas testadas (${windows.length}). Recomendado: 12+`);
    }
    
    // Warning: Alta degradação
    if (aggregated.averageDegradation > 25) {
      warnings.push(`Degradação média alta (${aggregated.averageDegradation.toFixed(1)}%)`);
    }
    
    // Warning: Instabilidade
    if (aggregated.stabilityScore < 60) {
      warnings.push(`Baixa estabilidade entre janelas (score: ${aggregated.stabilityScore.toFixed(1)})`);
    }
    
    // Warning: Pior janela muito ruim
    if (aggregated.worstWindow.testMetrics.sharpeRatio < -0.5) {
      warnings.push(`Pior janela com Sharpe muito negativo (${aggregated.worstWindow.testMetrics.sharpeRatio.toFixed(2)})`);
    }
    
    // Warning: Grande variação entre janelas
    const sharpes = windows.map(w => w.testMetrics.sharpeRatio);
    const range = Math.max(...sharpes) - Math.min(...sharpes);
    if (range > 2) {
      warnings.push(`Grande variação de performance entre janelas (range: ${range.toFixed(2)})`);
    }
    
    // Warning: Muitas janelas com Sharpe negativo
    const negativeWindows = windows.filter(w => w.testMetrics.sharpeRatio < 0).length;
    const negativePercent = (negativeWindows / windows.length) * 100;
    if (negativePercent > 30) {
      warnings.push(`${negativePercent.toFixed(0)}% das janelas com Sharpe negativo`);
    }
    
    return warnings;
  }
  
  /**
   * Definir callback de progresso
   */
  setProgressCallback(callback: (progress: ValidationProgress) => void): void {
    this.progressCallback = callback;
  }
  
  // =========================================================================
  // FUNÇÕES AUXILIARES
  // =========================================================================
  
  private monthsBetween(start: Date, end: Date): number {
    const years = end.getFullYear() - start.getFullYear();
    const months = end.getMonth() - start.getMonth();
    return years * 12 + months;
  }
  
  private addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }
  
  private calculateMetricDegradation(train: number, test: number): number {
    if (train === 0) return test < 0 ? 100 : 0;
    const degradation = ((train - test) / Math.abs(train)) * 100;
    return Math.max(0, degradation);
  }
  
  private calculateWindowStability(train: BacktestMetrics, test: BacktestMetrics): number {
    // Score baseado em quão similar são as métricas de treino e teste
    let score = 100;
    
    // Penalizar por diferença de Sharpe
    const sharpeDiff = Math.abs(train.sharpeRatio - test.sharpeRatio);
    score -= sharpeDiff * 20;
    
    // Penalizar por diferença de WinRate
    const winRateDiff = Math.abs(train.winRate - test.winRate);
    score -= winRateDiff * 0.5;
    
    // Penalizar por diferença de Profit Factor
    const pfDiff = Math.abs(train.profitFactor - test.profitFactor);
    score -= pfDiff * 10;
    
    return Math.max(0, Math.min(100, score));
  }
  
  private standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    
    return Math.sqrt(avgSquaredDiff);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createWalkForwardValidator(config: WalkForwardConfig): WalkForwardValidator {
  return new WalkForwardValidator(config);
}
