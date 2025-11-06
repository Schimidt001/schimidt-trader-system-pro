-- Adicionar campos do Filtro de Horário à tabela config
ALTER TABLE config ADD COLUMN hourlyFilterEnabled BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Habilitar filtro de horário';
ALTER TABLE config ADD COLUMN hourlyFilterMode ENUM('IDEAL', 'COMPATIBLE', 'GOLDEN', 'COMBINED', 'CUSTOM') NOT NULL DEFAULT 'COMBINED' COMMENT 'Modo do filtro';
ALTER TABLE config ADD COLUMN hourlyFilterCustomHours TEXT COMMENT 'Horários personalizados (JSON array)';
ALTER TABLE config ADD COLUMN hourlyFilterGoldHours TEXT COMMENT 'Horários GOLD (JSON array, máx 2)';
ALTER TABLE config ADD COLUMN hourlyFilterGoldMultiplier INT NOT NULL DEFAULT 200 COMMENT 'Multiplicador de stake para horários GOLD (100 = 1x, 200 = 2x)';

-- Adicionar estado WAITING_NEXT_HOUR à tabela botState
ALTER TABLE botState MODIFY COLUMN state ENUM('IDLE', 'COLLECTING', 'WAITING_MIDPOINT', 'WAITING_NEXT_HOUR', 'PREDICTING', 'ARMED', 'ENTERED', 'MANAGING', 'CLOSED', 'LOCK_RISK', 'ERROR_API', 'DISCONNECTED') NOT NULL DEFAULT 'IDLE';
