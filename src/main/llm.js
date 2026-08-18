'use strict';

// Sağlayıcı kaydı ve tek giriş noktası. Uç adresi / anahtar çözümlemesi burada yapılır.
const { settings } = require('./store');
const secrets = require('./secrets');
const { LlmError, trimSlash } = require('./providers/http');
const { getRotator, classifyKeyError } = require('./apiKeyRotator');

const ollama = require('./providers/ollama');
const openaiCompat = require('./providers/openaiCompat');
const anthropic = require('./providers/anthropic');
const gemini = require('./providers/gemini');

const PROVIDERS = {
  ollama: {
    id: 'ollama',
    label: 'Ollama (yerel)',
    kind: 'ollama',
    needsKey: false,
    local: true,
    defaultEndpoint: 'http://127.0.0.1:11434',
    endpointHint: 'Örn. http://127.0.0.1:11434'
  },
  lmstudio: {
    id: 'lmstudio',
    label: 'LM Studio (yerel)',
    kind: 'openai',
    needsKey: false,
    local: true,
    defaultEndpoint: 'http://127.0.0.1:1234/v1',
    endpointHint: 'LM Studio → Developer → Server adresi'
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai',
    needsKey: true,
    defaultEndpoint: 'https://api.openai.com/v1',
    keyHint: 'platform.openai.com → API keys'
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    kind: 'anthropic',
    needsKey: true,
    defaultEndpoint: '',
    endpointHint: 'Boş bırakın (varsayılan uç kullanılır)',
    keyHint: 'console.anthropic.com → API keys'
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'gemini',
    needsKey: true,
    defaultEndpoint: gemini.DEFAULT_BASE,
    keyHint: 'aistudio.google.com → Get API key'
  },
  custom: {
    id: 'custom',
    label: 'Özel (OpenAI uyumlu)',
    kind: 'openai',
    needsKey: false,
    defaultEndpoint: '',
    endpointHint: 'OpenRouter, Groq, DeepSeek, Together, llama.cpp…',
    keyHint: 'Gerekiyorsa anahtar girin'
  }
};

const IMPL = { ollama, openai: openaiCompat, anthropic, gemini };

/* ------------------------------------------------------------------ */
/* Sabit + özel sağlayıcıları birleştiren yardımcı                      */
/* ------------------------------------------------------------------ */

/**
 * Sabit (PROVIDERS) ve kullanıcı tanımlı (customProviders) sağlayıcıları birleştirir.
 * Merges built-in PROVIDERS with user-defined customProviders from settings.
 */
function allProviders() {
  const customs = settings.get('customProviders') || [];
  const merged = { ...PROVIDERS };
  for (const cp of customs) {
    if (!cp || !cp.id) continue;
    merged[cp.id] = {
      id: cp.id,
      label: cp.label || cp.id,
      kind: cp.kind || 'openai',
      needsKey: cp.needsKey !== false,
      local: !!cp.local,
      defaultEndpoint: cp.endpoint || '',
      endpointHint: cp.endpointHint || '',
      keyHint: cp.keyHint || '',
      custom: true // Özel sağlayıcı olduğunu işaretle / Mark as user-defined
    };
  }
  return merged;
}

function meta(providerId) {
  const p = allProviders()[providerId];
  if (!p) throw new LlmError(`Bilinmeyen sağlayıcı: ${providerId}`);
  return p;
}

/** Anahtar hariç sağlayıcı çözümlemesi — anahtarı döngü mekanizması verir. */
function resolveBase(providerId) {
  const p = meta(providerId);
  const cfg = settings.all();
  const endpoint = trimSlash(cfg.endpoints?.[providerId] ?? '') || p.defaultEndpoint;
  return { ...p, endpoint, impl: IMPL[p.kind] };
}

function resolve(providerId) {
  const base = resolveBase(providerId);
  const apiKey = secrets.getKey(providerId);
  if (base.needsKey && !apiKey) {
    throw new LlmError(`${base.label} için API anahtarı gerekiyor. Ayarlar → API Anahtarları bölümünden ekleyin.`, {
      provider: providerId
    });
  }
  return { ...base, apiKey };
}

/* ------------------------------------------------------------------ */
/* Özel sağlayıcı CRUD                                                 */
/* ------------------------------------------------------------------ */

