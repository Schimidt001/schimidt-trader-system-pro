import { useState } from "react";

interface BotSelectorProps {
  selectedBot: number;
  onBotChange: (botId: number) => void;
}

export function BotSelector({ selectedBot, onBotChange }: BotSelectorProps) {
  return (
    <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-1">
      <button
        onClick={() => onBotChange(1)}
        className={`px-4 py-2 rounded-md font-medium transition-all ${
          selectedBot === 1
            ? "bg-blue-600 text-white shadow-lg"
            : "bg-transparent text-gray-400 hover:text-white"
        }`}
      >
        Bot 1
      </button>
      <button
        onClick={() => onBotChange(2)}
        className={`px-4 py-2 rounded-md font-medium transition-all ${
          selectedBot === 2
            ? "bg-green-600 text-white shadow-lg"
            : "bg-transparent text-gray-400 hover:text-white"
        }`}
      >
        Bot 2
      </button>
    </div>
  );
}

// Hook para gerenciar o bot selecionado globalmente
export function useBotSelector() {
  const [selectedBot, setSelectedBot] = useState<number>(1);

  return {
    selectedBot,
    setSelectedBot,
  };
}
