'use strict';

/**
 * Project Management UI controller for Settings Panel.
 * Ayarlar Paneli Projeler sekmesi arayüz yöneticisi.
 */

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

class ProjectUI {
  constructor(api, i18n) {
    this.api = api;
    this.i18n = i18n;
    this.activeEditingId = null;
    this.initialized = false;
  }

  ensureSkeleton() {
    const container = document.getElementById('projectsContainer');
    if (!container || document.getElementById('projectSelect')) return;

    container.innerHTML = `
      <div class="projects-wrapper">
        <!-- Proje Seçim ve Yönetim Üst Barı -->
        <div class="projects-topbar">
          <select id="projectSelect" class="project-select"></select>
          <button id="btnNewProject" class="btn primary" data-i18n="projects.chipNewProject">+ Yeni Proje</button>
        </div>

        <div id="noProjectSelectedNote" class="card empty-note" hidden data-i18n="projects.noProjectsYet">
          Henüz proje oluşturulmadı. Yeni bir proje ekleyerek başlayın.
        </div>

        <!-- Seçili Proje Düzenleme Kartı -->
        <div id="projectForm" class="card project-card" hidden>
          <div class="field">
            <label for="projectName" data-i18n="projects.nameLabel">Proje Adı</label>
            <div class="inline">
              <input id="projectName" type="text" placeholder="Proje Adı" data-i18n-placeholder="projects.namePlaceholder" />
              <button id="btnSetActiveProject" class="btn primary" data-i18n="projects.setActiveBtn">Aktif Yap</button>
              <button id="btnSaveProject" class="btn" data-i18n="projects.saveBtn">Kaydet</button>
              <button id="btnDeleteProject" class="btn danger" data-i18n="projects.deleteBtn">Sil</button>
            </div>
          </div>

          <div class="field">
            <label for="projectDesc" data-i18n="projects.descLabel">Açıklama / Bağlam</label>
            <input id="projectDesc" type="text" placeholder="Projenin kısa özeti veya amacı" data-i18n-placeholder="projects.descPlaceholder" />
          </div>

          <!-- Metin İçerikleri Bölümü -->
          <div class="project-sub-header">
            <span class="sub-title" data-i18n="projects.textsTitle">Metin İçerikleri & Bağlam</span>
            <button id="btnAddTextNote" class="btn" data-i18n="projects.addTextBtn">+ Metin Ekle</button>
          </div>
          <div id="projectTextsList" class="project-texts-list"></div>

          <!-- Görsel Bölümü -->
          <div class="project-sub-header" style="margin-top: 12px;">
            <span class="sub-title" data-i18n="projects.imagesTitle">Görsel Bölümü (Vision / Multimodal)</span>
            <input type="file" id="projImgFileInput" accept="image/*" hidden />
            <button id="btnAddProjImage" class="btn" data-i18n="projects.addImageBtn">📷 Görsel Yükle</button>
          </div>
          <div id="projectImagesGrid" class="project-images-grid"></div>
        </div>
      </div>
    `;

    if (typeof i18n !== 'undefined' && i18n.translateDOM) {
      i18n.translateDOM(container);
    }
    this.initEvents();
  }

