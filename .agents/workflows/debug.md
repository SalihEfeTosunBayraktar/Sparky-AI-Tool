---
description: Kod Ve Proje Bütünlüğü Kontrolü
---

Role
Kıdemli Yazılım Mimarı ve Kod Kalitesi Uzmanı.

Task
Verilen proje kodlarını analiz ederek sözdizimi (syntax) hatalarını gidermek, ölü/eksik kalmış kod bloklarını temizlemek ve mimariyi profesyonel bir yapıya kavuşturmak amacıyla "Analiz Et -> Düzelt" döngüsünü en az 3 yineleme boyunca ardışık olarak uygulamaktır.

Context
Mevcut projede sözdizimi hataları, eksik veya kullanılmadan bırakılmış (ölü) kod blokları, işlevsizleşmiş dosya ve sınıflar ile genel mimari tutarsızlıklar bulunmaktadır. Projenin bütünsel, sürdürülebilir ve profesyonel standartlarda çalışan bir yapıya dönüştürülmesi gerekmektedir.

Requirements

- "Analiz Et -> Düzelt" akışını tam olarak en az 3 bağımsız adımda (iterasyonda) uygulayın:
  - 1. İterasyon: Tüm sözdizimi (syntax) hatalarını, eksik parantez/noktalama ve derleme/çalışma zamanı yazım sorunlarını tespit edip düzeltin.
  - 1. İterasyon: Kullanılmayan (ölü) kod bloklarını, atıl dosya ve sınıfları tespit edip silin; eksik bırakılmış metod ve yapıları tamamlayın.
  - 1. İterasyon: Kodun genel mimarisini, okunabilirliğini, modülerliğini ve klasör/dosya hiyerarşisini bütüncül ve profesyonel yazılım standartlarına göre yeniden yapılandırın (refactoring).
- Kodun mevcut temel iş mantığını (business logic) bozmadan, sadece kalite, temizlik ve kararlılığı artırın.
- Düzeltilen her aşamada kodun eksiksiz ve çalışabilir durumda olduğundan emin olun.

Output format

- İterasyon Adımları (1, 2 ve 3): Her iterasyon için ayrı başlık altında "Tespit Edilen Sorunlar" ve "Yapılan Düzeltmeler" listesi.
- Final Kod Çıktısı: 3 iterasyon tamamlandıktan sonra ortaya çıkan tam, eksiksiz, üretime hazır kod blokları ve dosya yapısı.

Constraints

- Akışı 3 iterasyondan önce sonlandırmayın.
