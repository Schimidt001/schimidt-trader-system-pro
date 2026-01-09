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
import { Badge } from "@/components/ui/badge";
import { Layers, AlertTriangle, Info } from "lucide-react";

/**
 * Modos de operação híbrida
 */
const HYBRID_MODES = [
  { 
    value: "SMC_ONLY", 
    label: "Apenas SMC", 
    description: "Usa apenas a estratégia Smart Money Concepts",
    badge: "CONSERVADOR",
    badgeColor: "bg-blue-500/20 text-blue-300 border-blue-500/30"
  },
  { 
    value: "RSI_VWAP_ONLY", 
    label: "Apenas RSI+VWAP", 
    description: "Usa apenas a estratégia de reversão RSI+VWAP",
    badge: "AGRESSIVO",
    badgeColor: "bg-orange-500/20 text-orange-300 border-orange-500/30"
  },
  { 
    value: "HYBRID", 
    label: "Híbrido (SMC + RSI)", 
    description: "Combina ambas as estratégias com priorização SMC",
    badge: "RECOMENDADO",
    badgeColor: "bg-green-500/20 text-green-300 border-green-500/30"
  },
];

/**
 * Props do componente HybridModeSettings
 */
interface HybridModeSettingsProps {
  hybridMode: string;
  setHybridMode: (mode: string) => void;
  maxTotalExposurePercent: string;
  setMaxTotalExposurePercent: (value: string) => void;
  maxTradesPerSymbol: string;
  setMaxTradesPerSymbol: (value: string) => void;
}

/**
 * Componente de configurações do modo híbrido
 * Permite selecionar o modo de operação e configurar exposição
 */
export function HybridModeSettings({
  hybridMode,
  setHybridMode,
  maxTotalExposurePercent,
  setMaxTotalExposurePercent,
  maxTradesPerSymbol,
  setMaxTradesPerSymbol,
}: HybridModeSettingsProps) {
  
  const selectedMode = HYBRID_MODES.find(m => m.value === hybridMode);
  
  return (
    <div className="space-y-6">
      {/* Card de Seleção de Modo */}
      <Card className="bg-slate-900/50 border-slate-800 border-l-4 border-l-purple-500">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-purple-400" />
            <div>
              <CardTitle className="text-white">Modo de Operação Híbrido</CardTitle>
              <CardDescription className="text-slate-400">
                Selecione como as estratégias SMC e RSI+VWAP devem operar
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-slate-300">Modo Ativo</Label>
            <Select value={hybridMode} onValueChange={setHybridMode}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HYBRID_MODES.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    <div className="flex items-center gap-2">
                      <Badge className={mode.badgeColor}>{mode.badge}</Badge>
                      {mode.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {selectedMode && (
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
              <p className="text-sm text-purple-300">
                <strong>{selectedMode.label}:</strong> {selectedMode.description}
              </p>
            </div>
          )}
          
          {hybridMode === "HYBRID" && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-300">
                <strong>Lógica de Priorização:</strong>
                <ul className="mt-1 ml-4 list-disc space-y-1">
                  <li>SMC tem prioridade máxima sobre RSI+VWAP</li>
                  <li>Sinais conflitantes (BUY vs SELL) = não operar</li>
                  <li>Sinais na mesma direção = usar SMC</li>
                  <li>Apenas RSI+VWAP com sinal = usar RSI+VWAP</li>
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card de Exposição Global */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Info className="w-5 h-5 text-slate-400" />
            <div>
              <CardTitle className="text-white">Controle de Exposição Global</CardTitle>
              <CardDescription className="text-slate-400">
                Limites globais para ambas as estratégias
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Exposição Máxima Total (%)</Label>
              <Input
                type="number"
                min="1"
                max="20"
                step="0.5"
                value={maxTotalExposurePercent}
                onChange={(e) => setMaxTotalExposurePercent(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">
                Limite máximo de exposição combinada (SMC + RSI)
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Máx. Trades por Símbolo</Label>
              <Input
                type="number"
                min="1"
                max="5"
                value={maxTradesPerSymbol}
                onChange={(e) => setMaxTradesPerSymbol(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">
                Evita sobreexposição em um único ativo
              </p>
            </div>
          </div>
          
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
            <p className="text-sm text-slate-300">
              <strong>Exemplo:</strong> Com exposição máxima de 7% e risco de 2% por trade SMC + 1% por trade RSI, 
              você pode ter no máximo ~2-3 posições abertas simultaneamente.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
