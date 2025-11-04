-- Migration: Adicionar apenas IA Hedge (sem filtro de tempo)
-- Data: 04/11/2025
-- Descrição: Adiciona campos para configuração da IA Hedge na tabela config

-- Adicionar campos da IA Hedge na tabela config
ALTER TABLE config 
  ADD COLUMN IF NOT EXISTS hedgeEnabled BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Toggle para ativar/desativar IA Hedge',
  ADD COLUMN IF NOT EXISTS hedgeConfig TEXT NULL COMMENT 'Configurações de hedge armazenadas como JSON';
