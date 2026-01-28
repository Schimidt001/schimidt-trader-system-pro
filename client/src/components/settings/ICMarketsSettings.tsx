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
import { ShieldAlert, Target, Zap } from "lucide-react";
import { ICMARKETS_SYMBOLS } from "@/const/icmarkets";

interface ICMarketsSettingsProps {
  // Autenticação (Existente)
  clientId: string; setClientId: (v: string) => void;
  clientSecret: string; setClientSecret: (v: string) => void;
  accessToken: string; setAccessToken: (v: string) => void;
  isDemo: boolean; setIsDemo: (v: boolean) => void;
  
  // -- NOVOS CAMPOS SMC (Obrigatório Implementar no Pai) --
  strategyType: "TREND_SNIPER" | "SMC_SWARM" | "RSI_VWAP" | "ORB_TREND";
  setStrategyType: (v: "TREND_SNIPER" | "SMC_SWARM" | "RSI_VWAP" | "ORB_TREND") => void;
  
  riskPercent: string; setRiskPercent: (v: string) => void;
  maxOpenTrades: string; setMaxOpenTrades: (v: string) => void;
  dailyLossLimit: string; setDailyLossLimit: (v: string) => void;
  activeSymbols: string[]; setActiveSymbols: (v: string[]) => void;
  
  // -- CAMPOS LEGADOS (Trend Sniper) --
  symbol: string; setSymbol: (v: string) => void;
  lots: string; setLots: (v: string) => void;
  leverage: string; setLeverage: (v: string) => void;
  
  // Conexão
  isTesting: boolean;
  onTestConnection: () => void;
  connectionStatus: any;
}

