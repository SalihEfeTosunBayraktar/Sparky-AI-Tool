'use strict';

/**
 * Comprehensive Turkish translation dictionary for Sparky AI.
 * Türkçe çeviri sözlüğü.
 */
const tr = {
  app: {
    title: 'Sparky AI',
    tagline: 'Yüzen prompt asistanı',
    ready: 'Hazır',
    thinking: 'Düşünüyor…',
    preparing: 'Hazırlanıyor…',
    analyzing: 'Niyet çözümleniyor…',
    writing: 'Prompt yazılıyor…',
    polishing: 'Cilalanıyor…',
    clarifying: 'Belirsizlikler taranıyor…',
    selectModel: 'Model seçin',
    orbTooltip: 'Tık: paneli aç · Çift tık / orta tık: panodaki metni prompt yap · Ctrl+tık: son sonucu kopyala · Sağ tık: menü',
    bubbleCopied: 'Prompt hazır — panoya kopyalandı',
    bubbleReady: 'Prompt hazır — kopyalamak için tıkla',
    clipboardEmpty: 'Pano boş',
    copiedToClipboard: 'Panoya kopyalandı',
    noResultToCopy: 'Kopyalanacak sonuç yok',
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
    btnApplyRefine: 'Uygula',
    menuTitle: 'Menü (sağ tık)',
    collapseTitle: 'Küçült (Esc)',
    hideTitle: 'Tepsiye gizle',
    noTextOrImage: 'Önce bir metin veya resim girin'
  },
  panel: {
    title: 'Sparky AI — Ayarlar',
    winMinimize: 'Küçült',
    winMaximize: 'Büyüt',
    winClose: 'Kapat',
    tabs: {
      settings: 'Ayarlar',
      history: 'Geçmiş',
      about: 'Hakkında'
    },
    sections: {
      providerAndModel: 'Sağlayıcı ve model',
      appInterface: 'Arayüz Dili (App Language)',
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
      deepModeHint: 'Üç aşamalı hat. Daha yavaş, küçük yerel modellerde belirgin fark yaratır.',
      clarifyLabel: 'Netleştirme soruları sor',
      clarifyHint: 'Metin belirsizse model üretimden önce en fazla 3 soru sorar; cevaplarınız prompt\'a işlenir.',
      suggestionsLabel: 'İyileştirme önerileri üret',
      suggestionsHint: 'Sonucun altında tek tıkla uygulanabilir öneri rozetleri gösterilir.',
      alwaysOnTop: 'Her zaman üstte kal',
      autoCopy: 'Sonucu otomatik kopyala',
      launchAtStartup: 'Windows ile başlat',
      historyLimit: 'Geçmiş kaydı sınırı',
      opacity: 'Küre saydamlığı',
      btnReset: 'Ayarları sıfırla',
      savedTag: 'kaydedildi',
      cryptoNoteAvailable: 'Anahtarlar Windows DPAPI ile şifrelenip yalnızca bu kullanıcı hesabında çözülebilecek şekilde saklanır.',
      cryptoNoteUnavailable: 'UYARI: Bu sistemde şifreleme kullanılamıyor; anahtarlar diskte düz metne yakın saklanır.',
      registered: 'kayıtlı',
      notRegistered: 'yok',
      btnSaveKey: 'Kaydet',
      btnDeleteKey: 'Sil',
      testingConnection: 'Bağlanılıyor…',
      connectionSuccess: 'Bağlantı başarılı. {{count}} model bulundu.',
      connectionFailed: 'Bağlantı başarısız',
      localNotFound: 'Çalışan yerel sunucu bulunamadı. Ollama veya LM Studio açık mı?',
      probeFound: 'Bulundu: {{names}}',
      shortcutsHint: 'Kutuya tıklayıp tuş kombinasyonuna basın. Temizlemek için Backspace.',
      shortcutsError: 'Şu kısayollar sistem tarafından kullanılıyor, atanamadı:'
    },
    history: {
      searchPlaceholder: 'Geçmişte ara…',
      exportMd: '.md dışa aktar',
      exportJson: '.json dışa aktar',
      clear: 'Temizle',
      noEntries: 'Henüz kayıt yok.',
      noSearchResults: 'Aramayla eşleşen kayıt yok.'
    },
    about: {
      description: 'Yüzen prompt asistanı. Girdiğiniz metni, konuyu ve bağlamı bozmadan kullanıma hazır bir prompt\'a çevirir.',
      openDataDir: 'Veri klasörünü aç',
      shortcutsSummaryTitle: 'Kısayol özeti',
      clickOrb: 'Küreye tık — paneli aç',
      doubleClickOrb: 'Küreye çift tık veya orta tık — panodaki metni doğrudan prompt\'a çevir',
      ctrlClickOrb: 'Ctrl + küreye tık — son sonucu kopyala',
      rightClickOrb: 'Küreye sağ tık — hızlı menü',
      clickBubble: 'Baloncuğa tık — hazır sonucu kopyala',
      ctrlEnter: 'Ctrl + Enter — üret',
      esc: 'Esc — üretimi durdur / paneli küçült'
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = tr;
}
