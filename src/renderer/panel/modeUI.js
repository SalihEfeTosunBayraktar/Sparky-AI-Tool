'use strict';

/**
 * Mode Management UI controller for Settings Panel.
 * Ayarlar Paneli Modlar sekmesi arayüz yöneticisi (ProjectUI ile aynı desen).
 *
 * Her mod (yerleşik dahil) tek bir şemayı paylaşır: tamamen düzenlenebilir
 * bir Ana Kural (mainRule), tek tek eklenip silinip sıralanabilen Ek Kurallar
 * (additionalRules) listesi, ve üretim anında seçili Çıktı biçimi rehberinin
 * eklenip eklenmeyeceğini belirleyen bir anahtar (useStyleGuide). Yeni bir
 * özel mod oluştururken bunlar sıfırdan değil, seçilen bir ön modun (preset)
 * şablonundan başlar.
 */

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Metindeki {{TOKEN}} kalıplarını bulur — bilinen değişken listesiyle
// karşılaştırılıp tanımsız olanlar IDE panelinde uyarılır.
function extractTokens(text) {
  const out = new Set();
  const re = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
  let m;
  while ((m = re.exec(String(text || '')))) out.add(m[1].toUpperCase());
  return out;
}

class ModeUI {
  constructor(api, i18n) {
    this.api = api;
    this.i18n = i18n;
    this.activeEditingId = null;
    this.initialized = false;
    this.presets = null;
    this.variables = null;
    this.selectedPresetId = null;
    this.mainRuleEditor = null;
    this.ruleEditors = [];
  }

  /**
   * i18n kısayolu: çeviri yoksa (ya da anahtarın kendisi dönerse) yedek metni verir.
   * PromptAssistUI'daki aynı desen — burada da gerekiyordu.
   */
  t(key, fallback) {
    if (this.i18n && typeof this.i18n.t === 'function') {
      const translated = this.i18n.t(key);
      if (translated && translated !== key) return translated;
    }
    return fallback;
  }

