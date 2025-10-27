CREATE TABLE `botState` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`state` enum('IDLE','COLLECTING','WAITING_MIDPOINT','PREDICTING','ARMED','ENTERED','MANAGING','CLOSED','LOCK_RISK','ERROR_API','DISCONNECTED') NOT NULL DEFAULT 'IDLE',
	`isRunning` boolean NOT NULL DEFAULT false,
	`currentCandleTimestamp` bigint,
	`currentPositionId` int,
	`lastError` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `botState_id` PRIMARY KEY(`id`),
	CONSTRAINT `botState_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `candles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`symbol` varchar(50) NOT NULL,
	`timeframe` varchar(10) NOT NULL DEFAULT 'M15',
	`timestampUtc` bigint NOT NULL,
	`open` varchar(20) NOT NULL,
	`high` varchar(20) NOT NULL,
	`low` varchar(20) NOT NULL,
	`close` varchar(20) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `candles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`mode` enum('DEMO','REAL') NOT NULL DEFAULT 'DEMO',
	`tokenDemo` text,
	`tokenReal` text,
	`symbol` varchar(50) NOT NULL DEFAULT 'R_100',
	`stake` int NOT NULL DEFAULT 10,
	`stopDaily` int NOT NULL DEFAULT 10000,
	`takeDaily` int NOT NULL DEFAULT 50000,
	`lookback` int NOT NULL DEFAULT 100,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `eventLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`eventType` varchar(50) NOT NULL,
	`message` text NOT NULL,
	`data` text,
	`timestampUtc` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `eventLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`period` enum('daily','monthly') NOT NULL,
	`totalTrades` int NOT NULL DEFAULT 0,
	`wins` int NOT NULL DEFAULT 0,
	`losses` int NOT NULL DEFAULT 0,
	`pnl` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `positions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`contractId` varchar(100),
	`symbol` varchar(50) NOT NULL,
	`direction` enum('up','down') NOT NULL,
	`stake` int NOT NULL,
	`entryPrice` varchar(20) NOT NULL,
	`exitPrice` varchar(20),
	`predictedClose` varchar(20) NOT NULL,
	`trigger` varchar(20) NOT NULL,
	`phase` varchar(50),
	`strategy` varchar(50),
	`confidence` varchar(20),
	`pnl` int,
	`status` enum('ARMED','ENTERED','CLOSED','CANCELLED') NOT NULL,
	`candleTimestamp` bigint NOT NULL,
	`entryTime` timestamp,
	`exitTime` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `positions_id` PRIMARY KEY(`id`),
	CONSTRAINT `positions_contractId_unique` UNIQUE(`contractId`)
);
