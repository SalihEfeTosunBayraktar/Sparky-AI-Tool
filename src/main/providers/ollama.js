'use strict';

// Ollama'nın kendi API'si (/api/chat, /api/tags). NDJSON akışı kullanır.
const { trimSlash, request, getJson, readNdjson, LlmError } = require('./http');

async function listModels({ endpoint, signal }) {
  const base = trimSlash(endpoint) || 'http://127.0.0.1:11434';
  const json = await getJson(`${base}/api/tags`, { signal, provider: 'ollama' });
  return (json.models || []).map((m) => m.name).filter(Boolean).sort();
}

async function chat({ endpoint, model, system, messages, temperature, maxTokens, signal, onToken }) {
  const base = trimSlash(endpoint) || 'http://127.0.0.1:11434';
  if (!model) throw new LlmError('Model seçilmedi. Ayarlar → Model bölümünden bir model seçin.', { provider: 'ollama' });

  const payload = {
    model,
    stream: true,
    messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
    options: {
      temperature: Number(temperature),
      num_predict: Number(maxTokens)
    }
  };

  const res = await request(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    signal,
    provider: 'ollama'
  });

  let text = '';
  await readNdjson(res, (obj) => {
    if (obj.error) throw new LlmError(String(obj.error), { provider: 'ollama' });
    const piece = obj?.message?.content;
    if (piece) {
      text += piece;
      onToken?.(piece);
    }
    if (obj.done) return false;
    return true;
  });

  return { text };
}

module.exports = { listModels, chat };
