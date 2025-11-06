-- Migration: Add timeframe support to config table
-- Date: 2025-11-06
-- Description: Adds timeframe field to allow selection between M15 (900s) and M30 (1800s)

ALTER TABLE `config` ADD COLUMN `timeframe` INT NOT NULL DEFAULT 900 COMMENT 'Timeframe in seconds: 900 (M15) or 1800 (M30)';
