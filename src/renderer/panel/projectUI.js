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
    if (!container || document.getElementById('projectsList')) return;

    container.innerHTML = `
      <div class="projects-layout">
        <div class="projects-sidebar">
          <div class="projects-sidebar-header">
            <span class="projects-sidebar-title" data-i18n="projects.title">Projeler</span>
            <button id="btnNewProject" class="btn primary" style="height:24px; padding:0 8px; font-size:11px;" data-i18n="projects.newBtn">+ Yeni</button>
          </div>
          <div id="projectsList" class="projects-list"></div>
        </div>

        <div class="projects-main">
          <div id="noProjectSelectedNote" class="empty-note" data-i18n="projects.noProjectSelected">Henüz proje seçilmedi veya proje yok.</div>

          <div id="projectForm" class="project-form" hidden>
            <div class="project-form-header">
              <input id="projectName" type="text" class="project-name-input" placeholder="Proje Adı" data-i18n-placeholder="projects.namePlaceholder" />
              <div class="project-form-actions">
                <button id="btnSetActiveProject" class="btn primary" data-i18n="projects.setActiveBtn">Aktif Yap</button>
                <button id="btnSaveProject" class="btn" data-i18n="projects.saveBtn">Kaydet</button>
                <button id="btnDeleteProject" class="btn danger" data-i18n="projects.deleteBtn">Sil</button>
              </div>
            </div>

            <div class="field" style="margin-top:8px;">
              <label for="projectDesc" data-i18n="projects.descLabel">Açıklama / Bağlam</label>
              <input id="projectDesc" type="text" placeholder="Proje açıklaması..." data-i18n-placeholder="projects.descPlaceholder" />
            </div>

            <div class="project-section-title">
              <span data-i18n="projects.textsSection">Metin Notları & Şartnameler</span>
              <button id="btnAddTextNote" class="btn" style="height:22px; padding:0 6px; font-size:10px;" data-i18n="projects.addTextBtn">+ Not Ekle</button>
            </div>
            <div id="projectTextsList" class="project-texts-list"></div>

            <div class="project-section-title" style="margin-top:12px;">
              <span data-i18n="projects.imagesSection">Ekran Görüntüleri & UI Tasarımları</span>
              <input type="file" id="projImgFileInput" accept="image/*" hidden />
              <button id="btnAddProjImage" class="btn" style="height:22px; padding:0 6px; font-size:10px;" data-i18n="projects.addImageBtn">+ Görsel Ekle</button>
            </div>
            <div id="projectImagesGrid" class="project-images-grid"></div>
          </div>
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

    $('btnNewProject')?.addEventListener('click', async () => {
      const p = await this.api.projects.create({
        name: this.i18n.t('projects.namePlaceholder') || 'Yeni Proje',
        description: ''
      });
      this.activeEditingId = p.id;
      this.render();
    });

    $('btnSaveProject')?.addEventListener('click', async () => {
      if (!this.activeEditingId) return;
      await this.api.projects.update(this.activeEditingId, {
        name: $('projectName').value,
        description: $('projectDesc').value
      });
      this.render();
    });

    $('btnSetActiveProject')?.addEventListener('click', async () => {
      if (!this.activeEditingId) return;
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

  async render() {
    this.ensureSkeleton();
    const $ = (id) => document.getElementById(id);
    const list = await this.api.projects.list();
    const activeObj = await this.api.projects.getActive();
    const activeId = activeObj ? activeObj.id : null;

    const listEl = $('projectsList');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!list.length) {
      if ($('noProjectSelectedNote')) $('noProjectSelectedNote').hidden = false;
      if ($('projectForm')) $('projectForm').hidden = true;
      this.activeEditingId = null;
      return;
    }

    if ($('noProjectSelectedNote')) $('noProjectSelectedNote').hidden = true;
    if (!this.activeEditingId || !list.some((p) => p.id === this.activeEditingId)) {
      this.activeEditingId = activeId || list[0].id;
    }

    for (const p of list) {
      const div = document.createElement('div');
      div.className = `project-item${p.id === this.activeEditingId ? ' active' : ''}`;
      div.innerHTML = `<span>📁 ${escapeHtml(p.name)}</span>${p.id === activeId ? `<span class="badge-act">${this.i18n.t('projects.activeBadge') || 'Aktif'}</span>` : ''}`;
      div.addEventListener('click', () => {
        this.activeEditingId = p.id;
        this.render();
      });
      listEl.appendChild(div);
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
      btnAct.textContent = isActive ? (this.i18n.t('projects.activeBadge') || 'Aktif') : (this.i18n.t('projects.setActiveBtn') || 'Aktif Yap');
      btnAct.disabled = isActive;
    }

    this.renderTexts(proj);
    this.renderImages(proj);
  }

  renderTexts(proj) {
    const el = document.getElementById('projectTextsList');
    if (!el) return;
    el.innerHTML = '';
    if (!proj.texts?.length) {
      el.innerHTML = `<div class="empty-note">${this.i18n.t('projects.noTextsYet') || 'Henüz not eklenmedi'}</div>`;
      return;
    }
    for (const t of proj.texts) {
      const card = document.createElement('div');
      card.className = 'project-text-card';
      card.innerHTML = `
        <div class="project-text-header">
          <input type="text" class="text-title-input" value="${escapeHtml(t.title)}" placeholder="${this.i18n.t('projects.textTitlePlaceholder') || 'Başlık'}" style="font-weight:600; flex:1" />
          <button class="btn danger btn-del-text" style="height:26px; padding:0 8px">✕</button>
        </div>
        <textarea class="text-content-input" rows="2" style="width:100%" placeholder="${this.i18n.t('projects.textContentPlaceholder') || 'İçerik'}">${escapeHtml(t.content)}</textarea>
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
      el.innerHTML = `<div class="empty-note">${this.i18n.t('projects.noImagesYet') || 'Henüz görsel eklenmedi'}</div>`;
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
