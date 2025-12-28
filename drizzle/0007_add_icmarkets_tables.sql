-- Migration: Add IC Markets / cTrader tables
-- This migration creates the necessary tables for IC Markets Forex trading

-- IC Markets Configuration Table
CREATE TABLE IF NOT EXISTS `icmarketsConfig` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `botId` INT NOT NULL DEFAULT 1,
  
  -- cTrader Credentials
  `clientId` VARCHAR(100),
  `clientSecret` TEXT,
  `accessToken` TEXT,
  `refreshToken` TEXT,
  `tokenExpiresAt` TIMESTAMP,
  
  -- Account Configuration
  `accountId` VARCHAR(50),
  `isDemo` BOOLEAN NOT NULL DEFAULT TRUE,
  `leverage` INT NOT NULL DEFAULT 500,
  
  -- Trading Parameters
  `symbol` VARCHAR(20) NOT NULL DEFAULT 'EURUSD',
  `timeframe` VARCHAR(10) NOT NULL DEFAULT 'M15',
  `lots` DECIMAL(10, 2) NOT NULL DEFAULT 0.01,
  
  -- Risk Management
  `stopLossPips` INT NOT NULL DEFAULT 15,
  `takeProfitPips` INT NOT NULL DEFAULT 0,
  `stopDailyUsd` DECIMAL(10, 2) NOT NULL DEFAULT 100.00,
  `takeDailyUsd` DECIMAL(10, 2) NOT NULL DEFAULT 500.00,
  
  -- Trailing Stop
  `trailingEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `trailingTriggerPips` INT NOT NULL DEFAULT 10,
  `trailingStepPips` INT NOT NULL DEFAULT 5,
  
  -- Technical Indicators
  `emaFastPeriod` INT NOT NULL DEFAULT 9,
  `emaSlowPeriod` INT NOT NULL DEFAULT 21,
  `rsiPeriod` INT NOT NULL DEFAULT 14,
  `rsiOverbought` INT NOT NULL DEFAULT 70,
  `rsiOversold` INT NOT NULL DEFAULT 30,
  
  -- Trend Sniper Strategy
  `trendSniperEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `entryDistancePips` INT NOT NULL DEFAULT 5,
  `lookbackCandles` INT NOT NULL DEFAULT 100,
  
  -- Metadata
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX `idx_icmarkets_user` (`userId`),
  UNIQUE KEY `uk_icmarkets_user_bot` (`userId`, `botId`)
);

-- Forex Positions Table
CREATE TABLE IF NOT EXISTS `forexPositions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `botId` INT NOT NULL DEFAULT 1,
  
  -- Position Identification
  `positionId` VARCHAR(100) UNIQUE,
  `openOrderId` VARCHAR(100),
  `closeOrderId` VARCHAR(100),
  
  -- Position Details
  `symbol` VARCHAR(20) NOT NULL,
  `direction` VARCHAR(10) NOT NULL,
  `lots` DECIMAL(10, 2) NOT NULL,
  `entryPrice` DECIMAL(15, 5) NOT NULL,
  `exitPrice` DECIMAL(15, 5),
  
  -- Risk Management
  `initialStopLoss` DECIMAL(15, 5),
  `currentStopLoss` DECIMAL(15, 5),
  `takeProfit` DECIMAL(15, 5),
  
  -- Results
  `pnlUsd` DECIMAL(10, 2),
  `pnlPips` DECIMAL(10, 1),
  `swap` DECIMAL(10, 2) DEFAULT 0.00,
  `commission` DECIMAL(10, 2) DEFAULT 0.00,
  
  -- Status
  `status` VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  `closeReason` VARCHAR(50),
  
  -- Strategy
  `strategy` VARCHAR(50),
  `entrySignal` VARCHAR(50),
  `signalConfidence` INT,
  
  -- Timestamps
  `openTime` TIMESTAMP,
  `closeTime` TIMESTAMP,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX `idx_forex_user` (`userId`),
  INDEX `idx_forex_status` (`status`),
  INDEX `idx_forex_symbol` (`symbol`)
);
