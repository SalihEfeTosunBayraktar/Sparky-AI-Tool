'use strict';

/**
 * DatabaseManager — High-Performance Indexed Local Database & FTS Service for Sparky AI.
 * Diyalog geçmişi, projeler ve MCP sunucuları için tam metin aramalı yerel veritabanı.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const FtsSearch = require('./ftsSearch');

class DatabaseManager {
  /**
   * @param {Object} [options]
   * @param {string} [options.dbPath] - Path to JSON/SQLite storage file
   */
  constructor(options = {}) {
    this.dbPath = options.dbPath || (app ? path.join(app.getPath('userData'), 'sparky_db.json') : path.join(process.cwd(), 'sparky_db.json'));
    this.fts = new FtsSearch();
    this.data = {
      version: 1,
      history: [],
      projects: [],
      mcpServers: []
    };
    this.saveTimer = null;
    this.init();
  }

  /** Initializes database and indexes history */
  init() {
    this.loadFromDisk();
    this.rebuildFtsIndex();
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.data = {
            version: parsed.version || 1,
            history: Array.isArray(parsed.history) ? parsed.history : [],
            projects: Array.isArray(parsed.projects) ? parsed.projects : [],
            mcpServers: Array.isArray(parsed.mcpServers) ? parsed.mcpServers : []
          };
        }
      }
    } catch (err) {
      console.warn('[Database] Read warning:', err.message);
    }
  }

  rebuildFtsIndex() {
    this.fts.clear();
    for (const h of this.data.history) {
      const text = `${h.role || ''} ${h.content || ''} ${h.mode || ''} ${h.model || ''}`;
      this.fts.indexDocument(h.id, text, h);
    }
    for (const p of this.data.projects) {
      const text = `${p.name || ''} ${p.notes || ''} ${p.memory?.summary || ''}`;
      this.fts.indexDocument(`proj_${p.id}`, text, { isProject: true, ...p });
    }
  }

  save() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flushSync();
    }, 150);
  }

  flushSync() {
    try {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
      const tmp = `${this.dbPath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.dbPath);
    } catch (err) {
      console.error('[Database] Flush error:', err.message);
    }
  }

  // --- HISTORY CRUD & FTS ---
  insertHistory(entry) {
    if (!entry || !entry.content) return null;
    const record = {
      id: entry.id || `h_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      projectId: entry.projectId || null,
      role: entry.role || 'user',
      content: String(entry.content || ''),
      model: entry.model || '',
      provider: entry.provider || '',
      mode: entry.mode || '',
      tokens: entry.tokens || 0,
      timestamp: entry.timestamp || Date.now()
    };

    this.data.history.unshift(record);
    if (this.data.history.length > 500) {
      const removed = this.data.history.pop();
      if (removed) this.fts.removeDocument(removed.id);
    }

    const text = `${record.role} ${record.content} ${record.mode} ${record.model}`;
    this.fts.indexDocument(record.id, text, record);
    this.save();
    return record;
  }

  getHistory(options = {}) {
    let list = this.data.history;
    if (options.projectId) {
      list = list.filter((h) => h.projectId === options.projectId);
    }
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    return list.slice(offset, offset + limit);
  }

  searchHistory(query, options = {}) {
    if (!query || typeof query !== 'string') return [];
    const results = this.fts.search(query, options);
    if (options.projectId) {
      return results.filter((r) => r.meta && r.meta.projectId === options.projectId);
    }
    return results;
  }

  clearHistory(projectId = null) {
    if (projectId) {
      this.data.history = this.data.history.filter((h) => {
        if (h.projectId === projectId) {
          this.fts.removeDocument(h.id);
          return false;
        }
        return true;
      });
    } else {
      this.data.history.forEach((h) => this.fts.removeDocument(h.id));
      this.data.history = [];
    }
    this.save();
  }

  // --- MCP SERVERS CRUD ---
  getMcpServers() {
    return this.data.mcpServers || [];
  }

  saveMcpServer(server) {
    if (!server || !server.name) return null;
    const sId = server.id || `mcp_${Date.now().toString(36)}`;
    const record = {
      id: sId,
      name: String(server.name || '').trim(),
      command: String(server.command || '').trim(),
      args: Array.isArray(server.args) ? server.args : (server.args ? String(server.args).split(' ') : []),
      env: typeof server.env === 'object' ? server.env : {},
      enabled: server.enabled !== false,
      updatedAt: Date.now()
    };

    const idx = this.data.mcpServers.findIndex((s) => s.id === sId);
    if (idx >= 0) this.data.mcpServers[idx] = record;
    else this.data.mcpServers.push(record);

    this.save();
    return record;
  }

  deleteMcpServer(serverId) {
    const before = this.data.mcpServers.length;
    this.data.mcpServers = this.data.mcpServers.filter((s) => s.id !== serverId);
    if (this.data.mcpServers.length !== before) {
      this.save();
      return true;
    }
    return false;
  }
}

module.exports = DatabaseManager;
