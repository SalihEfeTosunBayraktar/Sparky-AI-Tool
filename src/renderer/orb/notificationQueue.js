'use strict';

/**
 * NotificationQueue — küredeki bilgi baloncuğu için akıllı öncelik kuyruğu.
 *
 * Eskiden her `setStatus()` çağrısı baloncuğu anında değiştiriyordu: hızlı
 * ardışık olaylarda (anahtar döngüsü, aşama geçişleri, sonuç) önceki mesaj
 * okunmadan kayboluyordu. Bu sınıf üç şeyi çözer:
 *
 *   1. ÖNCELİKLENDİRME — kritik bir olay (hata) gösterimdeki önemsiz bir
 *      olayı (aşama değişimi) hemen kesip öne geçer; tam tersi olmaz.
 *   2. BİRLEŞTİRME (coalesce) — aynı `dedupeKey` ile art arda gelen olaylar
 *      (ör. "devam ettiriliyor 1/3… 2/3… 3/3…") kuyruğu şişirmez, mevcut
 *      baloncuğun metnini yerinde günceller.
 *   3. SIRALI TAHLİYE — bekleyen olay varsa mevcut baloncuk asgari süresini
 *      doldurur dolmaz bir sonrakine geçer (azami süreyi beklemez); böylece
 *      kullanıcı önemli gelişmelerden "anında" haberdar olur, ama tek
 *      seferde tek baloncuk göründüğü için ekran boğulmaz.
 *
 * DOM'a hiç dokunmaz — `onShow`/`onHide`/`onQueueChange` geri çağrıları
 * üzerinden dışarıya bildirir. Bu sayede Electron/DOM olmadan birim testi
 * yazılabilir (bkz. test/notificationQueue.test.js).
 */

const PRIORITY = { critical: 4, high: 3, normal: 2, low: 1 };

// Çağıran açıkça belirtmezse `kind`'dan varsayılan öncelik.
//
// 'thinking'/'prep' burada BİLEREK 'normal' — main sürecin pipeline
// anlatımının (Hazırlanıyor/Düşünüyor/Cilalanıyor/devam ettiriliyor…)
// neredeyse tamamı bu iki kind ile gelir (bkz. promptEngine.js). Bunları
// 'low' yapmak, varsayılan notifyLevel='normal' eşiğinde (bkz. app.js
// notifyThreshold) TÜM pipeline anlatımını sessizce filtreler ve eski
// davranışa göre bariz bir gerileme olurdu. 'normal' önceliğiyle varsayılan
// ayarda önceki davranışla birebir örtüşür (her şey görünür); kullanıcı
// isterse 'minimal' ile bunları kapatabilir, 'low' seviyesi ise yalnızca
// açıkça `priority: 'low'` verilen gerçekten önemsiz olaylar için ayrılmış
// kalır.
const KIND_PRIORITY = {
  error: 'critical',
  success: 'high',
  info: 'normal',
  thinking: 'normal',
  prep: 'normal',
  idle: 'low'
};

// Asgari: bu süre dolmadan bir sonraki öğe (aynı/düşük öncelikte) devreye
// giremez — kullanıcı en azından bunu okuyabilsin.
// Azami: sıra boşken bu süre sonunda kendiliğinden gizlenir. 'low' için
// yüksek tutuldu — üretim sırasında yeni bir aşama olayı gelmezse bile
// (ör. uzun bir akış aralığında) "Düşünüyor" baloncuğu erken kaybolmasın;
// yine de sonsuza dek asılı kalmasın diye bir üst sınır var.
const DEFAULT_MIN_MS = { critical: 4000, high: 2500, normal: 1600, low: 900 };
const DEFAULT_MAX_MS = { critical: 15000, high: 8000, normal: 5000, low: 60000 };

class NotificationQueue {
  /**
   * @param {object} [opts]
   * @param {() => number} [opts.now] Test için saat enjeksiyonu.
   * @param {(item: object, meta: {coalesced: boolean}) => void} [opts.onShow]
   * @param {() => void} [opts.onHide]
   * @param {(pendingCount: number) => void} [opts.onQueueChange]
   * @param {Partial<typeof DEFAULT_MIN_MS>} [opts.minDuration]
   * @param {Partial<typeof DEFAULT_MAX_MS>} [opts.maxDuration]
   */
  constructor(opts = {}) {
    this.now = opts.now || (() => Date.now());
    this.onShow = opts.onShow || (() => {});
    this.onHide = opts.onHide || (() => {});
    this.onQueueChange = opts.onQueueChange || (() => {});
    this.minDuration = { ...DEFAULT_MIN_MS, ...(opts.minDuration || {}) };
    this.maxDuration = { ...DEFAULT_MAX_MS, ...(opts.maxDuration || {}) };

    /** @type {object|null} Şu an görünen öğe. */
    this.current = null;
    /** @type {object[]} Bekleyen öğeler — öncelik azalan, sonra geliş sırasına göre. */
    this.queue = [];

    this._timer = null;
    this._seq = 0;
  }

