-- ============================================================================
-- MIGRAÇÃO: Backtest Lab Institucional Plus
-- Versão: 1.0.0
-- Data: 2026-01-15
-- Descrição: Adiciona tabelas para o laboratório de backtest institucional
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabela: backtest_runs
-- Armazena informações sobre cada execução de backtest/otimização
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `backtest_runs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `bot_id` INT NOT NULL,
  
  -- Identificação
  `run_name` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `status` VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  
  -- Configuração
  `symbols` JSON NOT NULL,
  `start_date` TIMESTAMP NOT NULL,
  `end_date` TIMESTAMP NOT NULL,
  `strategy_type` VARCHAR(50) NOT NULL,
  `parameter_ranges` JSON NOT NULL,
  `validation_config` JSON NOT NULL,
  
  -- Resultados agregados
  `total_combinations_tested` INT DEFAULT 0,
  `total_trades_executed` INT DEFAULT 0,
  `execution_time_seconds` INT DEFAULT 0,
  
  -- Metadados
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `completed_at` TIMESTAMP NULL,
  `error_message` TEXT,
  
  PRIMARY KEY (`id`),
  INDEX `backtest_runs_user_id_idx` (`user_id`),
  INDEX `backtest_runs_status_idx` (`status`),
  INDEX `backtest_runs_created_at_idx` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabela: optimization_results
-- Armazena os resultados de cada combinação de parâmetros testada
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `optimization_results` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `backtest_run_id` INT NOT NULL,
  
  -- Identificação da combinação
  `symbol` VARCHAR(20) NOT NULL,
  `combination_hash` VARCHAR(64) NOT NULL,
  
  -- Parâmetros testados
  `parameters` JSON NOT NULL,
  
  -- Métricas
  `in_sample_metrics` JSON NOT NULL,
  `out_sample_metrics` JSON,
  
  -- Scores e classificação
  `robustness_score` DECIMAL(10, 4),
  `degradation_percent` DECIMAL(10, 2),
  `rank` INT,
  `is_recommended` BOOLEAN DEFAULT FALSE,
  
  -- Dados detalhados
  `trades_json` JSON,
  `equity_curve_json` JSON,
  `warnings` JSON,
  
  -- Metadados
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`id`),
  INDEX `opt_results_backtest_run_id_idx` (`backtest_run_id`),
  INDEX `opt_results_symbol_idx` (`symbol`),
  INDEX `opt_results_robustness_score_idx` (`robustness_score`),
  INDEX `opt_results_rank_idx` (`rank`),
  INDEX `opt_results_is_recommended_idx` (`is_recommended`),
  UNIQUE KEY `opt_results_unique_combination` (`backtest_run_id`, `symbol`, `combination_hash`),
  
  CONSTRAINT `fk_opt_results_backtest_run` 
    FOREIGN KEY (`backtest_run_id`) 
    REFERENCES `backtest_runs` (`id`) 
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabela: walk_forward_validations
-- Armazena os resultados de cada janela de validação Walk-Forward
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `walk_forward_validations` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `optimization_result_id` INT NOT NULL,
  
  -- Configuração da janela
  `window_number` INT NOT NULL,
  `train_start_date` TIMESTAMP NOT NULL,
  `train_end_date` TIMESTAMP NOT NULL,
  `test_start_date` TIMESTAMP NOT NULL,
  `test_end_date` TIMESTAMP NOT NULL,
  
  -- Parâmetros e resultados
  `parameters` JSON NOT NULL,
  `train_metrics` JSON NOT NULL,
  `test_metrics` JSON NOT NULL,
  
  -- Análise
  `degradation` JSON NOT NULL,
  `stability_score` DECIMAL(10, 4),
  
  -- Metadados
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`id`),
  INDEX `wf_val_optimization_result_id_idx` (`optimization_result_id`),
  INDEX `wf_val_window_number_idx` (`window_number`),
  INDEX `wf_val_stability_score_idx` (`stability_score`),
  
  CONSTRAINT `fk_wf_val_optimization_result` 
    FOREIGN KEY (`optimization_result_id`) 
    REFERENCES `optimization_results` (`id`) 
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabela: market_regimes
-- Armazena os regimes de mercado detectados para cada símbolo
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `market_regimes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `symbol` VARCHAR(20) NOT NULL,
  
  -- Período
  `start_date` TIMESTAMP NOT NULL,
  `end_date` TIMESTAMP NOT NULL,
  
  -- Classificação
  `regime` VARCHAR(50) NOT NULL,
  `confidence` DECIMAL(5, 2) NOT NULL,
  
  -- Métricas do regime
  `trend_strength` DECIMAL(10, 4),
  `volatility_level` DECIMAL(10, 4),
  `average_range` DECIMAL(10, 2),
  `duration_days` INT,
  
  -- Metadados
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`id`),
  INDEX `market_regimes_symbol_idx` (`symbol`),
  INDEX `market_regimes_regime_idx` (`regime`),
  INDEX `market_regimes_start_date_idx` (`start_date`),
  INDEX `market_regimes_end_date_idx` (`end_date`),
  INDEX `market_regimes_symbol_date_idx` (`symbol`, `start_date`, `end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- FIM DA MIGRAÇÃO
-- ============================================================================
