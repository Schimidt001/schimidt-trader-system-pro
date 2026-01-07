-- Migration: Add maxSpread field to icmarketsConfig table
-- TAREFA B: Proteção de Spread para estratégias de Scalping (M5)
-- Se (Ask - Bid) > maxSpread -> ABORTAR TRADE

ALTER TABLE `icmarketsConfig` 
ADD COLUMN `maxSpread` DECIMAL(5,2) NOT NULL DEFAULT 2.00 
AFTER `takeDailyUsd`;
