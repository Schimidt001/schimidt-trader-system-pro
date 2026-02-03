/**
 * Hook customizado para alarme sonoro de trades
 * 
 * Toca um som quando uma nova posição é aberta
 * Inclui controles de volume e ativação/desativação
 * 
 * @author Manus AI
 * @date 2026-02-03
 */

import { useEffect, useRef, useState } from 'react';

interface UseTradeAlertOptions {
  enabled?: boolean;
  volume?: number; // 0.0 a 1.0
}

interface UseTradeAlertReturn {
  playAlert: () => void;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  volume: number;
  setVolume: (volume: number) => void;
}

/**
 * Hook para tocar alarme sonoro quando nova posição é aberta
 */
export function useTradeAlert(options: UseTradeAlertOptions = {}): UseTradeAlertReturn {
  const { enabled: initialEnabled = true, volume: initialVolume = 0.7 } = options;
  
  const [enabled, setEnabled] = useState<boolean>(() => {
    // Carregar preferência do localStorage
    const saved = localStorage.getItem('tradeAlertEnabled');
    return saved !== null ? JSON.parse(saved) : initialEnabled;
  });
  
  const [volume, setVolume] = useState<number>(() => {
    // Carregar volume do localStorage
    const saved = localStorage.getItem('tradeAlertVolume');
    return saved !== null ? parseFloat(saved) : initialVolume;
  });
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  
  // Inicializar AudioContext (Web Audio API)
  useEffect(() => {
    // Criar AudioContext apenas uma vez
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        gainNodeRef.current = audioContextRef.current.createGain();
        gainNodeRef.current.connect(audioContextRef.current.destination);
      } catch (error) {
        console.warn('[TradeAlert] AudioContext não suportado:', error);
      }
    }
    
    // Cleanup
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);
  
  // Atualizar volume do GainNode
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);
  
  // Salvar preferências no localStorage
  useEffect(() => {
    localStorage.setItem('tradeAlertEnabled', JSON.stringify(enabled));
  }, [enabled]);
  
  useEffect(() => {
    localStorage.setItem('tradeAlertVolume', volume.toString());
  }, [volume]);
  
  /**
   * Toca o alarme sonoro
   * Usa Web Audio API para gerar som sintetizado (não precisa de arquivo de áudio)
   */
  const playAlert = () => {
    if (!enabled || !audioContextRef.current || !gainNodeRef.current) {
      return;
    }
    
    try {
      const ctx = audioContextRef.current;
      const now = ctx.currentTime;
      
      // Criar oscilador para o som
      const oscillator = ctx.createOscillator();
      const envelope = ctx.createGain();
      
      // Conectar: Oscillator -> Envelope -> GainNode -> Destination
      oscillator.connect(envelope);
      envelope.connect(gainNodeRef.current);
      
      // Configurar som: Duas notas em sequência (ding-dong)
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, now); // Nota A5
      oscillator.frequency.setValueAtTime(1047, now + 0.15); // Nota C6
      
      // Envelope ADSR (Attack, Decay, Sustain, Release)
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(0.3, now + 0.01); // Attack
      envelope.gain.linearRampToValueAtTime(0.2, now + 0.1);  // Decay
      envelope.gain.setValueAtTime(0.2, now + 0.3);           // Sustain
      envelope.gain.linearRampToValueAtTime(0, now + 0.5);    // Release
      
      // Tocar
      oscillator.start(now);
      oscillator.stop(now + 0.5);
      
      console.log('[TradeAlert] 🔔 Alarme tocado!');
    } catch (error) {
      console.error('[TradeAlert] Erro ao tocar alarme:', error);
    }
  };
  
  return {
    playAlert,
    enabled,
    setEnabled,
    volume,
    setVolume,
  };
}
