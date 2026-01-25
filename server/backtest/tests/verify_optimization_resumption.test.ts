
import { strict as assert } from 'assert';

// Mock Queue State
let mockJobState: any = null;

// Mock Backend Function (Institutional Router)
function getOptimizationStatus(input?: { runId?: string }) {
  // Simulate server restart (lost state)
  if (!mockJobState) {
    // If client asks for a specific runId but server has none, throw NOT_FOUND
    if (input?.runId) {
      throw new Error("NOT_FOUND");
    }
    return { isRunning: false, runId: null, status: 'IDLE' };
  }

  // If client asks for a runId that doesn't match active job
  if (input?.runId && input.runId !== mockJobState.runId) {
    throw new Error("NOT_FOUND");
  }

  return mockJobState;
}

// Mock Frontend Hook Logic
let hookState = {
  runId: null as string | null,
  status: 'IDLE',
  error: null as string | null
};

// Frontend Persistence Mock
const storage = {
  runId: null as string | null,
  save(id: string) { this.runId = id; },
  clear() { this.runId = null; },
  load() { return this.runId; }
};

async function pollStatus() {
  try {
    const runIdToPoll = hookState.runId || storage.load();
    // Simulate polling with runId if we have one
    const input = runIdToPoll ? { runId: runIdToPoll } : undefined;

    const status = getOptimizationStatus(input);

    // Success path
    hookState.status = status.status;

  } catch (error: any) {
    if (error.message === 'NOT_FOUND') {
      console.log('⚠️ Frontend detected NOT_FOUND. Resetting state.');
      storage.clear();
      hookState = { runId: null, status: 'IDLE', error: null };
    } else {
      hookState.status = 'ERROR';
      hookState.error = error.message;
    }
  }
}

async function runTests() {
  console.log('🔍 Starting Optimization Resumption Verification...');

  // 1. Start a job
  mockJobState = { runId: 'job-1', status: 'RUNNING' };
  storage.save('job-1');
  hookState.runId = 'job-1';
  hookState.status = 'RUNNING';

  // 2. Simulate Polling (Normal)
  await pollStatus();
  assert.equal(hookState.status, 'RUNNING', 'Status should be RUNNING');
  assert.equal(storage.load(), 'job-1', 'Storage should keep runId');
  console.log('✅ Normal polling passed');

  // 3. Simulate Server Restart (State Lost)
  mockJobState = null;
  // Frontend still has 'job-1' in storage/state

  // 4. Poll again -> Should detect 404 and reset
  await pollStatus();

  assert.equal(hookState.runId, null, 'Hook runId should be null');
  assert.equal(hookState.status, 'IDLE', 'Hook status should be IDLE');
  assert.equal(storage.load(), null, 'Storage should be cleared');
  console.log('✅ Resumption failure handling passed (Reset on 404)');

  console.log('PASSED: Optimization Resumption Verification successful.');
}

runTests();
