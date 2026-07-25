'use strict';

/**
 * ModeManager - Manages application operational modes in Sparky AI.
 * Sparky AI çalışma modlarını yöneten tek görevli, modüler sınıf.
 */

const APP_MODES = Object.freeze({
  NORMAL_CHAT: 'normal-chat',
  PROMPT_PREPARER: 'prompt-preparer'
});

const DEFAULT_MODE = APP_MODES.NORMAL_CHAT;

class ModeManager {
  /**
   * @param {Object} store - Store instance or configuration provider.
   */
  constructor(store) {
    this.store = store;
    this.currentMode = this.loadMode();
  }

  /**
   * Safely loads the saved mode from store. Fallbacks to default if corrupt.
   * Depodan kayıtlı modu yükler. Bozulma durumunda varsayılana döner.
   * @returns {string}
   */
  loadMode() {
    try {
      const settings = this.store ? this.store.get() : {};
      const savedMode = settings && settings.appMode;
      if (this.isValidMode(savedMode)) {
        return savedMode;
      }
    } catch (err) {
      console.warn('[ModeManager] Error reading saved mode, falling back to default:', err.message);
    }
    return DEFAULT_MODE;
  }

  /**
   * Validates if a mode string is supported.
   * Mod dizgisinin geçerli olup olmadığını doğrular.
   * @param {string} mode
   * @returns {boolean}
   */
  isValidMode(mode) {
    return Object.values(APP_MODES).includes(mode);
  }

  /**
   * Gets the active app mode.
   * Aktif modu döndürür.
   * @returns {string}
   */
  getMode() {
    return this.currentMode;
  }

  /**
   * Sets and persists the new active mode.
   * Yeni modu ayarlar ve depoya kaydeder.
   * @param {string} mode
   * @returns {string}
   */
  setMode(mode) {
    if (!this.isValidMode(mode)) {
      console.warn(`[ModeManager] Invalid mode "${mode}". Falling back to default.`);
      mode = DEFAULT_MODE;
    }
    this.currentMode = mode;
    if (this.store) {
      try {
        this.store.set({ appMode: mode });
      } catch (err) {
        console.error('[ModeManager] Failed to persist mode:', err.message);
      }
    }
    return this.currentMode;
  }

  /**
   * Returns list of supported app modes.
   * Desteklenen mod listesini döndürür.
   * @returns {Array<{id: string, labelKey: string}>}
   */
  getCatalog() {
    return [
      { id: APP_MODES.NORMAL_CHAT, labelKey: 'modes.normalChat' },
      { id: APP_MODES.PROMPT_PREPARER, labelKey: 'modes.promptPreparer' }
    ];
  }
}

module.exports = {
  APP_MODES,
  DEFAULT_MODE,
  ModeManager
};