  initEvents() {
    if (this.initialized) return;
    const $ = (id) => document.getElementById(id);

    // Başka bir projeye geçmeden önce ekrandaki taslağı kaydet — aksi halde
    // henüz "Kaydet"e basılmamış ad/açıklama sessizce kaybolur (bkz.
    // saveCurrentForm).
    $('projectSelect')?.addEventListener('change', async (e) => {
      await this.saveCurrentForm();
      this.activeEditingId = e.target.value;
      this.render();
    });

    $('btnNewProject')?.addEventListener('click', async () => {
      const p = await this.api.projects.create({
        name: this.i18n.t('projects.defaultName') || 'Yeni Proje',
        description: ''
      });
      this.activeEditingId = p.id;
      this.render();
    });

    $('btnSaveProject')?.addEventListener('click', async () => {
      await this.saveCurrentForm();
      this.render();
    });

    // Ad/Açıklama alanından odak ayrılınca da kaydet (metin notu satırlarının
    // zaten yaptığı gibi) — aksi halde ör. "+ Metin Ekle" veya "+ Görsel
    // Yükle" tıklaması, o an ekranda yazılı ama kaydedilmemiş başlık/açıklamayı
    // 'projects:changed' tetikleyip render() tüm formu diskten yeniden
    // çizdiğinde sessizce silerdi.
    $('projectName')?.addEventListener('change', () => this.saveCurrentForm());
    $('projectDesc')?.addEventListener('change', () => this.saveCurrentForm());

    // "Aktif Yap" da ekrandaki taslağı kaydeder ve proje zaten aktifken de
    // TIKLANABİLİR bırakılıyor — devre dışı bırakılırsa kullanıcı bu (görsel
    // olarak öne çıkan) büyük butona basıp hiçbir şey olmadığını görüyor ve
    // az önce yazdığı başlığın kaydedilip kaydedilmediğinden emin olamıyordu.
    $('btnSetActiveProject')?.addEventListener('click', async () => {
      if (!this.activeEditingId) return;
      await this.saveCurrentForm();
      await this.api.projects.setActive(this.activeEditingId);
      this.render();
    });

    $('btnDeleteProject')?.addEventListener('click', async () => {
      if (!this.activeEditingId) return;
      const next = await this.api.projects.remove(this.activeEditingId);
      this.activeEditingId = next;
      this.render();
    });

    $('btnAddTextNote')?.addEventListener('click', async () => {
      if (!this.activeEditingId) return;
      await this.api.projects.addText(this.activeEditingId, { title: 'Not', content: '' });
      this.render();
    });

    const fileInp = $('projImgFileInput');
    $('btnAddProjImage')?.addEventListener('click', () => fileInp?.click());
    fileInp?.addEventListener('change', (e) => {
      if (!this.activeEditingId || !e.target.files?.length) return;
      const file = e.target.files[0];
      const mime = (file.type || '').toLowerCase();
      if (!mime.startsWith('image/')) {
        alert(this.i18n.t('card.invalidImageFormat') || 'Geçersiz görsel formatı');
        fileInp.value = '';
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert(this.i18n.t('card.imageSizeTooLarge') || 'Görsel boyutu çok büyük (Max 10MB)');
        fileInp.value = '';
        return;
      }
      const r = new FileReader();
      r.onload = async () => {
        const m = r.result.match(/^data:(image\/[a-zA-Z+-]+);base64,(.+)$/);
        if (m) {
          try {
            await this.api.projects.addImage(this.activeEditingId, {
              name: file.name,
              mimeType: m[1],
              base64: m[2]
            });
            this.render();
          } catch (err) {
            alert(err.message);
          }
        }
      };
      r.readAsDataURL(file);
      fileInp.value = '';
    });

    this.api.on.projectsChanged(() => {
      const pane = document.getElementById('tab-projects');
      if (pane?.classList.contains('active')) this.render();
    });

    this.initialized = true;
  }

  async saveCurrentForm() {
    if (!this.activeEditingId) return;
    const $ = (id) => document.getElementById(id);
    await this.api.projects.update(this.activeEditingId, {
      name: $('projectName').value,
      description: $('projectDesc').value
    });
  }

