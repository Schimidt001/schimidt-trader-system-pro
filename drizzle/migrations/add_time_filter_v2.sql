-- Migration: Add Time Filter functionality (v2 - Compatible)
-- Date: 2025-11-03
-- Description: Adds time filter configuration fields to config table, new state to botState, and isGoldTrade flag to positions

-- Add new fields to config table
ALTER TABLE config 
  ADD COLUMN timeFilterEnabled BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Toggle para ativar/desativar filtro de horário',
  ADD COLUMN allowedHours TEXT NULL COMMENT 'Array de horários permitidos (0-23) armazenado como JSON',
  ADD COLUMN goldHours TEXT NULL COMMENT 'Array de horários GOLD (0-23) armazenado como JSON',
  ADD COLUMN goldStake INT DEFAULT 1000 COMMENT 'Stake especial para horários GOLD (em centavos)',
  ADD COLUMN timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo' COMMENT 'Timezone do usuário',
  ADD COLUMN phaseStrategyCache TEXT NULL COMMENT 'Cache de fase/estratégia para evitar re-detecção';

-- Add new state to botState enum
ALTER TABLE botState 
  MODIFY COLUMN state ENUM(
    'IDLE',
    'COLLECTING',
    'WAITING_MIDPOINT',
    'PREDICTING',
    'ARMED',
    'ENTERED',
    'MANAGING',
    'CLOSED',
    'LOCK_RISK',
    'ERROR_API',
    'DISCONNECTED',
    'STANDBY_TIME_FILTER'
  ) NOT NULL DEFAULT 'IDLE';

-- Add new fields to botState table
ALTER TABLE botState
  ADD COLUMN nextAllowedTime BIGINT NULL COMMENT 'Próximo horário permitido (timestamp Unix em segundos)',
  ADD COLUMN nextGoldTime BIGINT NULL COMMENT 'Próximo horário GOLD (timestamp Unix em segundos)',
  ADD COLUMN isGoldHour BOOLEAN DEFAULT FALSE COMMENT 'Flag indicando se horário atual é GOLD';

-- Add isGoldTrade field to positions table
ALTER TABLE positions
  ADD COLUMN isGoldTrade BOOLEAN DEFAULT FALSE COMMENT 'Flag indicando se foi trade em horário GOLD';

-- Create index for querying gold trades
CREATE INDEX idx_positions_isGoldTrade ON positions(userId, isGoldTrade, createdAt);
