'use strict';

/**
 * McpUI — Model Context Protocol (MCP) Management Interface for Sparky AI.
 * Ayarlar panelinde MCP sunucularını yöneten UI kontrolcüsü.
 */

class McpUI {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Container element for MCP server list
   * @param {HTMLElement} options.form - Form element for adding new MCP server
   * @param {Object} options.api - Electron API bridge
   */
  constructor(options = {}) {
    this.container = options.container;
    this.form = options.form;
    this.api = options.api;
    this.servers = [];
    this.init();
  }

  async init() {
    if (!this.api || !this.api.mcp) return;
    await this.refresh();
    this.bindEvents();
  }

  async refresh() {
    try {
      this.servers = await this.api.mcp.list();
      this.render();
    } catch (err) {
      console.warn('[McpUI] Failed to load servers:', err.message);
    }
  }

  bindEvents() {
    if (this.form && !this.form.dataset.bound) {
      this.form.dataset.bound = '1';
      this.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = this.form.querySelector('#mcpServerName');
        const cmdInput = this.form.querySelector('#mcpServerCommand');
        const argsInput = this.form.querySelector('#mcpServerArgs');

        if (!nameInput || !cmdInput) return;
        const name = nameInput.value.trim();
        const command = cmdInput.value.trim();
        const args = argsInput ? argsInput.value.trim().split(/\s+/).filter(Boolean) : [];

        if (!name || !command) return;

        await this.api.mcp.save({ name, command, args });
        nameInput.value = '';
        cmdInput.value = '';
        if (argsInput) argsInput.value = '';
        await this.refresh();
      });
    }
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = '';

    if (!this.servers.length) {
      const empty = document.createElement('div');
      empty.className = 'mcp-empty-state';
      empty.textContent = 'Kayıtlı MCP sunucusu bulunamadı. Yukarıdan yeni bir sunucu ekleyin.';
      this.container.appendChild(empty);
      return;
    }

    for (const s of this.servers) {
      const card = document.createElement('div');
      card.className = 'mcp-server-card';

      const argsStr = Array.isArray(s.args) ? s.args.join(' ') : (s.args || '');

      card.innerHTML = `
        <div class="mcp-card-header">
          <div class="mcp-card-title-group">
            <span class="mcp-server-name">${s.name}</span>
            <span class="mcp-status-badge ${s.enabled ? 'enabled' : 'disabled'}">${s.enabled ? 'Etkin' : 'Devre Dışı'}</span>
          </div>
          <div class="mcp-card-actions">
            <button type="button" class="btn btn-sm mcp-test-btn" data-id="${s.id}" title="Bağlantıyı Test Et">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Test
            </button>
            <button type="button" class="btn btn-sm danger mcp-delete-btn" data-id="${s.id}" title="Sil">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
            </button>
          </div>
        </div>
        <div class="mcp-cmd-preview"><code>${s.command} ${argsStr}</code></div>
        <div class="mcp-test-result" id="mcpRes_${s.id}" style="display: none;"></div>
      `;

      // Test connection handler
      const testBtn = card.querySelector('.mcp-test-btn');
      testBtn.addEventListener('click', async () => {
        const resEl = card.querySelector(`#mcpRes_${s.id}`);
        testBtn.disabled = true;
        testBtn.textContent = 'Test ediliyor...';
        resEl.style.display = 'block';
        resEl.className = 'mcp-test-result pending';
        resEl.textContent = 'Bağlanılıyor ve araçlar sorgulanıyor...';

        const testRes = await this.api.mcp.testConnect(s);
        testBtn.disabled = false;
        testBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Test';

        if (testRes.ok) {
          const toolCount = (testRes.tools || []).length;
          resEl.className = 'mcp-test-result success';
          resEl.textContent = `✓ Başarılı: ${toolCount} adet araç keşfedildi.`;
        } else {
          resEl.className = 'mcp-test-result error';
          resEl.textContent = `✕ Bağlantı hatası: ${testRes.error || 'Bilinmeyen hata'}`;
        }
      });

      // Delete handler
      const delBtn = card.querySelector('.mcp-delete-btn');
      delBtn.addEventListener('click', async () => {
        if (confirm(`"${s.name}" MCP sunucusunu silmek istediğinizden emin misiniz?`)) {
          await this.api.mcp.delete(s.id);
          await this.refresh();
        }
      });

      this.container.appendChild(card);
    }
  }
}

if (typeof window !== 'undefined') {
  window.McpUI = McpUI;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = McpUI;
}
