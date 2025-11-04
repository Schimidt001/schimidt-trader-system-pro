-- Migration: Add IA Hedge Inteligente functionality
-- Date: 2025-11-04
-- Description: Adds IA Hedge configuration fields to config table and hedge tracking fields to positions table

-- Add new fields to config table for IA Hedge
ALTER TABLE config 
  ADD COLUMN IF NOT EXISTS hedgeEnabled BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Toggle para ativar/desativar IA Hedge',
  ADD COLUMN IF NOT EXISTS hedgeConfig TEXT NULL COMMENT 'Configurações de hedge armazenadas como JSON';

-- Add new fields to positions table for hedge tracking
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS isHedge BOOLEAN DEFAULT FALSE COMMENT 'Flag indicando se é uma posição hedge',
  ADD COLUMN IF NOT EXISTS originalPositionId INT NULL COMMENT 'ID da posição original (se for hedge)',
  ADD COLUMN IF NOT EXISTS hedgeAction VARCHAR(20) NULL COMMENT 'Ação do hedge: HOLD, REINFORCE, HEDGE',
  ADD COLUMN IF NOT EXISTS hedgeReason TEXT NULL COMMENT 'Razão detalhada da decisão de hedge';

-- Create index for querying hedge positions
CREATE INDEX IF NOT EXISTS idx_positions_isHedge ON positions(userId, isHedge, createdAt);
CREATE INDEX IF NOT EXISTS idx_positions_originalPositionId ON positions(originalPositionId);
