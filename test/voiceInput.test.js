'use strict';

const test = require('node:test');
const assert = require('node:assert');

const VoiceInput = require('../src/renderer/orb/voiceInput');

test('=== Running VoiceInput Unit Tests ===', async (t) => {
  await t.test('1. Initialization: initializes with defaults and handles missing speech API safely', () => {
    const vi = new VoiceInput({ lang: 'tr-TR' });
    assert.strictEqual(vi.state, 'idle');
    assert.strictEqual(vi.lang, 'tr-TR');
    assert.strictEqual(vi.start(), false); // Web Speech not present in pure Node environment
  });

  await t.test('2. Language Switching: updates language code mapping', () => {
    const vi = new VoiceInput();
    vi.setLanguage('en');
    assert.strictEqual(vi.lang, 'en-US');
    vi.setLanguage('tr');
    assert.strictEqual(vi.lang, 'tr-TR');
  });

  await t.test('3. State Transitions: notifies listeners on state updates', () => {
    const states = [];
    const vi = new VoiceInput({
      onStateChange: (s) => states.push(s)
    });

    vi.setState('listening');
    vi.setState('processing');
    vi.stop();

    assert.deepStrictEqual(states, ['listening', 'processing', 'idle']);
  });
});
