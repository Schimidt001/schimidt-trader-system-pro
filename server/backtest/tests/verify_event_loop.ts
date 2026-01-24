
import { yieldToEventLoop } from '../utils/AsyncUtils.ts';

async function heavyTaskWithYield() {
  console.log('Starting heavy task...');
  const start = Date.now();
  let loops = 0;
  const maxLoops = 10000000;

  for (let i = 0; i < maxLoops; i++) {
    // Simulate work
    Math.random() * Math.random();

    // Yield every 100000 iterations
    if (i % 100000 === 0) {
      await yieldToEventLoop();
    }
    loops++;
  }

  console.log(`Heavy task finished in ${Date.now() - start}ms`);
}

async function verifyEventLoop() {
  console.log('Verifying Event Loop responsiveness...');

  let ticks = 0;
  const interval = setInterval(() => {
    ticks++;
    if (ticks % 10 === 0) {
      process.stdout.write('.');
    }
  }, 10);

  const start = Date.now();
  await heavyTaskWithYield();
  const end = Date.now();

  clearInterval(interval);
  console.log('\nDone.');

  const duration = end - start;
  const expectedTicks = duration / 10;
  // Allow some margin of error
  const responsiveness = (ticks / expectedTicks) * 100;

  console.log(`Duration: ${duration}ms`);
  console.log(`Ticks: ${ticks} (Expected approx: ${expectedTicks.toFixed(0)})`);
  console.log(`Responsiveness: ${responsiveness.toFixed(2)}%`);

  if (responsiveness < 10) { // Extremely blocked
    console.error('[FAIL] Event loop blocked!');
    process.exit(1);
  } else {
    console.log('[PASS] Event loop remained responsive.');
  }
}

verifyEventLoop();
