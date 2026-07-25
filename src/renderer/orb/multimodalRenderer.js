'use strict';

/**
 * MultimodalRenderer - Renders multimodal AI outputs (images, base64 media, files).
 * AI modellerinden gelen görsel ve dosya türlerini işleyen ve gösteren modüler sınıf.
 */
class MultimodalRenderer {
  /**
   * @param {Object} options
   * @param {Function} [options.onSaveImage] - Custom image save handler
   */
  constructor(options = {}) {
    this.onSaveImage = options.onSaveImage || null;
  }

  /**
   * Parses content and renders inline images and media cards into target container.
   * Metin içeriğini işler, görselleri ve medya kartlarını DOM'a yerleştirir.
   * @param {HTMLElement} container
   * @param {string} content
   */
  render(container, content) {
    if (!container) return;
    container.innerHTML = '';
    const text = String(content || '').trim();
    if (!text) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = (typeof i18n !== 'undefined' ? i18n.t('card.emptyPrompt') : 'Üretilen yanıt burada belirecek.');
      container.appendChild(empty);
      return;
    }

    // Markdown image and base64 regex matching: ![alt](src) or raw data URIs
    const imgRegex = /!\[([^\]]*)\]\(((?:data:image\/[a-zA-Z0-9+\/=+]+;base64,|https?:\/\/|file:\/\/\/)[^\s)]+)\)/g;
    let lastIndex = 0;
    let match;
    let hasImage = false;

    const wrapper = document.createElement('div');
    wrapper.className = 'multimodal-wrapper';

    while ((match = imgRegex.exec(text)) !== null) {
      hasImage = true;
      const preText = text.slice(lastIndex, match.index);
      if (preText) {
        wrapper.appendChild(this.createTextBlock(preText));
      }

      const altText = match[1] || 'AI Generated Image';
      const imgSrc = match[2];
      wrapper.appendChild(this.createImageCard(imgSrc, altText));

      lastIndex = imgRegex.lastIndex;
    }

    const remainingText = text.slice(lastIndex);
    if (remainingText) {
      wrapper.appendChild(this.createTextBlock(remainingText));
    }

    // If no markdown image tag was used but text contains a standalone data:image URI
    if (!hasImage && text.includes('data:image/')) {
      const dataUriMatch = text.match(/(data:image\/[a-zA-Z0-9+\/=+]+;base64,[A-Za-z0-9+/=]+)/);
      if (dataUriMatch) {
        wrapper.appendChild(this.createImageCard(dataUriMatch[1], 'AI Image Output'));
      }
    }

    container.appendChild(wrapper);
  }

  /**
   * Creates a text container for formatted text.
   * @param {string} text
   * @returns {HTMLElement}
   */
  createTextBlock(text) {
    const el = document.createElement('div');
    el.className = 'text-block';
    el.style.cssText = 'white-space: pre-wrap; word-break: break-word;';
    el.textContent = text;
    return el;
  }

  /**
   * Creates a media card for AI-generated images with zoom & save actions.
   * AI tarafından üretilen görseller için medya kartı oluşturur.
   * @param {string} src
   * @param {string} alt
   * @returns {HTMLElement}
   */
  createImageCard(src, alt) {
    const card = document.createElement('div');
    card.className = 'ai-media-card';
    card.style.cssText = 'margin: 8px 0; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--border-color, #2a2d3d); border-radius: 10px; display: flex; flex-direction: column; gap: 6px;';

    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    img.style.cssText = 'max-width: 100%; max-height: 320px; object-fit: contain; border-radius: 6px; cursor: pointer; transition: transform 0.2s ease;';
    img.addEventListener('click', () => {
      window.open(src, '_blank');
    });

    const metaRow = document.createElement('div');
    metaRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--txt-dim, #8e93a6);';

    const caption = document.createElement('span');
    caption.textContent = `🖼️ ${alt}`;

    const saveBtn = document.createElement('button');
    saveBtn.className = 'link';
    saveBtn.style.cssText = 'padding: 2px 8px; font-size: 11px; cursor: pointer;';
    saveBtn.textContent = '💾 Görseli Kaydet';
    saveBtn.addEventListener('click', () => {
      if (this.onSaveImage) {
        this.onSaveImage(src, alt);
      } else {
        const a = document.createElement('a');
        a.href = src;
        a.download = `sparky-ai-media-${Date.now()}.png`;
        a.click();
      }
    });

    metaRow.append(caption, saveBtn);
    card.append(img, metaRow);
    return card;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MultimodalRenderer;
}
