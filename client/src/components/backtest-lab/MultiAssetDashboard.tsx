/**
 * MultiAssetDashboard - Dashboard de Backtest Multi-Asset
 * 
 * Componente para exibir:
 * - Métricas de portfólio consolidadas
 * - Performance por ativo
 * - Matriz de correlação
 * - Curva de equity do portfólio
 * - Análise de diversificação
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import React, { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  PieChart as PieChartIcon,
  BarChart3,
  Target,
  Shield,
  Layers,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface AssetMetrics {
  symbol: string;
  trades: number;
  winRate: number;
  profitFactor: number;
  totalProfit: number;
  avgProfit: number;
  sharpeRatio: number;
  maxDrawdown: number;
  contribution: number;
  weight: number;
}

interface PortfolioMetrics {
  totalReturn: number;
  annualizedReturn: number;
  avgDailyReturn: number;
  volatility: number;
  annualizedVolatility: number;
  maxDrawdown: number;
  avgDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  informationRatio: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  assetMetrics: AssetMetrics[];
  diversificationRatio: number;
  correlationImpact: number;
}

interface CorrelationAnalysis {
  finalMatrix: number[][];
  symbols: string[];
  diversificationScore: number;
}

interface RiskAnalysis {
  violations: { timestamp: number; type: string; message: string }[];
  maxDailyDrawdown: number;
  maxTotalExposure: number;
}

interface MultiAssetResult {
  portfolioMetrics: PortfolioMetrics;
  allTrades: any[];
  equityCurve: { timestamp: number; equity: number }[];
  correlationAnalysis: CorrelationAnalysis;
  riskAnalysis: RiskAnalysis;
  executionTime: number;
  seed: number;
}

interface MultiAssetDashboardProps {
  result: MultiAssetResult;
  initialBalance: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
];

// ============================================================================
// COMPONENT
// ============================================================================

export function MultiAssetDashboard({ result, initialBalance }: MultiAssetDashboardProps) {
  const { portfolioMetrics, equityCurve, correlationAnalysis, riskAnalysis } = result;

  // Preparar dados da curva de equity
  const equityData = useMemo(() => {
    return equityCurve.map((point, idx) => ({
      index: idx,
      equity: point.equity,
      date: new Date(point.timestamp).toLocaleDateString("pt-BR"),
    }));
  }, [equityCurve]);

  // Preparar dados de contribuição por ativo
  const contributionData = useMemo(() => {
    return portfolioMetrics.assetMetrics.map((asset, idx) => ({
      name: asset.symbol,
      value: Math.abs(asset.contribution),
      profit: asset.totalProfit,
      color: COLORS[idx % COLORS.length],
    }));
  }, [portfolioMetrics.assetMetrics]);

  // Preparar dados para radar de métricas
  const radarData = useMemo(() => {
    return portfolioMetrics.assetMetrics.map(asset => ({
      symbol: asset.symbol,
      winRate: asset.winRate,
      profitFactor: Math.min(asset.profitFactor * 20, 100), // Normalizar para 0-100
      sharpe: Math.min((asset.sharpeRatio + 2) * 25, 100), // Normalizar para 0-100
      trades: Math.min(asset.trades / 2, 100), // Normalizar
    }));
  }, [portfolioMetrics.assetMetrics]);

  // Classificar performance
  const performanceLevel = useMemo(() => {
    const sharpe = portfolioMetrics.sharpeRatio;
    if (sharpe >= 2) return { level: "EXCELENTE", color: "text-green-600", bg: "bg-green-100" };
    if (sharpe >= 1) return { level: "BOM", color: "text-blue-600", bg: "bg-blue-100" };
    if (sharpe >= 0.5) return { level: "MODERADO", color: "text-yellow-600", bg: "bg-yellow-100" };
    return { level: "FRACO", color: "text-red-600", bg: "bg-red-100" };
  }, [portfolioMetrics.sharpeRatio]);

  // Formatar matriz de correlação para exibição
  const correlationDisplay = useMemo(() => {
    const { finalMatrix, symbols } = correlationAnalysis;
    const data: { row: string; [key: string]: string | number }[] = [];
    
    symbols.forEach((symbol, i) => {
      const row: { row: string; [key: string]: string | number } = { row: symbol };
      symbols.forEach((s, j) => {
        row[s] = finalMatrix[i]?.[j]?.toFixed(2) || "0.00";
      });
      data.push(row);
    });
    
    return data;
  }, [correlationAnalysis]);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Retorno Total */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Retorno Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${portfolioMetrics.totalReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
              {portfolioMetrics.totalReturn >= 0 ? "+" : ""}{portfolioMetrics.totalReturn.toFixed(2)}%
            </div>
            <p className="text-sm text-muted-foreground">
              Anualizado: {portfolioMetrics.annualizedReturn.toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        {/* Sharpe Ratio */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4" />
              Sharpe Ratio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {portfolioMetrics.sharpeRatio.toFixed(2)}
            </div>
            <Badge className={`${performanceLevel.bg} ${performanceLevel.color} border-0`}>
              {performanceLevel.level}
            </Badge>
          </CardContent>
        </Card>

        {/* Max Drawdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              Max Drawdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {portfolioMetrics.maxDrawdown.toFixed(2)}%
            </div>
            <p className="text-sm text-muted-foreground">
              Médio: {portfolioMetrics.avgDrawdown.toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        {/* Diversificação */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Diversificação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {portfolioMetrics.diversificationRatio.toFixed(1)}%
            </div>
            <p className="text-sm text-muted-foreground">
              Score: {correlationAnalysis.diversificationScore.toFixed(1)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs para diferentes visualizações */}
      <Tabs defaultValue="equity">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="equity">
            <Activity className="w-4 h-4 mr-2" />
            Equity
          </TabsTrigger>
          <TabsTrigger value="assets">
            <BarChart3 className="w-4 h-4 mr-2" />
            Ativos
          </TabsTrigger>
          <TabsTrigger value="correlation">
            <PieChartIcon className="w-4 h-4 mr-2" />
            Correlação
          </TabsTrigger>
          <TabsTrigger value="risk">
            <Shield className="w-4 h-4 mr-2" />
            Risco
          </TabsTrigger>
          <TabsTrigger value="metrics">
            <Target className="w-4 h-4 mr-2" />
            Métricas
          </TabsTrigger>
        </TabsList>

        {/* Equity Curve Tab */}
        <TabsContent value="equity">
          <Card>
            <CardHeader>
              <CardTitle>Curva de Equity do Portfólio</CardTitle>
              <CardDescription>
                Evolução do capital ao longo do tempo
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={equityData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis 
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip 
                    formatter={(value: number) => [`$${value.toLocaleString()}`, "Equity"]}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="equity" 
                    stroke="#22c55e" 
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Assets Tab */}
        <TabsContent value="assets">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Contribuição por Ativo */}
            <Card>
              <CardHeader>
                <CardTitle>Contribuição por Ativo</CardTitle>
                <CardDescription>Percentual de lucro por símbolo</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={contributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value.toFixed(1)}%`}
                    >
                      {contributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Performance por Ativo */}
            <Card>
              <CardHeader>
                <CardTitle>Performance por Ativo</CardTitle>
                <CardDescription>Win Rate e Profit Factor</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={portfolioMetrics.assetMetrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="symbol" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="winRate" name="Win Rate %" fill="#22c55e" />
                    <Bar yAxisId="right" dataKey="profitFactor" name="Profit Factor" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Tabela de Métricas por Ativo */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Métricas Detalhadas por Ativo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Símbolo</th>
                      <th className="text-right py-2">Trades</th>
                      <th className="text-right py-2">Win Rate</th>
                      <th className="text-right py-2">Profit Factor</th>
                      <th className="text-right py-2">Sharpe</th>
                      <th className="text-right py-2">Max DD</th>
                      <th className="text-right py-2">Lucro</th>
                      <th className="text-right py-2">Contribuição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolioMetrics.assetMetrics.map((asset, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="py-2 font-medium">{asset.symbol}</td>
                        <td className="text-right py-2">{asset.trades}</td>
                        <td className="text-right py-2">{asset.winRate.toFixed(1)}%</td>
                        <td className="text-right py-2">{asset.profitFactor.toFixed(2)}</td>
                        <td className="text-right py-2">{asset.sharpeRatio.toFixed(2)}</td>
                        <td className="text-right py-2 text-orange-600">{asset.maxDrawdown.toFixed(1)}%</td>
                        <td className={`text-right py-2 font-medium ${asset.totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                          ${asset.totalProfit.toLocaleString()}
                        </td>
                        <td className="text-right py-2">{asset.contribution.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Correlation Tab */}
        <TabsContent value="correlation">
          <Card>
            <CardHeader>
              <CardTitle>Matriz de Correlação</CardTitle>
              <CardDescription>
                Correlação entre os retornos dos ativos (Score de Diversificação: {correlationAnalysis.diversificationScore.toFixed(1)})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2"></th>
                      {correlationAnalysis.symbols.map(s => (
                        <th key={s} className="text-center py-2 px-3">{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {correlationDisplay.map((row, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="py-2 font-medium">{row.row}</td>
                        {correlationAnalysis.symbols.map((s, j) => {
                          const value = parseFloat(row[s] as string);
                          const bgColor = value === 1 
                            ? "bg-gray-100" 
                            : value > 0.7 
                              ? "bg-red-100" 
                              : value > 0.3 
                                ? "bg-yellow-100" 
                                : value < -0.3 
                                  ? "bg-blue-100" 
                                  : "bg-green-100";
                          return (
                            <td 
                              key={s} 
                              className={`text-center py-2 px-3 ${bgColor}`}
                            >
                              {row[s]}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-100 rounded" />
                  <span>Alta correlação (&gt;0.7)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-100 rounded" />
                  <span>Moderada (0.3-0.7)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-100 rounded" />
                  <span>Baixa (&lt;0.3)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-100 rounded" />
                  <span>Negativa (&lt;-0.3)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Risk Tab */}
        <TabsContent value="risk">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Análise de Risco</CardTitle>
                <CardDescription>Métricas de risco do portfólio</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Max Drawdown Diário</span>
                    <span className="font-bold text-orange-600">
                      {riskAnalysis.maxDailyDrawdown.toFixed(2)}%
                    </span>
                  </div>
                  <Progress value={Math.min(riskAnalysis.maxDailyDrawdown * 10, 100)} className="h-2" />
                  
                  <Separator />
                  
                  <div className="flex justify-between items-center">
                    <span>Max Exposição Total</span>
                    <span className="font-bold">
                      {riskAnalysis.maxTotalExposure.toFixed(2)}%
                    </span>
                  </div>
                  <Progress value={Math.min(riskAnalysis.maxTotalExposure, 100)} className="h-2" />
                  
                  <Separator />
                  
                  <div className="flex justify-between items-center">
                    <span>Violações de Risco</span>
                    <Badge variant={riskAnalysis.violations.length === 0 ? "default" : "destructive"}>
                      {riskAnalysis.violations.length}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ratios de Risco-Retorno</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Sharpe Ratio</span>
                    <span className="font-bold">{portfolioMetrics.sharpeRatio.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Sortino Ratio</span>
                    <span className="font-bold">{portfolioMetrics.sortinoRatio.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Calmar Ratio</span>
                    <span className="font-bold">{portfolioMetrics.calmarRatio.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Volatilidade Anualizada</span>
                    <span className="font-bold">{portfolioMetrics.annualizedVolatility.toFixed(2)}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Violações de Risco */}
          {riskAnalysis.violations.length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-600">
                  <AlertTriangle className="w-5 h-5" />
                  Violações de Risco Detectadas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {riskAnalysis.violations.slice(0, 10).map((v, idx) => (
                    <div key={idx} className="p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{v.type}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {new Date(v.timestamp).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-sm mt-1">{v.message}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Metrics Tab */}
        <TabsContent value="metrics">
          <Card>
            <CardHeader>
              <CardTitle>Métricas Completas do Portfólio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <h4 className="font-semibold mb-3">Retorno</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total:</span>
                      <span className="font-medium">{portfolioMetrics.totalReturn.toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Anualizado:</span>
                      <span className="font-medium">{portfolioMetrics.annualizedReturn.toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Diário Médio:</span>
                      <span className="font-medium">{(portfolioMetrics.avgDailyReturn * 100).toFixed(4)}%</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Risco</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Volatilidade:</span>
                      <span className="font-medium">{portfolioMetrics.annualizedVolatility.toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Max DD:</span>
                      <span className="font-medium">{portfolioMetrics.maxDrawdown.toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">DD Médio:</span>
                      <span className="font-medium">{portfolioMetrics.avgDrawdown.toFixed(2)}%</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Trading</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Trades:</span>
                      <span className="font-medium">{portfolioMetrics.totalTrades}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Win Rate:</span>
                      <span className="font-medium">{portfolioMetrics.winRate.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Profit Factor:</span>
                      <span className="font-medium">{portfolioMetrics.profitFactor.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Expectancy:</span>
                      <span className="font-medium">${portfolioMetrics.expectancy.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Ratios</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sharpe:</span>
                      <span className="font-medium">{portfolioMetrics.sharpeRatio.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sortino:</span>
                      <span className="font-medium">{portfolioMetrics.sortinoRatio.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Calmar:</span>
                      <span className="font-medium">{portfolioMetrics.calmarRatio.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Information:</span>
                      <span className="font-medium">{portfolioMetrics.informationRatio.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <Separator className="my-6" />

              <div className="text-xs text-muted-foreground">
                Tempo de execução: {result.executionTime.toFixed(2)}s | Seed: {result.seed}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default MultiAssetDashboard;
