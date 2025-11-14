-- Migration: Add derivAppId field to config table
-- Date: 2025-11-14

ALTER TABLE `config` ADD COLUMN `derivAppId` varchar(20) DEFAULT '1089';
