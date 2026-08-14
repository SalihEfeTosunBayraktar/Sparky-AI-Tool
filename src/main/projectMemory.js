'use strict';

/**
 * ProjectMemory — Manages episodic conversation memory and autonomous compaction for projects.
 * Proje Bazlı Hafıza Yöneticisi — Her projenin kendi izole diyalog geçmişini ve özet hafızasını yönetir.
 */

const SUMMARY_SYSTEM_PROMPT = `You are a context state compression engine. Your task is to merge the EXISTING SUMMARY with a NEW DIALOGUE SLICE into a dense, high-fidelity knowledge ledger.

STRICT REQUIREMENTS:
1. OUTPUT FORMAT: Output ONLY dense Markdown. No conversational prose or preambles.
2. PRESERVATION: Retain all concrete technical constraints, code symbols, filenames, database schemas, and explicit user rules.
3. COMPRESSION: Eliminate back-and-forth chatter, apologies, generic greetings, and intermediate trial-and-error narration.

SCHEMA:
### CORE GOALS & SCOPE
- [Key project/conversation goals]

### ESTABLISHED CONSTRAINTS & TECH STACK
- [Key technical decisions, languages, explicit negative constraints]

### KEY ENTITIES & DATA POINTS
- [Entity: Value / Description / Path / Schema]

### DECISION LOG & WORK DONE
- [Key milestones accomplished and agreed architecture]

### PENDING / ACTIVE TASKS
- [Unfinished tasks or open user questions]`;

class ProjectMemory {
  /**
   * @param {Object} options
   * @param {Object} [options.projectsStore] - Projects manager reference for persistence
   * @param {number} [options.threshold=0.80] - Utilization threshold to trigger compaction (default 80%)
   * @param {number} [options.protectedTurns=4] - Number of recent raw messages to keep intact (2 user-assistant pairs)
   */
  constructor(options = {}) {
    this.projectsStore = options.projectsStore || null;
    this.threshold = typeof options.threshold === 'number' ? options.threshold : 0.80;
    this.protectedTurns = typeof options.protectedTurns === 'number' ? options.protectedTurns : 4;
    /** @type {Set<string>} Active compaction locks per project to prevent race conditions */
    this.compactingLocks = new Set();
  }

  /**
   * Estimates token count (fast character-based heuristic: ~3.8 chars per token).
   * Hızlı karakter bazlı token tahmini.
   * @param {string} text
   * @returns {number}
   */
  estimateTokens(text) {
    return Math.ceil(String(text || '').length / 3.8);
  }

  /**
   * Ensures the project has an initialized memory structure.
   * Projenin hafıza yapısını doğrular ve başlatır.
   * @param {Object} project
   * @returns {Object}
   */
  getMemory(project) {
    if (!project) return null;
    if (!project.memory || typeof project.memory !== 'object') {
      project.memory = {
        summary: '',
        history: [],
        lastCompactedAt: 0
      };
    }
    if (!Array.isArray(project.memory.history)) {
      project.memory.history = [];
    }
    return project.memory;
  }

  /**
   * Calculates token metrics and utilization ratio for the given project.
   * Projenin anlık context doluluk oranını ve token metriklerini hesaplar.
   * @param {Object|null} project
   * @param {number} maxContext
   * @param {string} [currentInput='']
   * @returns {Object}
   */
  getMetrics(project, maxContext = 32768, currentInput = '') {
    const inputTokens = this.estimateTokens(currentInput);
    const capacity = Math.max(1024, Number(maxContext) || 32768);
    const reserveCompletion = Math.min(4096, Math.floor(capacity * 0.2));
    const usableCapacity = Math.max(512, capacity - reserveCompletion);

    // If no project is selected, memory is disabled (stateless mode)
    if (!project) {
      return {
        active: false,
        projectName: null,
        projectNotesTokens: 0,
        summaryTokens: 0,
        historyTokens: 0,
        inputTokens,
        totalTokens: inputTokens,
        usableCapacity,
        maxCapacity: capacity,
        ratio: Math.min(1, inputTokens / usableCapacity),
        isCompacting: false
      };
    }

    const memory = this.getMemory(project);
    const projectNotes = Array.isArray(project.texts)
      ? project.texts.map((t) => `${t.title}: ${t.content}`.trim()).filter(Boolean).join('\n')
      : '';

    const projectNotesTokens = this.estimateTokens(projectNotes);
    const summaryTokens = this.estimateTokens(memory.summary);
    const historyTokens = memory.history.reduce((acc, m) => acc + (m.tokens || this.estimateTokens(m.content)), 0);
    const totalTokens = projectNotesTokens + summaryTokens + historyTokens + inputTokens;
    const ratio = Math.min(1, totalTokens / usableCapacity);

    return {
      active: true,
      projectName: project.name || 'Proje',
      projectNotesTokens,
      summaryTokens,
      historyTokens,
      inputTokens,
      totalTokens,
      usableCapacity,
      maxCapacity: capacity,
      ratio,
      isCompacting: this.compactingLocks.has(project.id)
    };
  }

