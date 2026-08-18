'use strict';

const api = window.sparky;
const $ = (id) => document.getElementById(id);

let settings = null;
let providers = [];
let historyItems = [];
let savedTimer = null;
let projectUI = null;
let modeUI = null;

// XSS-güvenli metin → HTML dönüştürücü. projectUI.js'teki global tanıma
// bağımlılığı kırmak için yerel kopya.
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str || '');
  return div.innerHTML;
}

function renderProjects() {
  if (!projectUI && typeof ProjectUI !== 'undefined') {
    projectUI = new ProjectUI(api, typeof i18n !== 'undefined' ? i18n : { t: (k) => k });
  }
  if (projectUI) projectUI.render();
}

function renderModes() {
  if (!modeUI && typeof ModeUI !== 'undefined') {
    modeUI = new ModeUI(api, typeof i18n !== 'undefined' ? i18n : { t: (k) => k });
  }
  if (modeUI) modeUI.render();
}

/* ------------------------------------------------------------------ */
/* Pencere ve sekmeler                                                 */
/* ------------------------------------------------------------------ */

document.querySelectorAll('[data-win]').forEach((b) =>
  b.addEventListener('click', () => api.ui.panelWindow(b.dataset.win))
);

function showTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'history') loadHistory();
  if (name === 'projects') renderProjects();
  if (name === 'modes') renderModes();
}

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
const initialTab = new URLSearchParams(window.location.search).get('tab') || 'settings';
showTab(initialTab);
api.on.panelTab((tab) => showTab(tab || 'settings'));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    api.ui.panelWindow('close');
  }
});

/* ------------------------------------------------------------------ */
/* Kaydetme yardımcıları                                               */
/* ------------------------------------------------------------------ */

function flashSaved() {
  const tag = $('savedTag');
  tag.hidden = false;
  if (savedTimer) clearTimeout(savedTimer);
  savedTimer = setTimeout(() => {
    tag.hidden = true;
  }, 1400);
}

async function save(patch) {
  settings = await api.settings.patch(patch);
  flashSaved();
  return settings;
}

function showResult(el, text, kind) {
  el.hidden = false;
  el.textContent = text;
  // .result.err / .result.warn / .result.ok — panel.css'teki gerçek sınıf
  // adlarıyla eşleşmeli. Çağıranlar 'bad' geçiyor, CSS 'err' bekliyor.
  const cls = kind === 'bad' ? 'err' : kind === 'warn' ? 'warn' : kind === 'ok' ? 'ok' : '';
  el.className = `result${cls ? ' ' + cls : ''}`;
}

/* ------------------------------------------------------------------ */
/* Sağlayıcı / model                                                   */
/* ------------------------------------------------------------------ */

function currentProvider() {
  return providers.find((p) => p.id === settings.provider) || providers[0];
}

function renderProviderFields() {
  const p = currentProvider();
  if (!p) return;
  $('provider').value = p.id;
  $('endpoint').value = settings.endpoints?.[p.id] ?? p.defaultEndpoint ?? '';
  $('endpoint').disabled = false;
  $('endpointHint').textContent = p.id === 'anthropic'
    ? (typeof i18n !== 'undefined' ? i18n.t('provider.anthropicEndpointHint') : p.endpointHint || '')
    : (p.endpointHint || '');
  $('providerHint').textContent = p.needsKey
    ? (typeof i18n !== 'undefined' ? i18n.t('panel.fields.needsKey') : 'Bu sağlayıcı için API anahtarı gerekiyor.')
    : (typeof i18n !== 'undefined' ? i18n.t('panel.fields.localNoKey') : 'Yerel sunucu — API anahtarı gerekmez.');
  $('testResult').hidden = true;

  // Özel sağlayıcı silme butonu / Delete button for custom providers
  const existingDel = document.getElementById('btnDeleteCustomProvider');
  if (existingDel) existingDel.remove();
  if (p.custom) {
    const delBtn = document.createElement('button');
    delBtn.id = 'btnDeleteCustomProvider';
    delBtn.className = 'btn danger sm';
    delBtn.textContent = T('customProvider.deleteBtn', 'Sil');
    delBtn.title = p.label;
    delBtn.addEventListener('click', async () => {
      const msg = T('customProvider.deleteConfirm', 'Bu özel sağlayıcı ve tüm anahtarları silinecek. Devam etmek istiyor musunuz?');
      if (!confirm(msg)) return;
      const res = await api.providers.removeCustom(p.id);
      if (res.ok) {
        settings = await api.settings.get();
        providers = await api.providers.catalog();
        populateProviderSelect();
        renderProviderFields();
        renderKeys();
        loadModels({ silent: true });
      }
    });
    // Sağlayıcı <select> yanına ekle / Insert next to provider select
    const providerInline = $('provider').parentElement;
    if (providerInline) providerInline.appendChild(delBtn);
  }
}

