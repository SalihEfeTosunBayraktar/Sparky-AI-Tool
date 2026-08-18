'use strict';

/**
 * PromptAssistEngine — Dynamic multi-strategy generation, weight learning & block parsing engine.
 * Prompt Asistanı Motoru — Dinamik çoklu strateji üretimi, ağırlıklı seçim ve semantik blok ayrıştırma.
 */

const STRATEGY_POOL = [
  {
    id: 'concise',
    label: 'Kısa & Doğrudan',
    style: 'concise',
    icon: '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.089z"/></svg>',
    description: 'Yüksek sinyal/gürültü oranı, doğrudan ve kompakt.'
  },
  {
    id: 'structured',
    label: 'Yapılandırılmış',
    style: 'detailed',
    icon: '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/></svg>',
    description: 'Rol, Görev, Kısıtlar ve Çıktı Formatı ile ayrık modüler bloklar.'
  },
  {
    id: 'deep',
    label: 'Derin & Kapsamlı',
    style: 'research',
    icon: '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M8 1a4 4 0 0 0-4 4c0 1.09.438 2.08 1.156 2.813A3.5 3.5 0 0 0 4 10.5a3.5 3.5 0 0 0 3.5 3.5h1A3.5 3.5 0 0 0 12 10.5a3.5 3.5 0 0 0-1.156-2.687A4 4 0 0 0 12 5a4 4 0 0 0-4-4zm0 1a3 3 0 0 1 3 3c0 .874-.374 1.662-.975 2.213a.5.5 0 0 0-.169.373V8a2.5 2.5 0 0 1 2.144 2.5 2.5 2.5 0 0 1-2.5 2.5h-1A2.5 2.5 0 0 1 6 10.5 2.5 2.5 0 0 1 8.144 8v-.414a.5.5 0 0 0-.169-.373A3 3 0 0 1 5 5a3 3 0 0 1 3-3z"/></svg>',
    description: 'Düşünce zinciri, uç durum kontrolleri ve derin analiz.'
  },
  {
    id: 'creative',
    label: 'Yaratıcı',
    style: 'creative',
    icon: '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M12.433 10.07C14.133 10.585 16 11.15 16 8a8 8 0 1 0-8 8c1.996 0 1.826-1.504 1.649-3.08-.124-1.101-.252-2.228.35-2.73.415-.347 1.01-.395 1.704-.12a.5.5 0 0 0 .73-.73zM2 8a6 6 0 1 1 12 0c0 1.246-.946 1.488-2.127 1.13-.996-.301-2.072-.119-2.784.477-.978.817-.833 2.106-.708 3.218.136 1.217.26 2.32-.381 2.766A6.002 6.002 0 0 1 2 8zm2.5-2a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3-2a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3.5 2a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg>',
    description: 'Yenilikçi açılar, metaforlar ve zengin tonlamalar.'
  },
  {
    id: 'expert',
    label: 'Uzman Rolü',
    style: 'system',
    icon: '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/></svg>',
    description: 'Kıdemli uzman persona, metodolojik çerçeve ve guardrails.'
  },
  {
    id: 'code_centric',
    label: 'Kod & Teknik',
    style: 'code',
    icon: '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M10.478 1.647a.5.5 0 1 0-.956-.294l-4 13a.5.5 0 0 0 .956.294l4-13zM4.854 4.146a.5.5 0 0 1 0 .708L1.707 8l3.147 3.146a.5.5 0 0 1-.708.708l-3.5-3.5a.5.5 0 0 1 0-.708l3.5-3.5a.5.5 0 0 1 .708 0zm6.292 0a.5.5 0 0 0 0 .708L14.293 8l-3.147 3.146a.5.5 0 0 0 .708.708l3.5-3.5a.5.5 0 0 0 0-.708l-3.5-3.5a.5.5 0 0 0-.708 0z"/></svg>',
    description: 'Yazılım mimarisi, temiz kod prensipleri ve teknik kurallar.'
  },
  {
    id: 'minimal',
    label: 'Minimalist',
    style: 'concise',
    icon: '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M8 13A5 5 0 1 1 8 3a5 5 0 0 1 0 10zm0 1A6 6 0 1 0 8 2a6 6 0 0 0 0 12z"/><path d="M8 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>',
    description: 'Sıfır gereksiz kelime, anahtar terimler ve net hedef.'
  },
  {
    id: 'conversational',
    label: 'Diyalog & Soru',
    style: 'detailed',
    icon: '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M5 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm4 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 1a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/><path d="m2.165 15.803.02-.004c1.83-.363 2.948-.842 3.468-1.105A9.06 9.06 0 0 0 8 15c4.418 0 8-3.134 8-7s-3.582-7-8-7-8 3.134-8 7c0 1.76.743 3.37 1.97 4.6a10.437 10.437 0 0 1-.524 2.318l-.003.011a10.722 10.722 0 0 1-.244.637c-.079.186.074.394.273.362a21.673 21.673 0 0 0 .693-.125zm.8-3.108a1 1 0 0 0-.287-.801C1.618 10.83 1 9.468 1 8c0-3.192 3.004-6 7-6s7 2.808 7 6c0 3.193-3.004 6-7 6a8.06 8.06 0 0 1-2.088-.272 1 1 0 0 0-.711.074c-.387.196-1.24.57-2.634.893a10.97 10.97 0 0 0 .398-2z"/></svg>',
    description: 'Etkileşimli yönlendirme ve adım adım netleştirme.'
  }
];

