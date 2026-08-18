'use strict';

const api = window.sparky;
const $ = (id) => document.getElementById(id);

const root = $('root');
const orbEl = $('orb');
const bubble = $('bubble');
const bubbleText = $('bubbleText');
const bubbleQueueCountEl = $('bubbleQueueCount');
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
const btnClearInput = $('btnClearInput');
const bottomActionBar = $('bottomActionBar');
const btnQuickModelPicker = $('btnQuickModelPicker');
const quickModelPickerPopover = $('quickModelPickerPopover');
const btnCloseQuickPicker = $('btnCloseQuickPicker');
const quickProviderSel = $('quickProviderSel');
const quickModelSearch = $('quickModelSearch');
const quickModelList = $('quickModelList');
const quickModelCustom = $('quickModelCustom');
const commandSuggestionsOverlay = $('commandSuggestionsOverlay');

let quickModelsCache = [];
let quickActiveProvider = '';
let quickActiveModel = '';

let slashCommands = null;

function updateBottomActionBarVisibility() {
  const hasGeneratedPrompt = !!(state && state.hasResult && state.output && state.output.trim());
  if (bottomActionBar) {
    bottomActionBar.classList.toggle('bottom-bar--visible', hasGeneratedPrompt);
    bottomActionBar.classList.toggle('bottom-bar--hidden', !hasGeneratedPrompt);
    bottomActionBar.setAttribute('aria-hidden', String(!hasGeneratedPrompt));
  }
  root.classList.toggle('has-generated-prompt', hasGeneratedPrompt);
}

function updateClearBtnVisibility() {
  if (!btnClearInput) return;
  const hasText = !!(inputEl && inputEl.value.trim());
  const hasImg = !!(imageHandler && imageHandler.currentImage);
  const hasPrompt = !!(state && state.hasResult);
  btnClearInput.hidden = !(hasText || hasImg || hasPrompt);
}

const imageHandler = new ImageHandler({
  previewEl: $('imgPreviewContainer'),
  imgEl: $('imgPreview'),
  removeBtn: $('btnRemoveImg'),
  attachBtn: btnAttachImg,
  fileInput: imgFileInput,
  dropTarget: $('card'),
  pasteTarget: window,
  onImageChanged: (img) => {
    if (img && styleSel.value !== 'ui_design') {
      styleSel.value = 'ui_design';
      api.settings.patch({ style: 'ui_design' });
    }
    updateClearBtnVisibility();
  },
  onWarning: (msg) => {
    setStatus({ text: msg, kind: 'info' });
    queueBubble(msg, 'info', { priority: 'normal' });
  },
  onError: (msg) => {
    setStatus({ text: msg, kind: 'error' });
    queueBubble(msg, 'error', { priority: 'normal' });
  }
});

btnAttachImg.addEventListener('click', () => imgFileInput.click());
imgFileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length) {
    imageHandler.handleFile(e.target.files[0]);
    imgFileInput.value = '';
  }
});

let contextGauge = null;

async function refreshContextGauge(currentInput = '') {
  if (!contextGauge || !api?.memory?.getMetrics) return;
  const metrics = await api.memory.getMetrics(currentInput || inputEl?.value || '');
  contextGauge.render(metrics);
}

if (api?.on?.memoryUpdated) {
  api.on.memoryUpdated((metrics) => {
    if (contextGauge) contextGauge.render(metrics);
  });
}

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

let ignoringMouse = true;
let dragging = false;

// Her "Üret"/"Uygula"/panodan üret/soru-cevaplama çağrısı ayrı bir genId
// alır. Sorun: gen:suggestions (ve done/error/questions) ana süreçte
// ÜRETIM BİTTİKTEN SONRA arka planda gelir; kullanıcı sonucu görür görmez
// hemen yeni bir "Üret" başlatırsa, ESKİ üretimin öneri çipleri az gecikmeli
// olarak DOM'a düşebilir. Tıklandığında applyInstruction() → mode:'refine'
// çalışır ve YENİ çıktıyı ESKİ bir düzeltme talimatıyla karıştırır —
// "bazen prompt düzeltme gibi çalışıyor" şikâyetinin kaynağı buydu. Ana
// süreç her gen:* olayında aynı genId'yi geri yansıtır; eşleşmeyen olaylar
// (artık geçersiz/eski üretime ait) sessizce yok sayılır.
let genSeq = 0;

function startGeneration(payload) {
  const genId = ++genSeq;
  return api.gen.start({ ...payload, genId });
}

let bubbleExitTimer = null;

/* ------------------------------------------------------------------ */
/* Bildirim kuyruğu — bkz. notificationQueue.js için tasarım gerekçesi */
/* ------------------------------------------------------------------ */

// notifyLevel eşiği: eşiğin altındaki öncelikler kuyruğa hiç girmez.
// 'high'/'critical' (başarı, hata, anahtar döngüsü) HER zaman geçer —
// minimal ayarda bile 3 eşiği high(3)/critical(4) için her zaman sağlanır.
// Yalnızca 'low'/'normal' (aşama tikleri, bilgi notları) filtrelenir.
function notifyThreshold(level) {
  return { minimal: 3, normal: 2, all: 1 }[level] ?? 2;
}

