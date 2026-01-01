-- Migration: Add SMC Strategy Tables
-- Description: Creates tables for SMC (Smart Money Concepts) strategy configuration and logging
-- Author: Schimidt Trader Pro
-- Date: 2026-01-01

-- ============= SMC STRATEGY CONFIG =============
-- Main configuration table for SMC Swarm strategy
CREATE TABLE IF NOT EXISTS `smcStrategyConfig` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `botId` INT NOT NULL DEFAULT 1,
  
  -- Strategy Type
  `strategyType` VARCHAR(20) NOT NULL DEFAULT 'SMC_SWARM',
  
  -- Active Symbols (Swarm)
  `activeSymbols` TEXT NOT NULL,
  
  -- Structure Parameters (H1)
  `swingH1Lookback` INT NOT NULL DEFAULT 50,
  `fractalLeftBars` INT NOT NULL DEFAULT 2,
  `fractalRightBars` INT NOT NULL DEFAULT 2,
  
  -- Sweep Parameters
  `sweepBufferPips` DECIMAL(5,1) NOT NULL DEFAULT 2.0,
  `sweepValidationMinutes` INT NOT NULL DEFAULT 60,
  
  -- CHoCH Parameters (M15)
  `chochM15Lookback` INT NOT NULL DEFAULT 20,
  `chochMinPips` DECIMAL(5,1) NOT NULL DEFAULT 10.0,
  
  -- Order Block Parameters
  `orderBlockLookback` INT NOT NULL DEFAULT 10,
  `orderBlockExtensionPips` DECIMAL(5,1) NOT NULL DEFAULT 15.0,
  
  -- Entry Parameters (M5)
  `entryConfirmationType` VARCHAR(20) NOT NULL DEFAULT 'ANY',
  `rejectionWickPercent` DECIMAL(5,2) NOT NULL DEFAULT 60.00,
  
  -- Risk Management
  `riskPercentage` DECIMAL(5,2) NOT NULL DEFAULT 0.75,
  `maxOpenTrades` INT NOT NULL DEFAULT 3,
  `dailyLossLimitPercent` DECIMAL(5,2) NOT NULL DEFAULT 3.00,
  `stopLossBufferPips` DECIMAL(5,1) NOT NULL DEFAULT 2.0,
  `rewardRiskRatio` DECIMAL(4,1) NOT NULL DEFAULT 4.0,
  
  -- Session Filter
  `sessionFilterEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `londonSessionStart` VARCHAR(5) NOT NULL DEFAULT '04:00',
  `londonSessionEnd` VARCHAR(5) NOT NULL DEFAULT '07:00',
  `nySessionStart` VARCHAR(5) NOT NULL DEFAULT '09:30',
  `nySessionEnd` VARCHAR(5) NOT NULL DEFAULT '12:30',
  
  -- Trailing Stop
  `trailingEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `trailingTriggerPips` DECIMAL(5,1) NOT NULL DEFAULT 20.0,
  `trailingStepPips` DECIMAL(5,1) NOT NULL DEFAULT 10.0,
  
  -- Circuit Breakers
  `circuitBreakerEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `dailyStartEquity` DECIMAL(15,2) NULL,
  `dailyEquityResetDate` VARCHAR(10) NULL,
  `tradingBlockedToday` BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Swarm State
  `swarmState` TEXT NULL,
  
  -- Logging
  `verboseLogging` BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Metadata
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes
  INDEX `idx_userId` (`userId`),
  UNIQUE KEY `unique_user_bot` (`userId`, `botId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============= SMC SWING POINTS =============
-- Stores identified swing points for analysis and debugging
CREATE TABLE IF NOT EXISTS `smcSwingPoints` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `botId` INT NOT NULL DEFAULT 1,
  
  `symbol` VARCHAR(20) NOT NULL,
  `timeframe` VARCHAR(10) NOT NULL,
  `type` VARCHAR(10) NOT NULL,
  `price` DECIMAL(15,5) NOT NULL,
  `candleTimestamp` INT NOT NULL,
  `swept` BOOLEAN NOT NULL DEFAULT FALSE,
  `sweptAt` INT NULL,
  `isValid` BOOLEAN NOT NULL DEFAULT TRUE,
  
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes
  INDEX `idx_userId_symbol` (`userId`, `symbol`),
  INDEX `idx_symbol_timeframe` (`symbol`, `timeframe`),
  INDEX `idx_candleTimestamp` (`candleTimestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============= SMC EVENT LOG =============
-- Logs all SMC-related events for debugging and analysis
CREATE TABLE IF NOT EXISTS `smcEventLog` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `botId` INT NOT NULL DEFAULT 1,
  
  `symbol` VARCHAR(20) NOT NULL,
  `eventType` VARCHAR(30) NOT NULL,
  `timeframe` VARCHAR(10) NOT NULL,
  `price` DECIMAL(15,5) NOT NULL,
  `description` TEXT NOT NULL,
  `metadata` TEXT NULL,
  
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes
  INDEX `idx_userId_symbol` (`userId`, `symbol`),
  INDEX `idx_eventType` (`eventType`),
  INDEX `idx_createdAt` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============= ADD STRATEGY TYPE TO ICMARKETS CONFIG =============
-- Add strategyType column to existing icmarketsConfig table
-- Using procedure to handle "column already exists" gracefully
DELIMITER //
CREATE PROCEDURE AddStrategyTypeColumn()
BEGIN
    DECLARE CONTINUE HANDLER FOR 1060 BEGIN END;
    ALTER TABLE `icmarketsConfig` ADD COLUMN `strategyType` VARCHAR(20) NOT NULL DEFAULT 'SMC_SWARM' AFTER `botId`;
END //
DELIMITER ;
CALL AddStrategyTypeColumn();
DROP PROCEDURE IF EXISTS AddStrategyTypeColumn;
