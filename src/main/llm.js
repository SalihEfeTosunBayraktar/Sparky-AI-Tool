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
  agentrouter: {
    id: 'agentrouter',
    label: 'AgentRouter',
    kind: 'openai',
    needsKey: true,
    defaultEndpoint: 'https://agentrouter.org/v1',
    endpointHint: 'https://agentrouter.org/v1',
    keyHint: 'agentrouter.org → API Keys'
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
    endpointHint: 'OpenRouter, AgentRouter, Groq, DeepSeek, Together, llama.cpp…',
    keyHint: 'Gerekiyorsa anahtar girin'
  }
};

const IMPL = { ollama, openai: openaiCompat, anthropic, gemini };

function meta(providerId) {
  const p = PROVIDERS[providerId];
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
/* Anahtar döngüsü ve otomatik yeniden deneme                          */
/* ------------------------------------------------------------------ */

// Hata sınıflandırması ve döngü politikası apiKeyRotator.js'de — burası
// yalnızca sağlayıcı çağrısını o politikaya bağlayan uyarlayıcı katman.

/**
 * İstek gövdesini anahtar döngüsüyle sarmalar: limit/geçersizlik hatasında
 * anahtarı işaretler, sıradakine geçer ve isteği şeffaf biçimde tekrarlar.
 *
 * @param {string} providerId
 * @param {(apiKey: string, keyId: string|null) => Promise<any>} run
 * @param {object} [opts]
 * @param {(info: object) => void} [opts.onRotate] Geçiş bildirimi (arayüz için).
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
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    needsKey: p.needsKey,
    local: !!p.local,
    endpoint: cfg.endpoints?.[p.id] ?? p.defaultEndpoint,
    defaultEndpoint: p.defaultEndpoint,
    endpointHint: p.endpointHint || '',
    keyHint: p.keyHint || '',
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

  // Akış sırasında hata gelirse bir kısım token arayüze çoktan yazılmış
  // olabilir. Yeniden denemeden önce çağırana "çıktıyı sıfırla" diyebilmek
  // için ilk token'ı takip ediyoruz.
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
        // Sistem öneki önbelleğe alınabilir mi? Şimdilik yalnızca Anthropic
        // sağlayıcısı bunu açıkça işaretliyor; diğerlerinde önek önbelleği
        // sunucu tarafında otomatik çalışır, ek bir bayrak gerekmez.
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
  const checks = [
    { id: 'ollama', url: `${PROVIDERS.ollama.defaultEndpoint}/api/tags` },
    { id: 'lmstudio', url: `${PROVIDERS.lmstudio.defaultEndpoint}/models` }
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

module.exports = { PROVIDERS, catalog, listModels, chat, probeLocal, meta, classifyKeyError, withKeyRotation };
