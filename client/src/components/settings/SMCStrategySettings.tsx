import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
import { Loader2, Info, AlertTriangle, TrendingUp, Shield, Clock, Target } from "lucide-react";
import { useState, useEffect } from "react";

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

interface SMCStrategySettingsProps {
  // Tipo de estratégia
  strategyType: string;
  setStrategyType: (type: string) => void;
  
  // Timeframe de Estrutura (Swing Points) - NOVO
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
  
  // Gestão de risco
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
  
  // Callbacks
  onSave: () => void;
  isSaving: boolean;
}

/**
 * Componente de configurações da estratégia SMC (Smart Money Concepts)
 * Permite configurar todos os parâmetros da estratégia SMC Swarm
 */
export function SMCStrategySettings({
  strategyType,
  setStrategyType,
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
  onSave,
  isSaving,
}: SMCStrategySettingsProps) {
  
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
      {/* Card de Seleção de Estratégia */}
      <Card className="bg-slate-900/50 border-slate-800 border-l-4 border-l-purple-500">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧠</span>
            <div>
              <CardTitle className="text-white">Estratégia Operacional</CardTitle>
              <CardDescription className="text-slate-400">
                Selecione a estratégia de trading para IC Markets
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-slate-300">Tipo de Estratégia</Label>
            <Select value={strategyType} onValueChange={setStrategyType}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SMC_SWARM">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">NOVO</Badge>
                    SMC Swarm (Smart Money Concepts)
                  </div>
                </SelectItem>
                <SelectItem value="TREND_SNIPER">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-slate-500/20 text-slate-300 border-slate-500/30">LEGADO</Badge>
                    Trend Sniper (EMA + RSI)
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {strategyType === "SMC_SWARM" && (
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
              <p className="text-sm text-purple-300">
                <strong>SMC Swarm:</strong> Estratégia baseada em Price Action Estrutural. 
                Identifica padrões de manipulação institucional usando análise multi-timeframe (H1 → M15 → M5).
              </p>
            </div>
          )}
          
          {strategyType === "TREND_SNIPER" && (
            <div className="bg-slate-500/10 border border-slate-500/30 rounded-lg p-3">
              <p className="text-sm text-slate-300">
                <strong>Trend Sniper:</strong> Estratégia clássica baseada em EMA 200 + RSI 14. 
                Identifica entradas em tendência com confirmação de momentum.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mostrar configurações SMC apenas se SMC_SWARM estiver selecionado */}
      {strategyType === "SMC_SWARM" && (
        <>
          {/* Card de Timeframe de Estrutura (Swing Points) - NOVO */}
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
                <Label className="text-slate-300">Timeframe para Swing Points</Label>
                <Select value={structureTimeframe} onValueChange={setStructureTimeframe}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="H1">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-500/20 text-green-300 border-green-500/30">CONSERVADOR</Badge>
                        H1 - Horário (Menos sinais, maior precisão)
                      </div>
                    </SelectItem>
                    <SelectItem value="M15">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">AGRESSIVO</Badge>
                        M15 - 15 Minutos (Mais sinais, maior volume)
                      </div>
                    </SelectItem>
                    <SelectItem value="M5">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-red-500/20 text-red-300 border-red-500/30">SCALPER</Badge>
                        M5 - 5 Minutos (Máximo de sinais, operações rápidas)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {structureTimeframe === "H1" && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                  <p className="text-sm text-green-300">
                    <strong>H1 (Conservador):</strong> Identifica topos e fundos no gráfico de 1 hora. 
                    Menos oportunidades, mas com maior probabilidade de sucesso.
                  </p>
                </div>
              )}
              
              {structureTimeframe === "M15" && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                  <p className="text-sm text-amber-300">
                    <strong>M15 (Agressivo):</strong> Identifica topos e fundos no gráfico de 15 minutos. 
                    Mais oportunidades de entrada com bom equilíbrio risco/retorno.
                  </p>
                </div>
              )}
              
              {structureTimeframe === "M5" && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <p className="text-sm text-red-300">
                    <strong>M5 (Scalper):</strong> Identifica topos e fundos no gráfico de 5 minutos. 
                    Máximo de sinais para scalping. Requer atenção ao spread.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card de Seleção de Ativos (Swarm) */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Target className="w-5 h-5 text-blue-400" />
                <div>
                  <CardTitle className="text-white">Ativos Monitorados (Swarm)</CardTitle>
                  <CardDescription className="text-slate-400">
                    Selecione os pares que o robô irá monitorar simultaneamente
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Majors */}
                <div>
                  <Label className="text-slate-300 text-sm mb-2 block">Pares Principais (Majors)</Label>
                  <div className="flex flex-wrap gap-2">
                    {SWARM_SYMBOLS.filter(s => s.category === "major").map((symbol) => (
                      <div
                        key={symbol.value}
                        onClick={() => toggleSymbol(symbol.value)}
                        className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
                          activeSymbols.includes(symbol.value)
                            ? "bg-blue-500/20 border border-blue-500/50 text-blue-300"
                            : "bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-600"
                        }`}
                      >
                        {symbol.label}
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Crosses */}
                <div>
                  <Label className="text-slate-300 text-sm mb-2 block">Pares Cruzados (Crosses)</Label>
                  <div className="flex flex-wrap gap-2">
                    {SWARM_SYMBOLS.filter(s => s.category === "cross").map((symbol) => (
                      <div
                        key={symbol.value}
                        onClick={() => toggleSymbol(symbol.value)}
                        className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
                          activeSymbols.includes(symbol.value)
                            ? "bg-green-500/20 border border-green-500/50 text-green-300"
                            : "bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-600"
                        }`}
                      >
                        {symbol.label}
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Commodities */}
                <div>
                  <Label className="text-slate-300 text-sm mb-2 block">Commodities</Label>
                  <div className="flex flex-wrap gap-2">
                    {SWARM_SYMBOLS.filter(s => s.category === "commodity").map((symbol) => (
                      <div
                        key={symbol.value}
                        onClick={() => toggleSymbol(symbol.value)}
                        className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
                          activeSymbols.includes(symbol.value)
                            ? "bg-yellow-500/20 border border-yellow-500/50 text-yellow-300"
                            : "bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-600"
                        }`}
                      >
                        {symbol.label}
                      </div>
                    ))}
                  </div>
                </div>
                
                <p className="text-xs text-slate-500">
                  {activeSymbols.length} ativo(s) selecionado(s). Recomendado: 4-8 ativos para melhor performance.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Card de Gestão de Risco */}
          <Card className="bg-slate-900/50 border-slate-800 border-l-4 border-l-red-500">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-red-400" />
                <div>
                  <CardTitle className="text-white">Gestão de Capital</CardTitle>
                  <CardDescription className="text-slate-400">
                    Configure o risco por trade e limites de proteção
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">% de Risco por Trade</Label>
                  <Input
                    type="number"
                    step="0.25"
                    min="0.25"
                    max="5"
                    value={riskPercentage}
                    onChange={(e) => setRiskPercentage(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                  <p className="text-xs text-slate-500">Padrão: 0.75%</p>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-slate-300">Máx. Trades Simultâneos</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={maxOpenTrades}
                    onChange={(e) => setMaxOpenTrades(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                  <p className="text-xs text-slate-500">Padrão: 3</p>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-slate-300">Limite de Perda Diária (%)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="1"
                    max="10"
                    value={dailyLossLimitPercent}
                    onChange={(e) => setDailyLossLimitPercent(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                  <p className="text-xs text-slate-500">Padrão: 3%</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Buffer do Stop Loss (Pips)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    max="10"
                    value={stopLossBufferPips}
                    onChange={(e) => setStopLossBufferPips(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                  <p className="text-xs text-slate-500">Distância extra acima/abaixo do swing</p>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-slate-300">Risk:Reward Ratio</Label>
                  <Select value={rewardRiskRatio} onValueChange={setRewardRiskRatio}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">1:2 (Conservador)</SelectItem>
                      <SelectItem value="3">1:3 (Moderado)</SelectItem>
                      <SelectItem value="4">1:4 (Agressivo)</SelectItem>
                      <SelectItem value="5">1:5 (Muito Agressivo)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">Padrão: 1:4</p>
                </div>
              </div>
              
              {/* Circuit Breaker */}
              <div className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="space-y-0.5">
                  <Label className="text-red-300">Circuit Breaker</Label>
                  <p className="text-xs text-red-200/70">
                    Bloqueia trading ao atingir limite de perda diária
                  </p>
                </div>
                <Switch
                  checked={circuitBreakerEnabled}
                  onCheckedChange={setCircuitBreakerEnabled}
                />
              </div>
            </CardContent>
          </Card>

          {/* Card de Horários de Operação */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-amber-400" />
                  <div>
                    <CardTitle className="text-white">Horários de Operação</CardTitle>
                    <CardDescription className="text-slate-400">
                      Defina as sessões de trading permitidas (Horário de Brasília)
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
                  {/* Sessão de Londres */}
                  <div className="p-4 bg-slate-800/50 rounded-lg">
                    <Label className="text-amber-300 font-medium">Sessão de Londres</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <Label className="text-slate-400 text-xs">Início</Label>
                        <Input
                          type="time"
                          value={londonSessionStart}
                          onChange={(e) => setLondonSessionStart(e.target.value)}
                          className="bg-slate-700 border-slate-600 text-white"
                        />
                      </div>
                      <div>
                        <Label className="text-slate-400 text-xs">Fim</Label>
                        <Input
                          type="time"
                          value={londonSessionEnd}
                          onChange={(e) => setLondonSessionEnd(e.target.value)}
                          className="bg-slate-700 border-slate-600 text-white"
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Sessão de NY */}
                  <div className="p-4 bg-slate-800/50 rounded-lg">
                    <Label className="text-blue-300 font-medium">Sessão de Nova York</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <Label className="text-slate-400 text-xs">Início</Label>
                        <Input
                          type="time"
                          value={nySessionStart}
                          onChange={(e) => setNySessionStart(e.target.value)}
                          className="bg-slate-700 border-slate-600 text-white"
                        />
                      </div>
                      <div>
                        <Label className="text-slate-400 text-xs">Fim</Label>
                        <Input
                          type="time"
                          value={nySessionEnd}
                          onChange={(e) => setNySessionEnd(e.target.value)}
                          className="bg-slate-700 border-slate-600 text-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Card de Parâmetros Técnicos SMC */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <div className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-green-400" />
                <div>
                  <CardTitle className="text-white">Parâmetros Técnicos SMC</CardTitle>
                  <CardDescription className="text-slate-400">
                    Ajuste fino da detecção de padrões (usuários avançados)
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Estrutura H1 */}
              <div>
                <Label className="text-green-300 font-medium mb-3 block">Estrutura H1 (Swing Points)</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-sm">Lookback (candles)</Label>
                    <Input
                      type="number"
                      min="20"
                      max="100"
                      value={swingH1Lookback}
                      onChange={(e) => setSwingH1Lookback(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-sm">Fractal Esquerda</Label>
                    <Input
                      type="number"
                      min="1"
                      max="5"
                      value={fractalLeftBars}
                      onChange={(e) => setFractalLeftBars(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-sm">Fractal Direita</Label>
                    <Input
                      type="number"
                      min="1"
                      max="5"
                      value={fractalRightBars}
                      onChange={(e) => setFractalRightBars(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                </div>
              </div>
              
              {/* Sweep */}
              <div>
                <Label className="text-blue-300 font-medium mb-3 block">Detecção de Sweep</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-sm">Buffer (pips)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      max="10"
                      value={sweepBufferPips}
                      onChange={(e) => setSweepBufferPips(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-sm">Validação (minutos)</Label>
                    <Input
                      type="number"
                      min="15"
                      max="180"
                      value={sweepValidationMinutes}
                      onChange={(e) => setSweepValidationMinutes(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                </div>
              </div>
              
              {/* CHoCH */}
              <div>
                <Label className="text-purple-300 font-medium mb-3 block">CHoCH (M15)</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-sm">Lookback (candles)</Label>
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
                    <Label className="text-slate-400 text-sm">Mínimo (pips)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="5"
                      max="30"
                      value={chochMinPips}
                      onChange={(e) => setChochMinPips(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                </div>
              </div>
              
              {/* Order Block */}
              <div>
                <Label className="text-amber-300 font-medium mb-3 block">Order Block</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-sm">Lookback (candles)</Label>
                    <Input
                      type="number"
                      min="5"
                      max="20"
                      value={orderBlockLookback}
                      onChange={(e) => setOrderBlockLookback(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-sm">Extensão (pips)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="5"
                      max="30"
                      value={orderBlockExtensionPips}
                      onChange={(e) => setOrderBlockExtensionPips(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                </div>
              </div>
              
              {/* Entrada M5 */}
              <div>
                <Label className="text-red-300 font-medium mb-3 block">Confirmação de Entrada (M5)</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-sm">Tipo de Confirmação</Label>
                    <Select value={entryConfirmationType} onValueChange={setEntryConfirmationType}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ENTRY_CONFIRMATION_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-sm">Pavio de Rejeição (%)</Label>
                    <Input
                      type="number"
                      step="5"
                      min="40"
                      max="80"
                      value={rejectionWickPercent}
                      onChange={(e) => setRejectionWickPercent(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card de Trailing Stop */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white">Trailing Stop Dinâmico</CardTitle>
                  <CardDescription className="text-slate-400">
                    Proteja lucros movendo o Stop Loss automaticamente
                  </CardDescription>
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
                    <p className="text-xs text-slate-500">Ativar quando lucro ≥ X pips</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Step (Pips)</Label>
                    <Input
                      type="number"
                      min="5"
                      max="30"
                      value={trailingStepPips}
                      onChange={(e) => setTrailingStepPips(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                    <p className="text-xs text-slate-500">Mover SL a cada X pips de lucro</p>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Logging */}
          <div className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 rounded-lg">
            <div className="space-y-0.5">
              <Label className="text-slate-300">Logs Detalhados</Label>
              <p className="text-xs text-slate-500">
                Exibir logs detalhados da estratégia no terminal
              </p>
            </div>
            <Switch
              checked={verboseLogging}
              onCheckedChange={setVerboseLogging}
            />
          </div>
        </>
      )}

      {/* Botão Salvar */}
      <Button
        onClick={onSave}
        disabled={isSaving}
        className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
      >
        {isSaving ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Salvando...
          </>
        ) : (
          "Salvar e Aplicar Configurações"
        )}
      </Button>
    </div>
  );
}
