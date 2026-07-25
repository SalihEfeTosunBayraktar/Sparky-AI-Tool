'use strict';

/**
 * TokenTracker - Tracks last request and accumulated session token usage in Sparky AI.
 * Tek görevli, modüler token takip sınıfı.
 */
class TokenTracker {
  constructor() {
    this.sessionTotal = 0;
    this.lastRequestTokens = 0;
  }

  /**
   * Calculates or accepts token usage and updates accumulated session metrics.
   * Token kullanımını günceller ve oturum toplamına ekler.
   * @param {Object} params
   * @param {number} [params.totalTokens] - Exact total tokens from API usage
   * @param {string} [params.input] - Raw input text for fallback estimation
   * @param {string} [params.output] - Output text for fallback estimation
   * @returns {{ lastTokens: number, sessionTotal: number }}
   */
  record({ totalTokens, input = '', output = '' } = {}) {
    let tokens = 0;
    if (typeof totalTokens === 'number' && Number.isFinite(totalTokens) && totalTokens > 0) {
      tokens = Math.round(totalTokens);
    } else {
      // Fallback token estimation (~3.8 chars per token)
      const inputLen = String(input || '').length;
      const outputLen = String(output || '').length;
      const estPrompt = Math.ceil(inputLen / 3.8);
      const estComp = Math.ceil(outputLen / 3.8);
      tokens = Math.max(0, estPrompt + estComp);
    }

    this.lastRequestTokens = tokens;
    this.sessionTotal += tokens;

    return {
      lastTokens: this.lastRequestTokens,
      sessionTotal: this.sessionTotal
    };
  }

  /**
   * Returns current token usage stats.
   * @returns {{ lastTokens: number, sessionTotal: number }}
   */
  getStats() {
    return {
      lastTokens: this.lastRequestTokens,
      sessionTotal: this.sessionTotal
    };
  }

  /**
   * Resets session counters.
   */
  reset() {
    this.sessionTotal = 0;
    this.lastRequestTokens = 0;
    return this.getStats();
  }
}

module.exports = TokenTracker;
