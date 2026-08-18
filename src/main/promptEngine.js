'use strict';

// Prompt üretim hattı. Modele "cevap verme, prompt yaz" dedirten katman burası.
// Yönergeler İngilizce yazıldı (modeller İngilizce talimatlara daha sadık),
// üretilen prompt'un dili ise ayardan belirlenir.

const projectContext = require('./projectContext');
const { allProviders } = require('./llm');
const { supportsVision } = require('./providers/imageUtils');

const STYLES = {
  detailed: {
    label: 'Detaylı',
    hint: 'Rol + bağlam + gereksinim + çıktı formatı',
    guide: `FORMAT — Produce a structured prompt with these parts, in this order, as short plain headings:
Role — who the model should act as, chosen to fit the domain.
Task — one sentence stating exactly what to produce.
Context — the background from the note, preserved faithfully.
Requirements — bulleted, concrete, individually checkable.
Output format — the exact shape of the deliverable (sections, length, tone, file type).
Constraints — what to avoid, plus any assumption you had to make.
Target 150-400 words.`
  },
  concise: {
    label: 'Kısa & Net',
    hint: 'Tek paragraf, doğrudan',
    guide: `FORMAT — One tight paragraph, or at most five short lines. No headings. It must still carry role, task, the key constraints and the output format. Stay under 120 words.`
  },
  system: {
    label: 'Sistem Promptu',
    hint: 'Bir asistanı yapılandırmak için',
    guide: `FORMAT — Write a system prompt that configures an AI assistant. Address it in the second person ("You are..."). Define identity and scope, behavioural rules, tone, how to handle out-of-scope or unsafe requests, and output conventions. Do not include any user-turn content or example dialogue unless the note asks for it.`
  },
  image: {
    label: 'Görsel Prompt',
    hint: 'Görsel üretim modelleri için',
    guide: `FORMAT — Write a prompt for an image generation model. One dense block, comma-separated where natural, covering: subject and action, setting, composition and framing, lighting, colour palette, art style or medium, camera and lens if photographic, mood, and quality descriptors. End with a single line starting "Negative:" listing what to avoid. No headings, no bullet lists.`
  },
  code: {
    label: 'Kod / Teknik',
    hint: 'Geliştirme görevleri için',
    guide: `FORMAT — Write a prompt for a coding model. Cover: the goal, language/framework/version (only if stated or safely assumable), the input and output contract, edge cases that must be handled, error-handling expectations, performance or style constraints, and what tests or verification are expected. Be specific enough that the result can be reviewed against the prompt.`
  },
  research: {
    label: 'Araştırma',
    hint: 'Derin araştırma görevleri için',
    guide: `FORMAT — Write a deep-research prompt covering: the central question, why it matters, scope and explicit boundaries, which sources or evidence types to prioritise, the analysis to perform, how to treat conflicting or low-quality evidence, citation expectations, and the structure of the final report.`
  },
  ui_design: {
    label: 'UI/UX Tasarımı',
    hint: 'Ekran görüntüsü / UI görselini prompt\'a dönüştür',
    guide: `FORMAT — Produce a high-precision UI/UX Design Specification & Frontend Code Generation Prompt based on the provided UI design/screenshot and note:
Role — Expert UI/UX Designer & Senior Frontend Engineer.
Task — Create an exact specification and step-by-step prompt for building this UI interface.
Visual Hierarchy & Layout — Describe header, nav, main canvas, sidebar, footer, grid structure and spacing tokens.
Color Palette & Typography — List key hex/hsl color codes, gradients, font families, text sizes and contrasts observed.
Component Specs — Detailed breakdown of every component (buttons, inputs, cards, dropdowns, badges) and state (hover, active, disabled).
Interactive & Responsive Behavior — Specify layout flexibility, flexbox/grid alignments, breakpoint behavior, animations.
Implementation Instructions — Instruct the code generator on HTML5/CSS3/React/Vue structure, modular clean code, accessibility (WCAG), and exact styling guidance.`
  }
};

const LANGUAGES = {
  auto: 'the same language the raw note is written in',
  tr: 'Turkish',
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  ar: 'Arabic',
  ru: 'Russian'
};

