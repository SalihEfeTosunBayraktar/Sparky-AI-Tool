'use strict';

/**
 * Image attachment & drag-and-drop handler module for Sparky AI renderer orb.
 * Görsel yükleme, önizleme ve drag-drop işlemlerini yöneten sınıf.
 */
class ImageHandler {
  /**
   * @param {object} options
   * @param {HTMLElement} options.previewEl - Thumbnail container element
   * @param {HTMLElement} options.imgEl - Thumbnail image element
   * @param {HTMLElement} options.removeBtn - Remove image button element
   * @param {HTMLElement} options.dropTarget - Drag and drop zone target
   * @param {Function} [options.onImageChanged] - Callback when image state changes
   */
  constructor({ previewEl, imgEl, removeBtn, dropTarget, onImageChanged }) {
    this.previewEl = previewEl;
    this.imgEl = imgEl;
    this.removeBtn = removeBtn;
    this.dropTarget = dropTarget;
    this.onImageChanged = onImageChanged;

    this.currentImage = null; // { mimeType, base64 }

    this.initListeners();
  }

  /** Initialize DOM event listeners for drag-drop and file selection */
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
  }

  /**
   * Processes file object and converts to base64.
   * @param {File} file
   */
  handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const match = dataUrl.match(/^data:(image\/[a-zA-Z+-]+);base64,(.+)$/);
      if (match) {
        this.setImage({ mimeType: match[1], base64: match[2] });
      }
    };
    reader.readAsDataURL(file);
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
