import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrendingUp, Clock, Target, ShieldAlert, Zap } from "lucide-react";
import { ICMARKETS_SYMBOLS } from "@/const/icmarkets";

interface ORBSettingsProps {
  // Ativos
  activeSymbols: string[];
  setActiveSymbols: (v: string[]) => void;
  
  // Opening Range
  openingCandles: string;
  setOpeningCandles: (v: string) => void;
  
  // Filtro de Regime
  emaPeriod: string;
  setEmaPeriod: (v: string) => void;
  slopeLookbackCandles: string;
  setSlopeLookbackCandles: (v: string) => void;
  minSlope: string;
  setMinSlope: (v: string) => void;
  
  // Stop Loss
  stopType: "rangeOpposite" | "atr";
  setStopType: (v: "rangeOpposite" | "atr") => void;
  atrMult: string;
  setAtrMult: (v: string) => void;
  atrPeriod: string;
  setAtrPeriod: (v: string) => void;
  
  // Take Profit
  riskReward: string;
  setRiskReward: (v: string) => void;
  
  // Frequência
  maxTradesPerDayPerSymbol: string;
  setMaxTradesPerDayPerSymbol: (v: string) => void;
  
  // Gestão de Risco
  riskPercentage: string;
  setRiskPercentage: (v: string) => void;
  maxOpenTrades: string;
  setMaxOpenTrades: (v: string) => void;
  
  // Spread
  maxSpreadPips: string;
  setMaxSpreadPips: (v: string) => void;
}

