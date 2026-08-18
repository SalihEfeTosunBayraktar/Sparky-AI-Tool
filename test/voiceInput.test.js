'use strict';

const test = require('node:test');
const assert = require('node:assert');

const VoiceInput = require('../src/renderer/orb/voiceInput');
const WhisperEngine = require('../src/main/whisperEngine');

test('=== Running VoiceInput & Whisper STT Unit Tests ===', async (t) => {
  await t.test('1. Initialization: initializes with defaults and handles missing media devices safely', () => {
    const vi = new VoiceInput();
    assert.strictEqual(vi.state, 'idle');
    assert.strictEqual(vi.audioChunks.length, 0);
  });

  await t.test('2. State Transitions: notifies listeners on state updates', () => {
    const states = [];
    const vi = new VoiceInput({
      onStateChange: (s) => states.push(s)
    });

    vi.setState('listening');
    vi.stop(); // Sets state to 'processing'

    assert.deepStrictEqual(states, ['listening', 'processing']);
  });

  await t.test('3. WhisperEngine Validation: validates empty buffer and missing API key gracefully', async () => {
    const resEmpty = await WhisperEngine.transcribe(null);
    assert.strictEqual(resEmpty.ok, false);
    assert.ok(resEmpty.error.includes('boş'));

    const dummyAudio = Buffer.from('RIFF....WAVEfmt ');
    const resNoKey = await WhisperEngine.transcribe(dummyAudio);
    assert.strictEqual(resNoKey.ok, false);
    assert.ok(resNoKey.error.length > 0);
  });
});