const bubbleQueue = new NotificationQueue({
  onShow(item, meta) {
    renderBubbleItem(item, meta);
    if (item.kind === 'success') setBadge('ok');
    if (item.kind === 'error') setBadge('error');
  },
  onHide() {
    if (bubbleExitTimer) clearTimeout(bubbleExitTimer);
    bubble.classList.remove('anim-enter', 'anim-pulse');
    bubble.classList.add('anim-exit');
    // Ani kesilme olmasın diye çıkış animasyonu bitene kadar bekleyip gizle.
    bubbleExitTimer = setTimeout(() => {
      bubble.hidden = true;
      bubble.classList.remove('anim-exit');
    }, 150);
  },
  onQueueChange(pending) {
    if (!bubbleQueueCountEl) return;
    bubbleQueueCountEl.hidden = pending <= 0;
    if (pending > 0) bubbleQueueCountEl.textContent = `+${pending}`;
  }
});

// "Düşünüyor…" / "Yazılıyor..." → "Düşünüyor" / "Yazılıyor"
// Tek nokta (cümle sonu) korunur; yalnızca üç nokta veya … kırpılır. CSS'teki
// döngüsel nokta animasyonuyla (::after, data-kind="thinking") çakışmasın diye.
function stripTrailingEllipsis(text) {
  return String(text || '').replace(/\s*(?:…|\.{2,})\s*$/, '');
}

function renderBubbleItem(item, meta) {
  if (bubbleExitTimer) {
    clearTimeout(bubbleExitTimer);
    bubbleExitTimer = null;
  }
  const animated = item.kind === 'thinking';
  bubbleText.textContent = animated ? stripTrailingEllipsis(item.text) : item.text;
  bubble.dataset.kind = item.kind;
  bubble.dataset.priority = item.priority;
  bubble.hidden = false;
  if (btnBubbleCopy) btnBubbleCopy.hidden = !state.output;

  // Giriş/güncelleme animasyonunu her seferinde yeniden tetikle — CSS
  // `animation`'ı sınıf zaten varsa tekrar çalıştırmaz, bu yüzden önce
  // kaldırıp reflow zorluyoruz (imageHandler.js'deki desenle tutarlı: küçük
  // ama yaygın bir CSS-yeniden-tetikleme tekniği).
  bubble.classList.remove('anim-enter', 'anim-pulse', 'anim-exit');
  void bubble.offsetWidth; // eslint-disable-line no-unused-expressions
  bubble.classList.add(meta.coalesced ? 'anim-pulse' : 'anim-enter');
}

/**
 * Bir olayı baloncuk kuyruğuna ekler — notifyLevel eşiğinin altındaysa
 * sessizce yok sayılır (kuyruğa hiç girmez, "boğulma" burada önlenir).
 *
 * @param {string} text
 * @param {string} kind idle|thinking|prep|info|success|error
 * @param {{priority?: string, dedupeKey?: string}} [extra]
 */
function queueBubble(text, kind, extra = {}) {
  const priority = extra.priority || KIND_PRIORITY[kind] || 'normal';
  const level = (state.settings && state.settings.notifyLevel) || 'normal';
  if (PRIORITY[priority] < notifyThreshold(level)) return;
  bubbleQueue.push({ text, kind, priority, dedupeKey: extra.dedupeKey || null });
}

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
  await startGeneration({ raw: text, mode: 'create' });
}

bubble.addEventListener('click', () => {
  if (state.hasResult && state.output) copyOutput(i18n.t('app.copiedToClipboard'));
  else setExpanded(true, true);
});

/* ------------------------------------------------------------------ */
/* Genişlet / küçült                                                   */
/* ------------------------------------------------------------------ */

// Panel açılırken kuyruğu sessizce temizle: .orb-layer zaten CSS ile
// solduruluyor, çıkış animasyonu gereksiz. Eski/düşük öncelikli bekleyen
// bildirimler (ör. bir aşama tiki) panel tekrar kapandığında aniden
// belirmesin diye bırakılmaz.
function resetBubbleUI() {
  bubbleQueue.reset();
  if (bubbleExitTimer) {
    clearTimeout(bubbleExitTimer);
    bubbleExitTimer = null;
  }
  bubble.classList.remove('anim-enter', 'anim-pulse', 'anim-exit');
  bubble.hidden = true;
  if (bubbleQueueCountEl) bubbleQueueCountEl.hidden = true;
}

