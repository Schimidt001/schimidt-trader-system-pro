/**
 * BacktestLabPage - Página Principal do Laboratório de Backtest Institucional
 * 
 * Esta página integra todos os componentes do laboratório:
 * - Seleção de símbolos e período (com validação de dados disponíveis)
 * - Configuração de parâmetros para otimização (WP-A)
 * - Execução de Grid Search com validação Walk-Forward
 * - Simulação Monte Carlo
 * - Detecção de Regimes
 * - Backtest Multi-Asset
 * - Visualização de resultados (WP-C)
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 2.1.0 - Implementação WP-A, WP-B, WP-C
 */

import React, { useState, useCallback, useMemo } from "react";
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
  Database,
} from "lucide-react";

// Hooks e componentes do laboratório
import { useInstitutionalLab } from "./hooks/useInstitutionalLab";
import { PipelineStatusCard } from "./components/PipelineStatusCard";
import { ErrorDisplay } from "./components/ErrorDisplay";
import { ParametersTab, ParameterConfig } from "./components/ParametersTab";
import { useLabParameters } from "@/contexts/LabParametersContext";
import { OptimizationResultsView } from "./components/OptimizationResultsView";
import { WalkForwardResultsView } from "./components/WalkForwardResultsView";
import { DatasetSelector } from "./components/DatasetSelector";
import { DataDownloadManager } from "./components/DataDownloadManager";
import { MonteCarloChart } from "./MonteCarloChart";
import { RegimeAnalysisChart } from "./RegimeAnalysisChart";
import { MultiAssetDashboard } from "./MultiAssetDashboard";

// ============================================================================
// CONSTANTS
// ============================================================================

const STRATEGY_TYPES = ["SMC", "HYBRID", "RSI_VWAP"] as const;

// ============================================================================
// COMPONENT
// ============================================================================

