'use strict';

/**
 * NotificationQueue birim testleri.
 * Çalıştırma: npm test  (node --test)
 *
 * Sınıf içeride gerçek setTimeout kullanır (asgari/azami süre zamanlayıcıları),
 * bu yüzden testler Node'un yerleşik `mock.timers`'ı ile Date + setTimeout'u
 * birlikte sahteliyor; saat ilerletmek zamanlayıcıları da senkron tetikler.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { NotificationQueue } = require('../src/renderer/orb/notificationQueue');

function makeQueue(t, overrides = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const events = { shows: [], hides: 0, queueChanges: [] };
  const q = new NotificationQueue({
    now: () => Date.now(),
    onShow: (item, meta) =>
      events.shows.push({ text: item.text, kind: item.kind, priority: item.priority, coalesced: meta.coalesced }),
    onHide: () => (events.hides += 1),
    onQueueChange: (n) => events.queueChanges.push(n),
    minDuration: { critical: 30, high: 20, normal: 15, low: 8 },
    maxDuration: { critical: 200, high: 100, normal: 60, low: 30 },
    ...overrides
  });
  return { q, events };
}

/* ------------------------------------------------------------------ */
/* Temel davranış                                                      */
/* ------------------------------------------------------------------ */

test('ilk push hemen gösterilir', (t) => {
  const { q, events } = makeQueue(t);
  q.push({ text: 'Hazırlanıyor', kind: 'prep' });
  assert.equal(events.shows.length, 1);
  assert.equal(events.shows[0].text, 'Hazırlanıyor');
  assert.equal(q.current.text, 'Hazırlanıyor');
});

test('kind → varsayılan öncelik eşlemesi doğru', (t) => {
  const { q } = makeQueue(t);
  const cases = [
    ['error', 'critical'],
    ['success', 'high'],
    ['info', 'normal'],
    // 'thinking'/'prep' bilerek 'normal': gerçek pipeline anlatımının
    // (Hazırlanıyor/Düşünüyor/Cilalanıyor…) büyük çoğunluğu bu iki kind ile
    // gelir (bkz. promptEngine.js) — varsayılan notifyLevel eşiğinde
    // filtrelenmemeleri gerekir. Bkz. notificationQueue.js § KIND_PRIORITY.
    ['thinking', 'normal'],
    ['prep', 'normal']
  ];
  for (const [kind, expected] of cases) {
    q.reset();
    const e = q.push({ text: 'x', kind });
    assert.equal(e.priority, expected, `${kind} → ${expected}`);
  }
});

test('açık priority alanı kind eşlemesini ezer', (t) => {
  const { q } = makeQueue(t);
  const e = q.push({ text: 'x', kind: 'info', priority: 'critical' });
  assert.equal(e.priority, 'critical');
});

/* ------------------------------------------------------------------ */
/* Kesme (preemption)                                                  */
/* ------------------------------------------------------------------ */

test('daha yüksek öncelik mevcut baloncuğu hemen keser', (t) => {
  const { q, events } = makeQueue(t);

  // priority açıkça 'low' — bu test kind eşlemesini değil, kuyruğun
  // öncelik-kesme mekaniğini sınıyor (kind→priority varsayılanından bağımsız).
  q.push({ text: 'Düşünüyor', kind: 'thinking', priority: 'low' });
  q.push({ text: 'Hata oluştu', kind: 'error' }); // critical — anında kesmeli

  assert.equal(events.shows.length, 2, 'iki gösterim olmalı: low, sonra critical');
  assert.equal(events.shows[1].text, 'Hata oluştu');
  assert.equal(q.current.text, 'Hata oluştu');
});

test('düşük öncelikli kesilen öğe kuyruğa geri konmaz (eskimiş kabul edilir)', (t) => {
  const { q } = makeQueue(t);

  q.push({ text: 'Düşünüyor', kind: 'thinking', priority: 'low' });
  q.push({ text: 'Hata', kind: 'error' });

  assert.equal(q.pendingCount(), 0, "'Düşünüyor' kuyruğa dönmemeli");
});

test('normal/high öncelikli kesilen öğe asgari süresini doldurmadıysa kuyruğa döner', (t) => {
  const { q } = makeQueue(t);

  q.push({ text: 'Prompt yazılıyor', kind: 'info', priority: 'normal' });
  t.mock.timers.tick(2); // normal minDuration=15, henüz dolmadı
  q.push({ text: 'Kritik hata', kind: 'error' });

  assert.equal(q.current.text, 'Kritik hata');
  assert.equal(q.pendingCount(), 1, "'Prompt yazılıyor' kuyruğa dönmeli");
  assert.equal(q.queue[0].text, 'Prompt yazılıyor');
});

