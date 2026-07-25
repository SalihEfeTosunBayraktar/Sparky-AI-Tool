'use strict';

const api = window.sparky;
const $ = (id) => document.getElementById(id);

const root = $('root');
const orbEl = $('orb');
const bubble = $('bubble');
const bubbleText = $('bubbleText');
const badge = $('badge');
const statusPill = $('statusPill');
const statusText = $('statusText');
const inputEl = $('input');
const outputEl = $('output');
const styleSel = $('style');
const deepBtn = $('deep');
const clarifyBtn = $('clarify');
const autoModeBtn = $('autoMode');
const metaEl = $('meta');
const refineEl = $('refine');
const qaEl = $('qa');
const qaList = $('qaList');
const suggestsEl = $('suggests');
const btnBubbleCopy = $('btnBubbleCopy');
const btnAttachImg = $('btnAttachImg');
const imgFileInput = $('imgFileInput');

const imageHandler = new ImageHandler({
  previewEl: $('imgPreviewContainer'),
  imgEl: $('imgPreview'),
  removeBtn: $('btnRemoveImg'),
  dropTarget: $('card'),
  pasteTarget: window,
  onImageChanged: (img) => {
    if (img && styleSel.value !== 'ui_design') {
      styleSel.value = 'ui_design';
      api.settings.patch({ style: 'ui_design' });
    }
  },
  onError: (msg) => {
    setStatus({ text: msg, kind: 'error' });
  }
});

btnAttachImg.addEventListener('click', () => imgFileInput.click());
imgFileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length) {
    imageHandler.handleFile(e.target.files[0]);
    imgFileInput.value = '';
  }
});

const state = {
  settings: null,
  providers: [],
  busy: false,
  expanded: false,
  output: '',
  streaming: '',
  lastInput: '',
  hasResult: false
};

let bubbleTimer = null;
let ignoringMouse = true;
let dragging = false;

/* ------------------------------------------------------------------ */
/* Fare geçirgenliği — şeffaf boşluk altındaki pencereleri engellemesin */
/* ------------------------------------------------------------------ */

function setIgnore(next) {
  if (next === ignoringMouse) return;
  ignoringMouse = next;
  api.ui.setIgnoreMouse(next);
}

document.addEventListener('mousemove', (e) => {
  if (dragging) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  setIgnore(!(el && el.closest('.hit')));
});

/* ------------------------------------------------------------------ */
/* Küre: sürükle / tıkla                                               */
/* ------------------------------------------------------------------ */

orbEl.addEventListener('mousedown', (e) => {
  // Orta tık — hızlı yol: panodaki metni doğrudan prompt'a çevir.
  if (e.button === 1) {
    e.preventDefault();
    runFromClipboard();
    return;
  }
  if (e.button !== 0) return;
  e.preventDefault();

  const sx = e.screenX;
  const sy = e.screenY;
  let travelled = 0;
  dragging = true;
  api.ui.dragStart();

  // screenX/Y ekran koordinatı olduğu için pencere imleçle birlikte
  // hareket etse bile gerçek imleç yolunu doğru ölçer.
  const onMove = (ev) => {
    travelled = Math.max(travelled, Math.abs(ev.screenX - sx) + Math.abs(ev.screenY - sy));
  };
  const onUp = (ev) => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    dragging = false;
    api.ui.dragEnd();
    if (travelled < 6) onOrbClick(ev);
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
});

orbEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  api.ui.orbMenu();
});

let lastOrbClickAt = 0;

function onOrbClick(ev) {
  // Ctrl + tık → sonucu hemen kopyala, paneli açma.
  if ((ev.ctrlKey || ev.metaKey) && state.output) {
    copyOutput(i18n.t('app.copiedToClipboard'));
    return;
  }

  // Çift tık → panodaki metni doğrudan prompt'a çevir.
  const now = Date.now();
  if (now - lastOrbClickAt < 420) {
    lastOrbClickAt = 0;
    runFromClipboard();
    return;
  }
  lastOrbClickAt = now;

  setExpanded(true, true);
}

