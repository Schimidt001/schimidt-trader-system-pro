-- Migration: Add reprediction configuration for M30
-- Date: 2025-11-06
-- Description: Adds repredictionEnabled and repredictionDelay fields for M30 re-prediction feature

ALTER TABLE `config` ADD COLUMN `repredictionEnabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Enable re-prediction for M30 timeframe';
ALTER TABLE `config` ADD COLUMN `repredictionDelay` INT NOT NULL DEFAULT 300 COMMENT 'Delay in seconds before re-prediction (default: 5 min)';
