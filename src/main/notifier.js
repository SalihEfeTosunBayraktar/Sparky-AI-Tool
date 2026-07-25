'use strict';

/**
 * Native OS Notification Manager for Sparky AI main process.
 * İşletim sistemi seviyesinde yerel bildirim servis sınıfı.
 */

const { Notification } = require('electron');
const { settings } = require('./store');

class Notifier {
  /**
   * Checks if native notifications are supported on the host OS.
   * @returns {boolean}
   */
  isSupported() {
    try {
      return Notification.isSupported();
    } catch {
      return false;
    }
  }

  /**
   * Sends an OS native desktop notification if enabled in user settings.
   * @param {object} options
   * @param {string} options.title - Notification title
   * @param {string} options.body - Notification content text
   * @param {string} [options.icon] - Optional icon path
   * @param {BrowserWindow} [options.targetWindow] - Window to focus when clicked
   * @param {Function} [options.onClick] - Custom click callback
   * @returns {Notification|null}
   */
  send({ title, body, icon, targetWindow, onClick }) {
    if (!settings.get('enableNotifications')) return null;
    if (!this.isSupported()) return null;

    // Yalnızca arka plandayken bildir seçeneği aktifse ve pencere odaklıysa bildirim gönderme.
    const onlyBackground = settings.get('notifyOnlyWhenBackground');
    if (onlyBackground && targetWindow && !targetWindow.isDestroyed() && targetWindow.isFocused()) {
      return null;
    }

    try {
      const notif = new Notification({
        title: String(title || 'Sparky AI'),
        body: String(body || ''),
        icon: icon || undefined,
        silent: true // Ses Web Audio API sentezleyici tarafından bağımsız yönetilir
      });

      notif.on('click', () => {
        if (targetWindow && !targetWindow.isDestroyed()) {
          if (!targetWindow.isVisible()) targetWindow.show();
          if (targetWindow.isMinimized()) targetWindow.restore();
          targetWindow.focus();
        }
        if (typeof onClick === 'function') {
          onClick();
        }
      });

      notif.show();
      return notif;
    } catch (err) {
      console.warn('[notifier] notification failed:', err.message);
      return null;
    }
  }

  /**
   * Sends a success notification for completed prompt generation.
   * @param {object} options
   */
  notifySuccess({ title, body, targetWindow, onClick }) {
    return this.send({
      title: title || 'Prompt Hazır ✨',
      body: body || 'Prompt üretimi başarıyla tamamlandı.',
      targetWindow,
      onClick
    });
  }

  /**
   * Sends an error notification for failed generation.
   * @param {object} options
   */
  notifyError({ title, body, targetWindow, onClick }) {
    return this.send({
      title: title || 'İşlem Başarısız ⚠️',
      body: body || 'Prompt üretilirken bir hata oluştu.',
      targetWindow,
      onClick
    });
  }
}

const notifier = new Notifier();

module.exports = notifier;