async function loadModels({ silent = false } = {}) {
  const sel = $('model');
  sel.innerHTML = '';
  const loading = document.createElement('option');
  loading.textContent = typeof i18n !== 'undefined' ? i18n.t('panel.fields.testingConnection') : 'yükleniyor…';
  sel.appendChild(loading);
  sel.disabled = true;

  const res = await api.providers.models(settings.provider);
  sel.innerHTML = '';
  sel.disabled = false;

  if (!res.ok) {
    const opt = document.createElement('option');
    opt.value = settings.model || '';
    opt.textContent = settings.model || (typeof i18n !== 'undefined' ? i18n.t('panel.fields.noListRetrieved') : '— liste alınamadı —');
    sel.appendChild(opt);
    if (!silent) showResult($('testResult'), res.error, 'bad');
    return;
  }

  if (!res.models.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = typeof i18n !== 'undefined' ? i18n.t('panel.fields.noModelsFound') : '— model bulunamadı —';
    sel.appendChild(opt);
    return;
  }

  const remembered = settings.modelByProvider?.[settings.provider];
  const wanted = settings.model && res.models.includes(settings.model) ? settings.model : remembered;

  for (const m of res.models) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    sel.appendChild(opt);
  }

  const pick = res.models.includes(wanted) ? wanted : res.models[0];
  sel.value = pick;
  if (pick !== settings.model) {
    await save({ model: pick, modelByProvider: { [settings.provider]: pick } });
  }
}

$('provider').addEventListener('change', async () => {
  const id = $('provider').value;
  const remembered = settings.modelByProvider?.[id] || '';
  await save({ provider: id, model: remembered });
  renderProviderFields();
  renderKeys();
  loadModels({ silent: true });
});

$('endpoint').addEventListener('change', async () => {
  await save({ endpoints: { [settings.provider]: $('endpoint').value.trim() } });
  providers = await api.providers.catalog();
  loadModels({ silent: true });
});

$('model').addEventListener('change', () =>
  save({ model: $('model').value, modelByProvider: { [settings.provider]: $('model').value } })
);

$('modelManual').addEventListener('change', async () => {
  const v = $('modelManual').value.trim();
  if (!v) return;
  await save({ model: v, modelByProvider: { [settings.provider]: v } });
  const sel = $('model');
  const opt = document.createElement('option');
  opt.value = v;
  opt.textContent = v;
  sel.appendChild(opt);
  sel.value = v;
  $('modelManual').value = '';
});

$('btnModels').addEventListener('click', () => loadModels());

$('btnTest').addEventListener('click', async () => {
  const el = $('testResult');
  const testingMsg = typeof i18n !== 'undefined' ? i18n.t('panel.fields.testingConnection') : 'Bağlanılıyor…';
  showResult(el, testingMsg, 'warn');
  const res = await api.providers.test(settings.provider);
  if (res.ok) {
    const successMsg = typeof i18n !== 'undefined' ? i18n.t('panel.fields.connectionSuccess', { count: res.count }) : `Bağlantı başarılı. ${res.count} model bulundu.`;
    showResult(el, `${successMsg}\n${res.sample.join(', ')}`, 'ok');
  } else {
    showResult(el, res.error, 'bad');
  }
});

$('btnProbe').addEventListener('click', async () => {
  const found = await api.providers.probe();
  const el = $('testResult');
  if (!found.length) {
    const notFoundMsg = typeof i18n !== 'undefined' ? i18n.t('panel.fields.localNotFound') : 'Çalışan yerel sunucu bulunamadı.';
    showResult(el, notFoundMsg, 'warn');
    return;
  }
  const names = found.map((f) => providers.find((p) => p.id === f)?.label || f);
  const foundMsg = typeof i18n !== 'undefined' ? i18n.t('panel.fields.probeFound', { names: names.join(', ') }) : `Bulundu: ${names.join(', ')}`;
  showResult(el, foundMsg, 'ok');
  if (!found.includes(settings.provider)) {
    await save({ provider: found[0] });
    renderProviderFields();
    renderKeys();
    loadModels({ silent: true });
  }
});

/* ------------------------------------------------------------------ */
/* API anahtarları                                                     */
/* ------------------------------------------------------------------ */

const T = (key, fallback, params) =>
  typeof i18n !== 'undefined' ? i18n.t(key, params) : fallback;

// Anahtar durumu -> rozet metni + CSS sınıfı. apiKeyRotator.js'deki STATE
// değerleriyle birebir eşleşir ('active' | 'rate_limited' | 'invalid').
function keyStateBadge(k) {
  if (k.state === 'rate_limited') {
    const secs = Math.ceil((k.cooldownMs || 0) / 1000);
    return { text: T('panel.fields.keyStateLimited', 'Limit aşımında', { secs }), cls: 'warn' };
  }
  if (k.state === 'invalid') {
    return { text: T('panel.fields.keyStateInvalid', 'Geçersiz'), cls: 'bad' };
  }
  return { text: T('panel.fields.keyStateActive', 'Aktif'), cls: 'ok' };
}

