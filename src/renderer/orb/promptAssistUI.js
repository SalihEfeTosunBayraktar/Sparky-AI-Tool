'use strict';

/**
 * PromptAssistUI — Controller for Dynamic Variation Tabs & Granular Block-Level Interactive Editing.
 * Prompt Asistanı UI — Dinamik varyasyon sekmeleri, SVG ikonlar ve parçalı blok düzeyinde interaktif prompt düzenleyici.
 *
 * IMPORTANT: Prompt Assist only activates in "prompt-preparer" mode (not in "normal-chat").
 * ÖNEMLI: Prompt Assist yalnızca "Prompt Hazırlayıcı" modunda aktif olur, normal sohbette gizlenir.
 */
class PromptAssistUI {
  /**
   * @param {Object} elements - UI element references
   * @param {HTMLElement} elements.toolbar - Floating toolbar inside output bubble
   * @param {HTMLElement} elements.tabsContainer - Variation pill tabs wrapper
   * @param {HTMLElement} elements.blocksContainer - Block cards wrapper container
   * @param {HTMLElement} elements.rawTextarea - Raw markdown output element (<div>)
   * @param {HTMLElement} elements.toggleViewBtn - Button to toggle Block vs Raw view
   * @param {HTMLElement} elements.shuffleBtn - Button to randomize strategy triad
   * @param {Object} options
   */
  constructor(elements, options = {}) {
    this.toolbar = elements.toolbar;
    this.tabsContainer = elements.tabsContainer;
    this.blocksContainer = elements.blocksContainer;
    this.rawTextarea = elements.rawTextarea;
    this.toggleViewBtn = elements.toggleViewBtn;
    this.shuffleBtn = elements.shuffleBtn;
    this.api = options.api || window.sparky;
    this.i18n = options.i18n || window.i18n;
    this.onPromptChange = options.onPromptChange || (() => {});
    this.onVariationSelect = options.onVariationSelect || (() => {});

    this.activeStrategyId = null; // İlk strateji yüklendiğinde atanacak / Set on first load
    this.viewMode = 'raw'; // 'raw' | 'blocks'
    this.strategies = [];
    this.variations = {};   // { [strategyId]: promptText }
    this.parsedBlocks = [];
    this.enabled = false;   // Mod kontrolü — sadece prompt-preparer'da true / Only true in prompt-preparer mode
    this.refineOverlay = null; // In-place refinement overlay reference

    this._bindEvents();
  }

  /** Event listener bağlama / Bind event listeners */
  _bindEvents() {
    if (this.toggleViewBtn) {
      this.toggleViewBtn.addEventListener('click', () => this.toggleViewMode());
    }
    if (this.shuffleBtn) {
      this.shuffleBtn.addEventListener('click', () => this.refreshStrategies(true));
    }
  }

  /** Aktif moda ve ayara göre Prompt Assist'i aç/kapat / Enable/disable based on active mode & setting */
  async setMode(modeId, enableSetting = true) {
    this.enabled = modeId === 'prompt-preparer' && enableSetting !== false;
    if (!this.enabled) {
      this.hide();
    } else if (this.strategies.length === 0) {
      await this.refreshStrategies(false);
    }
  }

  /** i18n kısayolu / i18n shortcut helper */
  t(key, fallback) {
    if (this.i18n && typeof this.i18n.t === 'function') {
      const translated = this.i18n.t(key);
      if (translated && translated !== key) return translated;
    }
    return fallback;
  }

  /** Tüm UI elemanlarını gizle / Hide all assist UI elements */
  hide() {
    if (this.toolbar) this.toolbar.hidden = true;
    if (this.blocksContainer) this.blocksContainer.hidden = true;
  }

  /** Stratejileri backend'den çek / Fetch strategies from backend */
  async refreshStrategies(forceRandom = false) {
    try {
      if (this.api?.assist?.getStrategies) {
        this.strategies = await this.api.assist.getStrategies({ forceRandom });
      }
      // İlk aktif strateji: gelen 3'lünün ilki / Default to first in triad
      if (this.strategies.length > 0 && !this.activeStrategyId) {
        this.activeStrategyId = this.strategies[0].id;
      }
      this.renderTabs();

      // Eğer ekranda mevcut bir prompt varsa 3 strateji için anında türet
      const cur = this.variations[this.activeStrategyId] || (this.rawTextarea ? this.rawTextarea.value || this.rawTextarea.textContent : '');
      if (cur && cur.trim()) {
        await this.setContent(cur.trim());
      }
    } catch (err) {
      console.warn('[PromptAssistUI] Stratejiler alınamadı:', err);
    }
  }

