# AI Coding Agent Instructions

**Role:** You are a Senior Software Architect and Engineer specializing in Electron and Angular.

**Project Description:** This is an Electron + Angular desktop app that runs invisibly over the screen to capture screenshots and ask AI (OpenAI or Gemini) for help.

**Scope of Work:** Focus changes on the Electron main process (IPC, screenshots, overlay), the Angular renderer (UI + service calls), and the preload bridge.

## 1. Environment & Stack
- **Node.js**: v20.x (LTS)
- **Angular**: v17+ (Module-based implementation)
- **Electron**: v28+
- **RxJS**: v7.x
- **OS Targets**: Windows (primary), MacOS/Linux (secondary)

## 2. Build & Run
- **Dev**: `npm start` (or `npm run dev`) builds Angular → compiles TS → copies `src/overlay.html` + `src/region-selection.html` → launches Electron.
- **Angular only**: `npm run ng:build` (dev) or `npm run ng:build:prod`.
- **Package**: `npm run build` builds Angular (prod) → compiles TS → copies overlay/region files → runs `electron-builder` (outputs to `release/`).
- **Windows paths**: Uses `copy src\overlay.html dist\angular\` and `copy src\region-selection.html dist\angular\`.

## 3. Architecture & File Structure

### File Tree
```text
src/
├── main.ts                       # Entry Point: App lifecycle & orchestration
├── main/
│   ├── window.ts                 # Window creation & state management
│   ├── store.ts                  # Persistence (electron-store wrapper)
│   ├── shortcuts.ts              # Global keyboard shortcut registration
│   ├── ipc/                      # IPC Modules (Communication handlers)
│   │   ├── ai.ts                 # AI request handling
│   │   ├── files.ts              # File system operations
│   │   ├── preferences.ts        # User settings
│   │   ├── overlay.ts            # Overlay window management
│   │   ├── documents.ts          # Document context
│   │   └── screenshots.ts        # Capture & region logic
│   ├── ai/                       # AI Logic
│   │   ├── clients.ts            # API Clients
│   │   └── prompts.ts            # Prompt templates
│   ├── utils/
│   │   └── files.ts              # File helpers (safeDelete)
│   └── constants/                # Main Constants (barrel files)
├── app/                          # Angular Renderer
│   ├── app.module.ts             # Root Module
│   ├── services/
│   │   └── electron.service.ts   # Core Bridge: Wraps IPC calls & Observables
│   ├── components/               # UI Components (Prompt, History, Settings)
│   └── constants/                # Renderer Constants
├── preload/
│   ├── index.ts                  # Bridge Impl: Exposes safe APIs
│   └── types.d.ts                # API Def: Types for exposed APIs
├── shared/
│   └── types.ts                  # Shared Types: Interfaces for IPC payloads
├── overlay.html                  # The AI answer bubble
└── region-selection.html         # Fullscreen transparent cropping tool

```

### Component Details

* **Main Process**: Lightweight orchestrator. Logic is split into `ipc/` modules.
* **Renderer (Angular)**: Uses `ElectronService` as the hub for all backend communication. Never accesses Node APIs directly.
* **Bridges**: `preload/index.ts` implements the safe API defined in `preload/types.d.ts`.
* **Overlay Bubble**: A single-line, KaTeX-enabled display managed by `ipc/overlay.ts`.
* **Region Selection**: A transparent fullscreen window managed by `ipc/screenshots.ts`.

## 4. Key Patterns & Conventions

* **IPC Protocol (Strict)**:
* Handlers **must** return a standardized object: `{ success: boolean, data?: T, error?: string }`.
* **Never throw exceptions** across the IPC bridge. Catch errors in Main, log via `electron-log`, and return `{ success: false, error: '...' }`.
* The Angular service must check `res.success` before updating UI state.


* **Shared Types**:
* All data interfaces passed via IPC (e.g., `ScreenshotData`, `AIResponse`) must be defined in `src/shared/types.ts` and imported by both Main and Renderer.


* **Bridge-First Development**:
* Never call Node APIs (`fs`, `path`, `child_process`) directly from Angular.
* Workflow: 1. Define method in Preload. 2. Implement in Main. 3. Call via `ElectronService`.


* **State Management**:
* **Renderer**: Use RxJS `BehaviorSubject` in services for reactive UI updates.
* **Main**: Use `electron-store` for user preferences and configuration.


* **Security**: `contextIsolation: true`, `nodeIntegration: false`, `setContentProtection(true)`.

## 5. Constants & Configuration

Centralized constants prevent hardcoding. Import from barrel files.

* **Main Process** (`src/main/constants/index.ts`):
* `ai.ts`: `AI_PROVIDER`, `AI_MODELS`.
* `answer-styles.ts`: `ANSWER_STYLE`, `DEFAULT_LANGUAGE`.
* `app.ts`: `APP_NAME`, `MAX_SCREENSHOTS` (5), `IPC_CHANNELS`.
* `shortcuts.ts`: Global shortcut definitions.


* **Renderer** (`src/app/constants/index.ts`):
* `settings.ts`: Defaults and Storage Keys.
* `tabs.ts`: Tab definitions.


* **Sync Requirement**: Ensure constants shared between processes (like IPC Channels or Model IDs) match exactly.

## 6. Developer Workflows

* **Adding a New IPC**:
1. **Shared**: Define payload interface in `src/shared/types.ts`.
2. **Main**: Register in a module under `src/main/ipc/`, add channel to `IPC_CHANNELS`.
3. **Preload**: Declare in `types.d.ts`, expose via `index.ts`.
4. **Renderer**: Call through `ElectronService` and wire up UI.


* **Modifying AI Behavior**:
* Update models/keys in `src/main/ai/clients.ts`.
* Update prompt templates in `src/main/ai/prompts.ts`.


* **Overlay Usage**:
* Update content: `overlayManager.setLatestResponse(text)`.
* Show bubble: `overlayManager.autoShow(text, 2000, preloadPath)`.



## 7. Critical Gotchas

* **Windows File Locking**: Use `safeDeleteFile()` utils. Retry logic is required when deleting screenshots immediately after capture.
* **DPI Scaling**: Region selection coordinates in `region-selection.html` must be scaled using `screen.getPrimaryDisplay().scaleFactor` before being passed to the cropper.
* **Preload Sync**: If you change `src/preload/index.ts` without updating `src/preload/types.d.ts`, the Angular build will fail.

## 8. Specific Shortcuts (Reference)

* **Visibility**: `Ctrl+Shift+A`
* **Screenshot**: `Ctrl+Shift+S` (Full) / `Ctrl+Shift+Z` (Region)
* **Analyze**: `Ctrl+Shift+P`
* **Extract Text**: `Ctrl+Shift+X`
* **Clipboard Prompt**: `Ctrl+Shift+Q`