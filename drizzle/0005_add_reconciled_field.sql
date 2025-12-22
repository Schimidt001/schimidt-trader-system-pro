-- Migration: Adicionar campos de controle de reconciliação (idempotência)
-- Correção do bug de duplicação de PnL na reconciliação

ALTER TABLE `positions` ADD COLUMN `reconciled` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `positions` ADD COLUMN `reconciledAt` TIMESTAMP NULL;

-- Marcar todas as posições CLOSED existentes como já reconciliadas
-- para evitar reprocessamento de posições antigas
UPDATE `positions` SET `reconciled` = true, `reconciledAt` = NOW() WHERE `status` = 'CLOSED';
