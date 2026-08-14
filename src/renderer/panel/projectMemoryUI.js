'use strict';

/**
 * ProjectMemoryUI — Sub-component for viewing and editing AI Project Memory & Context Ledger.
 * Proje Hafıza Arayüzü — Projeye ait yapay zeka hafıza özetini ve diyalog geçmişini yönetir.
 */

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

class ProjectMemoryUI {
  /**
   * @param {Object} api - Preload API bridge
   * @param {Object} i18n - Localization helper
   */
  constructor(api, i18n) {
    this.api = api;
    this.i18n = i18n;
    this.currentProject = null;
    this.unsavedSummary = null;
  }

  t(key, fallback) {
    if (this.i18n && typeof this.i18n.t === 'function') {
      const val = this.i18n.t(key);
      if (val && val !== key) return val;
    }
    return fallback;
  }

  /**
   * Renders the memory management card inside the container.
   * @param {HTMLElement} container
   * @param {Object} project
   */
  render(container, project) {
    if (!container || !project) return;
    this.currentProject = project;
    const mem = project.memory || { summary: '', history: [], lastCompactedAt: 0 };
    const historyList = Array.isArray(mem.history) ? mem.history : [];
    const summaryText = this.unsavedSummary !== null ? this.unsavedSummary : (mem.summary || '');

    const summaryTokens = Math.ceil(summaryText.length / 3.8);
    const lastCompactStr = mem.lastCompactedAt
      ? new Date(mem.lastCompactedAt).toLocaleDateString(undefined, { hour: '2-digit', minute: '2-digit' })
      : this.t('projects.memoryNeverCompacted', 'Henüz sıkıştırılmadı');

    container.innerHTML = `
      <div class="project-memory-card card">
        <div class="project-sub-header">
          <div class="memory-title-group">
            <span class="sub-title">🧠 ${this.t('projects.memoryTitle', 'Yapay Zeka Hafızası (Memory & Context)')}</span>
            <span class="badge-mem-stat">${summaryTokens} tk · ${historyList.length} ${this.t('projects.memoryTurns', 'diyalog')}</span>
          </div>
          <div class="memory-actions-top">
            <button id="btnClearProjMemory" class="btn danger btn-sm">${this.t('projects.clearMemoryBtn', 'Hafızayı Sıfırla')}</button>
          </div>
        </div>

        <p class="hint" style="margin-top: 4px;">
          ${this.t('projects.memoryDesc', 'Modelin bu projede öğrendiği özet kurallar, kararlar ve teknik bağlam. İsteğe göre doğrudan düzenlenebilir.')}
        </p>

        <div class="field" style="margin-top: 8px;">
          <textarea id="projectMemorySummary" class="memory-editor-textarea" rows="6" placeholder="${this.t('projects.memoryPlaceholder', 'Proje hafıza özeti, mimari kararlar ve kurallar…')}">${escapeHtml(summaryText)}</textarea>
        </div>

        <div class="memory-footer-bar">
          <span class="memory-compact-info">${this.t('projects.lastCompacted', 'Son Sıkıştırma:')} ${lastCompactStr}</span>
          <div class="inline-btn-group">
            <button id="btnRevertMemory" class="btn ghost btn-sm" ${this.unsavedSummary === null ? 'disabled' : ''}>${this.t('projects.memoryRevertBtn', 'Geri Al')}</button>
            <button id="btnSaveMemory" class="btn primary btn-sm">${this.t('projects.memorySaveBtn', 'Hafızayı Kaydet')}</button>
          </div>
        </div>

        ${this.renderHistoryAccordion(historyList)}
      </div>
    `;

    this.bindEvents(container);
  }

  renderHistoryAccordion(history) {
    if (!history.length) {
      return `
        <details class="memory-history-details" style="margin-top: 10px;">
          <summary class="history-summary-toggle">${this.t('projects.historyTitle', 'Diyalog Geçmişi')} (0)</summary>
          <div class="empty-note" style="padding: 6px 0;">${this.t('projects.noHistoryYet', 'Bu projede henüz kayıtlı diyalog geçmişi yok.')}</div>
        </details>
      `;
    }

    const itemsHtml = history
      .slice(-10)
      .map((h) => {
        const roleIcon = h.role === 'user' ? '👤' : '🤖';
        const roleLabel = h.role === 'user' ? 'Kullanıcı' : 'Sparky';
        const timeStr = h.timestamp ? new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        return `
          <div class="history-turn-item ${h.role}">
            <div class="turn-header">
              <span>${roleIcon} <strong>${roleLabel}</strong></span>
              <span class="turn-meta">${h.tokens || 0} tk · ${timeStr}</span>
            </div>
            <div class="turn-content">${escapeHtml(h.content)}</div>
          </div>
        `;
      })
      .join('');

    return `
      <details class="memory-history-details" style="margin-top: 10px;">
        <summary class="history-summary-toggle">${this.t('projects.historyTitle', 'Diyalog Geçmişi')} (${history.length})</summary>
        <div class="history-turns-container">${itemsHtml}</div>
      </details>
    `;
  }

  bindEvents(container) {
    const $ = (id) => container.querySelector(`#${id}`);
    const textarea = $('projectMemorySummary');
    const btnSave = $('btnSaveMemory');
    const btnRevert = $('btnRevertMemory');
    const btnClear = $('btnClearProjMemory');

    textarea?.addEventListener('input', (e) => {
      this.unsavedSummary = e.target.value;
      if (btnRevert) btnRevert.disabled = false;
    });

    btnSave?.addEventListener('click', async () => {
      if (!this.currentProject) return;
      const text = textarea ? textarea.value : '';
      await this.api.memory.update(this.currentProject.id, { summary: text });
      this.unsavedSummary = null;
      if (btnRevert) btnRevert.disabled = true;
      const tag = document.getElementById('savedTag');
      if (tag) {
        tag.hidden = false;
        setTimeout(() => { tag.hidden = true; }, 1800);
      }
    });

    btnRevert?.addEventListener('click', () => {
      this.unsavedSummary = null;
      if (this.currentProject && textarea) {
        textarea.value = this.currentProject.memory?.summary || '';
      }
      if (btnRevert) btnRevert.disabled = true;
    });

    btnClear?.addEventListener('click', async () => {
      if (!this.currentProject) return;
      const confirmMsg = this.t('projects.clearMemoryConfirm', 'Bu projenin yapay zeka hafızası ve diyalog geçmişi sıfırlanacak. Onaylıyor musunuz?');
      if (confirm(confirmMsg)) {
        await this.api.memory.clear(this.currentProject.id);
        this.unsavedSummary = null;
      }
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProjectMemoryUI;
}
