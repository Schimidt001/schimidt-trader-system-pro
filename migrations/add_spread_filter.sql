-- Migração: Adicionar campos de Filtro de Spread na tabela smcStrategyConfig
-- Data: 2026-01-07
-- Descrição: Adiciona campos spreadFilterEnabled e maxSpreadPips para proteção contra spreads altos em scalping

-- Verificar se a coluna spreadFilterEnabled já existe antes de adicionar
SET @dbname = DATABASE();
SET @tablename = 'smcStrategyConfig';
SET @columnname = 'spreadFilterEnabled';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE smcStrategyConfig ADD COLUMN spreadFilterEnabled BOOLEAN NOT NULL DEFAULT TRUE'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Verificar se a coluna maxSpreadPips já existe antes de adicionar
SET @columnname = 'maxSpreadPips';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE smcStrategyConfig ADD COLUMN maxSpreadPips DECIMAL(5,1) NOT NULL DEFAULT 2.0'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Atualizar registros existentes com valores padrão (se necessário)
UPDATE smcStrategyConfig 
SET spreadFilterEnabled = TRUE, maxSpreadPips = 2.0 
WHERE spreadFilterEnabled IS NULL OR maxSpreadPips IS NULL;