// renderKeys() her mutasyonda İKİ yerden tetikleniyordu: hem tıklama
// olayının kendisinden, hem de main sürecin yaydığı 'secrets:changed'
// olayından. İkisi de bağımsız async çağrılar olduğu için ilki hâlâ bir
// `await` üstünde asılıyken ikincisi başlayıp #keys'i temizliyor, sonra
// ilki uyanıp KENDİ bölümlerini de ekliyordu — sonuç: her sağlayıcı iki kez
// render ediliyordu. Kalıcı çözüm iki parçalı:
//   1) DOM'a yazmadan ÖNCE tüm veriyi bekle, tek seferde temizle+ekle
//      (bu, yarı-boş DOM aralığını ortadan kaldırır)
//   2) Sıra numarası (token) koruması: bir çağrı beklerken üzerine yeni bir
//      çağrı başlarsa, ESKİ çağrı bitince DOM'a hiç dokunmaz.
// Ayrıca her mutasyon zaten 'secrets:changed' yayınladığı için tıklama
// olaylarındaki doğrudan renderKeys() çağrıları kaldırıldı — çifte tetikleme
// kaynağın kendisinde kesiliyor, token koruması yalnızca güvenlik ağı.
let renderKeysToken = 0;

function buildKeySection(p, keys, rotator) {
  const providerLabel = p.id === 'custom' ? T('provider.customLabel', p.label) : p.label;
  const providerKeyHint = p.id === 'custom' ? T('provider.customKeyHint', p.keyHint || '') : p.keyHint || '';
  const cooldownById = new Map((rotator?.keys || []).map((k) => [k.id, k]));

  const section = document.createElement('details');
  section.className = 'keygroup-details';
  if (p.id === settings?.provider || keys.length > 0) {
    section.open = true;
  }

  const summary = document.createElement('summary');
  summary.className = 'keygroup-summary';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'keygroup-title-group';

  const chevron = document.createElement('span');
  chevron.className = 'keygroup-chevron';
  chevron.textContent = '▾';
  titleGroup.appendChild(chevron);

  const title = document.createElement('span');
  title.className = 'name';
  title.textContent = providerLabel;
  title.title = providerKeyHint;
  titleGroup.appendChild(title);

  const countTag = document.createElement('span');
  countTag.className = `keycount${keys.some((k) => k.active) ? ' is-active-key' : ''}`;
  countTag.textContent = keys.length
    ? T('panel.fields.keyCount', '{n} anahtar', { n: keys.length })
    : T('panel.fields.noKeysShort', '0 anahtar');
  titleGroup.appendChild(countTag);

  summary.appendChild(titleGroup);

  if (keys.length > 1) {
    const rotateBtn = document.createElement('button');
    rotateBtn.className = 'btn ghost sm';
    rotateBtn.textContent = T('panel.fields.btnRotateNext', 'Sıradakine geç');
    rotateBtn.title = T('panel.fields.btnRotateNextHint', 'Aktif anahtarı listedeki bir sonrakiyle değiştir');
    rotateBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = await api.secrets.rotateNext(p.id);
      if (!r.ok) showResult($('testResult'), r.error, 'bad');
    });
    summary.appendChild(rotateBtn);
  }
  section.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'keygroup-body';

  if (keys.length) {
    const list = document.createElement('div');
    list.className = 'keylist';
    for (const k of keys) {
      const live = cooldownById.get(k.id) || {};
      const row = document.createElement('div');
      row.className = `keyrow${k.active ? ' is-active' : ''}`;

      const dot = document.createElement('span');
      dot.className = `keydot ${keyStateBadge(live.state ? live : k).cls}`;
      row.appendChild(dot);

      const label = document.createElement('button');
      label.type = 'button';
      label.className = 'keylabel';
      label.textContent = `${k.label} • ****${k.hint}`;
      label.title = k.active
        ? T('panel.fields.keyIsActive', 'Şu an kullanılan anahtar')
        : T('panel.fields.btnMakeActive', 'Aktif yap');
      label.disabled = k.active;
      label.addEventListener('click', async () => {
        await api.secrets.setActive(p.id, k.id);
      });
      row.appendChild(label);

      const badge = keyStateBadge(live.state ? live : k);
      const state = document.createElement('span');
      state.className = `state ${badge.cls}`;
      state.textContent = badge.text;
      row.appendChild(state);

      const del = document.createElement('button');
      del.className = 'btn danger sm';
      del.textContent = T('panel.fields.btnDeleteKey', 'Sil');
      del.addEventListener('click', async () => {
        await api.secrets.remove(p.id, k.id);
      });
      row.appendChild(del);

      list.appendChild(row);
    }
    body.appendChild(list);
  } else {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = T('panel.fields.noKeysYet', 'Henüz anahtar eklenmedi.');
    body.appendChild(empty);
  }

  const addRow = document.createElement('div');
  addRow.className = 'keyrow keyadd';

  const input = document.createElement('input');
  input.type = 'password';
  input.placeholder = providerKeyHint || 'API key';
  input.autocomplete = 'off';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn';
  addBtn.textContent = T('panel.fields.btnAddKey', 'Ekle');
  const doAdd = async () => {
    const v = input.value.trim();
    if (!v) return;
    const r = await api.secrets.add(p.id, v);
    if (!r.ok && r.error === 'duplicate') {
      showResult($('testResult'), T('panel.fields.keyDuplicate', 'Bu anahtar zaten kayıtlı.'), 'bad');
    }
    input.value = '';
  };
  addBtn.addEventListener('click', doAdd);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doAdd();
  });

  addRow.append(input, addBtn);
  body.appendChild(addRow);
  section.appendChild(body);

  return section;
}

