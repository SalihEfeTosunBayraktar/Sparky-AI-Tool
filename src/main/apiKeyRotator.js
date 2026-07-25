'use strict';

/**
 * ApiKeyRotator — sağlayıcı başına çoklu API anahtarı kuyruğu ve döngüsel geçiş.
 *
 * Sorumluluklar:
 *   • Aktif anahtarı vermek (acquire)
 *   • Limit/geçersizlik bildirimlerini işaretlemek
 *   • Sıradaki KULLANILABİLİR anahtara geçmek (rotate)
 *   • Hepsi tükendiğinde anlamlı hata üretmek
 *
 * ── EŞZAMANLILIK ───────────────────────────────────────────────────────────
 * Electron ana süreci tek iş parçacıklıdır; bu sınıfın metot gövdeleri
 * senkrondur, dolayısıyla metot ortasında araya girme olmaz. Gerçek yarış
 * durumu `await` sınırlarında oluşur: aynı anda giden 3 istek de 429 alırsa,
 * her biri sırayla "sonrakine geç" derse işaretçi 3 adım ilerler ve aradaki
 * sağlam anahtarlar atlanır.
 *
 * Çözüm: sağlayıcı başına monoton artan bir `generation` sayacı. Çağıran,
 * isteği başlatırken gördüğü generation'ı saklar ve rotate() çağrısında geri
 * verir. Sayaç o sırada değişmişse başka biri zaten döndürmüş demektir —
 * ilerletmeden mevcut aktif anahtar döndürülür (compare-and-swap deseni).
 * ───────────────────────────────────────────────────────────────────────────
 */

const DEFAULT_COOLDOWN_MS = 60_000;
const MAX_COOLDOWN_MS = 15 * 60_000;

/**
 * Sağlayıcı hatasını anahtar açısından sınıflandırır.
 *   'rate_limit' → anahtar geçici olarak devre dışı, sıradakine geç
 *   'invalid'    → anahtar kalıcı olarak devre dışı, sıradakine geç
 *   'other'      → anahtarla ilgisi yok, doğrudan yukarı fırlat
 */
function classifyKeyError(err) {
  const status = err?.status;
  const msg = String(err?.message || '').toLowerCase();

  if (status === 429) return 'rate_limit';
  if (status === 401 || status === 403) return 'invalid';

  // Sağlayıcılar aynı durumu farklı gövde metinleriyle bildiriyor.
  if (/rate.?limit|too many requests|quota|resource[_ ]exhausted|insufficient_quota|over.?capacity/.test(msg)) {
    return 'rate_limit';
  }
  if (/invalid.*api.?key|api key not valid|incorrect api key|unauthorized|permission denied|authentication.*fail/.test(msg)) {
    return 'invalid';
  }
  return 'other';
}

const STATE = {
  ACTIVE: 'active',
  RATE_LIMITED: 'rate_limited',
  INVALID: 'invalid'
};

class NoKeysError extends Error {
  constructor(provider) {
    super(`"${provider}" için kayıtlı API anahtarı yok.`);
    this.name = 'NoKeysError';
    this.code = 'NO_KEYS';
    this.provider = provider;
  }
}

class AllKeysExhaustedError extends Error {
  constructor(provider, detail) {
    super(detail.message);
    this.name = 'AllKeysExhaustedError';
    this.code = 'ALL_KEYS_EXHAUSTED';
    this.provider = provider;
    this.retryAfterMs = detail.retryAfterMs;
    this.rateLimited = detail.rateLimited;
    this.invalid = detail.invalid;
  }
}

class ApiKeyRotator {
  /**
   * @param {object} store Anahtar deposu (secrets.js arayüzü).
   *   Gerekli metotlar: ids, getActiveId, setActive, getValue, count
   * @param {object} [opts]
   * @param {Function} [opts.now] Test için saat enjeksiyonu.
   */
  constructor(store, opts = {}) {
    this.store = store;
    this.now = opts.now || (() => Date.now());
    this.defaultCooldownMs = opts.defaultCooldownMs || DEFAULT_COOLDOWN_MS;
    /** @type {Map<string, {generation: number, statuses: Map<string, object>}>} */
    this.runtime = new Map();
  }

  _rt(provider) {
    if (!this.runtime.has(provider)) {
      this.runtime.set(provider, { generation: 0, statuses: new Map() });
    }
    return this.runtime.get(provider);
  }

