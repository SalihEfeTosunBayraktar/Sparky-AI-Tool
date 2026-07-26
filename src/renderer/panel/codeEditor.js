'use strict';

/**
 * CodeEditor — hafif, bağımlılıksız "sözdizimi vurgulu textarea" bileşeni.
 * Mod kurallarındaki {{DEĞİŞKEN}} ifadelerini canlı renklendirir, üzerine
 * gelince açıklama balonu gösterir, "{{" yazılınca otomatik tamamlama menüsü
 * açar ve genişlet butonuyla ortalanmış bir modal editöre büyür.
 *
 * Teknik: gerçek <textarea> tamamen şeffaf tutulup (sadece imleç görünür),
 * arkasına AYNI font/boşluk ile bir <pre><code> katmanı yerleştirilir; o
 * katman {{TOKEN}} eşleşmelerini <span class="var-token"> ile boyar. İkisi
 * piksel piksel üst üste bindiği için kullanıcı "vurgulanmış" yazıyor gibi
 * görür, ama gerçek düzenleme native textarea'da olur (IME, undo/redo,
 * kopyala/yapıştır, erişilebilirlik hep native).
 */

const CODE_EDITOR_TOKEN_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

function ceEscapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// textarea içinde verilen karakter konumunun piksel koordinatını bulur
// (görünmez bir "ayna" div'e aynı metni yazıp bir işaretçi span'ının
// konumunu ölçerek — tarayıcıların textarea'da native olarak vermediği
// "imleç nerede" bilgisini bu şekilde elde ediyoruz).
function ceCaretRect(textarea, position) {
  const style = getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const props = [
    'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'tabSize'
  ];
  for (const p of props) mirror.style[p] = style[p];
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.top = '0';
  mirror.style.left = '-99999px';
  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  const offsetTop = markerRect.top - mirrorRect.top;
  const offsetLeft = markerRect.left - mirrorRect.left;
  const lineHeight = markerRect.height;
  document.body.removeChild(mirror);

  const taRect = textarea.getBoundingClientRect();
  return {
    top: taRect.top + offsetTop - textarea.scrollTop + lineHeight,
    left: taRect.left + offsetLeft - textarea.scrollLeft
  };
}

function ceDebounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

let ceInstanceSeq = 0;

class CodeEditor {
  /**
   * @param {HTMLTextAreaElement} textarea Zaten DOM'da olan boş/dolu bir textarea.
   * @param {object} [opts]
   * @param {() => Array<{key:string,type:string,description:string}>} [opts.getVariables]
   * @param {() => void} [opts.onChange] Kullanıcı yazdıkça (debounce'lu) çağrılır.
   * @param {boolean} [opts.inline] true ise kompakt tek satır yüksekliğiyle başlar
   *   (Ek Kurallar satırları) — Genişlet butonuyla yine tam modal editöre büyür.
   */
  constructor(textarea, opts = {}) {
    this.id = `ce${++ceInstanceSeq}`;
    this.textarea = textarea;
    this.getVariables = opts.getVariables || (() => []);
    this.onChange = opts.onChange || (() => {});
    this.inline = !!opts.inline;
    this.trigger = null; // aktif otomatik tamamlama tetikleyicisi: {start, query}
    this.activeIndex = 0;

    this._buildDom();
    this._bindEvents();
    this.highlight();
  }

  _buildDom() {
    const ta = this.textarea;
    const wrapper = document.createElement('div');
    wrapper.className = this.inline ? 'code-editor code-editor-inline' : 'code-editor';

    ta.parentNode.insertBefore(wrapper, ta);

    const backdrop = document.createElement('pre');
    backdrop.className = 'code-editor-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    const code = document.createElement('code');
    backdrop.appendChild(code);

    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'code-editor-expand-btn';
    expandBtn.title = 'Genişlet';
    expandBtn.setAttribute('aria-label', 'Genişlet / Daralt');
    expandBtn.textContent = '⤢';

    wrapper.appendChild(backdrop);
    wrapper.appendChild(ta);
    wrapper.appendChild(expandBtn);

    ta.classList.add('code-editor-input');
    ta.setAttribute('spellcheck', 'false');
    ta.setAttribute('aria-haspopup', 'listbox');
    ta.setAttribute('autocomplete', 'off');

    this.wrapper = wrapper;
    this.backdrop = backdrop;
    this.code = code;
    this.expandBtn = expandBtn;

    expandBtn.addEventListener('click', () => this.toggleExpand());
  }

