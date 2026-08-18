'use strict';

/**
 * WhisperEngine — High-Fidelity Audio Speech-to-Text (STT) Service for Sparky AI.
 * MediaRecorder ile yakalanan sesleri Whisper (Groq/OpenAI/Yerel) üzerinden metne dönüştürür.
 */

const https = require('https');
const http = require('http');
const secrets = require('./secrets');
const { settings } = require('./store');

class WhisperEngine {
  /**
   * Transcribes raw audio buffer to text.
   * Ham ses verisini metne dönüştürür.
   * @param {Buffer|Uint8Array} audioBuffer
   * @param {Object} [options]
   * @param {string} [options.language='tr'] - Language code ('tr'|'en')
   * @param {string} [options.mimeType='audio/webm']
   * @returns {Promise<{ ok: boolean, text: string, provider?: string, error?: string }>}
   */
  static async transcribe(audioBuffer, options = {}) {
    if (!audioBuffer || audioBuffer.length === 0) {
      return { ok: false, text: '', error: 'Ses verisi boş.' };
    }

    const lang = options.language || (settings.get('appLanguage') === 'en' ? 'en' : 'tr');
    const buffer = Buffer.isBuffer(audioBuffer) ? audioBuffer : Buffer.from(audioBuffer);

    // 1. Try Groq Whisper (Fastest - ~200ms response)
    const groqKey = secrets.getKey('groq');
    if (groqKey) {
      try {
        const text = await this.sendToWhisperApi({
          host: 'api.groq.com',
          path: '/openai/v1/audio/transcriptions',
          apiKey: groqKey,
          model: 'whisper-large-v3-turbo',
          language: lang,
          buffer,
          filename: 'audio.webm'
        });
        return { ok: true, text, provider: 'groq' };
      } catch (err) {
        console.warn('[WhisperEngine] Groq Whisper failed, trying OpenAI:', err.message);
      }
    }

    // 2. Try OpenAI Whisper
    const openaiKey = secrets.getKey('openai');
    if (openaiKey) {
      try {
        const text = await this.sendToWhisperApi({
          host: 'api.openai.com',
          path: '/v1/audio/transcriptions',
          apiKey: openaiKey,
          model: 'whisper-1',
          language: lang,
          buffer,
          filename: 'audio.webm'
        });
        return { ok: true, text, provider: 'openai' };
      } catch (err) {
        return { ok: false, text: '', error: `OpenAI Whisper hatası: ${err.message}` };
      }
    }

    // 3. Fallback: No API Key found
    return {
      ok: false,
      text: '',
      error: 'Sesli tanıma için Ayarlar bölümünden bir OpenAI veya Groq API anahtarı ekleyin.'
    };
  }

  /**
   * Helper to send multipart/form-data audio to OpenAI-compatible Whisper endpoints.
   * @private
   */
  static sendToWhisperApi({ host, path: reqPath, apiKey, model, language, buffer, filename }) {
    return new Promise((resolve, reject) => {
      const boundary = `----SparkyBoundary${Date.now().toString(16)}`;

      let bodyHead = '';
      bodyHead += `--${boundary}\r\n`;
      bodyHead += `Content-Disposition: form-data; name="model"\r\n\r\n${model}\r\n`;

      if (language) {
        bodyHead += `--${boundary}\r\n`;
        bodyHead += `Content-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`;
      }

      bodyHead += `--${boundary}\r\n`;
      bodyHead += `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`;
      bodyHead += 'Content-Type: audio/webm\r\n\r\n';

      const bodyTail = `\r\n--${boundary}--\r\n`;

      const headBuf = Buffer.from(bodyHead, 'utf8');
      const tailBuf = Buffer.from(bodyTail, 'utf8');
      const totalLength = headBuf.length + buffer.length + tailBuf.length;

      const reqOptions = {
        hostname: host,
        port: 443,
        path: reqPath,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': totalLength
        }
      };

      const req = https.request(reqOptions, (res) => {
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
          } catch (e) {
            reject(new Error(`Geçersiz JSON yanıtı: ${responseData}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Ses tanıma isteği zaman aşımına uğradı (15s)'));
      });

      req.write(headBuf);
      req.write(buffer);
      req.write(tailBuf);
      req.end();
    });
  }
}

module.exports = WhisperEngine;
