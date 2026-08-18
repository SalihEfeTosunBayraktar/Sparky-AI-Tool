'use strict';

/**
 * VoiceInput — Smart Audio & Continuous VAD Speech Controller for Sparky AI.
 * Ses aktivite dedektörü (VAD), ara transkripsiyon ve sessizlik sonrası oto-üretim.
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
    this.lastSpeechTime = 0;
    this.hasSpoken = false;
    this.hasTranscribedAny = false;
    this.silenceChunkMs = 1400;
    this.silenceSubmitMs = 3200;
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
      this.hasTranscribedAny = false;
      this.lastSpeechTime = Date.now();

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
      this.mediaRecorder.ondataavailable = (e) => { if (e.data?.size > 0) this.audioChunks.push(e.data); };
      this.mediaRecorder.onstop = () => { this.processAudio(); };

      this.mediaRecorder.start(300); // 300ms timeslices for smooth chunking
      this.initVad(this.stream);
      this.setState('listening');
      return true;
    } catch (err) {
      this.setState('error');
      this.onError?.(`Mikrofon erişilemedi: ${err.message}`);
      return false;
    }
  }

  initVad(stream) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.audioCtx = new AudioContextClass();
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
        if (avg > 15) { // Active speech threshold
          this.lastSpeechTime = now;
          this.hasSpoken = true;
        } else if (this.hasSpoken) {
          const silentFor = now - this.lastSpeechTime;
          // Intermediate pause: process current sentence chunk
          if (silentFor >= this.silenceChunkMs && this.audioChunks.length > 0) {
            this.hasSpoken = false;
            this.flushChunk();
          }
          // Prolonged pause: trigger auto-submit if enabled
          if (this.autoSubmit && silentFor >= this.silenceSubmitMs && this.hasTranscribedAny) {
            this.stop();
            setTimeout(() => this.onAutoSubmit?.(), 250);
          }
        }
      }, 150);
    } catch {}
  }

  async flushChunk() {
    if (!this.audioChunks.length) return;
    const chunksToProcess = [...this.audioChunks];
    this.audioChunks = [];
    await this.transcribeBlob(new Blob(chunksToProcess, { type: 'audio/webm' }));
  }

  stop() {
    if (this.vadTimer) { clearInterval(this.vadTimer); this.vadTimer = null; }
    if (this.audioCtx) { try { this.audioCtx.close(); } catch {} this.audioCtx = null; }
    if (this.mediaRecorder && this.state === 'listening') {
      try { this.mediaRecorder.stop(); } catch {}
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.setState('processing');
  }

  async processAudio() {
    if (this.audioChunks.length) {
      await this.transcribeBlob(new Blob(this.audioChunks, { type: 'audio/webm' }));
      this.audioChunks = [];
    }
    if (this.state !== 'error') this.setState('idle');
  }

  async transcribeBlob(audioBlob) {
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const apiBridge = this.api || (typeof window !== 'undefined' ? (window.api || (typeof api !== 'undefined' ? api : null)) : null);

      if (apiBridge?.voice?.transcribe) {
        const res = await apiBridge.voice.transcribe(uint8Array);
        if (res?.ok && res.text) {
          this.hasTranscribedAny = true;
          this.onResult?.(res.text);
        } else if (res?.error && !this.hasTranscribedAny) {
          this.setState('error');
          this.onError?.(res.error);
        }
      }
    } catch (err) {
      this.onError?.(`Ses hatası: ${err.message}`);
    }
  }

  toggle() {
    return this.state === 'listening' ? (this.stop(), false) : this.start();
  }
}

if (typeof window !== 'undefined') window.VoiceInput = VoiceInput;
if (typeof module !== 'undefined' && module.exports) module.exports = VoiceInput;
