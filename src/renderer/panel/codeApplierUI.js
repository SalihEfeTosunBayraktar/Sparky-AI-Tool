'use strict';

/**
 * CodeApplierUI — Interactive Diff Preview & Patch Confirmation Modal for Sparky AI.
 * Üretilen kod bloklarını doğrudan hedef projedeki dosyalara diff önizlemeli uygulayan UI modülü.
 */

class CodeApplierUI {
  /**
   * @param {Object} [options]
   * @param {Object} [options.api] - Electron API bridge
   */
  constructor(options = {}) {
    this.api = options.api || (typeof window !== 'undefined' ? window.api : null);
    this.modalEl = null;
    this.createModal();
  }

  createModal() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('codeApplierModal')) {
      this.modalEl = document.getElementById('codeApplierModal');
      return;
    }

    const modal = document.createElement('div');
    modal.id = 'codeApplierModal';
    modal.className = 'sparky-modal-backdrop';
    modal.style.display = 'none';

    modal.innerHTML = `
      <div class="sparky-modal-dialog">
        <div class="sparky-modal-header">
          <div class="sparky-modal-title">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            <span id="diffModalFilePath">Dosya Değişikliği</span>
          </div>
          <button type="button" class="sparky-modal-close" id="diffModalClose">&times;</button>
        </div>
        <div class="sparky-modal-body">
          <div class="diff-summary-bar">
            <span class="diff-tag add" id="diffAdditions">+0</span>
            <span class="diff-tag del" id="diffDeletions">-0</span>
            <span class="diff-hint">Otomatik <code>.sparky_backup</code> yedeği alınacaktır.</span>
          </div>
          <pre class="diff-preview-box" id="diffPreviewBox"></pre>
        </div>
        <div class="sparky-modal-footer">
          <button type="button" class="btn secondary" id="diffModalCancel">İptal</button>
          <button type="button" class="btn primary" id="diffModalApply">Dosyaya Uygula &amp; Kaydet</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalEl = modal;

    modal.querySelector('#diffModalClose').addEventListener('click', () => this.close());
    modal.querySelector('#diffModalCancel').addEventListener('click', () => this.close());
  }

  open(filePath, diffResult, onApply) {
    if (!this.modalEl) this.createModal();
    if (!this.modalEl) return;

    this.modalEl.querySelector('#diffModalFilePath').textContent = filePath;
    this.modalEl.querySelector('#diffAdditions').textContent = `+${diffResult.additions || 0}`;
    this.modalEl.querySelector('#diffDeletions').textContent = `-${diffResult.deletions || 0}`;

    const preview = this.modalEl.querySelector('#diffPreviewBox');
    preview.innerHTML = '';

    const lines = (diffResult.diffText || '').split('\n');
    for (const line of lines) {
      const lineEl = document.createElement('div');
      if (line.startsWith('+')) lineEl.className = 'diff-line add';
      else if (line.startsWith('-')) lineEl.className = 'diff-line del';
      else lineEl.className = 'diff-line normal';
      lineEl.textContent = line;
      preview.appendChild(lineEl);
    }

    const applyBtn = this.modalEl.querySelector('#diffModalApply');
    applyBtn.onclick = async () => {
      applyBtn.disabled = true;
      applyBtn.textContent = 'Uygulanıyor...';
      if (typeof onApply === 'function') {
        await onApply();
      }
      applyBtn.disabled = false;
      applyBtn.textContent = 'Dosyaya Uygula & Kaydet';
      this.close();
    };

    this.modalEl.style.display = 'flex';
  }

  close() {
    if (this.modalEl) this.modalEl.style.display = 'none';
  }
}

if (typeof window !== 'undefined') {
  window.CodeApplierUI = CodeApplierUI;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CodeApplierUI;
}
