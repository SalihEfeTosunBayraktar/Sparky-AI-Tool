'use strict';

const api = window.sparky;
const $ = (id) => document.getElementById(id);

let settings = null;
let providers = [];
let historyItems = [];
let savedTimer = null;

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
}

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
api.on.panelTab((tab) => showTab(tab || 'settings'));

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
  el.className = `result${kind === 'bad' ? ' bad' : kind === 'warn' ? ' warn' : ''}`;
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
    opt.textContent = settings.model || '— liste alınamadı —';
    sel.appendChild(opt);
    if (!silent) showResult($('testResult'), res.error, 'bad');
    return;
  }

  if (!res.models.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— model bulunamadı —';
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

function renderKeys() {
  const host = $('keys');
  host.innerHTML = '';
  const rows = providers.filter((p) => p.needsKey || p.id === 'custom');

  for (const p of rows) {
    const row = document.createElement('div');
    row.className = 'keyrow';

    const providerLabel = p.id === 'custom' && typeof i18n !== 'undefined' ? i18n.t('provider.customLabel') : p.label;
    const providerKeyHint = p.id === 'custom' && typeof i18n !== 'undefined' ? i18n.t('provider.customKeyHint') : (p.keyHint || '');

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = providerLabel;
    name.title = providerKeyHint;

    const regTxt = typeof i18n !== 'undefined' ? i18n.t('panel.fields.registered') : 'kayıtlı';
    const notRegTxt = typeof i18n !== 'undefined' ? i18n.t('panel.fields.notRegistered') : 'yok';
    const saveTxt = typeof i18n !== 'undefined' ? i18n.t('panel.fields.btnSaveKey') : 'Kaydet';
    const deleteTxt = typeof i18n !== 'undefined' ? i18n.t('panel.fields.btnDeleteKey') : 'Sil';

    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = p.hasKey ? `${regTxt} • ****${p.keyMask}` : (providerKeyHint || 'API key');
    input.autocomplete = 'off';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn';
    saveBtn.textContent = saveTxt;
    saveBtn.addEventListener('click', async () => {
      const v = input.value.trim();
      if (!v) return;
      await api.secrets.set(p.id, v);
      input.value = '';
      providers = await api.providers.catalog();
      renderKeys();
    });

    const state = document.createElement('span');
    state.className = `state${p.hasKey ? ' on' : ''}`;
    state.textContent = p.hasKey ? regTxt : notRegTxt;

    if (p.hasKey) {
      const del = document.createElement('button');
      del.className = 'btn danger';
      del.textContent = deleteTxt;
      del.addEventListener('click', async () => {
        await api.secrets.set(p.id, '');
        providers = await api.providers.catalog();
        renderKeys();
      });
      row.append(name, input, saveBtn, del);
    } else {
      row.append(name, input, saveBtn, state);
    }

    host.appendChild(row);
  }
}

/* ------------------------------------------------------------------ */
/* Üretim / davranış alanları                                          */
/* ------------------------------------------------------------------ */

function bindCheck(id, key) {
  $(id).addEventListener('change', () => save({ [key]: $(id).checked }));
}

function bindNumber(id, key, { min, max } = {}) {
  $(id).addEventListener('change', () => {
    let v = Number($(id).value);
    if (!Number.isFinite(v)) return;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    $(id).value = v;
    save({ [key]: v });
  });
}

$('style').addEventListener('change', () => save({ style: $('style').value }));
$('language').addEventListener('change', () => save({ outputLanguage: $('language').value }));
$('appLanguage').addEventListener('change', () => {
  const lang = $('appLanguage').value;
  if (typeof i18n !== 'undefined') {
    i18n.setLanguage(lang);
    i18n.translateDOM();
  }
  save({ appLanguage: lang });
});
$('effort').addEventListener('change', () => save({ effort: $('effort').value }));

$('temperature').addEventListener('input', () => {
  $('temperatureVal').textContent = Number($('temperature').value).toFixed(2);
});
$('temperature').addEventListener('change', () => save({ temperature: Number($('temperature').value) }));

$('opacity').addEventListener('input', () => {
  $('opacityVal').textContent = `%${Math.round(Number($('opacity').value) * 100)}`;
});
$('opacity').addEventListener('change', () => save({ opacity: Number($('opacity').value) }));

bindCheck('deepMode', 'deepMode');
bindCheck('clarify', 'clarify');
bindCheck('suggestions', 'suggestions');
bindCheck('alwaysOnTop', 'alwaysOnTop');
bindCheck('autoCopy', 'autoCopy');
bindCheck('launchAtStartup', 'launchAtStartup');
bindNumber('maxTokens', 'maxTokens', { min: 256, max: 32000 });
bindNumber('historyLimit', 'historyLimit', { min: 10, max: 2000 });

$('btnReset').addEventListener('click', async () => {
  settings = await api.settings.reset();
  providers = await api.providers.catalog();
  renderAll();
  loadModels({ silent: true });
});

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
  showResult(
    el,
    `Şu kısayollar sistem tarafından kullanılıyor, atanamadı: ${info.shortcutErrors
      .map((s) => `${s.label} (${s.accel})`)
      .join(', ')}`,
    'warn'
  );
}

