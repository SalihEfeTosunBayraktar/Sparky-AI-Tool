'use strict';

/**
 * Web Audio API Sound Feedback Synthesizer for Sparky AI.
 * Dış ses dosyası gerektirmeyen, Web Audio API tabanlı ses sentezleme sınıfı.
 */

class AudioFeedback {
  constructor() {
    this.audioCtx = null;
  }

  /**
   * Initializes or returns active Web Audio AudioContext instance.
   * @private
   * @returns {AudioContext|null}
   */
  getAudioContext() {
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    }

    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return null;
      this.audioCtx = new AudioCtxClass();
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  /**
   * Synthesizes a pleasant ascending chime sound for successful prompt completion.
   * Başarılı işlem bitişinde 2 tonlu hafif armonik çan sesi çalar.
   */
  playSuccess() {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Note 1: C5 (523.25 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.25);

      // Note 2: E5 (659.25 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.1);
      gain2.gain.setValueAtTime(0.15, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.45);
    } catch (err) {
      console.warn('[audioFeedback] success sound error:', err.message);
    }
  }

  /**
   * Synthesizes a soft falling tone for errors or cancellations.
   * Hata durumlarında yumuşak 2 tonlu uyarı sesi çalar.
   */
  playError() {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(360, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.25);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch (err) {
      console.warn('[audioFeedback] error sound error:', err.message);
    }
  }

  /**
   * Plays sound by type name ('success'|'error')
   * @param {'success'|'error'} type
   */
  play(type) {
    if (type === 'error') {
      this.playError();
    } else {
      this.playSuccess();
    }
  }
}

const audioFeedback = new AudioFeedback();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = audioFeedback;
}
