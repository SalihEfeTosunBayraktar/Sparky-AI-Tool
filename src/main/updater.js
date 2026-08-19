'use strict';

/**
 * Updater — GitHub Releases üzerinden otomatik güncelleme.
 * Auto-update served straight from the project's GitHub Releases.
 *
 * Dağıtım zaten GitHub'da olduğu için ayrı bir güncelleme sunucusuna gerek yok:
 * electron-builder yayın sırasında `latest.yml` üretir, electron-updater da
 * sürüm karşılaştırmasını onun üzerinden yapar.
 *
 * ÖNEMLİ: Güncelleme paketlenmiş uygulamada çalışır. Geliştirme modunda
 * (`npm start`) electron-updater dosya imzası/sürüm bilgisi bulamaz ve hata
 * fırlatır; bu yüzden orada hiç başlatılmıyor.
 *
 * İndirme otomatik DEĞİL: kullanıcı onaylamadan indirme başlamaz, çünkü
 * 100 MB'lık bir indirmeyi habersiz başlatmak kullanıcının bağlantısını
 * kendi bilgisi dışında kullanmak olur.
 */

let autoUpdater = null;
let wired = false;

function load() {
  if (autoUpdater) return autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    autoUpdater = null;
  }
  return autoUpdater;
}

const updater = {
  /**
   * @param {object} deps
   * @param {Function} deps.notify  (payload) => void — renderer'a durum yollar
   * @param {boolean}  deps.isPackaged
   */
  init({ notify, isPackaged }) {
    const up = load();
    if (!up || !isPackaged || wired) return false;
    wired = true;

    up.autoDownload = false;          // İndirmeyi kullanıcı onaylar
    up.autoInstallOnAppQuit = true;   // İndirildiyse çıkışta sessizce kurulur
    up.logger = null;

    up.on('update-available', (info) => {
      notify({ state: 'available', version: info?.version || '' });
    });
    up.on('update-not-available', () => {
      notify({ state: 'current' });
    });
    up.on('download-progress', (p) => {
      notify({ state: 'downloading', percent: Math.round(p?.percent || 0) });
    });
    up.on('update-downloaded', (info) => {
      notify({ state: 'downloaded', version: info?.version || '' });
    });
    up.on('error', (err) => {
      notify({ state: 'error', error: err?.message || String(err) });
    });

    return true;
  },

  /** Güncelleme var mı diye bakar. Paketlenmemişse sessizce atlar. */
  async check({ isPackaged } = {}) {
    const up = load();
    if (!up) return { ok: false, error: 'electron-updater yüklü değil.' };
    if (!isPackaged) {
      return { ok: false, skipped: true, error: 'Güncelleme yalnızca kurulu sürümde çalışır (geliştirme modunda atlanır).' };
    }
    try {
      const res = await up.checkForUpdates();
      return { ok: true, version: res?.updateInfo?.version || null };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  },

  /** Kullanıcı onayladıktan sonra indirmeyi başlatır. */
  async download() {
    const up = load();
    if (!up) return { ok: false, error: 'electron-updater yüklü değil.' };
    try {
      await up.downloadUpdate();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  },

  /** İndirilen güncellemeyi kurup uygulamayı yeniden başlatır. */
  quitAndInstall() {
    const up = load();
    if (!up) return false;
    up.quitAndInstall();
    return true;
  }
};

module.exports = updater;
