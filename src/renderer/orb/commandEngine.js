'use strict';

/**
 * SlashCommandEngine — Handles local slash commands without sending unnecessary requests to LLM.
 * Yerel Slash Komut Motoru — LLM API'ye gitmeden doğrudan yerel aksiyonları (/compact, /model vb.) yürütür.
 */
class SlashCommandEngine {
  /**
   * @param {Object} context
   * @param {Object} context.api - Preload API bridge
   * @param {Object} context.i18n - Internationalization helper
   * @param {Function} context.onOutput - Output setter callback (text, isSuccess)
   * @param {Function} context.onStatus - Status updater callback
   * @param {Function} context.onSettingsChange - Settings update callback
   */
  constructor(context = {}) {
    this.api = context.api || (typeof window !== 'undefined' ? window.api : null);
    this.i18n = context.i18n || (typeof window !== 'undefined' ? window.i18n : null);
    this.onOutput = context.onOutput || (() => {});
    this.onStatus = context.onStatus || (() => {});
    this.onSettingsChange = context.onSettingsChange || (() => {});

    this.commands = [
      {
        name: '/compact',
        aliases: ['/sıkıştır', '/sikistir'],
        descriptionKey: 'commands.compactDesc',
        defaultDesc: 'Aktif projenin hafızasını ve diyalog geçmişini özetleyip sıkıştırır.',
        usage: '/compact',
        handler: (args) => this.handleCompact(args)
      },
      {
        name: '/clear',
        aliases: ['/temizle', '/cls'],
        descriptionKey: 'commands.clearDesc',
        defaultDesc: 'Aktif projenin hafızasını ve diyalog geçmişini sıfırlar.',
        usage: '/clear [all|mem]',
        handler: (args) => this.handleClear(args)
      },
      {
        name: '/model',
        aliases: ['/m'],
        descriptionKey: 'commands.modelDesc',
        defaultDesc: 'Aktif modeli değiştirir veya kullanılabilir modelleri listeler.',
        usage: '/model [model_adı]',
        handler: (args) => this.handleModel(args)
      },
      {
        name: '/provider',
        aliases: ['/sağlayıcı', '/saglayici', '/p'],
        descriptionKey: 'commands.providerDesc',
        defaultDesc: 'Aktif yapay zeka sağlayıcısını değiştirir.',
        usage: '/provider [openai|anthropic|gemini|ollama|openrouter|...]',
        handler: (args) => this.handleProvider(args)
      },
      {
        name: '/mode',
        aliases: ['/mod'],
        descriptionKey: 'commands.modeDesc',
        defaultDesc: 'Aktif çalışma modunu değiştirir.',
        usage: '/mode [prompt-preparer|normal-chat|...]',
        handler: (args) => this.handleMode(args)
      },
      {
        name: '/project',
        aliases: ['/proje'],
        descriptionKey: 'commands.projectDesc',
        defaultDesc: 'Aktif projeyi değiştirir veya projeleri listeler.',
        usage: '/project [proje_adı]',
        handler: (args) => this.handleProject(args)
      },
      {
        name: '/help',
        aliases: ['/yardım', '/yardim', '/?'],
        descriptionKey: 'commands.helpDesc',
        defaultDesc: 'Kullanılabilir tüm yerel slash komutlarını listeler.',
        usage: '/help',
        handler: () => this.handleHelp()
      }
    ];
  }

  /** i18n çeviri yardımcısı / i18n translation helper */
  t(key, fallback) {
    if (this.i18n && typeof this.i18n.t === 'function') {
      const val = this.i18n.t(key);
      if (val && val !== key) return val;
    }
    return fallback;
  }

  /**
   * Checks if the given text is a slash command.
   * Girdinin bir slash komutu olup olmadığını doğrular.
   * @param {string} text
   * @returns {boolean}
   */
  isCommand(text) {
    const trimmed = String(text || '').trim();
    return trimmed.startsWith('/') && trimmed.length > 1;
  }

  /**
   * Returns matching command suggestions for autocomplete.
   * Otomatik tamamlama için eşleşen komut önerilerini döndürür.
   * @param {string} prefix
   * @returns {Array<Object>}
   */
  getSuggestions(prefix) {
    const p = String(prefix || '').toLowerCase().trim();
    if (!p.startsWith('/')) return [];

    return this.commands
      .filter((cmd) => {
        if (cmd.name.startsWith(p)) return true;
        return cmd.aliases.some((a) => a.startsWith(p));
      })
      .map((cmd) => ({
        name: cmd.name,
        usage: cmd.usage,
        description: this.t(cmd.descriptionKey, cmd.defaultDesc)
      }));
  }

