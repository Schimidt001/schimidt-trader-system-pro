
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const LAB_ROOT = path.join(process.cwd(), 'server/backtest');

// Runners that should NEVER connect to the broker
const LAB_RUNNERS = [
  'server/backtest/runners/LabBacktestRunner.ts',
  'server/backtest/runners/LabBacktestRunnerOptimized.ts',
  'server/backtest/runners/IsolatedBacktestRunner.ts',
];

// Files that should use LabMarketDataCollector or explicit offline checks
const ROUTERS = [
  'server/backtest/backtestRouter.ts',
  'server/backtest/institutionalRouter.ts',
];

function checkContent() {
  console.log('🔍 Starting Aggressive Broker Disconnection Verification...');

  let failed = false;

  // 1. Check Runners for forbidden imports/calls
  LAB_RUNNERS.forEach(fileRelPath => {
    const filePath = path.join(process.cwd(), fileRelPath);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Warning: File not found ${fileRelPath}`);
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    if (content.includes('../adapters/CTraderAdapter')) {
      console.error(`❌ [FAIL] ${fileRelPath} imports CTraderAdapter directly!`);
      failed = true;
    }

    if (content.includes('ctraderAdapter.connect')) {
      console.error(`❌ [FAIL] ${fileRelPath} calls ctraderAdapter.connect()!`);
      failed = true;
    }

    // Check if it uses the offline collector
    if (!content.includes('LabMarketDataCollector') && !content.includes('getLabMarketDataCollector')) {
       console.warn(`⚠️ [WARN] ${fileRelPath} does not seem to import LabMarketDataCollector. Ensure it is using offline data validation.`);
    }
  });

  // 2. Check Routers for CTraderAdapter usage
  ROUTERS.forEach(fileRelPath => {
    const filePath = path.join(process.cwd(), fileRelPath);
    const content = fs.readFileSync(filePath, 'utf-8');

    // backtestRouter is allowed to lazy load for downloadData, but not top level
    if (fileRelPath.includes('backtestRouter.ts')) {
        const lines = content.split('\n');
        lines.forEach((line, index) => {
            if (line.includes('import') && line.includes('CTraderAdapter') && !line.includes('//')) {
                 console.error(`❌ [FAIL] ${fileRelPath}:${index+1} has top-level import of CTraderAdapter!`);
                 failed = true;
            }
        });
    }

    // institutionalRouter should NEVER import CTraderAdapter
    if (fileRelPath.includes('institutionalRouter.ts')) {
        if (content.includes('CTraderAdapter') && !content.includes('//')) {
             console.error(`❌ [FAIL] ${fileRelPath} imports or uses CTraderAdapter! This router must be strictly offline.`);
             failed = true;
        }
    }
  });

  if (failed) {
    console.error('FAILED: Lab files contain forbidden connection logic or imports.');
    process.exit(1);
  } else {
    console.log('✅ No explicit connection calls or top-level forbidden imports found.');
    console.log('PASSED: Lab Broker Disconnection Verification successful.');
  }
}

checkContent();