function setExpanded(next, focus = false) {
  state.expanded = next;
  root.classList.toggle('expanded', next);
  root.classList.toggle('collapsed', !next);
  api.ui.setExpanded(next);
  if (next) {
    clearBadge();
    resetBubbleUI();
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

// `key`/`dedupeKey` main.js'den geliyorsa (bkz. gen:status payload'ı):
// açık bir dedupeKey verilmediyse ama olay yerelleştirilmiş bir `key`
// taşıyorsa (aşama tikleri: hazırlanıyor→düşünüyor→yazılıyor→cilalanıyor,
// devam ettirme sayaçları…) bunları tek bir "şu an ne oluyor" bilgisine
// bağlıyoruz — sonuç/hata gibi tekil olaylar asla bu gruba girmez.
function deriveDedupeKey({ kind, key, dedupeKey }) {
  if (dedupeKey) return dedupeKey;
  if (key && kind !== 'error' && kind !== 'success') return 'stage';
  return null;
}

function setStatus({ text, kind = 'idle', key, priority, dedupeKey }) {
  statusText.textContent = text;
  statusPill.dataset.kind = kind;

  if (!state.expanded) {
    queueBubble(text, kind, { priority, dedupeKey: deriveDedupeKey({ kind, key, dedupeKey }) });
  }
}

if (btnBubbleCopy) {
  btnBubbleCopy.addEventListener('click', (e) => {
    e.stopPropagation();
    copyOutput('Panoya kopyalandı');
  });
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
  const isPrompter = modeSel ? modeSel.value === 'prompt-preparer' : false;
  d.textContent = isPrompter
    ? (typeof i18n !== 'undefined' ? i18n.t('card.emptyPrompt', 'Üretilen prompt burada belirecek.') : 'Üretilen prompt burada belirecek.')
    : (typeof i18n !== 'undefined' ? i18n.t('card.emptyChat', 'Yanıt burada belirecek.') : 'Yanıt burada belirecek.');
  outputEl.appendChild(d);
  if (promptAssistUI) promptAssistUI.setContent('');
  updateBottomActionBarVisibility();
}

function startStage() {
  state.streaming = '';
  outputEl.textContent = '';
  const blocksContainer = $('promptBlocksContainer');
  if (blocksContainer) blocksContainer.hidden = true;
  outputEl.hidden = false;
  const caret = document.createElement('span');
  caret.className = 'caret';
  outputEl.appendChild(caret);
  updateBottomActionBarVisibility();
}

function appendToken(chunk) {
  state.streaming += chunk;
  const caret = outputEl.querySelector('.caret');
  const node = document.createTextNode(chunk);
  if (caret) outputEl.insertBefore(node, caret);
  else outputEl.appendChild(node);
  outputEl.scrollTop = outputEl.scrollHeight;
}

const multimodalRenderer = typeof MultimodalRenderer !== 'undefined' ? new MultimodalRenderer() : null;
let promptAssistUI = null;

function setOutput(text) {
  state.output = text;
  state.hasResult = !!text;
  if (!text) {
    renderEmpty();
    if (promptAssistUI) promptAssistUI.setContent('');
  } else if (multimodalRenderer && (text.includes('![') || text.includes('data:image/'))) {
    multimodalRenderer.render(outputEl, text);
    if (promptAssistUI) promptAssistUI.setContent('');
  } else {
    outputEl.textContent = text;
    if (promptAssistUI) promptAssistUI.setContent(text);
  }
  outputEl.scrollTop = 0;
  for (const id of ['btnCopy', 'btnCopyClose', 'btnRegen', 'btnRefine']) {
    const el = $(id);
    if (el) el.disabled = !text;
  }
  updateClearBtnVisibility();
  updateBottomActionBarVisibility();
}

/**
 * Kopyalama butonunda geçici checkmark ikonu ve yeşil ışıma mikro animasyonu tetikler.
 * Temporarily triggers a checkmark icon and green glow micro-animation on copy buttons.
 * @param {HTMLElement} btn
 */
function triggerCopySuccessAnimation(btn) {
  if (!btn) return;
  btn.classList.add('btn-copied-flash');
  const originalHtml = btn.getAttribute('data-orig-html') || btn.innerHTML;
  if (!btn.getAttribute('data-orig-html')) {
    btn.setAttribute('data-orig-html', originalHtml);
  }

  const checkSvg = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" class="anim-pop-check" style="margin-right:4px; vertical-align:-1px;"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>';
  const copiedLabel = typeof i18n !== 'undefined' ? i18n.t('card.copiedText', 'Kopyalandı!') : 'Kopyalandı!';

  btn.innerHTML = `${checkSvg}<span>${copiedLabel}</span>`;

  setTimeout(() => {
    btn.classList.remove('btn-copied-flash');
    const stored = btn.getAttribute('data-orig-html');
    if (stored) {
      btn.innerHTML = stored;
      btn.removeAttribute('data-orig-html');
    }
  }, 1400);
}

async function copyOutput(msg, triggeringBtn) {
  if (!state.output) return;
  const text = msg || i18n.t('app.copiedToClipboard');
  await api.clipboard.write(state.output);
  setStatus({ text, kind: 'success' });
  const btn = triggeringBtn || $('btnCopy');
  if (btn) triggerCopySuccessAnimation(btn);
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
  await startGeneration({
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
  await startGeneration({
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
  if (slashCommands && slashCommands.isCommand(raw)) {
    hideCommandSuggestions();
    inputEl.value = '';
    updateClearBtnVisibility();
    updateInputStats();
    await slashCommands.execute(raw);
    return;
  }
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
  await startGeneration({ raw, image, mode: 'create' });
}

async function applyRefine() {
  const instruction = refineEl.value.trim();
  if (!instruction) return;
  refineEl.value = '';
  await applyInstruction(instruction);
}

/**
 * Canlı karakter, kelime ve yaklaşık token istatistiğini hesaplar ve gösterir.
 * Calculates and renders live character, word, and estimated token stats.
 */
function updateInputStats() {
  const statsEl = $('inputStats');
  if (!statsEl || !inputEl) return;
  const val = inputEl.value;
  if (!val || !val.trim()) {
    statsEl.classList.remove('visible', 'warning');
    statsEl.textContent = '';
    return;
  }

  const charCount = val.length;
  const words = val.trim().split(/\s+/).filter(Boolean).length;
  const approxTokens = Math.max(1, Math.round(charCount / 4));

  const charLabel = typeof i18n !== 'undefined' ? i18n.t('card.statsChars', 'kr') : 'kr';
  const wordLabel = typeof i18n !== 'undefined' ? i18n.t('card.statsWords', 'kelime') : 'kelime';

  statsEl.textContent = `${charCount.toLocaleString()} ${charLabel} · ${words.toLocaleString()} ${wordLabel} · ~${approxTokens.toLocaleString()} tk`;
  statsEl.classList.add('visible');

  if (approxTokens > 2000) {
    statsEl.classList.add('warning');
  } else {
    statsEl.classList.remove('warning');
  }
}

$('btnGen').addEventListener('click', generate);
$('btnStop').addEventListener('click', () => api.gen.abort());
$('btnRegen').addEventListener('click', generate);
$('btnCopy').addEventListener('click', (e) => copyOutput(undefined, e.currentTarget));
$('btnCopyClose').addEventListener('click', async (e) => {
  await copyOutput(undefined, e.currentTarget);
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
  updateInputStats();
  inputEl.focus();
});

btnClearInput?.addEventListener('click', () => {
  if (state.busy) {
    api.gen.abort();
  }
  inputEl.value = '';
  state.lastInput = '';
  imageHandler.clearImage();
  setOutput('');
  hideSuggestions();
  hideQuestions();
  setStatus({ text: '', kind: 'info' });
  inputEl.focus();
  updateClearBtnVisibility();
  updateInputStats();
});

inputEl.addEventListener('input', () => {
  updateClearBtnVisibility();
  refreshContextGauge(inputEl.value);
  updateInputStats();
  handleCommandInput(inputEl.value);
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
    if (quickModelPickerPopover && !quickModelPickerPopover.hidden) {
      toggleQuickPicker(false);
    } else if (state.busy) {
      api.gen.abort();
    } else {
      setExpanded(false);
    }
  }
  if (e.key === 'c' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
    e.preventDefault();
    copyOutput();
  }
});

document.addEventListener('click', (e) => {
  if (quickModelPickerPopover && !quickModelPickerPopover.hidden && !quickModelPickerPopover.contains(e.target) && !btnQuickModelPicker?.contains(e.target)) {
    toggleQuickPicker(false);
  }
  hideCommandSuggestions();
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
  const prov = (state.providers || []).find((p) => p.id === s.provider);
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

function getModelConfig(provider, model) {
  const p = String(provider || '').toLowerCase();
  const m = String(model || '').toLowerCase();

  // Explicit non-vision checks
  if (p === 'deepseek' || m.includes('deepseek-chat') || m.includes('deepseek-coder') || m.includes('deepseek-reasoner')) {
    if (!m.includes('vl')) {
      return { id: model, name: model, supportsVision: false, maxImagesAllowed: 0 };
    }
  }

  if (m.startsWith('gpt-3.5') || m === 'gpt-4' || m === 'gpt-4-0314' || m === 'gpt-4-0613') {
    return { id: model, name: model, supportsVision: false, maxImagesAllowed: 0 };
  }

  // Vision detection rules
  let supportsVision = false;
  let maxImagesAllowed = 5;

  if (p === 'gemini' || m.includes('gemini')) {
    supportsVision = true;
    maxImagesAllowed = 10;
  } else if (p === 'anthropic' || m.includes('claude-3') || m.includes('claude-opus') || m.includes('claude-sonnet') || m.includes('claude-haiku')) {
    supportsVision = true;
    maxImagesAllowed = 5;
  } else if (m.includes('4o') || m.includes('vision') || m.includes('llava') || m.includes('bakllava') || m.includes('moondream') || m.includes('vl') || m.includes('minicpm-v')) {
    supportsVision = true;
    maxImagesAllowed = 5;
  } else if (p === 'openai' && (m.includes('gpt-4') || m.includes('o1') || m.includes('o3') || m.includes('chatgpt-4o'))) {
    supportsVision = true;
    maxImagesAllowed = 5;
  } else if (p === 'ollama' || p === 'lmstudio') {
    supportsVision = /(vision|llava|bakllava|moondream|minicpm-v|vl)/i.test(m);
    maxImagesAllowed = supportsVision ? 1 : 0;
  }

  return {
    id: model || 'unknown',
    name: model || 'Unknown Model',
    supportsVision,
    maxImagesAllowed: supportsVision ? maxImagesAllowed : 0
  };
}

const themeManager = typeof ThemeManager !== 'undefined' ? new ThemeManager() : null;

function applySettings(s) {
  state.settings = s;
  if (themeManager) {
    themeManager.applyTheme(s.theme || 'dark', s.accent || 'sunset');
  }
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
  if (promptAssistUI && modeSel) {
    promptAssistUI.setMode(modeSel.value, s.enablePromptAssist !== false);
  }
  if (imageHandler) {
    const config = getModelConfig(s.provider, s.model);
    imageHandler.setModelConfig(config);
  }
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
  // priority: 'normal' açıkça veriliyor — kind='thinking' yalnızca görsel
  // nokta animasyonu için, öncelik olarak 'low'a düşmesin diye (bu mesaj
  // sıradan bir aşama tiki değil, kullanıcının bilmesi gereken bir karar).
  if (res.decision === 'DEEP_MODE') {
    queueBubble(i18n.t('card.autoDecisionDeep'), 'thinking', { priority: 'normal' });
  } else if (res.decision === 'CLARIFICATION') {
    queueBubble(i18n.t('card.autoDecisionClarify'), 'info', { priority: 'normal' });
  }
});

// gen:done/error/questions/suggestions ana süreçten ASENKRON olarak gelir —
// aralarında kullanıcı YENİ bir üretim başlatmış olabilir. `genId` uyuşmuyorsa
// bu olay artık geçersiz (eski) bir üretime ait; state.output/DOM'u bozmadan
// sessizce yok say. Bkz. genSeq/startGeneration tanımının üstündeki not.
function isStaleGen(genId) {
  return genId !== undefined && genId !== genSeq;
}

api.on.questions(({ questions, genId }) => {
  if (isStaleGen(genId)) return;
  showQuestions(questions);
  // Akış cevap bekliyor; panel kapalıysa kendiliğinden açılmalı.
  if (!state.expanded) setExpanded(true);
});

api.on.suggestions((data) => {
  if (isStaleGen(data.genId)) return;
  renderSuggestions(data);
});

api.on.done(({ output, copied, genId }) => {
  if (isStaleGen(genId)) return;
  setOutput(output);
  // Rozet artık bubbleQueue.onShow içinde ayarlanıyor — bu öğe fiilen
  // gösterildiği anda (kesme/kuyruk nedeniyle hemen olmayabilir).
  if (!state.expanded) {
    queueBubble(copied ? i18n.t('app.bubbleCopied') : i18n.t('app.bubbleReady'), 'success');
  }
});

api.on.error(({ message, genId }) => {
  if (isStaleGen(genId)) return;
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
  queueBubble(message.split('\n')[0], 'error');
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
    resetBubbleUI();
  }
});

api.on.focusInput(() => setTimeout(() => inputEl.focus(), 60));

api.on.fillInput((text) => {
  inputEl.value = text;
  state.lastInput = text;
  updateClearBtnVisibility();
  updateInputStats();
});

api.on.loadEntry((item) => {
  hideQuestions();
  hideSuggestions();
  inputEl.value = item.input || '';
  state.lastInput = item.input || '';
  setOutput(item.output || '');
  setStatus({ text: i18n.t('app.loadedFromHistory'), kind: 'info' });
  updateClearBtnVisibility();
  updateInputStats();
});

api.on.settingsChanged(async (s) => {
  if (api.providers?.catalog) {
    state.providers = await api.providers.catalog();
  }
  applySettings(s);
});
api.on.projectsChanged(async () => {
  await populateProjects();
  await refreshContextGauge();
});
api.on.modeChanged(() => populateModes());

if (api.on.providersChanged) {
  api.on.providersChanged(async () => {
    if (api.providers?.catalog) {
      state.providers = await api.providers.catalog();
    }
    renderMeta();
  });
}

const projectSel = $('projectSelect');
const modeSel = $('modeSelect');

function updateModeLayout(modeId) {
  const isPrompter = modeId === 'prompt-preparer';
  const isChat = !isPrompter;

  // Prompt biçim seçicisi (Detaylı, Kısa & Net...)
  if (styleSel) styleSel.hidden = isChat;

  // Prompt hazırlama çipleri (Derin mod, Oto mod, Soru sor)
  if (deepBtn) deepBtn.hidden = isChat;
  if (autoModeBtn) autoModeBtn.hidden = isChat;
  if (clarifyBtn) clarifyBtn.hidden = isChat;

  // Çıktı başlığı ("Prompt" vs "Yanıt")
  const outLabel = $('outputLabel') || document.querySelector('label[for="output"]');
  if (outLabel) {
    outLabel.textContent = isPrompter
      ? (typeof i18n !== 'undefined' ? i18n.t('card.promptOutputLabel', 'Prompt') : 'Prompt')
      : (typeof i18n !== 'undefined' ? i18n.t('card.chatOutputLabel', 'Yanıt') : 'Yanıt');
  }

  // Giriş placeholder'ı
  if (inputEl) {
    inputEl.placeholder = isPrompter
      ? (typeof i18n !== 'undefined' ? i18n.t('card.inputPlaceholder') : 'Ne istediğinizi yazın veya UI tasarım görseli yükleyin.\nCtrl+Enter → üret')
      : (typeof i18n !== 'undefined' ? i18n.t('card.chatInputPlaceholder', 'Mesajınızı yazın...\nCtrl+Enter → gönder') : 'Mesajınızı yazın...\nCtrl+Enter → gönder');
  }

  // Buton metni ("Gönder" vs "Üret")
  const genBtnSpan = document.querySelector('#btnGen span');
  if (genBtnSpan) {
    genBtnSpan.textContent = isPrompter
      ? (typeof i18n !== 'undefined' ? i18n.t('card.btnGenerate', 'Üret') : 'Üret')
      : (typeof i18n !== 'undefined' ? i18n.t('card.btnSend', 'Gönder') : 'Gönder');
  }

  // Boşsa placeholder'ı güncelle
  if (!state.output) {
    renderEmpty();
  }

  // Prompt Assist açma/kapama
  if (promptAssistUI) {
    promptAssistUI.setMode(modeId, state.settings?.enablePromptAssist !== false);
  }
}

async function populateModes() {
  if (!modeSel) return;
  const catalog = await api.modes.catalog();
  const activeMode = await api.modes.getActive();

  modeSel.innerHTML = '';
  for (const m of catalog) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.labelKey ? (i18n.t(m.labelKey) || m.id) : m.name;
    if (m.id === activeMode) opt.selected = true;
    modeSel.appendChild(opt);
  }

  updateModeLayout(activeMode);
}

if (modeSel) {
  modeSel.addEventListener('change', async (e) => {
    const mode = e.target.value;
    updateModeLayout(mode);
    await api.modes.setActive(mode);
  });
}

async function populateProjects() {
  if (!projectSel) return;
  const list = await api.projects.list();
  const activeObj = await api.projects.getActive();
  const activeId = activeObj ? activeObj.id : '';

  projectSel.innerHTML = '';

  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = i18n.t('projects.chipNoProject');
  projectSel.appendChild(noneOpt);

  for (const p of list) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
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
    await refreshContextGauge();
  });
}

const tokenCounterEl = $('tokenCounter');

function updateTokenCounter(stats) {
  if (!tokenCounterEl) return;
  const last = Number(stats?.lastTokens) || 0;
  const total = Number(stats?.sessionTotal) || 0;
  const fmt = (n) => n.toLocaleString();
  tokenCounterEl.textContent = `Tokens: ${fmt(last)}`;
  tokenCounterEl.title = `Son istek: ${fmt(last)} token · Oturum Toplamı: ${fmt(total)} token`;
}

if (api.on.tokensUpdated) {
  api.on.tokensUpdated((stats) => updateTokenCounter(stats));
}

function handleCommandInput(val) {
  const overlay = $('commandSuggestionsOverlay');
  if (!overlay || !slashCommands) return;
  const trimmed = val.trim();
  if (trimmed.startsWith('/')) {
    const suggestions = slashCommands.getSuggestions(trimmed);
    if (suggestions.length > 0) {
      overlay.innerHTML = suggestions.map((s) => `
        <div class="command-suggestion-item" data-name="${s.name}">
          <span class="command-item-name">${s.usage}</span>
          <span class="command-item-desc">${escapeHtml(s.description)}</span>
        </div>
      `).join('');
      overlay.querySelectorAll('.command-suggestion-item').forEach((item) => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const name = item.dataset.name;
          inputEl.value = `${name} `;
          inputEl.focus();
          hideCommandSuggestions();
        });
      });
      overlay.hidden = false;
      return;
    }
  }
  hideCommandSuggestions();
}

