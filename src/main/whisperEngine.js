'use strict';

/**
 * WhisperEngine — High-Fidelity Audio Speech-to-Text (STT) Service for Sparky AI.
 * MediaRecorder ile yakalanan sesleri Whisper (Groq/OpenAI/Özel) üzerinden metne dönüştürür.
 */

const https = require('https');
const http = require('http');
const secrets = require('./secrets');
const { settings } = require('./store');

class WhisperEngine {
  /**
   * Transcribes raw audio buffer to text based on selected voiceProvider setting.
   * @param {Buffer|Uint8Array} audioBuffer
   * @param {Object} [options]
   * @returns {Promise<{ ok: boolean, text: string, provider?: string, error?: string }>}
   */
  static async transcribe(audioBuffer, options = {}) {
    if (!audioBuffer || audioBuffer.length === 0) {
      return { ok: false, text: '', error: 'Ses verisi boş.' };
    }

    const lang = options.language || (settings.get('appLanguage') === 'en' ? 'en' : 'tr');
    const buffer = Buffer.isBuffer(audioBuffer) ? audioBuffer : Buffer.from(audioBuffer);
    const selectedProvider = settings.get('voiceProvider') || 'auto';

    // 1. Groq Selected
    if (selectedProvider === 'groq') {
      const groqKey = secrets.getKey('groq');
      if (!groqKey) return { ok: false, text: '', error: 'Groq API anahtarı bulunamadı. Ayarlar → Model/API bölümünden ekleyin.' };
      return this.callGroqWhisper(buffer, lang, groqKey);
    }

    // 2. OpenAI Selected
    if (selectedProvider === 'openai') {
      const openaiKey = secrets.getKey('openai');
      if (!openaiKey) return { ok: false, text: '', error: 'OpenAI API anahtarı bulunamadı. Ayarlar → Model/API bölümünden ekleyin.' };
      return this.callOpenAiWhisper(buffer, lang, openaiKey);
    }

    // 3. Custom Selected
    if (selectedProvider === 'custom') {
      const customUrl = settings.get('voiceCustomEndpoint');
      if (!customUrl) return { ok: false, text: '', error: 'Özel Whisper uç noktası URL adresi girilmedi.' };
      const customKey = secrets.getKey('custom') || '';
      return this.callCustomWhisper(buffer, lang, customUrl, customKey);
    }

    // 4. Auto Mode: Groq -> OpenAI -> Custom
    const groqKey = secrets.getKey('groq');
    if (groqKey) {
      try {
        return await this.callGroqWhisper(buffer, lang, groqKey);
      } catch (err) {
        console.warn('[WhisperEngine] Groq auto fallback to OpenAI:', err.message);
      }
    }

    const openaiKey = secrets.getKey('openai');
    if (openaiKey) {
      try {
        return await this.callOpenAiWhisper(buffer, lang, openaiKey);
      } catch (err) {
        console.warn('[WhisperEngine] OpenAI auto fallback failed:', err.message);
      }
    }

    const customUrl = settings.get('voiceCustomEndpoint');
    if (customUrl) {
      return this.callCustomWhisper(buffer, lang, customUrl, secrets.getKey('custom') || '');
    }

    return {
      ok: false,
      text: '',
      error: 'Sesli tanıma için Ayarlar → Model/API bölümünden bir Groq veya OpenAI API anahtarı ekleyin.'
    };
  }

  static async callGroqWhisper(buffer, lang, apiKey) {
    try {
      const text = await this.sendMultipart({
        url: 'https://api.groq.com/openai/v1/audio/transcriptions',
        apiKey,
        model: 'whisper-large-v3-turbo',
        language: lang,
        buffer
      });
      return { ok: true, text, provider: 'groq' };
    } catch (err) {
      return { ok: false, text: '', error: `Groq Whisper hatası: ${err.message}` };
    }
  }

  static async callOpenAiWhisper(buffer, lang, apiKey) {
    try {
      const text = await this.sendMultipart({
        url: 'https://api.openai.com/v1/audio/transcriptions',
        apiKey,
        model: 'whisper-1',
        language: lang,
        buffer
      });
      return { ok: true, text, provider: 'openai' };
    } catch (err) {
      return { ok: false, text: '', error: `OpenAI Whisper hatası: ${err.message}` };
    }
  }

  static async callCustomWhisper(buffer, lang, url, apiKey) {
    try {
      const targetUrl = url.includes('/audio/transcriptions') ? url : `${url.replace(/\/+$/, '')}/audio/transcriptions`;
      const text = await this.sendMultipart({
        url: targetUrl,
        apiKey,
        model: 'whisper-1',
        language: lang,
        buffer
      });
      return { ok: true, text, provider: 'custom' };
    } catch (err) {
      return { ok: false, text: '', error: `Özel Whisper hatası: ${err.message}` };
    }
  }

  /**
   * Universal multipart/form-data audio sender supporting http/https.
   * @private
   */
  static sendMultipart({ url, apiKey, model, language, buffer }) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const transport = isHttps ? https : http;
      const boundary = `----SparkyBoundary${Date.now().toString(16)}`;

      let bodyHead = `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n`;
      if (language) {
        bodyHead += `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`;
      }
      bodyHead += `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.webm"\r\nContent-Type: audio/webm\r\n\r\n`;
      const bodyTail = `\r\n--${boundary}--\r\n`;

      const headBuf = Buffer.from(bodyHead, 'utf8');
      const tailBuf = Buffer.from(bodyTail, 'utf8');
      const totalLength = headBuf.length + buffer.length + tailBuf.length;

      const headers = {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalLength
      };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

      const req = transport.request(parsedUrl, { method: 'POST', headers }, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(responseData);
            if (res.statusCode >= 200 && res.statusCode < 300 && json.text !== undefined) {
              resolve(json.text.trim());
            } else {
              reject(new Error(json.error?.message || responseData || `HTTP ${res.statusCode}`));
            }
          } catch {
            reject(new Error(`Geçersiz JSON yanıtı: ${responseData}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('İstek zaman aşımına uğradı (15s)'));
      });

      req.write(headBuf);
      req.write(buffer);
      req.write(tailBuf);
      req.end();
    });
  }
}

module.exports = WhisperEngine;