/**
 * Hızlı yol: panodaki metni al, paneli açmadan üretime gönder.
 * Sonuç baloncukta bildirilir; baloncuğa tıklamak sonucu kopyalar.
 */
async function runFromClipboard() {
  const text = (await api.clipboard.read()).trim();
  if (!text) {
    setStatus({ text: i18n.t('app.clipboardEmpty'), kind: 'info' });
    return;
  }
  inputEl.value = text;
  state.lastInput = text;
  hideQuestions();
  hideSuggestions();
  setOutput('');
  await api.gen.start({ raw: text, mode: 'create' });
}

bubble.addEventListener('click', () => {
  if (state.hasResult && state.output) copyOutput(i18n.t('app.copiedToClipboard'));
  else setExpanded(true, true);
});

/* ------------------------------------------------------------------ */
/* Genişlet / küçült                                                   */
/* ------------------------------------------------------------------ */

function setExpanded(next, focus = false) {
  state.expanded = next;
  root.classList.toggle('expanded', next);
  root.classList.toggle('collapsed', !next);
  api.ui.setExpanded(next);
  if (next) {
    clearBadge();
    hideBubble();
    if (focus) setTimeout(() => inputEl.focus(), 60);
  }
}

$('btnCollapse').addEventListener('click', () => setExpanded(false));
$('btnHide').addEventListener('click', () => api.ui.hide());
$('btnMenu').addEventListener('click', () => api.ui.orbMenu());
$('btnHistory').addEventListener('click', () => api.ui.openPanel('history'));

/* ------------------------------------------------------------------ */
/* Durum / baloncuk                                                    */
/* ------------------------------------------------------------------ */

function setStatus({ text, kind = 'idle' }) {
  statusText.textContent = text;
  statusPill.dataset.kind = kind;

  if (!state.expanded) {
    const sticky = kind === 'thinking' || kind === 'prep';
    showBubble(text, kind, sticky ? 0 : 4200);
  }
  if (kind === 'success') setBadge('ok');
  if (kind === 'error') setBadge('error');
}

function showBubble(text, kind, autoHideMs) {
  bubbleText.textContent = text;
  bubble.dataset.kind = kind;
  bubble.hidden = false;
  if (btnBubbleCopy) {
    btnBubbleCopy.hidden = !state.output;
  }
  if (bubbleTimer) clearTimeout(bubbleTimer);
  if (autoHideMs) bubbleTimer = setTimeout(hideBubble, autoHideMs);
}

if (btnBubbleCopy) {
  btnBubbleCopy.addEventListener('click', (e) => {
    e.stopPropagation();
    copyOutput('Panoya kopyalandı');
  });
}

function hideBubble() {
  bubble.hidden = true;
  if (bubbleTimer) clearTimeout(bubbleTimer);
  bubbleTimer = null;
}

function setBadge(kind) {
  if (state.expanded) return;
  badge.hidden = false;
  badge.dataset.kind = kind;
}

function clearBadge() {
  badge.hidden = true;
}

/* ------------------------------------------------------------------ */
/* Çıktı                                                               */
/* ------------------------------------------------------------------ */

function renderEmpty() {
  outputEl.textContent = '';
  const d = document.createElement('div');
  d.className = 'empty';
  d.textContent = typeof i18n !== 'undefined' ? i18n.t('card.emptyPrompt') : 'Üretilen prompt burada belirecek.';
  outputEl.appendChild(d);
}

function startStage() {
  state.streaming = '';
  outputEl.textContent = '';
  const caret = document.createElement('span');
  caret.className = 'caret';
  outputEl.appendChild(caret);
}

function appendToken(chunk) {
  state.streaming += chunk;
  const caret = outputEl.querySelector('.caret');
  const node = document.createTextNode(chunk);
  if (caret) outputEl.insertBefore(node, caret);
  else outputEl.appendChild(node);
  outputEl.scrollTop = outputEl.scrollHeight;
}

