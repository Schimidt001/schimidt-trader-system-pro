/**
 * BacktestLab - Laboratório de Backtest Avançado (Batch Optimization)
 * 
 * Interface No-Code para:
 * - Configurar intervalos de parâmetros dinamicamente
 * - Executar otimização em lotes (batch processing)
 * - Visualizar rankings por múltiplas categorias
 * - Identificar as 5 melhores configurações
 * 
 * @author Schimidt Trader Pro - Backtest Module
 * @version 2.0.0
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

// Icons
import {
  Loader2,
  Play,
  StopCircle,
  Trophy,
  Shield,
  TrendingDown,
  Target,
  Zap,
  Settings2,
  BarChart3,
  Database,
  RefreshCw,
  ChevronRight,
  Medal,
  Award,
  Crown,
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
// CATEGORY ICONS
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

export default function BacktestLab() {
  const { user, loading: authLoading } = useAuth();
  
  // Form state
  const [formData, setFormData] = useState<OptimizationFormData>({
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
  
  // Queries
  const availableDataQuery = trpc.backtest.getAvailableData.useQuery();
  const symbolsQuery = trpc.backtest.getAvailableSymbols.useQuery();
  const strategiesQuery = trpc.backtest.getAvailableStrategies.useQuery();
  const parametersQuery = trpc.backtest.getOptimizableParameters.useQuery();
  
  // Batch optimization queries
  const batchStatusQuery = trpc.backtest.getBatchOptimizationStatus.useQuery(undefined, {
    refetchInterval: 1000,
  });
  const batchResultsQuery = trpc.backtest.getBatchOptimizationResults.useQuery();
  
  // Mutations
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
  
  // Initialize parameter ranges from API
  useEffect(() => {
    if (parametersQuery.data?.parameters) {
      setParameterRanges(parametersQuery.data.parameters);
    }
  }, [parametersQuery.data]);
  
  // Handlers
  const handleRunOptimization = () => {
    if (formData.strategies.length === 0) {
      toast.error("Selecione pelo menos uma estratégia");
      return;
    }
    
    const enabledParams = parameterRanges.filter(p => p.enabled);
    if (enabledParams.length === 0) {
      toast.error("Habilite pelo menos um parâmetro para otimização");
      return;
    }
    
    runBatchOptimizationMutation.mutate({
      symbol: formData.symbol,
      startDate: formData.startDate,
      endDate: formData.endDate,
      initialBalance: formData.initialBalance,
      leverage: 500,
      commission: 7,
      slippage: 0.5,
      spread: 1,
      strategies: formData.strategies as ("SMC" | "HYBRID" | "RSI_VWAP")[],
      parameterRanges: parameterRanges,
      batchSize: formData.batchSize,
      topResultsToKeep: formData.topResultsToKeep,
      rankingCategories: ["profitability", "recoveryFactor", "minDrawdown", "winRate"],
    });
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
  
  const toggleStrategy = (strategy: string) => {
    setFormData(prev => ({
      ...prev,
      strategies: prev.strategies.includes(strategy)
        ? prev.strategies.filter(s => s !== strategy)
        : [...prev.strategies, strategy],
    }));
  };
  
  // Calculate total combinations
  const calculateTotalCombinations = (): number => {
    const enabledParams = parameterRanges.filter(p => p.enabled);
    if (enabledParams.length === 0) return formData.strategies.length;
    
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
    
    return combinations * formData.strategies.length;
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
  
  const isOptimizing = batchStatusQuery.data?.isRunning || runBatchOptimizationMutation.isPending;
  const batchResults = batchResultsQuery.data;
  const totalCombinations = calculateTotalCombinations();
  const estimatedBatches = Math.ceil(totalCombinations / formData.batchSize);
  
  // Group parameters by category
  const parametersByCategory = parameterRanges.reduce((acc, param) => {
    if (!acc[param.category]) {
      acc[param.category] = [];
    }
    acc[param.category].push(param);
    return acc;
  }, {} as Record<string, ParameterRange[]>);
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Zap className="w-8 h-8 text-yellow-400" />
              Laboratório de Backtest
            </h1>
            <p className="text-slate-400 mt-1">
              Otimização avançada por lotes com ranking por categorias
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
              ? `${availableDataQuery.data.summary.totalCandles.toLocaleString()} candles`
              : "Sem dados"}
          </Badge>
        </div>
        
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
                
                {/* Date Range */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Início</Label>
                    <Input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Fim</Label>
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
                
                {/* Strategies */}
                <div className="space-y-2">
                  <Label className="text-slate-300">Estratégias</Label>
                  <div className="flex flex-wrap gap-2">
                    {strategiesQuery.data?.strategies.map((s) => (
                      <Badge
                        key={s.value}
                        variant={formData.strategies.includes(s.value) ? "default" : "outline"}
                        className={`cursor-pointer transition-all ${
                          formData.strategies.includes(s.value)
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
                      value={formData.batchSize}
                      onChange={(e) => setFormData({ ...formData, batchSize: Number(e.target.value) })}
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300 text-xs">Top Resultados</Label>
                    <Input
                      type="number"
                      value={formData.topResultsToKeep}
                      onChange={(e) => setFormData({ ...formData, topResultsToKeep: Number(e.target.value) })}
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
                      disabled={!availableDataQuery.data?.summary.totalFiles || formData.strategies.length === 0}
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
              <EmptyResultsCard />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

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

function EmptyResultsCard() {
  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <Zap className="w-16 h-16 text-slate-600 mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">
          Laboratório de Backtest Avançado
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
