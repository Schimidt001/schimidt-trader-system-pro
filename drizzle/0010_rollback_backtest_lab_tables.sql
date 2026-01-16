-- ============================================================================
-- ROLLBACK: Backtest Lab Institucional Plus
-- Versão: 1.0.0
-- Data: 2026-01-16
-- Descrição: Remove todas as tabelas do laboratório de backtest institucional
-- 
-- ATENÇÃO: Este script é destrutivo e irá remover TODOS os dados das tabelas
-- do laboratório de backtest. Use com cautela em ambientes de produção.
-- 
-- INSTRUÇÕES DE USO:
-- 1. Faça backup do banco de dados antes de executar
-- 2. Execute em ambiente de staging primeiro para validar
-- 3. Verifique se não há processos de backtest em execução
-- 4. Execute o script: mysql -u <user> -p <database> < 0010_rollback_backtest_lab_tables.sql
-- ============================================================================

-- Desabilitar verificação de chaves estrangeiras temporariamente
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- Remover tabela: walk_forward_validations
-- Depende de: optimization_results
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `walk_forward_validations`;

-- ----------------------------------------------------------------------------
-- Remover tabela: optimization_results
-- Depende de: backtest_runs
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `optimization_results`;

-- ----------------------------------------------------------------------------
-- Remover tabela: backtest_runs
-- Tabela principal de execuções
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `backtest_runs`;

-- ----------------------------------------------------------------------------
-- Remover tabela: market_regimes
-- Tabela independente de regimes de mercado
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `market_regimes`;

-- Reabilitar verificação de chaves estrangeiras
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- VERIFICAÇÃO PÓS-ROLLBACK
-- Execute as queries abaixo para confirmar que as tabelas foram removidas:
-- 
-- SHOW TABLES LIKE 'backtest_%';
-- SHOW TABLES LIKE 'walk_forward_%';
-- SHOW TABLES LIKE 'optimization_%';
-- SHOW TABLES LIKE 'market_regimes';
-- 
-- Todas as queries acima devem retornar resultados vazios.
-- ============================================================================

-- ============================================================================
-- FIM DO ROLLBACK
-- ============================================================================
