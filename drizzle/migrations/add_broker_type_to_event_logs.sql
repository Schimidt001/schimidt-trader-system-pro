-- Migration: Add brokerType column to eventLogs table
-- Purpose: Enable log isolation between DERIV and ICMARKETS brokers

ALTER TABLE eventLogs ADD COLUMN brokerType ENUM('DERIV', 'ICMARKETS') NOT NULL DEFAULT 'DERIV';

-- Create index for faster filtering by broker
CREATE INDEX idx_eventLogs_brokerType ON eventLogs(brokerType);

-- Create composite index for common query pattern
CREATE INDEX idx_eventLogs_user_bot_broker ON eventLogs(userId, botId, brokerType);
