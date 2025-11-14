-- Migration: Add marketDetectorConfig table
-- Created: 2025-11-14

CREATE TABLE IF NOT EXISTS `marketDetectorConfig` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `userId` int NOT NULL UNIQUE,
  `enabled` boolean DEFAULT true NOT NULL,
  `atrWindow` int DEFAULT 14 NOT NULL,
  `atrMultiplier` decimal(4,2) DEFAULT '2.50' NOT NULL,
  `atrScore` int DEFAULT 2 NOT NULL,
  `wickMultiplier` decimal(4,2) DEFAULT '2.00' NOT NULL,
  `wickScore` int DEFAULT 1 NOT NULL,
  `fractalThreshold` decimal(4,2) DEFAULT '1.80' NOT NULL,
  `fractalScore` int DEFAULT 1 NOT NULL,
  `spreadMultiplier` decimal(4,2) DEFAULT '2.00' NOT NULL,
  `spreadScore` int DEFAULT 1 NOT NULL,
  `weightHigh` int DEFAULT 3 NOT NULL,
  `weightMedium` int DEFAULT 1 NOT NULL,
  `weightHighPast` int DEFAULT 2 NOT NULL,
  `windowNextNews` int DEFAULT 60 NOT NULL,
  `windowPastNews` int DEFAULT 30 NOT NULL,
  `greenThreshold` int DEFAULT 3 NOT NULL,
  `yellowThreshold` int DEFAULT 6 NOT NULL,
  `createdAt` timestamp DEFAULT (now()) NOT NULL,
  `updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP NOT NULL
);
