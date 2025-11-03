-- Migration: Add Hourly Filter Fields
-- Created: 2025-11-02

ALTER TABLE `config` 
ADD COLUMN `hourlyFilterEnabled` BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Toggle para ativar/desativar filtro de horário',
ADD COLUMN `hourlyFilterMode` ENUM('IDEAL', 'COMPATIBLE', 'GOLDEN', 'COMBINED', 'CUSTOM') NOT NULL DEFAULT 'COMBINED' COMMENT 'Modo do filtro',
ADD COLUMN `customHours` TEXT COMMENT 'Horários personalizados em formato JSON',
ADD COLUMN `goldModeHours` TEXT COMMENT 'Horários do modo GOLD em formato JSON',
ADD COLUMN `goldModeStakeMultiplier` INT NOT NULL DEFAULT 200 COMMENT 'Multiplicador de stake para modo GOLD (em porcentagem)';
