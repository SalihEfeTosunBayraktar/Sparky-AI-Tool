'use strict';

/**
 * Secrets Manager / Güvenli Anahtar Deposu
 * Manages encrypted multi-key rotation pools per AI provider via KeyVault.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const KeyVault = require('./keyVault');

let cache = null;
let filePath = null;

function file() {
  if (!filePath) filePath = path.join(app ? app.getPath('userData') : process.cwd(), 'secrets.json');
  return filePath;
}

function genId() {
  return `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function migrateRecord(rec) {
  if (!rec || typeof rec !== 'object') return { keys: [], activeId: null };
  if (Array.isArray(rec.keys)) {
    const ids = rec.keys.map((k) => k.id);
    const activeId = ids.includes(rec.activeId) ? rec.activeId : ids[0] || null;
    return { keys: rec.keys, activeId };
  }
  if (rec.enc || rec.plain) {
    const migrated = {
      id: genId(),
      label: 'Anahtar 1',
      hint: rec.hint || '••••',
      encrypted: !!rec.encrypted,
      addedAt: Date.now()
    };
    if (rec.enc) migrated.enc = rec.enc;
    if (rec.plain) migrated.plain = rec.plain;
    return { keys: [migrated], activeId: migrated.id };
  }
  return { keys: [], activeId: null };
}

function load() {
  if (cache) return cache;
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    raw = {};
  }
  cache = {};
  let migrated = false;
  for (const [provider, rec] of Object.entries(raw)) {
    const next = migrateRecord(rec);
    if (!Array.isArray(rec?.keys)) migrated = true;
    cache[provider] = next;
  }
  if (migrated) persist();
  return cache;
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2), 'utf8');
    try { fs.chmodSync(file(), 0o600); } catch {}
  } catch (err) {
    console.error('[secrets] yazılamadı:', err.message);
  }
}

function bucket(provider) {
  const store = load();
  if (!store[provider]) store[provider] = { keys: [], activeId: null };
  return store[provider];
}

function decodeEntry(entry) {
  if (!entry) return '';
  const cipher = entry.enc || entry.plain || '';
  return KeyVault.decrypt(cipher, !!entry.encrypted || !!entry.enc);
}

function list(provider) {
  const b = bucket(provider);
  return b.keys.map((k) => ({
    id: k.id,
    label: k.label || '',
    hint: k.hint || '••••',
    encrypted: !!k.encrypted,
    addedAt: k.addedAt || 0,
    active: k.id === b.activeId
  }));
}

function ids(provider) {
  return bucket(provider).keys.map((k) => k.id);
}

function count(provider) {
  return bucket(provider).keys.length;
}

function add(provider, value, label) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return { ok: false, error: 'empty' };

  const b = bucket(provider);
  const { cipher, isEncrypted } = KeyVault.encrypt(trimmed);
  const hint = KeyVault.maskKey(trimmed);

  const duplicate = b.keys.find((k) => k.hint === hint && decodeEntry(k) === trimmed);
  if (duplicate) return { ok: false, error: 'duplicate', id: duplicate.id };

  const entry = {
    id: genId(),
    label: String(label || '').trim() || `Anahtar ${b.keys.length + 1}`,
    addedAt: Date.now(),
    hint,
    encrypted: isEncrypted
  };
  if (isEncrypted) entry.enc = cipher;
  else entry.plain = cipher;

  b.keys.push(entry);
  if (!b.activeId) b.activeId = entry.id;
  persist();
  return { ok: true, id: entry.id, encrypted: entry.encrypted };
}

function remove(provider, id) {
  const b = bucket(provider);
  const before = b.keys.length;
  b.keys = b.keys.filter((k) => k.id !== id);
  if (b.keys.length === before) return { ok: false, error: 'not-found' };
  if (b.activeId === id) b.activeId = b.keys[0] ? b.keys[0].id : null;
  persist();
  return { ok: true, activeId: b.activeId };
}

function rename(provider, id, label) {
  const b = bucket(provider);
  const k = b.keys.find((x) => x.id === id);
  if (!k) return { ok: false, error: 'not-found' };
  k.label = String(label || '').trim() || k.label;
  persist();
  return { ok: true };
}

function setActive(provider, id) {
  const b = bucket(provider);
  if (!b.keys.some((k) => k.id === id)) return { ok: false, error: 'not-found' };
  b.activeId = id;
  persist();
  return { ok: true, activeId: id };
}

function getActiveId(provider) {
  const b = bucket(provider);
  if (b.activeId && b.keys.some((k) => k.id === b.activeId)) return b.activeId;
  return b.keys[0] ? b.keys[0].id : null;
}

function getValue(provider, id) {
  const b = bucket(provider);
  return decodeEntry(b.keys.find((k) => k.id === id));
}

function getKey(provider) {
  const id = getActiveId(provider);
  return id ? getValue(provider, id) : '';
}

function setKey(provider, value) {
  const trimmed = String(value || '').trim();
  const store = load();
  if (!trimmed) {
    delete store[provider];
    persist();
    return { ok: true, cleared: true };
  }
  store[provider] = { keys: [], activeId: null };
  return add(provider, trimmed);
}

function status() {
  const store = load();
  const out = {};
  for (const provider of Object.keys(store)) {
    const keys = list(provider);
    if (!keys.length) continue;
    const active = keys.find((k) => k.active) || keys[0];
    out[provider] = {
      present: true,
      count: keys.length,
      activeId: active ? active.id : null,
      hint: active ? active.hint : '••••',
      encrypted: keys.every((k) => k.encrypted),
      keys
    };
  }
  return { keys: out, encryptionAvailable: KeyVault.isAvailable() };
}

module.exports = {
  list,
  ids,
  count,
  add,
  remove,
  rename,
  setActive,
  getActiveId,
  getValue,
  getKey,
  setKey,
  status,
  encryptionAvailable: () => KeyVault.isAvailable()
};
