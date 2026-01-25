
import { strict as assert } from 'assert';
import { SMCTradingEngine } from '../../adapters/ctrader/SMCTradingEngine';

// Mock Adapter
const mockAdapter: any = {
  isConnected: () => true,
  setUserContext: () => {},
  reconcilePositions: async () => 0,
  getAccountInfo: async () => ({ balance: 10000 }),
  // ... other methods
};

function runTests() {
  console.log('🔍 Starting No Global Leak Verification...');

  // Test 1: SMCTradingEngine constructor requires adapter
  try {
    // @ts-ignore - Testing runtime check
    new SMCTradingEngine(1, 1);
    console.error('❌ Test 1 Failed: Should throw error if adapter missing');
    process.exit(1);
  } catch (e: any) {
    if (e.message.includes('Adapter de trading obrigatório')) {
      console.log('✅ Test 1 Passed: Constructor enforces injection');
    } else {
      console.error('❌ Test 1 Failed: Wrong error message', e);
      process.exit(1);
    }
  }

  // Test 2: Instantiation with Mock works (Isolation)
  try {
    const engine = new SMCTradingEngine(1, 1, {}, mockAdapter);
    assert.ok(engine);
    console.log('✅ Test 2 Passed: Instantiation with Mock Adapter works');
  } catch (e) {
    console.error('❌ Test 2 Failed', e);
    process.exit(1);
  }

  console.log('PASSED: No Global Leak Verification successful.');
}

runTests();
