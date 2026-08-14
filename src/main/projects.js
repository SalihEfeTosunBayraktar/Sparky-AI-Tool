'use strict';

/**
 * Projects Manager / Proje Yönetim Modülü
 * Handles CRUD operations, vision images, and persistent AI episodic memory storage.
 * Kullanıcı projelerini, bağlam notlarını ve yapay zeka hafıza katmanını yönetir.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const FILE_PATH = path.join(app ? app.getPath('userData') : process.cwd(), 'projects.json');
const INITIAL_DATA = { activeProjectId: null, projects: [] };
const MAX_HISTORY_TURNS = 50;

let cache = null;
let saveTimer = null;

function loadData() {
  if (cache) return cache;
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = fs.readFileSync(FILE_PATH, 'utf8');
      cache = JSON.parse(raw);
      if (!cache || typeof cache !== 'object' || !Array.isArray(cache.projects)) {
        throw new Error('Invalid schema structure');
      }
    } else {
      cache = { ...INITIAL_DATA };
    }
  } catch (err) {
    console.warn('[projects] Veri dosyası bozuk veya okunamadı, yedekleniyor:', err.message);
    try {
      if (fs.existsSync(FILE_PATH)) {
        const backupPath = path.join(path.dirname(FILE_PATH), `projects.corrupted.${Date.now()}.bak`);
        fs.copyFileSync(FILE_PATH, backupPath);
      }
    } catch {}
    cache = { ...INITIAL_DATA };
  }
  return cache;
}

function flushToDisk() {
  if (!cache) return;
  try {
    const dir = path.dirname(FILE_PATH);
    fs.mkdirSync(dir, { recursive: true });
    // Cap memory history turns to prevent file bloat
    for (const p of cache.projects) {
      if (p.memory && Array.isArray(p.memory.history) && p.memory.history.length > MAX_HISTORY_TURNS) {
        p.memory.history = p.memory.history.slice(-MAX_HISTORY_TURNS);
      }
    }
    const tempPath = `${FILE_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(cache, null, 2), 'utf8');
    fs.renameSync(tempPath, FILE_PATH);
  } catch (err) {
    console.error('[projects] Kaydetme hatası:', err.message);
  }
}

function saveData() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushToDisk();
  }, 120);
}

function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const projects = {
  saveData,
  saveDataNow() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    flushToDisk();
  },

  list() {
    return loadData().projects;
  },

  get(id) {
    return loadData().projects.find((p) => p.id === id) || null;
  },

  getActiveId() {
    return loadData().activeProjectId;
  },

  getActive() {
    const data = loadData();
    if (!data.activeProjectId) return null;
    return data.projects.find((p) => p.id === data.activeProjectId) || null;
  },

  setActive(id) {
    const data = loadData();
    data.activeProjectId = id || null;
    saveData();
    return data.activeProjectId;
  },

  create(payload) {
    const data = loadData();
    const item = {
      id: genId('proj'),
      name: String(payload.name || 'Yeni Proje').trim(),
      description: String(payload.description || '').trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      texts: Array.isArray(payload.texts) ? payload.texts : [],
      images: Array.isArray(payload.images) ? payload.images : [],
      memory: { summary: '', history: [], lastCompactedAt: 0 }
    };
    data.projects.unshift(item);
    if (!data.activeProjectId) data.activeProjectId = item.id;
    saveData();
    return item;
  },

  update(id, partial) {
    const p = this.get(id);
    if (!p) return null;
    if (typeof partial.name === 'string') p.name = partial.name.trim();
    if (typeof partial.description === 'string') p.description = partial.description.trim();
    if (partial.memory && typeof partial.memory === 'object') {
      p.memory = {
        summary: typeof partial.memory.summary === 'string' ? partial.memory.summary : (p.memory?.summary || ''),
        history: Array.isArray(partial.memory.history) ? partial.memory.history : (p.memory?.history || []),
        lastCompactedAt: partial.memory.lastCompactedAt || p.memory?.lastCompactedAt || 0
      };
    }
    p.updatedAt = Date.now();
    saveData();
    return p;
  },

  updateMemory(id, memoryPayload) {
    const p = this.get(id);
    if (!p) return null;
    if (!p.memory) p.memory = { summary: '', history: [], lastCompactedAt: 0 };
    if (typeof memoryPayload.summary === 'string') {
      p.memory.summary = memoryPayload.summary.trim();
    }
    if (Array.isArray(memoryPayload.history)) {
      p.memory.history = memoryPayload.history;
    }
    p.memory.lastCompactedAt = Date.now();
    p.updatedAt = Date.now();
    saveData();
    return p.memory;
  },

  remove(id) {
    const data = loadData();
    data.projects = data.projects.filter((p) => p.id !== id);
    if (data.activeProjectId === id) {
      data.activeProjectId = data.projects[0] ? data.projects[0].id : null;
    }
    saveData();
    return data.activeProjectId;
  },

  addText(projectId, textItem) {
    const p = this.get(projectId);
    if (!p) return null;
    const entry = {
      id: genId('txt'),
      title: String(textItem.title || 'Not').trim(),
      content: String(textItem.content || '').trim()
    };
    p.texts.push(entry);
    p.updatedAt = Date.now();
    saveData();
    return entry;
  },

  updateText(projectId, textId, partial) {
    const p = this.get(projectId);
    if (!p) return null;
    const t = p.texts.find((x) => x.id === textId);
    if (!t) return null;
    if (typeof partial.title === 'string') t.title = partial.title.trim();
    if (typeof partial.content === 'string') t.content = partial.content.trim();
    p.updatedAt = Date.now();
    saveData();
    return t;
  },

  removeText(projectId, textId) {
    const p = this.get(projectId);
    if (!p) return null;
    p.texts = p.texts.filter((x) => x.id !== textId);
    p.updatedAt = Date.now();
    saveData();
    return true;
  },

  addImage(projectId, imgItem) {
    const p = this.get(projectId);
    if (!p) return null;
    if (p.images.length >= 5) {
      throw new Error('Proje başına maksimum 5 resim eklenebilir.');
    }
    const entry = {
      id: genId('img'),
      name: String(imgItem.name || 'gorsel.png').trim(),
      mimeType: imgItem.mimeType || 'image/png',
      base64: imgItem.base64
    };
    p.images.push(entry);
    p.updatedAt = Date.now();
    saveData();
    return entry;
  },

  removeImage(projectId, imageId) {
    const p = this.get(projectId);
    if (!p) return null;
    p.images = p.images.filter((x) => x.id !== imageId);
    p.updatedAt = Date.now();
    saveData();
    return true;
  }
};

module.exports = projects;