  /**
   * Appends a user-assistant conversation exchange to the active project memory.
   * Kullanıcı ve asistan mesaj çiftini projenin hafıza geçmişine ekler.
   * @param {Object|null} project
   * @param {string} userInput
   * @param {string} assistantReply
   */
  appendTurn(project, userInput, assistantReply) {
    if (!project || !userInput || !assistantReply) return;
    const memory = this.getMemory(project);
    const now = Date.now();

    memory.history.push(
      {
        id: `u_${now}_${Math.random().toString(36).slice(2, 6)}`,
        role: 'user',
        content: String(userInput).trim(),
        tokens: this.estimateTokens(userInput),
        timestamp: now
      },
      {
        id: `a_${now}_${Math.random().toString(36).slice(2, 6)}`,
        role: 'assistant',
        content: String(assistantReply).trim(),
        tokens: this.estimateTokens(assistantReply),
        timestamp: now
      }
    );

    project.updatedAt = now;
    if (this.projectsStore && typeof this.projectsStore.saveData === 'function') {
      this.projectsStore.saveData();
    }
  }

  /**
   * Autonomously compacts older conversation history into the project summary.
   * Projenin eski diyaloglarını özetleyerek hafızayı otonom sıkıştırır.
   * @param {Object} project
   * @param {Function} chatFn - LLM chat execution function
   * @param {Object} [cfg={}] - LLM config options
   * @returns {Promise<boolean>}
   */
  async compact(project, chatFn, cfg = {}) {
    if (!project || typeof chatFn !== 'function') return false;
    const memory = this.getMemory(project);
    if (memory.history.length <= this.protectedTurns) return false;
    if (this.compactingLocks.has(project.id)) return false;

    this.compactingLocks.add(project.id);
    try {
      const sliceEnd = memory.history.length - this.protectedTurns;
      const sliceToCompress = memory.history.slice(0, sliceEnd);
      const keptSlice = memory.history.slice(sliceEnd);

      const transcript = sliceToCompress
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n\n');

      const userContent = `PROJECT NAME: ${project.name}\n\nEXISTING MEMORY LEDGER:\n${memory.summary || '(None)'}\n\nNEW CONVERSATION TO CONSOLIDATE:\n${transcript}`;

      const { text } = await chatFn({
        providerId: cfg.provider,
        model: cfg.model,
        temperature: 0.1,
        maxTokens: 1024,
        effort: 'low',
        system: SUMMARY_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }]
      });

      if (text && text.trim()) {
        memory.summary = text.trim();
        memory.history = keptSlice;
        memory.lastCompactedAt = Date.now();
        project.updatedAt = Date.now();
        if (this.projectsStore && typeof this.projectsStore.saveData === 'function') {
          this.projectsStore.saveData();
        }
        return true;
      }
      return false;
    } catch (err) {
      console.warn(`[ProjectMemory] Sıkıştırma hatası (${project.name}):`, err.message);
      // Hard fallback: FIFO dropping the oldest pair to relieve immediate pressure
      if (memory.history.length > 2) {
        memory.history.splice(0, 2);
      }
      return false;
    } finally {
      this.compactingLocks.delete(project.id);
    }
  }

  /**
   * Clears the episodic memory and history for a given project.
   * Projenin hafızasını ve geçmişini sıfırlar.
   * @param {Object} project
   */
  clearMemory(project) {
    if (!project) return;
    const memory = this.getMemory(project);
    memory.summary = '';
    memory.history = [];
    memory.lastCompactedAt = 0;
    project.updatedAt = Date.now();
    if (this.projectsStore && typeof this.projectsStore.saveData === 'function') {
      this.projectsStore.saveData();
    }
  }
}

module.exports = ProjectMemory;