test('aynı veya düşük öncelik mevcut baloncuğu kesmez, sıraya girer', (t) => {
  const { q, events } = makeQueue(t);

  q.push({ text: 'Başarılı', kind: 'success' }); // high
  q.push({ text: 'Aşama değişti', kind: 'info' }); // normal < high

  assert.equal(events.shows.length, 1, 'ikinci öğe hemen gösterilmemeli');
  assert.equal(q.current.text, 'Başarılı');
  assert.equal(q.pendingCount(), 1);
});

/* ------------------------------------------------------------------ */
/* Birleştirme (coalesce)                                              */
/* ------------------------------------------------------------------ */

test('aynı dedupeKey ile gelen mevcut baloncuğu yerinde günceller, kuyruğa eklemez', (t) => {
  const { q, events } = makeQueue(t);

  q.push({ text: 'Devam ettiriliyor (1/3)…', kind: 'info', dedupeKey: 'continue' });
  q.push({ text: 'Devam ettiriliyor (2/3)…', kind: 'info', dedupeKey: 'continue' });
  q.push({ text: 'Devam ettiriliyor (3/3)…', kind: 'info', dedupeKey: 'continue' });

  assert.equal(q.pendingCount(), 0, 'kuyrukta hiçbir şey birikmemeli');
  assert.equal(q.current.text, 'Devam ettiriliyor (3/3)…');
  const coalesced = events.shows.filter((s) => s.coalesced);
  assert.equal(coalesced.length, 2, 'ikinci ve üçüncü çağrı birleştirme olarak işaretlenmeli');
});

test('kuyruktaki aynı dedupeKey güncellenir, sırası korunur (yeni değil)', (t) => {
  const { q } = makeQueue(t);

  q.push({ text: 'Kritik-1', kind: 'error' }); // gösterilir
  q.push({ text: 'sk-a limitte', kind: 'info', priority: 'high', dedupeKey: 'rotate' });
  t.mock.timers.tick(1);
  q.push({ text: 'sk-b limitte', kind: 'info', priority: 'high', dedupeKey: 'rotate' });

  assert.equal(q.pendingCount(), 1, 'ikinci push yeni bir kuyruk öğesi eklememeli');
  assert.equal(q.queue[0].text, 'sk-b limitte', 'metin güncellenmeli');
});

test('düşük öncelikli tikler kuyrukta birikmez — yalnızca en yenisi kalır', (t) => {
  const { q } = makeQueue(t);

  q.push({ text: 'Kritik', kind: 'error' }); // ekranı işgal eder, low'lar kuyruğa düşer
  q.push({ text: 'tik-1', kind: 'thinking', priority: 'low' });
  q.push({ text: 'tik-2', kind: 'thinking', priority: 'low' });
  q.push({ text: 'tik-3', kind: 'thinking', priority: 'low' });

  assert.equal(q.pendingCount(), 1, 'eski low tikler atılmalı, yalnızca sonuncusu kalmalı');
  assert.equal(q.queue[0].text, 'tik-3');
});

/* ------------------------------------------------------------------ */
/* Sıralı tahliye ve zamanlama                                         */
/* ------------------------------------------------------------------ */

test('kuyruk boşken öğe azami süreye kadar kalır, sonra gizlenir', (t) => {
  const { q, events } = makeQueue(t); // normal max=60

  q.push({ text: 'Tek başına', kind: 'info' });
  t.mock.timers.tick(59);
  assert.equal(events.hides, 0, 'azami süre dolmadan gizlenmemeli');
  t.mock.timers.tick(2);
  assert.equal(events.hides, 1, 'azami süre dolunca gizlenmeli');
});

test('kuyrukta bekleyen varsa asgari süre dolar dolmaz bir sonrakine geçilir (azami beklenmez)', (t) => {
  const { q } = makeQueue(t); // normal min=15 max=60

  q.push({ text: 'Birinci', kind: 'info' });
  q.push({ text: 'İkinci', kind: 'info' }); // sıraya girer, kuyruk artık dolu

  t.mock.timers.tick(14);
  assert.equal(q.current.text, 'Birinci', 'asgari süre dolmadan geçmemeli');

  t.mock.timers.tick(2); // toplam 16ms — asgari 15'i geçti
  assert.equal(q.current.text, 'İkinci', 'asgari süre dolar dolmaz sıradakine geçmeli (azami 60 beklenmemeli)');
});

test('öncelik sırasına göre tahliye edilir, geliş sırası değil', (t) => {
  const { q } = makeQueue(t);

  q.push({ text: 'Kritik', kind: 'error' }); // ekranda
  q.push({ text: 'düşük', kind: 'thinking', priority: 'low' });
  q.push({ text: 'normal', kind: 'info' });
  q.push({ text: 'yüksek', kind: 'success' });

  const order = q.queue.map((x) => x.text);
  assert.deepEqual(order, ['yüksek', 'normal', 'düşük'], 'kuyruk önceliğe göre sıralanmalı');
});

