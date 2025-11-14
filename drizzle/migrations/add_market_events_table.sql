-- Migration: Add Market Events Table
-- Created: 2025-11-14
-- Description: Tabela para armazenar eventos macroeconômicos coletados de fontes externas

CREATE TABLE IF NOT EXISTS marketEvents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  currency VARCHAR(10) NOT NULL,
  impact ENUM('HIGH', 'MEDIUM', 'LOW') NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  source VARCHAR(50) NOT NULL,
  actual VARCHAR(50),
  forecast VARCHAR(50),
  previous VARCHAR(50),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX timestamp_idx (timestamp),
  INDEX currency_idx (currency),
  INDEX impact_idx (impact)
);
