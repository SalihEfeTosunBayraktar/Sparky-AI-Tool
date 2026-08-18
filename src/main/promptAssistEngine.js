'use strict';

/**
 * PromptAssistEngine — Multi-variation generation, block parsing & granular micro-refinement engine.
 * Prompt Asistanı Motoru — 3 farklı stratejik varyasyon üretimi, semantik blok ayrıştırma ve parçalı mikro-revizyon motoru.
 */

function detectBlockType(rawTitle) {
  const t = String(rawTitle || '').toLowerCase();
  if (t.includes('role') || t.includes('rol') || t.includes('persona') || t.includes('kimlik')) return 'role';
  if (t.includes('context') || t.includes('bağlam') || t.includes('background') || t.includes('arka plan')) return 'context';
  if (t.includes('task') || t.includes('görev') || t.includes('objective') || t.includes('amaç') || t.includes('hedef')) return 'task';
  if (t.includes('constraint') || t.includes('kısıt') || t.includes('rule') || t.includes('kural') || t.includes('requirement') || t.includes('gereksinim')) return 'constraints';
  if (t.includes('output') || t.includes('çıktı') || t.includes('format') || t.includes('deliverable')) return 'output_format';
  return 'general';
}

function getBlockIcon(type) {
  switch (type) {
    case 'role': return '👤';
    case 'context': return '🌐';
    case 'task': return '🎯';
    case 'constraints': return '📋';
    case 'output_format': return '📤';
    default: return '📝';
  }
}

class PromptAssistEngine {
  /**
   * Ham markdown metnini semantik bloklara ayrıştırır.
   * Parses markdown text into structured semantic blocks based on headings.
   * @param {string} text - Full markdown prompt
   * @returns {Array<{id: string, type: string, title: string, content: string, icon: string}>}
   */
  static parseBlocks(text) {
    if (!text || typeof text !== 'string') return [];
    const cleanText = text.trim();
    if (!cleanText) return [];

    const lines = cleanText.split('\n');
    const blocks = [];
    let currentBlock = null;
    const headingRegex = /^(?:#{1,4}\s+|\*\*)([A-Za-zÇĞİÖŞÜçğıöşü\s&/—–-]+?)(?:\*\*|:)?\s*$/;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      const match = line.match(headingRegex);

      if (match && match[1] && match[1].trim().length < 50) {
        if (currentBlock && currentBlock.content.trim()) {
          currentBlock.content = currentBlock.content.trim();
          blocks.push(currentBlock);
        }
        const rawTitle = match[1].trim();
        const type = detectBlockType(rawTitle);
        currentBlock = {
          id: `blk_${type}_${Date.now()}_${blocks.length + 1}`,
          type,
          title: rawTitle,
          content: '',
          icon: getBlockIcon(type)
        };
      } else if (currentBlock) {
        currentBlock.content += (currentBlock.content ? '\n' : '') + rawLine;
      } else if (line) {
        currentBlock = {
          id: `blk_intro_${Date.now()}_0`,
          type: 'general',
          title: 'Giriş',
          content: rawLine,
          icon: '📝'
        };
      }
    }

    if (currentBlock && currentBlock.content.trim()) {
      currentBlock.content = currentBlock.content.trim();
      blocks.push(currentBlock);
    }

    if (blocks.length === 0) {
      blocks.push({
        id: `blk_general_${Date.now()}_1`,
        type: 'general',
        title: 'Prompt',
        content: cleanText,
        icon: '📝'
      });
    }

    return blocks;
  }

  /**
   * Blok listesini temiz ve tutarlı bir Markdown stringine dönüştürür.
   * Serializes array of blocks back into structured Markdown text.
   * @param {Array<{type: string, title: string, content: string}>} blocks
   * @returns {string}
   */
  static serializeBlocks(blocks) {
    if (!Array.isArray(blocks) || blocks.length === 0) return '';
    return blocks
      .map((b) => {
        if (!b || !b.content) return '';
        const title = b.title || b.type;
        if (b.type === 'general') return b.content.trim();
        return `## ${title}\n${b.content.trim()}`;
      })
      .filter(Boolean)
      .join('\n\n');
  }

  /**
   * Belirli bir blok üzerinde hedefli yapay zeka revizyonu gerçekleştirir.
   * Performs an in-place AI micro-refinement on a specific section block.
   */
  static async refineBlock({ fullText, blockType, currentContent, instruction, chat, cfg, signal }) {
    if (!instruction || !currentContent) {
      return { updatedContent: currentContent, updatedFullMarkdown: fullText };
    }

    const systemPrompt = `You are a precision Prompt Engineering Editor.
Your task is to rewrite or refine ONLY the specified section of a prompt based on the user's edit request.
NON-NEGOTIABLE RULES:
1. OUTPUT ONLY the modified section text. Do NOT include markdown headings, section labels, or explanations.
2. Keep the domain, language, and core intent faithful to the existing context.
3. Be concise, concrete, and impactful.`;

    const userMessage = `FULL PROMPT CONTEXT:
${fullText}

TARGET SECTION TYPE: ${blockType}
CURRENT SECTION CONTENT:
${currentContent}

USER EDIT REQUEST:
${instruction}

Produce the updated content for this section now:`;

    const res = await chat({
      providerId: cfg.provider,
      model: cfg.model,
      temperature: cfg.temperature || 0.4,
      maxTokens: Math.max(512, Math.ceil(currentContent.length / 2) + 256),
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      signal
    });

    const updatedContent = String(res.text || '').trim();
    if (!updatedContent) return { updatedContent: currentContent, updatedFullMarkdown: fullText };

    const blocks = PromptAssistEngine.parseBlocks(fullText);
    const target = blocks.find((b) => b.type === blockType);
    if (target) {
      target.content = updatedContent;
    }

    const updatedFullMarkdown = blocks.length > 0
      ? PromptAssistEngine.serializeBlocks(blocks)
      : fullText.replace(currentContent, updatedContent);

    return {
      updatedContent,
      updatedFullMarkdown
    };
  }

  /**
   * 3 farklı varyasyon için strateji tanımlarını döndürür.
   * Returns metadata configurations for the 3 prompt generation strategies.
   */
  static getStrategies() {
    return [
      { id: 'concise', label: 'Kısa & Doğrudan', icon: '⚡', description: 'Yüksek sinyal/gürültü oranı, tek odaklı ve kompakt.' },
      { id: 'structured', label: 'Yapılandırılmış', icon: '📐', description: 'Rol, Görev, Kurallar ve Çıktı Formatı ile ayrık modüler bloklar.' },
      { id: 'deep', label: 'Derin & Kapsamlı', icon: '🧠', description: 'Düşünce zinciri, uç durum kontrolleri ve zengin kısıtlamalar.' }
    ];
  }
}

module.exports = PromptAssistEngine;
