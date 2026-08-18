'use strict';

/**
 * VoiceInput — Real-Time Voice Speech-to-Text (STT) Controller for Sparky AI.
 * Web Speech API ve Whisper uyumlu mikrofon ses tanıma yöneticisi.
 */

class VoiceInput {
  /**
   * @param {Object} [options]
   * @param {Function} [options.onResult] - Callback with transcribed text (text, isFinal)
   * @param {Function} [options.onStateChange] - Callback with state ('idle'|'listening'|'processing'|'error')
   * @param {Function} [options.onError] - Callback with error details
   * @param {string} [options.lang='tr-TR'] - Default language code
   */
  constructor(options = {}) {
    this.onResult = options.onResult || null;
    this.onStateChange = options.onStateChange || null;
    this.onError = options.onError || null;
    this.lang = options.lang || 'tr-TR';
    this.state = 'idle'; // 'idle' | 'listening' | 'processing' | 'error'
    this.recognition = null;
    this.initRecognition();
  }

  /** Checks if speech recognition is available in the current runtime */
  static isSupported() {
    if (typeof window === 'undefined') return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  initRecognition() {
    if (!VoiceInput.isSupported()) return;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRec();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.lang;

    this.recognition.onstart = () => {
      this.setState('listening');
    };

    this.recognition.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (typeof this.onResult === 'function') {
        const text = final || interim;
        const isFinal = !!final;
        if (text) this.onResult(text.trim(), isFinal);
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('[VoiceInput] Recognition error:', event.error);
      this.setState('error');
      if (typeof this.onError === 'function') {
        this.onError(event.error);
      }
      this.stop();
    };

    this.recognition.onend = () => {
      if (this.state === 'listening') {
        this.setState('idle');
      }
    };
  }

  setLanguage(langCode) {
    this.lang = langCode === 'tr' ? 'tr-TR' : 'en-US';
    if (this.recognition) {
      this.recognition.lang = this.lang;
    }
  }

  setState(newState) {
    this.state = newState;
    if (typeof this.onStateChange === 'function') {
      this.onStateChange(this.state);
    }
  }

  start() {
    if (!this.recognition) {
      this.initRecognition();
    }
    if (!this.recognition) {
      if (typeof this.onError === 'function') this.onError('not-supported');
      return false;
    }

    try {
      this.recognition.start();
      return true;
    } catch (err) {
      console.warn('[VoiceInput] Start error:', err.message);
      return false;
    }
  }

  stop() {
    if (this.recognition && this.state === 'listening') {
      try {
        this.recognition.stop();
      } catch {}
    }
    this.setState('idle');
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
