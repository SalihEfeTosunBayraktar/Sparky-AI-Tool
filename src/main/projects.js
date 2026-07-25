'use strict';

/**
 * Projects Manager / Proje Yönetim Modülü
 * Handles CRUD operations for user projects, text context notes, and vision images.
 * Kullanıcı projelerini, metin bağlamlarını ve görsellerini yönetir.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const FILE_PATH = path.join(app.getPath('userData'), 'projects.json');
const INITIAL_DATA = { activeProjectId: null, projects: [] };

let cache = null;
let saveTimer = null;

function loadData() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(FILE_PATH, 'utf8');
    cache = JSON.parse(raw);
    if (!Array.isArray(cache.projects)) cache.projects = [];
  } catch {
    cache = { ...INITIAL_DATA };
  }
  return cache;
}

function saveData() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
      fs.writeFileSync(FILE_PATH, JSON.stringify(cache, null, 2), 'utf8');
    } catch (err) {
      console.error('[projects] save failed:', err.message);
    }
  }, 100);
}

function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const projects = {
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
      images: Array.isArray(payload.images) ? payload.images : []
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
    p.updatedAt = Date.now();
    saveData();
    return p;
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