async function renderKeys() {
  const token = ++renderKeysToken;
  const rows = providers.filter((p) => p.needsKey || p.id === 'custom' || p.custom);

  const built = [];
  for (const p of rows) {
    // eslint-disable-next-line no-await-in-loop -- sıralı render, sağlayıcı sayısı küçük
    const [keys, rotator] = await Promise.all([api.secrets.list(p.id), api.secrets.rotatorStatus(p.id)]);
    if (token !== renderKeysToken) return; // üzerimize yeni bir render başladı — bas geç
    built.push(buildKeySection(p, keys, rotator));
  }

  if (token !== renderKeysToken) return; // son kontrol: hâlâ en güncel çağrı mıyız
  const host = $('keys');
  host.innerHTML = '';
  for (const section of built) host.appendChild(section);
}

/* ------------------------------------------------------------------ */
/* Üretim / davranış alanları                                          */
/* ------------------------------------------------------------------ */

function bindCheck(id, key) {
  const el = $(id);
  if (!el) return;
  el.addEventListener('change', () => save({ [key]: el.checked }));
}

function bindNumber(id, key, { min, max } = {}) {
  const el = $(id);
  if (!el) return;
  el.addEventListener('change', () => {
    let v = Number(el.value);
    if (!Number.isFinite(v)) return;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    el.value = v;
    save({ [key]: v });
  });
}

bindCheck('deepMode', 'deepMode');
bindCheck('autoMode', 'autoMode');
bindCheck('clarify', 'clarify');
bindCheck('suggestions', 'suggestions');
bindCheck('enablePromptAssist', 'enablePromptAssist');
bindCheck('alwaysOnTop', 'alwaysOnTop');
bindCheck('autoCopy', 'autoCopy');
bindCheck('autoCompactEnabled', 'autoCompactEnabled');
bindCheck('launchAtStartup', 'launchAtStartup');
bindCheck('enableNotifications', 'enableNotifications');
bindCheck('enableSound', 'enableSound');
bindCheck('notifyOnlyWhenBackground', 'notifyOnlyWhenBackground');

$('autoCompactThreshold')?.addEventListener('input', () => {
  const v = $('autoCompactThreshold').value;
  if ($('autoCompactThresholdVal')) $('autoCompactThresholdVal').textContent = `%${v}`;
  updateSliderProgress($('autoCompactThreshold'));
});

$('autoCompactThreshold')?.addEventListener('change', () =>
  save({ autoCompactThreshold: Number($('autoCompactThreshold').value) })
);


/* ------------------------------------------------------------------ */
/* Kısayol yakalama                                                    */
/* ------------------------------------------------------------------ */

const NAMED_KEYS = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Esc',
  Enter: 'Enter',
  Tab: 'Tab',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown'
};

function keyName(e) {
  if (NAMED_KEYS[e.key]) return NAMED_KEYS[e.key];
  if (/^F\d{1,2}$/.test(e.key)) return e.key;
  if (e.key.length === 1) return e.key.toUpperCase();
  return null;
}

document.querySelectorAll('.accel').forEach((input) => {
  input.addEventListener('keydown', async (e) => {
    e.preventDefault();

    if (e.key === 'Backspace' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
      input.value = '';
      await save({ shortcuts: { [input.dataset.key]: '' } });
      refreshShortcutErrors();
      return;
    }

    const key = keyName(e);
    if (!key) return;

    const mods = [];
    if (e.ctrlKey) mods.push('Control');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    if (e.metaKey) mods.push('Super');

    // F tuşları dışında en az bir değiştirici şart — yoksa normal yazım çalınır.
    if (!mods.length && !/^F\d{1,2}$/.test(key)) return;

    const accel = [...mods, key].join('+');
    input.value = accel;
    await save({ shortcuts: { [input.dataset.key]: accel } });
    refreshShortcutErrors();
  });
});