  ensureSkeleton() {
    const container = document.getElementById('modesContainer');
    if (!container || document.getElementById('modeSelectBtn')) return;

    container.innerHTML = `
      <div class="projects-wrapper">
        <div class="projects-topbar">
          <div class="mode-dropdown">
            <button type="button" id="modeSelectBtn" class="btn mode-dropdown-btn"></button>
            <div id="modeSelectList" class="mode-dropdown-list" hidden></div>
          </div>
        </div>

        <div class="projects-topbar">
          <div class="mode-dropdown">
            <button type="button" id="presetDropdownBtn" class="btn mode-dropdown-btn"></button>
            <div id="presetDropdownList" class="mode-dropdown-list" hidden></div>
          </div>
          <button id="btnNewMode" class="btn primary" data-i18n="modes.createFromPreset">+ Yeni Mod Oluştur</button>
        </div>

        <div class="projects-topbar">
          <button id="btnExportModes" class="btn" data-i18n="modes.exportBtn">📤 Dışa Aktar</button>
          <button id="btnImportModes" class="btn" data-i18n="modes.importBtn">📥 İçe Aktar</button>
          <button id="btnBrowseRegistry" class="btn" data-i18n="modes.browseRegistry">🌐 Mod Galerisi</button>
        </div>

        <!-- Mod pazarı: katalog GitHub deposundan okunur -->
        <div id="registryPanel" class="card registry-panel" hidden>
          <div class="project-sub-header">
            <span class="sub-title" data-i18n="modes.registryTitle">Mod Galerisi</span>
            <button id="btnRegistryRefresh" class="btn" data-i18n="modes.registryRefresh">Yenile</button>
          </div>
          <p class="hint" data-i18n="modes.registryHint">Topluluk modları GitHub deposundan gelir. Kurmadan önce modun tam kuralını görebilirsiniz.</p>
          <div class="inline registry-toolbar">
            <input id="registrySearch" type="text" placeholder="Ara…" data-i18n-placeholder="modes.registrySearch" />
            <select id="registrySort">
              <option value="top" data-i18n="modes.sortTop">En popüler</option>
              <option value="new" data-i18n="modes.sortNew">En yeni</option>
              <option value="fav" data-i18n="modes.sortFav">Favorilerim</option>
              <option value="az" data-i18n="modes.sortAz">A → Z</option>
            </select>
          </div>
          <div id="registryStatus" class="hint"></div>
          <div id="registryList" class="registry-list"></div>
        </div>

        <div id="modeForm" class="card project-card" hidden>
          <div class="field">
            <label for="modeName" data-i18n="modes.nameLabel">Mod Adı</label>
            <div class="inline">
              <input id="modeName" type="text" placeholder="Mod Adı" data-i18n-placeholder="modes.namePlaceholder" />
              <span id="modeBuiltinBadge" class="mode-kind-badge" hidden data-i18n="modes.builtinBadge">Yerleşik</span>
              <span id="modePresetBadge" class="mode-kind-badge"></span>
            </div>
          </div>

          <div class="field">
            <label for="modeDesc" data-i18n="modes.descLabel">Açıklama</label>
            <input id="modeDesc" type="text" placeholder="Bu modun ne işe yaradığına dair kısa bir not" data-i18n-placeholder="modes.descPlaceholder" />
          </div>

          <div id="modeVarWarning" class="mode-var-warning" hidden></div>

          <div class="field">
            <label for="modeMainRule" data-i18n="modes.mainRuleLabel">Ana Kural</label>
            <textarea id="modeMainRule" rows="8" placeholder="Bu modda Sparky'ın nasıl davranacağını tarif edin…" data-i18n-placeholder="modes.mainRulePlaceholder"></textarea>
            <p id="modeMainRuleEmptyNote" class="hint mode-empty-note" hidden data-i18n="modes.mainRuleEmptyNote">Ana kural boş — aşağıdaki "Varsayılana Sıfırla" ile geri getirebilirsiniz.</p>
          </div>

          <label class="switch">
            <input type="checkbox" id="modeUseStyleGuide" />
            <span class="track"><span class="knob"></span></span>
            <span class="switch-label" data-i18n="modes.useStyleGuideLabel">Üretimde seçili Çıktı biçimi (style) rehberini ana kuralın altına ekle</span>
          </label>

          <div class="project-sub-header" style="margin-top: 4px;">
            <span class="sub-title" data-i18n="modes.rulesTitle">Ek Kurallar</span>
            <button id="btnAddRule" class="btn" data-i18n="modes.addRuleBtn">+ Kural Ekle</button>
          </div>
          <div id="modeRulesList" class="mode-rules-list"></div>
          <p id="modeRulesEmptyNote" class="hint" hidden data-i18n="modes.rulesEmptyNote">Hiç ek kural yok.</p>

          <div class="inline" style="margin-top: 4px;">
            <button id="btnSetActiveMode" class="btn primary" data-i18n="modes.setActiveBtn">Aktif Yap</button>
            <button id="btnSaveMode" class="btn" data-i18n="modes.saveBtn">Kaydet</button>
            <button id="btnResetMode" class="btn" data-i18n="modes.resetBtn">Varsayılana Sıfırla</button>
            <button id="btnDeleteMode" class="btn danger" data-i18n="modes.deleteBtn">Modu Sil</button>
          </div>
        </div>
      </div>
    `;

    if (typeof i18n !== 'undefined' && i18n.translateDOM) {
      i18n.translateDOM(container);
    }
    this.initEvents();

    if (typeof CodeEditor !== 'undefined' && document.getElementById('modeMainRule')) {
      this.mainRuleEditor = new CodeEditor(document.getElementById('modeMainRule'), {
        getVariables: () => this.getResolvedVariables(),
        onChange: () => {
          this.refreshEmptyNotes();
          this.refreshVariableWarning();
        }
      });
    }
  }

