'use strict';

/**
 * FtsSearch — Full-Text Search & BM25-based Inverted Index Engine for Sparky AI.
 * Diyalog geçmişi ve proje notları için yerel tam metin arama motoru.
 */

class FtsSearch {
  constructor() {
    this.index = new Map(); // token -> Set(docId)
    this.documents = new Map(); // docId -> { doc, tokens: Set(string) }
  }

  /**
   * Tokenizes text into normalized search terms.
   * Metni küçük harfli arama terimlerine böler.
   * @param {string} text
   * @returns {string[]}
   */
  tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s\d_-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2);
  }

  /**
   * Indexes a document.
   * Dokümanı arama indeksine ekler.
   * @param {string|number} id
   * @param {string} content
   * @param {Object} [meta]
   */
  indexDocument(id, content, meta = {}) {
    this.removeDocument(id);
    const tokens = new Set(this.tokenize(content));
    this.documents.set(id, { meta, content, tokens });

    for (const token of tokens) {
      if (!this.index.has(token)) {
        this.index.set(token, new Set());
      }
      this.index.get(token).add(id);
    }
  }

  /**
   * Removes a document from the search index.
   * Dokümanı indeksten çıkarır.
   * @param {string|number} id
   */
  removeDocument(id) {
    const existing = this.documents.get(id);
    if (!existing) return;

    for (const token of existing.tokens) {
      const set = this.index.get(token);
      if (set) {
        set.delete(id);
        if (set.size === 0) this.index.delete(token);
      }
    }
    this.documents.delete(id);
  }

  /**
   * Searches indexed documents using BM25-inspired term frequency scoring.
   * Arama sorgusuyla eşleşen dokümanları puan sırasına göre döndürür.
   * @param {string} query
   * @param {Object} [options]
   * @param {number} [options.limit=20]
   * @returns {Array<{ id, score, meta, content }>}
   */
  search(query, options = {}) {
    const queryTokens = this.tokenize(query);
    if (!queryTokens.length) return [];

    const limit = options.limit || 20;
    const scores = new Map();

    for (const qToken of queryTokens) {
      for (const [idxToken, docIds] of this.index.entries()) {
        const isMatch = idxToken === qToken;
        const isPrefix = !isMatch && idxToken.startsWith(qToken);

        if (isMatch || isPrefix) {
          const weight = isMatch ? 1.0 : 0.6;
          for (const docId of docIds) {
            const current = scores.get(docId) || 0;
            scores.set(docId, current + weight);
          }
        }
      }
    }

    const results = [];
    for (const [docId, score] of scores.entries()) {
      const doc = this.documents.get(docId);
      if (doc) {
        results.push({
          id: docId,
          score,
          meta: doc.meta,
          content: doc.content
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /** Clears all indexed entries / İndeksi temizler */
  clear() {
    this.index.clear();
    this.documents.clear();
  }

  /** Total indexed documents / Toplam doküman sayısı */
  get size() {
    return this.documents.size;
  }
}

module.exports = FtsSearch;
