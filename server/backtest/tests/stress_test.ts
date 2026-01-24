
import { optimizationJobQueue } from '../utils/OptimizationJobQueue.ts';
import { ParameterCategory, ParameterType } from '../optimization/types/optimization.types.ts';
import * as path from 'path';

// Mock labLogger to avoid clutter
const mockLogger = {
  info: () => {},
  debug: () => {},
  warn: console.warn,
  error: console.error,
  throttled: () => {},
};
// We can't easily mock the import inside OptimizationJobQueue without a DI framework or jest.
// So we will rely on real logger but ignore output or pipe to null if needed.

async function stressTest() {
  console.log('Starting Stress Test...');

  // 1. Setup Config
  const config = {
    symbols: ['XAUUSD'],
    startDate: new Date('2023-01-01'),
    endDate: new Date('2023-01-02'),
    strategyType: 'SMC' as any,
    parameters: [
      {
        name: 'riskPercentage',
        displayName: 'Risk %',
        category: ParameterCategory.RISK,
        type: ParameterType.DECIMAL,
        default: 1,
        min: 1,
        max: 5,
        step: 1, // 5 variations
        enabled: true,
        locked: false,
        description: 'Risk'
      },
      {
        name: 'maxOpenTrades',
        displayName: 'Max Trades',
        category: ParameterCategory.RISK,
        type: ParameterType.INTEGER,
        default: 1,
        min: 1,
        max: 10,
        step: 1, // 10 variations
        enabled: true,
        locked: false,
        description: 'Max Trades'
      }
    ], // Total 50 combinations
    validation: {
      enabled: false,
      inSampleRatio: 0.7,
      walkForward: { enabled: false, windowMonths: 6, stepMonths: 1 }
    },
    objectives: [],
    objectiveWeights: [],
    parallelWorkers: 1,
    maxCombinations: 100,
    dataPath: path.join(process.cwd(), 'data/candles'),
    timeframes: ['M5']
  };

  // 2. Start Job
  console.log('Enqueuing job...');
  const { runId } = optimizationJobQueue.enqueueJob(config, 50);
  console.log(`Job started: ${runId}`);

  // 3. Poll Status
  const startTime = Date.now();
  let completed = false;

  while (!completed) {
    const status = optimizationJobQueue.getJobStatus();

    // Simulate high frequency polling
    if (Date.now() % 100 === 0) {
      process.stdout.write('.');
    }

    if (status.status === 'COMPLETED' || status.status === 'FAILED' || status.status === 'ABORTED') {
      completed = true;
      console.log(`\nJob finished with status: ${status.status}`);
      if (status.error) {
        console.error(`Job Error: ${status.error}`);
        process.exit(1);
      }
    }

    // Check memory
    const mem = process.memoryUsage();
    if (mem.heapUsed > 400 * 1024 * 1024) {
      console.error('\n[FAIL] Memory usage exceeded 400MB!');
      process.exit(1);
    }

    await new Promise(r => setTimeout(r, 10)); // 10ms polling interval

    if (Date.now() - startTime > 30000) {
      console.error('\n[FAIL] Timeout!');
      process.exit(1);
    }
  }

  console.log('\n[PASS] Stress test completed successfully without OOM or Crash.');
}

stressTest();
