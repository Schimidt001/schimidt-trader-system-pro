import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

/**
 * Tipos de corretora suportados pelo sistema
 * - DERIV: Binary Options / Synthetic Indices (WebSocket API)
 * - ICMARKETS: Forex Spot via cTrader Open API (Protocol Buffers)
 */
export type BrokerType = "DERIV" | "ICMARKETS";

/**
 * Configurações específicas de cada corretora
 */
export interface BrokerConfig {
  DERIV: {
    label: string;
    description: string;
    color: string;
    icon: string;
  };
  ICMARKETS: {
    label: string;
    description: string;
    color: string;
    icon: string;
  };
}

export const BROKER_CONFIG: BrokerConfig = {
  DERIV: {
    label: "DERIV",
    description: "Binary Options & Synthetic Indices",
    color: "from-red-600 to-red-800",
    icon: "📊",
  },
  ICMARKETS: {
    label: "IC MARKETS",
    description: "Forex Spot via cTrader",
    color: "from-blue-600 to-blue-800",
    icon: "💹",
  },
};

interface BrokerContextType {
  /** Corretora atualmente selecionada */
  broker: BrokerType;
  /** Função para alternar a corretora */
  setBroker: (broker: BrokerType) => void;
  /** Configurações da corretora atual */
  currentConfig: typeof BROKER_CONFIG.DERIV;
  /** Verifica se está no modo Deriv */
  isDeriv: boolean;
  /** Verifica se está no modo IC Markets */
  isICMarkets: boolean;
}

const BrokerContext = createContext<BrokerContextType | undefined>(undefined);

const BROKER_STORAGE_KEY = "schimidt-trader-broker";

interface BrokerProviderProps {
  children: React.ReactNode;
  defaultBroker?: BrokerType;
}

/**
 * Provider que gerencia o contexto global da corretora selecionada.
 * Persiste a escolha no localStorage para manter a preferência do usuário.
 */
export function BrokerProvider({
  children,
  defaultBroker = "DERIV",
}: BrokerProviderProps) {
  const [broker, setBrokerState] = useState<BrokerType>(() => {
    // Recuperar do localStorage ou usar padrão
    const stored = localStorage.getItem(BROKER_STORAGE_KEY);
    if (stored === "DERIV" || stored === "ICMARKETS") {
      return stored;
    }
    return defaultBroker;
  });

  // Persistir no localStorage quando mudar
  useEffect(() => {
    localStorage.setItem(BROKER_STORAGE_KEY, broker);
  }, [broker]);

  const setBroker = useCallback((newBroker: BrokerType) => {
    setBrokerState(newBroker);
    // Disparar evento customizado para notificar componentes que precisam re-renderizar
    window.dispatchEvent(new CustomEvent("broker-change", { detail: newBroker }));
  }, []);

  const value: BrokerContextType = {
    broker,
    setBroker,
    currentConfig: BROKER_CONFIG[broker],
    isDeriv: broker === "DERIV",
    isICMarkets: broker === "ICMARKETS",
  };

  return (
    <BrokerContext.Provider value={value}>
      {children}
    </BrokerContext.Provider>
  );
}

/**
 * Hook para acessar o contexto da corretora.
 * Deve ser usado dentro de um BrokerProvider.
 */
export function useBroker() {
  const context = useContext(BrokerContext);
  if (!context) {
    throw new Error("useBroker must be used within BrokerProvider");
  }
  return context;
}

/**
 * Hook para escutar mudanças de corretora (útil para componentes que precisam reagir à mudança)
 */
export function useBrokerChange(callback: (broker: BrokerType) => void) {
  useEffect(() => {
    const handler = (event: CustomEvent<BrokerType>) => {
      callback(event.detail);
    };
    window.addEventListener("broker-change", handler as EventListener);
    return () => {
      window.removeEventListener("broker-change", handler as EventListener);
    };
  }, [callback]);
}
