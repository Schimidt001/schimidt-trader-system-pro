/**
 * MonteCarloChart - Visualização de Simulações Monte Carlo
 * 
 * Componente para exibir:
 * - Distribuição de equity final
 * - Curvas de equity simuladas
 * - Intervalos de confiança
 * - Probabilidade de ruína
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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  BarChart,
  Bar,
  ReferenceLine,
} from "recharts";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  Shield,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface MonteCarloResult {
  simulations: number;
  seed: number;
  finalEquity: {
    mean: number;
    median: number;
    min: number;
    max: number;
    percentile5: number;
    percentile95: number;
    stdDev: number;
  };
  maxDrawdown: {
    mean: number;
    median: number;
    min: number;
    max: number;
    percentile5: number;
    percentile95: number;
    stdDev: number;
  };
  ruinProbability: number;
  confidenceIntervals: {
    level: number;
    lower: number;
    upper: number;
  };
  equityCurves?: {
    simulationId: number;
    curve: { step: number; equity: number }[];
  }[];
  distribution?: { bucket: number; count: number }[];
}

interface MonteCarloChartProps {
  result: MonteCarloResult;
  initialBalance: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function MonteCarloChart({ result, initialBalance }: MonteCarloChartProps) {
  // Calcular retorno percentual
  const returnPercent = useMemo(() => {
    return ((result.finalEquity.mean - initialBalance) / initialBalance) * 100;
  }, [result.finalEquity.mean, initialBalance]);

  // Preparar dados para gráfico de distribuição
  const distributionData = useMemo(() => {
    if (result.distribution) {
      return result.distribution;
    }
    // Gerar distribuição simulada se não fornecida
    const buckets: { bucket: number; count: number }[] = [];
    const min = result.finalEquity.min;
    const max = result.finalEquity.max;
    const bucketSize = (max - min) / 20;
    
    for (let i = 0; i < 20; i++) {
      const bucketValue = min + bucketSize * i + bucketSize / 2;
      // Aproximar distribuição normal
      const z = (bucketValue - result.finalEquity.mean) / result.finalEquity.stdDev;
      const count = Math.round(result.simulations * Math.exp(-0.5 * z * z) / 10);
      buckets.push({ bucket: bucketValue, count: Math.max(0, count) });
    }
    
    return buckets;
  }, [result]);

  // Preparar dados para curvas de equity (amostra)
  const equityCurveData = useMemo(() => {
    if (!result.equityCurves || result.equityCurves.length === 0) {
      return null;
    }
    
    // Pegar até 50 curvas para visualização
    const sampleCurves = result.equityCurves.slice(0, 50);
    const maxSteps = Math.max(...sampleCurves.map(c => c.curve.length));
    
    const data: any[] = [];
    for (let step = 0; step < maxSteps; step++) {
      const point: any = { step };
      sampleCurves.forEach((curve, idx) => {
        if (curve.curve[step]) {
          point[`sim${idx}`] = curve.curve[step].equity;
        }
      });
      data.push(point);
    }
    
    return data;
  }, [result.equityCurves]);

  // Classificar risco
  const riskLevel = useMemo(() => {
    if (result.ruinProbability < 5) return { level: "BAIXO", color: "text-green-600", bg: "bg-green-100" };
    if (result.ruinProbability < 15) return { level: "MODERADO", color: "text-yellow-600", bg: "bg-yellow-100" };
    if (result.ruinProbability < 30) return { level: "ALTO", color: "text-orange-600", bg: "bg-orange-100" };
    return { level: "MUITO ALTO", color: "text-red-600", bg: "bg-red-100" };
  }, [result.ruinProbability]);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Equity Final */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Equity Final Médio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${result.finalEquity.mean.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <p className={`text-sm ${returnPercent >= 0 ? "text-green-600" : "text-red-600"}`}>
              {returnPercent >= 0 ? "+" : ""}{returnPercent.toFixed(2)}% retorno
            </p>
          </CardContent>
        </Card>

        {/* Drawdown Máximo */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              Drawdown Máximo Médio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {result.maxDrawdown.mean.toFixed(2)}%
            </div>
            <p className="text-sm text-muted-foreground">
              Pior: {result.maxDrawdown.max.toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        {/* Probabilidade de Ruína */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Probabilidade de Ruína
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${riskLevel.color}`}>
              {result.ruinProbability.toFixed(2)}%
            </div>
            <Badge className={`${riskLevel.bg} ${riskLevel.color} border-0`}>
              Risco {riskLevel.level}
            </Badge>
          </CardContent>
        </Card>

        {/* Intervalo de Confiança */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4" />
              IC {result.confidenceIntervals.level}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              <span className="font-bold">
                ${result.confidenceIntervals.lower.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <span className="text-muted-foreground"> - </span>
              <span className="font-bold">
                ${result.confidenceIntervals.upper.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {result.simulations.toLocaleString()} simulações
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Distribution Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Distribuição de Equity Final
          </CardTitle>
          <CardDescription>
            Histograma das equities finais simuladas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={distributionData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="bucket" 
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
              <YAxis />
              <Tooltip 
                formatter={(value: number) => [value, "Simulações"]}
                labelFormatter={(label) => `Equity: $${Number(label).toLocaleString()}`}
              />
              <ReferenceLine 
                x={result.finalEquity.mean} 
                stroke="#22c55e" 
                strokeDasharray="3 3"
                label={{ value: "Média", position: "top" }}
              />
              <ReferenceLine 
                x={result.finalEquity.percentile5} 
                stroke="#ef4444" 
                strokeDasharray="3 3"
                label={{ value: "P5", position: "top" }}
              />
              <ReferenceLine 
                x={result.finalEquity.percentile95} 
                stroke="#3b82f6" 
                strokeDasharray="3 3"
                label={{ value: "P95", position: "top" }}
              />
              <Bar dataKey="count" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Equity Curves (if available) */}
      {equityCurveData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Curvas de Equity Simuladas
            </CardTitle>
            <CardDescription>
              Amostra de {Math.min(50, result.equityCurves?.length || 0)} curvas de equity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={equityCurveData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="step" />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip />
                {Object.keys(equityCurveData[0] || {})
                  .filter(k => k.startsWith("sim"))
                  .slice(0, 50)
                  .map((key, idx) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={`hsl(${(idx * 7) % 360}, 70%, 50%)`}
                      dot={false}
                      strokeWidth={0.5}
                      opacity={0.3}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Statistics Table */}
      <Card>
        <CardHeader>
          <CardTitle>Estatísticas Detalhadas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            {/* Equity Final Stats */}
            <div>
              <h4 className="font-semibold mb-3">Equity Final</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Média:</span>
                  <span className="font-medium">${result.finalEquity.mean.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mediana:</span>
                  <span className="font-medium">${result.finalEquity.median.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Desvio Padrão:</span>
                  <span className="font-medium">${result.finalEquity.stdDev.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mínimo:</span>
                  <span className="font-medium text-red-600">${result.finalEquity.min.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Máximo:</span>
                  <span className="font-medium text-green-600">${result.finalEquity.max.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Percentil 5%:</span>
                  <span className="font-medium">${result.finalEquity.percentile5.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Percentil 95%:</span>
                  <span className="font-medium">${result.finalEquity.percentile95.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Drawdown Stats */}
            <div>
              <h4 className="font-semibold mb-3">Drawdown Máximo</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Média:</span>
                  <span className="font-medium">{result.maxDrawdown.mean.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mediana:</span>
                  <span className="font-medium">{result.maxDrawdown.median.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Desvio Padrão:</span>
                  <span className="font-medium">{result.maxDrawdown.stdDev.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mínimo:</span>
                  <span className="font-medium text-green-600">{result.maxDrawdown.min.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Máximo:</span>
                  <span className="font-medium text-red-600">{result.maxDrawdown.max.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Percentil 5%:</span>
                  <span className="font-medium">{result.maxDrawdown.percentile5.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Percentil 95%:</span>
                  <span className="font-medium">{result.maxDrawdown.percentile95.toFixed(2)}%</span>
                </div>
              </div>
            </div>
          </div>

          <Separator className="my-4" />

          {/* Risk Warning */}
          {result.ruinProbability > 10 && (
            <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <h4 className="font-semibold text-yellow-800 dark:text-yellow-200">
                  Atenção: Risco Elevado
                </h4>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  A probabilidade de ruína de {result.ruinProbability.toFixed(2)}% indica que 
                  existe um risco significativo de perda substancial do capital. 
                  Considere ajustar os parâmetros de risco ou reduzir o tamanho das posições.
                </p>
              </div>
            </div>
          )}

          {/* Seed Info */}
          <div className="mt-4 text-xs text-muted-foreground">
            Seed para reprodutibilidade: {result.seed}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default MonteCarloChart;
