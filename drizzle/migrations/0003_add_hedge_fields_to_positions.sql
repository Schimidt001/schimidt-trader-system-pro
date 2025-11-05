-- Migration: Adicionar campos de hedge à tabela positions
-- Data: 04/11/2025
-- Descrição: Adiciona campos para identificar e relacionar posições de hedge

-- Adicionar campos de hedge na tabela positions
ALTER TABLE positions 
  ADD COLUMN IF NOT EXISTS isHedge BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Indica se a posição é um hedge (true) ou posição original (false)',
  ADD COLUMN IF NOT EXISTS parentPositionId INT NULL COMMENT 'ID da posição original (se for hedge)',
  ADD COLUMN IF NOT EXISTS hedgeAction VARCHAR(50) NULL COMMENT 'Tipo de ação: HOLD, REINFORCE, HEDGE, REVERSAL_EDGE',
  ADD COLUMN IF NOT EXISTS hedgeReason TEXT NULL COMMENT 'Motivo da abertura do hedge';

-- Adicionar índice para melhorar performance de queries
CREATE INDEX IF NOT EXISTS idx_positions_parent ON positions(parentPositionId);
CREATE INDEX IF NOT EXISTS idx_positions_is_hedge ON positions(isHedge);
CREATE INDEX IF NOT EXISTS idx_positions_candle_user ON positions(candleTimestamp, userId);