function hideCommandSuggestions() {
  const overlay = $('commandSuggestionsOverlay');
  if (overlay) overlay.hidden = true;
}

async function toggleQuickPicker(force) {
  if (!quickModelPickerPopover) return;
  const show = typeof force === 'boolean' ? force : quickModelPickerPopover.hidden;
  if (show) {
    expandedGroups.clear();
    quickModelPickerPopover.hidden = false;
    await populateQuickPicker();
    if (quickModelSearch) {
      quickModelSearch.value = '';
      setTimeout(() => quickModelSearch.focus(), 50);
    }
  } else {
    quickModelPickerPopover.hidden = true;
  }
}

async function populateQuickPicker() {
  if (!quickProviderSel) return;
  if (!state.settings) state.settings = await api.settings.get();
  if (!state.providers || !state.providers.length) state.providers = await api.providers.catalog();

  const currentProvider = state.settings.provider;
  const currentModel = state.settings.model;

  quickProviderSel.innerHTML = '';
  (state.providers || []).forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    if (p.id === currentProvider) opt.selected = true;
    quickProviderSel.appendChild(opt);
  });

  await updateQuickModels(currentProvider, currentModel);
}

function groupAndFilterModels(models, filterQuery, activeModel) {
  const query = (filterQuery || '').trim().toLowerCase();
  const groups = {};

  models.forEach((m) => {
    const id = typeof m === 'string' ? m : (m.id || m.name || '');
    if (!id) return;

    if (query && !id.toLowerCase().includes(query)) {
      return;
    }

    let groupName = 'GENEL';
    let displayName = id;

    if (id.includes('/')) {
      const parts = id.split('/');
      groupName = parts[0].toUpperCase();
      displayName = parts.slice(1).join('/');
    } else if (id.startsWith('gemini-') || id.startsWith('deep-research') || id.startsWith('antigravity')) {
      groupName = 'GOOGLE GEMINI';
      displayName = id;
    } else if (id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('chatgpt')) {
      groupName = 'OPENAI';
      displayName = id;
    } else if (id.startsWith('claude-')) {
      groupName = 'ANTHROPIC';
      displayName = id;
    } else if (id.includes(':')) {
      const parts = id.split(':');
      groupName = parts[0].toUpperCase();
      displayName = id;
    }

    if (!groups[groupName]) {
      groups[groupName] = [];
    }
    groups[groupName].push({
      id,
      displayName,
      isActive: id === activeModel
    });
  });

  return groups;
}

