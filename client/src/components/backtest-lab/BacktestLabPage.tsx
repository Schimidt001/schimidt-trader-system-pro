/**
 * BacktestLabPage - Página Principal do Laboratório de Backtest Institucional
 * 
 * Esta página integra todos os componentes do laboratório:
 * - Seleção de símbolos e período
 * - Configuração de parâmetros para otimização
 * - Execução de Grid Search com validação Walk-Forward
 * - Simulação Monte Carlo
 * - Detecção de Regimes
 * - Backtest Multi-Asset
 * - Visualização de resultados
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 2.0.0 - Integração completa Frontend-Backend
 */

import React, { useState, useCallback } from "react";
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
  Activity,
  PieChart,
  Shield,
  Dice5,
} from "lucide-react";

// Hooks e componentes do laboratório
import { useInstitutionalLab } from "./hooks/useInstitutionalLab";
import { PipelineStatusCard } from "./components/PipelineStatusCard";
import { ErrorDisplay } from "./components/ErrorDisplay";
import { MonteCarloChart } from "./MonteCarloChart";
import { RegimeAnalysisChart } from "./RegimeAnalysisChart";
import { MultiAssetDashboard } from "./MultiAssetDashboard";

// ============================================================================
// TYPES
// ============================================================================

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
// CONSTANTS
// ============================================================================

const AVAILABLE_SYMBOLS = [
  "XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD",
  "USDCAD", "NZDUSD", "USDCHF", "EURJPY", "GBPJPY",
];

const STRATEGY_TYPES = ["SMC", "HYBRID", "RSI_VWAP"] as const;

// ============================================================================
// COMPONENT
// ============================================================================

