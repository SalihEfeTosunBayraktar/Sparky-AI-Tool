'use strict';

/**
 * Image attachment, drag-and-drop, and Ctrl+V paste handler for Sparky AI.
 * Görsel yükleme, önizleme, drag-drop ve Ctrl+V yapıştırma işlemlerini yöneten modül.
 */

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif'
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB limit

class ImageHandler {
  /**
   * @param {object} options
   * @param {HTMLElement} options.previewEl - Thumbnail container element
   * @param {HTMLElement} options.imgEl - Thumbnail image element
   * @param {HTMLElement} options.removeBtn - Remove image button element
   * @param {HTMLElement} options.dropTarget - Drag and drop zone target
   * @param {HTMLElement} [options.pasteTarget] - Target element to listen paste events
   * @param {Function} [options.onImageChanged] - Callback when image state changes
   * @param {Function} [options.onError] - Error notification callback
   */
  constructor({ previewEl, imgEl, removeBtn, dropTarget, pasteTarget, onImageChanged, onError }) {
    this.previewEl = previewEl;
    this.imgEl = imgEl;
    this.removeBtn = removeBtn;
    this.dropTarget = dropTarget;
    this.pasteTarget = pasteTarget || window;
    this.onImageChanged = onImageChanged;
    this.onError = onError;

    this.currentImage = null; // { mimeType, base64 }

    this.initListeners();
  }

  /** Initialize DOM event listeners for drag-drop and paste */
  initListeners() {
    if (this.removeBtn) {
      this.removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.clearImage();
      });
    }

    if (this.dropTarget) {
      ['dragenter', 'dragover'].forEach((eventName) => {
        this.dropTarget.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.dropTarget.classList.add('drag-over');
        });
      });

      ['dragleave', 'drop'].forEach((eventName) => {
        this.dropTarget.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.dropTarget.classList.remove('drag-over');
        });
      });

      this.dropTarget.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt ? dt.files : null;
        if (files && files.length > 0) {
          this.handleFile(files[0]);
        }
      });
    }

    if (this.pasteTarget) {
      this.pasteTarget.addEventListener('paste', (e) => this.handlePaste(e));
    }
  }

  /**
   * Handles paste event and extracts image from clipboard data.
   * @param {ClipboardEvent} e
   */
  handlePaste(e) {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return false;

    // 1) Try items first (for raw image data like screenshots)
    const items = clipboardData.items;
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            this.handleFile(file);
            return true;
          }
        }
      }
    }

    // 2) Try files fallback
    const files = clipboardData.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        if (files[i].type && files[i].type.startsWith('image/')) {
          e.preventDefault();
          this.handleFile(files[i]);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Validates file format/size and converts to base64 payload.
   * @param {File} file
   */
  handleFile(file) {
    if (!file) return;

    const mimeType = (file.type || '').toLowerCase();
    if (!mimeType.startsWith('image/') || !ALLOWED_MIME_TYPES.has(mimeType)) {
      this.notifyError(
        typeof i18n !== 'undefined'
          ? i18n.t('card.invalidImageFormat')
          : 'Yalnızca desteklenen resim dosyalarını yükleyebilirsiniz (PNG, JPG, WEBP, GIF).'
      );
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      this.notifyError(
        typeof i18n !== 'undefined'
          ? i18n.t('card.imageSizeTooLarge')
          : 'Görsel boyutu çok büyük (Maksimum 10 MB).'
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const match = dataUrl.match(/^data:(image\/[a-zA-Z+-]+);base64,(.+)$/);
      if (match) {
        this.setImage({ mimeType: match[1], base64: match[2] });
      } else {
        this.notifyError(
          typeof i18n !== 'undefined'
            ? i18n.t('card.imageReadError')
            : 'Görsel okunamadı, lütfen başka bir dosya deneyin.'
        );
      }
    };
    reader.onerror = () => {
      this.notifyError(
        typeof i18n !== 'undefined'
          ? i18n.t('card.imageReadError')
          : 'Görsel yüklenirken bir hata oluştu.'
      );
    };
    reader.readAsDataURL(file);
  }

  /** Notify error via callback */
  notifyError(msg) {
    if (typeof this.onError === 'function') {
      this.onError(msg);
    } else {
      console.warn('[ImageHandler]', msg);
    }
  }

  /**
   * Sets current image payload and updates UI preview.
   * @param {object|null} img - { mimeType, base64 }
   */
  setImage(img) {
    this.currentImage = img;
    if (img && this.previewEl && this.imgEl) {
      this.imgEl.src = `data:${img.mimeType};base64,${img.base64}`;
      this.previewEl.hidden = false;
    } else if (this.previewEl) {
      this.previewEl.hidden = true;
      if (this.imgEl) this.imgEl.src = '';
    }

    if (typeof this.onImageChanged === 'function') {
      this.onImageChanged(this.currentImage);
    }
  }

  /** Clears attached image */
  clearImage() {
    this.setImage(null);
  }

  /** Gets current attached image data */
  getImage() {
    return this.currentImage;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ImageHandler;
}