  collapseAllRuleEditors() {
    for (const ed of this.ruleEditors) ed?.collapse?.();
  }

  ruleRowHtml(value) {
    return `
      <div class="mode-rule-row">
        <textarea class="rule-input" rows="1">${escapeHtml(value)}</textarea>
        <button class="btn icon-chip rule-up" title="↑">↑</button>
        <button class="btn icon-chip rule-down" title="↓">↓</button>
        <button class="btn danger icon-chip rule-del" title="✕">✕</button>
      </div>
    `;
  }

  // Bir satırın <textarea>'sını CodeEditor'e sarar — vurgulama/tooltip/
  // otomatik tamamlama/genişletme tek satırlık kurallarda da çalışsın diye.
  wrapRuleEditor(textarea) {
    if (typeof CodeEditor === 'undefined' || !textarea) return null;
    const editor = new CodeEditor(textarea, {
      inline: true,
      getVariables: () => this.getResolvedVariables(),
      onChange: () => {
        this.refreshEmptyNotes();
        this.refreshVariableWarning();
      }
    });
    this.ruleEditors.push(editor);
    return editor;
  }

  appendRuleRow(value) {
    const list = document.getElementById('modeRulesList');
    if (!list) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = this.ruleRowHtml(value).trim();
    const row = wrap.firstElementChild;
    list.appendChild(row);
    this.wrapRuleEditor(row.querySelector('.rule-input'));
    this.refreshEmptyNotes();
  }

  readRulesFromDom() {
    return Array.from(document.querySelectorAll('#modeRulesList .rule-input')).map((el) => el.value);
  }

  refreshEmptyNotes() {
    const $ = (id) => document.getElementById(id);
    const mainEmpty = !$('modeMainRule')?.value.trim();
    if ($('modeMainRuleEmptyNote')) $('modeMainRuleEmptyNote').hidden = !mainEmpty;
    const rules = this.readRulesFromDom().filter((r) => r.trim());
    if ($('modeRulesEmptyNote')) $('modeRulesEmptyNote').hidden = rules.length > 0;
  }

  refreshVariableWarning() {
    const $ = (id) => document.getElementById(id);
    if (!this.variables) return;
    const known = new Set(this.variables.map((v) => v.key.toUpperCase()));
    const used = extractTokens($('modeMainRule')?.value);
    for (const r of this.readRulesFromDom()) for (const t of extractTokens(r)) used.add(t);
    const unknown = [...used].filter((t) => !known.has(t));
    const warnEl = $('modeVarWarning');
    if (!warnEl) return;
    if (unknown.length) {
      warnEl.hidden = false;
      warnEl.textContent = `${this.i18n.t('modes.unknownVariableWarning') || 'Tanımsız değişken:'} ${unknown.map((t) => `{{${t}}}`).join(', ')}`;
    } else {
      warnEl.hidden = true;
      warnEl.textContent = '';
    }
  }

  initEvents() {
    if (this.initialized) return;
    const $ = (id) => document.getElementById(id);

    // Düzenlenecek modu seçen kutu da (aşağıdaki ön-mod seçici gibi) native
    // <select> yerine kendi çizdiğimiz dropdown. Bu pencere transparent +
    // frameless ve backdrop-filter kullanıyor; Chromium'da bu kombinasyon
    // native <select> popup'ının hiç açılmamasına/tıklamalara yanıt
    // vermemesine yol açabiliyor (bilinen bir sınırlama — bkz. presetDropdown
    // ve ".switch" için aynı gerekçe). Başka bir moda geçmeden önce ekrandaki
    // taslak kaydedilir, aksi halde yazılan Ana Kural / Ek Kurallar kaybolur.
    $('modeSelectBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const list = $('modeSelectList');
      if (list) list.hidden = !list.hidden;
    });
    $('modeSelectList')?.addEventListener('click', async (e) => {
      const item = e.target.closest('.mode-dropdown-item');
      if (!item) return;
      $('modeSelectList').hidden = true;
      if (item.dataset.id === this.activeEditingId) return;
      await this.saveCurrentForm();
      this.activeEditingId = item.dataset.id;
      this.render();
    });

