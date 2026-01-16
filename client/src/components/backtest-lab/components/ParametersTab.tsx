/**
 * ParametersTab - Componente para configuração de parâmetros de otimização
 * 
 * Permite ao usuário:
 * - Visualizar todos os parâmetros disponíveis por categoria
 * - Configurar ranges (min/max/step) para parâmetros numéricos
 * - Habilitar/desabilitar parâmetros para otimização
 * - Definir valores fixos para parâmetros travados
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Settings, 
  Lock, 
  Unlock, 
  Info,
  Layers,
  Target,
  Zap,
  Shield,
  Filter,
  TrendingUp,
  RotateCcw,
  Save,
  Calculator,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// ============================================================================
// TYPES
// ============================================================================

export interface ParameterDefinition {
  name: string;
  displayName: string;
  category: string;
  type: string;
  min?: number;
  max?: number;
  step?: number;
  values?: (number | string | boolean)[];
  default: number | string | boolean;
  description: string;
  unit?: string;
  enabled: boolean;
  locked: boolean;
}

export interface ParameterConfig {
  parameterId: string;
  type: "number" | "range" | "boolean" | "select";
  value?: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  enabled: boolean;
  locked: boolean;
}

interface ParametersTabProps {
  onParametersChange: (parameters: ParameterConfig[]) => void;
  strategyType: "SMC" | "HYBRID" | "RSI_VWAP";
}

// ============================================================================
// CATEGORY ICONS
// ============================================================================

const categoryIcons: Record<string, React.ReactNode> = {
  STRUCTURE: <Layers className="w-4 h-4" />,
  SWEEP: <Target className="w-4 h-4" />,
  CHOCH: <TrendingUp className="w-4 h-4" />,
  ORDER_BLOCK: <Zap className="w-4 h-4" />,
  ENTRY: <TrendingUp className="w-4 h-4" />,
  RISK: <Shield className="w-4 h-4" />,
  FILTERS: <Filter className="w-4 h-4" />,
};

const categoryLabels: Record<string, string> = {
  STRUCTURE: "Estrutura de Mercado",
  SWEEP: "Detecção de Sweep",
  CHOCH: "Quebra de Estrutura (CHoCH)",
  ORDER_BLOCK: "Order Blocks",
  ENTRY: "Confirmação de Entrada",
  RISK: "Gestão de Risco",
  FILTERS: "Filtros",
};

// ============================================================================
// COMPONENT
// ============================================================================

export function ParametersTab({ onParametersChange, strategyType }: ParametersTabProps) {
  // Buscar definições de parâmetros do backend
  const { data: parameterData, isLoading, error } = trpc.institutional.getParameterDefinitions.useQuery();
  
  // Estado local dos parâmetros configurados
  const [parameterConfigs, setParameterConfigs] = useState<Map<string, ParameterConfig>>(new Map());
  const [hasChanges, setHasChanges] = useState(false);

  // Inicializar configurações quando os dados chegarem
  useEffect(() => {
    if (parameterData?.parameters) {
      const initialConfigs = new Map<string, ParameterConfig>();
      
      parameterData.parameters.forEach((param: ParameterDefinition) => {
        const config: ParameterConfig = {
          parameterId: param.name,
          type: param.type === "BOOLEAN" ? "boolean" : 
                param.type === "ENUM" ? "select" :
                param.enabled ? "range" : "number",
          value: param.default,
          min: param.min,
          max: param.max,
          step: param.step,
          enabled: param.enabled,
          locked: param.locked,
        };
        initialConfigs.set(param.name, config);
      });
      
      setParameterConfigs(initialConfigs);
    }
  }, [parameterData]);

  // Notificar mudanças
  useEffect(() => {
    if (parameterConfigs.size > 0) {
      onParametersChange(Array.from(parameterConfigs.values()));
    }
  }, [parameterConfigs, onParametersChange]);

  // Handlers
  const handleToggleEnabled = useCallback((paramName: string) => {
    setParameterConfigs(prev => {
      const newConfigs = new Map(prev);
      const config = newConfigs.get(paramName);
      if (config && !config.locked) {
        newConfigs.set(paramName, { ...config, enabled: !config.enabled });
        setHasChanges(true);
      }
      return newConfigs;
    });
  }, []);

  const handleToggleLocked = useCallback((paramName: string) => {
    setParameterConfigs(prev => {
      const newConfigs = new Map(prev);
      const config = newConfigs.get(paramName);
      if (config) {
        newConfigs.set(paramName, { 
          ...config, 
          locked: !config.locked,
          enabled: config.locked ? config.enabled : false, // Se travar, desabilita otimização
        });
        setHasChanges(true);
      }
      return newConfigs;
    });
  }, []);

  const handleValueChange = useCallback((paramName: string, value: number | string | boolean) => {
    setParameterConfigs(prev => {
      const newConfigs = new Map(prev);
      const config = newConfigs.get(paramName);
      if (config) {
        newConfigs.set(paramName, { ...config, value });
        setHasChanges(true);
      }
      return newConfigs;
    });
  }, []);

  const handleRangeChange = useCallback((paramName: string, field: "min" | "max" | "step", value: number) => {
    setParameterConfigs(prev => {
      const newConfigs = new Map(prev);
      const config = newConfigs.get(paramName);
      if (config) {
        newConfigs.set(paramName, { ...config, [field]: value });
        setHasChanges(true);
      }
      return newConfigs;
    });
  }, []);

  const handleResetToDefaults = useCallback(() => {
    if (parameterData?.parameters) {
      const defaultConfigs = new Map<string, ParameterConfig>();
      
      parameterData.parameters.forEach((param: ParameterDefinition) => {
        const config: ParameterConfig = {
          parameterId: param.name,
          type: param.type === "BOOLEAN" ? "boolean" : 
                param.type === "ENUM" ? "select" :
                param.enabled ? "range" : "number",
          value: param.default,
          min: param.min,
          max: param.max,
          step: param.step,
          enabled: param.enabled,
          locked: param.locked,
        };
        defaultConfigs.set(param.name, config);
      });
      
      setParameterConfigs(defaultConfigs);
      setHasChanges(false);
    }
  }, [parameterData]);

  // Calcular número de combinações
  const calculateCombinations = useCallback(() => {
    let combinations = 1;
    parameterConfigs.forEach((config) => {
      if (config.enabled && !config.locked && config.type === "range" && config.min !== undefined && config.max !== undefined && config.step !== undefined) {
        const steps = Math.floor((config.max - config.min) / config.step) + 1;
        combinations *= steps;
      }
    });
    return combinations;
  }, [parameterConfigs]);

  // Agrupar parâmetros por categoria
  const groupedParameters = React.useMemo(() => {
    if (!parameterData?.parameters) return {};
    
    const grouped: Record<string, ParameterDefinition[]> = {};
    parameterData.parameters.forEach((param: ParameterDefinition) => {
      if (!grouped[param.category]) {
        grouped[param.category] = [];
      }
      grouped[param.category].push(param);
    });
    return grouped;
  }, [parameterData]);

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-3">Carregando parâmetros...</span>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Erro ao carregar parâmetros</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  const totalCombinations = calculateCombinations();
  const enabledCount = Array.from(parameterConfigs.values()).filter(c => c.enabled && !c.locked).length;

  return (
    <div className="space-y-6">
      {/* Header com estatísticas */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Parâmetros de Otimização
              </CardTitle>
              <CardDescription>
                Configure os ranges de parâmetros para o Grid Search - Estratégia: {strategyType}
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetToDefaults}
                disabled={!hasChanges}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Restaurar Padrões
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-muted rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-primary">{enabledCount}</div>
              <div className="text-sm text-muted-foreground">Parâmetros Ativos</div>
            </div>
            <div className="bg-muted rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-primary">
                {totalCombinations.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">Combinações Estimadas</div>
            </div>
            <div className="bg-muted rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-primary">
                ~{Math.ceil(totalCombinations * 0.5 / 60)} min
              </div>
              <div className="text-sm text-muted-foreground">Tempo Estimado</div>
            </div>
          </div>
          
          {totalCombinations > 10000 && (
            <Alert className="mt-4" variant="destructive">
              <Calculator className="h-4 w-4" />
              <AlertTitle>Muitas Combinações</AlertTitle>
              <AlertDescription>
                O número de combinações é muito alto. Considere reduzir os ranges ou desabilitar alguns parâmetros para otimização mais rápida.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Parâmetros por categoria */}
      <Accordion type="multiple" defaultValue={Object.keys(groupedParameters)} className="space-y-2">
        {Object.entries(groupedParameters).map(([category, params]) => (
          <AccordionItem key={category} value={category} className="border rounded-lg">
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex items-center gap-2">
                {categoryIcons[category] || <Settings className="w-4 h-4" />}
                <span className="font-medium">{categoryLabels[category] || category}</span>
                <Badge variant="secondary" className="ml-2">
                  {params.filter(p => parameterConfigs.get(p.name)?.enabled).length}/{params.length}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="space-y-4">
                {params.map((param) => {
                  const config = parameterConfigs.get(param.name);
                  if (!config) return null;

                  return (
                    <div 
                      key={param.name} 
                      className={`p-4 border rounded-lg ${config.locked ? 'bg-muted/50' : ''}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Label className="font-medium">{param.displayName}</Label>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Info className="w-4 h-4 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs">{param.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            {param.unit && (
                              <Badge variant="outline" className="text-xs">
                                {param.unit}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {param.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleToggleLocked(param.name)}
                                >
                                  {config.locked ? (
                                    <Lock className="w-4 h-4 text-amber-500" />
                                  ) : (
                                    <Unlock className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {config.locked ? "Desbloquear parâmetro" : "Travar valor fixo"}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Switch
                            checked={config.enabled}
                            onCheckedChange={() => handleToggleEnabled(param.name)}
                            disabled={config.locked}
                          />
                        </div>
                      </div>

                      {/* Configuração do parâmetro */}
                      {param.type === "BOOLEAN" ? (
                        <div className="flex items-center gap-4">
                          <Label>Valor:</Label>
                          <Switch
                            checked={config.value as boolean}
                            onCheckedChange={(checked) => handleValueChange(param.name, checked)}
                            disabled={!config.locked && config.enabled}
                          />
                          <span className="text-sm text-muted-foreground">
                            {config.value ? "Habilitado" : "Desabilitado"}
                          </span>
                        </div>
                      ) : param.type === "ENUM" && param.values ? (
                        <div className="flex items-center gap-4">
                          <Label>Valor:</Label>
                          <select
                            value={config.value as string}
                            onChange={(e) => handleValueChange(param.name, e.target.value)}
                            className="px-3 py-2 border rounded-md"
                            disabled={!config.locked && config.enabled}
                          >
                            {param.values.map((v) => (
                              <option key={String(v)} value={String(v)}>
                                {String(v)}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : config.locked ? (
                        // Valor fixo
                        <div className="flex items-center gap-4">
                          <Label>Valor Fixo:</Label>
                          <Input
                            type="number"
                            value={config.value as number}
                            onChange={(e) => handleValueChange(param.name, parseFloat(e.target.value))}
                            className="w-32"
                            step={param.step}
                            min={param.min}
                            max={param.max}
                          />
                          {param.unit && <span className="text-sm text-muted-foreground">{param.unit}</span>}
                        </div>
                      ) : config.enabled ? (
                        // Range para otimização
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <Label className="text-xs text-muted-foreground">Mínimo</Label>
                            <Input
                              type="number"
                              value={config.min}
                              onChange={(e) => handleRangeChange(param.name, "min", parseFloat(e.target.value))}
                              step={param.step}
                              min={param.min}
                              max={config.max}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Máximo</Label>
                            <Input
                              type="number"
                              value={config.max}
                              onChange={(e) => handleRangeChange(param.name, "max", parseFloat(e.target.value))}
                              step={param.step}
                              min={config.min}
                              max={param.max}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Passo</Label>
                            <Input
                              type="number"
                              value={config.step}
                              onChange={(e) => handleRangeChange(param.name, "step", parseFloat(e.target.value))}
                              step={param.step}
                              min={0.1}
                            />
                          </div>
                          <div className="col-span-3">
                            <div className="text-xs text-muted-foreground mt-1">
                              Range: {config.min} → {config.max} (passo: {config.step})
                              {config.min !== undefined && config.max !== undefined && config.step !== undefined && (
                                <span className="ml-2">
                                  = {Math.floor((config.max - config.min) / config.step) + 1} valores
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        // Parâmetro desabilitado - mostra valor default
                        <div className="flex items-center gap-4 opacity-50">
                          <Label>Valor Default:</Label>
                          <span className="font-mono">{String(param.default)}</span>
                          {param.unit && <span className="text-sm text-muted-foreground">{param.unit}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

export default ParametersTab;