/* ------------------------------------------------------------------ */
/* Geçmiş                                                              */
/* ------------------------------------------------------------------ */

function fmtDate(ts) {
  return new Date(ts).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

async function loadHistory() {
  historyItems = await api.history.list();
  renderHistory();
}

function renderHistory() {
  const host = $('histList');
  const q = $('search').value.trim().toLocaleLowerCase('tr');
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
    p.textContent = historyItems.length ? i18n.t('panel.history.noSearchResults') : i18n.t('panel.history.noEntries');
    host.appendChild(p);
    return;
  }

  for (const item of items) {
    const el = document.createElement('div');
    el.className = `hist-item${item.favorite ? ' fav' : ''}`;

    const top = document.createElement('div');
    top.className = 'hist-top';
    const tag = document.createElement('span');
    tag.className = 'tagline';
    tag.textContent = `${fmtDate(item.ts)} · ${item.provider} · ${item.model || '-'} · ${item.style}${
      item.deep ? ' · derin' : ''
    }`;
    top.appendChild(tag);

    const inp = document.createElement('p');
    inp.className = 'hist-in';
    inp.textContent = item.input || '';

    const out = document.createElement('div');
    out.className = 'hist-out';
    out.textContent = item.output || '';

    const actions = document.createElement('div');
    actions.className = 'hist-actions';

    const mk = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = `btn${cls ? ` ${cls}` : ''}`;
      b.textContent = label;
      b.addEventListener('click', fn);
      actions.appendChild(b);
      return b;
    };

    const copyTxt = i18n.t('card.btnCopy');
    const reuseTxt = typeof i18n !== 'undefined' ? (i18n.currentLang === 'en' ? 'Load in panel' : 'Panele yükle') : 'Panele yükle';
    const showAllTxt = typeof i18n !== 'undefined' ? (i18n.currentLang === 'en' ? 'Show all' : 'Tamamını göster') : 'Tamamını göster';
    const collapseTxt = typeof i18n !== 'undefined' ? (i18n.currentLang === 'en' ? 'Collapse' : 'Daralt') : 'Daralt';
    const deleteTxt = typeof i18n !== 'undefined' ? (i18n.currentLang === 'en' ? 'Delete' : 'Sil') : 'Sil';

    mk(copyTxt, 'primary', () => api.clipboard.write(item.output));
    mk(reuseTxt, '', () => api.history.reuse(item.id));
    mk(showAllTxt, '', (e) => {
      out.classList.toggle('open');
      e.target.textContent = out.classList.contains('open') ? collapseTxt : showAllTxt;
    });
    mk(item.favorite ? '★ Favorite' : '☆ Favorite', '', async () => {
      await api.history.update(item.id, { favorite: !item.favorite });
      loadHistory();
    });
    mk(deleteTxt, 'danger', async () => {
      await api.history.remove(item.id);
      loadHistory();
    });

    el.append(top, inp, out, actions);
    host.appendChild(el);
  }
}

