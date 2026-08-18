'use strict';

/**
 * Modes Manager / Çalışma Modları Yönetim Modülü
 * Projeler (projects.js) ile aynı CRUD desenini izler: JSON dosya destekli
 * depo, debounce'lu kayıt.
 *
 * Veri modeli (her mod, yerleşik olsun olmasın, aynı şemayı paylaşır):
 *   { id, builtin, labelKey, name, description, basePreset,
 *     mainRule, additionalRules: string[], useStyleGuide, createdAt, updatedAt }
 *
 * - `mainRule`         Ana sistem talimatı — HER ZAMAN tamamen düzenlenebilir
 *                       (yerleşik modlar dahil). {{LANG}} ve {{PROJECT}}
 *                       değişkenlerini içerebilir (bkz. VARIABLES).
 * - `additionalRules`  Tek tek eklenip silinebilen, sıralanabilen ek kural
 *                       maddeleri listesi.
 * - `useStyleGuide`    true ise, üretim anında seçili Çıktı biçimi (style)
 *                       rehberi mainRule'un altına otomatik eklenir (Prompt
 *                       Hazırlayıcı'nın çatısı budur).
 * - `basePreset`       Bu modun hangi ön modelden (bkz. PRESETS) türediği —
 *                       "Varsayılana Sıfırla" bu şablona döner.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { CATEGORIES, PRESETS, getPreset } = require('./agentPresets');

const FILE_PATH = path.join(app.getPath('userData'), 'modes.json');

// Mod metinlerinde ({{KEY}} biçiminde) yazılıp kullanılabilen değişkenler
const VARIABLES = [
  { key: 'LANG', type: 'string', descriptionKey: 'modes.varLangDesc' },
  { key: 'PROJECT', type: 'string', descriptionKey: 'modes.varProjectDesc' },
  { key: 'PROJECT_DESC', type: 'string', descriptionKey: 'modes.varProjectDescDesc' },
  { key: 'PROJECT_NOTES', type: 'string', descriptionKey: 'modes.varProjectNotesDesc' },
  { key: 'INPUT', type: 'string', descriptionKey: 'modes.varInputDesc' },
  { key: 'ANSWERS', type: 'string', descriptionKey: 'modes.varAnswersDesc' },
  { key: 'DATE', type: 'string', descriptionKey: 'modes.varDateDesc' },
  { key: 'TIME', type: 'string', descriptionKey: 'modes.varTimeDesc' },
  { key: 'YEAR', type: 'string', descriptionKey: 'modes.varYearDesc' },
  { key: 'MONTH', type: 'string', descriptionKey: 'modes.varMonthDesc' },
  { key: 'DAY', type: 'string', descriptionKey: 'modes.varDayDesc' },
  { key: 'WEEKDAY', type: 'string', descriptionKey: 'modes.varWeekdayDesc' },
  { key: 'STYLE', type: 'string', descriptionKey: 'modes.varStyleDesc' },
  { key: 'STYLE_HINT', type: 'string', descriptionKey: 'modes.varStyleHintDesc' },
  { key: 'MODEL', type: 'string', descriptionKey: 'modes.varModelDesc' },
  { key: 'PROVIDER', type: 'string', descriptionKey: 'modes.varProviderDesc' },
  { key: 'TEMPERATURE', type: 'string', descriptionKey: 'modes.varTemperatureDesc' },
  { key: 'EFFORT', type: 'string', descriptionKey: 'modes.varEffortDesc' },
  { key: 'DEEP_MODE', type: 'string', descriptionKey: 'modes.varDeepModeDesc' },
  { key: 'GENERATION_MODE', type: 'string', descriptionKey: 'modes.varGenerationModeDesc' }
];

const BUILTIN_SEEDS = [
  {
    id: 'normal-chat',
    builtin: true,
    category: 'core',
    labelKey: 'modes.normalChat',
    name: 'Normal Sohbet',
    description: '',
    basePreset: 'plain'
  },
  {
    id: 'prompt-preparer',
    builtin: true,
    category: 'core',
    labelKey: 'modes.promptPreparer',
    name: 'Prompt Hazırlayıcı',
    description: '',
    basePreset: 'technical'
  }
];

function seededFields(basePreset) {
  const preset = getPreset(basePreset);
  return {
    basePreset: preset.id,
    mainRule: preset.mainRule,
    additionalRules: [...preset.additionalRules],
    useStyleGuide: preset.useStyleGuide
  };
}

const INITIAL_DATA = {
  activeModeId: 'normal-chat',
  modes: BUILTIN_SEEDS.map((m) => ({
    ...m,
    ...seededFields(m.basePreset),
    createdAt: Date.now(),
    updatedAt: Date.now()
  }))
};

let cache = null;
let saveTimer = null;

// Önceki (kind/systemPrompt/extraRules tabanlı) şemadan gelen kayıtları
// yeni şemaya çevirir — kullanıcının diskteki eski modes.json'u kaybolmasın.
function migrateLegacy(m) {
  if (typeof m.mainRule === 'string' && Array.isArray(m.additionalRules)) return m;
  const wasPrompter = m.kind === 'prompter';
  m.basePreset = m.basePreset || (m.builtin ? (m.id === 'normal-chat' ? 'plain' : 'technical') : wasPrompter ? 'technical' : 'plain');
  m.mainRule = typeof m.systemPrompt === 'string' && m.systemPrompt.trim() ? m.systemPrompt : wasPrompter ? BASE_RULES : NORMAL_CHAT_BASE_RULES;
  m.additionalRules = typeof m.extraRules === 'string' && m.extraRules.trim() ? [m.extraRules.trim()] : [];
  m.useStyleGuide = wasPrompter;
  delete m.kind;
  delete m.systemPrompt;
  delete m.extraRules;
  return m;
}

function loadData() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(FILE_PATH, 'utf8');
    cache = JSON.parse(raw);
    if (!Array.isArray(cache.modes)) cache.modes = [];
  } catch {
    cache = { ...INITIAL_DATA };
  }
  cache.modes = cache.modes.map(migrateLegacy);
  // Yerleşik modlardan biri (eski sürümden geliyorsa ya da dosya bozulduysa)
  // eksikse, kaybolmasınlar diye yeniden eklenir.
  for (const seed of BUILTIN_SEEDS) {
    if (!cache.modes.some((m) => m.id === seed.id)) {
      cache.modes.push({ ...seed, ...seededFields(seed.basePreset), createdAt: Date.now(), updatedAt: Date.now() });
    }
  }
  if (!cache.activeModeId || !cache.modes.some((m) => m.id === cache.activeModeId)) {
    cache.activeModeId = 'normal-chat';
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
      console.error('[modes] save failed:', err.message);
    }
  }, 100);
}

function genId() {
  return `mode_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeRules(list) {
  if (!Array.isArray(list)) return [];
  return list.map((r) => String(r || '').trim()).filter(Boolean).slice(0, 30);
}

function nameTaken(data, name, excludeId) {
  const norm = String(name || '').trim().toLowerCase();
  return data.modes.some((m) => m.id !== excludeId && m.name.trim().toLowerCase() === norm);
}

const modes = {
  presets() {
    return PRESETS.map((p) => ({
      id: p.id,
      category: p.category || 'core',
      labelKey: p.labelKey,
      descriptionKey: p.descriptionKey
    }));
  },

  categories() {
    return CATEGORIES;
  },

  variables() {
    return VARIABLES;
  },

  list() {
    const data = loadData();
    return data.modes.map((m) => {
      const preset = getPreset(m.basePreset);
      return {
        ...m,
        category: m.category || (preset ? preset.category : 'core') || 'core'
      };
    });
  },

  get(id) {
    return loadData().modes.find((m) => m.id === id) || null;
  },

  getActiveId() {
    return loadData().activeModeId;
  },

  getActive() {
    const data = loadData();
    return data.modes.find((m) => m.id === data.activeModeId) || null;
  },

  setActive(id) {
    const data = loadData();
    if (data.modes.some((m) => m.id === id)) {
      data.activeModeId = id;
      saveData();
    }
    return data.activeModeId;
  },

  create(payload) {
    const data = loadData();
    const name = String(payload.name || 'Yeni Mod').trim();
    if (nameTaken(data, name, null)) {
      throw new Error(`"${name}" adında bir mod zaten var. Lütfen farklı bir ad seçin.`);
    }
    const item = {
      id: genId(),
      builtin: false,
      labelKey: null,
      name,
      description: String(payload.description || '').trim(),
      ...seededFields(payload.basePreset),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    data.modes.push(item);
    saveData();
    return item;
  },

  update(id, partial) {
    const m = this.get(id);
    if (!m) return null;
    const data = loadData();
    if (typeof partial.name === 'string' && !m.builtin) {
      const name = partial.name.trim();
      if (name && nameTaken(data, name, id)) {
        throw new Error(`"${name}" adında bir mod zaten var. Lütfen farklı bir ad seçin.`);
      }
      if (name) m.name = name;
    }
    if (typeof partial.description === 'string') m.description = partial.description.trim();
    if (typeof partial.mainRule === 'string') m.mainRule = partial.mainRule;
    if (Array.isArray(partial.additionalRules)) m.additionalRules = normalizeRules(partial.additionalRules);
    if (typeof partial.useStyleGuide === 'boolean') m.useStyleGuide = partial.useStyleGuide;
    m.updatedAt = Date.now();
    saveData();
    return m;
  },

  remove(id) {
    const data = loadData();
    const target = data.modes.find((m) => m.id === id);
    if (!target || target.builtin) return data.activeModeId;
    data.modes = data.modes.filter((m) => m.id !== id);
    if (data.activeModeId === id) data.activeModeId = 'normal-chat';
    saveData();
    return data.activeModeId;
  },

  // Hem yerleşik hem özel modlar için çalışır — modun türetildiği ön moda
  // (basePreset) döner. Boş ana kural / tüm ek kuralların silinmesi gibi
  // durumlarda kullanıcıya sunulan "Varsayılana Sıfırla" seçeneğinin karşılığı.
  resetToDefault(id) {
    const m = this.get(id);
    if (!m) return null;
    const seeded = seededFields(m.basePreset);
    m.mainRule = seeded.mainRule;
    m.additionalRules = seeded.additionalRules;
    m.useStyleGuide = seeded.useStyleGuide;
    m.updatedAt = Date.now();
    saveData();
    return m;
  },

  exportAll() {
    return loadData().modes.map((m) => ({
      name: m.name,
      description: m.description,
      basePreset: m.basePreset,
      mainRule: m.mainRule,
      additionalRules: m.additionalRules,
      useStyleGuide: m.useStyleGuide
    }));
  },

  // Güvenlik: içe aktarılan girdiler asla yerleşik modların üstüne yazmaz
  // veya mevcut bir özel modu klonlamaz — her zaman TAZE bir id ile yeni bir
  // özel mod olarak eklenir. İsim çakışıyorsa otomatik olarak ayırt edici bir
  // sonek eklenir (İçe Aktarma sessizce başarısız olmasın diye).
  importList(list) {
    if (!Array.isArray(list)) return 0;
    const data = loadData();
    let count = 0;
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      let name = String(raw.name || 'İçe Aktarılan Mod').trim().slice(0, 80) || 'İçe Aktarılan Mod';
      if (nameTaken(data, name, null)) {
        let n = 2;
        while (nameTaken(data, `${name} (${n})`, null)) n++;
        name = `${name} (${n})`;
      }
      data.modes.push({
        id: genId(),
        builtin: false,
        labelKey: null,
        name,
        description: String(raw.description || '').trim(),
        basePreset: PRESETS.some((p) => p.id === raw.basePreset) ? raw.basePreset : 'blank',
        mainRule: String(raw.mainRule || ''),
        additionalRules: normalizeRules(raw.additionalRules),
        useStyleGuide: !!raw.useStyleGuide,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      count++;
    }
    if (count) saveData();
    return count;
  }
};

module.exports = modes;