export function ICMarketsSettings(props: ICMarketsSettingsProps) {
  
  const toggleSwarmSymbol = (symbolValue: string) => {
    if (props.activeSymbols.includes(symbolValue)) {
      props.setActiveSymbols(props.activeSymbols.filter(s => s !== symbolValue));
    } else {
      if (props.activeSymbols.length >= 10) return; // Limite hardcoded de 10
      props.setActiveSymbols([...props.activeSymbols, symbolValue]);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. SELETOR DE ESTRATÉGIA */}
      <Card className="bg-slate-900 border-slate-800 border-l-4 border-l-purple-500">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-purple-400" />
            Estratégia Operacional
          </CardTitle>
          <CardDescription>Defina qual inteligência o robô deve utilizar.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div 
              onClick={() => props.setStrategyType("TREND_SNIPER")}
              className={`cursor-pointer p-4 rounded-lg border transition-all ${
                props.strategyType === "TREND_SNIPER" 
                ? "bg-blue-500/20 border-blue-500" 
                : "bg-slate-800 border-slate-700 opacity-50"
              }`}
            >
              <h3 className="font-bold text-blue-400">Trend Sniper (Legado)</h3>
              <p className="text-xs text-slate-300 mt-1">Lote Fixo • 1 Ativo</p>
            </div>
            
            <div 
              onClick={() => props.setStrategyType("SMC_SWARM")}
              className={`cursor-pointer p-4 rounded-lg border transition-all ${
                props.strategyType === "SMC_SWARM" 
                ? "bg-purple-500/20 border-purple-500" 
                : "bg-slate-800 border-slate-700 opacity-50"
              }`}
            >
              <div className="flex justify-between">
                <h3 className="font-bold text-purple-400">SMC Swarm (Pro)</h3>
                <Badge className="bg-purple-600">Recomendado</Badge>
              </div>
              <p className="text-xs text-slate-300 mt-1">Risco % • Multi-Ativos (Enxame)</p>
            </div>
            
            <div 
              onClick={() => props.setStrategyType("RSI_VWAP")}
              className={`cursor-pointer p-4 rounded-lg border transition-all ${
                props.strategyType === "RSI_VWAP" 
                ? "bg-green-500/20 border-green-500" 
                : "bg-slate-800 border-slate-700 opacity-50"
              }`}
            >
              <h3 className="font-bold text-green-400">RSI + VWAP</h3>
              <p className="text-xs text-slate-300 mt-1">Reversão • Alta Frequência</p>
            </div>
            
            <div 
              onClick={() => props.setStrategyType("ORB_TREND")}
              className={`cursor-pointer p-4 rounded-lg border transition-all ${
                props.strategyType === "ORB_TREND" 
                ? "bg-orange-500/20 border-orange-500" 
                : "bg-slate-800 border-slate-700 opacity-50"
              }`}
            >
              <div className="flex justify-between">
                <h3 className="font-bold text-orange-400">ORB Trend</h3>
                <Badge className="bg-orange-600">Novo</Badge>
              </div>
              <p className="text-xs text-slate-300 mt-1">Opening Range • M15 • 1 Trade/Dia</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. PAINEL DINÂMICO */}
      {props.strategyType === "SMC_SWARM" ? (
        <>
          {/* CONFIGURAÇÃO DE RISCO SMC */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-yellow-400" />
                Gestão de Risco (SMC)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Risco por Trade (%)</Label>
                  <Input 
                    type="number" 
                    value={props.riskPercent}
                    onChange={e => props.setRiskPercent(e.target.value)}
                    className="bg-slate-800 border-slate-700"
                    step="0.01"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Máx. Trades Simultâneos</Label>
                  <Input 
                    type="number" 
                    value={props.maxOpenTrades}
                    onChange={e => props.setMaxOpenTrades(e.target.value)}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Limite de Perda Diária (%)</Label>
                  <Input 
                    type="number" 
                    value={props.dailyLossLimit}
                    onChange={e => props.setDailyLossLimit(e.target.value)}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SELETOR DE ATIVOS (SWARM) */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-cyan-400" />
                Ativos do Enxame
              </CardTitle>
              <CardDescription>Selecione os pares para monitoramento.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {ICMARKETS_SYMBOLS.map((s) => {
                  const isActive = props.activeSymbols.includes(s.value);
                  return (
                    <div 
                      key={s.value}
                      onClick={() => toggleSwarmSymbol(s.value)}
                      className={`cursor-pointer px-3 py-2 rounded border text-sm font-mono text-center transition-colors ${
                        isActive 
                        ? "bg-cyan-900/40 border-cyan-500 text-cyan-300" 
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
        </>
      ) : (
        /* PAINEL LEGADO */
        <Card className="bg-slate-900/50 border-slate-800 opacity-75">
          <CardHeader><CardTitle className="text-slate-300">Configuração Fixa</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ativo Único</Label>
                <Select value={props.symbol} onValueChange={props.setSymbol}>
                  <SelectTrigger className="bg-slate-800"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ICMARKETS_SYMBOLS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Lote Fixo</Label>
                <Input value={props.lots} onChange={e => props.setLots(e.target.value)} className="bg-slate-800" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* 3. MANTER CARD DE CREDENCIAIS EXISTENTE ABAIXO */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
            <CardTitle className="text-white">Credenciais da API (cTrader)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
            {/* ... Manter Inputs de ClientID, Secret e Token ... */}
            <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                    <Label>Client ID</Label>
                    <Input value={props.clientId} onChange={e => props.setClientId(e.target.value)} className="bg-slate-800" type="password" />
                </div>
                <div className="space-y-2">
                    <Label>Client Secret</Label>
                    <Input value={props.clientSecret} onChange={e => props.setClientSecret(e.target.value)} className="bg-slate-800" type="password" />
                </div>
                <div className="space-y-2">
                    <Label>Access Token</Label>
                    <Input value={props.accessToken} onChange={e => props.setAccessToken(e.target.value)} className="bg-slate-800" type="password" />
                </div>
                 <div className="flex items-center gap-2 mt-2">
                    <Label>Modo Demo</Label>
                    <input type="checkbox" checked={props.isDemo} onChange={e => props.setIsDemo(e.target.checked)} />
                </div>
            </div>
             <div className="pt-4">
                <button onClick={props.onTestConnection} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-500 w-full">
                    {props.isTesting ? "Testando..." : "Testar Conexão e Salvar"}
                </button>
                {props.connectionStatus && <p className="mt-2 text-sm text-slate-400">{JSON.stringify(props.connectionStatus)}</p>}
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
