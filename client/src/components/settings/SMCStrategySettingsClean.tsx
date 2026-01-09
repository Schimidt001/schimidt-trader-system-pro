import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Info, AlertTriangle, TrendingUp, Shield, Clock, Target, Zap } from "lucide-react";

/**
 * Lista de símbolos disponíveis para o Swarm
 */
const SWARM_SYMBOLS = [
  { value: "EURUSD", label: "EUR/USD", category: "major" },
  { value: "GBPUSD", label: "GBP/USD", category: "major" },
  { value: "USDJPY", label: "USD/JPY", category: "major" },
  { value: "AUDUSD", label: "AUD/USD", category: "major" },
  { value: "NZDUSD", label: "NZD/USD", category: "major" },
  { value: "USDCAD", label: "USD/CAD", category: "major" },
  { value: "USDCHF", label: "USD/CHF", category: "major" },
  { value: "GBPJPY", label: "GBP/JPY", category: "cross" },
  { value: "EURJPY", label: "EUR/JPY", category: "cross" },
  { value: "EURAUD", label: "EUR/AUD", category: "cross" },
  { value: "EURGBP", label: "EUR/GBP", category: "cross" },
  { value: "XAUUSD", label: "XAU/USD (Ouro)", category: "commodity" },
];

/**
 * Tipos de confirmação de entrada
 */
const ENTRY_CONFIRMATION_TYPES = [
  { value: "ANY", label: "Qualquer (Mais Sinais)", description: "Aceita qualquer candle na direção" },
  { value: "ENGULF", label: "Engolfo (Moderado)", description: "Requer padrão de engolfo" },
  { value: "REJECTION", label: "Rejeição (Conservador)", description: "Requer pavio de rejeição" },
];

/**
 * Props do componente SMCStrategySettingsClean
 * NOTA: Este componente NÃO inclui seletor de estratégia nem botão de salvar
 * Esses elementos são controlados pelo componente pai (SettingsMultiBroker)
 */
interface SMCStrategySettingsCleanProps {
  // Timeframe de Estrutura (Swing Points)
  structureTimeframe: string;
  setStructureTimeframe: (value: string) => void;
  
  // Símbolos ativos
  activeSymbols: string[];
  setActiveSymbols: (symbols: string[]) => void;
  
  // Parâmetros de estrutura
  swingH1Lookback: string;
  setSwingH1Lookback: (value: string) => void;
  fractalLeftBars: string;
  setFractalLeftBars: (value: string) => void;
  fractalRightBars: string;
  setFractalRightBars: (value: string) => void;
  
  // Parâmetros de Sweep
  sweepBufferPips: string;
  setSweepBufferPips: (value: string) => void;
  sweepValidationMinutes: string;
  setSweepValidationMinutes: (value: string) => void;
  
  // Parâmetros de CHoCH
  chochM15Lookback: string;
  setChochM15Lookback: (value: string) => void;
  chochMinPips: string;
  setChochMinPips: (value: string) => void;
  
  // Parâmetros de Order Block
  orderBlockLookback: string;
  setOrderBlockLookback: (value: string) => void;
  orderBlockExtensionPips: string;
  setOrderBlockExtensionPips: (value: string) => void;
  
  // Parâmetros de entrada
  entryConfirmationType: string;
  setEntryConfirmationType: (value: string) => void;
  rejectionWickPercent: string;
  setRejectionWickPercent: (value: string) => void;
  
  // Filtro de Spread
  spreadFilterEnabled: boolean;
  setSpreadFilterEnabled: (enabled: boolean) => void;
  maxSpreadPips: string;
  setMaxSpreadPips: (value: string) => void;
  
  // Gestão de risco - ÚNICA FONTE (Single Source of Truth)
  riskPercentage: string;
  setRiskPercentage: (value: string) => void;
  maxOpenTrades: string;
  setMaxOpenTrades: (value: string) => void;
  dailyLossLimitPercent: string;
  setDailyLossLimitPercent: (value: string) => void;
  stopLossBufferPips: string;
  setStopLossBufferPips: (value: string) => void;
  rewardRiskRatio: string;
  setRewardRiskRatio: (value: string) => void;
  
  // Sessões de trading
  sessionFilterEnabled: boolean;
  setSessionFilterEnabled: (enabled: boolean) => void;
  londonSessionStart: string;
  setLondonSessionStart: (value: string) => void;
  londonSessionEnd: string;
  setLondonSessionEnd: (value: string) => void;
  nySessionStart: string;
  setNySessionStart: (value: string) => void;
  nySessionEnd: string;
  setNySessionEnd: (value: string) => void;
  
  // Trailing Stop
  trailingEnabled: boolean;
  setTrailingEnabled: (enabled: boolean) => void;
  trailingTriggerPips: string;
  setTrailingTriggerPips: (value: string) => void;
  trailingStepPips: string;
  setTrailingStepPips: (value: string) => void;
  