test('dismissCurrent() beklemeden sıradakine geçirir', (t) => {
  const { q } = makeQueue(t);

  q.push({ text: 'Birinci', kind: 'info' });
  q.push({ text: 'İkinci', kind: 'info' });
  assert.equal(q.current.text, 'Birinci');

  q.dismissCurrent();
  assert.equal(q.current.text, 'İkinci', 'kullanıcı etkileşimi beklemeden ilerletmeli');
});

test('reset() zamanlayıcıyı ve durumu temizler', (t) => {
  const { q, events } = makeQueue(t);

  q.push({ text: 'x', kind: 'info' });
  q.reset();
  assert.equal(q.current, null);
  assert.equal(q.pendingCount(), 0);

  t.mock.timers.tick(200); // zamanlayıcı hâlâ ateşleseydi hide gelirdi
  assert.equal(events.hides, 0, 'reset sonrası eski zamanlayıcı tetiklenmemeli');
});

test('onQueueChange her kuyruk boyu değişiminde çağrılır', (t) => {
  const { q, events } = makeQueue(t);

  q.push({ text: 'Kritik', kind: 'error' });
  q.push({ text: 'a', kind: 'info' });
  q.push({ text: 'b', kind: 'info' });

  assert.deepEqual(events.queueChanges, [0, 1, 2]);
});

test('kesilip kuyruğa dönen öğe, aynı dedupeKey ile gelen sonraki push tarafından güncellenir', (t) => {
  const { q } = makeQueue(t);

  // 'stage' bir normal öncelikli öğe gösteriliyor, henüz asgari süresini
  // doldurmadı.
  q.push({ text: 'Aşama 1', kind: 'info', priority: 'normal', dedupeKey: 'stage' });
  t.mock.timers.tick(2);

  // Daha yüksek öncelikli bir olay kesiyor — 'Aşama 1' asgari süresini
  // doldurmadığı için kuyruğun başına geri konur (requeue).
  q.push({ text: 'Anahtar döndürüldü', kind: 'info', priority: 'high', dedupeKey: 'rotate' });
  assert.equal(q.pendingCount(), 1);
  assert.equal(q.queue[0].text, 'Aşama 1', "kesilen 'stage' öğesi kuyrukta olmalı");

  // Aynı dedupeKey ('stage') ile YENİ bir aşama olayı gelirse, kuyruktaki
  // (requeue edilmiş) öğeyi YENİ bir kuyruk girdisi olarak EKLEMEMELİ,
  // mevcut olanı güncellemeli — aksi hâlde kesme+aşama-değişimi kombosu
  // kuyruğu şişirir.
  q.push({ text: 'Aşama 2', kind: 'info', priority: 'normal', dedupeKey: 'stage' });
  assert.equal(q.pendingCount(), 1, "kuyruk büyümemeli, requeue edilen öğe güncellenmeli");
  assert.equal(q.queue[0].text, 'Aşama 2');
});

/* ------------------------------------------------------------------ */
/* Uçtan uca senaryo — anahtar döngüsü + hata patlaması                */
/* ------------------------------------------------------------------ */

test('senaryo: hızlı ardışık aşama + döngü + hata olayları doğru sırayla ve boğulmadan işlenir', (t) => {
  const { q, events } = makeQueue(t); // low=8/30 normal=15/60 high=20/100 critical=30/200

  // priority açıkça 'low' veriliyor — bu test kind eşlemesini değil, farklı
  // önceliklerin bir arada nasıl akıştığını (kuyruk mekaniğini) sınıyor.
  q.push({ text: 'Hazırlanıyor', kind: 'prep', priority: 'low' }); // hemen göster
  q.push({ text: 'Düşünüyor', kind: 'thinking', priority: 'low' }); // dedupeKey yok -> kuyruğa girer
  q.push({ text: 'openai: limit aşıldı, sıradaki anahtara geçildi', kind: 'info', priority: 'high', dedupeKey: 'rotate' });
  t.mock.timers.tick(9); // low min=8 dolar, kuyruktaki en yüksek öncelikliye (high) geçilir

  assert.equal(q.current.kind, 'info');
  assert.equal(q.current.priority, 'high');

  q.push({ text: 'Tüm anahtarların limiti doldu', kind: 'error' }); // critical, anında keser
  assert.equal(q.current.text, 'Tüm anahtarların limiti doldu');
  assert.equal(q.current.priority, 'critical');

  // Kesilen high öğe asgari süresini doldurmuş olabilir de olmayabilir de;
  // her hâlükârda kritik hata en önde ve tek başına ekranda.
  assert.equal(events.shows.at(-1).text, 'Tüm anahtarların limiti doldu');
});
