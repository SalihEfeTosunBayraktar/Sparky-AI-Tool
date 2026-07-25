'use strict';

const assert = require('assert');
const { ModeManager, APP_MODES, DEFAULT_MODE } = require('../src/main/modeManager');

console.log('=== Running ModeManager Unit Tests ===');

// Mock Store
class MockStore {
  constructor(initialData = {}) {
    this.data = { ...initialData };
  }

  get() {
    return this.data;
  }

  set(partial) {
    this.data = { ...this.data, ...partial };
  }
}

// Test 1: Default initialization with empty store
{
  const store = new MockStore();
  const manager = new ModeManager(store);
  assert.strictEqual(manager.getMode(), APP_MODES.NORMAL_CHAT, 'Should default to normal-chat');
  console.log('✓ Test 1 Passed: Defaults to NORMAL_CHAT');
}

// Test 2: Valid mode restored from store
{
  const store = new MockStore({ appMode: APP_MODES.PROMPT_PREPARER });
  const manager = new ModeManager(store);
  assert.strictEqual(manager.getMode(), APP_MODES.PROMPT_PREPARER, 'Should restore prompt-preparer from store');
  console.log('✓ Test 2 Passed: Restores prompt-preparer from store');
}

// Test 3: Corrupt or invalid mode in store falls back to default safely
{
  const store = new MockStore({ appMode: 'corrupt-invalid-mode-xyz' });
  const manager = new ModeManager(store);
  assert.strictEqual(manager.getMode(), DEFAULT_MODE, 'Corrupt mode should fallback to default NORMAL_CHAT');
  console.log('✓ Test 3 Passed: Fallback on corrupt config');
}

// Test 4: Setting valid mode updates state and persists
{
  const store = new MockStore();
  const manager = new ModeManager(store);
  manager.setMode(APP_MODES.PROMPT_PREPARER);
  assert.strictEqual(manager.getMode(), APP_MODES.PROMPT_PREPARER);
  assert.strictEqual(store.get().appMode, APP_MODES.PROMPT_PREPARER);
  console.log('✓ Test 4 Passed: Setting mode updates state and persists');
}

// Test 5: Setting invalid mode falls back safely to default without throwing
{
  const store = new MockStore();
  const manager = new ModeManager(store);
  manager.setMode('invalid-mode');
  assert.strictEqual(manager.getMode(), DEFAULT_MODE);
  assert.strictEqual(store.get().appMode, DEFAULT_MODE);
  console.log('✓ Test 5 Passed: Setting invalid mode falls back safely');
}

// Test 6: Catalog list is complete
{
  const manager = new ModeManager(new MockStore());
  const catalog = manager.getCatalog();
  assert.strictEqual(catalog.length, 2);
  assert.strictEqual(catalog[0].id, APP_MODES.NORMAL_CHAT);
  assert.strictEqual(catalog[1].id, APP_MODES.PROMPT_PREPARER);
  console.log('✓ Test 6 Passed: Catalog returns supported modes');
}

console.log('=== All ModeManager Tests Passed Successfully! ===');
