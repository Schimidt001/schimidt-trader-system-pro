-- Migration: Adicionar tipo de contrato e barreiras à tabela config
-- Data: 05/11/2025
-- Descrição: Adiciona suporte para contratos TOUCH e NO_TOUCH com barreiras configuráveis

-- Adicionar campos de tipo de contrato e barreiras na tabela config
-- Verificar se as colunas já existem antes de adicionar
ALTER TABLE config 
  ADD COLUMN contractType ENUM('RISE_FALL', 'TOUCH', 'NO_TOUCH') NOT NULL DEFAULT 'RISE_FALL' COMMENT 'Tipo de contrato a ser operado';

ALTER TABLE config 
  ADD COLUMN barrierHigh VARCHAR(20) DEFAULT '0.30' COMMENT 'Barreira superior em % (ex: 0.30 = 30%)';

ALTER TABLE config 
  ADD COLUMN barrierLow VARCHAR(20) DEFAULT '-0.30' COMMENT 'Barreira inferior em % (ex: -0.30 = -30%)';
