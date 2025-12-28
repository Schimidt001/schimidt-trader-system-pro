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
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, AlertCircle, Info } from "lucide-react";
import { ICMARKETS_SYMBOLS, ICMARKETS_TIMEFRAMES, ICMARKETS_DEFAULTS, SYMBOL_CATEGORIES } from "@/const/icmarkets";

interface ICMarketsSettingsProps {
  // Credenciais cTrader
  clientId: string;
  setClientId: (id: string) => void;
  clientSecret: string;
  setClientSecret: (secret: string) => void;
  accessToken: string;
  setAccessToken: (token: string) => void;
  
  // Modo Demo/Real
  isDemo: boolean;
  setIsDemo: (isDemo: boolean) => void;
  
  // Configurações de Trading
  symbol: string;
  setSymbol: (symbol: string) => void;
  lots: string;
  setLots: (lots: string) => void;
  leverage: string;
  setLeverage: (leverage: string) => void;
  timeframe: string;
  setTimeframe: (timeframe: string) => void;
  
  // Stop Loss e Take Profit
  stopLossPips: string;
  setStopLossPips: (pips: string) => void;
  takeProfitPips: string;
  setTakeProfitPips: (pips: string) => void;
  
  // Trailing Stop
  trailingEnabled: boolean;
  setTrailingEnabled: (enabled: boolean) => void;
  trailingTriggerPips: string;
  setTrailingTriggerPips: (pips: string) => void;
  trailingStepPips: string;
  setTrailingStepPips: (pips: string) => void;
  
  // Conexão
  isTesting: boolean;
  onTestConnection: () => void;
  connectionStatus: {
    connected: boolean;
    balance?: number;
    currency?: string;
    accountId?: string;
  } | null;
}

/**
 * Componente de configurações específicas para IC Markets via cTrader Open API
 * Exibe campos de Client ID, Secret, Token e configurações de Forex
 */
