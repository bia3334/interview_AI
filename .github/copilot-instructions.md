# AI Coding Agent Instructions

This project is an Electron + Angular desktop app that runs invisibly over your screen to capture screenshots and ask AI (OpenAI or Gemini) for help. Focus your changes on the Electron main process (IPC, screenshots, overlay), the Angular renderer (UI + service calls), and the preload bridge.

## Build & Run
- Dev: `npm start` (or `npm run dev`) builds Angular → compiles TS → copies `src/overlay.html` → launches Electron.
- Angular only: `npm run ng:build` (dev) or `npm run ng:build:prod`.
- Package: `npm run build` builds Angular (prod) → compiles TS → copies overlay → runs `electron-builder` (outputs to `release/`).
- Windows paths: the overlay copy step uses `copy src\overlay.html dist\angular\`.

## Architecture
- **Main Process**: screenshot pipeline, AI requests, global shortcuts, overlay.
  - Entry: [src/main.ts](src/main.ts)
  - Window + state: [src/main/window.ts](src/main/window.ts)
  - IPC modules: [src/main/ipc/files.ts](src/main/ipc/files.ts), [src/main/ipc/preferences.ts](src/main/ipc/preferences.ts), [src/main/ipc/overlay.ts](src/main/ipc/overlay.ts), [src/main/ipc/documents.ts](src/main/ipc/documents.ts)
  - AI clients & prompts: [src/main/ai/clients.ts](src/main/ai/clients.ts), [src/main/ai/prompts.ts](src/main/ai/prompts.ts)
  - File utils: [src/main/utils/files.ts](src/main/utils/files.ts)
- **Renderer (Angular)**: tabs for Prompt, History, Settings.
  - Bootstrap: [src/angular-main.ts](src/angular-main.ts), shell: [src/index.html](src/index.html)
  - App module: [src/app/app.module.ts](src/app/app.module.ts)
  - Core service: [src/app/services/electron.service.ts](src/app/services/electron.service.ts) (all IPC calls + Observables)
  - UI examples: [Prompt](src/app/components/prompt-tab/prompt-tab.component.ts), [History](src/app/components/history-tab/history-tab.component.ts), [Settings](src/app/components/settings-tab/settings-tab.component.ts)
- **Preload Bridge**: exposes the safe API to renderer with contextIsolation.
  - API surface: [src/preload/types.d.ts](src/preload/types.d.ts)
  - Implementation: [src/preload/index.ts](src/preload/index.ts)
- **Overlay Bubble**: single-line, KaTeX-enabled display.
  - HTML: [src/overlay.html](src/overlay.html)
  - Manager: [src/main/ipc/overlay.ts](src/main/ipc/overlay.ts)

## Key Patterns & Conventions
- **IPC shape**: handlers usually return `{ success: boolean, ... }` and log via `electron-log`.
- **Bridge-first**: never call Node APIs from Angular; add methods to preload, then use them via `ElectronService`.
- **Events → Observables**: UI subscribes once in `ElectronService` (shared `Subject`s) and exposes `onX()` observables.
- **Document Context**: set via [documents.ts](src/main/ipc/documents.ts); `buildDocContextPrefix()` auto-injects context into prompts.
- **Screenshots**: kept in `tempDir`, max 5 entries; region captures apply DPI scale factor; cleanup uses `safeDeleteFile()`.
- **AI routing**: current models from store; OpenAI uses `chat.completions`; Gemini uses `models.generateContent` with `createPartFromUri` for images.
- **Security**: `contextIsolation: true`, `nodeIntegration: false`, `setContentProtection(true)`; keep renderer sandboxed.

## Developer Workflows
- Add a new IPC:
  1) Main: register in `[src/main.ts](src/main.ts)` or a module under `src/main/ipc/`.
  2) Preload: declare in [src/preload/types.d.ts](src/preload/types.d.ts), expose via [src/preload/index.ts](src/preload/index.ts).
  3) Renderer: call through `ElectronService` and wire up UI.
- Modify AI behavior:
  - Models & keys: [src/main/ai/clients.ts](src/main/ai/clients.ts); defaults use store keys (`openaiModel`, `geminiModel`).
  - Prompt styles: [src/main/ai/prompts.ts](src/main/ai/prompts.ts); answerStyle switches via shortcuts or settings.
- Overlay usage:
  - Update latest response with `overlayManager.setLatestResponse(text)` then show via `overlayManager.autoShow(text, 2000, preloadPath)`.

## Shortcuts & UX (Main)
- Visibility toggle: `Ctrl+Shift+A`
- Full/Region screenshot: `Ctrl+Shift+S` / `Ctrl+Shift+Z`
- Analyze screenshots: `Ctrl+Shift+P`; Extract text: `Ctrl+Shift+X`
- Switch answer style: `Ctrl+Shift+L`; Switch model: `Ctrl+Shift+M`
- Process clipboard prompt: `Ctrl+Shift+Q`; Copy latest: `Ctrl+Shift+C`

## Integration Notes
- Preferences & API keys: stored via `electron-store` (see defaults in [src/main.ts](src/main.ts)).
- History: stored in `localStorage` via `ElectronService`; notify UI with `historyUpdated$`.
- Angular builds to `dist/angular`; main loads `file://.../dist/angular/index.html` per [src/main/window.ts](src/main/window.ts).

## Gotchas
- Windows file locking: use `safeDeleteFile()` and retry when deleting screenshots.
- DPI scaling: region selection coordinates must be scaled using `screen.getPrimaryDisplay().scaleFactor`.
- Keep preload API in sync with types; missing methods will break Angular at runtime.
