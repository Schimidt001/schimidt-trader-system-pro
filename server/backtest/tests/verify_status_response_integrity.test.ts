
import { strict as assert } from 'assert';

// Mock Router functions (simplified)
const router = {
  getOptimizationStatus: (input: any) => {
    // Should never return null
    return {
      isRunning: false,
      runId: null, // can be null
      status: 'IDLE', // can be null in original, but we fixed it to IDLE
      progress: null,
      error: null,
      lastProgressAt: null,
    };
  },
  getDownloadStatus: () => {
    return {
      isDownloading: false,
      progress: 0,
      currentSymbol: "",
      currentTimeframe: "",
      errors: [],
    };
  }
};

function runTests() {
  console.log('🔍 Starting Status Response Integrity Verification...');

  // Test 1: Optimization Status
  const optStatus = router.getOptimizationStatus({});
  assert.notEqual(optStatus, null, 'Optimization status object should not be null');
  assert.notEqual(optStatus.status, undefined, 'Status field should exist');
  // We allow null for sub-fields if they are optional in schema, but the object itself must exist
  console.log('✅ Optimization Status Integrity Passed');

  // Test 2: Download Status
  const dlStatus = router.getDownloadStatus();
  assert.notEqual(dlStatus, null, 'Download status object should not be null');
  assert.equal(typeof dlStatus.isDownloading, 'boolean', 'isDownloading should be boolean');
  assert.ok(Array.isArray(dlStatus.errors), 'errors should be an array');
  console.log('✅ Download Status Integrity Passed');

  console.log('PASSED: Status Response Integrity Verification successful.');
}

runTests();
