'use strict';

// Google Gemini (generateContent / streamGenerateContent).
// Anahtar sorgu dizesine değil, x-goog-api-key başlığına konur.
const { trimSlash, request, getJson, readSSE, LlmError } = require('./http');

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function headers(apiKey) {
  return { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
}

function requireKey(apiKey) {
  if (!apiKey) {
    throw new LlmError('Gemini API anahtarı girilmemiş. Ayarlar → API Anahtarları bölümünden ekleyin.', {
      provider: 'gemini'
    });
  }
}

async function listModels({ endpoint, apiKey, signal }) {
  requireKey(apiKey);
  const base = trimSlash(endpoint) || DEFAULT_BASE;
  const json = await getJson(`${base}/models?pageSize=200`, { headers: headers(apiKey), signal, provider: 'gemini' });
  return (json.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => String(m.name || '').replace(/^models\//, ''))
    .filter(Boolean)
    .sort();
}

const { toGeminiContent } = require('./imageUtils');

async function chat({ endpoint, apiKey, model, system, messages, image, temperature, maxTokens, signal, onToken }) {
  requireKey(apiKey);
  const base = trimSlash(endpoint) || DEFAULT_BASE;
  if (!model) throw new LlmError('Model seçilmedi. Ayarlar → Model bölümünden bir model seçin.', { provider: 'gemini' });

  const contents = messages.map((m, idx) => {
    const parts = [{ text: m.content || '' }];
    if (image && idx === messages.length - 1 && m.role !== 'assistant') {
      const imgParts = toGeminiContent(image);
      if (imgParts.length > 0) parts.push(...imgParts);
    }
    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts
    };
  });

  const payload = {
    contents,
    generationConfig: {
      temperature: Number(temperature),
      maxOutputTokens: Number(maxTokens)
    }
  };
  if (system) payload.systemInstruction = { parts: [{ text: system }] };

  const url = `${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const res = await request(url, {
    method: 'POST',
    headers: headers(apiKey),
    body: payload,
    signal,
    provider: 'gemini'
  });

  let text = '';
  let blockReason = null;
  await readSSE(res, (obj) => {
    if (obj.error) throw new LlmError(obj.error.message || String(obj.error), { provider: 'gemini' });
    blockReason = obj?.promptFeedback?.blockReason || blockReason;
    const parts = obj?.candidates?.[0]?.content?.parts || [];
    for (const p of parts) {
      if (p.text) {
        text += p.text;
        onToken?.(p.text);
      }
    }
    return true;
  });

  if (!text.trim() && blockReason) {
    throw new LlmError(`Gemini isteği engelledi (${blockReason}). Metni yeniden ifade edip deneyin.`, {
      provider: 'gemini'
    });
  }

  return { text };
}

module.exports = { listModels, chat, DEFAULT_BASE };
