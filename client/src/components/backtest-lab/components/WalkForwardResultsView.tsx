/**
 * WalkForwardResultsView - Visualização de Resultados Walk-Forward
 * 
 * Exibe os resultados de validação Walk-Forward:
 * - Curva concatenada OOS (Out-of-Sample)
 * - Tabela por janela temporal
 * - Stability Score visível
 * - Métricas de robustez
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import React, { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
  ReferenceLine,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Shield,
  Target,
  Calendar,
  BarChart3,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface WindowResult {
  windowIndex: number;
  inSamplePeriod: {
    start: Date;
    end: Date;
  };
  outSamplePeriod: {
    start: Date;
    end: Date;
  };
  inSampleMetrics: {
    netProfit: number;
    totalTrades: number;
    winRate: number;
    sharpeRatio: number;
    maxDrawdownPercent: number;
    profitFactor: number;
  };
  outSampleMetrics: {
    netProfit: number;
    totalTrades: number;
    winRate: number;
    sharpeRatio: number;
    maxDrawdownPercent: number;
    profitFactor: number;
  };
  degradationPercent: number;
  isRobust: boolean;
}

interface WalkForwardResult {
  symbol: string;
  parameters: Record<string, number | string | boolean>;
  windows: WindowResult[];
  concatenatedEquityCurve: { timestamp: number; equity: number }[];
  aggregatedMetrics: {
    totalNetProfit: number;
    totalTrades: number;
    overallWinRate: number;
    averageSharpe: number;
    maxDrawdown: number;
    averageProfitFactor: number;
  };
  stabilityScore: number;
  isRobust: boolean;
  confidence: number;
  warnings: string[];
}

interface WalkForwardResultsViewProps {
  result: WalkForwardResult;
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

const formatDate = (date: Date | string): string => {
  const d = new Date(date);
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
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
    case "stabilityScore":
      return value >= 70 ? "text-green-600" : value >= 50 ? "text-yellow-600" : "text-red-600";
    default:
      return "";
  }
};

// ============================================================================
// COMPONENT
// ============================================================================

export function WalkForwardResultsView({ result }: WalkForwardResultsViewProps) {
  // Preparar dados para o gráfico de equity
  const equityChartData = useMemo(() => {
    if (!result.concatenatedEquityCurve || result.concatenatedEquityCurve.length === 0) {
      return [];
    }
    
    return result.concatenatedEquityCurve.map((point, index) => ({
      index,
      timestamp: new Date(point.timestamp).toLocaleDateString('pt-BR'),
      equity: point.equity,
    }));
  }, [result.concatenatedEquityCurve]);

  // Preparar dados para o gráfico de janelas
  const windowsChartData = useMemo(() => {
    return result.windows.map((window) => ({
      window: `W${window.windowIndex + 1}`,
      period: `${formatDate(window.outSamplePeriod.start)} - ${formatDate(window.outSamplePeriod.end)}`,
      inSampleProfit: window.inSampleMetrics.netProfit,
      outSampleProfit: window.outSampleMetrics.netProfit,
      degradation: window.degradationPercent,
      isRobust: window.isRobust,
    }));
  }, [result.windows]);

  // Contar janelas robustas
  const robustWindowsCount = result.windows.filter(w => w.isRobust).length;
  const robustWindowsPercent = (robustWindowsCount / result.windows.length) * 100;

  return (
    <div className="space-y-6">
      {/* Resumo */}
      <Card className={result.isRobust ? "border-green-200 bg-green-50/50" : "border-amber-200 bg-amber-50/50"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Validação Walk-Forward - {result.symbol}
            {result.isRobust ? (
              <Badge variant="default" className="bg-green-600">ROBUSTO</Badge>
            ) : (
              <Badge variant="destructive">NÃO ROBUSTO</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {result.windows.length} janelas temporais analisadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white rounded-lg p-4 text-center border">
              <div className={`text-2xl font-bold ${getMetricColor("stabilityScore", result.stabilityScore)}`}>
                {formatNumber(result.stabilityScore, 0)}%
              </div>
              <div className="text-sm text-muted-foreground">Stability Score</div>
              <Progress value={result.stabilityScore} className="mt-2 h-2" />
            </div>
            <div className="bg-white rounded-lg p-4 text-center border">
              <div className="text-2xl font-bold text-primary">
                {formatNumber(result.confidence, 0)}%
              </div>
              <div className="text-sm text-muted-foreground">Confiança</div>
            </div>
            <div className="bg-white rounded-lg p-4 text-center border">
              <div className="text-2xl font-bold">
                {robustWindowsCount}/{result.windows.length}
              </div>
              <div className="text-sm text-muted-foreground">Janelas Robustas</div>
              <Progress value={robustWindowsPercent} className="mt-2 h-2" />
            </div>
            <div className="bg-white rounded-lg p-4 text-center border">
              <div className={`text-2xl font-bold ${result.aggregatedMetrics.totalNetProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(result.aggregatedMetrics.totalNetProfit)}
              </div>
              <div className="text-sm text-muted-foreground">Lucro Total OOS</div>
            </div>
            <div className="bg-white rounded-lg p-4 text-center border">
              <div className="text-2xl font-bold">
                {result.aggregatedMetrics.totalTrades}
              </div>
              <div className="text-sm text-muted-foreground">Total Trades OOS</div>
            </div>
          </div>

          {/* Métricas Agregadas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-sm text-muted-foreground">Sharpe Médio</div>
              <div className={`text-lg font-bold ${getMetricColor("sharpeRatio", result.aggregatedMetrics.averageSharpe)}`}>
                {formatNumber(result.aggregatedMetrics.averageSharpe)}
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-sm text-muted-foreground">Profit Factor Médio</div>
              <div className={`text-lg font-bold ${getMetricColor("profitFactor", result.aggregatedMetrics.averageProfitFactor)}`}>
                {formatNumber(result.aggregatedMetrics.averageProfitFactor)}
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-sm text-muted-foreground">Win Rate Geral</div>
              <div className={`text-lg font-bold ${getMetricColor("winRate", result.aggregatedMetrics.overallWinRate)}`}>
                {formatPercent(result.aggregatedMetrics.overallWinRate)}
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-sm text-muted-foreground">Max Drawdown</div>
              <div className={`text-lg font-bold ${getMetricColor("maxDrawdownPercent", result.aggregatedMetrics.maxDrawdown)}`}>
                {formatPercent(result.aggregatedMetrics.maxDrawdown)}
              </div>
            </div>
          </div>

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="mt-4 space-y-2">
              {result.warnings.map((warning, i) => (
                <Alert key={i} variant="default">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{warning}</AlertDescription>
                </Alert>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gráfico de Equity Concatenada */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Curva de Equity Concatenada (Out-of-Sample)
          </CardTitle>
          <CardDescription>
            Equity resultante de todas as janelas OOS concatenadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {equityChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={equityChartData}>
                <defs>
                  <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="timestamp" 
                  tick={{ fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(1)}k`}
                />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), "Equity"]}
                  labelFormatter={(label) => `Data: ${label}`}
                />
                <ReferenceLine 
                  y={10000} 
                  stroke="#666" 
                  strokeDasharray="3 3" 
                  label={{ value: "Capital Inicial", position: "right", fontSize: 10 }}
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke="#22c55e"
                  strokeWidth={2}
                  fill="url(#equityGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              Dados de equity não disponíveis
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela de Janelas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Análise por Janela Temporal
          </CardTitle>
          <CardDescription>
            Comparação In-Sample vs Out-of-Sample para cada janela
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Janela</TableHead>
                  <TableHead>Período OOS</TableHead>
                  <TableHead className="text-right">Lucro IS</TableHead>
                  <TableHead className="text-right">Lucro OOS</TableHead>
                  <TableHead className="text-right">Sharpe IS</TableHead>
                  <TableHead className="text-right">Sharpe OOS</TableHead>
                  <TableHead className="text-right">Degradação</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.windows.map((window) => (
                  <TableRow 
                    key={window.windowIndex}
                    className={window.isRobust ? "" : "bg-red-50"}
                  >
                    <TableCell className="font-medium">
                      W{window.windowIndex + 1}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(window.outSamplePeriod.start)} - {formatDate(window.outSamplePeriod.end)}
                    </TableCell>
                    <TableCell className={`text-right ${window.inSampleMetrics.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(window.inSampleMetrics.netProfit)}
                    </TableCell>
                    <TableCell className={`text-right ${window.outSampleMetrics.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(window.outSampleMetrics.netProfit)}
                    </TableCell>
                    <TableCell className={`text-right ${getMetricColor("sharpeRatio", window.inSampleMetrics.sharpeRatio)}`}>
                      {formatNumber(window.inSampleMetrics.sharpeRatio)}
                    </TableCell>
                    <TableCell className={`text-right ${getMetricColor("sharpeRatio", window.outSampleMetrics.sharpeRatio)}`}>
                      {formatNumber(window.outSampleMetrics.sharpeRatio)}
                    </TableCell>
                    <TableCell className={`text-right ${getMetricColor("degradationPercent", window.degradationPercent)}`}>
                      {formatPercent(window.degradationPercent)}
                    </TableCell>
                    <TableCell className="text-center">
                      {window.isRobust ? (
                        <CheckCircle className="w-5 h-5 text-green-600 inline" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-red-600 inline" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Gráfico de Comparação por Janela */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Comparação In-Sample vs Out-of-Sample
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={windowsChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="window" />
              <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(1)}k`} />
              <Tooltip 
                formatter={(value: number, name: string) => [
                  formatCurrency(value), 
                  name === "inSampleProfit" ? "In-Sample" : "Out-of-Sample"
                ]}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="inSampleProfit" 
                stroke="#3b82f6" 
                strokeWidth={2}
                name="In-Sample"
                dot={{ r: 4 }}
              />
              <Line 
                type="monotone" 
                dataKey="outSampleProfit" 
                stroke="#8b5cf6" 
                strokeWidth={2}
                name="Out-of-Sample"
                dot={{ r: 4 }}
              />
              <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

export default WalkForwardResultsView;
