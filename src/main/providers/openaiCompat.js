'use strict';

// OpenAI uyumlu uçlar: AgentRouter, OpenRouter, LM Studio, OpenAI, Groq, DeepSeek, Together,
// llama.cpp server ve benzerleri. API anahtarı opsiyoneldir (yerelde gerekmez).
const { withV1, request, getJson, readSSE, LlmError } = require('./http');

function headers(apiKey) {
  const h = { 'Content-Type': 'application/json' };
  if (apiKey) h.Authorization = `Bearer ${apiKey}`;
  return h;
}

async function listModels({ endpoint, apiKey, signal, providerId }) {
  const base = withV1(endpoint);
  if (!base) throw new LlmError('Sunucu adresi boş. Ayarlar bölümünden adresi girin.', { provider: providerId });
  const json = await getJson(`${base}/models`, { headers: headers(apiKey), signal, provider: providerId });

  let rawList = [];
  if (Array.isArray(json.data)) {
    rawList = json.data;
  } else if (Array.isArray(json.models)) {
    rawList = json.models;
  } else if (Array.isArray(json)) {
    rawList = json;
  }

  const modelIds = rawList
    .map((m) => (typeof m === 'string' ? m : m?.id || m?.name))
    .filter(Boolean);

  return [...new Set(modelIds)].sort();
}

const { toOpenAiContent } = require('./imageUtils');

function formatMessages(system, messages, image) {
  const formatted = system ? [{ role: 'system', content: system }] : [];
  const list = [...messages];

  if (image && list.length > 0) {
    const imgParts = toOpenAiContent(image);
    if (imgParts.length > 0) {
      const lastIdx = list.length - 1;
      const lastMsg = list[lastIdx];
      if (lastMsg.role === 'user') {
        const textPart = { type: 'text', text: typeof lastMsg.content === 'string' ? lastMsg.content : '' };
        list[lastIdx] = {
          ...lastMsg,
          content: [textPart, ...imgParts]
        };
      }
    }
  }

  return [...formatted, ...list];
}

async function chat({ endpoint, apiKey, model, system, messages, image, temperature, maxTokens, signal, onToken, providerId }) {
  const base = withV1(endpoint);
  if (!base) throw new LlmError('Sunucu adresi boş. Ayarlar bölümünden adresi girin.', { provider: providerId });
  if (!model) throw new LlmError('Model seçilmedi. Ayarlar → Model bölümünden bir model seçin.', { provider: providerId });

  const payload = {
    model,
    stream: true,
    temperature: Number(temperature),
    max_tokens: Number(maxTokens),
    messages: formatMessages(system, messages, image)
  };

  const res = await request(`${base}/chat/completions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: payload,
    signal,
    provider: providerId
  });

  let text = '';
  let finishReason = null;
  let totalTokens = null;

  await readSSE(res, (obj) => {
    if (obj.error) throw new LlmError(obj.error.message || String(obj.error), { provider: providerId });
    const choice = obj?.choices?.[0];
    const rawPiece = choice?.delta?.content ?? choice?.delta?.text ?? choice?.message?.content ?? choice?.text;

    let piece = '';
    if (typeof rawPiece === 'string') {
      piece = rawPiece;
    } else if (Array.isArray(rawPiece)) {
      piece = rawPiece.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('');
    }

    if (piece) {
      text += piece;
      onToken?.(piece);
    }

    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (obj.usage && typeof obj.usage.total_tokens === 'number') {
      totalTokens = obj.usage.total_tokens;
    }
    return true;
  });

  return { text, truncated: finishReason === 'length', totalTokens };
}

module.exports = { listModels, chat };
