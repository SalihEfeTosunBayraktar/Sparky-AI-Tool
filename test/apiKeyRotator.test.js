'use strict';

/**
 * ApiKeyRotator birim testleri.
 * Çalıştırma:  npm test        (node --test test/)
 *
 * Rotator, deposu enjekte edilebilir olduğu için Electron'a ihtiyaç duymaz.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ApiKeyRotator,
  classifyKeyError,
  NoKeysError,
  AllKeysExhaustedError,
  STATE
} = require('../src/main/apiKeyRotator');

const P = 'openai';

/** secrets.js arayüzünü taklit eden bellek içi depo. */
function makeStore(keys) {
  let activeId = keys.length ? keys[0].id : null;
  return {
    ids: () => keys.map((k) => k.id),
    count: () => keys.length,
    getActiveId: () => activeId,
    setActive: (_provider, id) => {
      activeId = id;
    },
    getValue: (_provider, id) => (keys.find((k) => k.id === id) || {}).value || '',
    _activeId: () => activeId
  };
}

function threeKeys() {
  return makeStore([
    { id: 'k1', value: 'sk-one' },
    { id: 'k2', value: 'sk-two' },
    { id: 'k3', value: 'sk-three' }
  ]);
}

/** Kontrollü saat — bekleme sürelerini test etmek için. */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

const err = (status, message = '') => Object.assign(new Error(message), { status });

/* ------------------------------------------------------------------ */
/* Temel davranış                                                      */
/* ------------------------------------------------------------------ */

test('acquire aktif anahtarı döndürür ve gereksiz yere döndürmez', () => {
  const store = threeKeys();
  const r = new ApiKeyRotator(store);

  const a = r.acquire(P);
  assert.equal(a.keyId, 'k1');
  assert.equal(a.value, 'sk-one');
  assert.equal(a.rotated, false);

  // Arka arkaya çağrı aynı anahtarı vermeli.
  assert.equal(r.acquire(P).keyId, 'k1');
});

test('kayıtlı anahtar yoksa NoKeysError', () => {
  const r = new ApiKeyRotator(makeStore([]));
  assert.throws(() => r.acquire(P), NoKeysError);
});

test('manuel rotate sıradaki anahtara geçer ve başa sarar', () => {
  const store = threeKeys();
  const r = new ApiKeyRotator(store);

  assert.equal(r.acquire(P).keyId, 'k1');
  assert.equal(r.rotate(P).keyId, 'k2');
  assert.equal(r.rotate(P).keyId, 'k3');
  assert.equal(r.rotate(P).keyId, 'k1', 'liste sonunda başa sarmalı');
  assert.equal(store._activeId(), 'k1', 'aktif anahtar depoya yazılmalı');
});

/* ------------------------------------------------------------------ */
/* Limit aşımı ve otomatik geçiş                                       */
/* ------------------------------------------------------------------ */

test('limit aşımı işaretlenen anahtar atlanır', () => {
  const r = new ApiKeyRotator(threeKeys());

  const first = r.acquire(P);
  r.reportRateLimit(P, first.keyId);

  const next = r.acquire(P);
  assert.equal(next.keyId, 'k2');
  assert.equal(next.rotated, true, 'kendiliğinden geçiş yapıldığını bildirmeli');
});

test('Retry-After süresi bekleme süresi olarak kullanılır', () => {
  const c = clock();
  const r = new ApiKeyRotator(threeKeys(), { now: c.now });

  const res = r.reportRateLimit(P, 'k1', { retryAfterMs: 5000 });
  assert.equal(res.waitMs, 5000);
  assert.equal(r.snapshot(P).keys[0].state, STATE.RATE_LIMITED);
});

test('bekleme süresi dolunca anahtar kendiliğinden geri gelir', () => {
  const c = clock();
  const r = new ApiKeyRotator(threeKeys(), { now: c.now });

  r.reportRateLimit(P, 'k1', { retryAfterMs: 10_000 });
  assert.equal(r.snapshot(P).keys[0].state, STATE.RATE_LIMITED);

  c.advance(10_001);
  assert.equal(r.snapshot(P).keys[0].state, STATE.ACTIVE, 'süre dolunca ACTIVE olmalı');
  assert.equal(r.acquire(P).keyId, 'k1');
});

test('geçersiz anahtar kalıcı olarak devre dışı kalır', () => {
  const c = clock();
  const r = new ApiKeyRotator(threeKeys(), { now: c.now });

  r.reportInvalid(P, 'k1', '401');
  c.advance(60 * 60_000);
  assert.equal(r.snapshot(P).keys[0].state, STATE.INVALID, 'zaman geçse de geri gelmemeli');
  assert.equal(r.acquire(P).keyId, 'k2');
});

