'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ProjectMemory = require('../src/main/projectMemory');

test('=== Running ProjectMemory Unit Tests ===', async (t) => {
  let savedCount = 0;
  const mockProjectsStore = {
    saveData() {
      savedCount += 1;
    }
  };

  const memoryManager = new ProjectMemory({
    projectsStore: mockProjectsStore,
    threshold: 0.80,
    protectedTurns: 2 // keep 1 user-assistant pair
  });

  await t.test('1. Stateless Mode: returns active: false and bypasses memory when project is null', () => {
    const metrics = memoryManager.getMetrics(null, 32768, 'Hello world');
    assert.equal(metrics.active, false);
    assert.equal(metrics.projectName, null);
    assert.equal(metrics.summaryTokens, 0);
    assert.equal(metrics.historyTokens, 0);
    assert.ok(metrics.inputTokens > 0);
  });

  await t.test('2. Project Initialization: getMemory sets up clean structure', () => {
    const project = { id: 'p1', name: 'App Project' };
    const mem = memoryManager.getMemory(project);
    assert.deepEqual(mem, { summary: '', history: [], lastCompactedAt: 0 });
  });

  await t.test('3. Append Turn: records user and assistant messages with estimated tokens', () => {
    const project = { id: 'p1', name: 'App Project' };
    savedCount = 0;

    memoryManager.appendTurn(project, 'Build login page', 'Here is the login code: ...');
    assert.equal(project.memory.history.length, 2);
    assert.equal(project.memory.history[0].role, 'user');
    assert.equal(project.memory.history[0].content, 'Build login page');
    assert.equal(project.memory.history[1].role, 'assistant');
    assert.ok(project.memory.history[0].tokens > 0);
    assert.ok(project.memory.history[1].tokens > 0);
    assert.equal(savedCount, 1);
  });

  await t.test('4. Project Isolation: Memory between Project A and Project B is completely separated', () => {
    const projectA = { id: 'projA', name: 'Project A' };
    const projectB = { id: 'projB', name: 'Project B' };

    memoryManager.appendTurn(projectA, 'React Native question', 'React Native answer');
    memoryManager.appendTurn(projectB, 'Python Django question', 'Python Django answer');

    assert.equal(projectA.memory.history.length, 2);
    assert.equal(projectB.memory.history.length, 2);
    assert.equal(projectA.memory.history[0].content, 'React Native question');
    assert.equal(projectB.memory.history[0].content, 'Python Django question');
  });

  await t.test('5. Metrics Calculation: accurately sums project notes, memory summary, history, and input', () => {
    const project = {
      id: 'p1',
      name: 'Test App',
      texts: [{ title: 'Spec', content: 'Use dark theme with orange primary color' }],
      memory: {
        summary: '### SUMMARY\n- Built login module',
        history: [
          { role: 'user', content: 'Turn 1', tokens: 10 },
          { role: 'assistant', content: 'Turn 1 reply', tokens: 20 }
        ],
        lastCompactedAt: 0
      }
    };

    const metrics = memoryManager.getMetrics(project, 10000, 'Test input');
    assert.equal(metrics.active, true);
    assert.equal(metrics.projectName, 'Test App');
    assert.ok(metrics.projectNotesTokens > 0);
    assert.ok(metrics.summaryTokens > 0);
    assert.equal(metrics.historyTokens, 30);
    assert.ok(metrics.ratio > 0);
  });

  await t.test('6. Autonomous Compaction: summarizes older messages and preserves recent protected turns', async () => {
    const project = {
      id: 'p1',
      name: 'Test App',
      memory: {
        summary: '',
        history: [
          { role: 'user', content: 'Old question 1' },
          { role: 'assistant', content: 'Old answer 1' },
          { role: 'user', content: 'Old question 2' },
          { role: 'assistant', content: 'Old answer 2' },
          { role: 'user', content: 'Recent question' },
          { role: 'assistant', content: 'Recent answer' }
        ],
        lastCompactedAt: 0
      }
    };

    // Mock LLM chat function returning consolidated summary
    const mockChat = async ({ system, messages }) => {
      assert.ok(system.includes('context state compression engine'));
      assert.ok(messages[0].content.includes('Old question 1'));
      return { text: '### CORE GOALS\n- Compacted goals from old turns' };
    };

    const compacted = await memoryManager.compact(project, mockChat);
    assert.equal(compacted, true);
    assert.equal(project.memory.summary, '### CORE GOALS\n- Compacted goals from old turns');
    // Kept protectedTurns = 2 recent messages
    assert.equal(project.memory.history.length, 2);
    assert.equal(project.memory.history[0].content, 'Recent question');
    assert.equal(project.memory.history[1].content, 'Recent answer');
    assert.ok(project.memory.lastCompactedAt > 0);
  });

  await t.test('7. Clear Memory: resets summary and history', () => {
    const project = {
      id: 'p1',
      name: 'Test App',
      memory: {
        summary: 'Some summary',
        history: [{ role: 'user', content: 'q' }],
        lastCompactedAt: 100
      }
    };

    memoryManager.clearMemory(project);
    assert.equal(project.memory.summary, '');
    assert.equal(project.memory.history.length, 0);
    assert.equal(project.memory.lastCompactedAt, 0);
  });
});
