# Screen Genius

An Electron + Angular desktop app that runs invisibly over your screen to capture screenshots and ask AI (OpenAI or Gemini) for help. It supports single-line KaTeX overlay display, quick keyboard-driven workflows, and a sandboxed renderer via a preload bridge.

## Table of Contents
- Overview
- Features
- Keyboard Shortcuts
- Getting Started
- Configuration
- Architecture
- Developer Workflow
- Packaging
- Troubleshooting
- Security
- License

## Overview
Screen Genius analyzes screenshots and clipboard text using configured AI providers, then shows concise answers in the app and a single-line overlay bubble. It stores lightweight history locally and supports a document context you can inject into prompts.

## Features
- **Full & Region Screenshots**: Capture up to 5 recent images; region selection honors Windows DPI scaling.
- **AI Analysis**: OpenAI chat completions and Gemini `models.generateContent` with image parts.
- **Answer Styles**: Code, Explanation, Multiple Choice (toggle via shortcut or settings).
- **Clipboard Processing**: Turn clipboard text into a prompt, route to selected models, and copy the result.
- **Overlay Bubble**: Always-on-top single-line KaTeX-enabled overlay for glanceable answers.
- **History**: Lightweight local history with continue-session flow.
- **Document Context**: Import a document and auto-inject its context into all prompts.

## Keyboard Shortcuts

| Shortcut | Function |
|----------|----------|
| Ctrl+Shift+A | Toggle window visibility |
| Ctrl+Shift+S | Take full screenshot |
| Ctrl+Shift+Z | Take region screenshot (invisible overlay) |
| Ctrl+Shift+P | Analyze screenshots |
| Ctrl+Shift+L | Switch answer style (Code ↔ Explanation ↔ Multiple Choice) |
| Ctrl+Shift+M | Switch AI model (OpenAI ↔ Gemini ↔ Both) |
| Ctrl+Shift+Q | Process clipboard text |
| Ctrl+Shift+C | Copy latest AI response to clipboard |
| Ctrl+Shift+D | Delete all screenshots |
| Ctrl+Shift+Space | Switch to next tab |
| Ctrl+Shift+Tab | Switch to previous tab |
| Ctrl+Shift+Up/Down/Left/Right | Move window by 200px |
| Ctrl+Left / Ctrl+Right | Move overlay to bottom-left/bottom-right when visible |

## Getting Started

### Prerequisites
- Node.js 18+ recommended
- Windows 10/11 (supports macOS/Linux builds; primary dev target is Windows)
- OpenAI and/or Google Gemini API keys

### Install & Run
```bash
npm install
npm start
```

This runs the development flow: builds Angular to `dist/angular`, compiles TypeScript, copies `src/overlay.html` to `dist/angular`, then launches Electron on `dist/main.js`.

### Scripts
- `npm start` / `npm run dev`: Angular dev build → TypeScript compile → copy overlay → run Electron.
- `npm run ng:build`: Angular dev build only.
- `npm run ng:build:prod`: Angular production build only.
- `npm run build`: Angular prod build → TypeScript compile → copy overlay → `electron-builder` to `release/`.
- `npm run clean`: Remove `dist/`.

## Configuration

### API Keys
Set keys via the Settings tab or environment variables:
- OpenAI: `OPENAI_API_KEY`
- Gemini: `GEMINI_API_KEY`

Keys are surfaced through the store and used by the main process AI clients.

### Preferences (electron-store defaults in main)
- `preferredLanguage`: default `python`
- `answerStyle`: `explanation` | `code` | `multiple-choice`
- `defaultModel`: `both` | `openai` | `gemini`
- `openaiModel`: default from AI config (e.g., `gpt-5.1`)

## Architecture

- **Main Process**: Screenshot pipeline, AI requests, global shortcuts, overlay.
   - Entry: [src/main.ts](src/main.ts)
   - Window + state: [src/main/window.ts](src/main/window.ts)
   - IPC modules: [src/main/ipc/files.ts](src/main/ipc/files.ts), [src/main/ipc/preferences.ts](src/main/ipc/preferences.ts), [src/main/ipc/overlay.ts](src/main/ipc/overlay.ts), [src/main/ipc/documents.ts](src/main/ipc/documents.ts)
   - AI clients & prompts: [src/main/ai/clients.ts](src/main/ai/clients.ts), [src/main/ai/prompts.ts](src/main/ai/prompts.ts)
   - File utils: [src/main/utils/files.ts](src/main/utils/files.ts)