function setOutput(text) {
  state.output = text;
  state.hasResult = !!text;
  outputEl.textContent = text || '';
  if (!text) renderEmpty();
  outputEl.scrollTop = 0;
  for (const id of ['btnCopy', 'btnCopyClose', 'btnRegen', 'btnRefine']) {
    $(id).disabled = !text;
  }
}

async function copyOutput(msg) {
  if (!state.output) return;
  const text = msg || i18n.t('app.copiedToClipboard');
  await api.clipboard.write(state.output);
  setStatus({ text, kind: 'success' });
}

/* ------------------------------------------------------------------ */
/* Netleştirme soruları                                                */
/* ------------------------------------------------------------------ */

function showQuestions(questions) {
  qaList.textContent = '';

  for (const q of questions) {
    const item = document.createElement('div');
    item.className = 'qa-item';
    item.dataset.q = q.q;

    const title = document.createElement('p');
    title.className = 'qa-q';
    title.textContent = q.q;
    item.appendChild(title);

    if (q.why) {
      const why = document.createElement('p');
      why.className = 'qa-why';
      why.textContent = q.why;
      item.appendChild(why);
    }

    const answer = document.createElement('input');
    answer.spellcheck = false;
    answer.placeholder = q.suggested ? `boş bırakırsan: ${q.suggested}` : 'cevabınız';
    answer.value = '';

    if (q.options.length) {
      const opts = document.createElement('div');
      opts.className = 'qa-opts';
      for (const o of q.options) {
        const btn = document.createElement('button');
        btn.className = 'qa-opt';
        btn.type = 'button';
        btn.textContent = o;
        btn.addEventListener('click', () => {
          opts.querySelectorAll('.qa-opt').forEach((b) => b.classList.remove('on'));
          btn.classList.add('on');
          answer.value = o;
        });
        opts.appendChild(btn);
      }
      item.appendChild(opts);
    }

    item.appendChild(answer);
    qaList.appendChild(item);
  }

  hideSuggestions();
  outputEl.hidden = true;
  qaEl.hidden = false;
  root.classList.add('asking');
  setTimeout(() => qaList.querySelector('input')?.focus(), 60);
}

function hideQuestions() {
  qaEl.hidden = true;
  outputEl.hidden = false;
  root.classList.remove('asking');
  qaList.textContent = '';
}

function collectAnswers() {
  return [...qaList.querySelectorAll('.qa-item')].map((el) => ({
    q: el.dataset.q,
    a: el.querySelector('input').value.trim()
  }));
}

async function continueWithAnswers(answers) {
  hideQuestions();
  setOutput('');
  await api.gen.start({
    raw: state.lastInput || inputEl.value.trim(),
    mode: 'create',
    answers,
    skipQuestions: true
  });
}

$('qaSubmit').addEventListener('click', () => continueWithAnswers(collectAnswers()));
$('qaSkip').addEventListener('click', () => continueWithAnswers([]));

/* ------------------------------------------------------------------ */
/* İyileştirme önerileri                                               */
/* ------------------------------------------------------------------ */

function hideSuggestions() {
  suggestsEl.hidden = true;
  suggestsEl.textContent = '';
}

function renderSuggestions({ pending, items }) {
  suggestsEl.textContent = '';

  if (pending) {
    suggestsEl.hidden = false;
    const lead = document.createElement('span');
    lead.className = 'lead';
    lead.textContent = i18n.t('card.suggestionsPending');
    suggestsEl.appendChild(lead);
    return;
  }

  if (!items || !items.length) {
    hideSuggestions();
    return;
  }

  suggestsEl.hidden = false;
  const lead = document.createElement('span');
  lead.className = 'lead';
  lead.textContent = i18n.t('card.suggestionsLead');
  suggestsEl.appendChild(lead);

  for (const it of items) {
    const btn = document.createElement('button');
    btn.className = 'sug';
    btn.type = 'button';
    btn.textContent = it.label;
    btn.title = it.instruction;
    btn.addEventListener('click', () => applyInstruction(it.instruction));
    suggestsEl.appendChild(btn);
  }
}