  _bindEvents() {
    const ta = this.textarea;
    const scheduleHighlight = ceDebounce(() => {
      this.highlight();
      this.onChange();
    }, 150);

    ta.addEventListener('input', () => {
      this._updateTrigger();
      scheduleHighlight();
    });
    ta.addEventListener('scroll', () => this._syncScroll());
    ta.addEventListener('keydown', (e) => this._onKeyDown(e));
    ta.addEventListener('blur', () => {
      // Tıklama ile menüden seçim yapılabilsin diye küçük bir gecikmeyle kapat.
      setTimeout(() => this._closeAutocomplete(), 120);
    });
    ta.addEventListener('mousemove', (e) => this._onHoverMove(e));
    ta.addEventListener('mouseleave', () => this._hideTooltip());
    ta.addEventListener('click', () => this._updateTrigger());
  }

  // ---- Sözdizimi vurgulama -------------------------------------------

  highlight() {
    const text = this.textarea.value;
    const html = ceEscapeHtml(text).replace(
      /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
      (m, key) => `<span class="var-token" data-key="${key.toUpperCase()}">${ceEscapeHtml(m)}</span>`
    );
    // Textarea son satırda boşsa <pre> onu kırpar; kaydırma hizası kaymasın
    // diye sona her zaman bir satır sonu ekliyoruz.
    this.code.innerHTML = html + '\n';
    this._syncScroll();
  }

  _syncScroll() {
    this.backdrop.scrollTop = this.textarea.scrollTop;
    this.backdrop.scrollLeft = this.textarea.scrollLeft;
  }

  // ---- Değişken tooltip'i ---------------------------------------------

