'use strict';

/**
 * Image processing utilities for Vision/Multimodal AI models.
 * Resim işleme ve doğrulama yardımcı modülü.
 */

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif'
]);

/**
 * Normalizes image input object into standard format.
 * Gelen resim verisini standart { mimeType, base64 } formatına çevirir.
 *
 * @param {object|string} image - Image input data (data URL or object)
 * @returns {object|null} { mimeType, base64 } or null if invalid
 */
function normalizeImage(image) {
  if (!image) return null;

  if (typeof image === 'string') {
    // Check if data URL format: data:image/png;base64,xxxx
    const match = image.match(/^data:(image\/[a-zA-Z+-]+);base64,(.+)$/);
    if (match) {
      const mimeType = match[1].toLowerCase();
      const base64 = match[2];
      return ALLOWED_MIME_TYPES.has(mimeType) ? { mimeType, base64 } : null;
    }
    // Pure base64 fallback (default to png if unspecified)
    return { mimeType: 'image/png', base64: image };
  }

  if (typeof image === 'object' && image.base64) {
    const mimeType = (image.mimeType || 'image/png').toLowerCase();
    return ALLOWED_MIME_TYPES.has(mimeType) ? { mimeType, base64: image.base64 } : null;
  }

  return null;
}

/**
 * Normalizes single or multiple image inputs into an array of standard objects.
 * Görsel verilerini ({ mimeType, base64 }) dizisi olarak normalleştirir.
 */
function normalizeImages(imageInput) {
  if (!imageInput) return [];
  const list = Array.isArray(imageInput) ? imageInput : [imageInput];
  return list.map(normalizeImage).filter(Boolean);
}

/**
 * Converts image payload into OpenAI Vision content array.
 * OpenAI Vision uyumlu görsel dizi parçaları üretir.
 */
function toOpenAiContent(imageInput) {
  const normList = normalizeImages(imageInput);
  return normList.map((norm) => ({
    type: 'image_url',
    image_url: {
      url: `data:${norm.mimeType};base64,${norm.base64}`
    }
  }));
}

/**
 * Converts image payload into Anthropic Claude vision content array.
 * Anthropic Claude uyumlu görsel dizi parçaları üretir.
 */
function toAnthropicContent(imageInput) {
  const normList = normalizeImages(imageInput);
  return normList.map((norm) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: norm.mimeType,
      data: norm.base64
    }
  }));
}

/**
 * Converts image payload into Google Gemini inlineData content array.
 * Google Gemini uyumlu inlineData dizi parçaları üretir.
 */
function toGeminiContent(imageInput) {
  const normList = normalizeImages(imageInput);
  return normList.map((norm) => ({
    inlineData: {
      mimeType: norm.mimeType,
      data: norm.base64
    }
  }));
}

/**
 * Determines if a given provider and model combination supports vision/image input.
 * Verilen sağlayıcı ve modelin görsel girişini destekleyip desteklemediğini doğrular.
 *
 * @param {string} provider
 * @param {string} model
 * @returns {boolean}
 */
function supportsVision(provider, model) {
  const p = String(provider || '').toLowerCase();
  const m = String(model || '').toLowerCase();

  // Explicit non-vision checks
  if (
    p === 'deepseek' ||
    m.includes('deepseek-chat') ||
    m.includes('deepseek-coder') ||
    m.includes('deepseek-reasoner') ||
    m.includes('nemotron') ||
    m.includes('mistral-7b') ||
    m.includes('mixtral') ||
    m.includes('qwen-2.5-coder') ||
    m.includes('command-r')
  ) {
    if (!m.includes('vl') && !m.includes('vision')) {
      return false;
    }
  }

  if (m.startsWith('gpt-3.5') || m === 'gpt-4' || m === 'gpt-4-0314' || m === 'gpt-4-0613') {
    return false;
  }

  // Vision detection rules
  if (p === 'gemini' || m.includes('gemini') || m.includes('flash') || m.includes('pro-vision')) {
    return true;
  }

  if (
    p === 'anthropic' ||
    m.includes('claude-3') ||
    m.includes('claude-opus') ||
    m.includes('claude-sonnet') ||
    m.includes('claude-haiku')
  ) {
    return true;
  }

  if (
    m.includes('4o') ||
    m.includes('vision') ||
    m.includes('llava') ||
    m.includes('bakllava') ||
    m.includes('moondream') ||
    m.includes('vl') ||
    m.includes('minicpm-v') ||
    m.includes('pixtral')
  ) {
    return true;
  }

  if (p === 'openai' && (m.includes('gpt-4') || m.includes('o1') || m.includes('o3') || m.includes('chatgpt-4o'))) {
    return true;
  }

  if (p === 'ollama' || p === 'lmstudio') {
    return /(vision|llava|bakllava|moondream|minicpm-v|vl|pixtral)/i.test(m);
  }

  return false;
}

module.exports = {
  normalizeImage,
  normalizeImages,
  toOpenAiContent,
  toAnthropicContent,
  toGeminiContent,
  supportsVision
};
