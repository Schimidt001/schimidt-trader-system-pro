
import { strict as assert } from 'assert';

// Mock types
interface JobStatus {
  hasJob: boolean;
  runId: string | null;
  status: string | null;
}

// Mock Queue
const mockQueue = {
  currentJob: null as any,
  getJobStatus: () => {
    if (!mockQueue.currentJob) {
      return { hasJob: false, runId: null, status: null };
    }
    return {
      hasJob: true,
      runId: mockQueue.currentJob.runId,
      status: mockQueue.currentJob.status
    };
  }
};

// Logic to test
function getOptimizationStatus(input?: { runId?: string }) {
  const jobStatus = mockQueue.getJobStatus();

  if (input?.runId) {
    if (!jobStatus.hasJob || (jobStatus.runId && jobStatus.runId !== input.runId)) {
      throw new Error("NOT_FOUND");
    }
  }

  return jobStatus;
}

function runTests() {
  console.log('🔍 Starting Resilience Verification...');

  // Scenario 1: No job running, no input
  // Expect: Idle status
  try {
    const status = getOptimizationStatus();
    assert.equal(status.hasJob, false);
    console.log('✅ Scenario 1 Passed');
  } catch (e) {
    console.error('❌ Scenario 1 Failed', e);
    process.exit(1);
  }

  // Scenario 2: Job running, matching input
  // Expect: Status returned
  mockQueue.currentJob = { runId: 'job-123', status: 'RUNNING' };
  try {
    const status = getOptimizationStatus({ runId: 'job-123' });
    assert.equal(status.runId, 'job-123');
    console.log('✅ Scenario 2 Passed');
  } catch (e) {
    console.error('❌ Scenario 2 Failed', e);
    process.exit(1);
  }

  // Scenario 3: Job running, MISMATCHING input (old tab vs new server state)
  // Expect: Error (Frontend should reset)
  try {
    getOptimizationStatus({ runId: 'job-OLD' });
    console.error('❌ Scenario 3 Failed: Should have thrown NOT_FOUND');
    process.exit(1);
  } catch (e: any) {
    if (e.message === 'NOT_FOUND') {
      console.log('✅ Scenario 3 Passed (Correctly detected mismatch)');
    } else {
      console.error('❌ Scenario 3 Failed: Wrong error', e);
      process.exit(1);
    }
  }

  // Scenario 4: No job running, but input provided (Server restarted)
  // Expect: Error
  mockQueue.currentJob = null;
  try {
    getOptimizationStatus({ runId: 'job-123' });
    console.error('❌ Scenario 4 Failed: Should have thrown NOT_FOUND');
    process.exit(1);
  } catch (e: any) {
    if (e.message === 'NOT_FOUND') {
      console.log('✅ Scenario 4 Passed (Correctly detected lost job)');
    } else {
      console.error('❌ Scenario 4 Failed: Wrong error', e);
      process.exit(1);
    }
  }

  console.log('PASSED: Status Resilience Verification successful.');
}

runTests();
