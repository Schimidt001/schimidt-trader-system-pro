import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, AlertTriangle } from "lucide-react";

/**
 * Props do componente GlobalExposureSettings
 */
interface GlobalExposureSettingsProps {
  maxTotalExposurePercent: string;
  setMaxTotalExposurePercent: (value: string) => void;
  maxTradesPerSymbol: string;
  setMaxTradesPerSymbol: (value: string) => void;
}

/**
 * Componente de configurações de exposição global
 * Aparece APENAS no modo HYBRID para controlar a exposição combinada de ambas as estratégias
 */
export function GlobalExposureSettings({
  maxTotalExposurePercent,
  setMaxTotalExposurePercent,
  maxTradesPerSymbol,
  setMaxTradesPerSymbol,
}: GlobalExposureSettingsProps) {
  
  const exposureValue = parseFloat(maxTotalExposurePercent) || 7;
  
  return (
    <Card className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-900/20 border-slate-800 border-2 border-amber-500/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-lg">
            <Shield className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <CardTitle className="text-white text-lg">Gestão de Exposição Global</CardTitle>
            <CardDescription className="text-slate-400">
              Limites globais que se aplicam a AMBAS as estratégias no modo híbrido
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Aviso de Importância */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-300">
            <strong>Importante:</strong> Estes limites são aplicados globalmente, independente de qual estratégia 
            (SMC ou RSI+VWAP) abriu a posição. O robô não abrirá novas posições se os limites forem atingidos.
          </div>
        </div>
        
        {/* Campos de Configuração */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <Label className="text-slate-300 font-medium">Exposição Máxima Total (%)</Label>
            <Input
              type="number"
              min="1"
              max="20"
              step="0.5"
              value={maxTotalExposurePercent}
              onChange={(e) => setMaxTotalExposurePercent(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white text-lg h-12"
            />
            <p className="text-xs text-slate-500">
              Limite máximo de exposição combinada (SMC + RSI). Padrão: 7%
            </p>
            
            {/* Barra Visual de Exposição */}
            <div className="mt-2">
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${
                    exposureValue <= 5 ? 'bg-green-500' :
                    exposureValue <= 10 ? 'bg-amber-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(exposureValue * 5, 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-xs text-slate-500">
                <span>Conservador (≤5%)</span>
                <span>Moderado (5-10%)</span>
                <span>Agressivo ({'>'}10%)</span>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <Label className="text-slate-300 font-medium">Máx. Trades por Símbolo</Label>
            <Input
              type="number"
              min="1"
              max="5"
              value={maxTradesPerSymbol}
              onChange={(e) => setMaxTradesPerSymbol(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white text-lg h-12"
            />
            <p className="text-xs text-slate-500">
              Evita sobreexposição em um único ativo. Padrão: 1 trade por símbolo
            </p>
          </div>
        </div>
        
        {/* Exemplo Prático */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <p className="text-sm text-slate-300">
            <strong>Exemplo Prático:</strong> Com exposição máxima de {maxTotalExposurePercent}% e:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-slate-400">
            <li>• Risco SMC de 0.75% por trade → máximo de ~{Math.floor(exposureValue / 0.75)} trades SMC</li>
            <li>• Risco RSI de 1.0% por trade → máximo de ~{Math.floor(exposureValue / 1.0)} trades RSI</li>
            <li>• Combinação de ambos respeitando o limite global de {maxTotalExposurePercent}%</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
