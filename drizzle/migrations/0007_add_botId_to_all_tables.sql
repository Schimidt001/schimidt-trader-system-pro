-- ============================================
-- Migração: Adicionar botId para Multi-Bot
-- Data: 2025-11-11
-- Autor: Manus AI Agent
-- Descrição: Adiciona coluna botId em todas as tabelas
--            para suportar múltiplos bots por usuário
-- ============================================

-- 1. Adicionar coluna botId em config
ALTER TABLE `config` ADD COLUMN `botId` INT NOT NULL DEFAULT 1 AFTER `userId`;
CREATE INDEX `config_userId_botId_idx` ON `config` (`userId`, `botId`);

-- 2. Adicionar coluna botId em positions
ALTER TABLE `positions` ADD COLUMN `botId` INT NOT NULL DEFAULT 1 AFTER `userId`;
CREATE INDEX `positions_userId_botId_idx` ON `positions` (`userId`, `botId`);

-- 3. Adicionar coluna botId em metrics
ALTER TABLE `metrics` ADD COLUMN `botId` INT NOT NULL DEFAULT 1 AFTER `userId`;
CREATE INDEX `metrics_userId_botId_idx` ON `metrics` (`userId`, `botId`);

-- 4. Adicionar coluna botId em eventLogs
ALTER TABLE `eventLogs` ADD COLUMN `botId` INT NOT NULL DEFAULT 1 AFTER `userId`;
CREATE INDEX `eventLogs_userId_botId_idx` ON `eventLogs` (`userId`, `botId`);

-- 5. botState precisa de tratamento especial
-- Remover constraint UNIQUE de userId
ALTER TABLE `botState` DROP INDEX `userId`;

-- Adicionar coluna botId
ALTER TABLE `botState` ADD COLUMN `botId` INT NOT NULL DEFAULT 1 AFTER `userId`;

-- Criar constraint UNIQUE composto
ALTER TABLE `botState` ADD UNIQUE INDEX `userId_botId_unique` (`userId`, `botId`);

-- ============================================
-- Verificação de integridade
-- ============================================

-- Verificar dados existentes (devem ter botId = 1)
SELECT 'config' as table_name, COUNT(*) as count, MIN(botId) as min_botId, MAX(botId) as max_botId FROM `config`
UNION ALL
SELECT 'positions', COUNT(*), MIN(botId), MAX(botId) FROM `positions`
UNION ALL
SELECT 'metrics', COUNT(*), MIN(botId), MAX(botId) FROM `metrics`
UNION ALL
SELECT 'eventLogs', COUNT(*), MIN(botId), MAX(botId) FROM `eventLogs`
UNION ALL
SELECT 'botState', COUNT(*), MIN(botId), MAX(botId) FROM `botState`;
