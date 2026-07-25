'use strict';

const path = require('path');
const fs = require('fs');
const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  clipboard,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  shell,
  dialog
} = require('electron');

const { settings, history } = require('./store');
const secrets = require('./secrets');
const llm = require('./llm');
const engine = require('./promptEngine');

const COLLAPSED = { width: 340, height: 152 };
const EXPANDED = { width: 480, height: 664 };

let orb = null;
let panel = null;
let tray = null;
let expanded = false;
let dragTimer = null;
let dragOffset = null;
let activeRun = null;
let lastOutput = '';
let shortcutErrors = [];

const ICON = path.join(__dirname, '..', '..', 'build', 'icon.png');

/* ------------------------------------------------------------------ */
/* Pencereler                                                          */
/* ------------------------------------------------------------------ */

function defaultOrbBounds() {
  const wa = screen.getPrimaryDisplay().workArea;
  return {
    x: wa.x + wa.width - COLLAPSED.width - 24,
    y: wa.y + wa.height - COLLAPSED.height - 24,
    width: COLLAPSED.width,
    height: COLLAPSED.height
  };
}

function createOrb() {
  const saved = settings.get('orbBounds');
  const base = saved && Number.isFinite(saved.x) ? saved : defaultOrbBounds();

  orb = new BrowserWindow({
    x: base.x,
    y: base.y,
    width: COLLAPSED.width,
    height: COLLAPSED.height,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    alwaysOnTop: !!settings.get('alwaysOnTop'),
    fullscreenable: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  orb.setAlwaysOnTop(!!settings.get('alwaysOnTop'), 'screen-saver');
  orb.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  orb.setOpacity(Number(settings.get('opacity')) || 1);
  // Görünmeyen şeffaf alan tıklamaları engellemesin; renderer imleç
  // etkileşimli bir öğenin üstündeyken bunu geçici olarak kapatır.
  orb.setIgnoreMouseEvents(true, { forward: true });

  orb.loadFile(path.join(__dirname, '..', 'renderer', 'orb', 'index.html'));
  orb.once('ready-to-show', () => orb.show());

  orb.on('moved', persistOrbBounds);
  orb.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      orb.hide();
    }
  });

  return orb;
}

function persistOrbBounds() {
  if (!orb || orb.isDestroyed()) return;
  const b = orb.getBounds();
  settings.patch({ orbBounds: { x: b.x, y: b.y, width: COLLAPSED.width, height: COLLAPSED.height } });
}

function applySize(next) {
  if (!orb || orb.isDestroyed()) return;
  expanded = next;
  const target = next ? EXPANDED : COLLAPSED;
  const b = orb.getBounds();
  const wa = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea;

  const x = Math.min(Math.max(b.x, wa.x), Math.max(wa.x, wa.x + wa.width - target.width));
  const y = Math.min(Math.max(b.y, wa.y), Math.max(wa.y, wa.y + wa.height - target.height));

  // Pencere resizable:false; bazı sürümlerde bu programatik boyutlandırmayı da
  // engellediği için kısa süreliğine açıp kapatıyoruz.
  const wasResizable = orb.isResizable();
  if (!wasResizable) orb.setResizable(true);
  orb.setBounds({ x, y, width: target.width, height: target.height }, false);
  if (!wasResizable) orb.setResizable(false);

  send('ui:expanded', next);
}

function setExpanded(next, { focusInput = false } = {}) {
  applySize(next);
  if (next) {
    orb.showInactive();
    orb.focus();
    if (focusInput) send('ui:focusInput');
  }
}

