import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Info, TrendingUp, Shield, Clock, Target, Activity } from "lucide-react";

/**
 * Props do componente RsiVwapSettings
 */
interface RsiVwapSettingsProps {
  // Indicadores RSI
  rsiPeriod: string;
  setRsiPeriod: (value: string) => void;
  rsiOversold: string;
  setRsiOversold: (value: string) => void;
  rsiOverbought: string;
  setRsiOverbought: (value: string) => void;
  
  // VWAP
  vwapEnabled: boolean;
  setVwapEnabled: (enabled: boolean) => void;
  
  // Gestão de Risco
  riskPercentage: string;
  setRiskPercentage: (value: string) => void;
  stopLossPips: string;
  setStopLossPips: (value: string) => void;
  takeProfitPips: string;
  setTakeProfitPips: (value: string) => void;
  rewardRiskRatio: string;
  setRewardRiskRatio: (value: string) => void;
  
  // Filtros
  minCandleBodyPercent: string;
  setMinCandleBodyPercent: (value: string) => void;
  spreadFilterEnabled: boolean;
  setSpreadFilterEnabled: (enabled: boolean) => void;
  maxSpreadPips: string;
  setMaxSpreadPips: (value: string) => void;
  
  // Horários
  sessionFilterEnabled: boolean;
  setSessionFilterEnabled: (enabled: boolean) => void;
  sessionStart: string;
  setSessionStart: (value: string) => void;
  sessionEnd: string;
  setSessionEnd: (value: string) => void;
  
  // Trailing Stop
  trailingEnabled: boolean;
  setTrailingEnabled: (enabled: boolean) => void;
  trailingTriggerPips: string;
  setTrailingTriggerPips: (value: string) => void;
  trailingStepPips: string;
  setTrailingStepPips: (value: string) => void;
  
  // Logging
  verboseLogging: boolean;
  setVerboseLogging: (enabled: boolean) => void;
}

/**
 * Componente de configurações da estratégia RSI + VWAP Reversal
 * Permite configurar todos os parâmetros da estratégia de reversão
 */
