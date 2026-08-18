'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { CATEGORIES, PRESETS, getPreset, getPresetsByCategory } = require('../src/main/agentPresets');

test('=== Running Agent Presets & Categories Unit Tests ===', async (t) => {
  await t.test('1. Categories: contains 6 structured domain folders', () => {
    assert.strictEqual(CATEGORIES.length, 6);
    const catIds = CATEGORIES.map((c) => c.id);
    assert.deepStrictEqual(catIds, ['core', 'engineering', 'creative', 'strategy', 'learning', 'productivity']);
    for (const cat of CATEGORIES) {
      assert.ok(cat.labelKey);
      assert.ok(cat.icon);
    }
  });

  await t.test('2. Preset Count: contains 30 comprehensive agent presets', () => {
    assert.strictEqual(PRESETS.length, 30);
    const uniqueIds = new Set(PRESETS.map((p) => p.id));
    assert.strictEqual(uniqueIds.size, 30, 'All preset IDs must be unique');
  });

  await t.test('3. Categorization: every preset belongs to a valid category', () => {
    const validCatIds = new Set(CATEGORIES.map((c) => c.id));
    for (const preset of PRESETS) {
      assert.ok(validCatIds.has(preset.category), `Preset ${preset.id} has invalid category: ${preset.category}`);
      assert.ok(preset.labelKey, `Preset ${preset.id} missing labelKey`);
      assert.ok(preset.descriptionKey, `Preset ${preset.id} missing descriptionKey`);
      assert.strictEqual(typeof preset.useStyleGuide, 'boolean');
      assert.ok(Array.isArray(preset.additionalRules));
    }
  });

  await t.test('4. Helper Functions: getPreset and getPresetsByCategory group correctly', () => {
    const codeArch = getPreset('code_architect');
    assert.ok(codeArch);
    assert.strictEqual(codeArch.category, 'engineering');

    const fallback = getPreset('non_existent_preset');
    assert.strictEqual(fallback.id, 'blank');

    const { categories, grouped } = getPresetsByCategory();
    assert.strictEqual(categories.length, 6);
    assert.ok(grouped.engineering.length >= 5);
    assert.ok(grouped.creative.length >= 4);
    assert.ok(grouped.strategy.length >= 4);
    assert.ok(grouped.learning.length >= 4);
    assert.ok(grouped.productivity.length >= 3);
    assert.ok(grouped.core.length >= 6);
  });
});
