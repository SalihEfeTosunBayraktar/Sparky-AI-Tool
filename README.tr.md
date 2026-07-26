**🇬🇧 [English](README.md) | 🇹🇷 Türkçe**

# Sparky AI

Windows için yüzen prompt asistanı. Ekranın üstünde duran küçük bir küreye metninizi
yazarsınız; uygulama bunu **konuyu ve bağlamı bozmadan** kullanıma hazır bir prompt'a
çevirir ve tek tıkla kopyalatır.

- **Yerel modeller** — Ollama, LM Studio (anahtar gerekmez)
- **Bulut modelleri** — OpenAI, Anthropic (Claude), Google Gemini, ve her türlü
  OpenAI-uyumlu uç (OpenRouter, Groq, DeepSeek, Together, llama.cpp…)
- API anahtarları **Windows DPAPI** ile şifrelenir; renderer'a hiçbir zaman açık gönderilmez

---

## Kurulum

```bash
npm install
```

```bash
npm start
```

---

## Dağıtım

```bash
npm run dist
```

`release/` klasörüne iki çıktı yazılır:

| Dosya | Boyut | Ne işe yarar |
| --- | --- | --- |
| `Sparky AI Setup 0.1.0.exe` | ~96 MB | Kurulum sihirbazı. **Kullanıcı bazlı kurar** (`%LOCALAPPDATA%\Programs`), yönetici yetkisi istemez, kurulum dizini seçtirir, masaüstü kısayolu oluşturur. |
| `Sparky AI 0.1.0.exe` | ~95 MB | Taşınabilir tek dosya. Kurulum yok — USB'den bile çalışır. |

> Boyutlar Electron çalışma zamanını (Chromium + Node) içerdiği için normaldir;
> uygulama kodu bunun içinde birkaç yüz KB'dir.

