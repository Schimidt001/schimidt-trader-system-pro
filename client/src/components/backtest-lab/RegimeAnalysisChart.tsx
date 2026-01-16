/**
 * RegimeAnalysisChart - Visualização de Análise de Regimes de Mercado
 * 
 * Componente para exibir:
 * - Timeline de regimes detectados
 * - Performance por regime
 * - Distribuição de tempo por regime
 * - Métricas de cada regime
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import React, { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Minus,
  Zap,
  Wind,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

type MarketRegimeType = 
  | "TRENDING_UP" 
  | "TRENDING_DOWN" 
  | "RANGING" 
  | "HIGH_VOLATILITY" 
  | "LOW_VOLATILITY"
  | "UNKNOWN";

interface RegimePeriod {
  regime: MarketRegimeType;
  startDate: Date | string;
  endDate: Date | string;
  confidence: number;
  metrics: {
    avgVolatility: number;
    trendStrength: number;
    avgRange: number;
    duration: number;
  };
}

interface RegimePerformance {
  regime: MarketRegimeType;
  trades: number;
  winRate: number;
  avgProfit: number;
  totalProfit: number;
  sharpeRatio: number;
  profitFactor: number;
}

interface RegimeAnalysisResult {
  symbol: string;
  period: {
    start: Date | string;
    end: Date | string;
  };
  regimes: RegimePeriod[];
  distribution: {
    regime: MarketRegimeType;
    percentOfTime: number;
    totalDays: number;
  }[];
  currentRegime: RegimePeriod | null;
  performanceByRegime?: RegimePerformance[];
}

interface RegimeAnalysisChartProps {
  result: RegimeAnalysisResult;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const REGIME_CONFIG: Record<MarketRegimeType, { 
  label: string; 
  color: string; 
  icon: React.ReactNode;
  bgColor: string;
}> = {
  TRENDING_UP: { 
    label: "Tendência de Alta", 
    color: "#22c55e", 
    icon: <TrendingUp className="w-4 h-4" />,
    bgColor: "bg-green-100 dark:bg-green-950",
  },
  TRENDING_DOWN: { 
    label: "Tendência de Baixa", 
    color: "#ef4444", 
    icon: <TrendingDown className="w-4 h-4" />,
    bgColor: "bg-red-100 dark:bg-red-950",
  },
  RANGING: { 
    label: "Mercado Lateral", 
    color: "#6366f1", 
    icon: <Minus className="w-4 h-4" />,
    bgColor: "bg-indigo-100 dark:bg-indigo-950",
  },
  HIGH_VOLATILITY: { 
    label: "Alta Volatilidade", 
    color: "#f59e0b", 
    icon: <Zap className="w-4 h-4" />,
    bgColor: "bg-amber-100 dark:bg-amber-950",
  },
  LOW_VOLATILITY: { 
    label: "Baixa Volatilidade", 
    color: "#8b5cf6", 
    icon: <Wind className="w-4 h-4" />,
    bgColor: "bg-violet-100 dark:bg-violet-950",
  },
  UNKNOWN: { 
    label: "Desconhecido", 
    color: "#9ca3af", 
    icon: <Activity className="w-4 h-4" />,
    bgColor: "bg-gray-100 dark:bg-gray-950",
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function RegimeAnalysisChart({ result }: RegimeAnalysisChartProps) {
  // Preparar dados para gráfico de pizza (distribuição)
  const distributionData = useMemo(() => {
    return result.distribution.map(d => ({
      name: REGIME_CONFIG[d.regime]?.label || d.regime,
      value: d.percentOfTime,
      days: d.totalDays,
      color: REGIME_CONFIG[d.regime]?.color || "#9ca3af",
    }));
  }, [result.distribution]);

  // Preparar dados para gráfico de barras (performance por regime)
  const performanceData = useMemo(() => {
    if (!result.performanceByRegime) return null;
    
    return result.performanceByRegime.map(p => ({
      regime: REGIME_CONFIG[p.regime]?.label || p.regime,
      winRate: p.winRate,
      profitFactor: p.profitFactor,
      trades: p.trades,
      totalProfit: p.totalProfit,
      color: REGIME_CONFIG[p.regime]?.color || "#9ca3af",
    }));
  }, [result.performanceByRegime]);

  // Calcular estatísticas
  const stats = useMemo(() => {
    const totalRegimes = result.regimes.length;
    const avgDuration = result.regimes.reduce((sum, r) => sum + r.metrics.duration, 0) / totalRegimes || 0;
    const avgConfidence = result.regimes.reduce((sum, r) => sum + r.confidence, 0) / totalRegimes || 0;
    
    return {
      totalRegimes,
      avgDuration,
      avgConfidence,
    };
  }, [result.regimes]);

  // Formatar data
  const formatDate = (date: Date | string) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <div className="space-y-6">
      {/* Header com regime atual */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Análise de Regimes - {result.symbol}
            </span>
            {result.currentRegime && (
              <Badge 
                className={`${REGIME_CONFIG[result.currentRegime.regime]?.bgColor} border-0`}
                style={{ color: REGIME_CONFIG[result.currentRegime.regime]?.color }}
              >
                {REGIME_CONFIG[result.currentRegime.regime]?.icon}
                <span className="ml-1">
                  Regime Atual: {REGIME_CONFIG[result.currentRegime.regime]?.label}
                </span>
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Período: {formatDate(result.period.start)} - {formatDate(result.period.end)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{stats.totalRegimes}</div>
              <div className="text-sm text-muted-foreground">Regimes Detectados</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.avgDuration.toFixed(1)} dias</div>
              <div className="text-sm text-muted-foreground">Duração Média</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.avgConfidence.toFixed(1)}%</div>
              <div className="text-sm text-muted-foreground">Confiança Média</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Distribuição de Tempo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Distribuição de Tempo por Regime</CardTitle>
            <CardDescription>Percentual de tempo em cada regime</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={distributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => `${value.toFixed(1)}%`}
                >
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number, name: string, props: any) => [
                    `${value.toFixed(1)}% (${props.payload.days} dias)`,
                    name
                  ]}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Barras de distribuição */}
        <Card>
          <CardHeader>
            <CardTitle>Detalhamento por Regime</CardTitle>
            <CardDescription>Dias e percentual em cada regime</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {result.distribution.map((d, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {REGIME_CONFIG[d.regime]?.icon}
                      <span className="font-medium">
                        {REGIME_CONFIG[d.regime]?.label || d.regime}
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {d.totalDays} dias ({d.percentOfTime.toFixed(1)}%)
                    </span>
                  </div>
                  <Progress 
                    value={d.percentOfTime} 
                    className="h-2"
                    style={{ 
                      // @ts-ignore
                      "--progress-background": REGIME_CONFIG[d.regime]?.color 
                    }}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance por Regime (se disponível) */}
      {performanceData && (
        <Card>
          <CardHeader>
            <CardTitle>Performance por Regime</CardTitle>
            <CardDescription>Métricas de trading em cada regime de mercado</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="regime" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="winRate" name="Win Rate %" fill="#22c55e" />
                <Bar yAxisId="right" dataKey="profitFactor" name="Profit Factor" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>

            <Separator className="my-4" />

            {/* Tabela de métricas */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Regime</th>
                    <th className="text-right py-2">Trades</th>
                    <th className="text-right py-2">Win Rate</th>
                    <th className="text-right py-2">Profit Factor</th>
                    <th className="text-right py-2">Lucro Total</th>
                  </tr>
                </thead>
                <tbody>
                  {result.performanceByRegime?.map((p, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="py-2 flex items-center gap-2">
                        <span 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: REGIME_CONFIG[p.regime]?.color }}
                        />
                        {REGIME_CONFIG[p.regime]?.label || p.regime}
                      </td>
                      <td className="text-right py-2">{p.trades}</td>
                      <td className="text-right py-2">{p.winRate.toFixed(1)}%</td>
                      <td className="text-right py-2">{p.profitFactor.toFixed(2)}</td>
                      <td className={`text-right py-2 font-medium ${p.totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                        ${p.totalProfit.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline de Regimes */}
      <Card>
        <CardHeader>
          <CardTitle>Timeline de Regimes</CardTitle>
          <CardDescription>Sequência cronológica dos regimes detectados</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {result.regimes.slice(0, 20).map((regime, idx) => (
              <div 
                key={idx}
                className={`p-3 rounded-lg ${REGIME_CONFIG[regime.regime]?.bgColor} flex items-center justify-between`}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="p-2 rounded-full"
                    style={{ backgroundColor: REGIME_CONFIG[regime.regime]?.color + "20" }}
                  >
                    {REGIME_CONFIG[regime.regime]?.icon}
                  </div>
                  <div>
                    <div className="font-medium">
                      {REGIME_CONFIG[regime.regime]?.label || regime.regime}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(regime.startDate)} - {formatDate(regime.endDate)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{regime.metrics.duration} dias</div>
                  <div className="text-sm text-muted-foreground">
                    Confiança: {regime.confidence.toFixed(0)}%
                  </div>
                </div>
              </div>
            ))}
            
            {result.regimes.length > 20 && (
              <div className="text-center text-sm text-muted-foreground py-2">
                ... e mais {result.regimes.length - 20} regimes
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default RegimeAnalysisChart;