test('tüm anahtarlar limitte → anlamlı hata', () => {
  const c = clock();
  const r = new ApiKeyRotator(threeKeys(), { now: c.now });

  for (const id of ['k1', 'k2', 'k3']) r.reportRateLimit(P, id, { retryAfterMs: 30_000 });

  assert.throws(
    () => r.acquire(P),
    (e) => {
      assert.ok(e instanceof AllKeysExhaustedError);
      assert.equal(e.code, 'ALL_KEYS_EXHAUSTED');
      assert.equal(e.rateLimited, 3);
      assert.match(e.message, /Tüm API anahtarlarının limiti doldu/);
      assert.match(e.message, /30 saniye/, 'en erken deneme zamanını bildirmeli');
      return true;
    }
  );
});

test('hepsi geçersizse mesaj limit değil geçersizlik demeli', () => {
  const r = new ApiKeyRotator(threeKeys());
  for (const id of ['k1', 'k2', 'k3']) r.reportInvalid(P, id);

  assert.throws(
    () => r.acquire(P),
    (e) => {
      assert.equal(e.invalid, 3);
      assert.match(e.message, /geçersiz/);
      return true;
    }
  );
});

test('başarılı istek anahtarın hata geçmişini temizler', () => {
  const c = clock();
  const r = new ApiKeyRotator(threeKeys(), { now: c.now });

  r.reportRateLimit(P, 'k1');
  r.reportRateLimit(P, 'k1');
  assert.equal(r.snapshot(P).keys[0].failures, 2);

  r.reportSuccess(P, 'k1');
  const k1 = r.snapshot(P).keys[0];
  assert.equal(k1.state, STATE.ACTIVE);
  assert.equal(k1.failures, 0);
});

/* ------------------------------------------------------------------ */
/* Eşzamanlılık (yarış durumu)                                         */
/* ------------------------------------------------------------------ */

test('eşzamanlı 3 limit hatası tek geçiş yapar, sağlam anahtarları atlamaz', () => {
  const store = threeKeys();
  const r = new ApiKeyRotator(store);

  // Üç istek de aynı anda başladı ve hepsi k1'i aldı.
  const leaseA = r.acquire(P);
  const leaseB = r.acquire(P);
  const leaseC = r.acquire(P);
  assert.equal(leaseA.keyId, 'k1');
  assert.equal(leaseB.generation, leaseA.generation);
  assert.equal(leaseC.generation, leaseA.generation);

  // Üçü de 429 aldı ve sırayla geçiş istedi.
  r.reportRateLimit(P, 'k1');
  const nextA = r.rotate(P, leaseA.generation);
  const nextB = r.rotate(P, leaseB.generation);
  const nextC = r.rotate(P, leaseC.generation);

  assert.equal(nextA.keyId, 'k2', 'ilk geçiş k2 olmalı');
  assert.equal(nextA.rotated, true);
  assert.equal(nextB.keyId, 'k2', 'ikinci istek zaten dönmüş anahtarı almalı');
  assert.equal(nextB.rotated, false, 'işaretçiyi tekrar ilerletmemeli');
  assert.equal(nextC.keyId, 'k2');
  assert.equal(nextC.rotated, false);

  assert.equal(store._activeId(), 'k2', 'k3 atlanmamalı');
});

test('generation verilmezse rotate her çağrıda ilerler (manuel geçiş)', () => {
  const r = new ApiKeyRotator(threeKeys());
  r.acquire(P);
  assert.equal(r.rotate(P).keyId, 'k2');
  assert.equal(r.rotate(P).keyId, 'k3');
});

/* ------------------------------------------------------------------ */
/* Hata sınıflandırma                                                  */
/* ------------------------------------------------------------------ */

test('classifyKeyError sağlayıcı hatalarını doğru ayırır', () => {
  const cases = [
    [err(429), 'rate_limit'],
    [err(401), 'invalid'],
    [err(403), 'invalid'],
    [err(500), 'other'],
    [err(undefined, 'Rate limit reached for gpt-4'), 'rate_limit'],
    [err(undefined, 'You exceeded your current quota'), 'rate_limit'],
    [err(undefined, 'RESOURCE_EXHAUSTED'), 'rate_limit'],
    [err(undefined, 'Too Many Requests'), 'rate_limit'],
    [err(undefined, 'Incorrect API key provided'), 'invalid'],
    [err(undefined, 'API key not valid. Please pass a valid API key.'), 'invalid'],
    [err(undefined, 'Bağlanılamadı: http://127.0.0.1:11434'), 'other'],
    [err(undefined, 'model not found'), 'other']
  ];
  for (const [e, expected] of cases) {
    assert.equal(classifyKeyError(e), expected, `"${e.message || e.status}" → ${expected}`);
  }
});

