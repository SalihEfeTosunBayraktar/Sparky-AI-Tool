'use strict';

// Ana süreç metinleri. Renderer'ın kendi i18n modülü var; ana süreçten
// gönderilen durum/menü metinleri de aynı `appLanguage` ayarını izlesin diye
// burada tek kaynakta toplandı. (Önceden bu metinler sabit Türkçeydi ve
// İngilizce arayüzde çevrilmiyordu.)

const { settings } = require('./store');

const TR = {
  // Tepsi ve bağlam menüsü
  'menu.showHide': 'Göster / Gizle',
  'menu.runClipboard': 'Panodaki metinden prompt üret',
  'menu.settings': 'Ayarlar…',
  'menu.history': 'Geçmiş…',
  'menu.about': 'Hakkında…',
  'menu.exit': 'Çıkış',
  'menu.collapse': 'Küçült',
  'menu.expand': 'Genişlet',
  'menu.voiceDictate': 'Sesle Konuş & Üret (Dikte)',
  'menu.copyLast': 'Son sonucu kopyala',
  'menu.alwaysOnTop': 'Her zaman üstte kal',
  'menu.hideToTray': 'Gizle (tepsiye)',

  // Durum baloncuğu / rozet
  'status.preparing': 'Hazırlanıyor…',
  'status.autoAnalyzing': 'İstek analiz ediliyor (Oto mod)…',
  'status.scanningAmbiguity': 'Belirsizlikler taranıyor…',
  'status.haveQuestions': '{count} sorum var',
  'status.thinking': 'Düşünüyor…',
  'status.analyzingIntent': 'Niyet çözümleniyor…',
  'status.writing': 'Prompt yazılıyor…',
  'status.polishing': 'Cilalanıyor…',
  'status.polishRejected': 'Cilalama reddedildi — ayrıntılı taslak korundu',
  'status.refining': 'Düzeltme uygulanıyor…',
  'status.continuing': 'Yanıt kesildi, devam ettiriliyor ({n}/{max})…',
  'status.ready': 'Prompt hazır',
  'status.readyCopied': 'Hazır — panoya kopyalandı',
  'status.truncated':
    'Uyarı: yanıt token sınırına takıldı, sonu eksik olabilir. Ayarlar → Maks. token değerini artırın.',
  'status.copied': 'Panoya kopyalandı',
  'status.clipboardEmpty': 'Pano boş',
  'status.nothingToCopy': 'Kopyalanacak sonuç yok',
  'status.stopped': 'Durduruldu',
  'status.error': 'Hata',
  'status.compactingMemory': 'Hafıza sıkıştırılıyor (%{pct})…',
  'status.memoryCompacted': 'Hafıza güncellendi ✨',

  // API anahtarı döngüsü
  'status.keyRotatedRateLimit': '{provider}: limit aşıldı, sıradaki anahtara geçildi',
  'status.keyRotatedInvalid': '{provider}: anahtar geçersiz, sıradaki anahtara geçildi',

  // Bildirim
  'notify.readyTitle': 'Sparky AI — Prompt Hazır ✨',
  'notify.errorTitle': 'Sparky AI — İşlem Başarısız ⚠️',

  // Geçmiş dışa aktarma
  'history.empty': 'Geçmiş boş.',
  'history.exportTitle': 'Geçmişi dışa aktar',
  'history.defaultFilename': 'sparky-gecmis',

  // Mod dışa / içe aktarma
  'modes.exportEmpty': 'Aktarılacak mod yok.',
  'modes.exportTitle': 'Modları dışa aktar',
  'modes.exportFilename': 'sparky-modlar',
  'modes.importTitle': 'Modları içe aktar'
};

const EN = {
  'menu.showHide': 'Show / Hide',
  'menu.runClipboard': 'Generate prompt from clipboard',
  'menu.settings': 'Settings…',
  'menu.history': 'History…',
  'menu.about': 'About…',
  'menu.exit': 'Exit',
  'menu.collapse': 'Collapse',
  'menu.expand': 'Expand',
  'menu.voiceDictate': 'Voice Dictate & Generate',
  'menu.copyLast': 'Copy last result',
  'menu.alwaysOnTop': 'Always on top',
  'menu.hideToTray': 'Hide to tray',

  'status.preparing': 'Preparing…',
  'status.autoAnalyzing': 'Analysing the request (Auto mode)…',
  'status.scanningAmbiguity': 'Scanning for ambiguity…',
  'status.haveQuestions': 'I have {count} question(s)',
  'status.thinking': 'Thinking…',
  'status.analyzingIntent': 'Working out the intent…',
  'status.writing': 'Writing the prompt…',
  'status.polishing': 'Polishing…',
  'status.polishRejected': 'Polish rejected — kept the detailed draft',
  'status.refining': 'Applying your edit…',
  'status.continuing': 'Response was cut off, continuing ({n}/{max})…',
  'status.ready': 'Prompt ready',
  'status.readyCopied': 'Ready — copied to clipboard',
  'status.truncated':
    'Warning: the response hit the token limit and may be incomplete. Raise Settings → Max tokens.',
  'status.copied': 'Copied to clipboard',
  'status.clipboardEmpty': 'Clipboard is empty',
  'status.nothingToCopy': 'No result to copy',
  'status.stopped': 'Stopped',
  'status.error': 'Error',
  'status.compactingMemory': 'Compacting memory ({pct}%)…',
  'status.memoryCompacted': 'Memory updated ✨',

  'status.keyRotatedRateLimit': '{provider}: rate limit hit, switched to the next key',
  'status.keyRotatedInvalid': '{provider}: key invalid, switched to the next key',

  'notify.readyTitle': 'Sparky AI — Prompt Ready ✨',
  'notify.errorTitle': 'Sparky AI — Operation Failed ⚠️',

  // History export
  'history.empty': 'History is empty.',
  'history.exportTitle': 'Export history',
  'history.defaultFilename': 'sparky-history',

  // Mode export / import
  'modes.exportEmpty': 'No modes to export.',
  'modes.exportTitle': 'Export modes',
  'modes.exportFilename': 'sparky-modes',
  'modes.importTitle': 'Import modes'
};

function dict() {
  return (settings.get('appLanguage') || 'en') === 'tr' ? TR : EN;
}

/**
 * Anahtarı aktif arayüz diline çevirir. Anahtar yoksa Türkçe sözlüğe,
 * o da yoksa anahtarın kendisine düşer.
 */
function t(key, params) {
  let out = dict()[key] ?? TR[key] ?? key;
  if (params && typeof out === 'string') {
    for (const [k, v] of Object.entries(params)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}

/** Menü etiketlerini tek nesnede döndürür (Menu.buildFromTemplate için). */
function menuLabels() {
  return {
    showHide: t('menu.showHide'),
    runClipboard: t('menu.runClipboard'),
    settings: t('menu.settings'),
    history: t('menu.history'),
    about: t('menu.about'),
    exit: t('menu.exit'),
    collapse: t('menu.collapse'),
    expand: t('menu.expand'),
    voiceDictate: t('menu.voiceDictate'),
    copyLast: t('menu.copyLast'),
    alwaysOnTop: t('menu.alwaysOnTop'),
    hideToTray: t('menu.hideToTray'),
    copiedToClipboard: t('status.copied'),
    noResultToCopy: t('status.nothingToCopy')
  };
}

module.exports = { t, menuLabels };
