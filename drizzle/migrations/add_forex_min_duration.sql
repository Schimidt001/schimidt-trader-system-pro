-- Adicionar campo forexMinDurationMinutes à tabela config
ALTER TABLE config ADD COLUMN forexMinDurationMinutes INT NOT NULL DEFAULT 15 COMMENT 'Duração mínima para Forex em minutos';
