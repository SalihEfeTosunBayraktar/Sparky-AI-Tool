**🇬🇧 English | 🇹🇷 [Türkçe](README.tr.md)**

# Sparky AI

A floating prompt assistant for Windows. Type your note into a small orb that
sits on top of your screen; the app turns it into a ready-to-paste prompt
**without drifting from your topic or context**, and copies it with one click.

- **Local models** — Ollama, LM Studio (no key required)
- **Cloud models** — OpenAI, Anthropic (Claude), Google Gemini, and any
  OpenAI-compatible endpoint (OpenRouter, Groq, DeepSeek, Together, llama.cpp…)
- API keys are encrypted with **Windows DPAPI**; never sent to the renderer in plain text

---

## Setup

```bash
npm install
```

```bash
npm start
```

---

## Distribution

```bash
npm run dist
```

Writes two outputs to `release/`:

| File | Size | What it does |
| --- | --- | --- |
| `Sparky AI Setup 0.1.0.exe` | ~96 MB | Installer wizard. **Installs per-user** (`%LOCALAPPDATA%\Programs`), no admin rights needed, lets you pick the install directory, creates a desktop shortcut. |
| `Sparky AI 0.1.0.exe` | ~95 MB | Portable single file. No install — runs even from a USB drive. |

> The sizes are normal since they bundle the Electron runtime (Chromium + Node);
> the app's own code is a few hundred KB inside that.

Both versions keep settings, history, and encrypted keys in the **signed-in
user's** `%APPDATA%\Sparky AI\` folder. In practice this means:

- Different Windows users on the same machine never see each other's settings.
- Closing and reopening the portable version keeps your settings intact.
- API keys are encrypted with DPAPI tied to that specific user account; copying
  the file to another machine won't decrypt it.

### About code signing

The builds are **unsigned** (that requires a code-signing certificate). Windows
SmartScreen will show an "Unknown publisher" warning on first run; click *More
info → Run anyway* to proceed. If you plan to distribute the app to others, get
an Authenticode certificate and add `certificateFile` / `certificatePassword`
to the `build.win` section of `package.json`.

---

## First run

On launch, the app probes Ollama (`127.0.0.1:11434`) and LM Studio
(`127.0.0.1:1234`); if either is running, it's selected and its first model
is assigned automatically.

If neither is available: click the orb → **⋯ → Settings** → pick a provider,
endpoint, and model. For cloud providers, enter your key under **API keys**.

---

## Usage

| Action | Result |
| --- | --- |
| Click the orb | Open the panel |
| **Double-click** or **middle-click** the orb | Turn the clipboard's text into a prompt directly, without opening the panel |
| Drag the orb | Move it (position is remembered) |
| **Ctrl** + click the orb | Copy the last result directly to the clipboard |
| Right-click the orb | Quick menu (copy, settings, history, quit) |
| Click the bubble | Copies the result if it's ready, otherwise opens the panel |
| `Ctrl + Enter` | Generate |
| `Esc` | Stop generation / collapse the panel |

### Fastest flow

Copy text → **double-click** the orb → click the **bubble** once it says *Prompt
ready*. The panel never opens. (If *Auto-copy result* is on in settings, even
that last click is unnecessary.) If Ask Questions is on and the model has a
question, the panel opens on its own — the flow is waiting on your answer.

### Global shortcuts (changeable in settings)

| Default | Action |
| --- | --- |
| `Ctrl + Shift + Space` | Open / close the panel |
| `Ctrl + Alt + P` | Generate a prompt from the clipboard immediately |
| `Ctrl + Alt + C` | Copy the last result |

The orb narrates what it's doing through status bubbles: *Preparing… →
Thinking… → Prompt ready*. In Deep Mode you'll see three stages: *Analyzing
intent → Writing prompt → Polishing*.

---

## Prompt formats

| Format | What it produces |
| --- | --- |
| **Detailed** | Role · Task · Context · Requirements · Output format · Constraints |
| **Concise & Direct** | A single paragraph, under 120 words |
| **System Prompt** | A second-person prompt that configures an assistant |
| **Image** | A dense block for image models + a `Negative:` line |
| **Code / Technical** | Goal, contract, edge cases, error handling, test expectations |
| **Deep Research** | Question, scope, source priority, conflict handling, report structure |

## Three operating switches

All three are toggled from **Settings → Generation**; *Deep Mode* and *Ask
Questions* also live as one-click chips on the orb's toolbar.

### Deep Mode (default: off)

A three-stage pipeline: intent is extracted as JSON first, then the prompt is
written, then a final editing pass removes topic drift and meta text. The
difference is most noticeable with small local models. It costs two extra
turns in exchange.

### Ask Questions (default: off)

Before generating, the model scans your text and asks up to 3 questions —
**only for points that are genuinely ambiguous** — each with a short rationale,
ready-made option chips, and an "if you leave this blank, I'll assume…"
suggestion. Your answers are folded into the prompt as *binding* information.
If the text is already clear, generation proceeds without asking — the flow
never gets interrupted for nothing. You can always skip with *Generate without
asking* in the panel.

### Truncated responses

Responses used to get silently cut off when a model hit its token limit — the
root cause of "incomplete prompt" reports. Now:

- All four providers read the truncation signal (`done_reason` / `finish_reason`
  / `finishReason` / `stop_reason`).
- If truncation is detected, the app **continues from where it left off for up
  to 3 turns**; when stitching the pieces together, the model repeating its
  last sentence or restarting from the top is cleaned up automatically.
- A base token budget applies per format (e.g. 6144 for UI/UX, 4096 for
  Research/Code). This is safe because `max_tokens` is a ceiling and finishing
  early costs nothing extra.
