'use strict';

// API anahtarları Windows DPAPI (safeStorage) ile şifrelenip diskte tutulur.
// Anahtarın açık hâli hiçbir zaman renderer'a gönderilmez; sadece "var mı" ve
// son 4 karakterlik maske paylaşılır.
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

let cache = null;
let filePath = null;

function file() {
  if (!filePath) filePath = path.join(app.getPath('userData'), 'secrets.json');
  return filePath;
}

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    cache = {};
  }
  return cache;
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2), 'utf8');
    // Dosya izinlerini kullanıcıyla sınırla (Windows'ta yok sayılır, zararı da yok).
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

function setKey(provider, value) {
  const store = load();
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    delete store[provider];
    persist();
    return { ok: true, cleared: true };
  }
  const hint = trimmed.length > 4 ? trimmed.slice(-4) : '••••';
  if (encryptionAvailable()) {
    store[provider] = {
      enc: safeStorage.encryptString(trimmed).toString('base64'),
      hint,
      encrypted: true
    };
  } else {
    // Şifreleme yoksa yine de saklarız ama kullanıcıyı ayarlar ekranında uyarıyoruz.
    store[provider] = {
      plain: Buffer.from(trimmed, 'utf8').toString('base64'),
      hint,
      encrypted: false
    };
  }
  persist();
  return { ok: true, encrypted: !!store[provider].encrypted };
}

function getKey(provider) {
  const rec = load()[provider];
  if (!rec) return '';
  try {
    if (rec.enc) return safeStorage.decryptString(Buffer.from(rec.enc, 'base64'));
    if (rec.plain) return Buffer.from(rec.plain, 'base64').toString('utf8');
  } catch (err) {
    console.error('[secrets] çözülemedi:', provider, err.message);
  }
  return '';
}

function status() {
  const store = load();
  const out = {};
  for (const [provider, rec] of Object.entries(store)) {
    out[provider] = { present: true, hint: rec.hint || '••••', encrypted: !!rec.encrypted };
  }
  return { keys: out, encryptionAvailable: encryptionAvailable() };
}

module.exports = { setKey, getKey, status, encryptionAvailable };
