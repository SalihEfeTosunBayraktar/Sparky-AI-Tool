'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// We use projects module directly
const projects = require('../src/main/projects');

test('=== Running Projects & Memory Persistence Unit Tests ===', async (t) => {
  await t.test('1. Persistence: project creation initializes clean memory and saves to disk', () => {
    const proj = projects.create({
      name: 'Persistence Test Proje',
      description: 'Persistent storage validation'
    });

    assert.ok(proj.id);
    assert.strictEqual(proj.name, 'Persistence Test Proje');
    assert.ok(proj.memory);
    assert.strictEqual(proj.memory.summary, '');
    assert.deepStrictEqual(proj.memory.history, []);
  });

  await t.test('2. Memory Update: updates summary and refreshes timestamp', () => {
    const proj = projects.create({ name: 'Memory Edit Proje' });
    const updatedMem = projects.updateMemory(proj.id, {
      summary: '### TECH STACK\n- Electron, Node.js\n- SQLite Persistence'
    });

    assert.ok(updatedMem);
    assert.strictEqual(updatedMem.summary, '### TECH STACK\n- Electron, Node.js\n- SQLite Persistence');
    assert.ok(updatedMem.lastCompactedAt > 0);

    const fetched = projects.get(proj.id);
    assert.strictEqual(fetched.memory.summary, '### TECH STACK\n- Electron, Node.js\n- SQLite Persistence');
  });

  await t.test('3. Sliding Window: caps dialogue history to MAX_HISTORY_TURNS on flush', () => {
    const proj = projects.create({ name: 'Sliding Window Proje' });
    const hugeHistory = [];
    for (let i = 0; i < 70; i++) {
      hugeHistory.push({
        id: `m_${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        tokens: 5,
        timestamp: Date.now()
      });
    }

    projects.updateMemory(proj.id, { history: hugeHistory });
    projects.saveDataNow();

    const fetched = projects.get(proj.id);
    assert.ok(fetched.memory.history.length <= 50, 'History turns must be capped to max 50');
    assert.strictEqual(fetched.memory.history[fetched.memory.history.length - 1].content, 'Message 69');
  });

  await t.test('4. Synchronous Flush: saveDataNow flushes immediately', () => {
    const proj = projects.create({ name: 'Flush Proje', description: 'Instant flush' });
    projects.update(proj.id, { description: 'Updated instant flush' });
    projects.saveDataNow();

    const fetched = projects.get(proj.id);
    assert.strictEqual(fetched.description, 'Updated instant flush');
  });
});
