import { z } from 'zod';

/**
 * Schema de validação Zod para configurações da IA Hedge
 * 
 * Garante que todas as configurações estejam dentro de limites seguros
 * e que os valores façam sentido matematicamente
 */
export const hedgeConfigSchema = z.object({
  enabled: z.boolean().default(true),
  
  // Estratégia 1: Detecção de Reversão
  reversalDetectionMinute: z.number()
    .min(8.0, "Deve ser >= 8 minutos (após entrada)")
    .max(14.0, "Deve ser <= 14 minutos")
    .default(9.5),
  
  reversalThreshold: z.number()
    .min(0.30, "Threshold muito baixo (mínimo 30%)")
    .max(0.95, "Threshold muito alto (máximo 95%)")
    .default(0.60),
  
  reversalStakeMultiplier: z.number()
    .min(0.1, "Multiplicador muito baixo")
    .max(2.0, "Multiplicador muito alto (máximo 2x)")
    .default(1.0),
  
  // Estratégia 2: Reforço em Pullback
  pullbackDetectionStart: z.number()
    .min(8.0, "Deve ser >= 8 minutos")
    .max(13.0, "Deve ser <= 13 minutos")
    .default(9.5),
  
  pullbackDetectionEnd: z.number()
    .min(10.0, "Deve ser >= 10 minutos")
    .max(14.0, "Deve ser <= 14 minutos")
    .default(12.0),
  
  pullbackMinProgress: z.number()
    .min(0.05, "Progresso mínimo muito baixo")
    .max(0.50, "Progresso mínimo muito alto")
    .default(0.15),
  
  pullbackMaxProgress: z.number()
    .min(0.20, "Progresso máximo muito baixo")
    .max(0.80, "Progresso máximo muito alto")
    .default(0.40),
  
  pullbackStakeMultiplier: z.number()
    .min(0.1, "Multiplicador muito baixo")
    .max(1.5, "Multiplicador muito alto (máximo 1.5x)")
    .default(0.5),
  
  // Estratégia 3: Reversão de Ponta
  edgeReversalMinute: z.number()
    .min(12.0, "Deve ser >= 12 minutos")
    .max(14.5, "Deve ser <= 14.5 minutos")
    .default(13.5),
  
  edgeExtensionThreshold: z.number()
    .min(0.60, "Threshold muito baixo (mínimo 60%)")
    .max(0.95, "Threshold muito alto (máximo 95%)")
    .default(0.80),
  
  edgeStakeMultiplier: z.number()
    .min(0.1, "Multiplicador muito baixo")
    .max(1.5, "Multiplicador muito alto (máximo 1.5x)")
    .default(0.75),
  
  // Janela geral de análise
  analysisStartMinute: z.number()
    .min(8.0, "Deve ser >= 8 minutos")
    .max(13.0, "Deve ser <= 13 minutos")
    .default(9.5),
  
  analysisEndMinute: z.number()
    .min(12.0, "Deve ser >= 12 minutos")
    .max(14.0, "Deve ser <= 14.0 minutos (último momento para ações)")
    .default(14.0),
})
.refine(
  (data) => data.pullbackDetectionStart < data.pullbackDetectionEnd,
  {
    message: "Início da detecção de pullback deve ser menor que o fim",
    path: ["pullbackDetectionStart"],
  }
)
.refine(
  (data) => data.pullbackMinProgress < data.pullbackMaxProgress,
  {
    message: "Progresso mínimo deve ser menor que o máximo",
    path: ["pullbackMinProgress"],
  }
)
.refine(
  (data) => data.analysisStartMinute < data.analysisEndMinute,
  {
    message: "Início da análise deve ser menor que o fim",
    path: ["analysisStartMinute"],
  }
);

export type HedgeConfigValidated = z.infer<typeof hedgeConfigSchema>;

/**
 * Valores padrão para configuração da IA Hedge
 */
export const DEFAULT_HEDGE_CONFIG: HedgeConfigValidated = {
  enabled: true,
  // Timing otimizado com base em análise de 877 candles de 15 min (R_75)
  reversalDetectionMinute: 12.0,
  reversalThreshold: 0.60,          // 60% (valor original seguro)
  reversalStakeMultiplier: 1.5,     // Otimizado: 1.5x
  pullbackDetectionStart: 12.0,
  pullbackDetectionEnd: 14.0,
  pullbackMinProgress: 0.15,        // 15% (valor original seguro)
  pullbackMaxProgress: 0.40,        // 40% (valor original seguro)
  pullbackStakeMultiplier: 1.4,     // Otimizado: 1.4x
  edgeReversalMinute: 12.0,
  edgeExtensionThreshold: 0.80,     // 80% (valor original seguro)
  edgeStakeMultiplier: 1.5,         // Otimizado: 1.5x
  analysisStartMinute: 12.0,
  analysisEndMinute: 14.0,
};

/**
 * Valida e normaliza a configuração de hedge
 * @param config Configuração carregada do banco (pode estar incompleta ou inválida)
 * @returns Configuração validada e normalizada
 */
export function validateHedgeConfig(config: unknown): HedgeConfigValidated {
  try {
    return hedgeConfigSchema.parse(config);
  } catch (error) {
    console.warn("[HEDGE_CONFIG] Configuração inválida, usando padrões:", error);
    // Retornar configuração padrão em caso de erro
    return DEFAULT_HEDGE_CONFIG;
  }
}
