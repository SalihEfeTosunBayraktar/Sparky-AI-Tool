'use strict';

/**
 * Comprehensive English translation dictionary for Sparky AI.
 * İngilizce çeviri sözlüğü.
 */
const en = {
  app: {
    title: 'Sparky AI',
    tagline: 'Floating prompt assistant',
    ready: 'Ready',
    thinking: 'Thinking…',
    preparing: 'Preparing…',
    analyzing: 'Analyzing intent…',
    writing: 'Writing prompt…',
    polishing: 'Polishing…',
    clarifying: 'Scanning ambiguities…',
    selectModel: 'Select model',
    orbTooltip: 'Click: open panel · Double click / middle click: prompt from clipboard · Ctrl+click: copy result · Right click: menu',
    bubbleCopied: 'Prompt ready — copied to clipboard',
    bubbleReady: 'Prompt ready — click to copy',
    clipboardEmpty: 'Clipboard empty',
    copiedToClipboard: 'Copied to clipboard',
    noResultToCopy: 'No result to copy',
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
    btnApplyRefine: 'Apply',
    menuTitle: 'Menu (right click)',
    collapseTitle: 'Collapse (Esc)',
    hideTitle: 'Hide to tray',
    noTextOrImage: 'Please enter text or upload an image first'
  },
  panel: {
    title: 'Sparky AI — Settings',
    winMinimize: 'Minimize',
    winMaximize: 'Maximize',
    winClose: 'Close',
    tabs: {
      settings: 'Settings',
      history: 'History',
      about: 'About'
    },
    sections: {
      providerAndModel: 'Provider & Model',
      appInterface: 'App Language',
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
      deepModeHint: 'Three stage pipeline. Slower, noticeable improvement on smaller local models.',
      clarifyLabel: 'Ask clarifying questions',
      clarifyHint: 'If note is ambiguous, asks up to 3 questions before generating; your answers shape the prompt.',
      suggestionsLabel: 'Generate improvement suggestions',
      suggestionsHint: 'Shows one-click actionable suggestion badges below the result.',
      alwaysOnTop: 'Always on top',
      autoCopy: 'Auto copy result',
      launchAtStartup: 'Launch with Windows',
      historyLimit: 'History limit',
      opacity: 'Orb opacity',
      btnReset: 'Reset settings',
      savedTag: 'saved',
      cryptoNoteAvailable: 'API keys are encrypted using Windows DPAPI and stored securely for this user account only.',
      cryptoNoteUnavailable: 'WARNING: Encryption unavailable on this system; keys are stored in plain text (base64).',
      registered: 'saved',
      notRegistered: 'none',
      btnSaveKey: 'Save',
      btnDeleteKey: 'Delete',
      testingConnection: 'Connecting…',
      connectionSuccess: 'Connection successful. {{count}} models found.',
      connectionFailed: 'Connection failed',
      localNotFound: 'No running local server found. Are Ollama or LM Studio running?',
      probeFound: 'Found: {{names}}',
      shortcutsHint: 'Click input and press key combination. Press Backspace to clear.',
      shortcutsError: 'The following shortcuts are used by system and could not be registered:'
    },
    history: {
      searchPlaceholder: 'Search history…',
      exportMd: 'Export .md',
      exportJson: 'Export .json',
      clear: 'Clear',
      noEntries: 'No history entries yet.',
      noSearchResults: 'No entries match your search.'
    },
    about: {
      description: 'Floating prompt assistant. Converts your note into a ready-to-use prompt while preserving context and intent.',
      openDataDir: 'Open data directory',
      shortcutsSummaryTitle: 'Shortcuts Summary',
      clickOrb: 'Click orb — open panel',
      doubleClickOrb: 'Double click or middle click orb — prompt from clipboard directly',
      ctrlClickOrb: 'Ctrl + click orb — copy last result',
      rightClickOrb: 'Right click orb — quick menu',
      clickBubble: 'Click bubble — copy ready result',
      ctrlEnter: 'Ctrl + Enter — generate',
      esc: 'Esc — stop generation / collapse panel'
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = en;
}
