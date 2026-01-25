
import { yieldToEventLoop } from '../utils/AsyncUtils';

async function heavyTaskWithYield() {
  const start = Date.now();
  let loops = 0;
  const maxLoops = 5000000; // 5M loops

  for (let i = 0; i < maxLoops; i++) {
    // Simulate work
    Math.sqrt(i) * Math.random();

    // Yield every 50000 iterations
    if (i % 50000 === 0) {
      await yieldToEventLoop();
    }
    loops++;
  }
}

async function verifyEventLoop() {
  console.log('🔍 Verifying Event Loop Cooperation...');

  let ticks = 0;
  // This interval monitors event loop lag.
  // Ideally it should fire every 10ms.
  const interval = setInterval(() => {
    ticks++;
  }, 10);

  const start = Date.now();
  await heavyTaskWithYield();
  const end = Date.now();

  clearInterval(interval);

  const duration = end - start;
  const expectedTicks = duration / 10;

  // Responsiveness score: Actual Ticks / Expected Ticks
  // If the loop was completely blocked, ticks would be 0 or 1.
  // If perfect, 100%.
  const responsiveness = (ticks / expectedTicks) * 100;

  console.log(`Duration: ${duration}ms`);
  console.log(`Ticks: ${ticks} (Expected: ~${expectedTicks.toFixed(0)})`);
  console.log(`Responsiveness: ${responsiveness.toFixed(2)}%`);

  if (responsiveness < 20) { // Should be at least 20-30% responsive even under load if yielding correctly
    console.error('[FAIL] Event loop blocked significantly!');
    process.exit(1);
  } else {
    console.log('✅ Event loop remained responsive.');
    console.log('PASSED: Event Loop Cooperation Verification successful.');
  }
}

verifyEventLoop();
