'use strict';

/**
 * McpClient — Model Context Protocol (MCP) JSON-RPC Stdio Client for Sparky AI.
 * Model Context Protocol sunucularına bağlanıp araç ve bağlam çeken istemci.
 */

const { spawn } = require('child_process');
const readline = require('readline');

class McpClient {
  /**
   * @param {Object} config
   * @param {string} config.name
   * @param {string} config.command
   * @param {string[]} [config.args]
   * @param {Object} [config.env]
   */
  constructor(config = {}) {
    this.name = config.name || 'mcp-server';
    this.command = config.command;
    this.args = config.args || [];
    this.env = config.env || {};
    this.process = null;
    this.reqId = 1;
    this.pendingRequests = new Map();
    this.tools = [];
    this.resources = [];
    this.connected = false;
  }

  /** Starts the MCP server process and initializes JSON-RPC connection */
  async connect() {
    if (!this.command) throw new Error(`[MCP] Missing command for server "${this.name}"`);

    const env = { ...process.env, ...this.env };
    this.process = spawn(this.command, this.args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });

    const rl = readline.createInterface({ input: this.process.stdout });
    rl.on('line', (line) => this.handleMessage(line));

    this.process.stderr.on('data', (d) => {
      console.warn(`[MCP:${this.name}:stderr]`, d.toString().trim());
    });

    this.process.on('close', (code) => {
      this.connected = false;
      console.log(`[MCP:${this.name}] Process closed with code ${code}`);
    });

    // Initialize MCP Session
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {}, resources: {} },
      clientInfo: { name: 'Sparky-AI', version: '0.3.0' }
    });

    this.connected = true;
    await this.refreshCapabilities();
    return { name: this.name, tools: this.tools, resources: this.resources };
  }

  handleMessage(line) {
    if (!line || !line.trim()) return;
    try {
      const msg = JSON.parse(line.trim());
      if (msg.id && this.pendingRequests.has(msg.id)) {
        const { resolve, reject } = this.pendingRequests.get(msg.id);
        this.pendingRequests.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || 'MCP RPC Error'));
        else resolve(msg.result);
      }
    } catch {
      // Non-JSON logging
    }
  }

  sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin.writable) {
        return reject(new Error(`[MCP:${this.name}] Server process not running`));
      }
      const id = this.reqId++;
      this.pendingRequests.set(id, { resolve, reject });

      const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      this.process.stdin.write(payload);

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`[MCP:${this.name}] Request "${method}" timed out`));
        }
      }, 10000);
    });
  }

  async refreshCapabilities() {
    try {
      const toolsRes = await this.sendRequest('tools/list', {});
      this.tools = toolsRes.tools || [];
    } catch {
      this.tools = [];
    }

    try {
      const resRes = await this.sendRequest('resources/list', {});
      this.resources = resRes.resources || [];
    } catch {
      this.resources = [];
    }
  }

  async callTool(name, args = {}) {
    return this.sendRequest('tools/call', { name, arguments: args });
  }

  disconnect() {
    if (this.process) {
      try { this.process.kill(); } catch {}
      this.process = null;
    }
    this.connected = false;
  }
}

module.exports = McpClient;
