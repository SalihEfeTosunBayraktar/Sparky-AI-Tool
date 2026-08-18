'use strict';

/**
 * VoiceInput — Smart Audio & Continuous VAD Speech Controller for Sparky AI.
 * Ses aktivite algılama (VAD), hassas mikrofon analizi ve sessizlik sonrası oto-üretim.
 */

class VoiceInput {
  /**
   * @param {Object} [options]
   * @param {Function} [options.onResult] - Callback with transcribed text (text)
   * @param {Function} [options.onStateChange] - Callback with state ('idle'|'listening'|'processing'|'error')
   * @param {Function} [options.onAutoSubmit] - Callback when silence triggers auto generation
   * @param {Function} [options.onError] - Callback with error message
   * @param {boolean} [options.autoSubmit=true] - Auto generate after prolonged silence
   * @param {Object} [options.api] - Electron API bridge
   */
  constructor(options = {}) {
    this.onResult = options.onResult || null;
    this.onStateChange = options.onStateChange || null;
    this.onAutoSubmit = options.onAutoSubmit || null;
    this.onError = options.onError || null;
    this.autoSubmit = options.autoSubmit !== false;
    this.api = options.api || (typeof window !== 'undefined' ? (window.api || (typeof api !== 'undefined' ? api : null)) : null);
    this.state = 'idle';
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.audioCtx = null;
    this.analyser = null;
    this.vadTimer = null;
    this.startTime = 0;
    this.lastSpeechTime = 0;
    this.hasSpoken = false;
    this.silenceSubmitMs = 2400; // 2.4 seconds silence threshold
  }

  static isSupported() {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  setState(newState) {
    this.state = newState;
    this.onStateChange?.(this.state);
  }

  async start() {
    if (this.state === 'listening') return false;
    if (!VoiceInput.isSupported()) {
      this.onError?.('Mikrofon erişimi bu ortamda desteklenmiyor.');
      return false;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.hasSpoken = false;
      this.startTime = Date.now();
      this.lastSpeechTime = Date.now();

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data?.size > 0) this.audioChunks.push(e.data);
      };

      this.mediaRecorder.start(250);
      await this.initVad(this.stream);
      this.setState('listening');
      return true;
    } catch (err) {
      this.setState('error');
      this.onError?.(`Mikrofon erişilemedi: ${err.message}`);
      return false;
    }
  }

  async initVad(stream) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.audioCtx = new AudioContextClass();
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      const source = this.audioCtx.createMediaStreamSource(stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      this.vadTimer = setInterval(() => {
        if (this.state !== 'listening') return;
        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const avg = sum / bufferLength;

        const now = Date.now();
        // Sensitive threshold (>= 4 detects whispering/quiet mics)
        if (avg >= 4) {
          this.lastSpeechTime = now;
          this.hasSpoken = true;
        } else {
          const silentFor = now - this.lastSpeechTime;
          if (this.hasSpoken && silentFor >= this.silenceSubmitMs) {
            // User spoke and paused: stop and process with auto-submit
            this.stopAndProcess(true);
          } else if (!this.hasSpoken && (now - this.startTime) >= 7000) {
            // No speech detected at all for 7s: cancel listening
            this.stop();
          }
        }
      }, 150);
    } catch {}
  }

  cleanupStream() {
    if (this.vadTimer) { clearInterval(this.vadTimer); this.vadTimer = null; }
    if (this.audioCtx) { try { this.audioCtx.close(); } catch {} this.audioCtx = null; }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  stop() {
    this.cleanupStream();
    if (this.mediaRecorder && this.state === 'listening') {
      try { this.mediaRecorder.stop(); } catch {}
    }
    this.setState('idle');
  }

  async stopAndProcess(shouldAutoSubmit = false) {
    if (this.state !== 'listening') return;
    this.cleanupStream();
    this.setState('processing');

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      await new Promise((resolve) => {
        this.mediaRecorder.onstop = resolve;
        try { this.mediaRecorder.stop(); } catch { resolve(); }
      });
    }

    if (!this.audioChunks.length) {
      this.setState('idle');
      return;
    }

    try {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      this.audioChunks = [];
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const apiBridge = this.api || (typeof window !== 'undefined' ? (window.api || (typeof api !== 'undefined' ? api : null)) : null);

      if (apiBridge?.voice?.transcribe) {
        const res = await apiBridge.voice.transcribe(uint8Array);
        if (res?.ok && res.text) {
          this.onResult?.(res.text);
          this.setState('idle');
          if (shouldAutoSubmit && this.autoSubmit) {
            setTimeout(() => this.onAutoSubmit?.(), 300);
          }
        } else {
          this.setState('error');
          this.onError?.(res?.error || 'Sesli tanıma için Ayarlar → Model/API bölümünden bir Groq veya OpenAI anahtarı ekleyin.');
        }
      } else {
        this.setState('error');
        this.onError?.('Ses servisi bulunamadı.');
      }
    } catch (err) {
      this.setState('error');
      this.onError?.(`Ses hatası: ${err.message}`);
    }
  }

  toggle() {
    if (this.state === 'listening') {
      this.stopAndProcess(false);
      return false;
    } else {
      return this.start();
    }
  }
}

if (typeof window !== 'undefined') window.VoiceInput = VoiceInput;
if (typeof module !== 'undefined' && module.exports) module.exports = VoiceInput;