  /** Sekme pill'lerini dinamik olarak oluştur / Dynamically render variation tab pills */
  renderTabs() {
    if (!this.tabsContainer) return;
    this.tabsContainer.innerHTML = '';

    this.strategies.forEach((st) => {
      const tab = document.createElement('button');
      tab.className = `var-tab${st.id === this.activeStrategyId ? ' active' : ''}`;
      tab.dataset.var = st.id;
      tab.dataset.style = st.style || 'detailed';
      tab.title = st.description || st.label;
      tab.innerHTML = `<span class="var-icon">${st.icon}</span><span class="var-label">${escapeHtml(st.label)}</span>`;
      tab.addEventListener('click', () => this.selectStrategy(st.id));
      this.tabsContainer.appendChild(tab);
    });
  }

  /** Strateji seçildiğinde / When a strategy tab is clicked */
  async selectStrategy(strategyId) {
    this.activeStrategyId = strategyId;

    // Sekme aktiflik durumunu güncelle / Update active tab visuals
    if (this.tabsContainer) {
      this.tabsContainer.querySelectorAll('.var-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.var === strategyId);
      });
    }

    // Ağırlık kaydet / Record weight for adaptive learning
    if (this.api?.assist?.recordSelection) {
      this.api.assist.recordSelection(strategyId).catch(() => {});
    }