  _statusOf(provider, keyId) {
    const rt = this._rt(provider);
    if (!rt.statuses.has(keyId)) {
      rt.statuses.set(keyId, { state: STATE.ACTIVE, until: 0, failures: 0, error: '' });
    }
    const st = rt.statuses.get(keyId);
    // Bekleme süresi dolduysa anahtarı kendiliğinden geri al.
    if (st.state === STATE.RATE_LIMITED && st.until && this.now() >= st.until) {
      st.state = STATE.ACTIVE;
      st.until = 0;
      st.error = '';
    }
    return st;
  }

  _isUsable(provider, keyId) {
    return this._statusOf(provider, keyId).state === STATE.ACTIVE;
  }

  /** Tüm anahtarlar kullanılamaz durumdaysa açıklayıcı hata üretir. */
  _exhausted(provider, keyIds) {
    let soonest = Infinity;
    let rateLimited = 0;
    let invalid = 0;

    for (const id of keyIds) {
      const st = this._statusOf(provider, id);
      if (st.state === STATE.RATE_LIMITED) {
        rateLimited += 1;
        if (st.until) soonest = Math.min(soonest, st.until);
      } else if (st.state === STATE.INVALID) {
        invalid += 1;
      }
    }

    const retryAfterMs = Number.isFinite(soonest) ? Math.max(0, soonest - this.now()) : null;
    let message;
    if (rateLimited && !invalid) {
      const sec = retryAfterMs === null ? null : Math.ceil(retryAfterMs / 1000);
      message =
        `Tüm API anahtarlarının limiti doldu (${rateLimited} anahtar).` +
        (sec !== null ? ` En erken ${sec} saniye sonra tekrar denenebilir.` : '');
    } else if (invalid && !rateLimited) {
      message = `Kayıtlı ${invalid} API anahtarının hepsi geçersiz. Ayarlar → API Anahtarları bölümünden güncelleyin.`;
    } else {
      message =
        `Kullanılabilir API anahtarı kalmadı (${rateLimited} limit aşımında, ${invalid} geçersiz). ` +
        'Ayarlar → API Anahtarları bölümünü kontrol edin.';
    }

    return new AllKeysExhaustedError(provider, { message, retryAfterMs, rateLimited, invalid });
  }

  /**
   * Kullanıma hazır bir anahtar döndürür. Aktif anahtar kullanılamaz durumdaysa
   * sıradaki uygun anahtara kendiliğinden geçer.
   *
   * @returns {{keyId: string, value: string, generation: number, rotated: boolean}}
   */
  acquire(provider) {
    const keyIds = this.store.ids(provider);
    if (!keyIds.length) throw new NoKeysError(provider);

    const rt = this._rt(provider);
    const activeId = this.store.getActiveId(provider);
    const startIdx = Math.max(0, keyIds.indexOf(activeId));

    for (let i = 0; i < keyIds.length; i += 1) {
      const idx = (startIdx + i) % keyIds.length;
      const keyId = keyIds[idx];
      if (!this._isUsable(provider, keyId)) continue;

      const rotated = keyId !== activeId;
      if (rotated) {
        this.store.setActive(provider, keyId);
        rt.generation += 1;
      }
      return { keyId, value: this.store.getValue(provider, keyId), generation: rt.generation, rotated };
    }

    throw this._exhausted(provider, keyIds);
  }

  /**
   * Sıradaki kullanılabilir anahtara geçer.
   *
   * @param {string} provider
   * @param {number} observedGeneration Çağıranın isteği başlatırken gördüğü sayaç.
   * @returns {{keyId: string, value: string, generation: number, rotated: boolean}}
   */
  rotate(provider, observedGeneration) {
    const keyIds = this.store.ids(provider);
    if (!keyIds.length) throw new NoKeysError(provider);

    const rt = this._rt(provider);

    // CAS: bu istek beklerken başka biri zaten döndürmüş. Tekrar ilerletme —
    // yoksa eşzamanlı hatalar sağlam anahtarları atlar.
    if (typeof observedGeneration === 'number' && observedGeneration !== rt.generation) {
      const currentId = this.store.getActiveId(provider);
      if (currentId && this._isUsable(provider, currentId)) {
        return {
          keyId: currentId,
          value: this.store.getValue(provider, currentId),
          generation: rt.generation,
          rotated: false
        };
      }
      // Güncel aktif de kullanılamaz durumda: normal aramaya devam et.
    }

    const currentId = this.store.getActiveId(provider);
    const startIdx = Math.max(0, keyIds.indexOf(currentId));

    for (let i = 1; i <= keyIds.length; i += 1) {
      const keyId = keyIds[(startIdx + i) % keyIds.length];
      if (!this._isUsable(provider, keyId)) continue;
      this.store.setActive(provider, keyId);
      rt.generation += 1;
      return { keyId, value: this.store.getValue(provider, keyId), generation: rt.generation, rotated: true };
    }

    throw this._exhausted(provider, keyIds);
  }

