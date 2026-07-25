'use strict';

// Anthropic (Claude) — resmî @anthropic-ai/sdk üzerinden.
const AnthropicModule = require('@anthropic-ai/sdk');
const { LlmError } = require('./http');

const Anthropic = AnthropicModule.default || AnthropicModule;

// Bu modeller adaptif düşünmeyi ve output_config.effort'u destekler; buna karşılık
// temperature/top_p gönderilirse 400 döner.
const MODERN = /^claude-(fable-5|mythos-5|opus-5|opus-4-8|opus-4-7|opus-4-6|sonnet-5|sonnet-4-6)/;

// Model listesi çekilemezse gösterilecek yedek liste.
const FALLBACK_MODELS = [
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-opus-4-8',
  'claude-haiku-4-5'
];

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

function makeClient(apiKey, endpoint) {
  if (!apiKey) {
    throw new LlmError('Anthropic API anahtarı girilmemiş. Ayarlar → API Anahtarları bölümünden ekleyin.', {
      provider: 'anthropic'
    });
  }
  const opts = { apiKey };
  const base = String(endpoint || '').trim();
  if (base) opts.baseURL = base.replace(/\/+$/, '');
  return new Anthropic(opts);
}

function wrap(err) {
  if (err instanceof LlmError) return err;
  const status = err?.status;
  const msg = err?.error?.error?.message || err?.message || String(err);
  if (status === 401) {
    return new LlmError('Anthropic API anahtarı geçersiz (401). Ayarlardan anahtarı güncelleyin.', {
      status,
      provider: 'anthropic'
    });
  }
  if (status === 429) {
    return new LlmError('Anthropic hız sınırına takıldı (429). Biraz bekleyip tekrar deneyin.', {
      status,
      provider: 'anthropic'
    });
  }
  return new LlmError(msg, { status, provider: 'anthropic', cause: err });
}

async function listModels({ apiKey, endpoint }) {
  try {
    const client = makeClient(apiKey, endpoint);
    const page = await client.models.list();
    const ids = (page?.data || []).map((m) => m.id).filter(Boolean);
    return ids.length ? ids : FALLBACK_MODELS;
  } catch (err) {
    if (err instanceof LlmError) throw err;
    // Liste çekilemedi — kullanıcı yine de elle model seçebilsin.
    return FALLBACK_MODELS;
  }
}

const { toAnthropicContent } = require('./imageUtils');

function formatAnthropicMessages(messages, image) {
  const list = messages.map((m) => ({ ...m }));
  if (image && list.length > 0) {
    const imgParts = toAnthropicContent(image);
    if (imgParts.length > 0) {
      const lastIdx = list.length - 1;
      const lastMsg = list[lastIdx];
      if (lastMsg.role === 'user') {
        const textPart = { type: 'text', text: typeof lastMsg.content === 'string' ? lastMsg.content : '' };
        list[lastIdx] = {
          role: 'user',
          content: [textPart, ...imgParts]
        };
      }
    }
  }
  return list;
}

function buildParams({ model, system, messages, image, temperature, maxTokens, effort }) {
  const modern = MODERN.test(model);
  const want = Math.max(512, Number(maxTokens) || 2048);

  const params = {
    model,
    // Adaptif düşünme açıkken max_tokens düşünme + yanıtı birlikte kapsar;
    // yanıt yarıda kesilmesin diye ek pay bırakıyoruz.
    max_tokens: modern ? want + 8192 : want,
    messages: formatAnthropicMessages(messages, image)
  };
  if (system) params.system = system;

  if (modern) {
    params.thinking = { type: 'adaptive' };
    params.output_config = { effort: effort || 'medium' };
    // temperature bu modellerde reddedilir — bilinçli olarak gönderilmiyor.
  } else {
    params.temperature = Number(temperature);
  }
  return params;
}

async function consume(stream, onToken) {
  let text = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      const piece = event.delta.text;
      if (piece) {
        text += piece;
        onToken?.(piece);
      }
    }
  }
  const final = await stream.finalMessage();
  if (final?.stop_reason === 'refusal') {
    const category = final?.stop_details?.category;
    throw new LlmError(
      `Model bu isteği güvenlik gerekçesiyle reddetti${category ? ` (${category})` : ''}. Metni yeniden ifade edip deneyin.`,
      { provider: 'anthropic' }
    );
  }
  if (final?.stop_reason === 'max_tokens' && !text.trim()) {
    throw new LlmError('Yanıt token bütçesi tükendi. Ayarlardan "Maks. token" değerini artırın.', {
      provider: 'anthropic'
    });
  }
  return { text };
}

function isBetaRejection(err) {
  const msg = String(err?.error?.error?.message || err?.message || '');
  return err?.status === 400 && /fallback|beta|unexpected|unsupported|unrecognized/i.test(msg);
}

async function chat({ apiKey, endpoint, model, system, messages, image, temperature, maxTokens, effort, signal, onToken }) {
  const client = makeClient(apiKey, endpoint);
  if (!model) {
    throw new LlmError('Model seçilmedi. Ayarlar → Model bölümünden bir model seçin.', { provider: 'anthropic' });
  }

  const params = buildParams({ model, system, messages, image, temperature, maxTokens, effort });

  // Sunucu tarafı yedek yalnızca yeni modellerde ve beta uç mevcutsa anlamlı.
  const canFallback = MODERN.test(model) && typeof client.beta?.messages?.stream === 'function';

  if (canFallback) {
    try {
      const stream = client.beta.messages.stream(
        { ...params, betas: [FALLBACK_BETA], fallbacks: 'default' },
        { signal }
      );
      return await consume(stream, onToken);
    } catch (err) {
      // Hesap/uç bu betayı desteklemiyorsa yedeksiz normal akışa düş.
      if (!isBetaRejection(err)) throw wrap(err);
    }
  }

  try {
    const stream = client.messages.stream(params, { signal });
    return await consume(stream, onToken);
  } catch (err) {
    throw wrap(err);
  }
}

module.exports = { listModels, chat, FALLBACK_MODELS };
