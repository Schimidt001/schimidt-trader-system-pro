CREATE TABLE `marketConditions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`botId` int NOT NULL DEFAULT 1,
	`candleTimestamp` bigint NOT NULL,
	`symbol` varchar(50) NOT NULL,
	`status` enum('GREEN','YELLOW','RED') NOT NULL,
	`score` int NOT NULL,
	`reasons` text NOT NULL,
	`details` text,
	`computedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `marketConditions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `marketDetectorConfig` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`atrWindow` int NOT NULL DEFAULT 14,
	`atrMultiplier` decimal(4,2) NOT NULL DEFAULT '2.50',
	`atrScore` int NOT NULL DEFAULT 2,
	`wickMultiplier` decimal(4,2) NOT NULL DEFAULT '2.00',
	`wickScore` int NOT NULL DEFAULT 1,
	`fractalThreshold` decimal(4,2) NOT NULL DEFAULT '1.80',
	`fractalScore` int NOT NULL DEFAULT 1,
	`spreadMultiplier` decimal(4,2) NOT NULL DEFAULT '2.00',
	`spreadScore` int NOT NULL DEFAULT 1,
	`weightHigh` int NOT NULL DEFAULT 3,
	`weightMedium` int NOT NULL DEFAULT 1,
	`weightHighPast` int NOT NULL DEFAULT 2,
	`windowNextNews` int NOT NULL DEFAULT 60,
	`windowPastNews` int NOT NULL DEFAULT 30,
	`greenThreshold` int NOT NULL DEFAULT 3,
	`yellowThreshold` int NOT NULL DEFAULT 6,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `marketDetectorConfig_id` PRIMARY KEY(`id`),
	CONSTRAINT `marketDetectorConfig_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `marketEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`timestamp` bigint NOT NULL,
	`currency` varchar(10) NOT NULL,
	`impact` enum('HIGH','MEDIUM','LOW') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`source` varchar(50) NOT NULL,
	`actual` varchar(50),
	`forecast` varchar(50),
	`previous` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `marketEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `botState` DROP INDEX `botState_userId_unique`;--> statement-breakpoint
ALTER TABLE `botState` MODIFY COLUMN `state` enum('IDLE','COLLECTING','WAITING_MIDPOINT','WAITING_NEXT_HOUR','PREDICTING','ARMED','ENTERED','MANAGING','CLOSED','LOCK_RISK','ERROR_API','DISCONNECTED') NOT NULL DEFAULT 'IDLE';--> statement-breakpoint
ALTER TABLE `config` MODIFY COLUMN `lookback` int NOT NULL DEFAULT 500;--> statement-breakpoint
ALTER TABLE `botState` ADD `botId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `candles` ADD `botId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `botId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `triggerOffset` int DEFAULT 16;--> statement-breakpoint
ALTER TABLE `config` ADD `profitThreshold` int DEFAULT 90;--> statement-breakpoint
ALTER TABLE `config` ADD `waitTime` int DEFAULT 8;--> statement-breakpoint
ALTER TABLE `config` ADD `timeframe` int DEFAULT 900 NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `repredictionEnabled` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `repredictionDelay` int DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `contractType` enum('RISE_FALL','TOUCH','NO_TOUCH') DEFAULT 'RISE_FALL' NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `barrierHigh` varchar(20) DEFAULT '3.00';--> statement-breakpoint
ALTER TABLE `config` ADD `barrierLow` varchar(20) DEFAULT '-3.00';--> statement-breakpoint
ALTER TABLE `config` ADD `forexMinDurationMinutes` int DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `allowEquals` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `useCandleDuration` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `hourlyFilterEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `hourlyFilterMode` enum('IDEAL','COMPATIBLE','GOLDEN','COMBINED','CUSTOM') DEFAULT 'COMBINED' NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `hourlyFilterCustomHours` text;--> statement-breakpoint
ALTER TABLE `config` ADD `hourlyFilterGoldHours` text;--> statement-breakpoint
ALTER TABLE `config` ADD `hourlyFilterGoldMultiplier` int DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `hedgeEnabled` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `hedgeConfig` text;--> statement-breakpoint
ALTER TABLE `config` ADD `derivAppId` varchar(20) DEFAULT '1089';--> statement-breakpoint
ALTER TABLE `config` ADD `marketConditionEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `minPayoutPercent` int DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `payoutRecheckDelay` int DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `payoutCheckEnabled` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `antiDojiEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `antiDojiRangeMin` decimal(10,4) DEFAULT '0.0500' NOT NULL;--> statement-breakpoint
ALTER TABLE `config` ADD `antiDojiRatioMin` decimal(10,4) DEFAULT '0.1800' NOT NULL;--> statement-breakpoint
ALTER TABLE `eventLogs` ADD `botId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `metrics` ADD `botId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `positions` ADD `botId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `positions` ADD `isHedge` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `positions` ADD `parentPositionId` int;--> statement-breakpoint
ALTER TABLE `positions` ADD `hedgeAction` varchar(50);--> statement-breakpoint
ALTER TABLE `positions` ADD `hedgeReason` text;--> statement-breakpoint
ALTER TABLE `botState` ADD CONSTRAINT `userId_botId_unique` UNIQUE(`userId`,`botId`);--> statement-breakpoint
CREATE INDEX `timestamp_idx` ON `marketEvents` (`timestamp`);--> statement-breakpoint
CREATE INDEX `currency_idx` ON `marketEvents` (`currency`);--> statement-breakpoint
CREATE INDEX `impact_idx` ON `marketEvents` (`impact`);