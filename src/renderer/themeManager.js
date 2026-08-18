'use strict';

/**
 * ThemeManager — Dynamic Theme, Accent Palette & Geometric Shape Controller for Sparky AI.
 * Tema, Vurgu Rengi ve Küre Geometrisi yöneticisi.
 */

const ACCENT_PRESETS = [
  {
    id: 'sunset',
    labelKey: 'theme.sunset',
    gradient: 'linear-gradient(135deg, #FF6B4A, #E0287D)',
    glow: 'rgba(255, 107, 74, 0.45)'
  },
  {
    id: 'cyber',
    labelKey: 'theme.cyber',
    gradient: 'linear-gradient(135deg, #00F2FE, #4FACFE)',
    glow: 'rgba(0, 242, 254, 0.45)'
  },
  {
    id: 'emerald',
    labelKey: 'theme.emerald',
    gradient: 'linear-gradient(135deg, #10B981, #059669)',
    glow: 'rgba(16, 185, 129, 0.45)'
  },
  {
    id: 'amethyst',
    labelKey: 'theme.amethyst',
    gradient: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
    glow: 'rgba(139, 92, 246, 0.45)'
  },
  {
    id: 'solar',
    labelKey: 'theme.solar',
    gradient: 'linear-gradient(135deg, #F59E0B, #EF4444)',
    glow: 'rgba(245, 158, 11, 0.45)'
  },
  {
    id: 'cosmic',
    labelKey: 'theme.cosmic',
    gradient: 'linear-gradient(135deg, #6366F1, #A855F7)',
    glow: 'rgba(99, 102, 241, 0.45)'
  },
  {
    id: 'ocean',
    labelKey: 'theme.ocean',
    gradient: 'linear-gradient(135deg, #06B6D4, #3B82F6)',
    glow: 'rgba(6, 182, 212, 0.45)'
  },
  {
    id: 'midnight',
    labelKey: 'theme.midnight',
    gradient: 'linear-gradient(135deg, #64748B, #334155)',
    glow: 'rgba(100, 116, 139, 0.45)'
  }
];

const SHAPE_PRESETS = [
  { id: 'circle', labelKey: 'theme.shapeCircle', svgPath: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/>' },
  { id: 'squircle', labelKey: 'theme.shapeSquircle', svgPath: '<rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="currentColor" stroke-width="2"/>' },
  { id: 'hexagon', labelKey: 'theme.shapeHexagon', svgPath: '<polygon points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5" fill="none" stroke="currentColor" stroke-width="2"/>' },
  { id: 'diamond', labelKey: 'theme.shapeDiamond', svgPath: '<polygon points="12,3 21,12 12,21 3,12" fill="none" stroke="currentColor" stroke-width="2"/>' },
  { id: 'octagon', labelKey: 'theme.shapeOctagon', svgPath: '<polygon points="8,3 16,3 21,8 21,16 16,21 8,21 3,16 3,8" fill="none" stroke="currentColor" stroke-width="2"/>' },
  { id: 'triangle', labelKey: 'theme.shapeTriangle', svgPath: '<polygon points="12,3 21,19 3,19" fill="none" stroke="currentColor" stroke-width="2"/>' }
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
          <svg viewBox="0 0 24 24" class="shape-icon" aria-hidden="true">
            ${shape.svgPath}
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ThemeManager, ACCENT_PRESETS, SHAPE_PRESETS };
}
