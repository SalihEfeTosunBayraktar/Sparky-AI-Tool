'use strict';

// Ayarlar ve geçmiş için basit JSON deposu. userData altında tutulur.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  provider: 'ollama',
  model: '',
  endpoints: {
    ollama: 'http://127.0.0.1:11434',
    lmstudio: 'http://127.0.0.1:1234/v1',
    openai: 'https://api.openai.com/v1',
    anthropic: '',
    gemini: 'https://generativelanguage.googleapis.com/v1beta',
    custom: ''
  },
  // Sağlayıcı başına son seçilen model — sağlayıcı değişince geri yüklenir.
  modelByProvider: {},
  style: 'detailed',
  outputLanguage: 'auto',
  appLanguage: 'en',
  theme: 'dark',
  accent: 'sunset',
  orbShape: 'circle',
  appMode: 'normal-chat',
  deepMode: false,
  autoMode: false,
  // Model, belirsiz noktalar için önce soru sorsun mu? (ek bir tur maliyeti var)
  clarify: false,
  // Sonuç geldikten sonra iyileştirme önerileri üretilsin mi?
  suggestions: true,
  temperature: 0.4,
  // max_tokens bir tavandır; model erken bitirirse maliyet doğurmaz. Düşük
  // tutmak uzun biçimlerde promptun yarıda kesilmesine yol açıyordu.
  maxTokens: 4096,
  effort: 'medium',
  autoCopy: false,
  alwaysOnTop: true,
  opacity: 1,
  launchAtStartup: false,
  enableNotifications: true,
  enableSound: true,
  notifyOnlyWhenBackground: true,
  assistWeights: {},
  // Prompt Asistanı (varyasyonlar & blok düzenleyici) aktif mi?
  enablePromptAssist: true,
  // Otomatik hafıza sıkıştırma açık mı?
  autoCompactEnabled: true,
  // Hafıza kapasitesinin % kaçı aşılınca oto-sıkıştırma tetiklensin (varsayılan: %75)
  autoCompactThreshold: 75,
  // Kullanıcının eklediği özel sağlayıcılar — her biri { id, label, kind, needsKey, endpoint, endpointHint, keyHint }
  customProviders: [],
  // Küredeki bilgi baloncuğu kuyruğunun önem eşiği. 'minimal' yalnızca
  // yüksek/kritik olayları (sonuç, hata, anahtar döngüsü) gösterir;
  // 'normal' aşama bilgilerini de ekler; 'all' düşük öncelikli tikleri
  // (Hazırlanıyor/Düşünüyor gibi) bile kuyruğa alır. Masaüstü bildirimi
  // (enableNotifications) ve bu ikisi bağımsız — biri OS bildirimi, biri
  // kürenin kendi baloncuğu.
  notifyLevel: 'normal',
  historyLimit: 200,
  shortcuts: {
    toggle: 'Control+Shift+Space',
    fromClipboard: 'Control+Alt+P',
    copyLast: 'Control+Alt+C'
  },
  orbBounds: null,
  panelBounds: null
};

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (isPlainObject(v) && isPlainObject(out[k])) out[k] = deepMerge(out[k], v);
    else out[k] = v;
  }
  return out;
}

class JsonFile {
  constructor(name, fallback) {
    this.file = path.join(app.getPath('userData'), name);
    this.fallback = fallback;
    this.data = fallback;
    this._timer = null;
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = isPlainObject(this.fallback) ? deepMerge(this.fallback, parsed) : parsed;
    } catch {
      this.data = this.fallback;
    }
    return this.data;
  }

  // Yazmayı biraz geciktir; hızlı ardışık güncellemelerde disk trafiğini azaltır.
  save() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 150);
  }

  flush() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('[store] yazılamadı:', this.file, err.message);
    }
  }
}

const settingsFile = new JsonFile('settings.json', DEFAULTS);
const historyFile = new JsonFile('history.json', { items: [] });

const settings = {
  all() {
    return settingsFile.data;
  },
  get(key) {
    return settingsFile.data[key];
  },
  patch(partial) {
    settingsFile.data = deepMerge(settingsFile.data, partial);
    settingsFile.save();
    return settingsFile.data;
  },
  reset() {
    settingsFile.data = JSON.parse(JSON.stringify(DEFAULTS));
    settingsFile.save();
    return settingsFile.data;
  },
  flush: () => settingsFile.flush(),
  path: settingsFile.file
};

const history = {
  list() {
    return historyFile.data.items;
  },
  add(entry) {
    const item = { id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, ts: Date.now(), favorite: false, ...entry };
    historyFile.data.items.unshift(item);
    const limit = Math.max(10, Number(settings.get('historyLimit')) || 200);
    // Favoriler limit dolduğunda korunur.
    if (historyFile.data.items.length > limit) {
      const kept = [];
      let budget = limit;
      for (const it of historyFile.data.items) {
        if (budget > 0 || it.favorite) {
          kept.push(it);
          if (!it.favorite) budget--;
        }
      }
      historyFile.data.items = kept;
    }
    historyFile.save();
    return item;
  },
  update(id, partial) {
    const it = historyFile.data.items.find((x) => x.id === id);
    if (!it) return null;
    Object.assign(it, partial);
    historyFile.save();
    return it;
  },
  remove(id) {
    historyFile.data.items = historyFile.data.items.filter((x) => x.id !== id);
    historyFile.save();
  },
  clear() {
    historyFile.data.items = historyFile.data.items.filter((x) => x.favorite);
    historyFile.save();
  },
  flush: () => historyFile.flush(),
  path: historyFile.file
};

module.exports = { settings, history, DEFAULTS };
