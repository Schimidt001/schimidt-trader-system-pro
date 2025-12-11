-- Migration: Add password field to users table
-- Date: 2025-12-11
-- Description: Add password field for local authentication (bcrypt hash)

ALTER TABLE `users` ADD COLUMN `password` VARCHAR(255) NULL AFTER `email`;
