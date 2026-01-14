/**
 * Laboratory - Laboratório de Backtest Unificado
 * 
 * Módulo único que consolida todas as funcionalidades de backtest:
 * - Download de dados históricos da cTrader (H1, M15, M5)
 * - Simulação única (single backtest) com visualização de resultados
 * - Otimização avançada por lotes (batch optimization)
 * - Ranking por múltiplas categorias (Lucro, Drawdown, Winrate, Recovery Factor)
 * - Interface No-Code para configuração de parâmetros
 * 
 * ARQUITETURA DE ESPELHAMENTO (Single Source of Truth):
 * - Reutiliza as mesmas classes de estratégia da produção (SMCTradingEngine, HybridTradingEngine)
 * - Substitui apenas a fonte de dados live por dados históricos
 * - Resultados matematicamente idênticos ao ambiente real
 * 
 * ISOLAMENTO TOTAL (Sandbox):
 * - Opera em ambiente completamente isolado
 * - Usa MockExecutionService para simular execução
 * - Nenhuma ordem real é enviada à API da cTrader
 * 
 * @author Schimidt Trader Pro - Backtest Laboratory
 * @version 3.0.0 - Unified Module
 */

import { useState, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Settings2,
  Crown,
  Shield,
  FlaskConical,
  Award,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

type ParameterCategory = 
  | "structure"
  | "sweep"
  | "choch"
  | "orderBlock"
  | "entry"
  | "risk"
  | "session"
  | "trailing"
  | "spread";

interface ParameterRange {
  name: string;
  label: string;
  type: "number" | "boolean" | "select";
  min?: number;
  max?: number;
  step?: number;
  options?: (string | number)[];
  values?: (number | string | boolean)[];
  enabled: boolean;
  defaultValue: number | string | boolean;
  category: ParameterCategory;
  description?: string;
}

interface SingleBacktestFormData {
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
  batchSize: number;
  topResultsToKeep: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORY_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  profitability: { icon: <Trophy className="w-5 h-5" />, color: "text-yellow-400" },
  recoveryFactor: { icon: <Shield className="w-5 h-5" />, color: "text-blue-400" },
  minDrawdown: { icon: <TrendingDown className="w-5 h-5" />, color: "text-green-400" },
  winRate: { icon: <Target className="w-5 h-5" />, color: "text-purple-400" },
};

const CATEGORY_COLORS: Record<string, string> = {
  structure: "border-blue-500/30 bg-blue-500/5",
  sweep: "border-cyan-500/30 bg-cyan-500/5",
  choch: "border-purple-500/30 bg-purple-500/5",
  orderBlock: "border-orange-500/30 bg-orange-500/5",
  entry: "border-green-500/30 bg-green-500/5",
  risk: "border-red-500/30 bg-red-500/5",
  session: "border-yellow-500/30 bg-yellow-500/5",
  trailing: "border-pink-500/30 bg-pink-500/5",
  spread: "border-slate-500/30 bg-slate-500/5",
};

const CATEGORY_LABELS: Record<string, string> = {
  structure: "Estrutura",
  sweep: "Sweep/Liquidez",
  choch: "CHoCH",
  orderBlock: "Order Block",
  entry: "Entrada",
  risk: "Risco",
  session: "Sessão",
  trailing: "Trailing Stop",
  spread: "Spread",
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function Laboratory() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<"single" | "optimize">("single");
  
  // Single Backtest Form state
  const [singleFormData, setSingleFormData] = useState<SingleBacktestFormData>({
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
    batchSize: 50,
    topResultsToKeep: 5,
  });
  
  // Parameter ranges state
  const [parameterRanges, setParameterRanges] = useState<ParameterRange[]>([]);
  
  // =========================================================================
  // QUERIES
  // =========================================================================
  
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
  const parametersQuery = trpc.backtest.getOptimizableParameters.useQuery();
  
  // Batch optimization queries
  const batchStatusQuery = trpc.backtest.getBatchOptimizationStatus.useQuery(undefined, {
    refetchInterval: 1000,
  });
  const batchResultsQuery = trpc.backtest.getBatchOptimizationResults.useQuery();
  
  // =========================================================================
  // MUTATIONS
  // =========================================================================
  
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
  
  const runBatchOptimizationMutation = trpc.backtest.runBatchOptimization.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      batchResultsQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });
  
  const abortBatchOptimizationMutation = trpc.backtest.abortBatchOptimization.useMutation({
    onSuccess: (data) => {
      toast.info(data.message);
      batchResultsQuery.refetch();
    },
  });
  
  const clearBatchResultsMutation = trpc.backtest.clearBatchOptimizationResults.useMutation({
    onSuccess: () => {
      toast.info("Resultados limpos");
      batchResultsQuery.refetch();
    },
  });
  
  // =========================================================================
  // EFFECTS
  // =========================================================================
  
  // Initialize parameter ranges from API
  useEffect(() => {
    if (parametersQuery.data?.parameters) {
      setParameterRanges(parametersQuery.data.parameters);
    }
  }, [parametersQuery.data]);
  
  // =========================================================================
  // HANDLERS
  // =========================================================================
  
  const handleDownloadData = () => {
    downloadMutation.mutate({
      symbols: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"],
      timeframes: ["M5", "M15", "H1"],
      monthsBack: 6,
    });
  };
  
  const handleRunSingleBacktest = () => {
    runBacktestMutation.mutate({
      symbol: singleFormData.symbol,
      strategy: singleFormData.strategy as "SMC" | "HYBRID" | "RSI_VWAP",
      startDate: singleFormData.startDate,
      endDate: singleFormData.endDate,
      initialBalance: singleFormData.initialBalance,
      riskPercent: singleFormData.riskPercent,
      maxPositions: singleFormData.maxPositions,
      leverage: singleFormData.leverage,
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
    
    const enabledParams = parameterRanges.filter(p => p.enabled);
    if (enabledParams.length === 0) {
      toast.error("Habilite pelo menos um parâmetro para otimização");
      return;
    }
    
    runBatchOptimizationMutation.mutate({
      symbol: optFormData.symbol,
      startDate: optFormData.startDate,
      endDate: optFormData.endDate,
      initialBalance: optFormData.initialBalance,
      leverage: 500,
      commission: 7,
      slippage: 0.5,
      spread: 1,
      strategies: optFormData.strategies as ("SMC" | "HYBRID" | "RSI_VWAP")[],
      parameterRanges: parameterRanges,
      batchSize: optFormData.batchSize,
      topResultsToKeep: optFormData.topResultsToKeep,
      rankingCategories: ["profitability", "recoveryFactor", "minDrawdown", "winRate"],
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
  
  const toggleParameterEnabled = (paramName: string) => {
    setParameterRanges(prev => prev.map(p => 
      p.name === paramName ? { ...p, enabled: !p.enabled } : p
    ));
  };
  
  const updateParameterRange = (paramName: string, field: string, value: number) => {
    setParameterRanges(prev => prev.map(p => 
      p.name === paramName ? { ...p, [field]: value } : p
    ));
  };
  
  // =========================================================================
  // COMPUTED VALUES
  // =========================================================================
  
  const calculateTotalCombinations = (): number => {
    const enabledParams = parameterRanges.filter(p => p.enabled);
    if (enabledParams.length === 0) return optFormData.strategies.length;
    
    let combinations = 1;
    for (const param of enabledParams) {
      if (param.type === "boolean") {
        combinations *= 2;
      } else if (param.type === "select" && param.options) {
        combinations *= param.options.length;
      } else if (param.type === "number" && param.min !== undefined && param.max !== undefined && param.step !== undefined) {
        const steps = Math.ceil((param.max - param.min) / param.step) + 1;
        combinations *= steps;
      }
    }
    
    return combinations * optFormData.strategies.length;
  };
  
  // =========================================================================
  // LOADING STATES
  // =========================================================================
  
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
  const isOptimizing = batchStatusQuery.data?.isRunning || runBatchOptimizationMutation.isPending;
  const singleResult = lastResultQuery.data;
  const batchResults = batchResultsQuery.data;
  const totalCombinations = calculateTotalCombinations();
  const estimatedBatches = Math.ceil(totalCombinations / optFormData.batchSize);
  
  // Group parameters by category
  const parametersByCategory = parameterRanges.reduce((acc, param) => {
    if (!acc[param.category]) {
      acc[param.category] = [];
    }
    acc[param.category].push(param);
    return acc;
  }, {} as Record<string, ParameterRange[]>);
  
  // =========================================================================
  // RENDER
  // =========================================================================
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <FlaskConical className="w-8 h-8 text-cyan-400" />
              Laboratório
            </h1>
            <p className="text-slate-400 mt-1">
              Teste e otimize suas estratégias com dados históricos reais
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
              Otimização em Lotes
            </TabsTrigger>
          </TabsList>
          
          {/* =============================================================== */}
          {/* SINGLE BACKTEST TAB */}
          {/* =============================================================== */}
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
                
                {/* Single Backtest Config Card */}
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Settings2 className="w-5 h-5 text-cyan-400" />
                      Configuração do Backtest
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Symbol */}
                    <div className="space-y-2">
                      <Label className="text-slate-300">Ativo</Label>
                      <Select
                        value={singleFormData.symbol}
                        onValueChange={(value) => setSingleFormData({ ...singleFormData, symbol: value })}
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
                        value={singleFormData.strategy}
                        onValueChange={(value) => setSingleFormData({ ...singleFormData, strategy: value })}
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
                          value={singleFormData.startDate}
                          onChange={(e) => setSingleFormData({ ...singleFormData, startDate: e.target.value })}
                          className="bg-slate-800 border-slate-700"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-300">Data Fim</Label>
                        <Input
                          type="date"
                          value={singleFormData.endDate}
                          onChange={(e) => setSingleFormData({ ...singleFormData, endDate: e.target.value })}
                          className="bg-slate-800 border-slate-700"
                        />
                      </div>
                    </div>
                    
                    {/* Balance & Risk */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-slate-300">Saldo Inicial ($)</Label>
                        <Input
                          type="number"
                          value={singleFormData.initialBalance}
                          onChange={(e) => setSingleFormData({ ...singleFormData, initialBalance: Number(e.target.value) })}
                          className="bg-slate-800 border-slate-700"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-300">Risco (%)</Label>
                        <Input
                          type="number"
                          step="0.5"
                          value={singleFormData.riskPercent}
                          onChange={(e) => setSingleFormData({ ...singleFormData, riskPercent: Number(e.target.value) })}
                          className="bg-slate-800 border-slate-700"
                        />
                      </div>
                    </div>
                    
                    {/* Backtest Progress */}
                    {isRunning && backtestStatusQuery.data?.progress && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">{backtestStatusQuery.data.currentPhase}</span>
                          <span className="text-white">{backtestStatusQuery.data.progress}%</span>
                        </div>
                        <Progress value={backtestStatusQuery.data.progress} className="h-2" />
                      </div>
                    )}
                    
                    {/* Run Button */}
                    <Button
                      onClick={handleRunSingleBacktest}
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
                {singleResult ? (
                  <SingleBacktestResults result={singleResult} onClear={() => clearResultsMutation.mutate()} />
                ) : (
                  <EmptySingleResultsCard />
                )}
              </div>
            </div>
          </TabsContent>
          
          {/* =============================================================== */}
          {/* OPTIMIZATION TAB */}
          {/* =============================================================== */}
          <TabsContent value="optimize" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - Configuration */}
              <div className="lg:col-span-1 space-y-6">
                {/* Basic Config Card */}
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Settings2 className="w-5 h-5 text-cyan-400" />
                      Configuração Base
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Symbol */}
                    <div className="space-y-2">
                      <Label className="text-slate-300">Ativo</Label>
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
                    
                    {/* Date Range */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-slate-300">Início</Label>
                        <Input
                          type="date"
                          value={optFormData.startDate}
                          onChange={(e) => setOptFormData({ ...optFormData, startDate: e.target.value })}
                          className="bg-slate-800 border-slate-700"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-300">Fim</Label>
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
                    
                    {/* Strategies */}
                    <div className="space-y-2">
                      <Label className="text-slate-300">Estratégias</Label>
                      <div className="flex flex-wrap gap-2">
                        {strategiesQuery.data?.strategies.map((s) => (
                          <Badge
                            key={s.value}
                            variant={optFormData.strategies.includes(s.value) ? "default" : "outline"}
                            className={`cursor-pointer transition-all ${
                              optFormData.strategies.includes(s.value)
                                ? "bg-cyan-600 hover:bg-cyan-700"
                                : "hover:bg-slate-700"
                            }`}
                            onClick={() => toggleStrategy(s.value)}
                          >
                            {s.value}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    
                    {/* Batch Settings */}
                    <Separator className="bg-slate-700" />
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-slate-300 text-xs">Tamanho do Lote</Label>
                        <Input
                          type="number"
                          value={optFormData.batchSize}
                          onChange={(e) => setOptFormData({ ...optFormData, batchSize: Number(e.target.value) })}
                          className="bg-slate-800 border-slate-700"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-300 text-xs">Top Resultados</Label>
                        <Input
                          type="number"
                          value={optFormData.topResultsToKeep}
                          onChange={(e) => setOptFormData({ ...optFormData, topResultsToKeep: Number(e.target.value) })}
                          className="bg-slate-800 border-slate-700"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                {/* Parameter Ranges Card */}
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-purple-400" />
                      Parâmetros a Otimizar
                    </CardTitle>
                    <CardDescription>
                      Defina os intervalos para cada parâmetro
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px] pr-4">
                      <Accordion type="multiple" className="space-y-2">
                        {Object.entries(parametersByCategory).map(([category, params]) => (
                          <AccordionItem
                            key={category}
                            value={category}
                            className={`border rounded-lg ${CATEGORY_COLORS[category] || "border-slate-700"}`}
                          >
                            <AccordionTrigger className="px-4 py-2 hover:no-underline">
                              <div className="flex items-center gap-2">
                                <span className="text-white font-medium">
                                  {CATEGORY_LABELS[category] || category}
                                </span>
                                <Badge variant="secondary" className="text-xs">
                                  {params.filter(p => p.enabled).length}/{params.length}
                                </Badge>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4 space-y-3">
                              {params.map((param) => (
                                <ParameterRangeInput
                                  key={param.name}
                                  param={param}
                                  onToggle={() => toggleParameterEnabled(param.name)}
                                  onUpdate={(field, value) => updateParameterRange(param.name, field, value)}
                                />
                              ))}
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </ScrollArea>
                  </CardContent>
                </Card>
                
                {/* Summary & Run Card */}
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardContent className="pt-6 space-y-4">
                    {/* Combinations Preview */}
                    <div className="bg-slate-800/50 rounded-lg p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Total de Combinações:</span>
                        <span className="text-white font-bold">{totalCombinations.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Lotes Estimados:</span>
                        <span className="text-white">{estimatedBatches}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Parâmetros Ativos:</span>
                        <span className="text-cyan-400">{parameterRanges.filter(p => p.enabled).length}</span>
                      </div>
                    </div>
                    
                    {/* Progress */}
                    {isOptimizing && batchStatusQuery.data?.progress && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">
                            Lote {batchStatusQuery.data.progress.currentBatch}/{batchStatusQuery.data.progress.totalBatches}
                          </span>
                          <span className="text-white">
                            {batchStatusQuery.data.progress.currentCombination}/{batchStatusQuery.data.progress.totalCombinations}
                          </span>
                        </div>
                        <Progress value={batchStatusQuery.data.progress.percentComplete} className="h-2" />
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>{batchStatusQuery.data.progress.currentStrategy}</span>
                          <span>~{batchStatusQuery.data.progress.estimatedTimeRemaining}s restantes</span>
                        </div>
                      </div>
                    )}
                    
                    {/* Run/Abort Buttons */}
                    <div className="flex gap-2">
                      {isOptimizing ? (
                        <Button
                          onClick={() => abortBatchOptimizationMutation.mutate()}
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
                          className="flex-1 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700"
                        >
                          <Zap className="w-4 h-4 mr-2" />
                          Iniciar Otimização
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {/* Right Column - Results */}
              <div className="lg:col-span-2 space-y-6">
                {batchResults ? (
                  <BatchOptimizationResults 
                    results={batchResults} 
                    onClear={() => clearBatchResultsMutation.mutate()} 
                  />
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
          Baixe candles dos últimos 6 meses (H1, M15, M5)
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

function ParameterRangeInput({
  param,
  onToggle,
  onUpdate,
}: {
  param: ParameterRange;
  onToggle: () => void;
  onUpdate: (field: string, value: number) => void;
}) {
  return (
    <div className={`p-3 rounded-lg border transition-all ${
      param.enabled 
        ? "bg-slate-800/50 border-cyan-500/50" 
        : "bg-slate-900/50 border-slate-700/50 opacity-60"
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={param.enabled}
            onCheckedChange={onToggle}
          />
          <Label className="text-sm text-white cursor-pointer" onClick={onToggle}>
            {param.label}
          </Label>
        </div>
      </div>
      
      {param.enabled && param.type === "number" && (
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div>
            <Label className="text-xs text-slate-500">Início</Label>
            <Input
              type="number"
              step={param.step || 1}
              value={param.min}
              onChange={(e) => onUpdate("min", Number(e.target.value))}
              className="h-8 bg-slate-700 border-slate-600 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Fim</Label>
            <Input
              type="number"
              step={param.step || 1}
              value={param.max}
              onChange={(e) => onUpdate("max", Number(e.target.value))}
              className="h-8 bg-slate-700 border-slate-600 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Passo</Label>
            <Input
              type="number"
              step={0.1}
              value={param.step}
              onChange={(e) => onUpdate("step", Number(e.target.value))}
              className="h-8 bg-slate-700 border-slate-600 text-sm"
            />
          </div>
        </div>
      )}
      
      {param.description && (
        <p className="text-xs text-slate-500 mt-2">{param.description}</p>
      )}
    </div>
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
                <MetricRow label="Recovery Factor" value={result.metrics.recoveryFactor.toFixed(2)} positive={result.metrics.recoveryFactor >= 1} />
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

function BatchOptimizationResults({
  results,
  onClear,
}: {
  results: any;
  onClear: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Crown className="w-6 h-6 text-yellow-400" />
            Resultados da Otimização
          </h2>
          <p className="text-slate-400 text-sm">
            {results.completedCombinations.toLocaleString()} combinações testadas em {results.totalBatches} lotes
            {results.aborted && " (abortado)"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onClear}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Limpar
        </Button>
      </div>
      
      {/* Overall Best */}
      {results.overallBest && (
        <Card className="bg-gradient-to-r from-yellow-900/30 to-orange-900/30 border-yellow-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-yellow-400 flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              Melhor Configuração Geral
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricDisplay
                label="Estratégia"
                value={results.overallBest.strategy}
                color="yellow"
              />
              <MetricDisplay
                label="Lucro Líquido"
                value={`$${results.overallBest.metrics.netProfit.toFixed(2)}`}
                color={results.overallBest.metrics.netProfit >= 0 ? "green" : "red"}
              />
              <MetricDisplay
                label="Winrate"
                value={`${results.overallBest.metrics.winRate.toFixed(1)}%`}
                color="blue"
              />
              <MetricDisplay
                label="Max Drawdown"
                value={`${results.overallBest.metrics.maxDrawdownPercent.toFixed(1)}%`}
                color="red"
              />
            </div>
            
            {/* Best Params */}
            <div className="mt-4 p-3 bg-slate-900/50 rounded-lg">
              <Label className="text-xs text-slate-400">Parâmetros Otimizados:</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(results.overallBest.params).map(([key, value]) => (
                  <Badge key={key} variant="secondary" className="text-xs">
                    {key}: {String(value)}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Category Rankings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {results.rankings?.map((ranking: any) => (
          <CategoryRankingCard key={ranking.category} ranking={ranking} />
        ))}
      </div>
      
      {/* Execution Info */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="pt-4">
          <div className="flex justify-between text-sm text-slate-400">
            <span>Tempo de Execução: {(results.executionTime / 1000).toFixed(1)}s</span>
            <span>Erros: {results.errors?.length || 0}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CategoryRankingCard({ ranking }: { ranking: any }) {
  const categoryInfo = CATEGORY_ICONS[ranking.category] || { icon: <Medal />, color: "text-slate-400" };
  
  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className={`flex items-center gap-2 ${categoryInfo.color}`}>
          {categoryInfo.icon}
          <span className="text-white">{ranking.label}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {ranking.topResults?.slice(0, 5).map((result: any, index: number) => (
            <div
              key={result.id}
              className={`flex items-center justify-between p-2 rounded-lg ${
                index === 0 ? "bg-slate-800" : "bg-slate-800/50"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  index === 0 ? "bg-yellow-500 text-black" :
                  index === 1 ? "bg-slate-400 text-black" :
                  index === 2 ? "bg-orange-600 text-white" :
                  "bg-slate-700 text-slate-300"
                }`}>
                  {index + 1}
                </span>
                <span className="text-sm text-white">{result.strategy}</span>
              </div>
              <div className="text-right">
                <span className={`text-sm font-medium ${categoryInfo.color}`}>
                  {getCategoryDisplayValue(result, ranking.category)}
                </span>
              </div>
            </div>
          ))}
        </div>
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

function MetricDisplay({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "green" | "red" | "blue" | "yellow" | "purple";
}) {
  const colorClasses = {
    green: "text-green-400",
    red: "text-red-400",
    blue: "text-blue-400",
    yellow: "text-yellow-400",
    purple: "text-purple-400",
  };
  
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${colorClasses[color]}`}>{value}</p>
    </div>
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
                {trade.exitReason === "TAKE_PROFIT" && <CheckCircle2 className="w-4 h-4 text-green-400 inline" />}
                {trade.exitReason === "STOP_LOSS" && <XCircle className="w-4 h-4 text-red-400 inline" />}
                {trade.exitReason === "SIGNAL" && <Activity className="w-4 h-4 text-blue-400 inline" />}
                {trade.exitReason === "END_OF_DATA" && <Activity className="w-4 h-4 text-slate-400 inline" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptySingleResultsCard() {
  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <BarChart3 className="w-16 h-16 text-slate-600 mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">
          Simulação Única
        </h3>
        <p className="text-slate-400 text-center max-w-md">
          Configure os parâmetros à esquerda e clique em "Rodar Simulação" 
          para testar sua estratégia com dados históricos reais.
        </p>
        <div className="mt-6 p-4 bg-slate-800/50 rounded-lg">
          <p className="text-xs text-slate-500 text-center">
            <strong className="text-cyan-400">Arquitetura de Espelhamento:</strong> O backtest utiliza 
            exatamente a mesma lógica das engines de produção (SMCTradingEngine, HybridTradingEngine), 
            garantindo resultados matematicamente idênticos ao ambiente real.
          </p>
        </div>
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
          Otimização em Lotes
        </h3>
        <p className="text-slate-400 text-center max-w-md mb-6">
          Configure os parâmetros à esquerda, defina os intervalos de otimização
          e clique em "Iniciar Otimização" para descobrir as melhores configurações.
        </p>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-2xl">
          {Object.entries(CATEGORY_ICONS).map(([key, { icon, color }]) => (
            <div key={key} className="flex flex-col items-center p-4 bg-slate-800/50 rounded-lg">
              <div className={color}>{icon}</div>
              <span className="text-xs text-slate-400 mt-2 text-center">
                {key === "profitability" && "Lucratividade"}
                {key === "recoveryFactor" && "Recuperação"}
                {key === "minDrawdown" && "Menor DD"}
                {key === "winRate" && "Winrate"}
              </span>
            </div>
          ))}
        </div>
        
        <div className="mt-6 p-4 bg-slate-800/50 rounded-lg">
          <p className="text-xs text-slate-500 text-center">
            <strong className="text-yellow-400">Otimização por Lotes:</strong> Processa combinações 
            em lotes para evitar memory overflow, mantendo apenas os Top 5 resultados de cada categoria.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function getDefaultStartDate(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 3);
  return date.toISOString().split("T")[0];
}

function getDefaultEndDate(): string {
  return new Date().toISOString().split("T")[0];
}

function getCategoryDisplayValue(result: any, category: string): string {
  switch (category) {
    case "profitability":
      return `$${result.metrics.netProfit.toFixed(2)}`;
    case "recoveryFactor":
      return result.metrics.recoveryFactor.toFixed(2);
    case "minDrawdown":
      return `${result.metrics.maxDrawdownPercent.toFixed(1)}%`;
    case "winRate":
      return `${result.metrics.winRate.toFixed(1)}%`;
    default:
      return "";
  }
}
