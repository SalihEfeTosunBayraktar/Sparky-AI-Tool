'use strict';

/**
 * ThemeManager — Dynamic Theme, Accent Palette & Geometric Shape Controller for Sparky AI.
 * Tema, Vurgu Rengi ve Küre Geometrisi yöneticisi.
 */

function getAccentPresets() {
  if (typeof globalThis !== 'undefined' && Array.isArray(globalThis.ACCENT_PRESETS) && globalThis.ACCENT_PRESETS.length) {
    return globalThis.ACCENT_PRESETS;
  }
  if (typeof window !== 'undefined' && Array.isArray(window.ACCENT_PRESETS) && window.ACCENT_PRESETS.length) {
    return window.ACCENT_PRESETS;
  }
  if (typeof require !== 'undefined') {
    try {
      const presets = require('./themePresets');
      if (Array.isArray(presets.ACCENT_PRESETS) && presets.ACCENT_PRESETS.length) {
        return presets.ACCENT_PRESETS;
      }
    } catch {}
  }
  return [];
}

function getShapePresets() {
  if (typeof globalThis !== 'undefined' && Array.isArray(globalThis.SHAPE_PRESETS) && globalThis.SHAPE_PRESETS.length) {
    return globalThis.SHAPE_PRESETS;
  }
  if (typeof window !== 'undefined' && Array.isArray(window.SHAPE_PRESETS) && window.SHAPE_PRESETS.length) {
    return window.SHAPE_PRESETS;
  }
  if (typeof require !== 'undefined') {
    try {
      const presets = require('./themePresets');
      if (Array.isArray(presets.SHAPE_PRESETS) && presets.SHAPE_PRESETS.length) {
        return presets.SHAPE_PRESETS;
      }
    } catch {}
  }
  return [];
}

class ThemeManager {
  /**
   * @param {Object} [options]
   * @param {HTMLElement} [options.targetEl] - Element to apply data-theme and data-accent
   * @param {Function} [options.onChange] - Callback when theme or accent updates
   */
  constructor(options = {}) {
    this.targetEl = options.targetEl || (typeof document !== 'undefined' ? document.documentElement : null);
    this.onChange = options.onChange || null;
    this.currentMode = 'dark';
    this.currentAccent = 'sunset';
    this.currentShape = 'circle';
    this.mediaQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    if (this.mediaQuery) {
      this.mediaQuery.addEventListener('change', () => {
        if (this.currentMode === 'system') {
          this.applyTheme(this.currentMode, this.currentAccent, this.currentShape);
        }
      });
    }
  }

  resolveMode(mode) {
    if (mode === 'system') {
      return this.mediaQuery && this.mediaQuery.matches ? 'dark' : 'light';
    }
    return mode === 'light' ? 'light' : 'dark';
  }

  applyTheme(mode = 'dark', accent = 'sunset', shape = 'circle') {
    this.currentMode = mode || 'dark';
    this.currentAccent = accent || 'sunset';
    this.currentShape = shape || 'circle';

    const effectiveMode = this.resolveMode(this.currentMode);

    if (this.targetEl) {
      this.targetEl.setAttribute('data-theme', effectiveMode);
      this.targetEl.setAttribute('data-accent', this.currentAccent);
      this.targetEl.setAttribute('data-shape', this.currentShape);
    }

    if (typeof this.onChange === 'function') {
      this.onChange({
        mode: this.currentMode,
        effectiveMode,
        accent: this.currentAccent,
        shape: this.currentShape
      });
    }
  }

  renderPicker(container, onSelect, i18n) {
    if (!container) return;
    container.innerHTML = '';

    const list = getAccentPresets();

    for (const preset of list) {
      const isSelected = preset.id === this.currentAccent;
      const label = i18n && typeof i18n.t === 'function' ? (i18n.t(preset.labelKey) || preset.id) : preset.id;

      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = `accent-swatch-item${isSelected ? ' active' : ''}`;
      swatch.dataset.accent = preset.id;
      swatch.title = label;

      swatch.innerHTML = `
        <span class="swatch-orb" style="background: ${preset.gradient}; box-shadow: 0 0 10px ${preset.glow};">
          <svg viewBox="0 0 24 24" class="swatch-sparkle" aria-hidden="true">
            <path d="M12 2.2 13.9 9 20.8 10.9 13.9 12.8 12 19.6 10.1 12.8 3.2 10.9 10.1 9Z" fill="#ffffff" />
          </svg>
        </span>
        <span class="swatch-label">${label}</span>
      `;

      swatch.addEventListener('click', () => {
        container.querySelectorAll('.accent-swatch-item').forEach((el) => el.classList.remove('active'));
        swatch.classList.add('active');
        this.applyTheme(this.currentMode, preset.id, this.currentShape);
        if (typeof onSelect === 'function') {
          onSelect(preset.id);
        }
      });

      container.appendChild(swatch);
    }
  }

  renderShapePicker(container, onSelect, i18n) {
    if (!container) return;
    container.innerHTML = '';

    const accList = getAccentPresets();
    const shapeList = getShapePresets();

    const currentPreset = accList.find((p) => p.id === this.currentAccent) || accList[0] || {
      gradient: 'linear-gradient(135deg, #FF6B4A, #E0287D)',
      glow: 'rgba(255, 107, 74, 0.45)'
    };

    for (const shape of shapeList) {
      const isSelected = shape.id === this.currentShape;
      const label = i18n && typeof i18n.t === 'function' ? (i18n.t(shape.labelKey) || shape.id) : shape.id;

      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = `shape-swatch-item${isSelected ? ' active' : ''}`;
      swatch.dataset.shape = shape.id;
      swatch.title = label;

      swatch.innerHTML = `
        <span class="swatch-shape-preview shape-${shape.id}" style="background: ${currentPreset.gradient}; box-shadow: 0 0 10px ${currentPreset.glow};">
          <svg viewBox="0 0 24 24" class="swatch-sparkle" aria-hidden="true">
            <path d="M12 2.2 13.9 9 20.8 10.9 13.9 12.8 12 19.6 10.1 12.8 3.2 10.9 10.1 9Z" fill="#ffffff" />
          </svg>
        </span>
        <span class="swatch-label">${label}</span>
      `;

      swatch.addEventListener('click', () => {
        container.querySelectorAll('.shape-swatch-item').forEach((el) => el.classList.remove('active'));
        swatch.classList.add('active');
        this.applyTheme(this.currentMode, this.currentAccent, shape.id);
        if (typeof onSelect === 'function') {
          onSelect(shape.id);
        }
      });

      container.appendChild(swatch);
    }
  }
}

const ACCENT_PRESETS = getAccentPresets();
const SHAPE_PRESETS = getShapePresets();

if (typeof window !== 'undefined') {
  window.ThemeManager = ThemeManager;
  window.ACCENT_PRESETS = ACCENT_PRESETS;
  window.SHAPE_PRESETS = SHAPE_PRESETS;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ThemeManager = ThemeManager;
  globalThis.ACCENT_PRESETS = ACCENT_PRESETS;
  globalThis.SHAPE_PRESETS = SHAPE_PRESETS;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ThemeManager, ACCENT_PRESETS, SHAPE_PRESETS, getAccentPresets, getShapePresets };
}
