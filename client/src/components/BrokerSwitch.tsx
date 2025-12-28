import { useBroker, BrokerType, BROKER_CONFIG } from "@/contexts/BrokerContext";
import { motion } from "framer-motion";

/**
 * Global Broker Switch - Seletor de corretora no header
 * 
 * Requisito: O sistema não pode ser confuso. O usuário deve operar em "Contextos Isolados".
 * Ao alterar este seletor, a aplicação deve disparar um re-render completo das páginas,
 * carregando apenas os componentes do contexto selecionado.
 */
export function BrokerSwitch() {
  const { broker, setBroker, currentConfig } = useBroker();

  const handleSwitch = (newBroker: BrokerType) => {
    if (newBroker !== broker) {
      setBroker(newBroker);
    }
  };

  return (
    <div className="flex items-center gap-1 bg-slate-800/80 rounded-xl p-1 border border-slate-700/50 shadow-lg backdrop-blur-sm">
      {/* Botão DERIV */}
      <BrokerButton
        type="DERIV"
        isActive={broker === "DERIV"}
        onClick={() => handleSwitch("DERIV")}
      />
      
      {/* Botão IC MARKETS */}
      <BrokerButton
        type="ICMARKETS"
        isActive={broker === "ICMARKETS"}
        onClick={() => handleSwitch("ICMARKETS")}
      />
    </div>
  );
}

interface BrokerButtonProps {
  type: BrokerType;
  isActive: boolean;
  onClick: () => void;
}

function BrokerButton({ type, isActive, onClick }: BrokerButtonProps) {
  const config = BROKER_CONFIG[type];
  
  return (
    <button
      onClick={onClick}
      className={`
        relative px-4 py-2 rounded-lg font-medium text-sm transition-all duration-300
        ${isActive 
          ? "text-white shadow-lg" 
          : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
        }
      `}
    >
      {/* Background animado quando ativo */}
      {isActive && (
        <motion.div
          layoutId="broker-switch-bg"
          className={`absolute inset-0 rounded-lg bg-gradient-to-r ${config.color}`}
          initial={false}
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
      
      {/* Conteúdo do botão */}
      <span className="relative z-10 flex items-center gap-2">
        <span className="text-base">{config.icon}</span>
        <span className="hidden sm:inline">{config.label}</span>
      </span>
      
      {/* Indicador de modo ativo */}
      {isActive && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full shadow-lg shadow-green-400/50"
        />
      )}
    </button>
  );
}

/**
 * Versão compacta do switch para mobile
 */
export function BrokerSwitchCompact() {
  const { broker, setBroker, currentConfig } = useBroker();

  const toggleBroker = () => {
    setBroker(broker === "DERIV" ? "ICMARKETS" : "DERIV");
  };

  return (
    <button
      onClick={toggleBroker}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-sm
        bg-gradient-to-r ${currentConfig.color} text-white
        shadow-lg transition-all duration-300 hover:opacity-90
      `}
    >
      <span>{currentConfig.icon}</span>
      <span>{currentConfig.label}</span>
      <svg 
        className="w-4 h-4 opacity-70" 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2} 
          d="M8 9l4-4 4 4m0 6l-4 4-4-4" 
        />
      </svg>
    </button>
  );
}

/**
 * Indicador visual do modo atual (para usar em outras partes da UI)
 */
export function BrokerIndicator() {
  const { currentConfig, broker } = useBroker();
  
  return (
    <div className={`
      inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
      bg-gradient-to-r ${currentConfig.color} text-white shadow-sm
    `}>
      <span>{currentConfig.icon}</span>
      <span>Modo {currentConfig.label}</span>
    </div>
  );
}