function addCustomProvider(data) {
  if (!data || !data.label) return { ok: false, error: 'label-required' };
  const id = `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const entry = {
    id,
    label: String(data.label).trim(),
    kind: data.kind || 'openai',
    needsKey: data.needsKey !== false,
    endpoint: String(data.endpoint || '').trim(),
    endpointHint: String(data.endpointHint || '').trim(),
    keyHint: String(data.keyHint || '').trim()
  };
  const customs = [...(settings.get('customProviders') || []), entry];
  settings.patch({ customProviders: customs, endpoints: { [id]: entry.endpoint } });
  return { ok: true, id, provider: entry };
}

function removeCustomProvider(id) {
  const customs = settings.get('customProviders') || [];
  const idx = customs.findIndex((c) => c.id === id);
  if (idx === -1) return { ok: false, error: 'not-found' };
  const updated = customs.filter((c) => c.id !== id);
  const cfg = settings.all();
  const endpoints = { ...cfg.endpoints };
  delete endpoints[id];
  // Aktif sağlayıcı siliniyorsa varsayılana dön / Reset if active provider deleted
  const patch = { customProviders: updated, endpoints };
  if (cfg.provider === id) {
    patch.provider = 'ollama';
    patch.model = '';
  }
  settings.patch(patch);
  // Anahtarları da temizle / Clean up secrets
  try { secrets.setKey(id, ''); } catch { /* yok say */ }
  return { ok: true };
}

function updateCustomProvider(id, partial) {
  const customs = settings.get('customProviders') || [];
  const target = customs.find((c) => c.id === id);
  if (!target) return { ok: false, error: 'not-found' };
  if (partial.label !== undefined) target.label = String(partial.label).trim();
  if (partial.kind !== undefined) target.kind = partial.kind;
  if (partial.needsKey !== undefined) target.needsKey = !!partial.needsKey;
  if (partial.endpoint !== undefined) {
    target.endpoint = String(partial.endpoint).trim();
    settings.patch({ endpoints: { [id]: target.endpoint } });
  }
  if (partial.endpointHint !== undefined) target.endpointHint = String(partial.endpointHint).trim();
  if (partial.keyHint !== undefined) target.keyHint = String(partial.keyHint).trim();
  settings.patch({ customProviders: customs });
  return { ok: true, provider: target };
}

/* ------------------------------------------------------------------ */
/* Anahtar döngüsü ve otomatik yeniden deneme                          */
/* ------------------------------------------------------------------ */

// Hata sınıflandırması ve döngü politikası apiKeyRotator.js'de — burası
// yalnızca sağlayıcı çağrısını o politikaya bağlayan uyarlayıcı katman.

/**
 * İstek gövdesini anahtar döngüsüyle sarmalar: limit/geçersizlik hatasında
 * anahtarı işaretler, sıradakine geçer ve isteği şeffaf biçimde tekrarlar.
 */
async function withKeyRotation(providerId, run, { onRotate } = {}) {
  const p = meta(providerId);
  const total = secrets.count(providerId);

  // Yerel sağlayıcılar ve anahtarsız kurulumlar: döngüye gerek yok.
  if (total === 0) {
    if (p.needsKey) {
      throw new LlmError(`${p.label} için API anahtarı gerekiyor. Ayarlar → API Anahtarları bölümünden ekleyin.`, {
        provider: providerId
      });
    }
    return run('', null);
  }

  // Döngü/yeniden deneme politikası rotator'da; burası yalnızca uyarlayıcı.
  return getRotator().run(providerId, run, { classify: classifyKeyError, onRotate });
}

function catalog() {
  const cfg = settings.all();
  const keyStatus = secrets.status();
  return Object.values(allProviders()).map((p) => ({
    id: p.id,
    label: p.label,
    needsKey: p.needsKey,
    local: !!p.local,
    custom: !!p.custom,
    endpoint: cfg.endpoints?.[p.id] ?? p.defaultEndpoint,
    defaultEndpoint: p.defaultEndpoint,
    endpointHint: p.endpointHint || '',
    keyHint: p.keyHint || '',
    kind: p.kind,
    hasKey: !!keyStatus.keys[p.id],
    keyMask: keyStatus.keys[p.id]?.hint || ''
  }));
}

async function listModels(providerId, { signal } = {}) {
  const r = resolveBase(providerId);
  return withKeyRotation(providerId, (apiKey) =>
    r.impl.listModels({ endpoint: r.endpoint, apiKey, signal, providerId })
  );
}

async function chat({
  providerId,
  model,
  system,
  messages,
  image,
  temperature,
  maxTokens,
  effort,
  cacheSystem,
  signal,
  onToken,
  onRotate
}) {
  const r = resolveBase(providerId);

  let streamed = false;
  const wrappedOnToken = onToken
    ? (chunk) => {
        streamed = true;
        onToken(chunk);
      }
    : undefined;

  return withKeyRotation(
    providerId,
    (apiKey) => {
      streamed = false;
      return r.impl.chat({
        endpoint: r.endpoint,
        apiKey,
        providerId,
        model,
        system,
        messages,
        image,
        temperature,
        maxTokens,
        effort,
        cacheSystem,
        signal,
        onToken: wrappedOnToken
      });
    },
    {
      onRotate: (info) => onRotate?.({ ...info, streamed })
    }
  );
}

// Yerel sunucuları yokla — ilk kurulumda otomatik seçim için.
async function probeLocal() {
  const out = [];
  const all = allProviders();
  const checks = [
    { id: 'ollama', url: `${all.ollama.defaultEndpoint}/api/tags` },
    { id: 'lmstudio', url: `${all.lmstudio.defaultEndpoint}/models` }
  ];
  await Promise.all(
    checks.map(async ({ id, url }) => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1500);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) out.push(id);
      } catch {
        /* çalışmıyor */
      }
    })
  );
  return out;
}

module.exports = {
  PROVIDERS,
  allProviders,
  catalog,
  listModels,
  chat,
  probeLocal,
  meta,
  classifyKeyError,
  withKeyRotation,
  addCustomProvider,
  removeCustomProvider,
  updateCustomProvider
};

