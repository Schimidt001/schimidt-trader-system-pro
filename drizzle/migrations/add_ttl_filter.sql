-- Migration: Add TTL Filter (Time-To-Close Filter)
-- Date: 2025-12-21
-- Description: Adds TTL Filter configuration fields to prevent late trigger arming

-- Add TTL Filter configuration fields to config table
ALTER TABLE `config` ADD COLUMN `ttlEnabled` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Enable TTL Filter (disabled by default)';
ALTER TABLE `config` ADD COLUMN `ttlMinimumSeconds` INT NOT NULL DEFAULT 900 COMMENT 'Minimum time remaining required in seconds (default: 900s = 15min)';
ALTER TABLE `config` ADD COLUMN `ttlTriggerDelayBuffer` INT NOT NULL DEFAULT 300 COMMENT 'Additional safety buffer for trigger delay in seconds (default: 300s = 5min)';
ALTER TABLE `config` ADD COLUMN `ttlLogEnabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Enable detailed TTL logs (enabled by default)';
