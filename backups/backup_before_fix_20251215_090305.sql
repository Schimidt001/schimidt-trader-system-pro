-- MySQL dump 10.13  Distrib 8.0.43, for Linux (x86_64)
--
-- Host: switchyard.proxy.rlwy.net    Database: railway
-- ------------------------------------------------------
-- Server version	9.4.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `positions`
--

DROP TABLE IF EXISTS `positions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `positions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `botId` int NOT NULL DEFAULT '1',
  `contractId` varchar(100) DEFAULT NULL,
  `symbol` varchar(50) NOT NULL,
  `direction` enum('up','down') NOT NULL,
  `stake` int NOT NULL,
  `entryPrice` varchar(20) NOT NULL,
  `exitPrice` varchar(20) DEFAULT NULL,
  `predictedClose` varchar(20) NOT NULL,
  `trigger` varchar(20) NOT NULL,
  `phase` varchar(50) DEFAULT NULL,
  `strategy` varchar(50) DEFAULT NULL,
  `confidence` varchar(20) DEFAULT NULL,
  `pnl` int DEFAULT NULL,
  `status` enum('ARMED','ENTERED','CLOSED','CANCELLED') NOT NULL,
  `candleTimestamp` bigint NOT NULL,
  `entryTime` timestamp NULL DEFAULT NULL,
  `exitTime` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `isHedge` tinyint(1) NOT NULL DEFAULT '0',
  `parentPositionId` int DEFAULT NULL,
  `hedgeAction` varchar(50) DEFAULT NULL,
  `hedgeReason` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `positions_contractId_unique` (`contractId`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `positions`
--

LOCK TABLES `positions` WRITE;
/*!40000 ALTER TABLE `positions` DISABLE KEYS */;
INSERT INTO `positions` VALUES (1,2,1,'301721572888','frxUSDJPY','down',2000,'155.358','155.422','155.3533','155.3533','Fibonacci da Amplitude','Fibonacci da Amplitude','0.8485',-2000,'CLOSED',1765767600,'2025-12-15 03:42:02','2025-12-15 04:00:03','2025-12-15 03:42:02','2025-12-15 04:00:03',0,NULL,NULL,NULL),(2,2,1,'301728101068','frxUSDJPY','up',2000,'155.026','155.111','155.0916','155.0916','Fibonacci da Amplitude','Fibonacci da Amplitude','0.8485',1449,'CLOSED',1765778400,'2025-12-15 06:35:04','2025-12-15 07:00:06','2025-12-15 06:35:04','2025-12-15 07:00:06',0,NULL,NULL,NULL),(3,2,1,'301731112088','frxUSDJPY','up',2000,'155.176','155.262','155.1767','155.1767','Fibonacci da Amplitude','Fibonacci da Amplitude','0.8485',1509,'CLOSED',1765782000,'2025-12-15 07:36:53','2025-12-15 13:35:10','2025-12-15 07:36:53','2025-12-15 13:35:10',0,NULL,NULL,NULL),(4,2,1,'301734144328','frxUSDJPY','down',2000,'155.168','155.181','155.1657','155.1657','Fibonacci da Amplitude','Fibonacci da Amplitude','0.8485',-1139,'CLOSED',1765785600,'2025-12-15 08:35:41','2025-12-15 09:00:10','2025-12-15 08:35:41','2025-12-15 09:00:10',0,NULL,NULL,NULL);
/*!40000 ALTER TABLE `positions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `metrics`
--

DROP TABLE IF EXISTS `metrics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `metrics` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `botId` int NOT NULL DEFAULT '1',
  `date` varchar(10) NOT NULL,
  `period` enum('daily','monthly') NOT NULL,
  `totalTrades` int NOT NULL DEFAULT '0',
  `wins` int NOT NULL DEFAULT '0',
  `losses` int NOT NULL DEFAULT '0',
  `pnl` int NOT NULL DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `metrics`
--

LOCK TABLES `metrics` WRITE;
/*!40000 ALTER TABLE `metrics` DISABLE KEYS */;
INSERT INTO `metrics` VALUES (1,2,1,'2025-12-15','daily',5,2,3,-2181,'2025-12-15 04:00:03','2025-12-15 13:35:10'),(2,2,1,'2025-12','monthly',8,3,5,-3871,'2025-12-15 04:00:03','2025-12-15 13:35:10');
/*!40000 ALTER TABLE `metrics` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-12-15  9:03:08
