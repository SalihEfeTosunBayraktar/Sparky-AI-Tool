'use strict';

// Prompt üretim hattı. Modele "cevap verme, prompt yaz" dedirten katman burası.
// Yönergeler İngilizce yazıldı (modeller İngilizce talimatlara daha sadık),
// üretilen prompt'un dili ise ayardan belirlenir.

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

function styleList() {
  return Object.entries(STYLES).map(([id, s]) => ({ id, label: s.label, hint: s.hint }));
}

function languageList() {
  return Object.keys(LANGUAGES).map((id) => ({ id, label: LANGUAGE_LABELS[id] || id }));
}

function buildSystem(styleId, languageId) {
  const style = STYLES[styleId] || STYLES.detailed;
  const lang = LANGUAGES[languageId] || LANGUAGES.auto;
  return `${BASE_RULES.replace('{{LANG}}', lang)}\n\n${style.guide}`;
}

// Model yine de kod bloğu / önsöz eklerse temizle.
function clean(text) {
  let out = String(text || '').trim();
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

const REFINE_SYSTEM = `You are a prompt editor. You are given a raw note and a draft prompt written from it.
Improve the draft:
- Remove any drift: anything not grounded in the note must go, unless it is a clearly-labelled standard assumption.
- Remove any meta-text, preamble, sign-off, or markdown code fence.
- Tighten wording; delete filler; keep every concrete requirement.
- Keep the draft's language and overall structure.
Output ONLY the final prompt. No commentary.`;

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
 * Prompt üretimini çalıştırır.
 *
 * @param {object} o
 * @param {string} o.raw              Kullanıcının ham metni
 * @param {'create'|'refine'} o.mode
 * @param {string} [o.previous]       refine modunda önceki prompt
 * @param {string} [o.instruction]    refine modunda kullanıcının düzeltmesi
 * @param {object} o.settings
 * @param {Function} o.chat           llm.chat
 * @param {Function} [o.onStatus]     ({text, kind}) durum baloncuğu
 * @param {Function} [o.onStage]      () yeni aşama — çıktıyı sıfırla
 * @param {Function} [o.onToken]      (chunk)
 * @param {AbortSignal} [o.signal]
 */
async function run({
  raw,
  image,
  mode = 'create',
  previous = '',
  instruction = '',
  answers = [],
  settings: cfg,
  chat,
  onStatus,
  onStage,
  onToken,
  signal
}) {
  let note = String(raw || '').trim();
  if (!note && image) {
    note = '[Uploaded image / UI screenshot to convert into prompt]';
  }
  if (!note && mode === 'create') throw new Error('Önce bir metin veya resim girin.');

  const system = buildSystem(cfg.style, cfg.outputLanguage);
  const common = {
    providerId: cfg.provider,
    model: cfg.model,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
    effort: cfg.effort,
    signal
  };

  if (mode === 'refine') {
    onStatus?.({ text: 'Düzeltme uygulanıyor…', kind: 'thinking' });
    onStage?.();
    const user = `RAW NOTE:\n${note || '(değişmedi)'}\n\nCURRENT PROMPT:\n${previous}\n\nUSER'S EDIT REQUEST:\n${instruction}\n\nApply the edit request to the current prompt. Keep everything else intact. Output only the updated prompt.`;
    const { text } = await chat({ ...common, image, system, messages: [{ role: 'user', content: user }], onToken });
    return clean(text);
  }

  let analysis = null;

  if (cfg.deepMode) {
    onStatus?.({ text: 'Niyet çözümleniyor…', kind: 'thinking' });
    const { text } = await chat({
      ...common,
      image,
      system: ANALYSIS_SYSTEM,
      messages: [{ role: 'user', content: note }],
      maxTokens: Math.min(Number(cfg.maxTokens) || 1024, 1024)
      // Bu aşama akıtılmaz; kullanıcıya JSON göstermenin anlamı yok.
    });
    analysis = extractJson(text);
  }

  onStatus?.({ text: cfg.deepMode ? 'Prompt yazılıyor…' : 'Düşünüyor…', kind: 'thinking' });
  onStage?.();

  const userParts = [`RAW NOTE:\n${note}`];
  if (analysis) {
    userParts.push(
      `ANALYSIS (use it, but the raw note always wins if they disagree):\n${JSON.stringify(analysis, null, 2)}`
    );
  }
  const clarifications = answersBlock(answers);
  if (clarifications) userParts.push(clarifications);
  userParts.push('Write the finished prompt now.');

  const first = await chat({
    ...common,
    image,
    system,
    messages: [{ role: 'user', content: userParts.join('\n\n') }],
    onToken
  });

  let output = clean(first.text);

  if (cfg.deepMode && output) {
    onStatus?.({ text: 'Cilalanıyor…', kind: 'thinking' });
    onStage?.();
    const refined = await chat({
      ...common,
      system: REFINE_SYSTEM,
      messages: [{ role: 'user', content: `RAW NOTE:\n${note}\n\nDRAFT PROMPT:\n${output}` }],
      onToken
    });
    const cleaned = clean(refined.text);
    if (cleaned) output = cleaned;
  }

  if (!output) throw new Error('Model boş yanıt döndürdü. Modeli veya "Maks. token" ayarını kontrol edin.');
  return output;
}

module.exports = { run, askQuestions, suggest, styleList, languageList, STYLES, LANGUAGE_LABELS, clean };