async function refreshShortcutErrors() {
  const info = await api.meta.app();
  const el = $('scErrors');
  if (!info.shortcutErrors?.length) {
    el.hidden = true;
    return;
  }
  const lead = T('panel.fields.shortcutsError', 'Şu kısayollar sistem tarafından kullanılıyor, atanamadı:');
  showResult(el, `${lead} ${info.shortcutErrors.map((s) => `${s.label} (${s.accel})`).join(', ')}`, 'warn');
}

/* ------------------------------------------------------------------ */
/* Geçmiş                                                              */
/* ------------------------------------------------------------------ */

function fmtDate(ts) {
  const locale = (settings?.appLanguage === 'en' || (typeof i18n !== 'undefined' && i18n.currentLang === 'en')) ? 'en-US' : 'tr-TR';
  return new Date(ts).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
}

async function loadHistory() {
  historyItems = await api.history.list();
  renderHistory();
}

function renderHistory() {
  const host = $('historyList') || $('histList');
  if (!host) return;
  const searchEl = $('search');
  const q = searchEl ? searchEl.value.trim().toLocaleLowerCase('tr') : '';
  host.innerHTML = '';

  const items = q
    ? historyItems.filter(
        (i) =>
          (i.input || '').toLocaleLowerCase('tr').includes(q) ||
          (i.output || '').toLocaleLowerCase('tr').includes(q)
      )
    : historyItems;

  if (!items.length) {
    const p = document.createElement('p');
    p.className = 'empty-note';
    p.textContent = historyItems.length
      ? (typeof i18n !== 'undefined' ? i18n.t('panel.history.noSearchResults') : 'Aramayla eşleşen kayıt yok.')
      : (typeof i18n !== 'undefined' ? i18n.t('panel.history.noEntries') : 'Henüz kayıt yok.');
    host.appendChild(p);
    return;
  }

  for (const item of items) {
    const el = document.createElement('div');
    el.className = `history-item${item.favorite ? ' fav' : ''}`;

    const top = document.createElement('div');
    top.className = 'hist-top';
    top.style.cssText = 'display:flex; justify-content:space-between; margin-bottom:4px; font-size:10.5px; color:var(--txt-dim);';
    top.innerHTML = `<span>${fmtDate(item.ts)} · <b>${escapeHtml(item.provider)}</b> / ${escapeHtml(item.model || '-')}</span>`;

    const inp = document.createElement('p');
    inp.style.cssText = 'margin:2px 0 6px 0; font-size:11.5px; color:var(--txt); font-weight:500;';
    inp.textContent = item.input || '';

    const out = document.createElement('div');
    out.style.cssText = 'margin:4px 0 8px 0; font-size:11px; color:var(--txt-dim); background:rgba(0,0,0,0.2); padding:6px 8px; border-radius:6px; max-height:80px; overflow-y:auto; white-space:pre-wrap;';
    out.textContent = item.output || '';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex; gap:6px; justify-content:flex-end;';

    const mk = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = `btn${cls ? ` ${cls}` : ''}`;
      b.style.height = '24px';
      b.style.fontSize = '10.5px';
      b.style.padding = '0 8px';
      b.textContent = label;
      b.addEventListener('click', fn);
      actions.appendChild(b);
      return b;
    };

    const copyTxt = typeof i18n !== 'undefined' ? i18n.t('card.btnCopy') : 'Kopyala';
    const reuseTxt = typeof i18n !== 'undefined' ? i18n.t('panel.history.loadInPanel') : 'Panele yükle';
    const deleteTxt = typeof i18n !== 'undefined' ? i18n.t('panel.history.delete') : 'Sil';

    mk(copyTxt, 'primary', () => api.clipboard.write(item.output));
    mk(reuseTxt, '', () => api.history.reuse(item.id));
    mk(deleteTxt, 'danger', async () => {
      await api.history.remove(item.id);
      loadHistory();
    });

    el.append(top, inp, out, actions);
    host.appendChild(el);
  }
}

$('search')?.addEventListener('input', renderHistory);
$('btnClear')?.addEventListener('click', async () => {
  await api.history.clear();
  loadHistory();
});
$('btnClearHistory')?.addEventListener('click', async () => {
  await api.history.clear();
  loadHistory();
});
$('btnExportMd')?.addEventListener('click', () => api.history.export('md'));
$('btnExportJson')?.addEventListener('click', () => api.history.export('json'));

/* ------------------------------------------------------------------ */
/* Hakkında                                                            */
/* ------------------------------------------------------------------ */

$('btnOpenData')?.addEventListener('click', () => api.shell.openUserData());