    // Önbellekteki varyasyonu anında göster (yeniden üretim tetiklemez)
    const content = this.variations[strategyId] || this.variations['structured'] || '';
    if (content) {
      this._displayContent(content);
      this.onPromptChange(content);
    }
  }

  /** Blok / Ham metin görünümü arasında geçiş / Toggle between blocks and raw views */
  toggleViewMode() {
    this.viewMode = this.viewMode === 'blocks' ? 'raw' : 'blocks';
    this._applyViewMode();
  }

  /** Görünüm modunu DOM'a uygula / Apply current view mode to DOM */
  _applyViewMode() {
    const hasBlocks = this.parsedBlocks.length > 1;
    const isBlocks = this.viewMode === 'blocks' && hasBlocks;

    if (this.blocksContainer) this.blocksContainer.hidden = !isBlocks;
    if (this.rawTextarea) this.rawTextarea.hidden = isBlocks;

    // Buton metnini güncelle / Update toggle button label
    if (this.toggleViewBtn) {
      const label = isBlocks ? this.t('assist.rawMode', 'Ham Metin') : this.t('assist.blockMode', 'Bloklar');
      const icon = isBlocks
        ? '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/><path d="M3 4.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zm0 3a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zm0 3a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5z"/></svg>'
        : '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/></svg>';
      this.toggleViewBtn.innerHTML = `${icon} <span>${label}</span>`;
      // Blok sayısı 1'den fazla değilse buton gizle / Hide if only one block
      this.toggleViewBtn.style.display = hasBlocks ? '' : 'none';
    }
  }

  /**
   * Dışarıdan içerik atama (setOutput sonrası çağrılır).
   * External content setter (called from setOutput in app.js).
   */
  async setContent(promptMarkdown) {
    if (!this.enabled) {
      this.hide();
      return;
    }

    const text = String(promptMarkdown || '').trim();
    if (!text) {
      this.variations = {};
      this.parsedBlocks = [];
      this.hide();
      return;
    }

    // 3 aktif stratejinin tamamı için varyasyonları anında türet / Pre-derive all 3 variations at once
    if (this.api?.assist?.deriveVariations && this.strategies.length > 0) {
      try {
        this.variations = await this.api.assist.deriveVariations(text, this.strategies);
      } catch {
        this.variations = { [this.activeStrategyId || 'structured']: text };
      }
    } else {
      this.variations = { [this.activeStrategyId || 'structured']: text };
    }

    // Aktif sekmenin varyasyonunu göster / Display current active strategy variation
    const currentText = this.variations[this.activeStrategyId] || text;
    this._displayContent(currentText);
  }

  /** İçeriği parse edip hem ham hem blok olarak hazırla / Parse and display content */
  async _displayContent(text) {
    if (this.toolbar) this.toolbar.hidden = false;

    // Blokları ayrıştır / Parse blocks
    if (this.api?.assist?.parseBlocks) {
      this.parsedBlocks = await this.api.assist.parseBlocks(text);
    } else {
      this.parsedBlocks = [{ id: 'blk_1', type: 'general', title: 'Prompt', content: text, iconSvg: '' }];
    }

    this._renderBlocks();
    this._applyViewMode();
  }

  /** Blok kartlarını oluştur / Render block editor cards */
  _renderBlocks() {
    if (!this.blocksContainer) return;
    this.blocksContainer.innerHTML = '';

    this.parsedBlocks.forEach((block, index) => {
      const card = document.createElement('div');
      card.className = 'prompt-block-card';
      card.dataset.blockType = block.type;

      card.innerHTML = `
        <div class="block-card-header">
          <div class="block-title-tag">
            <span class="block-icon">${block.iconSvg || ''}</span>
            <span class="block-title">${escapeHtml(block.title)}</span>
          </div>
          <div class="block-actions">
            <button class="btn-block-action btn-block-refine" title="${this.t('assist.refineBlock', 'AI ile Düzenle')}">
              <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor"><path d="M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.089z"/></svg>
            </button>
            <button class="btn-block-action btn-block-delete" title="${this.t('assist.deleteBlock', 'Sil')}">
              <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/></svg>
            </button>
          </div>
        </div>
        <div class="block-card-body" contenteditable="true" spellcheck="false">${escapeHtml(block.content)}</div>
      `;

      const bodyEl = card.querySelector('.block-card-body');

      // İçerik değişikliğinde senkronize et / Sync on content edit
      bodyEl.addEventListener('input', () => {
        block.content = bodyEl.innerText.trim();
        this._syncToRaw();
      });

      // Bölümü sil / Delete block
      card.querySelector('.btn-block-delete').addEventListener('click', () => {
        this.parsedBlocks.splice(index, 1);
        this._renderBlocks();
        this._syncToRaw();
        this._applyViewMode();
      });

      // AI ile bölüm düzenleme / Refine block with AI
      card.querySelector('.btn-block-refine').addEventListener('click', () => {
        this._showRefineInput(block, bodyEl, card);
      });

      this.blocksContainer.appendChild(card);
    });
  }

  /**
   * Blok kartı içinde in-place düzenleme girdisi göster (window.prompt yerine).
   * Show in-place inline refine input inside the block card (replaces window.prompt).
   */
  _showRefineInput(block, bodyEl, cardEl) {
    // Zaten açık bir düzenleme girdisi varsa kapat / Close existing
    const existing = cardEl.querySelector('.refine-inline');
    if (existing) { existing.remove(); return; }

    const container = document.createElement('div');
    container.className = 'refine-inline';
    container.innerHTML = `
      <input type="text" class="refine-input" placeholder="${this.t('assist.refinePromptQuestion', 'Nasıl düzenleyelim?')}" />
      <button class="btn-refine-go btn-block-action"  title="Uygula">
        <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor"><path d="M10.97 4.97a.75.75 0 0 1 1.071 1.05l-3.992 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.235.235 0 0 1 .02-.022z"/></svg>
      </button>
      <button class="btn-refine-cancel btn-block-action" title="İptal">
        <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/></svg>
      </button>
    `;

    const inputEl = container.querySelector('.refine-input');
    container.querySelector('.btn-refine-cancel').addEventListener('click', () => container.remove());

    const doRefine = async () => {
      const instruction = inputEl.value.trim();
      if (!instruction) return;
      await this._executeRefine(block, bodyEl, instruction);
      container.remove();
    };

    container.querySelector('.btn-refine-go').addEventListener('click', doRefine);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doRefine();
      if (e.key === 'Escape') container.remove();
    });

    cardEl.appendChild(container);
    inputEl.focus();
  }

  /** AI refinement isteğini gönder / Execute the AI refinement request */
  async _executeRefine(block, bodyEl, instruction) {
    bodyEl.style.opacity = '0.5';
    try {
      const fullText = this.rawTextarea ? (this.rawTextarea.textContent || '') : '';
      const res = await this.api.assist.refineBlock({
        fullText,
        blockType: block.type,
        currentContent: block.content,
        instruction
      });
      if (res && res.updatedContent) {
        block.content = res.updatedContent;
        bodyEl.innerText = res.updatedContent;
        this._syncToRaw();
      }
    } catch (err) {
      console.error('[PromptAssistUI] Refinement error:', err);
    } finally {
      bodyEl.style.opacity = '1';
    }
  }

  /** Bloklardan ham metni yeniden oluştur / Re-serialize blocks to raw markdown */
  _syncToRaw() {
    let serialized = '';
    if (this.parsedBlocks.length > 0) {
      serialized = this.parsedBlocks
        .map((b) => (b.type === 'general' ? b.content : `## ${b.title}\n${b.content}`))
        .join('\n\n');
    }
    if (this.rawTextarea) this.rawTextarea.textContent = serialized;
    if (this.activeStrategyId) this.variations[this.activeStrategyId] = serialized;
    this.onPromptChange(serialized);
  }
}

/** HTML escape yardımcısı / HTML escape utility */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PromptAssistUI;
}