- Deep Mode's polishing stage rewrites the entire draft, so its budget scales
  with the draft's length.
- If it's still truncated after three turns, a clear warning appears in the
  status bar.

### Improvement suggestions (default: on)

After a result arrives, a separate, non-blocking turn generates 2–4 suggestions
("Narrow the target audience", "Tie the output to an H2 outline"…). Clicking a
badge applies the suggestion as an edit. If this turn fails, it's silently
skipped — your existing result is unaffected.

**Edit box** — besides the ready-made suggestions, you can type your own
instruction: "shorter", "make it English", "add JSON output" → *Apply*. The
existing prompt is edited in place.

---

## Modes (custom modes)

Settings → the **Modes** tab has a full CRUD structure similar to Projects.
Two built-in modes always exist and can't be deleted — **Normal Chat** (direct
conversation) and **Prompt Preparer** (this project's core job) — but both have
a fully editable system rule.

- **Presets** — when creating a new custom mode, you pick from 10 ready-made
  templates (Blank, Plain, Technical, Summary, Creative, Daily, Project
  Consultant, Transparent Mode, Interview Synthesizer, Style Adapter); each one
  demonstrates a different set of variables to answer "what can I do with this."
- **Main Rule** and **Additional Rules** — edited in an expandable IDE-style
  editor with `{{VARIABLE}}` syntax highlighting, autocomplete, and
  hover tooltips (see `codeEditor.js`).
- **Variables** — 20 tokens replaced with real values at generation time:
  `{{LANG}}`, `{{PROJECT}}`, `{{PROJECT_DESC}}`, `{{PROJECT_NOTES}}`,
  `{{INPUT}}`, `{{ANSWERS}}`, `{{DATE}}`, `{{TIME}}`, `{{YEAR}}`, `{{MONTH}}`,
  `{{DAY}}`, `{{WEEKDAY}}`, `{{STYLE}}`, `{{STYLE_HINT}}`, `{{MODEL}}`,
  `{{PROVIDER}}`, `{{TEMPERATURE}}`, `{{EFFORT}}`, `{{DEEP_MODE}}`,
  `{{GENERATION_MODE}}`.
- **Import/export** — export your modes as `.json` and import them into another
  install; name collisions are resolved automatically.

---

## Notification queue

Bubbles from the orb are ordered by priority (critical/high/normal/low),
repeated events update the same line instead of stacking (dedupe), and once
there's a backlog, the next item shows as soon as the minimum duration is met
— the screen never gets flooded. Frequency (Important only / Normal /
Everything) is configurable under Settings → Notifications.

## Multiple API keys and automatic rotation

You can add more than one API key per provider. If the active key hits a rate
limit (`rate_limit`) or turns out invalid (`invalid`), the app automatically
switches to the next healthy key in the list; the orb announces the switch
with a notification. Key states (active/limited/invalid) show as badges under
Settings → Model/API → API keys.

---

## Architecture

```
src/main/
  main.js            Windows, IPC, tray, global shortcuts, dragging
  preload.js         contextBridge bridge (contextIsolation on)
  store.js           settings.json / history.json
  secrets.js         API keys (safeStorage → DPAPI)
  llm.js             Provider registry and single entry point
  promptEngine.js    Prompt generation pipeline (analyze → write → polish)
  providers/
    http.js          Shared fetch + SSE/NDJSON readers
    ollama.js        /api/chat, /api/tags
    openaiCompat.js  /v1/chat/completions (LM Studio, OpenAI, OpenRouter…)
    anthropic.js     Official @anthropic-ai/sdk
    gemini.js        streamGenerateContent (x-goog-api-key header)
src/renderer/
  orb/               Floating orb + expanding card
  panel/             Settings · History · About
```

### Provider-specific notes

- **Anthropic** — uses the official SDK. On newer Claude models (`claude-opus-5`,
  `claude-sonnet-5`, `claude-opus-4-8`…) `temperature` is rejected by the API,
  so it isn't sent; adaptive thinking + an `effort` setting (low/medium/high) is
  used instead. With thinking on, the token budget is shared with the response,
  so `max_tokens` gets an automatic top-up. A server-side fallback model
  (`fallbacks: "default"`) is enabled for policy-driven refusals; if the account
  doesn't support that beta, the request is retried without a fallback.
- **Gemini** — the key goes in the `x-goog-api-key` header, not the URL.
- **OpenAI-compatible** — `/v1` is appended automatically if the endpoint
  doesn't already end with it; the key is optional (leave it blank locally).

---

## Where your data lives

Under `%APPDATA%/Sparky AI/`:

- `settings.json` — settings, window position
- `history.json` — input/output history (favorites survive even past the limit)
- `secrets.json` — encrypted API keys
- `projects.json` — projects, text notes, images
- `modes.json` — built-in and custom modes

Go there directly via **About → Open data folder**. History can be exported
as `.md` or `.json`.

---

## Open-source components used

| Component | License | Role |
| --- | --- | --- |
| [Electron](https://www.electronjs.org/) | MIT | Desktop runtime (Chromium + Node.js) |
| [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript) | MIT | Official Anthropic (Claude) client library |
| [electron-builder](https://www.electron.build/) | MIT | Windows installer (NSIS) and portable exe packaging |

Every other provider integration (Ollama, LM Studio, OpenAI, Gemini, and
OpenAI-compatible endpoints) talks directly over `fetch`, with no extra client
library.

## License

[MIT](LICENSE) — use, modify, and distribute it however you like; the only
requirement is keeping the license text.