async function renderAbout() {
  const info = await api.meta.app();
  const dl = $('aboutList');
  if (dl) {
    dl.innerHTML = '';
    const isEn = typeof i18n !== 'undefined' && i18n.currentLang === 'en';
    const rows = [
      [isEn ? 'Version' : 'Sürüm', info.version],
      ['Electron', info.electron],
      [isEn ? 'Data directory' : 'Veri klasörü', info.userData],
      [isEn ? 'Key encryption' : 'Anahtar şifrelemesi', info.encryptionAvailable ? (isEn ? 'Active (Windows DPAPI)' : 'Etkin (Windows DPAPI)') : (isEn ? 'Unavailable' : 'Kullanılamıyor')]
    ];
    for (const [k, v] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      dl.append(dt, dd);
    }
  }
  if ($('cryptoNote')) {
    $('cryptoNote').textContent = info.encryptionAvailable
      ? (typeof i18n !== 'undefined' ? i18n.t('panel.fields.cryptoNoteAvailable') : 'Etkin (Windows DPAPI)')
      : (typeof i18n !== 'undefined' ? i18n.t('panel.fields.cryptoNoteUnavailable') : 'Kullanılamıyor');
  }
}

let metaStyles = [];
let metaLangs = [];

function populateStyleAndLangSelects() {
  const styleSel = $('style');
  if (styleSel && metaStyles.length) {
    const curStyle = styleSel.value;
    styleSel.innerHTML = '';
    for (const st of metaStyles) {
      const o = document.createElement('option');
      o.value = st.id;
      const label = (typeof i18n !== 'undefined' ? i18n.t(`styles.${st.id}.label`) : null) || st.label;
      const hint = (typeof i18n !== 'undefined' ? i18n.t(`styles.${st.id}.hint`) : null) || st.hint;
      o.textContent = `${label} — ${hint}`;
      styleSel.appendChild(o);
    }
    if (curStyle) styleSel.value = curStyle;
  }

  const langSel = $('language');
  if (langSel && metaLangs.length) {
    const curLang = langSel.value;
    langSel.innerHTML = '';
    for (const l of metaLangs) {
      const o = document.createElement('option');
      o.value = l.id;
      o.textContent = (typeof i18n !== 'undefined' ? i18n.t(`languages.${l.id}`) : null) || l.label;
      langSel.appendChild(o);
    }
    if (curLang) langSel.value = curLang;
  }

  populateModeSelect();
}

async function populateModeSelect() {
  const modeSel = $('appMode');
  if (!modeSel) return;
  const catalog = await api.modes.catalog();
  const activeMode = await api.modes.getActive();
  modeSel.innerHTML = '';
  for (const m of catalog) {
    const o = document.createElement('option');
    o.value = m.id;
    o.textContent = m.labelKey ? (typeof i18n !== 'undefined' ? i18n.t(m.labelKey) : m.id) : m.name;
    if (m.id === activeMode) o.selected = true;
    modeSel.appendChild(o);
  }
}

$('appMode')?.addEventListener('change', async () => {
  const mode = $('appMode').value;
  await api.modes.setActive(mode);
});

api.on.modeChanged(() => populateModeSelect());

$('style')?.addEventListener('change', () => save({ style: $('style').value }));
$('language')?.addEventListener('change', () => save({ outputLanguage: $('language').value }));
$('appLanguage').addEventListener('change', async () => {
  const lang = $('appLanguage').value;
  if (typeof i18n !== 'undefined') {
    i18n.setLanguage(lang);
    i18n.translateDOM();
    populateStyleAndLangSelects();
    renderProviderFields();
    renderKeys();
    renderAbout();
  }
  await save({ appLanguage: lang });
});

$('themeMode')?.addEventListener('change', async () => {
  const mode = $('themeMode').value;
  if (themeManager) themeManager.applyTheme(mode, settings.accent || 'sunset');
  await save({ theme: mode });
});

$('effort').addEventListener('change', () => save({ effort: $('effort').value }));

function updateSliderProgress(el) {
  if (!el) return;
  const min = Number(el.min) || 0;
  const max = Number(el.max) || 100;
  const val = Number(el.value) || 0;
  const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
  el.style.setProperty('--val', `${pct.toFixed(1)}%`);
}

$('temperature')?.addEventListener('input', () => {
  const el = $('temperature');
  if ($('temperatureVal')) $('temperatureVal').textContent = Number(el.value).toFixed(2);
  updateSliderProgress(el);
});
$('temperature')?.addEventListener('change', () => {
  const el = $('temperature');
  updateSliderProgress(el);
  save({ temperature: Number(el.value) });
});

$('opacity')?.addEventListener('input', () => {
  const el = $('opacity');
  if ($('opacityVal')) $('opacityVal').textContent = `%${Math.round(Number(el.value) * 100)}`;
  updateSliderProgress(el);
});
$('opacity')?.addEventListener('change', () => {
  const el = $('opacity');
  updateSliderProgress(el);
  save({ opacity: Number(el.value) });
});

bindCheck('deepMode', 'deepMode');
bindCheck('autoMode', 'autoMode');
bindCheck('clarify', 'clarify');
bindCheck('suggestions', 'suggestions');
bindCheck('enablePromptAssist', 'enablePromptAssist');
bindCheck('alwaysOnTop', 'alwaysOnTop');
bindCheck('autoCopy', 'autoCopy');
bindCheck('launchAtStartup', 'launchAtStartup');
bindCheck('enableNotifications', 'enableNotifications');
bindCheck('enableSound', 'enableSound');
bindCheck('notifyOnlyWhenBackground', 'notifyOnlyWhenBackground');
$('notifyLevel')?.addEventListener('change', () => save({ notifyLevel: $('notifyLevel').value }));
bindNumber('maxTokens', 'maxTokens', { min: 256, max: 32000 });
bindNumber('historyLimit', 'historyLimit', { min: 10, max: 2000 });

