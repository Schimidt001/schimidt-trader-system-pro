import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface TimeFilterSettingsProps {
  config: any;
  onUpdate: () => void;
}

export default function TimeFilterSettings({ config, onUpdate }: TimeFilterSettingsProps) {
  
  // Estados
  const [enabled, setEnabled] = useState(false);
  const [allowedHours, setAllowedHours] = useState<number[]>([]);
  const [goldHours, setGoldHours] = useState<number[]>([]);
  const [goldStake, setGoldStake] = useState(1000);

  // Mutation
  const updateTimeFilter = trpc.config.updateTimeFilter.useMutation({
    onSuccess: () => {
      toast.success("Filtro de horário atualizado com sucesso");
      onUpdate();
    },
    onError: (error) => {
      toast.error(`Erro ao salvar: ${error.message}`);
    },
  });

  // Carregar configuração inicial
  useEffect(() => {
    if (config) {
      setEnabled(config.timeFilterEnabled ?? false);
      
      // Parse allowed hours
      if (config.allowedHours) {
        try {
          const parsed = typeof config.allowedHours === 'string' 
            ? JSON.parse(config.allowedHours) 
            : config.allowedHours;
          setAllowedHours(Array.isArray(parsed) ? parsed : []);
        } catch {
          setAllowedHours([]);
        }
      }
      
      // Parse gold hours
      if (config.goldHours) {
        try {
          const parsed = typeof config.goldHours === 'string'
            ? JSON.parse(config.goldHours)
            : config.goldHours;
          setGoldHours(Array.isArray(parsed) ? parsed : []);
        } catch {
          setGoldHours([]);
        }
      }
      
      setGoldStake(config.goldStake ?? 1000);
    }
  }, [config]);

  // Toggle hora permitida
  const toggleAllowedHour = (hour: number) => {
    setAllowedHours(prev => {
      if (prev.includes(hour)) {
        return prev.filter(h => h !== hour);
      } else {
        return [...prev, hour].sort((a, b) => a - b);
      }
    });
  };

  // Toggle hora GOLD
  const toggleGoldHour = (hour: number) => {
    setGoldHours(prev => {
      if (prev.includes(hour)) {
        return prev.filter(h => h !== hour);
      } else {
        return [...prev, hour].sort((a, b) => a - b);
      }
    });
  };

  // Salvar configuração
  const handleSave = () => {
    updateTimeFilter.mutate({
      timeFilterEnabled: enabled,
      allowedHours: allowedHours.length > 0 ? allowedHours : undefined,
      goldHours: goldHours.length > 0 ? goldHours : undefined,
      goldStake,
    });
  };

  // Renderizar grade de horários
  const renderHourGrid = (type: 'allowed' | 'gold') => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const selectedHours = type === 'allowed' ? allowedHours : goldHours;
    const toggleHour = type === 'allowed' ? toggleAllowedHour : toggleGoldHour;
    const bgColor = type === 'allowed' ? 'bg-green-500' : 'bg-yellow-500';
    const hoverColor = type === 'allowed' ? 'hover:bg-green-600' : 'hover:bg-yellow-600';

    return (
      <div className="grid grid-cols-12 gap-2">
        {hours.map(hour => {
          const isSelected = selectedHours.includes(hour);
          const isAllowed = type === 'gold' ? allowedHours.includes(hour) : true;
          
          return (
            <button
              key={hour}
              onClick={() => isAllowed && toggleHour(hour)}
              disabled={!isAllowed && type === 'gold'}
              className={`
                p-2 rounded text-sm font-medium transition-colors
                ${isSelected 
                  ? `${bgColor} text-white` 
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }
                ${isAllowed && !isSelected ? hoverColor : ''}
                ${!isAllowed && type === 'gold' ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {hour.toString().padStart(2, '0')}h
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>⏰ Filtro de Horário</CardTitle>
        <CardDescription>
          Configure os horários em que o bot pode operar e horários especiais com stake maior (GOLD)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Toggle principal */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="time-filter-enabled">Habilitar Filtro de Horário</Label>
            <p className="text-sm text-muted-foreground">
              Quando habilitado, o bot só operará nos horários selecionados
            </p>
          </div>
          <Switch
            id="time-filter-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {enabled && (
          <>
            {/* Horários permitidos */}
            <div className="space-y-3">
              <div>
                <Label>Horários Permitidos</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Clique nos horários em que o bot pode operar (fuso horário: {config?.timezone || 'America/Sao_Paulo'})
                </p>
              </div>
              {renderHourGrid('allowed')}
              {allowedHours.length > 0 && (
                <p className="text-sm text-green-600 dark:text-green-400">
                  ✓ {allowedHours.length} horário(s) selecionado(s)
                </p>
              )}
            </div>

            {/* Horários GOLD */}
            <div className="space-y-3">
              <div>
                <Label>Horários GOLD ⭐</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Horários especiais com stake maior. Só podem ser selecionados dentro dos horários permitidos.
                </p>
              </div>
              {renderHourGrid('gold')}
              {goldHours.length > 0 && (
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  ⭐ {goldHours.length} horário(s) GOLD selecionado(s)
                </p>
              )}
            </div>

            {/* Stake GOLD */}
            <div className="space-y-2">
              <Label htmlFor="gold-stake">Stake para Horários GOLD</Label>
              <p className="text-sm text-muted-foreground">
                Valor do stake nos horários GOLD (em centavos)
              </p>
              <Input
                id="gold-stake"
                type="number"
                min="1"
                step="1"
                value={goldStake}
                onChange={(e) => setGoldStake(parseInt(e.target.value) || 1000)}
                className="max-w-xs"
              />
              <p className="text-sm text-muted-foreground">
                Valor atual: ${(goldStake / 100).toFixed(2)}
              </p>
            </div>

            {/* Aviso */}
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>ℹ️ Importante:</strong> O bot NUNCA interromperá uma posição aberta. Se o horário não permitido chegar durante uma operação, o bot aguardará o fechamento antes de entrar em standby.
              </p>
            </div>
          </>
        )}

        {/* Botão salvar */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={updateTimeFilter.isPending}>
            {updateTimeFilter.isPending ? "Salvando..." : "Salvar Configuração"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
