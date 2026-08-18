'use strict';

/**
 * ThemeManager — Dynamic Theme, Accent Palette & Geometric Shape Controller for Sparky AI.
 * Tema, 23 Vurgu Rengi ve 12 Küre Geometrisi yöneticisi.
 */

const ACCENT_PRESETS = [
  { id: 'sunset', labelKey: 'theme.sunset', gradient: 'linear-gradient(135deg, #FF6B4A, #E0287D)', glow: 'rgba(255, 107, 74, 0.45)' },
  { id: 'cyber', labelKey: 'theme.cyber', gradient: 'linear-gradient(135deg, #00F2FE, #4FACFE)', glow: 'rgba(0, 242, 254, 0.45)' },
  { id: 'emerald', labelKey: 'theme.emerald', gradient: 'linear-gradient(135deg, #10B981, #059669)', glow: 'rgba(16, 185, 129, 0.45)' },
  { id: 'amethyst', labelKey: 'theme.amethyst', gradient: 'linear-gradient(135deg, #8B5CF6, #EC4899)', glow: 'rgba(139, 92, 246, 0.45)' },
  { id: 'solar', labelKey: 'theme.solar', gradient: 'linear-gradient(135deg, #F59E0B, #EF4444)', glow: 'rgba(245, 158, 11, 0.45)' },
  { id: 'cosmic', labelKey: 'theme.cosmic', gradient: 'linear-gradient(135deg, #6366F1, #A855F7)', glow: 'rgba(99, 102, 241, 0.45)' },
  { id: 'ocean', labelKey: 'theme.ocean', gradient: 'linear-gradient(135deg, #06B6D4, #3B82F6)', glow: 'rgba(6, 182, 212, 0.45)' },
  { id: 'midnight', labelKey: 'theme.midnight', gradient: 'linear-gradient(135deg, #64748B, #334155)', glow: 'rgba(100, 116, 139, 0.45)' },
  { id: 'aurora', labelKey: 'theme.aurora', gradient: 'linear-gradient(135deg, #00FF87, #60EFFF)', glow: 'rgba(0, 255, 135, 0.45)' },
  { id: 'matrix', labelKey: 'theme.matrix', gradient: 'linear-gradient(135deg, #00FF66, #008F11)', glow: 'rgba(0, 255, 102, 0.45)' },
  { id: 'inferno', labelKey: 'theme.inferno', gradient: 'linear-gradient(135deg, #FF1361, #FFF800)', glow: 'rgba(255, 19, 97, 0.45)' },
  { id: 'glacier', labelKey: 'theme.glacier', gradient: 'linear-gradient(135deg, #70A6FF, #E0F2FE)', glow: 'rgba(112, 166, 255, 0.45)' },
  { id: 'synthwave', labelKey: 'theme.synthwave', gradient: 'linear-gradient(135deg, #FF007F, #7928CA)', glow: 'rgba(255, 0, 127, 0.45)' },
  { id: 'tokyo', labelKey: 'theme.tokyo', gradient: 'linear-gradient(135deg, #F43F5E, #8B5CF6)', glow: 'rgba(244, 63, 94, 0.45)' },
  { id: 'nebula', labelKey: 'theme.nebula', gradient: 'linear-gradient(135deg, #C084FC, #4338CA)', glow: 'rgba(192, 132, 252, 0.45)' },
  { id: 'amber', labelKey: 'theme.amber', gradient: 'linear-gradient(135deg, #FBBF24, #B45309)', glow: 'rgba(251, 191, 36, 0.45)' },
  { id: 'coral', labelKey: 'theme.coral', gradient: 'linear-gradient(135deg, #FB7185, #E11D48)', glow: 'rgba(251, 113, 133, 0.45)' },
  { id: 'crimson', labelKey: 'theme.crimson', gradient: 'linear-gradient(135deg, #E11D48, #881337)', glow: 'rgba(225, 29, 72, 0.45)' },
  { id: 'vaporwave', labelKey: 'theme.vaporwave', gradient: 'linear-gradient(135deg, #67E8F9, #F472B6)', glow: 'rgba(103, 232, 249, 0.45)' },
  { id: 'forest', labelKey: 'theme.forest', gradient: 'linear-gradient(135deg, #34D399, #065F46)', glow: 'rgba(52, 211, 153, 0.45)' },
  { id: 'obsidian', labelKey: 'theme.obsidian', gradient: 'linear-gradient(135deg, #94A3B8, #0F172A)', glow: 'rgba(148, 163, 184, 0.35)' },
  { id: 'lavender', labelKey: 'theme.lavender', gradient: 'linear-gradient(135deg, #C4B5FD, #818CF8)', glow: 'rgba(196, 181, 253, 0.45)' },
  { id: 'dracula', labelKey: 'theme.dracula', gradient: 'linear-gradient(135deg, #50FA7B, #BD93F9)', glow: 'rgba(189, 147, 249, 0.45)' }
];

const SHAPE_PRESETS = [
  { id: 'circle', labelKey: 'theme.shapeCircle' },
  { id: 'squircle', labelKey: 'theme.shapeSquircle' },
  { id: 'hexagon', labelKey: 'theme.shapeHexagon' },
  { id: 'diamond', labelKey: 'theme.shapeDiamond' },
  { id: 'octagon', labelKey: 'theme.shapeOctagon' },
  { id: 'triangle', labelKey: 'theme.shapeTriangle' },
  { id: 'shield', labelKey: 'theme.shapeShield' },
  { id: 'star', labelKey: 'theme.shapeStar' },
  { id: 'pill', labelKey: 'theme.shapePill' },
  { id: 'leaf', labelKey: 'theme.shapeLeaf' },
  { id: 'rhombus', labelKey: 'theme.shapeRhombus' },
  { id: 'cross', labelKey: 'theme.shapeCross' }
];

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

    for (const preset of ACCENT_PRESETS) {
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

    const currentPreset = ACCENT_PRESETS.find((p) => p.id === this.currentAccent) || ACCENT_PRESETS[0];

    for (const shape of SHAPE_PRESETS) {
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
  module.exports = { ThemeManager, ACCENT_PRESETS, SHAPE_PRESETS };
}
