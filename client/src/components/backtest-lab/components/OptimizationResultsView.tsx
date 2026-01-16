/**
 * OptimizationResultsView - Visualização de Resultados de Otimização
 * 
 * Exibe os resultados de otimização de forma visual e analisável:
 * - Tabela Top-N com melhores combinações
 * - Métricas principais (Sharpe, Profit Factor, Drawdown)
 * - Warnings de overfitting
 * - Comparação In-Sample vs Out-of-Sample
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import React, { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Award,
  BarChart3,
  Target,
  Shield,
  Info,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface BacktestMetrics {
  netProfit: number;
  totalTrades: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdownPercent: number;
  profitFactor: number;
  averageWin?: number;
  averageLoss?: number;
  expectancy?: number;
}

interface CombinationResult {
  combinationId: string;
  combination: {
    combinationId: string;
    parameters: Record<string, number | string | boolean>;
  };
  inSample: {
    metrics: BacktestMetrics;
    trades: any[];
    equityCurve: { timestamp: number; equity: number }[];
  };
  outSample?: {
    metrics: BacktestMetrics;
    trades: any[];
    equityCurve: { timestamp: number; equity: number }[];
  };
  robustnessScore: number;
  degradationPercent: number;
  rank?: number;
  isRecommended: boolean;
  warnings: string[];
}

interface OptimizationFinalResult {
  config: any;
  totalCombinationsTested: number;
  totalTradesExecuted: number;
  executionTimeSeconds: number;
  results: CombinationResult[];
  topResults: CombinationResult[];
  bestResult: CombinationResult | null;
  aborted: boolean;
  errors: string[];
  startedAt: Date;
  completedAt: Date;
}

interface OptimizationResultsViewProps {
  result: OptimizationFinalResult;
}

// ============================================================================
// HELPERS
// ============================================================================

const formatNumber = (value: number, decimals: number = 2): string => {
  if (isNaN(value) || value === null || value === undefined) return "-";
  return value.toFixed(decimals);
};

const formatPercent = (value: number): string => {
  if (isNaN(value) || value === null || value === undefined) return "-";
  return `${value.toFixed(2)}%`;
};

const formatCurrency = (value: number): string => {
  if (isNaN(value) || value === null || value === undefined) return "-";
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(value);
};

const getMetricColor = (metric: string, value: number): string => {
  switch (metric) {
    case "sharpeRatio":
      return value >= 1.5 ? "text-green-600" : value >= 1 ? "text-yellow-600" : "text-red-600";
    case "profitFactor":
      return value >= 1.5 ? "text-green-600" : value >= 1.2 ? "text-yellow-600" : "text-red-600";
    case "winRate":
      return value >= 55 ? "text-green-600" : value >= 45 ? "text-yellow-600" : "text-red-600";
    case "maxDrawdownPercent":
      return value <= 10 ? "text-green-600" : value <= 20 ? "text-yellow-600" : "text-red-600";
    case "degradationPercent":
      return value <= 20 ? "text-green-600" : value <= 40 ? "text-yellow-600" : "text-red-600";
    case "robustnessScore":
      return value >= 70 ? "text-green-600" : value >= 50 ? "text-yellow-600" : "text-red-600";
    default:
      return "";
  }
};

// ============================================================================
// COMPONENT
// ============================================================================

export function OptimizationResultsView({ result }: OptimizationResultsViewProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>("robustnessScore");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Ordenar resultados
  const sortedResults = useMemo(() => {
    const results = [...(result.topResults || [])];
    return results.sort((a, b) => {
      let aValue: number, bValue: number;
      
      switch (sortBy) {
        case "robustnessScore":
          aValue = a.robustnessScore;
          bValue = b.robustnessScore;
          break;
        case "sharpeRatio":
          aValue = a.inSample.metrics.sharpeRatio;
          bValue = b.inSample.metrics.sharpeRatio;
          break;
        case "profitFactor":
          aValue = a.inSample.metrics.profitFactor;
          bValue = b.inSample.metrics.profitFactor;
          break;
        case "netProfit":
          aValue = a.inSample.metrics.netProfit;
          bValue = b.inSample.metrics.netProfit;
          break;
        case "degradationPercent":
          aValue = a.degradationPercent;
          bValue = b.degradationPercent;
          break;
        default:
          aValue = a.robustnessScore;
          bValue = b.robustnessScore;
      }
      
      return sortOrder === "desc" ? bValue - aValue : aValue - bValue;
    });
  }, [result.topResults, sortBy, sortOrder]);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
  };

  const copyParameters = (params: Record<string, number | string | boolean>) => {
    navigator.clipboard.writeText(JSON.stringify(params, null, 2));
  };

  // Verificar se há warnings de overfitting
  const hasOverfittingWarnings = result.topResults?.some(r => 
    r.warnings.some(w => w.toLowerCase().includes("overfit"))
  );

  const bestResult = result.bestResult;

  return (
    <div className="space-y-6">
      {/* Resumo Executivo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Resumo da Otimização
          </CardTitle>
          <CardDescription>
            {result.totalCombinationsTested.toLocaleString()} combinações testadas em{" "}
            {Math.round(result.executionTimeSeconds / 60)} minutos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-primary">
                {result.totalCombinationsTested.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">Combinações Testadas</div>
            </div>
            <div className="bg-muted rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-primary">
                {result.totalTradesExecuted.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">Trades Executados</div>
            </div>
            <div className="bg-muted rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-primary">
                {result.topResults?.length || 0}
              </div>
              <div className="text-sm text-muted-foreground">Resultados Top</div>
            </div>
            <div className="bg-muted rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-primary">
                {Math.round(result.executionTimeSeconds / 60)} min
              </div>
              <div className="text-sm text-muted-foreground">Tempo Total</div>
            </div>
          </div>

          {/* Warnings */}
          {hasOverfittingWarnings && (
            <Alert variant="destructive" className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Atenção: Possível Overfitting</AlertTitle>
              <AlertDescription>
                Algumas combinações apresentam alta degradação entre In-Sample e Out-of-Sample.
                Considere usar parâmetros mais conservadores ou aumentar o período de validação.
              </AlertDescription>
            </Alert>
          )}

          {result.errors.length > 0 && (
            <Alert variant="destructive" className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Erros Durante Execução</AlertTitle>
              <AlertDescription>
                {result.errors.slice(0, 3).map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
                {result.errors.length > 3 && (
                  <div className="text-sm mt-1">... e mais {result.errors.length - 3} erros</div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Melhor Resultado */}
      {bestResult && (
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-green-600" />
              Melhor Combinação Recomendada
            </CardTitle>
            <CardDescription>
              Score de Robustez: {formatNumber(bestResult.robustnessScore)}%
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <div className="text-sm text-muted-foreground">Sharpe Ratio</div>
                <div className={`text-xl font-bold ${getMetricColor("sharpeRatio", bestResult.inSample.metrics.sharpeRatio)}`}>
                  {formatNumber(bestResult.inSample.metrics.sharpeRatio)}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Profit Factor</div>
                <div className={`text-xl font-bold ${getMetricColor("profitFactor", bestResult.inSample.metrics.profitFactor)}`}>
                  {formatNumber(bestResult.inSample.metrics.profitFactor)}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Win Rate</div>
                <div className={`text-xl font-bold ${getMetricColor("winRate", bestResult.inSample.metrics.winRate)}`}>
                  {formatPercent(bestResult.inSample.metrics.winRate)}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Max Drawdown</div>
                <div className={`text-xl font-bold ${getMetricColor("maxDrawdownPercent", bestResult.inSample.metrics.maxDrawdownPercent)}`}>
                  {formatPercent(bestResult.inSample.metrics.maxDrawdownPercent)}
                </div>
              </div>
            </div>

            {/* Parâmetros */}
            <div className="bg-white rounded-lg p-4 border">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Parâmetros Otimizados</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyParameters(bestResult.combination.parameters)}
                >
                  <Copy className="w-4 h-4 mr-1" />
                  Copiar
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                {Object.entries(bestResult.combination.parameters).map(([key, value]) => (
                  <div key={key} className="flex justify-between bg-muted/50 rounded px-2 py-1">
                    <span className="text-muted-foreground">{key}:</span>
                    <span className="font-mono">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Comparação IS vs OOS */}
            {bestResult.outSample && (
              <div className="mt-4">
                <div className="text-sm font-medium mb-2">Comparação In-Sample vs Out-of-Sample</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-xs text-blue-600 font-medium mb-1">IN-SAMPLE</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Profit: {formatCurrency(bestResult.inSample.metrics.netProfit)}</div>
                      <div>Trades: {bestResult.inSample.metrics.totalTrades}</div>
                      <div>Sharpe: {formatNumber(bestResult.inSample.metrics.sharpeRatio)}</div>
                      <div>PF: {formatNumber(bestResult.inSample.metrics.profitFactor)}</div>
                    </div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <div className="text-xs text-purple-600 font-medium mb-1">OUT-OF-SAMPLE</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Profit: {formatCurrency(bestResult.outSample.metrics.netProfit)}</div>
                      <div>Trades: {bestResult.outSample.metrics.totalTrades}</div>
                      <div>Sharpe: {formatNumber(bestResult.outSample.metrics.sharpeRatio)}</div>
                      <div>PF: {formatNumber(bestResult.outSample.metrics.profitFactor)}</div>
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Degradação:</span>
                  <Badge 
                    variant={bestResult.degradationPercent <= 20 ? "default" : bestResult.degradationPercent <= 40 ? "secondary" : "destructive"}
                  >
                    {formatPercent(bestResult.degradationPercent)}
                  </Badge>
                </div>
              </div>
            )}

            {/* Warnings */}
            {bestResult.warnings.length > 0 && (
              <div className="mt-4">
                {bestResult.warnings.map((warning, i) => (
                  <Alert key={i} variant="default" className="mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{warning}</AlertDescription>
                  </Alert>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabela Top-N */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Top {sortedResults.length} Combinações
          </CardTitle>
          <CardDescription>
            Clique nas colunas para ordenar. Clique na linha para expandir detalhes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted"
                    onClick={() => handleSort("robustnessScore")}
                  >
                    <div className="flex items-center gap-1">
                      Robustez
                      {sortBy === "robustnessScore" && (
                        sortOrder === "desc" ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted"
                    onClick={() => handleSort("sharpeRatio")}
                  >
                    <div className="flex items-center gap-1">
                      Sharpe
                      {sortBy === "sharpeRatio" && (
                        sortOrder === "desc" ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted"
                    onClick={() => handleSort("profitFactor")}
                  >
                    <div className="flex items-center gap-1">
                      PF
                      {sortBy === "profitFactor" && (
                        sortOrder === "desc" ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead>Win Rate</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted"
                    onClick={() => handleSort("netProfit")}
                  >
                    <div className="flex items-center gap-1">
                      Lucro
                      {sortBy === "netProfit" && (
                        sortOrder === "desc" ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead>Drawdown</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted"
                    onClick={() => handleSort("degradationPercent")}
                  >
                    <div className="flex items-center gap-1">
                      Degradação
                      {sortBy === "degradationPercent" && (
                        sortOrder === "desc" ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedResults.map((item, index) => (
                  <React.Fragment key={item.combinationId || index}>
                    <TableRow 
                      className={`cursor-pointer hover:bg-muted/50 ${item.isRecommended ? 'bg-green-50' : ''}`}
                      onClick={() => setExpandedRow(expandedRow === item.combinationId ? null : item.combinationId)}
                    >
                      <TableCell className="font-medium">
                        {index + 1}
                        {item.isRecommended && <Award className="w-4 h-4 text-green-600 inline ml-1" />}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={item.robustnessScore} className="w-16 h-2" />
                          <span className={getMetricColor("robustnessScore", item.robustnessScore)}>
                            {formatNumber(item.robustnessScore, 0)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className={getMetricColor("sharpeRatio", item.inSample.metrics.sharpeRatio)}>
                        {formatNumber(item.inSample.metrics.sharpeRatio)}
                      </TableCell>
                      <TableCell className={getMetricColor("profitFactor", item.inSample.metrics.profitFactor)}>
                        {formatNumber(item.inSample.metrics.profitFactor)}
                      </TableCell>
                      <TableCell className={getMetricColor("winRate", item.inSample.metrics.winRate)}>
                        {formatPercent(item.inSample.metrics.winRate)}
                      </TableCell>
                      <TableCell>
                        <span className={item.inSample.metrics.netProfit >= 0 ? "text-green-600" : "text-red-600"}>
                          {formatCurrency(item.inSample.metrics.netProfit)}
                        </span>
                      </TableCell>
                      <TableCell className={getMetricColor("maxDrawdownPercent", item.inSample.metrics.maxDrawdownPercent)}>
                        {formatPercent(item.inSample.metrics.maxDrawdownPercent)}
                      </TableCell>
                      <TableCell className={getMetricColor("degradationPercent", item.degradationPercent)}>
                        {formatPercent(item.degradationPercent)}
                      </TableCell>
                      <TableCell>
                        {item.warnings.length > 0 ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="max-w-xs">
                                  {item.warnings.map((w, i) => (
                                    <div key={i} className="text-sm">{w}</div>
                                  ))}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        )}
                      </TableCell>
                    </TableRow>
                    
                    {/* Linha expandida com detalhes */}
                    {expandedRow === item.combinationId && (
                      <TableRow>
                        <TableCell colSpan={9} className="bg-muted/30 p-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="font-medium mb-2">Parâmetros</div>
                              <div className="grid grid-cols-2 gap-1 text-sm">
                                {Object.entries(item.combination.parameters).map(([key, value]) => (
                                  <div key={key} className="flex justify-between bg-white rounded px-2 py-1">
                                    <span className="text-muted-foreground">{key}:</span>
                                    <span className="font-mono">{String(value)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <div className="font-medium mb-2">Métricas Detalhadas</div>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>Total Trades: {item.inSample.metrics.totalTrades}</div>
                                <div>Expectancy: {formatCurrency(item.inSample.metrics.expectancy || 0)}</div>
                                <div>Avg Win: {formatCurrency(item.inSample.metrics.averageWin || 0)}</div>
                                <div>Avg Loss: {formatCurrency(item.inSample.metrics.averageLoss || 0)}</div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyParameters(item.combination.parameters);
                                }}
                              >
                                <Copy className="w-4 h-4 mr-1" />
                                Copiar Parâmetros
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default OptimizationResultsView;