function detectBlockType(rawTitle) {
  const t = String(rawTitle || '').toLowerCase();
  if (t.includes('role') || t.includes('rol') || t.includes('persona') || t.includes('kimlik')) return 'role';
  if (t.includes('context') || t.includes('bağlam') || t.includes('background') || t.includes('arka plan')) return 'context';
  if (t.includes('task') || t.includes('görev') || t.includes('objective') || t.includes('amaç') || t.includes('hedef')) return 'task';
  if (t.includes('constraint') || t.includes('kısıt') || t.includes('rule') || t.includes('kural') || t.includes('gereksinim')) return 'constraints';
  if (t.includes('output') || t.includes('çıktı') || t.includes('format') || t.includes('deliverable')) return 'output_format';
  return 'general';
}

function getBlockSvg(type) {
  switch (type) {
    case 'role':
      return '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/></svg>';
    case 'context':
      return '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm5.93 7H9.97a14.07 14.07 0 0 0-1.42-4.99A6.01 6.01 0 0 1 13.93 7zM8 1.07c.81 1.34 1.44 3.42 1.57 4.93H6.43C6.56 4.49 7.19 2.41 8 1.07zM2.07 7A6.01 6.01 0 0 1 7.45 2.01 14.07 14.07 0 0 0 6.03 7H2.07zm0 2h3.96c.11 1.83.62 3.73 1.42 4.99A6.01 6.01 0 0 1 2.07 9zm5.93 5.93c-.81-1.34-1.44-3.42-1.57-4.93h3.14c-.13 1.51-.76 3.59-1.57 4.93zm1.97-5.93h3.96a6.01 6.01 0 0 1-5.38 4.99c.8-1.26 1.31-3.16 1.42-4.99z"/></svg>';
    case 'task':
      return '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/><path d="M10.97 4.97a.75.75 0 0 1 1.071 1.05l-3.992 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.235.235 0 0 1 .02-.022z"/></svg>';
    case 'constraints':
      return '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M10.5 1a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1 0-1h3V1.5a.5.5 0 0 1 .5-.5z"/><path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5zM1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4H1z"/></svg>';
    case 'output_format':
      return '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M14 3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h12zM2 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H2z"/><path d="M2 6h12v1H2V6zm0 3h6v1H2V9z"/></svg>';
    default:
      return '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/></svg>';
  }
}

class PromptAssistEngine {
  static getStrategyPool() {
    return STRATEGY_POOL;
  }

  /**
   * Kullanıcı tercih ağırlıklarına göre en uygun 3 stratejiyi seçer veya rastgele döndürür.
   * Selects 3 optimal strategies based on user weights or random exploration.
   */
  static getWeightedTriad(weights = {}, forceRandom = false) {
    const pool = [...STRATEGY_POOL];
    if (forceRandom) {
      return pool.sort(() => 0.5 - Math.random()).slice(0, 3);
    }

    const scored = pool.map((s) => ({
      ...s,
      score: (weights[s.id] || 0) + (s.id === 'structured' ? 2 : s.id === 'concise' ? 1.5 : 0.5)
    }));

    scored.sort((a, b) => b.score - a.score);
    const top2 = scored.slice(0, 2);
    const remaining = scored.slice(2);
    const randomPick = remaining[Math.floor(Math.random() * remaining.length)] || remaining[0];

    return [...top2, randomPick];
  }

