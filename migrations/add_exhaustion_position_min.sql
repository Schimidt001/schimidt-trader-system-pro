-- Migração: Adicionar exhaustionPositionMin e atualizar lookback padrão
-- Data: 2024-12-21
-- Descrição: ADENDO TÉCNICO - Position Ratio como métrica complementar obrigatória

-- MySQL não suporta IF NOT EXISTS para ADD COLUMN
-- Usar procedimento para verificar se coluna existe antes de adicionar

-- exhaustionPositionMin (decimal, default 0.8500 = 85%)
SET @dbname = DATABASE();
SET @tablename = 'config';
SET @columnname = 'exhaustionPositionMin';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(10,4) NOT NULL DEFAULT 0.8500')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Atualizar valor padrão do exhaustionRangeLookback de 20 para 10 (ADENDO TÉCNICO)
-- Nota: Isso altera apenas o DEFAULT, não os valores existentes
ALTER TABLE config MODIFY COLUMN exhaustionRangeLookback INT NOT NULL DEFAULT 10;
