/**
 * DatasetSelector - Seletor de Símbolos e Timeframes com Validação de Dados
 * 
 * Componente que:
 * - Consulta o backend para obter datasets disponíveis
 * - Desabilita seleções sem dados
 * - Mostra claramente quais dados estão disponíveis
 * - Previne erros silenciosos
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import React, { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Database,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// ============================================================================
// TYPES
// ============================================================================

interface Dataset {
  symbol: string;
  timeframe: string;
  recordCount: number;
  startDate: string;
  endDate: string;
  lastUpdated: string;
}

interface DatasetSelectorProps {
  selectedSymbols: string[];
  onSymbolsChange: (symbols: string[]) => void;
  selectedTimeframe?: string;
  onTimeframeChange?: (timeframe: string) => void;
  multiSelect?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ALL_SYMBOLS = [
  "XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD",
  "USDCAD", "NZDUSD", "USDCHF", "EURJPY", "GBPJPY",
];

const ALL_TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"];

// ============================================================================
// COMPONENT
// ============================================================================

export function DatasetSelector({
  selectedSymbols,
  onSymbolsChange,
  selectedTimeframe = "M5",
  onTimeframeChange,
  multiSelect = true,
}: DatasetSelectorProps) {
  // Buscar datasets disponíveis do backend
  const { data: datasetsData, isLoading, error } = trpc.institutional.getAvailableDatasets.useQuery();

  // Mapear datasets disponíveis
  const availableDatasets = useMemo(() => {
    if (!datasetsData?.datasets) return new Map<string, Dataset>();
    
    const map = new Map<string, Dataset>();
    datasetsData.datasets.forEach((ds: Dataset) => {
      map.set(`${ds.symbol}_${ds.timeframe}`, ds);
    });
    return map;
  }, [datasetsData]);

  // Verificar se um símbolo tem dados para o timeframe selecionado
  const hasData = (symbol: string, timeframe: string = selectedTimeframe): boolean => {
    return availableDatasets.has(`${symbol}_${timeframe}`);
  };

  // Obter info do dataset
  const getDatasetInfo = (symbol: string, timeframe: string = selectedTimeframe): Dataset | undefined => {
    return availableDatasets.get(`${symbol}_${timeframe}`);
  };

  // Handler para toggle de símbolo
  const handleSymbolToggle = (symbol: string) => {
    if (!hasData(symbol)) return; // Não permite selecionar sem dados
    
    if (multiSelect) {
      if (selectedSymbols.includes(symbol)) {
        onSymbolsChange(selectedSymbols.filter(s => s !== symbol));
      } else {
        onSymbolsChange([...selectedSymbols, symbol]);
      }
    } else {
      onSymbolsChange([symbol]);
    }
  };

  // Handler para mudança de timeframe
  const handleTimeframeChange = (timeframe: string) => {
    if (onTimeframeChange) {
      onTimeframeChange(timeframe);
      // Limpar símbolos que não têm dados no novo timeframe
      const validSymbols = selectedSymbols.filter(s => availableDatasets.has(`${s}_${timeframe}`));
      if (validSymbols.length !== selectedSymbols.length) {
        onSymbolsChange(validSymbols);
      }
    }
  };

  // Contar datasets disponíveis
  const availableCount = ALL_SYMBOLS.filter(s => hasData(s)).length;

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Dados Disponíveis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Dados Disponíveis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erro ao carregar datasets</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          Dados Disponíveis
        </CardTitle>
        <CardDescription>
          {availableCount} de {ALL_SYMBOLS.length} símbolos com dados históricos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alerta de dados disponíveis */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Dados Históricos</AlertTitle>
          <AlertDescription>
            Apenas símbolos com dados históricos podem ser selecionados.
            {availableCount === 0 && (
              <span className="block mt-1 text-amber-600">
                Nenhum dado disponível. Por favor, baixe os dados históricos primeiro.
              </span>
            )}
            {availableCount > 0 && (
              <span className="block mt-1 text-green-600">
                Dados disponíveis: {Array.from(availableDatasets.values()).map(d => `${d.symbol}/${d.timeframe}`).join(", ")}
              </span>
            )}
          </AlertDescription>
        </Alert>

        {/* Seletor de Timeframe */}
        {onTimeframeChange && (
          <div>
            <label className="text-sm font-medium mb-2 block">Timeframe</label>
            <div className="flex flex-wrap gap-2">
              {ALL_TIMEFRAMES.map((tf) => {
                const hasAnyData = ALL_SYMBOLS.some(s => availableDatasets.has(`${s}_${tf}`));
                return (
                  <TooltipProvider key={tf}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant={selectedTimeframe === tf ? "default" : hasAnyData ? "outline" : "secondary"}
                          className={`cursor-pointer ${!hasAnyData ? "opacity-50 cursor-not-allowed" : ""}`}
                          onClick={() => hasAnyData && handleTimeframeChange(tf)}
                        >
                          {tf}
                          {hasAnyData ? (
                            <CheckCircle className="w-3 h-3 ml-1 text-green-500" />
                          ) : (
                            <XCircle className="w-3 h-3 ml-1 text-red-500" />
                          )}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        {hasAnyData 
                          ? `Dados disponíveis para ${tf}` 
                          : `Sem dados para ${tf}`}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          </div>
        )}

        {/* Seletor de Símbolos */}
        <div>
          <label className="text-sm font-medium mb-2 block">
            Símbolos {multiSelect ? "(múltipla seleção)" : ""}
          </label>
          <div className="flex flex-wrap gap-2">
            {ALL_SYMBOLS.map((symbol) => {
              const dataAvailable = hasData(symbol);
              const datasetInfo = getDatasetInfo(symbol);
              const isSelected = selectedSymbols.includes(symbol);
              
              return (
                <TooltipProvider key={symbol}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant={isSelected ? "default" : dataAvailable ? "outline" : "secondary"}
                        className={`cursor-pointer transition-all ${
                          !dataAvailable 
                            ? "opacity-50 cursor-not-allowed line-through" 
                            : isSelected 
                              ? "ring-2 ring-primary ring-offset-2" 
                              : "hover:bg-primary/10"
                        }`}
                        onClick={() => handleSymbolToggle(symbol)}
                      >
                        {symbol}
                        {dataAvailable ? (
                          <CheckCircle className="w-3 h-3 ml-1 text-green-500" />
                        ) : (
                          <XCircle className="w-3 h-3 ml-1 text-red-500" />
                        )}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      {dataAvailable && datasetInfo ? (
                        <div className="text-sm">
                          <div className="font-medium">{symbol} - {selectedTimeframe}</div>
                          <div>Registros: {datasetInfo.recordCount.toLocaleString()}</div>
                          <div>Período: {new Date(datasetInfo.startDate).toLocaleDateString()} - {new Date(datasetInfo.endDate).toLocaleDateString()}</div>
                        </div>
                      ) : (
                        <div className="text-sm text-red-500">
                          Sem dados históricos para {symbol}/{selectedTimeframe}
                        </div>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </div>

        {/* Resumo da seleção */}
        {selectedSymbols.length > 0 && (
          <div className="bg-muted rounded-lg p-3">
            <div className="text-sm font-medium mb-1">Selecionados:</div>
            <div className="flex flex-wrap gap-1">
              {selectedSymbols.map((symbol) => {
                const datasetInfo = getDatasetInfo(symbol);
                return (
                  <Badge key={symbol} variant="default" className="text-xs">
                    {symbol}
                    {datasetInfo && (
                      <span className="ml-1 opacity-70">
                        ({datasetInfo.recordCount.toLocaleString()} candles)
                      </span>
                    )}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Aviso se nenhum símbolo selecionado */}
        {selectedSymbols.length === 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Nenhum símbolo selecionado</AlertTitle>
            <AlertDescription>
              Selecione pelo menos um símbolo com dados disponíveis para continuar.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export default DatasetSelector;
