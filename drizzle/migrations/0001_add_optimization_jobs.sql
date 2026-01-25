-- Migration: Add Optimization Jobs Table
-- CORREÇÃO CRÍTICA #1: Persistência Real de Estado
-- 
-- Esta migração cria a tabela optimization_jobs para persistir o estado
-- dos jobs de otimização, garantindo que sobrevivam a reinicializações.
--
-- Executar com: mysql -u root -p railway < drizzle/migrations/0001_add_optimization_jobs.sql

-- Criar tabela de jobs de otimização
CREATE TABLE IF NOT EXISTS `optimization_jobs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `run_id` VARCHAR(64) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
  `progress_percent` DECIMAL(5,2) DEFAULT 0,
  `current_combination` INT DEFAULT 0,
  `total_combinations` INT NOT NULL,
  `current_phase` VARCHAR(50) DEFAULT 'QUEUED',
  `status_message` TEXT,
  `estimated_time_remaining` INT,
  `elapsed_time` INT DEFAULT 0,
  `config` JSON NOT NULL,
  `result` JSON,
  `error_message` TEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `started_at` TIMESTAMP NULL,
  `completed_at` TIMESTAMP NULL,
  `last_progress_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `run_id_unique` (`run_id`),
  INDEX `opt_jobs_run_id_idx` (`run_id`),
  INDEX `opt_jobs_status_idx` (`status`),
  INDEX `opt_jobs_created_at_idx` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comentário: Status possíveis
-- QUEUED: Job enfileirado, aguardando execução
-- RUNNING: Job em execução
-- COMPLETED: Job concluído com sucesso
-- FAILED: Job falhou com erro
-- ABORTED: Job abortado pelo usuário