export function RsiVwapSettings({
  rsiPeriod,
  setRsiPeriod,
  rsiOversold,
  setRsiOversold,
  rsiOverbought,
  setRsiOverbought,
  vwapEnabled,
  setVwapEnabled,
  riskPercentage,
  setRiskPercentage,
  stopLossPips,
  setStopLossPips,
  takeProfitPips,
  setTakeProfitPips,
  rewardRiskRatio,
  setRewardRiskRatio,
  minCandleBodyPercent,
  setMinCandleBodyPercent,
  spreadFilterEnabled,
  setSpreadFilterEnabled,
  maxSpreadPips,
  setMaxSpreadPips,
  sessionFilterEnabled,
  setSessionFilterEnabled,
  sessionStart,
  setSessionStart,
  sessionEnd,
  setSessionEnd,
  trailingEnabled,
  setTrailingEnabled,
  trailingTriggerPips,
  setTrailingTriggerPips,
  trailingStepPips,
  setTrailingStepPips,
  verboseLogging,
  setVerboseLogging,
}: RsiVwapSettingsProps) {
  
  return (
    <div className="space-y-6">
      {/* Card de Informação da Estratégia */}
      <Card className="bg-slate-900/50 border-slate-800 border-l-4 border-l-cyan-500">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-cyan-400" />
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                Estratégia RSI + VWAP Reversal
                <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30">COMPLEMENTAR</Badge>
              </CardTitle>
              <CardDescription className="text-slate-400">
                Estratégia de reversão à média para operações de alta frequência
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3">
            <p className="text-sm text-cyan-300">
              <strong>Lógica de Entrada:</strong> RSI em sobrevenda/sobrecompra + Preço vs VWAP + Candle de reversão.
              Esta estratégia complementa o SMC, focando em reversões de curto prazo com R:R 1:2.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Card de Indicadores RSI */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            <div>
              <CardTitle className="text-white">Indicador RSI</CardTitle>
              <CardDescription className="text-slate-400">
                Configurações do Relative Strength Index
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Período RSI</Label>
              <Input
                type="number"
                min="5"
                max="50"
                value={rsiPeriod}
                onChange={(e) => setRsiPeriod(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">Padrão: 14 períodos</p>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Nível Sobrevenda</Label>
              <Input
                type="number"
                min="10"
                max="40"
                value={rsiOversold}
                onChange={(e) => setRsiOversold(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">Sinal de COMPRA abaixo deste nível</p>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Nível Sobrecompra</Label>
              <Input
                type="number"
                min="60"
                max="90"
                value={rsiOverbought}
                onChange={(e) => setRsiOverbought(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">Sinal de VENDA acima deste nível</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card de VWAP */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Target className="w-5 h-5 text-cyan-400" />
              <div>
                <CardTitle className="text-white">Filtro VWAP</CardTitle>
                <CardDescription className="text-slate-400">
                  Volume Weighted Average Price como confirmação
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={vwapEnabled}
              onCheckedChange={setVwapEnabled}
            />
          </div>
        </CardHeader>
        {vwapEnabled && (
          <CardContent>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
              <p className="text-sm text-slate-300">
                <strong>Regra VWAP:</strong> Para COMPRA, preço deve estar ABAIXO do VWAP. 
                Para VENDA, preço deve estar ACIMA do VWAP. Isso confirma a reversão à média.
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Card de Gestão de Risco */}
      <Card className="bg-slate-900/50 border-slate-800 border-l-4 border-l-amber-500">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-amber-400" />
            <div>
              <CardTitle className="text-white">Gestão de Risco</CardTitle>
              <CardDescription className="text-slate-400">
                Stop Loss, Take Profit e risco por operação
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Risco por Trade (%)</Label>
              <Input
                type="number"
                min="0.1"
                max="5"
                step="0.1"
                value={riskPercentage}
                onChange={(e) => setRiskPercentage(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">Percentual do equity arriscado</p>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Reward:Risk Ratio</Label>
              <Input
                type="number"
                min="1"
                max="5"
                step="0.5"
                value={rewardRiskRatio}
                onChange={(e) => setRewardRiskRatio(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">Ex: 2.0 = TP é 2x o SL</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Stop Loss (Pips)</Label>
              <Input
                type="number"
                min="5"
                max="50"
                value={stopLossPips}
                onChange={(e) => setStopLossPips(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">Stop Loss fixo em pips</p>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Take Profit (Pips)</Label>
              <Input
                type="number"
                min="10"
                max="100"
                value={takeProfitPips}
                onChange={(e) => setTakeProfitPips(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">Take Profit fixo em pips</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card de Filtros */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Info className="w-5 h-5 text-slate-400" />
            <div>
              <CardTitle className="text-white">Filtros de Entrada</CardTitle>
              <CardDescription className="text-slate-400">
                Condições adicionais para validar sinais
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-slate-300">Corpo Mínimo do Candle (%)</Label>
            <Input
              type="number"
              min="10"
              max="80"
              value={minCandleBodyPercent}
              onChange={(e) => setMinCandleBodyPercent(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white"
            />
            <p className="text-xs text-slate-500">Mínimo de corpo para confirmar reversão</p>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
            <div className="space-y-0.5">
              <Label className="text-slate-300">Filtro de Spread</Label>
              <p className="text-xs text-slate-500">
                Evitar entradas com spread alto
              </p>
            </div>
            <Switch
              checked={spreadFilterEnabled}
              onCheckedChange={setSpreadFilterEnabled}
            />
          </div>
          
          {spreadFilterEnabled && (
            <div className="space-y-2 pl-4 border-l-2 border-slate-700">
              <Label className="text-slate-300">Spread Máximo (Pips)</Label>
              <Input
                type="number"
                min="0.5"
                max="10"
                step="0.5"
                value={maxSpreadPips}
                onChange={(e) => setMaxSpreadPips(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white w-32"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card de Horários */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-cyan-400" />
              <div>
                <CardTitle className="text-white">Horário de Operação</CardTitle>
                <CardDescription className="text-slate-400">
                  Janela de trading para RSI+VWAP (UTC-3 Brasília)
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
                <Label className="text-slate-300">Início da Sessão</Label>
                <Input
                  type="time"
                  value={sessionStart}
                  onChange={(e) => setSessionStart(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Fim da Sessão</Label>
                <Input
                  type="time"
                  value={sessionEnd}
                  onChange={(e) => setSessionEnd(e.target.value)}
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
            <div>
              <CardTitle className="text-white">Trailing Stop</CardTitle>
              <CardDescription className="text-slate-400">
                Proteger lucros movendo o Stop Loss
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
                  min="1"
                  max="20"
                  value={trailingStepPips}
                  onChange={(e) => setTrailingStepPips(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
                <p className="text-xs text-slate-500">Mover SL a cada X pips</p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Logging */}
      <div className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 rounded-lg">
        <div className="space-y-0.5">
          <Label className="text-slate-300">Logs Detalhados RSI+VWAP</Label>
          <p className="text-xs text-slate-500">
            Exibir logs detalhados da estratégia no terminal
          </p>
        </div>
        <Switch
          checked={verboseLogging}
          onCheckedChange={setVerboseLogging}
        />
      </div>
    </div>
  );
}