export function ICMarketsSettings({
  clientId,
  setClientId,
  clientSecret,
  setClientSecret,
  accessToken,
  setAccessToken,
  isDemo,
  setIsDemo,
  symbol,
  setSymbol,
  lots,
  setLots,
  leverage,
  setLeverage,
  timeframe,
  setTimeframe,
  stopLossPips,
  setStopLossPips,
  takeProfitPips,
  setTakeProfitPips,
  trailingEnabled,
  setTrailingEnabled,
  trailingTriggerPips,
  setTrailingTriggerPips,
  trailingStepPips,
  setTrailingStepPips,
  isTesting,
  onTestConnection,
  connectionStatus,
}: ICMarketsSettingsProps) {
  // Agrupar símbolos por categoria
  const majorSymbols = ICMARKETS_SYMBOLS.filter(s => s.category === "major");
  const minorSymbols = ICMARKETS_SYMBOLS.filter(s => s.category === "minor");
  const exoticSymbols = ICMARKETS_SYMBOLS.filter(s => s.category === "exotic");

  return (
    <div className="space-y-6">
      {/* Card de Credenciais cTrader */}
      <Card className="bg-slate-900/50 border-slate-800 border-l-4 border-l-blue-500">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="text-2xl">💹</span>
            <div>
              <CardTitle className="text-white">Conta IC Markets (cTrader)</CardTitle>
              <CardDescription className="text-slate-400">
                Configure as credenciais da cTrader Open API para Forex Spot
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Alerta informativo */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 flex items-start gap-2">
            <Info className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-300">
              <p className="font-medium">Como obter as credenciais:</p>
              <ol className="list-decimal list-inside mt-1 space-y-1 text-blue-200/80">
                <li>Acesse <a href="https://openapi.ctrader.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-300">openapi.ctrader.com</a></li>
                <li>Crie uma aplicação para obter Client ID e Secret</li>
                <li>Autorize sua conta IC Markets para gerar o Access Token</li>
              </ol>
            </div>
          </div>

          {/* Modo Demo/Real */}
          <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
            <div className="space-y-0.5">
              <Label className="text-slate-300">Modo de Operação</Label>
              <p className="text-xs text-slate-500">
                {isDemo ? "Conta Demo (sem risco)" : "Conta Real (dinheiro real)"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${isDemo ? "text-green-400" : "text-slate-500"}`}>DEMO</span>
              <Switch
                checked={!isDemo}
                onCheckedChange={(checked) => setIsDemo(!checked)}
              />
              <span className={`text-sm ${!isDemo ? "text-red-400" : "text-slate-500"}`}>REAL</span>
            </div>
          </div>

          {/* Client ID */}
          <div className="space-y-2">
            <Label htmlFor="clientId" className="text-slate-300">
              Client ID
            </Label>
            <Input
              id="clientId"
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Seu Client ID da cTrader Open API"
              className="bg-slate-800 border-slate-700 text-white font-mono"
            />
          </div>

          {/* Client Secret */}
          <div className="space-y-2">
            <Label htmlFor="clientSecret" className="text-slate-300">
              Client Secret
            </Label>
            <Input
              id="clientSecret"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="Seu Client Secret da cTrader Open API"
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>

          {/* Access Token */}
          <div className="space-y-2">
            <Label htmlFor="accessToken" className="text-slate-300">
              Access Token
            </Label>
            <Input
              id="accessToken"
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Token de acesso autorizado"
              className="bg-slate-800 border-slate-700 text-white"
            />
            <p className="text-xs text-slate-500">
              O Access Token é obtido após autorizar sua conta IC Markets na aplicação cTrader
            </p>
          </div>

          {/* Botão de Teste de Conexão */}
          <div className="pt-4 border-t border-slate-700">
            <Button
              onClick={onTestConnection}
              disabled={isTesting || !clientId || !clientSecret || !accessToken}
              variant="outline"
              className="w-full gap-2"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Testando conexão...
                </>
              ) : (
                "Testar Conexão com IC Markets"
              )}
            </Button>
            
            {connectionStatus && (
              <div className={`mt-3 p-3 rounded-lg ${
                connectionStatus.connected 
                  ? "bg-green-500/10 border border-green-500/30" 
                  : "bg-red-500/10 border border-red-500/30"
              }`}>
                <p className={`text-sm font-medium ${
                  connectionStatus.connected ? "text-green-400" : "text-red-400"
                }`}>
                  {connectionStatus.connected 
                    ? `✓ Conectado - Saldo: ${connectionStatus.currency} ${connectionStatus.balance?.toFixed(2)} (Conta: ${connectionStatus.accountId})`
                    : "✗ Falha na conexão"}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Card de Configurações de Trading */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Parâmetros de Trading Forex</CardTitle>
          <CardDescription className="text-slate-400">
            Configure símbolo, lotes, alavancagem e gestão de risco
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Símbolo */}
          <div className="space-y-2">
            <Label htmlFor="icSymbol" className="text-slate-300">
              Par de Moedas
            </Label>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger id="icSymbol" className="bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="Selecione um par" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel className={SYMBOL_CATEGORIES.major.color}>
                    {SYMBOL_CATEGORIES.major.label}
                  </SelectLabel>
                  {majorSymbols.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className={SYMBOL_CATEGORIES.minor.color}>
                    {SYMBOL_CATEGORIES.minor.label}
                  </SelectLabel>
                  {minorSymbols.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className={SYMBOL_CATEGORIES.exotic.color}>
                    {SYMBOL_CATEGORIES.exotic.label}
                  </SelectLabel>
                  {exoticSymbols.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* Timeframe */}
          <div className="space-y-2">
            <Label htmlFor="icTimeframe" className="text-slate-300">
              Timeframe
            </Label>
            <Select value={timeframe} onValueChange={setTimeframe}>
              <SelectTrigger id="icTimeframe" className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ICMARKETS_TIMEFRAMES.map((tf) => (
                  <SelectItem key={tf.value} value={tf.value}>
                    {tf.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lotes e Alavancagem */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lots" className="text-slate-300">
                Tamanho do Lote
              </Label>
              <Input
                id="lots"
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                value={lots}
                onChange={(e) => setLots(e.target.value)}
                placeholder="0.01"
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">
                Mínimo: 0.01 | Máximo: 100
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="leverage" className="text-slate-300">
                Alavancagem
              </Label>
              <Select value={leverage} onValueChange={setLeverage}>
                <SelectTrigger id="leverage" className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">1:30</SelectItem>
                  <SelectItem value="50">1:50</SelectItem>
                  <SelectItem value="100">1:100</SelectItem>
                  <SelectItem value="200">1:200</SelectItem>
                  <SelectItem value="500">1:500</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Stop Loss e Take Profit */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stopLossPips" className="text-slate-300">
                Stop Loss (Pips)
              </Label>
              <Input
                id="stopLossPips"
                type="number"
                min="1"
                value={stopLossPips}
                onChange={(e) => setStopLossPips(e.target.value)}
                placeholder="15"
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">
                Padrão: {ICMARKETS_DEFAULTS.defaultStopLossPips} pips
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="takeProfitPips" className="text-slate-300">
                Take Profit (Pips)
              </Label>
              <Input
                id="takeProfitPips"
                type="number"
                min="0"
                value={takeProfitPips}
                onChange={(e) => setTakeProfitPips(e.target.value)}
                placeholder="0 = Infinito"
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">
                0 = Sem limite (usar Trailing Stop)
              </p>
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
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
              <p className="text-sm text-green-300">
                <strong>Estratégia "Trend Sniper Smart":</strong> O Trailing Stop é ativado quando o lucro 
                atinge o trigger e move o SL a cada step de lucro adicional.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="trailingTrigger" className="text-slate-300">
                  Trigger (Pips)
                </Label>
                <Input
                  id="trailingTrigger"
                  type="number"
                  min="1"
                  value={trailingTriggerPips}
                  onChange={(e) => setTrailingTriggerPips(e.target.value)}
                  placeholder="10"
                  className="bg-slate-800 border-slate-700 text-white"
                />
                <p className="text-xs text-slate-500">
                  Ativar quando lucro ≥ {trailingTriggerPips || ICMARKETS_DEFAULTS.trailingTriggerPips} pips
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="trailingStep" className="text-slate-300">
                  Step (Pips)
                </Label>
                <Input
                  id="trailingStep"
                  type="number"
                  min="1"
                  value={trailingStepPips}
                  onChange={(e) => setTrailingStepPips(e.target.value)}
                  placeholder="5"
                  className="bg-slate-800 border-slate-700 text-white"
                />
                <p className="text-xs text-slate-500">
                  Mover SL a cada +{trailingStepPips || ICMARKETS_DEFAULTS.trailingStepPips} pips de lucro
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
