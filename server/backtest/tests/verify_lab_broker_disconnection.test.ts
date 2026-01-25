
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const LAB_ROOT = path.join(process.cwd(), 'server/backtest');

// Runners that should NEVER connect to the broker
const LAB_RUNNERS = [
  'server/backtest/runners/LabBacktestRunner.ts',
  'server/backtest/runners/LabBacktestRunnerOptimized.ts',
  'server/backtest/runners/IsolatedBacktestRunner.ts',
  'server/backtest/runners/BacktestRunnerOptimized.ts',
];

function checkFileContent() {
  console.log('🔍 Starting Broker Disconnection Verification...');

  let failed = false;

  LAB_RUNNERS.forEach(fileRelPath => {
    const filePath = path.join(process.cwd(), fileRelPath);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Warning: File not found ${fileRelPath}`);
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    // Check for "connect" calls on adapter
    // We want to ensure no "adapter.connect()" or similar is present
    // AND that it doesn't import the live CTraderAdapter

    // 1. Check for live adapter import (redundant with verify_lab_isolation but good double check)
    if (content.includes('../adapters/CTraderAdapter')) {
      console.error(`❌ [FAIL] ${fileRelPath} imports CTraderAdapter directly!`);
      failed = true;
    }

    // 2. Check for suspicious connect calls
    // In Lab runners, we use BacktestAdapter which has no connect() method usually,
    // or if it has, it's a mock.
    // But we definitely shouldn't see `ctraderAdapter.connect`
    if (content.includes('ctraderAdapter.connect')) {
      console.error(`❌ [FAIL] ${fileRelPath} calls ctraderAdapter.connect()!`);
      failed = true;
    }
  });

  if (failed) {
    console.error('FAILED: Lab runners contain forbidden connection logic.');
    process.exit(1);
  } else {
    console.log('✅ No explicit connection calls found in Lab runners.');
    console.log('PASSED: Lab Broker Disconnection Verification successful.');
  }
}

checkFileContent();
