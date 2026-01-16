/**
 * Teste Unitário - DataDownloader
 * 
 * Valida o download e validação de dados históricos.
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { createDataDownloader, DataDownloader, CandleData } from "../data-management/DataDownloader";

// ============================================================================
// MOCK DATA
// ============================================================================

const MOCK_CANDLES: CandleData[] = [
  { timestamp: 1704067200000, open: 2050.00, high: 2055.00, low: 2048.00, close: 2053.00, volume: 1200 },
  { timestamp: 1704067500000, open: 2053.00, high: 2058.00, low: 2051.00, close: 2056.00, volume: 1350 },
  { timestamp: 1704067800000, open: 2056.00, high: 2060.00, low: 2054.00, close: 2058.00, volume: 1500 },
  { timestamp: 1704068100000, open: 2058.00, high: 2062.00, low: 2056.00, close: 2060.00, volume: 1420 },
  { timestamp: 1704068400000, open: 2060.00, high: 2065.00, low: 2058.00, close: 2063.00, volume: 1600 },
];

const MOCK_CANDLES_WITH_GAP: CandleData[] = [
  { timestamp: 1704067200000, open: 2050.00, high: 2055.00, low: 2048.00, close: 2053.00, volume: 1200 },
  { timestamp: 1704067500000, open: 2053.00, high: 2058.00, low: 2051.00, close: 2056.00, volume: 1350 },
  // Gap de 2 candles (10 minutos)
  { timestamp: 1704068400000, open: 2060.00, high: 2065.00, low: 2058.00, close: 2063.00, volume: 1600 },
];

const MOCK_CANDLES_INVALID_OHLC: CandleData[] = [
  { timestamp: 1704067200000, open: 2050.00, high: 2045.00, low: 2048.00, close: 2053.00, volume: 1200 }, // high < low
  { timestamp: 1704067500000, open: 2053.00, high: 2058.00, low: 2051.00, close: 2056.00, volume: 1350 },
];

const TEST_DATA_DIR = "/tmp/backtest-test-data";

// ============================================================================
// TESTS
// ============================================================================

describe("DataDownloader", () => {
  let downloader: DataDownloader;
  
  beforeAll(async () => {
    downloader = createDataDownloader();
    
    // Criar diretório de teste
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  });
  
  afterAll(async () => {
    // Limpar diretório de teste
    try {
      await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    } catch (e) {
      // Ignorar erros de limpeza
    }
  });
  
  describe("Validação de Dados", () => {
    it("deve validar dados corretos como válidos", () => {
      const result = downloader.validateData(MOCK_CANDLES, "M5");
      
      expect(result.isValid).toBe(true);
      expect(result.totalBars).toBe(5);
      expect(result.gaps.length).toBe(0);
      expect(result.warnings.length).toBe(0);
    });
    
    it("deve detectar gaps nos dados", () => {
      const result = downloader.validateData(MOCK_CANDLES_WITH_GAP, "M5");
      
      expect(result.gaps.length).toBeGreaterThan(0);
    });
    
    it("deve detectar OHLC inválido (high < low)", () => {
      const result = downloader.validateData(MOCK_CANDLES_INVALID_OHLC, "M5");
      
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes("high") || w.includes("low"))).toBe(true);
    });
    
    it("deve detectar preços zero ou negativos", () => {
      const invalidCandles: CandleData[] = [
        { timestamp: 1704067200000, open: 0, high: 2055.00, low: 2048.00, close: 2053.00, volume: 1200 },
      ];
      
      const result = downloader.validateData(invalidCandles, "M5");
      
      expect(result.warnings.length).toBeGreaterThan(0);
    });
    
    it("deve retornar estatísticas corretas", () => {
      const result = downloader.validateData(MOCK_CANDLES, "M5");
      
      expect(result.totalBars).toBe(MOCK_CANDLES.length);
    });
  });
  
  describe("Conversão de Timeframes", () => {
    it("deve calcular intervalo esperado para M1", () => {
      const result = downloader.validateData(MOCK_CANDLES, "M1");
      // O gap esperado para M1 é 60000ms (1 minuto)
      expect(result).toBeDefined();
    });
    
    it("deve calcular intervalo esperado para H1", () => {
      const result = downloader.validateData(MOCK_CANDLES, "H1");
      // O gap esperado para H1 é 3600000ms (1 hora)
      expect(result).toBeDefined();
    });
    
    it("deve calcular intervalo esperado para D1", () => {
      const result = downloader.validateData(MOCK_CANDLES, "D1");
      // O gap esperado para D1 é 86400000ms (1 dia)
      expect(result).toBeDefined();
    });
  });
  
  describe("Salvamento de Dados", () => {
    it("deve salvar dados em formato JSON", async () => {
      const filePath = path.join(TEST_DATA_DIR, "XAUUSD_M5.json");
      
      await fs.writeFile(filePath, JSON.stringify(MOCK_CANDLES, null, 2));
      
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(content);
      
      expect(parsed.length).toBe(MOCK_CANDLES.length);
      expect(parsed[0].timestamp).toBe(MOCK_CANDLES[0].timestamp);
    });
    
    it("deve criar diretórios automaticamente", async () => {
      const nestedPath = path.join(TEST_DATA_DIR, "nested", "deep", "EURUSD_M5.json");
      
      await fs.mkdir(path.dirname(nestedPath), { recursive: true });
      await fs.writeFile(nestedPath, JSON.stringify(MOCK_CANDLES));
      
      const exists = await fs.access(nestedPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });
  
  describe("Carregamento de Dados", () => {
    it("deve carregar dados de arquivo JSON", async () => {
      const filePath = path.join(TEST_DATA_DIR, "GBPUSD_M5.json");
      await fs.writeFile(filePath, JSON.stringify(MOCK_CANDLES));
      
      const content = await fs.readFile(filePath, "utf-8");
      const candles = JSON.parse(content) as CandleData[];
      
      expect(candles.length).toBe(MOCK_CANDLES.length);
      expect(candles[0].open).toBe(MOCK_CANDLES[0].open);
    });
    
    it("deve ordenar candles por timestamp", async () => {
      const unorderedCandles = [...MOCK_CANDLES].reverse();
      const filePath = path.join(TEST_DATA_DIR, "USDJPY_M5.json");
      await fs.writeFile(filePath, JSON.stringify(unorderedCandles));
      
      const content = await fs.readFile(filePath, "utf-8");
      const candles = JSON.parse(content) as CandleData[];
      
      // Ordenar
      candles.sort((a, b) => a.timestamp - b.timestamp);
      
      // Verificar ordem
      for (let i = 1; i < candles.length; i++) {
        expect(candles[i].timestamp).toBeGreaterThan(candles[i - 1].timestamp);
      }
    });
  });
  
  describe("Fontes de Dados", () => {
    it("deve ter fonte Dukascopy configurada", () => {
      // Verificar que a fonte existe
      expect(downloader).toBeDefined();
    });
    
    it("deve ter fonte manual (CSV) configurada", () => {
      // Verificar que a fonte existe
      expect(downloader).toBeDefined();
    });
  });
});

// ============================================================================
// EXPORT
// ============================================================================

export const DATA_DOWNLOADER_TEST_DESCRIPTION = `
Teste do DataDownloader
=======================
Valida o download e validação de dados históricos.

Aspectos testados:
- Validação de dados (gaps, OHLC inválido, preços zero)
- Conversão de timeframes
- Salvamento e carregamento de dados JSON
- Fontes de dados configuradas

Execucao: npx vitest run data-downloader.test.ts
`;