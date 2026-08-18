'use strict';

/**
 * VoiceInput — High-Fidelity Audio & Speech-to-Text Controller for Sparky AI.
 * MediaRecorder ses kaydı ve Whisper STT entegrasyonu.
 */

class VoiceInput {
  /**
   * @param {Object} [options]
   * @param {Function} [options.onResult] - Callback with transcribed text (text)
   * @param {Function} [options.onStateChange] - Callback with state ('idle'|'listening'|'processing'|'error')
   * @param {Function} [options.onError] - Callback with error message
   * @param {Object} [options.api] - Electron API bridge
   */
  constructor(options = {}) {
    this.onResult = options.onResult || null;
    this.onStateChange = options.onStateChange || null;
    this.onError = options.onError || null;
    this.api = options.api || (typeof window !== 'undefined' ? window.api : null);
    this.state = 'idle'; // 'idle' | 'listening' | 'processing' | 'error'
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
  }

  static isSupported() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return false;
    return typeof navigator.mediaDevices.getUserMedia === 'function';
  }

  setState(newState) {
    this.state = newState;
    if (typeof this.onStateChange === 'function') {
      this.onStateChange(this.state);
    }
  }

  async start() {
    if (this.state === 'listening') return false;

    if (!VoiceInput.isSupported()) {
      if (typeof this.onError === 'function') {
        this.onError('Mikrofon erişimi bu ortamda desteklenmiyor.');
      }
      return false;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        await this.processAudio();
      };

      this.mediaRecorder.start();
      this.setState('listening');
      return true;
    } catch (err) {
      console.warn('[VoiceInput] Microphone access error:', err.message);
      this.setState('error');
      if (typeof this.onError === 'function') {
        this.onError(`Mikrofon erişilemedi: ${err.message}`);
      }
      return false;
    }
  }

  stop() {
    if (this.mediaRecorder && this.state === 'listening') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.setState('processing');
  }

  async processAudio() {
    if (!this.audioChunks.length) {
      this.setState('idle');
      return;
    }

    try {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      if (this.api && this.api.voice && typeof this.api.voice.transcribe === 'function') {
        const res = await this.api.voice.transcribe(uint8Array);
        if (res && res.ok && res.text) {
          if (typeof this.onResult === 'function') {
            this.onResult(res.text);
          }
          this.setState('idle');
        } else {
          this.setState('error');
          if (typeof this.onError === 'function') {
            this.onError(res?.error || 'Ses çözümlenemedi.');
          }
        }
      } else {
        this.setState('error');
        if (typeof this.onError === 'function') {
          this.onError('Ses tanıma servisi bulunamadı.');
        }
      }
    } catch (err) {
      this.setState('error');
      if (typeof this.onError === 'function') {
        this.onError(`Ses işleme hatası: ${err.message}`);
      }
    }
  }

  toggle() {
    if (this.state === 'listening') {
      this.stop();
      return false;
    } else {
      return this.start();
    }
  }
}

if (typeof window !== 'undefined') {
  window.VoiceInput = VoiceInput;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VoiceInput;
}
