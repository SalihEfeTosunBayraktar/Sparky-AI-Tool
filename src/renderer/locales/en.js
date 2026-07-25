'use strict';

/**
 * English translation dictionary for Sparky AI.
 * İngilizce çeviri sözlüğü.
 */
const en = {
  app: {
    title: 'Sparky AI',
    tagline: 'Floating prompt assistant',
    ready: 'Ready',
    thinking: 'Thinking…',
    preparing: 'Preparing…',
    selectModel: 'Select model',
    orbTooltip: 'Click: open panel · Double click / middle click: prompt from clipboard · Ctrl+click: copy result · Right click: menu',
    bubbleCopied: 'Prompt ready — copied to clipboard',
    bubbleReady: 'Prompt ready — click to copy',
    clipboardEmpty: 'Clipboard empty',
    copiedToClipboard: 'Copied to clipboard',
    loadedFromHistory: 'Loaded from history'
  },
  card: {
    inputLabel: 'Your Text or UI Design',
    inputPlaceholder: 'Type what you need or upload a UI design image.\nCtrl+Enter → generate',
    pasteFromClipboard: 'paste from clipboard',
    uiImageAttached: 'UI Design Attached',
    removeImage: 'Remove image',
    btnAttachImage: '📷 Image',
    deepMode: 'Deep mode',
    deepModeTitle: 'Analyze → write → polish (3 stages, slower but higher quality)',
    askQuestions: 'Ask questions',
    askQuestionsTitle: 'Ask clarifying questions for ambiguous points before generating',
    btnGenerate: 'Generate',
    btnStop: 'Stop',
    promptOutputLabel: 'Prompt',
    emptyPrompt: 'Generated prompt will appear here.',
    qaLead: 'Let us clarify a few points for a better prompt:',
    qaSubmit: 'Answer & Generate',
    qaSkip: 'Generate without asking',
    suggestionsLead: 'suggestion:',
    suggestionsPending: 'preparing suggestions…',
    btnCopy: 'Copy',
    btnCopyClose: 'Copy & Close',
    btnRegen: 'Regenerate',
    btnHistory: 'History',
    refinePlaceholder: 'Request edit: “make it shorter”, “in English”, “add JSON format”…',
    btnApplyRefine: 'Apply'
  },
  panel: {
    tabs: {
      settings: 'Settings',
      history: 'History',
      about: 'About'
    },
    sections: {
      providerAndModel: 'Provider & Model',
      appInterface: 'Application Language',
      apiKeys: 'API Keys',
      generation: 'Generation',
      behavior: 'Behavior',
      shortcuts: 'Shortcuts'
    },
    fields: {
      provider: 'Provider',
      btnProbe: 'Scan local servers',
      endpoint: 'Server endpoint',
      btnTest: 'Test connection',
      model: 'Model',
      btnModelsRefresh: 'Refresh list',
      modelManualHint: 'If the model is not listed, you can type it manually below.',
      modelManualPlaceholder: 'Manual model name (optional)',
      appLanguage: 'App Language',
      promptStyle: 'Prompt format',
      outputLanguage: 'Output language',
      temperature: 'Temperature',
      maxTokens: 'Max tokens',
      effort: 'Claude thinking effort',
      effortOptions: {
        low: 'Low — fastest',
        medium: 'Medium — balanced',
        high: 'High — best quality'
      },
      deepModeLabel: 'Deep mode (analyze → write → polish)',
      clarifyLabel: 'Ask clarifying questions',
      suggestionsLabel: 'Generate improvement suggestions',
      alwaysOnTop: 'Always on top',
      autoCopy: 'Auto copy result',
      launchAtStartup: 'Launch with Windows',
      historyLimit: 'History limit',
      opacity: 'Orb opacity',
      btnReset: 'Reset settings',
      savedTag: 'saved'
    },
    history: {
      searchPlaceholder: 'Search history…',
      exportMd: 'Export .md',
      exportJson: 'Export .json',
      clear: 'Clear'
    },
    about: {
      description: 'Floating prompt assistant. Converts your note into a ready-to-use prompt while preserving context and intent.',
      openDataDir: 'Open data directory',
      shortcutsSummaryTitle: 'Shortcuts Summary'
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = en;
}