async function applyInstruction(instruction) {
  if (!state.output || !instruction) return;
  hideSuggestions();
  await api.gen.start({
    raw: state.lastInput || inputEl.value.trim(),
    mode: 'refine',
    previous: state.output,
    instruction
  });
}

/* ------------------------------------------------------------------ */
/* Üretim                                                              */
/* ------------------------------------------------------------------ */

function setBusy(next) {
  state.busy = next;
  root.classList.toggle('busy', next);
  $('btnGen').disabled = next;
  $('btnStop').hidden = !next;
  $('btnGen').hidden = next;
  if (next) clearBadge();
}

async function generate() {
  const raw = inputEl.value.trim();
  const image = imageHandler.getImage();
  if (!raw && !image) {
    setStatus({ text: i18n.t('card.noTextOrImage'), kind: 'info' });
    inputEl.focus();
    return;
  }
  state.lastInput = raw;
  hideQuestions();
  hideSuggestions();
  setOutput('');
  await api.gen.start({ raw, image, mode: 'create' });
}

async function applyRefine() {
  const instruction = refineEl.value.trim();
  if (!instruction) return;
  refineEl.value = '';
  await applyInstruction(instruction);
}

$('btnGen').addEventListener('click', generate);
$('btnStop').addEventListener('click', () => api.gen.abort());
$('btnRegen').addEventListener('click', generate);
$('btnCopy').addEventListener('click', () => copyOutput());
$('btnCopyClose').addEventListener('click', async () => {
  await copyOutput();
  setExpanded(false);
});
$('btnRefine').addEventListener('click', applyRefine);
$('btnPaste').addEventListener('click', async () => {
  const text = await api.clipboard.read();
  if (!text.trim()) {
    setStatus({ text: i18n.t('app.clipboardEmpty'), kind: 'info' });
    return;
  }
  inputEl.value = text.trim();
  inputEl.focus();
});

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    generate();
  }
});

refineEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    applyRefine();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.busy) api.gen.abort();
    else setExpanded(false);
  }
  if (e.key === 'c' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
    e.preventDefault();
    copyOutput();
  }
});

/* ------------------------------------------------------------------ */
/* Ayar kontrolleri                                                    */
/* ------------------------------------------------------------------ */

styleSel.addEventListener('change', () => api.settings.patch({ style: styleSel.value }));

function bindChip(btn, key) {
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(next));
    api.settings.patch({ [key]: next });
  });
}

bindChip(deepBtn, 'deepMode');
bindChip(clarifyBtn, 'clarify');
if (autoModeBtn) bindChip(autoModeBtn, 'autoMode');

function renderMeta() {
  const s = state.settings;
  if (!s) return;
  const prov = state.providers.find((p) => p.id === s.provider);
  const label = prov ? prov.label.replace(/\s*\(.*\)$/, '') : s.provider;
  const selectModelTxt = i18n.t('app.selectModel');
  metaEl.textContent = s.model ? `${label} · ${s.model}` : `${label} · ${selectModelTxt}`;
}

function populateStyles() {
  if (!state.styles) return;
  const current = styleSel.value;
  styleSel.innerHTML = '';
  for (const s of state.styles) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = i18n.t(`styles.${s.id}.label`) || s.label;
    opt.title = i18n.t(`styles.${s.id}.hint`) || s.hint;
    styleSel.appendChild(opt);
  }
  if (current) styleSel.value = current;
}

function applySettings(s) {
  state.settings = s;
  if (typeof i18n !== 'undefined' && s.appLanguage) {
    i18n.init(s.appLanguage);
    i18n.setLanguage(s.appLanguage);
    i18n.translateDOM();
  }
  populateStyles();
  populateProjects();
  if (styleSel.value !== s.style) styleSel.value = s.style;
  deepBtn.setAttribute('aria-pressed', String(!!s.deepMode));
  clarifyBtn.setAttribute('aria-pressed', String(!!s.clarify));
  if (autoModeBtn) autoModeBtn.setAttribute('aria-pressed', String(!!s.autoMode));
  renderMeta();
}