  /**
   * Executes a slash command string.
   * Slash komut metnini ayrıştırıp çalıştırır.
   * @param {string} text
   * @returns {Promise<boolean>}
   */
  async execute(text) {
    const trimmed = String(text || '').trim();
    if (!this.isCommand(trimmed)) return false;

    const parts = trimmed.split(/\s+/);
    const commandTrigger = parts[0].toLowerCase();
    const args = parts.slice(1);

    const matchedCmd = this.commands.find((c) => c.name === commandTrigger || c.aliases.includes(commandTrigger));

    if (!matchedCmd) {
      this.onOutput(`${this.t('commands.unknownCommand', 'Bilinmeyen komut:')} \`${commandTrigger}\`\n\n${this.t('commands.tryHelp', 'Kullanılabilir komutlar için `/help` yazabilirsiniz.')}`, false);
      return true;
    }

    try {
      await matchedCmd.handler(args);
    } catch (err) {
      this.onOutput(`${this.t('commands.executionError', 'Komut çalıştırılırken hata oluştu:')}\n${err.message}`, false);
    }

    return true;
  }

  /** /help komutu / help command handler */
  async handleHelp() {
    let out = `### ${this.t('commands.availableTitle', 'Sparky AI — Yerel Slash Komutları')}\n\n`;
    out += `| ${this.t('commands.colCommand', 'Komut')} | ${this.t('commands.colUsage', 'Kullanım')} | ${this.t('commands.colDesc', 'Açıklama')} |\n`;
    out += `| :--- | :--- | :--- |\n`;

    for (const cmd of this.commands) {
      const desc = this.t(cmd.descriptionKey, cmd.defaultDesc);
      out += `| \`${cmd.name}\` | \`${cmd.usage}\` | ${desc} |\n`;
    }

    out += `\n*${this.t('commands.helpFooter', 'İpucu: Komutlar harici model çağrısı yapmadan doğrudan Sparky motoru üzerinde çalışır.')}*`;
    this.onOutput(out, true);
  }

  /** /compact komutu / compact memory command handler */
  async handleCompact() {
    this.onStatus({ text: this.t('commands.compactingStatus', 'Hafıza sıkıştırılıyor…'), kind: 'thinking' });
    const res = await this.api.memory.compact();
    if (res && res.ok) {
      this.onOutput(`**${this.t('commands.compactSuccess', 'Proje hafızası başarıyla sıkıştırıldı ve güncellendi.')}**\n\n${res.summary || ''}`, true);
      this.onStatus({ text: this.t('app.ready', 'Hazır'), kind: 'idle' });
    } else {
      this.onOutput(`${this.t('commands.compactNotNeeded', 'Sıkıştırma gerekmedi veya aktif proje bulunamadı.')} (${res?.reason || 'Hafıza henüz dolmadı'})`, false);
      this.onStatus({ text: this.t('app.ready', 'Hazır'), kind: 'idle' });
    }
  }

  /** /clear komutu / clear memory or output */
  async handleClear(args) {
    const target = args[0]?.toLowerCase();
    if (target === 'mem' || target === 'all' || !target) {
      await this.api.memory.clear();
      this.onOutput(`**${this.t('commands.clearSuccess', 'Aktif projenin yapay zeka hafızası ve diyalog geçmişi sıfırlandı.')}**`, true);
    }
  }

  /** /model komutu / model change or list */
  async handleModel(args) {
    const newModel = args.join(' ').trim();
    if (newModel) {
      await this.api.settings.set({ model: newModel });
      this.onSettingsChange({ model: newModel });
      this.onOutput(`**${this.t('commands.modelChanged', 'Model değiştirildi:')}** \`${newModel}\``, true);
    } else {
      const settings = await this.api.settings.get();
      const catalog = await this.api.providers.models(settings.provider);
      const list = (catalog && catalog.length) ? catalog.map((m) => `- \`${m.id || m.name}\``).join('\n') : this.t('commands.noModelsFound', 'Model listesi alınamadı.');
      this.onOutput(`**${this.t('commands.currentModel', 'Aktif Model:')}** \`${settings.model || '—'}\` (${settings.provider})\n\n**${this.t('commands.availableModels', 'Kullanılabilir Modeller:')}**\n${list}\n\n*${this.t('commands.modelUsageHint', 'Değiştirmek için:')}* \`/model <model_adı>\``, true);
    }
  }

