'use strict';

const test = require('node:test');
const assert = require('node:assert');

const ImageHandler = require('../src/renderer/orb/imageHandler');

function createMockElement(tag = 'div') {
  return {
    tagName: tag.toUpperCase(),
    hidden: false,
    disabled: false,
    classList: {
      classes: new Set(),
      add(cls) { this.classes.add(cls); },
      remove(cls) { this.classes.delete(cls); },
      toggle(cls, force) {
        if (force === undefined) {
          if (this.classes.has(cls)) this.classes.delete(cls);
          else this.classes.add(cls);
        } else if (force) {
          this.classes.add(cls);
        } else {
          this.classes.delete(cls);
        }
      },
      contains(cls) { return this.classes.has(cls); }
    },
    src: '',
    title: '',
    listeners: {},
    addEventListener(evt, fn) {
      if (!this.listeners[evt]) this.listeners[evt] = [];
      this.listeners[evt].push(fn);
    },
    dispatchEvent(evt, data) {
      if (this.listeners[evt]) {
        for (const fn of this.listeners[evt]) fn(data);
      }
    }
  };
}

test('=== Running ImageHandler Vision Adaptation Tests ===', async (t) => {
  await t.test('1. Vision Support Enabled: enables upload button and accepts images', () => {
    const previewEl = createMockElement('div');
    const imgEl = createMockElement('img');
    const removeBtn = createMockElement('button');
    const attachBtn = createMockElement('button');
    const fileInput = createMockElement('input');
    const dropTarget = createMockElement('div');

    const handler = new ImageHandler({
      previewEl,
      imgEl,
      removeBtn,
      attachBtn,
      fileInput,
      dropTarget
    });

    handler.setModelConfig({ supportsVision: true, maxImagesAllowed: 1 });
    assert.strictEqual(attachBtn.disabled, false);
    assert.strictEqual(attachBtn.classList.contains('disabled'), false);

    handler.setImage({ mimeType: 'image/png', base64: 'abc1234' });
    assert.strictEqual(previewEl.hidden, false);
    assert.strictEqual(imgEl.src, 'data:image/png;base64,abc1234');
    // Once max limit (1) is reached, button is disabled
    assert.strictEqual(attachBtn.disabled, true);
  });

  await t.test('2. Non-Vision Model: clears existing image and disables button with warning', () => {
    const previewEl = createMockElement('div');
    const imgEl = createMockElement('img');
    const removeBtn = createMockElement('button');
    const attachBtn = createMockElement('button');
    const fileInput = createMockElement('input');
    const dropTarget = createMockElement('div');

    let warningCalled = null;
    const handler = new ImageHandler({
      previewEl,
      imgEl,
      removeBtn,
      attachBtn,
      fileInput,
      dropTarget,
      onWarning: (msg) => { warningCalled = msg; }
    });

    // Attach image first
    handler.setImage({ mimeType: 'image/jpeg', base64: 'samplebase64' });
    assert.ok(handler.getImage());

    // Switch to non-vision model (e.g. DeepSeek-Chat or GPT-3.5)
    handler.setModelConfig({ supportsVision: false, maxImagesAllowed: 0 });

    assert.strictEqual(handler.getImage(), null);
    assert.strictEqual(previewEl.hidden, true);
    assert.strictEqual(attachBtn.disabled, true);
    assert.strictEqual(attachBtn.classList.contains('disabled'), true);
    assert.ok(warningCalled);
  });

  await t.test('3. Non-Vision Drop: blocks file drop with warning message', () => {
    const previewEl = createMockElement('div');
    const imgEl = createMockElement('img');
    const removeBtn = createMockElement('button');
    const attachBtn = createMockElement('button');
    const dropTarget = createMockElement('div');

    let warningCalled = null;
    const handler = new ImageHandler({
      previewEl,
      imgEl,
      removeBtn,
      attachBtn,
      dropTarget,
      onWarning: (msg) => { warningCalled = msg; }
    });

    handler.setModelConfig({ supportsVision: false, maxImagesAllowed: 0 });

    // Simulate drop on dropTarget
    dropTarget.dispatchEvent('drop', {
      dataTransfer: { files: [{ type: 'image/png', size: 1024 }] },
      preventDefault: () => {},
      stopPropagation: () => {}
    });

    assert.strictEqual(handler.getImage(), null);
    assert.ok(warningCalled);
  });

  await t.test('4. Backend supportsVision: accurately identifies multimodal vs text-only models', () => {
    const { supportsVision } = require('../src/main/providers/imageUtils');
    assert.strictEqual(supportsVision('openai', 'gpt-4o'), true);
    assert.strictEqual(supportsVision('gemini', 'gemini-1.5-flash'), true);
    assert.strictEqual(supportsVision('anthropic', 'claude-3-5-sonnet'), true);
    assert.strictEqual(supportsVision('ollama', 'llava:latest'), true);

    // Non-vision models
    assert.strictEqual(supportsVision('openai', 'gpt-3.5-turbo'), false);
    assert.strictEqual(supportsVision('custom', 'deepseek-chat'), false);
    assert.strictEqual(supportsVision('custom', 'nvidia/nemotron-3-ultra-550b-a55b:free'), false);
    assert.strictEqual(supportsVision('custom', 'mistralai/mixtral-8x7b-instruct'), false);
  });
});
