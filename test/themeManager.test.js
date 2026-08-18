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
  await t.test('1. Preset Palettes: contains all 23 accent options', () => {
    assert.strictEqual(ACCENT_PRESETS.length, 23);
    const ids = ACCENT_PRESETS.map((p) => p.id);
    assert.ok(ids.includes('sunset'));
    assert.ok(ids.includes('cyber'));
    assert.ok(ids.includes('aurora'));
    assert.ok(ids.includes('matrix'));
    assert.ok(ids.includes('inferno'));
    assert.ok(ids.includes('synthwave'));
    assert.ok(ids.includes('dracula'));
    for (const preset of ACCENT_PRESETS) {
      assert.ok(preset.gradient.startsWith('linear-gradient'));
      assert.ok(preset.glow);
      assert.ok(preset.labelKey);
    }
  });

  await t.test('2. Shape Presets: contains all 12 geometric shapes', () => {
    assert.strictEqual(SHAPE_PRESETS.length, 12);
    const shapeIds = SHAPE_PRESETS.map((s) => s.id);
    assert.deepStrictEqual(shapeIds, [
      'circle', 'squircle', 'hexagon', 'diamond', 'octagon', 'triangle',
      'shield', 'star', 'pill', 'leaf', 'rhombus', 'cross'
    ]);
    for (const shape of SHAPE_PRESETS) {
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

    mgr.applyTheme('dark', 'aurora', 'shield');
    assert.strictEqual(targetEl.getAttribute('data-theme'), 'dark');
    assert.strictEqual(targetEl.getAttribute('data-accent'), 'aurora');
    assert.strictEqual(targetEl.getAttribute('data-shape'), 'shield');
    assert.deepStrictEqual(callbackData, { mode: 'dark', effectiveMode: 'dark', accent: 'aurora', shape: 'shield' });

    mgr.applyTheme('light', 'synthwave', 'star');
    assert.strictEqual(targetEl.getAttribute('data-theme'), 'light');
    assert.strictEqual(targetEl.getAttribute('data-accent'), 'synthwave');
    assert.strictEqual(targetEl.getAttribute('data-shape'), 'star');
    assert.deepStrictEqual(callbackData, { mode: 'light', effectiveMode: 'light', accent: 'synthwave', shape: 'star' });
  });

  await t.test('5. Swatch & Shape Rendering: renders interactive swatches for 23 accents and 12 shapes', () => {
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

      assert.strictEqual(accentContainer.children.length, 23);
      assert.strictEqual(shapeContainer.children.length, 12);
      assert.strictEqual(shapeContainer.children[0].dataset.shape, 'circle');
      assert.strictEqual(shapeContainer.children[1].dataset.shape, 'squircle');
      assert.strictEqual(shapeContainer.children[6].dataset.shape, 'shield');
      assert.strictEqual(shapeContainer.children[7].dataset.shape, 'star');
      assert.strictEqual(shapeContainer.children[8].dataset.shape, 'pill');
      assert.strictEqual(shapeContainer.children[9].dataset.shape, 'leaf');
      assert.strictEqual(shapeContainer.children[10].dataset.shape, 'rhombus');
      assert.strictEqual(shapeContainer.children[11].dataset.shape, 'cross');
    } finally {
      global.document = prevDoc;
    }
  });
});
