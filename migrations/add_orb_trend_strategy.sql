-- Migration: Adicionar tabela orbTrendConfig para estratégia ORB Trend
-- Data: 2026-01-28
-- Descrição: Cria tabela para armazenar configurações da estratégia ORB Trend (Opening Range Breakout)

CREATE TABLE IF NOT EXISTS `orbTrendConfig` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `botId` int NOT NULL DEFAULT 1,
  
  -- Ativos monitorados
  `activeSymbols` text NOT NULL,
  
  -- Opening Range
  `openingCandles` int NOT NULL DEFAULT 3,
  
  -- Filtro de Regime (EMA200)
  `emaPeriod` int NOT NULL DEFAULT 200,
  `slopeLookbackCandles` int NOT NULL DEFAULT 10,
  `minSlope` decimal(10, 6) NOT NULL DEFAULT 0.000100,
  
  -- Stop Loss
  `stopType` varchar(20) NOT NULL DEFAULT 'rangeOpposite',
  `atrMult` decimal(5, 2) NOT NULL DEFAULT 1.50,
  `atrPeriod` int NOT NULL DEFAULT 14,
  
  -- Take Profit
  `riskReward` decimal(5, 2) NOT NULL DEFAULT 1.00,
  
  -- Frequência
  `maxTradesPerDayPerSymbol` int NOT NULL DEFAULT 1,
  
  -- Gestão de Risco
  `riskPercentage` decimal(5, 2) NOT NULL DEFAULT 1.00,
  `maxOpenTrades` int NOT NULL DEFAULT 3,
  
  -- Filtro de Spread
  `maxSpreadPips` decimal(5, 1) NOT NULL DEFAULT 3.0,
  
  -- Logging
  `verboseLogging` boolean NOT NULL DEFAULT true,
  
  -- Timestamps
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Índices
  INDEX `idx_userId_botId` (`userId`, `botId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
