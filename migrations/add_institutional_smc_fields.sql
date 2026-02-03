-- Migração: Adicionar campos institucionais na tabela smcStrategyConfig
-- Data: 2026-02-02
-- Descrição: Adiciona campos para suporte ao modelo institucional SMC PURO
--            Inclui: FVG, Sessões (ASIA), Timeouts FSM, Budget por sessão

-- ============= CAMPOS FVG (Fair Value Gap) =============

-- minGapPips: Tamanho mínimo do FVG em pips
SET @dbname = DATABASE();
SET @tablename = 'smcStrategyConfig';
SET @columnname = 'minGapPips';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE smcStrategyConfig ADD COLUMN minGapPips DECIMAL(5,1) NOT NULL DEFAULT 2.0'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- ============= CAMPOS SESSÃO ASIA =============

-- asiaSessionStartUtc: Início da sessão ASIA em minutos UTC (23:00 = 1380)
SET @columnname = 'asiaSessionStartUtc';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE smcStrategyConfig ADD COLUMN asiaSessionStartUtc INT NOT NULL DEFAULT 1380'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- asiaSessionEndUtc: Fim da sessão ASIA em minutos UTC (07:00 = 420)
SET @columnname = 'asiaSessionEndUtc';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE smcStrategyConfig ADD COLUMN asiaSessionEndUtc INT NOT NULL DEFAULT 420'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- londonSessionStartUtc: Início da sessão LONDON em minutos UTC (07:00 = 420)
SET @columnname = 'londonSessionStartUtc';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE smcStrategyConfig ADD COLUMN londonSessionStartUtc INT NOT NULL DEFAULT 420'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- londonSessionEndUtc: Fim da sessão LONDON em minutos UTC (12:00 = 720)
SET @columnname = 'londonSessionEndUtc';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE smcStrategyConfig ADD COLUMN londonSessionEndUtc INT NOT NULL DEFAULT 720'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- nySessionStartUtc: Início da sessão NY em minutos UTC (12:00 = 720)
SET @columnname = 'nySessionStartUtc';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE smcStrategyConfig ADD COLUMN nySessionStartUtc INT NOT NULL DEFAULT 720'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- nySessionEndUtc: Fim da sessão NY em minutos UTC (21:00 = 1260)
SET @columnname = 'nySessionEndUtc';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE smcStrategyConfig ADD COLUMN nySessionEndUtc INT NOT NULL DEFAULT 1260'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- ============= CAMPOS TIMEOUTS FSM =============

-- instWaitFvgMinutes: Timeout para aguardar formação do FVG após CHoCH
SET @columnname = 'instWaitFvgMinutes';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE smcStrategyConfig ADD COLUMN instWaitFvgMinutes INT NOT NULL DEFAULT 90'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- instWaitMitigationMinutes: Timeout para aguardar mitigação do FVG
SET @columnname = 'instWaitMitigationMinutes';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE smcStrategyConfig ADD COLUMN instWaitMitigationMinutes INT NOT NULL DEFAULT 60'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- instWaitEntryMinutes: Timeout para aguardar gatilho de entrada após mitigação
SET @columnname = 'instWaitEntryMinutes';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE smcStrategyConfig ADD COLUMN instWaitEntryMinutes INT NOT NULL DEFAULT 30'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- instCooldownMinutes: Tempo de cooldown após trade executado
SET @columnname = 'instCooldownMinutes';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE smcStrategyConfig ADD COLUMN instCooldownMinutes INT NOT NULL DEFAULT 20'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- ============= CAMPOS BUDGET POR SESSÃO =============

-- maxTradesPerSession: Máximo de trades por sessão por símbolo
SET @columnname = 'maxTradesPerSession';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE smcStrategyConfig ADD COLUMN maxTradesPerSession INT NOT NULL DEFAULT 2'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- ============= CAMPOS MODO INSTITUCIONAL =============

-- institutionalModeEnabled: Habilitar modo institucional (FSM, FVG, Context)
SET @columnname = 'institutionalModeEnabled';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE smcStrategyConfig ADD COLUMN institutionalModeEnabled BOOLEAN NOT NULL DEFAULT FALSE'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Log de conclusão
SELECT 'Migration add_institutional_smc_fields.sql completed successfully' AS status;
