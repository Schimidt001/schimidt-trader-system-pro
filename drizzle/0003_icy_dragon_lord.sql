CREATE TABLE `forexPositions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`botId` int NOT NULL DEFAULT 1,
	`positionId` varchar(100),
	`openOrderId` varchar(100),
	`closeOrderId` varchar(100),
	`symbol` varchar(20) NOT NULL,
	`direction` varchar(10) NOT NULL,
	`lots` decimal(10,2) NOT NULL,
	`entryPrice` decimal(15,5) NOT NULL,
	`exitPrice` decimal(15,5),
	`initialStopLoss` decimal(15,5),
	`currentStopLoss` decimal(15,5),
	`takeProfit` decimal(15,5),
	`pnlUsd` decimal(10,2),
	`pnlPips` decimal(10,1),
	`swap` decimal(10,2) DEFAULT '0.00',
	`commission` decimal(10,2) DEFAULT '0.00',
	`status` varchar(20) NOT NULL DEFAULT 'OPEN',
	`closeReason` varchar(50),
	`strategy` varchar(50),
	`entrySignal` varchar(50),
	`signalConfidence` int,
	`openTime` timestamp,
	`closeTime` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `forexPositions_id` PRIMARY KEY(`id`),
	CONSTRAINT `forexPositions_positionId_unique` UNIQUE(`positionId`)
);
--> statement-breakpoint
CREATE TABLE `icmarketsConfig` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`botId` int NOT NULL DEFAULT 1,
	`clientId` varchar(100),
	`clientSecret` text,
	`accessToken` text,
	`refreshToken` text,
	`tokenExpiresAt` timestamp,
	`accountId` varchar(50),
	`isDemo` boolean NOT NULL DEFAULT true,
	`leverage` int NOT NULL DEFAULT 500,
	`symbol` varchar(20) NOT NULL DEFAULT 'EURUSD',
	`timeframe` varchar(10) NOT NULL DEFAULT 'M15',
	`lots` decimal(10,2) NOT NULL DEFAULT '0.01',
	`stopLossPips` int NOT NULL DEFAULT 15,
	`takeProfitPips` int NOT NULL DEFAULT 0,
	`stopDailyUsd` decimal(10,2) NOT NULL DEFAULT '100.00',
	`takeDailyUsd` decimal(10,2) NOT NULL DEFAULT '500.00',
	`trailingEnabled` boolean NOT NULL DEFAULT true,
	`trailingTriggerPips` int NOT NULL DEFAULT 10,
	`trailingStepPips` int NOT NULL DEFAULT 5,
	`emaFastPeriod` int NOT NULL DEFAULT 9,
	`emaSlowPeriod` int NOT NULL DEFAULT 21,
	`rsiPeriod` int NOT NULL DEFAULT 14,
	`rsiOverbought` int NOT NULL DEFAULT 70,
	`rsiOversold` int NOT NULL DEFAULT 30,
	`trendSniperEnabled` boolean NOT NULL DEFAULT true,
	`entryDistancePips` int NOT NULL DEFAULT 5,
	`lookbackCandles` int NOT NULL DEFAULT 100,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `icmarketsConfig_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `positions` MODIFY COLUMN `status` enum('PENDING','ARMED','ENTERED','CLOSED','CANCELLED','ORPHAN_EXECUTION') NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `exhaustionGuardEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `exhaustionRatioMax` decimal(10,4) DEFAULT '0.7000' NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `exhaustionPositionMin` decimal(10,4) DEFAULT '0.8500' NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `exhaustionRangeLookback` int DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `exhaustionRangeMultiplier` decimal(10,4) DEFAULT '1.5000' NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `exhaustionGuardLogEnabled` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `ttlEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `ttlMinimumSeconds` int DEFAULT 180 NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `ttlTriggerDelayBuffer` int DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `ttlLogEnabled` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `eventLogs` ADD `brokerType` enum('DERIV','ICMARKETS') DEFAULT 'DERIV' NOT NULL;--> statement-breakpoint
ALTER TABLE `positions` ADD `reconciled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `positions` ADD `reconciledAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `password` varchar(255);