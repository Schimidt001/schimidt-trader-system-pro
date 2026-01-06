-- Migration: Add structureTimeframe field to smcStrategyConfig table
-- Description: Adds the structureTimeframe column to allow dynamic selection of 
--              timeframe for Swing Points identification (H1, M15, M5)
-- Author: Schimidt Trader Pro
-- Date: 2026-01-06

-- Add structureTimeframe column to smcStrategyConfig table
ALTER TABLE `smcStrategyConfig` 
ADD COLUMN `structureTimeframe` VARCHAR(5) NOT NULL DEFAULT 'H1' 
AFTER `strategyType`;

-- Add comment for documentation
-- structureTimeframe: 'H1' (Conservador), 'M15' (Agressivo), 'M5' (Scalper)
