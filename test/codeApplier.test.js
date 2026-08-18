'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const CodeApplier = require('../src/main/codeApplier');

const TEMP_DIR = path.join(__dirname, 'temp_code_applier');

test('=== Running CodeApplier Unit Tests ===', async (t) => {
  t.beforeEach(() => {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  });

  t.afterEach(() => {
    try { fs.rmSync(TEMP_DIR, { recursive: true, force: true }); } catch {}
  });

  await t.test('1. Code Block Parsing: extracts file path from code block comments', () => {
    const md = `
Here is the updated configuration:
\`\`\`javascript
// path: src/config.js
module.exports = { port: 8080 };
\`\`\`

And the test file:
\`\`\`python file="tests/test_api.py"
def test_ok():
    assert True
\`\`\`
`;
    const blocks = CodeApplier.extractCodeBlocks(md);
    assert.strictEqual(blocks.length, 2);
    assert.strictEqual(blocks[0].filePath, 'src/config.js');
    assert.strictEqual(blocks[0].language, 'javascript');
    assert.strictEqual(blocks[1].filePath, 'tests/test_api.py');
    assert.strictEqual(blocks[1].language, 'python');
  });

  await t.test('2. Diff Generation: accurately tracks additions and deletions', () => {
    const orig = 'const x = 1;\nconst y = 2;';
    const updated = 'const x = 1;\nconst y = 3;\nconst z = 4;';

    const diff = CodeApplier.generateDiff(orig, updated);
    assert.ok(diff.additions >= 2);
    assert.ok(diff.deletions >= 1);
    assert.ok(diff.diffText.includes('+ const z = 4;'));
  });

  await t.test('3. File Application & Backup: creates new file and backups existing file', () => {
    const filePath = 'math.js';
    const initialContent = 'function add(a, b) { return a + b; }';
    const updatedContent = 'function add(a, b) { return Number(a) + Number(b); }';

    // 1st apply: creates new file
    const res1 = CodeApplier.applyToFile(TEMP_DIR, filePath, initialContent);
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.backupPath, null);
    assert.strictEqual(fs.readFileSync(res1.fullPath, 'utf8'), initialContent);

    // 2nd apply: creates backup and modifies file
    const res2 = CodeApplier.applyToFile(TEMP_DIR, filePath, updatedContent);
    assert.strictEqual(res2.success, true);
    assert.ok(res2.backupPath);
    assert.strictEqual(fs.readFileSync(res2.backupPath, 'utf8'), initialContent);
    assert.strictEqual(fs.readFileSync(res2.fullPath, 'utf8'), updatedContent);
  });
});
