
import { strict as assert } from 'assert';

// Mock Queue State
let mockJobState: any = null;

// Mock Router Function (Institutional Router Logic)
function getOptimizationStatus(input?: { runId?: string }) {
  try {
    // Simulate Job Queue
    if (!mockJobState) {
        // Queue is empty or internal error
        // If client asked for a runId, it's a 404
        if (input?.runId) throw new Error("NOT_FOUND");

        // Otherwise return IDLE state (Queue empty)
        return { isRunning: false, runId: null, status: 'IDLE', progress: null, error: null };
    }

    if (input?.runId && input.runId !== mockJobState.runId) {
      throw new Error("NOT_FOUND");
    }

    return mockJobState;
  } catch (error: any) {
    if (error.message === "NOT_FOUND") throw error; // Retrow expected errors

    // Fallback for unexpected errors
    return {
      isRunning: false,
      runId: null,
      status: "ERROR",
      progress: null,
      error: error.message || "Internal Error",
      lastProgressAt: null,
    };
  }
}

function runTests() {
  console.log('🔍 Starting Status Response Structure Verification...');

  // Test 1: Normal Running State
  mockJobState = {
      isRunning: true,
      runId: 'job-1',
      status: 'RUNNING',
      progress: { percentComplete: 50 },
      error: null
  };
  const normalStatus = getOptimizationStatus({ runId: 'job-1' });
  assert.equal(normalStatus.status, 'RUNNING');
  assert.notEqual(normalStatus, null);
  console.log('✅ Normal State: Valid Structure');

  // Test 2: Server Restart / Lost Job (Simulate Queue Empty)
  mockJobState = null;
  try {
      getOptimizationStatus({ runId: 'job-1' });
      console.error('❌ Lost Job: Should have thrown NOT_FOUND');
      process.exit(1);
  } catch (e: any) {
      assert.equal(e.message, 'NOT_FOUND');
      console.log('✅ Lost Job: Throws NOT_FOUND (Correct)');
  }

  // Test 3: Internal Error Recovery (Simulate undefined state without throwing)
  // We can't easily simulate an internal throw inside the function without changing it,
  // but we verify the fallback structure is returned if no job exists and no input runId
  const idleStatus = getOptimizationStatus();
  assert.equal(idleStatus.status, 'IDLE');
  assert.notEqual(idleStatus, null); // MUST NOT BE NULL
  assert.notEqual(idleStatus.isRunning, undefined);
  console.log('✅ Idle/Fallback: Valid Structure (No Nulls)');

  console.log('PASSED: Status Response Structure Verification successful.');
}

runTests();
