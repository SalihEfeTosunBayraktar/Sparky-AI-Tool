'use strict';

/**
 * ContextGauge — Controller for the circular Donut Chart context window & memory usage indicator.
 * Context Göstergesi — Proje bazlı context penceresi ve hafıza kullanımını görselleştiren Donut Chart kontrolcüsü.
 */
class ContextGauge {
  /**
   * @param {HTMLElement} rootEl - Container element
   * @param {Object} options
   * @param {Object} options.api - Preload API bridge
   * @param {Object} options.i18n - Translation dictionary helper
   */
  constructor(rootEl, options = {}) {
    this.root = rootEl;
    this.api = options.api || window.api;
    this.i18n = options.i18n || window.i18n;

    // SVG radius = 14 => Circumference = 2 * π * 14 ~= 87.964
    this.RADIUS = 14;
    this.CIRCUMFERENCE = 2 * Math.PI * this.RADIUS;

    this.fillEl = this.root.querySelector('#donutFill');
    this.labelEl = this.root.querySelector('#donutLabel');
    this.badgeEl = this.root.querySelector('#gaugeBadge');
    this.chipLabelEl = this.root.querySelector('#gaugeChipLabel');
    this.btnClearMem = this.root.querySelector('#btnClearMem');

    if (this.fillEl) {
      this.fillEl.style.strokeDasharray = `${this.CIRCUMFERENCE.toFixed(2)}`;
    }

    this.bindEvents();
  }

  /**
   * Binds click events for memory management inside tooltip.
   */
  bindEvents() {
    if (this.btnClearMem && this.api?.memory?.clear) {
      this.btnClearMem.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.api.memory.clear();
      });
    }
  }

  /**
   * Helper translation function with fallback.
   * @param {string} key
   * @param {string} fallback
   * @param {Object} [params]
   * @returns {string}
   */
  t(key, fallback, params) {
    if (this.i18n && typeof this.i18n.t === 'function') {
      const translated = this.i18n.t(key, params);
      if (translated && translated !== key) return translated;
    }
    return fallback;
  }

  /**
   * Renders the Donut Gauge based on context metrics.
   * @param {Object} metrics
   * @param {boolean} metrics.active - Whether an active project is selected
   * @param {string|null} metrics.projectName
   * @param {number} metrics.projectNotesTokens
   * @param {number} metrics.summaryTokens
   * @param {number} metrics.historyTokens
   * @param {number} metrics.inputTokens
   * @param {number} metrics.totalTokens
   * @param {number} metrics.usableCapacity
   * @param {number} metrics.maxCapacity
   * @param {number} metrics.ratio
   * @param {boolean} metrics.isCompacting
   */
  render(metrics) {
    if (!this.root || !this.fillEl || !this.labelEl) return;
    if (!metrics) return;

    // 1. STATELESS MODE — Proje seçili değilken hafıza devre dışı
    if (!metrics.active) {
      this.root.dataset.state = 'stateless';
      this.fillEl.style.strokeDasharray = '2 4';
      this.fillEl.style.strokeDashoffset = '0';
      this.labelEl.textContent = '∅';
      const titleStateless = this.t('gauge.statelessTooltip', 'Context: ∅ (Hafızasız)');
      this.root.title = titleStateless;
      const donutCont = this.root.querySelector('.donut-container');
      if (donutCont) donutCont.title = titleStateless;
      if (this.badgeEl) this.badgeEl.textContent = this.t('gauge.stateless', 'Hafızasız');

      this.setTooltipField('#valGaugeProj', '—');
      this.setTooltipField('#valGaugeMem', this.t('gauge.stateless', 'Kapalı (Proje Yok)'));
      this.setTooltipField('#valGaugeHist', '0 tk');
      this.setTooltipField('#valGaugeInput', `${metrics.inputTokens || 0} tk`);
      this.setTooltipField('#valGaugeTotal', `${(metrics.totalTokens || 0).toLocaleString()} / ${(metrics.maxCapacity || 32768).toLocaleString()}`);
      if (this.btnClearMem) this.btnClearMem.hidden = true;
      return;
    }

    // 2. PROJECT ACTIVE MODE — Proje hafızası aktif ve izleniyor
    if (this.btnClearMem) this.btnClearMem.hidden = false;
    const ratio = Math.max(0, Math.min(1, metrics.ratio || 0));
    const percentage = Math.round(ratio * 100);
    const offset = this.CIRCUMFERENCE - ratio * this.CIRCUMFERENCE;

    this.fillEl.style.strokeDasharray = `${this.CIRCUMFERENCE.toFixed(2)}`;
    this.fillEl.style.strokeDashoffset = `${offset.toFixed(2)}`;
    this.labelEl.textContent = metrics.isCompacting ? '⚡' : `${percentage}%`;
    const titleActive = `Context: ${percentage}%`;
    this.root.title = titleActive;
    const donutCont = this.root.querySelector('.donut-container');
    if (donutCont) donutCont.title = titleActive;

    // State Resolution
    let state = 'normal';
    let badgeText = this.t('gauge.optimal', 'Optimal');

    if (metrics.isCompacting) {
      state = 'compacting';
      badgeText = this.t('gauge.compacting', 'Sıkıştırılıyor…');
    } else if (percentage >= 85) {
      state = 'critical';
      badgeText = this.t('gauge.critical', 'Kritik');
    } else if (percentage >= 70) {
      state = 'warning';
      badgeText = this.t('gauge.warning', 'Uyarı');
    }

    this.root.dataset.state = state;
    if (this.badgeEl) this.badgeEl.textContent = `${badgeText} (%${percentage})`;

    // Populate Tooltip Breakdown Fields
    this.setTooltipField('#valGaugeProj', `${(metrics.projectNotesTokens || 0).toLocaleString()} tk`);
    this.setTooltipField('#valGaugeMem', `${(metrics.summaryTokens || 0).toLocaleString()} tk`);
    this.setTooltipField('#valGaugeHist', `${(metrics.historyTokens || 0).toLocaleString()} tk`);
    this.setTooltipField('#valGaugeInput', `${(metrics.inputTokens || 0).toLocaleString()} tk`);
    this.setTooltipField('#valGaugeTotal', `${(metrics.totalTokens || 0).toLocaleString()} / ${(metrics.maxCapacity || 32768).toLocaleString()}`);
  }

  /**
   * Helper to set text content of a tooltip sub-field.
   * @param {string} selector
   * @param {string} text
   */
  setTooltipField(selector, text) {
    const el = this.root.querySelector(selector);
    if (el) el.textContent = text;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ContextGauge;
}
