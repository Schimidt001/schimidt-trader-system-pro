-- Adicionar campos faltantes na tabela config
ALTER TABLE `config` 
ADD COLUMN `triggerOffset` int DEFAULT 16,
ADD COLUMN `profitThreshold` int DEFAULT 90,
ADD COLUMN `waitTime` int DEFAULT 8;

-- Atualizar o valor padrão do lookback para 500
ALTER TABLE `config` 
MODIFY COLUMN `lookback` int NOT NULL DEFAULT 500;
