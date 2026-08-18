'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PromptAssistEngine = require('../src/main/promptAssistEngine');

test('=== Running PromptAssistEngine Unit Tests ===', async (t) => {
  await t.test('1. Strategies: returns 3 distinct generation strategies', () => {
    const strategies = PromptAssistEngine.getStrategies();
    assert.equal(Array.isArray(strategies), true);
    assert.equal(strategies.length, 3);
    assert.deepEqual(
      strategies.map((s) => s.id),
      ['concise', 'structured', 'deep']
    );
  });

  await t.test('2. Block Parsing: parses structured headings into semantic blocks', () => {
    const samplePrompt = `## Role
You are a Senior Frontend Architect.

## Task
Build an interactive e-commerce cart.

## Constraints
- Strict TypeScript
- Zustand for state management

## Output Format
Deliver a single TSX component.`;

    const blocks = PromptAssistEngine.parseBlocks(samplePrompt);
    assert.equal(blocks.length >= 4, true);

    const roleBlock = blocks.find((b) => b.type === 'role');
    assert.ok(roleBlock);
    assert.match(roleBlock.content, /Senior Frontend Architect/i);

    const taskBlock = blocks.find((b) => b.type === 'task');
    assert.ok(taskBlock);
    assert.match(taskBlock.content, /e-commerce cart/i);

    const constraintBlock = blocks.find((b) => b.type === 'constraints');
    assert.ok(constraintBlock);
    assert.match(constraintBlock.content, /Zustand/i);
  });

  await t.test('3. Fallback Parsing: unstructured prompt produces a general block', () => {
    const plainPrompt = 'Write a python script to parse CSV files without headers.';
    const blocks = PromptAssistEngine.parseBlocks(plainPrompt);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, 'general');
    assert.equal(blocks[0].content, plainPrompt);
  });

  await t.test('4. Block Serialization: converts block array back into markdown', () => {
    const blocks = [
      { id: '1', type: 'role', title: 'Rol', content: 'Kıdemli Yazılım Mühendisi' },
      { id: '2', type: 'task', title: 'Görev', content: 'REST API tasarla' }
    ];

    const markdown = PromptAssistEngine.serializeBlocks(blocks);
    assert.match(markdown, /## Rol\nKıdemli Yazılım Mühendisi/);
    assert.match(markdown, /## Görev\nREST API tasarla/);
  });

  await t.test('5. Micro-Refinement: targeted block rewrite with mock chat function', async () => {
    const fullText = `## Role\nExpert React Developer\n\n## Task\nBuild a modal\n\n## Constraints\n- Use CSS modules`;
    const mockChat = async ({ messages, system }) => {
      assert.ok(system.includes('Prompt Engineering Editor'));
      return { text: '- Use CSS modules\n- Add ESC key listener to close modal' };
    };

    const res = await PromptAssistEngine.refineBlock({
      fullText,
      blockType: 'constraints',
      currentContent: '- Use CSS modules',
      instruction: 'ESC tuşuyla kapanma kuralı ekle',
      chat: mockChat,
      cfg: { provider: 'mock', model: 'mock-model' }
    });

    assert.ok(res.updatedContent.includes('ESC key listener'));
    assert.ok(res.updatedFullMarkdown.includes('ESC key listener'));
    assert.ok(res.updatedFullMarkdown.includes('Expert React Developer'));
  });
});
