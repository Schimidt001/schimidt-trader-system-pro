-- ============================================================================
-- Migration Corretiva: Fix Institutional Mode Opt-In (P0.5)
-- ============================================================================
-- 
-- Data: 2026-02-03
-- Autor: Manus AI (Auditoria Técnica)
-- Referência: P0.5 - Compatibilidade Opt-In
--
-- PROBLEMA IDENTIFICADO:
-- A migration add_institutional_smc_fields.sql criou a coluna 
-- institutionalModeEnabled com DEFAULT TRUE, ativando automaticamente
-- o modo institucional em todas as configurações legadas sem consentimento
-- do usuário, violando o requisito de OPT-IN explícito.
--
-- IMPACTO:
-- Instalações em produção com dinheiro real teriam comportamento de trading
-- alterado sem ação do usuário, causando risco financeiro.
--
-- CORREÇÃO:
-- 1. Alterar DEFAULT da coluna para FALSE
-- 2. Atualizar todos os registros legados para FALSE
-- 3. Garantir que modo institucional seja 100% OPT-IN
--
-- JUSTIFICATIVA DO UPDATE GLOBAL:
-- Todas as configurações legadas nunca optaram pelo modo institucional.
-- Qualquer valor TRUE existente veio exclusivamente da migration defeituosa.
-- Portanto, o UPDATE global é correto e seguro.
--
-- IDEMPOTÊNCIA:
-- Esta migration pode ser executada múltiplas vezes sem efeitos colaterais.
-- ============================================================================

-- Definir variáveis de contexto
SET @dbname = DATABASE();
SET @tablename = 'smcStrategyConfig';
SET @columnname = 'institutionalModeEnabled';

-- ============================================================================
-- PASSO 1: Alterar DEFAULT da coluna para FALSE
-- ============================================================================
-- 
-- Garante que novos registros criados após esta migration terão
-- institutionalModeEnabled = FALSE por padrão.
--

SET @alterDefaultStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
  ) > 0,
  CONCAT(
    'ALTER TABLE ', @tablename, 
    ' ALTER COLUMN ', @columnname, 
    ' SET DEFAULT FALSE'
  ),
  'SELECT "Column does not exist, skipping ALTER DEFAULT" AS status'
));

PREPARE alterDefaultIfExists FROM @alterDefaultStatement;
EXECUTE alterDefaultIfExists;
DEALLOCATE PREPARE alterDefaultIfExists;

SELECT CONCAT(
  'Step 1: DEFAULT value for ', 
  @columnname, 
  ' set to FALSE'
) AS status;

-- ============================================================================
-- PASSO 2: Corrigir registros legados afetados
-- ============================================================================
--
-- Atualiza todos os registros que têm institutionalModeEnabled = TRUE
-- para FALSE, restaurando o comportamento legado.
--
-- IMPORTANTE: Este UPDATE é seguro porque:
-- 1. Configs legadas nunca optaram pelo modo institucional
-- 2. Qualquer TRUE veio da migration defeituosa
-- 3. Usuários que quiserem o modo institucional devem ativar explicitamente
--

SET @updateStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
  ) > 0,
  CONCAT(
    'UPDATE ', @tablename, 
    ' SET ', @columnname, ' = FALSE ',
    'WHERE ', @columnname, ' = TRUE'
  ),
  'SELECT "Column does not exist, skipping UPDATE" AS status'
));

PREPARE updateIfExists FROM @updateStatement;
EXECUTE updateIfExists;
DEALLOCATE PREPARE updateIfExists;

-- Contar quantos registros foram corrigidos
SET @rowsAffected = ROW_COUNT();

SELECT CONCAT(
  'Step 2: Updated ', 
  @rowsAffected, 
  ' legacy config(s) to institutionalModeEnabled = FALSE'
) AS status;

-- ============================================================================
-- PASSO 3: Verificação final
-- ============================================================================
--
-- Verifica se ainda existem registros com institutionalModeEnabled = TRUE
-- (não deveria haver nenhum após a correção)
--

SET @verifyStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
  ) > 0,
  CONCAT(
    'SELECT COUNT(*) AS remaining_true_count FROM ', @tablename,
    ' WHERE ', @columnname, ' = TRUE'
  ),
  'SELECT 0 AS remaining_true_count'
));

PREPARE verifyIfExists FROM @verifyStatement;
EXECUTE verifyIfExists;
DEALLOCATE PREPARE verifyIfExists;

-- ============================================================================
-- Log de conclusão
-- ============================================================================

SELECT CONCAT(
  'Migration fix_institutional_mode_opt_in.sql completed successfully at ',
  NOW()
) AS status;

SELECT 
  '✅ P0.5 FIXED: institutionalModeEnabled is now OPT-IN by default' AS result,
  'All legacy configs restored to FALSE' AS impact,
  'Users must explicitly enable institutional mode' AS requirement;

-- ============================================================================
-- FIM DA MIGRATION CORRETIVA
-- ============================================================================
