/**
 * LabParametersContext - Contexto para Persistência de Parâmetros do Laboratório
 * 
 * CORREÇÃO TAREFA 1: Estado dos parâmetros não persiste
 * 
 * Este contexto resolve o problema de perda de estado dos parâmetros ao navegar
 * entre abas do laboratório. Mantém o estado em um contexto global que persiste
 * durante toda a sessão do usuário.
 * 
 * Funcionalidades:
 * - Persistência de parâmetros configurados (ranges, enabled, locked)
 * - Persistência de configurações de otimização (símbolos, datas, estratégia)
 * - Cálculo automático de combinações com validação
 * - Guard rails para bloquear execuções com combinações absurdas
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";

// ============================================================================
// CONSTANTS
// ============================================================================

/** Limite máximo de combinações permitidas para execução */
export const MAX_COMBINATIONS_LIMIT = 10000;

/** Limite de alerta para combinações (mostra warning) */
export const COMBINATIONS_WARNING_LIMIT = 5000;

/** Chave para persistência no localStorage */
const LAB_PARAMS_STORAGE_KEY = "schimidt-lab-parameters";

// ============================================================================
// TYPES
// ============================================================================

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

export interface LabConfiguration {
  /** Símbolos selecionados para backtest */
  selectedSymbols: string[];
  /** Data de início */
  startDate: string;
  /** Data de fim */
  endDate: string;
  /** Tipo de estratégia */
  strategyType: "SMC" | "HYBRID" | "RSI_VWAP";
  /** Validação habilitada */
  validationEnabled: boolean;
  /** Ratio In-Sample */
  inSampleRatio: number;
  /** Walk-Forward habilitado */
  walkForwardEnabled: boolean;
  /** Meses da janela Walk-Forward */
  windowMonths: number;
  /** Meses do passo Walk-Forward */
  stepMonths: number;
  /** Seed para reprodutibilidade */
  seed?: number;
  /** Simulações Monte Carlo */
  mcSimulations: number;
  /** Método Monte Carlo */
  mcMethod: "BLOCK_BOOTSTRAP" | "TRADE_RESAMPLING" | "RANDOMIZE_ORDER";
  /** Max posições totais (Multi-Asset) */
  maxTotalPositions: number;
  /** Max posições por símbolo (Multi-Asset) */
  maxPositionsPerSymbol: number;
  /** Max drawdown diário (Multi-Asset) */
  maxDailyDrawdown: number;
}

export interface CombinationsValidation {
  totalCombinations: number;
  isValid: boolean;
  isWarning: boolean;
  message: string;
  estimatedTimeMinutes: number;
}

interface LabParametersContextType {
  /** Configurações de parâmetros */
  parameterConfigs: Map<string, ParameterConfig>;
  /** Configuração geral do laboratório */
  labConfig: LabConfiguration;
  /** Atualiza um parâmetro específico */
  updateParameter: (parameterId: string, updates: Partial<ParameterConfig>) => void;
  /** Atualiza múltiplos parâmetros de uma vez */
  setParameterConfigs: (configs: Map<string, ParameterConfig>) => void;
  /** Atualiza configuração do laboratório */
  updateLabConfig: (updates: Partial<LabConfiguration>) => void;
  /** Reseta parâmetros para valores padrão */
  resetParameters: () => void;
  /** Validação de combinações */
  combinationsValidation: CombinationsValidation;
  /** Verifica se pode executar otimização */
  canExecuteOptimization: () => { canExecute: boolean; reason: string };
  /** Número de parâmetros habilitados */
  enabledParametersCount: number;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_LAB_CONFIG: LabConfiguration = {
  selectedSymbols: ["XAUUSD"],
  startDate: "2024-01-01",
  endDate: "2025-01-01",
  strategyType: "SMC",
  validationEnabled: true,
  inSampleRatio: 0.7,
  walkForwardEnabled: true,
  windowMonths: 6,
  stepMonths: 1,
  seed: undefined,
  mcSimulations: 1000,
  mcMethod: "BLOCK_BOOTSTRAP",
  maxTotalPositions: 10,
  maxPositionsPerSymbol: 3,
  maxDailyDrawdown: 5,
};

// ============================================================================
// CONTEXT
// ============================================================================

const LabParametersContext = createContext<LabParametersContextType | undefined>(undefined);

// ============================================================================
// PROVIDER
// ============================================================================

interface LabParametersProviderProps {
  children: React.ReactNode;
}

export function LabParametersProvider({ children }: LabParametersProviderProps) {
  // Estado dos parâmetros
  const [parameterConfigs, setParameterConfigsState] = useState<Map<string, ParameterConfig>>(() => {
    // Tentar recuperar do localStorage
    try {
      const stored = localStorage.getItem(LAB_PARAMS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.parameters) {
          return new Map(Object.entries(parsed.parameters));
        }
      }
    } catch (e) {
      console.warn("Erro ao recuperar parâmetros do localStorage:", e);
    }
    return new Map();
  });

