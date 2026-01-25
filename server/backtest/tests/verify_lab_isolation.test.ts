
import * as fs from 'fs';
import * as path from 'path';

const LAB_ROOT = path.join(process.cwd(), 'server/backtest');
const ADAPTERS_ROOT = path.join(process.cwd(), 'server/adapters');

// Files allowed to import/require CTraderAdapter (the real one)
const WHITELIST = [
  'server/backtest/tests/verify_isolation.test.ts',
  'server/backtest/tests/verify_lab_isolation.test.ts', // This file
  'server/adapters/ctrader/SMCTradingEngineManager.ts', // The manager is responsible for live injection
  'server/adapters/CTraderAdapter.ts', // The adapter itself
  'server/backtest/collectors/MarketDataCollector.ts', // Needs to connect to broker to download data
  'server/backtest/backtestRouter.ts', // Legacy router, has lazy import
];

function findFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;

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

function checkIsolation() {
  console.log('🔍 Starting Isolation Verification...');

  // 1. Check Lab files (server/backtest)
  const labFiles = findFiles(LAB_ROOT);
  // 2. Check SMCTradingEngine.ts specifically
  const engineFile = path.join(process.cwd(), 'server/adapters/ctrader/SMCTradingEngine.ts');

  const filesToCheck = [...labFiles, engineFile];
  let failed = false;

  const forbiddenStrings = [
    '../CTraderAdapter',
    '../../adapters/CTraderAdapter',
    'server/adapters/CTraderAdapter',
  ];

  filesToCheck.forEach(file => {
    const relativePath = path.relative(process.cwd(), file).replace(/\\/g, '/');

    // Skip whitelisted files
    if (WHITELIST.some(allowed => relativePath === allowed || relativePath.endsWith(allowed))) {
      return;
    }

    const content = fs.readFileSync(file, 'utf-8');

    // Check for imports of CTraderAdapter
    for (const forbidden of forbiddenStrings) {
      if (content.includes(forbidden)) {
        // Double check it's an import/require
        if (content.match(new RegExp(`(import|require).*${forbidden.replace(/\./g, '\\.')}`))) {
           // Exception for comments
           // Simple check: line doesn't start with //
           const lines = content.split('\n');
           const offendingLine = lines.find(l => l.includes(forbidden) && (l.includes('import') || l.includes('require')));

           if (offendingLine && !offendingLine.trim().startsWith('//')) {
             console.error(`[FAIL] ❌ Prohibited import in ${relativePath}: "${offendingLine.trim()}"`);
             failed = true;
           }
        }
      }
    }
  });

  if (failed) {
    console.error('FAILED: Isolation breach detected. Lab files or SMCTradingEngine are importing CTraderAdapter.');
    process.exit(1);
  } else {
    console.log('PASSED: No prohibited imports found in Lab or SMCTradingEngine.');
  }
}

checkIsolation();