/* ------------------------------------------------------------------ */
/* Ana süreçten gelen olaylar                                          */
/* ------------------------------------------------------------------ */

api.on.status(setStatus);
api.on.stage(() => {
  hideQuestions();
  startStage();
});
api.on.token((chunk) => appendToken(chunk));
api.on.busy((v) => setBusy(v));

api.on.autoDecision((res) => {
  if (!res || !res.decision) return;
  if (res.decision === 'DEEP_MODE') {
    showBubble(i18n.t('card.autoDecisionDeep'), 'thinking', 6000);
  } else if (res.decision === 'CLARIFICATION') {
    showBubble(i18n.t('card.autoDecisionClarify'), 'info', 6000);
  }
});

api.on.questions(({ questions }) => {
  showQuestions(questions);
  // Akış cevap bekliyor; panel kapalıysa kendiliğinden açılmalı.
  if (!state.expanded) setExpanded(true);
});

api.on.suggestions(renderSuggestions);

api.on.done(({ output, copied }) => {
  setOutput(output);
  if (!state.expanded) {
    showBubble(copied ? i18n.t('app.bubbleCopied') : i18n.t('app.bubbleReady'), 'success', 7000);
    setBadge('ok');
  }
});

api.on.error(({ message }) => {
  const partial = state.streaming.trim();
  if (partial) {
    // Yarım kalan metni koru — kullanıcı yine de işine yarayan kısmı alabilir.
    setOutput(partial);
  } else {
    setOutput('');
    outputEl.textContent = '';
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = message;
    outputEl.appendChild(d);
  }
  showBubble(message.split('\n')[0], 'error', 8000);
});

api.on.playSound((type) => {
  if (state.settings && state.settings.enableSound && typeof audioFeedback !== 'undefined') {
    audioFeedback.play(type);
  }
});

api.on.expanded((v) => {
  state.expanded = v;
  root.classList.toggle('expanded', v);
  root.classList.toggle('collapsed', !v);
  if (v) {
    clearBadge();
    hideBubble();
  }
});

api.on.focusInput(() => setTimeout(() => inputEl.focus(), 60));

api.on.fillInput((text) => {
  inputEl.value = text;
  state.lastInput = text;
});

api.on.loadEntry((item) => {
  hideQuestions();
  hideSuggestions();
  inputEl.value = item.input || '';
  state.lastInput = item.input || '';
  setOutput(item.output || '');
  setStatus({ text: i18n.t('app.loadedFromHistory'), kind: 'info' });
});

api.on.settingsChanged((s) => applySettings(s));
api.on.projectsChanged(() => populateProjects());

const projectSel = $('projectSelect');

async function populateProjects() {
  if (!projectSel) return;
  const list = await api.projects.list();
  const activeObj = await api.projects.getActive();
  const activeId = activeObj ? activeObj.id : '';

  projectSel.innerHTML = '';

  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = `📁 ${i18n.t('projects.chipNoProject')}`;
  projectSel.appendChild(noneOpt);

  for (const p of list) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `📁 ${p.name}`;
    if (p.id === activeId) opt.selected = true;
    projectSel.appendChild(opt);
  }

  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = i18n.t('projects.chipNewProject');
  projectSel.appendChild(newOpt);
}

if (projectSel) {
  projectSel.addEventListener('change', async (e) => {
    const val = e.target.value;
    if (val === '__new__') {
      await populateProjects();
      api.ui.openPanel('projects');
      return;
    }
    await api.projects.setActive(val || null);
  });
}

/* ------------------------------------------------------------------ */
/* Başlangıç                                                           */
/* ------------------------------------------------------------------ */

(async function init() {
  const [settings, styles, providers] = await Promise.all([
    api.settings.get(),
    api.meta.styles(),
    api.providers.catalog()
  ]);

  state.providers = providers;
  state.styles = styles;

  applySettings(settings);
  await populateProjects();
  renderEmpty();
  setStatus({ text: settings.model ? i18n.t('app.ready') : i18n.t('app.selectModel'), kind: settings.model ? 'idle' : 'info' });
})();