  // Estado da configuração do laboratório
  const [labConfig, setLabConfig] = useState<LabConfiguration>(() => {
    try {
      const stored = localStorage.getItem(LAB_PARAMS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.config) {
          return { ...DEFAULT_LAB_CONFIG, ...parsed.config };
        }
      }
    } catch (e) {
      console.warn("Erro ao recuperar configuração do localStorage:", e);
    }
    return DEFAULT_LAB_CONFIG;
  });

  // Persistir no localStorage quando houver mudanças
  useEffect(() => {
    try {
      const toStore = {
        parameters: Object.fromEntries(parameterConfigs),
        config: labConfig,
        timestamp: Date.now(),
      };
      localStorage.setItem(LAB_PARAMS_STORAGE_KEY, JSON.stringify(toStore));
    } catch (e) {
      console.warn("Erro ao salvar parâmetros no localStorage:", e);
    }
  }, [parameterConfigs, labConfig]);

  // Atualiza um parâmetro específico
  const updateParameter = useCallback((parameterId: string, updates: Partial<ParameterConfig>) => {
    setParameterConfigsState(prev => {
      const newConfigs = new Map(prev);
      const existing = newConfigs.get(parameterId);
      if (existing) {
        newConfigs.set(parameterId, { ...existing, ...updates });
      } else {
        newConfigs.set(parameterId, {
          parameterId,
          type: "number",
          enabled: false,
          locked: false,
          ...updates,
        } as ParameterConfig);
      }
      return newConfigs;
    });
  }, []);

  // Atualiza múltiplos parâmetros
  const setParameterConfigs = useCallback((configs: Map<string, ParameterConfig>) => {
    setParameterConfigsState(configs);
  }, []);

  // Atualiza configuração do laboratório
  const updateLabConfig = useCallback((updates: Partial<LabConfiguration>) => {
    setLabConfig(prev => ({ ...prev, ...updates }));
  }, []);

  // Reseta parâmetros para valores padrão
  const resetParameters = useCallback(() => {
    setParameterConfigsState(new Map());
    setLabConfig(DEFAULT_LAB_CONFIG);
    localStorage.removeItem(LAB_PARAMS_STORAGE_KEY);
  }, []);

  // Calcula número de parâmetros habilitados
  const enabledParametersCount = useMemo(() => {
    let count = 0;
    parameterConfigs.forEach(config => {
      if (config.enabled && !config.locked) {
        count++;
      }
    });
    return count;
  }, [parameterConfigs]);

  // Calcula e valida combinações
  const combinationsValidation = useMemo((): CombinationsValidation => {
    let combinations = 1;
    
    parameterConfigs.forEach(config => {
      if (config.enabled && !config.locked) {
        if (config.type === "boolean") {
          combinations *= 2;
        } else if (config.type === "range" && config.min !== undefined && config.max !== undefined && config.step !== undefined) {
          const steps = Math.floor((config.max - config.min) / config.step) + 1;
          combinations *= Math.max(1, steps);
        }
      }
    });

    // Multiplicar pelo número de estratégias se houver mais de uma
    // (por enquanto, apenas uma estratégia é selecionada)
    
    const isValid = combinations <= MAX_COMBINATIONS_LIMIT;
    const isWarning = combinations > COMBINATIONS_WARNING_LIMIT && combinations <= MAX_COMBINATIONS_LIMIT;
    
    // Estimativa de tempo: ~0.5 segundos por combinação
    const estimatedTimeMinutes = Math.ceil((combinations * 0.5) / 60);
    
    let message = "";
    if (!isValid) {
      message = `Número de combinações (${combinations.toLocaleString()}) excede o limite máximo de ${MAX_COMBINATIONS_LIMIT.toLocaleString()}. Reduza os ranges ou desabilite alguns parâmetros.`;
    } else if (isWarning) {
      message = `Atenção: ${combinations.toLocaleString()} combinações podem levar aproximadamente ${estimatedTimeMinutes} minutos.`;
    } else {
      message = `${combinations.toLocaleString()} combinações (~${estimatedTimeMinutes} min)`;
    }

    return {
      totalCombinations: combinations,
      isValid,
      isWarning,
      message,
      estimatedTimeMinutes,
    };
  }, [parameterConfigs]);

  // Verifica se pode executar otimização
  const canExecuteOptimization = useCallback((): { canExecute: boolean; reason: string } => {
    // Verificar se há símbolos selecionados
    if (labConfig.selectedSymbols.length === 0) {
      return { canExecute: false, reason: "Selecione pelo menos um símbolo" };
    }

    // Verificar se há parâmetros habilitados
    if (enabledParametersCount === 0) {
      return { canExecute: false, reason: "Habilite pelo menos um parâmetro para otimização" };
    }

    // Verificar limite de combinações
    if (!combinationsValidation.isValid) {
      return { 
        canExecute: false, 
        reason: `Limite de combinações excedido (${combinationsValidation.totalCombinations.toLocaleString()} > ${MAX_COMBINATIONS_LIMIT.toLocaleString()}). Reduza os ranges ou desabilite parâmetros.`
      };
    }

    // Verificar datas
    const start = new Date(labConfig.startDate);
    const end = new Date(labConfig.endDate);
    if (start >= end) {
      return { canExecute: false, reason: "Data de início deve ser anterior à data de fim" };
    }

    return { canExecute: true, reason: "OK" };
  }, [labConfig, enabledParametersCount, combinationsValidation]);

  const value: LabParametersContextType = {
    parameterConfigs,
    labConfig,
    updateParameter,
    setParameterConfigs,
    updateLabConfig,
    resetParameters,
    combinationsValidation,
    canExecuteOptimization,
    enabledParametersCount,
  };

  return (
    <LabParametersContext.Provider value={value}>
      {children}
    </LabParametersContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook para acessar o contexto de parâmetros do laboratório.
 * Deve ser usado dentro de um LabParametersProvider.
 */
export function useLabParameters() {
  const context = useContext(LabParametersContext);
  if (!context) {
    throw new Error("useLabParameters must be used within LabParametersProvider");
  }
  return context;
}

export default LabParametersContext;
