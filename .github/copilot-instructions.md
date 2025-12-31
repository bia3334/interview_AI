# AI Coding Agent Instructions

This project is an Electron + Angular desktop app that runs invisibly over your screen to capture screenshots and ask AI (OpenAI or Gemini) for help. Focus your changes on the Electron main process (IPC, screenshots, overlay), the Angular renderer (UI + service calls), and the preload bridge.

## Build & Run
- Dev: `npm start` (or `npm run dev`) builds Angular → compiles TS → copies `src/overlay.html` + `src/region-selection.html` → launches Electron.
- Angular only: `npm run ng:build` (dev) or `npm run ng:build:prod`.
- Package: `npm run build` builds Angular (prod) → compiles TS → copies overlay/region files → runs `electron-builder` (outputs to `release/`).
- Windows paths: uses `copy src\overlay.html dist\angular\` and `copy src\region-selection.html dist\angular\`.

## Architecture
- **Main Process**: screenshot pipeline, AI requests, global shortcuts, overlay.
  - Entry: [src/main.ts](src/main.ts) (lightweight orchestrator)
  - Window + state: [src/main/window.ts](src/main/window.ts)
  - Store config: [src/main/store.ts](src/main/store.ts)
  - Shortcuts: [src/main/shortcuts.ts](src/main/shortcuts.ts)
  - IPC modules: [src/main/ipc/files.ts](src/main/ipc/files.ts), [src/main/ipc/preferences.ts](src/main/ipc/preferences.ts), [src/main/ipc/overlay.ts](src/main/ipc/overlay.ts), [src/main/ipc/documents.ts](src/main/ipc/documents.ts), [src/main/ipc/screenshots.ts](src/main/ipc/screenshots.ts), [src/main/ipc/ai.ts](src/main/ipc/ai.ts)
  - AI clients & prompts: [src/main/ai/clients.ts](src/main/ai/clients.ts), [src/main/ai/prompts.ts](src/main/ai/prompts.ts)
  - File utils: [src/main/utils/files.ts](src/main/utils/files.ts)
  - Constants: [src/main/constants/](src/main/constants/) (see Constants section below)
- **Renderer (Angular)**: tabs for Prompt, History, Settings, Shortcuts.
  - Bootstrap: [src/angular-main.ts](src/angular-main.ts), shell: [src/index.html](src/index.html)
  - App module: [src/app/app.module.ts](src/app/app.module.ts)
  - Core service: [src/app/services/electron.service.ts](src/app/services/electron.service.ts) (all IPC calls + Observables)
  - Components: [Prompt](src/app/components/prompt-tab/prompt-tab.component.ts), [History](src/app/components/history-tab/history-tab.component.ts), [Settings](src/app/components/settings-tab/settings-tab.component.ts), [Shortcuts](src/app/components/shortcuts-tab/shortcuts-tab.component.ts)
  - Constants: [src/app/constants/](src/app/constants/) (see Constants section below)
- **Preload Bridge**: exposes the safe API to renderer with contextIsolation.
  - API surface: [src/preload/types.d.ts](src/preload/types.d.ts)
  - Implementation: [src/preload/index.ts](src/preload/index.ts)
- **Overlay Bubble**: single-line, KaTeX-enabled display.
  - HTML: [src/overlay.html](src/overlay.html)
  - Manager: [src/main/ipc/overlay.ts](src/main/ipc/overlay.ts)
- **Region Selection**: fullscreen transparent window for screenshot region selection.
  - HTML: [src/region-selection.html](src/region-selection.html)
  - Manager: [src/main/ipc/screenshots.ts](src/main/ipc/screenshots.ts)

## Constants
Centralized constants prevent hardcoding. Import from barrel files.

**Main Process** ([src/main/constants/index.ts](src/main/constants/index.ts)):
- `ai.ts`: `AI_PROVIDER`, `AI_MODELS`, `DEFAULT_AI_PROVIDER`
- `answer-styles.ts`: `ANSWER_STYLE`, `ANSWER_STYLES`, `DEFAULT_LANGUAGE`
- `app.ts`: `APP_NAME`, `MAX_SCREENSHOTS`, `WINDOW_MOVE_STEP`, `DEFAULT_WINDOW`, `IPC_CHANNELS`
- `shortcuts.ts`: `SHORTCUTS` object with all keyboard shortcuts
- `prompts.ts`: `DEFAULT_PROMPT_TEMPLATES`, `PromptTemplate` interface

**Renderer (Angular)** ([src/app/constants/index.ts](src/app/constants/index.ts)):
- `settings.ts`: `AI_PROVIDER`, `ANSWER_STYLE`, `DEFAULTS`, `STORAGE_KEYS`
- `shortcuts.ts`: `SHORTCUTS` array for UI display
- `tabs.ts`: `TAB`, `TABS`, `TAB_IDS`, `DEFAULT_TAB`

## Key Patterns & Conventions
- **IPC shape**: handlers usually return `{ success: boolean, ... }` and log via `electron-log`.
- **Bridge-first**: never call Node APIs from Angular; add methods to preload, then use them via `ElectronService`.
- **Events → Observables**: UI subscribes once in `ElectronService` (shared `Subject`s) and exposes `onX()` observables.
- **Constants-first**: avoid hardcoding values; add to appropriate constants file and import.
- **Document Context**: set via [documents.ts](src/main/ipc/documents.ts); `buildDocContextPrefix()` auto-injects context into prompts.
- **Screenshots**: kept in `tempDir`, max 5 entries (`MAX_SCREENSHOTS`); region captures apply DPI scale factor; cleanup uses `safeDeleteFile()`.
- **AI routing**: current models from store; OpenAI uses `chat.completions`; Gemini uses `models.generateContent` with `createPartFromUri` for images.
- **Security**: `contextIsolation: true`, `nodeIntegration: false`, `setContentProtection(true)`; keep renderer sandboxed.

## Developer Workflows
- Add a new IPC:
  1) Main: register in a module under `src/main/ipc/`, add channel to `IPC_CHANNELS` in [src/main/constants/app.ts](src/main/constants/app.ts).
  2) Preload: declare in [src/preload/types.d.ts](src/preload/types.d.ts), expose via [src/preload/index.ts](src/preload/index.ts).
  3) Renderer: call through `ElectronService` and wire up UI.
- Modify AI behavior:
  - Models & keys: [src/main/ai/clients.ts](src/main/ai/clients.ts); model names in [src/main/constants/ai.ts](src/main/constants/ai.ts).
  - Prompt styles: [src/main/ai/prompts.ts](src/main/ai/prompts.ts); answer styles in [src/main/constants/answer-styles.ts](src/main/constants/answer-styles.ts).
- Add a new shortcut:
  1) Add to `SHORTCUTS` in [src/main/constants/shortcuts.ts](src/main/constants/shortcuts.ts).
  2) Register handler in [src/main/shortcuts.ts](src/main/shortcuts.ts).
  3) Update [src/app/constants/shortcuts.ts](src/app/constants/shortcuts.ts) for UI display.
- Overlay usage:
  - Update latest response with `overlayManager.setLatestResponse(text)` then show via `overlayManager.autoShow(text, 2000, preloadPath)`.

## Shortcuts & UX (Main)
Defined in [src/main/constants/shortcuts.ts](src/main/constants/shortcuts.ts):
- Visibility toggle: `Ctrl+Shift+A`
- Full/Region screenshot: `Ctrl+Shift+S` / `Ctrl+Shift+Z`
- Analyze screenshots: `Ctrl+Shift+P`; Extract text: `Ctrl+Shift+X`
- Switch answer style: `Ctrl+Shift+L`; Switch model: `Ctrl+Shift+M`
- Process clipboard prompt: `Ctrl+Shift+Q`; Copy latest: `Ctrl+Shift+C`

## Integration Notes
- Preferences & API keys: stored via `electron-store` (see [src/main/store.ts](src/main/store.ts)).
- History: stored in `localStorage` via `ElectronService` using `STORAGE_KEYS.HISTORY`; notify UI with `historyUpdated$`.
- Angular builds to `dist/angular`; main loads `file://.../dist/angular/index.html` per [src/main/window.ts](src/main/window.ts).

## Gotchas
- Windows file locking: use `safeDeleteFile()` and retry when deleting screenshots.
- DPI scaling: region selection coordinates must be scaled using `screen.getPrimaryDisplay().scaleFactor`.
- Keep preload API in sync with types; missing methods will break Angular at runtime.
- Keep constants in sync between main and renderer when they share the same values.
