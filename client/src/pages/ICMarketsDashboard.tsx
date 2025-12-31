/**
 * IC Markets Dashboard
 * 
 * Página principal para operações Forex via IC Markets/cTrader
 * Inclui: Preços em tempo real, análise de sinais, posições abertas
 * 
 * IMPORTANTE: Botões de Conectar e Iniciar Robô são INDEPENDENTES
 * - Conectar: Apenas estabelece conexão WebSocket
 * - Iniciar Robô: Ativa o loop de trading automático (requer conexão)
 */

import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { SmartChart } from "@/components/SmartChart";
import { ChartDrawingTools, DrawingLine, Annotation } from "@/components/ChartDrawingTools";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  Target,
  AlertTriangle,
  RefreshCw,
  Wifi,
  WifiOff,
  ArrowUpCircle,
  ArrowDownCircle,
  Bot,
  Power,
  Play,
  Square,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

// Símbolos principais para trading
const FOREX_SYMBOLS = [
  { value: "USDJPY", label: "USD/JPY", pip: 0.01 },
  { value: "EURUSD", label: "EUR/USD", pip: 0.0001 },
  { value: "GBPUSD", label: "GBP/USD", pip: 0.0001 },
  { value: "AUDUSD", label: "AUD/USD", pip: 0.0001 },
  { value: "USDCAD", label: "USD/CAD", pip: 0.0001 },
  { value: "USDCHF", label: "USD/CHF", pip: 0.0001 },
  { value: "EURJPY", label: "EUR/JPY", pip: 0.01 },
  { value: "GBPJPY", label: "GBP/JPY", pip: 0.01 },
];

