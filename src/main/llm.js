'use strict';

// Sağlayıcı kaydı ve tek giriş noktası. Uç adresi / anahtar çözümlemesi burada yapılır.
const { settings } = require('./store');
const secrets = require('./secrets');
const { LlmError, trimSlash } = require('./providers/http');

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

function meta(providerId) {
  const p = PROVIDERS[providerId];
  if (!p) throw new LlmError(`Bilinmeyen sağlayıcı: ${providerId}`);
  return p;
}

function resolve(providerId) {
  const p = meta(providerId);
  const cfg = settings.all();
  const endpoint = trimSlash(cfg.endpoints?.[providerId] ?? '') || p.defaultEndpoint;
  const apiKey = secrets.getKey(providerId);
  if (p.needsKey && !apiKey) {
    throw new LlmError(`${p.label} için API anahtarı gerekiyor. Ayarlar → API Anahtarları bölümünden ekleyin.`, {
      provider: providerId
    });
  }
  return { ...p, endpoint, apiKey, impl: IMPL[p.kind] };
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
  const r = resolve(providerId);
  return r.impl.listModels({ endpoint: r.endpoint, apiKey: r.apiKey, signal, providerId });
}

async function chat({ providerId, model, system, messages, temperature, maxTokens, effort, signal, onToken }) {
  const r = resolve(providerId);
  return r.impl.chat({
    endpoint: r.endpoint,
    apiKey: r.apiKey,
    providerId,
    model,
    system,
    messages,
    temperature,
    maxTokens,
    effort,
    signal,
    onToken
  });
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

module.exports = { PROVIDERS, catalog, listModels, chat, probeLocal, meta };
