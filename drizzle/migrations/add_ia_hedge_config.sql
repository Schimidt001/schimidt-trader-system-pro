-- Migração: Adicionar tabela de configurações da IA Hedge
-- Data: 04/11/2025
-- Descrição: Tabela para armazenar configurações das 3 estratégias da IA Hedge

CREATE TABLE IF NOT EXISTS `hedge_config` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Estratégia 1: Detecção de Reversão
  `reversal_detection_minute` DECIMAL(4,2) NOT NULL DEFAULT 9.50,
  `reversal_threshold` DECIMAL(4,2) NOT NULL DEFAULT 0.60,
  `reversal_stake_multiplier` DECIMAL(4,2) NOT NULL DEFAULT 1.00,
  
  -- Estratégia 2: Reforço em Pullback
  `pullback_detection_start` DECIMAL(4,2) NOT NULL DEFAULT 9.50,
  `pullback_detection_end` DECIMAL(4,2) NOT NULL DEFAULT 12.00,
  `pullback_min_progress` DECIMAL(4,2) NOT NULL DEFAULT 0.15,
  `pullback_max_progress` DECIMAL(4,2) NOT NULL DEFAULT 0.40,
  `pullback_stake_multiplier` DECIMAL(4,2) NOT NULL DEFAULT 0.50,
  
  -- Estratégia 3: Reversão de Ponta
  `edge_reversal_minute` DECIMAL(4,2) NOT NULL DEFAULT 13.50,
  `edge_extension_threshold` DECIMAL(4,2) NOT NULL DEFAULT 0.80,
  `edge_stake_multiplier` DECIMAL(4,2) NOT NULL DEFAULT 0.75,
  
  -- Janela geral de análise
  `analysis_start_minute` DECIMAL(4,2) NOT NULL DEFAULT 9.50,
  `analysis_end_minute` DECIMAL(4,2) NOT NULL DEFAULT 14.50,
  
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Inserir configuração padrão
INSERT INTO `hedge_config` (
  `enabled`,
  `reversal_detection_minute`,
  `reversal_threshold`,
  `reversal_stake_multiplier`,
  `pullback_detection_start`,
  `pullback_detection_end`,
  `pullback_min_progress`,
  `pullback_max_progress`,
  `pullback_stake_multiplier`,
  `edge_reversal_minute`,
  `edge_extension_threshold`,
  `edge_stake_multiplier`,
  `analysis_start_minute`,
  `analysis_end_minute`
) VALUES (
  TRUE,
  9.50,
  0.60,
  1.00,
  9.50,
  12.00,
  0.15,
  0.40,
  0.50,
  13.50,
  0.80,
  0.75,
  9.50,
  14.50
);
