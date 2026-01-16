/**
 * DataDownloadManager - Gestão de Dados Históricos do Laboratório Plus
 * 
 * Componente unificado para:
 * - Visualização do status dos dados por símbolo
 * - Download multi-timeframe (M5, M15, H1) - obrigatório para estratégia
 * - Validação de integridade e alinhamento temporal
 * - Indicadores visuais de completude
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import React, { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Database,
  Download,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Calendar,
  HardDrive,
  Info,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ============================================================================
// TYPES
// ============================================================================

interface DatasetInfo {
  symbol: string;
  timeframe: string;
  recordCount: number;
  startDate: string;
  endDate: string;
  lastUpdated: string;
}

interface SymbolDataStatus {
  symbol: string;
  hasM5: boolean;
  hasM15: boolean;
  hasH1: boolean;
  isComplete: boolean;
  m5Info?: DatasetInfo;
  m15Info?: DatasetInfo;
  h1Info?: DatasetInfo;
  dateRangeAligned: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const REQUIRED_TIMEFRAMES = ["M5", "M15", "H1"];

const AVAILABLE_SYMBOLS = [
  { value: "XAUUSD", label: "XAUUSD (Ouro)" },
  { value: "EURUSD", label: "EURUSD" },
  { value: "GBPUSD", label: "GBPUSD" },
  { value: "USDJPY", label: "USDJPY" },
  { value: "AUDUSD", label: "AUDUSD" },
  { value: "USDCAD", label: "USDCAD" },
  { value: "NZDUSD", label: "NZDUSD" },
  { value: "USDCHF", label: "USDCHF" },
  { value: "EURJPY", label: "EURJPY" },
  { value: "GBPJPY", label: "GBPJPY" },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function DataDownloadManager() {
  // State
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(["XAUUSD"]);
  const [monthsBack, setMonthsBack] = useState(6);

  // Queries
  const datasetsQuery = trpc.institutional.getAvailableDatasets.useQuery();
  const downloadStatusQuery = trpc.backtest.getDownloadStatus.useQuery(undefined, {
    refetchInterval: 1000,
  });

  // Mutation
  const downloadMutation = trpc.backtest.downloadData.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      datasetsQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Erro no download: ${error.message}`);
    },
  });

  // Derived state
  const isDownloading = downloadStatusQuery.data?.isDownloading || downloadMutation.isPending;

  // Process datasets into symbol status
  const symbolStatuses = useMemo((): SymbolDataStatus[] => {
    const datasets = datasetsQuery.data?.datasets || [];
    
    return AVAILABLE_SYMBOLS.map(({ value: symbol }) => {
      const m5 = datasets.find(d => d.symbol === symbol && d.timeframe === "M5");
      const m15 = datasets.find(d => d.symbol === symbol && d.timeframe === "M15");
      const h1 = datasets.find(d => d.symbol === symbol && d.timeframe === "H1");
      
      const hasM5 = !!m5;
      const hasM15 = !!m15;
      const hasH1 = !!h1;
      const isComplete = hasM5 && hasM15 && hasH1;
      
      // Check date range alignment
      let dateRangeAligned = false;
      if (isComplete && m5 && m15 && h1) {
        const startDates = [new Date(m5.startDate), new Date(m15.startDate), new Date(h1.startDate)];
        const endDates = [new Date(m5.endDate), new Date(m15.endDate), new Date(h1.endDate)];
        
        const maxStart = new Date(Math.max(...startDates.map(d => d.getTime())));
        const minEnd = new Date(Math.min(...endDates.map(d => d.getTime())));
        
        // Consider aligned if overlap is at least 80% of the smallest range
        const overlapDays = (minEnd.getTime() - maxStart.getTime()) / (1000 * 60 * 60 * 24);
        dateRangeAligned = overlapDays > 30; // At least 30 days overlap
      }
      
      return {
        symbol,
        hasM5,
        hasM15,
        hasH1,
        isComplete,
        m5Info: m5,
        m15Info: m15,
        h1Info: h1,
        dateRangeAligned,
      };
    });
  }, [datasetsQuery.data]);

  // Count complete symbols
  const completeSymbolsCount = symbolStatuses.filter(s => s.isComplete).length;

  // Handlers
  const handleToggleSymbol = (symbol: string) => {
    setSelectedSymbols(prev => 
      prev.includes(symbol) 
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol]
    );
  };

  const handleDownload = () => {
    if (selectedSymbols.length === 0) {
      toast.error("Selecione pelo menos um símbolo");
      return;
    }

    downloadMutation.mutate({
      symbols: selectedSymbols,
      timeframes: REQUIRED_TIMEFRAMES, // Sempre M5, M15, H1
      monthsBack,
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString('pt-BR');
  };

  // Render
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          Dados Históricos
        </CardTitle>
        <CardDescription>
          Gestão de dados para análise multi-timeframe (M5 + M15 + H1)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Info Alert */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Requisito da Estratégia</AlertTitle>
          <AlertDescription>
            A estratégia SMC requer dados em três timeframes alinhados temporalmente:
            <ul className="mt-2 ml-4 list-disc text-sm">
              <li><strong>M5</strong> - Execução e entradas</li>
              <li><strong>M15</strong> - Confirmação estrutural</li>
              <li><strong>H1</strong> - Contexto macro / bias</li>
            </ul>
          </AlertDescription>
        </Alert>

        {/* Status Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-primary">
              {completeSymbolsCount}/{AVAILABLE_SYMBOLS.length}
            </div>
            <div className="text-sm text-muted-foreground">Símbolos Completos</div>
          </div>
          <div className="bg-muted rounded-lg p-4 text-center">
            <div className="text-2xl font-bold">
              {datasetsQuery.data?.datasets?.length || 0}
            </div>
            <div className="text-sm text-muted-foreground">Arquivos de Dados</div>
          </div>
          <div className="bg-muted rounded-lg p-4 text-center">
            <div className="text-2xl font-bold">
              {formatNumber(
                datasetsQuery.data?.datasets?.reduce((acc, d) => acc + d.recordCount, 0) || 0
              )}
            </div>
            <div className="text-sm text-muted-foreground">Total de Candles</div>
          </div>
          <div className="bg-muted rounded-lg p-4 text-center">
            <div className={`text-2xl font-bold ${isDownloading ? "text-amber-500" : "text-green-500"}`}>
              {isDownloading ? "Baixando..." : "Pronto"}
            </div>
            <div className="text-sm text-muted-foreground">Status</div>
          </div>
        </div>

        {/* Download Progress */}
        {isDownloading && (
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {downloadStatusQuery.data?.currentSymbol} - {downloadStatusQuery.data?.currentTimeframe}
              </span>
              <span className="font-medium">{downloadStatusQuery.data?.progress || 0}%</span>
            </div>
            <Progress value={downloadStatusQuery.data?.progress || 0} className="h-2" />
          </div>
        )}

        {/* Symbol Status Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Símbolo</TableHead>
                <TableHead className="text-center">M5</TableHead>
                <TableHead className="text-center">M15</TableHead>
                <TableHead className="text-center">H1</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead>Período</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {symbolStatuses.map((status) => (
                <TableRow key={status.symbol}>
                  <TableCell>
                    <Checkbox
                      checked={selectedSymbols.includes(status.symbol)}
                      onCheckedChange={() => handleToggleSymbol(status.symbol)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{status.symbol}</TableCell>
                  <TableCell className="text-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          {status.hasM5 ? (
                            <CheckCircle className="w-5 h-5 text-green-500 inline" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-500 inline" />
                          )}
                        </TooltipTrigger>
                        <TooltipContent>
                          {status.m5Info 
                            ? `${formatNumber(status.m5Info.recordCount)} candles`
                            : "Sem dados"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="text-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          {status.hasM15 ? (
                            <CheckCircle className="w-5 h-5 text-green-500 inline" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-500 inline" />
                          )}
                        </TooltipTrigger>
                        <TooltipContent>
                          {status.m15Info 
                            ? `${formatNumber(status.m15Info.recordCount)} candles`
                            : "Sem dados"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="text-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          {status.hasH1 ? (
                            <CheckCircle className="w-5 h-5 text-green-500 inline" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-500 inline" />
                          )}
                        </TooltipTrigger>
                        <TooltipContent>
                          {status.h1Info 
                            ? `${formatNumber(status.h1Info.recordCount)} candles`
                            : "Sem dados"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="text-center">
                    {status.isComplete ? (
                      status.dateRangeAligned ? (
                        <Badge variant="default" className="bg-green-600">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Completo
                        </Badge>
                      ) : (
                        <Badge variant="default" className="bg-amber-600">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Desalinhado
                        </Badge>
                      )
                    ) : (
                      <Badge variant="destructive">
                        <XCircle className="w-3 h-3 mr-1" />
                        Incompleto
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {status.m5Info ? (
                      <>
                        {formatDate(status.m5Info.startDate)} - {formatDate(status.m5Info.endDate)}
                      </>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Download Configuration */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Configuração de Download</h4>
              <p className="text-sm text-muted-foreground">
                Selecione os símbolos acima e configure o período
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Meses:</label>
                <select
                  value={monthsBack}
                  onChange={(e) => setMonthsBack(parseInt(e.target.value))}
                  className="px-3 py-1 border rounded-md bg-background"
                  disabled={isDownloading}
                >
                  <option value={3}>3 meses</option>
                  <option value={6}>6 meses</option>
                  <option value={12}>12 meses</option>
                  <option value={24}>24 meses</option>
                </select>
              </div>
            </div>
          </div>

          {/* Selected Symbols */}
          <div className="flex flex-wrap gap-2">
            {selectedSymbols.length > 0 ? (
              selectedSymbols.map(symbol => (
                <Badge key={symbol} variant="outline">
                  {symbol}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">
                Nenhum símbolo selecionado
              </span>
            )}
          </div>

          {/* Download Button */}
          <Button
            onClick={handleDownload}
            disabled={isDownloading || selectedSymbols.length === 0}
            className="w-full"
            size="lg"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Baixando M5 + M15 + H1...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Baixar Dados Históricos ({selectedSymbols.length} símbolo{selectedSymbols.length !== 1 ? 's' : ''})
              </>
            )}
          </Button>

          {/* Timeframes Info */}
          <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Badge variant="secondary" className="text-xs">M5</Badge>
              Execução
            </span>
            <span className="flex items-center gap-1">
              <Badge variant="secondary" className="text-xs">M15</Badge>
              Confirmação
            </span>
            <span className="flex items-center gap-1">
              <Badge variant="secondary" className="text-xs">H1</Badge>
              Contexto
            </span>
          </div>
        </div>

        {/* Errors Display */}
        {downloadStatusQuery.data?.errors && downloadStatusQuery.data.errors.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erros no Download</AlertTitle>
            <AlertDescription>
              <ul className="mt-2 list-disc ml-4">
                {downloadStatusQuery.data.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export default DataDownloadManager;
