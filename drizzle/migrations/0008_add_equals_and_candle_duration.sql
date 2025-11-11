-- Migration: Adicionar campos allowEquals e useCandleDuration
-- Data: 2025-11-11
-- Descrição: Adiciona opção de permitir empate como vitória e duração dinâmica do candle

-- 1. Adicionar coluna allowEquals (permitir empate como vitória)
ALTER TABLE `config` ADD COLUMN `allowEquals` BOOLEAN NOT NULL DEFAULT FALSE AFTER `forexMinDurationMinutes`;

-- 2. Adicionar coluna useCandleDuration (usar duração dinâmica do candle)
ALTER TABLE `config` ADD COLUMN `useCandleDuration` BOOLEAN NOT NULL DEFAULT FALSE AFTER `allowEquals`;

-- 3. Adicionar comentários nas colunas para documentação
ALTER TABLE `config` MODIFY COLUMN `allowEquals` BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Permitir empate como vitória (preço de fechamento igual ao de entrada)';
ALTER TABLE `config` MODIFY COLUMN `useCandleDuration` BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Usar duração dinâmica até o final do candle atual';
