'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { ThemeManager, ACCENT_PRESETS } = require('../src/renderer/themeManager');

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

  await t.test('2. Mode Resolution: resolves dark, light, and fallback correctly', () => {
    const targetEl = createMockElement();
    const mgr = new ThemeManager({ targetEl });

    assert.strictEqual(mgr.resolveMode('dark'), 'dark');
    assert.strictEqual(mgr.resolveMode('light'), 'light');
    // Without matchMedia mock in node environment, system defaults to light/dark
    const sysMode = mgr.resolveMode('system');
    assert.ok(sysMode === 'dark' || sysMode === 'light');
  });

  await t.test('3. DOM Theme Application: sets data-theme and data-accent attributes and triggers callback', () => {
    const targetEl = createMockElement();
    let callbackData = null;

    const mgr = new ThemeManager({
      targetEl,
      onChange: (data) => { callbackData = data; }
    });

    mgr.applyTheme('dark', 'amethyst');
    assert.strictEqual(targetEl.getAttribute('data-theme'), 'dark');
    assert.strictEqual(targetEl.getAttribute('data-accent'), 'amethyst');
    assert.deepStrictEqual(callbackData, { mode: 'dark', effectiveMode: 'dark', accent: 'amethyst' });

    mgr.applyTheme('light', 'cyber');
    assert.strictEqual(targetEl.getAttribute('data-theme'), 'light');
    assert.strictEqual(targetEl.getAttribute('data-accent'), 'cyber');
    assert.deepStrictEqual(callbackData, { mode: 'light', effectiveMode: 'light', accent: 'cyber' });
  });

  await t.test('4. Swatch Rendering: renders interactive swatches for all presets', () => {
    // Provide document.createElement mock for Node.js test environment
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
      const container = createMockElement();
      const mgr = new ThemeManager({ targetEl });

      let selectedAccent = null;
      mgr.renderPicker(container, (acc) => { selectedAccent = acc; });

      assert.strictEqual(container.children.length, 8);
      assert.strictEqual(container.children[0].dataset.accent, 'sunset');
      assert.strictEqual(container.children[1].dataset.accent, 'cyber');
      assert.strictEqual(container.children[2].dataset.accent, 'emerald');
      assert.strictEqual(container.children[3].dataset.accent, 'amethyst');
      assert.strictEqual(container.children[4].dataset.accent, 'solar');
      assert.strictEqual(container.children[5].dataset.accent, 'cosmic');
      assert.strictEqual(container.children[6].dataset.accent, 'ocean');
      assert.strictEqual(container.children[7].dataset.accent, 'midnight');
    } finally {
      global.document = prevDoc;
    }
  });
});
