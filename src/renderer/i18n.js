'use strict';

/**
 * Lightweight Internationalization (i18n) Manager for Sparky AI.
 * Çoklu dil yönetim sınıfı.
 */

const trDict = typeof tr !== 'undefined' ? tr : (typeof require !== 'undefined' ? require('./locales/tr') : {});
const enDict = typeof en !== 'undefined' ? en : (typeof require !== 'undefined' ? require('./locales/en') : {});

const LOCALES = {
  tr: trDict,
  en: enDict
};

class I18nManager {
  constructor() {
    this.currentLang = 'en';
    this.fallbackLang = 'en';
    this.listeners = new Set();
  }

  /**
   * Initializes language from saved settings or system locale.
   * @param {string} [lang] - Language code ('tr'|'en')
   */
  init(lang) {
    if (lang && LOCALES[lang]) {
      this.currentLang = lang;
    } else {
      // Kayıtlı bir ayar yoksa (ilk açılış / bozuk ayar) varsayılan İngilizce —
      // yalnızca sistem dili açıkça Türkçe ise Türkçe'ye geçilir.
      const navLang = typeof navigator !== 'undefined' ? (navigator.language || '').toLowerCase() : 'en';
      this.currentLang = navLang.startsWith('tr') ? 'tr' : 'en';
    }
  }

  /**
   * Sets current active app language.
   * @param {string} lang - 'tr' | 'en'
   */
  setLanguage(lang) {
    if (!LOCALES[lang] || this.currentLang === lang) return;
    this.currentLang = lang;
    this.notify();
  }

  /**
   * Gets translated value by dot-notation key.
   * @param {string} path - e.g. "card.btnGenerate"
   * @param {object} [params] - Replacement variables
   * @returns {string}
   */
  t(path, params = {}) {
    let val = this.resolvePath(LOCALES[this.currentLang], path);
    if (val === undefined && this.currentLang !== this.fallbackLang) {
      val = this.resolvePath(LOCALES[this.fallbackLang], path);
    }
    if (val === undefined) {
      val = path;
    }
    if (typeof val === 'string' && params) {
      for (const [k, v] of Object.entries(params)) {
        val = val.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
      }
    }
    return val;
  }

  /**
   * Resolves nested property path in object dictionary.
   * @private
   */
  resolvePath(obj, path) {
    if (!obj || !path) return undefined;
    const parts = path.split('.');
    let curr = obj;
    for (const p of parts) {
      if (curr && typeof curr === 'object' && p in curr) {
        curr = curr[p];
      } else {
        return undefined;
      }
    }
    return curr;
  }

  /** Subscribes callback to language changes */
  onChange(fn) {
    if (typeof fn === 'function') this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Notifies all subscribers when language changes */
  notify() {
    for (const fn of this.listeners) {
      try {
        fn(this.currentLang);
      } catch (err) {
        console.error('[i18n] listener error:', err);
      }
    }
  }

  /**
   * Automatically updates DOM elements with data-i18n, data-i18n-title, data-i18n-placeholder.
   * @param {HTMLElement|Document} [root]
   */
  translateDOM(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const attr = el.getAttribute('data-i18n-attr');
      const translated = this.t(key);
      if (attr) {
        el.setAttribute(attr, translated);
      } else {
        el.textContent = translated;
      }
    });

    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      el.title = this.t(key);
    });

    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = this.t(key);
    });
  }
}

const i18n = new I18nManager();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = i18n;
}