export default function ICMarketsDashboard() {
  // Estado de conexão e trading - INDEPENDENTES
  const [selectedSymbol, setSelectedSymbol] = useState("USDJPY");
  const [selectedTimeframe, setSelectedTimeframe] = useState("M15");
  const [orderLots, setOrderLots] = useState("0.01");
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  
  // Estado para ferramentas de desenho do gráfico
  const [drawingLines, setDrawingLines] = useState<DrawingLine[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [showEMA200, setShowEMA200] = useState(true);
  const [showRSI, setShowRSI] = useState(true);
  
  // Queries
  const connectionStatus = trpc.icmarkets.getConnectionStatus.useQuery(undefined, {
    refetchInterval: 3000,
  });
  
  // Query para status do bot (separado da conexão)
  const botStatus = trpc.icmarkets.getBotStatus.useQuery(undefined, {
    refetchInterval: 2000,
  });
  
  const priceQuery = trpc.icmarkets.getPrice.useQuery(
    { symbol: selectedSymbol },
    {
      enabled: connectionStatus.data?.connected === true,
      refetchInterval: 1000,
    }
  );
  
  const signalQuery = trpc.icmarkets.analyzeSignal.useQuery(
    { symbol: selectedSymbol, timeframe: selectedTimeframe },
    {
      enabled: connectionStatus.data?.connected === true,
      refetchInterval: 60000, // Atualizar a cada minuto
    }
  );
  
  const positionsQuery = trpc.icmarkets.getOpenPositions.useQuery(undefined, {
    enabled: connectionStatus.data?.connected === true,
    refetchInterval: 5000,
  });
  
  const strategyConfig = trpc.icmarkets.getStrategyConfig.useQuery(undefined, {
    enabled: connectionStatus.data?.connected === true,
  });
  
  // Query para buscar candles (trendbars) para o gráfico
  // CORREÇÃO: Aumentado para 1000 candles para suportar EMA 200 e outros indicadores de longo prazo
  const candlesQuery = trpc.icmarkets.getCandleHistory.useQuery(
    { symbol: selectedSymbol, timeframe: selectedTimeframe, count: 1000 },
    {
      enabled: connectionStatus.data?.connected === true,
      refetchInterval: 60000, // Atualizar a cada minuto
      staleTime: 30000,
    }
  );
  
  // Preparar dados do gráfico - memoizado para evitar re-renders desnecessários
  const chartData = useMemo(() => {
    if (!candlesQuery.data) return [];
    return candlesQuery.data.map((candle: any) => ({
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));
  }, [candlesQuery.data]);
  
  // Mutations - CONEXÃO
  const connectMutation = trpc.icmarkets.connect.useMutation({
    onSuccess: () => {
      connectionStatus.refetch();
      toast.success("Conectado ao IC Markets com sucesso!");
    },
    onError: (error) => {
      toast.error(`Erro ao conectar: ${error.message}`);
    },
  });
  
  const disconnectMutation = trpc.icmarkets.disconnect.useMutation({
    onSuccess: () => {
      connectionStatus.refetch();
      botStatus.refetch();
      toast.info("Desconectado do IC Markets");
    },
  });
  
  // Mutations - BOT (INDEPENDENTE DA CONEXÃO)
  const startBotMutation = trpc.icmarkets.startBot.useMutation({
    onSuccess: () => {
      botStatus.refetch();
      toast.success("🤖 Robô iniciado! Monitorando mercado...");
    },
    onError: (error) => {
      toast.error(`Erro ao iniciar robô: ${error.message}`);
    },
  });
  
  const stopBotMutation = trpc.icmarkets.stopBot.useMutation({
    onSuccess: () => {
      botStatus.refetch();
      toast.info("🛑 Robô parado");
    },
    onError: (error) => {
      toast.error(`Erro ao parar robô: ${error.message}`);
    },
  });
  
  const placeOrderMutation = trpc.icmarkets.placeOrder.useMutation({
    onSuccess: () => {
      positionsQuery.refetch();
      setIsPlacingOrder(false);
      toast.success("Ordem executada com sucesso!");
    },
    onError: (error) => {
      setIsPlacingOrder(false);
      toast.error(`Erro ao executar ordem: ${error.message}`);
    },
  });
  
  const closePositionMutation = trpc.icmarkets.closePosition.useMutation({
    onSuccess: () => {
      positionsQuery.refetch();
      toast.success("Posição fechada");
    },
  });
  
  // Handlers - CONEXÃO (apenas WebSocket)
  const handleConnect = () => {
    connectMutation.mutate();
  };
  
  const handleDisconnect = () => {
    // Se o bot estiver rodando, parar primeiro
    if (botStatus.data?.isRunning) {
      stopBotMutation.mutate();
    }
    disconnectMutation.mutate();
  };
  
  // Handlers - BOT (trading automático)
  const handleStartBot = () => {
    startBotMutation.mutate({
      symbol: selectedSymbol,
      timeframe: selectedTimeframe,
    });
  };
  
  const handleStopBot = () => {
    stopBotMutation.mutate();
  };
  
  const handlePlaceOrder = (direction: "BUY" | "SELL") => {
    setIsPlacingOrder(true);
    placeOrderMutation.mutate({
      symbol: selectedSymbol,
      direction,
      lots: parseFloat(orderLots),
      stopLossPips: strategyConfig.data?.stopLossPips || 15,
      comment: `Trend Sniper - ${direction}`,
    });
  };
  
  const handleClosePosition = (positionId: string) => {
    closePositionMutation.mutate({ positionId });
  };
  
  // Calcular spread em pips
  const calculateSpread = () => {
    if (!priceQuery.data) return 0;
    const symbolInfo = FOREX_SYMBOLS.find(s => s.value === selectedSymbol);
    const pipValue = symbolInfo?.pip || 0.0001;
    return ((priceQuery.data.ask - priceQuery.data.bid) / pipValue).toFixed(1);
  };
  
  const isConnected = connectionStatus.data?.connected === true;
  const isBotRunning = botStatus.data?.isRunning === true;
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <span className="text-4xl">💹</span>
              IC Markets Dashboard
            </h1>
            <p className="text-slate-400 mt-1">
              Forex Spot Trading via cTrader Open API
            </p>
          </div>
          
          {/* Controles de Conexão e Bot - SEPARADOS */}
          <div className="flex items-center gap-4">
            {/* Status de Conexão */}
            <Badge
              variant={isConnected ? "default" : "destructive"}
              className={`px-4 py-2 text-sm ${
                isConnected ? "bg-green-500/20 text-green-400 border-green-500/30" : ""
              }`}
            >
              {isConnected ? (
                <>
                  <Wifi className="w-4 h-4 mr-2" />
                  Conectado
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 mr-2" />
                  Desconectado
                </>
              )}
            </Badge>
            
            {/* Status do Bot */}
            {isConnected && (
              <Badge
                variant={isBotRunning ? "default" : "secondary"}
                className={`px-4 py-2 text-sm ${
                  isBotRunning 
                    ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30 animate-pulse" 
                    : "bg-slate-700/50 text-slate-400"
                }`}
              >
                <Bot className="w-4 h-4 mr-2" />
                {isBotRunning ? "Robô Ativo" : "Robô Parado"}
              </Badge>
            )}
            
            {/* Botão de Conexão */}
            {isConnected ? (
              <Button
                variant="outline"
                onClick={handleDisconnect}
                disabled={disconnectMutation.isPending}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                {disconnectMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Power className="w-4 h-4 mr-2" />
                    Desconectar
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleConnect}
                disabled={connectMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {connectMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Wifi className="w-4 h-4 mr-2" />
                )}
                Conectar
              </Button>
            )}
            
            {/* Botão do Bot - INDEPENDENTE (só aparece se conectado) */}
            {isConnected && (
              isBotRunning ? (
                <Button
                  variant="destructive"
                  onClick={handleStopBot}
                  disabled={stopBotMutation.isPending}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {stopBotMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Square className="w-4 h-4 mr-2" />
                  )}
                  Parar Robô
                </Button>
              ) : (
                <Button
                  onClick={handleStartBot}
                  disabled={startBotMutation.isPending}
                  className="bg-cyan-600 hover:bg-cyan-700"
                >
                  {startBotMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  Iniciar Robô
                </Button>
              )
            )}
          </div>
        </div>
        
        {/* Card de Status do Bot (quando ativo) */}
        {isConnected && isBotRunning && botStatus.data && (
          <Card className="bg-cyan-900/20 border-cyan-500/30">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-cyan-400 rounded-full animate-pulse"></div>
                    <span className="text-cyan-400 font-medium">Robô em Execução</span>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Símbolo</p>
                    <p className="text-white font-mono">{botStatus.data.symbol || selectedSymbol}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Timeframe</p>
                    <p className="text-white">{botStatus.data.timeframe || selectedTimeframe}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Último Tick</p>
                    <p className="text-white font-mono">
                      {botStatus.data.lastTickPrice?.toFixed(5) || "Aguardando..."}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Último Sinal</p>
                    <p className={`font-bold ${
                      botStatus.data.lastSignal === "BUY" ? "text-green-400" :
                      botStatus.data.lastSignal === "SELL" ? "text-red-400" :
                      "text-slate-400"
                    }`}>
                      {botStatus.data.lastSignal || "NEUTRO"}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Análises</p>
                    <p className="text-white">{botStatus.data.analysisCount || 0}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Ticks</p>
                    <p className="text-cyan-400 font-mono">{botStatus.data.tickCount || 0}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Trades</p>
                    <p className="text-yellow-400 font-bold">{botStatus.data.tradesExecuted || 0}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Informações da Conta */}
        {isConnected && connectionStatus.data?.accountInfo && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-slate-400 text-sm">Conta</p>
                    <p className="text-white font-mono">
                      {connectionStatus.data.accountInfo.accountId}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Saldo</p>
                    <p className="text-white font-bold text-lg">
                      {connectionStatus.data.accountInfo.currency}{" "}
                      {connectionStatus.data.accountInfo.balance?.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Alavancagem</p>
                    <p className="text-white">
                      1:{connectionStatus.data.accountInfo.leverage}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Tipo</p>
                    <Badge variant={connectionStatus.data.accountInfo.accountType === "demo" ? "secondary" : "destructive"}>
                      {connectionStatus.data.accountInfo.accountType?.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Grid Principal */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna 1: Preços e Sinal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Seletor de Símbolo e Timeframe */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <Label className="text-slate-400 text-sm">Par de Moedas</Label>
                    <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FOREX_SYMBOLS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Label className="text-slate-400 text-sm">Timeframe</Label>
                    <Select value={selectedTimeframe} onValueChange={setSelectedTimeframe}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M1">M1</SelectItem>
                        <SelectItem value="M5">M5</SelectItem>
                        <SelectItem value="M15">M15</SelectItem>
                        <SelectItem value="M30">M30</SelectItem>
                        <SelectItem value="H1">H1</SelectItem>
                        <SelectItem value="H4">H4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      priceQuery.refetch();
                      signalQuery.refetch();
                    }}
                    className="mt-6"
                  >
                    <RefreshCw className={`w-4 h-4 ${priceQuery.isFetching ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            {/* Gráfico de Candles */}
            {isConnected && (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-cyan-400" />
                    Gráfico {selectedSymbol} - {selectedTimeframe}
                  </CardTitle>
                  <CardDescription className="text-slate-400">
Últimos 1000 candles | EMA 200 + RSI 14 | Candle atual em tempo real
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {candlesQuery.isLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-[1fr_280px] gap-4">
                      <SmartChart
                        data={chartData}
                        currentPrice={priceQuery.data?.bid || null}
                        currentOpen={chartData.length > 0 ? chartData[chartData.length - 1]?.open : null}
                        openPositions={(positionsQuery.data?.live || []) as any}
                        symbol={selectedSymbol}
                        timeframe={selectedTimeframe}
                        height={500}
                        showEMA200={showEMA200}
                        showRSI={showRSI}
                        drawingLines={drawingLines.filter(l => l.visible !== false)}
                        annotations={annotations.filter(a => a.visible !== false)}
                      />
                      <div className="space-y-4">
                        {/* Controles de Indicadores */}
                        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
                          <h3 className="text-sm font-semibold text-white mb-3">Indicadores</h3>
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={showEMA200}
                                onChange={(e) => setShowEMA200(e.target.checked)}
                                className="rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
                              />
                              <span className="text-sm text-slate-300">EMA 200</span>
                              <span className="text-xs text-amber-400">(Tendência)</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={showRSI}
                                onChange={(e) => setShowRSI(e.target.checked)}
                                className="rounded border-slate-600 bg-slate-800 text-violet-500 focus:ring-violet-500"
                              />
                              <span className="text-sm text-slate-300">RSI 14</span>
                              <span className="text-xs text-violet-400">(Momentum)</span>
                            </label>
                          </div>
                        </div>
                        
                        {/* Ferramentas de Desenho */}
                        <ChartDrawingTools
                          lines={drawingLines}
                          annotations={annotations}
                          currentPrice={priceQuery.data?.bid}
                          onLinesChange={setDrawingLines}
                          onAnnotationsChange={setAnnotations}
                          symbol={selectedSymbol}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            
            {/* Card de Preço */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-400" />
                  Preço em Tempo Real - {selectedSymbol}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {priceQuery.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                  </div>
                ) : priceQuery.data ? (
                  <div className="grid grid-cols-3 gap-6">
                    <div className="text-center p-4 bg-red-500/10 rounded-lg border border-red-500/30">
                      <p className="text-slate-400 text-sm mb-1">BID (Venda)</p>
                      <p className="text-3xl font-bold text-red-400 font-mono">
                        {priceQuery.data.bid.toFixed(selectedSymbol.includes("JPY") ? 3 : 5)}
                      </p>
                    </div>
                    <div className="text-center p-4 bg-slate-800/50 rounded-lg">
                      <p className="text-slate-400 text-sm mb-1">Spread</p>
                      <p className="text-2xl font-bold text-yellow-400">
                        {calculateSpread()} pips
                      </p>
                    </div>
                    <div className="text-center p-4 bg-green-500/10 rounded-lg border border-green-500/30">
                      <p className="text-slate-400 text-sm mb-1">ASK (Compra)</p>
                      <p className="text-3xl font-bold text-green-400 font-mono">
                        {priceQuery.data.ask.toFixed(selectedSymbol.includes("JPY") ? 3 : 5)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    {isConnected ? "Carregando preço..." : "Conecte-se para ver preços"}
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Card de Sinal */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Target className="w-5 h-5 text-purple-400" />
                  Análise Trend Sniper Smart
                </CardTitle>
                <CardDescription className="text-slate-400">
                  EMA 200 + RSI 14 | Timeframe: {selectedTimeframe}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {signalQuery.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                  </div>
                ) : signalQuery.data ? (
                  <div className="space-y-4">
                    {/* Sinal Principal */}
                    <div className={`p-4 rounded-lg border ${
                      signalQuery.data.signal === "BUY"
                        ? "bg-green-500/10 border-green-500/30"
                        : signalQuery.data.signal === "SELL"
                        ? "bg-red-500/10 border-red-500/30"
                        : "bg-slate-800/50 border-slate-700"
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {signalQuery.data.signal === "BUY" ? (
                            <ArrowUpCircle className="w-10 h-10 text-green-400" />
                          ) : signalQuery.data.signal === "SELL" ? (
                            <ArrowDownCircle className="w-10 h-10 text-red-400" />
                          ) : (
                            <Activity className="w-10 h-10 text-slate-400" />
                          )}
                          <div>
                            <p className={`text-2xl font-bold ${
                              signalQuery.data.signal === "BUY"
                                ? "text-green-400"
                                : signalQuery.data.signal === "SELL"
                                ? "text-red-400"
                                : "text-slate-400"
                            }`}>
                              {signalQuery.data.signal === "NONE" ? "SEM SINAL" : signalQuery.data.signal}
                            </p>
                            <p className="text-slate-400 text-sm">
                              Confiança: {signalQuery.data.confidence}%
                            </p>
                          </div>
                        </div>
                      </div>
                      <p className="text-slate-300 text-sm mt-3">
                        {signalQuery.data.reason}
                      </p>
                    </div>
                    
                    {/* Indicadores */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-slate-800/50 rounded-lg">
                        <p className="text-slate-400 text-xs">EMA 200</p>
                        <p className="text-white font-mono">
                          {signalQuery.data.indicators?.ema200?.toFixed(5) || "N/A"}
                        </p>
                      </div>
                      <div className="p-3 bg-slate-800/50 rounded-lg">
                        <p className="text-slate-400 text-xs">RSI 14</p>
                        <p className={`font-mono ${
                          (signalQuery.data.indicators?.rsi || 50) < 30
                            ? "text-green-400"
                            : (signalQuery.data.indicators?.rsi || 50) > 70
                            ? "text-red-400"
                            : "text-white"
                        }`}>
                          {signalQuery.data.indicators?.rsi?.toFixed(2) || "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    {isConnected ? "Analisando mercado..." : "Conecte-se para análise"}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          
          {/* Coluna 2: Ordens e Posições */}
          <div className="space-y-6">
            {/* Card de Nova Ordem */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-400" />
                  Nova Ordem Manual
                </CardTitle>
                <CardDescription className="text-slate-400">
                  {isBotRunning ? "⚠️ Robô ativo - ordens manuais podem conflitar" : "Execute ordens manualmente"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-slate-400 text-sm">Lotes</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="10"
                    value={orderLots}
                    onChange={(e) => setOrderLots(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white mt-1"
                  />
                </div>
                
                {strategyConfig.data && (
                  <div className="p-3 bg-slate-800/50 rounded-lg text-sm">
                    <p className="text-slate-400">Stop Loss: <span className="text-white">{strategyConfig.data.stopLossPips} pips</span></p>
                    <p className="text-slate-400">Trailing: <span className="text-white">{strategyConfig.data.trailingEnabled ? `+${strategyConfig.data.trailingTriggerPips} pips` : "Desativado"}</span></p>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={() => handlePlaceOrder("BUY")}
                    disabled={!isConnected || isPlacingOrder}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isPlacingOrder ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <TrendingUp className="w-4 h-4 mr-2" />
                        COMPRAR
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => handlePlaceOrder("SELL")}
                    disabled={!isConnected || isPlacingOrder}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {isPlacingOrder ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <TrendingDown className="w-4 h-4 mr-2" />
                        VENDER
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            {/* Card de Posições Abertas */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-400" />
                  Posições Abertas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {positionsQuery.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                  </div>
                ) : positionsQuery.data?.live && positionsQuery.data.live.length > 0 ? (
                  <div className="space-y-3">
                    {positionsQuery.data.live.map((position) => (
                      <div
                        key={position.positionId}
                        className={`p-3 rounded-lg border ${
                          position.direction === "BUY"
                            ? "bg-green-500/10 border-green-500/30"
                            : "bg-red-500/10 border-red-500/30"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant={position.direction === "BUY" ? "default" : "destructive"}>
                              {position.direction}
                            </Badge>
                            <span className="text-white font-medium">{position.symbol}</span>
                          </div>
                          <span className="text-slate-400 text-sm">{position.size} lotes</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-slate-400">Entrada</p>
                            <p className="text-white font-mono">{position.entryPrice.toFixed(5)}</p>
                          </div>
                          <div>
                            <p className="text-slate-400">P&L</p>
                            <p className={`font-mono ${
                              position.unrealizedPnL >= 0 ? "text-green-400" : "text-red-400"
                            }`}>
                              ${position.unrealizedPnL.toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleClosePosition(position.positionId)}
                          disabled={closePositionMutation.isPending}
                          className="w-full mt-2"
                        >
                          Fechar Posição
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    {isConnected ? "Nenhuma posição aberta" : "Conecte-se para ver posições"}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
