/**
 * BacktestLabPage - Página Principal do Laboratório de Backtest Institucional
 * 
 * Esta página integra todos os componentes do laboratório:
 * - Seleção de símbolos e período
 * - Configuração de parâmetros para otimização
 * - Execução de Grid Search
 * - Validação Walk-Forward
 * - Visualização de resultados
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { 
  Play, 
  Square, 
  Settings, 
  TrendingUp, 
  BarChart3, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap,
  Target,
  Layers,
  RefreshCw,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface OptimizationProgress {
  phase: string;
  currentCombination: number;
  totalCombinations: number;
  percentComplete: number;
  estimatedTimeRemaining: number;
  elapsedTime: number;
  currentSymbol?: string;
  statusMessage: string;
}

interface OptimizationResult {
  combinationId: string;
  parameters: Record<string, number | string | boolean>;
  robustnessScore: number;
  degradationPercent: number;
  isRecommended: boolean;
  rank: number;
  inSampleMetrics: {
    netProfit: number;
    totalTrades: number;
    winRate: number;
    sharpeRatio: number;
    maxDrawdownPercent: number;
    profitFactor: number;
  };
  outSampleMetrics?: {
    netProfit: number;
    totalTrades: number;
    winRate: number;
    sharpeRatio: number;
    maxDrawdownPercent: number;
    profitFactor: number;
  };
  warnings: string[];
}

// ============================================================================
// COMPONENT
// ============================================================================

export function BacktestLabPage() {
  // State
  const [activeTab, setActiveTab] = useState("config");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<OptimizationProgress | null>(null);
  const [results, setResults] = useState<OptimizationResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Configuration state
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(["XAUUSD"]);
  const [startDate, setStartDate] = useState("2024-01-01");
  const [endDate, setEndDate] = useState("2025-01-01");
  const [strategyType, setStrategyType] = useState("SMC");
  const [validationEnabled, setValidationEnabled] = useState(true);
  const [inSampleRatio, setInSampleRatio] = useState(0.7);
  const [walkForwardEnabled, setWalkForwardEnabled] = useState(true);
  const [windowMonths, setWindowMonths] = useState(6);
  const [stepMonths, setStepMonths] = useState(1);
  
  // Available symbols
  const availableSymbols = [
    "XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD",
    "USDCAD", "NZDUSD", "USDCHF", "EURJPY", "GBPJPY",
  ];
  
  // =========================================================================
  // HANDLERS
  // =========================================================================
  
  const handleStartOptimization = async () => {
    setIsRunning(true);
    setError(null);
    setActiveTab("progress");
    
    // TODO: Integrate with tRPC mutation
    // For now, simulate progress
    simulateProgress();
  };
  
  const handleAbortOptimization = () => {
    setIsRunning(false);
    setProgress(null);
    // TODO: Call abort mutation
  };
  
  const simulateProgress = () => {
    // Simulation for development
    let current = 0;
    const total = 100;
    
    const interval = setInterval(() => {
      current++;
      setProgress({
        phase: "TESTING",
        currentCombination: current,
        totalCombinations: total,
        percentComplete: (current / total) * 100,
        estimatedTimeRemaining: (total - current) * 2,
        elapsedTime: current * 2,
        currentSymbol: selectedSymbols[0],
        statusMessage: `Testando combinação ${current}/${total}`,
      });
      
      if (current >= total) {
        clearInterval(interval);
        setIsRunning(false);
        setProgress(null);
        setActiveTab("results");
        
        // Generate mock results
        setResults(generateMockResults());
      }
    }, 100);
  };
  
  const generateMockResults = (): OptimizationResult[] => {
    return Array.from({ length: 10 }, (_, i) => ({
      combinationId: `combo-${i + 1}`,
      parameters: {
        swingH1Lookback: 50 + i * 5,
        sweepBufferPips: 1.0 + i * 0.2,
        riskPercentage: 2.0,
      },
      robustnessScore: 85 - i * 5,
      degradationPercent: 5 + i * 3,
      isRecommended: i < 3,
      rank: i + 1,
      inSampleMetrics: {
        netProfit: 5000 - i * 300,
        totalTrades: 150 - i * 10,
        winRate: 65 - i * 2,
        sharpeRatio: 2.5 - i * 0.2,
        maxDrawdownPercent: 8 + i * 1,
        profitFactor: 2.2 - i * 0.1,
      },
      outSampleMetrics: {
        netProfit: 3500 - i * 250,
        totalTrades: 50 - i * 3,
        winRate: 60 - i * 2,
        sharpeRatio: 2.0 - i * 0.2,
        maxDrawdownPercent: 10 + i * 1.5,
        profitFactor: 1.8 - i * 0.1,
      },
      warnings: i > 5 ? ["Alta degradação out-of-sample"] : [],
    }));
  };
  
  // =========================================================================
  // RENDER
  // =========================================================================
  
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Laboratório de Backtest
          </h1>
          <p className="text-muted-foreground">
            Otimização institucional com validação Walk-Forward
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Button variant="destructive" onClick={handleAbortOptimization}>
              <Square className="w-4 h-4 mr-2" />
              Abortar
            </Button>
          ) : (
            <Button onClick={handleStartOptimization} disabled={selectedSymbols.length === 0}>
              <Play className="w-4 h-4 mr-2" />
              Iniciar Otimização
            </Button>
          )}
        </div>
      </div>
      
      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="config" disabled={isRunning}>
            <Settings className="w-4 h-4 mr-2" />
            Configuração
          </TabsTrigger>
          <TabsTrigger value="parameters" disabled={isRunning}>
            <Layers className="w-4 h-4 mr-2" />
            Parâmetros
          </TabsTrigger>
          <TabsTrigger value="progress">
            <RefreshCw className={`w-4 h-4 mr-2 ${isRunning ? "animate-spin" : ""}`} />
            Progresso
          </TabsTrigger>
          <TabsTrigger value="results" disabled={results.length === 0}>
            <BarChart3 className="w-4 h-4 mr-2" />
            Resultados
          </TabsTrigger>
        </TabsList>
        
        {/* Configuration Tab */}
        <TabsContent value="config" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Symbol Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Símbolos
                </CardTitle>
                <CardDescription>
                  Selecione os símbolos para otimização
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {availableSymbols.map((symbol) => (
                    <Badge
                      key={symbol}
                      variant={selectedSymbols.includes(symbol) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => {
                        if (selectedSymbols.includes(symbol)) {
                          setSelectedSymbols(selectedSymbols.filter(s => s !== symbol));
                        } else {
                          setSelectedSymbols([...selectedSymbols, symbol]);
                        }
                      }}
                    >
                      {symbol}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            {/* Period Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Período
                </CardTitle>
                <CardDescription>
                  Defina o período de dados para backtest
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Data Início</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full mt-1 px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Data Fim</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full mt-1 px-3 py-2 border rounded-md"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Validation Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Validação
                </CardTitle>
                <CardDescription>
                  Configurações de validação Walk-Forward
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Validação Habilitada</span>
                  <input
                    type="checkbox"
                    checked={validationEnabled}
                    onChange={(e) => setValidationEnabled(e.target.checked)}
                    className="w-4 h-4"
                  />
                </div>
                
                {validationEnabled && (
                  <>
                    <div>
                      <label className="text-sm font-medium">
                        Proporção In-Sample: {(inSampleRatio * 100).toFixed(0)}%
                      </label>
                      <input
                        type="range"
                        min="50"
                        max="90"
                        value={inSampleRatio * 100}
                        onChange={(e) => setInSampleRatio(parseInt(e.target.value) / 100)}
                        className="w-full mt-1"
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Walk-Forward</span>
                      <input
                        type="checkbox"
                        checked={walkForwardEnabled}
                        onChange={(e) => setWalkForwardEnabled(e.target.checked)}
                        className="w-4 h-4"
                      />
                    </div>
                    
                    {walkForwardEnabled && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium">Janela (meses)</label>
                          <input
                            type="number"
                            min="3"
                            max="24"
                            value={windowMonths}
                            onChange={(e) => setWindowMonths(parseInt(e.target.value))}
                            className="w-full mt-1 px-3 py-2 border rounded-md"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Passo (meses)</label>
                          <input
                            type="number"
                            min="1"
                            max="6"
                            value={stepMonths}
                            onChange={(e) => setStepMonths(parseInt(e.target.value))}
                            className="w-full mt-1 px-3 py-2 border rounded-md"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            
            {/* Strategy Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Estratégia
                </CardTitle>
                <CardDescription>
                  Selecione a estratégia a otimizar
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {["SMC", "HYBRID", "RSI_VWAP"].map((strategy) => (
                    <Badge
                      key={strategy}
                      variant={strategyType === strategy ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setStrategyType(strategy)}
                    >
                      {strategy}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Parameters Tab */}
        <TabsContent value="parameters">
          <Card>
            <CardHeader>
              <CardTitle>Parâmetros de Otimização</CardTitle>
              <CardDescription>
                Configure os ranges de parâmetros para o Grid Search
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Configuração de parâmetros será implementada na próxima fase.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Progress Tab */}
        <TabsContent value="progress">
          <Card>
            <CardHeader>
              <CardTitle>Progresso da Otimização</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {progress ? (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{progress.statusMessage}</span>
                      <span>{progress.percentComplete.toFixed(1)}%</span>
                    </div>
                    <Progress value={progress.percentComplete} />
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold">{progress.currentCombination}</div>
                      <div className="text-sm text-muted-foreground">Combinação Atual</div>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold">{progress.totalCombinations}</div>
                      <div className="text-sm text-muted-foreground">Total</div>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold">{Math.round(progress.elapsedTime)}s</div>
                      <div className="text-sm text-muted-foreground">Tempo Decorrido</div>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <div className="text-2xl font-bold">{Math.round(progress.estimatedTimeRemaining)}s</div>
                      <div className="text-sm text-muted-foreground">Tempo Restante</div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  {isRunning ? (
                    <p>Iniciando otimização...</p>
                  ) : (
                    <p>Nenhuma otimização em execução</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Results Tab */}
        <TabsContent value="results">
          <Card>
            <CardHeader>
              <CardTitle>Resultados da Otimização</CardTitle>
              <CardDescription>
                Top 10 melhores combinações de parâmetros
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {results.map((result) => (
                  <div
                    key={result.combinationId}
                    className={`p-4 border rounded-lg ${
                      result.isRecommended ? "border-green-500 bg-green-50 dark:bg-green-950" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={result.isRecommended ? "default" : "secondary"}>
                          #{result.rank}
                        </Badge>
                        {result.isRecommended && (
                          <Badge variant="outline" className="text-green-600">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Recomendado
                          </Badge>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">
                          Score: {result.robustnessScore.toFixed(1)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Degradação: {result.degradationPercent.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    
                    <Separator className="my-2" />
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Lucro (IS):</span>
                        <span className="ml-2 font-medium">
                          ${result.inSampleMetrics.netProfit.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Winrate (IS):</span>
                        <span className="ml-2 font-medium">
                          {result.inSampleMetrics.winRate.toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Sharpe (IS):</span>
                        <span className="ml-2 font-medium">
                          {result.inSampleMetrics.sharpeRatio.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">DD Max (IS):</span>
                        <span className="ml-2 font-medium">
                          {result.inSampleMetrics.maxDrawdownPercent.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    
                    {result.outSampleMetrics && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-2">
                        <div>
                          <span className="text-muted-foreground">Lucro (OS):</span>
                          <span className="ml-2 font-medium">
                            ${result.outSampleMetrics.netProfit.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Winrate (OS):</span>
                          <span className="ml-2 font-medium">
                            {result.outSampleMetrics.winRate.toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Sharpe (OS):</span>
                          <span className="ml-2 font-medium">
                            {result.outSampleMetrics.sharpeRatio.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">DD Max (OS):</span>
                          <span className="ml-2 font-medium">
                            {result.outSampleMetrics.maxDrawdownPercent.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {result.warnings.length > 0 && (
                      <div className="mt-2 flex items-center gap-2 text-yellow-600">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm">{result.warnings.join(", ")}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default BacktestLabPage;