const LANGUAGE_LABELS = {
  auto: 'Otomatik (girdiyle aynı)',
  tr: 'Türkçe',
  en: 'İngilizce',
  de: 'Almanca',
  fr: 'Fransızca',
  es: 'İspanyolca',
  ar: 'Arapça',
  ru: 'Rusça'
};

const BASE_RULES = `You are Sparky, an expert prompt engineer. You turn a user's raw note into ONE finished, ready-to-paste prompt for an AI model.

NON-NEGOTIABLE RULES
1. FIDELITY — The note's topic, intent, domain, named entities, numbers, dates and constraints are sacred. Never swap the subject, never invent facts the user did not supply, never drift to an adjacent topic.
2. DO NOT ANSWER — You are not solving the user's task. You are writing the prompt that would make another model solve it. Never produce the answer itself.
3. OUTPUT ONLY THE PROMPT — no greeting, no preamble, no explanation, no "Here is", no commentary on what you changed, and no markdown code fence wrapping the whole output.
4. LANGUAGE — Write the finished prompt in {{LANG}}.
5. GAPS — Where the note is vague, fill the gap with the most standard, widely-applicable assumption for that domain and state it inside the prompt as an explicit assumption. Use an <angle-bracket slot> only when the value is genuinely user-specific and cannot be assumed.
6. NO PADDING — Every line must earn its place. Do not add generic filler like "be creative" or "think step by step" unless it materially helps this specific task.`;

const NORMAL_CHAT_BASE_RULES = `You are Sparky AI, a highly capable desktop AI assistant.
Your task is to respond DIRECTLY to the user's message, question, or request in a clear, natural, intelligent, and helpful conversational tone.

NON-NEGOTIABLE RULES
1. DIRECT RESPONSE — Answer the user's question or execute their task directly.
2. DO NOT WRITE A PROMPT TEMPLATE — Do NOT generate meta-prompts, role headings, or prompt engineering templates. Provide the direct solution or answer.
3. LANGUAGE — Respond in {{LANG}}.
4. QUALITY — Be precise, well-formatted, and concise.`;

function styleList() {
  return Object.entries(STYLES).map(([id, s]) => ({ id, label: s.label, hint: s.hint }));
}

function languageList() {
  return Object.keys(LANGUAGES).map((id) => ({ id, label: LANGUAGE_LABELS[id] || id }));
}