- **Renderer (Angular)**: Tabs for Prompt, History, Settings and Shortcuts.
   - Bootstrap: [src/angular-main.ts](src/angular-main.ts), shell: [src/index.html](src/index.html)
   - App module: [src/app/app.module.ts](src/app/app.module.ts)
   - Core service bridging IPC: [src/app/services/electron.service.ts](src/app/services/electron.service.ts)
   - UI components: Prompt ([src/app/components/prompt-tab/prompt-tab.component.ts](src/app/components/prompt-tab/prompt-tab.component.ts)), History ([src/app/components/history-tab/history-tab.component.ts](src/app/components/history-tab/history-tab.component.ts)), Settings ([src/app/components/settings-tab/settings-tab.component.ts](src/app/components/settings-tab/settings-tab.component.ts)), Shortcuts ([src/app/components/shortcuts-tab/shortcuts-tab.component.ts](src/app/components/shortcuts-tab/shortcuts-tab.component.ts))

- **Preload Bridge**: Safe, typed API exposed to renderer with `contextIsolation` on.
   - Types: [src/preload/types.d.ts](src/preload/types.d.ts)
   - Implementation: [src/preload/index.ts](src/preload/index.ts)

- **Overlay Bubble**: Single-line KaTeX display.
   - HTML: [src/overlay.html](src/overlay.html)
   - Manager: [src/main/ipc/overlay.ts](src/main/ipc/overlay.ts)

### Data Flow (High Level)
1. User captures screenshots via global shortcut → main saves to temp and emits `screenshot-taken`.
2. Renderer loads paths via `ElectronService.getScreenshots()` and displays images.
3. When analyzing, main builds a prompt using `answerStyle`, `preferredLanguage`, and document context. Images become OpenAI `image_url` parts or Gemini file parts.
4. Responses are shown in UI; latest text is copied to clipboard when requested and sent to overlay with `overlayManager.autoShow(...)`.

## Developer Workflow

### Add a New IPC
1. Register handler in main (e.g., add to [src/main/ipc/preferences.ts](src/main/ipc/preferences.ts) or directly in [src/main.ts](src/main.ts)). Handlers should return `{ success: boolean, ... }` and log via `electron-log`.
2. Expose method in [src/preload/index.ts](src/preload/index.ts) aligned with [src/preload/types.d.ts](src/preload/types.d.ts).
3. Consume via [src/app/services/electron.service.ts](src/app/services/electron.service.ts) and wire UI.

### Modify AI Behavior
- Models & keys: [src/main/ai/clients.ts](src/main/ai/clients.ts)
- Prompt styles: [src/main/ai/prompts.ts](src/main/ai/prompts.ts)
- Document context injection: `buildDocContextPrefix()` in [src/main/ipc/documents.ts](src/main/ipc/documents.ts)

### Overlay Usage
- Update latest response: `overlayManager.setLatestResponse(text)`
- Show for 2 seconds: `overlayManager.autoShow(text, 2000, preloadPath)`
- Toggle pin/interactivity via `overlayManager.togglePin()` (when visible)

## Packaging
`npm run build` produces release artifacts under `release/` using `electron-builder`. Windows unpacked output appears in `release/win-unpacked/`. The build copies `src/overlay.html` to `dist/angular/` and unpacks heavy modules via `asarUnpack`.

## Troubleshooting
- **API key missing**: Set keys in Settings or environment; check store defaults in main.
- **Region selection off**: High-DPI displays require scaling. Main applies `screen.getPrimaryDisplay().scaleFactor` for physical pixels.
- **File deletion fails (Windows)**: Uses `safeDeleteFile()` with retries; pending deletes are queued.
- **Overlay not visible**: Ensure it’s not auto-hidden; toggle with `Ctrl+Shift+O` or re-show by analyzing again.
- **No screenshots found**: Only 5 recent are kept; verify temp dir creation and that captures fire `screenshot-taken`.
- **Gemini image parts**: Images upload via Gemini Files API; failures fall back where possible (e.g., OpenAI for text extraction).

## Security
- Renderer sandboxed: `contextIsolation: true`, `nodeIntegration: false`.
- Window content protection enabled.
- Only the preload bridge exposes allowed IPC; do not call Node APIs directly from Angular.

## License
MIT License

