/**
 * Backtest Page - Interface Visual para Backtesting e Otimização
 * 
 * Permite ao usuário:
 * - Baixar dados históricos (botão)
 * - Configurar e rodar simulações individuais (formulário)
 * - Modo Otimização: testar múltiplas combinações de parâmetros
 * - Visualizar resultados (métricas, gráfico e ranking)
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 2.0.0
 */

import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// UI Components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";

// Icons
import {
  Download,
  Play,
  Loader2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  BarChart3,
  Activity,
  RefreshCw,
  Database,
  CheckCircle2,
  XCircle,
  Trophy,
  Zap,
  StopCircle,
  Medal,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface BacktestFormData {
  symbol: string;
  strategy: string;
  startDate: string;
  endDate: string;
  initialBalance: number;
  riskPercent: number;
  maxPositions: number;
  leverage: number;
}

interface OptimizationFormData {
  symbol: string;
  startDate: string;
  endDate: string;
  initialBalance: number;
  strategies: string[];
  riskMin: number;
  riskMax: number;
  riskStep: number;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function Backtest() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<"single" | "optimize">("single");
  
  // Single Backtest Form state
  const [formData, setFormData] = useState<BacktestFormData>({
    symbol: "XAUUSD",
    strategy: "SMC",
    startDate: getDefaultStartDate(),
    endDate: getDefaultEndDate(),
    initialBalance: 10000,
    riskPercent: 2,
    maxPositions: 3,
    leverage: 500,
  });
  
  // Optimization Form state
  const [optFormData, setOptFormData] = useState<OptimizationFormData>({
    symbol: "XAUUSD",
    startDate: getDefaultStartDate(),
    endDate: getDefaultEndDate(),
    initialBalance: 10000,
    strategies: ["SMC"],
    riskMin: 1,
    riskMax: 5,
    riskStep: 1,
  });
  
  // Queries
  const availableDataQuery = trpc.backtest.getAvailableData.useQuery();
  const downloadStatusQuery = trpc.backtest.getDownloadStatus.useQuery(undefined, {
    refetchInterval: 1000,
  });
  const backtestStatusQuery = trpc.backtest.getBacktestStatus.useQuery(undefined, {
    refetchInterval: 1000,
  });
  const lastResultQuery = trpc.backtest.getLastResult.useQuery();
  const symbolsQuery = trpc.backtest.getAvailableSymbols.useQuery();
  const strategiesQuery = trpc.backtest.getAvailableStrategies.useQuery();
  
  // Optimization Queries
  const optStatusQuery = trpc.backtest.getOptimizationStatus.useQuery(undefined, {
    refetchInterval: 1000,
  });
  const optResultsQuery = trpc.backtest.getOptimizationResults.useQuery();
  
  // Mutations
  const downloadMutation = trpc.backtest.downloadData.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      availableDataQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });
  
  const runBacktestMutation = trpc.backtest.runBacktest.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      lastResultQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });
  
  const clearResultsMutation = trpc.backtest.clearResults.useMutation({
    onSuccess: () => {
      toast.info("Resultados limpos");
      lastResultQuery.refetch();
    },
  });
  
  // Optimization Mutations
  const runOptimizationMutation = trpc.backtest.runOptimization.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      optResultsQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });
  
  const abortOptimizationMutation = trpc.backtest.abortOptimization.useMutation({
    onSuccess: (data) => {
      toast.info(data.message);
      optResultsQuery.refetch();
    },
  });
  
  const clearOptResultsMutation = trpc.backtest.clearOptimizationResults.useMutation({
    onSuccess: () => {
      toast.info("Resultados de otimização limpos");
      optResultsQuery.refetch();
    },
  });
  
  // Handlers
  const handleDownloadData = () => {
    downloadMutation.mutate({
      symbols: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"],
      timeframes: ["M5", "H1", "H4"],
      monthsBack: 6,
    });
  };
  
  const handleRunBacktest = () => {
    runBacktestMutation.mutate({
      symbol: formData.symbol,
      strategy: formData.strategy as "SMC" | "HYBRID" | "RSI_VWAP",
      startDate: formData.startDate,
      endDate: formData.endDate,
      initialBalance: formData.initialBalance,
      riskPercent: formData.riskPercent,
      maxPositions: formData.maxPositions,
      leverage: formData.leverage,
      commission: 7,
      slippage: 0.5,
      spread: 1,
      maxSpread: 3,
    });
  };
  
  const handleRunOptimization = () => {
    if (optFormData.strategies.length === 0) {
      toast.error("Selecione pelo menos uma estratégia");
      return;
    }
    
    runOptimizationMutation.mutate({
      symbol: optFormData.symbol,
      startDate: optFormData.startDate,
      endDate: optFormData.endDate,
      initialBalance: optFormData.initialBalance,
      strategies: optFormData.strategies as ("SMC" | "HYBRID" | "RSI_VWAP")[],
      riskMin: optFormData.riskMin,
      riskMax: optFormData.riskMax,
      riskStep: optFormData.riskStep,
    });
  };
  
  const toggleStrategy = (strategy: string) => {
    setOptFormData(prev => ({
      ...prev,
      strategies: prev.strategies.includes(strategy)
        ? prev.strategies.filter(s => s !== strategy)
        : [...prev.strategies, strategy],
    }));
  };
  
  // Loading state
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }
  
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card>
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>Você precisa estar autenticado</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  
  const isDownloading = downloadStatusQuery.data?.isDownloading || downloadMutation.isPending;
  const isRunning = backtestStatusQuery.data?.isRunning || runBacktestMutation.isPending;
  const isOptimizing = optStatusQuery.data?.isRunning || runOptimizationMutation.isPending;
  const result = lastResultQuery.data;
  const optResults = optResultsQuery.data;
  
  // Calculate total combinations for optimization
  const totalCombinations = optFormData.strategies.length * 
    Math.ceil((optFormData.riskMax - optFormData.riskMin) / optFormData.riskStep + 1);
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-cyan-400" />
              Backtest Simulator
            </h1>
            <p className="text-slate-400 mt-1">
              Teste suas estratégias com dados históricos reais
            </p>
          </div>
          
          {/* Data Status Badge */}
          <Badge
            variant={availableDataQuery.data?.summary.totalFiles ? "default" : "secondary"}
            className={`px-3 py-1.5 ${
              availableDataQuery.data?.summary.totalFiles
                ? "bg-green-500/20 text-green-400 border-green-500/30"
                : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
            }`}
          >
            <Database className="w-4 h-4 mr-1.5" />
            {availableDataQuery.data?.summary.totalFiles
              ? `${availableDataQuery.data.summary.totalCandles.toLocaleString()} candles disponíveis`
              : "Sem dados históricos"}
          </Badge>
        </div>
        
        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "single" | "optimize")}>
          <TabsList className="bg-slate-800">
            <TabsTrigger value="single" className="gap-2">
              <Play className="w-4 h-4" />
              Simulação Única
            </TabsTrigger>
            <TabsTrigger value="optimize" className="gap-2">
              <Zap className="w-4 h-4" />
              Modo Otimização
            </TabsTrigger>
          </TabsList>
          
          {/* Single Backtest Tab */}
          <TabsContent value="single" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - Configuration */}
              <div className="lg:col-span-1 space-y-6">
                {/* Data Download Card */}
                <DataDownloadCard
                  availableData={availableDataQuery.data}
                  downloadStatus={downloadStatusQuery.data}
                  isDownloading={isDownloading}
                  onDownload={handleDownloadData}
                />
                
                {/* Backtest Configuration Card */}
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Activity className="w-5 h-5 text-cyan-400" />
                      Configuração do Backtest
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Symbol */}
                    <div className="space-y-2">
                      <Label className="text-slate-300">Par de Moedas</Label>
                      <Select
                        value={formData.symbol}
                        onValueChange={(value) => setFormData({ ...formData, symbol: value })}
                      >
                        <SelectTrigger className="bg-slate-800 border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {symbolsQuery.data?.symbols.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Strategy */}
                    <div className="space-y-2">
                      <Label className="text-slate-300">Estratégia</Label>
                      <Select
                        value={formData.strategy}
                        onValueChange={(value) => setFormData({ ...formData, strategy: value })}
                      >
                        <SelectTrigger className="bg-slate-800 border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {strategiesQuery.data?.strategies.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Date Range */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-slate-300">Data Início</Label>
                        <Input
                          type="date"
                          value={formData.startDate}
                          onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                          className="bg-slate-800 border-slate-700"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-300">Data Fim</Label>
                        <Input
                          type="date"
                          value={formData.endDate}
                          onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                          className="bg-slate-800 border-slate-700"
                        />
                      </div>
                    </div>
                    
                    {/* Initial Balance */}
                    <div className="space-y-2">
                      <Label className="text-slate-300">Saldo Inicial ($)</Label>
                      <Input
                        type="number"
                        value={formData.initialBalance}
                        onChange={(e) => setFormData({ ...formData, initialBalance: Number(e.target.value) })}
                        className="bg-slate-800 border-slate-700"
                      />
                    </div>
                    
                    {/* Risk & Positions */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-slate-300">Risco por Trade (%)</Label>
                        <Input
                          type="number"
                          step="0.5"
                          value={formData.riskPercent}
                          onChange={(e) => setFormData({ ...formData, riskPercent: Number(e.target.value) })}
                          className="bg-slate-800 border-slate-700"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-300">Max Posições</Label>
                        <Input
                          type="number"
                          value={formData.maxPositions}
                          onChange={(e) => setFormData({ ...formData, maxPositions: Number(e.target.value) })}
                          className="bg-slate-800 border-slate-700"
                        />
                      </div>
                    </div>
                    
                    {/* Backtest Progress */}
                    {isRunning && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">
                            {backtestStatusQuery.data?.currentPhase || "Processando..."}
                          </span>
                          <span className="text-white">{backtestStatusQuery.data?.progress || 0}%</span>
                        </div>
                        <Progress value={backtestStatusQuery.data?.progress || 0} className="h-2" />
                      </div>
                    )}
                    
                    {/* Run Button */}
                    <Button
                      onClick={handleRunBacktest}
                      disabled={isRunning || !availableDataQuery.data?.summary.totalFiles}
                      className="w-full bg-cyan-600 hover:bg-cyan-700"
                    >
                      {isRunning ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Simulando...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Rodar Simulação
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>
              
              {/* Right Column - Results */}
              <div className="lg:col-span-2 space-y-6">
                {result ? (
                  <SingleBacktestResults result={result} onClear={() => clearResultsMutation.mutate()} />
                ) : (
                  <EmptyResultsCard />
                )}
              </div>
            </div>
          </TabsContent>
          
          {/* Optimization Tab */}
          <TabsContent value="optimize" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - Optimization Config */}
              <div className="lg:col-span-1 space-y-6">
                {/* Data Download Card */}
                <DataDownloadCard
                  availableData={availableDataQuery.data}
                  downloadStatus={downloadStatusQuery.data}
                  isDownloading={isDownloading}
                  onDownload={handleDownloadData}
                />
                
                {/* Optimization Configuration Card */}
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Zap className="w-5 h-5 text-yellow-400" />
                      Modo Otimização
                    </CardTitle>
                    <CardDescription>
                      Teste múltiplas combinações automaticamente
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Symbol */}
                    <div className="space-y-2">
                      <Label className="text-slate-300">Par de Moedas</Label>
                      <Select
                        value={optFormData.symbol}
                        onValueChange={(value) => setOptFormData({ ...optFormData, symbol: value })}
                      >
                        <SelectTrigger className="bg-slate-800 border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {symbolsQuery.data?.symbols.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Strategies Selection */}
                    <div className="space-y-2">
                      <Label className="text-slate-300">Estratégias a Testar</Label>
                      <div className="space-y-2">
                        {strategiesQuery.data?.strategies.map((s) => (
                          <div key={s.value} className="flex items-center space-x-2">
                            <Checkbox
                              id={s.value}
                              checked={optFormData.strategies.includes(s.value)}
                              onCheckedChange={() => toggleStrategy(s.value)}
                            />
                            <label
                              htmlFor={s.value}
                              className="text-sm text-slate-300 cursor-pointer"
                            >
                              {s.label}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Date Range */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-slate-300">Data Início</Label>
                        <Input
                          type="date"
                          value={optFormData.startDate}
                          onChange={(e) => setOptFormData({ ...optFormData, startDate: e.target.value })}
                          className="bg-slate-800 border-slate-700"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-300">Data Fim</Label>
                        <Input
                          type="date"
                          value={optFormData.endDate}
                          onChange={(e) => setOptFormData({ ...optFormData, endDate: e.target.value })}
                          className="bg-slate-800 border-slate-700"
                        />
                      </div>
                    </div>
                    
                    {/* Initial Balance */}
                    <div className="space-y-2">
                      <Label className="text-slate-300">Saldo Inicial ($)</Label>
                      <Input
                        type="number"
                        value={optFormData.initialBalance}
                        onChange={(e) => setOptFormData({ ...optFormData, initialBalance: Number(e.target.value) })}
                        className="bg-slate-800 border-slate-700"
                      />
                    </div>
                    
                    {/* Risk Range */}
                    <div className="space-y-2">
                      <Label className="text-slate-300">Intervalo de Risco (%)</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs text-slate-500">Mínimo</Label>
                          <Input
                            type="number"
                            step="0.5"
                            value={optFormData.riskMin}
                            onChange={(e) => setOptFormData({ ...optFormData, riskMin: Number(e.target.value) })}
                            className="bg-slate-800 border-slate-700"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-slate-500">Máximo</Label>
                          <Input
                            type="number"
                            step="0.5"
                            value={optFormData.riskMax}
                            onChange={(e) => setOptFormData({ ...optFormData, riskMax: Number(e.target.value) })}
                            className="bg-slate-800 border-slate-700"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-slate-500">Passo</Label>
                          <Input
                            type="number"
                            step="0.5"
                            value={optFormData.riskStep}
                            onChange={(e) => setOptFormData({ ...optFormData, riskStep: Number(e.target.value) })}
                            className="bg-slate-800 border-slate-700"
                          />
                        </div>
                      </div>
                    </div>
                    
                    {/* Combinations Preview */}
                    <div className="bg-slate-800/50 rounded-lg p-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Total de Combinações:</span>
                        <span className="text-white font-medium">{totalCombinations}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {optFormData.strategies.length} estratégia(s) × {Math.ceil((optFormData.riskMax - optFormData.riskMin) / optFormData.riskStep + 1)} níveis de risco
                      </p>
                    </div>
                    
                    {/* Optimization Progress */}
                    {isOptimizing && optStatusQuery.data?.progress && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">
                            {optStatusQuery.data.progress.currentStrategy} ({optStatusQuery.data.progress.currentRisk}%)
                          </span>
                          <span className="text-white">
                            {optStatusQuery.data.progress.currentCombination}/{optStatusQuery.data.progress.totalCombinations}
                          </span>
                        </div>
                        <Progress value={optStatusQuery.data.progress.percentComplete} className="h-2" />
                        <p className="text-xs text-slate-500">
                          Tempo restante: ~{optStatusQuery.data.progress.estimatedTimeRemaining}s
                        </p>
                      </div>
                    )}
                    
                    {/* Run/Abort Buttons */}
                    <div className="flex gap-2">
                      {isOptimizing ? (
                        <Button
                          onClick={() => abortOptimizationMutation.mutate()}
                          variant="destructive"
                          className="flex-1"
                        >
                          <StopCircle className="w-4 h-4 mr-2" />
                          Abortar
                        </Button>
                      ) : (
                        <Button
                          onClick={handleRunOptimization}
                          disabled={!availableDataQuery.data?.summary.totalFiles || optFormData.strategies.length === 0}
                          className="flex-1 bg-yellow-600 hover:bg-yellow-700"
                        >
                          <Zap className="w-4 h-4 mr-2" />
                          Iniciar Otimização
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {/* Right Column - Optimization Results */}
              <div className="lg:col-span-2 space-y-6">
                {optResults ? (
                  <OptimizationResults results={optResults} onClear={() => clearOptResultsMutation.mutate()} />
                ) : (
                  <EmptyOptimizationCard />
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function DataDownloadCard({
  availableData,
  downloadStatus,
  isDownloading,
  onDownload,
}: {
  availableData: any;
  downloadStatus: any;
  isDownloading: boolean;
  onDownload: () => void;
}) {
  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Download className="w-5 h-5 text-blue-400" />
          Dados Históricos
        </CardTitle>
        <CardDescription>
          Baixe candles dos últimos 6 meses
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Available Data Summary */}
        {availableData?.summary.totalFiles ? (
          <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Arquivos:</span>
              <span className="text-white">{availableData.summary.totalFiles}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Símbolos:</span>
              <span className="text-white">{availableData.summary.symbols.join(", ")}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Período:</span>
              <span className="text-white text-xs">
                {availableData.summary.dateRange
                  ? `${new Date(availableData.summary.dateRange.start).toLocaleDateString()} - ${new Date(availableData.summary.dateRange.end).toLocaleDateString()}`
                  : "N/A"}
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
            <p className="text-yellow-400 text-sm">
              Nenhum dado disponível. Baixe os dados históricos primeiro.
            </p>
          </div>
        )}
        
        {/* Download Progress */}
        {isDownloading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">
                {downloadStatus?.currentSymbol} {downloadStatus?.currentTimeframe}
              </span>
              <span className="text-white">{downloadStatus?.progress || 0}%</span>
            </div>
            <Progress value={downloadStatus?.progress || 0} className="h-2" />
          </div>
        )}
        
        {/* Download Button */}
        <Button
          onClick={onDownload}
          disabled={isDownloading}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          {isDownloading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Baixando...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Baixar Dados Históricos
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function SingleBacktestResults({ result, onClear }: { result: any; onClear: () => void }) {
  return (
    <>
      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Lucro Líquido"
          value={`$${result.metrics.netProfit.toFixed(2)}`}
          icon={DollarSign}
          color={result.metrics.netProfit >= 0 ? "green" : "red"}
        />
        <MetricCard
          title="Total de Trades"
          value={result.metrics.totalTrades.toString()}
          icon={Activity}
          color="blue"
        />
        <MetricCard
          title="Winrate"
          value={`${result.metrics.winRate.toFixed(1)}%`}
          icon={Target}
          color={result.metrics.winRate >= 50 ? "green" : "yellow"}
        />
        <MetricCard
          title="Max Drawdown"
          value={`${result.metrics.maxDrawdownPercent.toFixed(1)}%`}
          icon={TrendingDown}
          color={result.metrics.maxDrawdownPercent <= 10 ? "green" : "red"}
        />
      </div>
      
      {/* Detailed Results */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white">Resultados Detalhados</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="text-slate-400 hover:text-white"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Limpar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="metrics">
            <TabsList className="bg-slate-800">
              <TabsTrigger value="metrics">Métricas</TabsTrigger>
              <TabsTrigger value="chart">Gráfico</TabsTrigger>
              <TabsTrigger value="trades">Trades</TabsTrigger>
            </TabsList>
            
            <TabsContent value="metrics" className="mt-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <MetricRow label="Saldo Inicial" value={`$${result.metrics.initialBalance.toFixed(2)}`} />
                <MetricRow label="Saldo Final" value={`$${result.metrics.finalBalance.toFixed(2)}`} />
                <MetricRow label="Retorno" value={`${result.metrics.returnPercent.toFixed(2)}%`} positive={result.metrics.returnPercent >= 0} />
                <MetricRow label="Profit Factor" value={result.metrics.profitFactor.toFixed(2)} positive={result.metrics.profitFactor >= 1} />
                <MetricRow label="Trades Vencedores" value={result.metrics.winningTrades.toString()} />
                <MetricRow label="Trades Perdedores" value={result.metrics.losingTrades.toString()} />
                <MetricRow label="Sharpe Ratio" value={result.metrics.sharpeRatio.toFixed(2)} />
                <MetricRow label="Expectativa" value={`$${result.metrics.expectancy.toFixed(2)}`} positive={result.metrics.expectancy >= 0} />
              </div>
            </TabsContent>
            
            <TabsContent value="chart" className="mt-4">
              <EquityChart data={result.equityCurve} initialBalance={result.metrics.initialBalance} />
            </TabsContent>
            
            <TabsContent value="trades" className="mt-4">
              <TradesList trades={result.trades} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  );
}

function OptimizationResults({ results, onClear }: { results: any; onClear: () => void }) {
  return (
    <>
      {/* Best Result Card */}
      {results.bestResult && (
        <Card className="bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border-yellow-500/30">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Trophy className="w-6 h-6 text-yellow-400" />
              Melhor Combinação Encontrada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-slate-400 text-sm">Estratégia</p>
                <p className="text-white font-bold text-lg">{results.bestResult.strategy}</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Risco</p>
                <p className="text-white font-bold text-lg">{results.bestResult.riskPercent}%</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Lucro Líquido</p>
                <p className="text-green-400 font-bold text-lg">${results.bestResult.netProfit.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Drawdown</p>
                <p className="text-white font-bold text-lg">{results.bestResult.maxDrawdownPercent.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Ranking Table */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Medal className="w-5 h-5 text-cyan-400" />
              Ranking de Performance
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">
                {results.completedCombinations} combinações testadas em {(results.executionTime / 1000).toFixed(1)}s
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="text-slate-400 hover:text-white"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700">
                  <th className="text-left py-3 px-2">Rank</th>
                  <th className="text-left py-3 px-2">Estratégia</th>
                  <th className="text-center py-3 px-2">Risco</th>
                  <th className="text-right py-3 px-2">Lucro</th>
                  <th className="text-right py-3 px-2">Retorno</th>
                  <th className="text-center py-3 px-2">Trades</th>
                  <th className="text-center py-3 px-2">Winrate</th>
                  <th className="text-center py-3 px-2">PF</th>
                  <th className="text-center py-3 px-2">DD</th>
                  <th className="text-center py-3 px-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {results.results.map((item: any) => (
                  <tr
                    key={`${item.strategy}-${item.riskPercent}`}
                    className={`border-b border-slate-800 hover:bg-slate-800/50 ${
                      item.rank <= 3 ? "bg-slate-800/30" : ""
                    }`}
                  >
                    <td className="py-3 px-2">
                      {item.rank === 1 && <span className="text-2xl">🥇</span>}
                      {item.rank === 2 && <span className="text-2xl">🥈</span>}
                      {item.rank === 3 && <span className="text-2xl">🥉</span>}
                      {item.rank > 3 && <span className="text-slate-500">#{item.rank}</span>}
                    </td>
                    <td className="py-3 px-2">
                      <Badge variant="outline" className={
                        item.strategy === "SMC" ? "border-cyan-500 text-cyan-400" :
                        item.strategy === "HYBRID" ? "border-purple-500 text-purple-400" :
                        "border-green-500 text-green-400"
                      }>
                        {item.strategy}
                      </Badge>
                    </td>
                    <td className="py-3 px-2 text-center text-white">{item.riskPercent}%</td>
                    <td className={`py-3 px-2 text-right font-medium ${
                      item.netProfit >= 0 ? "text-green-400" : "text-red-400"
                    }`}>
                      ${item.netProfit.toFixed(2)}
                    </td>
                    <td className={`py-3 px-2 text-right ${
                      item.returnPercent >= 0 ? "text-green-400" : "text-red-400"
                    }`}>
                      {item.returnPercent.toFixed(1)}%
                    </td>
                    <td className="py-3 px-2 text-center text-white">{item.totalTrades}</td>
                    <td className={`py-3 px-2 text-center ${
                      item.winRate >= 50 ? "text-green-400" : "text-yellow-400"
                    }`}>
                      {item.winRate.toFixed(1)}%
                    </td>
                    <td className={`py-3 px-2 text-center ${
                      item.profitFactor >= 1.5 ? "text-green-400" :
                      item.profitFactor >= 1 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {item.profitFactor.toFixed(2)}
                    </td>
                    <td className={`py-3 px-2 text-center ${
                      item.maxDrawdownPercent <= 10 ? "text-green-400" :
                      item.maxDrawdownPercent <= 20 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {item.maxDrawdownPercent.toFixed(1)}%
                    </td>
                    <td className="py-3 px-2 text-center">
                      <Badge className={
                        item.compositeScore >= 50 ? "bg-green-500/20 text-green-400" :
                        item.compositeScore >= 25 ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-red-500/20 text-red-400"
                      }>
                        {item.compositeScore.toFixed(0)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function EmptyResultsCard() {
  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <BarChart3 className="w-16 h-16 text-slate-600 mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">
          Nenhum resultado ainda
        </h3>
        <p className="text-slate-400 text-center max-w-md">
          Configure os parâmetros à esquerda e clique em "Rodar Simulação" 
          para testar sua estratégia com dados históricos.
        </p>
      </CardContent>
    </Card>
  );
}

function EmptyOptimizationCard() {
  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <Zap className="w-16 h-16 text-slate-600 mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">
          Modo Otimização
        </h3>
        <p className="text-slate-400 text-center max-w-md">
          Selecione as estratégias e defina o intervalo de risco para descobrir
          automaticamente qual combinação gera os melhores resultados.
        </p>
      </CardContent>
    </Card>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  icon: any;
  color: "green" | "red" | "blue" | "yellow";
}) {
  const colorClasses = {
    green: "text-green-400 bg-green-500/10 border-green-500/30",
    red: "text-red-400 bg-red-500/10 border-red-500/30",
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/30",
    yellow: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  };
  
  return (
    <Card className={`border ${colorClasses[color]}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={`w-4 h-4 ${colorClasses[color].split(" ")[0]}`} />
          <span className="text-xs text-slate-400">{title}</span>
        </div>
        <p className={`text-2xl font-bold ${colorClasses[color].split(" ")[0]}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function MetricRow({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-slate-800">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className={`font-medium ${
        positive === undefined ? "text-white" : positive ? "text-green-400" : "text-red-400"
      }`}>
        {value}
      </span>
    </div>
  );
}

function EquityChart({
  data,
  initialBalance,
}: {
  data: { timestamp: number; equity: number }[];
  initialBalance: number;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-400">
        Sem dados para exibir
      </div>
    );
  }
  
  const width = 800;
  const height = 300;
  const padding = 40;
  
  const minEquity = Math.min(...data.map(d => d.equity));
  const maxEquity = Math.max(...data.map(d => d.equity));
  const range = maxEquity - minEquity || 1;
  
  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((d.equity - minEquity) / range) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(" ");
  
  const isProfit = data[data.length - 1]?.equity >= initialBalance;
  
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64">
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = height - padding - pct * (height - 2 * padding);
          const value = minEquity + pct * range;
          return (
            <g key={pct}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#334155" strokeDasharray="4" />
              <text x={padding - 5} y={y + 4} textAnchor="end" className="fill-slate-500 text-xs">
                ${value.toFixed(0)}
              </text>
            </g>
          );
        })}
        
        {(() => {
          const y = height - padding - ((initialBalance - minEquity) / range) * (height - 2 * padding);
          return <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#f59e0b" strokeDasharray="8" strokeWidth="2" />;
        })()}
        
        <polyline points={points} fill="none" stroke={isProfit ? "#22c55e" : "#ef4444"} strokeWidth="2" />
        <polygon
          points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`}
          fill={isProfit ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)"}
        />
      </svg>
      
      <div className="flex justify-center gap-4 mt-2 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-yellow-500"></span>
          Saldo Inicial
        </span>
        <span className="flex items-center gap-1">
          <span className={`w-3 h-0.5 ${isProfit ? "bg-green-500" : "bg-red-500"}`}></span>
          Equity
        </span>
      </div>
    </div>
  );
}

function TradesList({ trades }: { trades: any[] }) {
  if (!trades || trades.length === 0) {
    return <div className="text-center py-8 text-slate-400">Nenhum trade executado</div>;
  }
  
  return (
    <div className="max-h-96 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-900">
          <tr className="text-slate-400 border-b border-slate-700">
            <th className="text-left py-2 px-2">#</th>
            <th className="text-left py-2 px-2">Tipo</th>
            <th className="text-left py-2 px-2">Entrada</th>
            <th className="text-left py-2 px-2">Saída</th>
            <th className="text-right py-2 px-2">Pips</th>
            <th className="text-right py-2 px-2">P&L</th>
            <th className="text-center py-2 px-2">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade, i) => (
            <tr key={trade.id} className="border-b border-slate-800 hover:bg-slate-800/50">
              <td className="py-2 px-2 text-slate-500">{i + 1}</td>
              <td className="py-2 px-2">
                <Badge variant={trade.side === "BUY" ? "default" : "secondary"} className={
                  trade.side === "BUY" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                }>
                  {trade.side}
                </Badge>
              </td>
              <td className="py-2 px-2 text-white">{trade.entryPrice.toFixed(5)}</td>
              <td className="py-2 px-2 text-white">{trade.exitPrice.toFixed(5)}</td>
              <td className={`py-2 px-2 text-right ${trade.profitPips >= 0 ? "text-green-400" : "text-red-400"}`}>
                {trade.profitPips.toFixed(1)}
              </td>
              <td className={`py-2 px-2 text-right font-medium ${trade.netProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                ${trade.netProfit.toFixed(2)}
              </td>
              <td className="py-2 px-2 text-center">
                {trade.exitReason === "TP" && <CheckCircle2 className="w-4 h-4 text-green-400 inline" />}
                {trade.exitReason === "SL" && <XCircle className="w-4 h-4 text-red-400 inline" />}
                {trade.exitReason === "SIGNAL" && <Activity className="w-4 h-4 text-blue-400 inline" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function getDefaultStartDate(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().split("T")[0];
}

function getDefaultEndDate(): string {
  return new Date().toISOString().split("T")[0];
}
