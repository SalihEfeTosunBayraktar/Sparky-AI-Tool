'use strict';

// Sağlayıcılar arasında paylaşılan HTTP / akış yardımcıları.

const DEFAULT_TIMEOUT = 120000;

function trimSlash(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

// OpenAI uyumlu uçlar için: taban adres /v1 ile bitmiyorsa ekle.
function withV1(url) {
  const base = trimSlash(url);
  if (!base) return '';
  if (/\/v\d+$/.test(base)) return base;
  return `${base}/v1`;
}

class LlmError extends Error {
  constructor(message, { status, provider, cause } = {}) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
    this.provider = provider;
    this.cause = cause;
  }
}

function friendlyNetworkError(err, { provider, url }) {
  if (err && (err.name === 'AbortError' || err.code === 'ABORT_ERR')) {
    return new LlmError('İşlem iptal edildi.', { provider, cause: err });
  }
  const msg = String(err && err.message ? err.message : err);
  if (/ECONNREFUSED|fetch failed|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/i.test(msg)) {
    return new LlmError(`Bağlanılamadı: ${url}\nSunucu çalışıyor mu, adres doğru mu kontrol edin.`, {
      provider,
      cause: err
    });
  }
  return new LlmError(msg, { provider, cause: err });
}

async function readErrorBody(res) {
  try {
    const text = await res.text();
    if (!text) return '';
    try {
      const j = JSON.parse(text);
      return j?.error?.message || j?.error || j?.message || text;
    } catch {
      return text;
    }
  } catch {
    return '';
  }
}

async function request(url, { method = 'GET', headers = {}, body, signal, timeout = DEFAULT_TIMEOUT, provider } = {}) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) {
      const detail = await readErrorBody(res);
      throw new LlmError(`${res.status} ${res.statusText}${detail ? ` — ${String(detail).slice(0, 500)}` : ''}`, {
        status: res.status,
        provider
      });
    }
    return res;
  } catch (err) {
    if (err instanceof LlmError) throw err;
    throw friendlyNetworkError(err, { provider, url });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

async function getJson(url, opts = {}) {
  const res = await request(url, { ...opts, method: 'GET', timeout: opts.timeout ?? 15000 });
  return res.json();
}

// Gövdeyi satır satır okur; hem NDJSON hem SSE için temel.
async function* iterateLines(res) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, '');
      buffer = buffer.slice(idx + 1);
      yield line;
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) yield buffer.replace(/\r$/, '');
}

// `data: {...}` satırlarını ayrıştırır. [DONE] görülünce durur.
async function readSSE(res, onData) {
  for await (const line of iterateLines(res)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') {
      if (payload === '[DONE]') return;
      continue;
    }
    let obj;
    try {
      obj = JSON.parse(payload);
    } catch {
      continue;
    }
    if (onData(obj) === false) return;
  }
}

async function readNdjson(res, onData) {
  for await (const line of iterateLines(res)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (onData(obj) === false) return;
  }
}

module.exports = { trimSlash, withV1, request, getJson, readSSE, readNdjson, LlmError, DEFAULT_TIMEOUT };
