'use strict';

/**
 * ImageHandler — Manages dynamic image attachments adapting to model vision capabilities.
 * Modelin Vision (görsel) desteğine göre dinamik görsel yükleme ve doğrulama yöneticisi.
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
   * @param {HTMLElement} [options.attachBtn] - Upload button
   * @param {HTMLInputElement} [options.fileInput] - Hidden file input element
   * @param {HTMLElement} options.dropTarget - Drag and drop zone target
   * @param {HTMLElement} [options.pasteTarget] - Target element for paste events
   * @param {Function} [options.onImageChanged] - Callback on image change
   * @param {Function} [options.onWarning] - Warning notification callback
   * @param {Function} [options.onError] - Error notification callback
   */
  constructor({ previewEl, imgEl, removeBtn, attachBtn, fileInput, dropTarget, pasteTarget, onImageChanged, onWarning, onError }) {
    this.previewEl = previewEl;
    this.imgEl = imgEl;
    this.removeBtn = removeBtn;
    this.attachBtn = attachBtn;
    this.fileInput = fileInput;
    this.dropTarget = dropTarget;
    this.pasteTarget = pasteTarget || (typeof window !== 'undefined' ? window : null);
    this.onImageChanged = onImageChanged;
    this.onWarning = onWarning;
    this.onError = onError;

    this.currentImage = null; // { mimeType, base64, name }
    this.modelConfig = {
      supportsVision: true,
      maxImagesAllowed: 1
    };

    this.initListeners();
  }

  /**
   * Updates current model configuration and synchronizes attachment UI.
   * @param {object} config - { supportsVision: boolean, maxImagesAllowed: number }
   */
  setModelConfig(config = {}) {
    this.modelConfig = {
      supportsVision: config.supportsVision !== false,
      maxImagesAllowed: typeof config.maxImagesAllowed === 'number' ? config.maxImagesAllowed : 1
    };

    if (!this.modelConfig.supportsVision) {
      if (this.currentImage) {
        this.clearImage();
        const warnMsg = typeof i18n !== 'undefined'
          ? i18n.t('card.modelNoVisionWarning')
          : 'Seçilen model görsel desteklemiyor. Eklenen görsel kaldırıldı.';
        this.notifyWarning(warnMsg);
      }
      this.updateButtonState(false, 'card.attachImageDisabledNoVision');
    } else {
      const isLimitReached = !!(this.currentImage && this.modelConfig.maxImagesAllowed <= 1);
      this.updateButtonState(!isLimitReached, isLimitReached ? 'card.imageLimitReached' : 'card.btnAttachImage');
    }
  }

  updateButtonState(enabled, i18nKey) {
    if (!this.attachBtn) return;
    this.attachBtn.disabled = !enabled;
    this.attachBtn.classList.toggle('disabled', !enabled);
    const title = typeof i18n !== 'undefined' && i18n.t(i18nKey)
      ? i18n.t(i18nKey)
      : (enabled ? 'Görsel Yükle' : 'Görsel desteklenmiyor');
    this.attachBtn.title = title;
    if (this.fileInput) {
      this.fileInput.disabled = !enabled;
    }
  }

  initListeners() {
    if (this.removeBtn) {
      this.removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.clearImage();
      });
    }

    if (this.dropTarget) {
      ['dragenter', 'dragover'].forEach((ev) => {
        this.dropTarget.addEventListener(ev, (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.modelConfig.supportsVision && !this.currentImage) {
            this.dropTarget.classList.add('drag-over');
          }
        });
      });

      ['dragleave', 'drop'].forEach((ev) => {
        this.dropTarget.addEventListener(ev, (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.dropTarget.classList.remove('drag-over');
        });
      });

      this.dropTarget.addEventListener('drop', (e) => {
        if (!this.modelConfig.supportsVision) {
          this.notifyWarning(
            typeof i18n !== 'undefined'
              ? i18n.t('card.modelNoVisionDropBlocked')
              : 'Mevcut model görsel girişini desteklemiyor.'
          );
          return;
        }
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          this.handleFile(files[0]);
        }
      });
    }

    if (this.pasteTarget) {
      this.pasteTarget.addEventListener('paste', (e) => this.handlePaste(e));
    }
  }

  handlePaste(e) {
    const cd = e.clipboardData;
    if (!cd) return false;
    const items = cd.items;
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            this.handleFile(file);
            return true;
          }
        }
      }
    }
    return false;
  }

  handleFile(file) {
    if (!file) return;

    if (!this.modelConfig.supportsVision) {
      this.notifyWarning(
        typeof i18n !== 'undefined'
          ? i18n.t('card.modelNoVisionWarning')
          : 'Seçilen model görsel desteklemiyor.'
      );
      return;
    }

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
        if (this.currentImage && this.currentImage.base64 === match[2]) {
          this.notifyWarning(
            typeof i18n !== 'undefined' ? i18n.t('card.duplicateImageWarning') : 'Bu görsel zaten eklenmiş.'
          );
          return;
        }
        this.setImage({ mimeType: match[1], base64: match[2], name: file.name });
      } else {
        this.notifyError(
          typeof i18n !== 'undefined' ? i18n.t('card.imageReadError') : 'Görsel okunamadı.'
        );
      }
    };
    reader.readAsDataURL(file);
  }

  setImage(img) {
    this.currentImage = img;
    if (img && this.previewEl && this.imgEl) {
      this.imgEl.src = `data:${img.mimeType};base64,${img.base64}`;
      this.previewEl.hidden = false;
    } else if (this.previewEl) {
      this.previewEl.hidden = true;
      if (this.imgEl) this.imgEl.src = '';
    }

    if (this.modelConfig.supportsVision) {
      const isLimitReached = !!(this.currentImage && this.modelConfig.maxImagesAllowed <= 1);
      this.updateButtonState(!isLimitReached, isLimitReached ? 'card.imageLimitReached' : 'card.btnAttachImage');
    }

    if (typeof this.onImageChanged === 'function') {
      this.onImageChanged(this.currentImage);
    }
  }

  clearImage() {
    this.setImage(null);
  }

  getImage() {
    return this.currentImage;
  }

  notifyWarning(msg) {
    if (typeof this.onWarning === 'function') this.onWarning(msg);
    else console.info('[ImageHandler]', msg);
  }

  notifyError(msg) {
    if (typeof this.onError === 'function') this.onError(msg);
    else console.warn('[ImageHandler]', msg);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ImageHandler;
}
