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
const { NORMAL_CHAT_BASE_RULES, BASE_RULES } = require('./promptEngine');

const FILE_PATH = path.join(app.getPath('userData'), 'modes.json');

// Yeni bir (özel) mod oluştururken seçilebilen ön modlar. Her biri
// mainRule/additionalRules/useStyleGuide için başlangıç şablonu sağlar VE
// bir örnek galerisi gibi işlev görür: her preset, 20 değişkenin (bkz.
// VARIABLES) bir alt kümesini SOMUT olarak kullanarak kullanıcıya "bununla
// neler yapabilirim" sorusuna doğrudan cevap verir. `descriptionKey`, hem
// ön mod seçicide alt başlık olarak hem de o presetten yeni mod
// oluşturulduğunda modun başlangıç açıklaması olarak kullanılır.
const PRESETS = [
  {
    id: 'blank',
    labelKey: 'modes.presetBlank',
    descriptionKey: 'modes.presetBlankDesc',
    mainRule: '',
    additionalRules: [],
    useStyleGuide: false
  },
  {
    id: 'plain',
    labelKey: 'modes.presetPlain',
    descriptionKey: 'modes.presetPlainDesc',
    mainRule: NORMAL_CHAT_BASE_RULES,
    additionalRules: [],
    useStyleGuide: false
  },
  {
    id: 'technical',
    labelKey: 'modes.presetTechnical',
    descriptionKey: 'modes.presetTechnicalDesc',
    mainRule: BASE_RULES,
    additionalRules: [
      'Prefer precise, unambiguous technical vocabulary; assume an experienced practitioner audience.',
      'Include concrete technical details (versions, protocols, data shapes) whenever the note implies them.'
    ],
    useStyleGuide: true
  },
  {
    id: 'summary',
    labelKey: 'modes.presetSummary',
    descriptionKey: 'modes.presetSummaryDesc',
    mainRule: "You are Sparky AI. Read the user's note and respond with a clear, faithful summary of it.",
    additionalRules: [
      'Preserve key facts, numbers, names, and constraints exactly as given.',
      'Prefer bullet points over long paragraphs.',
      'Target well under 150 words unless the note is long enough that this would lose essential information.'
    ],
    useStyleGuide: false
  },
  {
    id: 'creative',
    labelKey: 'modes.presetCreative',
    descriptionKey: 'modes.presetCreativeDesc',
    mainRule:
      "You are Sparky AI in creative mode. Turn the user's note into something imaginative and unexpected — a vivid scene, a punchy tagline, a bold reframing, a short story beat — while staying true to its core idea. Surprise the reader; don't just restate the note.",
    additionalRules: [
      'Avoid the obvious or clichéd angle; find a fresher one.',
      'Keep it vivid and concrete — no generic filler adjectives.',
      'Respond in {{LANG}}.'
    ],
    useStyleGuide: false
  },
  {
    id: 'daily',
    labelKey: 'modes.presetDaily',
    descriptionKey: 'modes.presetDailyDesc',
    mainRule:
      "You are Sparky AI in daily-note mode. It is {{WEEKDAY}}, {{DATE}} ({{TIME}}). Turn the user's raw note into a clear, dated journal-style entry that a future reader could skim and understand instantly.",
    additionalRules: [
      'Start with a one-line date/time header.',
      'Keep the tone personal and direct, as if written by the user themself.'
    ],
    useStyleGuide: false
  },
  {
    id: 'project_aware',
    labelKey: 'modes.presetProjectAware',
    descriptionKey: 'modes.presetProjectAwareDesc',
    mainRule:
      "You are a specialist consultant embedded in the '{{PROJECT}}' project ({{PROJECT_DESC}}). Use the project's own notes as ground truth context:\n{{PROJECT_NOTES}}\n\nAnswer the user's request with this context in mind — don't ask them to repeat what's already in the notes.",
    additionalRules: ["If the notes contradict the request, point out the conflict instead of silently picking one."],
    useStyleGuide: false
  },
  {
    id: 'transparent',
    labelKey: 'modes.presetTransparent',
    descriptionKey: 'modes.presetTransparentDesc',
    mainRule:
      'You are Sparky AI. Current run configuration: model {{MODEL}} via {{PROVIDER}}, temperature {{TEMPERATURE}}, effort {{EFFORT}}, deep mode {{DEEP_MODE}}, generation type {{GENERATION_MODE}}. Briefly note this configuration in one line, then respond directly and helpfully to the user\'s request.',
    additionalRules: [],
    useStyleGuide: false
  },
  {
    id: 'interview',
    labelKey: 'modes.presetInterview',
    descriptionKey: 'modes.presetInterviewDesc',
    mainRule:
      'You are Sparky AI, synthesizing a brief from a note and any clarifying answers.\n\nRAW NOTE:\n{{INPUT}}\n\n{{ANSWERS}}\n\nProduce ONE unified, well-organized brief that folds any answers into the note seamlessly.',
    additionalRules: ['If there are no clarifying answers, work from the raw note alone.'],
    useStyleGuide: false
  },
  {
    id: 'style_aware',
    labelKey: 'modes.presetStyleAware',
    descriptionKey: 'modes.presetStyleAwareDesc',
    mainRule:
      "You are Sparky AI. The user selected the '{{STYLE}}' output format ({{STYLE_HINT}}). Shape your response to match that format's intent precisely, in your own words — you are not using the built-in style engine, so make the format choice count.",
    additionalRules: [],
    useStyleGuide: false
  }
];

// Mod metinlerinde ({{KEY}} biçiminde) yazılıp kullanılabilen, gerçekten
// üretim anında yerine geçen değişkenler. modeUI.js bunları hem bir IDE/liste
// panelinde gösterir hem de metinde bilinmeyen bir {{...}} token'ı varsa
// uyarmak için kullanır. Buraya yeni bir değişken eklerseniz karşılığını
// promptEngine.js'deki buildSystem()'in tokenMap'ine de eklemeniz gerekir.
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
    labelKey: 'modes.normalChat',
    name: 'Normal Sohbet',
    description: '',
    basePreset: 'plain'
  },
  {
    id: 'prompt-preparer',
    builtin: true,
    labelKey: 'modes.promptPreparer',
    name: 'Prompt Hazırlayıcı',
    description: '',
    basePreset: 'technical'
  }
];

function getPreset(id) {
  return PRESETS.find((p) => p.id === id) || PRESETS.find((p) => p.id === 'blank');
}

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
    return PRESETS.map((p) => ({ id: p.id, labelKey: p.labelKey, descriptionKey: p.descriptionKey }));
  },

  variables() {
    return VARIABLES;
  },

  list() {
    return loadData().modes;
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