  static parseBlocks(text) {
    if (!text || typeof text !== 'string') return [];
    const cleanText = text.trim();
    if (!cleanText) return [];

    const lines = cleanText.split('\n');
    const blocks = [];
    let currentBlock = null;
    const headingRegex = /^(?:#{1,6}\s+|\*\*(?:\d+\.?\s*)?|\b\d+\.\s+)(.*?)(?:\*\*|:)?\s*$/;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      const match = line.match(headingRegex);

      if (match && match[1] && match[1].trim().length < 60 && !line.includes('```')) {
        const rawTitle = match[1].replace(/^[^\w\s\u00C0-\u017F]+/, '').trim();
        const type = detectBlockType(rawTitle);
        if (type !== 'general' || line.startsWith('#') || line.startsWith('**')) {
          if (currentBlock && currentBlock.content.trim()) {
            currentBlock.content = currentBlock.content.trim();
            blocks.push(currentBlock);
          }
          currentBlock = {
            id: `blk_${type}_${Date.now()}_${blocks.length + 1}`,
            type,
            title: rawTitle || match[1].trim() || 'Bölüm',
            content: '',
            iconSvg: getBlockSvg(type)
          };
          continue;
        }
      }

      if (currentBlock) {
        currentBlock.content += (currentBlock.content ? '\n' : '') + rawLine;
      } else if (line) {
        currentBlock = {
          id: `blk_intro_${Date.now()}_0`,
          type: 'general',
          title: 'Giriş',
          content: rawLine,
          iconSvg: getBlockSvg('general')
        };
      }
    }

    if (currentBlock && currentBlock.content.trim()) {
      currentBlock.content = currentBlock.content.trim();
      blocks.push(currentBlock);
    }

    if (blocks.length === 0) {
      blocks.push({
        id: `blk_gen_${Date.now()}_1`,
        type: 'general',
        title: 'Prompt',
        content: cleanText,
        iconSvg: getBlockSvg('general')
      });
    }

    return blocks;
  }

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

    const userMessage = `FULL PROMPT CONTEXT:\n${fullText}\n\nTARGET SECTION TYPE: ${blockType}\nCURRENT SECTION CONTENT:\n${currentContent}\n\nUSER EDIT REQUEST:\n${instruction}\n\nProduce the updated content for this section now:`;

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
    if (target) target.content = updatedContent;

    const updatedFullMarkdown = blocks.length > 0
      ? PromptAssistEngine.serializeBlocks(blocks)
      : fullText.replace(currentContent, updatedContent);

