# ⚡ Sparky AI v0.3.0 — Yeni Nesil Prompt Asistanı & Akıllı Hafıza Sürümü

Sparky AI v0.3.0 sürümü, gelişmiş proje hafıza motoru, akıllı model yönetimi, slash komutları ve zenginleştirilmiş kullanıcı deneyimiyle yayında!

---

## 🌟 Yeni Özellikler & Geliştirmeler (What's New)

### 🧠 1. Epizodik Proje Hafızası & Akıllı Otomatik Sıkıştırma (Project Memory & Auto-Compaction)
- **Kalıcı Diyalog ve Bağlam:** Projelere özel epizodik hafıza mimarisi (`projectMemory.js`).
- **%75 Eşikli Otomatik Sıkıştırma:** Context doluluk oranı %75'e ulaştığında arka planda LLM destekli özetleme yaparak token tasarrufu sağlar. Ayarlardan özelleştirilebilir (%30–%95).
- **Hafıza Göstergesi:** Giriş kutusunun yanındaki canlı gösterge ile anlık token kullanımını ve kapasite oranını takip edebilme.

### 📁 2. Akıllı Gruplanmış & Aramalı Hızlı Model Seçici (Smart Grouped & Searchable Model Picker)
- **Klasör Gruplama:** Modeller sağlayıcı ve marka öneklerine göre (`NVIDIA`, `OPENAI`, `ANTHROPIC`, `GOOGLE GEMINI` vb.) otomatik klasörlenir.
- **Daraltılabilir/Genişletilebilir Klasörler:** Varsayılan olarak kapalı başlar, tıklayarak veya arama yaparak anında açılır.
- **Canlı Arama & Özel Model:** Model adına göre anlık filtreleme ve `Enter` ile doğrudan özel model adı belirleme.
- **Ekran İçi Kaydırma (Max-Height):** Standart açılır menülerin ekran dışına taşması engellendi; popover içinde şık kaydırma çubuğu.
- **Sağlayıcı Hafızası:** Her sağlayıcının en son seçilen modeli ayrı ayrı hatırlanır, sağlayıcılar arası model karışması engellenir.

### ⚡ 3. Slash Komutları Motoru (Slash Commands Engine)
- `/compact` veya `/sıkıştır`: Aktif projenin hafızasını anında özetler ve sıkıştırır.
- `/clear` veya `/temizle`: Proje hafızasını ve geçmişini sıfırlar.
- `/model <ad>`: Modeli anında değiştirir veya mevcut modelleri listeler.
- `/provider <sağlayıcı>`: Sağlayıcıyı değiştirir veya geçerli sağlayıcıları gösterir.
- `/help` veya `/yardım`: Tüm kullanılabilir komutları listeler.

### 🖼️ 4. Model Vision (Görsel) Uyarlaması & Çok Modlu İşleme
- **Akıllı Yetenek Tespiti:** Seçilen modelin multimodal (Vision) desteği anlık algılanır.
- **Dinamik Yükleme & Sürükle-Bırak:** Vision desteklemeyen modellerde görsel yükleme güvenli şekilde devre dışı bırakılır.

### 🎨 5. Modernize Edilmiş Vektörel Arayüz
- Emojiler yerine tamamen tema uyumlu, keskin SVG ikonlar entegre edildi.
- Özel renk paletleri ve koyu/açık tema desteği.

---

## 📦 İndirme Seçenekleri (Downloads)

| Dosya | Açıklama |
|---|---|
| **`Sparky AI Setup 0.3.0.exe`** | Standart Windows Kurulum Paketi (Installer) |
| **`Sparky AI 0.3.0.exe`** | Kurulum gerektirmeyen Taşınabilir Sürüm (Portable) |

---
**Geliştirici:** Sparky AI Ekibi  
**Lisans:** MIT