const expandedGroups = new Set();

function renderQuickModelList(models, filterQuery, activeModel, onSelect) {
  if (!quickModelList) return;
  quickModelList.innerHTML = '';

  const groups = groupAndFilterModels(models, filterQuery, activeModel);
  const groupKeys = Object.keys(groups).sort((a, b) => {
    if (a === 'GENEL') return 1;
    if (b === 'GENEL') return -1;
    return a.localeCompare(b);
  });

  if (groupKeys.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'quick-model-empty';
    emptyEl.textContent = filterQuery ? `"${filterQuery}" ile eşleşen model bulunamadı.` : 'Model bulunamadı.';
    quickModelList.appendChild(emptyEl);
  } else {
    groupKeys.forEach((grp) => {
      const items = groups[grp];
      // Arama yapılıyorsa otomatik açık tut, arama yoksa varsayılan olarak daraltılmış (kapalı) başlasın
      const isExpanded = filterQuery ? true : expandedGroups.has(grp);
      const isCollapsed = !isExpanded;

      const grpEl = document.createElement('div');
      grpEl.className = `quick-group-header${isCollapsed ? ' collapsed' : ''}`;
      grpEl.title = 'Genişlet / Daralt';
      grpEl.innerHTML = `
        <div class="quick-group-left">
          <svg class="quick-group-chevron" viewBox="0 0 16 16">
            <path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"/>
          </svg>
          <span class="quick-group-title">📁 ${grp}</span>
        </div>
        <span class="quick-group-count">${items.length}</span>
      `;

      const itemsContainer = document.createElement('div');
      itemsContainer.className = `quick-group-items${isCollapsed ? ' collapsed' : ''}`;

      grpEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (expandedGroups.has(grp)) {
          expandedGroups.delete(grp);
        } else {
          expandedGroups.add(grp);
        }
        const nowExpanded = expandedGroups.has(grp);
        grpEl.classList.toggle('collapsed', !nowExpanded);
        itemsContainer.classList.toggle('collapsed', !nowExpanded);
      });

      quickModelList.appendChild(grpEl);

      items.forEach((item) => {
        const itemEl = document.createElement('div');
        itemEl.className = `quick-model-item${item.isActive ? ' active' : ''}`;
        itemEl.title = item.id;
        itemEl.innerHTML = `
          <span class="quick-model-name">${item.displayName}</span>
          ${item.isActive ? '<span class="quick-model-badge">Aktif</span>' : ''}
        `;
        itemEl.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelect(item.id);
        });
        itemsContainer.appendChild(itemEl);
      });

      quickModelList.appendChild(itemsContainer);
    });
  }

  // Özel model ekleme/yazma seçeneği
  const customBtn = document.createElement('div');
  customBtn.className = 'quick-custom-btn';
  customBtn.innerHTML = `<span>✏️</span><span>${filterQuery ? `"${filterQuery}" modelini kullan` : 'Elle özel model adı girin...'}</span>`;
  customBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (filterQuery) {
      onSelect(filterQuery);
    } else if (quickModelCustom) {
      quickModelCustom.hidden = false;
      quickModelCustom.focus();
    }
  });
  quickModelList.appendChild(customBtn);
}