  _onHoverMove(e) {
    const spans = this.backdrop.querySelectorAll('.var-token');
    let hit = null;
    for (const span of spans) {
      const r = span.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        hit = span;
        break;
      }
    }
    if (hit) this._showTooltip(hit);
    else this._hideTooltip();
  }

  _showTooltip(span) {
    const key = span.dataset.key;
    const info = this.getVariables().find((v) => v.key.toUpperCase() === key);
    let tip = this._tooltipEl;
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'var-tooltip';
      document.body.appendChild(tip);
      this._tooltipEl = tip;
    }
    tip.innerHTML = info
      ? `<span class="var-tooltip-key">{{${info.key}}}</span><span class="var-tooltip-type">${ceEscapeHtml(info.type)}</span><div class="var-tooltip-desc">${ceEscapeHtml(info.description)}</div>`
      : `<span class="var-tooltip-key">{{${ceEscapeHtml(key)}}}</span><div class="var-tooltip-desc">Tanımsız değişken.</div>`;
    const r = span.getBoundingClientRect();
    tip.style.left = `${r.left}px`;
    tip.style.top = `${r.bottom + 6}px`;
    requestAnimationFrame(() => tip.classList.add('visible'));
  }

  _hideTooltip() {
    if (this._tooltipEl) this._tooltipEl.classList.remove('visible');
  }

  // ---- Otomatik tamamlama ({{  ) ---------------------------------------

  _updateTrigger() {
    const val = this.textarea.value;
    const pos = this.textarea.selectionStart;
    const uptoCaret = val.slice(0, pos);
    const lastOpen = uptoCaret.lastIndexOf('{{');
    if (lastOpen === -1) {
      this._closeAutocomplete();
      return;
    }
    const between = uptoCaret.slice(lastOpen + 2);
    if (between.includes('}}') || between.includes('\n') || /\s{2,}/.test(between)) {
      this._closeAutocomplete();
      return;
    }
    this.trigger = { start: lastOpen, query: between.trim().toUpperCase() };
    this._openAutocomplete();
  }

  _matchingVariables() {
    const q = this.trigger ? this.trigger.query : '';
    return this.getVariables().filter((v) => !q || v.key.toUpperCase().startsWith(q));
  }

  _openAutocomplete() {
    const matches = this._matchingVariables();
    if (!matches.length) {
      this._closeAutocomplete();
      return;
    }
    let list = this._acEl;
    if (!list) {
      list = document.createElement('div');
      list.className = 'autocomplete-dropdown';
      list.setAttribute('role', 'listbox');
      document.body.appendChild(list);
      this._acEl = list;
    }
    this.activeIndex = 0;
    this._renderAutocomplete(matches);

    const pos = this.textarea.selectionStart;
    const rect = ceCaretRect(this.textarea, pos);
    list.style.left = `${rect.left}px`;
    list.style.top = `${rect.top}px`;
    list.hidden = false;
  }

  _renderAutocomplete(matches) {
    const list = this._acEl;
    if (!list) return;
    list.innerHTML = matches
      .map(
        (v, i) => `
          <div class="autocomplete-item${i === this.activeIndex ? ' active' : ''}" role="option" aria-selected="${i === this.activeIndex}" data-key="${v.key}">
            <span class="autocomplete-key">{{${v.key}}}</span>
            <span class="autocomplete-desc">${ceEscapeHtml(v.description)}</span>
          </div>
        `
      )
      .join('');
    for (const item of list.querySelectorAll('.autocomplete-item')) {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this._insertVariable(item.dataset.key);
      });
    }
  }

  _closeAutocomplete() {
    this.trigger = null;
    if (this._acEl) this._acEl.hidden = true;
  }

  _onKeyDown(e) {
    if (!this._acEl || this._acEl.hidden) return;
    const matches = this._matchingVariables();
    if (!matches.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.activeIndex = (this.activeIndex + 1) % matches.length;
      this._renderAutocomplete(matches);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.activeIndex = (this.activeIndex - 1 + matches.length) % matches.length;
      this._renderAutocomplete(matches);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      this._insertVariable(matches[this.activeIndex].key);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this._closeAutocomplete();
    }
  }

  _insertVariable(key) {
    if (!this.trigger) return;
    const ta = this.textarea;
    const val = ta.value;
    const pos = ta.selectionStart;
    const before = val.slice(0, this.trigger.start);
    const after = val.slice(pos);
    const inserted = `{{${key}}}`;
    ta.value = before + inserted + after;
    const newPos = before.length + inserted.length;
    ta.setSelectionRange(newPos, newPos);
    this._closeAutocomplete();
    this.highlight();
    this.onChange();
    ta.focus();
  }

  // ---- Genişlet / modal ------------------------------------------------

  toggleExpand() {
    if (this.wrapper.classList.contains('expanded')) this.collapse();
    else this.expand();
  }

  expand() {
    if (this.wrapper.classList.contains('expanded')) return;
    this._originalParent = this.wrapper.parentNode;
    this._originalNext = this.wrapper.nextSibling;

    let scrim = document.getElementById('codeEditorScrim');
    if (!scrim) {
      scrim = document.createElement('div');
      scrim.id = 'codeEditorScrim';
      scrim.className = 'code-editor-scrim';
      document.body.appendChild(scrim);
    }
    scrim.hidden = false;
    scrim.onclick = () => this.collapse();

    document.body.appendChild(this.wrapper);
    this.wrapper.classList.add('expanded');
    this.expandBtn.textContent = '✕';
    this.expandBtn.title = 'Daralt';
    document.querySelector('.modal-shell')?.classList.add('blur-behind');
    this.textarea.focus();
  }

  collapse() {
    if (!this.wrapper.classList.contains('expanded')) return;
    this.wrapper.classList.remove('expanded');
    this.expandBtn.textContent = '⤢';
    this.expandBtn.title = 'Genişlet';
    if (this._originalParent) {
      if (this._originalNext) this._originalParent.insertBefore(this.wrapper, this._originalNext);
      else this._originalParent.appendChild(this.wrapper);
    }
    const scrim = document.getElementById('codeEditorScrim');
    if (scrim) scrim.hidden = true;
    document.querySelector('.modal-shell')?.classList.remove('blur-behind');
  }

  // Programatik olarak .value değiştiğinde (kullanıcı yazmadan) çağrılmalı.
  refresh() {
    this.highlight();
  }

  // Satır listesi yeniden çizilecekse (rulesList.innerHTML = ...) önce
  // çağrılmalı — genişletilmişse zararsızca daraltır, DOM'u yetim bırakmaz.
  destroy() {
    this.collapse();
    if (this._tooltipEl) this._tooltipEl.remove();
    if (this._acEl) this._acEl.remove();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CodeEditor;
}