function createPanel(tab = 'settings') {
  if (panel && !panel.isDestroyed()) {
    panel.show();
    panel.focus();
    panel.webContents.send('panel:tab', tab);
    return panel;
  }

  const saved = settings.get('panelBounds');
  panel = new BrowserWindow({
    width: saved?.width || 940,
    height: saved?.height || 660,
    x: saved?.x,
    y: saved?.y,
    minWidth: 720,
    minHeight: 520,
    frame: false,
    show: false,
    backgroundColor: '#0e1014',
    title: 'Sparky AI',
    icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  panel.loadFile(path.join(__dirname, '..', 'renderer', 'panel', 'index.html'));
  panel.once('ready-to-show', () => {
    panel.show();
    panel.webContents.send('panel:tab', tab);
  });
  panel.on('close', () => {
    if (panel && !panel.isDestroyed()) settings.patch({ panelBounds: panel.getBounds() });
  });
  panel.on('closed', () => {
    panel = null;
  });

  return panel;
}

function send(channel, payload) {
  if (orb && !orb.isDestroyed()) orb.webContents.send(channel, payload);
}

function broadcast(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

/* ------------------------------------------------------------------ */
/* Üretim akışı                                                        */
/* ------------------------------------------------------------------ */

async function runGeneration(payload) {
  if (activeRun) activeRun.abort();
  const controller = new AbortController();
  activeRun = controller;

  const cfg = settings.all();
  const started = Date.now();

  const mode = payload.mode || 'create';
  const answers = Array.isArray(payload.answers) ? payload.answers : [];

  send('gen:busy', true);
  send('gen:status', { text: 'Hazırlanıyor…', kind: 'prep' });

  try {
    // 1) Netleştirme turu — açıksa ve bu ilk deneme ise.
    if (cfg.clarify && mode === 'create' && !payload.skipQuestions) {
      send('gen:status', { text: 'Belirsizlikler taranıyor…', kind: 'thinking' });
      const questions = await engine.askQuestions({
        raw: payload.raw,
        settings: cfg,
        chat: llm.chat,
        signal: controller.signal
      });
      if (questions.length) {
        // Üretimi burada durdurup topu kullanıcıya atıyoruz; cevaplar
        // gelince aynı akış skipQuestions ile yeniden çağrılacak.
        send('gen:questions', { questions, raw: payload.raw });
        send('gen:status', { text: `${questions.length} sorum var`, kind: 'info' });
        return { ok: true, questions: true };
      }
    }

    // 2) Asıl üretim
    const output = await engine.run({
      raw: payload.raw,
      mode,
      previous: payload.previous || '',
      instruction: payload.instruction || '',
      answers,
      settings: cfg,
      chat: llm.chat,
      onStatus: (s) => send('gen:status', s),
      onStage: () => send('gen:stage'),
      onToken: (t) => send('gen:token', t),
      signal: controller.signal
    });

    lastOutput = output;
    if (cfg.autoCopy) clipboard.writeText(output);

    const entry = history.add({
      input: payload.raw,
      output,
      answers,
      style: cfg.style,
      provider: cfg.provider,
      model: cfg.model,
      deep: !!cfg.deepMode,
      language: cfg.outputLanguage,
      mode,
      ms: Date.now() - started
    });

    // Önce durum, sonra sonuç: baloncukta son sözü "done" mesajı söylesin.
    send('gen:status', { text: cfg.autoCopy ? 'Hazır — panoya kopyalandı' : 'Prompt hazır', kind: 'success' });
    send('gen:done', { output, id: entry.id, copied: !!cfg.autoCopy });
    if (panel && !panel.isDestroyed()) panel.webContents.send('history:changed');

    // 3) Öneriler — sonuç zaten teslim edildi, bu tur arayüzü kilitlemesin.
    if (cfg.suggestions) {
      send('gen:busy', false);
      send('gen:suggestions', { pending: true, items: [] });
      try {
        const items = await engine.suggest({
          raw: payload.raw,
          prompt: output,
          settings: cfg,
          chat: llm.chat,
          signal: controller.signal
        });
        send('gen:suggestions', { pending: false, items });
      } catch {
        // Öneri turu başarısız olursa sessizce geç — asıl sonuç elimizde.
        send('gen:suggestions', { pending: false, items: [] });
      }
    }

    return { ok: true, output };
  } catch (err) {
    const aborted = controller.signal.aborted;
    const message = aborted ? 'Durduruldu.' : err?.message || String(err);
    send('gen:error', { message, aborted });
    send('gen:status', { text: aborted ? 'Durduruldu' : 'Hata', kind: aborted ? 'info' : 'error' });
    return { ok: false, error: message };
  } finally {
    if (activeRun === controller) activeRun = null;
    send('gen:busy', false);
  }
}

/* ------------------------------------------------------------------ */
/* Kısayollar ve tepsi                                                 */
/* ------------------------------------------------------------------ */

function registerShortcuts() {
  globalShortcut.unregisterAll();
  shortcutErrors = [];
  const sc = settings.get('shortcuts') || {};

  const bind = (accel, label, fn) => {
    if (!accel) return;
    try {
      if (!globalShortcut.register(accel, fn)) shortcutErrors.push({ accel, label });
    } catch {
      shortcutErrors.push({ accel, label });
    }
  };

  bind(sc.toggle, 'Panel aç/kapat', () => {
    if (!orb || orb.isDestroyed()) return;
    if (!orb.isVisible()) orb.show();
    setExpanded(!expanded, { focusInput: true });
  });

  bind(sc.fromClipboard, 'Panodan üret', generateFromClipboard);

  bind(sc.copyLast, 'Son sonucu kopyala', () => {
    if (!lastOutput) {
      send('gen:status', { text: 'Kopyalanacak sonuç yok', kind: 'info' });
      return;
    }
    clipboard.writeText(lastOutput);
    send('gen:status', { text: 'Panoya kopyalandı', kind: 'success' });
  });

  return shortcutErrors;
}

function trayIcon() {
  try {
    const img = nativeImage.createFromPath(ICON);
    return img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 });
  } catch {
    return nativeImage.createEmpty();
  }
}

function buildTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Sparky AI');
  const menu = Menu.buildFromTemplate([
    { label: 'Sparky AI', enabled: false },
    { type: 'separator' },
    {
      label: 'Göster / Gizle',
      click: () => {
        if (!orb || orb.isDestroyed()) return;
        if (orb.isVisible()) orb.hide();
        else orb.show();
      }
    },
    { label: 'Panodaki metinden prompt üret', click: () => generateFromClipboard() },
    { type: 'separator' },
    { label: 'Ayarlar…', click: () => createPanel('settings') },
    { label: 'Geçmiş…', click: () => createPanel('history') },
    { type: 'separator' },
    {
      label: 'Çıkış',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (!orb || orb.isDestroyed()) return;
    if (!orb.isVisible()) orb.show();
    setExpanded(!expanded, { focusInput: true });
  });
}

// Hızlı yol: paneli açmadan panodaki metni üretime gönder. Durum baloncukta
// bildirilir; soru sorulması gerekirse renderer paneli kendisi açar.
function generateFromClipboard() {
  const text = clipboard.readText().trim();
  if (!orb || orb.isDestroyed()) return;
  if (!orb.isVisible()) orb.show();
  if (!text) {
    send('gen:status', { text: 'Pano boş', kind: 'info' });
    return;
  }
  send('ui:fillInput', text);
  runGeneration({ raw: text, mode: 'create' });
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

function registerIpc() {
  // --- pencere / ui
  ipcMain.on('ui:setIgnoreMouse', (_e, ignore) => {
    if (orb && !orb.isDestroyed()) orb.setIgnoreMouseEvents(!!ignore, { forward: true });
  });

  ipcMain.on('ui:setExpanded', (_e, next) => setExpanded(!!next));

  ipcMain.on('ui:dragStart', () => {
    if (!orb || orb.isDestroyed()) return;
    const cur = screen.getCursorScreenPoint();
    const b = orb.getBounds();
    dragOffset = { dx: b.x - cur.x, dy: b.y - cur.y };
    if (dragTimer) clearInterval(dragTimer);
    dragTimer = setInterval(() => {
      if (!dragOffset || !orb || orb.isDestroyed()) return;
      const p = screen.getCursorScreenPoint();
      orb.setPosition(p.x + dragOffset.dx, p.y + dragOffset.dy);
    }, 16);
  });

  ipcMain.on('ui:dragEnd', () => {
    if (dragTimer) clearInterval(dragTimer);
    dragTimer = null;
    dragOffset = null;
    persistOrbBounds();
  });

  ipcMain.on('ui:hide', () => orb && !orb.isDestroyed() && orb.hide());
  ipcMain.on('ui:openPanel', (_e, tab) => createPanel(tab || 'settings'));
  ipcMain.on('ui:quit', () => {
    app.isQuitting = true;
    app.quit();
  });

  ipcMain.on('panel:window', (e, action) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w) return;
    if (action === 'minimize') w.minimize();
    else if (action === 'maximize') (w.isMaximized() ? w.unmaximize() : w.maximize());
    else if (action === 'close') w.close();
  });

  ipcMain.on('ui:orbMenu', () => {
    const menu = Menu.buildFromTemplate([
      { label: expanded ? 'Küçült' : 'Genişlet', click: () => setExpanded(!expanded, { focusInput: true }) },
      {
        label: 'Son sonucu kopyala',
        enabled: !!lastOutput,
        click: () => {
          clipboard.writeText(lastOutput);
          send('gen:status', { text: 'Panoya kopyalandı', kind: 'success' });
        }
      },
      { label: 'Panodaki metinden üret', click: generateFromClipboard },
      { type: 'separator' },
      { label: 'Ayarlar…', click: () => createPanel('settings') },
      { label: 'Geçmiş…', click: () => createPanel('history') },
      { type: 'separator' },
      {
        label: 'Her zaman üstte',
        type: 'checkbox',
        checked: !!settings.get('alwaysOnTop'),
        click: (item) => {
          settings.patch({ alwaysOnTop: item.checked });
          orb.setAlwaysOnTop(item.checked, 'screen-saver');
        }
      },
      { label: 'Gizle (tepsiye)', click: () => orb.hide() },
      {
        label: 'Çıkış',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);
    menu.popup({ window: orb });
  });

  // --- ayarlar
  ipcMain.handle('settings:get', () => settings.all());
  ipcMain.handle('settings:patch', (_e, partial) => {
    const next = settings.patch(partial || {});
    if ('alwaysOnTop' in (partial || {}) && orb) orb.setAlwaysOnTop(!!next.alwaysOnTop, 'screen-saver');
    if ('opacity' in (partial || {}) && orb) orb.setOpacity(Number(next.opacity) || 1);
    if ('launchAtStartup' in (partial || {})) {
      app.setLoginItemSettings({ openAtLogin: !!next.launchAtStartup, args: [] });
    }
    if ('shortcuts' in (partial || {})) registerShortcuts();
    broadcast('settings:changed', next);
    return next;
  });
  ipcMain.handle('settings:reset', () => {
    const next = settings.reset();
    registerShortcuts();
    broadcast('settings:changed', next);
    return next;
  });

  // --- sağlayıcılar
  ipcMain.handle('providers:catalog', () => llm.catalog());
  ipcMain.handle('providers:models', async (_e, providerId) => {
    try {
      return { ok: true, models: await llm.listModels(providerId) };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });
  ipcMain.handle('providers:probe', () => llm.probeLocal());
  ipcMain.handle('providers:test', async (_e, providerId) => {
    try {
      const models = await llm.listModels(providerId);
      return { ok: true, count: models.length, sample: models.slice(0, 5) };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  // --- anahtarlar (açık değer asla geri dönmez)
  ipcMain.handle('secrets:status', () => secrets.status());
  ipcMain.handle('secrets:set', (_e, { provider, value }) => {
    const r = secrets.setKey(provider, value);
    broadcast('secrets:changed');
    return r;
  });

  // --- üretim
  ipcMain.handle('gen:start', (_e, payload) => runGeneration(payload || {}));
  ipcMain.on('gen:abort', () => activeRun?.abort());

  // --- meta
  ipcMain.handle('meta:styles', () => engine.styleList());
  ipcMain.handle('meta:languages', () => engine.languageList());
  ipcMain.handle('meta:app', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    userData: app.getPath('userData'),
    encryptionAvailable: secrets.encryptionAvailable(),
    shortcutErrors
  }));

  // --- pano
  ipcMain.handle('clipboard:write', (_e, text) => {
    clipboard.writeText(String(text || ''));
    return true;
  });
  ipcMain.handle('clipboard:read', () => clipboard.readText());

  // --- geçmiş
  ipcMain.handle('history:list', () => history.list());
  ipcMain.handle('history:update', (_e, { id, patch }) => history.update(id, patch));
  ipcMain.handle('history:remove', (_e, id) => {
    history.remove(id);
    broadcast('history:changed');
    return true;
  });
  ipcMain.handle('history:clear', () => {
    history.clear();
    broadcast('history:changed');
    return true;
  });
  ipcMain.handle('history:reuse', (_e, id) => {
    const item = history.list().find((x) => x.id === id);
    if (!item) return false;
    if (!orb || orb.isDestroyed()) return false;
    if (!orb.isVisible()) orb.show();
    setExpanded(true);
    lastOutput = item.output;
    send('ui:loadEntry', item);
    orb.focus();
    return true;
  });
  ipcMain.handle('history:export', async (_e, format) => {
    const items = history.list();
    if (!items.length) return { ok: false, error: 'Geçmiş boş.' };
    const isMd = format === 'md';
    const { canceled, filePath } = await dialog.showSaveDialog(panel || orb, {
      title: 'Geçmişi dışa aktar',
      defaultPath: `sparky-gecmis.${isMd ? 'md' : 'json'}`,
      filters: isMd ? [{ name: 'Markdown', extensions: ['md'] }] : [{ name: 'JSON', extensions: ['json'] }]
    });
    if (canceled || !filePath) return { ok: false, canceled: true };

    const body = isMd
      ? items
          .map(
            (i) =>
              `## ${new Date(i.ts).toLocaleString('tr-TR')}\n\n**Girdi**\n\n${i.input}\n\n**Prompt** _(${i.provider} · ${i.model || '-'})_\n\n${i.output}\n`
          )
          .join('\n---\n\n')
      : JSON.stringify(items, null, 2);

    try {
      fs.writeFileSync(filePath, body, 'utf8');
      return { ok: true, filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('shell:openUserData', () => shell.openPath(app.getPath('userData')));
}

/* ------------------------------------------------------------------ */
/* Yaşam döngüsü                                                       */
/* ------------------------------------------------------------------ */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!orb || orb.isDestroyed()) return;
    if (!orb.isVisible()) orb.show();
    setExpanded(true, { focusInput: true });
  });

  app.setAppUserModelId('com.sparkyai.app');

  app.whenReady().then(async () => {
    registerIpc();
    createOrb();
    buildTray();
    registerShortcuts();

    // İlk çalıştırma: yerel bir sunucu ayaktaysa onu seç ve ilk modeli ata.
    if (!settings.get('model')) {
      const found = await llm.probeLocal();
      if (found.length) {
        const provider = found.includes('ollama') ? 'ollama' : found[0];
        settings.patch({ provider });
        try {
          const models = await llm.listModels(provider);
          if (models.length) settings.patch({ model: models[0], modelByProvider: { [provider]: models[0] } });
        } catch {
          /* sessizce geç */
        }
        broadcast('settings:changed', settings.all());
      }
    }
  });

  app.on('window-all-closed', () => {
    // Tepsi uygulaması — pencereler kapanınca çıkma.
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
    if (dragTimer) clearInterval(dragTimer);
    settings.flush();
    history.flush();
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
}