async function updateQuickModels(providerId, targetModel) {
  quickActiveProvider = providerId;
  if (quickModelList) {
    quickModelList.innerHTML = '<div class="quick-model-empty">Yükleniyor…</div>';
  }

  try {
    const res = await api.providers.models(providerId);
    const rawList = Array.isArray(res) ? res : (res?.ok && Array.isArray(res.models) ? res.models : []);

    quickModelsCache = rawList.map((m) => {
      if (typeof m === 'string') return m.trim();
      return (m.id || m.name || '').trim();
    }).filter(Boolean);

    // Sağlayıcıya özel model hatırlama — başka sağlayıcının modeli içeri sızmaz
    const remembered = state.settings?.modelByProvider?.[providerId] || '';
    let resolved = (targetModel && quickModelsCache.includes(targetModel))
      ? targetModel
      : (remembered && quickModelsCache.includes(remembered) ? remembered : (quickModelsCache[0] || targetModel || ''));

    quickActiveModel = resolved;

    const selectModelHandler = async (chosenModel) => {
      quickActiveModel = chosenModel;
      if (quickModelCustom) quickModelCustom.hidden = true;
      const patch = {
        provider: providerId,
        model: chosenModel,
        modelByProvider: { ...(state.settings?.modelByProvider || {}), [providerId]: chosenModel }
      };
      const updated = await api.settings.set(patch);
      applySettings(updated);
      toggleQuickPicker(false);
      setStatus({ text: `${i18n.t('app.ready')} (${chosenModel})`, kind: 'success' });
    };

    renderQuickModelList(quickModelsCache, quickModelSearch?.value || '', quickActiveModel, selectModelHandler);
    return resolved;
  } catch {
    quickModelsCache = [];
    renderQuickModelList([], '', targetModel, async (chosenModel) => {
      const patch = {
        provider: providerId,
        model: chosenModel,
        modelByProvider: { ...(state.settings?.modelByProvider || {}), [providerId]: chosenModel }
      };
      const updated = await api.settings.set(patch);
      applySettings(updated);
      toggleQuickPicker(false);
    });
    return targetModel || '';
  }
}

