'use strict';

// OpenAI uyumlu uçlar: LM Studio, OpenAI, OpenRouter, Groq, DeepSeek, Together,
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
  return (json.data || []).map((m) => m.id).filter(Boolean).sort();
}

const { toOpenAiContent } = require('./imageUtils');

function formatMessages(system, messages, image) {
  const formatted = system ? [{ role: 'system', content: system }] : [];
  const list = [...messages];

  if (image && list.length > 0) {
    const imgPart = toOpenAiContent(image);
    if (imgPart) {
      const lastIdx = list.length - 1;
      const lastMsg = list[lastIdx];
      if (lastMsg.role === 'user') {
        const textPart = { type: 'text', text: typeof lastMsg.content === 'string' ? lastMsg.content : '' };
        list[lastIdx] = {
          ...lastMsg,
          content: [textPart, imgPart]
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
  await readSSE(res, (obj) => {
    if (obj.error) throw new LlmError(obj.error.message || String(obj.error), { provider: providerId });
    const piece = obj?.choices?.[0]?.delta?.content;
    if (piece) {
      text += piece;
      onToken?.(piece);
    }
    return true;
  });

  return { text };
}

module.exports = { listModels, chat };