  /** /provider komutu / provider switch */
  async handleProvider(args) {
    const target = args[0]?.toLowerCase().trim();
    if (target) {
      const providers = await this.api.providers.catalog();
      const found = providers.find((p) => p.id.toLowerCase() === target || p.label.toLowerCase().includes(target));
      if (found) {
        await this.api.settings.set({ provider: found.id });
        this.onSettingsChange({ provider: found.id });
        this.onOutput(`**${this.t('commands.providerChanged', 'Sağlayıcı değiştirildi:')}** \`${found.label}\` (\`${found.id}\`)`, true);
      } else {
        const available = providers.map((p) => `\`${p.id}\``).join(', ');
        this.onOutput(`${this.t('commands.providerNotFound', 'Sağlayıcı bulunamadı:')} \`${target}\`\n\n${this.t('commands.availableProviders', 'Kullanılabilir sağlayıcılar:')} ${available}`, false);
      }
    } else {
      const settings = await this.api.settings.get();
      const providers = await this.api.providers.catalog();
      const list = providers.map((p) => `- \`${p.id}\` — ${p.label}${p.id === settings.provider ? ' [Aktif]' : ''}`).join('\n');
      this.onOutput(`**${this.t('commands.providerListTitle', 'Sağlayıcılar:')}**\n\n${list}\n\n*${this.t('commands.providerUsageHint', 'Değiştirmek için:')}* \`/provider <id>\``, true);
    }
  }

  /** /mode komutu / mode switch */
  async handleMode(args) {
    const target = args.join(' ').toLowerCase().trim();
    const modes = await this.api.modes.catalog();
    if (target) {
      const found = modes.find((m) => m.id.toLowerCase() === target || (m.name && m.name.toLowerCase().includes(target)));
      if (found) {
        await this.api.modes.setActive(found.id);
        this.onOutput(`**${this.t('commands.modeChanged', 'Çalışma modu değiştirildi:')}** \`${found.name || found.id}\``, true);
      } else {
        const list = modes.map((m) => `\`${m.id}\``).join(', ');
        this.onOutput(`${this.t('commands.modeNotFound', 'Mod bulunamadı:')} \`${target}\`\n\n${this.t('commands.availableModes', 'Mevcut modlar:')} ${list}`, false);
      }
    } else {
      const active = await this.api.modes.getActive();
      const list = modes.map((m) => `- \`${m.id}\` — ${m.name || m.id}${m.id === active ? ' [Aktif]' : ''}`).join('\n');
      this.onOutput(`**${this.t('commands.modeListTitle', 'Çalışma Modları:')}**\n\n${list}\n\n*${this.t('commands.modeUsageHint', 'Değiştirmek için:')}* \`/mode <id>\``, true);
    }
  }

  /** /project komutu / project switch */
  async handleProject(args) {
    const target = args.join(' ').toLowerCase().trim();
    const projects = await this.api.projects.all();
    if (target) {
      const found = projects.find((p) => p.id.toLowerCase() === target || p.name.toLowerCase().includes(target));
      if (found) {
        await this.api.projects.setActive(found.id);
        this.onOutput(`**${this.t('commands.projectChanged', 'Aktif proje değiştirildi:')}** \`${found.name}\``, true);
      } else {
        const list = projects.map((p) => `\`${p.name}\``).join(', ');
        this.onOutput(`${this.t('commands.projectNotFound', 'Proje bulunamadı:')} \`${target}\`\n\n${this.t('commands.availableProjects', 'Mevcut projeler:')} ${list}`, false);
      }
    } else {
      const activeId = await this.api.projects.getActiveId();
      const list = projects.length ? projects.map((p) => `- \`${p.name}\` (${p.id})${p.id === activeId ? ' [Aktif]' : ''}`).join('\n') : this.t('commands.noProjects', 'Henüz proje yok.');
      this.onOutput(`**${this.t('commands.projectListTitle', 'Projeler:')}**\n\n${list}\n\n*${this.t('commands.projectUsageHint', 'Geçiş yapmak için:')}* \`/project <proje_adı>\``, true);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SlashCommandEngine;
}