$('search').addEventListener('input', renderHistory);
$('btnClear').addEventListener('click', async () => {
  await api.history.clear();
  loadHistory();
});
$('btnExportMd').addEventListener('click', () => api.history.export('md'));
$('btnExportJson').addEventListener('click', () => api.history.export('json'));
api.on.historyChanged(() => {
  if ($('tab-history').classList.contains('active')) loadHistory();
});

/* ------------------------------------------------------------------ */
/* Hakkında                                                            */
/* ------------------------------------------------------------------ */

$('btnOpenData').addEventListener('click', () => api.shell.openUserData());

async function renderAbout() {
  const info = await api.meta.app();
  const dl = $('aboutList');
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
  $('cryptoNote').textContent = info.encryptionAvailable
    ? i18n.t('panel.fields.cryptoNoteAvailable')
    : i18n.t('panel.fields.cryptoNoteUnavailable');
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
}

$('style').addEventListener('change', () => save({ style: $('style').value }));
$('language').addEventListener('change', () => save({ outputLanguage: $('language').value }));
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
$('effort').addEventListener('change', () => save({ effort: $('effort').value }));

$('temperature').addEventListener('input', () => {
  $('temperatureVal').textContent = Number($('temperature').value).toFixed(2);
});
$('temperature').addEventListener('change', () => save({ temperature: Number($('temperature').value) }));

$('opacity').addEventListener('input', () => {
  $('opacityVal').textContent = `%${Math.round(Number($('opacity').value) * 100)}`;
});
$('opacity').addEventListener('change', () => save({ opacity: Number($('opacity').value) }));

bindCheck('deepMode', 'deepMode');
bindCheck('clarify', 'clarify');
bindCheck('suggestions', 'suggestions');
bindCheck('alwaysOnTop', 'alwaysOnTop');
bindCheck('autoCopy', 'autoCopy');
bindCheck('launchAtStartup', 'launchAtStartup');
bindNumber('maxTokens', 'maxTokens', { min: 256, max: 32000 });
bindNumber('historyLimit', 'historyLimit', { min: 10, max: 2000 });

$('btnReset').addEventListener('click', async () => {
  settings = await api.settings.reset();
  providers = await api.providers.catalog();
  renderAll();
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
    o.textContent = p.id === 'custom' && typeof i18n !== 'undefined' ? i18n.t('provider.customLabel') : p.label;
    provSel.appendChild(o);
  }
  if (current) provSel.value = current;
}

function renderAll() {
  if (typeof i18n !== 'undefined') {
    i18n.init(settings.appLanguage || 'tr');
    i18n.translateDOM();
    populateStyleAndLangSelects();
    populateProviderSelect();
  }

  renderProviderFields();
  renderKeys();

  if ($('appLanguage')) $('appLanguage').value = settings.appLanguage || 'tr';

  $('style').value = settings.style;
  $('language').value = settings.outputLanguage;
  $('effort').value = settings.effort || 'medium';
  $('temperature').value = settings.temperature;
  $('temperatureVal').textContent = Number(settings.temperature).toFixed(2);
  $('maxTokens').value = settings.maxTokens;
  $('opacity').value = settings.opacity;
  $('opacityVal').textContent = `%${Math.round(Number(settings.opacity) * 100)}`;
  $('historyLimit').value = settings.historyLimit;

  $('deepMode').checked = !!settings.deepMode;
  $('clarify').checked = !!settings.clarify;
  $('suggestions').checked = !!settings.suggestions;
  $('alwaysOnTop').checked = !!settings.alwaysOnTop;
  $('autoCopy').checked = !!settings.autoCopy;
  $('launchAtStartup').checked = !!settings.launchAtStartup;

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
