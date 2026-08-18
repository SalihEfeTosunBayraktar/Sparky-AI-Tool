'use strict';

/**
 * CodeApplier — Direct Code Diff & File Patching Engine for Sparky AI.
 * Model çıktısındaki kod bloklarını ayrıştırıp hedef dosyalara diff/patch uygulayan modül.
 */

const fs = require('fs');
const path = require('path');

class CodeApplier {
  /**
   * Extracts code blocks with file path hints from markdown output.
   * Markdown metninden dosya yolu etiketli kod bloklarını ayıklar.
   * @param {string} markdown
   * @returns {Array<{ filePath: string, language: string, content: string }>}
   */
  static extractCodeBlocks(markdown) {
    if (!markdown || typeof markdown !== 'string') return [];

    const blocks = [];
    const regex = /```([a-zA-Z0-9_-]+)?(?:\s+(?:file|path)=["']?([^\s\n"']+)["']?)?\n([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(markdown)) !== null) {
      const language = match[1] || 'text';
      let filePath = match[2] || '';
      const content = match[3] || '';

      // If filePath not in code fence, check first line comment: // path: src/app.js or # File: app.py
      if (!filePath) {
        const firstLineMatch = content.match(/^(?:\/\/\s*|#\s*|<!--\s*)(?:path|file|dosya):\s*([^\s\n*]+)/i);
        if (firstLineMatch) {
          filePath = firstLineMatch[1].trim();
        }
      }

      if (filePath) {
        blocks.push({
          filePath: filePath.replace(/\\/g, '/'),
          language,
          content: content.trim()
        });
      }
    }

    return blocks;
  }

  /**
   * Generates a line-by-line unified diff summary.
   * Orijinal ve yeni içerik arasında satır satır diff farkı üretir.
   * @param {string} originalContent
   * @param {string} newContent
   * @returns {{ diffText: string, additions: number, deletions: number }}
   */
  static generateDiff(originalContent = '', newContent = '') {
    const origLines = (originalContent || '').split('\n');
    const newLines = (newContent || '').split('\n');

    let additions = 0;
    let deletions = 0;
    const diffLines = [];

    const maxLines = Math.max(origLines.length, newLines.length);
    for (let i = 0; i < maxLines; i++) {
      const o = origLines[i];
      const n = newLines[i];

      if (o === undefined && n !== undefined) {
        additions++;
        diffLines.push(`+ ${n}`);
      } else if (o !== undefined && n === undefined) {
        deletions++;
        diffLines.push(`- ${o}`);
      } else if (o !== n) {
        deletions++;
        additions++;
        diffLines.push(`- ${o}`);
        diffLines.push(`+ ${n}`);
      } else {
        diffLines.push(`  ${o}`);
      }
    }

    return {
      diffText: diffLines.join('\n'),
      additions,
      deletions
    };
  }

  /**
   * Safely writes content to target file with automatic backup.
   * Hedef dosyayı yedekleyerek güvenli bir şekilde yazar.
   * @param {string} projectRoot
   * @param {string} relativeFilePath
   * @param {string} newContent
   * @returns {{ success: boolean, fullPath: string, backupPath: string|null, error?: string }}
   */
  static applyToFile(projectRoot, relativeFilePath, newContent) {
    try {
      if (!projectRoot || !relativeFilePath) {
        return { success: false, fullPath: '', backupPath: null, error: 'Missing path' };
      }

      const fullPath = path.resolve(projectRoot, relativeFilePath);
      // Path traversal security check
      if (!fullPath.startsWith(path.resolve(projectRoot))) {
        return { success: false, fullPath, backupPath: null, error: 'Path traversal forbidden' };
      }

      let backupPath = null;
      if (fs.existsSync(fullPath)) {
        backupPath = `${fullPath}.sparky_backup`;
        fs.copyFileSync(fullPath, backupPath);
      } else {
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      }

      fs.writeFileSync(fullPath, newContent, 'utf8');
      return { success: true, fullPath, backupPath };
    } catch (err) {
      return { success: false, fullPath: '', backupPath: null, error: err.message };
    }
  }
}

module.exports = CodeApplier;