$('btnReset')?.addEventListener('click', async () => {
  const confirmMsg = typeof i18n !== 'undefined'
    ? i18n.t('panel.fields.resetConfirm')
    : 'Tüm ayarlar varsayılana sıfırlanacak. Onaylıyor musunuz?';
  if (confirm(confirmMsg)) {
    settings = await api.settings.reset();
    providers = await api.providers.catalog();
    renderAll();
  }
});

/* ------------------------------------------------------------------ */
/* Özel sağlayıcı ekleme formu / Custom provider add form              */
/* ------------------------------------------------------------------ */

$('btnAddCustomProvider')?.addEventListener('click', () => {
  const formEl = $('customProviderForm');
  if (!formEl) return;
  const isVisible = !formEl.hidden;
  if (isVisible) { formEl.hidden = true; formEl.innerHTML = ''; return; }
  renderCustomProviderForm(formEl);
});

function renderCustomProviderForm(container) {
  container.hidden = false;
  container.innerHTML = `
    <h3 class="custom-provider-form-title">${T('customProvider.formTitle', 'Yeni Özel Sağlayıcı')}</h3>
    <div class="field">
      <label>${T('customProvider.nameLabel', 'Sağlayıcı Adı')}</label>
      <input id="cpName" type="text" placeholder="${T('customProvider.namePlaceholder', 'Örn. OpenRouter, DeepSeek, Groq…')}" spellcheck="false" />
    </div>
    <div class="field">
      <label>${T('customProvider.endpointLabel', 'Sunucu Adresi (Base URL)')}</label>
      <input id="cpEndpoint" type="text" placeholder="${T('customProvider.endpointPlaceholder', 'https://openrouter.ai/api/v1')}" spellcheck="false" />
    </div>
    <div class="field-grid">
      <div class="field">
        <label>${T('customProvider.protocolLabel', 'API Protokolü')}</label>
        <select id="cpKind">
          <option value="openai">OpenAI Uyumlu</option>
          <option value="anthropic">Anthropic</option>
          <option value="gemini">Google Gemini</option>
          <option value="ollama">Ollama</option>
        </select>
      </div>
      <div class="field">
        <label class="switch">
          <input id="cpNeedsKey" type="checkbox" checked />
          <span class="track"><span class="knob"></span></span>
          <span class="switch-label">${T('customProvider.needsKeyLabel', 'API Anahtarı Gerekli')}</span>
        </label>
      </div>
    </div>
    <div class="inline custom-provider-form-actions">
      <button id="cpBtnSave" class="btn primary">${T('customProvider.saveBtn', 'Ekle')}</button>
      <button id="cpBtnCancel" class="btn ghost">${T('customProvider.cancelBtn', 'İptal')}</button>
    </div>
  `;

  $('cpBtnCancel').addEventListener('click', () => {
    container.hidden = true;
    container.innerHTML = '';
  });

  $('cpBtnSave').addEventListener('click', async () => {
    const name = $('cpName').value.trim();
    const endpoint = $('cpEndpoint').value.trim();
    const kind = $('cpKind').value;
    const needsKey = $('cpNeedsKey').checked;

    if (!name) { $('cpName').focus(); return; }

    const res = await api.providers.addCustom({
      label: name,
      endpoint,
      kind,
      needsKey
    });

    if (res.ok) {
      container.hidden = true;
      container.innerHTML = '';
      // Yeni sağlayıcıyı seçili yap / Select new provider
      await save({ provider: res.id });
      settings = await api.settings.get();
      providers = await api.providers.catalog();
      populateProviderSelect();
      renderProviderFields();
      renderKeys();
      loadModels({ silent: true });
    }
  });
}

$('btnOpenData')?.addEventListener('click', () => {
  if (api.shell && api.shell.openUserData) {
    api.shell.openUserData();
  }
});

/* ------------------------------------------------------------------ */
/* Başlangıç                                                           */
/* ------------------------------------------------------------------ */

function populateProviderSelect() {
  const provSel = $('provider');
  if (!provSel || !providers.length) return;
  const current = provSel.value;
  provSel.innerHTML = '';
  for (const p of providers) {
    const o = document.createElement('option');
    o.value = p.id;
    let label = p.id === 'custom' && typeof i18n !== 'undefined' ? i18n.t('provider.customLabel') : p.label;
    // Özel sağlayıcılara rozet ekle / Add badge for custom providers
    if (p.custom) label = `🔧 ${label}`;
    o.textContent = label;
    provSel.appendChild(o);
  }
  if (current) provSel.value = current;
}

