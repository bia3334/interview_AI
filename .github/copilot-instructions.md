## Quick orientation — Open Interview Coder

This file is a compact, actionable guide for AI coding agents working on this repository. It focuses on facts you can verify in the codebase and small, safe edits you can make without human approval.

1) Big picture
- Electron app with 4 logical layers: UI (`index.html` + `styles/`), renderer (`src/renderer/**`), preload bridge (`src/preload/**`), and main process (`src/main.ts`, `src/main/ipc/**`).
- Renderer calls the app via a type‑safe bridge exposed as `window.electronAPI` (see `src/preload/index.ts` and `src/preload/types.d.ts`).
- All privileged I/O and network access happens in the main process. Network calls to LLMs (OpenAI/Gemini) live in `src/main.ts` and helper IPC modules in `src/main/ipc/`.

2) Primary integration points and patterns (how to change things safely)
- IPC pattern: channels are domain‑style (e.g. `docs:list`, `take-screenshot`, `analyzeScreenshotsWithOpenAI`). Add new functionality by:
  - adding a handler in `src/main/**` (or an IPC module under `src/main/ipc/`),
  - exposing a convenience method in `src/preload/index.ts` and updating `preload/types.d.ts` (this file is the public API contract),
  - using it from `src/renderer/**`.
- Public API invariants: `agent.config.en.yaml` lists protected files and invariants (notably `src/preload/types.d.ts` and `index.html`). Preserve backward compatibility when changing `electronAPI`.
- File Q&A flow: `src/main/ipc/files.ts` uses `askAboutFileWithOpenAI` (main uses text extraction then calls OpenAI). Use this pattern when adding file-based features.

3) Security and rendering notes (important)
- Markdown rendering currently uses global `marked` without sanitization (see `src/renderer/lib/markdown.ts` and inline renderer code in `src/renderer/index.ts`). If you add any HTML injection path, sanitize with DOMPurify before assigning to innerHTML.
- API keys and secrets are stored locally via `electron-store` in the main process. Do not print secrets to logs.

4) Shortcuts and UX behaviors (quick lookup)
- Global keyboard shortcuts / behaviors live in `src/main.ts` (search for `globalShortcut.register`). Common keys: toggle window (Ctrl+Shift+A), full screenshot (Ctrl+Shift+S), region screenshot (Ctrl+Shift+Z), process screenshots (Ctrl+Shift+P), process clipboard (Ctrl+Shift+Q), copy response (Ctrl+Shift+C), delete screenshots (Ctrl+Shift+D).
- Overlay UI: a small transparent overlay window is created/updated in `createOrGetOverlayWindow()` in `src/main.ts`. The overlay is click‑through by default and is made interactive when pinned.

5) Build & developer workflows
- Primary scripts in `package.json`: 
  - `npm install` — install deps
  - `npm run build` — compiles TypeScript, copies `src/index.html` and `styles`, then runs `electron-builder` (packaging)
  - `npm run start` / `npm run dev` — compile and run `electron dist/main.js` (both run the same series of steps)
- Note: repository doesn't include `lint` or `test` scripts. The `agent.config.en.yaml` references lint/test commands as quality gates — if you add them, update the config.

6) Conventions / gotchas to follow in PRs
- Always update `src/preload/types.d.ts` when you add or change `electronAPI` methods. This file is the canonical public API.
- Prefer creating a new `src/main/ipc/<domain>.ts` file for grouped IPC handlers (see `files.ts` and `preferences.ts`). Register them from `src/main.ts` (pattern: import and call `registerXxxIPC(ipcMain, deps)`).
- Avoid adding new top-level Node APIs directly in renderer code. Network & fs should remain in main or behind preload methods.
- When introducing a new dependency, check `agent.config.en.yaml` allowed/banned list. For security sensitive libraries (HTML sanitizers, crypto), include a short security rationale in the PR.

7) Useful examples to copy/paste
- Expose a new method to renderer (pattern):
  - add an `ipcMain.handle('my:action', ...)` in `src/main/**` or an IPC module under `src/main/ipc/` and register it from `src/main.ts`.
  - add a wrapper in `src/preload/index.ts` and update `preload/types.d.ts`.
  - call `await window.electronAPI.myAction(args)` from renderer.

8) Files & paths you should read first (priority)
- `AGENT_GUIDE_EN.md` and `agent.config.en.yaml` — project constraints and agent rules.
- `src/main.ts` — master orchestration for shortcuts, windows, AI calls and temp file lifecycle.
- `src/preload/index.ts` and `src/preload/types.d.ts` — public API contract.
- `src/renderer/index.ts` and `src/renderer/lib/markdown.ts` — renderer behavior and markdown rendering.
- `src/main/ipc/*.ts` — examples of domain IPC modules (`files.ts`, `preferences.ts`).

9) Minimal change checklist for agents
- Read `AGENT_GUIDE_EN.md` and `agent.config.en.yaml` before coding.
- Make one small, well-scoped change per PR. Update `preload/types.d.ts` for API changes. Add a short migration note if you change public API.
- Avoid touching files listed in `agent.config.en.yaml`'s `file_globs_protected` unless explicitly requested.

If anything is unclear or you'd like this trimmed or expanded (e.g., include an example PR template or a checklist for packaging), tell me which section to change and I will iterate.