/* ------------------------------------------------------------------ */
/* Uçtan uca: run() ile otomatik yeniden deneme                        */
/* ------------------------------------------------------------------ */

test('run(): limitli anahtarda başarısız olur, sıradakiyle şeffafça tamamlar', async () => {
  const r = new ApiKeyRotator(threeKeys());
  const seen = [];
  const rotations = [];

  const out = await r.run(
    P,
    async (value, keyId) => {
      seen.push(keyId);
      if (keyId === 'k1') throw err(429, 'Too Many Requests');
      return `ok:${value}`;
    },
    { onRotate: (i) => rotations.push(i) }
  );

  assert.equal(out, 'ok:sk-two');
  assert.deepEqual(seen, ['k1', 'k2']);
  assert.equal(rotations.length, 1);
  assert.equal(rotations[0].reason, 'rate_limit');
  assert.equal(rotations[0].toKeyId, 'k2');
});

test('run(): anahtarla ilgisi olmayan hata döngü başlatmaz', async () => {
  const r = new ApiKeyRotator(threeKeys());
  let calls = 0;

  await assert.rejects(
    () =>
      r.run(P, async () => {
        calls += 1;
        throw err(500, 'Internal Server Error');
      }),
    /Internal Server Error/
  );
  assert.equal(calls, 1, 'yeniden denenmemeli');
  assert.equal(r.snapshot(P).keys[0].state, STATE.ACTIVE, 'anahtar suçlanmamalı');
});

test('run(): tüm anahtarlar limitliyse her biri bir kez denenir ve anlamlı hata döner', async () => {
  const r = new ApiKeyRotator(threeKeys());
  const seen = [];

  await assert.rejects(
    () =>
      r.run(P, async (_v, keyId) => {
        seen.push(keyId);
        throw err(429);
      }),
    (e) => {
      assert.equal(e.code, 'ALL_KEYS_EXHAUSTED');
      assert.match(e.message, /Tüm API anahtarlarının limiti doldu/);
      return true;
    }
  );

  assert.deepEqual(seen, ['k1', 'k2', 'k3'], 'her anahtar tam bir kez denenmeli');
});

test('run(): geçersiz anahtardan sonra geçerli anahtarla tamamlar', async () => {
  const r = new ApiKeyRotator(threeKeys());
  const seen = [];

  const out = await r.run(P, async (value, keyId) => {
    seen.push(keyId);
    if (keyId === 'k1') throw err(401, 'Incorrect API key provided');
    return value;
  });

  assert.equal(out, 'sk-two');
  assert.deepEqual(seen, ['k1', 'k2']);
  assert.equal(r.snapshot(P).keys[0].state, STATE.INVALID);
});

test('run(): tek anahtar varsa sonsuz döngüye girmez', async () => {
  const r = new ApiKeyRotator(makeStore([{ id: 'only', value: 'sk-only' }]));
  let calls = 0;

  await assert.rejects(() =>
    r.run(P, async () => {
      calls += 1;
      throw err(429);
    })
  );
  assert.equal(calls, 1);
});

test('run(): eşzamanlı iki istek aynı limitli anahtardan aynı yedeğe düşer', async () => {
  const store = threeKeys();
  const r = new ApiKeyRotator(store);
  const used = [];

  const task = () =>
    r.run(P, async (value, keyId) => {
      used.push(keyId);
      // k1 limitli; diğerleri çalışıyor.
      if (keyId === 'k1') {
        await new Promise((res) => setTimeout(res, 5));
        throw err(429);
      }
      return value;
    });

  const [a, b] = await Promise.all([task(), task()]);

  assert.equal(a, 'sk-two');
  assert.equal(b, 'sk-two', 'ikinci istek k3\'e atlamamalı');
  assert.deepEqual(
    used.filter((k) => k !== 'k1'),
    ['k2', 'k2']
  );
  assert.equal(store._activeId(), 'k2');
});

/* ------------------------------------------------------------------ */
/* Durum dökümü ve sıfırlama                                           */
/* ------------------------------------------------------------------ */

test('snapshot arayüz için durum verir, reset temizler', () => {
  const c = clock();
  const r = new ApiKeyRotator(threeKeys(), { now: c.now });

  r.reportRateLimit(P, 'k2', { retryAfterMs: 20_000 });
  const snap = r.snapshot(P);

  assert.equal(snap.keys.length, 3);
  assert.equal(snap.activeId, 'k1');
  assert.equal(snap.keys[0].active, true);
  assert.equal(snap.keys[1].state, STATE.RATE_LIMITED);
  assert.equal(snap.keys[1].cooldownMs, 20_000);

  r.reset(P);
  assert.equal(r.snapshot(P).keys[1].state, STATE.ACTIVE);
});