const themeManager = typeof ThemeManager !== 'undefined' ? new ThemeManager() : null;

function renderAll() {
  if (typeof i18n !== 'undefined') {
    i18n.init(settings.appLanguage || 'tr');
    i18n.translateDOM();
    populateStyleAndLangSelects();
    populateProviderSelect();
  }

  if (themeManager) {
    themeManager.applyTheme(settings.theme || 'dark', settings.accent || 'sunset', settings.orbShape || 'circle');
    if ($('themeMode')) $('themeMode').value = settings.theme || 'dark';
    themeManager.renderPicker($('accentPicker'), async (newAccent) => {
      await save({ accent: newAccent });
      if ($('shapePicker')) {
        themeManager.renderShapePicker($('shapePicker'), async (newShape) => {
          await save({ orbShape: newShape });
        }, typeof i18n !== 'undefined' ? i18n : null);
      }
    }, typeof i18n !== 'undefined' ? i18n : null);

    if ($('shapePicker')) {
      themeManager.renderShapePicker($('shapePicker'), async (newShape) => {
        await save({ orbShape: newShape });
      }, typeof i18n !== 'undefined' ? i18n : null);
    }
  }

  renderProviderFields();
  renderKeys();

  if ($('appLanguage')) $('appLanguage').value = settings.appLanguage || 'tr';
  if ($('style')) $('style').value = settings.style;
  if ($('language')) $('language').value = settings.outputLanguage;
  if ($('effort')) $('effort').value = settings.effort || 'medium';
  if ($('temperature')) {
    $('temperature').value = settings.temperature;
    updateSliderProgress($('temperature'));
  }
  if ($('temperatureVal')) $('temperatureVal').textContent = Number(settings.temperature).toFixed(2);
  if ($('maxTokens')) $('maxTokens').value = settings.maxTokens;
  if ($('opacity')) {
    $('opacity').value = settings.opacity;
    updateSliderProgress($('opacity'));
  }
  if ($('opacityVal')) $('opacityVal').textContent = `%${Math.round(Number(settings.opacity) * 100)}`;
  if ($('historyLimit')) $('historyLimit').value = settings.historyLimit;

  if ($('deepMode')) $('deepMode').checked = !!settings.deepMode;
  if ($('autoMode')) $('autoMode').checked = !!settings.autoMode;
  if ($('clarify')) $('clarify').checked = !!settings.clarify;
  if ($('suggestions')) $('suggestions').checked = !!settings.suggestions;
  if ($('enablePromptAssist')) $('enablePromptAssist').checked = settings.enablePromptAssist !== false;
  if ($('alwaysOnTop')) $('alwaysOnTop').checked = !!settings.alwaysOnTop;
  if ($('autoCopy')) $('autoCopy').checked = !!settings.autoCopy;
  if ($('autoCompactEnabled')) $('autoCompactEnabled').checked = settings.autoCompactEnabled !== false;
  if ($('autoCompactThreshold')) {
    const thresh = Number(settings.autoCompactThreshold) || 75;
    $('autoCompactThreshold').value = thresh;
    if ($('autoCompactThresholdVal')) $('autoCompactThresholdVal').textContent = `%${thresh}`;
    updateSliderProgress($('autoCompactThreshold'));
  }
  if ($('launchAtStartup')) $('launchAtStartup').checked = !!settings.launchAtStartup;
  if ($('enableNotifications')) $('enableNotifications').checked = !!settings.enableNotifications;
  if ($('enableSound')) $('enableSound').checked = !!settings.enableSound;
  if ($('notifyOnlyWhenBackground')) $('notifyOnlyWhenBackground').checked = !!settings.notifyOnlyWhenBackground;
  if ($('notifyLevel')) $('notifyLevel').value = settings.notifyLevel || 'normal';

  const sc = settings.shortcuts || {};
  document.querySelectorAll('.accel').forEach((i) => {
    i.value = sc[i.dataset.key] || '';
  });
}

api.on.settingsChanged((s) => {
  settings = s;
  renderAll();
});

api.on.secretsChanged(async () => {
  providers = await api.providers.catalog();
  populateProviderSelect();
  renderKeys();
});

// Özel sağlayıcı değişikliklerini dinle / Listen for custom provider changes
if (api.on.providersChanged) {
  api.on.providersChanged(async () => {
    providers = await api.providers.catalog();
    populateProviderSelect();
    renderProviderFields();
    renderKeys();
  });
}

(async function init() {
  const [s, styles, langs, cat] = await Promise.all([
    api.settings.get(),
    api.meta.styles(),
    api.meta.languages(),
    api.providers.catalog()
  ]);

  settings = s;
  providers = cat;
  metaStyles = styles;
  metaLangs = langs;

  populateProviderSelect();
  renderAll();
  renderAbout();
  refreshShortcutErrors();
  loadModels({ silent: true });
})();
