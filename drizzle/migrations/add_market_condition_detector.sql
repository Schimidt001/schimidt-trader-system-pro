-- Migration: Add Market Condition Detector
-- Created: 2025-11-14

-- 1. Add marketConditionEnabled field to config table
ALTER TABLE config ADD COLUMN marketConditionEnabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Create marketConditions table
CREATE TABLE IF NOT EXISTS marketConditions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  botId INT NOT NULL DEFAULT 1,
  candleTimestamp BIGINT NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  status ENUM('GREEN', 'YELLOW', 'RED') NOT NULL,
  score INT NOT NULL,
  reasons TEXT NOT NULL,
  details TEXT,
  computedAt TIMESTAMP NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_bot (userId, botId),
  INDEX idx_symbol (symbol),
  INDEX idx_timestamp (candleTimestamp),
  INDEX idx_computed (computedAt)
);
