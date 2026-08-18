'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SlashCommandEngine = require('../src/renderer/orb/commandEngine');

test('=== Running SlashCommandEngine Unit Tests ===', async (t) => {
  let outputCaptured = '';
  let statusCaptured = null;
  let settingsChanged = null;

  const mockApi = {
    memory: {
      compact: async () => ({ ok: true, summary: '### SUMMARY\n- Compacted goals' }),
      clear: async () => ({ ok: true })
    },
    settings: {
      get: async () => ({ provider: 'openrouter', model: 'nvidia/nemotron' }),
      set: async (patch) => { settingsChanged = patch; return patch; }
    },
    providers: {
      catalog: async () => [
        { id: 'openai', label: 'OpenAI' },
        { id: 'openrouter', label: 'OpenRouter' }
      ],
      models: async () => [
        { id: 'gpt-4o', name: 'GPT-4o' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini' }
      ]
    },
    modes: {
      catalog: async () => [
        { id: 'prompt-preparer', name: 'Prompt Hazırlayıcı' },
        { id: 'normal-chat', name: 'Normal Sohbet' }
      ],
      getActive: async () => 'normal-chat',
      setActive: async (id) => id
    },
    projects: {
      all: async () => [{ id: 'p1', name: 'Sparky AI' }],
      getActiveId: async () => 'p1',
      setActive: async (id) => id
    }
  };

  const engine = new SlashCommandEngine({
    api: mockApi,
    onOutput: (text) => { outputCaptured = text; },
    onStatus: (status) => { statusCaptured = status; },
    onSettingsChange: (patch) => { settingsChanged = patch; }
  });

  await t.test('1. Command Detection: identifies slash commands and ignores normal prompts', () => {
    assert.equal(engine.isCommand('/help'), true);
    assert.equal(engine.isCommand('/compact'), true);
    assert.equal(engine.isCommand('/model gpt-4o'), true);
    assert.equal(engine.isCommand('hello world'), false);
    assert.equal(engine.isCommand('/'), false);
    assert.equal(engine.isCommand(''), false);
  });

  await t.test('2. Autocomplete Suggestions: returns matching commands for prefix', () => {
    const list = engine.getSuggestions('/c');
    assert.ok(list.length >= 2);
    assert.ok(list.some((c) => c.name === '/compact'));
    assert.ok(list.some((c) => c.name === '/clear'));

    const listEmpty = engine.getSuggestions('abc');
    assert.deepEqual(listEmpty, []);
  });

  await t.test('3. /help Command: outputs formatted markdown table', async () => {
    const executed = await engine.execute('/help');
    assert.equal(executed, true);
    assert.ok(outputCaptured.includes('Sparky AI — Yerel Slash Komutları'));
    assert.ok(outputCaptured.includes('/compact'));
    assert.ok(outputCaptured.includes('/model'));
  });

  await t.test('4. /compact Command: calls memory.compact and returns summary', async () => {
    const executed = await engine.execute('/compact');
    assert.equal(executed, true);
    assert.ok(outputCaptured.includes('Proje hafızası başarıyla sıkıştırıldı'));
    assert.ok(outputCaptured.includes('Compacted goals'));
  });

  await t.test('5. /model Command: switches model when parameter provided', async () => {
    settingsChanged = null;
    await engine.execute('/model gpt-4o-mini');
    assert.ok(outputCaptured.includes('gpt-4o-mini'));
    assert.deepEqual(settingsChanged, { model: 'gpt-4o-mini' });
  });

  await t.test('6. /provider Command: switches provider when parameter provided', async () => {
    settingsChanged = null;
    await engine.execute('/provider openai');
    assert.ok(outputCaptured.includes('OpenAI'));
    assert.deepEqual(settingsChanged, { provider: 'openai' });
  });

  await t.test('7. /clear Command: clears memory', async () => {
    await engine.execute('/clear');
    assert.ok(outputCaptured.includes('hafızası ve diyalog geçmişi sıfırlandı'));
  });

  await t.test('8. Unknown Command: returns helpful guidance instead of crashing', async () => {
    await engine.execute('/unknownCommandXYZ');
    assert.ok(outputCaptured.includes('Bilinmeyen komut'));
    assert.ok(outputCaptured.includes('/help'));
  });
});