export function BacktestLabPage() {
  // Hook de integração com o backend
  const lab = useInstitutionalLab();

  // CORREÇÃO TAREFA 1: Usar contexto global para persistência de estado
  const { 
    labConfig, 
    updateLabConfig, 
    parameterConfigs: globalParameterConfigs,
    combinationsValidation,
    canExecuteOptimization,
  } = useLabParameters();

  // Estado da UI
  const [activeTab, setActiveTab] = useState("config");
  const [activePipeline, setActivePipeline] = useState<"optimization" | "walkforward" | "montecarlo" | "regime" | "multiasset">("optimization");

  // Usar valores do contexto global (persistidos)
  const selectedSymbols = labConfig.selectedSymbols;
  const setSelectedSymbols = (symbols: string[]) => updateLabConfig({ selectedSymbols: symbols });
  const startDate = labConfig.startDate;
  const setStartDate = (date: string) => updateLabConfig({ startDate: date });
  const endDate = labConfig.endDate;
  const setEndDate = (date: string) => updateLabConfig({ endDate: date });
  const strategyType = labConfig.strategyType;
  const setStrategyType = (type: "SMC" | "HYBRID" | "RSI_VWAP") => updateLabConfig({ strategyType: type });
  const validationEnabled = labConfig.validationEnabled;
  const setValidationEnabled = (enabled: boolean) => updateLabConfig({ validationEnabled: enabled });
  const inSampleRatio = labConfig.inSampleRatio;
  const setInSampleRatio = (ratio: number) => updateLabConfig({ inSampleRatio: ratio });
  const walkForwardEnabled = labConfig.walkForwardEnabled;
  const setWalkForwardEnabled = (enabled: boolean) => updateLabConfig({ walkForwardEnabled: enabled });
  const windowMonths = labConfig.windowMonths;
  const setWindowMonths = (months: number) => updateLabConfig({ windowMonths: months });
  const stepMonths = labConfig.stepMonths;
  const setStepMonths = (months: number) => updateLabConfig({ stepMonths: months });
  const seed = labConfig.seed;
  const setSeed = (s: number | undefined) => updateLabConfig({ seed: s });

  // Parâmetros configurados (WP-A) - agora vem do contexto global
  const [parameterConfigs, setParameterConfigs] = useState<ParameterConfig[]>([]);

  // Monte Carlo specific - usar valores do contexto
  const mcSimulations = labConfig.mcSimulations;
  const setMcSimulations = (sims: number) => updateLabConfig({ mcSimulations: sims });
  const mcMethod = labConfig.mcMethod;
  const setMcMethod = (method: "BLOCK_BOOTSTRAP" | "TRADE_RESAMPLING" | "RANDOMIZE_ORDER") => updateLabConfig({ mcMethod: method });

  // Multi-Asset specific - usar valores do contexto
  const maxTotalPositions = labConfig.maxTotalPositions;
  const setMaxTotalPositions = (pos: number) => updateLabConfig({ maxTotalPositions: pos });
  const maxPositionsPerSymbol = labConfig.maxPositionsPerSymbol;
  const setMaxPositionsPerSymbol = (pos: number) => updateLabConfig({ maxPositionsPerSymbol: pos });
  const maxDailyDrawdown = labConfig.maxDailyDrawdown;
  const setMaxDailyDrawdown = (dd: number) => updateLabConfig({ maxDailyDrawdown: dd });

  // =========================================================================
  // HANDLERS
  // =========================================================================

  const handleParametersChange = useCallback((params: ParameterConfig[]) => {
    setParameterConfigs(params);
  }, []);

  const handleStartOptimization = useCallback(async () => {
    // CORREÇÃO TAREFA 1: Validar combinações antes de iniciar
    const validation = canExecuteOptimization();
    if (!validation.canExecute) {
      // Não iniciar se validação falhar
      console.error("Otimização bloqueada:", validation.reason);
      return;
    }
    
    setActiveTab("progress");
    
    // Converter parâmetros configurados para o formato do backend
    const parameters = parameterConfigs.map(config => ({
      name: config.parameterId,
      label: config.parameterId,
      category: "STRUCTURE" as const,
      type: config.type === "boolean" ? "boolean" as const : 
            config.type === "select" ? "select" as const : "number" as const,
      default: config.value ?? 0,
      min: config.min,
      max: config.max,
      step: config.step,
      enabled: config.enabled,
      locked: config.locked,
    }));

    await lab.startOptimization({
      symbols: selectedSymbols,
      startDate,
      endDate,
      strategyType,
      parameters: parameters.length > 0 ? parameters : [
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
      ],
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
  }, [lab, selectedSymbols, startDate, endDate, strategyType, parameterConfigs, validationEnabled, inSampleRatio, walkForwardEnabled, windowMonths, stepMonths, seed]);

  const handleStartWalkForward = useCallback(async () => {
    setActiveTab("progress");
    
    // Usar parâmetros configurados ou defaults
    const params: Record<string, number | string | boolean> = {};
    parameterConfigs.forEach(config => {
      if (config.value !== undefined) {
        params[config.parameterId] = config.value;
      }
    });
    
    await lab.runWalkForward({
      symbol: selectedSymbols[0] || "XAUUSD",
      parameters: Object.keys(params).length > 0 ? params : { swingH1Lookback: 50, sweepBufferPips: 1.5 },
      startDate,
      endDate,
      windowMonths,
      stepMonths,
      strategyType,
    });
  }, [lab, selectedSymbols, startDate, endDate, windowMonths, stepMonths, strategyType, parameterConfigs]);

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
    
    // Usar parâmetros configurados ou defaults
    const params: Record<string, number | string | boolean> = {};
    parameterConfigs.forEach(config => {
      if (config.value !== undefined) {
        params[config.parameterId] = config.value;
      }
    });
    
    await lab.runMultiAsset({
      symbols: selectedSymbols,
      strategy: strategyType,
      startDate,
      endDate,
      parameters: Object.keys(params).length > 0 ? params : { swingH1Lookback: 50, sweepBufferPips: 1.5 },
      maxTotalPositions,
      maxPositionsPerSymbol,
      maxDailyDrawdown,
      seed,
    });
  }, [lab, selectedSymbols, strategyType, startDate, endDate, parameterConfigs, maxTotalPositions, maxPositionsPerSymbol, maxDailyDrawdown, seed]);

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

  // Verificar se pode iniciar (tem símbolos selecionados)
  const canStart = selectedSymbols.length > 0 && !isAnyRunning;

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
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="data" disabled={isAnyRunning}>
            <Database className="w-4 h-4 mr-2" />
            Dados
          </TabsTrigger>
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

        {/* Data Tab - Gestão de Dados Históricos */}
        <TabsContent value="data" className="space-y-4">
          <DataDownloadManager />
        </TabsContent>

        {/* Configuration Tab */}
        <TabsContent value="config" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Dataset Selector (WP-B) - Agora com validação de dados */}
            <DatasetSelector
              selectedSymbols={selectedSymbols}
              onSymbolsChange={setSelectedSymbols}
              multiSelect={activePipeline === "multiasset" || activePipeline === "optimization"}
            />

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
              disabled={!canStart}
            >
              <Play className="w-4 h-4 mr-2" />
              Iniciar {activePipeline === "optimization" ? "Otimização" : 
                       activePipeline === "walkforward" ? "Walk-Forward" :
                       activePipeline === "montecarlo" ? "Monte Carlo" :
                       activePipeline === "regime" ? "Detecção de Regimes" : "Multi-Asset"}
            </Button>
          </div>
        </TabsContent>

        {/* Parameters Tab (WP-A) */}
        <TabsContent value="parameters">
          <ParametersTab 
            onParametersChange={handleParametersChange}
            strategyType={strategyType}
          />
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

        {/* Results Tab (WP-C) */}
        <TabsContent value="results">
          {/* Monte Carlo Results */}
          {activePipeline === "montecarlo" && lab.monteCarlo.result ? (
            <MonteCarloChart 
              result={lab.monteCarlo.result as any} 
              initialBalance={10000} 
            />
          ) : null}

          {/* Regime Detection Results */}
          {activePipeline === "regime" && lab.regimeDetection.result ? (
            <RegimeAnalysisChart 
              result={lab.regimeDetection.result as any} 
            />
          ) : null}

          {/* Multi-Asset Results */}
          {activePipeline === "multiasset" && lab.multiAsset.result ? (
            <MultiAssetDashboard 
              result={lab.multiAsset.result as any} 
              initialBalance={10000} 
            />
          ) : null}

          {/* Optimization Results (WP-C) */}
          {activePipeline === "optimization" && lab.optimization.result ? (
            <OptimizationResultsView 
              result={lab.optimization.result as any} 
            />
          ) : null}

          {/* Walk-Forward Results (WP-C) */}
          {activePipeline === "walkforward" && lab.walkForward.result ? (
            <WalkForwardResultsView 
              result={lab.walkForward.result as any} 
            />
          ) : null}

          {/* No results yet */}
          {!currentPipelineState.result && (
            <Card>
              <CardHeader>
                <CardTitle>Resultados</CardTitle>
                <CardDescription>
                  Aguardando resultados...
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Execute uma análise para ver os resultados aqui.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default BacktestLabPage;
