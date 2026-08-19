'use strict';

/**
 * ModeRegistry — Mod pazarı istemcisi. Dağıtım sunucusu olarak GitHub kullanılır.
 * Mode marketplace client, distributed straight from a GitHub repository.
 *
 * Neden ayrı bir sunucu yok: kataloğu depodaki `modes/index.json` tutuyor ve
 * `raw.githubusercontent.com` üzerinden okunuyor. Barındırma maliyeti yok,
 * sürüm geçmişi git'te, topluluk katkısı pull request ile geliyor.
 *
 * Neden ana süreçte: renderer'ın CSP'si `default-src 'none'` — dış istek
 * yapamıyor (bilinçli bir güvenlik kararı). İndirme burada yapılıp IPC ile
 * aktarılıyor, böylece CSP gevşetilmiyor.
 *
 * GÜVENLİK: Katalog uzak ve güvenilmez içeriktir. Bir modun ana kuralı
 * doğrudan sistem istemine giriyor, yani kötü niyetli bir mod prompt
 * enjeksiyonu taşıyabilir. Bu yüzden: (1) yalnızca beklenen alanlar alınır,
 * (2) boyutlar sınırlanır, (3) kurulum ASLA otomatik değildir — kullanıcı
 * kuralın tamamını görüp onaylar (bkz. modeUI önizleme).
 */

const https = require('https');
const http = require('http');

const DEFAULT_REGISTRY =
  'https://raw.githubusercontent.com/SalihEfeTosunBayraktar/Sparky-AI-Tool/main/modes/index.json';

const FETCH_TIMEOUT_MS = 12000;
const MAX_BYTES = 512 * 1024;   // Katalog/mod dosyası için üst sınır
const CACHE_TTL_MS = 10 * 60 * 1000;

let cache = { url: null, at: 0, data: null };

/** Tek seferlik JSON indirici — boyut ve süre sınırlı. */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error('Geçersiz katalog adresi.'));
      return;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      reject(new Error('Yalnızca http/https adresleri desteklenir.'));
      return;
    }

    const transport = parsed.protocol === 'https:' ? https : http;
    const req = transport.get(parsed, { headers: { Accept: 'application/json' } }, (res) => {
      // GitHub raw yönlendirme yapabiliyor
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchJson(new URL(res.headers.location, parsed).toString()).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Katalog alınamadı (HTTP ${res.statusCode}).`));
        return;
      }
      let size = 0;
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        size += Buffer.byteLength(chunk);
        if (size > MAX_BYTES) {
          req.destroy();
          reject(new Error('Katalog beklenenden büyük, indirme durduruldu.'));
          return;
        }
        body += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Katalog geçerli JSON değil.'));
        }
      });
    });

    req.on('error', (err) => {
      const hint = err.code === 'ENOTFOUND'
        ? 'İnternet bağlantısı yok ya da adres bulunamadı.'
        : err.message;
      reject(new Error(hint));
    });
    req.setTimeout(FETCH_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('Katalog zaman aşımına uğradı.'));
    });
  });
}

/** Uzak veriden yalnızca beklenen alanları, sınırlı uzunlukta alır. */
function sanitizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const name = str(raw.name, 80);
  const mainRule = str(raw.mainRule, 20000);
  if (!name || !mainRule) return null;

  const rules = Array.isArray(raw.additionalRules)
    ? raw.additionalRules.map((r) => str(r, 2000)).filter(Boolean).slice(0, 30)
    : [];

  return {
    id: str(raw.id, 80) || name.toLowerCase().replace(/\s+/g, '-'),
    name,
    description: str(raw.description, 400),
    author: str(raw.author, 80),
    basePreset: str(raw.basePreset, 40) || 'blank',
    mainRule,
    additionalRules: rules,
    useStyleGuide: !!raw.useStyleGuide,
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => str(t, 30)).filter(Boolean).slice(0, 8) : [],
    // Sıralama verisi. NOT: GitHub raw dosya sunucusu yazma kabul etmediği için
    // bu değer katalogda küratörlüdür; kullanıcı oylaması global olarak burada
    // toplanamaz. Kullanıcının kendi beğenileri yerelde tutulur (favoriler).
    popularity: Number.isFinite(Number(raw.popularity)) ? Math.max(0, Math.min(9999, Number(raw.popularity))) : 0,
    addedAt: str(raw.addedAt, 24)
  };
}

const modeRegistry = {
  getDefaultUrl() {
    return DEFAULT_REGISTRY;
  },

  /**
   * Katalogu indirir. Aynı adres 10 dk içinde tekrar istenirse önbellekten döner.
   * @returns {Promise<{ok: boolean, modes?: Array, error?: string, cached?: boolean}>}
   */
  async fetchCatalog(url, { force = false } = {}) {
    const target = String(url || '').trim() || DEFAULT_REGISTRY;
    const fresh = cache.url === target && cache.data && (Date.now() - cache.at) < CACHE_TTL_MS;
    if (fresh && !force) {
      return { ok: true, modes: cache.data, cached: true };
    }

    try {
      const json = await fetchJson(target);
      // Hem düz dizi hem { modes: [...] } biçimini kabul et
      const list = Array.isArray(json) ? json : (Array.isArray(json.modes) ? json.modes : null);
      if (!list) return { ok: false, error: 'Katalog biçimi tanınmadı (dizi ya da { modes: [...] } bekleniyor).' };

      const modes = list.map(sanitizeEntry).filter(Boolean).slice(0, 200);
      cache = { url: target, at: Date.now(), data: modes };
      return { ok: true, modes, cached: false };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  clearCache() {
    cache = { url: null, at: 0, data: null };
  }
};

module.exports = modeRegistry;
module.exports._sanitizeEntry = sanitizeEntry;
