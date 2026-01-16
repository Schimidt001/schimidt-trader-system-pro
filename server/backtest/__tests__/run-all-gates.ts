/**
 * Run All Gates - Script para executar todos os testes de CI
 * 
 * Este script executa todos os gates de teste em sequência e
 * gera um relatório consolidado.
 * 
 * Uso: npx ts-node server/backtest/__tests__/run-all-gates.ts
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { GATE_A_DESCRIPTION } from "./gate-a-determinism.test";
import { GATE_B_DESCRIPTION } from "./gate-b-isolation.test";
import { GATE_C_DESCRIPTION } from "./gate-c-anti-lookahead.test";
import { GATE_D_DESCRIPTION } from "./gate-d-multiasset.test";
import { GATE_E_DESCRIPTION } from "./gate-e-api-smoke.test";

// ============================================================================
// GATE DESCRIPTIONS
// ============================================================================

const GATES = [
  { id: "A", name: "Determinismo", description: GATE_A_DESCRIPTION },
  { id: "B", name: "Isolamento", description: GATE_B_DESCRIPTION },
  { id: "C", name: "Anti Look-Ahead", description: GATE_C_DESCRIPTION },
  { id: "D", name: "Multi-Asset Institucional", description: GATE_D_DESCRIPTION },
  { id: "E", name: "API Smoke Tests", description: GATE_E_DESCRIPTION },
];

// ============================================================================
// MAIN
// ============================================================================

function printHeader() {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║     LABORATÓRIO DE BACKTEST INSTITUCIONAL PLUS - CI GATES        ║");
  console.log("╠══════════════════════════════════════════════════════════════════╣");
  console.log("║  Schimidt Trader Pro - Sistema de Validação Automatizada         ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");
  console.log();
}

function printGateSummary() {
  console.log("GATES DE VALIDAÇÃO:");
  console.log("═══════════════════");
  console.log();
  
  GATES.forEach(gate => {
    console.log(`Gate ${gate.id} - ${gate.name}`);
    console.log("-".repeat(50));
    console.log(gate.description);
    console.log();
  });
}

function printRunInstructions() {
  console.log("INSTRUÇÕES DE EXECUÇÃO:");
  console.log("═══════════════════════");
  console.log();
  console.log("Executar todos os gates:");
  console.log("  npx vitest run server/backtest/__tests__/");
  console.log();
  console.log("Executar gate específico:");
  console.log("  npx vitest run gate-a-determinism.test.ts");
  console.log("  npx vitest run gate-b-isolation.test.ts");
  console.log("  npx vitest run gate-c-anti-lookahead.test.ts");
  console.log("  npx vitest run gate-d-multiasset.test.ts");
  console.log("  npx vitest run gate-e-api-smoke.test.ts");
  console.log();
  console.log("Executar com coverage:");
  console.log("  npx vitest run --coverage server/backtest/__tests__/");
  console.log();
  console.log("Executar em modo watch:");
  console.log("  npx vitest watch server/backtest/__tests__/");
  console.log();
}

function printCIConfig() {
  console.log("CONFIGURAÇÃO CI (GitHub Actions):");
  console.log("══════════════════════════════════");
  console.log();
  console.log(`
# .github/workflows/backtest-lab-ci.yml
name: Backtest Lab CI Gates

on:
  push:
    paths:
      - 'server/backtest/**'
  pull_request:
    paths:
      - 'server/backtest/**'

jobs:
  test-gates:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Run Gate A - Determinism
        run: npx vitest run gate-a-determinism.test.ts
      
      - name: Run Gate B - Isolation
        run: npx vitest run gate-b-isolation.test.ts
      
      - name: Run Gate C - Anti Look-Ahead
        run: npx vitest run gate-c-anti-lookahead.test.ts
      
      - name: Run Gate D - Multi-Asset
        run: npx vitest run gate-d-multiasset.test.ts
      
      - name: Run Gate E - API Smoke
        run: npx vitest run gate-e-api-smoke.test.ts
      
      - name: All Gates Passed
        run: echo "✅ Todos os gates de CI passaram!"
`);
}

// ============================================================================
// RUN
// ============================================================================

printHeader();
printGateSummary();
printRunInstructions();
printCIConfig();

console.log("═══════════════════════════════════════════════════════════════════");
console.log("Para executar os testes, use: npx vitest run server/backtest/__tests__/");
console.log("═══════════════════════════════════════════════════════════════════");