export function ORBSettings(props: ORBSettingsProps) {
  
  const toggleSymbol = (symbolValue: string) => {
    if (props.activeSymbols.includes(symbolValue)) {
      props.setActiveSymbols(props.activeSymbols.filter(s => s !== symbolValue));
    } else {
      if (props.activeSymbols.length >= 10) return;
      props.setActiveSymbols([...props.activeSymbols, symbolValue]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Indicador Visual de Modo ORB Ativo */}
      <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 flex items-center gap-3">
        <TrendingUp className="w-5 h-5 text-orange-400" />
        <div>
          <p className="text-sm text-orange-300 font-medium">
            Configurações da Estratégia ORB Trend (Opening Range Breakout)
          </p>
          <p className="text-xs text-slate-400">
            Breakout do range de abertura com filtro de regime EMA200. Opera em M15 com máximo de 1 trade/dia/símbolo.
          </p>
        </div>
      </div>

      {/* Card de Ativos Monitorados */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-orange-400" />
            Ativos Monitorados
          </CardTitle>
          <CardDescription>Selecione os pares para monitoramento (máx. 10)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {ICMARKETS_SYMBOLS.map((s) => {
              const isActive = props.activeSymbols.includes(s.value);
              return (
                <div 
                  key={s.value}
                  onClick={() => toggleSymbol(s.value)}
                  className={`cursor-pointer px-3 py-2 rounded border text-sm font-mono text-center transition-colors ${
                    isActive 
                    ? "bg-orange-900/40 border-orange-500 text-orange-300" 
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  {isActive && "✓ "}{s.label}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Card de Opening Range */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" />
            Opening Range
          </CardTitle>
          <CardDescription>Configurações do range de abertura</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-slate-300">Número de Candles M15 para o Range</Label>
            <Input 
              type="number" 
              value={props.openingCandles}
              onChange={e => props.setOpeningCandles(e.target.value)}
              className="bg-slate-800 border-slate-700"
              min="1"
              max="10"
            />
            <p className="text-xs text-slate-500">
              Padrão: 3 candles (45 minutos). Range = max(high) e min(low) dos primeiros X candles do dia.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Card de Filtro de Regime */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-400" />
            Filtro de Regime (EMA200)
          </CardTitle>
          <CardDescription>Parâmetros do filtro de tendência</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Período da EMA</Label>
              <Input 
                type="number" 
                value={props.emaPeriod}
                onChange={e => props.setEmaPeriod(e.target.value)}
                className="bg-slate-800 border-slate-700"
                min="50"
                max="300"
              />
              <p className="text-xs text-slate-500">Padrão: 200</p>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Lookback do Slope (candles)</Label>
              <Input 
                type="number" 
                value={props.slopeLookbackCandles}
                onChange={e => props.setSlopeLookbackCandles(e.target.value)}
                className="bg-slate-800 border-slate-700"
                min="5"
                max="30"
              />
              <p className="text-xs text-slate-500">Padrão: 10</p>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Slope Mínimo</Label>
              <Input 
                type="number" 
                value={props.minSlope}
                onChange={e => props.setMinSlope(e.target.value)}
                className="bg-slate-800 border-slate-700"
                step="0.000001"
              />
              <p className="text-xs text-slate-500">Padrão: 0.0001 (conservador)</p>
            </div>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <p className="text-sm text-blue-300">
              <strong>Lógica:</strong> BUY se preço &gt; EMA200 e slope &gt; minSlope. SELL se preço &lt; EMA200 e slope &lt; -minSlope. Flat = não operar.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Card de Stop Loss */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-400" />
            Stop Loss
          </CardTitle>
          <CardDescription>Configurações de proteção</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-slate-300">Tipo de Stop Loss</Label>
            <Select value={props.stopType} onValueChange={props.setStopType}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rangeOpposite">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-500/20 text-green-300 border-green-500/30">Recomendado</Badge>
                    Lado Oposto do Range
                  </div>
                </SelectItem>
                <SelectItem value="atr">ATR (Average True Range)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {props.stopType === "rangeOpposite" ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
              <p className="text-sm text-green-300">
                <strong>Range Opposite:</strong> BUY SL = opening_low | SELL SL = opening_high
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Multiplicador ATR</Label>
                <Input 
                  type="number" 
                  value={props.atrMult}
                  onChange={e => props.setAtrMult(e.target.value)}
                  className="bg-slate-800 border-slate-700"
                  step="0.1"
                />
                <p className="text-xs text-slate-500">Padrão: 1.5</p>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Período ATR</Label>
                <Input 
                  type="number" 
                  value={props.atrPeriod}
                  onChange={e => props.setAtrPeriod(e.target.value)}
                  className="bg-slate-800 border-slate-700"
                  min="5"
                  max="50"
                />
                <p className="text-xs text-slate-500">Padrão: 14</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card de Take Profit e Frequência */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-yellow-400" />
            Take Profit e Frequência
          </CardTitle>
          <CardDescription>Alvos e limites operacionais</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Risk:Reward Ratio</Label>
              <Input 
                type="number" 
                value={props.riskReward}
                onChange={e => props.setRiskReward(e.target.value)}
                className="bg-slate-800 border-slate-700"
                step="0.1"
                min="0.5"
                max="5"
              />
              <p className="text-xs text-slate-500">Padrão: 1.0 (TP = 1x o risco do SL)</p>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Máx. Trades por Dia por Símbolo</Label>
              <Input 
                type="number" 
                value={props.maxTradesPerDayPerSymbol}
                onChange={e => props.setMaxTradesPerDayPerSymbol(e.target.value)}
                className="bg-slate-800 border-slate-700"
                min="1"
                max="5"
              />
              <p className="text-xs text-slate-500">Padrão: 1 (crítico para ORB)</p>
            </div>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <p className="text-sm text-amber-300">
              <strong>Importante:</strong> Após atingir TP ou SL, o símbolo é travado pelo resto do dia. Máximo de 1 trade/dia/símbolo.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Card de Gestão de Risco */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-yellow-400" />
            Gestão de Risco
          </CardTitle>
          <CardDescription>Parâmetros de risco global</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Risco por Trade (%)</Label>
              <Input 
                type="number" 
                value={props.riskPercentage}
                onChange={e => props.setRiskPercentage(e.target.value)}
                className="bg-slate-800 border-slate-700"
                step="0.01"
                min="0.1"
                max="5"
              />
              <p className="text-xs text-slate-500">Padrão: 1.0%</p>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Máx. Trades Simultâneos</Label>
              <Input 
                type="number" 
                value={props.maxOpenTrades}
                onChange={e => props.setMaxOpenTrades(e.target.value)}
                className="bg-slate-800 border-slate-700"
                min="1"
                max="10"
              />
              <p className="text-xs text-slate-500">Padrão: 3</p>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Spread Máximo (pips)</Label>
              <Input 
                type="number" 
                value={props.maxSpreadPips}
                onChange={e => props.setMaxSpreadPips(e.target.value)}
                className="bg-slate-800 border-slate-700"
                step="0.1"
                min="0.5"
                max="10"
              />
              <p className="text-xs text-slate-500">Padrão: 3.0 pips</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
