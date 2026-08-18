'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { ThemeManager, ACCENT_PRESETS, SHAPE_PRESETS } = require('../src/renderer/themeManager');

function createMockElement() {
  const attrs = {};
  return {
    setAttribute(name, val) { attrs[name] = String(val); },
    getAttribute(name) { return attrs[name] || null; },
    removeAttribute(name) { delete attrs[name]; },
    innerHTML: '',
    children: [],
    appendChild(child) { this.children.push(child); },
    querySelectorAll() { return []; }
  };
}

test('=== Running ThemeManager Unit Tests ===', async (t) => {
  await t.test('1. Preset Palettes: contains all required accent options', () => {
    assert.strictEqual(ACCENT_PRESETS.length, 8);
    const ids = ACCENT_PRESETS.map((p) => p.id);
    assert.deepStrictEqual(ids, ['sunset', 'cyber', 'emerald', 'amethyst', 'solar', 'cosmic', 'ocean', 'midnight']);
    for (const preset of ACCENT_PRESETS) {
      assert.ok(preset.gradient.startsWith('linear-gradient'));
      assert.ok(preset.glow);
      assert.ok(preset.labelKey);
    }
  });

  await t.test('2. Shape Presets: contains all 6 geometric shapes', () => {
    assert.strictEqual(SHAPE_PRESETS.length, 6);
    const shapeIds = SHAPE_PRESETS.map((s) => s.id);
    assert.deepStrictEqual(shapeIds, ['circle', 'squircle', 'hexagon', 'diamond', 'octagon', 'triangle']);
    for (const shape of SHAPE_PRESETS) {
      assert.ok(shape.svgPath);
      assert.ok(shape.labelKey);
    }
  });

  await t.test('3. Mode Resolution: resolves dark, light, and fallback correctly', () => {
    const targetEl = createMockElement();
    const mgr = new ThemeManager({ targetEl });

    assert.strictEqual(mgr.resolveMode('dark'), 'dark');
    assert.strictEqual(mgr.resolveMode('light'), 'light');
    const sysMode = mgr.resolveMode('system');
    assert.ok(sysMode === 'dark' || sysMode === 'light');
  });

  await t.test('4. DOM Theme Application: sets data-theme, data-accent, and data-shape attributes', () => {
    const targetEl = createMockElement();
    let callbackData = null;

    const mgr = new ThemeManager({
      targetEl,
      onChange: (data) => { callbackData = data; }
    });

    mgr.applyTheme('dark', 'amethyst', 'hexagon');
    assert.strictEqual(targetEl.getAttribute('data-theme'), 'dark');
    assert.strictEqual(targetEl.getAttribute('data-accent'), 'amethyst');
    assert.strictEqual(targetEl.getAttribute('data-shape'), 'hexagon');
    assert.deepStrictEqual(callbackData, { mode: 'dark', effectiveMode: 'dark', accent: 'amethyst', shape: 'hexagon' });

    mgr.applyTheme('light', 'cyber', 'diamond');
    assert.strictEqual(targetEl.getAttribute('data-theme'), 'light');
    assert.strictEqual(targetEl.getAttribute('data-accent'), 'cyber');
    assert.strictEqual(targetEl.getAttribute('data-shape'), 'diamond');
    assert.deepStrictEqual(callbackData, { mode: 'light', effectiveMode: 'light', accent: 'cyber', shape: 'diamond' });
  });

  await t.test('5. Swatch & Shape Rendering: renders interactive swatches for accents and shapes', () => {
    const prevDoc = global.document;
    global.document = {
      createElement: () => ({
        type: '',
        className: '',
        dataset: {},
        title: '',
        innerHTML: '',
        addEventListener(evt, fn) { this._handler = fn; }
      })
    };

    try {
      const targetEl = createMockElement();
      const accentContainer = createMockElement();
      const shapeContainer = createMockElement();
      const mgr = new ThemeManager({ targetEl });

      mgr.renderPicker(accentContainer, () => {});
      mgr.renderShapePicker(shapeContainer, () => {});

      assert.strictEqual(accentContainer.children.length, 8);
      assert.strictEqual(shapeContainer.children.length, 6);
      assert.strictEqual(shapeContainer.children[0].dataset.shape, 'circle');
      assert.strictEqual(shapeContainer.children[1].dataset.shape, 'squircle');
      assert.strictEqual(shapeContainer.children[2].dataset.shape, 'hexagon');
      assert.strictEqual(shapeContainer.children[3].dataset.shape, 'diamond');
      assert.strictEqual(shapeContainer.children[4].dataset.shape, 'octagon');
      assert.strictEqual(shapeContainer.children[5].dataset.shape, 'triangle');
    } finally {
      global.document = prevDoc;
    }
  });
});
