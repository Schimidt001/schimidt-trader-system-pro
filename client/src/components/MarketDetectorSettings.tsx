import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { Loader2, Save, RotateCcw, Info } from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function MarketDetectorSettings() {
  const [isSaving, setIsSaving] = useState(false);
  
  // Estados do formulário
  const [enabled, setEnabled] = useState(true);
  
  // Critérios internos
  const [atrWindow, setAtrWindow] = useState("14");
  const [atrMultiplier, setAtrMultiplier] = useState("2.50");
  const [atrScore, setAtrScore] = useState("2");
  
  const [wickMultiplier, setWickMultiplier] = useState("2.00");
  const [wickScore, setWickScore] = useState("1");
  
  const [fractalThreshold, setFractalThreshold] = useState("1.80");
  const [fractalScore, setFractalScore] = useState("1");
  
  const [spreadMultiplier, setSpreadMultiplier] = useState("2.00");
  const [spreadScore, setSpreadScore] = useState("1");
  
  // Critérios externos (notícias)
  const [weightHigh, setWeightHigh] = useState("3");
  const [weightMedium, setWeightMedium] = useState("1");
  const [weightHighPast, setWeightHighPast] = useState("2");
  const [windowNextNews, setWindowNextNews] = useState("60");
  const [windowPastNews, setWindowPastNews] = useState("30");
  
  // Thresholds
  const [greenThreshold, setGreenThreshold] = useState("3");
  const [yellowThreshold, setYellowThreshold] = useState("6");
  
  // Queries
  const { data: config, isLoading } = trpc.marketDetector.getConfig.useQuery();
  const updateConfigMutation = trpc.marketDetector.updateConfig.useMutation();
  const resetConfigMutation = trpc.marketDetector.resetConfig.useMutation();
  
  // Carregar configuração
  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setAtrWindow(config.atrWindow.toString());
      setAtrMultiplier(config.atrMultiplier.toString());
      setAtrScore(config.atrScore.toString());
      setWickMultiplier(config.wickMultiplier.toString());
      setWickScore(config.wickScore.toString());
      setFractalThreshold(config.fractalThreshold.toString());
      setFractalScore(config.fractalScore.toString());
      setSpreadMultiplier(config.spreadMultiplier.toString());
      setSpreadScore(config.spreadScore.toString());
      setWeightHigh(config.weightHigh.toString());
      setWeightMedium(config.weightMedium.toString());
      setWeightHighPast(config.weightHighPast.toString());
      setWindowNextNews(config.windowNextNews.toString());
      setWindowPastNews(config.windowPastNews.toString());
      setGreenThreshold(config.greenThreshold.toString());
      setYellowThreshold(config.yellowThreshold.toString());
    }
  }, [config]);
  
  // Salvar configuração
  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      await updateConfigMutation.mutateAsync({
        enabled,
        atrWindow: parseInt(atrWindow),
        atrMultiplier,
        atrScore: parseInt(atrScore),
        wickMultiplier,
        wickScore: parseInt(wickScore),
        fractalThreshold,
        fractalScore: parseInt(fractalScore),
        spreadMultiplier,
        spreadScore: parseInt(spreadScore),
        weightHigh: parseInt(weightHigh),
        weightMedium: parseInt(weightMedium),
        weightHighPast: parseInt(weightHighPast),
        windowNextNews: parseInt(windowNextNews),
        windowPastNews: parseInt(windowPastNews),
        greenThreshold: parseInt(greenThreshold),
        yellowThreshold: parseInt(yellowThreshold),
      });
      
      toast.success("Configurações do Market Detector salvas com sucesso!");
    } catch (error: any) {
      toast.error(`Erro ao salvar: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };
  
  // Restaurar padrões
  const handleReset = async () => {
    if (!confirm("Deseja restaurar as configurações padrão institucionais?")) {
      return;
    }
    
    try {
      await resetConfigMutation.mutateAsync();
      toast.success("Configurações restauradas para os padrões institucionais!");
      
      // Recarregar configuração
      window.location.reload();
    } catch (error: any) {
      toast.error(`Erro ao restaurar: ${error.message}`);
    }
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Market Detector — Configurações Avançadas</CardTitle>
          <CardDescription>Carregando configurações...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Market Detector — Configurações Avançadas</CardTitle>
        <CardDescription>
          Configure os parâmetros do detector de condições de mercado. Ajuste os critérios internos (matemática do candle) e externos (notícias macroeconômicas).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Habilitação */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Ativar Market Detector</Label>
            <p className="text-sm text-muted-foreground">
              Habilita ou desabilita o detector de condições de mercado
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>
        
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold mb-4">Critérios Internos (Matemática do Candle)</h3>
          
          {/* ATR */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-2">
              <Label className="font-semibold">1. Amplitude Anormal (ATR)</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">Detecta candles com amplitude muito maior que o ATR histórico</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="atrWindow">Janela ATR</Label>
                <Input
                  id="atrWindow"
                  type="number"
                  value={atrWindow}
                  onChange={(e) => setAtrWindow(e.target.value)}
                  min="1"
                  max="50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="atrMultiplier">Multiplicador</Label>
                <Input
                  id="atrMultiplier"
                  type="text"
                  value={atrMultiplier}
                  onChange={(e) => setAtrMultiplier(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="atrScore">Pontos (+)</Label>
                <Input
                  id="atrScore"
                  type="number"
                  value={atrScore}
                  onChange={(e) => setAtrScore(e.target.value)}
                  min="0"
                  max="10"
                />
              </div>
            </div>
          </div>
          
          {/* Wicks */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-2">
              <Label className="font-semibold">2. Sombras Exageradas (Wicks)</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">Detecta candles com sombras muito maiores que o corpo</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wickMultiplier">Multiplicador</Label>
                <Input
                  id="wickMultiplier"
                  type="text"
                  value={wickMultiplier}
                  onChange={(e) => setWickMultiplier(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wickScore">Pontos (+)</Label>
                <Input
                  id="wickScore"
                  type="number"
                  value={wickScore}
                  onChange={(e) => setWickScore(e.target.value)}
                  min="0"
                  max="10"
                />
              </div>
            </div>
          </div>
          
          {/* Fractal */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-2">
              <Label className="font-semibold">3. Volatilidade Fractal</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">Detecta candles com corpo pequeno e amplitude grande</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fractalThreshold">Threshold</Label>
                <Input
                  id="fractalThreshold"
                  type="text"
                  value={fractalThreshold}
                  onChange={(e) => setFractalThreshold(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fractalScore">Pontos (+)</Label>
                <Input
                  id="fractalScore"
                  type="number"
                  value={fractalScore}
                  onChange={(e) => setFractalScore(e.target.value)}
                  min="0"
                  max="10"
                />
              </div>
            </div>
          </div>
          
          {/* Spread */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-2">
              <Label className="font-semibold">4. Spread Anormal</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">Detecta spread muito maior que a média histórica</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="spreadMultiplier">Multiplicador</Label>
                <Input
                  id="spreadMultiplier"
                  type="text"
                  value={spreadMultiplier}
                  onChange={(e) => setSpreadMultiplier(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="spreadScore">Pontos (+)</Label>
                <Input
                  id="spreadScore"
                  type="number"
                  value={spreadScore}
                  onChange={(e) => setSpreadScore(e.target.value)}
                  min="0"
                  max="10"
                />
              </div>
            </div>
          </div>
        </div>
        
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold mb-4">Critérios Externos (Notícias Macroeconômicas)</h3>
          
          {/* Pesos de notícias */}
          <div className="space-y-4 mb-6">
            <Label className="font-semibold">Pesos de Impacto</Label>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="weightHigh">HIGH (futuro)</Label>
                <Input
                  id="weightHigh"
                  type="number"
                  value={weightHigh}
                  onChange={(e) => setWeightHigh(e.target.value)}
                  min="0"
                  max="10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weightMedium">MEDIUM (futuro)</Label>
                <Input
                  id="weightMedium"
                  type="number"
                  value={weightMedium}
                  onChange={(e) => setWeightMedium(e.target.value)}
                  min="0"
                  max="10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weightHighPast">HIGH (passado)</Label>
                <Input
                  id="weightHighPast"
                  type="number"
                  value={weightHighPast}
                  onChange={(e) => setWeightHighPast(e.target.value)}
                  min="0"
                  max="10"
                />
              </div>
            </div>
          </div>
          
          {/* Janelas de tempo */}
          <div className="space-y-4 mb-6">
            <Label className="font-semibold">Janelas de Tempo (minutos)</Label>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="windowNextNews">Próximas notícias</Label>
                <Input
                  id="windowNextNews"
                  type="number"
                  value={windowNextNews}
                  onChange={(e) => setWindowNextNews(e.target.value)}
                  min="1"
                  max="180"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="windowPastNews">Notícias passadas</Label>
                <Input
                  id="windowPastNews"
                  type="number"
                  value={windowPastNews}
                  onChange={(e) => setWindowPastNews(e.target.value)}
                  min="1"
                  max="180"
                />
              </div>
            </div>
          </div>
        </div>
        
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold mb-4">Thresholds de Classificação</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="greenThreshold">🟢 GREEN (máx)</Label>
              <Input
                id="greenThreshold"
                type="number"
                value={greenThreshold}
                onChange={(e) => setGreenThreshold(e.target.value)}
                min="0"
                max="10"
              />
              <p className="text-sm text-muted-foreground">Score ≤ {greenThreshold} = Operar</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="yellowThreshold">🟡 YELLOW (máx)</Label>
              <Input
                id="yellowThreshold"
                type="number"
                value={yellowThreshold}
                onChange={(e) => setYellowThreshold(e.target.value)}
                min="0"
                max="10"
              />
              <p className="text-sm text-muted-foreground">Score ≤ {yellowThreshold} = Cautela</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            🔴 RED: Score {'>'} {yellowThreshold} = Parar
          </p>
        </div>
        
        {/* Botões */}
        <div className="flex gap-4 pt-4">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar Configurações
              </>
            )}
          </Button>
          
          <Button
            onClick={handleReset}
            variant="outline"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Restaurar Padrões
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
