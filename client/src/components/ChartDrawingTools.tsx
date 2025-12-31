/**
 * ChartDrawingTools - Painel de Ferramentas de Desenho para o Gráfico
 * 
 * Permite adicionar:
 * - Linhas horizontais de suporte/resistência
 * - Linhas de tendência
 * - Anotações de texto
 * 
 * @author Manus AI
 * @version 1.0.0
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Minus,
  TrendingUp,
  MessageSquare,
  Trash2,
  Plus,
  Eye,
  EyeOff,
  Palette,
} from "lucide-react";

// ============= INTERFACES =============

export interface DrawingLine {
  id: string;
  type: "horizontal" | "trend";
  price?: number;
  startTime?: number;
  startPrice?: number;
  endTime?: number;
  endPrice?: number;
  color: string;
  label?: string;
  visible?: boolean;
}

export interface Annotation {
  id: string;
  time: number;
  price: number;
  text: string;
  color: string;
  visible?: boolean;
}

interface ChartDrawingToolsProps {
  /** Linhas de desenho atuais */
  lines: DrawingLine[];
  /** Anotações atuais */
  annotations: Annotation[];
  /** Preço atual para sugestão */
  currentPrice?: number;
  /** Callback quando linhas são atualizadas */
  onLinesChange: (lines: DrawingLine[]) => void;
  /** Callback quando anotações são atualizadas */
  onAnnotationsChange: (annotations: Annotation[]) => void;
  /** Símbolo atual (para formatação de preço) */
  symbol?: string;
}

// ============= CORES DISPONÍVEIS =============