  /** Limit aşımı bildirimi — anahtar geçici olarak devre dışı bırakılır. */
  reportRateLimit(provider, keyId, { retryAfterMs, message } = {}) {
    const st = this._statusOf(provider, keyId);
    st.failures += 1;
    // Retry-After yoksa üst üste hatada bekleme süresini katlayarak artır.
    const backoff = Math.min(this.defaultCooldownMs * 2 ** (st.failures - 1), MAX_COOLDOWN_MS);
    const wait = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : backoff;
    st.state = STATE.RATE_LIMITED;
    st.until = this.now() + wait;
    st.error = message || 'Rate limit';
    return { until: st.until, waitMs: wait };
  }

  /** Geçersiz/yetkisiz anahtar — kullanıcı düzeltene kadar kullanılmaz. */
  reportInvalid(provider, keyId, message) {
    const st = this._statusOf(provider, keyId);
    st.state = STATE.INVALID;
    st.until = 0;
    st.failures += 1;
    st.error = message || 'Invalid key';
  }

  /** Başarılı istek — anahtarın hata geçmişi temizlenir. */
  reportSuccess(provider, keyId) {
    const st = this._statusOf(provider, keyId);
    st.state = STATE.ACTIVE;
    st.until = 0;
    st.failures = 0;
    st.error = '';
  }

  /**
   * Bir isteği anahtar döngüsüyle çalıştırır: limit/geçersizlik hatasında
   * anahtarı işaretler, sıradakine geçer ve isteği tekrarlar. Her anahtar bu
   * istek içinde en fazla bir kez denenir.
   *
   * @param {string} provider
   * @param {(value: string, keyId: string) => Promise<any>} fn
   * @param {object} [opts]
   * @param {(err: any) => 'rate_limit'|'invalid'|'other'} [opts.classify]
   * @param {(info: object) => void} [opts.onRotate]
   */
  async run(provider, fn, { classify = classifyKeyError, onRotate } = {}) {
    let lease = this.acquire(provider);
    const tried = new Set();

    for (;;) {
      tried.add(lease.keyId);
      try {
        const out = await fn(lease.value, lease.keyId);
        this.reportSuccess(provider, lease.keyId);
        return out;
      } catch (err) {
        const kind = classify(err);
        if (kind === 'other') throw err;

        if (kind === 'rate_limit') {
          this.reportRateLimit(provider, lease.keyId, {
            retryAfterMs: err?.retryAfterMs,
            message: err?.message
          });
        } else {
          this.reportInvalid(provider, lease.keyId, err?.message);
        }

        // Tüm anahtarlar tükendiyse rotate() anlamlı hata fırlatır.
        const next = this.rotate(provider, lease.generation);
        if (!next || tried.has(next.keyId)) throw err;

        onRotate?.({
          provider,
          fromKeyId: lease.keyId,
          toKeyId: next.keyId,
          reason: kind,
          attempt: tried.size
        });
        lease = next;
      }
    }
  }

  /** Kullanıcı anahtar listesini değiştirdiğinde çalışma zamanı durumunu sıfırlar. */
  reset(provider) {
    if (provider) this.runtime.delete(provider);
    else this.runtime.clear();
  }

  /** Arayüz için durum dökümü. */
  snapshot(provider) {
    const keyIds = this.store.ids(provider);
    const rt = this._rt(provider);
    const activeId = this.store.getActiveId(provider);
    return {
      provider,
      generation: rt.generation,
      activeId,
      keys: keyIds.map((id) => {
        const st = this._statusOf(provider, id);
        return {
          id,
          state: st.state,
          active: id === activeId,
          failures: st.failures,
          error: st.error,
          cooldownMs: st.until ? Math.max(0, st.until - this.now()) : 0
        };
      })
    };
  }
}

/* Varsayılan singleton — secrets.js deposuna bağlı (Electron gerektirir).
   Testler `new ApiKeyRotator(sahteDepo)` ile Electron'suz çalışabilir. */
let singleton = null;
function getRotator() {
  if (!singleton) singleton = new ApiKeyRotator(require('./secrets'));
  return singleton;
}

module.exports = { ApiKeyRotator, getRotator, classifyKeyError, NoKeysError, AllKeysExhaustedError, STATE };