// `modeConfig` modes.js CRUD deposundan gelen tam mod nesnesi (bkz.
// src/main/modes.js) — `mainRule` HER modda (yerleşik dahil) tamamen
// düzenlenebilir ana talimattır; `useStyleGuide` true ise seçili Çıktı
// biçimi rehberi altına eklenir (Prompt Hazırlayıcı'nın çatısı budur);
// `additionalRules` tek tek maddeler halinde en sona eklenir. Metindeki her
// {{TOKEN}}, modes.js'in VARIABLES kataloğuyla birebir eşleşir — yeni bir
// değişken eklemek isterseniz onu HEM buradaki tokenMap'e HEM modes.js'teki
// VARIABLES listesine eklemeniz gerekir (biri diğerini otomatik güncellemez).
function buildSystem({ styleId, languageId, modeConfig, project, raw, cfg, mode, answers }) {
  const lang = LANGUAGES[languageId] || LANGUAGES.auto;
  const style = STYLES[styleId] || STYLES.detailed;
  const isTr = languageId === 'tr';
  const locale = isTr ? 'tr-TR' : 'en-US';
  const now = new Date();
  const allP = typeof allProviders === 'function' ? allProviders() : {};
  const providerLabel = (cfg && allP[cfg.provider]?.label) || (cfg && cfg.provider) || '';
  const projectNotes = project && Array.isArray(project.texts)
    ? project.texts.map((t) => `${t.title}: ${t.content}`.trim()).filter(Boolean).join('\n')
    : '';

  const tokenMap = {
    LANG: lang,
    PROJECT: (project && project.name) || '',
    PROJECT_DESC: (project && project.description) || '',
    PROJECT_NOTES: projectNotes,
    INPUT: String(raw || ''),
    ANSWERS: answersBlock(answers),
    DATE: now.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' }),
    TIME: now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
    YEAR: String(now.getFullYear()),
    MONTH: now.toLocaleDateString(locale, { month: 'long' }),
    DAY: String(now.getDate()),
    WEEKDAY: now.toLocaleDateString(locale, { weekday: 'long' }),
    STYLE: style.label,
    STYLE_HINT: style.hint,
    MODEL: (cfg && cfg.model) || '',
    PROVIDER: providerLabel,
    TEMPERATURE: cfg && cfg.temperature !== undefined ? String(cfg.temperature) : '',
    EFFORT: (cfg && cfg.effort) || '',
    DEEP_MODE: cfg && cfg.deepMode ? (isTr ? 'Açık' : 'On') : (isTr ? 'Kapalı' : 'Off'),
    GENERATION_MODE: mode === 'refine' ? (isTr ? 'Düzeltme' : 'Refine') : (isTr ? 'Oluşturma' : 'Create')
  };

  // Bilinmeyen {{TOKEN}}'lar OLDUĞU GİBİ bırakılır (değiştirilmez) — hem
  // modeUI.js'teki "tanımsız değişken" uyarısı hâlâ anlamlı kalsın, hem de
  // kullanıcı yanlışlıkla {{ }} yazarsa sessizce veri kaybı olmasın diye.
  const interpolate = (s) =>
    String(s || '').replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (m, key) => {
      const upper = key.toUpperCase();
      return Object.prototype.hasOwnProperty.call(tokenMap, upper) ? tokenMap[upper] : m;
    });

  let sys = interpolate(modeConfig ? modeConfig.mainRule : NORMAL_CHAT_BASE_RULES) || interpolate(NORMAL_CHAT_BASE_RULES);

  if (modeConfig && modeConfig.useStyleGuide) {
    sys += `\n\n${style.guide}`;
  }

  const rules = Array.isArray(modeConfig && modeConfig.additionalRules)
    ? modeConfig.additionalRules.map((r) => interpolate(r).trim()).filter(Boolean)
    : [];
  if (rules.length) {
    sys += `\n\nADDITIONAL RULES\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
  }

  return sys;
}

// Model yine de kod bloğu / önsöz eklerse temizle (normal sohbette biçimlendirme korunur).
function clean(text, isChat = false) {
  let out = String(text || '').trim();
  if (isChat) return out;
  const fence = out.match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```$/);
  if (fence) out = fence[1].trim();
  out = out.replace(/^(?:işte|i̇şte|here(?:'s| is))\b[^\n]*:\s*\n+/i, '');
  out = out.replace(/^(?:prompt|final prompt|nihai prompt)\s*:\s*\n+/i, '');
  return out.trim();
}

function extractJson(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

const ANALYSIS_SYSTEM = `You are a requirements analyst. Read the user's raw note and extract its intent.
Return ONLY a compact JSON object and nothing else — no prose, no code fence:
{"topic":"","intent":"","domain":"","audience":"","deliverable":"","must_keep":[],"constraints":[],"assumptions":[],"language":""}
"must_keep" lists the exact entities, numbers, names and terms that must survive into the final prompt.
"assumptions" lists gaps you filled with a standard default. "language" is the ISO code of the note's language.
Do not answer or solve the note.`;

const QUESTION_SYSTEM = `You are a prompt engineer about to write a prompt from a user's raw note.
Before writing, find what is genuinely ambiguous — points where two reasonable readings would produce materially different prompts.

Return ONLY a compact JSON object, no prose, no code fence:
{"questions":[{"q":"","why":"","options":[],"suggested":""}]}

Rules:
- At most 3 questions, fewer is better. If the note is clear enough to write a good prompt, return {"questions":[]}.
- Never ask about something the note already answers, and never ask for something a standard default covers well.
- "q" is one sentence, written in {{LANG}}.
- "why" is a short clause in {{LANG}} explaining what the answer changes.
- "options" holds 2-4 short concrete choices when the answer is naturally a choice; otherwise an empty array.
- "suggested" is the answer you would assume if the user says nothing.
- Do not answer or solve the note.`;

const SUGGEST_SYSTEM = `You are a prompt reviewer. You are given a raw note and the prompt written from it.
Propose concrete ways the prompt could produce a better result.

Return ONLY a compact JSON object, no prose, no code fence:
{"suggestions":[{"label":"","instruction":""}]}

Rules:
- 2 to 4 suggestions, ordered by impact.
- "label" is a button caption in {{LANG}}, at most 5 words.
- "instruction" is an imperative edit instruction in {{LANG}} that can be applied to the prompt as it stands.
- Only propose changes that would genuinely improve the output. Never suggest rewording for its own sake.
- Do not rewrite the prompt yourself.`;

const AUTO_DECISION_SYSTEM = `You are a prompt engineer analyzing a user's raw note to decide the best generation workflow.
Choose between three workflows:
1. "CLARIFICATION": Select this if the note is vague, under-specified, ambiguous, or lacks crucial details where multiple conflicting choices exist (e.g. "bana bir login yap" or "bir site hazırla").
2. "DEEP_MODE": Select this if the note specifies a complex architecture, multi-step pipeline, detailed UI specification, complex algorithm, or full software module requiring multi-stage reasoning.
3. "STANDARD": Select this if the note is a clear, standard, or self-contained request.

Return ONLY a compact JSON object and nothing else:
{"decision":"CLARIFICATION"|"DEEP_MODE"|"STANDARD","reason":""}`;

/**
 * Otomatik Mod Karar Motoru: Kullanıcının girdiği isteğin karmaşıklığına ve netliğine göre akış seçer.
 */
async function analyzeAutoMode({ raw, project, settings: cfg, chat, signal }) {
  const note = String(raw || '').trim();
  if (!note) return { decision: 'STANDARD', reason: 'Empty note' };

  try {
    const userContent = project
      ? `PROJECT: ${project.name}\nRAW NOTE:\n${note}`
      : `RAW NOTE:\n${note}`;

    const { text } = await chat({
      ...auxCall(cfg, signal),
      system: AUTO_DECISION_SYSTEM,
      messages: [{ role: 'user', content: userContent }],
      maxTokens: 256
    });

    const parsed = extractJson(text);
    const decision = (parsed?.decision || '').toUpperCase();
    if (['CLARIFICATION', 'DEEP_MODE', 'STANDARD'].includes(decision)) {
      return { decision, reason: String(parsed.reason || '').trim() };
    }
    return { decision: 'STANDARD', reason: 'Invalid model decision' };
  } catch (err) {
    console.warn('[promptEngine] analyzeAutoMode failed (fallback to STANDARD):', err.message);
    return { decision: 'STANDARD', reason: 'Error in auto decision' };
  }
}

const REFINE_SYSTEM = `You are a prompt editor and polisher. You are given a raw note and a draft prompt written from it.
Your goal is to polish the DRAFT PROMPT for clarity, grammar, and flow WITHOUT losing any details.

STRICT RETENTION RULES (ZERO INFORMATION LOSS):
- NEVER remove, omit, abbreviate, condense, or summarize ANY technical requirement, constraint, section, heading, bullet point, <slot> placeholder, code snippet, or spec from the DRAFT PROMPT.
- NEVER combine multiple detailed bullet points into a single vague summary line.
- Keep all sections, language, formatting, and overall structure intact.

ALLOWED EDITS ONLY:
- Fix spelling and grammatical errors.
- Smooth out awkward phrasing for better natural flow.
- Remove meta-text, preambles (e.g. "Here is your prompt:"), sign-offs, or wrapping markdown code fences.

The polished prompt MUST retain 100% of the substance and detail of the draft prompt. Output ONLY the final polished prompt with no commentary or explanation.`;

function langOf(cfg) {
  return LANGUAGES[cfg.outputLanguage] || LANGUAGES.auto;
}

// Yan aşamalar (soru / öneri) kısa ve ucuz olmalı — düşük bütçe, düşük effort.
function auxCall(cfg, signal) {
  return {
    providerId: cfg.provider,
    model: cfg.model,
    temperature: cfg.temperature,
    maxTokens: Math.min(Number(cfg.maxTokens) || 1024, 1024),
    effort: 'low',
    signal
  };
}

/* ------------------------------------------------------------------ */
/* Token bütçesi ve kesilen yanıtı devam ettirme                       */
/* ------------------------------------------------------------------ */

// Bazı biçimler doğası gereği uzun çıktı ister. max_tokens bir tavandır —
// model erken bitirirse fazladan maliyet doğurmaz — bu yüzden cömert taban
// değerler güvenlidir ve "eksik prompt" riskini baştan azaltır.
const STYLE_MIN_TOKENS = {
  ui_design: 6144,
  research: 4096,
  code: 4096,
  detailed: 3072,
  system: 3072,
  concise: 1024,
  image: 1024
};

function craftBudget(cfg) {
  const base = Math.max(512, Number(cfg.maxTokens) || 4096);
  return Math.max(base, STYLE_MIN_TOKENS[cfg.style] ?? 2048);
}

// Kaba token tahmini. Türkçe İngilizceden daha kötü tokenize olduğundan
// karakter/3 ile temkinli davranıyoruz.
function estimateTokens(s) {
  return Math.ceil(String(s || '').length / 3);
}

const MAX_CONTINUATIONS = 3;

function tailOf(s, n = 1600) {
  const str = String(s || '');
  return str.length <= n ? str : `…${str.slice(-n)}`;
}

function continuationPrompt(tail) {
  return `Your previous output stopped mid-way because it hit the token limit. This is exactly what you produced so far:

<<<PARTIAL
${tail}
PARTIAL

Continue from the exact point where it stopped. Do NOT repeat anything you already produced, do NOT restart from the beginning, do NOT add a preamble, heading, apology or closing remark. Output only the continuation.`;
}

/**
 * Devam parçasını ana metne ekler. Modeller iki şekilde hata yapabiliyor:
 * son cümleyi tekrarlamak (sınırda örtüşme) veya baştan başlamak.
 */
function joinContinuation(base, piece) {
  if (!base) return piece;
  if (!piece) return base;

  // 1) Model baştan başlamış: parça, metnin başlangıcıyla açılıyor.
  const head = base.slice(0, Math.min(200, base.length));
  if (head.length >= 40 && piece.startsWith(head)) {
    return piece.length >= base.length ? piece : base;
  }

  // 2) Sınırda örtüşme: parçanın başı metnin sonuyla aynı.
  const max = Math.min(400, base.length, piece.length);
  for (let n = max; n >= 12; n -= 1) {
    if (piece.slice(0, n) === base.slice(-n)) return base + piece.slice(n);
  }

  return base + piece;
}

/**
 * chat() çağrısını yapar; yanıt token sınırına takıldıysa kaldığı yerden
 * devam ettirir. "Eksik prompt" sorununun asıl çözümü burasıdır — eskiden
 * kesilen yanıt sessizce tamamlanmış sayılıyordu.
 *
 * @returns {Promise<{text: string, truncated: boolean, rounds: number}>}
 */
async function chatComplete({ chat, params, onToken, onStatus }) {
  const first = await chat({ ...params, onToken });
  let text = String(first.text || '');
  let truncated = !!first.truncated;
  let rounds = 0;
  // Sağlayıcılardan gelen gerçek token kullanımını topla (devam turları dahil).
  let totalTokens = first.totalTokens || null;

  while (truncated && rounds < MAX_CONTINUATIONS) {
    rounds += 1;
    onStatus?.({
      key: 'status.continuing',
      params: { n: rounds, max: MAX_CONTINUATIONS },
      text: `Yanıt kesildi, devam ettiriliyor (${rounds}/${MAX_CONTINUATIONS})…`,
      kind: 'thinking'
    });

    const cont = await chat({
      ...params,
      messages: [...params.messages, { role: 'user', content: continuationPrompt(tailOf(text)) }],
      onToken
    });

    const piece = String(cont.text || '');
    if (!piece.trim()) break;
    text = joinContinuation(text, piece);
    truncated = !!cont.truncated;
    // Devam turlarındaki token kullanımını biriktir.
    if (cont.totalTokens) totalTokens = (totalTokens || 0) + cont.totalTokens;
  }

  return { text, truncated, rounds, totalTokens };
}

/**
 * Belirsiz noktalar için kullanıcıya sorulacak soruları üretir.
 * Not açıksa boş dizi döner ve akış hiç kesilmez.
 */
async function askQuestions({ raw, settings: cfg, chat, signal }) {
  const note = String(raw || '').trim();
  if (!note) return [];

  const system = QUESTION_SYSTEM.replaceAll('{{LANG}}', langOf(cfg));
  const { text } = await chat({
    ...auxCall(cfg, signal),
    system,
    messages: [{ role: 'user', content: `RAW NOTE:\n${note}` }]
  });

  const parsed = extractJson(text);
  const list = Array.isArray(parsed?.questions) ? parsed.questions : [];
  return list
    .filter((q) => q && typeof q.q === 'string' && q.q.trim())
    .slice(0, 3)
    .map((q) => ({
      q: String(q.q).trim(),
      why: String(q.why || '').trim(),
      options: Array.isArray(q.options) ? q.options.slice(0, 4).map((o) => String(o).trim()).filter(Boolean) : [],
      suggested: String(q.suggested || '').trim()
    }));
}

/** Üretilen prompt için uygulanabilir iyileştirme önerileri. */
async function suggest({ raw, prompt, settings: cfg, chat, signal }) {
  if (!prompt) return [];

  const system = SUGGEST_SYSTEM.replaceAll('{{LANG}}', langOf(cfg));
  const { text } = await chat({
    ...auxCall(cfg, signal),
    system,
    messages: [{ role: 'user', content: `RAW NOTE:\n${raw}\n\nPROMPT:\n${prompt}` }]
  });

  const parsed = extractJson(text);
  const list = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
  return list
    .filter((s) => s && typeof s.instruction === 'string' && s.instruction.trim())
    .slice(0, 4)
    .map((s) => ({
      label: String(s.label || s.instruction).trim().slice(0, 48),
      instruction: String(s.instruction).trim()
    }));
}

function answersBlock(answers) {
  const rows = (answers || []).filter((a) => a && a.q && String(a.a || '').trim());
  if (!rows.length) return '';
  return `CLARIFICATIONS — the user answered these. Treat every answer as authoritative and fold it into the prompt:\n${rows
    .map((a) => `- Q: ${a.q}\n  A: ${String(a.a).trim()}`)
    .join('\n')}`;
}

/**
 * Validates that the polished prompt (Stage 3) retains the structural integrity and details of the draft prompt (Stage 2).
 * Veri kaybı veya metin özetleme/kısaltma durumlarında Stage 2 çıktısını korumak için doğrulama yapar.
 *
 * @param {string} draft - Stage 2 draft prompt
 * @param {string} refined - Stage 3 polished prompt
 * @returns {boolean} True if valid, false if data loss / truncation detected.
 */
function validateRefinedPrompt(draft, refined) {
  if (!draft || typeof draft !== 'string') return true;
  if (!refined || typeof refined !== 'string') return false;

  const d = draft.trim();
  const r = refined.trim();

  // 1. Length ratio check: Refined should not drop below 82% of draft length
  if (r.length < d.length * 0.82) {
    console.warn(`[promptEngine] Refined prompt rejected: length collapsed from ${d.length} to ${r.length} chars (ratio ${(r.length / d.length).toFixed(2)})`);
    return false;
  }

  // 2. Bullet / line item count check: Refined should not lose more than 25% of bullet items
  const countBullets = (str) => (str.match(/^\s*[-*•\d+.]+\s+/gm) || []).length;
  const dBullets = countBullets(d);
  const rBullets = countBullets(r);
  if (dBullets >= 3 && rBullets < dBullets * 0.75) {
    console.warn(`[promptEngine] Refined prompt rejected: bullet count dropped from ${dBullets} to ${rBullets}`);
    return false;
  }

  // 3. Slot placeholder check: All <slot> placeholders in draft must exist in refined
  const slots = d.match(/<[^>]{2,40}>/g) || [];
  for (const slot of slots) {
    if (!r.includes(slot)) {
      console.warn(`[promptEngine] Refined prompt rejected: missing slot placeholder "${slot}"`);
      return false;
    }
  }

  return true;
}

/**
 * Prompt üretimini çalıştırır.
 *
 * @param {object} o
 * @param {string} o.raw              Kullanıcının ham metni
 * @param {'create'|'refine'} o.mode
 * @param {string} [o.previous]       refine modunda önceki prompt
 * @param {string} [o.instruction]    refine modunda kullanıcının düzeltmesi
 * @param {boolean} [o.forceDeep]     oto mod DEEP_MODE dediyse derin modu zorla
 * @param {object} o.settings
 * @returns {Promise<{text: string, truncated: boolean}>}
 * @param {Function} o.chat           llm.chat
 * @param {Function} [o.onStatus]     ({text, kind}) durum baloncuğu
 * @param {Function} [o.onStage]      () yeni aşama — çıktıyı sıfırla
 * @param {Function} [o.onToken]      (chunk)
 * @param {AbortSignal} [o.signal]
 */
async function run({
  raw,
  image,
  project,
  mode = 'create',
  previous = '',
  instruction = '',
  answers = [],
  forceDeep = false,
  modeConfig = null,
  settings: cfg,
  chat,
  onStatus,
  onStage,
  onToken,
  signal
}) {
  let note = String(raw || '').trim();
  const modelHasVision = supportsVision(cfg?.provider, cfg?.model);
  const allImages = [];
  if (modelHasVision) {
    if (image) allImages.push(image);
    if (project && Array.isArray(project.images)) {
      for (const img of project.images) {
        if (img && img.base64) allImages.push({ mimeType: img.mimeType, base64: img.base64 });
      }
    }
  }
  const imagePayload = allImages.length > 0 ? allImages : null;

  if (!note && imagePayload) {
    note = '[Uploaded image / project screenshots to convert into prompt]';
  }
  if (!note && mode === 'create') throw new Error('Önce bir metin veya resim girin.');

  // Proje bağlamı oturum belleğinden alınır. Blok her seferinde yeniden
  // kurulmaz; proje/model/içerik değişmedikçe BAYT BAYT AYNI string döner.
  const ctx = projectContext.acquire(project, cfg);
  const projectBlock = ctx.block;

  // Blok, kullanıcı mesajının değil SİSTEM İSTEMİNİN EN BAŞINA konur.
  // Kullanıcı mesajı her istekte değişir ve asla önbelleğe alınmaz; sistem
  // isteminin sabit öneki ise alınır. Proje bloğunu en öne almak, kullanıcı
  // biçim (style) değiştirse bile önbelleğe alınan öneki korur.
  const withProject = (sys) => (projectBlock ? `${projectBlock}\n\n---\n\n${sys}` : sys);

  const system = withProject(
    buildSystem({ styleId: cfg.style, languageId: cfg.outputLanguage, modeConfig, project, raw: note, cfg, mode, answers })
  );
  const budget = craftBudget(cfg);
  const common = {
    providerId: cfg.provider,
    model: cfg.model,
    temperature: cfg.temperature,
    maxTokens: budget,
    effort: cfg.effort,
    // Anthropic'te sistem önekini cache_control ile işaretler.
    cacheSystem: !!projectBlock,
    signal
  };

  // Görseller en pahalı girdidir (bir ekran görüntüsü ~1-4k token). Derin modda
  // hem analiz hem yazım aşamasına göndermek maliyeti ikiye katlıyordu.
  // Analize yalnızca not boşsa, yani girdi tamamen görselse gönderiyoruz.
  const noteIsImageOnly = !String(raw || '').trim() && !!imagePayload;
  const analysisImage = noteIsImageOnly ? imagePayload : null;

  if (mode === 'refine') {
    onStatus?.({ key: 'status.refining', text: 'Düzeltme uygulanıyor…', kind: 'thinking' });
    onStage?.();
    // Proje bloğu artık sistem isteminde (önbelleğe alınabilir önek); kullanıcı
    // mesajına tekrar koymuyoruz.
    const user = `RAW NOTE:\n${note || '(değişmedi)'}\n\nCURRENT PROMPT:\n${previous}\n\nUSER'S EDIT REQUEST:\n${instruction}\n\nApply the edit request to the current prompt. Keep everything else intact. Output only the updated prompt.`;
    // Düzeltilen prompt en az mevcut prompt kadar uzun olacağı için bütçeyi ona göre aç.
    const refineBudget = Math.max(budget, Math.ceil(estimateTokens(previous) * 1.6) + 512);
    const res = await chatComplete({
      chat,
      params: {
        ...common,
        maxTokens: refineBudget,
        image: imagePayload,
        system,
        messages: [{ role: 'user', content: user }]
      },
      onToken,
      onStatus
    });
    return { text: clean(res.text), truncated: res.truncated, totalTokens: res.totalTokens };
  }

  // Oto mod kararı main tarafında, netleştirme kapısından önce alınır ve
  // buraya forceDeep olarak gelir; burada tekrar model çağrısı yapmıyoruz.
  const effectiveDeepMode = !!cfg.deepMode || !!forceDeep;

  let analysis = null;

  if (effectiveDeepMode) {
    onStatus?.({ key: 'status.analyzingIntent', text: 'Niyet çözümleniyor…', kind: 'thinking' });
    const { text } = await chat({
      ...common,
      // Görsel yalnızca girdi tamamen görselse; aksi hâlde yazım aşamasında
      // bir kez gönderilir (eskiden iki aşamada da gidiyordu).
      image: analysisImage,
      system: withProject(ANALYSIS_SYSTEM),
      messages: [{ role: 'user', content: `RAW NOTE:\n${note}` }],
      // 1024 karmaşık notlarda JSON'u yarıda kesiyordu; kesilen JSON sessizce
      // ayrıştırılamıyor ve derin mod normal moda düşüyordu.
      maxTokens: Math.max(1536, Math.min(budget, 2048))
    });
    analysis = extractJson(text);
    if (!analysis) {
      console.warn('[promptEngine] Analiz JSON ayrıştırılamadı; derin mod analiz aşamasız devam ediyor.');
    }
  }

  const isChat = modeConfig?.id === 'normal-chat' || (modeConfig && !modeConfig.useStyleGuide && modeConfig.basePreset === 'plain');

  onStatus?.({
    key: effectiveDeepMode && !isChat ? 'status.writing' : 'status.thinking',
    text: effectiveDeepMode && !isChat ? 'Prompt yazılıyor…' : 'Düşünüyor…',
    kind: 'thinking'
  });
  onStage?.();

  // Proje bloğu sistem isteminde; kullanıcı mesajı yalnızca değişen kısmı taşır.
  let userMessageContent = '';
  if (isChat) {
    userMessageContent = note;
  } else {
    const userParts = [`RAW NOTE:\n${note}`];
    if (analysis) {
      userParts.push(
        `ANALYSIS (use it, but the raw note always wins if they disagree):\n${JSON.stringify(analysis, null, 2)}`
      );
    }
    const clarifications = answersBlock(answers);
    if (clarifications) userParts.push(clarifications);
    userParts.push('Write the finished prompt now.');
    userMessageContent = userParts.join('\n\n');
  }

  const first = await chatComplete({
    chat,
    params: {
      ...common,
      image: imagePayload,
      system,
      messages: [{ role: 'user', content: userMessageContent }]
    },
    onToken,
    onStatus
  });

  let output = clean(first.text, isChat);
  let truncated = first.truncated;
  // Token kullanımını biriktir: cilalama yapıldıysa her iki aşamanın toplamı.
  let runTokens = first.totalTokens || null;

  if (effectiveDeepMode && output && !isChat) {
    onStatus?.({ key: 'status.polishing', text: 'Cilalanıyor…', kind: 'thinking' });
    onStage?.();
    // Cilalama taslağın TAMAMINI yeniden yazar; bütçe taslaktan küçük kalırsa
    // bu aşama kaçınılmaz olarak yarım çıktı üretir.
    const polishBudget = Math.max(budget, Math.ceil(estimateTokens(output) * 1.6) + 512);
    const refined = await chatComplete({
      chat,
      params: {
        ...common,
        maxTokens: polishBudget,
        // Cilalama yalnızca taslaktan çalışır; proje bloğuna ihtiyacı yok.
        cacheSystem: false,
        system: REFINE_SYSTEM,
        messages: [{ role: 'user', content: `RAW NOTE:\n${note}\n\nDRAFT PROMPT:\n${output}` }]
      },
      onToken,
      onStatus
    });
    if (refined.totalTokens) runTokens = (runTokens || 0) + refined.totalTokens;
    const cleaned = clean(refined.text, false);
    if (cleaned && validateRefinedPrompt(output, cleaned)) {
      output = cleaned;
      truncated = refined.truncated;
    } else if (cleaned) {
      console.info('[promptEngine] Cilalama veri kaybı nedeniyle reddedildi; 2. aşama taslağı korunuyor.');
      onStatus?.({
        key: 'status.polishRejected',
        text: 'Cilalama reddedildi — ayrıntılı taslak korundu',
        kind: 'info'
      });
    }
  }

  if (!output) throw new Error('Model boş yanıt döndürdü. Modeli veya "Maks. token" ayarını kontrol edin.');
  return { text: output, truncated, totalTokens: runTokens };
}

module.exports = {
  run,
  askQuestions,
  suggest,
  analyzeAutoMode,
  styleList,
  languageList,
  STYLES,
  LANGUAGE_LABELS,
  clean,
  validateRefinedPrompt,
  NORMAL_CHAT_BASE_RULES,
  BASE_RULES
};
