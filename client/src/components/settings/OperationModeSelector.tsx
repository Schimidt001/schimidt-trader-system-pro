import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Layers, TrendingUp, Activity, Zap } from "lucide-react";

/**
 * Modos de operação disponíveis
 */
const OPERATION_MODES = [
  { 
    value: "SMC_ONLY", 
    label: "Apenas SMC", 
    description: "Usa apenas a estratégia Smart Money Concepts",
    badge: "CONSERVADOR",
    badgeColor: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    icon: TrendingUp,
    iconColor: "text-blue-400",
    borderColor: "border-blue-500",
    bgActive: "bg-blue-500/20",
    characteristics: [
      "Análise de estrutura de mercado (H1 → M15 → M5)",
      "Identificação de Sweep + CHoCH + Order Block",
      "Risk:Reward típico de 1:4",
      "Menor frequência de sinais, maior precisão"
    ]
  },
  { 
    value: "RSI_VWAP_ONLY", 
    label: "Apenas RSI+VWAP", 
    description: "Usa apenas a estratégia de reversão RSI+VWAP",
    badge: "AGRESSIVO",
    badgeColor: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    icon: Activity,
    iconColor: "text-orange-400",
    borderColor: "border-orange-500",
    bgActive: "bg-orange-500/20",
    characteristics: [
      "Reversão à média com RSI + VWAP",
      "Risk:Reward típico de 1:2",
      "Maior frequência de sinais",
      "Ideal para mercados laterais"
    ]
  },
  { 
    value: "HYBRID", 
    label: "Híbrido (SMC + RSI)", 
    description: "Combina ambas as estratégias com priorização SMC",
    badge: "RECOMENDADO",
    badgeColor: "bg-green-500/20 text-green-300 border-green-500/30",
    icon: Zap,
    iconColor: "text-green-400",
    borderColor: "border-green-500",
    bgActive: "bg-green-500/20",
    characteristics: [
      "SMC tem prioridade máxima sobre RSI+VWAP",
      "Sinais conflitantes (BUY vs SELL) = não operar",
      "Sinais na mesma direção = usar SMC",
      "Apenas RSI+VWAP com sinal = usar RSI+VWAP"
    ]
  },
  { 
    value: "ORB_ONLY", 
    label: "Apenas ORB Trend", 
    description: "Usa apenas a estratégia Opening Range Breakout",
    badge: "NOVO",
    badgeColor: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    icon: TrendingUp,
    iconColor: "text-purple-400",
    borderColor: "border-purple-500",
    bgActive: "bg-purple-500/20",
    characteristics: [
      "Breakout do Opening Range (primeiros 3 candles M15)",
      "Filtro de regime com EMA200 + Slope",
      "Máximo de 1 trade por dia por símbolo",
      "Risk:Reward configurável (padrão 1:1)"
    ]
  },
];

/**
 * Props do componente OperationModeSelector
 */
interface OperationModeSelectorProps {
  selectedMode: string;
  onModeChange: (mode: string) => void;
}

/**
 * Componente Master Switch para seleção do modo de operação
 * Este é o "Chefe" da tela - deve aparecer primeiro e controlar a renderização dos outros painéis
 */
export function OperationModeSelector({
  selectedMode,
  onModeChange,
}: OperationModeSelectorProps) {
  
  const currentMode = OPERATION_MODES.find(m => m.value === selectedMode);
  
  return (
    <Card className="bg-gradient-to-br from-slate-900 via-slate-900 to-purple-900/20 border-slate-800 border-2 border-purple-500/50">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Layers className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <CardTitle className="text-white text-xl">Modo de Operação</CardTitle>
            <CardDescription className="text-slate-400">
              Selecione como o robô deve operar - esta é a configuração principal
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Cards de Seleção de Modo */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {OPERATION_MODES.map((mode) => {
            const isSelected = selectedMode === mode.value;
            const Icon = mode.icon;
            
            return (
              <div
                key={mode.value}
                onClick={() => onModeChange(mode.value)}
                className={`
                  relative cursor-pointer p-4 rounded-xl border-2 transition-all duration-300
                  ${isSelected 
                    ? `${mode.bgActive} ${mode.borderColor} shadow-lg shadow-${mode.borderColor}/20` 
                    : "bg-slate-800/50 border-slate-700 hover:border-slate-600 hover:bg-slate-800"
                  }
                `}
              >
                {/* Indicador de Selecionado */}
                {isSelected && (
                  <div className="absolute -top-2 -right-2">
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center animate-pulse">
                      <span className="text-white text-xs">✓</span>
                    </div>
                  </div>
                )}
                
                {/* Ícone e Badge */}
                <div className="flex items-center justify-between mb-3">
                  <Icon className={`w-8 h-8 ${isSelected ? mode.iconColor : "text-slate-500"}`} />
                  <Badge className={mode.badgeColor}>{mode.badge}</Badge>
                </div>
                
                {/* Título */}
                <h3 className={`font-bold text-lg mb-1 ${isSelected ? "text-white" : "text-slate-300"}`}>
                  {mode.label}
                </h3>
                
                {/* Descrição */}
                <p className={`text-sm ${isSelected ? "text-slate-300" : "text-slate-500"}`}>
                  {mode.description}
                </p>
              </div>
            );
          })}
        </div>
        
        {/* Painel de Detalhes do Modo Selecionado */}
        {currentMode && (
          <div className={`rounded-lg p-4 border ${currentMode.bgActive} ${currentMode.borderColor}`}>
            <div className="flex items-center gap-2 mb-3">
              <currentMode.icon className={`w-5 h-5 ${currentMode.iconColor}`} />
              <h4 className="font-semibold text-white">
                Características do modo {currentMode.label}
              </h4>
            </div>
            <ul className="space-y-2">
              {currentMode.characteristics.map((char, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-slate-300">
                  <span className="text-green-400 mt-0.5">•</span>
                  {char}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Aviso Especial para Modo Híbrido */}
        {selectedMode === "HYBRID" && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-300">
              <strong>Lógica de Priorização no Modo Híbrido:</strong>
              <ul className="mt-2 ml-4 list-disc space-y-1">
                <li>SMC tem prioridade máxima sobre RSI+VWAP</li>
                <li>Sinais conflitantes (BUY vs SELL) = não operar</li>
                <li>Sinais na mesma direção = usar parâmetros SMC</li>
                <li>Apenas RSI+VWAP com sinal = usar RSI+VWAP</li>
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
