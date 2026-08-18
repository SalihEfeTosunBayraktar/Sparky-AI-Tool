'use strict';

/**
 * PromptAssistUI — Controller for Dynamic Variation Tabs & Granular Block-Level Interactive Editing.
 * Prompt Asistanı UI — Dinamik varyasyon sekmeleri, SVG ikonlar ve parçalı blok düzeyinde interaktif prompt düzenleyici.
 */
class PromptAssistUI {
  /**
   * @param {Object} elements - UI element references
   * @param {HTMLElement} elements.toolbar - Integrated floating toolbar inside output container
   * @param {HTMLElement} elements.tabsContainer - Variation pill tabs wrapper
   * @param {HTMLElement} elements.blocksContainer - Block cards wrapper container
   * @param {HTMLElement} elements.rawTextarea - Raw markdown output element
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

    this.activeStrategyId = 'structured';
    this.viewMode = 'raw'; // 'raw' | 'blocks'
    this.strategies = [];
    this.variations = {}; // { [strategyId]: text }
    this.parsedBlocks = [];

    this.init();
  }

  async init() {
    if (this.toggleViewBtn) {
      this.toggleViewBtn.addEventListener('click', () => this.toggleViewMode());
    }
    if (this.shuffleBtn) {
      this.shuffleBtn.addEventListener('click', () => this.refreshStrategies(true));
    }
    await this.refreshStrategies(false);
  }

  t(key, fallback) {
    if (this.i18n && typeof this.i18n.t === 'function') {
      const translated = this.i18n.t(key);
      if (translated && translated !== key) return translated;
    }
    return fallback;
  }

  async refreshStrategies(forceRandom = false) {
    try {
      if (this.api?.assist?.getStrategies) {
        this.strategies = await this.api.assist.getStrategies({ forceRandom });
      }
      this.renderTabs();
    } catch (err) {
      console.warn('[PromptAssistUI] Stratejiler alınamadı:', err);
    }
  }

  renderTabs() {
    if (!this.tabsContainer) return;
    this.tabsContainer.innerHTML = '';

    this.strategies.forEach((st) => {
      const tab = document.createElement('button');
      tab.className = `var-tab${st.id === this.activeStrategyId ? ' active' : ''}`;
      tab.dataset.var = st.id;
      tab.title = st.description || st.label;
      tab.innerHTML = `<span class="var-icon">${st.icon}</span><span class="var-label">${escapeHtml(st.label)}</span>`;
      
      tab.addEventListener('click', async () => {
        this.selectStrategy(st.id);
      });
      this.tabsContainer.appendChild(tab);
    });
  }

  async selectStrategy(strategyId) {
    this.activeStrategyId = strategyId;
    if (this.tabsContainer) {
      this.tabsContainer.querySelectorAll('.var-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.var === strategyId);
      });
    }

    if (this.api?.assist?.recordSelection) {
      this.api.assist.recordSelection(strategyId).catch(() => {});
    }

    const cached = this.variations[strategyId];
    if (cached) {
      this.setContent(cached, false);
      this.onPromptChange(cached);
    } else {
      const selected = this.strategies.find((s) => s.id === strategyId);
      this.onVariationSelect(selected || { id: strategyId, style: 'detailed' });
    }
  }

  toggleViewMode() {
    this.viewMode = this.viewMode === 'blocks' ? 'raw' : 'blocks';
    this.applyViewMode();
  }

  applyViewMode() {
    const isBlocks = this.viewMode === 'blocks' && this.parsedBlocks.length > 0;
    if (this.blocksContainer) this.blocksContainer.hidden = !isBlocks;
    if (this.rawTextarea) this.rawTextarea.hidden = isBlocks;
    if (this.toggleViewBtn) {
      this.toggleViewBtn.innerHTML = isBlocks
        ? `<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/><path d="M3 4.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zm0 3a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zm0 3a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5z"/></svg> <span>${this.t('assist.rawMode', 'Ham Metin')}</span>`
        : `<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/></svg> <span>${this.t('assist.blockMode', 'Bloklar')}</span>`;
    }
  }

  async setContent(promptMarkdown, updateCache = true) {
    const text = String(promptMarkdown || '').trim();
    if (!text) {
      this.variations = {};
      this.parsedBlocks = [];
      if (this.toolbar) this.toolbar.hidden = true;
      this.applyViewMode();
      return;
    }

    if (updateCache) {
      this.variations[this.activeStrategyId] = text;
    }
    if (this.toolbar) this.toolbar.hidden = false;

    await this.parseAndRenderBlocks(text);
  }

  async parseAndRenderBlocks(text) {
    if (this.api?.assist?.parseBlocks) {
      this.parsedBlocks = await this.api.assist.parseBlocks(text);
    } else {
      this.parsedBlocks = [
        { id: 'blk_1', type: 'general', title: 'Prompt', content: text, iconSvg: '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5z"/></svg>' }
      ];
    }
    this.renderBlocks();
    this.applyViewMode();
  }

  renderBlocks() {
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
            <button class="btn-block-action btn-block-refine" title="${this.t('assist.refineBlock', 'Bu Bölümü Düzenle')}">
              <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor"><path d="M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.089z"/></svg>
            </button>
            <button class="btn-block-action btn-block-delete" title="${this.t('assist.deleteBlock', 'Bu Bölümü Sil')}">
              <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/></svg>
            </button>
          </div>
        </div>
        <div class="block-card-body" contenteditable="true" spellcheck="false">${escapeHtml(block.content)}</div>
      `;

      const bodyEl = card.querySelector('.block-card-body');
      bodyEl.addEventListener('input', () => {
        block.content = bodyEl.innerText.trim();
        this.syncFullMarkdown();
      });

      card.querySelector('.btn-block-delete').addEventListener('click', () => {
        this.parsedBlocks.splice(index, 1);
        this.renderBlocks();
        this.syncFullMarkdown();
      });

      card.querySelector('.btn-block-refine').addEventListener('click', () => {
        this.promptBlockRefinement(block, bodyEl);
      });

      this.blocksContainer.appendChild(card);
    });
  }

  async promptBlockRefinement(block, bodyEl) {
    const promptMsg = this.t('assist.refinePromptQuestion', `"${block.title}" bölümünü nasıl düzenleyelim?`);
    const instruction = window.prompt(promptMsg, '');
    if (!instruction || !instruction.trim()) return;

    bodyEl.style.opacity = '0.5';
    try {
      const fullText = this.rawTextarea ? (this.rawTextarea.textContent || '') : '';
      const res = await this.api.assist.refineBlock({
        fullText,
        blockType: block.type,
        currentContent: block.content,
        instruction: instruction.trim()
      });
      if (res && res.updatedContent) {
        block.content = res.updatedContent;
        bodyEl.innerText = res.updatedContent;
        this.syncFullMarkdown();
      }
    } catch (err) {
      console.error('[PromptAssistUI] Refinement error:', err);
    } finally {
      bodyEl.style.opacity = '1';
    }
  }

  syncFullMarkdown() {
    let serialized = '';
    if (this.parsedBlocks.length > 0) {
      serialized = this.parsedBlocks
        .map((b) => (b.type === 'general' ? b.content : `## ${b.title}\n${b.content}`))
        .join('\n\n');
    }
    if (this.rawTextarea) this.rawTextarea.textContent = serialized;
    this.variations[this.activeStrategyId] = serialized;
    this.onPromptChange(serialized);
  }
}

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