    // Ön mod seçici — native <select> yerine kendi çizdiğimiz basit bir
    // dropdown.
    $('presetDropdownBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const list = $('presetDropdownList');
      if (list) list.hidden = !list.hidden;
    });
    $('presetDropdownList')?.addEventListener('click', (e) => {
      const item = e.target.closest('.mode-dropdown-item');
      if (!item) return;
      this.selectedPresetId = item.dataset.id;
      this.updatePresetDropdownButton();
      $('presetDropdownList').hidden = true;
    });
    document.addEventListener('click', () => {
      const list1 = $('presetDropdownList');
      if (list1) list1.hidden = true;
      const list2 = $('modeSelectList');
      if (list2) list2.hidden = true;
    });

    $('btnNewMode')?.addEventListener('click', async () => {
      const basePreset = this.selectedPresetId || (this.presets && this.presets[0] && this.presets[0].id) || 'blank';
      const preset = (this.presets || []).find((p) => p.id === basePreset);
      try {
        const m = await this.api.modes.create({
          name: this.i18n.t('modes.defaultName') || 'Yeni Mod',
          // Preset açıklaması yeni modun başlangıç açıklamasına aktarılır —
          // kullanıcı hangi değişkenleri gösterdiğini hemen görsün diye.
          description: preset ? this.i18n.t(preset.descriptionKey) || '' : '',
          basePreset
        });
        this.activeEditingId = m.id;
        this.render();
      } catch (err) {
        alert(err.message);
      }
    });

    $('btnSaveMode')?.addEventListener('click', async () => {
      try {
        await this.saveCurrentForm();
      } catch (err) {
        alert(err.message);
      }
      this.render();
    });

    // "Aktif Yap" da ekrandaki taslağı kaydeder — kullanıcı bir şey yazıp
    // doğrudan bu (görsel olarak öne çıkan, birincil renkli) butona basarsa
    // değişikliği kaybetmesin diye Kaydet ile aynı anda çalışır. Mod zaten
    // aktifken de tıklanabilir bırakılıyor (bkz. saveCurrentForm çağrısı).
    $('btnSetActiveMode')?.addEventListener('click', async () => {
      if (!this.activeEditingId) return;
      try {
        await this.saveCurrentForm();
      } catch (err) {
        alert(err.message);
        return;
      }
      await this.api.modes.setActive(this.activeEditingId);
      this.render();
    });

    $('btnDeleteMode')?.addEventListener('click', async () => {
      if (!this.activeEditingId) return;
      if (!confirm(this.i18n.t('modes.confirmDelete') || 'Bu modu silmek istediğinize emin misiniz?')) return;
      const next = await this.api.modes.remove(this.activeEditingId);
      this.activeEditingId = next;
      this.render();
    });

    $('btnResetMode')?.addEventListener('click', async () => {
      if (!this.activeEditingId) return;
      if (!confirm(this.i18n.t('modes.confirmReset') || 'Bu modu varsayılan haline sıfırlamak istediğinize emin misiniz?')) return;
      await this.api.modes.resetToDefault(this.activeEditingId);
      this.render();
    });

    $('btnAddRule')?.addEventListener('click', () => {
      this.appendRuleRow('');
      this.refreshVariableWarning();
    });

    $('modeRulesList')?.addEventListener('click', (e) => {
      const row = e.target.closest('.mode-rule-row');
      if (!row) return;
      const isDel = e.target.classList.contains('rule-del');
      const isUp = e.target.classList.contains('rule-up');
      const isDown = e.target.classList.contains('rule-down');
      if (!isDel && !isUp && !isDown) return;
      // Satır taşınmadan/silinmeden önce genişletilmiş bir editör varsa
      // daralt — aksi halde genişletme sırasında document.body'ye taşınan
      // .code-editor, satırıyla birlikte silinmez ve DOM'da yetim kalır.
      this.collapseAllRuleEditors();
      if (isDel) {
        row.remove();
      } else if (isUp) {
        const prev = row.previousElementSibling;
        if (prev) row.parentNode.insertBefore(row, prev);
      } else if (isDown) {
        const next = row.nextElementSibling;
        if (next) row.parentNode.insertBefore(next, row);
      }
      this.refreshEmptyNotes();
      this.refreshVariableWarning();
    });

    $('btnExportModes')?.addEventListener('click', async () => {
      const res = await this.api.modes.export();
      if (!res.ok && !res.canceled) alert(this.i18n.t('modes.exportFailed', { error: res.error }) || res.error);
    });

    $('btnImportModes')?.addEventListener('click', async () => {
      const res = await this.api.modes.import();
      if (res.ok) {
        alert(this.i18n.t('modes.importResult', { count: res.count }) || `${res.count} mod içe aktarıldı.`);
        this.render();
      } else if (!res.canceled) {
        alert(this.i18n.t('modes.importFailed', { error: res.error }) || res.error);
      }
    });

    $('btnBrowseRegistry')?.addEventListener('click', () => {
      const panel = $('registryPanel');
      if (!panel) return;
      panel.hidden = !panel.hidden;
      if (!panel.hidden) this.loadRegistry(false);
    });
    $('btnRegistryRefresh')?.addEventListener('click', () => this.loadRegistry(true));
    $('registrySearch')?.addEventListener('input', () => this._renderRegistryList());
    $('registrySort')?.addEventListener('change', () => this._renderRegistryList());

    this.api.on.modeChanged(() => {
      const pane = document.getElementById('tab-modes');
      if (pane?.classList.contains('active')) this.render();
    });

    this.initialized = true;
  }

  /** Mod galerisini GitHub kataloğundan yükler. */
  async loadRegistry(force) {
    const statusEl = document.getElementById('registryStatus');
    const listEl = document.getElementById('registryList');
    if (!listEl || !statusEl) return;

    statusEl.textContent = this.t('modes.registryLoading', 'Katalog yükleniyor…');
    listEl.innerHTML = '';

    const res = await this.api.modes.browseRegistry({ force });
    if (!res.ok) {
      statusEl.textContent = `${this.t('modes.registryError', 'Katalog alınamadı')}: ${res.error}`;
      return;
    }
    if (!res.modes.length) {
      statusEl.textContent = this.t('modes.registryEmpty', 'Katalogda henüz mod yok.');
      return;
    }

    statusEl.textContent = this.t('modes.registryCount', '{{n}} mod bulundu').replace('{{n}}', res.modes.length);
    this.registryModes = res.modes;
    this._renderRegistryList();
  }

  /** Arama + sıralama uygulayıp galeri listesini çizer. */
  async _renderRegistryList() {
    const listEl = document.getElementById('registryList');
    if (!listEl || !this.registryModes) return;

    const q = (document.getElementById('registrySearch')?.value || '').trim().toLowerCase();
    const sort = document.getElementById('registrySort')?.value || 'top';
    const favs = new Set((await this.api.settings.get()).favoriteModes || []);

    let list = this.registryModes.filter((m) => {
      if (!q) return true;
      return (m.name + ' ' + m.description + ' ' + m.tags.join(' ')).toLowerCase().includes(q);
    });

    if (sort === 'fav') list = list.filter((m) => favs.has(m.id));
    list = [...list].sort((a, b) => {
      if (sort === 'az') return a.name.localeCompare(b.name, 'tr');
      if (sort === 'new') return String(b.addedAt || '').localeCompare(String(a.addedAt || ''));
      return (b.popularity || 0) - (a.popularity || 0); // top (ve fav içinde de popülerlik)
    });

    if (!list.length) {
      listEl.innerHTML = `<p class="hint">${escapeHtml(this.t('modes.registryNoMatch', 'Eşleşen mod yok.'))}</p>`;
      return;
    }

    // Sıra numarası yalnızca "en popüler" sıralamasında anlamlı — orada gerçek
    // bir top listesi; diğer sıralamalarda numara bilgi taşımayacağı için yok.
    const ranked = sort === 'top';

    listEl.innerHTML = list
      .map((m, i) => `
        <div class="registry-item" data-id="${escapeHtml(m.id)}">
          <div class="registry-item-head">
            ${ranked ? `<span class="registry-rank">${i + 1}</span>` : ''}
            <span class="registry-name">${escapeHtml(m.name)}</span>
            ${m.author ? `<span class="registry-author">${escapeHtml(m.author)}</span>` : ''}
            <span class="registry-pop" title="${escapeHtml(this.t('modes.popularityTitle', 'Popülerlik'))}">★ ${m.popularity || 0}</span>
            <button class="btn-fav${favs.has(m.id) ? ' on' : ''}" title="${escapeHtml(this.t('modes.favToggle', 'Favorilere ekle'))}">♥</button>
          </div>
          <div class="registry-desc">${escapeHtml(m.description)}</div>
          <div class="registry-tags">${m.tags.map((t) => `<span class="registry-tag">${escapeHtml(t)}</span>`).join('')}</div>
          <div class="registry-actions">
            <button class="btn btn-registry-preview">${escapeHtml(this.t('modes.registryPreview', 'Kuralı gör'))}</button>
            <button class="btn primary btn-registry-install">${escapeHtml(this.t('modes.registryInstall', 'Kur'))}</button>
          </div>
          <pre class="registry-preview" hidden></pre>
        </div>
      `)
      .join('');

    listEl.querySelectorAll('.registry-item').forEach((item) => {
      const mode = this.registryModes.find((m) => m.id === item.dataset.id);
      if (!mode) return;
      const pre = item.querySelector('.registry-preview');

      // Favori: yerel tercih, global oylama değil (GitHub raw yazma kabul etmiyor).
      item.querySelector('.btn-fav').addEventListener('click', async (e) => {
        const s = await this.api.settings.get();
        const cur = new Set(s.favoriteModes || []);
        if (cur.has(mode.id)) cur.delete(mode.id); else cur.add(mode.id);
        await this.api.settings.patch({ favoriteModes: [...cur] });
        e.currentTarget.classList.toggle('on', cur.has(mode.id));
      });

      // Önizleme: kullanıcı kurmadan önce sistem istemine ne gireceğini görür.
      item.querySelector('.btn-registry-preview').addEventListener('click', () => {
        if (pre.hidden) {
          const rules = mode.additionalRules.length
            ? `\n\n--- ${this.t('modes.rulesTitle', 'Ek Kurallar')} ---\n` +
              mode.additionalRules.map((r, i) => `${i + 1}. ${r}`).join('\n')
            : '';
          pre.textContent = mode.mainRule + rules;
        }
        pre.hidden = !pre.hidden;
      });

      item.querySelector('.btn-registry-install').addEventListener('click', async () => {
        const res2 = await this.api.modes.installFromRegistry(mode);
        if (res2.ok) {
          alert(this.t('modes.registryInstalled', '"{{name}}" kuruldu.').replace('{{name}}', mode.name));
          this.render();
        } else {
          alert(res2.error || this.t('modes.registryInstallFailed', 'Kurulamadı.'));
        }
      });
    });
  }

  updatePresetDropdownButton() {
    const btn = document.getElementById('presetDropdownBtn');
    if (!btn) return;
    const preset = (this.presets || []).find((p) => p.id === this.selectedPresetId);
    btn.textContent = `${preset ? this.i18n.t(preset.labelKey) || preset.id : ''} ▾`;
  }

  async saveCurrentForm() {
    if (!this.activeEditingId) return;
    const $ = (id) => document.getElementById(id);
    await this.api.modes.update(this.activeEditingId, {
      name: $('modeName').value,
      description: $('modeDesc').value,
      mainRule: $('modeMainRule').value,
      additionalRules: this.readRulesFromDom(),
      useStyleGuide: !!$('modeUseStyleGuide').checked
    });
  }

  async render() {
    this.ensureSkeleton();
    const $ = (id) => document.getElementById(id);

    if (!this.presets) this.presets = await this.api.modes.presets();
    if (!this.variables) this.variables = await this.api.modes.variables();

    let categories = [];
    try {
      if (this.api.modes.categories) categories = await this.api.modes.categories();
    } catch {
      categories = [];
    }
    if (!categories || !categories.length) {
      categories = [
        { id: 'core', labelKey: 'modes.catCore', icon: '⚡' },
        { id: 'engineering', labelKey: 'modes.catEngineering', icon: '💻' },
        { id: 'creative', labelKey: 'modes.catCreative', icon: '🎨' },
        { id: 'strategy', labelKey: 'modes.catStrategy', icon: '📈' },
        { id: 'learning', labelKey: 'modes.catLearning', icon: '🎓' },
        { id: 'productivity', labelKey: 'modes.catProductivity', icon: '🛠️' }
      ];
    }

    const presetListEl = $('presetDropdownList');
    if (presetListEl) {
      const groupedPresets = {};
      categories.forEach((c) => { groupedPresets[c.id] = []; });
      this.presets.forEach((p) => {
        const cat = p.category || 'core';
        if (!groupedPresets[cat]) groupedPresets[cat] = [];
        groupedPresets[cat].push(p);
      });

      let html = '';
      categories.forEach((c) => {
        const items = groupedPresets[c.id] || [];
        if (!items.length) return;
        const catTitle = this.i18n.t(c.labelKey) || c.id;
        html += `<div class="mode-dropdown-group-header">${c.icon || ''} ${escapeHtml(catTitle)}</div>`;
        items.forEach((p) => {
          html += `
            <div class="mode-dropdown-item preset-item" data-id="${p.id}">
              <div class="preset-item-name">${escapeHtml(this.i18n.t(p.labelKey) || p.id)}</div>
              <div class="preset-item-desc">${escapeHtml(this.i18n.t(p.descriptionKey) || '')}</div>
            </div>
          `;
        });
      });
      presetListEl.innerHTML = html;
      if (!this.selectedPresetId) this.selectedPresetId = this.presets[0] && this.presets[0].id;
      this.updatePresetDropdownButton();
    }

    const list = await this.api.modes.list();
    const activeId = await this.api.modes.getActive();

    const modeListEl = $('modeSelectList');
    const modeBtnEl = $('modeSelectBtn');
    if (!modeListEl || !modeBtnEl) return;

    if (!this.activeEditingId || !list.some((m) => m.id === this.activeEditingId)) {
      this.activeEditingId = activeId || (list[0] && list[0].id);
    }

    const groupedModes = {};
    categories.forEach((c) => { groupedModes[c.id] = []; });
    list.forEach((m) => {
      const cat = m.category || 'core';
      if (!groupedModes[cat]) groupedModes[cat] = [];
      groupedModes[cat].push(m);
    });

    let modeHtml = '';
    categories.forEach((c) => {
      const items = groupedModes[c.id] || [];
      if (!items.length) return;
      const catTitle = this.i18n.t(c.labelKey) || c.id;
      modeHtml += `<div class="mode-dropdown-group-header">${c.icon || ''} ${escapeHtml(catTitle)}</div>`;
      items.forEach((m) => {
        const label = m.labelKey ? this.i18n.t(m.labelKey) : m.name;
        const suffix = m.id === activeId ? ` (${this.i18n.t('modes.activeLabel') || 'Aktif'})` : '';
        modeHtml += `<div class="mode-dropdown-item" data-id="${m.id}">${m.id === activeId ? '★ ' : ''}${escapeHtml(label)}${escapeHtml(suffix)}</div>`;
      });
    });
    modeListEl.innerHTML = modeHtml;

    const currentForBtn = list.find((m) => m.id === this.activeEditingId);
    if (currentForBtn) {
      const label = currentForBtn.labelKey ? this.i18n.t(currentForBtn.labelKey) : currentForBtn.name;
      modeBtnEl.textContent = `${currentForBtn.id === activeId ? '★ ' : ''}${label} ▾`;
    }

    const current = list.find((x) => x.id === this.activeEditingId);
    if (current) await this.renderForm(current, current.id === activeId);
  }

  // {key, type, descriptionKey} katalogunu, i18n çevirisi uygulanmış
  // {key, type, description} haline çevirir — CodeEditor'ün tooltip'i ve
  // otomatik tamamlama menüsü bunu kullanır.
  getResolvedVariables() {
    return (this.variables || []).map((v) => ({
      key: v.key,
      type: v.type,
      description: this.i18n.t(v.descriptionKey) || ''
    }));
  }

  async renderForm(mode, isActive) {
    const $ = (id) => document.getElementById(id);
    if ($('modeForm')) $('modeForm').hidden = false;
    if ($('modeName')) {
      $('modeName').value = mode.labelKey ? this.i18n.t(mode.labelKey) : mode.name;
      $('modeName').disabled = !!mode.builtin;
    }
    if ($('modeDesc')) $('modeDesc').value = mode.description || '';
    if ($('modeBuiltinBadge')) $('modeBuiltinBadge').hidden = !mode.builtin;
    if ($('modePresetBadge')) {
      const preset = (this.presets || []).find((p) => p.id === mode.basePreset);
      $('modePresetBadge').textContent = preset ? this.i18n.t(preset.labelKey) || preset.id : '';
    }

    if ($('modeMainRule')) {
      $('modeMainRule').value = mode.mainRule || '';
      this.mainRuleEditor?.refresh();
    }
    if ($('modeUseStyleGuide')) $('modeUseStyleGuide').checked = !!mode.useStyleGuide;

    const rulesList = $('modeRulesList');
    if (rulesList) {
      // Eski satırlardan biri genişletilmiş kalmışsa önce yetim DOM
      // bırakmadan kapat, sonra tüm CodeEditor örneklerini at.
      for (const ed of this.ruleEditors) ed.destroy();
      this.ruleEditors = [];
      rulesList.innerHTML = (mode.additionalRules || []).map((r) => this.ruleRowHtml(r)).join('');
      for (const ta of rulesList.querySelectorAll('.rule-input')) this.wrapRuleEditor(ta);
    }

    this.refreshEmptyNotes();
    this.refreshVariableWarning();

    // Buton, mod zaten aktifken de TIKLANABİLİR bırakılıyor — devre dışı
    // bırakılırsa kullanıcı bu (görsel olarak öne çıkan) büyük butona basıp
    // hiçbir şey olmadığını görüyor ve az önce yazdığı taslağın kaydedilip
    // kaydedilmediğinden emin olamıyordu. Aktifken de basılırsa zararsızca
    // formu yeniden kaydedip yeniden aktive eder.
    const btnAct = $('btnSetActiveMode');
    if (btnAct) {
      btnAct.textContent = isActive ? `✓ ${this.i18n.t('modes.activeLabel') || 'Aktif Mod'}` : (this.i18n.t('modes.setActiveBtn') || 'Aktif Yap');
      btnAct.disabled = false;
    }
    const btnDel = $('btnDeleteMode');
    if (btnDel) btnDel.hidden = !!mode.builtin;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ModeUI;
}
