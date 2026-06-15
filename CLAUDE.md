# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Electron + Angular desktop app ("Screen Genius / Open Interview Coder") that runs invisibly over the screen, captures screenshots, and queries AI providers (OpenAI, Gemini, Z.AI, LM Studio) for assistance. Windows is the primary target.

## Commands

```bash
npm start          # Dev: builds Angular → compiles TS → copies HTMLs → launches Electron
npm run dev        # Alias for npm start
npm run ng:build   # Build Angular only (dev)
npm run build      # Production: Angular (prod) → TS compile → electron-builder → release/
npm run clean      # Clean dist/
```

No test runner is configured. Verification is done by running the app with `npm start`.

## Architecture

The codebase has three layers that communicate through a strict bridge pattern:

**Main Process** (`src/main/`) — Electron backend. Orchestrated from `src/main.ts`. Logic is split into:
- `ipc/` — IPC handler modules (ai, screenshots, overlay, documents, files, preferences, voice)
- `ai/` — API clients for each provider (`clients.ts`) and prompt templates (`prompts.ts`)
- `window.ts` — window creation, visibility toggling, click-through mode
- `store.ts` — `electron-store` wrapper for persistent user preferences
- `shortcuts.ts` — debounced global keyboard shortcut registration
- `constants/` — `IPC_CHANNELS`, `AI_MODELS`, `AI_PROVIDER`, `MAX_SCREENSHOTS` (5), shortcut definitions

**Preload Bridge** (`src/preload/`) — Implements `contextBridge.exposeInMainWorld()` to safely expose IPC to the renderer. **Both files must stay in sync**: `index.ts` (impl) ↔ `types.d.ts` (TypeScript interface). Failing to sync them breaks the Angular build.

**Renderer** (`src/app/`) — Angular UI. Never calls Node APIs directly.
- `services/electron.service.ts` — the single bridge to the main process; wraps all IPC calls and exposes RxJS `Subject`/`BehaviorSubject` for reactive updates
- `components/` — prompt-tab (input + screenshot queue), settings-tab, history-tab, shortcuts-tab, toast

**Shared Types** (`src/shared/types.ts`) — IPC payload interfaces used by both Main and Renderer.

**Extra Windows** — `src/overlay.html` (floating AI answer bubble) and `src/region-selection.html` (transparent fullscreen crop tool) are copied to `dist/angular/` during build.

## Key Patterns

**IPC Protocol (strict)** — All handlers must return `{ success: boolean, data?: T, error?: string }`. Never throw across the IPC bridge; catch in Main, log with `electron-log`, return `{ success: false, error: '...' }`. The Angular service must check `res.success` before updating state.

**Adding a new IPC channel:**
1. Define payload interface in `src/shared/types.ts`
2. Register handler in `src/main/ipc/`, add channel name to `IPC_CHANNELS` in `src/main/constants/app.ts`
3. Declare in `src/preload/types.d.ts`, expose in `src/preload/index.ts`
4. Call via `ElectronService` in Angular

**State:** Renderer uses RxJS `BehaviorSubject`; Main uses `electron-store`.

**Security:** `contextIsolation: true`, `nodeIntegration: false`, `setContentProtection(true)`.

## Gotchas

- **Windows file locking**: Use `safeDeleteFile()` with retry logic when deleting screenshots immediately after capture.
- **DPI scaling**: Region selection coordinates must be multiplied by `screen.getPrimaryDisplay().scaleFactor` before cropping.
- **Preload sync**: Any change to `src/preload/index.ts` must have a matching update in `src/preload/types.d.ts`.
- **Build output**: Dev builds go to `dist/`; packaged releases go to `release/`.

## Global Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+A` | Toggle main window visibility |
| `Ctrl+Shift+W` | Toggle click-through mode |
| `Ctrl+Shift+O` | Toggle overlay bubble |
| `Ctrl+Shift+S` | Full screenshot |
| `Ctrl+Shift+Z` | Region screenshot |
| `Ctrl+Shift+X` | OCR extract text |
| `Ctrl+Shift+P` | Analyze screenshots with AI |
| `Ctrl+Shift+D` | Clear screenshots |
| `Ctrl+Shift+Q` | Clipboard text as prompt |
| `Ctrl+Shift+C` | Copy latest AI response |
