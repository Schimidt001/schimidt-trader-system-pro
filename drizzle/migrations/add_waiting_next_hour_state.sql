-- Migration: Add WAITING_NEXT_HOUR state to botState table
-- Created: 2025-11-02
-- Description: Adiciona novo estado para quando o bot está aguardando o próximo horário permitido

ALTER TABLE `botState` 
MODIFY COLUMN `state` ENUM(
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
  'WAITING_NEXT_HOUR'
) NOT NULL DEFAULT 'IDLE';