  /**
   * Yeni bir bildirim ekler. Kural sırası: mevcutla birleştir → kuyruktakiyle
   * birleştir → boşsa hemen göster → yüksek öncelikse kes → sırala ve bekle.
   *
   * @param {{text: string, kind?: string, priority?: 'critical'|'high'|'normal'|'low', dedupeKey?: string}} raw
   * @returns {object} Kuyruğa/ekrana yerleşen öğe.
   */
  push(raw) {
    const kind = raw.kind || 'info';
    const priority = raw.priority || KIND_PRIORITY[kind] || 'normal';
    const entry = {
      text: raw.text,
      kind,
      priority,
      dedupeKey: raw.dedupeKey || null,
      ts: this.now(),
      id: ++this._seq
    };

    // 1) Şu an görünenle aynı dedupeKey → yerinde güncelle, animasyon/zamanlayıcı bozulmaz.
    if (this.current && entry.dedupeKey && this.current.dedupeKey === entry.dedupeKey) {
      this.current = { ...this.current, text: entry.text, kind: entry.kind, priority: entry.priority };
      this.onShow(this.current, { coalesced: true });
      return this.current;
    }

    // 2) Kuyrukta aynı dedupeKey → değerini güncelle, sırasını (ts) koru.
    if (entry.dedupeKey) {
      const qi = this.queue.findIndex((q) => q.dedupeKey === entry.dedupeKey);
      if (qi !== -1) {
        this.queue[qi] = { ...entry, ts: this.queue[qi].ts };
        return this.queue[qi];
      }
    }

    // 3) Ekranda hiçbir şey yok → hemen göster.
    if (!this.current) {
      this._show(entry);
      return entry;
    }

    // 4) Kesme (preemption): kesin olarak daha önemli bir olay geldi.
    if (PRIORITY[priority] > PRIORITY[this.current.priority]) {
      const elapsed = this.now() - this.current.shownAt;
      const minDur = this.minDuration[this.current.priority] ?? 0;
      // Kesilen öğe asgari süresini doldurmadıysa VE önemsiz/eskimiş
      // (low) değilse, kuyruğun başına koy — kesme bitince devam etsin.
      if (this.current.priority !== 'low' && elapsed < minDur) {
        this.queue.unshift(this.current);
      }
      this._show(entry);
      return entry;
    }

    // 5) Sıraya al. 'low' öncelikte yalnızca en taze olan anlamlı — eskileri at
    // (aksi hâlde hızlı akış tikleri kuyruğu şişirir, tam da önlemek istediğimiz "boğulma").
    if (priority === 'low') {
      this.queue = this.queue.filter((q) => q.priority !== 'low');
    }
    this.queue.push(entry);
    this._sortQueue();
    this._rescheduleIfBacklogged();
    this.onQueueChange(this.queue.length);
    return entry;
  }

  /** Kullanıcı baloncuğa tıkladı/etkileşti — beklemeden bir sonrakine geç. */
  dismissCurrent() {
    if (!this.current) return;
    this._advance();
  }

  /** Bekleyen (henüz gösterilmemiş) öğe sayısı — "+N" rozeti için. */
  pendingCount() {
    return this.queue.length;
  }

  /** Tüm durumu temizler (ör. pencere gizlendiğinde). */
  reset() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
    this.current = null;
    this.queue = [];
  }

  _sortQueue() {
    this.queue.sort((a, b) => PRIORITY[b.priority] - PRIORITY[a.priority] || a.ts - b.ts);
  }

  _show(entry) {
    if (this._timer) clearTimeout(this._timer);
    this.current = { ...entry, shownAt: this.now() };
    this.onShow(this.current, { coalesced: false });
    this.onQueueChange(this.queue.length);
    const delay = this.queue.length > 0 ? this.minDuration[this.current.priority] : this.maxDuration[this.current.priority];
    this._scheduleAdvance(delay);
  }

  _scheduleAdvance(delay) {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this._advance(), Math.max(0, delay));
  }

  _advance() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
    if (this.queue.length === 0) {
      this.current = null;
      this.onHide();
      this.onQueueChange(0);
      return;
    }
    const next = this.queue.shift();
    this._show(next);
  }

  // Kuyruk boşken azami süreyi bekleyen bir öğe varken kuyruk doldu — asgari
  // süre işareti geldiğinde tahliye etsin diye zamanlayıcıyı kısalt. Bu,
  // "anında haberdar olma" gereksinimini karşılayan asıl mekanizmadır.
  _rescheduleIfBacklogged() {
    if (!this.current) return;
    const elapsed = this.now() - this.current.shownAt;
    const minDur = this.minDuration[this.current.priority] ?? 0;
    const remaining = Math.max(0, minDur - elapsed);
    this._scheduleAdvance(remaining);
  }
}

if (typeof window !== 'undefined') {
  // Tarayıcı ortamı için window nesnesine ata / Attach to window in browser environment
  window.NotificationQueue = NotificationQueue;
  window.PRIORITY = PRIORITY;
  window.KIND_PRIORITY = KIND_PRIORITY;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NotificationQueue, PRIORITY, KIND_PRIORITY };
}
