
import * as fs from 'fs';
import * as path from 'path';

const LAB_ROOT = path.join(process.cwd(), 'server/backtest');

// Files that are allowed to reference ctraderAdapter (e.g. lazy imports or adapters)
const ALLOWED_FILES = [
  'server/backtest/adapters/CTraderAdapter.ts', // If it exists, should be a wrapper
  'server/backtest/backtestRouter.ts', // Has lazy import
  'server/backtest/collectors/MarketDataCollector.ts', // Has lazy import
  'server/backtest/runners/BacktestRunner.ts', // Legacy runner (might still have refs?)
  'server/backtest/runners/BacktestRunnerOptimized.ts', // Legacy runner
  'server/backtest/tests/verify_isolation.test.ts' // This file
];

// Function to recursively find all files
function findFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      findFiles(filePath, fileList);
    } else {
      if (file.endsWith('.ts')) {
        fileList.push(filePath);
      }
    }
  });

  return fileList;
}

// Check for prohibited imports
function checkIsolation() {
  const files = findFiles(LAB_ROOT);
  let failed = false;

  console.log(`Checking isolation for ${files.length} files in ${LAB_ROOT}...`);

  files.forEach(file => {
    const relativePath = path.relative(process.cwd(), file).replace(/\\/g, '/');

    if (ALLOWED_FILES.some(allowed => relativePath.endsWith(allowed) || relativePath === allowed)) {
      return;
    }

    const content = fs.readFileSync(file, 'utf-8');

    // Check for static imports of ctraderAdapter
    // e.g. import ... from ".../adapters/ctrader/CTraderAdapter"
    // or import ... from ".../adapters/CTraderAdapter"

    const importRegex = /import\s+.*from\s+['"](.*ctraderAdapter.*)['"]/i;
    const requireRegex = /require\(['"](.*ctraderAdapter.*)['"]\)/i;

    // Also check for usage of global/singleton ctraderAdapter if imported from elsewhere
    // This is harder to grep perfectly, but we can look for "ctraderAdapter." usages that look like using the real instance

    if (importRegex.test(content)) {
      console.error(`[FAIL] Prohibited import in ${relativePath}: matches "ctraderAdapter"`);
      failed = true;
    }

    // Check for explicit "new SMCTradingEngine" without Mock/Lab adapter injection is harder statically
    // But we can check if it imports the real CTraderAdapter
  });

  if (failed) {
    console.error('Isolation verification FAILED.');
    process.exit(1);
  } else {
    console.log('Isolation verification PASSED.');
  }
}

checkIsolation();