  // Circuit Breaker
  circuitBreakerEnabled: boolean;
  setCircuitBreakerEnabled: (enabled: boolean) => void;
  
  // Logging
  verboseLogging: boolean;
  setVerboseLogging: (enabled: boolean) => void;
}

/**
 * Componente LIMPO de configurações da estratégia SMC (Smart Money Concepts)
 * Versão refatorada sem duplicações - cada campo aparece apenas uma vez
 */
export function SMCStrategySettingsClean({
  structureTimeframe,
  setStructureTimeframe,
  activeSymbols,
  setActiveSymbols,
  swingH1Lookback,
  setSwingH1Lookback,
  fractalLeftBars,
  setFractalLeftBars,
  fractalRightBars,
  setFractalRightBars,
  sweepBufferPips,
  setSweepBufferPips,
  sweepValidationMinutes,
  setSweepValidationMinutes,
  chochM15Lookback,
  setChochM15Lookback,
  chochMinPips,
  setChochMinPips,
  orderBlockLookback,
  setOrderBlockLookback,
  orderBlockExtensionPips,
  setOrderBlockExtensionPips,
  entryConfirmationType,
  setEntryConfirmationType,
  rejectionWickPercent,
  setRejectionWickPercent,
  spreadFilterEnabled,
  setSpreadFilterEnabled,
  maxSpreadPips,
  setMaxSpreadPips,
  riskPercentage,
  setRiskPercentage,
  maxOpenTrades,
  setMaxOpenTrades,
  dailyLossLimitPercent,
  setDailyLossLimitPercent,
  stopLossBufferPips,
  setStopLossBufferPips,
  rewardRiskRatio,
  setRewardRiskRatio,
  sessionFilterEnabled,
  setSessionFilterEnabled,
  londonSessionStart,
  setLondonSessionStart,
  londonSessionEnd,
  setLondonSessionEnd,
  nySessionStart,
  setNySessionStart,
  nySessionEnd,
  setNySessionEnd,
  trailingEnabled,
  setTrailingEnabled,
  trailingTriggerPips,
  setTrailingTriggerPips,
  trailingStepPips,
  setTrailingStepPips,
  circuitBreakerEnabled,
  setCircuitBreakerEnabled,
  verboseLogging,
  setVerboseLogging,
}: SMCStrategySettingsCleanProps) {
  
  // Toggle de símbolo
  const toggleSymbol = (symbol: string) => {
    if (activeSymbols.includes(symbol)) {
      setActiveSymbols(activeSymbols.filter(s => s !== symbol));
    } else {
      setActiveSymbols([...activeSymbols, symbol]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Indicador Visual de Modo SMC Ativo */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 flex items-center gap-3">
        <TrendingUp className="w-5 h-5 text-blue-400" />
        <div>
          <p className="text-sm text-blue-300 font-medium">
            Configurações da Estratégia SMC (Smart Money Concepts)
          </p>
          <p className="text-xs text-slate-400">
            Análise de estrutura de mercado multi-timeframe (H1 → M15 → M5)
          </p>
        </div>
      </div>

      {/* Card de Timeframe de Estrutura */}
      <Card className="bg-slate-900/50 border-slate-800 border-l-4 border-l-amber-500">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-400" />
            <div>
              <CardTitle className="text-white">Timeframe de Estrutura (Swing Points)</CardTitle>
              <CardDescription className="text-slate-400">
                Define em qual gráfico o robô buscará Topos e Fundos para rompimento
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-slate-300">Timeframe Principal</Label>
            <Select value={structureTimeframe} onValueChange={setStructureTimeframe}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="M15">M15 (15 minutos) - Mais Sinais</SelectItem>
                <SelectItem value="M30">M30 (30 minutos) - Equilibrado</SelectItem>
                <SelectItem value="H1">H1 (1 hora) - Padrão Recomendado</SelectItem>
                <SelectItem value="H4">H4 (4 horas) - Mais Conservador</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              O robô identificará Swing Highs/Lows neste timeframe e buscará confirmação em timeframes menores
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Card de Ativos do Enxame */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-cyan-400" />
            <div>
              <CardTitle className="text-white">Ativos Monitorados (Enxame)</CardTitle>
              <CardDescription className="text-slate-400">
                Selecione os pares de moedas que o robô deve monitorar simultaneamente
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Majors */}
          <div>
            <Label className="text-slate-300 text-sm mb-2 block">Pares Principais (Majors)</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {SWARM_SYMBOLS.filter(s => s.category === "major").map((symbol) => {
                const isActive = activeSymbols.includes(symbol.value);
                return (
                  <div
                    key={symbol.value}
                    onClick={() => toggleSymbol(symbol.value)}
                    className={`
                      cursor-pointer px-3 py-2 rounded-lg border text-sm font-mono text-center transition-all
                      ${isActive 
                        ? "bg-cyan-500/20 border-cyan-500 text-cyan-300" 
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                      }
                    `}
                  >
                    {isActive && "✓ "}{symbol.label}
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Crosses */}
          <div>
            <Label className="text-slate-300 text-sm mb-2 block">Pares Cruzados (Crosses)</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {SWARM_SYMBOLS.filter(s => s.category === "cross").map((symbol) => {
                const isActive = activeSymbols.includes(symbol.value);
                return (
                  <div
                    key={symbol.value}
                    onClick={() => toggleSymbol(symbol.value)}
                    className={`
                      cursor-pointer px-3 py-2 rounded-lg border text-sm font-mono text-center transition-all
                      ${isActive 
                        ? "bg-purple-500/20 border-purple-500 text-purple-300" 
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                      }
                    `}
                  >
                    {isActive && "✓ "}{symbol.label}
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Commodities */}
          <div>
            <Label className="text-slate-300 text-sm mb-2 block">Commodities</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {SWARM_SYMBOLS.filter(s => s.category === "commodity").map((symbol) => {
                const isActive = activeSymbols.includes(symbol.value);
                return (
                  <div
                    key={symbol.value}
                    onClick={() => toggleSymbol(symbol.value)}
                    className={`
                      cursor-pointer px-3 py-2 rounded-lg border text-sm font-mono text-center transition-all
                      ${isActive 
                        ? "bg-yellow-500/20 border-yellow-500 text-yellow-300" 
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                      }
                    `}
                  >
                    {isActive && "✓ "}{symbol.label}
                  </div>
                );
              })}
            </div>
          </div>
          
          <p className="text-xs text-slate-500">
            {activeSymbols.length} ativo(s) selecionado(s). Recomendado: 4-6 ativos para diversificação adequada.
          </p>
        </CardContent>
      </Card>

      {/* Card de Gestão de Risco SMC - ÚNICA FONTE */}
      <Card className="bg-slate-900/50 border-slate-800 border-l-4 border-l-red-500">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-red-400" />
            <div>
              <CardTitle className="text-white">Gestão de Risco SMC</CardTitle>
              <CardDescription className="text-slate-400">
                Parâmetros de risco exclusivos para a estratégia SMC
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Risco por Trade (%)</Label>
              <Input
                type="number"
                min="0.1"
                max="5"
                step="0.01"
                value={riskPercentage}
                onChange={(e) => setRiskPercentage(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">Padrão: 0.75%</p>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Máx. Trades Abertos</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={maxOpenTrades}
                onChange={(e) => setMaxOpenTrades(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">Padrão: 3 trades</p>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Limite Perda Diária (%)</Label>
              <Input
                type="number"
                min="1"
                max="10"
                step="0.5"
                value={dailyLossLimitPercent}
                onChange={(e) => setDailyLossLimitPercent(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">Padrão: 3%</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Buffer Stop Loss (Pips)</Label>
              <Input
                type="number"
                min="0"
                max="10"
                step="0.5"
                value={stopLossBufferPips}
                onChange={(e) => setStopLossBufferPips(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">Distância extra do SL além do Order Block</p>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Reward:Risk Ratio</Label>
              <Input
                type="number"
                min="1"
                max="10"
                step="0.5"
                value={rewardRiskRatio}
                onChange={(e) => setRewardRiskRatio(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">Padrão: 4:1 (TP = 4x SL)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card de Parâmetros de Estrutura */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Target className="w-5 h-5 text-purple-400" />
            <div>
              <CardTitle className="text-white">Parâmetros de Estrutura</CardTitle>
              <CardDescription className="text-slate-400">
                Configurações para detecção de Swing Points e Fractais
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Lookback Swing (candles)</Label>
              <Input
                type="number"
                min="20"
                max="200"
                value={swingH1Lookback}
                onChange={(e) => setSwingH1Lookback(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Fractal Left Bars</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={fractalLeftBars}
                onChange={(e) => setFractalLeftBars(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Fractal Right Bars</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={fractalRightBars}
                onChange={(e) => setFractalRightBars(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card de Parâmetros de Sweep e CHoCH */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Parâmetros de Sweep e CHoCH</CardTitle>
          <CardDescription className="text-slate-400">
            Configurações para detecção de Liquidity Sweep e Change of Character
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Sweep Buffer (Pips)</Label>
              <Input
                type="number"
                min="0"
                max="10"
                step="0.5"
                value={sweepBufferPips}
                onChange={(e) => setSweepBufferPips(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Sweep Validation (min)</Label>
              <Input
                type="number"
                min="15"
                max="240"
                value={sweepValidationMinutes}
                onChange={(e) => setSweepValidationMinutes(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">CHoCH M15 Lookback</Label>
              <Input
                type="number"
                min="10"
                max="50"
                value={chochM15Lookback}
                onChange={(e) => setChochM15Lookback(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">CHoCH Min (Pips)</Label>
              <Input
                type="number"
                min="5"
                max="30"
                value={chochMinPips}
                onChange={(e) => setChochMinPips(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card de Order Block e Entrada */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Order Block e Confirmação de Entrada</CardTitle>
          <CardDescription className="text-slate-400">
            Configurações para detecção de Order Blocks e tipo de confirmação
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Order Block Lookback</Label>
              <Input
                type="number"
                min="5"
                max="30"
                value={orderBlockLookback}
                onChange={(e) => setOrderBlockLookback(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">OB Extension (Pips)</Label>
              <Input
                type="number"
                min="5"
                max="30"
                value={orderBlockExtensionPips}
                onChange={(e) => setOrderBlockExtensionPips(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label className="text-slate-300">Tipo de Confirmação de Entrada</Label>
            <Select value={entryConfirmationType} onValueChange={setEntryConfirmationType}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTRY_CONFIRMATION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex flex-col">
                      <span>{type.label}</span>
                      <span className="text-xs text-slate-400">{type.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {entryConfirmationType === "REJECTION" && (
            <div className="space-y-2">
              <Label className="text-slate-300">Rejection Wick (%)</Label>
              <Input
                type="number"
                min="30"
                max="90"
                value={rejectionWickPercent}
                onChange={(e) => setRejectionWickPercent(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">
                Percentual mínimo do pavio em relação ao corpo para considerar rejeição
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card de Filtro de Spread */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Info className="w-5 h-5 text-slate-400" />
              <div>
                <CardTitle className="text-white">Filtro de Spread</CardTitle>
                <CardDescription className="text-slate-400">
                  Evita entradas quando o spread está muito alto
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={spreadFilterEnabled}
              onCheckedChange={setSpreadFilterEnabled}
            />
          </div>
        </CardHeader>
        {spreadFilterEnabled && (
          <CardContent>
            <div className="space-y-2">
              <Label className="text-slate-300">Spread Máximo (Pips)</Label>
              <Input
                type="number"
                min="0.5"
                max="10"
                step="0.5"
                value={maxSpreadPips}
                onChange={(e) => setMaxSpreadPips(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Card de Sessões de Trading */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-slate-400" />
              <div>
                <CardTitle className="text-white">Filtro de Sessões</CardTitle>
                <CardDescription className="text-slate-400">
                  Opera apenas durante sessões de alta liquidez
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={sessionFilterEnabled}
              onCheckedChange={setSessionFilterEnabled}
            />
          </div>
        </CardHeader>
        {sessionFilterEnabled && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Sessão Londres - Início</Label>
                <Input
                  type="time"
                  value={londonSessionStart}
                  onChange={(e) => setLondonSessionStart(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Sessão Londres - Fim</Label>
                <Input
                  type="time"
                  value={londonSessionEnd}
                  onChange={(e) => setLondonSessionEnd(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Sessão NY - Início</Label>
                <Input
                  type="time"
                  value={nySessionStart}
                  onChange={(e) => setNySessionStart(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Sessão NY - Fim</Label>
                <Input
                  type="time"
                  value={nySessionEnd}
                  onChange={(e) => setNySessionEnd(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Card de Trailing Stop */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-green-400" />
              <div>
                <CardTitle className="text-white">Trailing Stop</CardTitle>
                <CardDescription className="text-slate-400">
                  Move o stop loss automaticamente para proteger lucros
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={trailingEnabled}
              onCheckedChange={setTrailingEnabled}
            />
          </div>
        </CardHeader>
        {trailingEnabled && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Trigger (Pips)</Label>
                <Input
                  type="number"
                  min="5"
                  max="50"
                  value={trailingTriggerPips}
                  onChange={(e) => setTrailingTriggerPips(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
                <p className="text-xs text-slate-500">Lucro mínimo para ativar trailing</p>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Step (Pips)</Label>
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={trailingStepPips}
                  onChange={(e) => setTrailingStepPips(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
                <p className="text-xs text-slate-500">Distância do SL ao preço atual</p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Card de Opções Avançadas */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Opções Avançadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
            <div>
              <Label className="text-slate-300">Circuit Breaker</Label>
              <p className="text-xs text-slate-500">Para o bot após atingir limite de perda diária</p>
            </div>
            <Switch
              checked={circuitBreakerEnabled}
              onCheckedChange={setCircuitBreakerEnabled}
            />
          </div>
          <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
            <div>
              <Label className="text-slate-300">Verbose Logging</Label>
              <p className="text-xs text-slate-500">Logs detalhados para debugging</p>
            </div>
            <Switch
              checked={verboseLogging}
              onCheckedChange={setVerboseLogging}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
