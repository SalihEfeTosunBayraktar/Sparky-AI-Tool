'use strict';

// API anahtarları Windows DPAPI (safeStorage) ile şifrelenip diskte tutulur.
// Anahtarın açık hâli hiçbir zaman renderer'a gönderilmez; sadece "var mı",
// etiket ve son 4 karakterlik maske paylaşılır.
//
// Sağlayıcı başına BİRDEN FAZLA anahtar saklanır (kuyruk). Aktif anahtar
// `activeId` ile işaretlenir; sıralama listedeki sıradır.
//
// Disk biçimi:
//   { "<provider>": { keys: [ { id, label, enc|plain, hint, encrypted, addedAt } ],
//                     activeId: "k_..." } }
//
// Eski tek-anahtar biçimi ({ enc, hint, encrypted }) yüklenirken otomatik
// olarak bu biçime göç ettirilir — kullanıcı hiçbir anahtarını kaybetmez.

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

let cache = null;
let filePath = null;

function file() {
  if (!filePath) filePath = path.join(app.getPath('userData'), 'secrets.json');
  return filePath;
}

function genId() {
  return `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Eski tek-anahtar kaydını çoklu biçime çevirir. */
function migrateRecord(rec) {
  if (!rec || typeof rec !== 'object') return { keys: [], activeId: null };
  if (Array.isArray(rec.keys)) {
    // Zaten yeni biçim; activeId geçersizse ilk anahtara düş.
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
    try {
      fs.chmodSync(file(), 0o600);
    } catch {}
  } catch (err) {
    console.error('[secrets] yazılamadı:', err.message);
  }
}

function encryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function bucket(provider) {
  const store = load();
  if (!store[provider]) store[provider] = { keys: [], activeId: null };
  return store[provider];
}

function encode(value) {
  const trimmed = String(value || '').trim();
  const hint = trimmed.length > 4 ? trimmed.slice(-4) : '••••';
  if (encryptionAvailable()) {
    return { enc: safeStorage.encryptString(trimmed).toString('base64'), hint, encrypted: true };
  }
  // Şifreleme yoksa yine saklarız ama ayarlar ekranında kullanıcıyı uyarıyoruz.
  return { plain: Buffer.from(trimmed, 'utf8').toString('base64'), hint, encrypted: false };
}

function decode(entry) {
  if (!entry) return '';
  try {
    if (entry.enc) return safeStorage.decryptString(Buffer.from(entry.enc, 'base64'));
    if (entry.plain) return Buffer.from(entry.plain, 'base64').toString('utf8');
  } catch (err) {
    console.error('[secrets] çözülemedi:', err.message);
  }
  return '';
}

/* ------------------------------------------------------------------ */
/* Genel API                                                           */
/* ------------------------------------------------------------------ */

/** Sağlayıcının anahtar listesi — GİZLİ DEĞER İÇERMEZ. */
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

/** Sıralı anahtar kimlikleri — döngü mekanizması bunu kullanır. */
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
  const encoded = encode(trimmed);

  // Aynı anahtarı iki kez eklemeyi engelle (maske + uzunluk yeterli sinyal).
  const duplicate = b.keys.find((k) => k.hint === encoded.hint && decode(k) === trimmed);
  if (duplicate) return { ok: false, error: 'duplicate', id: duplicate.id };

  const entry = {
    id: genId(),
    label: String(label || '').trim() || `Anahtar ${b.keys.length + 1}`,
    addedAt: Date.now(),
    ...encoded
  };
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

/** Belirli bir anahtarın açık değeri (yalnızca ana süreç içinde kullanılır). */
function getValue(provider, id) {
  const b = bucket(provider);
  return decode(b.keys.find((k) => k.id === id));
}

/** Aktif anahtarın açık değeri. Geriye dönük uyumluluk için korunuyor. */
function getKey(provider) {
  const id = getActiveId(provider);
  return id ? getValue(provider, id) : '';
}

/**
 * Eski tek-anahtar çağrısı: mevcut anahtarları temizleyip tek anahtar yazar.
 * Boş değer tüm anahtarları siler.
 */
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
  return { keys: out, encryptionAvailable: encryptionAvailable() };
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
  encryptionAvailable
};
