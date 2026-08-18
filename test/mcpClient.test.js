'use strict';

const test = require('node:test');
const assert = require('node:assert');

const McpClient = require('../src/main/mcpClient');

test('=== Running McpClient Unit Tests ===', async (t) => {
  await t.test('1. Initialization & Config: creates client instance with defaults', () => {
    const client = new McpClient({
      name: 'test-server',
      command: 'node',
      args: ['-e', 'console.log("hello")']
    });

    assert.strictEqual(client.name, 'test-server');
    assert.strictEqual(client.command, 'node');
    assert.deepStrictEqual(client.args, ['-e', 'console.log("hello")']);
    assert.strictEqual(client.connected, false);
  });

  await t.test('2. Protocol Message Parsing: handles JSON-RPC responses and errors', () => {
    const client = new McpClient({ name: 'mock-mcp' });

    let resolvedVal = null;
    let rejectedErr = null;

    client.pendingRequests.set(1, {
      resolve: (v) => { resolvedVal = v; },
      reject: (e) => { rejectedErr = e; }
    });

    client.handleMessage('{"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"read_file"}]}}');
    assert.deepStrictEqual(resolvedVal, { tools: [{ name: 'read_file' }] });

    client.pendingRequests.set(2, {
      resolve: (v) => { resolvedVal = v; },
      reject: (e) => { rejectedErr = e; }
    });

    client.handleMessage('{"jsonrpc":"2.0","id":2,"error":{"message":"Tool not found"}}');
    assert.ok(rejectedErr);
    assert.strictEqual(rejectedErr.message, 'Tool not found');
  });
});
