'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PromptAssistEngine = require('../src/main/promptAssistEngine');

test('=== Running PromptAssistEngine Unit Tests ===', async (t) => {
  await t.test('1. Strategy Pool: contains 8 diverse strategies with SVG icons', () => {
    const pool = PromptAssistEngine.getStrategyPool();
    assert.equal(Array.isArray(pool), true);
    assert.equal(pool.length, 8);
    for (const s of pool) {
      assert.ok(s.id);
      assert.ok(s.label);
      assert.ok(s.icon.includes('<svg'));
      assert.ok(s.style);
    }
  });

  await t.test('2. Dynamic Weighted Triad: selects top weighted + exploratory strategies', () => {
    const weights = { creative: 100, code_centric: 90 };
    const triad = PromptAssistEngine.getWeightedTriad(weights, false);
    assert.equal(triad.length, 3);
    assert.equal(triad[0].id, 'creative');
    assert.equal(triad[1].id, 'code_centric');
  });

  await t.test('3. Random Triad: forceRandom returns 3 distinct random strategies', () => {
    const randomTriad = PromptAssistEngine.getWeightedTriad({}, true);
    assert.equal(randomTriad.length, 3);
    const uniqueIds = new Set(randomTriad.map((s) => s.id));
    assert.equal(uniqueIds.size, 3);
  });

  await t.test('4. Block Parsing: parses structured headings into semantic blocks with SVG icons', () => {
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
    assert.ok(roleBlock.iconSvg.includes('<svg'));

    const taskBlock = blocks.find((b) => b.type === 'task');
    assert.ok(taskBlock);
    assert.match(taskBlock.content, /e-commerce cart/i);

    const constraintBlock = blocks.find((b) => b.type === 'constraints');
    assert.ok(constraintBlock);
    assert.match(constraintBlock.content, /Zustand/i);
  });

  await t.test('5. Fallback Parsing: unstructured prompt produces a general block', () => {
    const plainPrompt = 'Write a python script to parse CSV files without headers.';
    const blocks = PromptAssistEngine.parseBlocks(plainPrompt);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, 'general');
    assert.equal(blocks[0].content, plainPrompt);
  });

  await t.test('6. Block Serialization: converts block array back into markdown', () => {
    const blocks = [
      { id: '1', type: 'role', title: 'Rol', content: 'Kıdemli Yazılım Mühendisi' },
      { id: '2', type: 'task', title: 'Görev', content: 'REST API tasarla' }
    ];

    const markdown = PromptAssistEngine.serializeBlocks(blocks);
    assert.match(markdown, /## Rol\nKıdemli Yazılım Mühendisi/);
    assert.match(markdown, /## Görev\nREST API tasarla/);
  });

  await t.test('7. Micro-Refinement: targeted block rewrite with mock chat function', async () => {
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