Her iki sürüm de ayarları, geçmişi ve şifreli anahtarları **oturum açmış kullanıcının**
`%APPDATA%\Sparky AI\` klasöründe tutar. Yani:

- Aynı bilgisayarda farklı Windows kullanıcıları birbirinin ayarlarını görmez.
- Taşınabilir sürümü kapatıp yeniden açtığınızda ayarlarınız yerinde durur.
- API anahtarları DPAPI ile o kullanıcı hesabına bağlı şifrelenir; dosyayı başka
  bir makineye kopyalasanız bile çözülemez.

### Kod imzası hakkında

Çıktılar **imzalanmamıştır** (kod imzalama sertifikası gerektirir). Windows
SmartScreen ilk çalıştırmada "Bilinmeyen yayımcı" uyarısı gösterir; *Ek bilgi →
Yine de çalıştır* ile geçilir. Uygulamayı başkalarına dağıtacaksanız bir Authenticode
sertifikası alıp `package.json` içindeki `build.win` bölümüne `certificateFile` /
`certificatePassword` eklemeniz gerekir.

---

## İlk çalıştırma

Uygulama açılışta Ollama (`127.0.0.1:11434`) ve LM Studio (`127.0.0.1:1234`)
adreslerini yoklar; biri ayaktaysa onu seçip ilk modeli atar.

Hiçbiri yoksa: küreye tıklayın → **⋯ → Ayarlar** → sağlayıcı, adres ve model seçin.
Bulut sağlayıcıları için **API anahtarları** bölümünden anahtarınızı girin.

---

## Kullanım

| Hareket | Sonuç |
| --- | --- |
| Küreye tık | Paneli aç |
| **Küreye çift tık** veya **orta tık** | Panodaki metni paneli açmadan doğrudan prompt'a çevir |
| Küreyi sürükle | Kürenin yerini değiştir (konum hatırlanır) |
| **Ctrl** + küreye tık | Son sonucu doğrudan panoya kopyala |
| Küreye sağ tık | Hızlı menü (kopyala, ayarlar, geçmiş, çıkış) |
| Baloncuğa tık | Sonuç hazırsa kopyalar, değilse paneli açar |
| `Ctrl + Enter` | Üret |
| `Esc` | Üretimi durdur / paneli küçült |

### En hızlı akış

Metni kopyala → küreye **çift tık** → baloncuk *Prompt hazır* deyince **baloncuğa tık**.
Panel hiç açılmaz. (Ayarlarda *Sonucu otomatik kopyala* açıksa son adım da gerekmez.)
Netleştirme soruları açıksa ve model soru sorarsa panel kendiliğinden açılır —
akış cevabınızı beklediği için.

### Genel kısayollar (ayarlardan değiştirilebilir)

| Varsayılan | İş |
| --- | --- |
| `Ctrl + Shift + Space` | Paneli aç / kapat |
| `Ctrl + Alt + P` | Panodaki metinden hemen prompt üret |
| `Ctrl + Alt + C` | Son sonucu kopyala |

Küre, durum baloncuklarıyla ne yaptığını söyler: *Hazırlanıyor… → Düşünüyor… →
Prompt hazır*. Derin modda üç aşama görürsünüz: *Niyet çözümleniyor → Prompt
yazılıyor → Cilalanıyor*.

---

## Prompt biçimleri

| Biçim | Ne üretir |
| --- | --- |
| **Detaylı** | Rol · Görev · Bağlam · Gereksinimler · Çıktı formatı · Kısıtlar |
| **Kısa & Net** | Tek paragraf, 120 kelimenin altında |
| **Sistem Promptu** | Bir asistanı yapılandıran ikinci-şahıs prompt |
| **Görsel** | Görsel modelleri için yoğun blok + `Negative:` satırı |
| **Kod / Teknik** | Hedef, sözleşme, uç durumlar, hata yönetimi, test beklentisi |
| **Araştırma** | Soru, kapsam, kaynak önceliği, çelişki yönetimi, rapor yapısı |

## Üç çalışma anahtarı

Üçü de **Ayarlar → Üretim** altındaki switch'lerden açılıp kapatılır; *Derin mod*
ve *Soru sor* ayrıca kürenin araç çubuğunda tek tıklık çip olarak durur.

### Derin mod (varsayılan: kapalı)

Üç aşamalı hat: önce niyet JSON olarak çıkarılır, sonra prompt yazılır, en son bir
editör geçişi konudan sapmaları ve meta metinleri temizler. Küçük yerel modellerde
farkı belirgindir. Karşılığında iki ek tur maliyeti vardır.

### Soru sor (varsayılan: kapalı)

Üretimden önce model metni tarar ve **yalnızca gerçekten belirsiz** noktalar için
en fazla 3 soru sorar — her biri kısa bir gerekçe, hazır seçenek rozetleri ve
"boş bırakırsan şunu varsayarım" önerisiyle gelir. Cevaplarınız prompt'a
*bağlayıcı* bilgi olarak işlenir. Metin zaten açıksa soru sormadan devam eder,
akış hiç kesilmez. Panelde *Sormadan üret* ile her zaman atlayabilirsiniz.

### Yarım kalan yanıtlar

Model token sınırına takıldığında yanıt sessizce kesiliyordu — "eksik prompt"
sorununun kaynağı buydu. Artık:

- Dört sağlayıcı da kesilme sinyalini okur (`done_reason` / `finish_reason` /
  `finishReason` / `stop_reason`).
- Kesilme algılanırsa uygulama **kaldığı yerden en fazla 3 tur devam ettirir**;
  parça birleştirilirken modelin son cümleyi tekrarlaması veya baştan başlaması
  otomatik temizlenir.
- Biçime göre taban token bütçesi uygulanır (ör. UI/UX 6144, Araştırma/Kod 4096).
  `max_tokens` bir tavan olduğu ve model erken bitirdiğinde maliyet doğurmadığı
  için bu güvenlidir.
- Derin modun cilalama aşaması taslağın tamamını yeniden yazdığı için bütçesi
  taslak uzunluğuna göre ölçeklenir.
- Üç tur sonunda hâlâ kesikse durum çubuğunda açık bir uyarı çıkar.

### İyileştirme önerileri (varsayılan: açık)

Sonuç geldikten sonra ayrı ve engellemeyen bir turda 2–4 öneri üretilir
("Hedef kitleyi daralt", "Çıktıyı H2 şemasına bağla"…). Rozete tıklamak öneriyi
düzeltme olarak uygular. Bu tur başarısız olursa sessizce atlanır — elinizdeki
sonuç etkilenmez.

**Düzeltme kutusu** — hazır öneriler dışında kendi talimatınızı da yazabilirsiniz:
"daha kısa", "İngilizce olsun", "JSON çıktı ekle" → *Uygula*. Mevcut prompt
korunarak düzenlenir.

---

## Modlar (Custom Modes)

Ayarlar → **Modlar** sekmesinde, Projeler'e benzer tam bir CRUD yapısı vardır.
İki yerleşik mod hep vardır ve silinemez — **Normal Sohbet** (doğrudan sohbet)
ve **Prompt Hazırlayıcı** (bu projenin asıl işi) — ama ikisinin de sistem
kuralı tamamen düzenlenebilir.

- **Ön modlar (presets)** — yeni bir özel mod oluştururken 10 hazır şablondan
  seçilir (Boş, Düz, Teknik, Özet, Yaratıcı, Günlük, Proje Danışmanı, Şeffaf
  Mod, Röportaj Sentezleyici, Biçim Uyarlayıcı); her biri farklı bir değişken
  grubunu örnekleyerek "bununla neler yapılabilir" sorusuna cevap verir.
- **Ana Kural** ve **Ek Kurallar** — sözdizimi vurgulamalı, `{{DEĞİŞKEN}}`
  otomatik tamamlamalı, üzerine gelince açıklama gösteren, genişletilebilir
  bir IDE editöründe düzenlenir (bkz. `codeEditor.js`).
- **Değişkenler** — üretim anında gerçek değerle değiştirilen 20 token:
  `{{LANG}}`, `{{PROJECT}}`, `{{PROJECT_DESC}}`, `{{PROJECT_NOTES}}`,
  `{{INPUT}}`, `{{ANSWERS}}`, `{{DATE}}`, `{{TIME}}`, `{{YEAR}}`, `{{MONTH}}`,
  `{{DAY}}`, `{{WEEKDAY}}`, `{{STYLE}}`, `{{STYLE_HINT}}`, `{{MODEL}}`,
  `{{PROVIDER}}`, `{{TEMPERATURE}}`, `{{EFFORT}}`, `{{DEEP_MODE}}`,
  `{{GENERATION_MODE}}`.
- **İçe/dışa aktarma** — modlarınızı `.json` olarak dışa aktarıp başka bir
  kurulumda içe aktarabilirsiniz; isim çakışması otomatik ayırt edilir.

---

## Bildirim kuyruğu

Küredeki baloncuklar önem derecesine göre sıralanır (kritik/yüksek/normal/
düşük), aynı olay tekrarlanırsa tek satırda güncellenir (dedupe), ve kuyrukta
bekleyen varsa asgari süre dolar dolmaz bir sonrakine geçilir — ekran
boğulmaz. Ayarlar → Bildirimler'den sıklık (Önemli / Normal / Hepsi)
seçilebilir.

## Çoklu API anahtarı ve otomatik döngü

Her sağlayıcı için birden fazla API anahtarı eklenebilir. Aktif anahtar limit
aşımına (`rate_limit`) veya geçersizliğe (`invalid`) takılırsa sistem
otomatik olarak listedeki bir sonraki sağlıklı anahtara geçer; küre bu geçişi
bir bildirimle bildirir. Anahtar durumları (aktif/limitli/geçersiz) Ayarlar →
Model/API → API anahtarları altında rozetlerle görünür.

---

## Mimari

```
src/main/
  main.js            Pencereler, IPC, tepsi, genel kısayollar, sürükleme
  preload.js         contextBridge köprüsü (contextIsolation açık)
  store.js           settings.json / history.json
  secrets.js         API anahtarları (safeStorage → DPAPI)
  llm.js             Sağlayıcı kaydı ve tek giriş noktası
  promptEngine.js    Prompt üretim hattı (analiz → yaz → cilala)
  providers/
    http.js          Ortak fetch + SSE/NDJSON okuyucuları
    ollama.js        /api/chat, /api/tags
    openaiCompat.js  /v1/chat/completions (LM Studio, OpenAI, OpenRouter…)
    anthropic.js     Resmî @anthropic-ai/sdk
    gemini.js        streamGenerateContent (x-goog-api-key başlığı)
