'use strict';

/**
 * Proje bağlamı oturum belleği (session cache).
 *
 * ── MİMARİ NOTU ────────────────────────────────────────────────────────────
 * Desteklenen dört sağlayıcı da DURUMSUZDUR: her istek `messages` dizisinin
 * tamamını taşır, sunucu tarafında hatırlanan bir sohbet oturumu yoktur.
 * Bu yüzden "projeyi bir kez tanıt, sonraki isteklerde hiç gönderme" mümkün
 * değildir — göndermezsek model projeyi bilmez.
 *
 * Token maliyetini gerçekten düşüren yol, proje bloğunu BAYT BAYT AYNI tutup
 * istemin EN BAŞINA koymaktır. Değişmeyen önek sayesinde:
 *   • Anthropic  → cache_control ile önek ~%10 fiyata okunur
 *   • OpenAI / DeepSeek / Groq → otomatik önek önbelleği devreye girer
 *   • Ollama / LM Studio → llama.cpp KV önbelleği yeniden kullanılır
 *
 * Bu modülün işi tam olarak budur: blok oturum başına bir kez üretilir ve
 * proje ya da model değişene kadar aynı string yeniden kullanılır.
 * ───────────────────────────────────────────────────────────────────────────
 */

const state = {
  lastIntroducedProjectId: null,
  lastUsedModelId: null,
  isProjectContextActive: false,
  // Projenin içeriğini özetleyen imza. CRUD işlemleri updatedAt'i güncellediği
  // için ayrıca kanca kurmaya gerek kalmıyor — imza kendiliğinden değişir.
  fingerprint: null,
  block: '',
  builtAt: 0,
  reuseCount: 0,
  rebuildCount: 0
};

const MAX_DESCRIPTION = 800;
const MAX_NOTE = 1200;

function clip(text, max) {
  const s = String(text || '').trim();
  return s.length <= max ? s : `${s.slice(0, max)}… (kısaltıldı)`;
}

function modelKeyOf(cfg) {
  return `${cfg?.provider || '-'}::${cfg?.model || '-'}`;
}

function fingerprintOf(project) {
  if (!project) return null;
  const imgs = Array.isArray(project.images) ? project.images.map((i) => i.id).join(',') : '';
  const texts = Array.isArray(project.texts) ? project.texts.length : 0;
  const mem = project.memory ? `${project.memory.lastCompactedAt || 0}:${(project.memory.summary || '').length}` : '';
  return `${project.id}:${project.updatedAt || 0}:${texts}:${imgs}:${mem}`;
}

/**
 * Proje bloğunu üretir. Çıktı deterministiktir — aynı proje aynı stringi verir,
 * önek önbelleğinin çalışabilmesi için bu şart.
 */
function buildBlock(project) {
  if (!project) return '';

  const parts = [
    'PROJECT CONTEXT — standing background that applies to every prompt in this project.',
    `Name: ${project.name}`
  ];

  if (project.description) parts.push(`Description: ${clip(project.description, MAX_DESCRIPTION)}`);

  const texts = (Array.isArray(project.texts) ? project.texts : []).filter((t) => t && t.content);
  if (texts.length) {
    parts.push('Notes & specifications:');
    for (const t of texts) parts.push(`- [${t.title || 'Not'}] ${clip(t.content, MAX_NOTE)}`);
  }

  if (project.memory && project.memory.summary) {
    parts.push('Episodic project memory & decisions:');
    parts.push(clip(project.memory.summary, 2400));
  }

  return parts.join('\n');
}

/**
 * Bu üretim için proje bloğunu döndürür ve oturum durumunu günceller.
 *
 * @param {object|null} project  Aktif proje (projects.getActive())
 * @param {object} cfg           settings.all() — provider/model okunur
 * @returns {{block: string, reused: boolean, changed: boolean, reason: string}}
 */
function acquire(project, cfg) {
  const projectId = project ? project.id : null;
  const modelId = modelKeyOf(cfg);
  const fp = fingerprintOf(project);

  if (!project) {
    // Proje seçili değil — bağlam yok, durum sıfırlanır.
    if (state.isProjectContextActive) reset('no-active-project');
    return { block: '', reused: false, changed: false, reason: 'no-project' };
  }

  const sameProject = state.lastIntroducedProjectId === projectId;
  const sameModel = state.lastUsedModelId === modelId;
  const sameContent = state.fingerprint === fp;

  // Koşul B — proje, model ve içerik aynı: bloğu yeniden ÜRETME, aynı stringi
  // kullan. Aynı bayt dizisi olduğu için sağlayıcı öneki önbellekten okur.
  if (sameProject && sameModel && sameContent && state.isProjectContextActive && state.block) {
    state.reuseCount += 1;
    return { block: state.block, reused: true, changed: false, reason: 'cache-hit' };
  }

  // Koşul A — yeniden kurulum gerekiyor.
  const reason = !sameProject
    ? 'project-changed'
    : !sameModel
      ? 'model-changed'
      : !sameContent
        ? 'content-changed'
        : 'inactive';

  state.block = buildBlock(project);
  state.lastIntroducedProjectId = projectId;
  state.lastUsedModelId = modelId;
  state.fingerprint = fp;
  state.isProjectContextActive = true;
  state.builtAt = Date.now();
  state.rebuildCount += 1;

  return { block: state.block, reused: false, changed: true, reason };
}

/**
 * Bağlamı geçersiz kılar; bir sonraki üretimde blok yeniden kurulur.
 * Üretim hata verirse durumu "aktif" bırakmamak için de kullanılır.
 */
function invalidate(reason = 'manual') {
  state.isProjectContextActive = false;
  if (process.env.SPARKY_DEBUG) console.info(`[projectContext] geçersiz kılındı: ${reason}`);
}

/** Yeni oturum / geçmiş temizleme: durumu tamamen sıfırla. */
function reset(reason = 'session-reset') {
  state.lastIntroducedProjectId = null;
  state.lastUsedModelId = null;
  state.isProjectContextActive = false;
  state.fingerprint = null;
  state.block = '';
  state.builtAt = 0;
  if (process.env.SPARKY_DEBUG) console.info(`[projectContext] sıfırlandı: ${reason}`);
}

/** Teşhis / arayüz için durum kopyası. */
function snapshot() {
  return {
    lastIntroducedProjectId: state.lastIntroducedProjectId,
    lastUsedModelId: state.lastUsedModelId,
    isProjectContextActive: state.isProjectContextActive,
    blockChars: state.block.length,
    // Kaba tahmin: Türkçe metinde ~3 karakter ≈ 1 token.
    approxTokens: Math.ceil(state.block.length / 3),
    reuseCount: state.reuseCount,
    rebuildCount: state.rebuildCount,
    builtAt: state.builtAt
  };
}

module.exports = { acquire, invalidate, reset, snapshot, buildBlock, modelKeyOf, fingerprintOf };
