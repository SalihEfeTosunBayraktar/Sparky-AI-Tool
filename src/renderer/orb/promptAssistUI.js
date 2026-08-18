'use strict';

/**
 * PromptAssistUI — Controller for Multi-Variation Tabs & Granular Block-Level Interactive Editing.
 * Prompt Asistanı UI — Çoklu varyasyon sekmeleri ve parçalı blok düzeyinde interaktif prompt düzenleyici kontrolcüsü.
 */
class PromptAssistUI {
  /**
   * @param {Object} elements - UI element references
   * @param {HTMLElement} elements.tabsContainer - Variation pill tabs container
   * @param {HTMLElement} elements.blocksContainer - Block cards wrapper container
   * @param {HTMLElement} elements.rawTextarea - Raw markdown output textarea
   * @param {HTMLElement} elements.toggleViewBtn - Button to toggle Block vs Raw view
   * @param {Object} options
   * @param {Object} options.api - Preload IPC bridge
   * @param {Object} options.i18n - Translation dictionary helper
   * @param {Function} options.onPromptChange - Callback when prompt text is modified
   */
  constructor(elements, options = {}) {
    this.tabsContainer = elements.tabsContainer;
    this.blocksContainer = elements.blocksContainer;
    this.rawTextarea = elements.rawTextarea;
    this.toggleViewBtn = elements.toggleViewBtn;
    this.api = options.api || window.api;
    this.i18n = options.i18n || window.i18n;
    this.onPromptChange = options.onPromptChange || (() => {});

    this.activeVariation = 'structured'; // 'concise' | 'structured' | 'deep'
    this.viewMode = 'blocks'; // 'blocks' | 'raw'
    this.variations = {
      concise: '',
      structured: '',
      deep: ''
    };
    this.parsedBlocks = [];

    this.init();
  }

  /**
   * Initializes event listeners and base view structure.
   */
  init() {
    if (this.toggleViewBtn) {
      this.toggleViewBtn.addEventListener('click', () => this.toggleViewMode());
    }
  }

  /**
   * Helper translation function with fallback.
   */
  t(key, fallback) {
    if (this.i18n && typeof this.i18n.t === 'function') {
      const translated = this.i18n.t(key);
      if (translated && translated !== key) return translated;
    }
    return fallback;
  }

  /**
   * Toggles between Granular Block Editor and Raw Markdown Textarea.
   */
  toggleViewMode() {
    this.viewMode = this.viewMode === 'blocks' ? 'raw' : 'blocks';
    this.applyViewMode();
  }

  /**
   * Sets and renders active view mode.
   */
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

  /**
   * Sets prompt content and renders variation tabs and block editor.
   * @param {string} promptMarkdown - Output prompt markdown
   */
  async setContent(promptMarkdown) {
    const text = String(promptMarkdown || '').trim();
    if (!text) {
      this.variations = { concise: '', structured: '', deep: '' };
      this.parsedBlocks = [];
      if (this.tabsContainer) this.tabsContainer.hidden = true;
      if (this.toggleViewBtn) this.toggleViewBtn.hidden = true;
      this.applyViewMode();
      return;
    }

    this.variations[this.activeVariation] = text;
    if (this.tabsContainer) this.tabsContainer.hidden = false;
    if (this.toggleViewBtn) this.toggleViewBtn.hidden = false;

    await this.parseAndRenderBlocks(text);
  }

  /**
   * Parses current prompt into semantic blocks and renders cards.
   * @param {string} text
   */
  async parseAndRenderBlocks(text) {
    if (this.api?.assist?.parseBlocks) {
      this.parsedBlocks = await this.api.assist.parseBlocks(text);
    } else {
      this.parsedBlocks = [
        { id: 'blk_gen_1', type: 'general', title: 'Prompt', content: text, icon: '📝' }
      ];
    }
    this.renderBlocks();
    this.applyViewMode();
  }

  /**
   * Renders the interactive modular block cards.
   */
  renderBlocks() {
    if (!this.blocksContainer) return;
    this.blocksContainer.innerHTML = '';

    this.parsedBlocks.forEach((block, index) => {
      const card = document.createElement('div');
      card.className = 'prompt-block-card';
      card.dataset.blockType = block.type;
      card.dataset.blockId = block.id;

      card.innerHTML = `
        <div class="block-card-header">
          <div class="block-title-tag">
            <span class="block-icon">${block.icon || '📌'}</span>
            <span class="block-title">${escapeHtml(block.title)}</span>
          </div>
          <div class="block-actions">
            <button class="btn-block-action btn-block-refine" title="${this.t('assist.refineBlock', 'Bu Bölümü Yeniden Yaz / Düzenle')}">⚡</button>
            <button class="btn-block-action btn-block-delete" title="${this.t('assist.deleteBlock', 'Bu Bölümü Sil')}">✕</button>
          </div>
        </div>
        <div class="block-card-body" contenteditable="true" spellcheck="false">${escapeHtml(block.content)}</div>
      `;

      // In-place text editing
      const bodyEl = card.querySelector('.block-card-body');
      bodyEl.addEventListener('input', () => {
        block.content = bodyEl.innerText.trim();
        this.syncFullMarkdown();
      });

      // Delete block action
      const delBtn = card.querySelector('.btn-block-delete');
      delBtn.addEventListener('click', () => {
        this.parsedBlocks.splice(index, 1);
        this.renderBlocks();
        this.syncFullMarkdown();
      });

      // Micro-refinement action
      const refineBtn = card.querySelector('.btn-block-refine');
      refineBtn.addEventListener('click', () => this.promptBlockRefinement(block, bodyEl));

      this.blocksContainer.appendChild(card);
    });
  }

  /**
   * Triggers micro-refinement popup for a specific block.
   */
  async promptBlockRefinement(block, bodyEl) {
    const promptMsg = this.t('assist.refinePromptQuestion', `"${block.title}" bölümünü nasıl düzenleyelim? (Örn: daha kısa yap, negatif kural ekle)`);
    const instruction = window.prompt(promptMsg, '');
    if (!instruction || !instruction.trim()) return;

    bodyEl.style.opacity = '0.5';
    try {
      const fullText = this.rawTextarea ? this.rawTextarea.value : '';
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

  /**
   * Reconstructs full markdown from blocks and notifies listeners.
   */
  syncFullMarkdown() {
    let serialized = '';
    if (this.parsedBlocks.length > 0) {
      serialized = this.parsedBlocks
        .map((b) => (b.type === 'general' ? b.content : `## ${b.title}\n${b.content}`))
        .join('\n\n');
    }
    if (this.rawTextarea) this.rawTextarea.value = serialized;
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