src/renderer/
  orb/               Yüzen küre + genişleyen kart
  panel/             Ayarlar · Geçmiş · Hakkında
```

### Sağlayıcıya özgü notlar

- **Anthropic** — resmî SDK kullanılır. Yeni Claude modellerinde (`claude-opus-5`,
  `claude-sonnet-5`, `claude-opus-4-8`…) `temperature` API tarafından reddedildiği
  için gönderilmez; bunun yerine adaptif düşünme + `effort` (düşük/orta/yüksek)
  ayarı kullanılır. Düşünme açıkken token bütçesi yanıtla paylaşıldığından
  `max_tokens` değerine otomatik pay eklenir. Politika kaynaklı retler için
  sunucu tarafı yedek model (`fallbacks: "default"`) etkindir; hesap bu betayı
  desteklemiyorsa istek yedeksiz olarak tekrarlanır.
- **Gemini** — anahtar URL'ye değil `x-goog-api-key` başlığına konur.
- **OpenAI uyumlu** — adres `/v1` ile bitmiyorsa otomatik eklenir; anahtar
  opsiyoneldir (yerelde boş bırakın).

---

## Veri nerede duruyor

`%APPDATA%/Sparky AI/` altında:

- `settings.json` — ayarlar, pencere konumu
- `history.json` — girdi/çıktı geçmişi (favoriler limit dolsa da silinmez)
- `secrets.json` — şifrelenmiş API anahtarları
- `projects.json` — projeler, metin notları, görseller
- `modes.json` — yerleşik ve özel modlar

**Hakkında → Veri klasörünü aç** ile doğrudan gidebilirsiniz. Geçmişi `.md` veya
`.json` olarak dışa aktarabilirsiniz.

---

## Kullanılan açık kaynak bileşenler

| Bileşen | Lisans | Rolü |
| --- | --- | --- |
| [Electron](https://www.electronjs.org/) | MIT | Masaüstü çalışma zamanı (Chromium + Node.js) |
| [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript) | MIT | Anthropic (Claude) resmî istemci kütüphanesi |
| [electron-builder](https://www.electron.build/) | MIT | Windows kurulum (NSIS) ve taşınabilir exe paketleme |

Diğer tüm sağlayıcı entegrasyonları (Ollama, LM Studio, OpenAI, Gemini ve
OpenAI-uyumlu uçlar) ek bir istemci kütüphanesi olmadan, doğrudan `fetch` ile
konuşur.

## Lisans

[MIT](LICENSE) — dilediğiniz gibi kullanın, değiştirin, dağıtın; tek şart
lisans metnini korumanız.
