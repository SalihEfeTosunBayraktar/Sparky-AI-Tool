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
 * Converts image payload into OpenAI Vision message content object.
 * OpenAI Vision uyumlu mesaj içerik parçası üretir.
 */
function toOpenAiContent(image) {
  const norm = normalizeImage(image);
  if (!norm) return null;
  return {
    type: 'image_url',
    image_url: {
      url: `data:${norm.mimeType};base64,${norm.base64}`
    }
  };
}

/**
 * Converts image payload into Anthropic Claude vision content object.
 * Anthropic Claude uyumlu görsel içerik parçası üretir.
 */
function toAnthropicContent(image) {
  const norm = normalizeImage(image);
  if (!norm) return null;
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: norm.mimeType,
      data: norm.base64
    }
  };
}

/**
 * Converts image payload into Google Gemini inlineData content part.
 * Google Gemini uyumlu inlineData içerik parçası üretir.
 */
function toGeminiContent(image) {
  const norm = normalizeImage(image);
  if (!norm) return null;
  return {
    inlineData: {
      mimeType: norm.mimeType,
      data: norm.base64
    }
  };
}

module.exports = {
  normalizeImage,
  toOpenAiContent,
  toAnthropicContent,
  toGeminiContent
};
