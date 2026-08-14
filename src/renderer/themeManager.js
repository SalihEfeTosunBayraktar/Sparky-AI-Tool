'use strict';

/**
 * ThemeManager — Dynamic Theme & Accent Palette Controller for Sparky AI.
 * Tema ve Vurgu Rengi / Küre Avatarı yöneticisi.
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

class ThemeManager {
  /**
   * @param {Object} [options]
   * @param {HTMLElement} [options.targetEl] - Element to apply data-theme and data-accent (defaults to html)
   * @param {Function} [options.onChange] - Callback when theme or accent updates
   */
  constructor(options = {}) {
    this.targetEl = options.targetEl || (typeof document !== 'undefined' ? document.documentElement : null);
    this.onChange = options.onChange || null;
    this.currentMode = 'dark';
    this.currentAccent = 'sunset';
    this.mediaQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    if (this.mediaQuery) {
      this.mediaQuery.addEventListener('change', () => {
        if (this.currentMode === 'system') {
          this.applyTheme(this.currentMode, this.currentAccent);
        }
      });
    }
  }

  /**
   * Resolves effective theme mode taking 'system' into account.
   * @param {string} mode - 'dark' | 'light' | 'system'
   * @returns {'dark' | 'light'}
   */
  resolveMode(mode) {
    if (mode === 'system') {
      return this.mediaQuery && this.mediaQuery.matches ? 'dark' : 'light';
    }
    return mode === 'light' ? 'light' : 'dark';
  }

  /**
   * Applies the theme and accent palette to the DOM.
   * @param {string} mode - 'dark' | 'light' | 'system'
   * @param {string} accent - 'sunset' | 'cyber' | 'emerald' | 'amethyst'
   */
  applyTheme(mode = 'dark', accent = 'sunset') {
    this.currentMode = mode || 'dark';
    this.currentAccent = accent || 'sunset';

    const effectiveMode = this.resolveMode(this.currentMode);

    if (this.targetEl) {
      this.targetEl.setAttribute('data-theme', effectiveMode);
      this.targetEl.setAttribute('data-accent', this.currentAccent);
    }

    if (typeof this.onChange === 'function') {
      this.onChange({ mode: this.currentMode, effectiveMode, accent: this.currentAccent });
    }
  }

  /**
   * Renders the circular accent avatar swatches inside a container.
   * @param {HTMLElement} container
   * @param {Function} onSelect - Callback when user clicks a swatch
   * @param {Object} [i18n] - Localization helper
   */
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
        this.applyTheme(this.currentMode, preset.id);
        if (typeof onSelect === 'function') {
          onSelect(preset.id);
        }
      });

      container.appendChild(swatch);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ThemeManager, ACCENT_PRESETS };
}
