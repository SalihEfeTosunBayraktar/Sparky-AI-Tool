'use strict';

const assert = require('assert');
const TokenTracker = require('../src/main/tokenTracker');

console.log('=== Running TokenTracker Unit Tests ===');

// Test 1: Initial state returns 0
{
  const tracker = new TokenTracker();
  const stats = tracker.getStats();
  assert.strictEqual(stats.lastTokens, 0);
  assert.strictEqual(stats.sessionTotal, 0);
  console.log('✓ Test 1 Passed: Initial state returns 0');
}

// Test 2: Record exact API tokens
{
  const tracker = new TokenTracker();
  const res1 = tracker.record({ totalTokens: 450 });
  assert.strictEqual(res1.lastTokens, 450);
  assert.strictEqual(res1.sessionTotal, 450);

  const res2 = tracker.record({ totalTokens: 1200 });
  assert.strictEqual(res2.lastTokens, 1200);
  assert.strictEqual(res2.sessionTotal, 1650);
  console.log('✓ Test 2 Passed: Records exact API totalTokens and accumulates session total');
}

// Test 3: Fallback token calculation when totalTokens is missing/invalid
{
  const tracker = new TokenTracker();
  const input = 'Hello World! Please generate a prompt.'; // 38 chars -> ~10 tokens
  const output = 'Here is your detailed role and task prompt instruction template for AI.'; // 71 chars -> ~19 tokens
  const res = tracker.record({ input, output });
  assert.ok(res.lastTokens > 0, 'Should estimate positive tokens');
  assert.strictEqual(res.sessionTotal, res.lastTokens);
  console.log('✓ Test 3 Passed: Fallback token calculation works without throwing NaN');
}

// Test 4: Edge case - undefined, null, or NaN inputs return safe number
{
  const tracker = new TokenTracker();
  const res = tracker.record({ totalTokens: NaN, input: null, output: undefined });
  assert.strictEqual(typeof res.lastTokens, 'number');
  assert.strictEqual(typeof res.sessionTotal, 'number');
  assert.ok(!isNaN(res.lastTokens));
  assert.ok(!isNaN(res.sessionTotal));
  console.log('✓ Test 4 Passed: Handles invalid/NaN data safely without crashing');
}

// Test 5: Reset clears session
{
  const tracker = new TokenTracker();
  tracker.record({ totalTokens: 500 });
  const resetStats = tracker.reset();
  assert.strictEqual(resetStats.lastTokens, 0);
  assert.strictEqual(resetStats.sessionTotal, 0);
  console.log('✓ Test 5 Passed: Reset clears token counters');
}

console.log('=== All TokenTracker Tests Passed Successfully! ===');
