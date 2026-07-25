'use strict';

/**
 * Turkish translation dictionary for Sparky AI.
 * Türkçe çeviri sözlüğü.
 */
const tr = {
  app: {
    title: 'Sparky AI',
    tagline: 'Yüzen prompt asistanı',
    ready: 'Hazır',
    thinking: 'Düşünüyor…',
    preparing: 'Hazırlanıyor…',
    selectModel: 'Model seçin',
    orbTooltip: 'Tık: paneli aç · Çift tık / orta tık: panodaki metni prompt yap · Ctrl+tık: son sonucu kopyala · Sağ tık: menü',
    bubbleCopied: 'Prompt hazır — panoya kopyalandı',
    bubbleReady: 'Prompt hazır — kopyalamak için tıkla',
    clipboardEmpty: 'Pano boş',
    copiedToClipboard: 'Panoya kopyalandı',
    loadedFromHistory: 'Geçmişten yüklendi'
  },
  card: {
    inputLabel: 'Metniniz veya UI Tasarımı',
    inputPlaceholder: 'Ne istediğinizi yazın veya UI tasarım görseli yükleyin.\nCtrl+Enter → üret',
    pasteFromClipboard: 'panodan al',
    uiImageAttached: 'UI Tasarımı Ekli',
    removeImage: 'Görseli kaldır',
    btnAttachImage: '📷 Görsel',
    deepMode: 'Derin mod',
    deepModeTitle: 'Analiz → yaz → cilala (3 aşama, daha yavaş ama daha iyi)',
    askQuestions: 'Soru sor',
    askQuestionsTitle: 'Belirsiz noktalar için önce sana soru sorsun',
    btnGenerate: 'Üret',
    btnStop: 'Durdur',
    promptOutputLabel: 'Prompt',
    emptyPrompt: 'Üretilen prompt burada belirecek.',
    qaLead: 'Daha iyi bir prompt için birkaç şeyi netleştirelim:',
    qaSubmit: 'Cevapla ve üret',
    qaSkip: 'Sormadan üret',
    suggestionsLead: 'öneri:',
    suggestionsPending: 'öneriler hazırlanıyor…',
    btnCopy: 'Kopyala',
    btnCopyClose: 'Kopyala & küçült',
    btnRegen: 'Yeniden',
    btnHistory: 'Geçmiş',
    refinePlaceholder: 'Düzeltme iste: “daha kısa”, “İngilizce olsun”, “JSON çıktı ekle”…',
    btnApplyRefine: 'Uygula'
  },
  panel: {
    tabs: {
      settings: 'Ayarlar',
      history: 'Geçmiş',
      about: 'Hakkında'
    },
    sections: {
      providerAndModel: 'Sağlayıcı ve model',
      appInterface: 'Uygulama ve Arayüz Dili',
      apiKeys: 'API anahtarları',
      generation: 'Üretim',
      behavior: 'Davranış',
      shortcuts: 'Kısayollar'
    },
    fields: {
      provider: 'Sağlayıcı',
      btnProbe: 'Yerel sunucuları tara',
      endpoint: 'Sunucu adresi',
      btnTest: 'Bağlantıyı test et',
      model: 'Model',
      btnModelsRefresh: 'Listeyi yenile',
      modelManualHint: 'Model listede yoksa aşağıya elle yazabilirsiniz.',
      modelManualPlaceholder: 'Elle model adı (opsiyonel)',
      appLanguage: 'Arayüz Dili (App Language)',
      promptStyle: 'Prompt biçimi',
      outputLanguage: 'Çıktı dili',
      temperature: 'Sıcaklık',
      maxTokens: 'Maks. token',
      effort: 'Claude düşünme seviyesi',
      effortOptions: {
        low: 'Düşük — en hızlı',
        medium: 'Orta — dengeli',
        high: 'Yüksek — en iyi'
      },
      deepModeLabel: 'Derin mod (analiz → yaz → cilala)',
      clarifyLabel: 'Netleştirme soruları sor',
      suggestionsLabel: 'İyileştirme önerileri üret',
      alwaysOnTop: 'Her zaman üstte kal',
      autoCopy: 'Sonucu otomatik kopyala',
      launchAtStartup: 'Windows ile başlat',
      historyLimit: 'Geçmiş kaydı sınırı',
      opacity: 'Küre saydamlığı',
      btnReset: 'Ayarları sıfırla',
      savedTag: 'kaydedildi'
    },
    history: {
      searchPlaceholder: 'Geçmişte ara…',
      exportMd: '.md dışa aktar',
      exportJson: '.json dışa aktar',
      clear: 'Temizle'
    },
    about: {
      description: 'Yüzen prompt asistanı. Girdiğiniz metni, konuyu ve bağlamı bozmadan kullanıma hazır bir prompt\'a çevirir.',
      openDataDir: 'Veri klasörünü aç',
      shortcutsSummaryTitle: 'Kısayol özeti'
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = tr;
}