function initQuickModelPicker() {
  btnQuickModelPicker?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await toggleQuickPicker();
  });

  btnCloseQuickPicker?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleQuickPicker(false);
  });

  // Popover içi tıklamaların dışarı sızmasını engelle
  quickModelPickerPopover?.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Dışarı tıklandığında popover'ı kapat
  document.addEventListener('click', (e) => {
    if (!quickModelPickerPopover || quickModelPickerPopover.hidden) return;
    if (!quickModelPickerPopover.contains(e.target) && !btnQuickModelPicker?.contains(e.target)) {
      toggleQuickPicker(false);
    }
  });

  quickModelSearch?.addEventListener('input', () => {
    const q = quickModelSearch.value;
    renderQuickModelList(quickModelsCache, q, quickActiveModel, async (chosenModel) => {
      quickActiveModel = chosenModel;
      if (quickModelCustom) quickModelCustom.hidden = true;
      const patch = {
        provider: quickActiveProvider,
        model: chosenModel,
        modelByProvider: { ...(state.settings?.modelByProvider || {}), [quickActiveProvider]: chosenModel }
      };
      const updated = await api.settings.set(patch);
      applySettings(updated);
      toggleQuickPicker(false);
      setStatus({ text: `${i18n.t('app.ready')} (${chosenModel})`, kind: 'success' });
    });
  });

  quickModelSearch?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = quickModelSearch.value.trim();
      if (q) {
        quickActiveModel = q;
        const patch = {
          provider: quickActiveProvider,
          model: q,
          modelByProvider: { ...(state.settings?.modelByProvider || {}), [quickActiveProvider]: q }
        };
        const updated = await api.settings.set(patch);
        applySettings(updated);
        toggleQuickPicker(false);
        setStatus({ text: `${i18n.t('app.ready')} (${q})`, kind: 'success' });
      }
    }
  });

  quickProviderSel?.addEventListener('change', async () => {
    const provId = quickProviderSel.value;
    if (!provId) return;
    expandedGroups.clear();
    const rememberedModel = state.settings?.modelByProvider?.[provId] || '';
    const newModel = await updateQuickModels(provId, rememberedModel);
    const patch = {
      provider: provId,
      model: newModel,
      modelByProvider: { ...(state.settings?.modelByProvider || {}), [provId]: newModel }
    };
    const updated = await api.settings.set(patch);
    applySettings(updated);
    setStatus({ text: `${i18n.t('app.ready')} (${newModel || provId})`, kind: 'success' });
  });

  const applyCustomModel = async () => {
    const customVal = quickModelCustom ? quickModelCustom.value.trim() : '';
    if (customVal && customVal !== state.settings?.model) {
      const patch = {
        provider: quickActiveProvider,
        model: customVal,
        modelByProvider: { ...(state.settings?.modelByProvider || {}), [quickActiveProvider]: customVal }
      };
      const updated = await api.settings.set(patch);
      applySettings(updated);
      toggleQuickPicker(false);
      setStatus({ text: `${i18n.t('app.ready')} (${customVal})`, kind: 'success' });
    }
  };

  quickModelCustom?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await applyCustomModel();
    }
  });

  quickModelCustom?.addEventListener('blur', applyCustomModel);
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
  await populateModes();
  if (api.tokens && api.tokens.get) {
    const stats = await api.tokens.get();
    updateTokenCounter(stats);
  }
  const gaugeEl = $('contextGauge');
  if (gaugeEl && typeof ContextGauge !== 'undefined') {
    contextGauge = new ContextGauge(gaugeEl, { api, i18n });
    await refreshContextGauge();
  }

  if (typeof PromptAssistUI !== 'undefined') {
    promptAssistUI = new PromptAssistUI({
      toolbar: $('assistToolbar'),
      tabsContainer: $('variationTabs'),
      blocksContainer: $('promptBlocksContainer'),
      rawTextarea: outputEl,
      toggleViewBtn: $('btnToggleViewMode'),
      shuffleBtn: $('btnShuffleTriad')
    }, {
      api,
      i18n,
      onPromptChange: (updatedText) => {
        state.output = updatedText;
        for (const id of ['btnCopy', 'btnCopyClose', 'btnRegen', 'btnRefine']) {
          const el = $(id);
          if (el) el.disabled = !updatedText;
        }
      },
      onVariationSelect: async (strategy) => {
        const raw = state.lastInput || inputEl.value.trim();
        if (raw) {
          await startGeneration({
            raw,
            image: imageHandler.getImage(),
            mode: 'create',
            styleOverride: strategy.style || 'detailed'
          });
        }
      }
    });
    // İlk yüklemede aktif moda ve ayara göre açma/kapama / Set initial mode & setting
    const initialMode = await api.modes.getActive();
    await promptAssistUI.setMode(initialMode, settings.enablePromptAssist !== false);
  }

  if (typeof SlashCommandEngine !== 'undefined') {
    slashCommands = new SlashCommandEngine({
      api,
      i18n,
      onOutput: (text, isSuccess) => {
        setOutput(text);
        setStatus({ text: isSuccess ? i18n.t('app.ready') : 'Tamamlandı', kind: isSuccess ? 'success' : 'info' });
      },
      onStatus: (st) => setStatus(st),
      onSettingsChange: async () => {
        const newSettings = await api.settings.get();
        applySettings(newSettings);
      }
    });
  }

  initQuickModelPicker();
  renderEmpty();
  setStatus({ text: settings.model ? i18n.t('app.ready') : i18n.t('app.selectModel'), kind: settings.model ? 'idle' : 'info' });
})();