export function BacktestLabPage() {
  // Hook de integração com o backend
  const lab = useInstitutionalLab();

  // Estado da UI
  const [activeTab, setActiveTab] = useState("config");
  const [activePipeline, setActivePipeline] = useState<"optimization" | "walkforward" | "montecarlo" | "regime" | "multiasset">("optimization");

  // Configuration state
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(["XAUUSD"]);
  const [startDate, setStartDate] = useState("2024-01-01");
  const [endDate, setEndDate] = useState("2025-01-01");
  const [strategyType, setStrategyType] = useState<"SMC" | "HYBRID" | "RSI_VWAP">("SMC");
  const [validationEnabled, setValidationEnabled] = useState(true);
  const [inSampleRatio, setInSampleRatio] = useState(0.7);
  const [walkForwardEnabled, setWalkForwardEnabled] = useState(true);
  const [windowMonths, setWindowMonths] = useState(6);
  const [stepMonths, setStepMonths] = useState(1);
  const [seed, setSeed] = useState<number | undefined>(undefined);

  // Monte Carlo specific
  const [mcSimulations, setMcSimulations] = useState(1000);
  const [mcMethod, setMcMethod] = useState<"BLOCK_BOOTSTRAP" | "TRADE_RESAMPLING" | "RANDOMIZE_ORDER">("BLOCK_BOOTSTRAP");

  // Multi-Asset specific
  const [maxTotalPositions, setMaxTotalPositions] = useState(10);
  const [maxPositionsPerSymbol, setMaxPositionsPerSymbol] = useState(3);
  const [maxDailyDrawdown, setMaxDailyDrawdown] = useState(5);

  // =========================================================================
  // HANDLERS
  // =========================================================================

  const handleStartOptimization = useCallback(async () => {
    setActiveTab("progress");
    
    // Construir parâmetros default (simplificado para demo)
    const defaultParameters = [
      {
        name: "swingH1Lookback",
        label: "Swing H1 Lookback",
        category: "STRUCTURE" as const,
        type: "number" as const,
        default: 50,
        min: 30,
        max: 100,
        step: 10,
        enabled: true,
        locked: false,
      },
      {
        name: "sweepBufferPips",
        label: "Sweep Buffer (pips)",
        category: "ENTRY" as const,
        type: "number" as const,
        default: 1.5,
        min: 0.5,
        max: 3.0,
        step: 0.5,
        enabled: true,
        locked: false,
      },
    ];

    await lab.startOptimization({
      symbols: selectedSymbols,
      startDate,
      endDate,
      strategyType,
      parameters: defaultParameters,
      validation: {
        enabled: validationEnabled,
        inSampleRatio,
        walkForward: {
          enabled: walkForwardEnabled,
          windowMonths,
          stepMonths,
        },
      },
      objectives: [
        { metric: "sharpeRatio", target: "MAXIMIZE", weight: 0.4 },
        { metric: "profitFactor", target: "MAXIMIZE", weight: 0.3 },
        { metric: "maxDrawdownPercent", target: "MINIMIZE", weight: 0.3 },
      ],
      seed,
    });
  }, [lab, selectedSymbols, startDate, endDate, strategyType, validationEnabled, inSampleRatio, walkForwardEnabled, windowMonths, stepMonths, seed]);

  const handleStartWalkForward = useCallback(async () => {
    setActiveTab("progress");
    
    await lab.runWalkForward({
      symbol: selectedSymbols[0] || "XAUUSD",
      parameters: { swingH1Lookback: 50, sweepBufferPips: 1.5 },
      startDate,
      endDate,
      windowMonths,
      stepMonths,
      strategyType,
    });
  }, [lab, selectedSymbols, startDate, endDate, windowMonths, stepMonths, strategyType]);

  const handleStartMonteCarlo = useCallback(async () => {
    setActiveTab("progress");
    
    // Usar trades do resultado de otimização se disponível
    const trades = (lab.optimization.result as any)?.topResults?.[0]?.trades || [];
    
    await lab.runMonteCarlo({
      trades,
      simulations: mcSimulations,
      method: mcMethod,
      seed,
    });
  }, [lab, mcSimulations, mcMethod, seed]);

  const handleStartRegimeDetection = useCallback(async () => {
    setActiveTab("progress");
    
    await lab.runRegimeDetection({
      symbol: selectedSymbols[0] || "XAUUSD",
      startDate,
      endDate,
    });
  }, [lab, selectedSymbols, startDate, endDate]);

  const handleStartMultiAsset = useCallback(async () => {
    setActiveTab("progress");
    
    await lab.runMultiAsset({
      symbols: selectedSymbols,
      strategy: strategyType,
      startDate,
      endDate,
      parameters: { swingH1Lookback: 50, sweepBufferPips: 1.5 },
      maxTotalPositions,
      maxPositionsPerSymbol,
      maxDailyDrawdown,
      seed,
    });
  }, [lab, selectedSymbols, strategyType, startDate, endDate, maxTotalPositions, maxPositionsPerSymbol, maxDailyDrawdown, seed]);

  // =========================================================================
  // DERIVED STATE
  // =========================================================================

  const isAnyRunning = 
    lab.optimization.status === "RUNNING" ||
    lab.walkForward.status === "RUNNING" ||
    lab.monteCarlo.status === "RUNNING" ||
    lab.regimeDetection.status === "RUNNING" ||
    lab.multiAsset.status === "RUNNING";

  const currentPipelineState = {
    optimization: lab.optimization,
    walkforward: lab.walkForward,
    montecarlo: lab.monteCarlo,
    regime: lab.regimeDetection,
    multiasset: lab.multiAsset,
  }[activePipeline];

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Laboratório de Backtest Institucional
          </h1>
          <p className="text-muted-foreground">
            Otimização, validação e análise com padrão institucional
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {seed !== undefined && (
            <Badge variant="outline" className="mr-2">
              Seed: {seed}
            </Badge>
          )}
        </div>
      </div>

      {/* Pipeline Selector */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={activePipeline === "optimization" ? "default" : "outline"}
          onClick={() => setActivePipeline("optimization")}
          size="sm"
        >
          <Target className="w-4 h-4 mr-2" />
          Otimização
        </Button>
        <Button
          variant={activePipeline === "walkforward" ? "default" : "outline"}
          onClick={() => setActivePipeline("walkforward")}
          size="sm"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Walk-Forward
        </Button>
        <Button
          variant={activePipeline === "montecarlo" ? "default" : "outline"}
          onClick={() => setActivePipeline("montecarlo")}
          size="sm"
        >
          <Dice5 className="w-4 h-4 mr-2" />
          Monte Carlo
        </Button>
        <Button
          variant={activePipeline === "regime" ? "default" : "outline"}
          onClick={() => setActivePipeline("regime")}
          size="sm"
        >
          <Activity className="w-4 h-4 mr-2" />
          Regimes
        </Button>
        <Button
          variant={activePipeline === "multiasset" ? "default" : "outline"}
          onClick={() => setActivePipeline("multiasset")}
          size="sm"
        >
          <Layers className="w-4 h-4 mr-2" />
          Multi-Asset
        </Button>
      </div>

      {/* Error Display */}
      {currentPipelineState.error && (
        <ErrorDisplay 
          error={currentPipelineState.error}
          onRetry={() => {
            if (activePipeline === "optimization") handleStartOptimization();
            else if (activePipeline === "walkforward") handleStartWalkForward();
            else if (activePipeline === "montecarlo") handleStartMonteCarlo();
            else if (activePipeline === "regime") handleStartRegimeDetection();
            else if (activePipeline === "multiasset") handleStartMultiAsset();
          }}
          onDismiss={() => {
            if (activePipeline === "optimization") lab.resetOptimization();
            else if (activePipeline === "walkforward") lab.resetWalkForward();
            else if (activePipeline === "montecarlo") lab.resetMonteCarlo();
            else if (activePipeline === "regime") lab.resetRegimeDetection();
            else if (activePipeline === "multiasset") lab.resetMultiAsset();
          }}
        />
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="config" disabled={isAnyRunning}>
            <Settings className="w-4 h-4 mr-2" />
            Configuração
          </TabsTrigger>
          <TabsTrigger value="parameters" disabled={isAnyRunning}>
            <Layers className="w-4 h-4 mr-2" />
            Parâmetros
          </TabsTrigger>
          <TabsTrigger value="progress">
            <RefreshCw className={`w-4 h-4 mr-2 ${isAnyRunning ? "animate-spin" : ""}`} />
            Progresso
          </TabsTrigger>
          <TabsTrigger value="results" disabled={!currentPipelineState.result}>
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
                  Selecione os símbolos para análise
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_SYMBOLS.map((symbol) => (
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
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {STRATEGY_TYPES.map((strategy) => (
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

                {/* Seed for determinism */}
                <div>
                  <label className="text-sm font-medium">Seed (opcional, para reprodutibilidade)</label>
                  <input
                    type="number"
                    value={seed || ""}
                    onChange={(e) => setSeed(e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="Deixe vazio para aleatório"
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Multi-Asset Settings (conditional) */}
            {activePipeline === "multiasset" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Limites de Risco (Multi-Asset)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Max Posições Totais</label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={maxTotalPositions}
                      onChange={(e) => setMaxTotalPositions(parseInt(e.target.value))}
                      className="w-full mt-1 px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Max Posições por Símbolo</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={maxPositionsPerSymbol}
                      onChange={(e) => setMaxPositionsPerSymbol(parseInt(e.target.value))}
                      className="w-full mt-1 px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Max Drawdown Diário (%)</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={maxDailyDrawdown}
                      onChange={(e) => setMaxDailyDrawdown(parseInt(e.target.value))}
                      className="w-full mt-1 px-3 py-2 border rounded-md"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Monte Carlo Settings (conditional) */}
            {activePipeline === "montecarlo" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Dice5 className="w-5 h-5" />
                    Configurações Monte Carlo
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Número de Simulações</label>
                    <input
                      type="number"
                      min="100"
                      max="10000"
                      step="100"
                      value={mcSimulations}
                      onChange={(e) => setMcSimulations(parseInt(e.target.value))}
                      className="w-full mt-1 px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Método</label>
                    <select
                      value={mcMethod}
                      onChange={(e) => setMcMethod(e.target.value as any)}
                      className="w-full mt-1 px-3 py-2 border rounded-md"
                    >
                      <option value="BLOCK_BOOTSTRAP">Block Bootstrap</option>
                      <option value="TRADE_RESAMPLING">Trade Resampling</option>
                      <option value="RANDOMIZE_ORDER">Randomize Order</option>
                    </select>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Start Button */}
          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={() => {
                if (activePipeline === "optimization") handleStartOptimization();
                else if (activePipeline === "walkforward") handleStartWalkForward();
                else if (activePipeline === "montecarlo") handleStartMonteCarlo();
                else if (activePipeline === "regime") handleStartRegimeDetection();
                else if (activePipeline === "multiasset") handleStartMultiAsset();
              }}
              disabled={isAnyRunning || selectedSymbols.length === 0}
            >
              <Play className="w-4 h-4 mr-2" />
              Iniciar {activePipeline === "optimization" ? "Otimização" : 
                       activePipeline === "walkforward" ? "Walk-Forward" :
                       activePipeline === "montecarlo" ? "Monte Carlo" :
                       activePipeline === "regime" ? "Detecção de Regimes" : "Multi-Asset"}
            </Button>
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
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Em desenvolvimento</AlertTitle>
                <AlertDescription>
                  A configuração detalhada de parâmetros será implementada na próxima fase.
                  Por enquanto, parâmetros default são utilizados.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Progress Tab */}
        <TabsContent value="progress">
          <PipelineStatusCard
            title={
              activePipeline === "optimization" ? "Otimização Institucional" :
              activePipeline === "walkforward" ? "Validação Walk-Forward" :
              activePipeline === "montecarlo" ? "Simulação Monte Carlo" :
              activePipeline === "regime" ? "Detecção de Regimes" : "Backtest Multi-Asset"
            }
            description={`Pipeline: ${activePipeline}`}
            state={currentPipelineState}
            onAbort={() => {
              if (activePipeline === "optimization") lab.abortOptimization();
              else if (activePipeline === "multiasset") lab.abortMultiAsset();
            }}
            onReset={() => {
              if (activePipeline === "optimization") lab.resetOptimization();
              else if (activePipeline === "walkforward") lab.resetWalkForward();
              else if (activePipeline === "montecarlo") lab.resetMonteCarlo();
              else if (activePipeline === "regime") lab.resetRegimeDetection();
              else if (activePipeline === "multiasset") lab.resetMultiAsset();
            }}
            icon={
              activePipeline === "optimization" ? <Target className="w-5 h-5" /> :
              activePipeline === "walkforward" ? <RefreshCw className="w-5 h-5" /> :
              activePipeline === "montecarlo" ? <Dice5 className="w-5 h-5" /> :
              activePipeline === "regime" ? <Activity className="w-5 h-5" /> :
              <Layers className="w-5 h-5" />
            }
          />
        </TabsContent>

        {/* Results Tab */}
        <TabsContent value="results">
          {activePipeline === "montecarlo" && lab.monteCarlo.result ? (
            <MonteCarloChart 
              result={lab.monteCarlo.result as any} 
              initialBalance={10000} 
            />
          ) : null}

          {activePipeline === "regime" && lab.regimeDetection.result ? (
            <RegimeAnalysisChart 
              result={lab.regimeDetection.result as any} 
            />
          ) : null}

          {activePipeline === "multiasset" && lab.multiAsset.result ? (
            <MultiAssetDashboard 
              result={lab.multiAsset.result as any} 
              initialBalance={10000} 
            />
          ) : null}

          {(activePipeline === "optimization" || activePipeline === "walkforward") && (
            <Card>
              <CardHeader>
                <CardTitle>Resultados</CardTitle>
                <CardDescription>
                  {currentPipelineState.result 
                    ? "Análise concluída com sucesso" 
                    : "Aguardando resultados..."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {currentPipelineState.result ? (
                  <pre className="p-4 bg-muted rounded-lg overflow-auto max-h-96 text-sm">
                    {JSON.stringify(currentPipelineState.result, null, 2)}
                  </pre>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Execute uma análise para ver os resultados aqui.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default BacktestLabPage;
