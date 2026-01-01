-- Migração: Adicionar tabela de logs do sistema IC Markets
-- Data: 2026-01-01
-- Descrição: Tabela para armazenar logs em tempo real do sistema de trading

CREATE TABLE IF NOT EXISTS `systemLogs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `botId` int NOT NULL DEFAULT 1,
  `level` varchar(20) NOT NULL DEFAULT 'INFO',
  `category` varchar(30) NOT NULL DEFAULT 'SYSTEM',
  `source` varchar(50) NOT NULL DEFAULT 'SYSTEM',
  `message` text NOT NULL,
  `data` text,
  `symbol` varchar(20),
  `signal` varchar(10),
  `latencyMs` decimal(10,2),
  `timestampMs` bigint NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_systemLogs_userId` (`userId`),
  KEY `idx_systemLogs_botId` (`botId`),
  KEY `idx_systemLogs_level` (`level`),
  KEY `idx_systemLogs_category` (`category`),
  KEY `idx_systemLogs_timestampMs` (`timestampMs`),
  KEY `idx_systemLogs_userId_botId_timestampMs` (`userId`, `botId`, `timestampMs` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
