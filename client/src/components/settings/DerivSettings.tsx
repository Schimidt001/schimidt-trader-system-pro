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
import { Loader2 } from "lucide-react";
import { DERIV_SYMBOLS } from "@/const";

interface DerivSettingsProps {
  // Modo e Tokens
  mode: "DEMO" | "REAL";
  setMode: (mode: "DEMO" | "REAL") => void;
  tokenDemo: string;
  setTokenDemo: (token: string) => void;
  tokenReal: string;
  setTokenReal: (token: string) => void;
  derivAppId: string;
  setDerivAppId: (appId: string) => void;
  
  // Símbolo
  symbol: string;
  setSymbol: (symbol: string) => void;
  
  // Conexão
  isTesting: boolean;
  onTestConnection: () => void;
  connectionStatus: {
    connected: boolean;
    balance?: number;
    currency?: string;
    mode?: string;
  } | null;
}

/**
 * Componente de configurações específicas para a corretora DERIV
 * Exibe campos de API Token, App ID e configurações de conta
 */
export function DerivSettings({
  mode,
  setMode,
  tokenDemo,
  setTokenDemo,
  tokenReal,
  setTokenReal,
  derivAppId,
  setDerivAppId,
  symbol,
  setSymbol,
  isTesting,
  onTestConnection,
  connectionStatus,
}: DerivSettingsProps) {
  return (
    <Card className="bg-slate-900/50 border-slate-800 border-l-4 border-l-red-500">
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="text-2xl">📊</span>
          <div>
            <CardTitle className="text-white">Conta DERIV</CardTitle>
            <CardDescription className="text-slate-400">
              Configure o modo de operação e tokens de acesso para Binary Options
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Modo de Operação */}
        <div className="space-y-2">
          <Label htmlFor="mode" className="text-slate-300">
            Modo de Operação
          </Label>
          <Select value={mode} onValueChange={(v) => setMode(v as "DEMO" | "REAL")}>
            <SelectTrigger id="mode" className="bg-slate-800 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DEMO">DEMO</SelectItem>
              <SelectItem value="REAL">REAL</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Token DEMO */}
        <div className="space-y-2">
          <Label htmlFor="tokenDemo" className="text-slate-300">
            Token DEMO
          </Label>
          <Input
            id="tokenDemo"
            type="password"
            value={tokenDemo}
            onChange={(e) => setTokenDemo(e.target.value)}
            placeholder="Insira seu token de API DEMO"
            className="bg-slate-800 border-slate-700 text-white"
          />
        </div>

        {/* Token REAL */}
        <div className="space-y-2">
          <Label htmlFor="tokenReal" className="text-slate-300">
            Token REAL
          </Label>
          <Input
            id="tokenReal"
            type="password"
            value={tokenReal}
            onChange={(e) => setTokenReal(e.target.value)}
            placeholder="Insira seu token de API REAL"
            className="bg-slate-800 border-slate-700 text-white"
          />
        </div>

        {/* App ID */}
        <div className="space-y-2">
          <Label htmlFor="derivAppId" className="text-slate-300">
            App ID da DERIV
          </Label>
          <Input
            id="derivAppId"
            type="text"
            value={derivAppId}
            onChange={(e) => setDerivAppId(e.target.value)}
            placeholder="1089 (padrão) ou seu App ID personalizado"
            className="bg-slate-800 border-slate-700 text-white"
          />
          <p className="text-xs text-slate-500">
            Crie seu próprio App ID em{" "}
            <a
              href="https://api.deriv.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              api.deriv.com
            </a>
            {" "}para evitar problemas de conexão
          </p>
        </div>

        {/* Símbolo */}
        <div className="space-y-2">
          <Label htmlFor="symbol" className="text-slate-300">
            Ativo (Sintético ou Forex)
          </Label>
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger id="symbol" className="bg-slate-800 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DERIV_SYMBOLS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Botão de Teste de Conexão */}
        <div className="pt-4 border-t border-slate-700">
          <Button
            onClick={onTestConnection}
            disabled={isTesting || (!tokenDemo && !tokenReal)}
            variant="outline"
            className="w-full gap-2"
          >
            {isTesting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Testando conexão...
              </>
            ) : (
              "Testar Conexão com DERIV"
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
                  ? `✓ Conectado (${connectionStatus.mode}) - Saldo: $${((connectionStatus.balance || 0) / 100).toFixed(2)} ${connectionStatus.currency}`
                  : "✗ Falha na conexão"}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
