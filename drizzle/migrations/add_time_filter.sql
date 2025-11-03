-- Migration: Add Time Filter functionality
-- Date: 2025-11-03
-- Description: Adds time filter configuration fields to config table, new state to botState, and isGoldTrade flag to positions

-- Add new fields to config table
ALTER TABLE config 
  ADD COLUMN IF NOT EXISTS timeFilterEnabled BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Toggle para ativar/desativar filtro de horário',
  ADD COLUMN IF NOT EXISTS allowedHours TEXT NULL COMMENT 'Array de horários permitidos (0-23) armazenado como JSON',
  ADD COLUMN IF NOT EXISTS goldHours TEXT NULL COMMENT 'Array de horários GOLD (0-23) armazenado como JSON',
  ADD COLUMN IF NOT EXISTS goldStake INT DEFAULT 1000 COMMENT 'Stake especial para horários GOLD (em centavos)',
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo' COMMENT 'Timezone do usuário',
  ADD COLUMN IF NOT EXISTS phaseStrategyCache TEXT NULL COMMENT 'Cache de fase/estratégia para evitar re-detecção';

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
  ADD COLUMN IF NOT EXISTS nextAllowedTime BIGINT NULL COMMENT 'Próximo horário permitido (timestamp Unix em segundos)',
  ADD COLUMN IF NOT EXISTS nextGoldTime BIGINT NULL COMMENT 'Próximo horário GOLD (timestamp Unix em segundos)',
  ADD COLUMN IF NOT EXISTS isGoldHour BOOLEAN DEFAULT FALSE COMMENT 'Flag indicando se horário atual é GOLD';

-- Add isGoldTrade field to positions table
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS isGoldTrade BOOLEAN DEFAULT FALSE COMMENT 'Flag indicando se foi trade em horário GOLD';

-- Create index for querying gold trades
CREATE INDEX IF NOT EXISTS idx_positions_isGoldTrade ON positions(userId, isGoldTrade, createdAt);