    return { updatedContent, updatedFullMarkdown };
  }

  /**
   * Generates instant pre-computed variations for all 3 active strategies from the generated prompt.
   * Üretilen prompttan aktif 3 strateji için anında türetilmiş varyasyonlar oluşturur (yeniden API çağrısı yapmaz).
   *
   * @param {string} text - The generated prompt markdown
   * @param {Array<object>} strategies - Triad strategies
   * @returns {Object<string, string>} { [strategyId]: promptText }
   */
  static deriveVariations(text, strategies = []) {
    if (!text || typeof text !== 'string') return {};
    const cleanText = text.trim();
    if (!cleanText) return {};

    const blocks = PromptAssistEngine.parseBlocks(cleanText);
    const variations = {};

    const findBlock = (type) => blocks.find((b) => b.type === type)?.content || '';
    let role = findBlock('role');
    let task = findBlock('task');
    let context = findBlock('context');
    let constraints = findBlock('constraints');
    let outputFormat = findBlock('output_format');

    // Fallback: If no structured blocks were found, intelligently derive from paragraphs
    if (!task && !role) {
      const paragraphs = cleanText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
      if (paragraphs.length >= 1) {
        if (/^(sen\s+|you\s+are|act\s+as)/i.test(paragraphs[0])) {
          role = paragraphs[0];
          task = paragraphs.slice(1).join('\n\n') || paragraphs[0];
        } else {
          task = paragraphs[0];
          context = paragraphs.slice(1).join('\n\n');
        }
      } else {
        task = cleanText;
      }
    }

    for (const st of strategies) {
      if (!st || !st.id) continue;

      if (st.id === 'structured') {
        variations[st.id] = cleanText;
      } else if (st.id === 'concise' || st.id === 'minimal') {
        const parts = [];
        if (role) {
          const cleanRole = role.replace(/^(?:sen\s+bir|you\s+are\s+a?|act\s+as\s+a?)\s+/i, '').trim();
          parts.push(`Act as ${cleanRole}.`);
        }
        parts.push(task || cleanText);
        if (constraints) parts.push(`Constraints: ${constraints.replace(/\n+/g, '; ')}`);
        if (outputFormat) parts.push(`Output: ${outputFormat.replace(/\n+/g, ' ')}`);
        variations[st.id] = parts.join('\n\n');
      } else if (st.id === 'expert') {
        const parts = [];
        const expRole = role || 'Senior Subject Matter Expert & Principal Architect';
        parts.push(`## Role & Persona\n${expRole}\nOperate with rigorous industry methodology, high precision, and domain mastery.`);
        parts.push(`## Objective\n${task || cleanText}`);
        if (context) parts.push(`## Background Context\n${context}`);
        if (constraints) parts.push(`## Operational Guardrails\n${constraints}`);
        else parts.push('## Operational Guardrails\n- Ensure zero hallucinations and verify all claims.\n- Adhere to industry best practices.');
        if (outputFormat) parts.push(`## Deliverable Specification\n${outputFormat}`);
        variations[st.id] = parts.join('\n\n');
      } else if (st.id === 'code_centric') {
        const parts = [];
        parts.push(`## Engineering Role\n${role || 'Senior Software Engineer & Systems Architect'}`);
        parts.push(`## Specification\n${task || cleanText}`);
        if (context) parts.push(`## Technical Context\n${context}`);
        parts.push(`## Constraints & Error Handling\n${constraints || '- Clean, production-ready code with type annotations.\n- Comprehensive error handling and edge cases.\n- Zero placeholders or TODO comments.'}`);
        if (outputFormat) parts.push(`## Interface Contract & Format\n${outputFormat}`);
        variations[st.id] = parts.join('\n\n');
      } else if (st.id === 'creative') {
        const parts = [];
        parts.push(`## Creative Vision\n${role ? `Adopt the persona of ${role}. ` : ''}${task || cleanText}`);
        if (context) parts.push(`## Setting & Context\n${context}`);
        parts.push(`## Stylistic Guidelines\n${[constraints, outputFormat].filter(Boolean).join('\n') || '- Rich vocabulary, compelling storytelling, and dynamic pacing.\n- Avoid clichés and embrace distinctive nuances.'}`);
        variations[st.id] = parts.join('\n\n');
      } else if (st.id === 'deep') {
        const parts = [];
        parts.push(`## Persona\n${role || 'Principal Research Scientist & Analytical Strategist'}`);
        parts.push(`## Core Mission\n${task || cleanText}`);
        if (context) parts.push(`## Comprehensive Context & Edge Cases\n${context}`);
        parts.push(`## Strict Constraints & Quality Criteria\n${constraints || '- Provide detailed step-by-step reasoning.\n- Address edge cases, trade-offs, and counter-arguments.'}`);
        if (outputFormat) parts.push(`## Target Deliverable\n${outputFormat}`);
        variations[st.id] = parts.join('\n\n');
      } else if (st.id === 'conversational') {
        const parts = [];
        parts.push(`You are a collaborative AI consultant. ${role ? `Expertise: ${role}.` : ''}`);
        parts.push(`Primary Goal: ${task || cleanText}`);
        if (constraints) parts.push(`Follow these guidelines: ${constraints.replace(/\n+/g, '; ')}`);
        parts.push('Ask clarifying questions if anything is ambiguous, then provide the solution step-by-step.');
        variations[st.id] = parts.join('\n\n');
      } else {
        variations[st.id] = cleanText;
      }
    }

    return variations;
  }
}

module.exports = PromptAssistEngine;