  async render() {
    this.ensureSkeleton();
    const $ = (id) => document.getElementById(id);
    const list = await this.api.projects.list();
    const activeObj = await this.api.projects.getActive();
    const activeId = activeObj ? activeObj.id : null;

    const selectEl = $('projectSelect');
    if (!selectEl) return;

    if (!list.length) {
      selectEl.innerHTML = `<option value="">${this.i18n.t('projects.chipNoProject') || 'Proje Yok'}</option>`;
      if ($('noProjectSelectedNote')) $('noProjectSelectedNote').hidden = false;
      if ($('projectForm')) $('projectForm').hidden = true;
      this.activeEditingId = null;
      return;
    }

    if ($('noProjectSelectedNote')) $('noProjectSelectedNote').hidden = true;
    if (!this.activeEditingId || !list.some((p) => p.id === this.activeEditingId)) {
      this.activeEditingId = activeId || list[0].id;
    }

    selectEl.innerHTML = '';
    for (const p of list) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.id === activeId ? '★ ' : '📁 '}${p.name}${p.id === activeId ? ` (${this.i18n.t('projects.activeBadge') || 'Aktif Proje'})` : ''}`;
      if (p.id === this.activeEditingId) opt.selected = true;
      selectEl.appendChild(opt);
    }

    const current = list.find((x) => x.id === this.activeEditingId);
    if (current) this.renderForm(current, current.id === activeId);
  }

  renderForm(proj, isActive) {
    const $ = (id) => document.getElementById(id);
    if ($('projectForm')) $('projectForm').hidden = false;
    if ($('projectName')) $('projectName').value = proj.name;
    if ($('projectDesc')) $('projectDesc').value = proj.description || '';

    const btnAct = $('btnSetActiveProject');
    if (btnAct) {
      btnAct.textContent = isActive ? `✓ ${this.i18n.t('projects.activeBadge') || 'Aktif Proje'}` : (this.i18n.t('projects.setActiveBtn') || 'Aktif Yap');
      btnAct.disabled = false;
    }

    this.renderTexts(proj);
    this.renderImages(proj);
  }

  renderTexts(proj) {
    const el = document.getElementById('projectTextsList');
    if (!el) return;
    el.innerHTML = '';
    if (!proj.texts?.length) {
      el.innerHTML = `<div class="empty-note">${this.i18n.t('projects.noTextsYet') || 'Bu projede henüz metin içeriği yok.'}</div>`;
      return;
    }
    for (const t of proj.texts) {
      const card = document.createElement('div');
      card.className = 'project-text-card';
      card.innerHTML = `
        <div class="project-text-header">
          <input type="text" class="text-title-input" value="${escapeHtml(t.title)}" placeholder="${this.i18n.t('projects.textTitlePlaceholder') || 'Başlık'}" style="font-weight:600; flex:1;" />
          <button class="btn danger btn-del-text" style="height:26px; padding:0 8px;">✕</button>
        </div>
        <textarea class="text-content-input" rows="3" style="width:100%; margin-top:6px;" placeholder="${this.i18n.t('projects.textContentPlaceholder') || 'İçerik'}">${escapeHtml(t.content)}</textarea>
      `;
      const titleInp = card.querySelector('.text-title-input');
      const contentInp = card.querySelector('.text-content-input');

      const save = () => this.api.projects.updateText(proj.id, t.id, { title: titleInp.value, content: contentInp.value });
      titleInp.addEventListener('change', save);
      contentInp.addEventListener('change', save);
      card.querySelector('.btn-del-text').addEventListener('click', async () => {
        await this.api.projects.removeText(proj.id, t.id);
        this.render();
      });
      el.appendChild(card);
    }
  }

  renderImages(proj) {
    const el = document.getElementById('projectImagesGrid');
    if (!el) return;
    el.innerHTML = '';
    if (!proj.images?.length) {
      el.innerHTML = `<div class="empty-note">${this.i18n.t('projects.noImagesYet') || 'Bu projede henüz görsel yok.'}</div>`;
      return;
    }
    for (const img of proj.images) {
      const thumb = document.createElement('div');
      thumb.className = 'project-img-thumb';
      thumb.innerHTML = `<img src="data:${img.mimeType};base64,${img.base64}" alt="${escapeHtml(img.name)}" /><button class="del-btn" title="Görseli Sil">✕</button>`;
      thumb.querySelector('.del-btn').addEventListener('click', async () => {
        await this.api.projects.removeImage(proj.id, img.id);
        this.render();
      });
      el.appendChild(thumb);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProjectUI;
}
