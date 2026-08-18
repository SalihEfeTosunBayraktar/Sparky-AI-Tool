'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const DatabaseManager = require('../src/main/database');
const FtsSearch = require('../src/main/ftsSearch');

const TEST_DB_PATH = path.join(__dirname, 'test_sparky_db.json');

test('=== Running Database & FTS Search Unit Tests ===', async (t) => {
  t.afterEach(() => {
    try { if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH); } catch {}
  });

  await t.test('1. FtsSearch: Tokenizes and ranks BM25 matches', () => {
    const fts = new FtsSearch();
    fts.indexDocument('1', 'Python fast API backend development microservices');
    fts.indexDocument('2', 'React frontend development user interface components');
    fts.indexDocument('3', 'Fullstack Python and React integration deployment');

    const pyRes = fts.search('Python');
    assert.strictEqual(pyRes.length, 2);
    assert.ok(pyRes[0].id === '1' || pyRes[0].id === '3');

    const multiRes = fts.search('React frontend');
    assert.ok(multiRes.length >= 1);
    assert.strictEqual(multiRes[0].id, '2');
  });

  await t.test('2. DatabaseManager: Inserts, retrieves, and full-text searches history', () => {
    const db = new DatabaseManager({ dbPath: TEST_DB_PATH });

    db.insertHistory({
      projectId: 'proj_1',
      role: 'user',
      content: 'How to optimize PostgreSQL queries with index and vacuum',
      model: 'gpt-4o'
    });

    db.insertHistory({
      projectId: 'proj_2',
      role: 'assistant',
      content: 'Here is a Tailwind CSS navbar glassmorphism snippet',
      model: 'claude-3-7-sonnet'
    });

    const all = db.getHistory();
    assert.strictEqual(all.length, 2);

    const searchRes = db.searchHistory('PostgreSQL index');
    assert.strictEqual(searchRes.length, 1);
    assert.strictEqual(searchRes[0].meta.projectId, 'proj_1');
  });

  await t.test('3. DatabaseManager: MCP Servers CRUD', () => {
    const db = new DatabaseManager({ dbPath: TEST_DB_PATH });

    const server = db.saveMcpServer({
      name: 'Local Filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', 'C:/Projects']
    });

    assert.ok(server.id);
    assert.strictEqual(db.getMcpServers().length, 1);

    const deleted = db.deleteMcpServer(server.id);
    assert.strictEqual(deleted, true);
    assert.strictEqual(db.getMcpServers().length, 0);
  });
});
