import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Info, TrendingUp, Shield, Clock, Target, Activity } from "lucide-react";

/**
 * Props do componente RsiVwapSettingsClean
 * NOTA: Este componente NÃO inclui botão de salvar
 * O salvamento é controlado pelo componente pai (SettingsMultiBroker)
 */
interface RsiVwapSettingsCleanProps {
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
  
  // Gestão de Risco - ÚNICA FONTE (Single Source of Truth)
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
 * Componente LIMPO de configurações da estratégia RSI + VWAP Reversal
 * Versão refatorada sem duplicações - cada campo aparece apenas uma vez
 */
export function RsiVwapSettingsClean({
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
}: RsiVwapSettingsCleanProps) {
  
  // Calcular níveis RSI para visualização
  const oversoldLevel = parseInt(rsiOversold) || 30;
  const overboughtLevel = parseInt(rsiOverbought) || 70;
  
  return (
    <div className="space-y-6">
      {/* Indicador Visual de Modo RSI Ativo */}
      <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 flex items-center gap-3">
        <Activity className="w-5 h-5 text-orange-400" />
        <div>
          <p className="text-sm text-orange-300 font-medium">
            Configurações da Estratégia RSI + VWAP Reversal
          </p>
          <p className="text-xs text-slate-400">
            Estratégia de reversão à média para operações de alta frequência
          </p>
        </div>
      </div>

      {/* Card de Indicadores RSI com Visualização */}
      <Card className="bg-slate-900/50 border-slate-800 border-l-4 border-l-cyan-500">
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
          {/* Visualização Gráfica dos Níveis RSI */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <Label className="text-slate-300 text-sm mb-3 block">Níveis RSI</Label>
            <div className="relative h-8 bg-slate-700 rounded-full overflow-hidden">
              {/* Zona de Sobrevenda (Verde) */}
              <div 
                className="absolute left-0 top-0 h-full bg-green-500/30"
                style={{ width: `${oversoldLevel}%` }}
              />
              {/* Zona Neutra (Cinza) */}
              <div 
                className="absolute top-0 h-full bg-slate-600/30"
                style={{ left: `${oversoldLevel}%`, width: `${overboughtLevel - oversoldLevel}%` }}
              />
              {/* Zona de Sobrecompra (Vermelho) */}
              <div 
                className="absolute right-0 top-0 h-full bg-red-500/30"
                style={{ width: `${100 - overboughtLevel}%` }}
              />
              {/* Marcadores */}
              <div 
                className="absolute top-0 h-full w-0.5 bg-green-400"
                style={{ left: `${oversoldLevel}%` }}
              />
              <div 
                className="absolute top-0 h-full w-0.5 bg-red-400"
                style={{ left: `${overboughtLevel}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs">
              <span className="text-green-400">Sobrevenda: {oversoldLevel}</span>
              <span className="text-slate-400">Neutro</span>
              <span className="text-red-400">Sobrecompra: {overboughtLevel}</span>
            </div>
          </div>
          
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
              <p className="text-xs text-green-400">Sinal de COMPRA abaixo deste nível</p>
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
              <p className="text-xs text-red-400">Sinal de VENDA acima deste nível</p>
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
            <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3">
              <p className="text-sm text-cyan-300">
                <strong>Regra VWAP:</strong> Para COMPRA, preço deve estar ABAIXO do VWAP. 
                Para VENDA, preço deve estar ACIMA do VWAP. Isso confirma a reversão à média.
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Card de Gestão de Risco RSI - ÚNICA FONTE */}
      <Card className="bg-slate-900/50 border-slate-800 border-l-4 border-l-amber-500">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-amber-400" />
            <div>
              <CardTitle className="text-white">Gestão de Risco RSI</CardTitle>
              <CardDescription className="text-slate-400">
                Parâmetros de risco exclusivos para a estratégia RSI+VWAP
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
              <p className="text-xs text-slate-500">Padrão: 1.0%</p>
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
              <p className="text-xs text-slate-500">Padrão: 2.0 (TP = 2x SL)</p>
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
              <CardTitle className="text-white">Filtros de Qualidade</CardTitle>
              <CardDescription className="text-slate-400">
                Filtros para melhorar a qualidade dos sinais
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
            <p className="text-xs text-slate-500">
              Percentual mínimo do corpo em relação ao range total do candle
            </p>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
            <div>
              <Label className="text-slate-300">Filtro de Spread</Label>
              <p className="text-xs text-slate-500">Evita entradas com spread alto</p>
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
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card de Sessão de Trading */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-slate-400" />
              <div>
                <CardTitle className="text-white">Filtro de Horário</CardTitle>
                <CardDescription className="text-slate-400">
                  Define janela de operação para RSI+VWAP
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
            <p className="text-xs text-slate-500">
              O robô só operará RSI+VWAP dentro desta janela de horário (UTC)
            </p>
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

      {/* Card de Logging */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Opções Avançadas</CardTitle>
        </CardHeader>
        <CardContent>
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