const AVAILABLE_COLORS = [
  { name: "Verde", value: "#22c55e" },
  { name: "Vermelho", value: "#ef4444" },
  { name: "Azul", value: "#3b82f6" },
  { name: "Amarelo", value: "#eab308" },
  { name: "Roxo", value: "#a855f7" },
  { name: "Laranja", value: "#f97316" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Rosa", value: "#ec4899" },
];

// ============= COMPONENTE PRINCIPAL =============

export function ChartDrawingTools({
  lines,
  annotations,
  currentPrice,
  onLinesChange,
  onAnnotationsChange,
  symbol = "USDJPY",
}: ChartDrawingToolsProps) {
  // State para novo desenho
  const [newLinePrice, setNewLinePrice] = useState<string>("");
  const [newLineLabel, setNewLineLabel] = useState<string>("");
  const [newLineColor, setNewLineColor] = useState<string>("#22c55e");
  const [newLineType, setNewLineType] = useState<"support" | "resistance">("support");
  
  // State para nova anotação
  const [newAnnotationText, setNewAnnotationText] = useState<string>("");
  const [newAnnotationPrice, setNewAnnotationPrice] = useState<string>("");
  const [newAnnotationColor, setNewAnnotationColor] = useState<string>("#3b82f6");

  // Determinar casas decimais baseado no símbolo
  const decimals = symbol.includes("JPY") ? 3 : 5;

  // Adicionar linha horizontal
  const handleAddHorizontalLine = useCallback(() => {
    const price = parseFloat(newLinePrice);
    if (isNaN(price) || price <= 0) return;

    const newLine: DrawingLine = {
      id: `line-${Date.now()}`,
      type: "horizontal",
      price,
      color: newLineColor,
      label: newLineLabel || (newLineType === "support" ? "Suporte" : "Resistência"),
      visible: true,
    };

    onLinesChange([...lines, newLine]);
    setNewLinePrice("");
    setNewLineLabel("");
  }, [newLinePrice, newLineColor, newLineLabel, newLineType, lines, onLinesChange]);

  // Remover linha
  const handleRemoveLine = useCallback((id: string) => {
    onLinesChange(lines.filter(line => line.id !== id));
  }, [lines, onLinesChange]);

  // Toggle visibilidade da linha
  const handleToggleLineVisibility = useCallback((id: string) => {
    onLinesChange(lines.map(line => 
      line.id === id ? { ...line, visible: !line.visible } : line
    ));
  }, [lines, onLinesChange]);

  // Adicionar anotação
  const handleAddAnnotation = useCallback(() => {
    const price = parseFloat(newAnnotationPrice);
    if (isNaN(price) || price <= 0 || !newAnnotationText.trim()) return;

    const newAnnotation: Annotation = {
      id: `annotation-${Date.now()}`,
      time: Math.floor(Date.now() / 1000),
      price,
      text: newAnnotationText.trim(),
      color: newAnnotationColor,
      visible: true,
    };

    onAnnotationsChange([...annotations, newAnnotation]);
    setNewAnnotationText("");
    setNewAnnotationPrice("");
  }, [newAnnotationPrice, newAnnotationText, newAnnotationColor, annotations, onAnnotationsChange]);

  // Remover anotação
  const handleRemoveAnnotation = useCallback((id: string) => {
    onAnnotationsChange(annotations.filter(ann => ann.id !== id));
  }, [annotations, onAnnotationsChange]);

  // Usar preço atual como sugestão
  const handleUseCurrentPrice = useCallback(() => {
    if (currentPrice) {
      setNewLinePrice(currentPrice.toFixed(decimals));
    }
  }, [currentPrice, decimals]);

  const handleUseCurrentPriceForAnnotation = useCallback(() => {
    if (currentPrice) {
      setNewAnnotationPrice(currentPrice.toFixed(decimals));
    }
  }, [currentPrice, decimals]);

  // Limpar todas as linhas
  const handleClearAllLines = useCallback(() => {
    onLinesChange([]);
  }, [onLinesChange]);

  // Limpar todas as anotações
  const handleClearAllAnnotations = useCallback(() => {
    onAnnotationsChange([]);
  }, [onAnnotationsChange]);

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
        <Palette className="w-4 h-4 text-cyan-400" />
        Ferramentas de Desenho
      </h3>

      <div className="space-y-4">
        {/* Adicionar Linha Horizontal */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-400">Linha Horizontal</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-2">
                  <Plus className="w-3 h-3 mr-1" />
                  Adicionar
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 bg-slate-900 border-slate-700">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Tipo</Label>
                    <Select value={newLineType} onValueChange={(v: "support" | "resistance") => {
                      setNewLineType(v);
                      setNewLineColor(v === "support" ? "#22c55e" : "#ef4444");
                    }}>
                      <SelectTrigger className="h-8 bg-slate-800 border-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="support">Suporte</SelectItem>
                        <SelectItem value="resistance">Resistência</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Preço</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.00001"
                        value={newLinePrice}
                        onChange={(e) => setNewLinePrice(e.target.value)}
                        placeholder={currentPrice?.toFixed(decimals) || "0.00000"}
                        className="h-8 bg-slate-800 border-slate-700 text-sm font-mono"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2"
                        onClick={handleUseCurrentPrice}
                        title="Usar preço atual"
                      >
                        <TrendingUp className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Rótulo (opcional)</Label>
                    <Input
                      value={newLineLabel}
                      onChange={(e) => setNewLineLabel(e.target.value)}
                      placeholder={newLineType === "support" ? "Suporte" : "Resistência"}
                      className="h-8 bg-slate-800 border-slate-700 text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Cor</Label>
                    <div className="flex flex-wrap gap-1">
                      {AVAILABLE_COLORS.map((color) => (
                        <button
                          key={color.value}
                          onClick={() => setNewLineColor(color.value)}
                          className={`w-6 h-6 rounded border-2 transition-all ${
                            newLineColor === color.value
                              ? "border-white scale-110"
                              : "border-transparent"
                          }`}
                          style={{ backgroundColor: color.value }}
                          title={color.name}
                        />
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={handleAddHorizontalLine}
                    className="w-full h-8 bg-cyan-600 hover:bg-cyan-700"
                    disabled={!newLinePrice || parseFloat(newLinePrice) <= 0}
                  >
                    <Minus className="w-3 h-3 mr-1" />
                    Adicionar Linha
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Lista de linhas */}
          {lines.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {lines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center justify-between bg-slate-800/50 rounded px-2 py-1"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-0.5 rounded"
                      style={{ backgroundColor: line.color }}
                    />
                    <span className="text-xs text-slate-300">
                      {line.label || "Linha"}: {line.price?.toFixed(decimals)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleLineVisibility(line.id)}
                      className="p-1 hover:bg-slate-700 rounded"
                      title={line.visible !== false ? "Ocultar" : "Mostrar"}
                    >
                      {line.visible !== false ? (
                        <Eye className="w-3 h-3 text-slate-400" />
                      ) : (
                        <EyeOff className="w-3 h-3 text-slate-500" />
                      )}
                    </button>
                    <button
                      onClick={() => handleRemoveLine(line.id)}
                      className="p-1 hover:bg-red-900/50 rounded"
                      title="Remover"
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
              {lines.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-6 text-xs text-red-400 hover:text-red-300"
                  onClick={handleClearAllLines}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Limpar Todas
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Separador */}
        <div className="border-t border-slate-800" />

        {/* Adicionar Anotação */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-400">Anotações</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-2">
                  <Plus className="w-3 h-3 mr-1" />
                  Adicionar
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 bg-slate-900 border-slate-700">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Texto</Label>
                    <Input
                      value={newAnnotationText}
                      onChange={(e) => setNewAnnotationText(e.target.value)}
                      placeholder="Digite sua anotação..."
                      className="h-8 bg-slate-800 border-slate-700 text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Preço</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.00001"
                        value={newAnnotationPrice}
                        onChange={(e) => setNewAnnotationPrice(e.target.value)}
                        placeholder={currentPrice?.toFixed(decimals) || "0.00000"}
                        className="h-8 bg-slate-800 border-slate-700 text-sm font-mono"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2"
                        onClick={handleUseCurrentPriceForAnnotation}
                        title="Usar preço atual"
                      >
                        <TrendingUp className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Cor</Label>
                    <div className="flex flex-wrap gap-1">
                      {AVAILABLE_COLORS.map((color) => (
                        <button
                          key={color.value}
                          onClick={() => setNewAnnotationColor(color.value)}
                          className={`w-6 h-6 rounded border-2 transition-all ${
                            newAnnotationColor === color.value
                              ? "border-white scale-110"
                              : "border-transparent"
                          }`}
                          style={{ backgroundColor: color.value }}
                          title={color.name}
                        />
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={handleAddAnnotation}
                    className="w-full h-8 bg-cyan-600 hover:bg-cyan-700"
                    disabled={!newAnnotationText.trim() || !newAnnotationPrice || parseFloat(newAnnotationPrice) <= 0}
                  >
                    <MessageSquare className="w-3 h-3 mr-1" />
                    Adicionar Anotação
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Lista de anotações */}
          {annotations.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {annotations.map((ann) => (
                <div
                  key={ann.id}
                  className="flex items-center justify-between bg-slate-800/50 rounded px-2 py-1"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <MessageSquare
                      className="w-3 h-3 flex-shrink-0"
                      style={{ color: ann.color }}
                    />
                    <span className="text-xs text-slate-300 truncate">
                      {ann.text}
                    </span>
                    <span className="text-xs text-slate-500 font-mono flex-shrink-0">
                      @ {ann.price.toFixed(decimals)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveAnnotation(ann.id)}
                    className="p-1 hover:bg-red-900/50 rounded flex-shrink-0"
                    title="Remover"
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              ))}
              {annotations.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-6 text-xs text-red-400 hover:text-red-300"
                  onClick={handleClearAllAnnotations}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Limpar Todas
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChartDrawingTools;
