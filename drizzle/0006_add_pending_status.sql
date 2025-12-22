-- Migration: Adicionar status PENDING e ORPHAN_EXECUTION ao enum de positions
-- Descrição: Permite criar posições em estado PENDING antes de enviar ordem para DERIV
--            e marcar execuções órfãs (executadas na DERIV mas sem registro no banco)

-- Alterar o enum de status para incluir novos valores
ALTER TABLE positions MODIFY COLUMN status ENUM('PENDING', 'ARMED', 'ENTERED', 'CLOSED', 'CANCELLED', 'ORPHAN_EXECUTION') NOT NULL;

-- Comentário: 
-- PENDING: Posição criada no banco, aguardando confirmação de execução na DERIV
-- ORPHAN_EXECUTION: Posição executada na DERIV mas que falhou ao ser registrada inicialmente
